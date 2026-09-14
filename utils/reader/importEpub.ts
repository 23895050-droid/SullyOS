// 读书模块 · EPUB 解析（2026-09-14，自写）
//
// 为什么不引 foliate-js：它用 iframe 渲染，跟「皮肤完全接管 + 段落锚定 + 自绘划线浮层」
// 三件事都打架；而我们要的其实只有「容器里把正文段落抽出来」。那条路用现成的
// @zip.js/zip.js（流式读 Blob，utils/live2dModelStore.ts:213 已是同款用法）+ 一个小解析器
// 就够了，零新依赖。
//
// 为什么不用 DOMParser：worker 里没有它（我们要在 worker 里解压、避免主线程卡住），
// node 测试环境也没有（装了 jsdom 也只为几个别的用例）。EPUB 里的 XML/XHTML 都是
// 良构的，用属性正则 + 标签剥离足够稳，而且能在纯 node 里跑测试。
//
// 产出与 TXT 线共用 ImportedPayload：一章 = spine 里一个 XHTML 文档（EPUB 的惯例），
// 章名优先取目录，其次取文档里第一个 h1-h6，最后兜底「第 N 节」。

import { BlobReader, BlobWriter, TextWriter, ZipReader } from '@zip.js/zip.js';
import { contentRevOf, normalizeParagraphs, type RawChapter } from './normalize';
import type { ImportedPayload } from './importTxt';

const utf8Decoder = new TextDecoder('utf-8');

// ─── 小工具 ─────────────────────────────────────────────────────

/** 解析一个标签里的属性（EPUB 的 XML 是良构的，正则够用）。 */
function parseAttrs(tag: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const re = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(tag)) !== null) attrs[m[1]] = m[2];
    return attrs;
}

/** 取某个标签的 innerText（第一个匹配，够用：metadata 字段不会重复）。 */
function pickTag(xml: string, tag: string): string | undefined {
    const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
    return m ? decodeEntities(stripTags(m[1])).trim() || undefined : undefined;
}

function decodeEntities(s: string): string {
    return s
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
        .replace(/&hellip;/g, '…').replace(/&amp;/g, '&');
}

const stripTags = (s: string): string => s.replace(/<[^>]*>/g, '');

/** 相对路径拼接（OPF 里的 href 相对 OPF 所在目录，可能带 ../ 和 %20）。 */
function resolvePath(base: string, href: string): string {
    const clean = href.split('#')[0];
    let decoded = clean;
    try { decoded = decodeURIComponent(clean); } catch { /* 已经是明文 */ }
    const baseParts = base.split('/').slice(0, -1);
    const parts = decoded.split('/');
    const out = [...baseParts];
    for (const part of parts) {
        if (part === '' || part === '.') continue;
        if (part === '..') out.pop();
        else out.push(part);
    }
    return out.join('/');
}

/**
 * XHTML → 段落数组。块级标签当分段边界，其余标签直接剥掉；
 * 图片/样式/脚本不产出文本（第一期不渲染插图，见计划「明确不做」）。
 */
export function xhtmlToParagraphs(xhtml: string): string[] {
    const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(xhtml);
    const body = bodyMatch ? bodyMatch[1] : xhtml;
    const cleaned = body
        .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li|blockquote|section|article|tr|figcaption|dd|dt)\s*>/gi, '\n')
        .replace(/<(p|div|h[1-6]|li|blockquote|section|article|tr|figcaption|dd|dt)\b[^>]*>/gi, '\n');
    const text = decodeEntities(stripTags(cleaned));
    return normalizeParagraphs(text.split('\n'));
}

/** 目录：(href → 标题)。优先 EPUB3 nav，其次 EPUB2 NCX。 */
function parseNav(xhtml: string): Map<string, string> {
    const map = new Map<string, string>();
    const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xhtml)) !== null) {
        const attrs = parseAttrs(m[1]);
        const href = attrs.href;
        if (!href || href.startsWith('http')) continue;
        const title = decodeEntities(stripTags(m[2])).replace(/\s+/g, ' ').trim();
        if (title) map.set(href.split('#')[0], title);
    }
    return map;
}

function parseNcx(xml: string): Map<string, string> {
    const map = new Map<string, string>();
    const re = /<navPoint\b[\s\S]*?<text\b[^>]*>([\s\S]*?)<\/text>[\s\S]*?<content\b([^>]*)\/?>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
        const title = decodeEntities(stripTags(m[1])).replace(/\s+/g, ' ').trim();
        const src = parseAttrs(m[2]).src;
        if (title && src) map.set(src.split('#')[0], title);
    }
    return map;
}

// ─── 主流程 ─────────────────────────────────────────────────────

interface ManifestItem { id: string; href: string; mediaType: string; properties: string }

export async function parseEpub(
    file: Blob,
    opts: { fileName?: string } = {},
): Promise<ImportedPayload | { error: string }> {
    const zip = new ZipReader(new BlobReader(file), { useWebWorkers: false });
    try {
        const entries = await zip.getEntries();
        const byPath = new Map(entries.map((e) => [e.filename, e]));
        const readText = async (path: string): Promise<string | null> => {
            const entry = byPath.get(path);
            if (!entry) return null;
            const blob = await entry.getData!(new TextWriter('utf-8'));
            return typeof blob === 'string' ? blob : String(blob);
        };

        const container = await readText('META-INF/container.xml');
        if (!container) return { error: '这个 EPUB 里没有 META-INF/container.xml（文件不完整？）' };
        const rootMatch = /<rootfile\b([^>]*)\/?>/.exec(container);
        const opfPath = rootMatch ? parseAttrs(rootMatch[1])['full-path'] : undefined;
        if (!opfPath) return { error: 'EPUB 的 container.xml 里没写 OPF 路径' };
        const opf = await readText(opfPath);
        if (!opf) return { error: `EPUB 里找不到 ${opfPath}` };

        // manifest
        const manifest = new Map<string, ManifestItem>();
        const itemRe = /<item\b([^>]*)\/?>/gi;
        let im: RegExpExecArray | null;
        while ((im = itemRe.exec(opf)) !== null) {
            const a = parseAttrs(im[1]);
            if (a.id && a.href) {
                manifest.set(a.id, {
                    id: a.id, href: a.href,
                    mediaType: a['media-type'] || '',
                    properties: a.properties || '',
                });
            }
        }
        // spine
        const spine: ManifestItem[] = [];
        const refRe = /<itemref\b([^>]*)\/?>/gi;
        let rm: RegExpExecArray | null;
        while ((rm = refRe.exec(opf)) !== null) {
            const a = parseAttrs(rm[1]);
            const item = a.idref ? manifest.get(a.idref) : undefined;
            if (item) spine.push(item);
        }
        if (spine.length === 0) return { error: '这个 EPUB 的 spine 是空的，抽不出正文' };

        // 目录：EPUB3 nav → EPUB2 NCX
        let toc = new Map<string, string>();
        const navItem = [...manifest.values()].find((i) => i.properties.includes('nav'));
        if (navItem) {
            const navText = await readText(resolvePath(opfPath, navItem.href));
            if (navText) toc = parseNav(navText);
        }
        if (toc.size === 0) {
            const ncxItem = [...manifest.values()].find((i) => i.mediaType.includes('ncx'));
            if (ncxItem) {
                const ncxText = await readText(resolvePath(opfPath, ncxItem.href));
                if (ncxText) toc = parseNcx(ncxText);
            }
        }

        // 正文
        const chapters: RawChapter[] = [];
        for (const item of spine) {
            const path = resolvePath(opfPath, item.href);
            const xhtml = await readText(path);
            if (!xhtml) continue;
            const paras = xhtmlToParagraphs(xhtml);
            if (paras.length === 0) continue;
            const heading = (path in toc ? toc.get(path) : undefined)
                || pickTag(xhtml, 'h1') || pickTag(xhtml, 'h2') || pickTag(xhtml, 'title')
                || `第 ${chapters.length + 1} 节`;
            chapters.push({ title: heading.trim(), paras });
        }
        if (chapters.length === 0) return { error: 'EPUB 里没抽出任何正文段落' };

        // 封面
        let cover: ImportedPayload['cover'];
        const coverItem = [...manifest.values()].find((i) => i.properties.includes('cover-image'))
            || (() => {
                const metaCover = /<meta\b([^>]*name\s*=\s*"cover"[^>]*)\/?>/i.exec(opf);
                const coverId = metaCover ? parseAttrs(metaCover[1]).content : undefined;
                return coverId ? manifest.get(coverId) : undefined;
            })();
        if (coverItem) {
            const entry = byPath.get(resolvePath(opfPath, coverItem.href));
            if (entry) {
                const blob = await entry.getData!(new BlobWriter(coverItem.mediaType || 'image/jpeg'));
                cover = { bytes: await blob.arrayBuffer(), mime: coverItem.mediaType || blob.type || 'image/jpeg' };
            }
        }

        // 打包（与 importTxt 同一形状）
        const chapterStartPara: number[] = [];
        const tocOut: ImportedPayload['toc'] = [];
        let cursor = 0;
        let totalChars = 0;
        chapters.forEach((c, idx) => {
            chapterStartPara.push(cursor);
            tocOut.push({ title: c.title, chapterIdx: idx });
            cursor += c.paras.length;
            for (const p of c.paras) totalChars += p.length;
        });
        return {
            chapters,
            chapterStartPara,
            toc: tocOut,
            totalChars,
            contentRev: contentRevOf(chapters.map((c) => c.paras.join('\n')).join('\n\n')),
            meta: {
                title: pickTag(opf, 'dc:title') || (opts.fileName ? opts.fileName.replace(/\.[^.]+$/, '') : undefined),
                author: pickTag(opf, 'dc:creator'),
                language: pickTag(opf, 'dc:language'),
            },
            cover,
            encoding: 'utf-8',
        };
    } catch (e) {
        return { error: `EPUB 解不开：${(e as Error).message || '未知错误'}` };
    } finally {
        try { await zip.close(); } catch { /* 已经关了 */ }
    }
}

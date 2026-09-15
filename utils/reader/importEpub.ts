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
//
// 2026-09-15 两处修补（她报「章节目录乱」「epub 解析没图像」）：
//   · **目录**：以前把 nav/NCX 拍成「文件路径 → 标题」的 Map，同一个文件下的多个锚点
//     （第1节/第2节…）互相覆盖，只剩最后一个——所以目录里只剩「第4节」这种残条。
//     现在按**文档顺序**收链接（带锚点），同一文件多个锚点就在锚点处把这一章切成几章。
//   · **插图**：以前 <img> 直接被 stripTags 剥掉。现在换成占位段
//     `\u0000IMG:<编号>\u0000`（图片字节随 payload 走），导入时换成 blobref 令牌，
//     阅读页照着画出来。占位段没有文本节点，分页/锚点都按「零长段落」对待。

import { BlobReader, BlobWriter, TextWriter, ZipReader, type FileEntry } from '@zip.js/zip.js';
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

/** 插图占位段的记号（段文本就是它，阅读页照着画 <img>）。 */
export const IMG_MARK = '\u0000IMG:';
// 记号里装的可能是编号（解析阶段）也可能是 blobref 令牌（落库之后），所以不限定内容形状
const IMG_MARK_RE = /^\u0000IMG:(.+)\u0000$/;

/** 这一段是不是插图占位（`\u0000IMG:3\u0000`）。 */
export function isImagePara(text: string): boolean {
    return IMG_MARK_RE.test(text.trim());
}

/**
 * XHTML → 段落数组（插图变成占位段）。块级标签当分段边界，其余标签直接剥掉。
 * 返回的 `images` 是这一章里图片的 src（占位段里的编号就是它的下标）。
 */
export function xhtmlToParagraphs(xhtml: string): { paras: string[]; images: string[] } {
    const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(xhtml);
    const body = bodyMatch ? bodyMatch[1] : xhtml;
    const images: string[] = [];
    const withMarks = body
        .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        // 插图：<img src> 与 SVG 里的 <image xlink:href>。整条替换成占位段
        .replace(/<(?:img|image)\b([^>]*)\/?>/gi, (_all, attrs: string) => {
            const a = parseAttrs(attrs);
            const src = a.src || a['xlink:href'] || a.href || '';
            if (!src || src.startsWith('data:')) return '\n';
            images.push(src);
            return `\n${IMG_MARK}${images.length - 1}\u0000\n`;
        })
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li|blockquote|section|article|tr|figcaption|dd|dt|figure)\s*>/gi, '\n')
        .replace(/<(p|div|h[1-6]|li|blockquote|section|article|tr|figcaption|dd|dt|figure)\b[^>]*>/gi, '\n');
    const text = decodeEntities(stripTags(withMarks));
    // 占位段单独成段（图夹在文字中间时，前后两截各自成段）
    const out: string[] = [];
    for (const raw of text.split('\n')) {
        if (!raw.includes('\u0000')) { out.push(raw); continue; }
        for (const piece of raw.split(/(\u0000IMG:\d+\u0000)/)) if (piece) out.push(piece);
    }
    return { paras: normalizeParagraphs(out), images };
}

/** 目录链接（**按文档顺序**，带锚点——一个文件下的第 1/2/3 节各自是一条）。 */
interface TocLink {
    /** 相对 OPF 的路径（不含 #锚点） */
    path: string;
    /** 锚点 id（没有就空串） */
    anchor: string;
    title: string;
}

/** 取 href 的路径与锚点（先按 base 解析路径，锚点原样留着）。 */
function splitHref(href: string): { path: string; anchor: string } {
    const hash = href.indexOf('#');
    const raw = hash >= 0 ? href.slice(0, hash) : href;
    const anchor = hash >= 0 ? href.slice(hash + 1) : '';
    return { path: raw, anchor: decodeURIComponent(anchor) };
}

/** EPUB3 nav（保序） */
function parseNav(xhtml: string, base: string): TocLink[] {
    const out: TocLink[] = [];
    const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xhtml)) !== null) {
        const href = parseAttrs(m[1]).href;
        if (!href || href.startsWith('http')) continue;
        const title = decodeEntities(stripTags(m[2])).replace(/\s+/g, ' ').trim();
        if (!title) continue;
        const { path, anchor } = splitHref(href);
        out.push({ path: resolvePath(base, path), anchor, title });
    }
    return out;
}

/** EPUB2 NCX（保序） */
function parseNcx(xml: string, base: string): TocLink[] {
    const out: TocLink[] = [];
    const re = /<navPoint\b[\s\S]*?<text\b[^>]*>([\s\S]*?)<\/text>[\s\S]*?<content\b([^>]*)\/?>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
        const title = decodeEntities(stripTags(m[1])).replace(/\s+/g, ' ').trim();
        const src = parseAttrs(m[2]).src;
        if (!title || !src) continue;
        const { path, anchor } = splitHref(src);
        out.push({ path: resolvePath(base, path), anchor, title });
    }
    return out;
}

/** 在原始 XHTML 里找锚点位置（id="x" 或 name="x"）。找不到返回 -1。 */
function anchorPos(html: string, anchor: string): number {
    if (!anchor) return -1;
    const esc = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:id|name)\\s*=\\s*["']${esc}["']`, 'i');
    const m = re.exec(html);
    return m ? m.index : -1;
}

/** 按锚点把一个 XHTML 切成几段（锚点找不到的那条并进前一段）。 */
function sliceAtAnchors(xhtml: string, links: TocLink[]): Array<{ title: string; html: string }> {
    const cuts: Array<{ at: number; title: string }> = [];
    for (const l of links) {
        const at = anchorPos(xhtml, l.anchor);
        if (at >= 0) cuts.push({ at, title: l.title });
    }
    if (cuts.length === 0) return [{ title: links[0].title, html: xhtml }];
    cuts.sort((a, b) => a.at - b.at);
    // 第一个锚点之前还有正文（章标题页/封面页常见）：带上，
    // 标题取「指着整个文件的那条链接」（目录里「第一章」通常不带 #锚点）
    const out: Array<{ title: string; html: string }> = [];
    if (cuts[0].at > 0) {
        const head = links.find((l) => !l.anchor)?.title ?? links[0].title;
        out.push({ title: head, html: xhtml.slice(0, cuts[0].at) });
    }
    cuts.forEach((c, i) => {
        out.push({ title: c.title, html: xhtml.slice(c.at, i + 1 < cuts.length ? cuts[i + 1].at : undefined) });
    });
    return out;
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
        // 目录条目没有 getData，只留文件条目（EPUB 的目录结构靠路径前缀就够了）。
        // 注意：zip.js 的 FileEntry 只有类型没有运行时类（instanceof 会炸），用鸭子判定。
        const byPath = new Map<string, FileEntry>();
        for (const e of entries) {
            if (typeof (e as { getData?: unknown }).getData === 'function') byPath.set(e.filename, e as FileEntry);
        }
        const readText = async (path: string): Promise<string | null> => {
            const entry = byPath.get(path);
            if (!entry) return null;
            const blob = await entry.getData(new TextWriter('utf-8'));
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

        // 目录：EPUB3 nav → EPUB2 NCX（都保序、都带锚点）
        let links: TocLink[] = [];
        const navItem = [...manifest.values()].find((i) => i.properties.includes('nav'));
        if (navItem) {
            const navText = await readText(resolvePath(opfPath, navItem.href));
            if (navText) links = parseNav(navText, opfPath);
        }
        if (links.length === 0) {
            const ncxItem = [...manifest.values()].find((i) => i.mediaType.includes('ncx'));
            if (ncxItem) {
                const ncxText = await readText(resolvePath(opfPath, ncxItem.href));
                if (ncxText) links = parseNcx(ncxText, opfPath);
            }
        }
        // 文件名 → 指向它的目录条（按文档顺序，一个文件可能有多条）
        const linksByPath = new Map<string, TocLink[]>();
        for (const l of links) {
            const list = linksByPath.get(l.path);
            if (list) list.push(l); else linksByPath.set(l.path, [l]);
        }

        // 正文：一个 spine 文件里被目录点了多个锚点，就在锚点处切成几章
        const chapters: RawChapter[] = [];
        for (const item of spine) {
            const path = resolvePath(opfPath, item.href);
            const xhtml = await readText(path);
            if (!xhtml) continue;
            const fileLinks = linksByPath.get(path) ?? [];
            const pieces = fileLinks.length > 1
                ? sliceAtAnchors(xhtml, fileLinks)
                : [{ title: fileLinks[0]?.title ?? '', html: xhtml }];
            for (const piece of pieces) {
                const { paras, images } = xhtmlToParagraphs(piece.html);
                if (paras.length === 0) continue;
                const heading = piece.title
                    || pickTag(piece.html, 'h1') || pickTag(piece.html, 'h2') || pickTag(piece.html, 'title')
                    || `第 ${chapters.length + 1} 节`;
                // 图片：这一章引用到的那些，读成字节随 payload 走（主线程再落令牌）。
                // 拿不到的（包里没这个文件）把那个占位段直接去掉，编号重排成 blobs 的下标。
                const blobs: Array<{ bytes: ArrayBuffer; mime: string }> = [];
                const remap = new Map<number, number>();
                for (let i = 0; i < images.length; i++) {
                    if (!paras.some((p) => p.trim() === `${IMG_MARK}${i}\u0000`)) continue;
                    const entry = byPath.get(resolvePath(path, images[i]));
                    if (!entry) continue;
                    const ext = (/\.[a-z0-9]+$/i.exec(images[i])?.[0] ?? '').toLowerCase();
                    const mime = ext === '.png' ? 'image/png'
                        : (ext === '.gif' ? 'image/gif'
                            : (ext === '.svg' ? 'image/svg+xml' : 'image/jpeg'));
                    const blob = await entry.getData(new BlobWriter(mime));
                    remap.set(i, blobs.length);
                    blobs.push({ bytes: await blob.arrayBuffer(), mime });
                }
                const finalParas = paras
                    .map((p) => {
                        const m = /^\u0000IMG:(\d+)\u0000$/.exec(p.trim());
                        if (!m) return p;
                        const to = remap.get(Number(m[1]));
                        return to === undefined ? '' : `${IMG_MARK}${to}\u0000`;
                    })
                    .filter((p) => p !== '');
                if (finalParas.length === 0) continue;
                chapters.push({ title: heading.trim(), paras: finalParas, images: blobs.length > 0 ? blobs : undefined });
            }
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
                const blob = await entry.getData(new BlobWriter(coverItem.mediaType || 'image/jpeg'));
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
            for (const p of c.paras) if (!isImagePara(p)) totalChars += p.length;
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

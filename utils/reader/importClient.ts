// 读书模块 · 导入编排（主线程，2026-09-14）
//
// 分工：worker 出纯数据（ImportWorkerReply.payload），这里负责
//   原文件 blob → 封面 blob → 建书目行(importing) → 分页写章节 → 书目行转 ready
// 顺序是刻意的：**书目行最后才转 ready**。中途被杀（iOS 回收/关标签页）留下的
// status:'importing' 半截书，启动时由 readerDb.sweepStaleImports 清掉。
//
// 失败/取消一律走 deleteBookDeep 收干净，不留隐形重量。

import { putImageBlob } from '../blobRef';
import { chapterRowId, deleteBookDeep, patchBook, putBook, putChapters, rdId, type RdBook, type RdChapter } from './readerDb';
import type { ImportedPayload } from './importTxt';
import { IMG_MARK, isImagePara } from './importEpub';
import type { ImportWorkerReply, ImportWorkerRequest } from './importWorker';

export interface ImportProgress {
    phase: '解析中' | '写入中' | '完成';
    done: number;
    total: number;
}

export interface ImportOptions {
    forcedEncoding?: string;
    onProgress?: (p: ImportProgress) => void;
    /** 用户点了取消：worker 会被 terminate，已写的行会被清掉 */
    signal?: { aborted: boolean };
}

export interface ImportResult {
    bookId: string;
    title: string;
    chapterCount: number;
    totalChars: number;
    encoding?: string;
}

const CHAPTER_BATCH = 8;

export function detectFormat(fileName: string, mime?: string): 'epub' | 'txt' | null {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.epub') || mime === 'application/epub+zip') return 'epub';
    if (lower.endsWith('.txt') || mime === 'text/plain') return 'txt';
    return null;
}

/** 跑一次解析：优先 worker，环境不支持就主线程直跑（大文件会卡一下，但能用）。 */
async function runParse(
    req: ImportWorkerRequest,
    opts: ImportOptions,
): Promise<ImportedPayload | { error: string }> {
    opts.onProgress?.({ phase: '解析中', done: 0, total: 1 });
    let worker: Worker | null = null;
    try {
        worker = new Worker(new URL('./importWorker.ts', import.meta.url), { type: 'module' });
    } catch {
        worker = null;
    }

    if (worker) {
        const w = worker;
        try {
            return await new Promise<ImportedPayload | { error: string }>((resolve) => {
                w.onmessage = (ev: MessageEvent<ImportWorkerReply>) => {
                    const reply = ev.data;
                    if (reply.ok && reply.payload) resolve(reply.payload);
                    else resolve({ error: reply.error || '解析失败' });
                };
                w.onerror = () => resolve({ error: '解析进程挂了（内存不够？换本小点的书试试）' });
                w.postMessage(req);
            });
        } finally {
            try { w.terminate(); } catch { /* 已经结束 */ }
        }
    }

    // 降级：主线程直跑（动态 import，不把解析器塞进主包）
    try {
        if (req.format === 'epub') {
            const { parseEpub } = await import('./importEpub');
            return await parseEpub(req.file, { fileName: req.fileName });
        }
        const { parseTxt } = await import('./importTxt');
        return parseTxt(new Uint8Array(await req.file.arrayBuffer()), {
            fileName: req.fileName, forcedEncoding: req.forcedEncoding,
        });
    } catch (e) {
        return { error: `解析失败：${(e as Error).message || '未知错误'}` };
    }
}

function toChapterRows(bookId: string, chapters: ImportedPayload['chapters']): RdChapter[] {
    return chapters.map((c, idx) => ({
        id: chapterRowId(bookId, idx),
        bookId,
        idx,
        title: c.title,
        paras: c.paras,
        // 插图占位段不算字数（它的「文本」是令牌，不是字）
        chars: c.paras.reduce((n, p) => n + (isImagePara(p) ? 0 : p.length), 0),
    }));
}

/** 插图字节 → blobref 令牌，写回占位段（拿不到令牌的那段直接去掉）。 */
async function materializeImages(chapters: ImportedPayload['chapters']): Promise<ImportedPayload['chapters']> {
    const out: ImportedPayload['chapters'] = [];
    for (const c of chapters) {
        if (!c.images || c.images.length === 0) { out.push(c); continue; }
        const refs: string[] = [];
        for (const img of c.images) {
            refs.push(await putImageBlob(new Blob([img.bytes], { type: img.mime })));
        }
        const paras = c.paras
            .map((p) => {
                const m = /^\u0000IMG:(\d+)\u0000$/.exec(p.trim());
                if (!m) return p;
                const ref = refs[Number(m[1])];
                return ref ? `${IMG_MARK}${ref}\u0000` : '';
            })
            .filter((p) => p !== '');
        out.push({ ...c, paras });
    }
    return out;
}

/**
 * 导入一本书。成功返回 bookId（书目行此时已是 ready）；失败返回 { error } 人话，
 * 且现场已经清干净（不会留下半本书）。
 */
export async function importBookFile(
    file: File,
    opts: ImportOptions = {},
): Promise<ImportResult | { error: string }> {
    const format = detectFormat(file.name, file.type);
    if (!format) return { error: '第一期只支持 EPUB 和 TXT 两种格式' };
    if (file.size === 0) return { error: '这是个空文件' };

    const payload = await runParse(
        { file, fileName: file.name, format, forcedEncoding: opts.forcedEncoding },
        opts,
    );
    if ('error' in payload) return payload;
    if (opts.signal?.aborted) return { error: '已取消' };

    const bookId = rdId('bk');
    try {
        // 原文件留一份：TXT 编码猜错时能重解，不用让用户重新选文件
        const fileRef = await putImageBlob(file);
        let coverRef: string | undefined;
        if (payload.cover) {
            coverRef = await putImageBlob(new Blob([payload.cover.bytes], { type: payload.cover.mime }));
        }

        const book: RdBook = {
            id: bookId,
            title: payload.meta.title?.trim() || file.name.replace(/\.[^.]+$/, ''),
            author: payload.meta.author,
            format,
            sourceFileName: file.name,
            fileBytes: file.size,
            fileRef,
            coverRef,
            encoding: payload.encoding,
            language: payload.meta.language,
            status: 'importing',
            contentRev: payload.contentRev,
            chapterCount: payload.chapters.length,
            totalChars: payload.totalChars,
            chapterStartPara: payload.chapterStartPara,
            toc: payload.toc,
            tags: [],
            onShelf: true,
            order: Date.now(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        await putBook(book);

        const rows = toChapterRows(bookId, await materializeImages(payload.chapters));
        const total = rows.length;
        for (let i = 0; i < total; i += CHAPTER_BATCH) {
            if (opts.signal?.aborted) throw new Error('已取消');
            await putChapters(rows.slice(i, i + CHAPTER_BATCH));
            opts.onProgress?.({ phase: '写入中', done: Math.min(i + CHAPTER_BATCH, total), total });
            // 让出主线程：进度条能动，iOS 也不至于把我们判成卡死
            await new Promise((r) => setTimeout(r, 0));
        }

        await patchBook(bookId, { status: 'ready' });
        opts.onProgress?.({ phase: '完成', done: total, total });
        return {
            bookId, title: book.title, chapterCount: total,
            totalChars: payload.totalChars, encoding: payload.encoding,
        };
    } catch (e) {
        await deleteBookDeep(bookId).catch(() => { /* 清不掉也就算了，启动清扫会兜 */ });
        return { error: `导入中断：${(e as Error).message || '未知错误'}` };
    }
}

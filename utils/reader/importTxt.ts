// 读书模块 · TXT 导入（2026-09-14）
//
// 字节 → 解码 → 折行还原 → 段落归一 → 章节切分 → 全书单调段号。
// 这里只产出**纯数据**（worker 里跑，不碰 IndexedDB / 不碰 React）；
// 落库是主线程 importClient 的事。

import { decodeTextBytes } from './decodeText';
import { contentRevOf, splitTextToChapters, type RawChapter } from './normalize';

/** 导入产物：EPUB 与 TXT 共用这一份形状（worker → 主线程的传输格式）。 */
export interface ImportedPayload {
    chapters: Array<{ title: string; paras: string[]; images?: Array<{ bytes: ArrayBuffer; mime: string }> }>;
    /** 每章起始段号（全书单调），toc 跳转与百分比换算用 */
    chapterStartPara: number[];
    toc: Array<{ title: string; chapterIdx: number; level?: number }>;
    totalChars: number;
    contentRev: string;
    meta: { title?: string; author?: string; language?: string };
    /** 封面字节（EPUB 有；主线程负责 putImageBlob） */
    cover?: { bytes: ArrayBuffer; mime: string };
    /** TXT 实际使用的编码（EPUB 恒为 utf-8） */
    encoding?: string;
}

export function fileNameToTitle(fileName: string): string {
    return fileName.replace(/\.[^.]+$/, '').trim() || '未命名';
}

function packChapters(chapters: RawChapter[], meta: ImportedPayload['meta']): ImportedPayload {
    const chapterStartPara: number[] = [];
    const toc: ImportedPayload['toc'] = [];
    let cursor = 0;
    let totalChars = 0;
    chapters.forEach((c, idx) => {
        chapterStartPara.push(cursor);
        toc.push({ title: c.title, chapterIdx: idx });
        cursor += c.paras.length;
        for (const p of c.paras) totalChars += p.length;
    });
    const rev = contentRevOf(chapters.map((c) => c.paras.join('\n')).join('\n\n'));
    return { chapters, chapterStartPara, toc, totalChars, contentRev: rev, meta };
}

/**
 * 解 TXT。forcedEncoding 给定时直接用那个编码解（用户猜错编码后的重解路径）；
 * 解码彻底失败返回 { error }，由导入卡显示成人话。
 */
export function parseTxt(
    bytes: Uint8Array,
    opts: { forcedEncoding?: string; fileName?: string } = {},
): ImportedPayload | { error: string } {
    const decoded = decodeTextBytes(bytes, opts.forcedEncoding);
    if ('error' in decoded) return decoded;

    const chapters = splitTextToChapters(decoded.text);
    const title = opts.fileName ? fileNameToTitle(opts.fileName) : undefined;
    return { ...packChapters(chapters, { title }), encoding: decoded.encoding };
}

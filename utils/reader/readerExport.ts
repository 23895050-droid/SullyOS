// 读书模块 · 数据导入导出（2026-09-21，T6 ③）
//
// 她 09-21 给设置页定的第三条：**范围勾选（文本 / 笔记 / 媒体 / 书内容）、支持分角色**；
// 角色自己的设置页里也能单独导出/导入他自己的那一份。
//
// 一份包 = 一个 JSON（`sullyos-reader-export`）：
//   · 书内容 = 书目 + 正文（rd_books / rd_chapters）——**不含原始 epub/txt 文件**（那是几十 MB，
//     正文已经在库里了；原始文件只在重新解码 TXT 时有用，要备份整机走全量备份那条路）
//   · 笔记   = 批注 + 讨论 + 进度（rd_annotations / rd_threads / rd_progress）
//   · 文本   = 活动记录（rd_roam：感受、摘要、每次调用都在这儿）
//   · 媒体   = 封面图（blob → data URL，导入时按原令牌写回，引用零改写）
//   · 设置   = 读书偏好 / 每个角色自己的设置与阅读风格 / 提示词套 / 挂载规则（localStorage 那几个）
//
// 分角色（owners）只筛「带主人」的行（批注/讨论/进度/活动）；书内容与媒体跟着这些行
// **落到他碰过的书**上——导一个角色的包，不该把别人的书单也塞进去。
//
// 导入是**按 id 覆盖**（put）：同一份包导两遍幂等；跨设备导进来是把新行加进去。
// 设置类：角色设置/风格/挂载按角色合并（导一个人的包不动别人），提示词套按 id 合并。

import { blobToDataUrl, dataUrlToBlob, getBlobForRef, restoreBlobRef } from '../blobRef';
import {
    appendRoamActivity, listAnnotations, listBooks, listChapters, listProgressByBook, listRecentRoamActivities,
    listThreads, putAnnotation, putBook, putChapters, putProgress, putThread,
    type RdAnnotation, type RdBook, type RdChapter, type RdProgress, type RdRoamActivity, type RdThread,
} from './readerDb';
import { readerPrefsStore, getReaderPrefs, type ReaderPrefs } from '../../apps/reader/readerPrefs';
import { getReaderCharPrefsStore, setCharReadPrefs, type CharReadPrefs } from '../../apps/reader/readerCharPrefs';
import { getReaderCharStyleStore, setCharStyle, type CharStyle } from '../../apps/reader/readerCharStyle';
import { getPromptPresetStore, mergePromptPresetStore, type PromptPresetStore } from '../../apps/reader/readerPromptPresets';
import { getReaderMountConfig, mergeReaderMountConfig, type ReaderMountConfig } from './readerMount';

export interface ReaderExportScope {
    /** 书内容：书目 + 正文 */
    content: boolean;
    /** 笔记：批注 + 讨论 + 进度 */
    notes: boolean;
    /** 文本：活动记录（感受与摘要） */
    text: boolean;
    /** 媒体：封面图 */
    media: boolean;
    /** 设置与偏好（读书偏好 / 角色设置 / 提示词套 / 挂载规则） */
    settings: boolean;
}

export const FULL_EXPORT_SCOPE: ReaderExportScope = {
    content: true, notes: true, text: true, media: true, settings: true,
};

/** 角色个人页那份：他的痕迹 + 他自己的设置，不拖书内容（书在她自己那边有） */
export const CHAR_EXPORT_SCOPE: ReaderExportScope = {
    content: false, notes: true, text: true, media: false, settings: true,
};

export interface ReaderExportSettings {
    prefs: ReaderPrefs;
    charPrefs: Record<string, CharReadPrefs>;
    charStyle: Record<string, CharStyle>;
    promptPresets: PromptPresetStore;
    mount: ReaderMountConfig;
}

export interface ReaderExportBundle {
    kind: 'sullyos-reader-export';
    version: number;
    exportedAt: string;
    /** null = 全员 */
    owners: string[] | null;
    scope: ReaderExportScope;
    books: RdBook[];
    chapters: RdChapter[];
    annotations: RdAnnotation[];
    threads: RdThread[];
    progress: RdProgress[];
    roam: RdRoamActivity[];
    /** 令牌 → data URL（只有勾了媒体才有） */
    blobs: Record<string, string>;
    settings?: ReaderExportSettings;
}

export const READER_EXPORT_VERSION = 1;

function grabSettings(owners: string[] | null): ReaderExportSettings {
    const pick = <T>(rows: Record<string, T>): Record<string, T> => {
        if (owners === null) return rows;
        const out: Record<string, T> = {};
        for (const id of owners) if (rows[id]) out[id] = rows[id];
        return out;
    };
    const mount = getReaderMountConfig();
    return {
        prefs: getReaderPrefs(),
        charPrefs: pick(getReaderCharPrefsStore().chars),
        charStyle: pick(getReaderCharStyleStore().chars),
        promptPresets: getPromptPresetStore(),
        mount: { ...mount, chars: pick(mount.chars) },
    };
}

/** 攒一份包（现读现攒；范围里没勾的字段就是空数组） */
export async function buildReaderExport(opts: {
    scope: ReaderExportScope;
    owners?: string[] | null;
}): Promise<ReaderExportBundle> {
    const scope = opts.scope;
    const owners = opts.owners && opts.owners.length > 0 ? opts.owners : null;
    const isMine = (ownerId: string): boolean => owners === null || owners.includes(ownerId);

    const allBooks = await listBooks();
    const annotations: RdAnnotation[] = [];
    const threads: RdThread[] = [];
    const progress: RdProgress[] = [];
    const roam: RdRoamActivity[] = [];

    if (scope.notes) {
        for (const b of allBooks) {
            annotations.push(...(await listAnnotations(b.id)).filter((a) => isMine(a.ownerId)));
            progress.push(...(await listProgressByBook(b.id)).filter((p) => isMine(p.ownerId)));
            // 讨论是 append-only 的一串话，挂在划线上——不按人拆，引用它的批注进了就一起进
            threads.push(...(await listThreads(b.id)));
        }
    }
    if (scope.text) {
        roam.push(...(await listRecentRoamActivities()).filter((r) => isMine(r.charId)));
    }

    // 书内容 / 媒体：分角色时只带「他碰过的书」（痕迹落在哪本就带哪本）
    const touched = new Set<string>();
    for (const a of annotations) touched.add(a.bookId);
    for (const p of progress) touched.add(p.bookId);
    for (const r of roam) touched.add(r.bookId);
    for (const t of threads) if (t.bookId) touched.add(t.bookId);
    const picked = owners === null ? allBooks : allBooks.filter((b) => touched.has(b.id));

    const books: RdBook[] = scope.content ? picked : [];
    const chapters: RdChapter[] = [];
    if (scope.content) {
        for (const b of picked) chapters.push(...(await listChapters(b.id)));
    }

    const blobs: Record<string, string> = {};
    if (scope.media) {
        for (const b of picked) {
            const ref = b.coverRef;
            if (!ref || blobs[ref]) continue;
            const blob = await getBlobForRef(ref);
            if (!blob) continue;
            try {
                blobs[ref] = await blobToDataUrl(blob);
            } catch { /* 单张图编不出来就跳过，不拦整包 */ }
        }
    }

    return {
        kind: 'sullyos-reader-export',
        version: READER_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        owners,
        scope,
        books, chapters, annotations, threads, progress, roam, blobs,
        settings: scope.settings ? grabSettings(owners) : undefined,
    };
}

export interface ReaderImportResult {
    books: number;
    chapters: number;
    annotations: number;
    threads: number;
    progress: number;
    roam: number;
    blobs: number;
    settings: boolean;
}

export const isReaderBundle = (v: unknown): v is ReaderExportBundle =>
    !!v && typeof v === 'object' && (v as ReaderExportBundle).kind === 'sullyos-reader-export';

/** 把一份包写回库里（按 id 覆盖）。返回每样写了多少条 */
export async function applyReaderImport(raw: unknown): Promise<ReaderImportResult> {
    if (!isReaderBundle(raw)) throw new Error('这不是书房导出的文件');
    const b = raw;
    const out: ReaderImportResult = {
        books: 0, chapters: 0, annotations: 0, threads: 0, progress: 0, roam: 0, blobs: 0, settings: false,
    };

    // 图片先写回（按原令牌，引用零改写）
    for (const [ref, dataUrl] of Object.entries(b.blobs ?? {})) {
        try {
            await restoreBlobRef(ref, await dataUrlToBlob(dataUrl));
            out.blobs += 1;
        } catch { /* 单张图坏掉不拦整包 */ }
    }

    for (const book of b.books ?? []) { await putBook(book); out.books += 1; }
    if ((b.chapters ?? []).length > 0) { await putChapters(b.chapters); out.chapters = b.chapters.length; }
    for (const a of b.annotations ?? []) { await putAnnotation(a); out.annotations += 1; }
    for (const t of b.threads ?? []) { await putThread(t); out.threads += 1; }
    for (const p of b.progress ?? []) { await putProgress(p); out.progress += 1; }
    for (const r of b.roam ?? []) { await appendRoamActivity(r); out.roam += 1; }

    if (b.settings) {
        applySettings(b.settings);
        out.settings = true;
    }
    return out;
}

function applySettings(s: ReaderExportSettings): void {
    // 读书偏好：整份覆盖（「合并两套偏好」没有说得通的默认答案）
    if (s.prefs) readerPrefsStore.set((prev) => ({ ...prev, ...s.prefs, version: prev.version }));
    // 角色自己的设置 / 风格 / 挂载：按角色合并——导一个人的包不碰别人
    for (const [id, row] of Object.entries(s.charPrefs ?? {})) setCharReadPrefs(id, row);
    for (const [id, row] of Object.entries(s.charStyle ?? {})) setCharStyle(id, row);
    if (s.promptPresets) mergePromptPresetStore(s.promptPresets);
    if (s.mount) mergeReaderMountConfig(s.mount);
}

/** 导出的文件名：`书房-Angel-2026-09-21.json` */
export function readerExportFileName(ownerLabel?: string): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const who = ownerLabel ? `-${ownerLabel}` : '';
    return `书房${who}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
}

/** 存成文件（浏览器下载）。返回文件名 */
export function downloadReaderBundle(bundle: ReaderExportBundle, ownerLabel?: string): string {
    const name = readerExportFileName(ownerLabel);
    const text = JSON.stringify(bundle);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    return name;
}

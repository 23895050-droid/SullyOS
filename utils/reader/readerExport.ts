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
//
// **换设备会认不出人**（她 09-21 报的）：角色 id 是那台设备上生成的，导到这台来对不上号。
// 所以包里带一份 `ownerNames`（当时叫什么名字），导入前 `planImport` 先把「这台设备没有的人」
// 列出来；她在一张引导卡里把那个人**认领给现有的某个角色**（`remap`），再真正写库。
// 认不出来的部分**默认不写**——宁可少几条，也不要在库里造出一串幽灵角色。

import { blobToDataUrl, dataUrlToBlob, getBlobForRef, restoreBlobRef } from '../blobRef';
import { DB } from '../db';
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
    /** 这些 id 当时叫什么名字（导入端认人用：id 换设备会变，名字不会） */
    ownerNames?: Record<string, string>;
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
    /** id → 名字（导入端那张「认一下这是谁」的卡要靠它；不给就只写 id） */
    ownerNames?: Record<string, string>;
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
        ownerNames: pickNames(opts.ownerNames, owners),
        scope,
        books, chapters, annotations, threads, progress, roam, blobs,
        settings: scope.settings ? grabSettings(owners) : undefined,
    };
}

/** 只留这次包里真的带了的那些 id 的名字（全量导出时把所有人都写上） */
function pickNames(names: Record<string, string> | undefined, owners: string[] | null): Record<string, string> {
    if (!names) return {};
    if (owners === null) return { ...names };
    const out: Record<string, string> = {};
    for (const id of owners) if (names[id]) out[id] = names[id];
    return out;
}

/** 一个人在这份包里有多少东西（认领卡片上那行数字） */
export interface ImportOwnerStat {
    id: string;
    /** 包里记的名字；没有就用 id */
    name: string;
    annotations: number;
    threads: number;
    progress: number;
    roam: number;
    hasSettings: boolean;
    /** 这台设备上已经有这个 id 吗（有就不用认领） */
    known: boolean;
}

/**
 * 导入前先看一眼这份包里都有谁、各带了多少东西、这台设备认不认识。
 * 纯函数（只读包和一份已有角色 id），**不写库**——认领卡片拿它渲染。
 */
export function planImport(raw: unknown, knownCharIds: string[]): ImportOwnerStat[] {
    if (!isReaderBundle(raw)) return [];
    const b = raw;
    const known = new Set(knownCharIds);
    const stats = new Map<string, ImportOwnerStat>();
    const of = (id: string): ImportOwnerStat => {
        const cur = stats.get(id) ?? {
            id, name: b.ownerNames?.[id] || id, annotations: 0, threads: 0, progress: 0, roam: 0,
            hasSettings: false, known: id === 'user' || known.has(id),
        };
        stats.set(id, cur);
        return cur;
    };
    for (const a of b.annotations ?? []) of(a.ownerId).annotations += 1;
    for (const p of b.progress ?? []) of(p.ownerId).progress += 1;
    for (const r of b.roam ?? []) of(r.charId).roam += 1;
    for (const t of b.threads ?? []) for (const id of t.charIds ?? []) of(id).threads += 1;
    for (const id of Object.keys(b.settings?.charPrefs ?? {})) of(id).hasSettings = true;
    for (const id of Object.keys(b.settings?.charStyle ?? {})) of(id).hasSettings = true;
    for (const id of Object.keys(b.settings?.mount?.chars ?? {})) of(id).hasSettings = true;
    // 活动记录里出现过的 user 也占一行（但永远 known）
    for (const id of b.owners ?? []) of(id);
    return [...stats.values()].sort((x, y) => Number(x.known) - Number(y.known));
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
    /** 认不出、又没被认领，所以**没写进来**的行数 */
    skipped: number;
}

export const isReaderBundle = (v: unknown): v is ReaderExportBundle =>
    !!v && typeof v === 'object' && (v as ReaderExportBundle).kind === 'sullyos-reader-export';

/**
 * 把一份包写回库里（按 id 覆盖）。返回每样写了多少条。
 *
 * `remap` = 「认领表」：包里的老 id → 这台设备上的角色 id（`planImport` 那张卡收上来的）。
 * 包里**认不出、又没被认领**的行**不写**（`skipped` 数给你看）——不造幽灵角色。
 */
export async function applyReaderImport(
    raw: unknown,
    opts?: { remap?: Record<string, string>; knownCharIds?: string[] },
): Promise<ReaderImportResult> {
    if (!isReaderBundle(raw)) throw new Error('这不是书房导出的文件');
    const b = raw;
    const out: ReaderImportResult = {
        books: 0, chapters: 0, annotations: 0, threads: 0, progress: 0, roam: 0, blobs: 0, settings: false, skipped: 0,
    };

    const known = new Set(opts?.knownCharIds ?? (await DB.getAllCharacters()).map((c) => c.id));
    const remap = opts?.remap ?? {};
    /** 这个主人落到谁名下：'' = 认不出也没认领 → 这条不写 */
    const toOwner = (id: string): string => {
        if (id === 'user' || known.has(id)) return id;
        const to = remap[id];
        return to && (to === 'user' || known.has(to)) ? to : '';
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
    for (const a of b.annotations ?? []) {
        const ownerId = toOwner(a.ownerId);
        if (!ownerId) { out.skipped += 1; continue; }
        await putAnnotation({ ...a, ownerId });
        out.annotations += 1;
    }
    for (const p of b.progress ?? []) {
        const ownerId = toOwner(p.ownerId);
        if (!ownerId) { out.skipped += 1; continue; }
        await putProgress({ ...p, ownerId });
        out.progress += 1;
    }
    for (const r of b.roam ?? []) {
        const charId = toOwner(r.charId);
        if (!charId) { out.skipped += 1; continue; }
        await appendRoamActivity({ ...r, charId });
        out.roam += 1;
    }
    for (const t of b.threads ?? []) {
        // 讨论是挂在划线上的一串话：作者认不出来就把那几条话去掉，线本身留着（她那一边的话还在）
        const charIds: string[] = [];
        for (const id of t.charIds ?? []) {
            const to = toOwner(id);
            if (to && to !== 'user' && !charIds.includes(to)) charIds.push(to);
        }
        const messages = (t.messages ?? []).flatMap((m) => {
            if (m.role !== 'char' || !m.charId) return [m];
            const to = toOwner(m.charId);
            return to ? [{ ...m, charId: to }] : [];
        });
        await putThread({ ...t, charIds, messages });
        out.threads += 1;
    }

    if (b.settings) {
        applySettings(b.settings, remap);
        out.settings = true;
    }
    return out;
}

function applySettings(s: ReaderExportSettings, remap: Record<string, string>): void {
    // 认领表也管设置那几块（他自己的设置得跟着人走）
    const to = (id: string): string => remap[id] ?? id;
    // 读书偏好：整份覆盖（「合并两套偏好」没有说得通的默认答案）
    if (s.prefs) readerPrefsStore.set((prev) => ({ ...prev, ...s.prefs, version: prev.version }));
    // 角色自己的设置 / 风格 / 挂载：按角色合并——导一个人的包不碰别人
    for (const [id, row] of Object.entries(s.charPrefs ?? {})) setCharReadPrefs(to(id), row);
    for (const [id, row] of Object.entries(s.charStyle ?? {})) setCharStyle(to(id), row);
    if (s.promptPresets) mergePromptPresetStore(s.promptPresets);
    if (s.mount) {
        const chars: ReaderMountConfig['chars'] = {};
        for (const [id, row] of Object.entries(s.mount.chars ?? {})) chars[to(id)] = row;
        mergeReaderMountConfig({ ...s.mount, chars });
    }
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

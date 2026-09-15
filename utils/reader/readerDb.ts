// 读书模块 · 数据层（2026-09-14，fork 自建）
//
// 这里是读者模块与 IndexedDB 之间的唯一出口：别处不许直接写 'rd_*' 表名。
// 五张表在 utils/db.ts 的 v73 升级块里创建（追加式 diff，别改那边以外的地方）。
//
//   rd_books        书目 + 元数据 + 原文件/封面的 blobref + toc。行里带 blobref 令牌，
//                   所以表名登记在 utils/blobGc.ts 的 REF_SOURCE_STORES 里（漏了会被当孤儿删）。
//   rd_chapters     一章一行（paras: string[]）。段号是「全书单调」的——锚点只认段号，
//                   分页/字号/屏幕变化都不动它（v3 的 V7 就靠这个结构性成立）。
//   rd_annotations  划线 / 批注 / 书签，锚点 + ownerId + 样式槽。ownerId ∈ {'user', charId}。
//   rd_threads      某段原文下的讨论。messages 只 append（append-only 资产）；
//                   总结是 kind:'summary' 的一条 message——它进不了 rd_annotations，
//                   所以「总结永不写回笔记库」是结构保证，不是纪律。
//   rd_progress     主键 [bookId, ownerId]：各人进度物理分离（V9），角色的写入碰不到用户那行。
//
// 字段名与朋友 v3 文档的对应：startPara=paragraph_idx / startOffset=sel_start_idx /
// endPara=sel_end_para_idx / endOffset=sel_end_idx / text=selected_text。
//
// 测试：utils/reader/readerDb.test.ts（fake-indexeddb，见 test-setup.ts）。

import { DB } from '../db';
import { deleteBlobRefIfUnreferenced } from '../blobRef';

// ─── 表名（与 utils/db.ts v73 升级块里的字面量一一对应）──────────────

export const RD_STORE = {
    books: 'rd_books',
    chapters: 'rd_chapters',
    annotations: 'rd_annotations',
    threads: 'rd_threads',
    progress: 'rd_progress',
} as const;

// ─── 类型 ────────────────────────────────────────────────────────

/** 'user' = 用户（Angelica）；其余 = 角色 id。 */
export type RdOwnerId = 'user' | (string & {});

/** 归一化后的 id 生成（不依赖 crypto.randomUUID：老 iOS Safari 没有）。 */
export const rdId = (prefix: string): string =>
    `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * 内容锚点。**只认内容和位置，不认坐标**——重排、换字号、换设备都不漂。
 * text/quoteBefore/quoteAfter 是「重新导入或解析器升级后段号对不上」时的回退线索，
 * 用来重新定位，不参与日常渲染。
 */
export interface RdAnchor {
    /** 起始段号（全书单调，0 起） */
    startPara: number;
    /** 段内字符偏移（含） */
    startOffset: number;
    /** 结束段号（段内选区 = startPara） */
    endPara: number;
    /** 结束段内的结束偏移（不含） */
    endOffset: number;
    /** 选中文本快照 */
    text: string;
    quoteBefore?: string;
    quoteAfter?: string;
}

/** 讨论线程的归属键：同一段选区只能有一条线程。 */
export function anchorKeyOf(anchor: RdAnchor): string {
    return `${anchor.startPara}:${anchor.startOffset}-${anchor.endPara}:${anchor.endOffset}`;
}

export interface RdTocItem {
    title: string;
    chapterIdx: number;
    level?: number;
}

export interface RdBook {
    id: string;
    title: string;
    author?: string;
    /** 自写简介（书架元数据管理） */
    intro?: string;
    format: 'epub' | 'txt';
    sourceFileName: string;
    fileBytes: number;
    /** 原文件（blobref:xxx）——TXT 编码猜错时靠它重解，不用重新选文件 */
    fileRef: string;
    coverRef?: string;
    /** TXT 实际使用的解码（用户可在导入卡里改） */
    encoding?: string;
    language?: string;
    /** importing = 半截导入（启动清扫会删掉），ready = 可用 */
    status: 'importing' | 'ready';
    /** 归一化后全文指纹：锚点归属校验（跨版本导入时用） */
    contentRev: string;
    chapterCount: number;
    totalChars: number;
    /** 每章起始段号，toc 跳转与百分比换算 */
    chapterStartPara: number[];
    toc: RdTocItem[];
    // ── 书架元数据（v3 §4.1）──
    tags: string[];
    /** 五星制 */
    rating?: number;
    category?: string;
    customAuthor?: string;
    customAuthorInfo?: string;
    customIntro?: string;
    onShelf: boolean;
    order: number;
    createdAt: string;
    updatedAt: string;
}

export interface RdChapter {
    /** `${bookId}#${idx 补零 5 位}` —— 同书按 id 升序即章节顺序 */
    id: string;
    bookId: string;
    idx: number;
    title: string;
    paras: string[];
    chars: number;
}

export type RdAnnotationKind = 'highlight' | 'note' | 'bookmark';

export interface RdAnnotation {
    id: string;
    bookId: string;
    ownerId: RdOwnerId;
    anchor: RdAnchor;
    kind: RdAnnotationKind;
    /** 1..6 → CSS 变量槽 --rd-hl-N（历史字段，颜色现在按「谁划的」取，见 prefs.highlightColors） */
    styleSlot: number;
    /** kind==='note' 时的批注文本 */
    note?: string;
    /** 锚点所属文本版本（= 导入时写入的 book.contentRev） */
    contentRev: string;
    /** orphaned = 段号对不上且回退线索也没救回来（只显示在笔记页，不上正文） */
    status: 'active' | 'orphaned';
    /** kind==='bookmark' 时记下落点（列表上要显示「第七章 · 3.69%」，段号算不出书名） */
    chapterIdx?: number;
    percent?: number;
    createdAt: string;
    updatedAt: string;
}

export type RdThreadRole = 'user' | 'char' | 'system';

export interface RdThreadMsg {
    id: string;
    role: RdThreadRole;
    /** role==='char' 时是谁 */
    charId?: string;
    content: string;
    /** chat = 原话（资产）；summary = 保鲜小结（永不写回笔记库） */
    kind: 'chat' | 'summary';
    createdAt: string;
}

export interface RdThread {
    id: string;
    bookId: string;
    /** 冗余一份锚点：讨论不依赖 annotation 是否存在 */
    anchor: RdAnchor;
    anchorKey: string;
    charIds: string[];
    /** append-only：只 push，不改写 */
    messages: RdThreadMsg[];
    createdAt: string;
    updatedAt: string;
}

export interface RdProgress {
    bookId: string;
    ownerId: RdOwnerId;
    chapterIdx: number;
    /** 全书单调段号 */
    paraIdx: number;
    /** 段内字符偏移（还原时落在段中间） */
    charOffset: number;
    /** 全书百分比（给人看的，永远不变形） */
    percent: number;
    readingSeconds: number;
    sessionCount: number;
    updatedAt: string;
}

// ─── 行助手 ──────────────────────────────────────────────────────

export const chapterRowId = (bookId: string, idx: number): string =>
    `${bookId}#${String(idx).padStart(5, '0')}`;

const nowIso = () => new Date().toISOString();

// ─── 书 ─────────────────────────────────────────────────────────

export async function listBooks(): Promise<RdBook[]> {
    const rows = (await DB.getAllRows(RD_STORE.books)) as RdBook[];
    return rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt));
}

export async function getBook(bookId: string): Promise<RdBook | null> {
    return (await DB.getRow(RD_STORE.books, bookId)) as RdBook | null;
}

/** 写书目。id 已存在则整体覆盖（导入流程：建行 importing → 写章节 → 最后 ready）。 */
export async function putBook(book: RdBook): Promise<void> {
    await DB.putStoreRows(RD_STORE.books, [{ ...book, updatedAt: nowIso() }]);
}

export async function patchBook(bookId: string, patch: Partial<RdBook>): Promise<RdBook | null> {
    const book = await getBook(bookId);
    if (!book) return null;
    const next = { ...book, ...patch, id: book.id, updatedAt: nowIso() };
    await DB.putStoreRows(RD_STORE.books, [next]);
    return next;
}

/**
 * 删一本书：先删书目行（引用面消失），再按索引清章节/批注/讨论/进度，
 * 最后把两个 blob 交给「无人引用才删」的判定收尾（共用令牌的图不会被误删）。
 */
export async function deleteBookDeep(bookId: string): Promise<void> {
    const book = await getBook(bookId);
    await DB.deleteRow(RD_STORE.books, bookId);
    await DB.deleteRowsByIndex(RD_STORE.chapters, 'bookId', bookId);
    await DB.deleteRowsByIndex(RD_STORE.annotations, 'bookId', bookId);
    await DB.deleteRowsByIndex(RD_STORE.threads, 'bookId', bookId);
    await DB.deleteRowsByIndex(RD_STORE.progress, 'bookId', bookId);
    if (book) {
        await deleteBlobRefIfUnreferenced(book.fileRef).catch(() => { /* best-effort */ });
        await deleteBlobRefIfUnreferenced(book.coverRef).catch(() => { /* best-effort */ });
    }
}

/**
 * 启动清扫：半途被杀的导入会留下 status:'importing' 的书（章节已写一部分、
 * 书行还没转 ready）。超过 maxAgeMs 且仍是 importing 的整本删掉——
 * 否则这些隐形重量永远没人回收。
 */
export async function sweepStaleImports(maxAgeMs = 60 * 60 * 1000): Promise<string[]> {
    const books = await listBooks();
    const cutoff = Date.now() - maxAgeMs;
    const swept: string[] = [];
    for (const book of books) {
        if (book.status !== 'importing') continue;
        const born = Date.parse(book.createdAt || '');
        if (Number.isFinite(born) && born > cutoff) continue;
        await deleteBookDeep(book.id);
        swept.push(book.id);
    }
    return swept;
}

// ─── 章节 ───────────────────────────────────────────────────────

/** 一本书的全部章节，按 idx 升序。 */
export async function listChapters(bookId: string): Promise<RdChapter[]> {
    const rows = (await DB.getRowsByIndex(RD_STORE.chapters, 'bookId', bookId)) as RdChapter[];
    return rows.sort((a, b) => a.idx - b.idx);
}

export async function getChapter(bookId: string, idx: number): Promise<RdChapter | null> {
    return (await DB.getRow(RD_STORE.chapters, chapterRowId(bookId, idx))) as RdChapter | null;
}

/** 批量写章节（导入时一页一个事务，见 importClient）。 */
export async function putChapters(chapters: RdChapter[]): Promise<void> {
    if (chapters.length === 0) return;
    await DB.putStoreRows(RD_STORE.chapters, chapters);
}

export async function countChapters(bookId: string): Promise<number> {
    const rows = await DB.getRowsByIndex(RD_STORE.chapters, 'bookId', bookId);
    return rows.length;
}

// ─── 批注 ───────────────────────────────────────────────────────

export async function listAnnotations(bookId: string): Promise<RdAnnotation[]> {
    const rows = (await DB.getRowsByIndex(RD_STORE.annotations, 'bookId', bookId)) as RdAnnotation[];
    return rows.sort((a, b) => a.anchor.startPara - b.anchor.startPara
        || a.anchor.startOffset - b.anchor.startOffset
        || a.createdAt.localeCompare(b.createdAt));
}

export async function listAnnotationsByOwner(bookId: string, ownerId: RdOwnerId): Promise<RdAnnotation[]> {
    const rows = (await DB.getRowsByIndex(RD_STORE.annotations, 'bookId_owner', [bookId, ownerId])) as RdAnnotation[];
    return rows.sort((a, b) => a.anchor.startPara - b.anchor.startPara || a.createdAt.localeCompare(b.createdAt));
}

export async function putAnnotation(annotation: RdAnnotation): Promise<void> {
    await DB.putStoreRows(RD_STORE.annotations, [{ ...annotation, updatedAt: nowIso() }]);
}

export async function deleteAnnotation(annotationId: string): Promise<void> {
    await DB.deleteRow(RD_STORE.annotations, annotationId);
}

// ─── 讨论 ───────────────────────────────────────────────────────

export async function listThreads(bookId: string): Promise<RdThread[]> {
    const rows = (await DB.getRowsByIndex(RD_STORE.threads, 'bookId', bookId)) as RdThread[];
    return rows.sort((a, b) => a.anchor.startPara - b.anchor.startPara || a.createdAt.localeCompare(b.createdAt));
}

/** 取同一段选区的线程（没有则 null）。线程 id 直接用 `${bookId}#${anchorKey}`，天然去重。 */
export async function getThreadByAnchor(bookId: string, anchorKey: string): Promise<RdThread | null> {
    return (await DB.getRow(RD_STORE.threads, threadRowId(bookId, anchorKey))) as RdThread | null;
}

export const threadRowId = (bookId: string, anchorKey: string): string => `${bookId}#${anchorKey}`;

export async function putThread(thread: RdThread): Promise<void> {
    await DB.putStoreRows(RD_STORE.threads, [{ ...thread, updatedAt: nowIso() }]);
}

/**
 * 往线程追加一句话（唯一的写入口）。总结也走这里，只是 kind='summary'。
 * 线程不存在时按传入的骨架新建。
 */
export async function appendThreadMessage(
    threadId: string,
    msg: RdThreadMsg,
    skeleton: () => RdThread,
): Promise<RdThread> {
    const existing = (await DB.getRow(RD_STORE.threads, threadId)) as RdThread | null;
    const thread = existing ?? skeleton();
    thread.messages = [...thread.messages, msg];
    thread.updatedAt = nowIso();
    await DB.putStoreRows(RD_STORE.threads, [thread]);
    return thread;
}

export async function deleteThread(threadId: string): Promise<void> {
    await DB.deleteRow(RD_STORE.threads, threadId);
}

// ─── 进度（V9：主键 [bookId, ownerId]，各人各一行）────────────────

export async function getProgress(bookId: string, ownerId: RdOwnerId): Promise<RdProgress | null> {
    return (await DB.getRow(RD_STORE.progress, [bookId, ownerId])) as RdProgress | null;
}

export async function listProgressByBook(bookId: string): Promise<RdProgress[]> {
    return (await DB.getRowsByIndex(RD_STORE.progress, 'bookId', bookId)) as RdProgress[];
}

export async function putProgress(progress: RdProgress): Promise<void> {
    await DB.putStoreRows(RD_STORE.progress, [{ ...progress, updatedAt: nowIso() }]);
}

/** 读进度并累加本次会话（打开阅读页时调一次）。 */
export async function touchProgress(
    bookId: string,
    ownerId: RdOwnerId,
    init: Pick<RdProgress, 'chapterIdx' | 'paraIdx' | 'charOffset' | 'percent'>,
): Promise<RdProgress> {
    const existing = await getProgress(bookId, ownerId);
    const next: RdProgress = existing
        ? { ...existing, ...init, sessionCount: existing.sessionCount + 1, updatedAt: nowIso() }
        : {
            bookId, ownerId, ...init,
            readingSeconds: 0, sessionCount: 1, updatedAt: nowIso(),
        };
    await DB.putStoreRows(RD_STORE.progress, [next]);
    return next;
}

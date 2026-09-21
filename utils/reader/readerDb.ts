// 读书模块 · 数据层（2026-09-14，fork 自建）
//
// 这里是读者模块与 IndexedDB 之间的唯一出口：别处不许直接写 'rd_*' 表名。
// 六张表在 utils/db.ts 的升级块里创建（v73 = rd_* 前五张，v74 = rd_roam；追加式 diff，别改那边以外的地方）。
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
//   rd_roam         角色和书互动的活动记录（v74 建）：表面写「做了什么」，点开是那次活动的
//                   一整个状态（含内心活动与 token）。append-only，删书时整本级联。
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
    roam: 'rd_roam',
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

/** 划线的画法（她 09-16 点名四种：下划线 / 波浪线 / 一半 / 完整） */
export type RdAnnotationStyle = 'underline' | 'wavy' | 'half' | 'full';

/**
 * 一条批注给谁看（Angel 09-15 定的三档）。
 * Angel 自己发的：public 公开（默认）/ private 只有她自己可见；
 * 角色发的：public 公开 / angel 只有 Angel 能看到（别的角色看不到、不参与共读）/
 * self 只有那个角色自己能看到（不在阅读页出现，只在他自己的详情页与状态里；笔记页收录但加锁）。
 */
export type RdVisibility = 'public' | 'private' | 'angel' | 'self';

export interface RdAnnotation {
    id: string;
    bookId: string;
    ownerId: RdOwnerId;
    anchor: RdAnchor;
    kind: RdAnnotationKind;
    /** 可见性。缺省 = public：老数据不用迁移，和「Angel 发的默认公开」同一个口径 */
    visibility?: RdVisibility;
    /** 1..6 → CSS 变量槽 --rd-hl-N（历史字段，一直没用上） */
    styleSlot: number;
    /** 这一条单独改过的颜色（划线编辑里改的）。没有就用「谁划的」那支笔（prefs.highlightColors） */
    color?: string;
    /** 线条类型：下划线 / 波浪线 / 一半 / 完整（缺省 = 完整，就是普通的划色块） */
    style?: RdAnnotationStyle;
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
    /** 线程键。**锚点是章内段号**，所以要带上章号，否则两章同一位置会撞（见 threadKeyOf）。 */
    anchorKey: string;
    /** 锚点落在哪一章（章内段号口径的必要搭档） */
    chapterIdx?: number;
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

// ─── 活动记录（v74 的 rd_roam）───────────────────────────────────

/**
 * 一次「角色和书互动」的种类。annotate/discuss 是他在共读里说的，
 * reread/readon/browse 是自主互动（重温 / 往后读 / 翻笔记），idle = 今天不想读；
 * summary = 这次活动的摘要记录（共读摘要 / 追逐摘要），read = Angel 本人读书。
 */
export type RdRoamKind =
    | 'annotate' | 'discuss' | 'reread' | 'readon' | 'browse' | 'idle'
    | 'summary' | 'read';

/**
 * 一条阅读活动记录 = **一次 llm 调用**的落库（她 09-20 钉死：「每次调用都落库」）。
 *
 * 界面呈现是另一层：同一次「决策 + 阅读」的所有调用共用 `group`，
 * 界面上聚合成**一张活动卡**（表面只写 summary），点开详情才看到
 * 里面每一条调用 + 这次活动的摘要记录（`kind:'summary'`，有的话）。
 * 共读的多人多次同理——几个人读就几条调用，同挂一个 group。
 */
export interface RdRoamActivity {
    id: string;
    /** 这条记录属于谁：角色 id，或 `'user'` = Angel 本人（用户活动记录） */
    charId: string;
    bookId: string;
    kind: RdRoamKind;
    /** 一次「决策 + 阅读」的活动 id：同一次活动的每条调用共用它，界面按它聚合 */
    group: string;
    /** 这是这次活动里的第几条（从 0 起）；摘要记录排在最后 */
    seq: number;
    /** 这次活动的落点（段号，全书单调口径）；翻笔记这类没有落点时为 undefined */
    fromPara?: number;
    /** 读到哪（readon 用来推进进度；等于 fromPara 就是重温） */
    toPara?: number;
    /** 这一次读了多少页（她 09-20 的活动记录口径：看了多少页） */
    pages?: number;
    /**
     * 这一次读的是**本章第几页到第几页**（1 起；她 09-21 要的诊断口子：
     * 她设了读五页，到底给没给他五页，活动记录里一眼能看出来）。
     * 页码 = 她点「让他读」那一刻翻到的页；09-21 之前的老记录没有这两个字段。
     */
    fromPage?: number;
    toPage?: number;
    /** 他划的线落在**哪几页**（本章口径，升序）——和上面那对并排看就知道他有没有把线挤在一页 */
    annPages?: number[];
    /** 这次开读摆给他看的：他眼下这几页上有几条批注（她 09-21 问「里面真的有我的批注吗」） */
    feedNotes?: number;
    /** 摆给他的「你上几次读到的、还没接过话的」那几条原话（现读的字，不是抄档） */
    feedLater?: string[];
    /** 他想接话、但抄回来的那句没对上原文的条数（对不上就丢掉不落库——她要能看见这种哑火） */
    replyMissed?: number;
    /** 这一次留下了几条批注（全局活动记录表面要写） */
    annCount?: number;
    /** 这一次参与了多少条回复 */
    replyCount?: number;
    /** 这一次读了多久（毫秒；只有你自己读书这条会填——角色没有「坐了多久」这个数） */
    durationMs?: number;
    /** 表面列表写的那句「做了什么」 */
    summary: string;
    /**
     * 这条记录发生在哪一章（章内段号必须配上章号才认得出「他上次读的是哪几页」；
     * 09-21 之前的老记录没有它，只能当「就是当前这一章」）
     */
    chapterIdx?: number;
    /** 那一次他的「一页」压了几段（段号是章内的，没有它就没法还原「那一页」是哪几段） */
    perPage?: number;
    /** 这次读到的原文，几句话概括讲了什么（模型输出，不是感受） */
    excerpt?: string;
    /** 这一趟顺手回的话（分气泡的原文；她 09-20：回复模式的回复记录要显示在面板时间线上） */
    replies?: string[];
    /** 内心活动（第一人称私人感受）。只在「状态」里露脸，不进笔记页/讨论面板 */
    feeling?: string;
    /** 这次调用花的 token 合计（书库页排行榜用；拿不到就不记） */
    tokens?: number;
    /** 提示词吃掉的（她 09-16：活动记录要看得见「读进去多少」） */
    tokensIn?: number;
    /** 回复吐出来的（「输出了多少」） */
    tokensOut?: number;
    /** coread = 共读会话里发生的；roam = 角色自主互动；user = 你自己读书 */
    mode: 'coread' | 'roam' | 'user';
    createdAt: string;
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
 * 删一本书：先删书目行（引用面消失），再按索引清章节/批注/讨论/进度/活动记录，
 * 最后把两个 blob 交给「无人引用才删」的判定收尾（共用令牌的图不会被误删）。
 */
export async function deleteBookDeep(bookId: string): Promise<void> {
    const book = await getBook(bookId);
    await DB.deleteRow(RD_STORE.books, bookId);
    await DB.deleteRowsByIndex(RD_STORE.chapters, 'bookId', bookId);
    await DB.deleteRowsByIndex(RD_STORE.annotations, 'bookId', bookId);
    await DB.deleteRowsByIndex(RD_STORE.threads, 'bookId', bookId);
    await DB.deleteRowsByIndex(RD_STORE.progress, 'bookId', bookId);
    await DB.deleteRowsByIndex(RD_STORE.roam, 'bookId', bookId);
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

// ─── 活动记录读写（v74 的 rd_roam）───────────────────────────────

/** 追加一条活动记录。append-only：没有改写入口，删书时整本带走。 */
export async function appendRoamActivity(activity: RdRoamActivity): Promise<RdRoamActivity> {
    const row: RdRoamActivity = { ...activity, createdAt: activity.createdAt || nowIso() };
    await DB.putStoreRows(RD_STORE.roam, [row]);
    return row;
}

/** 某个角色的活动记录，新的在前（角色详情页时间轴直接用）。limit 省略 = 全给。 */
export async function listRoamActivities(charId: string, limit?: number): Promise<RdRoamActivity[]> {
    const rows = (await DB.getRowsByIndex(RD_STORE.roam, 'charId', charId)) as RdRoamActivity[];
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return limit && limit > 0 ? rows.slice(0, limit) : rows;
}

/** 全员（跨书）的活动记录，新的在前——书库页的全局活动记录用。 */
export async function listRecentRoamActivities(limit?: number): Promise<RdRoamActivity[]> {
    const rows = (await DB.getAllRows(RD_STORE.roam)) as RdRoamActivity[];
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return limit && limit > 0 ? rows.slice(0, limit) : rows;
}

/**
 * 开一次新活动，拿到它的 group id。
 * 一次「决策 + 阅读」（或你点一次「让他读」）开一个——之后这次的每条调用都挂在它下面。
 */
export const newRoamGroup = (): string => rdId('grp');

/** 改一条活动记录（用户活动记录可手动改；角色的一律不改，append-only）。 */
export async function updateRoamActivity(id: string, patch: Partial<RdRoamActivity>): Promise<void> {
    const row = (await DB.getRow(RD_STORE.roam, id)) as RdRoamActivity | null;
    if (!row) return;
    await DB.putStoreRows(RD_STORE.roam, [{ ...row, ...patch, id: row.id, charId: row.charId }]);
}

/** 删一条活动记录（用户活动记录可手动删）。 */
export async function deleteRoamActivity(id: string): Promise<void> {
    await DB.deleteRow(RD_STORE.roam, id);
}

/** 同一次活动的全部调用，按 seq 排（有 seq 的按 seq，没有的按时间——老数据）。 */
export async function listRoamGroup(group: string): Promise<RdRoamActivity[]> {
    const rows = (await DB.getAllRows(RD_STORE.roam)) as RdRoamActivity[];
    return rows
        .filter((r) => r.group === group)
        .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.createdAt.localeCompare(b.createdAt));
}

// ─── 可见性判定 ──────────────────────────────────────────────────

/**
 * 这条批注**给谁看**。viewer: 'user' = Angel 本人，其余 = 角色 id。
 *
 * Angel：全都能看（角色的 self 也看得到——在他详情页与笔记页的锁后面）。
 * 角色 X：公开的 + 他自己的（含 self）。看不到 angel 档（那是只给 Angel 的），
 *        也看不到别的角色的 self，更看不到 Angel 的 private。
 */
export function canSee(annotation: RdAnnotation, viewer: RdOwnerId): boolean {
    const visibility: RdVisibility = annotation.visibility ?? 'public';
    if (viewer === 'user') return true;
    if (annotation.ownerId === viewer) return true;
    if (visibility !== 'public') return false;
    // Angel 的公开批注：大家都看得到
    return true;
}

/** 过滤出一份给定视角能看到的批注（顺序不动）。 */
export function visibleAnnotationsFor(annotations: RdAnnotation[], viewer: RdOwnerId): RdAnnotation[] {
    return annotations.filter((a) => canSee(a, viewer));
}

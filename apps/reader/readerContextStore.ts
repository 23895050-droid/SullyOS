// 读书模块 · 书房自己的阅读记忆（她 09-26 文档）
//
// 按**书**存三样东西，跨会话延续（讨论记录是一本书一条河）：
//   ① `rows`      历史阅读摘要——两类：`content`（每满 10 条活动记录，把原文小总结 + 感受揉一条）
//                 和 `discuss`（讨论记录满 45 条，归档较早的 30 条）。他下次读书时读的就是它。
//   ② `contentAt` / `discussAt`  两条水位线：上次汇总/归档到什么时候，防重复也防漏。
//   ③ `seen`      每个角色「上次读到什么时候」= **未读水位线**（她 09-26：看过了没接的不再重复摆）。
//
// 放 localStorage（小、同步、要即时生效），走 apps/couple 的 store 工厂，跟 coreadStore 一个路子。

import { createCoupleStore, isoNow, uid } from '../couple/coupleStoreBase';

/** 一条阅读记忆（摘要） */
export interface RdMemoRow {
    id: string;
    /** content = 原文小总结 + 感受的轻汇总；discuss = 讨论记录的摘要 */
    kind: 'content' | 'discuss';
    text: string;
    at: string;
    /** 这次覆盖了多少条（活动记录条数 / 讨论条数），只作展示 */
    covers?: number;
}

export interface RdBookContext {
    /** 历史阅读摘要（时间从早到晚） */
    rows: RdMemoRow[];
    /** A 类水位线：上次把原文小总结 + 感受汇总到什么时候 */
    contentAt: string | null;
    /** B 类水位线：上次把讨论记录归档到什么时候 */
    discussAt: string | null;
    /** 每个角色「上次读到什么时候」（未读水位线） */
    seen: Record<string, string>;
}

interface RdContextStore {
    version: number;
    updatedAt: string;
    owner: string;
    books: Record<string, RdBookContext>;
}

const EMPTY: RdBookContext = { rows: [], contentAt: null, discussAt: null, seen: {} };

const store = createCoupleStore<RdContextStore>('reader_context_v1', 1, {
    version: 1,
    updatedAt: isoNow(),
    owner: 'angelica-home',
    books: {},
});

/** 这本书的阅读记忆（没有就给一份空的，不写库）。 */
export const bookContext = (bookId: string): RdBookContext => store.get().books[bookId] ?? EMPTY;

const patchBook = (bookId: string, fn: (bk: RdBookContext) => RdBookContext): void => {
    store.set((prev) => ({
        ...prev,
        updatedAt: isoNow(),
        books: { ...prev.books, [bookId]: fn(prev.books[bookId] ?? EMPTY) },
    }));
};

/** 历史阅读摘要：最近的 n 条（她 09-26：读最近十条）。 */
export const recentMemos = (bookId: string, n = 10): RdMemoRow[] =>
    bookContext(bookId).rows.slice(-Math.max(1, n));

/** 某类摘要的最近 n 条文本（喂给摘要模型做衔接）。 */
export const recentMemoTexts = (bookId: string, kind: RdMemoRow['kind'], n = 3): string[] =>
    bookContext(bookId).rows.filter((r) => r.kind === kind).slice(-Math.max(1, n)).map((r) => r.text);

/** 记一条阅读记忆（返回它自己）。 */
export function appendMemo(bookId: string, row: Omit<RdMemoRow, 'id' | 'at'> & { at?: string }): RdMemoRow {
    const full: RdMemoRow = { id: uid(), at: row.at ?? isoNow(), kind: row.kind, text: row.text, covers: row.covers };
    patchBook(bookId, (bk) => ({ ...bk, rows: [...bk.rows, full] }));
    return full;
}

/** 推水位线：A 类（内容与感受汇总到什么时候）。 */
export const setContentAt = (bookId: string, at: string): void =>
    patchBook(bookId, (bk) => ({ ...bk, contentAt: at }));

/** 推水位线：B 类（讨论记录归档到什么时候）。 */
export const setDiscussAt = (bookId: string, at: string): void =>
    patchBook(bookId, (bk) => ({ ...bk, discussAt: at }));

/** 某个角色「读到这会儿了」——他接收过的内容，之后不再当未读催他。 */
export const markSeen = (bookId: string, charId: string, at = isoNow()): void =>
    patchBook(bookId, (bk) => ({ ...bk, seen: { ...bk.seen, [charId]: at } }));

/** 他的未读水位线（没读过就 null = 什么都还没接收过）。 */
export const seenAt = (bookId: string, charId: string): string | null =>
    bookContext(bookId).seen[charId] ?? null;

/** 订阅（面板要跟着刷新时用）。 */
export const useReaderContextStore = store.use;

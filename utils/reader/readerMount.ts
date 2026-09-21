// 读书模块 · 挂到聊天里（2026-09-21，T6 的地基 / T9 会接上）
//
// 她 09-21 的 plan 把「关键词挂载」拆成两半：**设置页先把规则配起来**（T6 ②），
// **注入在 T9 接**（聊天提到读书 → 他知道自己最近读了什么、你读到哪）。
// 所以这里三件事：
//   ① 配置 store（每角色一份，和 noxhome 挂载同一套世界书参数）
//   ② 内容生成器（现读现生成，DB 里一改下一轮就是新的）
//   ③ 命中测试（纯函数本地算，不烧 token）——设置页那枚「测」按钮用
//
// **同步 / 异步的缝**：聊天上下文那条路是同步的（`mergedMountedWorldbooks`），
// 而内容是 IndexedDB 里读出来的。所以内容先生成到模块级缓存里（`primeReaderMount`），
// 同步那条路读缓存（`readerMountEntriesSync`）。T9 接注入时在构建上下文之前 await 一次 prime。

import type { MountedWorldbook } from '../../types';
import { isWorldbookEntryActive } from '../worldbook';
import {
    listBooks, listProgressByBook, listRoamActivities,
    type RdBook, type RdProgress, type RdRoamActivity,
} from './readerDb';
import { runVerbs, mergeRuns, fmtTok } from './readerDigest';
import type { MountBlockConfig } from '../noxhomeMount';

export type ReaderMountBlockId = 'acts' | 'shelf' | 'book' | 'userProgress';

export const READER_MOUNT_BLOCK_IDS: ReaderMountBlockId[] = ['acts', 'shelf', 'book', 'userProgress'];

export const READER_MOUNT_BLOCK_LABELS: Record<ReaderMountBlockId, string> = {
    acts: '他的阅读状态',
    shelf: '他的书架进度',
    book: '某一本书的记录',
    userProgress: '你的阅读进度',
};

export const READER_MOUNT_BLOCK_DESCS: Record<ReaderMountBlockId, string> = {
    acts: '提到读书/看书/最近读什么 → 他知道自己最近五次阅读做了什么（动作 + 书名 + 时间）',
    shelf: '提到读书/书架/进度 → 他手上在读的几本书和读到哪了',
    book: '聊到某个书名 → 他在这本书上的近五次记录（书名本身就是触发词，自动跟着书架走）',
    userProgress: '提到读书/你读到哪 → 他知道你的进度，能自己判断要不要说「你拉我一把」',
};

/** 每块的默认世界书参数（位置 4 = 聊天记录指定深度，最贴「最近的日常」） */
export const DEFAULT_READER_BLOCKS: Record<ReaderMountBlockId, MountBlockConfig> = {
    acts: {
        enabled: false, position: 4, order: 110,
        key: ['读书', '看书', '读了', '最近读', '在读书'],
        keysecondary: [], selective: false, selectiveLogic: 0,
        constant: false, probability: 100, useProbability: false,
        depth: 4, role: 0, scanDepth: 8,
    },
    shelf: {
        enabled: false, position: 4, order: 111,
        key: ['读书', '书架', '读了什么', '读到哪'],
        keysecondary: [], selective: false, selectiveLogic: 0,
        constant: false, probability: 100, useProbability: false,
        depth: 4, role: 0, scanDepth: 8,
    },
    book: {
        enabled: false, position: 4, order: 112,
        key: [],   // 空的：书名是动态关键词，扫书架自动补
        keysecondary: [], selective: false, selectiveLogic: 0,
        constant: false, probability: 100, useProbability: false,
        depth: 4, role: 0, scanDepth: 8,
    },
    userProgress: {
        enabled: false, position: 4, order: 113,
        key: ['读书', '读到哪', '进度', '一起读'],
        keysecondary: [], selective: false, selectiveLogic: 0,
        constant: false, probability: 100, useProbability: false,
        depth: 4, role: 0, scanDepth: 8,
    },
};

export interface ReaderMountConfig {
    version: number;
    updatedAt: string;
    /** charId → 块 id → 参数（没配过的角色走默认值，不落盘） */
    chars: Record<string, Record<ReaderMountBlockId, MountBlockConfig>>;
}

export const READER_MOUNT_KEY = 'reader_mount_v1';

let mountCache: ReaderMountConfig | null = null;
const mountListeners = new Set<() => void>();

function loadMount(): ReaderMountConfig {
    if (mountCache) return mountCache;
    let chars: ReaderMountConfig['chars'] = {};
    try {
        const raw = localStorage.getItem(READER_MOUNT_KEY);
        const parsed = raw ? (JSON.parse(raw) as Partial<ReaderMountConfig>) : null;
        if (parsed && typeof parsed === 'object' && parsed.chars && typeof parsed.chars === 'object') chars = parsed.chars;
    } catch { /* 读不出来就全默认 */ }
    mountCache = { version: 1, updatedAt: new Date().toISOString(), chars };
    return mountCache;
}

function saveMount(next: ReaderMountConfig): void {
    mountCache = next;
    try {
        localStorage.setItem(READER_MOUNT_KEY, JSON.stringify(next));
    } catch { /* 配额满就本次会话内生效 */ }
    for (const fn of mountListeners) fn();
}

export const subscribeReaderMount = (fn: () => void): (() => void) => {
    mountListeners.add(fn);
    return () => mountListeners.delete(fn);
};

export const getReaderMountConfig = (): ReaderMountConfig => loadMount();

/** 这个角色这一块的参数（没配过就是默认值） */
export const readerMountBlockOf = (charId: string, id: ReaderMountBlockId): MountBlockConfig =>
    ({ ...DEFAULT_READER_BLOCKS[id], ...(loadMount().chars[charId]?.[id] ?? {}) });

export function setReaderMountBlock(charId: string, id: ReaderMountBlockId, patch: Partial<MountBlockConfig>): void {
    const cur = loadMount();
    const own = { ...(cur.chars[charId] ?? {}) } as Record<ReaderMountBlockId, MountBlockConfig>;
    own[id] = { ...readerMountBlockOf(charId, id), ...patch };
    saveMount({ ...cur, updatedAt: new Date().toISOString(), chars: { ...cur.chars, [charId]: own } });
}

/** 导入备份用：按角色合并（带进来的角色覆盖同一个人那份，别人不动） */
export function mergeReaderMountConfig(src: Partial<ReaderMountConfig> | null | undefined): void {
    if (!src || typeof src !== 'object' || !src.chars) return;
    const cur = loadMount();
    saveMount({ ...cur, updatedAt: new Date().toISOString(), chars: { ...cur.chars, ...src.chars } });
}

// ─── 内容（现读现生成：DB 一改，下一轮聊天就是新的） ───────────────

const bookTitleOf = (books: RdBook[], id: string): string => books.find((b) => b.id === id)?.title ?? '一本书';

const chapterNameOf = (book: RdBook | undefined, chapterIdx: number): string => {
    if (!book) return '';
    const t = book.toc?.[chapterIdx]?.title?.trim();
    return t || `第 ${chapterIdx + 1} 章`;
};

/** `09-21 01:10`（活动记录那行的时间戳，短） */
const stampOf = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const dayOf = (iso: string): string => stampOf(iso).slice(0, 5);

/** 他最近五次阅读做了什么（纯：给测试用） */
export function actsLines(rows: RdRoamActivity[], titleOf: (id: string) => string, limit = 5): string[] {
    const runs = mergeRuns(rows).slice(0, limit);
    return runs.map((r) => {
        const bits = [`${dayOf(r.to)} ${runVerbs(r)}《${titleOf(r.bookId)}》`];
        const tok = r.calls.reduce((n, a) => n + (Number(a.tokens) || 0), 0);
        if (tok) bits.push(`花了 ${fmtTok(tok)} token`);
        return `- ${bits.join('，')}`;
    });
}

/** 他在几本书上读到哪了（纯） */
export function shelfLines(progs: RdProgress[], books: RdBook[], limit = 5): string[] {
    return progs
        .slice()
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
        .slice(0, limit)
        .map((p) => {
            const book = books.find((b) => b.id === p.bookId);
            const where = chapterNameOf(book, p.chapterIdx);
            return `- 《${book?.title ?? '一本书'}》读到 ${Math.round(p.percent)}%${where ? `（${where}）` : ''}，上次 ${dayOf(p.updatedAt)}`;
        });
}

/** 你在几本书上读到哪了（纯） */
export const userProgressLines = (progs: RdProgress[], books: RdBook[], limit = 3): string[] =>
    shelfLines(progs, books, limit);

interface BuiltBlock {
    content: string;
    /** 动态关键词（书名这类）——拼进世界书条目的 key */
    keys: string[];
}

async function buildBlock(id: ReaderMountBlockId, charId: string): Promise<BuiltBlock> {
    const books = await listBooks();
    const titleOf = (bid: string) => bookTitleOf(books, bid);

    if (id === 'userProgress') {
        const rows: RdProgress[] = [];
        for (const b of books) {
            for (const p of await listProgressByBook(b.id)) if (p.ownerId === 'user') rows.push(p);
        }
        const lines = userProgressLines(rows, books);
        if (lines.length === 0) return { content: '', keys: [] };
        return {
            content: `### {user} 自己读到哪了\n${lines.join('\n')}\n（你可以据此判断要不要说一句「我还没追上你，你拉我一把」）`,
            keys: [],
        };
    }

    const roam = await listRoamActivities(charId, 120);

    if (id === 'acts') {
        const lines = actsLines(roam, titleOf);
        if (lines.length === 0) return { content: '', keys: [] };
        return { content: `### 你最近读书的样子\n${lines.join('\n')}`, keys: [] };
    }

    const mine: RdProgress[] = [];
    for (const b of books) {
        for (const p of await listProgressByBook(b.id)) if (p.ownerId === charId) mine.push(p);
    }

    if (id === 'shelf') {
        const lines = shelfLines(mine, books);
        if (lines.length === 0) return { content: '', keys: [] };
        return { content: `### 你手上的书\n${lines.join('\n')}`, keys: [] };
    }

    // book：一本书一块——动态关键词就是书名（提到书名才命中）
    const recent = mine.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 3);
    const parts: string[] = [];
    const keys: string[] = [];
    for (const p of recent) {
        const book = books.find((b) => b.id === p.bookId);
        if (!book) continue;
        const lines = actsLines(roam.filter((a) => a.bookId === p.bookId), titleOf, 5);
        if (lines.length === 0) continue;
        keys.push(book.title);
        parts.push(`《${book.title}》读到 ${Math.round(p.percent)}%：\n${lines.join('\n')}`);
    }
    if (parts.length === 0) return { content: '', keys: [] };
    return { content: `### 你在这些书上的记录\n${parts.join('\n')}`, keys };
}

// ─── 缓存（同步那条路读它） ───────────────────────────────────────

const contentCache = new Map<string, BuiltBlock>();
const cacheKey = (charId: string, id: ReaderMountBlockId) => `${charId}|${id}`;

/** 现读现生成一批内容进缓存。T9 在构建聊天上下文之前 await 它 */
export async function primeReaderMount(charId: string): Promise<void> {
    for (const id of READER_MOUNT_BLOCK_IDS) {
        try {
            contentCache.set(cacheKey(charId, id), await buildBlock(id, charId));
        } catch {
            // 挂载块是旁路：读不出来就当这块没内容，不拦主流程
        }
    }
}

export const cachedReaderMount = (charId: string, id: ReaderMountBlockId): BuiltBlock | undefined =>
    contentCache.get(cacheKey(charId, id));

/** 缓存里的内容装成世界书条目（同步；没 prime 过就是空数组） */
export function readerMountEntriesSync(charId: string): MountedWorldbook[] {
    const out: MountedWorldbook[] = [];
    for (const id of READER_MOUNT_BLOCK_IDS) {
        const block = readerMountBlockOf(charId, id);
        if (!block.enabled) continue;
        const built = cachedReaderMount(charId, id);
        if (!built || !built.content.trim()) continue;
        out.push(toEntry(charId, id, block, built.content, built.keys));
    }
    return out;
}

function toEntry(
    charId: string,
    id: ReaderMountBlockId,
    block: MountBlockConfig,
    content: string,
    dynamicKeys: string[],
): MountedWorldbook {
    return {
        id: `reader-${id}-${charId}`,
        title: READER_MOUNT_BLOCK_LABELS[id],
        content,
        category: '读书',
        key: [...block.key, ...dynamicKeys],
        keysecondary: [...block.keysecondary],
        selective: block.selective,
        selectiveLogic: block.selectiveLogic,
        constant: block.constant,
        order: block.order,
        position: block.position,
        disable: false,
        probability: block.probability,
        useProbability: block.useProbability,
        depth: block.depth,
        role: block.role,
        scanDepth: block.scanDepth,
    };
}

/**
 * 命中测试：把一句可能出现在聊天里的话贴进来，看哪几块会亮。
 * 纯函数本地算（**不烧 token**）；内容用缓存或占位串都行——判定只看关键词那一套。
 */
export function readerMountHit(charId: string, text: string): ReaderMountBlockId[] {
    const hit: ReaderMountBlockId[] = [];
    for (const id of READER_MOUNT_BLOCK_IDS) {
        const block = readerMountBlockOf(charId, id);
        const built = cachedReaderMount(charId, id);
        const entry = toEntry(charId, id, { ...block, useProbability: false }, 'x', built?.keys ?? []);
        if (isWorldbookEntryActive(entry, [{ role: 'user', content: text }])) hit.push(id);
    }
    return hit;
}

// 读书模块 · 设置 store（2026-09-14）
//
// 放 localStorage（小、同步、要即时生效——V8「书架版式切换立刻生效」靠它）。
// 正文/批注/进度那些大件在 IndexedDB，见 utils/reader/readerDb.ts。
// 用 apps/couple/coupleStoreBase 的工厂：订阅/持久化/备份导入重读三件套直接继承。

import { createCoupleStore } from '../couple/coupleStoreBase';

// grid  = 三列封面网格
// list   = 纯文字列表（参考图 List View）
// thumb  = 小封面横向卡片（参考图 Thumb List View）
// detail = 大封面 + 星级 + 大小/格式/时间的详情行（参考图 Detail List View）
export type ShelfLayout = 'grid' | 'list' | 'thumb' | 'detail';
/** 书架排序键（参考图那个 Sort 组） */
export type ShelfSort = 'lastRead' | 'addTime' | 'fileSize' | 'fileName';
export type ReadingMode = 'focus' | 'casual';

export interface ReaderTypography {
    /** 正文/标题用哪套字体（'serif' | 'sans' | 'hand' 或用户上传字体的族名） */
    fontFamily: string;
    /** px */
    fontSize: number;
    lineHeight: number;
    /** 段间距 px */
    paragraphSpacing: number;
    /** 首行缩进 em */
    paragraphIndent: number;
    /** 左右页边距 px */
    margin: number;
}

export interface ReaderPrefs {
    version: number;
    updatedAt: string;
    /** 皮肤 id，见 apps/reader/readerSkinPresets.ts */
    themeId: string;
    typography: ReaderTypography;
    shelfLayout: ShelfLayout;
    /** 排序：最近阅读 / 加入时间 / 文件大小 / 文件名 */
    shelfSort: ShelfSort;
    /** true = 升序（参考图 Ascending / Descending） */
    shelfAsc: boolean;
    /** 书架上按分类分组显示（参考图 Display Categories） */
    shelfGrouped: boolean;
    /** 搜索历史（参考图那排 Search History 胶囊） */
    searchHistory: string[];
    /** 书内搜索的历史（跟书架的搜索分开记，参考图 11 那排胶囊） */
    huntHistory: string[];
    /** 划线颜色：她自己调的一套预设（hex），可增可删——不要那六个死配色了 */
    highlightPalette: string[];
    /** 现在用的那支笔的颜色 */
    highlightColor: string;
    /** 默认共读模式（没单独设过的书用它） */
    readingMode: ReadingMode;
    /** 单书共读模式：bookId → 'focus' | 'casual'（v3 §4.6 的单书设置） */
    bookModes: Record<string, ReadingMode>;
    /** ownerId → 划线样式槽（1..6）。用户与每个角色各自独立配色 */
    highlightStyles: Record<string, number>;
    /** 允许读书的角色（书库页只列开了开关的；V9 的多游标也按这个名单） */
    readingChars: string[];
    /** 皮肤层用户 CSS：全局 + 分页（页 key 用 'shelf' | 'reader' | 'notes' ...） */
    cssGlobal: string;
    cssPages: Record<string, string>;
    /** 上次读的书，回 App 直接接着读 */
    lastBookId?: string;
}

export const DEFAULT_TYPOGRAPHY: ReaderTypography = {
    fontFamily: 'serif',
    fontSize: 17,
    lineHeight: 1.9,
    paragraphSpacing: 12,
    paragraphIndent: 2,
    margin: 22,
};

/** 划线的默认调色盘（她自己调的那套的起点；不想要哪支删掉就行） */
export const DEFAULT_HIGHLIGHT_PALETTE = ['#f2c14e', '#7fc8a9', '#6fb3e0', '#f19cbb', '#b39ddb', '#ffab91'];

export const DEFAULT_PREFS: ReaderPrefs = {
    version: 1,
    updatedAt: new Date().toISOString(),
    themeId: 'paper',
    typography: DEFAULT_TYPOGRAPHY,
    shelfLayout: 'grid',
    shelfSort: 'addTime',
    shelfAsc: false,
    shelfGrouped: false,
    searchHistory: [],
    huntHistory: [],
    highlightPalette: DEFAULT_HIGHLIGHT_PALETTE,
    highlightColor: DEFAULT_HIGHLIGHT_PALETTE[0],
    readingMode: 'focus',
    bookModes: {},
    highlightStyles: { user: 1 },
    readingChars: [],
    cssGlobal: '',
    cssPages: {},
};

const store = createCoupleStore<ReaderPrefs>('reader_prefs_v1', 1, DEFAULT_PREFS, (parsed) => ({
    ...DEFAULT_PREFS,
    ...parsed,
    typography: { ...DEFAULT_TYPOGRAPHY, ...(parsed.typography || {}) },
    highlightStyles: { ...DEFAULT_PREFS.highlightStyles, ...(parsed.highlightStyles || {}) },
    cssPages: { ...(parsed.cssPages || {}) },
    bookModes: { ...(parsed.bookModes || {}) },
}));

export const readerPrefsStore = store;
export const useReaderPrefs = store.use;

export const getReaderPrefs = (): ReaderPrefs => store.get();

export function setTypography(patch: Partial<ReaderTypography>): void {
    store.set((s) => ({ ...s, typography: { ...s.typography, ...patch } }));
}

export function setTheme(themeId: string): void {
    store.set((s) => ({ ...s, themeId }));
}

export function setShelfLayout(shelfLayout: ShelfLayout): void {
    store.set((s) => ({ ...s, shelfLayout }));
}

export function setShelfSort(shelfSort: ShelfSort): void {
    store.set((s) => ({ ...s, shelfSort }));
}

export function setShelfAsc(shelfAsc: boolean): void {
    store.set((s) => ({ ...s, shelfAsc }));
}

export function setShelfGrouped(shelfGrouped: boolean): void {
    store.set((s) => ({ ...s, shelfGrouped }));
}

/** 书内搜索历史：去重、新的在前、最多留 12 条 */
export function pushHuntHistory(word: string): void {
    const w = word.trim();
    if (!w) return;
    store.set((s) => ({ ...s, huntHistory: [w, ...s.huntHistory.filter((x) => x !== w)].slice(0, 12) }));
}

export function clearHuntHistory(): void {
    store.set((s) => ({ ...s, huntHistory: [] }));
}

/** 换一支笔 / 存一支新笔 / 删掉一支笔（调色盘） */
export function setHighlightColor(hex: string): void {
    store.set((s) => ({ ...s, highlightColor: hex }));
}

export function saveHighlightColor(hex: string): void {
    store.set((s) => ({
        ...s,
        highlightColor: hex,
        highlightPalette: s.highlightPalette.includes(hex) ? s.highlightPalette : [...s.highlightPalette, hex],
    }));
}

export function removeHighlightColor(hex: string): void {
    store.set((s) => ({
        ...s,
        highlightPalette: s.highlightPalette.filter((c) => c !== hex),
        highlightColor: s.highlightColor === hex ? (s.highlightPalette.find((c) => c !== hex) ?? s.highlightColor) : s.highlightColor,
    }));
}

/** 搜索历史：去重、新的在前、最多留 12 条。 */
export function pushSearchHistory(word: string): void {
    const w = word.trim();
    if (!w) return;
    store.set((s) => ({ ...s, searchHistory: [w, ...s.searchHistory.filter((x) => x !== w)].slice(0, 12) }));
}

export function clearSearchHistory(): void {
    store.set((s) => ({ ...s, searchHistory: [] }));
}

export function setReadingMode(readingMode: ReadingMode): void {
    store.set((s) => ({ ...s, readingMode }));
}

/** 单书共读模式（书详情的「本书设置」里改，v3 §4.6）。 */
export function setBookMode(bookId: string, mode: ReadingMode): void {
    store.set((s) => ({ ...s, bookModes: { ...s.bookModes, [bookId]: mode } }));
}

/** 这本书的共读模式：没单独设过就落回默认值。 */
export function readingModeFor(prefs: ReaderPrefs, bookId: string): ReadingMode {
    return prefs.bookModes?.[bookId] ?? prefs.readingMode;
}

export function setLastBook(bookId: string | undefined): void {
    store.set((s) => ({ ...s, lastBookId: bookId }));
}

export function setHighlightSlot(ownerId: string, slot: number): void {
    store.set((s) => ({ ...s, highlightStyles: { ...s.highlightStyles, [ownerId]: slot } }));
}

/** 角色读书开关（书库页）。默认关——开了才进书库、才能被喊来共读。 */
export function setReadingChar(charId: string, on: boolean): void {
    store.set((s) => ({
        ...s,
        readingChars: on
            ? Array.from(new Set([...s.readingChars, charId]))
            : s.readingChars.filter((id) => id !== charId),
    }));
}

export function setCssGlobal(cssGlobal: string): void {
    store.set((s) => ({ ...s, cssGlobal }));
}

export function setCssPage(page: string, css: string): void {
    store.set((s) => ({ ...s, cssPages: { ...s.cssPages, [page]: css } }));
}

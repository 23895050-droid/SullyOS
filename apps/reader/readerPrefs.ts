// 读书模块 · 设置 store（2026-09-14）
//
// 放 localStorage（小、同步、要即时生效——V8「书架版式切换立刻生效」靠它）。
// 正文/批注/进度那些大件在 IndexedDB，见 utils/reader/readerDb.ts。
// 用 apps/couple/coupleStoreBase 的工厂：订阅/持久化/备份导入重读三件套直接继承。

import { createCoupleStore } from '../couple/coupleStoreBase';

export type ShelfLayout = 'grid' | 'list';
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
    readingMode: ReadingMode;
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

export const DEFAULT_PREFS: ReaderPrefs = {
    version: 1,
    updatedAt: new Date().toISOString(),
    themeId: 'paper',
    typography: DEFAULT_TYPOGRAPHY,
    shelfLayout: 'grid',
    readingMode: 'focus',
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

export function setReadingMode(readingMode: ReadingMode): void {
    store.set((s) => ({ ...s, readingMode }));
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

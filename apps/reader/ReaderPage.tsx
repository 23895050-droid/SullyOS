// 读书模块 · 阅读页（2026-09-14 立项 / 2026-09-15 UI 轮重写）
//
// 一屏一章：整章渲染进 .rd-reader-flow，翻页 = translateY（不是重新挂载文本）。
// 页表由 utils/reader/paginate 量行矩形算出；锚点只认 (段号, 段内偏移)——
// 所以换字号/转屏/重排之后，你还在原来的位置（V7）。
//
// 「当前页正文」这个数据口（V1 要喂给角色的东西）就是切片：point 在 currentSlicesRef，
// 第二批的划线/讨论与共读上下文都从这里取，不重算第二套。
//
// ⚠️ 视觉可以整块换，下面这些**逻辑钩子不许动**（踩过坑，见 1a0fa52c）：
//   · useLayoutEffect 量页（量完**同步**记 lastAnchorRef）
//   · ResizeObserver 只建一次（deps []，回调先比尺寸——observe() 会立刻回调一次）
//   · pendingRef 跨章落页 / flushProgress（防抖 + pagehide/visibilitychange/卸载立刻写）
//
// 参考图版式：顶栏（返回 + 章节名 + 功能键）／纸面正文／底栏三行
//（阅读时长·剩余 → 进度滑轨 → 工具排：目录 / A- / 亮度 / A+ / 主题 / 更多）。

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft, CaretLeft, CaretRight, DotsThree, Lightbulb, ListBullets, TShirt,
} from '@phosphor-icons/react';
import { getBook, getChapter, getProgress, putProgress, type RdBook, type RdChapter, type RdProgress } from '../../utils/reader/readerDb';
import {
    pageForAnchor, paginateFlow, slicesForPage, type PageSlice, type RdPageBox,
} from '../../utils/reader/paginate';
import {
    DEFAULT_TYPOGRAPHY, readingModeFor, setBookMode, setHighlightSlot, setTheme, setTypography, useReaderPrefs,
} from './readerPrefs';
import { HIGHLIGHT_SLOTS, READER_SKINS } from './readerSkinPresets';
import { recordReading } from '../../utils/reader/readerStats';

const SAVE_DEBOUNCE = 900;
/** 估「还要读多久」用的速度（字/秒）——按每分钟 400 字算 */
const CHARS_PER_SEC = 400 / 60;

interface Props {
    bookId: string;
    notify: (msg: string) => void;
    onOpenDetails: (bookId: string) => void;
    onOpenStats: () => void;
    onBack: () => void;
}

/** 秒 → 「3 小时 10 分」这种人话 */
function fmtDuration(sec: number): string {
    const s = Math.max(0, Math.round(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h} 小时 ${m} 分`;
    if (m > 0) return `${m} 分 ${s % 60} 秒`;
    return `${s} 秒`;
}

type Sheet = null | 'toc' | 'more' | 'book' | 'hl' | 'bright';
/** 底栏里那两个「从工具排上面升起来」的面板（参考图：排版面板 / 主题面板） */
type Panel = null | 'style' | 'theme';

/** 翻页模式（参考图里那条分段）。现在真正能用的是横滑，其余先占位。 */
const FLIP_MODES: Array<{ key: string; label: string; ready: boolean }> = [
    { key: 'curl', label: '仿真翻页', ready: false },
    { key: 'slide', label: '横滑', ready: true },
    { key: 'vertical', label: '竖滑', ready: false },
    { key: 'scroll', label: '滚动', ready: false },
];

/** 主题面板的三个页签（参考图那条 Colors / Textures / Custom） */
const THEME_TABS: Array<{ key: 'color' | 'texture' | 'custom'; label: string }> = [
    { key: 'color', label: '纯色' },
    { key: 'texture', label: '纸纹' },
    { key: 'custom', label: '自定义' },
];

/** 排版面板里的滑杆：圆角轨 + 已读段 + 写着数值的圆把手（原生 range 做不出参考图那个把手） */
function OptSlider({ label, min, max, step, value, onChange, fmt }: {
    label: string;
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (v: number) => void;
    fmt?: (v: number) => string;
}) {
    const trackRef = useRef<HTMLDivElement>(null);
    const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
    const pick = (clientX: number) => {
        const el = trackRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const snapped = Math.round((min + t * (max - min)) / step) * step;
        onChange(Math.max(min, Math.min(max, Math.round(snapped * 100) / 100)));
    };
    return (
        <div className="rd-opt">
            <span className="rd-opt-label">{label}</span>
            <div
                className="rd-range"
                ref={trackRef}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e.clientX); }}
                onPointerMove={(e) => { if (e.buttons) pick(e.clientX); }}
            >
                <div className="rd-range-track" />
                <div className="rd-range-fill" style={{ width: `${pct}%` }} />
                <div className="rd-range-knob" style={{ left: `${pct}%` }}>{fmt ? fmt(value) : value}</div>
            </div>
        </div>
    );
}

export default function ReaderPage({ bookId, notify, onOpenDetails, onOpenStats, onBack }: Props) {
    const prefs = useReaderPrefs();
    const [book, setBook] = useState<RdBook | null>(null);
    const [chapter, setChapter] = useState<RdChapter | null>(null);
    const [chapterIdx, setChapterIdx] = useState(0);
    const [pages, setPages] = useState<RdPageBox[]>([]);
    const [pageIdx, setPageIdx] = useState(0);
    const [sheet, setSheet] = useState<Sheet>(null);
    const [panel, setPanel] = useState<Panel>(null);
    /** 主题面板的分组页签（参考图那条 Colors / Textures / Custom） */
    const [themeGroup, setThemeGroup] = useState<'color' | 'texture' | 'custom'>('color');
    const [error, setError] = useState<string | null>(null);
    const [layoutNonce, setLayoutNonce] = useState(0);
    const [brightness, setBrightness] = useState(0);
    /** 沉浸：点屏幕中间把上下栏藏起来 */
    const [chromeOff, setChromeOff] = useState(false);
    /** 只为了让「阅读时长」每 20 秒自己走一格（值本身不用，读 Date.now 现算） */
    const [, setTick] = useState(0);

    const viewportRef = useRef<HTMLDivElement>(null);
    const flowRef = useRef<HTMLDivElement>(null);
    /** 章节切换后要落在哪一页（页码或锚点） */
    const pendingRef = useRef<{ page?: number; anchor?: { paraIdx: number; charOffset: number } } | null>(null);
    /** 当前页覆盖的文本切片（V1 的数据口） */
    const currentSlicesRef = useRef<PageSlice[]>([]);
    /** 上一页的锚点：重排（字体就绪/转屏）时用它回位，别跳回第一页 */
    const lastAnchorRef = useRef<{ paraIdx: number; charOffset: number } | null>(null);
    /** 待落盘的进度（防抖写入，离开页面时立刻写掉——退出去不能丢） */
    const pendingSaveRef = useRef<RdProgress | null>(null);
    const sessionStartRef = useRef(Date.now());
    const baseSecondsRef = useRef(0);
    const sessionCountRef = useRef(1);
    const saveTimerRef = useRef<number | null>(null);
    const touchRef = useRef<{ x: number; y: number; t: number; locked: boolean } | null>(null);
    const restoringRef = useRef(true);

    // ── 打开书：读书目 + 恢复进度 ──
    useEffect(() => {
        let alive = true;
        void (async () => {
            const b = await getBook(bookId);
            if (!alive) return;
            if (!b) { setError('这本书不见了'); return; }
            setBook(b);
            const prog = await getProgress(bookId, 'user');
            // 本次阅读时长从打开这一页开始算（别拿「上次的秒数 + 固定值」糊弄）
            sessionStartRef.current = Date.now();
            baseSecondsRef.current = prog?.readingSeconds ?? 0;
            sessionCountRef.current = (prog?.sessionCount ?? 0) + 1;
            const startChapter = prog?.chapterIdx ?? 0;
            setChapterIdx(Math.max(0, Math.min(startChapter, Math.max(0, b.chapterCount - 1))));
            if (prog) pendingRef.current = { anchor: { paraIdx: prog.paraIdx, charOffset: prog.charOffset } };
            else pendingRef.current = { page: 0 };
        })();
        return () => { alive = false; };
    }, [bookId]);

    // ── 章节加载 ──
    useEffect(() => {
        let alive = true;
        void (async () => {
            const ch = await getChapter(bookId, chapterIdx);
            if (!alive) return;
            if (!ch) { setError('这一章读不出来'); return; }
            setChapter(ch);
        })();
        return () => { alive = false; };
    }, [bookId, chapterIdx]);

    // ── 量页（章节/排版变化后重算，并落到该落的页）──
    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        const flow = flowRef.current;
        if (!chapter || !viewport || !flow) return;
        const height = viewport.clientHeight;
        if (height < 40) return;                       // 布局还没铺开，等下一次
        const next = paginateFlow(flow, height);
        if (next.length === 0) { setPages([]); return; }
        setPages(next);
        const pending = pendingRef.current;
        let idx = 0;
        if (pending?.anchor) idx = pageForAnchor(flow, next, pending.anchor.paraIdx, pending.anchor.charOffset);
        else if (typeof pending?.page === 'number') idx = Math.max(0, Math.min(pending.page, next.length - 1));
        else if (lastAnchorRef.current) {
            // 没有明确目标（比如字体就绪后补量）：回到「刚才读的那一页」，不是第一页
            idx = pageForAnchor(flow, next, lastAnchorRef.current.paraIdx, lastAnchorRef.current.charOffset);
        } else {
            // 连锚点都没有：至少留在当前页码，绝不跳回第一页
            idx = Math.max(0, Math.min(pageIdx, next.length - 1));
        }
        pendingRef.current = null;
        // 量完立刻把「这一页的锚点」记下来——后面任何一次补量（字体/转屏）都靠它回位，
        // 不能等副作用跑完再记（那中间的补量会拿到 null 而跳回第一页）
        const firstSlice = slicesForPage(flow, next[idx], height)[0];
        lastAnchorRef.current = firstSlice
            ? { paraIdx: firstSlice.paraIdx, charOffset: firstSlice.startOffset }
            : null;
        setPageIdx(idx);
        restoringRef.current = false;
    }, [chapter, prefs.typography, layoutNonce]);

    // 字体就绪后补量一次：首量可能发生在字体替换之前（行盒高度会变，页数跟着变）
    useEffect(() => {
        let cancelled = false;
        const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
        if (fonts?.ready) {
            void fonts.ready.then(() => { if (!cancelled) setLayoutNonce((n) => n + 1); }).catch(() => { /* 老浏览器没有 fonts API */ });
        }
        return () => { cancelled = true; };
    }, [chapter]);

    // ── 视口变化（转屏/键盘）：保住位置再重排 ──
    const anchorOfCurrentPage = useCallback((): { paraIdx: number; charOffset: number } | null => {
        const flow = flowRef.current;
        const viewport = viewportRef.current;
        const page = pages[pageIdx];
        if (!flow || !viewport || !page) return null;
        const slices = slicesForPage(flow, page, viewport.clientHeight);
        currentSlicesRef.current = slices;
        const first = slices[0];
        return first ? { paraIdx: first.paraIdx, charOffset: first.startOffset } : null;
    }, [pages, pageIdx]);

    /** 给观察器用的「当前页锚点」取值口：ref 保持最新，观察器就不用随翻页重建。 */
    const anchorGetterRef = useRef(anchorOfCurrentPage);
    useEffect(() => { anchorGetterRef.current = anchorOfCurrentPage; }, [anchorOfCurrentPage]);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport || typeof ResizeObserver === 'undefined') return;
        let timer: number | null = null;
        // 只在**尺寸真的变了**时重排：ResizeObserver 每次 observe() 都会立刻回调一次，
        // 如果照单全收就会「重排 → 页数组换新 → 观察器重建 → 又立刻回调」转成死循环
        // （页面一直重渲染，进度保存的防抖也被无限重置）。
        let lastH = viewport.clientHeight;
        let lastW = viewport.clientWidth;
        const ro = new ResizeObserver(() => {
            const h = viewport.clientHeight;
            const w = viewport.clientWidth;
            if (h === lastH && w === lastW) return;
            lastH = h;
            lastW = w;
            if (timer) window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                const anchor = anchorGetterRef.current();
                if (anchor) pendingRef.current = { anchor };
                setLayoutNonce((n) => n + 1);
            }, 150);
        });
        ro.observe(viewport);
        return () => { if (timer) window.clearTimeout(timer); ro.disconnect(); };
    }, []);

    // 阅读时长自己走；顺手把这一段记进阅读流水（统计页的「每天读多久」靠它）
    useEffect(() => {
        let last = Date.now();
        const flushTick = () => {
            const now = Date.now();
            const sec = Math.round((now - last) / 1000);
            if (sec > 0) recordReading({ sec });
            last = now;
        };
        const t = window.setInterval(() => { flushTick(); setTick((n) => n + 1); }, 20000);
        window.addEventListener('pagehide', flushTick);
        return () => {
            window.clearInterval(t);
            window.removeEventListener('pagehide', flushTick);
            flushTick();          // 走之前把没满 20 秒的那一截也记上
        };
    }, []);

    // ── 翻页 + 进度存 ──
    /** 这一页有多少字（切片就是段落区间，把区间长度加起来） */
    const pageChars = useCallback(
        () => currentSlicesRef.current.reduce((n, sl) => n + Math.max(0, sl.endOffset - sl.startOffset), 0),
        [],
    );

    const goPage = useCallback((delta: number) => {
        if (pages.length === 0) return;
        recordReading({ pages: 1, chars: pageChars() });   // 翻过去 = 刚把这一页读完
        const next = pageIdx + delta;
        if (next >= 0 && next < pages.length) { setPageIdx(next); return; }
        // 跨章
        if (!book) return;
        const nextChapter = chapterIdx + delta;
        if (nextChapter < 0 || nextChapter >= book.chapterCount) return;
        pendingRef.current = delta > 0 ? { page: 0 } : { page: Number.MAX_SAFE_INTEGER };
        setChapterIdx(nextChapter);
    }, [pages.length, pageIdx, book, chapterIdx, pageChars]);

    /** 全书进度：章节位置 + 章内页位置（页面上那两个百分比与存档都用它） */
    const bookPercent = useCallback((chIdx: number, pgIdx: number, pageCount: number, chapterCount: number) => {
        if (chapterCount <= 0) return 0;
        const span = 100 / chapterCount;
        return Math.round((chIdx * span + ((pgIdx + 1) / Math.max(1, pageCount)) * span) * 10) / 10;
    }, []);

    /** 把待落盘的进度写掉（幂等：写完就清空）。 */
    const flushProgress = useCallback(async () => {
        const payload = pendingSaveRef.current;
        if (!payload) return;
        pendingSaveRef.current = null;
        try { await putProgress(payload); } catch { /* 落盘失败不打断阅读 */ }
    }, []);

    useEffect(() => {
        if (!book || !chapter || pages.length === 0) return;
        const anchor = anchorOfCurrentPage();
        if (anchor) lastAnchorRef.current = anchor;
        const percent = bookPercent(chapterIdx, pageIdx, pages.length, book.chapterCount);
        const elapsed = Math.round((Date.now() - sessionStartRef.current) / 1000);
        pendingSaveRef.current = {
            bookId: book.id,
            ownerId: 'user',
            chapterIdx,
            paraIdx: anchor?.paraIdx ?? 0,
            charOffset: anchor?.charOffset ?? 0,
            percent,
            readingSeconds: baseSecondsRef.current + elapsed,
            sessionCount: sessionCountRef.current,
            updatedAt: new Date().toISOString(),
        };
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => { void flushProgress(); }, SAVE_DEBOUNCE);
        return () => { if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current); };
    }, [pageIdx, chapterIdx, pages.length, book, chapter, anchorOfCurrentPage, flushProgress, bookPercent]);

    // 退出书房 / 切后台 / 组件卸载：立刻落盘（只靠防抖的话，退出去那次就丢了）
    useEffect(() => {
        const onHide = () => { void flushProgress(); };
        window.addEventListener('pagehide', onHide);
        document.addEventListener('visibilitychange', onHide);
        return () => {
            window.removeEventListener('pagehide', onHide);
            document.removeEventListener('visibilitychange', onHide);
            void flushProgress();
        };
    }, [flushProgress]);

    // ── 触摸：左右滑翻页（纵向不管） ──
    const onTouchStart = (e: React.TouchEvent) => {
        const t = e.touches[0];
        touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now(), locked: false };
    };
    const onTouchMove = (e: React.TouchEvent) => {
        const start = touchRef.current;
        if (!start || start.locked) return;
        const t = e.touches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) start.locked = true;   // 纵向 = 别的意图
    };
    const onTouchEnd = (e: React.TouchEvent) => {
        const start = touchRef.current;
        touchRef.current = null;
        if (!start || start.locked) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const dt = Date.now() - start.t;
        const w = viewportRef.current?.clientWidth ?? 380;
        const far = Math.abs(dx) > w * 0.18;
        const flick = dt < 300 && Math.abs(dx) > w * 0.07;
        if (far || flick) { setPanel(null); goPage(dx < 0 ? 1 : -1); }
    };

    const atEnd = book ? chapterIdx >= book.chapterCount - 1 && pageIdx >= pages.length - 1 : false;
    const top = pages[pageIdx]?.top ?? 0;
    const percent = book ? bookPercent(chapterIdx, pageIdx, pages.length, book.chapterCount) : 0;
    const elapsedTotal = baseSecondsRef.current + Math.round((Date.now() - sessionStartRef.current) / 1000);
    const remainSec = book
        ? Math.max(0, (book.totalChars * (1 - percent / 100)) / CHARS_PER_SEC)
        : 0;
    const bookMode = readingModeFor(prefs, bookId);
    const mySlot = prefs.highlightStyles.user ?? 1;

    const jumpChapter = (idx: number) => {
        if (idx !== chapterIdx) recordReading({ pages: 1, chars: pageChars() });
        pendingRef.current = { page: 0 };
        setChapterIdx(idx);
        setSheet(null);
    };

    /** 滑轨：按全书比例跳到那一章（章节内从头开始） */
    const scrubTo = (ratio: number) => {
        if (!book || book.chapterCount <= 0) return;
        const idx = Math.max(0, Math.min(book.chapterCount - 1, Math.floor(ratio * book.chapterCount)));
        if (idx === chapterIdx) return;
        jumpChapter(idx);
    };

    const moreItems: Array<{ key: string; label: string; on: boolean; run: () => void }> = useMemo(() => [
        { key: 'read', label: '听书', on: false, run: () => notify('听书还没做，先欠着') },
        { key: 'auto', label: '自动翻页', on: false, run: () => notify('自动翻页还没做，先欠着') },
        { key: 'stat', label: '统计', on: true, run: () => { setSheet(null); onOpenStats(); } },
        { key: 'share', label: '分享', on: false, run: () => notify('转发卡片在第三批，先欠着') },
        { key: 'detail', label: '书本详情', on: true, run: () => { setSheet(null); onOpenDetails(bookId); } },
        { key: 'book', label: '本书设置', on: true, run: () => setSheet('book') },
        { key: 'hl', label: '划线设置', on: true, run: () => setSheet('hl') },
        { key: 'style', label: '排版设置', on: true, run: () => { setSheet(null); setPanel('style'); } },
        { key: 'theme', label: '背景主题', on: true, run: () => { setSheet(null); setPanel('theme'); } },
    ], [notify, onOpenDetails, onOpenStats, bookId]);

    if (error) {
        return (
            <div className="rd-reader">
                <div className="rd-reader-bar">
                    <button className="rd-icon-btn" onClick={onBack} aria-label="返回"><ArrowLeft size={18} /></button>
                    <div className="rd-reader-bar-title">{error}</div>
                </div>
                <div className="rd-empty">
                    <div className="rd-empty-text">{error}</div>
                    <button className="rd-btn rd-btn-primary" onClick={onBack}>回书架</button>
                </div>
            </div>
        );
    }

    return (
        <div className="rd-reader" data-rd-page="reader">
            {!chromeOff && (
                <div className="rd-reader-bar">
                    <button className="rd-icon-btn" onClick={onBack} aria-label="返回"><ArrowLeft size={18} /></button>
                    <div className="rd-reader-bar-title">
                        {book ? `${book.title} · 第 ${chapterIdx + 1} / ${book.chapterCount} 章` : '…'}
                    </div>
                    {/* 字号那格已经挪到底栏（A- / A+ 和排版面板里的滑杆），顶栏只留目录和更多 */}
                    <div className="rd-reader-bar-tools">
                        <button className="rd-icon-btn" onClick={() => { setPanel(null); setSheet('toc'); }} aria-label="目录"><ListBullets size={19} /></button>
                        <button className="rd-icon-btn" onClick={() => { setPanel(null); setSheet('more'); }} aria-label="更多"><DotsThree size={20} /></button>
                    </div>
                </div>
            )}

            <div
                className="rd-reader-viewport"
                ref={viewportRef}
                onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = (e.clientX - rect.left) / rect.width;
                    if (ratio < 0.3) { setPanel(null); goPage(-1); }
                    else if (ratio > 0.7) { setPanel(null); goPage(1); }
                    else if (panel) setPanel(null);          // 面板开着：点中间先收面板
                    else setChromeOff((v) => !v);
                }}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                <div className="rd-reader-clip" style={{ height: pages[pageIdx]?.height ?? '100%' }}>
                    <div
                        className="rd-reader-flow"
                        ref={flowRef}
                        style={{ transform: `translateY(${-top}px)`, transition: restoringRef.current ? 'none' : undefined }}
                    >
                        {/* 章标题自己就写着「第一章 启航」的时候不再重复一行 kicker */}
                        {chapter && !/^第\s*[0-9一二三四五六七八九十百零]+\s*[章卷回节篇]/.test(chapter.title.trim()) && (
                            <div className="rd-reader-kicker">第 {chapterIdx + 1} 章</div>
                        )}
                        {chapter && <div className="rd-reader-chapter">{chapter.title}</div>}
                        {chapter?.paras.map((p, i) => (
                            <p className="rd-para" key={i} data-para-idx={i}>{p}</p>
                        ))}
                    </div>
                </div>
                <div className="rd-reader-veil" style={{ opacity: brightness }} />
            </div>

            {atEnd && !chromeOff && (
                <div className="rd-reader-stat" style={{ justifyContent: 'center', padding: '6px 0 0' }}>
                    这本书读完了{book?.totalChars ? ` · ${Math.round(book.totalChars / 1000)} 千字` : ''}
                </div>
            )}

            {!chromeOff && (
                <div className="rd-reader-foot">
                    {/* 面板开着的时候顶掉进度那两行（参考图就是这样：面板占了它们的位置） */}
                    {panel === null && (
                        <>
                            <div className="rd-reader-stat">
                                <span>阅读时长 {fmtDuration(elapsedTotal)}</span>
                                <span>剩余 {fmtDuration(remainSec)}</span>
                            </div>

                            <div className="rd-reader-slider">
                                <button className="rd-slider-nav" onClick={() => goPage(-1)} aria-label="上一页"><CaretLeft size={15} /></button>
                                <div
                                    className="rd-slider-track"
                                    onClick={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        scrubTo((e.clientX - rect.left) / rect.width);
                                    }}
                                >
                                    <div className="rd-slider-rail"><div className="rd-slider-fill" style={{ width: `${percent}%` }} /></div>
                                    <div className="rd-slider-knob" style={{ left: `${percent}%` }} />
                                </div>
                                <button className="rd-slider-nav" onClick={() => goPage(1)} aria-label="下一页"><CaretRight size={15} /></button>
                            </div>
                        </>
                    )}

                    {/* ── 排版面板（参考图 1：字体 / 字号 / 页边距 / 行距 / 翻页模式） ── */}
                    {panel === 'style' && (
                        <div className="rd-reader-panel">
                            <div className="rd-opt">
                                <span className="rd-opt-label">字体</span>
                                <button
                                    className="rd-opt-value"
                                    onClick={() => setTypography({ fontFamily: prefs.typography.fontFamily === 'sans' ? 'serif' : 'sans' })}
                                >
                                    {prefs.typography.fontFamily === 'sans' ? '黑体' : '衬线体'}
                                    <span className="rd-item-chev">›</span>
                                </button>
                            </div>
                            <OptSlider label="字号" min={13} max={26} step={1} value={prefs.typography.fontSize} onChange={(v) => setTypography({ fontSize: v })} />
                            <OptSlider label="页边距" min={10} max={44} step={2} value={prefs.typography.margin} onChange={(v) => setTypography({ margin: v })} />
                            <OptSlider label="行距" min={1.3} max={2.6} step={0.1} value={prefs.typography.lineHeight} onChange={(v) => setTypography({ lineHeight: v })} fmt={(v) => v.toFixed(1)} />
                            <OptSlider label="段间距" min={0} max={28} step={2} value={prefs.typography.paragraphSpacing} onChange={(v) => setTypography({ paragraphSpacing: v })} />
                            <div className="rd-opt" style={{ marginBottom: 0 }}>
                                <span className="rd-opt-label">翻页</span>
                                <div className="rd-opt-seg" style={{ flex: '1 1 auto' }}>
                                    {FLIP_MODES.map((m) => (
                                        <button
                                            key={m.key}
                                            className={`rd-opt-seg-btn${m.ready ? ' rd-opt-seg-on' : ''}`}
                                            onClick={() => { if (!m.ready) notify('这个翻页方式还没做，先欠着'); }}
                                        >
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── 主题面板（参考图 6：纯色 / 纸纹 / 自定义 + 色卡网格） ── */}
                    {panel === 'theme' && (
                        <div className="rd-reader-panel">
                            <div className="rd-opt">
                                <div className="rd-opt-seg" style={{ flex: '1 1 auto' }}>
                                    {THEME_TABS.map((t) => (
                                        <button
                                            key={t.key}
                                            className={`rd-opt-seg-btn${themeGroup === t.key ? ' rd-opt-seg-on' : ''}`}
                                            onClick={() => setThemeGroup(t.key)}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {themeGroup === 'custom' ? (
                                <div className="rd-muted">
                                    自定义皮肤写在「设置 → 自定义 CSS」里。那边的规则排在这些之上，同权重直接覆盖，不用 !important。
                                </div>
                            ) : (
                                <div className="rd-theme-grid">
                                    {READER_SKINS.filter((s) => (s.group ?? 'color') === themeGroup).map((s) => (
                                        <button
                                            key={s.id}
                                            className={`rd-theme-card${prefs.themeId === s.id ? ' rd-theme-card-on' : ''}`}
                                            onClick={() => setTheme(s.id)}
                                            style={{ background: s.vars['--rd-paper'], color: s.vars['--rd-ink'] }}
                                        >
                                            {s.label}
                                            {prefs.themeId === s.id && <span className="rd-theme-check">✓</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="rd-reader-tools">
                        <button className="rd-tool" onClick={() => { setPanel(null); setSheet('toc'); }}><ListBullets size={19} /></button>
                        <button className="rd-tool" onClick={() => setTypography({ fontSize: prefs.typography.fontSize - 1 })}>A-</button>
                        <button className={`rd-tool${brightness > 0 ? ' rd-tool-on' : ''}`} onClick={() => setSheet('bright')}><Lightbulb size={19} /></button>
                        <button className="rd-tool" onClick={() => setTypography({ fontSize: prefs.typography.fontSize + 1 })}>A+</button>
                        <button className={`rd-tool${panel === 'theme' ? ' rd-tool-on' : ''}`} onClick={() => setPanel(panel === 'theme' ? null : 'theme')}><TShirt size={19} /></button>
                        <button className="rd-tool" onClick={() => { setPanel(null); setSheet('more'); }}><DotsThree size={20} /></button>
                    </div>
                </div>
            )}

            {/* ── 目录 ── */}
            {sheet === 'toc' && book && (
                <div className="rd-sheet-mask" onClick={() => setSheet(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">目录</div>
                        {book.toc.length === 0 && <div className="rd-muted">这本书没有目录</div>}
                        <div className="rd-card rd-card-flush">
                            <div className="rd-list">
                                {book.toc.map((item) => (
                                    <button key={`${item.chapterIdx}-${item.title}`} className="rd-item" onClick={() => jumpChapter(item.chapterIdx)}>
                                        <span className="rd-item-label" style={{ fontWeight: item.chapterIdx === chapterIdx ? 600 : undefined }}>
                                            {item.title}
                                        </span>
                                        {item.chapterIdx === chapterIdx && <span className="rd-item-value">在读</span>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 亮度（只压一层黑，不动系统亮度） ── */}
            {sheet === 'bright' && (
                <div className="rd-sheet-mask" onClick={() => setSheet(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">亮度</div>
                        <div className="rd-row">
                            <span className="rd-row-label">调暗</span>
                            <span className="rd-item-value">{Math.round(brightness * 100)}%</span>
                        </div>
                        <input className="rd-slider" type="range" min={0} max={0.6} step={0.05} value={brightness}
                            onChange={(e) => setBrightness(Number(e.target.value))} />
                        <div className="rd-muted">夜里把纸面压暗一点，不跟着系统走。</div>
                    </div>
                </div>
            )}

            {/* ── 本书设置（单书设置，v3 §4.6：共读模式在这里，不在大设置页） ── */}
            {sheet === 'book' && (
                <div className="rd-sheet-mask" onClick={() => setSheet(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">本书设置</div>
                        <div className="rd-muted" style={{ marginBottom: 'var(--rd-space-3)' }}>{book?.title}</div>

                        <div className="rd-row-label" style={{ marginBottom: 'var(--rd-space-2)' }}>共读模式（只对这本书）</div>
                        <div className="rd-btn-row" style={{ marginBottom: 'var(--rd-space-2)' }}>
                            <button className={bookMode === 'focus' ? 'rd-btn rd-btn-primary' : 'rd-btn'} onClick={() => setBookMode(bookId, 'focus')}>专注</button>
                            <button className={bookMode === 'casual' ? 'rd-btn rd-btn-primary' : 'rd-btn'} onClick={() => setBookMode(bookId, 'casual')}>随心</button>
                        </div>
                        <div className="rd-muted">
                            专注：上下文以当前页正文为主，只带这本书最近几条批注；<br />
                            随心：保留正常聊天上下文，读书只是其中一件事。
                        </div>
                    </div>
                </div>
            )}

            {/* ── 划线配色（自己一个槽，每个角色各一个） ── */}
            {sheet === 'hl' && (
                <div className="rd-sheet-mask" onClick={() => setSheet(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">划线配色</div>
                        <div className="rd-row" style={{ marginBottom: 'var(--rd-space-3)' }}>
                            <span className="rd-row-label">我</span>
                            <div className="rd-btn-row">
                                {HIGHLIGHT_SLOTS.map((s) => (
                                    <button
                                        key={s.slot}
                                        aria-label={s.label}
                                        className={`rd-swatch${mySlot === s.slot ? ' rd-swatch-on' : ''}`}
                                        onClick={() => setHighlightSlot('user', s.slot)}
                                        style={{ background: `rgb(var(--rd-hl-${s.slot}-rgb))` }}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="rd-muted">角色的槽位跟着书库页的开关走，第二批接上。</div>
                    </div>
                </div>
            )}

            {/* ── 更多（参考图里那排胶囊） ── */}
            {sheet === 'more' && (
                <div className="rd-sheet-mask" onClick={() => setSheet(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">更多</div>
                        <div className="rd-pill-grid">
                            {moreItems.map((it) => (
                                <button
                                    key={it.key}
                                    className={`rd-pill${it.on ? '' : ' rd-pill-off'}`}
                                    onClick={it.run}
                                >
                                    {it.label}{!it.on && <span className="rd-pill-tag">待做</span>}
                                </button>
                            ))}
                        </div>
                        <div className="rd-muted" style={{ marginTop: 'var(--rd-space-4)' }}>
                            当前第 {pageIdx + 1} / {pages.length} 页 · 全书 {percent}%
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

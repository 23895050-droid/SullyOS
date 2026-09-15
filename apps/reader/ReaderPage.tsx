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
    ArrowLeft, BookmarkSimple, CaretLeft, CaretRight, ChatCircleDots, Copy, DotsThree, Highlighter,
    Lightbulb, ListBullets, MagnifyingGlass, Palette, PencilSimple, ShareNetwork, TShirt, Trash, X,
} from '@phosphor-icons/react';
import { isImagePara } from '../../utils/reader/importEpub';
import {
    deleteAnnotation, getBook, getChapter, getProgress, listAnnotations, listChapters, putAnnotation,
    putProgress, type RdAnchor, type RdAnnotation, type RdBook, type RdChapter, type RdProgress,
} from '../../utils/reader/readerDb';
import ReaderCover from './ReaderCover';
import {
    columnCountOf, columnOfAnchor, flowOrigin, slicesForColumn, type PageSlice,
} from '../../utils/reader/paginate';
import {
    clearHuntHistory, DEFAULT_TYPOGRAPHY, highlightColorOf, pushHuntHistory, readingModeFor,
    setBookMode, setTheme, setTypography, useReaderPrefs,
} from './readerPrefs';
import HighlightColorSheet from './HighlightColorSheet';
import { hexTriple, READER_SKINS } from './readerSkinPresets';
import { useBlobRefUrl } from '../../utils/blobRef';
import { recordReading } from '../../utils/reader/readerStats';
import { copyToClipboard } from '../../utils/clipboard';

/** 两条锚点是不是压着同一段文字（选中即划线时防重复划线用）。 */
function anchorsOverlap(a: RdAnchor, b: RdAnchor): boolean {
    const start = (x: RdAnchor) => x.startPara * 1e6 + x.startOffset;
    const end = (x: RdAnchor) => x.endPara * 1e6 + x.endOffset;
    return start(a) < end(b) && start(b) < end(a);
}

/** 正文里每个段落是一个 `[data-para-idx]` 的 <p>，里面只有一个文本节点——
    选区/点击落点都能顺着它换回「段号 + 段内偏移」（我们的锚点只认这两个数）。 */
function paraAt(flow: HTMLElement | null, node: Node | null): { el: HTMLElement; idx: number } | null {
    let el: HTMLElement | null = node instanceof HTMLElement ? node : (node?.parentElement ?? null);
    while (el && el.dataset.paraIdx === undefined) el = el.parentElement;
    if (!el || !flow || !flow.contains(el)) return null;
    return { el, idx: Number(el.dataset.paraIdx) };
}

/** 浏览器选区 → 我们的锚点（跨段也认：只记首尾两段 + 段内偏移）。 */
function anchorFromRange(flow: HTMLElement, range: Range): RdAnchor | null {
    const a = paraAt(flow, range.startContainer);
    const b = paraAt(flow, range.endContainer);
    if (!a || !b) return null;
    const text = range.toString().replace(/\s+/g, ' ').trim();
    if (!text) return null;
    const [startPara, startOffset, endPara, endOffset] = a.idx < b.idx || (a.idx === b.idx && range.startOffset <= range.endOffset)
        ? [a.idx, range.startOffset, b.idx, range.endOffset]
        : [b.idx, range.endOffset, a.idx, range.startOffset];
    return { startPara, startOffset, endPara, endOffset, text: text.slice(0, 200) };
}

/** 插图占位段：`\u0000IMG:<blobref 令牌或编号>\u0000`（见 utils/reader/importEpub）。 */
const imgRefOf = (text: string): string => text.replace(/^\u0000IMG:/, '').replace(/\u0000$/, '');

/** 书里的插图（EPUB）。没有令牌/还没解析出来就先不画，别留个破图。 */
function ReaderFigure({ refText }: { refText: string }) {
    const url = useBlobRefUrl(imgRefOf(refText));
    if (!url) return null;
    return <img className="rd-figure" src={url} alt="" loading="lazy" />;
}

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

/** 秒 → 「3 小时 10 分」这种人话。
    满一分钟就不报秒了——计时器被人盯着的时候数字一秒一跳很吵（她 2026-09-15 说的）。 */
function fmtDuration(sec: number): string {
    const s = Math.max(0, Math.round(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h} 小时 ${m} 分`;
    if (m > 0) return `${m} 分`;
    return `${s} 秒`;
}

type Sheet = null | 'toc' | 'more' | 'book' | 'hl' | 'bright' | 'hunt';
/** 目录面板里的三个页签（参考图「左下一展开」：Chapters / Notes / Bookmarks） */
type TocTab = 'chapters' | 'notes' | 'bookmarks';

/** 书内搜索的一条命中 */
interface HuntHit {
    /** 第几章 */
    ci: number;
    /** 章里第几段 */
    pi: number;
    /** 段内第几个字 */
    off: number;
    text: string;
    /** 全书百分比（面板上显示的那个） */
    pct: number;
}

/** 上下栏的本体高度 + 正文的上下标准边距（跟骨架层里的 --rd-bar-h / --rd-foot-h /
    --rd-page-top / --rd-page-bottom 一一对应，改一处要改两处） */
const PAGE_TOP = 10;
/** 页眉（小章节名）那行占的高度 + 它和正文之间的空 */
const PAGE_HEAD = 32;
const PAGE_BOTTOM = 54;


/** 本模块的 id 生成：不用 crypto.randomUUID（手机走 http 时它是 undefined，踩过） */
const uid = (): string => `an_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const fmtWords = (chars: number) => (chars >= 10000 ? `${(chars / 10000).toFixed(1)} 万字` : `${chars} 字`);
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

/** 搜索结果里那条摘录：命中处前后各截一段，命中的字上底色（参考图 4） */
function Excerpt({ text, at, len }: { text: string; at: number; len: number }) {
    const from = Math.max(0, at - 20);
    const to = Math.min(text.length, at + len + 44);
    return (
        <div className="rd-toc-quote">
            {from > 0 ? '…' : ''}{text.slice(from, at)}
            <span className="rd-hunt-hit">{text.slice(at, at + len)}</span>
            {text.slice(at + len, to)}{to < text.length ? '…' : ''}
        </div>
    );
}

export default function ReaderPage({ bookId, notify, onOpenDetails, onOpenStats, onBack }: Props) {
    const prefs = useReaderPrefs();
    const [book, setBook] = useState<RdBook | null>(null);
    const [chapter, setChapter] = useState<RdChapter | null>(null);
    const [chapterIdx, setChapterIdx] = useState(0);
    const [pageCount, setPageCount] = useState(0);
    const [pageIdx, setPageIdx] = useState(0);
    /** 一页的横向步长（= 视口宽 = 列宽 + 列间距）；翻页位移就是它的整数倍 */
    const [step, setStep] = useState(380);
    const [sheet, setSheet] = useState<Sheet>(null);
    const [panel, setPanel] = useState<Panel>(null);
    /** 主题面板的分组页签（参考图那条 Colors / Textures / Custom） */
    const [themeGroup, setThemeGroup] = useState<'color' | 'texture' | 'custom'>('color');
    const [error, setError] = useState<string | null>(null);
    const [layoutNonce, setLayoutNonce] = useState(0);
    /** 目录面板的页签（章节 / 笔记 / 书签） */
    const [tocTab, setTocTab] = useState<TocTab>('chapters');
    /** 这本书的批注（书签也在里头——它是 kind='bookmark' 的一条） */
    const [anns, setAnns] = useState<RdAnnotation[]>([]);
    /** 当前这一页占的段号区间：书签「在不在这一页」按它判 */
    const [pageRange, setPageRange] = useState<{ from: number; to: number } | null>(null);
    /** 书内搜索：输入词 + 结果（null = 还没搜） */
    const [huntWord, setHuntWord] = useState('');
    const [hunt, setHunt] = useState<{ list: HuntHit[]; cut: boolean } | null>(null);
    /** 搜到之后跳过去的那一条（回到搜索页它带着选中态） */
    const [huntPick, setHuntPick] = useState<number | null>(null);
    /** 底栏那条进度滑轨展开着没有（左二那颗图标开关） */
    const [seekOpen, setSeekOpen] = useState(false);
    /** 调色盘：色相 / 明度两根条 */
    const [hue, setHue] = useState(45);
    const [lum, setLum] = useState(0.62);
    /** 全书章节缓存（搜索时要扫全文，扫一次记着） */
    const chaptersRef = useRef<RdChapter[] | null>(null);
    const [brightness, setBrightness] = useState(0);
    /** 沉浸：点屏幕中间把上下栏藏起来 */
    const [chromeOff, setChromeOff] = useState(false);
    /** 只为了让「阅读时长」每 20 秒自己走一格（值本身不用，读 Date.now 现算） */
    const [, setTick] = useState(0);
    /**
     * 悬浮工具栏（她 2026-09-15 给的参考图）：**选中之后点一下那句话**才出来，
     * 不在选中那一刻自己弹——那会跟 iOS 原生的选区菜单撞在一起。
     * 两种情况共用这一条：选中一段话（划线/复制/写想法）、点中已有的划线（写想法/删掉）。
     */
    const [bar, setBar] = useState<{ x: number; y: number; text: string; anchor: RdAnchor; ann?: RdAnnotation } | null>(null);
    /** 笔记面板开着没有（照 #24：取消 / 笔记 / 存下 + 引文 + 文本框） */
    const [noteOpen, setNoteOpen] = useState(false);
    /** 这条笔记写在哪儿：已有划线（ann）或刚选中的一段话 */
    const [noteTarget, setNoteTarget] = useState<{ text: string; anchor: RdAnchor; ann?: RdAnnotation } | null>(null);
    const [noteDraft, setNoteDraft] = useState('');
    /** 这一章里每条划线的行矩形（覆盖层就照这些矩形画） */
    const [hlRects, setHlRects] = useState<Array<{ id: string; color: string; rects: Array<{ left: number; top: number; width: number; height: number }> }>>([]);

    const rootRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const clipRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const flowRef = useRef<HTMLDivElement>(null);
    /** 横滑跟手：拖拽期间直接改 track 的行内 transform（不走 React，免得整章重渲染） */
    const draggingRef = useRef(false);
    /** 这一下触摸是选字的手势：别翻页，也别让后面补的那次点击翻页 */
    const suppressTapRef = useRef(false);
    /** 章节切换后要落在哪一页（页码 / 锚点 / 章的百分之几——拖进度条跨章时用最后那个） */
    const pendingRef = useRef<{ page?: number; anchor?: { paraIdx: number; charOffset: number }; ratio?: number } | null>(null);
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
    /** 防抖回调里要读最新的批注（闭包会拿到旧数组） */
    const annsRef = useRef<RdAnnotation[]>([]);
    annsRef.current = anns;
    /** 流水要记「读的是哪本书」，而 20 秒那跳的 effect deps 是空的——用 ref 取当前值 */
    const bookIdRef = useRef(bookId);
    bookIdRef.current = bookId;
    /** 量列的 effect 只该在「章 / 排版 / 视口」变时跑；页码跟着变不能让它重跑
        （重跑时 lastAnchorRef 还指着上一页，会把刚翻过去的页算回来） */
    const pageIdxRef = useRef(pageIdx);
    pageIdxRef.current = pageIdx;

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
            // 打开一次（日报的「打开次数 / 使用频率」靠它）
            if (prog || b) recordReading({ open: true, bookId });
            baseSecondsRef.current = prog?.readingSeconds ?? 0;
            sessionCountRef.current = (prog?.sessionCount ?? 0) + 1;
            const startChapter = prog?.chapterIdx ?? 0;
            setChapterIdx(Math.max(0, Math.min(startChapter, Math.max(0, b.chapterCount - 1))));
            if (prog) pendingRef.current = { anchor: { paraIdx: prog.paraIdx, charOffset: prog.charOffset } };
            else pendingRef.current = { page: 0 };
        })();
        return () => { alive = false; };
    }, [bookId]);

    // ── 批注（书签是其中 kind==='bookmark' 的那几条）：进页面读一次，加/删完再读一次 ──
    const reloadAnns = useCallback(async () => {
        try { setAnns(await listAnnotations(bookId)); } catch { /* 读不到就当没有，别挡住阅读 */ }
    }, [bookId]);
    useEffect(() => { void reloadAnns(); }, [reloadAnns]);

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

    /**
     * 正文区高度 = 视口高 − 顶栏 − 底栏。
     * **恒定**：沉浸态只是把上下栏淡出，这里不减不增 —— 所以藏栏不会让正文重排、
     * 翻页也不会跳（她 2026-09-15 说的「不是把内容顶来顶去」）。
     */
    const contentH = useCallback(
        () => Math.max(40, (viewportRef.current?.clientHeight ?? 0) - PAGE_TOP - PAGE_HEAD - PAGE_BOTTOM),
        [],
    );

    // ── 量列（章节/排版/视口变化后重排，并落到该落的那一列）──
    // 横排之后「量页」这步轻多了：列由排版引擎切，我们只问「一共几列 + 锚点在第几列」。
    // 列几何写进流元素的行内样式（宽/列宽/列间距/高），关系见 utils/reader/paginate 顶部。
    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        const flow = flowRef.current;
        if (!chapter || !viewport || !flow) return;
        const height = contentH();
        if (height < 40) return;                       // 布局还没铺开，等下一次
        const w = Math.max(160, Math.round(viewport.clientWidth || 380));
        const gutter = Math.max(0, Math.round(prefs.typography.margin));
        const colW = Math.max(80, w - gutter * 2);
        clipRef.current && (clipRef.current.style.height = `${height}px`);
        flow.style.width = `${w}px`;
        flow.style.height = `${height}px`;
        flow.style.columnWidth = `${colW}px`;
        flow.style.columnGap = `${gutter * 2}px`;

        const count = Math.max(1, columnCountOf(flow, w));
        setStep(w);
        setPageCount(count);
        const pending = pendingRef.current;
        let idx = 0;
        if (pending?.anchor) idx = columnOfAnchor(flow, pending.anchor.paraIdx, pending.anchor.charOffset, w);
        else if (typeof pending?.page === 'number') idx = Math.max(0, Math.min(pending.page, count - 1));
        // 拖进度条跨章：那一章有几页得排完才知道，所以记的是「章的百分之几」
        else if (typeof pending?.ratio === 'number') idx = Math.round(pending.ratio * Math.max(0, count - 1));
        else if (lastAnchorRef.current) {
            // 没有明确目标（比如字体就绪后补量）：回到「刚才读的那一页」，不是第一页
            idx = columnOfAnchor(flow, lastAnchorRef.current.paraIdx, lastAnchorRef.current.charOffset, w);
        } else {
            // 连锚点都没有：至少留在当前页码，绝不跳回第一页
            idx = Math.max(0, Math.min(pageIdxRef.current, count - 1));
        }
        pendingRef.current = null;
        // 量完立刻把「这一页的锚点」记下来——后面任何一次补量（字体/转屏）都靠它回位，
        // 不能等副作用跑完再记（那中间的补量会拿到 null 而跳回第一页）
        const firstSlice = slicesForColumn(flow, idx, w)[0];
        lastAnchorRef.current = firstSlice
            ? { paraIdx: firstSlice.paraIdx, charOffset: firstSlice.startOffset }
            : null;
        setPageIdx(idx);
        restoringRef.current = false;
    }, [chapter, prefs.typography, layoutNonce, contentH]);

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
        if (!flow || pageCount === 0) return null;
        const slices = slicesForColumn(flow, pageIdx, step);
        currentSlicesRef.current = slices;
        const first = slices[0];
        return first ? { paraIdx: first.paraIdx, charOffset: first.startOffset } : null;
    }, [pageCount, pageIdx, step]);

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
            if (sec > 0) recordReading({ sec, bookId: bookIdRef.current });
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
        if (pageCount === 0) return;
        recordReading({ pages: 1, chars: pageChars(), bookId });   // 翻过去 = 刚把这一页读完
        const next = pageIdx + delta;
        if (next >= 0 && next < pageCount) { setPageIdx(next); return; }
        // 跨章
        if (!book) return;
        const nextChapter = chapterIdx + delta;
        if (nextChapter < 0 || nextChapter >= book.chapterCount) return;
        pendingRef.current = delta > 0 ? { page: 0 } : { page: Number.MAX_SAFE_INTEGER };
        restoringRef.current = true;      // 换章别从左往右滑一遍，直接落位
        setChapterIdx(nextChapter);
    }, [pageCount, pageIdx, book, chapterIdx, pageChars]);

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
        if (!book || !chapter || pageCount === 0) return;
        const anchor = anchorOfCurrentPage();
        if (anchor) lastAnchorRef.current = anchor;
        // 这一页压着哪些段（书签判定用）：切片是当下的，放在这里取就不会滞后
        const slices = currentSlicesRef.current;
        const from = slices[0]?.paraIdx;
        const to = slices[slices.length - 1]?.paraIdx;
        setPageRange((prev) => (prev && prev.from === from && prev.to === to ? prev : (from === undefined || to === undefined ? null : { from, to })));
        const percent = bookPercent(chapterIdx, pageIdx, pageCount, book.chapterCount);
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
    }, [pageIdx, chapterIdx, pageCount, book, chapter, anchorOfCurrentPage, flushProgress, bookPercent]);

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

    // ── 触摸：左右滑翻页（横排之后是真的横着走——内容跟手，松手落位） ──
    /** 松手没翻页 / 纵向手势 / 触摸被打断：把这一层挪回当前页 */
    const snapBack = useCallback(() => {
        const track = trackRef.current;
        if (!track) return;
        track.style.transition = '';
        track.style.transform = `translateX(${-pageIdx * step}px)`;
    }, [pageIdx, step]);

    const onTouchStart = (e: React.TouchEvent) => {
        const t = e.touches[0];
        const sel = typeof window.getSelection === 'function' ? window.getSelection() : null;
        // 正在选字：这一下是选区的手势，不翻页，也别让 touchend 补的那次点击翻页
        const selBusy = !!sel && !sel.isCollapsed;
        suppressTapRef.current = selBusy;
        touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now(), locked: selBusy };
        draggingRef.current = false;
        const track = trackRef.current;
        if (track && !selBusy) track.style.transition = 'none';
    };
    const onTouchMove = (e: React.TouchEvent) => {
        const start = touchRef.current;
        if (!start || start.locked) return;
        const t = e.touches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) {   // 纵向 = 别的意图
            start.locked = true;
            snapBack();
            return;
        }
        const track = trackRef.current;
        if (!track || Math.abs(dx) < 4) return;
        const w = viewportRef.current?.clientWidth ?? 380;
        const lastChapter = !!book && chapterIdx >= book.chapterCount - 1;
        // 到头了还往外拖：阻尼 0.35，手感上「拉不动」（最后一章最后一页右边是空的）
        const edge = (dx > 0 && pageIdx <= 0 && chapterIdx <= 0)
            || (dx < 0 && pageIdx >= pageCount - 1 && lastChapter);
        const x = Math.max(-w, Math.min(w, edge ? dx * 0.35 : dx));
        draggingRef.current = true;
        track.style.transform = `translateX(${-pageIdx * step + x}px)`;
    };
    const onTouchEnd = (e: React.TouchEvent) => {
        const start = touchRef.current;
        const dragging = draggingRef.current;
        touchRef.current = null;
        draggingRef.current = false;
        if (!start || start.locked || !dragging) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const dt = Date.now() - start.t;
        const w = viewportRef.current?.clientWidth ?? 380;
        const far = Math.abs(dx) > w * 0.18;
        const flick = dt < 300 && Math.abs(dx) > w * 0.07;
        if (far || flick) { setPanel(null); goPage(dx < 0 ? 1 : -1); return; }
        snapBack();
    };
    const onTouchCancel = () => {
        touchRef.current = null;
        draggingRef.current = false;
        snapBack();
    };

    const atEnd = book ? chapterIdx >= book.chapterCount - 1 && pageIdx >= pageCount - 1 : false;
    const percent = book ? bookPercent(chapterIdx, pageIdx, pageCount, book.chapterCount) : 0;
    const elapsedTotal = baseSecondsRef.current + Math.round((Date.now() - sessionStartRef.current) / 1000);
    const remainSec = book
        ? Math.max(0, (book.totalChars * (1 - percent / 100)) / CHARS_PER_SEC)
        : 0;
    /** 页脚那行时间（20 秒一跳的 tick 会让它自己走） */
    const nowD = new Date();
    const clockText = `${nowD.getHours()}:${String(nowD.getMinutes()).padStart(2, '0')}`;
    const bookMode = readingModeFor(prefs, bookId);

    const jumpChapter = (idx: number) => {
        if (idx !== chapterIdx) recordReading({ pages: 1, chars: pageChars(), bookId });
        pendingRef.current = { page: 0 };
        setChapterIdx(idx);
        setSheet(null);
    };

    /**
     * 按全书比例落到某一页（底栏那条滑轨 + 工具排里那个小进度条都走它）。
     * 同一章内直接换页；跨章时那一章还没量过，记下「章的百分之几」，量完自己落位。
     */
    const seekRatio = (ratio: number) => {
        if (!book || book.chapterCount <= 0) return;
        const r = Math.max(0, Math.min(0.999999, ratio));
        const pos = r * book.chapterCount;
        const ci = Math.min(book.chapterCount - 1, Math.floor(pos));
        const within = pos - ci;
        setPanel(null);
        if (ci === chapterIdx && pageCount > 0) {
            const target = Math.min(pageCount - 1, Math.max(0, Math.round(within * (pageCount - 1))));
            if (target !== pageIdx) setPageIdx(target);
            return;
        }
        pendingRef.current = { ratio: within };
        setChapterIdx(ci);
    };

    /** 从一条命中/书签回到它落的那一页 */
    const jumpToAnchor = (ci: number, paraIdx: number, charOffset: number) => {
        setSheet(null);
        pendingRef.current = { anchor: { paraIdx, charOffset } };
        if (ci === chapterIdx) setLayoutNonce((n) => n + 1);   // 同一章：再量一次就是落位
        else setChapterIdx(ci);
    };

    /** 一条划线在屏幕上的行矩形（工具栏要贴着它浮出来） */
    const hitRectsOf = useCallback((a: RdAnnotation): Array<{ l: number; t: number; r: number; b: number }> => {
        const flow = flowRef.current;
        if (!flow) return [];
        const out: Array<{ l: number; t: number; r: number; b: number }> = [];
        for (let pi = a.anchor.startPara; pi <= a.anchor.endPara; pi++) {
            const el = flow.querySelector<HTMLElement>(`[data-para-idx="${pi}"]`);
            const node = el?.firstChild;
            if (!node || node.nodeType !== Node.TEXT_NODE) continue;
            const data = (node as Text).data;
            const from = pi === a.anchor.startPara ? Math.min(a.anchor.startOffset, data.length) : 0;
            const to = pi === a.anchor.endPara ? Math.min(a.anchor.endOffset, data.length) : data.length;
            if (to <= from) continue;
            const range = document.createRange();
            range.setStart(node, from);
            range.setEnd(node, to);
            for (const r of Array.from(range.getClientRects())) {
                out.push({ l: r.left, t: r.top, r: r.right, b: r.bottom });
            }
        }
        return out;
    }, []);

    /** 这个点落在哪条划线上（用文本插入点反查段号+偏移，不做矩形命中） */
    const hitAnnAt = useCallback((x: number, y: number): RdAnnotation | null => {
        const flow = flowRef.current;
        const caret = (document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null })
            .caretRangeFromPoint?.(x, y);
        if (!flow || !caret) return null;
        const at = paraAt(flow, caret.startContainer);
        if (!at) return null;
        const off = caret.startOffset;
        return anns.find((a) => (a.kind === 'highlight' || a.kind === 'note')
            && (at.idx > a.anchor.startPara || (at.idx === a.anchor.startPara && off >= a.anchor.startOffset))
            && (at.idx < a.anchor.endPara || (at.idx === a.anchor.endPara && off <= a.anchor.endOffset))) ?? null;
    }, [anns]);

    /** 段号 → 第几章（老批注没记章节号，用书目里的段起点倒推） */
    const chapterOfPara = useCallback((para: number) => {
        const starts = book?.chapterStartPara ?? [];
        let ci = 0;
        for (let i = 0; i < starts.length; i++) if (starts[i] <= para) ci = i;
        return ci;
    }, [book]);

    const chapterTitleOf = useCallback((ci: number) => (
        book?.toc.find((t) => t.chapterIdx === ci)?.title ?? `第 ${ci + 1} 章`
    ), [book]);

    /** 章内位置 → 全书百分比（批注/书签列表上那个数） */
    const percentOf = useCallback((ci: number, within: number) => {
        if (!book || book.chapterCount <= 0) return 0;
        const span = 100 / book.chapterCount;
        const t = Math.max(0, Math.min(1, within));
        return Math.round((ci * span + t * span) * 10) / 10;
    }, [book]);

    /** 正在跟着选区走的那条线（拖动范围时改它，别新建） */
    const liveRef = useRef<{ id: string; createdAt: string } | null>(null);
    const liveTimerRef = useRef<number | null>(null);

    /** 选中即划线：防抖 260ms（选区拖着走会连发很多次），落一条 highlight 并刷新覆盖层。
     *  她 2026-09-16：**划线不该由点工具栏触发——选中哪句，哪句就划上**；
     *  工具栏是给已经画好的线用的（点那条线才出）。 */
    const scheduleLiveHighlight = (anchor: RdAnchor) => {
        if (liveTimerRef.current) window.clearTimeout(liveTimerRef.current);
        liveTimerRef.current = window.setTimeout(() => {
            void (async () => {
                if (!book) return;
                const now = new Date().toISOString();
                const live = liveRef.current;
                const id = live?.id ?? uid();
                // 已经压着一条旧线了就不重复划
                if (!live && annsRef.current.some((a) => a.kind !== 'bookmark' && anchorsOverlap(a.anchor, anchor))) return;
                liveRef.current = { id, createdAt: live?.createdAt ?? now };
                await putAnnotation({
                    id, bookId, ownerId: 'user', anchor, kind: 'highlight',
                    styleSlot: 1, contentRev: book.contentRev, status: 'active',
                    chapterIdx, percent: bookPercent(chapterIdx, pageIdx, pageCount, book.chapterCount),
                    createdAt: live?.createdAt ?? now, updatedAt: now,
                });
                await reloadAnns();
            })();
        }, 260);
    };

    // ── 选中文字（正文的 user-select 在 readerCss 里放开）：选中即划线 ──
    useEffect(() => {
        const onSelChange = () => {
            const flow = flowRef.current;
            const s = typeof window.getSelection === 'function' ? window.getSelection() : null;
            if (!flow || !s || s.rangeCount === 0 || s.isCollapsed) { liveRef.current = null; return; }
            const range = s.getRangeAt(0);
            if (!flow.contains(range.startContainer) || !flow.contains(range.endContainer)) return;
            const anchor = anchorFromRange(flow, range);
            if (!anchor) return;
            setBar(null);
            scheduleLiveHighlight(anchor);
        };
        document.addEventListener('selectionchange', onSelChange);
        return () => document.removeEventListener('selectionchange', onSelChange);
    }, [chapter]);

    /** 给工具栏定位：贴着选区的上沿（贴顶就翻到下面），x 夹在屏幕里 */
    const barAt = (rects: Array<{ l: number; t: number; r: number; b: number }>) => {
        const top = Math.min(...rects.map((r) => r.t));
        const bottom = Math.max(...rects.map((r) => r.b));
        const mid = (Math.min(...rects.map((r) => r.l)) + Math.max(...rects.map((r) => r.r))) / 2;
        const below = top < 130;                       // 贴顶：工具栏翻到选区下面
        return {
            x: Math.max(120, Math.min(window.innerWidth - 120, mid)),
            y: below ? bottom + 14 : top - 10,
        };
    };

    /** 划线编辑里改这一条的颜色（单条覆盖；没改过的还是 owner 那支笔） */
    const recolourAnn = async (hex: string) => {
        if (!bar?.ann) return;
        await putAnnotation({ ...bar.ann, color: hex, updatedAt: new Date().toISOString() });
        await reloadAnns();
        setBar({ ...bar, ann: { ...bar.ann, color: hex } });
    };

    /** 写想法（划线上的批注：已有的那条改文本，选区的当场划一条再写） */
    const saveNote = async () => {
        if (!noteTarget) return;
        const note = noteDraft.trim();
        const target = noteTarget.ann;
        if (target) {
            await putAnnotation({
                ...target,
                note: note || undefined,
                kind: note ? 'note' : 'highlight',
                updatedAt: new Date().toISOString(),
            });
        } else if (note && book) {
            const now = new Date().toISOString();
            await putAnnotation({
                id: uid(), bookId, ownerId: 'user', anchor: noteTarget.anchor, kind: 'note',
                styleSlot: 1, note, contentRev: book.contentRev, status: 'active',
                chapterIdx, percent: bookPercent(chapterIdx, pageIdx, pageCount, book.chapterCount),
                createdAt: now, updatedAt: now,
            });
        }
        window.getSelection()?.removeAllRanges();
        setNoteOpen(false);
        setBar(null);
        await reloadAnns();
        if (note || target) notify(note ? '笔记写上了' : '笔记清掉了');
    };

    /** 打开笔记面板（照 #24）：引文 + 文本框，取消/存下 */
    const openNote = (target: { text: string; anchor: RdAnchor; ann?: RdAnnotation }) => {
        setNoteTarget(target);
        setNoteDraft(target.ann?.note ?? '');
        setNoteOpen(true);
        setBar(null);
    };

    const dropAnn = async () => {
        if (!bar?.ann) return;
        await deleteAnnotation(bar.ann.id);
        setBar(null);
        await reloadAnns();
        notify('这条划线删了');
    };

    // ── 划线覆盖层：按行矩形画（不包 <mark>，锚点就不会漂） ──
    useLayoutEffect(() => {
        const flow = flowRef.current;
        const marks = anns.filter((a) => (a.kind === 'highlight' || a.kind === 'note') && a.anchor.startPara < Number.MAX_SAFE_INTEGER);
        if (!flow || marks.length === 0) { setHlRects([]); return; }
        const origin = flowOrigin(flow);
        const out: Array<{ id: string; color: string; rects: Array<{ left: number; top: number; width: number; height: number }> }> = [];
        for (const a of marks) {
            const rects: Array<{ left: number; top: number; width: number; height: number }> = [];
            for (let pi = a.anchor.startPara; pi <= a.anchor.endPara; pi++) {
                const el = flow.querySelector<HTMLElement>(`[data-para-idx="${pi}"]`);
                const node = el?.firstChild;
                if (!node || node.nodeType !== Node.TEXT_NODE) continue;
                const data = (node as Text).data;
                const from = pi === a.anchor.startPara ? Math.min(a.anchor.startOffset, data.length) : 0;
                const to = pi === a.anchor.endPara ? Math.min(a.anchor.endOffset, data.length) : data.length;
                if (to <= from) continue;
                const range = document.createRange();
                range.setStart(node, from);
                range.setEnd(node, to);
                for (const r of Array.from(range.getClientRects())) {
                    rects.push({ left: r.left - origin.x, top: r.top - origin.y, width: r.width, height: r.height });
                }
            }
            if (rects.length > 0) out.push({ id: a.id, color: a.color ?? highlightColorOf(prefs, a.ownerId), rects });
        }
        setHlRects(out);
    }, [anns, chapter, step, layoutNonce, prefs.highlightColors]);

    // ── 书签：夹在当前这一页上，再点一次拿掉（参考图：夹上了右上角挂条红丝带） ──
    const markHere = useMemo(() => {
        if (!pageRange) return null;
        return anns.find((a) => a.kind === 'bookmark'
            && a.anchor.startPara >= pageRange.from && a.anchor.startPara <= pageRange.to) ?? null;
    }, [anns, pageRange]);
    const bookmarked = !!markHere;

    const toggleBookmark = async () => {
        if (!book) return;
        if (markHere) {
            await deleteAnnotation(markHere.id);
            notify('书签拿掉了');
            await reloadAnns();
            return;
        }
        const anchor = anchorOfCurrentPage();
        if (!anchor) { notify('这一页还没排好，稍等一下再夹'); return; }
        const first = currentSlicesRef.current[0];
        const quote = first ? (chapter?.paras[first.paraIdx] ?? '').slice(first.startOffset, first.endOffset) : '';
        const now = new Date().toISOString();
        await putAnnotation({
            id: uid(), bookId, ownerId: 'user',
            anchor: {
                startPara: anchor.paraIdx, startOffset: anchor.charOffset,
                endPara: anchor.paraIdx, endOffset: anchor.charOffset,
                text: quote.slice(0, 120),
            },
            kind: 'bookmark', styleSlot: 1, contentRev: book.contentRev, status: 'active',
            chapterIdx, percent: bookPercent(chapterIdx, pageIdx, pageCount, book.chapterCount),
            createdAt: now, updatedAt: now,
        });
        notify('书签夹在这一页了');
        await reloadAnns();
    };

    // ── 书内搜索（参考图「右上二搜索」：共找到 N 处 + 章节名/百分比 + 摘录） ──
    const runHunt = async (raw: string) => {
        const word = raw.trim();
        if (!word || !book) return;
        if (!chaptersRef.current) {
            const all = await listChapters(bookId);
            chaptersRef.current = [...all].sort((a, b) => a.idx - b.idx);
        }
        const lower = word.toLowerCase();
        const list: HuntHit[] = [];
        let cut = false;
        for (const ch of chaptersRef.current) {
            for (let pi = 0; pi < ch.paras.length; pi++) {
                if (isImagePara(ch.paras[pi])) continue;      // 插图不是字，别拿令牌去搜
                const at = ch.paras[pi].toLowerCase().indexOf(lower);
                if (at < 0) continue;
                list.push({
                    ci: ch.idx, pi, off: at, text: ch.paras[pi],
                    pct: percentOf(ch.idx, ch.paras.length > 0 ? (pi + 1) / ch.paras.length : 0),
                });
                if (list.length >= 200) { cut = true; break; }
            }
            if (cut) break;
        }
        setHunt({ list, cut });
        setHuntPick(null);
        pushHuntHistory(word);
    };

    const notes = useMemo(() => anns
        .filter((a) => a.kind === 'note' || a.kind === 'highlight')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [anns]);
    const marks = useMemo(() => anns
        .filter((a) => a.kind === 'bookmark')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [anns]);

    const moreItems: Array<{ key: string; label: string; on: boolean; run: () => void }> = useMemo(() => [
        { key: 'read', label: '听书', on: false, run: () => notify('听书还没做，先欠着') },
        { key: 'auto', label: '自动翻页', on: false, run: () => notify('自动翻页还没做，先欠着') },
        { key: 'stat', label: '统计', on: true, run: () => { setSheet(null); onOpenStats(); } },
        { key: 'share', label: '分享', on: false, run: () => notify('转发卡片在第三批，先欠着') },
        { key: 'detail', label: '书本详情', on: true, run: () => { setSheet(null); onOpenDetails(bookId); } },
        { key: 'book', label: '总结设置', on: true, run: () => setSheet('book') },
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
        <div className="rd-reader" data-rd-page="reader" ref={rootRef}>
            {/* 夹了书签：纸的右上角挂一条红丝带（参考图 1/3） */}
            {bookmarked && <div className="rd-ribbon" aria-hidden />}

            {/* 顶栏一直在树上，沉浸时只淡出——摘掉它正文会重排（她说的「顶来顶去」） */}
            <div className={`rd-reader-bar${chromeOff ? ' rd-chrome-off' : ''}`}>
                    <button className="rd-icon-btn" onClick={onBack} aria-label="返回"><ArrowLeft size={18} /></button>
                    <div className="rd-reader-bar-title">
                        {book ? `${book.title} · 第 ${chapterIdx + 1} / ${book.chapterCount} 章` : '…'}
                    </div>
                    {/* 目录在底栏第一格、更多在底栏最后一格，顶栏右边只留搜索和书签 */}
                    <div className="rd-reader-bar-tools">
                        <button
                            className="rd-icon-btn"
                            aria-label="书内搜索"
                            onClick={() => { setPanel(null); setSheet('hunt'); }}
                        >
                            <MagnifyingGlass size={19} />
                        </button>
                        <button
                            className={`rd-icon-btn${bookmarked ? ' rd-tool-on' : ''}`}
                            aria-label={bookmarked ? '取消书签' : '加书签'}
                            onClick={() => void toggleBookmark()}
                        >
                            <BookmarkSimple size={19} weight={bookmarked ? 'fill' : 'regular'} />
                        </button>
                    </div>
            </div>

            <div
                className="rd-reader-viewport"
                ref={viewportRef}
                onClick={(e) => {
                    // 选字那一下松手后浏览器会补一次点击：那不是在翻页
                    if (suppressTapRef.current) { suppressTapRef.current = false; return; }
                    // 点在一条已有的划线上：出工具栏（复制 / 笔记 / 搜索 / 分享 / 删掉 + 改这条的颜色）
                    window.getSelection()?.removeAllRanges();
                    liveRef.current = null;
                    const hit = hitAnnAt(e.clientX, e.clientY);
                    if (hit) {
                        setPanel(null);
                        const rects = hitRectsOf(hit);
                        const at = rects.length > 0 ? barAt(rects) : { x: Math.max(120, Math.min(window.innerWidth - 120, e.clientX)), y: Math.max(140, e.clientY - 12) };
                        setBar({ ...at, text: hit.anchor.text, anchor: hit.anchor, ann: hit });
                        return;
                    }
                    setBar(null);
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = (e.clientX - rect.left) / rect.width;
                    if (ratio < 0.3) { setPanel(null); goPage(-1); }
                    else if (ratio > 0.7) { setPanel(null); goPage(1); }
                    else if (panel) setPanel(null);          // 面板开着：点中间先收面板
                    else { setSeekOpen(false); setPanel(null); setChromeOff((v) => !v); }
                }}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onTouchCancel={onTouchCancel}
            >
                {/* 一屏一片：整章排进多列流，翻页 = 整列横向平移（拖拽时直接改 track 的
                    transform，不走 React——整章几百个段落，每帧重渲染一次不划算） */}
                <div className="rd-reader-clip" ref={clipRef}>
                    <div
                        className="rd-reader-track"
                        ref={trackRef}
                        style={{
                            transform: `translateX(${-pageIdx * step}px)`,
                            transition: restoringRef.current ? 'none' : undefined,
                        }}
                    >
                        <div className="rd-reader-flow" ref={flowRef}>
                            {chapter && <div className="rd-reader-chapter">{chapter.title}</div>}
                            {chapter?.paras.map((p, i) => (
                                <p className="rd-para" key={i} data-para-idx={i}>
                                    {isImagePara(p) ? <ReaderFigure refText={p} /> : p}
                                </p>
                            ))}
                        </div>
                        <div className="rd-hl-layer" aria-hidden>
                            {hlRects.map((h) => h.rects.map((r, i) => (
                                <div
                                    key={`${h.id}-${i}`}
                                    className={`rd-hl-rect${bar?.ann?.id === h.id ? ' rd-hl-rect-tap' : ''}`}
                                    style={{
                                        left: r.left, top: r.top, width: r.width, height: r.height,
                                        background: `rgba(${hexTriple(h.color)}, 0.32)`,
                                    }}
                                />
                            )))}
                        </div>
                    </div>
                </div>
                {/* 页眉：每一页顶上那行小字（参考图里的「第三章」）——定位在正文区上方，不跟着滚 */}
                {chapter && <div className="rd-reader-head">第 {chapterIdx + 1} 章</div>}
                <div className="rd-reader-veil" style={{ opacity: brightness }} />
            </div>

            {/* 页脚：左下时间 + 右下页码（参考图那行 8:29 PM / 103 / 334）；深度沉浸时它露出来，
                上下栏一亮就压在它上面（栏是遮罩） */}
            <div className="rd-reader-footnote">
                <span>{clockText}</span>
                <span>{pageCount > 0 ? `${pageIdx + 1} / ${pageCount}` : ''}</span>
            </div>

            {atEnd && (
                <div className={`rd-reader-stat${chromeOff ? ' rd-chrome-off' : ''}`} style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(var(--rd-foot-h) + max(var(--safe-bottom, 0px), env(safe-area-inset-bottom, 0px)))', justifyContent: 'center', zIndex: 21 }}>
                    这本书读完了{book?.totalChars ? ` · ${Math.round(book.totalChars / 1000)} 千字` : ''}
                </div>
            )}

            {/* 底栏也是遮罩：高度写死，内容浮在它上面（展开的滑轨、排版/主题面板都走 bottom:100%） */}
            <div className={`rd-reader-foot${chromeOff ? ' rd-chrome-off' : ''}`}>
                    {/* 左二那颗图标点开的进度滑轨（她：图标是图标，展开能拖就行） */}
                    {seekOpen && (
                        <div className="rd-reader-seekrow">
                            <button className="rd-slider-nav" onClick={() => goPage(-1)} aria-label="上一页"><CaretLeft size={15} /></button>
                            <div
                                className="rd-slider-track"
                                onPointerDown={(e) => {
                                    e.currentTarget.setPointerCapture(e.pointerId);
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    seekRatio((e.clientX - rect.left) / rect.width);
                                }}
                                onPointerMove={(e) => {
                                    if (!e.buttons) return;
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    seekRatio((e.clientX - rect.left) / rect.width);
                                }}
                            >
                                <div className="rd-slider-rail"><div className="rd-slider-fill" style={{ width: `${percent}%` }} /></div>
                                <div className="rd-slider-knob" style={{ left: `${percent}%` }} />
                            </div>
                            <button className="rd-slider-nav" onClick={() => goPage(1)} aria-label="下一页"><CaretRight size={15} /></button>
                            <span className="rd-reader-seekpct">{percent}%</span>
                        </div>
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

                    <div className="rd-reader-stat">
                        <span>阅读时长 {fmtDuration(elapsedTotal)}</span>
                        <span>剩余 {fmtDuration(remainSec)}</span>
                    </div>

                    {/* 工具排：目录 / 进度条 / 亮度 / 排版(A) / 主题 / 更多
                        —— 左二那个不是按钮，是**进度条本体**（参考图里的 —◯—），点或拖都在调进度 */}
                    <div className="rd-reader-tools">
                        <button className="rd-tool" onClick={() => { setPanel(null); setSheet('toc'); }} aria-label="目录"><ListBullets size={19} /></button>
                        <button
                            className={`rd-tool${seekOpen ? ' rd-tool-on' : ''}`}
                            aria-label="阅读进度"
                            onClick={() => { setPanel(null); setSeekOpen((v) => !v); }}
                        >
                            <span className="rd-seek-icon"><span className="rd-seek-icon-knob" /></span>
                        </button>
                        <button className={`rd-tool${brightness > 0 ? ' rd-tool-on' : ''}`} onClick={() => setSheet('bright')} aria-label="亮度"><Lightbulb size={19} /></button>
                        <button
                            className={`rd-tool${panel === 'style' ? ' rd-tool-on' : ''}`}
                            onClick={() => setPanel(panel === 'style' ? null : 'style')}
                            aria-label="排版设置"
                        >
                            A
                        </button>
                        <button className={`rd-tool${panel === 'theme' ? ' rd-tool-on' : ''}`} onClick={() => setPanel(panel === 'theme' ? null : 'theme')} aria-label="主题"><TShirt size={19} /></button>
                    <button className="rd-tool" onClick={() => { setPanel(null); setSheet('more'); }} aria-label="更多"><DotsThree size={20} /></button>
                </div>
            </div>

            {/* ── 目录 / 笔记 / 书签（参考图「左下一展开」：书信息头 + 三页签 + 列表） ── */}
            {sheet === 'toc' && book && (
                <div className="rd-sheet-mask" onClick={() => setSheet(null)}>
                    <div className="rd-sheet rd-sheet-tall" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />

                        <div className="rd-toc-head">
                            <div className="rd-toc-cover"><ReaderCover coverRef={book.coverRef} title={book.title} compact /></div>
                            <div className="rd-toc-info">
                                <div className="rd-toc-name">{book.title}</div>
                                <div className="rd-toc-meta">
                                    <span>共 {book.chapterCount} 章</span>
                                    <span>{fmtWords(book.totalChars)}</span>
                                    <span>{Math.max(1, Math.ceil(book.fileBytes / 1024))} KB</span>
                                    <span>读过 {fmtDuration(elapsedTotal)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="rd-opt-seg" style={{ marginBottom: 'var(--rd-space-2)' }}>
                            {([['chapters', '章节'], ['notes', '笔记'], ['bookmarks', '书签']] as Array<[TocTab, string]>).map(([k, label]) => (
                                <button key={k} className={`rd-opt-seg-btn${tocTab === k ? ' rd-opt-seg-on' : ''}`} onClick={() => setTocTab(k)}>
                                    {label}
                                    {k === 'notes' && notes.length > 0 ? ` ${notes.length}` : ''}
                                    {k === 'bookmarks' && marks.length > 0 ? ` ${marks.length}` : ''}
                                </button>
                            ))}
                        </div>

                        <div className="rd-toc-scroll">
                            {tocTab === 'chapters' && (book.toc.length === 0
                                ? <div className="rd-muted">这本书没有目录</div>
                                : book.toc.map((item) => (
                                    <button key={`${item.chapterIdx}-${item.title}`} className="rd-toc-row" onClick={() => jumpChapter(item.chapterIdx)}>
                                        <div className="rd-toc-row-head">
                                            <span style={{ fontWeight: item.chapterIdx === chapterIdx ? 600 : undefined }}>{item.title}</span>
                                            {item.chapterIdx === chapterIdx && <span className="rd-toc-pct">在读</span>}
                                        </div>
                                    </button>
                                )))}

                            {tocTab === 'notes' && (notes.length === 0
                                ? <div className="rd-hunt-empty">这本书上还没有划线批注。</div>
                                : notes.map((a) => {
                                    const ci = chapterOfPara(a.anchor.startPara);
                                    return (
                                        <button key={a.id} className="rd-toc-row" onClick={() => jumpToAnchor(ci, a.anchor.startPara, a.anchor.startOffset)}>
                                            <div className="rd-toc-row-head">
                                                <span>{chapterTitleOf(ci)}</span>
                                                <span className="rd-toc-pct">{percentOf(ci, 0).toFixed(2)}%</span>
                                            </div>
                                            <div className="rd-toc-quote">{a.note || a.anchor.text}</div>
                                            <div className="rd-toc-time">{a.createdAt.slice(0, 10)}</div>
                                        </button>
                                    );
                                }))}

                            {tocTab === 'bookmarks' && (marks.length === 0
                                ? <div className="rd-hunt-empty">还没有书签。读到想记的地方，点右上角那个书签。</div>
                                : marks.map((a) => {
                                    const ci = a.chapterIdx ?? chapterOfPara(a.anchor.startPara);
                                    return (
                                        <button key={a.id} className="rd-toc-row" onClick={() => jumpToAnchor(ci, a.anchor.startPara, a.anchor.startOffset)}>
                                            <div className="rd-toc-row-head">
                                                <span>{chapterTitleOf(ci)}</span>
                                                <span className="rd-toc-pct">{(a.percent ?? percentOf(ci, 0)).toFixed(2)}%</span>
                                            </div>
                                            {a.anchor.text && <div className="rd-toc-quote">{a.anchor.text}</div>}
                                            <div className="rd-toc-time">{a.createdAt.slice(0, 10)}</div>
                                        </button>
                                    );
                                }))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── 书内搜索（参考图 11：**整页**，不是被键盘顶出来的小浮层）── */}
            {sheet === 'hunt' && (
                <div className="rd-hunt" data-rd-page="hunt">
                    <div className="rd-search-bar">
                        <div className="rd-search-input">
                            <MagnifyingGlass size={17} />
                            <input
                                autoFocus
                                value={huntWord}
                                placeholder="在书里找字"
                                onChange={(e) => { setHuntWord(e.target.value); if (!e.target.value.trim()) { setHunt(null); setHuntPick(null); } }}
                                onKeyDown={(e) => { if (e.key === 'Enter') void runHunt(huntWord); }}
                            />
                            {huntWord && (
                                <button className="rd-search-cancel" onClick={() => { setHuntWord(''); setHunt(null); setHuntPick(null); }} aria-label="清空"><X size={15} /></button>
                            )}
                        </div>
                        <button className="rd-search-cancel" onClick={() => setSheet(null)}>取消</button>
                    </div>

                    <div className="rd-hunt-body">
                        {!hunt && prefs.huntHistory.length > 0 && (
                            <>
                                <div className="rd-group-head">
                                    <span>搜索历史</span>
                                    <button className="rd-group-action" onClick={clearHuntHistory} aria-label="清空历史"><Trash size={15} /></button>
                                </div>
                                <div className="rd-hunt-hist">
                                    {prefs.huntHistory.map((h) => (
                                        <button key={h} className="rd-hunt-chip" onClick={() => { setHuntWord(h); void runHunt(h); }}>{h}</button>
                                    ))}
                                </div>
                            </>
                        )}
                        {!hunt && prefs.huntHistory.length === 0 && <div className="rd-hunt-empty">打个词，回车开始找。</div>}

                        {hunt && (
                            <>
                                <div className="rd-search-found">共找到 {hunt.list.length} 处{hunt.cut ? '（这里先列前面的）' : ''}</div>
                                {hunt.list.length === 0 && <div className="rd-hunt-empty">没有找到「{huntWord.trim()}」。</div>}
                                {hunt.list.map((hit, i) => (
                                    <button
                                        key={`${hit.ci}-${hit.pi}-${i}`}
                                        className={`rd-toc-row${huntPick === i ? ' rd-toc-row-on' : ''}`}
                                        onClick={() => { setHuntPick(i); jumpToAnchor(hit.ci, hit.pi, hit.off); }}
                                    >
                                        <div className="rd-toc-row-head">
                                            <span>{chapterTitleOf(hit.ci)}</span>
                                            <span className="rd-toc-pct">{hit.pct.toFixed(2)}%</span>
                                        </div>
                                        <Excerpt text={hit.text} at={hit.off} len={Math.max(1, huntWord.trim().length)} />
                                    </button>
                                ))}
                            </>
                        )}
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
                        <div className="rd-sheet-title">总结设置</div>
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

            {/* ── 划线设置：跟书详情、设置页共用同一张弹卡 ── */}
            {sheet === 'hl' && <HighlightColorSheet onClose={() => setSheet(null)} />}

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
                            当前第 {pageIdx + 1} / {pageCount} 页 · 全书 {percent}%
                        </div>
                    </div>
                </div>
            )}

                        {/* ── 点中一条已有的划线：**划线编辑**（照她给的参考图：上面一排颜色改这一条，
                下面一排操作）。颜色改的是**这一条**（没改过的还是「谁划的」那支笔）。 ── */}
            {bar?.ann && (
                <div
                    className="rd-edit-bar"
                    data-rd-page="annedit"
                    style={{ left: bar.x, top: bar.y }}
                    onMouseDown={(e) => e.preventDefault()}
                    onTouchStart={(e) => e.stopPropagation()}
                >
                    <div className="rd-edit-colors">
                        {prefs.highlightPalette.map((c) => (
                            <button
                                key={c}
                                aria-label={c}
                                className={`rd-edit-dot${(bar.ann!.color ?? highlightColorOf(prefs, 'user')) === c ? ' rd-edit-dot-on' : ''}`}
                                style={{ background: c }}
                                onClick={() => void recolourAnn(c)}
                            />
                        ))}
                        <button className="rd-edit-more" onClick={() => { setSheet('hl'); setBar(null); }}>划线设置</button>
                    </div>
                    <div className="rd-edit-acts">
                        <button className="rd-edit-act" onClick={() => void copyToClipboard(bar.text)}>
                            <Copy size={17} weight="bold" /><span>复制</span>
                        </button>
                        <button className="rd-edit-act" onClick={() => openNote({ text: bar.text, anchor: bar.anchor, ann: bar.ann })}>
                            <PencilSimple size={17} weight="bold" /><span>{bar.ann.note ? '改笔记' : '笔记'}</span>
                        </button>
                        <button
                            className="rd-edit-act"
                            onClick={() => { setSheet('hunt'); setHuntWord(bar.text.slice(0, 12)); setHunt(null); setBar(null); }}
                        >
                            <MagnifyingGlass size={17} weight="bold" /><span>搜索</span>
                        </button>
                        <button className="rd-edit-act" onClick={() => notify('分享书摘要等转发卡片（第三批）')}>
                            <ShareNetwork size={17} weight="bold" /><span>分享</span>
                        </button>
                        <button className="rd-edit-act rd-edit-act-danger" onClick={() => void dropAnn()}>
                            <Trash size={17} weight="bold" /><span>删掉</span>
                        </button>
                    </div>
                </div>
            )}

            {/* ── 选中一段话（还没划线）：六项操作条（她 09-15 批过的那版，一次出全） ── */}
            {/* ── 笔记面板（照她给的 Edit Note 参考图：取消 / 笔记 / 存下 + 引文 + 文本框） ── */}
            {noteOpen && noteTarget && (
                <div className="rd-notepanel" data-rd-page="notepanel">
                    <div className="rd-notepanel-head">
                        <button className="rd-notepanel-btn" onClick={() => setNoteOpen(false)}>取消</button>
                        <span className="rd-notepanel-title">笔记</span>
                        <button className="rd-notepanel-btn rd-notepanel-save" onClick={() => void saveNote()}>存下</button>
                    </div>
                    <div className="rd-notepanel-quote">{noteTarget.text}</div>
                    <textarea
                        className="rd-notepanel-area"
                        autoFocus
                        placeholder="写点什么…"
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                    />
                </div>
            )}

        </div>
    );
}

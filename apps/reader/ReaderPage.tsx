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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
    ArrowLeft, BookmarkSimple, CaretLeft, CaretRight, ChatCircleDots, Copy, DotsThree, Highlighter,
    Lightbulb, ListBullets, MagnifyingGlass, Palette, PencilSimple, ShareNetwork, TShirt, Trash,
    UsersThree, X,
} from '@phosphor-icons/react';
import { isImagePara } from '../../utils/reader/importEpub';
import type { RdAnnotationStyle } from '../../utils/reader/readerDb';
import {
    appendRoamActivity, deleteAnnotation, getBook, getChapter, getProgress, listAnnotations, listChapters,
    listThreads, newRoamGroup, putAnnotation, putProgress, rdId, type RdAnchor, type RdAnnotation,
    type RdBook, type RdChapter, type RdProgress, type RdThread,
} from '../../utils/reader/readerDb';
import { participantsOfParagraph } from '../../utils/reader/readerParticipants';
import ReaderCover from './ReaderCover';
import {
    columnCountOf, columnOfAnchor, flowOrigin, slicesForColumn, type PageSlice,
} from '../../utils/reader/paginate';
import {
    clearHuntHistory, DEFAULT_TYPOGRAPHY, highlightColorOf, pushHuntHistory,
    setTheme, setTypography, useReaderPrefs,
} from './readerPrefs';
import { useReaderCharPrefs } from './readerCharPrefs';
import HighlightColorSheet from './HighlightColorSheet';
import ReaderCoRead from './ReaderCoRead';
import ReaderDiscuss from './ReaderDiscuss';
import ShareCardSheet from './ShareCardSheet';
import { shareDayOf } from '../../utils/reader/shareCardDraw';
import { useCoReadStore } from './coreadStore';
import { useOS } from '../../context/OSContext';
import TokenImg from '../../components/os/TokenImg';
import { hexTriple, READER_SKINS } from './readerSkinPresets';
import { getBlobForRef, useBlobRefUrl } from '../../utils/blobRef';
import { shareOrDownloadBlob } from '../../utils/shareExport';
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
/** 估「还要读多久」用的速度（字/秒）——按每分钟 400 字算。她 09-16 把那个倒计时删了，
 *  这个常数先留着（以后要做「今日还剩」时还用得上） */
const CHARS_PER_SEC = 400 / 60;
/** 长按多久算「长按」（她选划线 vs 起讨论的分界） */
const LONG_PRESS_MS = 450;
/** 手指挪出这个距离就不算长按了 */
const LONG_PRESS_SLOP = 10;

interface Props {
    bookId: string;
    notify: (msg: string) => void;
    onOpenDetails: (bookId: string) => void;
    onOpenStats: () => void;
    onBack: () => void;
    /**
     * 「查看原文」（她 09-20 的笔记库页）：从笔记跳进来时直接落在这条笔记那一句上，
     * 不走「上次读到哪」的进度（段号是**章内**段号）。不传就照常恢复进度。
     */
    startAt?: { chapterIdx: number; paraIdx: number } | null;
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

// 「总结设置」那页撤了——共读模式并入共读面板的「上下文」（她 09-15：合并，留后者）
type Sheet = null | 'toc' | 'more' | 'hl' | 'bright' | 'hunt' | 'coread';
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

export default function ReaderPage({ bookId, notify, onOpenDetails, onOpenStats, onBack, startAt }: Props) {
    const prefs = useReaderPrefs();
    /** 角色自己的读书设置（笔色在这儿；重取阅读风格会动它，所以订阅上） */
    const charPrefs = useReaderCharPrefs();
    /** 角色表（顶栏共读头像要用） */
    const { characters } = useOS();
    const [book, setBook] = useState<RdBook | null>(null);
    const [chapter, setChapter] = useState<RdChapter | null>(null);
    const [chapterIdx, setChapterIdx] = useState(0);
    const [pageCount, setPageCount] = useState(0);
    const [pageIdx, setPageIdx] = useState(0);
    /** 一页的横向步长（= 视口宽 = 列宽 + 列间距）；翻页位移就是它的整数倍 */
    const [step, setStep] = useState(380);
    const [sheet, setSheet] = useState<Sheet>(null);
    const [panel, setPanel] = useState<Panel>(null);
    /** 共读：会话开着就点亮；只选了人还没开始，顶栏先挂上他的头像（她 09-16 要的） */
    const coRead = useCoReadStore();
    const [coReadPicks, setCoReadPicks] = useState<string[]>([]);
    const inCoRead = coRead.session?.bookId === bookId;
    /** 顶栏那枚图标挂谁的头像：共读中挂第一个，只邀请还没开始就挂邀请的第一个 */
    const coReadCharId = (inCoRead ? coRead.session?.charIds[0] : null) ?? coReadPicks[0];
    const coReadChar = coReadCharId ? (characters.find((c) => c.id === coReadCharId) ?? null) : null;
    /** 一次叫了不止一个人：顶栏改成「两个头像叠着，第二个蒙一层写人数」（她 09-20 给的样子） */
    const coReadIds = inCoRead ? (coRead.session?.charIds ?? []) : coReadPicks;
    const coReadCount = coReadIds.length;
    const coReadMany = coReadCount > 1;
    const coReadSecond = coReadIds[1] ? (characters.find((c) => c.id === coReadIds[1]) ?? null) : null;
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
    /** 工具条上那条颜色排展开着没有（点划线图标切换） */
    const [barColors, setBarColors] = useState(false);
    /** 这一章里每条划线的行矩形（覆盖层就照这些矩形画） */
    const [hlRects, setHlRects] = useState<Array<{ id: string; color: string; style: string; rects: Array<{ left: number; top: number; width: number; height: number }> }>>([]);

    const rootRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const clipRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const flowRef = useRef<HTMLDivElement>(null);
    /** 横滑跟手：拖拽期间直接改 track 的行内 transform（不走 React，免得整章重渲染） */
    const draggingRef = useRef(false);
    /** 这一下触摸是选字的手势：别翻页，也别让后面补的那次点击翻页 */
    const suppressTapRef = useRef(false);

    // ── 长按一条划线 → 起讨论面板（她 09-15：点按出工具条，长按起讨论）──
    // 手势三条分支互不打架的要点：**disarm 永远排在 early-return 前面**，不然
    // 拖页/选字那条路会把定时器漏在那儿，松手之后突然弹出面板。
    const longPressRef = useRef<{ timer: number; fired: boolean } | null>(null);
    /** 这一时刻之前，不许「选中即划线」跟着启动（长按会带出原生选区） */
    const selSuppressUntilRef = useRef(0);
    /** 长按要用最新的 hitAnnAt，但手势闭包不能跟着它重建——用 ref 转一手 */
    const hitAnnRef = useRef<(x: number, y: number) => RdAnnotation | null>(() => null);
    /** 这一下按在一条划线上（原生 touchstart 记下来的；吃掉了 click 之后由 touchend 自己补） */
    const tapHitRef = useRef<RdAnnotation | null>(null);
    /** 讨论面板：长按命中的那条线 */
    const [discuss, setDiscuss] = useState<RdAnnotation | null>(null);
    /** 书摘分享卡（她 09-26）：工具条上点「分享书摘」时抓下来的那一条 */
    const [sharing, setSharing] = useState<{ quote: string; note?: string; at?: string } | null>(null);

    const disarmLongPress = useCallback(() => {
        if (longPressRef.current) window.clearTimeout(longPressRef.current.timer);
        longPressRef.current = null;
    }, []);

    const armLongPress = useCallback((x: number, y: number) => {
        disarmLongPress();
        const timer = window.setTimeout(() => {
            const lp = longPressRef.current;
            if (!lp || lp.fired) return;
            lp.fired = true;
            // **只有真的按在一条划线上才动手**：空白处长按什么都不做，原生选字照旧
            const hit = hitAnnRef.current(x, y);
            if (!hit) return;
            suppressTapRef.current = true;                    // 松手后补的那次点击别翻页
            selSuppressUntilRef.current = Date.now() + 800;   // 顺带带出来的选区别划成线
            window.getSelection()?.removeAllRanges();
            setBar(null);
            setPanel(null);
            setDiscuss(hit);
        }, LONG_PRESS_MS);
        longPressRef.current = { timer, fired: false };
    }, [disarmLongPress]);
    /** 章节切换后要落在哪一页（页码 / 锚点 / 章的百分之几——拖进度条跨章时用最后那个）。
     *  **必须带上目标章号**：chapterIdx 是先更新的、这一章的 DOM 是读完才来的，中间那几趟
     *  量页拿到的是上一章的 flow——不带章号就没法判断「这趟该不该用掉它」（见下面量页那段）。 */
    const pendingRef = useRef<{
        chapterIdx?: number;
        page?: number;
        anchor?: { paraIdx: number; charOffset: number };
        ratio?: number;
    } | null>(null);
    /** 当前页覆盖的文本切片（V1 的数据口） */
    const currentSlicesRef = useRef<PageSlice[]>([]);
    /** 上一页的锚点：重排（字体就绪/转屏）时用它回位，别跳回第一页 */
    const lastAnchorRef = useRef<{ paraIdx: number; charOffset: number } | null>(null);
    /** 待落盘的进度（防抖写入，离开页面时立刻写掉——退出去不能丢） */
    const pendingSaveRef = useRef<RdProgress | null>(null);
    /** 上一本书的进度恢复完了没（没好之前不许写存档，别把进门那一刻的空位置盖上去） */
    const restoredRef = useRef(false);
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
    /** 量页/RestoreObserver 里要读「现在是第几章」（那边 deps 是空的，闭包会拿旧值） */
    const chapterIdxRef = useRef(chapterIdx);
    chapterIdxRef.current = chapterIdx;
    /** 量列的 effect 只该在「章 / 排版 / 视口」变时跑；页码跟着变不能让它重跑
        （重跑时 lastAnchorRef 还指着上一页，会把刚翻过去的页算回来） */
    const pageIdxRef = useRef(pageIdx);
    pageIdxRef.current = pageIdx;
    /** 这次进来翻到过哪些页（统计/书签） */
    const pagesSeenRef = useRef<Set<string>>(new Set());
    /** 各章页数（版面量出来的，别处也可能要） */
    const pageCountsRef = useRef<Record<number, number>>({});
    /** 用户活动记录只落一次（退出 / 页面被关 二选一，先到先算） */
    const sessionLoggedRef = useRef(false);

    // ── 打开书：读书目 + 恢复进度 ──
    useEffect(() => {
        let alive = true;
        // 恢复没落地之前，别让「进门那一刻的空位置」被当成存档写回去
        //（她 09-16 报的「退出去再进来直接回第一章」——快进快出时那条空存档会盖掉真进度）
        restoredRef.current = false;
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
            // 「查看原文」进来时落在这条笔记那一句上（不走上次读到哪）
            const startChapter = startAt?.chapterIdx ?? prog?.chapterIdx ?? 0;
            setChapterIdx(Math.max(0, Math.min(startChapter, Math.max(0, b.chapterCount - 1))));
            if (startAt) pendingRef.current = { chapterIdx: startAt.chapterIdx, anchor: { paraIdx: startAt.paraIdx, charOffset: 0 } };
            else if (prog) pendingRef.current = { chapterIdx: startChapter, anchor: { paraIdx: prog.paraIdx, charOffset: prog.charOffset } };
            else pendingRef.current = { chapterIdx: 0, page: 0 };
            // 落点定下来了，这才允许写存档（见上面 restoredRef 那句）
            restoredRef.current = true;
        })();
        return () => { alive = false; };
    }, [bookId]);

    // ── 批注（书签是其中 kind==='bookmark' 的那几条）：进页面读一次，加/删完再读一次 ──
    const [threads, setThreads] = useState<RdThread[]>([]);

    const reloadAnns = useCallback(async () => {
        try {
            const [rows, ths] = await Promise.all([listAnnotations(bookId), listThreads(bookId)]);
            // 角色标成「他自己可见」的不上正文（她 09-15 定的三档可见性）——只在
            // 他自己的详情页和笔记页（带锁）露面。我自己的和公开的照旧都画。
            setAnns(rows.filter((a) => (a.visibility ?? 'public') !== 'self'));
            setThreads(ths);
        } catch { /* 读不到就当没有，别挡住阅读 */ }
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
        // **落点只属于它自己那一章。** 恢复/跳转时 chapterIdx 先变，这一章的正文是异步读完
        // 才渲染的——中间那几趟量页（字体就绪的补量、转屏重排）对上的还是**上一章**的 DOM，
        // `[data-para-idx]` 找不到就返回第 0 列，锚点却被消费掉了，于是「退出去再进来落回本章
        // 第一页」（她 09-16 报的，真书上复现：存档 第一章/第 9 段 → 进来停在第 1 页）。
        // 判据用**真在 DOM 里的那一章**（chapter.idx），不是 chapterIdx——出事那趟 chapterIdx
        // 早就已经跳到目标章了。章没到，就什么都别做、更别清 pending。
        if (pending && pending.chapterIdx !== undefined && pending.chapterIdx !== chapter.idx) return;
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
                if (anchor) pendingRef.current = { chapterIdx: chapterIdxRef.current, anchor };
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
        pendingRef.current = delta > 0
            ? { chapterIdx: nextChapter, page: 0 }
            : { chapterIdx: nextChapter, page: Number.MAX_SAFE_INTEGER };
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
        // 恢复还没落地：这一轮算出来的位置是「进门那一刻」的空位置，不能当存档
        if (!restoredRef.current) return;
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

    // ── 这次阅读的足迹：翻到过哪些页（书签/统计用）──
    useEffect(() => {
        if (restoredRef.current) pagesSeenRef.current.add(`${chapterIdx}:${pageIdx}`);
    }, [chapterIdx, pageIdx]);

    /**
     * 「往后翻了几页」——她 09-20 的口径：**往回翻不算**。
     * 记两个点：进门那页 = 起点，这次到过的最远那页 = 终点；两个点之间的距离就是页数。
     * （原来记的是「翻到过几个不同的页」，她往回翻也会加一，数字会虚高。）
     */
    useEffect(() => {
        if (!restoredRef.current || pageCount === 0) return;
        pageCountsRef.current[chapterIdx] = Math.max(pageCountsRef.current[chapterIdx] ?? 0, pageCount);
    }, [chapterIdx, pageIdx, pageCount]);

    /**
     * 一次「进书 → 退出」= 一条**用户活动记录**（她 09-20 的活动记录口径）。
     * 你自己读书不调 llm，所以这条是纯事件记录：读了多久 / 留了几条批注 / 参与多少回复。
     * **不同步聊天**，可手动删改（入口在书库页的全局活动记录）。
     * 挂在 render 上取最新值，交给一个 [] 依赖的卸载 effect 调——闭包不会拿到旧数组。
     *
     * **页数不记了**（她 09-26：「所有算我页数的都别算了，整个充满了bug」）——
     * 原来按「进门那页 → 到过的最远那页」算，往回翻、跳章都会算歪（她撞见 1% 进度配 99 页）。
     */
    const sessionLoggerRef = useRef<() => void>(() => {});
    sessionLoggerRef.current = () => {
        // 恢复没落地 = 这一趟还没真的开始读（顺手挡住 StrictMode 的假卸载）
        if (sessionLoggedRef.current || !restoredRef.current || !book) return;
        sessionLoggedRef.current = true;
        const since = new Date(sessionStartRef.current).toISOString();
        void appendRoamActivity({
            id: rdId('rr'), charId: 'user', bookId: book.id, kind: 'read',
            group: newRoamGroup(), seq: 0,
            annCount: anns.filter((a) => a.ownerId === 'user' && a.createdAt >= since).length,
            replyCount: threads.reduce(
                (n, t) => n + t.messages.filter((m) => m.role === 'user' && m.createdAt >= since).length, 0),
            summary: `你读了《${book.title}》`,
            durationMs: Math.round((Date.now() - sessionStartRef.current) / 1000) * 1000,
            mode: 'user',
            createdAt: new Date().toISOString(),
        });
    };

    // 退出阅读页 / 页面被整个关掉：把这次阅读落成一条用户活动记录（只落一次）
    useEffect(() => {
        const onPageHide = () => { sessionLoggerRef.current(); };
        window.addEventListener('pagehide', onPageHide);
        return () => {
            window.removeEventListener('pagehide', onPageHide);
            sessionLoggerRef.current();
        };
    }, []);

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
        // 讨论面板开着：底下一律不接手势（她 09-16：面板拉起来时后面别跟着翻页）
        if (discuss) return;
        const t = e.touches[0];
        const sel = typeof window.getSelection === 'function' ? window.getSelection() : null;
        // 正在选字：这一下是选区的手势，不翻页，也别让 touchend 补的那次点击翻页
        const selBusy = !!sel && !sel.isCollapsed;
        suppressTapRef.current = selBusy;
        touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now(), locked: selBusy };
        draggingRef.current = false;
        const track = trackRef.current;
        if (track && !selBusy) track.style.transition = 'none';
        if (!selBusy) armLongPress(t.clientX, t.clientY);
    };
    const onTouchMove = (e: React.TouchEvent) => {
        const start = touchRef.current;
        if (!start) { disarmLongPress(); return; }
        const t = e.touches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        // 手指动了就不算长按（disarm 排在 locked 的 early-return 前面）
        if (Math.abs(dx) > LONG_PRESS_SLOP || Math.abs(dy) > LONG_PRESS_SLOP) disarmLongPress();
        if (start.locked) return;
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
        const lpFired = !!longPressRef.current?.fired;
        disarmLongPress();
        const start = touchRef.current;
        const dragging = draggingRef.current;
        const tapHit = tapHitRef.current;
        tapHitRef.current = null;
        touchRef.current = null;
        draggingRef.current = false;
        // 按在划线上的一下轻点：原生那下被我们吃掉了（不起选区），工具条这里补上。
        // 长按已经起了讨论面板的那次不算轻点。
        if (tapHit && !lpFired && start && !start.locked && !dragging) {
            const t = e.changedTouches[0];
            const moved = Math.abs(t.clientX - start.x) > LONG_PRESS_SLOP || Math.abs(t.clientY - start.y) > LONG_PRESS_SLOP;
            if (!moved) {
                suppressTapRef.current = true;      // 万一浏览器还是补了 click，别再走一遍
                window.getSelection()?.removeAllRanges();
                liveRef.current = null;
                openAnnBar(tapHit, start.x, start.y);
                return;
            }
        }
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
        disarmLongPress();
        tapHitRef.current = null;
        touchRef.current = null;
        draggingRef.current = false;
        snapBack();
    };

    const atEnd = book ? chapterIdx >= book.chapterCount - 1 && pageIdx >= pageCount - 1 : false;
    const percent = book ? bookPercent(chapterIdx, pageIdx, pageCount, book.chapterCount) : 0;

    /**
     * 段落色条：这一段里有人标注/讨论过，左侧就挂一条色柱。
     * 颜色按参与时间从上往下排；**≥3 人整条墨色**（她 09-15 定的）。
     * 一个 gradient 硬分段搞定——不在 `.rd-para` 里加任何节点（加了分页就炸）。
     */
    const barByPara = useMemo(() => {
        const out = new Map<number, string>();
        if (!chapter) return out;
        // 锚点是章内段号：先把这一章的数据滤出来，别在段落循环里重扫全书
        const mine = anns.filter((a) => a.kind !== 'bookmark' && a.chapterIdx === chapterIdx);
        const ths = threads.filter((t) => t.chapterIdx === chapterIdx);
        if (mine.length === 0 && ths.length === 0) return out;
        for (let i = 0; i < chapter.paras.length; i++) {
            const ps = participantsOfParagraph(mine, ths, i);
            if (ps.length === 0) continue;
            if (ps.length >= 3) {
                out.set(i, 'linear-gradient(to bottom, var(--rd-ink) 0 100%)');
                continue;
            }
            const stops = ps.map((p, k) => {
                const from = Math.round((k / ps.length) * 100);
                const to = Math.round(((k + 1) / ps.length) * 100);
                return `${highlightColorOf(prefs, p.ownerId)} ${from}% ${to}%`;
            });
            out.set(i, `linear-gradient(to bottom, ${stops.join(', ')})`);
        }
        return out;
    }, [chapter, anns, threads, chapterIdx, prefs]);
    const elapsedTotal = baseSecondsRef.current + Math.round((Date.now() - sessionStartRef.current) / 1000);
    /** 页脚那行时间（20 秒一跳的 tick 会让它自己走） */
    const nowD = new Date();
    const clockText = `${nowD.getHours()}:${String(nowD.getMinutes()).padStart(2, '0')}`;

    const jumpChapter = (idx: number) => {
        if (idx !== chapterIdx) recordReading({ pages: 1, chars: pageChars(), bookId });
        pendingRef.current = { chapterIdx: idx, page: 0 };
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
        pendingRef.current = { chapterIdx: ci, ratio: within };
        setChapterIdx(ci);
    };

    /** 从一条命中/书签回到它落的那一页 */
    const jumpToAnchor = (ci: number, paraIdx: number, charOffset: number) => {
        setSheet(null);
        pendingRef.current = { chapterIdx: ci, anchor: { paraIdx, charOffset } };
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
        // 段号是章内的 → 命中也要限定在**这一章**（不然第二章第 0 段会点到第一章那条线）
        return anns.find((a) => (a.kind === 'highlight' || a.kind === 'note')
            && a.chapterIdx === chapterIdx
            && (at.idx > a.anchor.startPara || (at.idx === a.anchor.startPara && off >= a.anchor.startOffset))
            && (at.idx < a.anchor.endPara || (at.idx === a.anchor.endPara && off <= a.anchor.endOffset))) ?? null;
    }, [anns, chapterIdx]);

    // 长按的回调里用它——存最新的那份，手势闭包就不用跟着 anns 重建
    useEffect(() => { hitAnnRef.current = hitAnnAt; }, [hitAnnAt]);

    /**
     * 划过线的字底下**不许再选字**（她 09-15 要的）：按在一条线上就把这一下的默认行为吃掉，
     * 于是手势落到的永远是「那条线」，不是底下的文字。
     * 必须挂原生非 passive 的监听——React 在根节点上把 touchstart 当 passive，synthetic
     * 事件里 preventDefault() 是不生效的（只会打一条 console 警告）。
     * 代价：这一下浏览器不会再补 click，所以轻点开工具条改由 touchend 自己补（见 onTouchEnd）。
     * 鼠标这边 preventDefault(mousedown) 只挡选区，不影响 click。
     */
    useEffect(() => {
        const vp = viewportRef.current;
        if (!vp) return;
        const onNativeTouchStart = (e: TouchEvent) => {
            tapHitRef.current = null;
            const t = e.touches[0];
            if (!t) return;
            const hit = hitAnnRef.current(t.clientX, t.clientY);
            if (!hit) return;
            e.preventDefault();
            tapHitRef.current = hit;
        };
        const onNativeMouseDown = (e: MouseEvent) => {
            if (hitAnnRef.current(e.clientX, e.clientY)) e.preventDefault();
        };
        vp.addEventListener('touchstart', onNativeTouchStart, { passive: false });
        vp.addEventListener('mousedown', onNativeMouseDown);
        return () => {
            vp.removeEventListener('touchstart', onNativeTouchStart);
            vp.removeEventListener('mousedown', onNativeMouseDown);
        };
    }, []);

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
            // 长按刚起过讨论面板：那一下带出来的选区不是「要划线」，别跟着划
            if (Date.now() < selSuppressUntilRef.current) { liveRef.current = null; return; }
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

    /**
     * 点中一条划线 → 出工具条。
     * 两条路都走它：鼠标走 viewport 的 onClick，手指走 touchend
     * （划线上的 touchstart 被我们 preventDefault 掉了，浏览器不补 click）。
     */
    const openAnnBar = (hit: RdAnnotation, x: number, y: number) => {
        setPanel(null);
        const rects = hitRectsOf(hit);
        const at = rects.length > 0
            ? barAt(rects)
            : { x: Math.max(120, Math.min(window.innerWidth - 120, x)), y: Math.max(140, y - 12) };
        setBar({ ...at, text: hit.anchor.text, anchor: hit.anchor, ann: hit });
        setBarColors(false);
    };

    /** 划线编辑里改这一条（颜色 / 线条类型都走它；没改过的还是 owner 那支笔） */
    const editAnn = async (patch: { color?: string; style?: RdAnnotationStyle }) => {
        if (!bar?.ann) return;
        await putAnnotation({ ...bar.ann, ...patch, updatedAt: new Date().toISOString() });
        await reloadAnns();
        setBar({ ...bar, ann: { ...bar.ann, ...patch } });
    };
    const recolourAnn = (hex: string) => void editAnn({ color: hex });

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
        // ⚠️ **必须按章过滤**：锚点里的段号是**章内**段号，不带章号的话
        // 第一章第 0 段划的线会在每一章的第 0 段都长出来（她 09-16 报的）。
        const marks = anns.filter((a) => (a.kind === 'highlight' || a.kind === 'note')
            && a.chapterIdx === chapterIdx
            && a.anchor.startPara < Number.MAX_SAFE_INTEGER);
        if (!flow || marks.length === 0) { setHlRects([]); return; }
        const origin = flowOrigin(flow);
        const out: Array<{ id: string; color: string; style: string; rects: Array<{ left: number; top: number; width: number; height: number }> }> = [];
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
            if (rects.length > 0) out.push({ id: a.id, color: a.color ?? highlightColorOf(prefs, a.ownerId), style: a.style ?? 'full', rects });
        }
        setHlRects(out);
        // charPrefs 进依赖：角色自己挑的笔色（penColor）变了，他划过的线要跟着换色
    }, [anns, chapter, step, layoutNonce, prefs.highlightColors, charPrefs]);

    // ── 书签：夹在当前这一页上，再点一次拿掉（参考图：夹上了右上角挂条红丝带） ──
    const markHere = useMemo(() => {
        if (!pageRange) return null;
        // 同上：书签也按章过滤，否则第一章夹的书签会在后面每章同一页都亮着
        return anns.find((a) => a.kind === 'bookmark'
            && a.chapterIdx === chapterIdx
            && a.anchor.startPara >= pageRange.from && a.anchor.startPara <= pageRange.to) ?? null;
    }, [anns, pageRange, chapterIdx]);
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

    /**
     * 「更多 → 分享」= 把这本书的**原文件**分享出去（她 09-26 深夜三：分享的是书的文件）。
     * 导入时那个 epub / txt 一直躺在本地库里（书行上的 fileRef），原封不动递出去，
     * 手机上是系统分享面板（能发给别人、也能存到文件），桌面是下载。
     */
    const shareBookFile = async () => {
        setSheet(null);
        if (!book) return;
        try {
            const blob = await getBlobForRef(book.fileRef);
            if (!blob) { notify('这本书的原文件找不到了'); return; }
            const name = book.sourceFileName?.trim()
                || `${book.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)}.${book.format === 'epub' ? 'epub' : 'txt'}`;
            const r = await shareOrDownloadBlob({ blob, fileName: name, shareTitle: book.title });
            notify(r === 'shared' ? '分享出去了' : r === 'downloaded' ? '存到本地了' : '先不分享了');
        } catch (err) {
            notify(`没分享成：${err instanceof Error ? err.message : '未知错误'}`);
        }
    };

    const moreItems: Array<{ key: string; label: string; on: boolean; run: () => void }> = useMemo(() => [
        { key: 'read', label: '听书', on: false, run: () => notify('听书还没做，先欠着') },
        { key: 'auto', label: '自动翻页', on: false, run: () => notify('自动翻页还没做，先欠着') },
        { key: 'stat', label: '统计', on: true, run: () => { setSheet(null); onOpenStats(); } },
        { key: 'share', label: '分享', on: true, run: () => void shareBookFile() },
        { key: 'detail', label: '书本详情', on: true, run: () => { setSheet(null); onOpenDetails(bookId); } },
        { key: 'hl', label: '划线设置', on: true, run: () => setSheet('hl') },
        { key: 'style', label: '排版设置', on: true, run: () => { setSheet(null); setPanel('style'); } },
        { key: 'theme', label: '背景主题', on: true, run: () => { setSheet(null); setPanel('theme'); } },
        // book 进依赖：分享那颗要拿它的 fileRef，书是后加载进来的，不进依赖会一直拿到 null
    ], [notify, onOpenDetails, onOpenStats, bookId, book]);

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
        // 「打开书」这一步的聚焦式转场（她 09-21 定，T7④）：阅读页是整屏页，旧页（书架）
        // 那一整棵 .rd-body 都卸载了，没有旧页可留——所以走 index.html 里的一次性版
        // （page-focus-once：只聚焦淡入、不淡透明度，免得开头露一帧空底）。
        // 阅读页每次都是新挂的（键里带 bookId），所以这个 class 一上来就播一次，正好。
        <div className="rd-reader page-focus-once" data-rd-page="reader" ref={rootRef}>
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
                        {/* 一个人读 → 挂他的头像；**两个人以上 → 头像 + 人数**（她 09-20 给的样子） */}
                        {coReadMany ? (
                            <button
                                className="rd-icon-btn rd-coread-stack"
                                aria-label={`一起读书 · ${coReadCount} 个人`}
                                onClick={() => { setPanel(null); setSheet('coread'); }}
                            >
                                {coReadChar && <TokenImg value={coReadChar.avatar} className="rd-coread-stack-face" />}
                                <span className="rd-coread-stack-second">
                                    {coReadSecond && <TokenImg value={coReadSecond.avatar} className="rd-coread-stack-face" />}
                                    <span className="rd-coread-stack-count">{coReadCount}</span>
                                </span>
                            </button>
                        ) : coReadChar ? (
                            <button
                                className="rd-icon-btn"
                                aria-label={`一起读书 · ${coReadChar.name}`}
                                onClick={() => { setPanel(null); setSheet('coread'); }}
                            >
                                <TokenImg value={coReadChar.avatar} className="rd-coread-avatar-img" />
                            </button>
                        ) : (
                            <button
                                className="rd-icon-btn"
                                aria-label="一起读书"
                                onClick={() => { setPanel(null); setSheet('coread'); }}
                            >
                                <UsersThree size={19} />
                            </button>
                        )}
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
                    // 讨论面板开着：点外面的那一下只负责关面板，不许再拿它翻页（她 09-16）
                    if (discuss) return;
                    // 选字那一下松手后浏览器会补一次点击：那不是在翻页
                    if (suppressTapRef.current) { suppressTapRef.current = false; return; }
                    // 点在一条已有的划线上：出工具栏（复制 / 笔记 / 搜索 / 分享 / 删掉 + 改这条的颜色）
                    window.getSelection()?.removeAllRanges();
                    liveRef.current = null;
                    const hit = hitAnnAt(e.clientX, e.clientY);
                    if (hit) {
                        openAnnBar(hit, e.clientX, e.clientY);
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
                            {chapter?.paras.map((p, i) => {
                                const bar = barByPara.get(i);
                                return (
                                    <p
                                        className="rd-para"
                                        key={i}
                                        data-para-idx={i}
                                        data-rd-bar={bar ? '' : undefined}
                                        style={bar ? ({ '--rd-bar': bar } as CSSProperties) : undefined}
                                    >
                                        {isImagePara(p) ? <ReaderFigure refText={p} /> : p}
                                    </p>
                                );
                            })}
                        </div>
                        <div className="rd-hl-layer" aria-hidden>
                            {hlRects.map((h) => h.rects.map((r, i) => (
                                <div
                                    key={`${h.id}-${i}`}
                                    className={`rd-hl-rect${h.style === 'full' ? '' : ` rd-hl-rect-line rd-hl-rect-${h.style}`}${bar?.ann?.id === h.id ? ' rd-hl-rect-tap' : ''}`}
                                    style={{
                                        left: r.left, top: r.top, width: r.width, height: r.height,
                                        color: h.color,
                                        background: h.style === 'full'
                                            ? `rgba(${hexTriple(h.color)}, 0.32)`
                                            : (h.style === 'half'
                                                ? `linear-gradient(to bottom, transparent 50%, rgba(${hexTriple(h.color)}, 0.32) 50%)`
                                                : undefined),
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

                    {/* 右下角那个「剩余 X 分读完」的倒计时她 09-16 让删了——只留阅读时长 */}
                    <div className="rd-reader-stat">
                        <span>阅读时长 {fmtDuration(elapsedTotal)}</span>
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
                                    // 锚点里的段号是**章内**段号，不能拿去查全书表（她 09-16：
                                    // 「第二章做的笔记，定位显示成封面」就是这么来的）——
                                    // 章号以批注自己存的 chapterIdx 为准，老的没存才退回查表。
                                    const ci = a.chapterIdx ?? chapterOfPara(a.anchor.startPara);
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

                        {/* ── 点中一条划线的工具条（照 #27/#28：深色六格）。
                「我的颜色」那格换成**划线图标**——点开是这个样子的颜色排（#29），
                改的是**这一条**的颜色；不自带眼影盘，一眼就看得出它管什么。 ── */}
            {bar?.ann && (
                <div
                    className="rd-bar-wrap"
                    data-rd-page="annedit"
                    style={{ left: bar.x, top: bar.y }}
                    onMouseDown={(e) => e.preventDefault()}
                    onTouchStart={(e) => e.stopPropagation()}
                >
                    {barColors && (
                        <div className="rd-bar-tb-colors">
                            {/* 线条类型（她点的四种，顺序照她的参考图）：下划线 / 波浪线 / 一半 / 完整 */}
                            <div className="rd-bar-tb-styles">
                                {([['underline', '下划线'], ['wavy', '波浪线'], ['half', '一半'], ['full', '完整']] as Array<[RdAnnotationStyle, string]>).map(([k, label]) => (
                                    <button
                                        key={k}
                                        aria-label={label}
                                        className={`rd-bar-tb-type${(bar.ann!.style ?? 'full') === k ? ' rd-bar-tb-type-on' : ''}`}
                                        onClick={() => void editAnn({ style: k })}
                                    >
                                        <span className={`rd-type-glyph rd-type-${k}`}>A</span>
                                    </button>
                                ))}
                            </div>
                            {/* 这条的颜色：**照情侣页调色台**——原生取色框，点开系统色轮随便调
                                （她 09-16：原来那排固定色卡换成这个调法） */}
                            <label className="rd-bar-tb-pick">
                                <span>这条</span>
                                <input
                                    className="rd-color-in"
                                    type="color"
                                    aria-label="这条划线的颜色"
                                    value={bar.ann!.color ?? highlightColorOf(prefs, 'user')}
                                    onChange={(e) => void recolourAnn(e.target.value)}
                                />
                            </label>
                        </div>
                    )}
                    <div className="rd-bar-tb">
                        <button
                            className="rd-bar-tb-item"
                            onClick={() => {
                                void copyToClipboard(bar.text).then((ok) => notify(ok ? '复制好了' : '没复制上，再试一次'));
                            }}
                        >
                            <Copy size={18} weight="bold" /><span>复制</span>
                        </button>
                        {/* 分享书摘（她 09-26）：拿这条划线做一张能存成图片的卡片。
                            点开先把工具条收掉——不然它压在卡片上面。 */}
                        <button
                            className="rd-bar-tb-item"
                            onClick={() => {
                                setSharing({ quote: bar.text, note: bar.ann?.note, at: bar.ann?.createdAt });
                                setBar(null);
                            }}
                        >
                            <ShareNetwork size={18} weight="bold" /><span>分享书摘</span>
                        </button>
                        <button
                            className="rd-bar-tb-item"
                            aria-label="划线颜色"
                            onClick={() => setBarColors((v) => !v)}
                        >
                            <Highlighter size={18} weight="bold" /><span>划线</span>
                        </button>
                        <button className="rd-bar-tb-item" onClick={() => void dropAnn()}>
                            <Trash size={18} weight="bold" /><span>删掉</span>
                        </button>
                    </div>
                </div>
            )}

            {/* ── 讨论面板（长按划线拉起来；写想法/讨论两个旧按钮并到这里） ── */}
            {discuss && book && chapter && (
                <ReaderDiscuss
                    book={book}
                    chapterIdx={chapterIdx}
                    chapterTitle={chapter.title}
                    chapterParas={chapter.paras}
                    percent={percent}
                    ann={discuss}
                    notify={notify}
                    onClose={() => setDiscuss(null)}
                    onChanged={() => void reloadAnns()}
                />
            )}

            {/* ── 书摘分享卡（工具条上的「分享书摘」拉起来的） ── */}
            {sharing && book && chapter && (
                <ShareCardSheet
                    book={book}
                    quote={sharing.quote}
                    note={sharing.note}
                    chapterTitle={chapter.title}
                    date={shareDayOf(sharing.at)}
                    notify={notify}
                    onClose={() => setSharing(null)}
                />
            )}


            {/* ── 一起读书（共读会话；右上角那枚图标拉起来的） ── */}
            {sheet === 'coread' && book && chapter && pageRange && (
                <ReaderCoRead
                    book={book}
                    chapterIdx={chapterIdx}
                    chapterTitle={chapter.title}
                    pageParas={chapter.paras
                        .slice(pageRange.from, pageRange.to + 1)
                        .map((t, i) => ({ paraIdx: pageRange.from + i, text: t }))}
                    chapterParas={chapter.paras}
                    /* 「每次读几页」要往后多给几页的正文。页段数按当前页估——够稳，
                       反正是给模型读文本，不需要跟分栏严丝合缝对齐。 */
                    parasAhead={(pages) => {
                        const perPage = Math.max(1, pageRange.to - pageRange.from + 1);
                        const to = Math.min(chapter.paras.length - 1, pageRange.to + Math.max(0, pages - 1) * perPage);
                        return chapter.paras.slice(pageRange.from, to + 1)
                            .map((t, i) => ({ paraIdx: pageRange.from + i, text: t }));
                    }}
                    /* 你眼下翻到第几页 / 本章一共几页——活动记录里写「读了第几页到第几页」用 */
                    pageNo={pageIdx + 1}
                    pageCount={pageCount}
                    percent={percent}
                    notify={notify}
                    onClose={() => setSheet(null)}
                    onChanged={() => void reloadAnns()}
                    pickedCharIds={coReadPicks}
                    onPick={setCoReadPicks}
                />
            )}

        </div>
    );
}

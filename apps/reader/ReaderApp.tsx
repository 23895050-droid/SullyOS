// 读书模块 · 外壳（2026-09-14 立项 / 2026-09-15 UI 轮重写）
//
// 一级导航五项：书架 / 笔记 / 书库 / 统计 / 设置（v3 §4.0）。阅读页与书详情从书架进，不占 tab。
// 外面进来的三个入口都走同一条深链（sessionStorage 标记，照音乐 App 的
// sully_music_open_player 先例）：'shelf' | 'notes' | 'library' | 'stats' | 'settings' | 'book:<id>'。
// 换句话说，情侣空间那三张卡跳进来用的是**既有路由**，不是另做一套简化视图（v3 §4.7）。
//
// 层级：书架/笔记/书库/统计/设置 装在 .rd-body 里，下面挂 .rd-nav；
// 阅读页与书详情是整屏页（盖住导航，参考图里这两页都没有底部导航）。

import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChartBar, Gear, NoteBlank, SquaresFour } from '@phosphor-icons/react';
import ReaderSkinPreset from './ReaderSkinPreset';
import ReaderPage from './ReaderPage';
import ReaderJobPill from './ReaderJobPill';
import BookDetails from './BookDetails';
import ImportSheet from './ImportSheet';
import ReaderShelf from './tabs/ReaderShelf';
import ReaderNotes from './tabs/ReaderNotes';
import ReaderLibrary from './tabs/ReaderLibrary';
import CharPage from './CharPage';
import ActivityPage from './ActivityPage';
import ReaderStats from './tabs/ReaderStats';
import ReaderSettings, { type SettingsPage } from './tabs/ReaderSettings';
import { useReaderPrefs, setLastBook } from './readerPrefs';
import { sweepStaleImports } from '../../utils/reader/readerDb';
import { consumeReaderDeepLink, READER_DEEPLINK_KEY, type ReaderDeepLink } from './readerDeepLink';

export { READER_DEEPLINK_KEY, openReaderAt } from './readerDeepLink';

type TabKey = 'shelf' | 'notes' | 'library' | 'stats' | 'settings';

const TABS: Array<{ key: TabKey; label: string; Icon: typeof BookOpen }> = [
    { key: 'shelf', label: '书架', Icon: BookOpen },
    { key: 'notes', label: '笔记', Icon: NoteBlank },
    { key: 'library', label: '书库', Icon: SquaresFour },
    { key: 'stats', label: '统计', Icon: ChartBar },
    { key: 'settings', label: '设置', Icon: Gear },
];

interface Props {
    onBack?: () => void;
}

export default function ReaderApp({ onBack }: Props) {
    const prefs = useReaderPrefs();
    /**
     * 页签的两块格子：a 出生就是书架，b 空着等第一次切换。见下面 setTab 那段注释。
     * 不直接存 `tab`——存的是「哪一格装着谁、谁在上面」，这样旧页才不会被卸载。
     */
    const [layers, setLayers] = useState<{ a: TabKey; b: TabKey | null; top: 'a' | 'b' }>({ a: 'shelf', b: null, top: 'a' });
    /** 交叉转场进行中（旧页失焦 + 新页聚焦，~490ms） */
    const [fading, setFading] = useState(false);
    /** 从整屏页退回来那一下的一次性聚焦（没有旧页可留，见 showTab） */
    const [focusOnce, setFocusOnce] = useState(false);
    const fadeTimer = useRef<number | null>(null);
    const focusTimer = useRef<number | null>(null);
    const tab: TabKey = (layers.top === 'a' ? layers.a : layers.b) ?? layers.a;
    /** 正在读的书（整屏阅读页） */
    const [reading, setReading] = useState<string | null>(null);
    /** 「查看原文」的落点（章内章号 + 章内段号）；不设就是照常恢复上次读到哪 */
    const [startAt, setStartAt] = useState<{ chapterIdx: number; paraIdx: number } | null>(null);
    /** 正在看的书详情（整屏书信息页） */
    const [details, setDetails] = useState<string | null>(null);
    /** 正在看的角色个人页（整屏；从书库页点谁进谁） */
    const [charPage, setCharPage] = useState<string | null>(null);
    /** 从哪儿进的他的页面（设置页进来的，返回要回设置页；默认回书库） */
    const [charFrom, setCharFrom] = useState<'library' | 'settings'>('library');
    const [charView, setCharView] = useState<'main' | 'settings' | 'api'>('main');
    /** 设置页停在哪个内页（进他的页面再回来还在那一页） */
    const [setPage, setSetPage] = useState<SettingsPage>('root');
    /** 活动记录整屏页（书库页的「查看全部」翻进来） */
    const [actPage, setActPage] = useState(false);
    const [refreshToken, setRefreshToken] = useState(0);
    const [toast, setToast] = useState<string | null>(null);
    const [importOpen, setImportOpen] = useState(false);
    /** 书详情里点「删除」后要回落书架 */
    const [detailNonce, setDetailNonce] = useState(0);

    const notify = (msg: string) => setToast(msg);

    useEffect(() => {
        if (!toast) return;
        const t = window.setTimeout(() => setToast(null), 2400);
        return () => window.clearTimeout(t);
    }, [toast]);

    /**
     * 页签切换 = **聚焦式转场**（她 09-21 定，T7④）：旧页失焦淡出 → 新页聚焦淡入，零位移。
     *
     * 做法是两块格子轮流坐庄（见上面 `layers`）：新页进**底下那格**，然后把 top 翻过去。
     * 关键是**旧页不卸载**——它还在原来那一格、还是原来那棵树，只是从「现行」变成了「上一页」，
     * 换的只是 class。所以它的数据和滚动位置都留着。
     * （反过来做——把旧页重新渲染一遍当背景——不行：重挂一次要重新读库，
     *   会先闪一帧空的，那是闪屏不是转场。）
     */
    const setTab = (next: TabKey) => {
        if (next === tab) return;
        const bottom: 'a' | 'b' = layers.top === 'a' ? 'b' : 'a';
        setLayers(bottom === 'a' ? { ...layers, a: next, top: 'a' } : { ...layers, b: next, top: 'b' });
        setFocusOnce(false);
        setFading(true);
        if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
        // 460ms 是两段动画加起来（260 淡出 / 120 错开 + 340 淡入），多给一点收尾
        fadeTimer.current = window.setTimeout(() => setFading(false), 490);
    };

    /**
     * 直接显示某一页、**不跟旧页交叉**。两处用它：
     *   · 深链开局（跳进来就落在某页，那一下不该是「切换」）
     *   · 从整屏页（阅读页 / 书详情 / 角色页 / 活动页）退回来——那边整棵 .rd-body 都卸载了，
     *     没有旧页可留，重挂的旧页会闪一帧空的。
     * 所以走 index.html 里那个「一次性聚焦」版（`page-focus-once`）：只聚焦淡入、不淡透明度，
     * 免得开头露一帧空底。（打开书那个方向是 ReaderPage 自己套的同一招。）
     */
    const showTab = (next: TabKey) => {
        setLayers({ a: next, b: null, top: 'a' });
        setFading(false);
        setFocusOnce(true);
        if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
        if (focusTimer.current) window.clearTimeout(focusTimer.current);
        focusTimer.current = window.setTimeout(() => setFocusOnce(false), 420);
    };

    useEffect(() => () => {
        if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
        if (focusTimer.current) window.clearTimeout(focusTimer.current);
    }, []);

    // 深链：跳进来直接落到该到的页
    useEffect(() => {
        const target: ReaderDeepLink | null = consumeReaderDeepLink();
        if (!target) return;
        if (target === 'continue') {
            // 「在读的那本书」：继续上次读的；没有就落书架
            const last = prefs.lastBookId;
            if (last) setReading(last);
            else showTab('shelf');
            return;
        }
        if (target.startsWith('book:')) {
            // book:<id>@<章内章号>:<章内段号> —— 「查看原文」可以直接落在一句话上
            const [id, at] = target.slice(5).split('@');
            if (at) {
                const [c, p] = at.split(':').map(Number);
                if (Number.isFinite(c) && Number.isFinite(p)) setStartAt({ chapterIdx: c, paraIdx: p });
            }
            setReading(id);
        }
        else if (TABS.some((t) => t.key === target)) showTab(target as TabKey);
        // 只在挂载时跑一次：prefs 变化不该重新跳页
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 启动清扫：上次被杀掉的半截导入不该永远占着地方
    const sweptRef = useMemo(() => ({ done: false }), []);
    useEffect(() => {
        if (sweptRef.done) return;
        sweptRef.done = true;
        void sweepStaleImports().then((ids) => {
            if (ids.length > 0) notify(`清掉了 ${ids.length} 本没导完的书`);
        });
    }, [sweptRef]);

    const openBook = (bookId: string) => {
        setStartAt(null);          // 普通打开：照常恢复上次读到哪
        setReading(bookId);
        setLastBook(bookId);
    };

    const openBookFrom = (bookId: string) => {
        setDetails(null);
        openBook(bookId);
    };

    /** 落到书里某一句话上（笔记页和角色个人页的「查看原文」都走它） */
    const openAt = (bookId: string, chapterIdx: number, paraIdx: number) => {
        setStartAt({ chapterIdx, paraIdx });
        setReading(bookId);
        setLastBook(bookId);
    };

    const refresh = () => setRefreshToken((n) => n + 1);

    const rootClass = `rd-root${prefs.cssGlobal || Object.keys(prefs.cssPages || {}).length ? ' rd-user' : ''}`;

    // ── 整屏页：阅读 ──
    if (reading) {
        return (
            <div className={rootClass}>
                <ReaderSkinPreset />
                <ReaderPage
                    key={`${reading}${startAt ? `@${startAt.chapterIdx}:${startAt.paraIdx}` : ''}`}
                    bookId={reading}
                    startAt={startAt}
                    notify={notify}
                    onOpenDetails={(id) => { setReading(null); setDetails(id); }}
                    onOpenStats={() => { setReading(null); showTab('stats'); }}
                    // 退出这本书 → 回书架（别往 app 外退：这行以前连调了 app 级 onBack，
                    // 点一次直接退到手机桌面。她 2026-09-15 报的）
                    onBack={() => { setReading(null); showTab('shelf'); refresh(); }}
                />
                <ReaderJobPill />
                {toast && <div className="rd-toast">{toast}</div>}
            </div>
        );
    }

    // ── 整屏页：角色个人页 ──
    if (charPage) {
        return (
            <div className={rootClass}>
                <ReaderSkinPreset />
                <CharPage
                    charId={charPage}
                    initialView={charView}
                    notify={notify}
                    onBack={() => { setCharPage(null); showTab(charFrom === 'settings' ? 'settings' : 'library'); refresh(); }}
                    onOpenAt={(bookId, chapterIdx, paraIdx) => {
                        setCharPage(null);
                        openAt(bookId, chapterIdx, paraIdx);
                    }}
                />
                <ReaderJobPill />
                {toast && <div className="rd-toast">{toast}</div>}
            </div>
        );
    }

    // ── 整屏页：活动记录 ──
    if (actPage) {
        return (
            <div className={rootClass}>
                <ReaderSkinPreset />
                <ActivityPage notify={notify} onBack={() => { setActPage(false); showTab('library'); refresh(); }} />
                <ReaderJobPill />
                {toast && <div className="rd-toast">{toast}</div>}
            </div>
        );
    }

    // ── 整屏页：书详情 ──
    if (details) {
        return (
            <div className={rootClass}>
                <ReaderSkinPreset />
                <BookDetails
                    key={`${details}-${detailNonce}`}
                    bookId={details}
                    notify={notify}
                    onRead={openBookFrom}
                    onDeleted={() => { setDetails(null); refresh(); }}
                    onBack={() => { setDetails(null); refresh(); }}
                />
                <ReaderJobPill />
                {toast && <div className="rd-toast">{toast}</div>}
            </div>
        );
    }

    /** 五个页签各自的正文（两块格子都用它渲染，所以抽出来） */
    const tabView = (key: TabKey) => (
        <>
            {key === 'shelf' && (
                <ReaderShelf
                    onOpenBook={openBook}
                    onOpenDetails={(id) => setDetails(id)}
                    notify={notify}
                    refreshToken={refreshToken}
                    onChanged={refresh}
                    onExit={onBack}
                />
            )}
            {key === 'notes' && <ReaderNotes onOpenAt={openAt} notify={notify} />}
            {key === 'library' && (
                <ReaderLibrary
                    onOpenChar={(id) => { setCharFrom('library'); setCharView('main'); setCharPage(id); }}
                    onOpenActs={() => setActPage(true)}
                    notify={notify}
                />
            )}
            {key === 'stats' && <ReaderStats refreshToken={refreshToken} />}
            {key === 'settings' && (
                <ReaderSettings
                    notify={notify}
                    page={setPage}
                    onPage={setSetPage}
                    onOpenChar={(id, view) => { setCharFrom('settings'); setCharView(view ?? 'settings'); setCharPage(id); }}
                />
            )}
        </>
    );

    /**
     * 一层格子。`top` 那层是现行页，绝对定位浮在上面；另一层是刚翻过去的那一页，
     * 留在流里、转场时失焦淡出，转场完了 `visibility:hidden` **藏而不卸**（位置和数据都留住）。
     * 注意：两层都**不给 z-index**——绝对定位本来就画在流内内容之上，够用了；
     * 一给 z-index 就开了新的层叠上下文，弹卡（fixed）会被关进去。
     */
    const renderLayer = (which: 'a' | 'b') => {
        const key = which === 'a' ? layers.a : layers.b;
        if (!key) return null;
        const isTop = layers.top === which;
        const cls = isTop
            ? `rd-tab rd-tab-top${fading ? ' page-focus' : focusOnce ? ' page-focus-once' : ''}`
            : `rd-tab rd-tab-ghost${fading ? ' page-defocus' : ' rd-tab-hidden'}`;
        return <div key={which} className={cls}>{tabView(key)}</div>;
    };

    return (
        <div className={rootClass}>
            <ReaderSkinPreset />
            <ReaderJobPill />

            <div className="rd-body">
                {renderLayer('a')}
                {renderLayer('b')}
            </div>

            <nav className="rd-nav">
                {TABS.map(({ key, label, Icon }) => (
                    <button
                        key={key}
                        className={`rd-nav-btn${tab === key ? ' rd-nav-on' : ''}`}
                        onClick={() => setTab(key)}
                    >
                        <Icon size={24} weight={tab === key ? 'fill' : 'regular'} />
                        <span>{label}</span>
                    </button>
                ))}
            </nav>

            {toast && <div className="rd-toast">{toast}</div>}
            {importOpen && (
                <ImportSheet
                    onClose={() => setImportOpen(false)}
                    onImported={(id) => { setImportOpen(false); openBook(id); }}
                />
            )}
        </div>
    );
}

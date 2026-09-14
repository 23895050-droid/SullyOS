// 读书模块 · 外壳（2026-09-14 立项 / 2026-09-15 UI 轮重写）
//
// 一级导航五项：书架 / 笔记 / 书库 / 统计 / 设置（v3 §4.0）。阅读页与书详情从书架进，不占 tab。
// 外面进来的三个入口都走同一条深链（sessionStorage 标记，照音乐 App 的
// sully_music_open_player 先例）：'shelf' | 'notes' | 'library' | 'stats' | 'settings' | 'book:<id>'。
// 换句话说，情侣空间那三张卡跳进来用的是**既有路由**，不是另做一套简化视图（v3 §4.7）。
//
// 层级：书架/笔记/书库/统计/设置 装在 .rd-body 里，下面挂 .rd-nav；
// 阅读页与书详情是整屏页（盖住导航，参考图里这两页都没有底部导航）。

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChartBar, Gear, NoteBlank, SquaresFour } from '@phosphor-icons/react';
import ReaderSkinPreset from './ReaderSkinPreset';
import ReaderPage from './ReaderPage';
import BookDetails from './BookDetails';
import ImportSheet from './ImportSheet';
import ReaderShelf from './tabs/ReaderShelf';
import ReaderNotes from './tabs/ReaderNotes';
import ReaderLibrary from './tabs/ReaderLibrary';
import ReaderStats from './tabs/ReaderStats';
import ReaderSettings from './tabs/ReaderSettings';
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
    const [tab, setTab] = useState<TabKey>('shelf');
    /** 正在读的书（整屏阅读页） */
    const [reading, setReading] = useState<string | null>(null);
    /** 正在看的书详情（整屏书信息页） */
    const [details, setDetails] = useState<string | null>(null);
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

    // 深链：跳进来直接落到该到的页
    useEffect(() => {
        const target: ReaderDeepLink | null = consumeReaderDeepLink();
        if (!target) return;
        if (target === 'continue') {
            // 「在读的那本书」：继续上次读的；没有就落书架
            const last = prefs.lastBookId;
            if (last) setReading(last);
            else setTab('shelf');
            return;
        }
        if (target.startsWith('book:')) setReading(target.slice(5));
        else if (TABS.some((t) => t.key === target)) setTab(target as TabKey);
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
        setReading(bookId);
        setLastBook(bookId);
    };

    const openBookFrom = (bookId: string) => {
        setDetails(null);
        openBook(bookId);
    };

    const refresh = () => setRefreshToken((n) => n + 1);

    const rootClass = `rd-root${prefs.cssGlobal || Object.keys(prefs.cssPages || {}).length ? ' rd-user' : ''}`;

    // ── 整屏页：阅读 ──
    if (reading) {
        return (
            <div className={rootClass}>
                <ReaderSkinPreset />
                <ReaderPage
                    bookId={reading}
                    notify={notify}
                    onOpenDetails={(id) => { setReading(null); setDetails(id); }}
                    onOpenStats={() => { setReading(null); setTab('stats'); }}
                    onBack={() => { setReading(null); refresh(); if (onBack) onBack(); }}
                />
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
                {toast && <div className="rd-toast">{toast}</div>}
            </div>
        );
    }

    return (
        <div className={rootClass}>
            <ReaderSkinPreset />

            <div className="rd-body">
                {tab === 'shelf' && (
                    <ReaderShelf
                        onOpenBook={openBook}
                        onOpenDetails={(id) => setDetails(id)}
                        notify={notify}
                        refreshToken={refreshToken}
                        onChanged={refresh}
                    />
                )}
                {tab === 'notes' && <ReaderNotes />}
                {tab === 'library' && <ReaderLibrary />}
                {tab === 'stats' && <ReaderStats refreshToken={refreshToken} />}
                {tab === 'settings' && <ReaderSettings />}
            </div>

            <nav className="rd-nav">
                {TABS.map(({ key, label, Icon }) => (
                    <button
                        key={key}
                        className={`rd-nav-btn${tab === key ? ' rd-nav-on' : ''}`}
                        onClick={() => setTab(key)}
                    >
                        <Icon size={21} weight={tab === key ? 'fill' : 'regular'} />
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

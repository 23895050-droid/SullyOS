// 读书模块 · 书架（2026-09-14 立项 / 2026-09-15 UI 轮重写）
//
// 参考图版式：大标题 + 右上角搜索/导入 → 筛选胶囊（全部 / 在读 / 读完 / 未读）
// → 三列封面网格（封面 / 书名 / 作者 / 「进度% ——条—— 章节%」）。
// 第二版式「横向卡片」走 prefs.shelfLayout，切换即时生效（V8）。
// 长按卡片 → 书详情 / 换编码重解 / 删除。
//
// 两个百分比的口径：左 = 全书进度（rd_progress.percent），右 = 读到的章节位置
// （chapterIdx / chapterCount）——参考图里那两个数就是一本书的两种进度。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, MagnifyingGlass, Plus, X } from '@phosphor-icons/react';
import { deleteBookDeep, getProgress, listBooks, type RdBook, type RdProgress } from '../../../utils/reader/readerDb';
import { useReaderPrefs } from '../readerPrefs';
import ImportSheet from '../ImportSheet';
import ReaderCover from '../ReaderCover';

interface Props {
    onOpenBook: (bookId: string) => void;
    onOpenDetails: (bookId: string) => void;
    notify: (msg: string) => void;
    /** 已导入但还没打开：书架自己刷新（ReaderApp 传自增的号） */
    refreshToken: number;
    onChanged: () => void;
}

type Filter = 'all' | 'reading' | 'done' | 'unread';

const FILTERS: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: '全部' },
    { key: 'reading', label: '在读' },
    { key: 'done', label: '读完' },
    { key: 'unread', label: '未读' },
];

/** 本章读到哪了：全书进度反推章内比例（percent 本身 = (章号 + 章内比例) / 章数） */
const chapterPercent = (b: RdBook, p?: RdProgress | null): number => {
    if (!p || b.chapterCount <= 0) return 0;
    const within = (p.percent ?? 0) * (b.chapterCount / 100) - (p.chapterIdx ?? 0);
    return Math.max(0, Math.min(100, Math.round(within * 100)));
};

export default function ReaderShelf({ onOpenBook, onOpenDetails, notify, refreshToken, onChanged }: Props) {
    const prefs = useReaderPrefs();
    const [books, setBooks] = useState<RdBook[]>([]);
    const [prog, setProg] = useState<Record<string, RdProgress | null>>({});
    const [filter, setFilter] = useState<Filter>('all');
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [importOpen, setImportOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [menuBook, setMenuBook] = useState<RdBook | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<RdBook | null>(null);
    /** 换编码重解：把存住的原文件取出来，用新编码重导入 */
    const [reparse, setReparse] = useState<{ book: RdBook; file: File } | null>(null);
    const pressRef = useRef<{ timer: number | null; fired: boolean }>({ timer: null, fired: false });

    const reload = useCallback(async () => {
        const list = await listBooks();
        setBooks(list);
        const pairs = await Promise.all(list.map(async (b) => {
            const p = await getProgress(b.id, 'user');
            return [b.id, p] as const;
        }));
        setProg(Object.fromEntries(pairs));
    }, []);

    useEffect(() => { void reload(); }, [reload, refreshToken]);

    const startPress = (book: RdBook) => {
        pressRef.current.fired = false;
        pressRef.current.timer = window.setTimeout(() => {
            pressRef.current.fired = true;
            setMenuBook(book);
        }, 520);
    };
    const endPress = () => {
        if (pressRef.current.timer) window.clearTimeout(pressRef.current.timer);
    };

    const doDelete = async (book: RdBook) => {
        setConfirmDelete(null);
        setMenuBook(null);
        await deleteBookDeep(book.id);
        notify('删掉了，书上的批注也一起清了');
        await reload();
        onChanged();
    };

    const openReparse = async (book: RdBook) => {
        setMenuBook(null);
        const { getBlobForRef } = await import('../../../utils/blobRef');
        const blob = await getBlobForRef(book.fileRef);
        if (!blob) { notify('原文件已经不在了，请重新选一次文件'); return; }
        setReparse({ book, file: new File([blob], book.sourceFileName, { type: blob.type || 'text/plain' }) });
    };

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return books.filter((b) => {
            if (q) {
                const hay = `${b.title} ${b.customAuthor || b.author || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            const pct = Math.round(prog[b.id]?.percent ?? 0);
            if (filter === 'reading') return pct > 0 && pct < 99;
            if (filter === 'done') return pct >= 99;
            if (filter === 'unread') return pct === 0;
            return true;
        });
    }, [books, prog, filter, query]);

    const readingCount = books.filter((b) => {
        const pct = Math.round(prog[b.id]?.percent ?? 0);
        return pct > 0 && pct < 99;
    }).length;

    const gridClass = prefs.shelfLayout === 'list' ? 'rd-grid-list' : 'rd-grid';

    const card = (book: RdBook) => {
        const p = prog[book.id];
        const pct = Math.round(p?.percent ?? 0);
        const chPct = chapterPercent(book, p);
        return (
            <button
                key={book.id}
                className="rd-book"
                onClick={() => { if (!pressRef.current.fired) onOpenBook(book.id); }}
                onTouchStart={() => startPress(book)}
                onTouchEnd={endPress}
                onTouchMove={endPress}
                onContextMenu={(e) => { e.preventDefault(); setMenuBook(book); }}
            >
                <div className="rd-book-cover">
                    <ReaderCover coverRef={book.coverRef} title={book.title} compact={prefs.shelfLayout === 'list'} />
                </div>
                <div className="rd-book-meta">
                    <div className="rd-book-title">{book.title}</div>
                    <div className="rd-book-author">{book.customAuthor || book.author || book.format.toUpperCase()}</div>
                    <div className="rd-book-prog">
                        <span className="rd-book-pct">{pct}%</span>
                        <div className="rd-bar"><div className="rd-bar-fill" style={{ width: `${pct}%` }} /></div>
                        <span className="rd-book-pct">{chPct}%</span>
                    </div>
                </div>
            </button>
        );
    };

    return (
        <div className="rd-screen" data-rd-page="shelf">
            <div className="rd-head">
                <div className="rd-head-main">
                    <div className="rd-head-title">书架</div>
                    <div className="rd-head-sub">{books.length} 本 · 在读 {readingCount} 本</div>
                </div>
                <div className="rd-head-actions">
                    <button
                        className="rd-icon-btn"
                        onClick={() => { setSearchOpen((v) => !v); setQuery(''); }}
                        aria-label="搜索"
                    >
                        {searchOpen ? <X size={19} /> : <MagnifyingGlass size={19} />}
                    </button>
                    <button className="rd-icon-btn" onClick={() => setImportOpen(true)} aria-label="导入书籍">
                        <Plus size={20} />
                    </button>
                </div>
            </div>

            {searchOpen && (
                <input
                    className="rd-field"
                    style={{ marginBottom: 'var(--rd-space-3)' }}
                    placeholder="搜书名或作者"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                />
            )}

            {books.length > 0 && (
                <div className="rd-chips">
                    {FILTERS.map((f) => (
                        <button
                            key={f.key}
                            className={`rd-chip${filter === f.key ? ' rd-chip-on' : ''}`}
                            onClick={() => setFilter(f.key)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            )}

            {books.length === 0 ? (
                <div className="rd-empty">
                    <BookOpen size={44} weight="thin" />
                    <div className="rd-empty-title">书架还空着</div>
                    <div className="rd-empty-text">导入一本 EPUB 或 TXT，就从这里开始读。</div>
                    <button className="rd-btn rd-btn-primary" onClick={() => setImportOpen(true)}>导入第一本书</button>
                </div>
            ) : shown.length === 0 ? (
                <div className="rd-empty">
                    <div className="rd-empty-text">{query ? '没有匹配的书' : '这一类还没有书'}</div>
                </div>
            ) : (
                <div className={gridClass}>{shown.map(card)}</div>
            )}

            {importOpen && (
                <ImportSheet
                    onClose={() => setImportOpen(false)}
                    onImported={(id) => {
                        setImportOpen(false);
                        void reload().then(() => onOpenBook(id));
                    }}
                    onBusyChange={setBusy}
                />
            )}

            {reparse && (
                <ImportSheet
                    presetFile={reparse.file}
                    presetEncoding="gb18030"
                    onClose={() => setReparse(null)}
                    onImported={() => {
                        setReparse(null);
                        notify('已按新编码重解成一本新书，旧书和它的批注还留着');
                        void reload();
                        onChanged();
                    }}
                    onBusyChange={setBusy}
                />
            )}

            {menuBook && (
                <div className="rd-sheet-mask" onClick={() => setMenuBook(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">{menuBook.title}</div>
                        <div className="rd-muted" style={{ marginBottom: 'var(--rd-space-3)' }}>
                            {menuBook.format.toUpperCase()} · {Math.ceil(menuBook.fileBytes / 1024)} KB ·
                            第 {menuBook.chapterCount} 章
                            {menuBook.encoding ? ` · ${menuBook.encoding}` : ''}
                        </div>
                        <div className="rd-card rd-card-flush">
                            <div className="rd-list">
                                <button className="rd-item" onClick={() => { setMenuBook(null); onOpenDetails(menuBook.id); }}>
                                    <span className="rd-item-label">书本详情</span>
                                    <span className="rd-item-chev">›</span>
                                </button>
                                {menuBook.format === 'txt' && (
                                    <button className="rd-item" onClick={() => void openReparse(menuBook)}>
                                        <span className="rd-item-label">换编码重解（乱码时用）</span>
                                        <span className="rd-item-chev">›</span>
                                    </button>
                                )}
                                <button className="rd-item rd-item-danger" onClick={() => { setConfirmDelete(menuBook); setMenuBook(null); }}>
                                    <span className="rd-item-label">删除这本书</span>
                                </button>
                            </div>
                        </div>
                        <button className="rd-btn rd-btn-block" style={{ marginTop: 'var(--rd-space-3)' }} onClick={() => setMenuBook(null)}>取消</button>
                    </div>
                </div>
            )}

            {confirmDelete && (
                <div className="rd-sheet-mask" onClick={() => setConfirmDelete(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">删掉《{confirmDelete.title}》？</div>
                        <div className="rd-muted" style={{ marginBottom: 'var(--rd-space-3)' }}>
                            这本书的批注和讨论会一起删掉，删了就找不回来了。书能重新导入，批注不能。
                        </div>
                        <div className="rd-btn-row">
                            <button className="rd-btn" onClick={() => setConfirmDelete(null)}>再想想</button>
                            <button className="rd-btn rd-btn-primary" onClick={() => void doDelete(confirmDelete)}>删掉</button>
                        </div>
                    </div>
                </div>
            )}

            {busy && <div className="rd-toast">正在导入…</div>}
        </div>
    );
}

// 读书模块 · 书架（2026-09-14）
//
// 按书组织：用户自己的书库与阅读入口（v3 §4.0 的分工）。
// 版式两种（封面网格 / 横向卡片+列表），走 prefs.shelfLayout，切换即时生效（V8）。
// 长按卡片 → 换编码重解 / 删除。元数据管理（标签/评分/简介）在详情与设置里，
// 不铺在书架主界面上（v3 §4.1「别破坏呼吸感」）。

import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Plus } from '@phosphor-icons/react';
import { useBlobRefUrl } from '../../../utils/blobRef';
import { deleteBookDeep, getProgress, listBooks, type RdBook } from '../../../utils/reader/readerDb';
import { useReaderPrefs } from '../readerPrefs';
import ImportSheet from '../ImportSheet';

interface Props {
    onOpenBook: (bookId: string) => void;
    notify: (msg: string) => void;
    /** 已导入但还没打开：书架自己刷新（ReaderApp 传自增的号） */
    refreshToken: number;
    onChanged: () => void;
}

function CoverImage({ coverRef, title }: { coverRef?: string; title: string }) {
    const url = useBlobRefUrl(coverRef);
    if (!url) return <div className="rd-book-cover-ph">{title}</div>;
    return <img className="rd-cover-img" src={url} alt="" loading="lazy" />;
}

export default function ReaderShelf({ onOpenBook, notify, refreshToken, onChanged }: Props) {
    const prefs = useReaderPrefs();
    const [books, setBooks] = useState<RdBook[]>([]);
    const [percent, setPercent] = useState<Record<string, number>>({});
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
            return [b.id, p?.percent ?? 0] as const;
        }));
        setPercent(Object.fromEntries(pairs));
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

    const layoutClass = prefs.shelfLayout === 'list' ? 'rd-shelf-list' : 'rd-shelf-grid';

    return (
        <div className="rd-shelf" data-rd-page="shelf">
            <div className="rd-shelf-head">
                <div className="rd-shelf-title">书架</div>
                <div className="rd-shelf-count">{books.length} 本</div>
                <div style={{ flex: 1 }} />
                <button className="rd-icon-btn" onClick={() => setImportOpen(true)} aria-label="导入书籍">
                    <Plus size={18} />
                </button>
            </div>

            {books.length === 0 ? (
                <div className="rd-empty">
                    <BookOpen size={40} weight="thin" />
                    <div>书架还空着</div>
                    <button className="rd-btn rd-btn-primary" onClick={() => setImportOpen(true)}>导入第一本书</button>
                </div>
            ) : (
                <div className={layoutClass}>
                    {books.map((book) => (
                        <button
                            key={book.id}
                            className="rd-book-card"
                            onClick={() => { if (!pressRef.current.fired) onOpenBook(book.id); }}
                            onTouchStart={() => startPress(book)}
                            onTouchEnd={endPress}
                            onTouchMove={endPress}
                            onContextMenu={(e) => { e.preventDefault(); setMenuBook(book); }}
                        >
                            <div className="rd-book-cover">
                                <CoverImage coverRef={book.coverRef} title={book.title} />
                            </div>
                            <div className="rd-book-meta">
                                <div className="rd-book-title">{book.title}</div>
                                <div className="rd-book-author">{book.customAuthor || book.author || book.format.toUpperCase()}</div>
                                <div className="rd-bar">
                                    <div className="rd-bar-fill" style={{ width: `${Math.round(percent[book.id] ?? 0)}%` }} />
                                </div>
                                <div className="rd-muted">{Math.round(percent[book.id] ?? 0)}%</div>
                            </div>
                        </button>
                    ))}
                </div>
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
                        <div className="rd-sheet-title">{menuBook.title}</div>
                        <div className="rd-sheet-body">
                            <div className="rd-muted">
                                {menuBook.format.toUpperCase()} · {Math.ceil(menuBook.fileBytes / 1024)} KB ·
                                第 {menuBook.chapterCount} 章
                                {menuBook.encoding ? ` · ${menuBook.encoding}` : ''}
                            </div>
                            {menuBook.format === 'txt' && (
                                <button className="rd-btn" onClick={() => void openReparse(menuBook)}>
                                    换编码重解（乱码时用）
                                </button>
                            )}
                            <button className="rd-btn" onClick={() => { setConfirmDelete(menuBook); setMenuBook(null); }}>
                                删除这本书
                            </button>
                            <button className="rd-btn" onClick={() => setMenuBook(null)}>取消</button>
                        </div>
                    </div>
                </div>
            )}

            {confirmDelete && (
                <div className="rd-sheet-mask" onClick={() => setConfirmDelete(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-title">删掉《{confirmDelete.title}》？</div>
                        <div className="rd-sheet-body">
                            <div className="rd-muted">这本书的批注和讨论会一起删掉，删了就找不回来了。书能重新导入，批注不能。</div>
                            <div className="rd-btn-row">
                                <button className="rd-btn" onClick={() => setConfirmDelete(null)}>再想想</button>
                                <button className="rd-btn rd-btn-primary" onClick={() => void doDelete(confirmDelete)}>删掉</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {busy && <div className="rd-toast">正在导入…</div>}
        </div>
    );
}

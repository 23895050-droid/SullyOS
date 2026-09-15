// 读书模块 · 书详情（2026-09-15 UI 轮新增）
//
// 照参考图：顶栏「‹ 返回 | 书本详情 | ♡ ⚙」→ 封面 + 书名/分类/作者/星级 +
// 字数·时长·状态一行 → 分页签（简介 / 笔记 / 书签 / 更多）→ 底部通栏按钮。
//
// 右上角那颗 ⚙ 就是 v3 §4.6 说的「那本书信息页右上角的小设置」：
// 共读模式（专注/随心）与划线配色只在这里改，不在大设置页（她 2026-09-14 明确过）。

import { useCallback, useEffect, useState } from 'react';
import {
    ArrowLeft, BookmarkSimple, CheckCircle, Clock, FileText, Heart, Gear, Star,
} from '@phosphor-icons/react';
import {
    deleteBookDeep, getBook, getProgress, listAnnotations, listBooks, patchBook,
    type RdAnnotation, type RdBook, type RdProgress,
} from '../../utils/reader/readerDb';
import { addCat, allCatNames } from './readerCats';
import {
    readingModeFor, removeHighlightColor, setBookMode, setHighlightColor, useReaderPrefs,
} from './readerPrefs';
import ReaderCover, { shrinkCoverImage } from './ReaderCover';

interface Props {
    bookId: string;
    notify: (msg: string) => void;
    onRead: (bookId: string) => void;
    onDeleted: () => void;
    onBack: () => void;
}

type Tab = 'intro' | 'notes' | 'bookmarks' | 'more';

const TABS: Array<{ key: Tab; label: string }> = [
    { key: 'intro', label: '简介' },
    { key: 'notes', label: '笔记' },
    { key: 'bookmarks', label: '书签' },
    { key: 'more', label: '更多' },
];

const fmtWords = (chars: number) => (chars >= 10000 ? `${(chars / 10000).toFixed(1)} 万字` : `${chars} 字`);
const fmtMinutes = (sec: number) => {
    const m = Math.round(sec / 60);
    if (m < 60) return `${m} 分钟`;
    return `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
};

export default function BookDetails({ bookId, notify, onRead, onDeleted, onBack }: Props) {
    const prefs = useReaderPrefs();
    const [book, setBook] = useState<RdBook | null>(null);
    const [prog, setProg] = useState<RdProgress | null>(null);
    const [anns, setAnns] = useState<RdAnnotation[]>([]);
    const [tab, setTab] = useState<Tab>('intro');
    const [sheet, setSheet] = useState<null | 'book' | 'hl' | 'edit' | 'cat'>(null);
    /** 分类能选哪些：书上用过的 ∪ 名册里建的（添加分类在书架那张面板上，这里也能现打一个） */
    const [catNames, setCatNames] = useState<string[]>([]);
    const [newCat, setNewCat] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [draft, setDraft] = useState({ title: '', author: '', category: '', intro: '' });

    const load = useCallback(async () => {
        const b = await getBook(bookId);
        setBook(b);
        if (!b) return;
        setDraft({
            title: b.title,
            author: b.customAuthor ?? b.author ?? '',
            category: b.category ?? '',
            intro: b.customIntro ?? b.intro ?? '',
        });
        setProg(await getProgress(bookId, 'user'));
        setAnns(await listAnnotations(bookId));
        // 分类候选：所有书上用过的 + 名册里的
        const all = await listBooks();
        const m = new Map<string, number>();
        for (const x of all) {
            const c = (x.category || '').trim();
            if (c) m.set(c, (m.get(c) ?? 0) + 1);
        }
        setCatNames(allCatNames(Array.from(m.entries()).sort((a, b) => b[1] - a[1])));
    }, [bookId]);

    useEffect(() => { void load(); }, [load]);

    if (!book) {
        return (
            <div className="rd-body" data-rd-page="detail">
                <div className="rd-screen">
                    <div className="rd-empty"><div className="rd-empty-text">这本书不见了</div></div>
                </div>
            </div>
        );
    }

    const pct = Math.round(prog?.percent ?? 0);
    const state = pct >= 99 ? '读完' : pct > 0 ? '在读' : '未读';
    const notes = anns.filter((a) => a.kind === 'note' || a.kind === 'highlight');
    const bookmarks = anns.filter((a) => a.kind === 'bookmark');
    const mode = readingModeFor(prefs, bookId);

    const setRating = (n: number) => {
        void patchBook(bookId, { rating: n }).then((b) => setBook(b));
    };

    /** 换封面：挑一张图，压到 720 进 blob 仓，写回 book.coverRef */
    const pickCover = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
            const f = input.files?.[0];
            if (!f) return;
            void (async () => {
                try {
                    const { putImageBlob } = await import('../../utils/blobRef');
                    const ref = await putImageBlob(await shrinkCoverImage(f));
                    setBook(await patchBook(bookId, { coverRef: ref, updatedAt: new Date().toISOString() }));
                    notify('封面换好了');
                } catch {
                    notify('这张图读不出来，换一张试试');
                }
            })();
        };
        input.click();
    };

    const saveEdit = async () => {
        if (draft.category.trim()) addCat(draft.category);
        const b = await patchBook(bookId, {
            title: draft.title.trim() || book.title,
            customAuthor: draft.author.trim(),
            category: draft.category.trim(),
            customIntro: draft.intro,
        });
        setBook(b);
        setSheet(null);
        notify('改好了');
    };

    const doDelete = async () => {
        setConfirmDelete(false);
        await deleteBookDeep(bookId);
        notify('删掉了，书上的批注也一起清了');
        onDeleted();
    };

    return (
        <div className="rd-body" data-rd-page="detail">
            <div className="rd-screen rd-screen-tight rd-detail">
                <div className="rd-headbar">
                    <button className="rd-back" onClick={onBack}><ArrowLeft size={18} />返回</button>
                    <div className="rd-headbar-title">书本详情</div>
                    <button
                        className="rd-icon-btn"
                        aria-label="收藏"
                        onClick={() => {
                            void patchBook(bookId, { onShelf: !book.onShelf }).then((b) => {
                                setBook(b);
                                notify(b?.onShelf ? '放回书架了' : '收进收藏，不在书架上展示');
                            });
                        }}
                    >
                        <Heart size={20} weight={book.onShelf ? 'fill' : 'regular'} />
                    </button>
                    <button className="rd-icon-btn" aria-label="总结设置" onClick={() => setSheet('book')}>
                        <Gear size={20} />
                    </button>
                </div>

                <div className="rd-detail-hero">
                    <button className="rd-detail-cover" onClick={pickCover} aria-label="换封面">
                        <ReaderCover coverRef={book.coverRef} title={book.title} />
                        <span className="rd-cover-edit">换封面</span>
                    </button>
                    <div className="rd-detail-main">
                        <div className="rd-detail-title">{book.title}</div>
                        <div className="rd-detail-sub">{book.category || '未分类'}</div>
                        <div className="rd-detail-sub">{book.customAuthor || book.author || '未知作者'}</div>
                        <div className="rd-stars">
                            {[1, 2, 3, 4, 5].map((n) => (
                                <button
                                    key={n}
                                    aria-label={`${n} 星`}
                                    style={{ border: 0, background: 'transparent', padding: 0, lineHeight: 0 }}
                                    onClick={() => setRating(book.rating === n ? 0 : n)}
                                >
                                    <Star size={15} weight={n <= (book.rating ?? 0) ? 'fill' : 'regular'} className={n <= (book.rating ?? 0) ? 'rd-star-on' : 'rd-star'} />
                                </button>
                            ))}
                        </div>
                        <div className="rd-detail-meta">
                            <span><FileText size={13} />{fmtWords(book.totalChars)}</span>
                            <span><Clock size={13} />读过 {fmtMinutes(prog?.readingSeconds ?? 0)}</span>
                            <span className="rd-badge"><CheckCircle size={13} weight={state === '读完' ? 'fill' : 'regular'} />{state}</span>
                        </div>
                    </div>
                </div>

                <div className="rd-tabs">
                    {TABS.map((t) => (
                        <button
                            key={t.key}
                            className={`rd-tabline${tab === t.key ? ' rd-tabline-on' : ''}`}
                            onClick={() => setTab(t.key)}
                        >
                            {t.label}{t.key === 'notes' && notes.length > 0 ? ` ${notes.length}` : ''}
                        </button>
                    ))}
                </div>

                {tab === 'intro' && (
                    <div className="rd-detail-card">
                        {draft.intro
                            ? <div style={{ fontSize: 'var(--rd-fs-md)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{draft.intro}</div>
                            : (
                                <div className="rd-empty" style={{ padding: '32px 0' }}>
                                    <FileText size={34} weight="thin" />
                                    <div className="rd-empty-text">这本书还没有简介。可以自己写一段，或者去「更多 → 编辑资料」里补。</div>
                                    <button className="rd-btn rd-btn-soft" onClick={() => setSheet('edit')}>去写简介</button>
                                </div>
                            )}
                    </div>
                )}

                {tab === 'notes' && (
                    <div className="rd-detail-card">
                        {notes.length === 0 ? (
                            <div className="rd-empty" style={{ padding: '32px 0' }}>
                                <div className="rd-empty-text">这本书上还没有划线批注。</div>
                            </div>
                        ) : (
                            <div className="rd-muted">{notes.length} 条</div>
                        )}
                    </div>
                )}

                {tab === 'bookmarks' && (
                    <div className="rd-detail-card">
                        {bookmarks.length === 0 ? (
                            <div className="rd-empty" style={{ padding: '32px 0' }}>
                                <BookmarkSimple size={30} weight="thin" />
                                <div className="rd-empty-text">还没有书签。</div>
                            </div>
                        ) : (
                            <div className="rd-muted">{bookmarks.length} 条</div>
                        )}
                    </div>
                )}

                {tab === 'more' && (
                    <div className="rd-card rd-card-flush">
                        <div className="rd-list">
                            <button className="rd-item" onClick={() => setSheet('edit')}>
                                <span className="rd-item-label">编辑资料</span>
                                <span className="rd-item-chev">›</span>
                            </button>
                            <button className="rd-item" onClick={() => setSheet('book')}>
                                <span className="rd-item-label">总结设置（共读模式）</span>
                                <span className="rd-item-value">{mode === 'focus' ? '专注' : '随心'}</span>
                                <span className="rd-item-chev">›</span>
                            </button>
                            <button className="rd-item" onClick={() => setSheet('hl')}>
                                <span className="rd-item-label">划线颜色</span>
                                <span className="rd-item-value">{prefs.highlightColor}</span>
                                <span className="rd-item-chev">›</span>
                            </button>
                            <button className="rd-item" onClick={() => notify(`格式 ${book.format.toUpperCase()} · 共 ${book.chapterCount} 章 · ${book.encoding || '默认编码'}`)}>
                                <span className="rd-item-label">文件信息</span>
                                <span className="rd-item-value">{Math.ceil(book.fileBytes / 1024)} KB</span>
                            </button>
                            <button className="rd-item rd-item-danger" onClick={() => setConfirmDelete(true)}>
                                <span className="rd-item-label">删除这本书</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <button className="rd-cta" onClick={() => onRead(bookId)}>
                {pct > 0 && pct < 99 ? `继续阅读 · ${pct}%` : pct >= 99 ? '再读一遍' : '开始阅读'}
            </button>

            {/* ── 总结设置（单书设置） ── */}
            {sheet === 'book' && (
                <div className="rd-sheet-mask" onClick={() => setSheet(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">总结设置</div>
                        <div className="rd-muted" style={{ marginBottom: 'var(--rd-space-3)' }}>{book.title}</div>
                        <div className="rd-row-label" style={{ marginBottom: 'var(--rd-space-2)' }}>共读模式（只对这本书）</div>
                        <div className="rd-btn-row" style={{ marginBottom: 'var(--rd-space-2)' }}>
                            <button className={mode === 'focus' ? 'rd-btn rd-btn-primary' : 'rd-btn'} onClick={() => setBookMode(bookId, 'focus')}>专注</button>
                            <button className={mode === 'casual' ? 'rd-btn rd-btn-primary' : 'rd-btn'} onClick={() => setBookMode(bookId, 'casual')}>随心</button>
                        </div>
                        <div className="rd-muted">
                            专注：上下文以当前页正文为主，只带这本书最近几条批注；<br />
                            随心：保留正常聊天上下文，读书只是其中一件事。
                        </div>
                    </div>
                </div>
            )}

            {/* ── 划线配色 ── */}
            {sheet === 'hl' && (
                <div className="rd-sheet-mask" onClick={() => setSheet(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">划线颜色</div>
                        <div className="rd-hunt-hist" style={{ marginBottom: 'var(--rd-space-3)' }}>
                            {prefs.highlightPalette.map((c) => (
                                <button
                                    key={c}
                                    aria-label={c}
                                    className={`rd-swatch${prefs.highlightColor === c ? ' rd-swatch-on' : ''}`}
                                    style={{ background: c }}
                                    onClick={() => setHighlightColor(c)}
                                    onContextMenu={(e) => { e.preventDefault(); removeHighlightColor(c); }}
                                />
                            ))}
                        </div>
                        <div className="rd-muted">
                            跟阅读页「更多 → 划线颜色」是同一套笔：那里能调新颜色、能存进这支调色盘。点一支就用它，长按或右键删。
                        </div>
                    </div>
                </div>
            )}

            {/* ── 编辑资料 ── */}
            {sheet === 'edit' && (
                <div className="rd-sheet-mask" onClick={() => setSheet(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">编辑资料</div>
                        <div className="rd-sheet-body">
                            <div className="rd-opt">
                                <span className="rd-opt-label">封面</span>
                                <div style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', gap: 'var(--rd-space-3)' }}>
                                    <div className="rd-note-cover">
                                        <ReaderCover coverRef={book.coverRef} title={book.title} compact />
                                    </div>
                                    <button className="rd-btn" onClick={pickCover}>换一张</button>
                                </div>
                            </div>
                            <input className="rd-field" placeholder="书名" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                            <input className="rd-field" placeholder="作者" value={draft.author} onChange={(e) => setDraft({ ...draft, author: e.target.value })} />
                            <button className="rd-item" style={{ border: '1px solid var(--rd-rule)', borderRadius: 'var(--rd-r-md)', minHeight: 0, padding: '10px 14px' }} onClick={() => setSheet('cat')}>
                                <span className="rd-item-label">分类</span>
                                <span className="rd-item-value">{draft.category.trim() || '未分类'}</span>
                                <span className="rd-item-chev">›</span>
                            </button>
                            <textarea className="rd-field" rows={5} placeholder="简介" value={draft.intro} onChange={(e) => setDraft({ ...draft, intro: e.target.value })} />
                            <div className="rd-btn-row">
                                <button className="rd-btn rd-btn-primary" onClick={() => void saveEdit()}>保存</button>
                                <button className="rd-btn" onClick={() => setSheet(null)}>取消</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 挑分类（名册 + 现打一个） ── */}
            {sheet === 'cat' && (
                <div className="rd-sheet-mask" onClick={() => setSheet(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">分类</div>
                        <div className="rd-card rd-card-flush">
                            <div className="rd-list">
                                <button className="rd-item" onClick={() => { setDraft({ ...draft, category: '' }); setSheet('edit'); }}>
                                    <span className="rd-item-label">未分类</span>
                                    {!draft.category.trim() && <span className="rd-check">✓</span>}
                                </button>
                                {catNames.map((c) => (
                                    <button key={c} className="rd-item" onClick={() => { setDraft({ ...draft, category: c }); setSheet('edit'); }}>
                                        <span className="rd-item-label">{c}</span>
                                        {draft.category.trim() === c && <span className="rd-check">✓</span>}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="rd-muted" style={{ marginTop: 'var(--rd-space-3)' }}>
                            没有想要的就在下面新打一个，它会进书架那张分类面板的「我的分类」。
                        </div>
                        <div className="rd-row" style={{ marginTop: 'var(--rd-space-2)' }}>
                            <input
                                className="rd-field"
                                placeholder="新建一个分类"
                                value={newCat}
                                onChange={(e) => setNewCat(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key !== 'Enter') return;
                                    const n = newCat.trim();
                                    if (!n) return;
                                    addCat(n);
                                    setCatNames((prev) => (prev.includes(n) ? prev : [...prev, n]));
                                    setDraft({ ...draft, category: n });
                                    setNewCat('');
                                    setSheet('edit');
                                }}
                            />
                            <button
                                className="rd-btn"
                                onClick={() => {
                                    const n = newCat.trim();
                                    if (!n) return;
                                    addCat(n);
                                    setCatNames((prev) => (prev.includes(n) ? prev : [...prev, n]));
                                    setDraft({ ...draft, category: n });
                                    setNewCat('');
                                    setSheet('edit');
                                }}
                            >
                                加上
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {confirmDelete && (
                <div className="rd-sheet-mask" onClick={() => setConfirmDelete(false)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">删掉《{book.title}》？</div>
                        <div className="rd-muted" style={{ marginBottom: 'var(--rd-space-3)' }}>
                            这本书的批注和讨论会一起删掉，删了就找不回来了。
                        </div>
                        <div className="rd-btn-row">
                            <button className="rd-btn" onClick={() => setConfirmDelete(false)}>再想想</button>
                            <button className="rd-btn rd-btn-primary" onClick={() => void doDelete()}>删掉</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

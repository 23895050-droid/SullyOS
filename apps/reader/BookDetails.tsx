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
    deleteBookDeep, getBook, getProgress, listAnnotations, patchBook, type RdAnnotation, type RdBook, type RdProgress,
} from '../../utils/reader/readerDb';
import { readingModeFor, setBookMode, setHighlightSlot, useReaderPrefs } from './readerPrefs';
import { HIGHLIGHT_SLOTS } from './readerSkinPresets';
import ReaderCover from './ReaderCover';

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
    const [sheet, setSheet] = useState<null | 'book' | 'hl' | 'edit'>(null);
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
    const mySlot = prefs.highlightStyles.user ?? 1;

    const setRating = (n: number) => {
        void patchBook(bookId, { rating: n }).then((b) => setBook(b));
    };

    const saveEdit = async () => {
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
                    <button className="rd-icon-btn" aria-label="本书设置" onClick={() => setSheet('book')}>
                        <Gear size={20} />
                    </button>
                </div>

                <div className="rd-detail-hero">
                    <div className="rd-detail-cover">
                        <ReaderCover coverRef={book.coverRef} title={book.title} />
                    </div>
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
                                <span className="rd-item-label">本书设置（共读模式）</span>
                                <span className="rd-item-value">{mode === 'focus' ? '专注' : '随心'}</span>
                                <span className="rd-item-chev">›</span>
                            </button>
                            <button className="rd-item" onClick={() => setSheet('hl')}>
                                <span className="rd-item-label">划线配色</span>
                                <span className="rd-item-value">{HIGHLIGHT_SLOTS.find((s) => s.slot === mySlot)?.label}</span>
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

            {/* ── 本书设置（单书设置） ── */}
            {sheet === 'book' && (
                <div className="rd-sheet-mask" onClick={() => setSheet(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">本书设置</div>
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

            {/* ── 编辑资料 ── */}
            {sheet === 'edit' && (
                <div className="rd-sheet-mask" onClick={() => setSheet(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">编辑资料</div>
                        <div className="rd-sheet-body">
                            <input className="rd-field" placeholder="书名" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                            <input className="rd-field" placeholder="作者" value={draft.author} onChange={(e) => setDraft({ ...draft, author: e.target.value })} />
                            <input className="rd-field" placeholder="分类（如：小说）" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
                            <textarea className="rd-field" rows={5} placeholder="简介" value={draft.intro} onChange={(e) => setDraft({ ...draft, intro: e.target.value })} />
                            <div className="rd-btn-row">
                                <button className="rd-btn rd-btn-primary" onClick={() => void saveEdit()}>保存</button>
                                <button className="rd-btn" onClick={() => setSheet(null)}>取消</button>
                            </div>
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

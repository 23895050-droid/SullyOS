// 读书模块 · 笔记库页（2026-09-20 按她的文档重写）
//
// 文档口径（《书房页面详细内容补充文档》）：
//   · **以书为单位**：书封面、书名、最近一个批注预览、批注人、时间；
//   · 可以**时间排序**、可以**按章分**、可以**搜索**；
//   · 只看某个标签的（某本书 / 某个角色 / 自己）——**筛选塞进汉堡菜单**，
//     筛完之后的搜索结果**也是筛过的**；
//   · 每条笔记支持**查看原文**；展开 = 批注与原文 → 讨论内容。

import { useEffect, useMemo, useState } from 'react';
import {
    CaretDown, FunnelSimple, ImageSquare, MagnifyingGlass, NoteBlank, PaperPlaneRight, X,
} from '@phosphor-icons/react';
import { useOS } from '../../../context/OSContext';
import {
    listAnnotations, listBooks, listThreads, threadRowId,
    type RdAnnotation, type RdBook, type RdThread,
} from '../../../utils/reader/readerDb';
import { threadKeyOf } from '../../../utils/reader/readerParticipants';
import { shareDayOf } from '../../../utils/reader/shareCardDraw';
import ReaderCover from '../ReaderCover';
import NoteForwardSheet from '../NoteForwardSheet';
import ShareCardSheet from '../ShareCardSheet';
import type { NoteForwardCard } from '../readerForward';
import { highlightColorOf, useReaderPrefs } from '../readerPrefs';

interface Props {
    /** 查看原文：跳到书里那一句上（章号与段号都是**章内**的） */
    onOpenAt?: (bookId: string, chapterIdx: number, paraIdx: number) => void;
    /** 转发一条笔记之后要报一声 */
    notify?: (msg: string) => void;
}

/** 一条笔记 = 一条划线批注 + 它下面的讨论 */
interface NoteRow {
    ann: RdAnnotation;
    /** 批注在第几章（0 起） */
    chapterIdx: number;
    thread: RdThread | null;
    /** 最后一次有人说话的时间（自己留的 + 别人回的，都算） */
    lastAt: string;
}

interface BookGroup {
    book: RdBook;
    notes: NoteRow[];
    lastAt: string;
}

/**
 * 这条笔记在第几章（0 起）。
 * **锚点里的段号是章内段号**，不能直接拿去查全书表——以批注自己存的 chapterIdx 为准
 * （她 09-16 报「第二章做的笔记定位成封面」就是拿章内段号查了全书表）；老的没存才退回查表。
 */
export function chapterOf(book: RdBook, ann: RdAnnotation): number {
    if (typeof ann.chapterIdx === 'number') return ann.chapterIdx;
    let idx = 0;
    (book.chapterStartPara || []).forEach((start, i) => { if (ann.anchor.startPara >= start) idx = i; });
    return idx;
}

/** 第几章的标题（章号是**章内序号**；章节目录里没收录的章节退回「第 N 章」） */
export function chapterTitleOf(book: RdBook, chapterIdx: number): string {
    return book.toc.find((t) => t.chapterIdx === chapterIdx)?.title ?? `第 ${chapterIdx + 1} 章`;
}

const fmtDate = (iso: string) => (iso || '').slice(0, 10);
const fmtTime = (iso: string) => (iso || '').slice(5, 16).replace('T', ' ');
/** 笔记形成的时间（连年份一起写；转出去的卡上显示的和给 AI 读的是同一份） */
export const fmtStamp = (iso: string) => (iso || '').slice(0, 16).replace('T', ' ');
const later = (a: string, b: string) => (a > b ? a : b);

type Sort = 'time' | 'chapter';

export default function ReaderNotes({ onOpenAt, notify }: Props) {
    const { characters, userProfile } = useOS();
    const prefs = useReaderPrefs();
    /** 正在转发的那条笔记（选人弹卡；笔记行里不带书，所以连书一起记下来） */
    const [forwarding, setForwarding] = useState<{ book: RdBook; row: NoteRow } | null>(null);
    /** 正在做分享卡的那条笔记（存成图片；同上，连书一起记下来） */
    const [sharing, setSharing] = useState<{ book: RdBook; row: NoteRow } | null>(null);
    const [groups, setGroups] = useState<BookGroup[]>([]);
    const [loading, setLoading] = useState(true);

    const [q, setQ] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [sort, setSort] = useState<Sort>('time');
    /** 只看谁留下的（**可多选叠加**，空数组 = 不限）——她 09-21：条件要能自由勾、往上叠 */
    const [owners, setOwners] = useState<string[]>([]);
    /** 只看哪几本书（**可多选叠加**，空数组 = 不限） */
    const [bookIds, setBookIds] = useState<string[]>([]);
    const [openBooks, setOpenBooks] = useState<Set<string>>(new Set());
    const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());

    const nameOf = (ownerId: string): string => (
        ownerId === 'user'
            ? (userProfile?.name ?? 'Angel')
            : (characters.find((c) => c.id === ownerId)?.name ?? ownerId)
    );

    useEffect(() => {
        void (async () => {
            const books = await listBooks();
            const out: BookGroup[] = [];
            for (const b of books) {
                // 书签不算笔记（她 2026-09-15 报的：笔记页里混进了书签）
                const anns = (await listAnnotations(b.id)).filter((a) => a.kind !== 'bookmark');
                if (anns.length === 0) continue;
                const threads = await listThreads(b.id);
                const notes: NoteRow[] = anns.map((ann) => {
                    const chapterIdx = chapterOf(b, ann);
                    const thread = threads.find(
                        (t) => t.id === threadRowId(b.id, threadKeyOf(chapterIdx, ann.anchor, ann.ownerId)),
                    ) ?? null;
                    // 「互动时间」= 他留这条的时间，或这条下面最后有人说话的时间
                    // （不用 updatedAt：那只是「这行被写过的时刻」，改个色也会变，拿它排会很跳）
                    const lastMsg = thread?.messages[thread.messages.length - 1]?.createdAt ?? '';
                    return { ann, chapterIdx, thread, lastAt: later(ann.createdAt, lastMsg) };
                });
                out.push({ book: b, notes, lastAt: notes.reduce((m, n) => later(m, n.lastAt), '') });
            }
            setGroups(out);
            setLoading(false);
        })();
    }, []);

    /** 勾一下：已在里面就摘掉，不在就加上（多选的条件都这么叠） */
    const toggleIn = (arr: string[], v: string): string[] =>
        (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

    const ownerOptions = useMemo(() => {
        const ids = new Set<string>();
        for (const g of groups) for (const n of g.notes) ids.add(n.ann.ownerId);
        return [...ids];
    }, [groups]);

    /** 筛选 → 搜索 → 排序（她：在这个维度内搜索的结果也是筛选后的结果） */
    const shown = useMemo(() => {
        const word = q.trim().toLowerCase();
        const hit = (n: NoteRow): boolean => {
            if (!word) return true;
            if (n.ann.anchor.text.toLowerCase().includes(word)) return true;
            if ((n.ann.note ?? '').toLowerCase().includes(word)) return true;
            return (n.thread?.messages ?? []).some((m) => m.content.toLowerCase().includes(word));
        };
        const out: BookGroup[] = [];
        for (const g of groups) {
            if (bookIds.length > 0 && !bookIds.includes(g.book.id)) continue;
            const notes = g.notes.filter(
                (n) => (owners.length === 0 || owners.includes(n.ann.ownerId)) && hit(n),
            );
            if (notes.length === 0) continue;
            const sorted = [...notes].sort((a, b) => (
                sort === 'chapter'
                    ? a.chapterIdx - b.chapterIdx || a.ann.anchor.startPara - b.ann.anchor.startPara
                    : b.lastAt.localeCompare(a.lastAt)
            ));
            out.push({
                book: g.book,
                notes: sorted,
                lastAt: sorted.reduce((m, n) => later(m, n.lastAt), ''),
            });
        }
        out.sort((a, b) => (sort === 'chapter'
            ? a.book.title.localeCompare(b.book.title, 'zh')
            : b.lastAt.localeCompare(a.lastAt)));
        return out;
    }, [groups, q, owners, bookIds, sort]);

    const total = shown.reduce((n, g) => n + g.notes.length, 0);
    const filtering = owners.length > 0 || bookIds.length > 0 || !!q.trim();

    const bookName = (id: string) => groups.find((g) => g.book.id === id)?.book.title ?? '';
    const toggle = (set: Set<string>, id: string, apply: (s: Set<string>) => void) => {
        const next = new Set(set);
        if (next.has(id)) next.delete(id); else next.add(id);
        apply(next);
    };

    const clearFilters = () => { setOwners([]); setBookIds([]); setQ(''); };

    /** 转发出去的那张卡：原文那一句 + 批注 + 讨论（书里的全文不跟着过去） */
    const forwardOf = (book: RdBook, n: NoteRow): NoteForwardCard => ({
        kind: '笔记',
        title: book.title,
        author: book.customAuthor || book.author,
        chapter: `第 ${n.chapterIdx + 1} 章`,
        quote: n.ann.anchor.text,
        note: n.ann.note,
        by: nameOf(n.ann.ownerId),
        at: fmtStamp(n.ann.createdAt),
        thread: (n.thread?.messages ?? []).map((m) => ({
            who: m.role === 'user' ? nameOf('user') : (m.charId ? nameOf(m.charId) : '旁白'),
            text: m.content,
            at: fmtStamp(m.createdAt),
        })),
        color: highlightColorOf(prefs, n.ann.ownerId),
    });

    return (
        <div className="rd-screen" data-rd-page="notes">
            <div className="rd-head">
                <div className="rd-head-main">
                    <div className="rd-head-title">笔记</div>
                    <div className="rd-head-sub">
                        {loading
                            ? '正在翻…'
                            : (groups.length > 0
                                ? (filtering ? `${shown.length} 本 · ${total} 条（筛过）` : `${groups.length} 本书 · ${total} 条`)
                                : '划过的地方，都收在这里')}
                    </div>
                </div>
                <div className="rd-head-actions">
                    <button
                        className="rd-icon-btn"
                        aria-label="搜索"
                        onClick={() => { setSearchOpen((v) => !v); if (searchOpen) setQ(''); }}
                    >
                        {searchOpen ? <X size={19} /> : <MagnifyingGlass size={19} />}
                    </button>
                    <button className="rd-icon-btn" aria-label="筛选" onClick={() => setMenuOpen(true)}>
                        <FunnelSimple size={19} />
                    </button>
                </div>
            </div>

            {searchOpen && (
                <div className="rd-search-bar">
                    <div className="rd-search-input">
                        <MagnifyingGlass size={15} />
                        <input
                            autoFocus
                            value={q}
                            placeholder="搜句子、批注、讨论…"
                            onChange={(e) => setQ(e.target.value)}
                        />
                        {q && (
                            <button className="rd-search-cancel" onClick={() => setQ('')} aria-label="清空">
                                <X size={15} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* 排序 + 当前筛选（筛选本身在汉堡菜单里） */}
            <div className="rd-seg rd-notes-seg">
                <button
                    className={`rd-seg-btn${sort === 'time' ? ' rd-seg-on' : ''}`}
                    onClick={() => setSort('time')}
                >
                    最近
                </button>
                <button
                    className={`rd-seg-btn${sort === 'chapter' ? ' rd-seg-on' : ''}`}
                    onClick={() => setSort('chapter')}
                >
                    按章
                </button>
            </div>
            {filtering && (
                <div className="rd-filter-row">
                    {owners.map((id) => (
                        <button
                            className="rd-chip rd-chip-on"
                            key={id}
                            onClick={() => setOwners(toggleIn(owners, id))}
                        >
                            {nameOf(id)} <X size={12} />
                        </button>
                    ))}
                    {bookIds.map((id) => (
                        <button
                            className="rd-chip rd-chip-on"
                            key={id}
                            onClick={() => setBookIds(toggleIn(bookIds, id))}
                        >
                            《{bookName(id)}》 <X size={12} />
                        </button>
                    ))}
                    <button className="rd-filter-clear" onClick={clearFilters}>清掉筛选</button>
                </div>
            )}

            {loading ? null : groups.length === 0 ? (
                <div className="rd-empty">
                    <NoteBlank size={44} weight="thin" />
                    <div className="rd-empty-title">还没有笔记</div>
                    <div className="rd-empty-text">划线、批注和围绕它们的讨论都会收在这里，一本书一组、按阅读顺序排。</div>
                </div>
            ) : shown.length === 0 ? (
                <div className="rd-empty">
                    <NoteBlank size={44} weight="thin" />
                    <div className="rd-empty-title">这些条件下没有笔记</div>
                    <div className="rd-empty-text">换个词，或者把筛选清掉再看看。</div>
                    <button className="rd-btn rd-btn-soft" onClick={clearFilters}>清掉筛选</button>
                </div>
            ) : (
                <div className="rd-card rd-card-flush">
                    {shown.map((g) => {
                        const open = openBooks.has(g.book.id);
                        const head = g.notes[0];
                        return (
                            <div className="rd-nbook" key={g.book.id}>
                                <button
                                    className="rd-note rd-nbook-head"
                                    onClick={() => toggle(openBooks, g.book.id, setOpenBooks)}
                                >
                                    <div className="rd-note-cover">
                                        <ReaderCover coverRef={g.book.coverRef} title={g.book.title} compact />
                                    </div>
                                    <div className="rd-note-main">
                                        <div className="rd-note-book">{g.book.title}</div>
                                        <div className="rd-note-sub">
                                            第 {head.chapterIdx + 1} 章 · {g.notes.length} 条 · {fmtDate(g.lastAt)}
                                        </div>
                                        <div className="rd-note-by">
                                            <span
                                                className="rd-note-dot"
                                                style={{ background: highlightColorOf(prefs, head.ann.ownerId) }}
                                            />
                                            {nameOf(head.ann.ownerId)}
                                        </div>
                                        {(head.ann.note || head.ann.anchor.text) && (
                                            <div className="rd-note-text">
                                                {head.ann.note || `“${head.ann.anchor.text}”`}
                                            </div>
                                        )}
                                    </div>
                                    <CaretDown size={14} className={`rd-fold-chev${open ? ' rd-fold-chev-on' : ''}`} />
                                </button>

                                {open && g.notes.map((n, i) => {
                                    const chapterHead = sort === 'chapter'
                                        && (i === 0 || g.notes[i - 1].chapterIdx !== n.chapterIdx);
                                    const opened = openNotes.has(n.ann.id);
                                    const msgs = n.thread?.messages ?? [];
                                    return (
                                        <div className="rd-nb-wrap" key={n.ann.id}>
                                            {chapterHead && (
                                                <div className="rd-nb-chapter">第 {n.chapterIdx + 1} 章</div>
                                            )}
                                            <button
                                                className="rd-nb"
                                                onClick={() => toggle(openNotes, n.ann.id, setOpenNotes)}
                                            >
                                                <div className="rd-nb-quote">“{n.ann.anchor.text}”</div>
                                                <div className="rd-nb-meta">
                                                    <span
                                                        className="rd-note-dot"
                                                        style={{ background: highlightColorOf(prefs, n.ann.ownerId) }}
                                                    />
                                                    <span className="rd-nb-who">{nameOf(n.ann.ownerId)}</span>
                                                    <span className="rd-nb-when">{fmtTime(n.ann.createdAt)}</span>
                                                    {msgs.length > 0 && (
                                                        <span className="rd-nb-count">讨论 {msgs.length}</span>
                                                    )}
                                                    <CaretDown
                                                        size={13}
                                                        className={`rd-fold-chev rd-nb-chev${opened ? ' rd-fold-chev-on' : ''}`}
                                                    />
                                                </div>
                                            </button>

                                            {opened && (
                                                <div className="rd-nb-body">
                                                    {/* 批注（衬线大字，跟下面接话那几条在字体上分开——她 09-21） */}
                                                    <div className="rd-nb-note">
                                                        {n.ann.note || <span className="rd-muted">这条只划了线，没写批注。</span>}
                                                    </div>
                                                    {/* 展开里**不再重复原文**：收着的那一行已经是原文了
                                                        （她 09-21：「第二行还有原文挺奇怪的，因为表面已经有了」）。
                                                        这一行现在只放动作。 */}
                                                    <div className="rd-nb-src">
                                                        <button
                                                            className="rd-nb-goto"
                                                            onClick={() => setSharing({ book: g.book, row: n })}
                                                        >
                                                            <ImageSquare size={13} /> 存成图片
                                                        </button>
                                                        <button
                                                            className="rd-nb-goto"
                                                            onClick={() => setForwarding({ book: g.book, row: n })}
                                                        >
                                                            <PaperPlaneRight size={13} /> 转发
                                                        </button>
                                                        {onOpenAt && (
                                                            <button
                                                                className="rd-nb-goto"
                                                                onClick={() => onOpenAt(n.ann.bookId, n.chapterIdx, n.ann.anchor.startPara)}
                                                            >
                                                                查看原文
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* 讨论内容（完整记录：谁说的都在，不挑人） */}
                                                    <div className="rd-nb-thread">
                                                        {msgs.length === 0
                                                            ? <div className="rd-muted">这条下面还没人接话。</div>
                                                            : msgs.map((m) => {
                                                                const who = m.role === 'user' ? 'user' : (m.charId ?? '');
                                                                return (
                                                                    <div
                                                                        className={`rd-nb-msg${who === 'user' ? ' rd-nb-msg-me' : ''}`}
                                                                        key={m.id}
                                                                    >
                                                                        <div className="rd-nb-msg-head">
                                                                            {who ? nameOf(who) : '旁白'} · {fmtTime(m.createdAt)}
                                                                        </div>
                                                                        <div className="rd-nb-msg-text">{m.content}</div>
                                                                    </div>
                                                                );
                                                            })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 筛选（她：筛选规则通常塞进汉堡菜单） */}
            {menuOpen && (
                <div className="rd-sheet-mask" onClick={() => setMenuOpen(false)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" onClick={() => setMenuOpen(false)} />
                        <div className="rd-sheet-title">筛选</div>

                        {/* 可自由勾、往上叠（她 09-21）：勾几个就是「这几个里都算」 */}
                        <div className="rd-menu-label">谁留下的（可多选）</div>
                        <div className="rd-card rd-card-flush">
                            <div className="rd-list">
                                <button
                                    className="rd-item"
                                    onClick={() => setOwners([])}
                                >
                                    <span className="rd-item-label">所有人</span>
                                    {owners.length === 0 && <span className="rd-check">✓</span>}
                                </button>
                                {ownerOptions.map((id) => (
                                    <button
                                        className="rd-item"
                                        key={id}
                                        onClick={() => setOwners(toggleIn(owners, id))}
                                    >
                                        <span className="rd-item-label">
                                            {nameOf(id)}{id === 'user' ? '（我）' : ''}
                                        </span>
                                        {owners.includes(id) && <span className="rd-check">✓</span>}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rd-menu-label" style={{ marginTop: 'var(--rd-space-4)' }}>哪本书（可多选）</div>
                        <div className="rd-card rd-card-flush">
                            <div className="rd-list">
                                <button className="rd-item" onClick={() => setBookIds([])}>
                                    <span className="rd-item-label">所有书</span>
                                    {bookIds.length === 0 && <span className="rd-check">✓</span>}
                                </button>
                                {groups.map((g) => (
                                    <button
                                        className="rd-item"
                                        key={g.book.id}
                                        onClick={() => setBookIds(toggleIn(bookIds, g.book.id))}
                                    >
                                        <span className="rd-item-label">{g.book.title}</span>
                                        {bookIds.includes(g.book.id) && <span className="rd-check">✓</span>}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rd-actions">
                            {filtering && (
                                <button className="rd-nb-goto" onClick={clearFilters}>清掉筛选</button>
                            )}
                            <button className="rd-btn rd-btn-primary" onClick={() => setMenuOpen(false)}>好了</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 转发一条笔记给某个角色（走 reader_forward 卡片） */}
            {forwarding && (
                <NoteForwardSheet
                    card={forwardOf(forwarding.book, forwarding.row)}
                    onClose={() => setForwarding(null)}
                    notify={notify ?? (() => {})}
                />
            )}

            {/* 把这条笔记做成分享卡存成图片（和阅读页工具条上那颗是同一张卡） */}
            {sharing && (
                <ShareCardSheet
                    book={sharing.book}
                    quote={sharing.row.ann.anchor.text}
                    note={sharing.row.ann.note}
                    chapterTitle={chapterTitleOf(sharing.book, sharing.row.chapterIdx)}
                    date={shareDayOf(sharing.row.ann.createdAt)}
                    notify={notify ?? (() => {})}
                    onClose={() => setSharing(null)}
                />
            )}
        </div>
    );
}

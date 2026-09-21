// 读书模块 · 角色个人页（2026-09-20 T4 / **09-21 照微信读书的排版爆改**）
//
// 她 09-21 的原话：「你做的这个 ui 不像个人主页，像设置。所有个人设置项应该放在
// 右上角那个设置入口指向的设置页面。微信读书的排版是对的。」
// 所以这一页从上到下是**主页的样子**（参考图逐块对照）：
//
//   [‹]                                    [⚙ 设置]
//              （大圆头像）
//                名字（衬线、居中）
//            〔可以一起读〕〔默认套〕        ← 小胶囊
//        22:03 他读了《在轮下》｜ 留下了 3 处批注，参与了 2 处讨论
//        共翻阅 4 页 ｜ 33650t              ← 点开 = 详细状态与活动记录
//   ── Token总消耗 ── 留下的批注 ── 参与的讨论 ──   ← 三格数字（点 = 跳到对应那一栏）
//            [ ✓ 可以一起读 ]                ← 整条开关（读书开关）
//   ┌──────── 书架 ｜ 读完 · N ｜ 一起读的 · N ────────┐
//   │ 最近在读《书名》· 42%                            │
//   │ [封面][封面][封面]  → 横着划                     │
//   │ [            查看书架            ]               │
//   └──────────────────────────────────────────────┘
//   笔记(N)   讨论(N)   活动(N)                  [筛选]
//   下面就是这一栏的流水
//
// **设置项全部搬去右上角那页**（读书开关 / 提示词套 / 每次读几页 / 每次笔记上限 /
// 回复模式 / 阅读风格 / 他自己的模型），主页上只留「能看出他是个什么样的人」的东西。

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    ArrowLeft, CaretDown, CaretRight, FunnelSimple, Gear, MagnifyingGlass, X,
} from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { useBlobRefUrl } from '../../utils/blobRef';
import {
    getProgress, listAnnotations, listBooks, listRoamActivities, listThreads, threadRowId,
    type RdAnnotation, type RdBook, type RdRoamActivity, type RdThread,
} from '../../utils/reader/readerDb';
import { threadKeyOf } from '../../utils/reader/readerParticipants';
import { normalizeApiBaseUrl, normalizeApiCredential, normalizeApiModel } from '../../utils/apiConfigNormalize';
import ReaderCover from './ReaderCover';
import ReaderCharStyleSheet from './ReaderCharStyleSheet';
import ActivityDetailSheet, { RoamCalls, fmtTok } from './ActivityDetailSheet';
import NoteForwardSheet from './NoteForwardSheet';
import NoteFold from './NoteFold';
import { chapterOf } from './tabs/ReaderNotes';
import type { NoteForwardCard } from './readerForward';
import { charPrefsOf, clampPages, setCharReadPrefs, setReadEnabled, useReaderCharPrefs } from './readerCharPrefs';
import { highlightColorOf, useReaderPrefs } from './readerPrefs';

interface Props {
    charId: string;
    onBack: () => void;
    notify: (msg: string) => void;
    /** 查看原文：跳到书里那一句上（章号与段号都是章内的） */
    onOpenAt?: (bookId: string, chapterIdx: number, paraIdx: number) => void;
}

/** 一条和这个人有关的笔记 */
interface NoteRow {
    book: RdBook;
    ann: RdAnnotation;
    chapterIdx: number;
    thread: RdThread | null;
    /** 他自己在这条讨论里说过话 */
    spoke: boolean;
    /** 他最后说话的时间 */
    mineAt: string;
    /** 留下的那条：他自己留的，或别人在他这条下面接过话 */
    made: boolean;
    /** 互动时间（留下的按「留下 / 被回」里晚的那个） */
    at: string;
}

/** 书架上一本书（他读到哪、留了几条） */
interface ShelfRow {
    book: RdBook;
    percent: number;
    at: string;
    /** 他在这本书上坐了多久（秒；书详情页那行统计用） */
    seconds: number;
    /** 他留下的笔记条数 */
    mine: number;
    /** 我也在这本书里有进度 = 一起读的 */
    together: boolean;
}

const later = (a: string, b: string) => (a > b ? a : b);
const fmtDay = (iso: string) => (iso || '').slice(5, 10).replace('-', '/');

/** 时间戳：今天只写 HH:MM，别的日子带月日 */
const fmtClock = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const sameDay = d.getFullYear() === now.getFullYear()
        && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    return `${sameDay ? '' : `${d.getMonth() + 1}-${d.getDate()} `}${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 统计格那种大数字：上万折成「3.4万」（参考图里就是这么写的） */
const fmtBig = (n: number): string => {
    if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
};

/**
 * 一次活动的「门面」= 组里最后一条**真正的调用**。
 * 摘要记录（kind:'summary'）是这次活动的总结那一趟，拿它当状态读着像「刚总结完」，
 * 不如拿「读了一段」那条——感受也在它身上。
 */
const headOf = (group: RdRoamActivity[]): RdRoamActivity => {
    const calls = group.filter((a) => a.kind !== 'summary');
    return calls.length > 0 ? calls[calls.length - 1] : group[group.length - 1];
};

/** 书架那三栏（参考图：书架 / 读完 · N / 共同阅读 · N） */
const SHELF_TABS = [
    ['all', '书架'],
    ['done', '读完'],
    ['together', '一起读的'],
] as const;

type ShelfTab = typeof SHELF_TABS[number][0];

/** 那一栏要哪些书（三栏共用一份判断，计数和列表不会对不上） */
const shelfFilterOf = (k: ShelfTab) => (s: ShelfRow): boolean => (
    k === 'done' ? s.percent >= 99 : k === 'together' ? s.together : true
);

/** 读了多久（参考图写「5小时36分钟」） */
const fmtDuration = (sec: number): string => {
    const m = Math.max(1, Math.round(sec / 60));
    if (m < 60) return `${m} 分钟`;
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest > 0 ? `${h} 小时 ${rest} 分钟` : `${h} 小时`;
};

/** 头像（hook 不能进 map，单独一个组件） */
function Face({ avatar, name, size }: { avatar?: string; name: string; size?: number }) {
    const url = useBlobRefUrl(avatar);
    return (
        <div className="rd-cp-face" style={size ? { width: size } : undefined}>
            {url
                ? <img src={url} alt="" />
                : <span className="rd-cp-face-ph">{name.slice(0, 1)}</span>}
        </div>
    );
}

type View = 'main' | 'settings' | 'api' | 'shelf' | 'book';
type Feed = 'notes' | 'talk' | 'acts';

export default function CharPage({ charId, onBack, notify, onOpenAt }: Props) {
    const { characters, userProfile, apiPresets } = useOS();
    const full = characters.find((c) => c.id === charId) ?? null;
    const name = full?.name ?? charId;

    const charPrefs = useReaderCharPrefs();
    const prefs = useReaderPrefs();
    const p = charPrefsOf(charPrefs, charId);
    const pen = p.penColor ?? highlightColorOf(prefs, charId);

    const [view, setView] = useState<View>('main');
    const [feed, setFeed] = useState<Feed>('notes');
    /** 正在看的那本书的「他在这本书上的记录」（从主页预览或书架点封面进来） */
    const [bookId, setBookId] = useState<string | null>(null);
    /** 从哪儿翻到书页的（返回回哪儿） */
    const [bookFrom, setBookFrom] = useState<View>('main');
    const [loading, setLoading] = useState(true);
    const [notes, setNotes] = useState<NoteRow[]>([]);
    const [shelf, setShelf] = useState<ShelfRow[]>([]);
    const [roam, setRoam] = useState<RdRoamActivity[]>([]);

    const [styleOpen, setStyleOpen] = useState(false);
    const [stateOpen, setStateOpen] = useState(false);
    const [act, setAct] = useState<RdRoamActivity[] | null>(null);
    const [openPast, setOpenPast] = useState<Set<string>>(new Set());
    const [forwarding, setForwarding] = useState<NoteRow | null>(null);
    /** 书架那一栏：书架 / 读完 / 一起读的 */
    const [shelfTab, setShelfTab] = useState<ShelfTab>('all');
    /** 筛东西那张卡 */
    const [filterOpen, setFilterOpen] = useState(false);
    const [q, setQ] = useState('');
    const [bookIds, setBookIds] = useState<string[]>([]);

    useEffect(() => {
        void (async () => {
            setLoading(true);
            const books = await listBooks();
            const rows: NoteRow[] = [];
            const prog: ShelfRow[] = [];
            for (const b of books) {
                const [anns, threads, mine, yours] = await Promise.all([
                    listAnnotations(b.id),
                    listThreads(b.id),
                    getProgress(b.id, charId),
                    getProgress(b.id, 'user'),
                ]);
                for (const ann of anns) {
                    // 书签不算笔记（她 2026-09-15 报的：笔记页里混进了书签）
                    if (ann.kind === 'bookmark') continue;
                    const chapterIdx = chapterOf(b, ann);
                    const thread = threads.find(
                        (t) => t.id === threadRowId(b.id, threadKeyOf(chapterIdx, ann.anchor, ann.ownerId)),
                    ) ?? null;
                    const msgs = thread?.messages ?? [];
                    const mineMsgs = msgs.filter((m) => m.role === 'char' && m.charId === charId);
                    const spoke = mineMsgs.length > 0;
                    const lastAt = msgs[msgs.length - 1]?.createdAt ?? '';
                    const made = ann.ownerId === charId;
                    if (!made && !spoke) continue;           // 和他没关系的不进他的页
                    rows.push({
                        book: b, ann, chapterIdx, thread, spoke,
                        mineAt: spoke ? mineMsgs[mineMsgs.length - 1].createdAt : '',
                        made,
                        at: made ? later(ann.createdAt, lastAt) : (mineMsgs[mineMsgs.length - 1]?.createdAt ?? ''),
                    });
                }
                if (mine) {
                    prog.push({
                        book: b, percent: mine.percent, at: mine.updatedAt, seconds: mine.readingSeconds || 0,
                        mine: 0, together: !!yours,
                    });
                }
            }
            // 只留过笔记、没进度的书也摆上书架
            for (const r of rows) {
                if (!r.made) continue;
                const hit = prog.find((s) => s.book.id === r.book.id);
                if (hit) hit.mine += 1;
                else prog.push({ book: r.book, percent: 0, at: '', seconds: 0, mine: 1, together: false });
            }
            setNotes(rows);
            setShelf(prog.sort((a, b) => (b.at || '').localeCompare(a.at || '') || a.book.title.localeCompare(b.book.title, 'zh')));
            setRoam(await listRoamActivities(charId, 60));
            setLoading(false);
        })();
    }, [charId]);

    /** 他留下的（按互动时间倒序） */
    const made = useMemo(
        () => notes.filter((n) => n.made).sort((a, b) => b.at.localeCompare(a.at)),
        [notes],
    );
    /** 参与过的讨论（他说过话的都算，包括他自己那条下面的） */
    const talked = useMemo(
        () => notes.filter((n) => n.spoke).sort((a, b) => b.mineAt.localeCompare(a.mineAt)),
        [notes],
    );

    /** 活动：同一次活动的调用聚成一组（按组里最后一条的时间倒序） */
    const groups = useMemo(() => {
        const by = new Map<string, RdRoamActivity[]>();
        for (const a of roam) {
            const arr = by.get(a.group) ?? [];
            arr.push(a);
            by.set(a.group, arr);
        }
        return [...by.values()]
            .map((arr) => arr.slice().sort((x, y) => x.seq - y.seq))
            .sort((a, b) => b[b.length - 1].createdAt.localeCompare(a[a.length - 1].createdAt));
    }, [roam]);

    const latest = groups[0] ?? null;
    const latestHead = latest ? headOf(latest) : null;

    /** 统计：Token 总消耗 / 留下的批注 / 参与的讨论 */
    const stats = useMemo(() => ({
        tokens: roam.reduce((n, a) => n + (Number(a.tokens) || 0), 0),
        notes: made.length,
        talks: talked.length,
    }), [roam, made, talked]);

    const nameOf = useCallback((ownerId: string): string => (
        ownerId === 'user'
            ? (userProfile?.name ?? 'Angel')
            : (characters.find((c) => c.id === ownerId)?.name ?? ownerId)
    ), [characters, userProfile]);

    const toggleIn = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
    const inBook = useCallback((bookId: string) => bookIds.length === 0 || bookIds.includes(bookId), [bookIds]);
    const word = q.trim().toLowerCase();
    const hitWord = (s: string) => !word || s.toLowerCase().includes(word);

    /** 这一栏现在要显示的东西（搜索 + 哪本书，两个条件都往上叠） */
    const feedNotes = useMemo(() => made.filter(
        (n) => inBook(n.book.id) && (hitWord(n.ann.anchor.text) || hitWord(n.ann.note ?? '')),
    ), [made, inBook, word]);
    const feedTalk = useMemo(() => talked.filter(
        (n) => inBook(n.book.id) && (hitWord(n.ann.anchor.text) || hitWord(n.ann.note ?? '')
            || (n.thread?.messages ?? []).some((m) => hitWord(m.content))),
    ), [talked, inBook, word]);
    const feedActs = useMemo(
        () => groups.filter((g) => inBook(headOf(g).bookId)),
        [groups, inBook],
    );

    const filtering = !!word || bookIds.length > 0;
    const clearFilters = () => { setQ(''); setBookIds([]); };

    const shelfShown = useMemo(() => {
        if (shelfTab === 'done') return shelf.filter((s) => s.percent >= 99);
        if (shelfTab === 'together') return shelf.filter((s) => s.together);
        return shelf;
    }, [shelf, shelfTab]);

    /** 一条笔记/讨论的折叠行（流水和书页共用一份）——展开里才有转发和查看原文 */
    const noteFoldOf = (n: NoteRow, mode: Feed, withDot = false) => {
        const msgs = n.thread?.messages ?? [];
        const said = msgs.filter((m) => m.role === 'char' && m.charId === charId);
        const text = n.made
            ? (n.ann.note || n.ann.anchor.text)
            : (said[said.length - 1]?.content ?? n.ann.anchor.text);
        const at = n.made ? n.at : n.mineAt;
        return (
            <NoteFold
                key={n.ann.id}
                meta={[
                    mode === 'talk' || !n.made ? `${nameOf(n.ann.ownerId)} 的笔记` : '',
                    n.book.title,
                    `第 ${n.chapterIdx + 1} 章`,
                    fmtDay(at),
                ].filter(Boolean).join(' · ')}
                text={text}
                quote={n.ann.anchor.text}
                thread={msgs.length > 0 ? (
                    <div className="rd-fn-thread">
                        {msgs.map((m) => (
                            <div className={`rd-fn-msg${m.role === 'user' ? ' rd-fn-msg-me' : ''}`} key={m.id}>
                                <div className="rd-fn-msg-head">
                                    {m.role === 'user' ? nameOf('user') : (m.charId ? nameOf(m.charId) : '旁白')} · {fmtDay(m.createdAt)}
                                </div>
                                <div className="rd-fn-msg-text">{m.content}</div>
                            </div>
                        ))}
                    </div>
                ) : undefined}
                dotColor={withDot ? highlightColorOf(prefs, n.ann.ownerId) : undefined}
                onForward={() => setForwarding(n)}
                onOpenAt={onOpenAt ? () => onOpenAt(n.book.id, n.chapterIdx, n.ann.anchor.startPara) : undefined}
            />
        );
    };

    const readingNow = useMemo(() => shelf.find((s) => s.percent > 0) ?? null, [shelf]);

    /** 书架那一行点开 / 「查看原文」都能用 */
    const titleOf = useCallback((bookId?: string): string | undefined => (
        bookId ? shelf.find((s) => s.book.id === bookId)?.book.title ?? notes.find((n) => n.book.id === bookId)?.book.title : undefined
    ), [shelf, notes]);

    const togglePast = (id: string) => setOpenPast((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const forwardOf = (n: NoteRow): NoteForwardCard => ({
        kind: '笔记',
        title: n.book.title,
        subtitle: `${nameOf(n.ann.ownerId)} · 第 ${n.chapterIdx + 1} 章`,
        quote: n.ann.anchor.text,
        note: n.ann.note,
        thread: (n.thread?.messages ?? []).map((m) => (
            `${m.role === 'user' ? nameOf('user') : (m.charId ? nameOf(m.charId) : '旁白')}：${m.content}`
        )),
        color: highlightColorOf(prefs, n.ann.ownerId),
    });

    /** 翻到「他在这本书上的记录」（主页预览和书架上的封面都走它，**不直接跳进书里**） */
    const openBookRecord = (id: string, from: View) => {
        setBookId(id);
        setBookFrom(from);
        setView('book');
    };

    // ── 内页：个人书架（照参考图：2 行标题 + 三栏 + 三列网格，**不横着划**）──
    if (view === 'shelf') {
        return (
            <div className="rd-screen" data-rd-page="char-shelf">
                <div className="rd-headbar">
                    <button className="rd-back" onClick={() => setView('main')}><ArrowLeft size={18} />返回</button>
                </div>
                <div className="rd-bk-head2">
                    <div className="rd-bk-owner">{name}</div>
                    <div className="rd-bk-sub">书架</div>
                </div>
                <div className="rd-cp-tabs">
                    {SHELF_TABS.map(([k, label]) => (
                        <button
                            key={k}
                            className={`rd-cp-tab${shelfTab === k ? ' rd-cp-tab-on' : ''}`}
                            onClick={() => setShelfTab(k)}
                        >
                            {k === 'all' ? label : `${label} · ${shelf.filter(shelfFilterOf(k)).length}`}
                        </button>
                    ))}
                </div>
                {shelfShown.length === 0 ? (
                    <div className="rd-empty">
                        <div className="rd-empty-title">
                            {shelfTab === 'done' ? '还没读完过一本' : shelfTab === 'together' ? '还没有你们都在读的书' : '书架还空着'}
                        </div>
                        <div className="rd-empty-text">他读过的书、留过笔记的书都会排在这儿。</div>
                    </div>
                ) : (
                    <div className="rd-grid">
                        {shelfShown.map((s) => (
                            <button className="rd-book" key={s.book.id} onClick={() => openBookRecord(s.book.id, 'shelf')}>
                                <div className="rd-book-cover">
                                    <ReaderCover coverRef={s.book.coverRef} title={s.book.title} compact />
                                </div>
                                <div className="rd-book-meta">
                                    <div className="rd-book-title">{s.book.title}</div>
                                    <div className="rd-book-author">{s.mine > 0 ? `${s.mine} 条笔记` : '还没留笔记'}</div>
                                    {s.percent > 0 && (
                                        <div className="rd-book-prog">
                                            <span className="rd-book-pct">{s.percent}%</span>
                                            <div className="rd-bar"><div className="rd-bar-fill" style={{ width: `${s.percent}%` }} /></div>
                                        </div>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // ── 内页：他在这本书上的记录（参考图第三张：头像 + 封面 + 「在读《…》」+ 流水）──
    if (view === 'book' && bookId) {
        const s = shelf.find((x) => x.book.id === bookId) ?? null;
        const book = s?.book ?? notes.find((n) => n.book.id === bookId)?.book ?? null;
        if (!book) {
            return (
                <div className="rd-screen" data-rd-page="char-book">
                    <div className="rd-headbar">
                        <button className="rd-back" onClick={() => setView(bookFrom)}><ArrowLeft size={18} />返回</button>
                    </div>
                    <div className="rd-empty">
                        <div className="rd-empty-title">找不到这本书了</div>
                        <div className="rd-empty-text">它可能已经被删掉了。</div>
                    </div>
                </div>
            );
        }
        const rows = notes.filter((n) => n.book.id === bookId);
        const acts = groups.filter((g) => headOf(g).bookId === bookId);
        const items: Array<{ key: string; at: string; node: ReactNode }> = [
            ...rows.map((n) => ({
                key: `n-${n.ann.id}`,
                at: n.made ? n.at : n.mineAt,
                node: noteFoldOf(n, 'notes'),
            })),
            ...acts.map((g) => {
                const head = headOf(g);
                return {
                    key: `a-${head.id}`,
                    at: head.createdAt,
                    node: (
                        <button className="rd-bk-act" onClick={() => setAct(g)}>
                            <span className="rd-fn-meta">{`活动 · ${fmtClock(head.createdAt)}`}</span>
                            <span className="rd-fn-text">{head.summary}</span>
                            <span className="rd-fn-meta">
                                {[
                                    head.pages ? `读了 ${head.pages} 页` : '',
                                    head.annCount ? `留下 ${head.annCount} 条批注` : '',
                                    head.replyCount ? `回了 ${head.replyCount} 条` : '',
                                    (head.tokensIn || head.tokensOut || head.tokens) ? `${fmtTok(head.tokens)}t` : '',
                                ].filter(Boolean).join(' · ')}
                            </span>
                        </button>
                    ),
                };
            }),
        ].sort((a, b) => b.at.localeCompare(a.at));

        return (
            <div className="rd-screen" data-rd-page="char-book">
                <div className="rd-headbar">
                    <button className="rd-back" onClick={() => setView(bookFrom)}><ArrowLeft size={18} />返回</button>
                </div>

                <div className="rd-bk-hero">
                    <div className="rd-bk-who">
                        <Face avatar={full?.avatar} name={name} size={44} />
                        <div className="rd-bk-name">{name}</div>
                    </div>
                    <div className="rd-bk-cover">
                        <ReaderCover coverRef={book.coverRef} title={book.title} compact />
                    </div>
                </div>
                <div className="rd-bk-line">
                    {s && s.percent >= 99 ? '读完' : '在读'}<span className="rd-bk-book">《{book.title}》</span>
                </div>
                <div className="rd-bk-stat">
                    <span className="rd-bk-check">✓</span>
                    {[
                        s && s.seconds > 0 ? fmtDuration(s.seconds) : '',
                        `${rows.filter((n) => n.made).length} 条笔记`,
                        s && s.percent > 0 ? `读到这里 ${s.percent}%` : '',
                    ].filter(Boolean).join(' · ')}
                </div>

                {items.length === 0 ? (
                    <div className="rd-empty">
                        <div className="rd-empty-title">这本书上还没什么</div>
                        <div className="rd-empty-text">他读过的段落、留下的批注和讨论都会按时间排在这儿。</div>
                    </div>
                ) : (
                    <div className="rd-tl rd-tl-screen rd-bk-tl">
                        {items.map((it) => (
                            <div className="rd-tl-item" key={it.key}>
                                <span className="rd-tl-dot" style={{ background: pen }} />
                                <div className="rd-tl-body">{it.node}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // ── 内页：他自己的模型 ──
    if (view === 'api') {
        const set = (patch: Partial<NonNullable<typeof p.api>>) => setCharReadPrefs(charId, {
            api: { baseUrl: '', apiKey: '', model: '', ...(p.api ?? {}), ...patch },
        });
        return (
            <div className="rd-screen" data-rd-page="char-api">
                <div className="rd-headbar">
                    <button className="rd-back" onClick={() => setView('settings')}><ArrowLeft size={18} />设置</button>
                    <div className="rd-headbar-title">{name} 自己的模型</div>
                </div>
                <div className="rd-muted" style={{ marginBottom: 'var(--rd-space-3)' }}>
                    配了他就用这一个——比大设置优先。没配就按 共读 → 回复 → 单独读书 → 主 API 往下落。
                </div>
                <div className="rd-card">
                    <div className="rd-btn-row">
                        <button
                            className={`rd-chip${!p.api?.model ? ' rd-chip-on' : ''}`}
                            onClick={() => setCharReadPrefs(charId, { api: undefined })}
                        >
                            跟着大设置
                        </button>
                        {apiPresets.map((preset) => {
                            const on = !!p.api?.model
                                && normalizeApiModel(p.api.model) === normalizeApiModel(preset.config.model)
                                && normalizeApiBaseUrl(p.api.baseUrl ?? '') === normalizeApiBaseUrl(preset.config.baseUrl);
                            return (
                                <button
                                    key={preset.id}
                                    className={`rd-chip${on ? ' rd-chip-on' : ''}`}
                                    onClick={() => set({
                                        baseUrl: normalizeApiBaseUrl(preset.config.baseUrl),
                                        apiKey: normalizeApiCredential(preset.config.apiKey),
                                        model: normalizeApiModel(preset.config.model),
                                    })}
                                >
                                    {preset.name}
                                </button>
                            );
                        })}
                    </div>
                    <div className="rd-api-form">
                        <input className="rd-field" placeholder="baseUrl（带 /v1）" value={p.api?.baseUrl ?? ''}
                            onChange={(e) => set({ baseUrl: e.target.value })} />
                        <input className="rd-field" placeholder="apiKey" value={p.api?.apiKey ?? ''}
                            onChange={(e) => set({ apiKey: e.target.value })} />
                        <input className="rd-field" placeholder="model" value={p.api?.model ?? ''}
                            onChange={(e) => set({ model: e.target.value })} />
                    </div>
                    <div className="rd-muted" style={{ marginTop: 'var(--rd-space-3)' }}>
                        {p.api?.model ? `他现在用：${p.api.model}` : '现在跟着大设置走。'}
                    </div>
                </div>
            </div>
        );
    }

    // ── 内页：他的设置（右上角那个齿轮进来的；主页上不放设置项）──
    if (view === 'settings') {
        return (
            <div className="rd-screen" data-rd-page="char-settings">
                <div className="rd-headbar">
                    <button className="rd-back" onClick={() => setView('main')}><ArrowLeft size={18} />{name}</button>
                    <div className="rd-headbar-title">他的设置</div>
                </div>

                <div className="rd-card">
                    <div className="rd-switch-row">
                        <div className="rd-row-label">让他读书</div>
                        <button
                            className={`rd-switch${p.readEnabled ? ' rd-switch-on' : ''}`}
                            aria-label="允许读书"
                            onClick={() => setReadEnabled(charId, !p.readEnabled)}
                        >
                            <span className="rd-switch-knob" />
                        </button>
                        <div className="rd-muted">关着的角色不出现在一起读书的邀请名单里。</div>
                    </div>
                </div>

                <div className="rd-section-title">怎么读</div>
                <div className="rd-card">
                    <div className="rd-row-label">提示词</div>
                    <div className="rd-btn-row">
                        {(['', 'rp'] as const).map((v) => (
                            <button key={v || 'def'}
                                className={`rd-chip${p.promptPreset === v ? ' rd-chip-on' : ''}`}
                                onClick={() => setCharReadPrefs(charId, { promptPreset: v })}>
                                {v === 'rp' ? 'rp 套' : '默认套'}
                            </button>
                        ))}
                    </div>
                    <div className="rd-muted" style={{ marginTop: 'var(--rd-space-2)' }}>
                        默认套写「你正在……」，不提角色扮演；rp 套是留给角色扮演写法的。
                    </div>

                    <div className="rd-row-label" style={{ marginTop: 'var(--rd-space-4)' }}>每次读几页</div>
                    <div className="rd-field-row">
                        <input className="rd-field rd-field-num" type="number" min={1} max={30} value={p.pages[0]}
                            onChange={(e) => setCharReadPrefs(charId, { pages: clampPages(Number(e.target.value), p.pages[1]) })} />
                        <span className="rd-muted">到</span>
                        <input className="rd-field rd-field-num" type="number" min={1} max={30} value={p.pages[1]}
                            onChange={(e) => setCharReadPrefs(charId, { pages: clampPages(p.pages[0], Number(e.target.value)) })} />
                        <span className="rd-muted">页（默认 1 页，最多 30）</span>
                    </div>

                    <div className="rd-row-label" style={{ marginTop: 'var(--rd-space-4)' }}>每次笔记上限</div>
                    <div className="rd-field-row">
                        <input className="rd-field rd-field-num" type="number" min={1} max={12} value={p.noteLimit}
                            onChange={(e) => setCharReadPrefs(charId, { noteLimit: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })} />
                        <span className="rd-muted">条</span>
                    </div>

                    <div className="rd-switch-row" style={{ marginTop: 'var(--rd-space-4)' }}>
                        <div className="rd-row-label">回复模式</div>
                        <button
                            className={`rd-switch${p.replyMode ? ' rd-switch-on' : ''}`}
                            aria-label="回复模式"
                            onClick={() => setCharReadPrefs(charId, { replyMode: !p.replyMode })}
                        >
                            <span className="rd-switch-knob" />
                        </button>
                        <div className="rd-muted">开着的时候，他读完顺手就回；关着要手动点一下。</div>
                    </div>
                </div>

                <div className="rd-section-title">他这个人</div>
                <div className="rd-card rd-card-flush">
                    <div className="rd-list">
                        <button className="rd-item rd-item-tap" onClick={() => setStyleOpen(true)}>
                            <span className="rd-item-label">
                                阅读风格
                                <div className="rd-muted">{p.penColor ? `做笔记用 ${p.penColor} 这支笔` : '还没选笔色'}</div>
                            </span>
                            <span className="rd-item-value">
                                <span className="rd-note-dot" style={{ background: pen }} />
                            </span>
                            <span className="rd-item-chev"><CaretRight size={14} /></span>
                        </button>
                        <button className="rd-item rd-item-tap" onClick={() => setView('api')}>
                            <span className="rd-item-label">
                                他自己的模型
                                <div className="rd-muted">{p.api?.model ? p.api.model : '跟着大设置'}</div>
                            </span>
                            <span className="rd-item-chev"><CaretRight size={14} /></span>
                        </button>
                    </div>
                </div>

                {styleOpen && (
                    <ReaderCharStyleSheet
                        charId={charId}
                        name={name}
                        onClose={() => setStyleOpen(false)}
                        notify={notify}
                    />
                )}
            </div>
        );
    }

    // ── 主页 ──
    const feedCount = { notes: feedNotes.length, talk: feedTalk.length, acts: feedActs.length };

    return (
        <div className="rd-screen" data-rd-page="char">
            <div className="rd-headbar">
                <button className="rd-back" onClick={onBack}><ArrowLeft size={18} />书库</button>
                <button className="rd-icon-btn rd-headbar-end" aria-label="他的设置" onClick={() => setView('settings')}>
                    <Gear size={19} />
                </button>
            </div>

            <div className="rd-cp-hero">
                <Face avatar={full?.avatar} name={name} />
                <div className="rd-cp-name">{name}</div>
                <div className="rd-cp-tags">
                    <span className="rd-cp-tag">{p.readEnabled ? '可以一起读' : '还没开读书开关'}</span>
                    <span className="rd-cp-tag">{p.promptPreset === 'rp' ? 'rp 套' : '默认套'}</span>
                </div>

                {/* 最近一次的状态：感受和产出都摆在这一行上（点开是详细状态） */}
                {latest && latestHead ? (
                    <button className="rd-cp-state" onClick={() => setStateOpen(true)}>
                        <span className="rd-cp-state-line">
                            {fmtClock(latestHead.createdAt)} {latestHead.summary}
                        </span>
                        <span className="rd-cp-state-line">
                            {[
                                latestHead.annCount ? `留下了 ${latestHead.annCount} 处批注` : '',
                                latestHead.replyCount ? `参与了 ${latestHead.replyCount} 处讨论` : '',
                                latestHead.pages ? `共翻阅 ${latestHead.pages} 页` : '',
                                (latestHead.tokensIn || latestHead.tokensOut || latestHead.tokens)
                                    ? `${fmtTok(latestHead.tokens)}t` : '',
                            ].filter(Boolean).join(' ｜ ') || '点开看这一次的详细状态'}
                        </span>
                    </button>
                ) : (
                    <div className="rd-cp-state"><span className="rd-cp-state-line">他还没读过书</span></div>
                )}
            </div>

            {/* 三格数字（点一下跳到对应那一栏） */}
            <div className="rd-cp-stats">
                <button className="rd-cp-stat" onClick={() => { setFeed('acts'); }}>
                    <span className="rd-cp-stat-num">{fmtBig(stats.tokens)}</span>
                    <span className="rd-cp-stat-cap">Token总消耗</span>
                </button>
                <button className="rd-cp-stat" onClick={() => setFeed('notes')}>
                    <span className="rd-cp-stat-num">{stats.notes}</span>
                    <span className="rd-cp-stat-cap">留下的批注</span>
                </button>
                <button className="rd-cp-stat" onClick={() => setFeed('talk')}>
                    <span className="rd-cp-stat-num">{stats.talks}</span>
                    <span className="rd-cp-stat-cap">参与的讨论</span>
                </button>
            </div>

            {/* 开关那种按钮：没开是**实心主色 + 白字**（像「关注」），开了是**灰底 + 次要字**（像「已关注」） */}
            <button
                className={`rd-cp-follow${p.readEnabled ? ' rd-cp-follow-on' : ''}`}
                onClick={() => setReadEnabled(charId, !p.readEnabled)}
            >
                {p.readEnabled ? '✓ 可以一起读' : '让他读书'}
            </button>

            {/* 书架卡：三栏 + 三列封面（不横划）+ 查看书架 */}
            <div className="rd-cp-card">
                <div className="rd-cp-tabs">
                    {SHELF_TABS.map(([k, label]) => (
                        <button
                            key={k}
                            className={`rd-cp-tab${shelfTab === k ? ' rd-cp-tab-on' : ''}`}
                            onClick={() => setShelfTab(k)}
                        >
                            {k === 'all'
                                ? label
                                : `${label} · ${k === 'done'
                                    ? shelf.filter((s) => s.percent >= 99).length
                                    : shelf.filter((s) => s.together).length}`}
                        </button>
                    ))}
                </div>

                {readingNow && (
                    <button className="rd-cp-now" onClick={() => openBookRecord(readingNow.book.id, 'main')}>
                        最近在读<span className="rd-cp-now-book">《{readingNow.book.title}》</span>
                        <span className="rd-cp-now-pct">{readingNow.percent}%</span>
                    </button>
                )}

                {shelfShown.length === 0 ? (
                    <div className="rd-muted" style={{ padding: 'var(--rd-space-3) 0' }}>
                        {shelfTab === 'done' ? '还没读完过一本。' : shelfTab === 'together' ? '还没有你们都在读的书。' : '书架还空着。'}
                    </div>
                ) : (
                    <div className="rd-grid rd-cp-grid">
                        {shelfShown.slice(0, 3).map((s) => (
                            <button className="rd-book" key={s.book.id} onClick={() => openBookRecord(s.book.id, 'main')}>
                                <div className="rd-book-cover">
                                    <ReaderCover coverRef={s.book.coverRef} title={s.book.title} compact />
                                </div>
                                <div className="rd-book-meta">
                                    <div className="rd-book-title">{s.book.title}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                <button className="rd-cp-more" onClick={() => setView('shelf')}>查看书架</button>
            </div>

            {/* 流水：笔记 / 讨论 / 活动 + 筛选 */}
            <div className="rd-cp-feedhead">
                {([['notes', `笔记(${made.length})`], ['talk', `讨论(${talked.length})`], ['acts', `活动(${groups.length})`]] as const).map(([k, label]) => (
                    <button
                        key={k}
                        className={`rd-cp-feedtab${feed === k ? ' rd-cp-feedtab-on' : ''}`}
                        onClick={() => setFeed(k)}
                    >
                        {label}
                    </button>
                ))}
                <button className="rd-icon-btn" aria-label="筛选" onClick={() => setFilterOpen(true)}>
                    <FunnelSimple size={18} />
                </button>
            </div>

            {filtering && (
                <div className="rd-filter-row">
                    {word && <button className="rd-chip rd-chip-on" onClick={() => setQ('')}>“{q.trim()}” <X size={12} /></button>}
                    {bookIds.map((id) => (
                        <button className="rd-chip rd-chip-on" key={id} onClick={() => setBookIds(toggleIn(bookIds, id))}>
                            《{titleOf(id) ?? id}》 <X size={12} />
                        </button>
                    ))}
                    <button className="rd-filter-clear" onClick={clearFilters}>清掉筛选</button>
                </div>
            )}

            {loading ? (
                <div className="rd-muted">正在翻他的记录…</div>
            ) : feedCount[feed] === 0 ? (
                <div className="rd-empty">
                    <div className="rd-empty-title">
                        {filtering ? '这些条件下没有东西' : feed === 'notes' ? '他还没留下笔记' : feed === 'talk' ? '他还没参与讨论' : '还没有活动记录'}
                    </div>
                    <div className="rd-empty-text">
                        {filtering ? '换个词，或者把筛选清掉再看看。' : '开了读书开关、喊他一起读一次，这里就有了。'}
                    </div>
                </div>
            ) : feed === 'acts' ? (
                <div className="rd-card rd-card-flush">
                    <div className="rd-list">
                        {feedActs.slice(0, 20).map((g) => {
                            const head = headOf(g);
                            return (
                                <button className="rd-item rd-item-tap" key={head.id} onClick={() => setAct(g)}>
                                    <span className="rd-item-label">
                                        {head.summary}
                                        <div className="rd-muted">
                                            {fmtClock(head.createdAt)} · 这次 {g.filter((a) => a.kind !== 'summary').length} 次调用
                                        </div>
                                    </span>
                                    <span className="rd-item-chev"><CaretRight size={14} /></span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div className="rd-card rd-card-flush">
                    {(feed === 'notes' ? feedNotes : feedTalk).slice(0, 30).map((n) => noteFoldOf(n, feed, true))}
                </div>
            )}

            {/* 详细状态与活动记录：最近一次摆在上面，往期折叠在下面 */}
            {stateOpen && latest && latestHead && (
                <ActivityDetailSheet
                    calls={latest}
                    ownerName={name}
                    bookTitle={titleOf(latestHead.bookId)}
                    title={`${name} 的状态`}
                    onClose={() => setStateOpen(false)}
                    extra={groups.length > 1 ? (
                        <div style={{ marginTop: 'var(--rd-space-5)' }}>
                            <div className="rd-row-label">往期</div>
                            {groups.slice(1, 9).map((g) => {
                                const head = headOf(g);
                                const open = openPast.has(head.id);
                                return (
                                    <div className={`rd-fold${open ? ' rd-fold-open' : ''}`} key={head.id}>
                                        <button className="rd-fold-head" onClick={() => togglePast(head.id)}>
                                            <span className="rd-fold-label">{head.summary}</span>
                                            <span className="rd-fold-value">{fmtDay(head.createdAt)}</span>
                                            <CaretDown size={14} className="rd-fold-chev" />
                                        </button>
                                        {open && (
                                            <div className="rd-fold-body">
                                                <RoamCalls calls={g} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : undefined}
                />
            )}

            {act && (
                <ActivityDetailSheet
                    calls={act}
                    ownerName={name}
                    bookTitle={titleOf(act[0]?.bookId)}
                    onClose={() => setAct(null)}
                />
            )}

            {forwarding && (
                <NoteForwardSheet
                    card={forwardOf(forwarding)}
                    onClose={() => setForwarding(null)}
                    notify={notify}
                />
            )}

            {/* 筛选：搜句子 / 批注 / 讨论，加「哪几本书」（可多选叠加） */}
            {filterOpen && (
                <div className="rd-sheet-mask" onClick={() => setFilterOpen(false)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" onClick={() => setFilterOpen(false)} />
                        <div className="rd-sheet-title">筛选</div>

                        <div className="rd-search-input" style={{ marginBottom: 'var(--rd-space-4)' }}>
                            <MagnifyingGlass size={15} />
                            <input
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

                        <div className="rd-menu-label">哪几本书（可多选）</div>
                        <div className="rd-card rd-card-flush">
                            <div className="rd-list">
                                <button className="rd-item" onClick={() => setBookIds([])}>
                                    <span className="rd-item-label">所有书</span>
                                    {bookIds.length === 0 && <span className="rd-check">✓</span>}
                                </button>
                                {shelf.map((s) => (
                                    <button className="rd-item" key={s.book.id} onClick={() => setBookIds(toggleIn(bookIds, s.book.id))}>
                                        <span className="rd-item-label">{s.book.title}</span>
                                        {bookIds.includes(s.book.id) && <span className="rd-check">✓</span>}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rd-actions">
                            {filtering && <button className="rd-nb-goto" onClick={clearFilters}>清掉筛选</button>}
                            <button className="rd-btn rd-btn-primary" onClick={() => setFilterOpen(false)}>好了</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

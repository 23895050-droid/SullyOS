// 读书模块 · 活动记录页（2026-09-21，T5 二次反馈）
//
// 她 09-21 的原话：「活动记录改成在主页里只能预览 8 条，点查看全部进入活动记录页面，
// 按天看，按角色看，按书看，按性质看，筛选可以勾选多个条件。活动记录详细信息只保留最近一周的。」
// 然后第二轮（照她发的参考图）：
//   · 顶上那一坨筛选**收起来**，再加一个**搜索框**；
//   · 日期做成**一排能点的天**（参考图里 SUN 8 / MON 9 那条），比一排胶囊直观；
//   · 每条做成**卡片 + 左边一道他自己的笔色**，标题 / 谁和哪本书 / 数字三层分开——
//     她说「内容主次分明也很重要，现在太平了」；
//   · 时间线那个点的颜色 = **那个人的划线颜色**（他自己的笔色）；他在划线设置里改了笔色，点跟着变。
//
// 「短时间一个人多条记录折成一条」是**展示层的合并**（`mergeRuns`）——
// 库里的行一条没动，点开这条才看见里面每一次调用。

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CaretDown, FunnelSimple, MagnifyingGlass, X } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { useBlobRefUrl } from '../../utils/blobRef';
import {
    listBooks, listProgressByBook, listRecentRoamActivities,
    type RdBook, type RdRoamActivity,
} from '../../utils/reader/readerDb';
import {
    RUN_KINDS, RUN_KEEP_DAYS, dayKeyOf, dayKeyOfDate, dayLabel, groupByDay, lastDays, mergeRuns,
    runHitKinds, runMeta, runVerbs, withinDays, type RoamRun,
} from '../../utils/reader/readerDigest';
import { highlightColorOf, useReaderPrefs } from './readerPrefs';
import ActivityDetailSheet from './ActivityDetailSheet';
import { canRetrySummary, retrySummaryFor } from './coreadRetry';

const fmtClock = (iso: string): string => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * 时间精确到分钟（她 09-21）。一条里只有一分钟的事就写一个点
 * （「01:11–01:11」是拍出来看到的），跨天才两头都写。
 */
const fmtSpan = (run: RoamRun): string => {
    const a = fmtClock(run.from);
    const b = fmtClock(run.to);
    const d1 = dayKeyOf(run.from);
    const d2 = dayKeyOf(run.to);
    if (d1 !== d2) return `${d1.slice(5)} ${a} – ${d2.slice(5)} ${b}`;
    return a === b ? a : `${a}–${b}`;
};

/** 小头像（卡片第二行那个「谁」） */
function Face({ avatar, name, size = 18 }: { avatar?: string; name: string; size?: number }) {
    const url = useBlobRefUrl(avatar);
    return (
        <div className="rd-face" style={{ width: size }}>
            {url ? <img src={url} alt="" /> : <span>{name.slice(0, 1)}</span>}
        </div>
    );
}

/** 收起来的那一格里的一排胶囊（多选）。空 = 不筛 */
function Chips({ label, items, picked, onToggle }: {
    label: string;
    items: Array<{ key: string; label: string }>;
    picked: string[];
    onToggle: (key: string) => void;
}) {
    if (items.length === 0) return null;
    return (
        <div className="rd-flt">
            <span className="rd-flt-label">{label}</span>
            <div className="rd-chips rd-chips-wrap">
                {items.map((it) => (
                    <button
                        key={it.key}
                        className={`rd-chip${picked.includes(it.key) ? ' rd-chip-on' : ''}`}
                        onClick={() => onToggle(it.key)}
                    >
                        {it.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

interface Props {
    notify: (msg: string) => void;
    onBack: () => void;
}

export default function ActivityPage({ notify, onBack }: Props) {
    const { characters, userProfile, apiConfig } = useOS();
    const prefs = useReaderPrefs();
    const [books, setBooks] = useState<RdBook[]>([]);
    const [roam, setRoam] = useState<RdRoamActivity[]>([]);
    const [percent, setPercent] = useState<Map<string, number>>(new Map());
    const [loading, setLoading] = useState(true);
    /** 选中的那一天（'' = 最近一周全看） */
    const [day, setDay] = useState('');
    const [q, setQ] = useState('');
    const [fltOpen, setFltOpen] = useState(false);
    const [who, setWho] = useState<string[]>([]);
    const [book, setBook] = useState<string[]>([]);
    const [kind, setKind] = useState<string[]>([]);
    const [act, setAct] = useState<RoamRun | null>(null);
    const [retrying, setRetrying] = useState(false);
    const [retryNote, setRetryNote] = useState('');
    const [token, setToken] = useState(0);

    useEffect(() => {
        void (async () => {
            setLoading(true);
            const bs = await listBooks();
            // 这本书上的进度（每个人读到哪）——表面小字里的「进度 N%」
            const pct = new Map<string, number>();
            for (const b of bs) {
                const progs = await listProgressByBook(b.id);
                for (const p of progs) pct.set(`${p.bookId}|${p.ownerId}`, p.percent);
            }
            setBooks(bs);
            setPercent(pct);
            setRoam(await listRecentRoamActivities(400));
            setLoading(false);
        })();
    }, [token]);

    const nameOf = (ownerId: string): string => (
        ownerId === 'user'
            ? (userProfile?.name ?? 'Angel')
            : (characters.find((c) => c.id === ownerId)?.name ?? ownerId)
    );
    const faceOf = (ownerId: string) => ({
        name: nameOf(ownerId),
        avatar: ownerId === 'user'
            ? userProfile?.avatar
            : characters.find((c) => c.id === ownerId)?.avatar,
    });
    const titleOf = (bookId: string): string => books.find((b) => b.id === bookId)?.title ?? '这本书';
    /** 那个人的划线颜色（他自己的笔色）——时间线的点和卡片左缘都跟着它走 */
    const penOf = (ownerId: string) => highlightColorOf(prefs, ownerId);

    /** 最近一周的全部活动（合并之后） */
    const runs = useMemo(
        () => mergeRuns(roam.filter((a) => withinDays(a.createdAt, RUN_KEEP_DAYS))),
        [roam],
    );
    const week = useMemo(() => lastDays(RUN_KEEP_DAYS), []);

    /** 筛选项都在**没筛之前**的全集里长出来（不然勾一个就少一半选项） */
    const whoItems = useMemo(() => {
        const seen: string[] = [];
        for (const r of runs) if (!seen.includes(r.ownerId)) seen.push(r.ownerId);
        return seen.map((id) => ({ key: id, label: nameOf(id) }));
    }, [runs, characters, userProfile]);
    const bookItems = useMemo(() => {
        const seen: string[] = [];
        for (const r of runs) if (!seen.includes(r.bookId)) seen.push(r.bookId);
        return seen.map((id) => ({ key: id, label: titleOf(id) }));
    }, [runs, books]);

    const toggleIn = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
    const word = q.trim().toLowerCase();
    const hitWord = (r: RoamRun): boolean => {
        if (!word) return true;
        const hay = [
            nameOf(r.ownerId), titleOf(r.bookId), runVerbs(r),
            ...r.calls.flatMap((a) => [a.summary, a.excerpt ?? '', a.feeling ?? '', ...(a.replies ?? [])]),
        ].join(' ').toLowerCase();
        return hay.includes(word);
    };

    const shown = useMemo(
        () => runs.filter((r) => (day === '' || dayKeyOf(r.to) === day)
            && (who.length === 0 || who.includes(r.ownerId))
            && (book.length === 0 || book.includes(r.bookId))
            && runHitKinds(r, kind)
            && hitWord(r)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [runs, day, who, book, kind, word, characters, userProfile, books],
    );
    const days = useMemo(() => groupByDay(shown), [shown]);
    const today = dayKeyOfDate(new Date());
    const picked = who.length + book.length + kind.length;
    const filtering = picked > 0 || !!word || day !== '';
    const clearAll = () => { setWho([]); setBook([]); setKind([]); setQ(''); setDay(''); };

    const doRetry = async (calls: RdRoamActivity[]) => {
        setRetrying(true);
        setRetryNote('');
        const out = await retrySummaryFor(calls, apiConfig);
        setRetrying(false);
        if (out.ok) {
            setAct(null);
            notify(out.message);
            setToken((n) => n + 1);
        } else {
            setRetryNote(out.message);
        }
    };

    return (
        <div className="rd-screen" data-rd-page="activities">
            <div className="rd-headbar">
                <button className="rd-icon-btn" onClick={onBack} aria-label="回书库">
                    <ArrowLeft size={18} />
                </button>
                <div className="rd-headbar-title">活动记录</div>
            </div>

            {/* 日期条：一排能点的天（她 09-21 照参考图要的） */}
            <div className="rd-days">
                <button
                    className={`rd-day-cell${day === '' ? ' rd-day-cell-on' : ''}`}
                    onClick={() => setDay('')}
                >
                    <span className="rd-day-w">　</span>
                    <span className="rd-day-n rd-day-all">全部</span>
                </button>
                {week.map((d) => (
                    <button
                        key={d.key}
                        className={`rd-day-cell${day === d.key ? ' rd-day-cell-on' : ''}`}
                        onClick={() => setDay(day === d.key ? '' : d.key)}
                    >
                        <span className="rd-day-w">{d.w}</span>
                        <span className="rd-day-n">{d.n}</span>
                    </button>
                ))}
            </div>

            {/* 搜索 + 筛选开关（四排胶囊收在下面——她嫌顶上一坨丑） */}
            <div className="rd-act-tools">
                <div className="rd-search-input">
                    <MagnifyingGlass size={15} />
                    <input
                        value={q}
                        placeholder="搜书名、谁、说了什么…"
                        onChange={(e) => setQ(e.target.value)}
                    />
                    {q && (
                        <button className="rd-search-cancel" onClick={() => setQ('')} aria-label="清空">
                            <X size={15} />
                        </button>
                    )}
                </div>
                <button
                    className={`rd-flt-btn${picked > 0 ? ' rd-flt-btn-on' : ''}`}
                    onClick={() => setFltOpen((v) => !v)}
                    aria-label="筛选"
                >
                    <FunnelSimple size={16} />
                    {picked > 0 && <span className="rd-flt-count">{picked}</span>}
                    <CaretDown size={13} className={`rd-fold-chev${fltOpen ? ' rd-fold-chev-on' : ''}`} />
                </button>
            </div>

            {fltOpen && (
                <div className="rd-card" style={{ marginBottom: 'var(--rd-space-4)' }}>
                    <Chips label="谁" items={whoItems} picked={who} onToggle={(k) => setWho(toggleIn(who, k))} />
                    <Chips label="书" items={bookItems} picked={book} onToggle={(k) => setBook(toggleIn(book, k))} />
                    <Chips
                        label="性质"
                        items={RUN_KINDS.map((k) => ({ key: k.key, label: k.label }))}
                        picked={kind}
                        onToggle={(k) => setKind(toggleIn(kind, k))}
                    />
                    <div className="rd-muted" style={{ marginTop: 'var(--rd-space-3)' }}>
                        这里只看得到最近一周的活动。
                    </div>
                </div>
            )}
            {filtering && (
                <button className="rd-btn rd-btn-soft" onClick={clearAll}>
                    <FunnelSimple size={14} /> 清掉筛选
                </button>
            )}

            {loading ? (
                <div className="rd-muted" style={{ marginTop: 'var(--rd-space-5)' }}>正在翻记录…</div>
            ) : days.length === 0 ? (
                <div className="rd-empty">
                    <div className="rd-empty-title">{filtering ? '这些条件下没有东西' : '这一周还没有活动记录'}</div>
                    <div className="rd-empty-text">
                        {filtering ? '换个条件，或者把筛选清掉再看看。' : '开了读书开关、喊他一起读一次，这里就有了。'}
                    </div>
                </div>
            ) : (
                days.map((d) => (
                    <div key={d.day} style={{ marginTop: 'var(--rd-space-5)' }}>
                        <div className="rd-day">
                            <span className="rd-day-name">{dayLabel(d.day, today)}</span>
                            <span className="rd-day-count">{d.runs.length} 条</span>
                        </div>
                        <div className="rd-tl rd-tl-screen">
                            {d.runs.map((r) => {
                                const meta = runMeta(r, percent.get(`${r.bookId}|${r.ownerId}`));
                                const pen = penOf(r.ownerId);
                                return (
                                    <button
                                        className="rd-tl-item rd-tl-tap"
                                        key={r.key}
                                        onClick={() => { setRetryNote(''); setAct(r); }}
                                    >
                                        <span className="rd-tl-dot" style={{ background: pen }} />
                                        <div className="rd-tl-body">
                                            <div className="rd-ag-card" style={{ borderLeftColor: pen }}>
                                                <div className="rd-ag-head">
                                                    <span className="rd-ag-title">{runVerbs(r)}</span>
                                                    <span className="rd-ag-time">{fmtSpan(r)}</span>
                                                </div>
                                                <div className="rd-ag-sub">
                                                    <Face {...faceOf(r.ownerId)} size={18} />
                                                    <span>{nameOf(r.ownerId)}</span>
                                                    <span>·</span>
                                                    <span className="rd-ag-book">《{titleOf(r.bookId)}》</span>
                                                </div>
                                                {meta && <div className="rd-ag-meta">{meta}</div>}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))
            )}

            {act && (
                <ActivityDetailSheet
                    calls={act.calls}
                    ownerName={nameOf(act.ownerId)}
                    bookTitle={titleOf(act.bookId)}
                    onClose={() => { setAct(null); setRetryNote(''); }}
                    onDeleted={() => { setAct(null); setToken((n) => n + 1); }}
                    {...(canRetrySummary(act.calls)
                        ? { onRetry: () => void doRetry(act.calls), retrying, retryNote }
                        : {})}
                />
            )}
        </div>
    );
}

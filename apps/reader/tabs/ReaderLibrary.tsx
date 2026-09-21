// 读书模块 · 书库页（2026-09-15 立项 / 2026-09-21 T5 重做）
//
// 她 09-21 给这一页定的三块（plan T5），从上到下：
//   ① 最近的状态 —— 最后一次活动里**他自己写的感受**直接摊在表面上。
//      这就是「状态」和「活动记录」的差别：活动记录只说做了什么，状态说的是他心里怎么了。
//      点开 = 详细状态与活动记录弹卡（这一次详细 + 往期折叠）
//   ② 阅读排行榜 —— 六种口径（总 token / 输入 / 输出 / 批注总字数 / 参与讨论 / 一起读书页），
//      点谁进谁的个人页
//   ③ 活动记录 —— **所有人（含你自己）**。她 09-21 二次反馈：主页只**预览 8 条**、
//      按时间线摆、时间精确到分钟；「查看全部」翻进活动记录页（按天 / 谁 / 书 / 性质筛，只留最近一周）。
//      同一个人同一本书连着做的几件事**并成一条**（`mergeRuns`，纯展示层，库里一条没动）；
//      点开 = 这条里每一次调用 + 摘要记录 + 补摘入口
//   ④ 谁能读书 —— 开关**已搬去设置页**（2026-09-21 T6 ④：设置 · 一起读书 · 使用书库的朋友）。
//      书库页从此只是一面墙，不再是一堆开关。
//
// 与笔记页的分工不变（v3 §4.4）：笔记页按书组织，看「这本书上留下了什么痕迹」；
// 书库页按人组织，看「谁在读书」。

import { useEffect, useMemo, useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { useOS } from '../../../context/OSContext';
import { useBlobRefUrl } from '../../../utils/blobRef';
import {
    listAnnotations, listBooks, listProgressByBook, listRecentRoamActivities, listThreads,
    type RdAnnotation, type RdBook, type RdRoamActivity, type RdThread,
} from '../../../utils/reader/readerDb';
import {
    BOARDS, RUN_KEEP_DAYS, buildBoards, fmtRank, groupByDay, mergeRuns, roamVerb, runMeta, runVerbs,
    withinDays, type BoardKey, type RoamRun,
} from '../../../utils/reader/readerDigest';
import { charPrefsOf, readingCharIds, useReaderCharPrefs } from '../readerCharPrefs';
import { highlightColorOf, useReaderPrefs } from '../readerPrefs';
import ActivityDetailSheet, { RoamCalls } from '../ActivityDetailSheet';
import { canRetrySummary, retrySummaryFor } from '../coreadRetry';

const fmtDay = (iso: string) => (iso || '').slice(5, 10).replace('-', '/');
const fmtClock = (iso: string): string => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fmtWhen = (iso: string) => `${fmtDay(iso)} ${fmtClock(iso)}`;

/** 组里最后一条真调用（摘要那趟不算门面）——和角色个人页同一个口径 */
const headOf = (group: RdRoamActivity[]): RdRoamActivity => {
    const calls = group.filter((a) => a.kind !== 'summary');
    return calls.length > 0 ? calls[calls.length - 1] : group[group.length - 1];
};

/** 圆头像：宽度由调用方给，其余样式在 `.rd-face` 里（hook 不能进 map，所以单独一个组件） */
function Face({ avatar, name, size = 38 }: { avatar?: string; name: string; size?: number }) {
    const url = useBlobRefUrl(avatar);
    return (
        <div className="rd-face" style={{ width: size }}>
            {url ? <img src={url} alt="" /> : <span>{name.slice(0, 1)}</span>}
        </div>
    );
}

interface Props {
    /** 进某个角色的个人页 */
    onOpenChar: (charId: string) => void;
    /** 进活动记录整屏页（她 09-21：主页只预览 8 条，「查看全部」翻进去） */
    onOpenActs: () => void;
    notify?: (msg: string) => void;
}

export default function ReaderLibrary({ onOpenChar, onOpenActs, notify }: Props) {
    const { characters, userProfile, apiConfig } = useOS();
    const charPrefs = useReaderCharPrefs();
    const prefs = useReaderPrefs();

    const [books, setBooks] = useState<RdBook[]>([]);
    const [roam, setRoam] = useState<RdRoamActivity[]>([]);
    const [anns, setAnns] = useState<RdAnnotation[]>([]);
    const [threads, setThreads] = useState<RdThread[]>([]);
    /** `${bookId}|${ownerId}` → 读到百分之多少（活动记录表面那句「进度更新到哪」） */
    const [percent, setPercent] = useState<Map<string, number>>(new Map());
    const [loading, setLoading] = useState(true);
    const [board, setBoard] = useState<BoardKey>('tokens');
    /** 排行榜那六种口径的胶囊（收着，点标题右边那个按钮才摊开） */
    const [boardOpen, setBoardOpen] = useState(false);
    const [statusOpen, setStatusOpen] = useState(false);
    const [act, setAct] = useState<RoamRun | null>(null);
    const [openPast, setOpenPast] = useState<Set<string>>(new Set());
    const [retrying, setRetrying] = useState(false);
    const [retryNote, setRetryNote] = useState('');
    const [token, setToken] = useState(0);

    useEffect(() => {
        void (async () => {
            setLoading(true);
            const bs = await listBooks();
            const packs = await Promise.all(bs.map(async (b) => {
                const [a, t, progs] = await Promise.all([
                    listAnnotations(b.id), listThreads(b.id), listProgressByBook(b.id),
                ]);
                return { a, t, progs };
            }));
            const pct = new Map<string, number>();
            const allAnns: RdAnnotation[] = [];
            const allThreads: RdThread[] = [];
            for (const p of packs) {
                allAnns.push(...p.a);
                allThreads.push(...p.t);
                for (const row of p.progs) pct.set(`${row.bookId}|${row.ownerId}`, row.percent);
            }
            setBooks(bs);
            setAnns(allAnns);
            setThreads(allThreads);
            setPercent(pct);
            setRoam(await listRecentRoamActivities(200));
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
    /** 活动记录那条的小字（页数 / 进度 / 批注 / 回复 / token，都是这条里加总的） */
    const metaOf = (r: RoamRun) => runMeta(r, percent.get(`${r.bookId}|${r.ownerId}`));

    /** 同一次活动的调用聚成一组（按组里最后一条的时间倒序） */
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

    /** 角色那边的活动（你自己那几条不上状态卡，也不进「往期」） */
    const charGroups = useMemo(() => groups.filter((g) => headOf(g).charId !== 'user'), [groups]);
    const statusGroup = useMemo(
        () => charGroups.find((g) => g.some((a) => a.feeling)) ?? charGroups[0] ?? null,
        [charGroups],
    );
    const statusHead = statusGroup ? headOf(statusGroup) : null;
    /** 感受优先；这一次没写感受就退回那句「做了什么」，别让卡片空着 */
    const statusBody = statusGroup
        ? ([...statusGroup].reverse().find((a) => a.feeling)?.feeling ?? headOf(statusGroup).summary)
        : '';

    /** 排行榜上的角色：开了开关的，或者已经有活动记录的 */
    const boardCharIds = useMemo(
        () => characters
            .map((c) => c.id)
            .filter((id) => charPrefsOf(charPrefs, id).readEnabled || roam.some((a) => a.charId === id)),
        [characters, charPrefs, roam],
    );
    const boards = useMemo(
        () => buildBoards({ charIds: boardCharIds, roam, anns, threads }),
        [boardCharIds, roam, anns, threads],
    );
    const ranked = boards[board];

    const past = useMemo(
        () => charGroups.filter((g) => g !== statusGroup).slice(0, 8),
        [charGroups, statusGroup],
    );
    const togglePast = (id: string) => setOpenPast((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });

    /** 补摘：现场攒 ctx 补一次（coreadRetry 里那套）——成了就刷新，没成把原因写在按钮下面 */
    const doRetry = async (calls: RdRoamActivity[]) => {
        setRetrying(true);
        setRetryNote('');
        const out = await retrySummaryFor(calls, apiConfig);
        setRetrying(false);
        if (out.ok) {
            setStatusOpen(false);
            setAct(null);
            notify?.(out.message);
            setToken((n) => n + 1);
        } else {
            setRetryNote(out.message);
        }
    };
    const retryProps = (calls: RdRoamActivity[]) => (canRetrySummary(calls)
        ? { onRetry: () => void doRetry(calls), retrying, retryNote }
        : {});

    /**
     * 活动记录 = **最近一周**、**同一个人同一本书连着做的并成一条**（她 09-21）。
     * 主页只摆最新 8 条，剩下的在活动记录页里（按天 / 谁 / 书 / 性质筛）。
     */
    const runs = useMemo(
        () => mergeRuns(roam.filter((a) => withinDays(a.createdAt, RUN_KEEP_DAYS))),
        [roam],
    );
    const days = useMemo(() => groupByDay(runs), [runs]);

    if (loading) {
        return (
            <div className="rd-screen" data-rd-page="library">
                <div className="rd-head"><div className="rd-head-main"><div className="rd-head-title">书库</div></div></div>
                <div className="rd-muted">正在翻大家的读书记录…</div>
            </div>
        );
    }

    return (
        <div className="rd-screen" data-rd-page="library">
            <div className="rd-head">
                <div className="rd-head-main">
                    <div className="rd-head-title">书库</div>
                    <div className="rd-head-sub">谁在读书 · {readingCharIds(charPrefs).length} 位</div>
                </div>
            </div>

            {/* ① 最近的状态：感受摊在表面上 */}
            <div className="rd-section-title">最近的状态</div>
            {statusGroup && statusHead ? (
                <button className="rd-st" onClick={() => { setRetryNote(''); setStatusOpen(true); }}>
                    <div className="rd-st-top">
                        <Face {...faceOf(statusHead.charId)} size={38} />
                        <div className="rd-st-who">
                            <div className="rd-st-name">{nameOf(statusHead.charId)}</div>
                            <div className="rd-st-verb">
                                {roamVerb(statusHead)} · 《{titleOf(statusHead.bookId)}》
                            </div>
                        </div>
                        <span className="rd-st-time">{fmtWhen(statusHead.createdAt)}</span>
                    </div>
                    <div className="rd-st-feel">{statusBody}</div>
                    <div className="rd-st-hint">详细状态与活动记录 ›</div>
                </button>
            ) : (
                <div className="rd-card rd-muted">
                    还没有人读过书。开了下面的开关，喊他一起读一次，这里就有他的状态了。
                </div>
            )}

            {/* ② 阅读排行榜：六种口径（**收起来**，她 09-21：那一排胶囊太占地方） */}
            <div className="rd-sec-row">
                <div className="rd-section-title">阅读排行榜</div>
                <button
                    className={`rd-flt-btn${boardOpen ? ' rd-flt-btn-on' : ''}`}
                    onClick={() => setBoardOpen((v) => !v)}
                    aria-label="换一种排行"
                >
                    {BOARDS.find((b) => b.key === board)?.label}
                    <CaretDown size={13} className={`rd-fold-chev${boardOpen ? ' rd-fold-chev-on' : ''}`} />
                </button>
            </div>
            {boardOpen && (
                <div className="rd-chips rd-chips-wrap">
                    {BOARDS.map((b) => (
                        <button
                            key={b.key}
                            className={`rd-chip${board === b.key ? ' rd-chip-on' : ''}`}
                            onClick={() => { setBoard(b.key); setBoardOpen(false); }}
                        >
                            {b.label}
                        </button>
                    ))}
                </div>
            )}
            {ranked.length === 0 ? (
                <div className="rd-card rd-muted">还没有人在读书，榜是空的。</div>
            ) : (
                <div className="rd-card rd-card-flush" data-rd-part="board">
                    <div className="rd-list">
                        {ranked.map((r, i) => (
                            <button className="rd-item" key={r.ownerId} onClick={() => onOpenChar(r.ownerId)}>
                                <span className="rd-rank-no">{i + 1}</span>
                                <Face {...faceOf(r.ownerId)} size={32} />
                                <span className="rd-item-label">{nameOf(r.ownerId)}</span>
                                <span className="rd-rank-val">{fmtRank(board, r.value)}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ③ 活动记录：所有人（含你自己），主页只预览最新 8 条 */}
            <div className="rd-section-title">活动记录</div>
            {runs.length === 0 ? (
                <div className="rd-card rd-muted">最近一周还没有活动记录。</div>
            ) : (
                <>
                    <div className="rd-tl rd-tl-screen">
                        {runs.slice(0, 8).map((r) => (
                            <button
                                className="rd-tl-item rd-tl-tap"
                                key={r.key}
                                onClick={() => { setRetryNote(''); setAct(r); }}
                            >
                                <span className="rd-tl-dot" style={{ background: highlightColorOf(prefs, r.ownerId) }} />
                                <div className="rd-tl-body">
                                    <div className="rd-tl-head">
                                        <span className="rd-tl-who">{nameOf(r.ownerId)}</span>
                                        <span className="rd-tl-time">{fmtWhen(r.to)}</span>
                                    </div>
                                    <div className="rd-tl-text">{runVerbs(r)}</div>
                                    <div className="rd-tl-ex">
                                        《{titleOf(r.bookId)}》{metaOf(r) ? ` · ${metaOf(r)}` : ''}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                    <button className="rd-more" onClick={onOpenActs}>
                        查看全部{runs.length > 8 ? `（${runs.length} 条）` : ''}
                    </button>
                </>
            )}

            {/* 状态卡点开：这一次详细 + 往期折叠 */}
            {statusOpen && statusGroup && statusHead && (
                <ActivityDetailSheet
                    calls={statusGroup}
                    ownerName={nameOf(statusHead.charId)}
                    bookTitle={titleOf(statusHead.bookId)}
                    title={`${nameOf(statusHead.charId)} 的状态`}
                    onClose={() => setStatusOpen(false)}
                    {...retryProps(statusGroup)}
                    extra={past.length > 0 ? (
                        <div style={{ marginTop: 'var(--rd-space-5)' }}>
                            <div className="rd-row-label">往期</div>
                            {past.map((g) => {
                                const head = headOf(g);
                                const open = openPast.has(head.id);
                                return (
                                    <div className={`rd-fold${open ? ' rd-fold-open' : ''}`} key={head.id}>
                                        <button className="rd-fold-head" onClick={() => togglePast(head.id)}>
                                            <span className="rd-fold-label">{head.summary}</span>
                                            <span className="rd-fold-value">{fmtWhen(head.createdAt)}</span>
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

            {/* 活动记录点开：这一次的每条调用 + 摘要 + 补摘 */}
            {act && (
                <ActivityDetailSheet
                    calls={act.calls}
                    ownerName={nameOf(act.ownerId)}
                    bookTitle={titleOf(act.bookId)}
                    onClose={() => { setAct(null); setRetryNote(''); }}
                    {...retryProps(act.calls)}
                />
            )}
        </div>
    );
}

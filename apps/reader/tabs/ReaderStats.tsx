// 读书模块 · 统计页（2026-09-15 v4 照竞品重写）
//
// 参考图（统计内容参考 1/2）的版式：
//   分段「总 日 周 月 年」→ 问候卡 → 2×2 数字格（各带彩色小图标）
//   → 最近 7 天柱状图 → 最近 30 天热力格 → 读得最久的书
//   年视图 = 年份选择条 + 年度总览六格 + 年度热力图 + 阅读习惯（时段分布）
//   周视图 = 工作日 vs 周末 + 本周成就
//
// 数据来源分两处（口径写在 utils/reader/readerStats.ts 顶上）：
//   · 总阅读时长 = rd_progress.readingSeconds 按书聚合（含流水开始记之前的旧账）
//   · 每天读多久 / 翻页次数 / 阅读字数 = 阅读流水（localStorage，按天）
//   · 时段分布 = 流水里那天的 24 个小时桶（**按天**——以前是全局一格，所以不分视图，她报过）

import { useEffect, useMemo, useState } from 'react';
import {
    ArrowUp, BookOpenText, CalendarBlank, CaretLeft, CaretRight, ChartBar, Clock, Flame, Hourglass,
    Lightning, Sun, Target, TextAa, Trophy,
} from '@phosphor-icons/react';
import ReaderCover from '../ReaderCover';
import DailyReport from './ReaderDaily';
import { listBooks, listProgressByBook, type RdBook, type RdProgress } from '../../../utils/reader/readerDb';
import {
    dayBooks, dayKeyOf, dayOf, efficiency, fmtChars, fmtClock, fmtSec, fmtShort, heatLevel, loadStats,
    partSeconds, peakPart, recentKeys, streakDays, sumDays, sumHours,
    type DayStat, type ReaderStatsData,
} from '../../../utils/reader/readerStats';

interface Props { refreshToken: number }

interface Row { book: RdBook; prog: RdProgress | null }

type Span = 'total' | 'day' | 'week' | 'month' | 'year';

const SPANS: Array<{ key: Span; label: string }> = [
    { key: 'total', label: '总' },
    { key: 'day', label: '日' },
    { key: 'week', label: '周' },
    { key: 'month', label: '月' },
    { key: 'year', label: '年' },
];

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 日期键往前/往后挪一天 */
function shiftDay(key: string, delta: number): string {
    const [y, m, d] = key.split('-').map(Number);
    const t = new Date(y, (m ?? 1) - 1, d ?? 1);
    t.setDate(t.getDate() + delta);
    return dayKeyOf(t);
}

/** 书的短名（柱状图下面那行小字） */
const shortName = (t: string) => (t.length > 4 ? t.slice(0, 4) : t);

/** 一排数字格（参考图那四个彩色小图标） */
function Tile({ ico, cap, big, unit, tone }: { ico: React.ReactNode; cap: string; big: string; unit?: string; tone: 1 | 2 | 3 | 4 }) {
    return (
        <div className="rd-stat-tile">
            <div className={`rd-stat-ico${tone > 1 ? ` rd-stat-ico-${tone}` : ''}`}>{ico}</div>
            <div className="rd-stat-tile-cap">{cap}</div>
            <div className="rd-stat-tile-num">{big}{unit ? <small>{unit}</small> : null}</div>
        </div>
    );
}

/** 热力格（一格一天） */
function Heat({ cells, cols }: { cells: Array<{ key: string; level: number }>; cols: 'rd-heat-30' | 'rd-heat-year' }) {
    return (
        <div className={`rd-heat ${cols}`}>
            {cells.map((c) => (
                <span key={c.key} className={`rd-heat-cell${c.level > 0 ? ` rd-heat-${c.level}` : ''}`} title={c.key} />
            ))}
        </div>
    );
}

function HeatLegend() {
    return (
        <div className="rd-heat-legend">
            少
            <span className="rd-heat-key" />
            <span className="rd-heat-key rd-heat-1" />
            <span className="rd-heat-key rd-heat-2" />
            <span className="rd-heat-key rd-heat-3" />
            <span className="rd-heat-key rd-heat-4" />
            多
        </div>
    );
}

/** 时段分布（0:00 - 23:00，24 根柱子） */
function Hours({ hours }: { hours: number[] }) {
    const max = Math.max(1, ...hours);
    return (
        <>
            <div className="rd-hours">
                {hours.map((v, i) => (
                    <div className="rd-hour-col" key={i}>
                        <div className="rd-hour-bar" style={{ height: `${Math.max(2, Math.round((v / max) * 100))}%` }} />
                    </div>
                ))}
            </div>
            <div className="rd-hour-axis"><span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>
        </>
    );
}

export default function ReaderStats({ refreshToken }: Props) {
    const [rows, setRows] = useState<Row[]>([]);
    const [ledger, setLedger] = useState<ReaderStatsData>(() => loadStats());
    const [owner, setOwner] = useState<string>('user');
    const [span, setSpan] = useState<Span>('total');
    const [year, setYear] = useState<number>(() => new Date().getFullYear());
    /** 日报看的是哪一天（默认今天，能往前翻） */
    const [dayPick, setDayPick] = useState<string>(() => dayKeyOf(new Date()));

    useEffect(() => { setLedger(loadStats()); }, [refreshToken, span]);

    useEffect(() => {
        void (async () => {
            const books = await listBooks();
            const out: Row[] = [];
            for (const b of books) {
                const all = await listProgressByBook(b.id);
                out.push({ book: b, prog: all.find((p) => p.ownerId === owner) ?? null });
            }
            setRows(out);
        })();
    }, [refreshToken, owner]);

    const owners = useMemo(() => {
        const s = new Set<string>(['user']);
        rows.forEach((r) => { if (r.prog?.ownerId) s.add(r.prog.ownerId); });
        return Array.from(s);
    }, [rows]);

    const todayKey = dayKeyOf(new Date());
    const days = ledger.days;

    const acc7 = useMemo(() => sumDays(days, recentKeys(todayKey, 7)), [days, todayKey]);
    const acc30 = useMemo(() => sumDays(days, recentKeys(todayKey, 30)), [days, todayKey]);
    const accAll = useMemo(() => sumDays(days, Object.keys(days)), [days]);
    const monthPrefix = todayKey.slice(0, 7);
    const accMonth = useMemo(
        () => sumDays(days, Object.keys(days).filter((k) => k.startsWith(monthPrefix))),
        [days, monthPrefix],
    );
    const yearPrefix = `${year}-`;
    const yearKeys = useMemo(() => Object.keys(days).filter((k) => k.startsWith(yearPrefix)).sort(), [days, yearPrefix]);
    const accYear = useMemo(() => sumDays(days, yearKeys), [days, yearKeys]);

    /** 总时长走 rd_progress（含流水开始记之前的旧账） */
    const progressSec = rows.reduce((n, r) => n + (r.prog?.readingSeconds ?? 0), 0);
    const sessions = rows.reduce((n, r) => n + (r.prog?.sessionCount ?? 0), 0);
    const doneCount = rows.filter((r) => (r.prog?.percent ?? 0) >= 99).length;
    const readingCount = rows.filter((r) => { const p = r.prog?.percent ?? 0; return p > 0 && p < 99; }).length;

    /** 第 N 天：从最早有记录的那天算起（流水或书的加入时间，谁早算谁） */
    const firstKey = useMemo(() => {
        const a = Object.keys(days).sort()[0];
        const b = rows.map((r) => r.book.createdAt.slice(0, 10)).sort()[0];
        return [a, b].filter(Boolean).sort()[0] ?? todayKey;
    }, [days, rows, todayKey]);
    const dayNo = Math.max(1, Math.round((new Date(todayKey).getTime() - new Date(firstKey).getTime()) / 86400000) + 1);
    const streak = streakDays(days, todayKey);

    /** 柱状图：最近 7 天 */
    const week = useMemo(() => {
        const keys = recentKeys(todayKey, 7);
        return keys.map((k) => ({ key: k, day: days[k] }));
    }, [days, todayKey]);
    const weekMax = Math.max(1, ...week.map((w) => w.day?.sec ?? 0));

    /** 热力：最近 30 天 / 年度 */
    const heat30 = useMemo(() => {
        const keys = recentKeys(todayKey, 30);
        const max = Math.max(1, ...keys.map((k) => days[k]?.sec ?? 0));
        return keys.map((k) => ({ key: k, level: heatLevel(days[k]?.sec ?? 0, max) }));
    }, [days, todayKey]);

    const heatYear = useMemo(() => {
        const max = Math.max(1, ...yearKeys.map((k) => days[k]?.sec ?? 0));
        const byMonth: Array<Array<{ key: string; level: number }>> = [];
        for (let m = 1; m <= 12; m++) {
            const prefix = `${year}-${String(m).padStart(2, '0')}`;
            const daysInMonth = new Date(year, m, 0).getDate();
            const cells = [];
            for (let d = 1; d <= daysInMonth; d++) {
                const k = `${prefix}-${String(d).padStart(2, '0')}`;
                cells.push({ key: k, level: heatLevel(days[k]?.sec ?? 0, max) });
            }
            byMonth.push(cells);
        }
        return byMonth;
    }, [days, year, yearKeys]);

    /** 读得最久的书（实时长排行） */
    const longest = useMemo(
        () => [...rows].filter((r) => (r.prog?.readingSeconds ?? 0) > 0)
            .sort((a, b) => (b.prog?.readingSeconds ?? 0) - (a.prog?.readingSeconds ?? 0))
            .slice(0, 5),
        [rows],
    );

    /** 周视图：工作日 vs 周末（最近 7 天里分） */
    const workSplit = useMemo(() => {
        const keys = recentKeys(todayKey, 7);
        const work: string[] = [];
        const rest: string[] = [];
        for (const k of keys) {
            const w = new Date(k).getDay();
            (w === 0 || w === 6 ? rest : work).push(k);
        }
        const a = sumDays(days, work);
        const b = sumDays(days, rest);
        return { work: { sec: a.sec, n: work.length }, rest: { sec: b.sec, n: rest.length } };
    }, [days, todayKey]);

    /** 月视图：当月每天的热力 */
    const heatMonth = useMemo(() => {
        const [y, m] = todayKey.split('-').map(Number);
        const prefix = `${y}-${String(m).padStart(2, '0')}`;
        const n = new Date(y, m, 0).getDate();
        const keys = Array.from({ length: n }, (_, i) => `${prefix}-${String(i + 1).padStart(2, '0')}`);
        const max = Math.max(1, ...keys.map((k) => days[k]?.sec ?? 0));
        return keys.map((k) => ({ key: k, level: heatLevel(days[k]?.sec ?? 0, max) }));
    }, [days, todayKey]);

    const recentBook = useMemo(() => {
        const withTime = rows.filter((r) => r.prog?.updatedAt);
        withTime.sort((a, b) => String(b.prog?.updatedAt).localeCompare(String(a.prog?.updatedAt)));
        return withTime[0];
    }, [rows]);

    const today = days[todayKey] ?? { sec: 0, pages: 0, chars: 0 };
    /** 日报要书名和封面，按书号查 */
    const bookMap = useMemo(() => new Map(rows.map((r) => [r.book.id, r.book])), [rows]);
    const yearDayCount = yearKeys.filter((k) => (days[k]?.sec ?? 0) > 0).length;

    /** 总视图的四个格子（数字随视图换） */
    const tiles = (a: DayStat, secFromProgress?: number) => {
        const t = fmtSec(secFromProgress ?? a.sec);
        const c = fmtChars(a.chars);
        return (
            <>
                <Tile tone={1} ico={<Clock size={15} weight="bold" />} cap="阅读时长" big={t.big} unit={t.unit || undefined} />
                <Tile tone={2} ico={<BookOpenText size={15} weight="bold" />} cap="阅读文档数" big={`${rows.filter((r) => (r.prog?.percent ?? 0) > 0).length}`} unit="本" />
                <Tile tone={3} ico={<Lightning size={15} weight="bold" />} cap="翻页次数" big={`${a.pages}`} unit="页" />
                <Tile tone={4} ico={<TextAa size={15} weight="bold" />} cap="阅读字数" big={c.big} unit={c.unit} />
            </>
        );
    };

    return (
        <div className="rd-screen" data-rd-page="stats">
            <div className="rd-head">
                <div className="rd-head-main">
                    <div className="rd-head-title">统计</div>
                    <div className="rd-head-sub">读过的都算数</div>
                </div>
            </div>

            <div className="rd-seg" style={{ marginBottom: 'var(--rd-space-4)' }}>
                {SPANS.map((s) => (
                    <button key={s.key} className={`rd-seg-btn${span === s.key ? ' rd-seg-on' : ''}`} onClick={() => setSpan(s.key)}>
                        {s.label}
                    </button>
                ))}
            </div>

            {owners.length > 1 && (
                <div className="rd-seg">
                    {owners.map((o) => (
                        <button key={o} className={`rd-seg-btn${owner === o ? ' rd-seg-on' : ''}`} onClick={() => setOwner(o)}>
                            {o === 'user' ? '我' : '角色'}
                        </button>
                    ))}
                </div>
            )}

            {rows.length === 0 && Object.keys(days).length === 0 ? (
                <div className="rd-empty">
                    <ChartBar size={44} weight="thin" />
                    <div className="rd-empty-title">还没有数据</div>
                    <div className="rd-empty-text">读起来之后，这里会有阅读时长、每本书读了多久和里程碑。</div>
                </div>
            ) : span === 'total' ? (
                <>
                    <div className="rd-hello">
                        <div className="rd-hello-big">第 {dayNo} 天，点点滴滑都是心意 ❤️</div>
                        <div className="rd-stat-tile-cap" style={{ marginTop: 4 }}>
                            连续读了 {streak} 天 · 一共打开 {sessions} 次
                        </div>
                    </div>

                    <div className="rd-stat-grid">{tiles(accAll, progressSec)}</div>

                    <div className="rd-stat-hero">
                        <div className="rd-stat-cap">最近 7 天</div>
                        <div className="rd-stat-cap" style={{ marginBottom: 6 }}>每日阅读时间</div>
                        <div className="rd-chart">
                            {week.map((w) => (
                                <div className="rd-chart-col" key={w.key}>
                                    <div className="rd-chart-bar" style={{ height: `${Math.max(3, Math.round(((w.day?.sec ?? 0) / weekMax) * 100))}%` }} />
                                    <div className="rd-chart-label">{WEEKDAYS[new Date(w.key).getDay()]}</div>
                                </div>
                            ))}
                        </div>
                        <div className="rd-stat-cap" style={{ textAlign: 'right' }}>这 7 天一共 {fmtSec(acc7.sec).big}{fmtSec(acc7.sec).unit}</div>
                    </div>

                    <div className="rd-stat-hero">
                        <div className="rd-stat-cap">最近 30 天</div>
                        <div className="rd-stat-cap" style={{ marginBottom: 8 }}>每日阅读时间</div>
                        <Heat cells={heat30} cols="rd-heat-30" />
                        <HeatLegend />
                    </div>

                    {longest.length > 0 && (
                        <div className="rd-stat-hero">
                            <div className="rd-stat-cap">读得最久的书</div>
                            <div className="rd-stat-cap" style={{ marginBottom: 4 }}>按阅读时长排</div>
                            <div className="rd-list">
                                {longest.map((r, i) => (
                                    <div className="rd-achv" key={r.book.id}>
                                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            <span className="rd-stat-cap">{i + 1}　</span>{r.book.title}
                                        </span>
                                        <span className="rd-achv-val">{fmtSec(r.prog?.readingSeconds ?? 0).big}{fmtSec(r.prog?.readingSeconds ?? 0).unit}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            ) : span === 'day' ? (
                <>
                    {/* 日报是按天看的，所以先给个日期条（默认今天，一直能往前翻） */}
                    <div className="rd-yearbar">
                        <button className="rd-icon-btn" onClick={() => setDayPick((k) => shiftDay(k, -1))} aria-label="前一天"><CaretLeft size={17} /></button>
                        <div className="rd-yearbar-title">{dayPick === todayKey ? '今天' : `${Number(dayPick.slice(5, 7))} 月 ${Number(dayPick.slice(8, 10))} 日`}</div>
                        <button
                            className="rd-icon-btn"
                            onClick={() => setDayPick((k) => (k >= todayKey ? k : shiftDay(k, 1)))}
                            aria-label="后一天"
                        >
                            <CaretRight size={17} />
                        </button>
                    </div>
                    <DailyReport dayKey={dayPick} day={dayOf(ledger, dayPick)} books={bookMap} />
                </>
            ) : span === 'week' ? (
                <>
                    <div className="rd-hello">
                        <div className="rd-hello-big">最近 7 天</div>
                        <div className="rd-stat-tile-cap" style={{ marginTop: 4 }}>一共读了 {fmtSec(acc7.sec).big}{fmtSec(acc7.sec).unit}</div>
                    </div>
                    <div className="rd-stat-grid">{tiles(acc7)}</div>

                    <div className="rd-stat-hero">
                        <div className="rd-stat-cap">工作日 vs 周末</div>
                        <div className="rd-stat-cap" style={{ marginBottom: 8 }}>看看你的阅读节奏</div>
                        <div className="rd-stat-pair" style={{ marginBottom: 0 }}>
                            <div className="rd-stat-sub">
                                <div className="rd-stat-cap">工作日</div>
                                <div className="rd-stat-sub-num">{fmtSec(workSplit.work.sec).big}{fmtSec(workSplit.work.sec).unit}</div>
                                <div className="rd-stat-cap">（{workSplit.work.n} 天）</div>
                            </div>
                            <div className="rd-stat-sub">
                                <div className="rd-stat-cap">周末</div>
                                <div className="rd-stat-sub-num">{fmtSec(workSplit.rest.sec).big}{fmtSec(workSplit.rest.sec).unit}</div>
                                <div className="rd-stat-cap">（{workSplit.rest.n} 天）</div>
                            </div>
                        </div>
                    </div>

                    <div className="rd-stat-hero">
                        <div className="rd-stat-cap" style={{ marginBottom: 4 }}>本周成就</div>
                        <div className="rd-list">
                            <div className="rd-achv">
                                <span><Trophy size={15} /> 最活跃的一天</span>
                                <span className="rd-achv-val">
                                    {(() => {
                                        const best = [...week].sort((a, b) => (b.day?.sec ?? 0) - (a.day?.sec ?? 0))[0];
                                        return best?.day?.sec
                                            ? `周${WEEKDAYS[new Date(best.key).getDay()]} · ${fmtSec(best.day.sec).big}${fmtSec(best.day.sec).unit}`
                                            : '还没有';
                                    })()}
                                </span>
                            </div>
                            <div className="rd-achv">
                                <span><Clock size={15} /> 读得最久的书</span>
                                <span className="rd-achv-val">{longest[0] ? longest[0].book.title : '还没有'}</span>
                            </div>
                            <div className="rd-achv">
                                <span><BookOpenText size={15} /> 读完 / 在读</span>
                                <span className="rd-achv-val">{doneCount} / {readingCount} 本</span>
                            </div>
                        </div>
                    </div>
                </>
            ) : span === 'month' ? (
                <>
                    <div className="rd-hello">
                        <div className="rd-hello-big">这个月</div>
                        <div className="rd-stat-tile-cap" style={{ marginTop: 4 }}>
                            一共读了 {fmtSec(accMonth.sec).big}{fmtSec(accMonth.sec).unit}
                        </div>
                    </div>
                    <div className="rd-stat-grid">{tiles(accMonth)}</div>
                    <div className="rd-stat-hero">
                        <div className="rd-stat-cap">本月每一天</div>
                        <div className="rd-stat-cap" style={{ marginBottom: 8 }}>每日阅读时间</div>
                        <Heat cells={heatMonth} cols="rd-heat-30" />
                        <HeatLegend />
                    </div>
                </>
            ) : (
                <>
                    <div className="rd-yearbar">
                        <button className="rd-icon-btn" onClick={() => setYear((y) => y - 1)} aria-label="上一年"><CaretLeft size={17} /></button>
                        <div className="rd-yearbar-title">{year} 年</div>
                        <button className="rd-icon-btn" onClick={() => setYear((y) => y + 1)} aria-label="下一年"><CaretRight size={17} /></button>
                    </div>

                    <div className="rd-stat-hero">
                        <div className="rd-stat-cap">年度总览</div>
                        <div className="rd-stat-cap" style={{ marginBottom: 8 }}>核心数据一览</div>
                        <div className="rd-stat-grid" style={{ marginBottom: 0 }}>
                            <div className="rd-stat-sub"><div className="rd-stat-cap">总时长</div><div className="rd-stat-sub-num">{fmtSec(accYear.sec).big}{fmtSec(accYear.sec).unit}</div></div>
                            <div className="rd-stat-sub"><div className="rd-stat-cap">总翻页</div><div className="rd-stat-sub-num">{accYear.pages}</div></div>
                            <div className="rd-stat-sub"><div className="rd-stat-cap">总字数</div><div className="rd-stat-sub-num">{fmtChars(accYear.chars).big}{fmtChars(accYear.chars).unit}</div></div>
                            <div className="rd-stat-sub"><div className="rd-stat-cap">阅读天数</div><div className="rd-stat-sub-num">{yearDayCount} 天</div></div>
                            <div className="rd-stat-sub"><div className="rd-stat-cap">总书籍</div><div className="rd-stat-sub-num">{rows.length} 本</div></div>
                            <div className="rd-stat-sub">
                                <div className="rd-stat-cap">日均时长</div>
                                <div className="rd-stat-sub-num">{fmtSec(yearDayCount > 0 ? accYear.sec / yearDayCount : 0).big}{fmtSec(yearDayCount > 0 ? accYear.sec / yearDayCount : 0).unit}</div>
                            </div>
                        </div>
                    </div>

                    <div className="rd-stat-hero">
                        <div className="rd-stat-cap">年度热力图</div>
                        <div className="rd-stat-cap" style={{ marginBottom: 8 }}>每日阅读时长分布</div>
                        {heatYear.map((cells, i) => (
                            <div className="rd-month-row" key={i}>
                                <span className="rd-month-label">{i + 1}月</span>
                                <div className="rd-month-cells">
                                    {cells.map((c) => (
                                        <span key={c.key} className={c.level > 0 ? `rd-heat-${c.level}` : undefined} />
                                    ))}
                                </div>
                            </div>
                        ))}
                        <HeatLegend />
                    </div>

                    <div className="rd-stat-hero">
                        <div className="rd-stat-cap">阅读习惯</div>
                        <div className="rd-stat-cap" style={{ marginBottom: 8 }}>一天里什么时候在读（{year} 年）</div>
                        <Hours hours={sumHours(days, yearKeys)} />
                    </div>

                    {recentBook && (
                        <div className="rd-stat-hero rd-stat-row">
                            <div className="rd-stat-dot"><Flame size={17} /></div>
                            <div>
                                <div style={{ fontSize: 'var(--rd-fs-md)' }}>最近翻开的书</div>
                                <div className="rd-stat-cap">《{recentBook.book.title}》{recentBook.prog?.updatedAt ? ` · ${recentBook.prog.updatedAt.slice(0, 10)}` : ''}</div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {rows.length > 0 && (
                <div className="rd-muted" style={{ textAlign: 'center', marginTop: 'var(--rd-space-5)' }}>
                    <CalendarBlank size={14} /> 继续读下去，遇见更好的自己 ✨
                </div>
            )}
        </div>
    );
}

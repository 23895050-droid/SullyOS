// 读书模块 · 日报（2026-09-15 照她给的「每日阅读数据参考」长图做）
//
// 统计页的「日」视图就是它：点开某一天，看这一天到底读了什么——
//   这一天读了多少（总时长 + 本数/打开/翻页/字数）
//   → 效率（平均每本 / 每页用时 / 页每分 / 打开频率）
//   → 阅读习惯（最久的一本 / 最常读的时段 / 占一天的比例）
//   → 这一天的高光（读最久 / 翻页最多 / 打开最多 / 最早翻开 / 最晚合上）
//   → 时段分布（早上·下午·晚上·夜里）
//   → 小时明细（每个钟头读了哪本、多久）
//   → 这一天读过的书排行
//
// 数据全来自 utils/reader/readerStats 的按天流水（小时桶和一本书的账都在**每天**里，
// 所以这里画的是「这一天」的分布，不是全时段累计）。

import { ArrowUp, CalendarBlank, Clock, Flame, Hourglass, Lightning, Sun, Target } from '@phosphor-icons/react';
import ReaderCover from '../ReaderCover';
import { readerFootLine } from '../readerLines';
import type { RdBook } from '../../../utils/reader/readerDb';
import {
    dayBooks, efficiency, fmtChars, fmtClock, fmtSec, fmtShort, partSeconds, peakPart, type DayStat,
} from '../../../utils/reader/readerStats';

interface Props {
    /** 'YYYY-MM-DD' */
    dayKey: string;
    day: DayStat;
    books: Map<string, RdBook>;
}

export default function ReaderDaily({ dayKey, day, books }: Props) {
    const [y, m, d] = dayKey.split('-');
    const list = dayBooks(day);
    const titleOf = (id: string) => books.get(id)?.title ?? '这本书已经不在书架上了';
    const coverOf = (id: string) => (
        <ReaderCover coverRef={books.get(id)?.coverRef} title={titleOf(id)} compact />
    );

    if (day.sec <= 0 && list.length === 0) {
        return (
            <div className="rd-empty">
                <CalendarBlank size={40} weight="thin" />
                <div className="rd-empty-title">这一天没翻开书</div>
                <div className="rd-empty-text">往前翻翻别的日子，或者现在就去读两页。</div>
            </div>
        );
    }

    const t = fmtSec(day.sec);
    const c = fmtChars(day.chars);
    const eff = efficiency(day);
    const parts = partSeconds(day.hours);
    const bestPart = peakPart(day.hours);
    const hourBlocks = day.hours.map((sec, h) => ({ h, sec })).filter((x) => x.sec > 0);

    const topBook = list[0];
    const busiest = [...list].sort((a, b) => b.stat.pages - a.stat.pages)[0];
    const mostOpened = [...list].sort((a, b) => b.stat.opens - a.stat.opens)[0];
    const earliest = [...list].filter((x) => x.stat.firstAt)
        .sort((a, b) => String(a.stat.firstAt).localeCompare(String(b.stat.firstAt)))[0];
    const latest = [...list].filter((x) => x.stat.lastAt)
        .sort((a, b) => String(b.stat.lastAt).localeCompare(String(a.stat.lastAt)))[0];
    /** 一天 24 小时里读书占了多少（图上那格「阅读活跃度」） */
    const activity = (day.sec / 86400) * 100;

    return (
        <>
            {/* 这一天读了多少 */}
            <div className="rd-daily-hero">
                <div className="rd-daily-date">{`${y} 年 ${Number(m)} 月 ${Number(d)} 日`}</div>
                <div className="rd-daily-big">{t.big}{t.unit}</div>
                <div className="rd-daily-cap">这一天的阅读总时长</div>
                <div className="rd-daily-cells">
                    <div className="rd-daily-cell"><span className="rd-daily-cell-num">{list.length}</span><span className="rd-daily-cell-cap">本书</span></div>
                    <div className="rd-daily-cell"><span className="rd-daily-cell-num">{day.opens}</span><span className="rd-daily-cell-cap">次打开</span></div>
                    <div className="rd-daily-cell"><span className="rd-daily-cell-num">{day.pages}</span><span className="rd-daily-cell-cap">次翻页</span></div>
                    <div className="rd-daily-cell"><span className="rd-daily-cell-num">{c.big}</span><span className="rd-daily-cell-cap">{c.unit}</span></div>
                </div>
            </div>

            {/* 效率 */}
            <div className="rd-stat-hero">
                <div className="rd-stat-cap">效率</div>
                <div className="rd-stat-cap" style={{ marginBottom: 8 }}>这一天读得顺不顺</div>
                <div className="rd-daily-pair">
                    <div className="rd-daily-mcell"><span className="rd-daily-cell-cap">平均每本书</span><span className="rd-daily-mnum">{fmtShort(eff.secPerBook)}</span></div>
                    <div className="rd-daily-mcell"><span className="rd-daily-cell-cap">每页用时</span><span className="rd-daily-mnum">{eff.secPerPage > 0 ? `${eff.secPerPage.toFixed(1)} 秒` : '—'}</span></div>
                    <div className="rd-daily-mcell"><span className="rd-daily-cell-cap">阅读效率</span><span className="rd-daily-mnum">{eff.pagesPerMin > 0 ? `${eff.pagesPerMin.toFixed(1)} 页/分` : '—'}</span></div>
                    <div className="rd-daily-mcell"><span className="rd-daily-cell-cap">打开频率</span><span className="rd-daily-mnum">{eff.timesPerBook > 0 ? `${eff.timesPerBook.toFixed(1)} 次/本` : '—'}</span></div>
                </div>
            </div>

            {/* 这一天的阅读习惯 */}
            <div className="rd-stat-hero">
                <div className="rd-stat-cap" style={{ marginBottom: 4 }}>阅读习惯</div>
                <div className="rd-best">
                    <span className="rd-best-ico"><Target size={14} weight="bold" /></span>
                    <div className="rd-best-main">
                        <span className="rd-best-cap">读得最久的一本</span>
                        <span>{topBook ? titleOf(topBook.bookId) : '—'}</span>
                    </div>
                    <span className="rd-achv-val">{topBook ? fmtShort(topBook.stat.sec) : ''}</span>
                </div>
                <div className="rd-best">
                    <span className="rd-best-ico"><Sun size={14} weight="bold" /></span>
                    <div className="rd-best-main">
                        <span className="rd-best-cap">最常读的时段</span>
                        <span>{bestPart ? bestPart.key : '—'}</span>
                    </div>
                    <span className="rd-achv-val">{bestPart ? fmtShort(bestPart.sec) : ''}</span>
                </div>
                <div className="rd-best">
                    <span className="rd-best-ico"><Hourglass size={14} weight="bold" /></span>
                    <div className="rd-best-main">
                        <span className="rd-best-cap">这一天里读书占的比例</span>
                        <span>{activity > 0 ? `${activity < 1 ? activity.toFixed(1) : Math.round(activity)}%` : '—'}</span>
                    </div>
                </div>
            </div>

            {/* 这一天的高光 */}
            <div className="rd-stat-hero">
                <div className="rd-stat-cap">这一天的高光</div>
                <div className="rd-stat-cap" style={{ marginBottom: 4 }}>每样挑一个</div>
                {topBook && (
                    <div className="rd-best">
                        <span className="rd-best-ico"><Clock size={14} weight="bold" /></span>
                        <div className="rd-best-main">
                            <span className="rd-best-cap">读得最久</span>
                            <span className="rd-best-chip">{titleOf(topBook.bookId)} · {fmtShort(topBook.stat.sec)}</span>
                        </div>
                        <div className="rd-best-cover">{coverOf(topBook.bookId)}</div>
                    </div>
                )}
                {busiest && (
                    <div className="rd-best">
                        <span className="rd-best-ico"><Lightning size={14} weight="bold" /></span>
                        <div className="rd-best-main">
                            <span className="rd-best-cap">翻页最多</span>
                            <span className="rd-best-chip">{titleOf(busiest.bookId)} · {busiest.stat.pages} 页</span>
                        </div>
                        <div className="rd-best-cover">{coverOf(busiest.bookId)}</div>
                    </div>
                )}
                {mostOpened && (
                    <div className="rd-best">
                        <span className="rd-best-ico"><ArrowUp size={14} weight="bold" /></span>
                        <div className="rd-best-main">
                            <span className="rd-best-cap">打开最多</span>
                            <span className="rd-best-chip">{titleOf(mostOpened.bookId)} · {mostOpened.stat.opens} 次</span>
                        </div>
                        <div className="rd-best-cover">{coverOf(mostOpened.bookId)}</div>
                    </div>
                )}
                {earliest && (
                    <div className="rd-best">
                        <span className="rd-best-ico"><Sun size={14} weight="bold" /></span>
                        <div className="rd-best-main">
                            <span className="rd-best-cap">最早翻开</span>
                            <span className="rd-best-chip">{fmtClock(earliest.stat.firstAt)} · {titleOf(earliest.bookId)}</span>
                        </div>
                        <div className="rd-best-cover">{coverOf(earliest.bookId)}</div>
                    </div>
                )}
                {latest && (
                    <div className="rd-best">
                        <span className="rd-best-ico"><Flame size={14} weight="bold" /></span>
                        <div className="rd-best-main">
                            <span className="rd-best-cap">最晚合上</span>
                            <span className="rd-best-chip">{fmtClock(latest.stat.lastAt)} · {titleOf(latest.bookId)}</span>
                        </div>
                        <div className="rd-best-cover">{coverOf(latest.bookId)}</div>
                    </div>
                )}
            </div>

            {/* 时段分布 */}
            <div className="rd-stat-hero">
                <div className="rd-stat-cap">时段分布</div>
                <div className="rd-stat-cap" style={{ marginBottom: 4 }}>这一天的时间花在哪个时段</div>
                {day.hours.every((h) => !h) && (
                    <div className="rd-muted">
                        这一天只记下了总数（按天记每本书和钟点是从今天开始的），所以下面这些分不出来。
                    </div>
                )}
                {parts.map((p, i) => (
                    <div className="rd-dist" key={p.key}>
                        <div className="rd-dist-head">
                            <span>{p.key}</span>
                            <span className="rd-dist-sub">{fmtShort(p.sec)}</span>
                            <span className="rd-achv-val">{p.pct}%</span>
                        </div>
                        <div className="rd-dist-bar">
                            <div className={`rd-dist-fill${i > 0 ? ` rd-dist-${i + 1}` : ''}`} style={{ width: `${p.pct}%` }} />
                        </div>
                    </div>
                ))}
            </div>

            {/* 小时明细 */}
            <div className="rd-stat-hero">
                <div className="rd-stat-cap">小时明细</div>
                <div className="rd-stat-cap">哪几个钟头在读，读的哪本</div>
                {hourBlocks.length === 0 && <div className="rd-muted">这一天没留下钟点记录。</div>}
                {hourBlocks.map(({ h, sec }) => (
                    <div className="rd-hour-block" key={h}>
                        <div className="rd-hour-range">
                            {`${h}:00 - ${(h + 1) % 24}:00`}
                            <span className="rd-hour-total">共 {fmtShort(sec)}</span>
                        </div>
                        <div className="rd-hour-seg">
                            {list.filter((x) => (x.stat.hours[h] ?? 0) > 0).map((x) => (
                                <div className="rd-hour-seg-item" key={x.bookId}>
                                    <div className="rd-hour-seg-cover">{coverOf(x.bookId)}</div>
                                    <div className="rd-hour-seg-name">{titleOf(x.bookId)}</div>
                                    <div className="rd-hour-seg-sec">{fmtShort(x.stat.hours[h])}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* 排行 */}
            <div className="rd-stat-hero">
                <div className="rd-stat-cap">这一天读过的书</div>
                <div className="rd-stat-cap" style={{ marginBottom: 4 }}>按时长排</div>
                {list.map((x, i) => (
                    <div className="rd-rank" key={x.bookId}>
                        <span className="rd-rank-no">{i + 1}</span>
                        <div className="rd-rank-cover">{coverOf(x.bookId)}</div>
                        <span className="rd-rank-name">{titleOf(x.bookId)}</span>
                        <span className="rd-rank-val">{fmtShort(x.stat.sec)}</span>
                    </div>
                ))}
            </div>

            <div className="rd-muted" style={{ textAlign: 'center', marginTop: 'var(--rd-space-4)' }}>
                {readerFootLine('daily')}
            </div>
        </>
    );
}

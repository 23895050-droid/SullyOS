// 读书模块 · 统计页（2026-09-15 UI 轮重写）
//
// 口径：阅读时长按 owner 分开记（用户一条线、每个角色一条线），数据源在 rd_progress。
// 参考图版式：分段控件 → 大字卡（总时长）→ 柱状图 → 两格数字卡 → 一行里程碑。
//
// 「每本书读了多久」这根柱状图是**真数据**（rd_progress.readingSeconds 按书聚合）。
// 日/周曲线要等批二把每次阅读落成流水，现在不画假的。

import { useEffect, useState } from 'react';
import { ChartBar, Sparkle } from '@phosphor-icons/react';
import { listBooks, listProgressByBook, type RdBook, type RdProgress } from '../../../utils/reader/readerDb';

interface Props { refreshToken: number }

interface Row { book: RdBook; prog: RdProgress | null }

const fmtDuration = (sec: number): { big: string; unit: string } => {
    const s = Math.max(0, Math.round(sec));
    if (s >= 3600) return { big: `${Math.floor(s / 3600)} 小时 ${Math.floor((s % 3600) / 60)} 分`, unit: '' };
    if (s >= 60) return { big: `${Math.floor(s / 60)}`, unit: '分钟' };
    return { big: `${s}`, unit: '秒' };
};

/** 书的短名（柱状图下面那行小字） */
const shortName = (t: string) => (t.length > 4 ? t.slice(0, 4) : t);

export default function ReaderStats({ refreshToken }: Props) {
    const [rows, setRows] = useState<Row[]>([]);
    const [owners, setOwners] = useState<string[]>(['user']);
    const [owner, setOwner] = useState<string>('user');

    useEffect(() => {
        void (async () => {
            const books = await listBooks();
            const out: Row[] = [];
            const seen = new Set<string>(['user']);
            for (const b of books) {
                const all = await listProgressByBook(b.id);
                all.forEach((p) => seen.add(p.ownerId));
                const mine = all.find((p) => p.ownerId === owner) ?? null;
                out.push({ book: b, prog: mine });
            }
            setOwners(Array.from(seen));
            setRows(out);
        })();
    }, [refreshToken, owner]);

    const withData = rows.filter((r) => (r.prog?.readingSeconds ?? 0) > 0);
    const totalSec = rows.reduce((n, r) => n + (r.prog?.readingSeconds ?? 0), 0);
    const sessions = rows.reduce((n, r) => n + (r.prog?.sessionCount ?? 0), 0);
    const doneCount = rows.filter((r) => (r.prog?.percent ?? 0) >= 99).length;
    const readingCount = rows.filter((r) => {
        const p = r.prog?.percent ?? 0;
        return p > 0 && p < 99;
    }).length;
    const maxSec = Math.max(1, ...withData.map((r) => r.prog?.readingSeconds ?? 0));
    const recent = [...rows]
        .filter((r) => r.prog?.updatedAt)
        .sort((a, b) => String(b.prog?.updatedAt).localeCompare(String(a.prog?.updatedAt)))[0];
    const last = recent?.prog?.updatedAt;
    const d = fmtDuration(totalSec);

    return (
        <div className="rd-screen" data-rd-page="stats">
            <div className="rd-head">
                <div className="rd-head-main">
                    <div className="rd-head-title">统计</div>
                    <div className="rd-head-sub">读过的都算数</div>
                </div>
            </div>

            {owners.length > 1 && (
                <div className="rd-seg">
                    {owners.map((o) => (
                        <button
                            key={o}
                            className={`rd-seg-btn${owner === o ? ' rd-seg-on' : ''}`}
                            onClick={() => setOwner(o)}
                        >
                            {o === 'user' ? '我' : '角色'}
                        </button>
                    ))}
                </div>
            )}

            {rows.length === 0 ? (
                <div className="rd-empty">
                    <ChartBar size={44} weight="thin" />
                    <div className="rd-empty-title">还没有数据</div>
                    <div className="rd-empty-text">读起来之后，这里会有阅读时长、每本书读了多久和里程碑。</div>
                </div>
            ) : (
                <>
                    <div className="rd-stat-hero">
                        <div className="rd-stat-cap">总阅读时长</div>
                        <div className="rd-stat-big">{d.big}<span className="rd-stat-cap"> {d.unit}</span></div>
                        <div className="rd-stat-delta">共打开 {sessions} 次{last ? ` · 最近 ${last.slice(0, 10)}` : ''}</div>
                    </div>

                    <div className="rd-stat-hero">
                        <div className="rd-stat-cap">每本书读了多久</div>
                        {withData.length === 0 ? (
                            <div className="rd-muted" style={{ marginTop: 8 }}>还没有读完过一本书</div>
                        ) : (
                            <div className="rd-chart">
                                {withData.slice(0, 7).map((r) => (
                                    <div className="rd-chart-col" key={r.book.id}>
                                        <div
                                            className="rd-chart-bar"
                                            style={{ height: `${Math.max(4, Math.round(((r.prog?.readingSeconds ?? 0) / maxSec) * 100))}%` }}
                                        />
                                        <div className="rd-chart-label">{shortName(r.book.title)}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="rd-stat-cols">
                        <div className="rd-stat-cell">
                            <div className="rd-stat-cap">读完</div>
                            <div className="rd-stat-num">{doneCount}</div>
                            <div className="rd-stat-cap">本</div>
                        </div>
                        <div className="rd-stat-cell">
                            <div className="rd-stat-cap">在读</div>
                            <div className="rd-stat-num">{readingCount}</div>
                            <div className="rd-stat-cap">本</div>
                        </div>
                    </div>

                    {recent && (
                        <div className="rd-stat-hero rd-stat-row">
                            <div className="rd-stat-dot"><Sparkle size={17} /></div>
                            <div>
                                <div style={{ fontSize: 'var(--rd-fs-md)' }}>最近翻开的书</div>
                                <div className="rd-stat-cap">
                                    《{recent.book.title}》{recent.prog?.updatedAt ? ` · ${recent.prog.updatedAt.slice(0, 10)}` : ''}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

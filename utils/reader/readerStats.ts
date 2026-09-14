// 读书模块 · 阅读流水（2026-09-15 v4 加）
//
// 统计页（参考图 7/8）要的四样东西里，「总时长」rd_progress 已经有了，另外三样
// （每天读多久、翻了多少页、读了多少字）得**按天记流水**才有。这里就是那本流水账。
//
// 为什么单独放 localStorage 而不是塞进 rd_progress：进度是「一本书一条」，流水是
// 「一天一条」，粒度不同；而且这块是纯追加的，不动任何既有表结构（DB 版本不用再动）。
//
// 写入点只有 ReaderPage 一处（翻页 + 每 20 秒一跳），读的是统计页。

const KEY = 'reader_stats_v1';

export interface DayStat {
    /** 阅读秒数 */
    sec: number;
    /** 翻页次数 */
    pages: number;
    /** 读过的字数 */
    chars: number;
}

export interface ReaderStatsData {
    version: number;
    updatedAt: string;
    /** 'YYYY-MM-DD' → 那天的流水 */
    days: Record<string, DayStat>;
    /** 24 个格子：每个小时累计读了多久（秒）——统计页那条「阅读习惯」用它 */
    hours: number[];
}

const EMPTY_DAY: DayStat = { sec: 0, pages: 0, chars: 0 };

export function emptyStats(): ReaderStatsData {
    return { version: 1, updatedAt: new Date().toISOString(), days: {}, hours: new Array(24).fill(0) };
}

// ── 纯函数（单测盯这几条） ───────────────────────────────────────────────

/** 本地日期的 'YYYY-MM-DD'（不用 toISOString——那个是 UTC，会把半夜的账记到前一天） */
export function dayKeyOf(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 记一笔：在 at 时刻读了 delta，落到「那一天 + 那一个小时」两个格子里 */
export function addReading(data: ReaderStatsData, at: Date, delta: Partial<DayStat>): ReaderStatsData {
    const key = dayKeyOf(at);
    const prev = data.days[key] ?? EMPTY_DAY;
    const hours = data.hours.slice();
    if (hours.length < 24) { while (hours.length < 24) hours.push(0); }
    hours[at.getHours()] += delta.sec ?? 0;
    return {
        ...data,
        updatedAt: at.toISOString(),
        days: {
            ...data.days,
            [key]: {
                sec: prev.sec + (delta.sec ?? 0),
                pages: prev.pages + (delta.pages ?? 0),
                chars: prev.chars + (delta.chars ?? 0),
            },
        },
        hours,
    };
}

/** 从 endKey 往前数 n 天（含今天），返回日期键数组（老 → 新） */
export function recentKeys(endKey: string, n: number): string[] {
    const [y, m, d] = endKey.split('-').map(Number);
    const base = new Date(y, (m ?? 1) - 1, d ?? 1);
    const out: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
        const t = new Date(base);
        t.setDate(base.getDate() - i);
        out.push(dayKeyOf(t));
    }
    return out;
}

/** 一组日期键的流水合计 */
export function sumDays(days: Record<string, DayStat>, keys: string[]): DayStat {
    return keys.reduce<DayStat>((acc, k) => {
        const d = days[k];
        if (!d) return acc;
        return { sec: acc.sec + d.sec, pages: acc.pages + d.pages, chars: acc.chars + d.chars };
    }, { ...EMPTY_DAY });
}

/** 连续读了几天（从 endKey 往回数，断一天就停）。
    今天还没读不算断——从昨天接着数，这样白天打开统计页不会看到「连续 0 天」。 */
export function streakDays(days: Record<string, DayStat>, endKey: string): number {
    const [y, m, d] = endKey.split('-').map(Number);
    const cur = new Date(y, (m ?? 1) - 1, d ?? 1);
    if (!((days[dayKeyOf(cur)]?.sec ?? 0) > 0)) cur.setDate(cur.getDate() - 1);
    let n = 0;
    for (;;) {
        const has = (days[dayKeyOf(cur)]?.sec ?? 0) > 0;
        if (!has) break;
        n++;
        cur.setDate(cur.getDate() - 1);
    }
    return n;
}

/** 热力格子分 0-4 档（0 = 没读，4 = 那天读得最多） */
export function heatLevel(sec: number, max: number): number {
    if (!sec || max <= 0) return 0;
    const r = sec / max;
    if (r > 0.75) return 4;
    if (r > 0.5) return 3;
    if (r > 0.25) return 2;
    return 1;
}

/** 秒 → 「3 小时 10 分」/「12 分 30 秒」（统计页大字用） */
export function fmtSec(sec: number): { big: string; unit: string } {
    const s = Math.max(0, Math.round(sec));
    if (s >= 3600) return { big: `${Math.floor(s / 3600)} 小时 ${Math.floor((s % 3600) / 60)} 分`, unit: '' };
    if (s >= 60) return { big: `${Math.floor(s / 60)}`, unit: '分钟' };
    return { big: `${s}`, unit: '秒' };
}

/** 字数：一万以上折成「1.2 万字」 */
export function fmtChars(n: number): { big: string; unit: string } {
    if (n >= 10000) return { big: (n / 10000).toFixed(1), unit: '万字' };
    return { big: `${Math.round(n)}`, unit: '字' };
}

// ── 读写 ────────────────────────────────────────────────────────────────

export function loadStats(): ReaderStatsData {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return emptyStats();
        const parsed = JSON.parse(raw) as Partial<ReaderStatsData>;
        const hours = Array.isArray(parsed.hours) ? parsed.hours.slice(0, 24) : [];
        while (hours.length < 24) hours.push(0);
        return {
            version: 1,
            updatedAt: parsed.updatedAt ?? new Date().toISOString(),
            days: parsed.days ?? {},
            hours,
        };
    } catch {
        return emptyStats();
    }
}

/** 记一笔阅读流水（ReaderPage 调；本地日期 + 当前小时两个桶一起加） */
export function recordReading(delta: Partial<DayStat>, at: Date = new Date()): void {
    const s = loadStats();
    const next = addReading(s, at, delta);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 配额满了就算了，统计不是关键路径 */ }
}

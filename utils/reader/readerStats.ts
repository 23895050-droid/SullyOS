// 读书模块 · 阅读流水（2026-09-15 v4 加；2026-09-15 晚按她的「日数据统计参考」改成按天成账）
//
// 统计页要的东西里，「总时长」rd_progress 已经有，另外几样得**按天记流水**才有：
// 每天读多久 / 翻了多少页 / 读了多少字 / 一天里哪几个钟头在读 / 每本书各读了多少。
//
// ⚠️ 小时桶以前是**全局一个 24 格数组**，所以「阅读习惯」不分视图、永远是全时段累计
//    （她 2026-09-15 问的就是这个）。现在小时桶挪进**每天**那条记录里，
//    日报（点某一天）就能画「这一天 0:00-23:00 的分布」。
//
// 为什么单独放 localStorage 而不是塞进 rd_progress：进度是「一本书一条」，流水是「一天一条」，
// 粒度不同；而且这块是纯追加的，不动任何既有表结构（DB 版本不用再动）。
//
// 写入点只有 ReaderPage 一处（翻页 / 每 20 秒一跳 / 进页面记一次「打开」），读的是统计页。

const KEY = 'reader_stats_v1';
const HOURS = 24;

/** 一天里某本书的账 */
export interface BookStat {
    sec: number;
    pages: number;
    chars: number;
    /** 打开了几次 */
    opens: number;
    /** 最先/最后碰这本书的时刻（日报的「最早打开 / 最晚打开」） */
    firstAt: string | null;
    lastAt: string | null;
    /** 这本书在这一天的 24 小时桶（「小时明细」按它拆） */
    hours: number[];
}

export interface DayStat {
    /** 阅读秒数 */
    sec: number;
    /** 翻页次数 */
    pages: number;
    /** 读过的字数 */
    chars: number;
    /** 这天打开阅读页的次数 */
    opens: number;
    /** 24 格：这天每个小时读了多久（秒） */
    hours: number[];
    /** 书号 → 那本书这天的账 */
    books: Record<string, BookStat>;
}

export interface ReaderStatsData {
    version: number;
    updatedAt: string;
    /** 'YYYY-MM-DD' → 那天的流水 */
    days: Record<string, DayStat>;
}

/** 记一笔时要给的东西（都可不给：只记时长的调用点不用传 bookId） */
export interface ReadingDelta {
    sec?: number;
    pages?: number;
    chars?: number;
    /** 这次读的是哪本书 */
    bookId?: string;
    /** 刚打开这本书（进阅读页那一下） */
    open?: boolean;
}

const zeros = () => new Array(HOURS).fill(0) as number[];

export function emptyBook(): BookStat {
    return { sec: 0, pages: 0, chars: 0, opens: 0, firstAt: null, lastAt: null, hours: zeros() };
}

export function emptyDay(): DayStat {
    return { sec: 0, pages: 0, chars: 0, opens: 0, hours: zeros(), books: {} };
}

/** 老数据（小时桶还在全局那版）补成新形状：缺什么补什么，缺的小时桶当全 0 */
function fixDay(raw: unknown): DayStat {
    const d = (raw ?? {}) as Partial<DayStat>;
    const hours = Array.isArray(d.hours) ? d.hours.slice(0, HOURS).map((n) => Number(n) || 0) : [];
    while (hours.length < HOURS) hours.push(0);
    const books: Record<string, BookStat> = {};
    for (const [id, v] of Object.entries(d.books ?? {})) {
        const b = (v ?? {}) as Partial<BookStat>;
        const bh = Array.isArray(b.hours) ? b.hours.slice(0, HOURS).map((n) => Number(n) || 0) : [];
        while (bh.length < HOURS) bh.push(0);
        books[id] = {
            sec: b.sec ?? 0, pages: b.pages ?? 0, chars: b.chars ?? 0, opens: b.opens ?? 0,
            firstAt: b.firstAt ?? null, lastAt: b.lastAt ?? null, hours: bh,
        };
    }
    return { sec: d.sec ?? 0, pages: d.pages ?? 0, chars: d.chars ?? 0, opens: d.opens ?? 0, hours, books };
}

export function emptyStats(): ReaderStatsData {
    return { version: 1, updatedAt: new Date().toISOString(), days: {} };
}

/** 见 loadStats 里的说明：这份账常驻内存，写的时候只改它 */
let memo: ReaderStatsData | null = null;

// ── 纯函数（单测盯这几条） ───────────────────────────────────────────────

/** 本地日期的 'YYYY-MM-DD'（不用 toISOString——那个是 UTC，会把半夜的账记到前一天） */
export function dayKeyOf(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 记一笔：落到「那一天 + 那一个小时 + 那一本书」三个格子里 */
export function addReading(data: ReaderStatsData, at: Date, delta: ReadingDelta): ReaderStatsData {
    const key = dayKeyOf(at);
    const prev = data.days[key] ?? emptyDay();
    const hour = at.getHours();
    const iso = at.toISOString();

    const hours = prev.hours.slice();
    hours[hour] += delta.sec ?? 0;

    const books = { ...prev.books };
    if (delta.bookId) {
        const b = books[delta.bookId] ?? emptyBook();
        const bh = b.hours.slice();
        bh[hour] += delta.sec ?? 0;
        books[delta.bookId] = {
            sec: b.sec + (delta.sec ?? 0),
            pages: b.pages + (delta.pages ?? 0),
            chars: b.chars + (delta.chars ?? 0),
            opens: b.opens + (delta.open ? 1 : 0),
            firstAt: b.firstAt ?? iso,
            lastAt: iso,
            hours: bh,
        };
    }

    return {
        ...data,
        updatedAt: iso,
        days: {
            ...data.days,
            [key]: {
                sec: prev.sec + (delta.sec ?? 0),
                pages: prev.pages + (delta.pages ?? 0),
                chars: prev.chars + (delta.chars ?? 0),
                opens: prev.opens + (delta.open ? 1 : 0),
                hours,
                books,
            },
        },
    };
}

/** 取某一天的账（没有就给个空的，别让调用点判 undefined） */
export function dayOf(data: ReaderStatsData, key: string): DayStat {
    return data.days[key] ?? emptyDay();
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
    const acc = emptyDay();
    for (const k of keys) {
        const d = days[k];
        if (!d) continue;
        acc.sec += d.sec;
        acc.pages += d.pages;
        acc.chars += d.chars;
        acc.opens += d.opens;
        for (let i = 0; i < HOURS; i++) acc.hours[i] += d.hours?.[i] ?? 0;
        for (const [id, b] of Object.entries(d.books ?? {})) {
            const t = acc.books[id] ?? emptyBook();
            t.sec += b.sec; t.pages += b.pages; t.chars += b.chars; t.opens += b.opens;
            t.firstAt = t.firstAt && b.firstAt ? (t.firstAt < b.firstAt ? t.firstAt : b.firstAt) : (t.firstAt ?? b.firstAt);
            t.lastAt = t.lastAt && b.lastAt ? (t.lastAt > b.lastAt ? t.lastAt : b.lastAt) : (t.lastAt ?? b.lastAt);
            for (let i = 0; i < HOURS; i++) t.hours[i] += b.hours?.[i] ?? 0;
            acc.books[id] = t;
        }
    }
    return acc;
}

/** 一串天数的小时桶加起来（年视图那个「阅读习惯」用） */
export function sumHours(days: Record<string, DayStat>, keys: string[]): number[] {
    const out = zeros();
    for (const k of keys) {
        const h = days[k]?.hours;
        if (!h) continue;
        for (let i = 0; i < HOURS; i++) out[i] += h[i] ?? 0;
    }
    return out;
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

/** 秒 → 「1 min 52 sec」那种短写法（日报里的「每本书」用） */
export function fmtShort(sec: number): string {
    const s = Math.max(0, Math.round(sec));
    if (s >= 3600) return `${Math.floor(s / 3600)} 小时 ${Math.floor((s % 3600) / 60)} 分`;
    if (s >= 60) return `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
    return `${s} 秒`;
}

/** 字数：一万以上折成「1.2 万字」 */
export function fmtChars(n: number): { big: string; unit: string } {
    if (n >= 10000) return { big: (n / 10000).toFixed(1), unit: '万字' };
    return { big: `${Math.round(n)}`, unit: '字' };
}

/** ISO → 「10:09」（日报的「最早打开」） */
export function fmtClock(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ── 一天怎么分段（日报的「时段分布」） ──────────────────────────────────

export const DAY_PARTS: Array<{ key: string; from: number; to: number }> = [
    { key: '早上', from: 5, to: 11 },
    { key: '下午', from: 12, to: 17 },
    { key: '晚上', from: 18, to: 22 },
    { key: '夜里', from: 23, to: 4 },
];

/** 某个钟点属于哪一段 */
export function partOf(hour: number): string {
    const hit = DAY_PARTS.find((p) => (p.from <= p.to ? hour >= p.from && hour <= p.to : hour >= p.from || hour <= p.to));
    return hit?.key ?? '夜里';
}

/** 24 小时桶 → 四段的秒数（带百分比） */
export function partSeconds(hours: number[]): Array<{ key: string; sec: number; pct: number }> {
    const sums = DAY_PARTS.map((p) => ({ key: p.key, sec: 0 }));
    for (let h = 0; h < HOURS; h++) {
        const sec = hours[h] ?? 0;
        if (!sec) continue;
        const idx = DAY_PARTS.findIndex((p) => p.key === partOf(h));
        if (idx >= 0) sums[idx].sec += sec;
    }
    const total = sums.reduce((n, s) => n + s.sec, 0);
    return sums.map((s) => ({ ...s, pct: total > 0 ? Math.round((s.sec / total) * 100) : 0 }));
}

/** 哪一段读得最多（「最佳阅读时段」） */
export function peakPart(hours: number[]): { key: string; sec: number } | null {
    const parts = partSeconds(hours);
    const top = parts.reduce((a, b) => (b.sec > a.sec ? b : a), parts[0]);
    return top && top.sec > 0 ? { key: top.key, sec: top.sec } : null;
}

/** 一天里读得最凶的那个钟点（「最高浓度」那条用） */
export function peakHour(hours: number[]): { hour: number; sec: number } | null {
    let best = -1;
    let sec = 0;
    for (let h = 0; h < HOURS; h++) if ((hours[h] ?? 0) > sec) { sec = hours[h]; best = h; }
    return best >= 0 ? { hour: best, sec } : null;
}

/** 这天读过的书，按时长从多到少 */
export function dayBooks(day: DayStat): Array<{ bookId: string; stat: BookStat }> {
    return Object.entries(day.books ?? {})
        .map(([bookId, stat]) => ({ bookId, stat }))
        .sort((a, b) => b.stat.sec - a.stat.sec);
}

/** 效率四件套（日报的 Efficiency Metrics 那格） */
export function efficiency(day: DayStat): {
    secPerBook: number; secPerPage: number; pagesPerMin: number; timesPerBook: number;
} {
    const nBooks = Object.keys(day.books ?? {}).length;
    const mins = day.sec / 60;
    return {
        secPerBook: nBooks > 0 ? day.sec / nBooks : 0,
        secPerPage: day.pages > 0 ? day.sec / day.pages : 0,
        pagesPerMin: mins > 0 ? day.pages / mins : 0,
        timesPerBook: nBooks > 0 ? day.opens / nBooks : 0,
    };
}

// ── 读写 ────────────────────────────────────────────────────────────────

export function loadStats(): ReaderStatsData {
    // 进程内缓存：翻页时每次都要记一笔，一年流水 JSON.parse 一遍再 stringify 回去
    // 会卡手——第一遍读完就常驻内存，之后写入直接改缓存再落盘。
    if (memo) return memo;
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) { memo = emptyStats(); return memo; }
        const parsed = JSON.parse(raw) as Partial<ReaderStatsData>;
        const days: Record<string, DayStat> = {};
        for (const [k, v] of Object.entries(parsed.days ?? {})) days[k] = fixDay(v);
        memo = { version: 1, updatedAt: parsed.updatedAt ?? new Date().toISOString(), days };
        return memo;
    } catch {
        memo = emptyStats();
        return memo;
    }
}

/** 记一笔阅读流水（ReaderPage 调；本地日期 + 当前小时 + 当前书三个桶一起加） */
export function recordReading(delta: ReadingDelta, at: Date = new Date()): void {
    const next = addReading(loadStats(), at, delta);
    memo = next;
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 配额满了就算了，统计不是关键路径 */ }
}

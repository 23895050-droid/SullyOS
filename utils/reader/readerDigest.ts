// 读书模块 · 书库页的汇总口径（2026-09-21，T5）
//
// 书库页三块用的是同一批数据，算法都在这里（纯函数，单测盯着）：
//   ① 六种排行榜（她 09-21 点名：总 token / 输入 / 输出 / 批注总字数 / 参与讨论次数 / 一起读书页数）
//   ② 一次活动在表面上怎么念（动作词组 + 那行轻量小字）
// 排列口径：**只有角色上榜**（你自己不上排行榜——那是「谁在读书」的名次）。

import type { RdAnnotation, RdRoamActivity, RdRoamKind, RdThread } from './readerDb';

export type BoardKey = 'tokens' | 'tokensIn' | 'tokensOut' | 'noteChars' | 'talks' | 'pages';

/** 六张榜（顺序就是胶囊的排列顺序） */
export const BOARDS: ReadonlyArray<{ key: BoardKey; label: string }> = [
    { key: 'tokens', label: '总 token' },
    { key: 'tokensIn', label: '输入 token' },
    { key: 'tokensOut', label: '输出 token' },
    { key: 'noteChars', label: '批注总字数' },
    { key: 'talks', label: '参与讨论' },
    { key: 'pages', label: '一起读书页' },
];

export interface RankRow {
    ownerId: string;
    value: number;
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * 六张榜一起算出来。**并列时保持传进来的角色顺序**（不抖），全 0 的也留在榜上
 * （她就两个人，缺一个反而看不出「另一个没读」）。
 */
export function buildBoards(input: {
    charIds: string[];
    roam: RdRoamActivity[];
    anns: RdAnnotation[];
    threads: RdThread[];
}): Record<BoardKey, RankRow[]> {
    const { charIds, roam, anns, threads } = input;
    const inBoard = new Set(charIds);

    const fromRoam = (pick: (a: RdRoamActivity) => number): Map<string, number> => {
        const m = new Map<string, number>();
        for (const a of roam) {
            if (!inBoard.has(a.charId)) continue;
            m.set(a.charId, (m.get(a.charId) ?? 0) + pick(a));
        }
        return m;
    };

    const noteChars = new Map<string, number>();
    for (const an of anns) {
        if (!inBoard.has(an.ownerId) || an.kind === 'bookmark') continue;
        noteChars.set(an.ownerId, (noteChars.get(an.ownerId) ?? 0) + (an.note ?? '').length);
    }

    const talks = new Map<string, number>();
    for (const t of threads) {
        for (const m of t.messages) {
            if (m.role !== 'char' || !m.charId || !inBoard.has(m.charId)) continue;
            talks.set(m.charId, (talks.get(m.charId) ?? 0) + 1);
        }
    }

    const rank = (m: Map<string, number>): RankRow[] =>
        charIds.map((id) => ({ ownerId: id, value: m.get(id) ?? 0 })).sort((a, b) => b.value - a.value);

    return {
        tokens: rank(fromRoam((a) => num(a.tokens))),
        tokensIn: rank(fromRoam((a) => num(a.tokensIn))),
        tokensOut: rank(fromRoam((a) => num(a.tokensOut))),
        noteChars: rank(noteChars),
        talks: rank(talks),
        // 「一起读书页数」只算共读里读的那些页（自己读 / 自主读不算「一起」）
        pages: rank(fromRoam((a) => (a.mode === 'coread' ? num(a.pages) : 0))),
    };
}

const VERB: Record<string, string> = {
    annotate: '读了新内容',
    reread: '重温了旧内容',
    readon: '追了进度',
    discuss: '接了话',
    browse: '翻了翻笔记',
    summary: '整理了一段',
    idle: '今天没读',
    read: '读了书',
};

/** 一次活动在表面上怎么说（共读里的加「一起」前缀） */
export function roamVerb(a: RdRoamActivity): string {
    const verb = VERB[a.kind] ?? '读了书';
    return a.mode === 'coread' ? `一起${verb}` : verb;
}

/** 「短时间内」有多短：同一个人、同一本书，隔得比这还近就算同一条（她 09-21 定） */
export const RUN_WINDOW_MS = 10 * 60 * 1000;

/** 活动记录只留最近一周（她 09-21） */
export const RUN_KEEP_DAYS = 7;

/**
 * 活动记录的一条 = **一个人在一本书上一段时间里连着做的事**。
 *
 * 她 09-21 的原话：「短时间内一个人多条记录就折叠成一条，数据没变化就是表现形式变了」——
 * 所以这是**纯展示层的合并**：库里的行一条没动（group / seq 还是原样），
 * 只是列表上把同一个人的连续记录并成一条，点开才看见里面每一次调用。
 */
export interface RoamRun {
    /** 这条的 key（取第一条调用的 id，稳定不抖） */
    key: string;
    ownerId: string;
    bookId: string;
    /** 这条里的全部调用（时间序，含 summary 那趟） */
    calls: RdRoamActivity[];
    /** 这条最早 / 最晚一条调用的时间 */
    from: string;
    to: string;
}

const byTime = (a: RdRoamActivity, b: RdRoamActivity) =>
    a.createdAt.localeCompare(b.createdAt) || a.seq - b.seq;

/**
 * 并成一条（输入顺序无所谓）。
 *
 * 粒度是 **`group` + 人**：一次活动的几条调用永远捆在一起（摘要那趟也算），
 * 但**多人共读的一个 group 要按人拆开**——活动记录是按人看的，
 * 把两个人并成一条会让另一个人的名字整个消失（第一版就是这么栽的）。
 * 拆完之后，同一个人、同一本书、跟上一段挨得够近的，才继续并。
 */
export function mergeRuns(rows: RdRoamActivity[], windowMs = RUN_WINDOW_MS): RoamRun[] {
    const byAct = new Map<string, RdRoamActivity[]>();
    for (const a of rows) {
        const k = `${a.group}|${a.charId}`;
        const arr = byAct.get(k) ?? [];
        arr.push(a);
        byAct.set(k, arr);
    }
    // 按**人 + 书**分桶，各走各的时间轴（一起共读的两个人各有各的一条线，
    // 不这么分的话中间插进来的那个人会把同一个人前后两段切断）
    const byWho = new Map<string, RdRoamActivity[][]>();
    for (const arr of byAct.values()) {
        const act = arr.slice().sort(byTime);
        const k = `${act[0].charId}|${act[0].bookId}`;
        const list = byWho.get(k) ?? [];
        list.push(act);
        byWho.set(k, list);
    }

    const runs: RoamRun[] = [];
    for (const list of byWho.values()) {
        let cur: RdRoamActivity[] = [];
        let curEnd = 0;
        const flush = () => {
            if (cur.length === 0) return;
            const calls = cur.slice().sort(byTime);
            runs.push({
                key: calls[0].id, ownerId: calls[0].charId, bookId: calls[0].bookId,
                calls, from: calls[0].createdAt, to: calls[calls.length - 1].createdAt,
            });
            cur = [];
            curEnd = 0;
        };
        for (const act of list.slice().sort((x, y) => x[0].createdAt.localeCompare(y[0].createdAt))) {
            if (cur.length > 0 && Date.parse(act[0].createdAt) - curEnd > windowMs) flush();
            cur = [...cur, ...act];
            curEnd = Math.max(curEnd, ...act.map((a) => Date.parse(a.createdAt)));
        }
        flush();
    }
    return runs.sort((a, b) => b.to.localeCompare(a.to));
}

/** 这条里都做了什么（去重、按固定顺序念） */
export function runVerbs(run: RoamRun): string {
    const kinds = new Set(run.calls.map((a) => a.kind));
    const order: RdRoamKind[] = ['annotate', 'readon', 'reread', 'discuss', 'browse', 'read'];
    const words = order.filter((k) => kinds.has(k)).map((k) => VERB[k]);
    const text = words.length > 0 ? words.join('、') : '读了书';
    return run.calls.some((a) => a.mode === 'coread') ? `一起${text}` : text;
}

/** 这条的小字：页数 / 进度 / 批注 / 回复 / token——**都是这条里加总的** */
export function runMeta(run: RoamRun, percent?: number): string {
    const sum = (pick: (a: RdRoamActivity) => number) => run.calls.reduce((n, a) => n + pick(a), 0);
    const bits: string[] = [];
    const pages = sum((a) => num(a.pages));
    // 页数只报角色的（她 09-26：user 那边的页数口径全是 bug）
    if (pages && run.ownerId !== 'user') bits.push(`看了 ${pages} 页`);
    if (percent !== undefined && percent > 0) bits.push(`进度 ${Math.round(percent)}%`);
    const anns = sum((a) => num(a.annCount));
    if (anns) bits.push(`${anns} 条批注`);
    const replies = sum((a) => num(a.replyCount));
    if (replies) bits.push(`${replies} 条回复`);
    const tok = sum((a) => num(a.tokens));
    if (tok && run.ownerId !== 'user') bits.push(`${fmtTok(tok)} token`);
    return bits.join(' · ');
}

/** 活动记录页的「性质」筛选项（她 09-21：共读？读新内容？重温？参与讨论？） */
export const RUN_KINDS: ReadonlyArray<{ key: string; label: string; hit: (a: RdRoamActivity) => boolean }> = [
    { key: 'coread', label: '共读', hit: (a) => a.mode === 'coread' },
    { key: 'annotate', label: '读新内容', hit: (a) => a.kind === 'annotate' },
    { key: 'readon', label: '追进度', hit: (a) => a.kind === 'readon' },
    { key: 'reread', label: '重温', hit: (a) => a.kind === 'reread' },
    { key: 'discuss', label: '参与讨论', hit: (a) => a.kind === 'discuss' },
    { key: 'browse', label: '翻笔记', hit: (a) => a.kind === 'browse' },
    { key: 'self', label: '自己读', hit: (a) => a.mode === 'user' },
];

/** 这条算不算某个性质（空数组 = 不筛） */
export function runHitKinds(run: RoamRun, keys: string[]): boolean {
    if (keys.length === 0) return true;
    return RUN_KINDS.some((k) => keys.includes(k.key) && run.calls.some(k.hit));
}

/** 本地那天的 key（YYYY-MM-DD）——按天分组用它，不用 UTC */
export function dayKeyOfDate(d: Date): string {
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dayKeyOf(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? (iso || '').slice(0, 10) : dayKeyOfDate(d);
}

/** 最近 N 天（老的在前、今天在最后）——日期条用它，`w` 是星期几 */
export function lastDays(days: number, now = new Date()): Array<{ key: string; w: string; n: number }> {
    const W = ['日', '一', '二', '三', '四', '五', '六'];
    const out: Array<{ key: string; w: string; n: number }> = [];
    for (let i = days - 1; i >= 0; i -= 1) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        out.push({ key: dayKeyOfDate(d), w: W[d.getDay()], n: d.getDate() });
    }
    return out;
}

/** 天的标题：今天 / 昨天 / 09-19（today 传今天的 dayKey） */
export function dayLabel(day: string, today: string): string {
    if (day === today) return '今天';
    const y = new Date(`${today}T00:00:00`);
    y.setDate(y.getDate() - 1);
    const p = (n: number) => String(n).padStart(2, '0');
    const yKey = `${y.getFullYear()}-${p(y.getMonth() + 1)}-${p(y.getDate())}`;
    if (day === yKey) return '昨天';
    return day.slice(5).replace('-', '/');
}

/** 按天分组（新的天在前） */
export function groupByDay(runs: RoamRun[]): Array<{ day: string; runs: RoamRun[] }> {
    const out: Array<{ day: string; runs: RoamRun[] }> = [];
    for (const r of runs) {
        const day = dayKeyOf(r.to);
        const last = out[out.length - 1];
        if (last && last.day === day) last.runs.push(r);
        else out.push({ day, runs: [r] });
    }
    return out;
}

/** 最近 N 天之前的一律不看（活动记录只留最近一周） */
export function withinDays(iso: string, days: number, now = Date.now()): boolean {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return false;
    return now - t <= days * 24 * 60 * 60 * 1000;
}

/** token 数（列表里不占地方：1.2k / 3.4w） */
export function fmtTok(n?: number): string {
    const v = Number(n ?? 0) || 0;
    if (v >= 10000) return `${(v / 10000).toFixed(1)}w`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return String(v);
}

/** 榜单上的数（批注字数四位数以上就用千进制，免得撑破一行） */
export function fmtRank(key: BoardKey, n: number): string {
    if (key === 'noteChars') return n >= 1000 ? `${(n / 1000).toFixed(1)}k 字` : `${n} 字`;
    if (key === 'talks') return `${n} 次`;
    if (key === 'pages') return `${n} 页`;
    return `${fmtTok(n)} token`;
}

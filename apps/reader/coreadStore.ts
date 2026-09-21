// 读书模块 · 共读会话 store（2026-09-15，09-20 扩成多角色 + 三维规则）
//
// 「共读状态」= **显式开启**的会话（她 09-15 定：系统不自动判定谁读完了）。
// 开法（她 09-20 定的三步向导）：阅读页右上角 → 邀请谁（可多选）→ 规则 → 确认设置。
// 退出阅读页只是**存进度**，会话还在；只有明确点「共读结束」才结束——
// 结束时把还没总结的部分总结掉，摘要作为 system 消息进 chat。
//
// 放 localStorage（小、同步、要即时生效），用 apps/couple/coupleStoreBase 的工厂：
// 订阅 / 持久化 / 备份导入重读三件套直接继承，跟 readerPrefs 一个路子。

import { createCoupleStore, isoNow, uid } from '../couple/coupleStoreBase';

/**
 * 共读时角色读哪套上下文（她 09-15 定，照「协同工作」的两个模式）：
 *   immersive = chat 同款：完整角色 + 关系 + 世界观 + 世界书 + 用户印象 + 日常记忆，
 *               最近几条聊天每轮实时读取（不冻结）
 *   focused   = 核心人设：完整核心人格 + 世界观 + 用户设定；不载世界书与用户印象
 */
export type CoReadContextMode = 'immersive' | 'focused';

/** 一个 API 槽（与日记模块同构）。baseUrl 已带 /v1 后缀。 */
export interface CoReadApiConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
}

/** 书里的位置。**段号是章内口径**（和 RdAnchor 一样，阅读页的 data-para-idx 就是它）。 */
export interface CoReadPos {
    chapterIdx: number;
    paraIdx: number;
}

/**
 * 摘要规则（她 09-20 扩成**三个选项 = 两个维度**）：
 *   口径 metric —— 拿什么推水位线：
 *     msgs  = 按讨论了多少句（默认，她 09-16 照 TRPG 定的）
 *     notes = 按留下多少条笔记
 *     pages = 按读了多少页
 *   时机 timing —— 总结完什么时候进聊天：
 *     auto   = 自动归档：一满就总结，**立刻同步进角色的聊天**
 *     manual = 手动归档：照样总结，但**先不打扰聊天**；点「共读结束」才整段送进去
 * 面板上的三枚胶囊 = 自动归档（msgs+auto）/ 手动归档（msgs+manual）/ 自定义（三个口径 × 两个时机）。
 *
 * 水位线是同一条：攒到 threshold 就总结，**最新那条留着做衔接**；
 * 没攒够就点结束 → 把水位线以下剩下的全补总结。
 */
export type CoReadArchiveMetric = 'msgs' | 'notes' | 'pages';
export type CoReadArchiveTiming = 'auto' | 'manual';

export interface CoReadRule {
    metric: CoReadArchiveMetric;
    /** 攒到多少推一次水位线（讨论句数 / 笔记条数 / 页数） */
    threshold: number;
    timing: CoReadArchiveTiming;
}

/** 默认 31 条讨论 → 总结前 30 条（她 09-16 的原话）。 */
/**
 * 默认规则：**每满 10 条讨论总结一条**（她 09-21 拍的板）。
 * 原来是 31——攒得太多，一次总结要吞掉三十条话，写出来的东西糊成一团，
 * 角色读聊天上下文时整个人是乱的；改小之后每条记录只覆盖一小段，干净得多。
 */
export const DEFAULT_RULE: CoReadRule = { metric: 'msgs', threshold: 10, timing: 'auto' };

export const RULE_METRIC_LABEL: Record<CoReadArchiveMetric, string> = {
    msgs: '讨论句数',
    notes: '笔记条数',
    pages: '读了多少页',
};

export const RULE_METRIC_UNIT: Record<CoReadArchiveMetric, string> = {
    msgs: '条讨论',
    notes: '条笔记',
    pages: '页',
};

export const RULE_TIMING_LABEL: Record<CoReadArchiveTiming, string> = {
    auto: '自动归档',
    manual: '手动归档',
};

/** 规则的一句话说明（确认设置 / 信息页里那行小字）。 */
export const ruleHint = (rule: CoReadRule): string => {
    const unit = RULE_METRIC_UNIT[rule.metric];
    const tail = rule.timing === 'auto'
        ? '总结完立刻同步进他的聊天；共读结束时把剩下的补齐。'
        : '先不打扰聊天；点「共读结束」才把整段经历一次送进他的聊天。';
    return `每满 ${rule.threshold} ${unit}自动总结一次（最新那条留着做衔接），${tail}`;
};

export interface CoReadSession {
    bookId: string;
    /** 一起读的人（她 09-20：可多选；几个人读就是几次单独的调用） */
    charIds: string[];
    contextMode: CoReadContextMode;
    /** 摘要规则（口径 × 时机）。**开读之后锁定**，中途不能改 */
    rule: CoReadRule;
    /** 回复模式：开了他就不必等你点 ⚡——他自己决定回不回、要不要往下读 */
    replyMode: boolean;
    /** **水位线**：讨论流水已经总结到第几条（0 = 一条都还没总结） */
    summarizedMsgs: number;
    /** 上次总结时读到哪（展示用；也是「这段读了什么」的兜底范围） */
    summarizedTo: CoReadPos | null;
    /** 上次总结的时间（活动记录按它切：只把这段时间之后的读进来） */
    summarizedAt: string | null;
    startedAt: string;
    updatedAt: string;
}

/** 一段已总结的内容。手动归档攒着，等「共读结束」一起拼成一条 system 消息；
 *  自动归档每写一条就同步进 chat（这里仍然留一份，给「之前总结过的」做衔接）。 */
export interface CoReadSummary {
    id: string;
    from: CoReadPos;
    to: CoReadPos;
    text: string;
    createdAt: string;
}

export interface CoReadStore {
    version: number;
    updatedAt: string;
    /** 当前会话。**同时只开一本**——一起读书是这一本书上的事 */
    session: CoReadSession | null;
    /** 还没送进 chat 的摘要 */
    summaries: CoReadSummary[];
    /** 共读读一页的默认 api 槽（她 09-20 拆细：读一页和手动回复各算一档） */
    coreadApi: CoReadApiConfig;
    /** **手动回复**（⚡ 回一条讨论）单独一档 api（她 09-20 点名要的） */
    replyApi: CoReadApiConfig;
    /** 单独读书的默认 api 槽（他自己读书那条线） */
    soloApi: CoReadApiConfig;
    /** 摘要模型槽：**只认它自己，不配就不跑**（她 09-20 定的），失败可补摘 */
    summaryApi: CoReadApiConfig;
    /** 老数据：每角色的共读槽。已搬到 `readerCharPrefs.api`（那边首启会迁），这里只做兼容 */
    charApis?: Record<string, CoReadApiConfig>;
}

/** 四个 api 槽的名字（设置页 / 共读面板共用）。 */
export type ReadApiSlot = 'coread' | 'reply' | 'solo' | 'summary';

export const COREAD_STORE_VERSION = 1;

const EMPTY_API: CoReadApiConfig = { baseUrl: '', apiKey: '', model: '' };

const DEFAULT_STORE: CoReadStore = {
    version: COREAD_STORE_VERSION,
    updatedAt: '1970-01-01T00:00:00.000Z',
    session: null,
    summaries: [],
    coreadApi: { ...EMPTY_API },
    replyApi: { ...EMPTY_API },
    soloApi: { ...EMPTY_API },
    summaryApi: { ...EMPTY_API },
};

const store = createCoupleStore<CoReadStore>('reader_coread_v1', COREAD_STORE_VERSION, DEFAULT_STORE, (parsed) => {
    // 老口径搬迁：
    //   ① charId（单角色）→ charIds（多角色）
    //   ② archiveMode（auto/manual）→ rule（口径默认 msgs、阈值 31）
    //   ③ 更老的 summaryWhen（push/end）→ timing；自由文本规则 → manual
    const old = parsed.session as (CoReadSession & {
        charId?: string;
        archiveMode?: string;
        summaryWhen?: string;
        summaryRule?: string;
    }) | null | undefined;

    const timing: CoReadArchiveTiming = old?.rule?.timing === 'auto' || old?.rule?.timing === 'manual'
        ? old.rule.timing
        : (old?.archiveMode === 'auto' || old?.summaryWhen === 'push' ? 'auto' : 'manual');
    const rule: CoReadRule = {
        metric: old?.rule?.metric ?? DEFAULT_RULE.metric,
        threshold: typeof old?.rule?.threshold === 'number' ? old.rule.threshold : DEFAULT_RULE.threshold,
        timing,
    };
    const charIds = Array.isArray(old?.charIds) && old.charIds.length > 0
        ? old.charIds.filter((id): id is string => typeof id === 'string' && !!id)
        : (typeof old?.charId === 'string' && old.charId ? [old.charId] : []);

    return {
        ...DEFAULT_STORE,
        ...parsed,
        session: parsed.session && charIds.length > 0
            ? {
                ...old,
                charIds,
                rule,
                replyMode: old?.replyMode === true,
                summarizedMsgs: typeof old?.summarizedMsgs === 'number' ? old.summarizedMsgs : 0,
                summarizedAt: old?.summarizedAt ?? null,
            } as CoReadSession
            : null,
        summaries: parsed.summaries ?? [],
        coreadApi: { ...EMPTY_API, ...(parsed.coreadApi || {}) },
        replyApi: { ...EMPTY_API, ...(parsed.replyApi || {}) },
        soloApi: { ...EMPTY_API, ...(parsed.soloApi || {}) },
        summaryApi: { ...EMPTY_API, ...(parsed.summaryApi || {}) },
    };
});

export const useCoReadStore = store.use;
export const getCoReadStore = store.get;

// ── 纯 getter（非 React 代码读） ──

/** 这本书正在共读吗；是的话返回会话。 */
export const coReadOf = (s: CoReadStore, bookId: string): CoReadSession | null =>
    s.session && s.session.bookId === bookId ? s.session : null;

/** 这个人在这次会话里吗。 */
export const inSession = (session: CoReadSession | null, charId: string): boolean =>
    !!session && session.charIds.includes(charId);

/** 四个默认 api 槽（`resolveReadApi` 吃它）。 */
export const readApiSlots = (s: CoReadStore): {
    coread: CoReadApiConfig; reply: CoReadApiConfig; solo: CoReadApiConfig; summary: CoReadApiConfig;
} => ({ coread: s.coreadApi, reply: s.replyApi, solo: s.soloApi, summary: s.summaryApi });

// ── 写 ──

/** 开一次共读（同一时间只留一个会话；旧的摘要一并清掉，别把上一本的带进来）。 */
export function startCoRead(input: {
    bookId: string;
    charIds: string[];
    contextMode: CoReadContextMode;
    rule?: CoReadRule;
    replyMode?: boolean;
}): CoReadSession {
    const now = isoNow();
    const session: CoReadSession = {
        bookId: input.bookId,
        charIds: [...input.charIds],
        contextMode: input.contextMode,
        rule: input.rule ?? DEFAULT_RULE,
        replyMode: input.replyMode ?? false,
        summarizedMsgs: 0,
        summarizedTo: null,
        summarizedAt: null,
        startedAt: now,
        updatedAt: now,
    };
    store.set((prev) => ({ ...prev, session, summaries: [], updatedAt: now }));
    return session;
}

/**
 * 改会话设置。**规则锁死**——她 09-20：「总结节奏不能改」。
 * 中途能改的是：加人 / 回复模式 / 上下文模式。
 */
export function updateCoReadSession(patch: Partial<Omit<CoReadSession, 'bookId' | 'startedAt' | 'rule'>>): void {
    store.set((prev) => (prev.session
        ? { ...prev, session: { ...prev.session, ...patch, rule: prev.session.rule, updatedAt: isoNow() }, updatedAt: isoNow() }
        : prev));
}

/** 中途加人（已在里面的不重复加）。 */
export function addCoReadChars(charIds: string[]): void {
    store.set((prev) => {
        if (!prev.session) return prev;
        const merged = Array.from(new Set([...prev.session.charIds, ...charIds]));
        return { ...prev, session: { ...prev.session, charIds: merged, updatedAt: isoNow() }, updatedAt: isoNow() };
    });
}

/** 记一段摘要（总结完就调它）：把**水位线**推到第 coveredMsgs 条讨论 + 记下读到哪/什么时候。 */
export function appendCoReadSummary(from: CoReadPos, to: CoReadPos, text: string, coveredMsgs = 0): CoReadSummary {
    const now = isoNow();
    const row: CoReadSummary = { id: uid(), from, to, text, createdAt: now };
    store.set((prev) => ({
        ...prev,
        summaries: [...prev.summaries, row],
        session: prev.session
            ? {
                ...prev.session,
                summarizedMsgs: prev.session.summarizedMsgs + Math.max(0, coveredMsgs),
                summarizedTo: to,
                summarizedAt: now,
                updatedAt: now,
            }
            : null,
        updatedAt: now,
    }));
    return row;
}

/**
 * 结束共读：把摘要交出去（调用方拼 system 消息进 chat），然后清干净。
 * 返回被清掉的那些摘要——**先取后清**，调完这个函数 store 里的 session 就没了。
 */
export function endCoRead(): { session: CoReadSession; summaries: CoReadSummary[] } | null {
    const s = store.get();
    if (!s.session) return null;
    const payload = { session: s.session, summaries: s.summaries };
    store.set((prev) => ({ ...prev, session: null, summaries: [], updatedAt: isoNow() }));
    return payload;
}

/** 退出阅读页但不算结束——什么都不用做（会话本来就在 store 里）。
 *  这里只记一下「他读到哪」，重进时面板接着显示。 */
export function touchCoRead(): void {
    store.set((prev) => (prev.session ? { ...prev, session: { ...prev.session, updatedAt: isoNow() } } : prev));
}

/** 写四个默认 api 槽之一（设置页 / 共读面板改）。槽名 = 用途。 */
export function setReadApiSlot(slot: ReadApiSlot, patch: Partial<CoReadApiConfig>): void {
    const KEY_OF: Record<ReadApiSlot, 'coreadApi' | 'replyApi' | 'soloApi' | 'summaryApi'> = {
        coread: 'coreadApi', reply: 'replyApi', solo: 'soloApi', summary: 'summaryApi',
    };
    store.set((prev) => {
        const key = KEY_OF[slot];
        return { ...prev, [key]: { ...prev[key], ...patch }, updatedAt: isoNow() };
    });
}

// 读书模块 · 共读面板（2026-09-15 起；09-20 按她的三份文档重写）
//
// 阅读页右上角「一起读书」拉起来的就是这张卡。她 09-20 定的两条流：
//
//   **没在共读 → 三步向导**（她原话：入口还是按原来的入口）
//     ① 要邀请谁一起读书？——角色**多选**，点「一起读书吧！」
//     ② 规则选择——三选一：自动归档 / 手动归档 / 自定义（口径 × 时机）
//     ③ 确认设置——**每人一行，折叠只显示预设名**，展开能改提示词预设 / api 预设 /
//        每次读几页 / 每次笔记上限；底部是**回复模式**开关
//     这些设置**直接存进角色自己的设置**（readerCharPrefs），下次共读默认启用，
//     除非下次在确认设置页改了（她原话）。
//
//   **共读中 → 信息页 + 设置**
//     · 每人一张状态卡：读到哪 / 水位线 / 这次产出多少批注和回复
//     · 设置折叠卡：**中途加人** / 改任何人的提示词·页数·笔记上限 / api / 摘要模型
//       —— **总结节奏锁死**（她原话「总结节奏不能改」）
//     · 动作摆最下面：让他读 / 共读结束
//
// **多人 = 多次单独的调用**（她原话）：点一次「让他们读」，每个人各调一次、各自落一条
// 活动记录，但**同挂一个 group**（一次决策和阅读 = 界面上的一张活动卡）。
//
// **摘要规则 ≠ 摘要提示词**：规则（什么时候总结）在这张卡里选；提示词在书房设置里改。
// **后台进行**：读页、总结都是普通 Promise，面板收起来 / 退回书架都照跑，进度写在全局胶囊上。

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CaretDown, Check, Circle, Plus, UsersThree } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import type { CharacterProfile } from '../../types';
import {
    getProgress, listAnnotations, listRoamActivities, listThreads, appendRoamActivity,
    newRoamGroup, putProgress, rdId, type RdBook, type RdRoamActivity,
} from '../../utils/reader/readerDb';
import { recentChatLines, readCoReadPage, resolveReadApi, writeCoReadMarks, writeCoReadReplies, type ReaderCallRuntime } from '../../utils/reader/readerChat';
import { analyzeCharStyle, needStyleAnalysis } from '../../utils/reader/readerStyle';
import { gatherPageFeed } from '../../utils/reader/readerFeed';
import { DB } from '../../utils/db';
import { normalizeApiBaseUrl, normalizeApiCredential, normalizeApiModel } from '../../utils/apiConfigNormalize';
import { charPrefsOf, clampPageCount, setCharReadPrefs, useReaderCharPrefs, type CharReadPrefs } from './readerCharPrefs';
import RdNumField from './RdNumField';
import { highlightColorOf, useReaderPrefs } from './readerPrefs';
import { runArchive } from './coreadArchive';
import ReaderCharStyleSheet from './ReaderCharStyleSheet';
import { beginJob, endJob } from './readerJobs';
import {
    addCoReadChars, DEFAULT_RULE, endCoRead, getCoReadStore, readApiSlots, RULE_METRIC_LABEL,
    RULE_METRIC_UNIT, RULE_TIMING_LABEL, ruleHint, setReadApiSlot, startCoRead, updateCoReadSession,
    useCoReadStore,
    type CoReadApiConfig, type CoReadArchiveMetric, type CoReadArchiveTiming, type CoReadContextMode,
    type CoReadRule, type ReadApiSlot,
} from './coreadStore';

interface Props {
    book: RdBook;
    chapterIdx: number;
    chapterTitle: string;
    /** 当前页压着的段落（章内段号 + 正文） */
    pageParas: Array<{ paraIdx: number; text: string }>;
    /** 整章正文（总结按段号切） */
    chapterParas: string[];
    /** 从当前页起往后 n 页的窗口（「每次读几页」用；n=1 就是这一页） */
    parasAhead: (pages: number) => Array<{ paraIdx: number; text: string }>;
    /** 你眼下翻到的是本章第几页（1 起）——活动记录里要写「读了第几页到第几页」 */
    pageNo: number;
    /** 本章一共几页（写到头就停在最后一页） */
    pageCount: number;
    percent: number;
    notify: (msg: string) => void;
    onClose: () => void;
    /** 落了新批注 → 让阅读页重新拉一遍 */
    onChanged: () => void;
    /** 上次邀请的人（还没开读时顶栏头像用它） */
    pickedCharIds?: string[];
    /** 邀请名单变了 → 告诉阅读页 */
    onPick?: (charIds: string[]) => void;
}

/**
 * 「最近读到的」时间线上的一条：`act` = 角色的一次调用（活动记录）；
 * `mine` = 她自己的划线 / 接话（她 09-21：这条线上也要看得见她说过的）
 */
type RecentItem =
    | { kind: 'act'; at: string; a: RdRoamActivity }
    | { kind: 'mine'; at: string; what: string; quote?: string; text: string };

/** 时间线上的时间戳：今天只写 HH:MM，别的日子带月日 */
const fmtClock = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const sameDay = d.getFullYear() === now.getFullYear()
        && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    return `${sameDay ? '' : `${d.getMonth() + 1}-${d.getDate()} `}${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 一万以上折成 1.2k（活动记录里那行 token 用它） */
const fmtTok = (n: number | undefined): string => {
    const v = Number(n ?? 0) || 0;
    if (v >= 10000) return `${(v / 10000).toFixed(1)}w`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return String(v);
};

/** 这一步的规则算「哪一种」（三枚胶囊的判定） */
const ruleKindOf = (rule: CoReadRule): 'auto' | 'manual' | 'custom' => {
    if (rule.metric !== DEFAULT_RULE.metric || rule.threshold !== DEFAULT_RULE.threshold) return 'custom';
    return rule.timing;
};

/**
 * 一条活动记录的「轻量表面」——她文档里**简要活动记录**的口径：
 * 读了哪本书 / 几页 / 进度 / 留了几个批注 / 多少回复 / 单次总 token，**无笔记正文**
 * （详细记录已经落过库了，这儿只做一行流水）。
 */
function briefLine(who: string, a: RdRoamActivity): string {
    const bits: string[] = [];
    if (a.kind === 'summary') {
        bits.push(a.summary || '总结了一段');
    } else {
        // 读的是「第几页到第几页」（她 09-21 要的：一眼看出他到底读没读）；
        // 09-21 之前的老记录没有页号，退回段号
        if (a.fromPage !== undefined && a.toPage !== undefined && a.kind === 'annotate') {
            bits.push(a.fromPage === a.toPage ? `第 ${a.fromPage} 页` : `第 ${a.fromPage}–${a.toPage} 页`);
        } else if (a.fromPara !== undefined && a.toPara !== undefined && a.kind === 'annotate') {
            bits.push(`第 ${a.fromPara + 1}–${a.toPara + 1} 段`);
        }
        if (a.pages) bits.push(`读了 ${a.pages} 页`);
        if (a.annCount) bits.push(`留下 ${a.annCount} 条批注`);
        if (a.replyCount) bits.push(`回了 ${a.replyCount} 条讨论`);
        if (a.durationMs) bits.push(`${Math.max(1, Math.round(a.durationMs / 60000))} 分钟`);
        if (bits.length === 0) bits.push(a.summary || '读了一会儿');
    }
    const tk = (a.tokensIn ?? 0) + (a.tokensOut ?? 0);
    return `${who}：${bits.join(' · ')}${tk > 0 ? `（${fmtTok(tk)} token）` : ''}`;
}

export default function ReaderCoRead({
    book, chapterIdx, chapterTitle, pageParas, chapterParas, parasAhead, pageNo, pageCount, percent,
    notify, onClose, onChanged, pickedCharIds, onPick,
}: Props) {
    const { characters, userProfile, apiConfig, apiPresets } = useOS();
    const store = useCoReadStore();
    const charPrefs = useReaderCharPrefs();
    const prefs = useReaderPrefs();
    const session = store.session && store.session.bookId === book.id ? store.session : null;

    /** 面板停在向导第几步（没在共读时用） */
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [picks, setPicks] = useState<string[]>(pickedCharIds ?? []);
    const [rule, setRule] = useState<CoReadRule>(DEFAULT_RULE);
    const [mode, setMode] = useState<CoReadContextMode>('immersive');
    const [replyMode, setReplyMode] = useState(false);
    /** 确认设置里展开的是哪个人（null = 全折叠，只显示预设名） */
    const [openMember, setOpenMember] = useState<string | null>(null);
    /** 共读中的设置折叠 */
    const [fold, setFold] = useState(false);
    /** 正在编辑哪个 api 槽 */
    const [apiOpen, setApiOpen] = useState<ReadApiSlot | null>(null);
    const [busy, setBusy] = useState<null | 'read' | 'finish'>(null);
    const [recent, setRecent] = useState<RecentItem[]>([]);
    /** 正在看谁的阅读风格 */
    const [styleChar, setStyleChar] = useState<string | null>(null);
    const [charPara, setCharPara] = useState<Record<string, number | null>>({});

    /** 开了读书开关的角色才有资格一起读（开关存在角色自己的设置里）。 */
    const readingChars = useMemo(
        () => characters.filter((c) => charPrefsOf(charPrefs, c.id).readEnabled),
        [characters, charPrefs],
    );
    const charOf = useCallback(
        (id: string): CharacterProfile | undefined => characters.find((c) => c.id === id),
        [characters],
    );
    const nameOf = useCallback((ownerId: string): string => (
        ownerId === 'user' ? (userProfile?.name ?? 'Angel') : (charOf(ownerId)?.name ?? ownerId)
    ), [charOf, userProfile]);

    const pageFrom = pageParas[0]?.paraIdx ?? 0;
    const pageTo = pageParas[pageParas.length - 1]?.paraIdx ?? pageFrom;

    /**
     * 中途加人（她 09-20）：加进会话（他立刻多一行配置）+ **新人和旧人的聊天框都收到通知**。
     * 名单写全，谁都能看见现在是一起读的都有谁。
     */
    const addPerson = async (charId: string) => {
        const cur = getCoReadStore().session;
        if (!cur) return;
        addCoReadChars([charId]);
        const ids = [...cur.charIds, charId];
        const names = ids.map((id) => nameOf(id)).join('、');
        const who = userProfile?.name ?? '你';
        const invited = nameOf(charId);
        for (const id of ids) {
            void DB.saveMessage({
                charId: id,
                role: 'system',
                type: 'text',
                content: `【${who} 邀请 ${invited} 加入共读，目前一起读书的人有 ${names}。】`,
                metadata: {
                    source: 'reader_coread',
                    coread: { bookId: book.id, title: book.title, charId: id, opened: true, joined: invited },
                },
            }).catch(() => { /* 通知发不出去也别拦着加人 */ });
        }
        notify(`${invited}也进来了`);
    };

    // 会话已有的设置回填一次（面板是会话的视图，不是另一份状态）
    useEffect(() => {
        if (!session) return;
        setMode(session.contextMode);
        setRule(session.rule);
        setReplyMode(session.replyMode);
    }, [session?.bookId, session?.contextMode, session?.rule, session?.replyMode, session]);

    // 邀请名单 → 报给阅读页（顶栏那枚图标换成第一个人）
    useEffect(() => {
        if (!session) onPick?.(picks);
    }, [picks, session, onPick]);

    // 每人读到哪 + 「最近读到的」时间线（角色那边 + 她自己的批注和回复，混在一起按时间排）
    const refreshSide = useCallback(async () => {
        if (!session) { setRecent([]); setCharPara({}); return; }
        try {
            const [paras, acts, anns, threads] = await Promise.all([
                Promise.all(session.charIds.map((id) => getProgress(book.id, id).then(
                    (p) => [id, p && p.chapterIdx === chapterIdx ? p.paraIdx : null] as const,
                ))),
                Promise.all(session.charIds.map((id) => listRoamActivities(id, 6))),
                listAnnotations(book.id).catch(() => []),
                listThreads(book.id).catch(() => []),
            ]);
            setCharPara(Object.fromEntries(paras));
            const items: RecentItem[] = [];
            for (const a of acts.flat()) {
                if (a.bookId === book.id) items.push({ kind: 'act', at: a.createdAt, a });
            }
            // 她 09-21：这条时间线上也要看得见她自己的批注和回复——
            // 不然她只能看见他在读，看不见自己说过什么、他有没有接
            for (const a of anns) {
                if (a.ownerId !== 'user' || a.kind === 'bookmark') continue;
                if (a.createdAt < session.startedAt) continue;
                items.push({ kind: 'mine', at: a.createdAt, what: '划了一句', quote: a.anchor.text, text: a.note ?? '' });
            }
            for (const t of threads) {
                for (const m of t.messages) {
                    if (m.role !== 'user' || m.createdAt < session.startedAt) continue;
                    items.push({ kind: 'mine', at: m.createdAt, what: '接了一句', quote: t.anchor.text, text: m.content });
                }
            }
            items.sort((x, y) => y.at.localeCompare(x.at));
            setRecent(items.slice(0, 10));
        } catch { /* 读不到就先不显示 */ }
    }, [book.id, chapterIdx, session]);
    useEffect(() => { void refreshSide(); }, [refreshSide]);

    /** 这次共读里各人产出的批注 / 回复条数（信息页那行小字） */
    const produced = useMemo(() => {
        const out: Record<string, { ann: number; reply: number }> = {};
        for (const it of recent) {
            if (it.kind !== 'act') continue;
            const a = it.a;
            if (!out[a.charId]) out[a.charId] = { ann: 0, reply: 0 };
            out[a.charId].ann += a.annCount ?? (a.kind === 'annotate' ? 1 : 0);
            out[a.charId].reply += a.replyCount ?? (a.kind === 'discuss' ? 1 : 0);
        }
        return out;
    }, [recent]);

    // ── api 槽（共读 / 单独读书 / 摘要；都走主预设池）──
    const slots = readApiSlots(store);
    const slotValue = (s: ReadApiSlot): CoReadApiConfig => slots[s];
    const presetNameOf = (c: CoReadApiConfig): string => {
        const hit = apiPresets.find((p) => (
            normalizeApiBaseUrl(p.config.baseUrl) === c.baseUrl
            && normalizeApiCredential(p.config.apiKey) === c.apiKey
            && normalizeApiModel(p.config.model) === c.model
        ));
        return hit?.name ?? (c.model ? c.model : '主 API');
    };

    const apiForm = (slotName: ReadApiSlot) => {
        const c = slotValue(slotName);
        const set = (patch: Partial<CoReadApiConfig>) => setReadApiSlot(slotName, patch);
        return (
            <div className="rd-api-form">
                {apiPresets.length > 0 && (
                    <div className="rd-char-row">
                        {apiPresets.map((p) => {
                            const on = presetNameOf(c) === p.name;
                            return (
                                <button key={p.id} className={`rd-chip${on ? ' rd-chip-on' : ''}`}
                                    onClick={() => set({
                                        baseUrl: normalizeApiBaseUrl(p.config.baseUrl),
                                        apiKey: normalizeApiCredential(p.config.apiKey),
                                        model: normalizeApiModel(p.config.model),
                                    })}>
                                    {p.name}
                                </button>
                            );
                        })}
                    </div>
                )}
                <input className="rd-field" placeholder="baseUrl（带 /v1）" value={c.baseUrl}
                    onChange={(e) => set({ baseUrl: e.target.value })} />
                <input className="rd-field" placeholder="apiKey" value={c.apiKey}
                    onChange={(e) => set({ apiKey: e.target.value })} />
                <input className="rd-field" placeholder="model" value={c.model}
                    onChange={(e) => set({ model: e.target.value })} />
                <div className="rd-muted">
                    {slotName === 'summary'
                        ? '摘要这个槽只认它自己：没配就不跑，总结失败了在那条活动记录里补摘。'
                        : slotName === 'reply'
                            ? '留空就往下落（回复 → 共读 → 单独读书 → 主 API）。'
                            : '留空就往下落（共读 → 单独读书 → 主 API）。'}
                </div>
            </div>
        );
    };

    // 开读前摆给他的那三块（他眼下这几页 / 他上几次读过的还没接过话的 / 他参与过的讨论里的新话）
    // 已经抽成纯函数住在 utils/reader/readerFeed.ts —— 那份有单测盯着（她问过两轮「里面真的有我的批注吗」）

    // ── 归档 ──────────────────────────────────────────────────────
    const archiveCtx = useCallback(() => {
        const chars = (session?.charIds ?? picks).map(charOf).filter((c): c is CharacterProfile => !!c);
        if (chars.length === 0 || !userProfile) return null;
        return {
            book, chars, user: userProfile, chapterIdx, chapterParas, pageTo, nameOf,
            // 摘要只认摘要槽，没配就是 null（runArchive 会直接跳过）
            api: resolveReadApi('summary', null, readApiSlots(getCoReadStore()), apiConfig),
        };
    }, [book, chapterIdx, chapterParas, pageTo, nameOf, session?.charIds, picks, charOf, userProfile, apiConfig]);

    // ── 让他们读（多人 = 几次单独的调用，同挂一个 group）──
    /**
     * 第一次读书、还没笔色 → **第一次输出之前**跑一趟阅读风格分析（她 09-20）：
     * 偏好 + 气质两块一起出，笔色顺手写进他的设置，之后他的划线就是那支笔。
     * 跑不成（没配模型 / 报错）就当没有，别拦着读书。
     */
    const ensureStyle = async (char: CharacterProfile, api: ReaderCallRuntime) => {
        if (!userProfile || !needStyleAnalysis(char.id)) return;
        const job = beginJob({
            kind: 'read', charName: char.name, bookTitle: book.title,
            message: `先看看 ${char.name} 是个什么样的读者…`,
        });
        try {
            const got = await analyzeCharStyle({ char, user: userProfile, api, which: 'both' });
            endJob(job, 'ok', got.pref?.penColor
                ? `${char.name}给自己挑了一支笔（${got.pref.penColor}）`
                : `${char.name}的阅读风格记下来了`);
            onChanged();
        } catch (err) {
            endJob(job, 'error', `阅读风格没跑成：${err instanceof Error ? err.message : '未知错误'}`);
        }
    };

    const readNow = async () => {
        if (!session || !userProfile) return;
        const chars = session.charIds.map(charOf).filter((c): c is CharacterProfile => !!c);
        if (chars.length === 0) { notify('读不到角色设定'); return; }

        setBusy('read');
        const group = newRoamGroup();
        let done = 0;
        try {
            for (let i = 0; i < chars.length; i += 1) {
                const char = chars[i];
                const prefs = charPrefsOf(charPrefs, char.id);
                // 他这次读几页（她 09-21 从一个区间改成一个数）；窗口永远从你眼下这一页起
                const pages = clampPageCount(prefs.pages);
                const window = parasAhead(pages);
                const winFrom = window[0]?.paraIdx ?? pageFrom;
                const winTo = window[window.length - 1]?.paraIdx ?? pageTo;
                // 他读的是「第几页到第几页」（本章口径）——活动记录里要写出来，你一眼能看出读没读
                const readFromPage = pageNo;
                const readToPage = Math.min(pageCount, pageNo + pages - 1);
                const api = resolveReadApi('coread', char.id, readApiSlots(getCoReadStore()), apiConfig);
                if (!api) { notify(`${char.name}还没配模型（角色自己 / 共读 / 主 API 都空着）`); continue; }

                // 第一次读书、还没给自己选笔色 → **第一次输出之前**先跑一趟阅读风格分析（她 09-20）
                await ensureStyle(char, api);

                const job = beginJob({
                    kind: 'read', charName: char.name, bookTitle: book.title,
                    message: `${char.name}正在读这段…`,
                });
                try {
                    const chatLines = session.contextMode === 'immersive'
                        ? await recentChatLines(char, userProfile)
                        : '';
                    // 回复模式：面板上那个开关，或者他自己设置页里那个（她 09-21——
                    // 原来只有面板那个管用，角色设置页那个开关摆着不动，这儿接上）
                    const replyOn = session.replyMode || prefs.replyMode;
                    // 摆给他的三块：他眼下这几页 / 他上几次读过的还没接过话的 / 他参与过的讨论里的新话
                    const feed = replyOn
                        ? await gatherPageFeed({
                            charId: char.id, bookId: book.id, chapterIdx,
                            from: winFrom, to: winTo, nameOf,
                        })
                        : null;
                    const res = await readCoReadPage({
                        char, user: userProfile, book, chapterIdx, chapterTitle,
                        paras: window, session, chatLines, api,
                        noteLimit: prefs.noteLimit,
                        preset: prefs.promptPreset,
                        replyFeed: feed ?? undefined,
                    });
                    const written = await writeCoReadMarks({
                        bookId: book.id, charId: char.id, contentRev: book.contentRev,
                        chapterIdx, percent, paras: chapterParas, marks: res.marks,
                        // 划线只在他读过的这一段里找位置（她 09-21）：他抄的句子一定来自这几页，
                        // 拿它去整章里找第一个对得上的，短句子重复出现就会画到他没读的页上
                        searchFrom: winFrom, searchTo: winTo,
                    });
                    // 他划的线落在第几页（本章口径）——和「读了第几页到第几页」并排看，
                    // 一眼就分出是「只给了他几页」还是「给了他几页他只划了第一页」（她 09-21）
                    const perPage = Math.max(1, pageParas.length);
                    const annPages = [...new Set(written.map(
                        (a) => readFromPage + Math.floor((a.anchor.startPara - pageFrom) / perPage),
                    ))]
                        .filter((p) => p >= readFromPage && p <= readToPage)
                        .sort((x, y) => x - y);

                    // 读的时候顺手接的话（回复模式开着才有）：一句一个气泡，落进对应的讨论。
                    // `missed` = 他想接、但抄回来的那句话没对上原文（对不上就丢掉不落库）——
                    // 这个数也记下来，免得「他明明回了却什么都没看见」（她 09-21）
                    const rep = res.replies.length > 0
                        ? await writeCoReadReplies({
                            bookId: book.id, charId: char.id, chapterIdx, replies: res.replies,
                        }).catch(() => ({ written: 0, missed: res.replies.length }))
                        : { written: 0, missed: 0 };
                    await appendRoamActivity({
                        id: rdId('rr'), charId: char.id, bookId: book.id, kind: 'annotate',
                        group, seq: i,
                        chapterIdx,
                        fromPara: winFrom, toPara: winTo,
                        // 章内段号 + 每页几段 → 以后才还原得出「他当时读的那一页」是哪几段
                        perPage,
                        fromPage: readFromPage, toPage: readToPage,
                        pages,
                        annCount: written.length,
                        annPages: annPages.length > 0 ? annPages : undefined,
                        replyCount: rep.written || undefined,
                        replyMissed: rep.missed || undefined,
                        replies: rep.written > 0 ? res.replies.flatMap((r) => r.lines).slice(0, 8) : undefined,
                        // 摆给他的那份名单留个底（她 09-21 问「里面真的有我的批注吗」——
                        // 活动记录里当场翻得出来，不用猜）
                        feedNotes: feed ? feed.notes.length : undefined,
                        feedLater: feed && feed.later.length > 0 ? feed.later : undefined,
                        summary: `${char.name} 读了《${book.title}》第 ${chapterIdx + 1} 章`,
                        excerpt: res.excerpt || undefined,
                        feeling: res.feeling || undefined,
                        tokens: res.tokens || undefined,
                        tokensIn: res.tokensIn || undefined,
                        tokensOut: res.tokensOut || undefined,
                        mode: 'coread',
                        createdAt: new Date().toISOString(),
                    });

                    // 他往前走了：进度落在他自己那行（你的那行碰不到）
                    const prev = await getProgress(book.id, char.id);
                    await putProgress({
                        bookId: book.id, ownerId: char.id, chapterIdx,
                        paraIdx: winTo, charOffset: 0, percent,
                        readingSeconds: prev?.readingSeconds ?? 0,
                        sessionCount: prev?.sessionCount ?? 1,
                        updatedAt: new Date().toISOString(),
                    });

                    endJob(job, 'ok', written.length > 0
                        ? `${char.name}读完了，划了 ${written.length} 处`
                        : (res.marks.length > 0
                            ? `${char.name}划的句子没在这段里找到，没落上`
                            : `${char.name}读完了，没划`));
                    done += 1;
                } catch (err) {
                    endJob(job, 'error', `${char.name}读页失败：${err instanceof Error ? err.message : '未知错误'}`);
                }
            }

            if (done > 0) { onChanged(); await refreshSide(); }

            // 读完顺手看一眼水位线：攒够了就归档（不够就什么都不做，你也看不见胶囊）
            const ctx = archiveCtx();
            if (ctx) void runArchive(ctx, { force: false });
        } finally {
            setBusy(null);
        }
    };

    // ── 共读结束（=归档并退出）：补齐水位线以下 → 按规则进 chat → 清会话 ──
    const finish = async () => {
        const cur = getCoReadStore().session;
        if (!cur) return;
        setBusy('finish');
        try {
            const ctx = archiveCtx();
            if (ctx) await runArchive(ctx, { force: true }).catch(() => { /* 总结炸了也要让他退出来 */ });

            const after = getCoReadStore();
            const body = after.summaries.map((x) => x.text).filter(Boolean).join('\n\n');
            const names = cur.charIds.map((id) => nameOf(id)).join('、');
            // 手动归档：整段经历这时才送进聊天；自动归档一路都在同步，这儿不用再来一遍
            if (cur.rule.timing === 'manual') {
                for (const id of cur.charIds) {
                    await DB.saveMessage({
                        charId: id,
                        role: 'system',
                        type: 'text',
                        content: `[共读：${book.title}] ${names}和你一起读了这一段。${body || '（这次没有可总结的内容）'}`,
                        metadata: {
                            source: 'reader_coread',
                            coread: { bookId: book.id, title: book.title, charId: id, summary: body },
                        },
                    });
                }
            }

            // 收尾再落一张：【结束共读】+ **双方简要活动记录**（她文档：本次共读期间全部活动记录，
            // 无笔记正文；详细记录已经落库了，这版不重复落库）。两边的活动都在里头。
            const brief: string[] = [];
            for (const id of [...cur.charIds, 'user']) {
                const acts = (await listRoamActivities(id))
                    .filter((a) => a.bookId === book.id && a.createdAt >= cur.startedAt)
                    .sort((x, y) => x.createdAt.localeCompare(y.createdAt));
                const who = id === 'user' ? (userProfile?.name ?? '你') : nameOf(id);
                for (const a of acts) brief.push(briefLine(who, a));
            }
            for (const id of cur.charIds) {
                await DB.saveMessage({
                    charId: id,
                    role: 'system',
                    type: 'text',
                    content: `【结束共读】${names}和你把《${book.title}》这一段读完了。`,
                    metadata: {
                        source: 'reader_coread',
                        coread: { bookId: book.id, title: book.title, charId: id, closed: true, brief },
                    },
                });
            }
            endCoRead();
            onClose();
        } catch (err) {
            notify(`结束失败：${err instanceof Error ? err.message : '未知错误'}`);
        } finally { setBusy(null); }
    };

    // ── 确认设置里的那一个人（折叠行 + 展开的表）──
    const memberRow = (char: CharacterProfile) => {
        const p = charPrefsOf(charPrefs, char.id);
        const open = openMember === char.id;
        const presetName = p.promptPreset === 'rp' ? 'rp 套' : '默认套';
        const pagesLabel = `${p.pages} 页`;
        const apiLabel = p.api?.model
            ? presetNameOf({ baseUrl: p.api.baseUrl ?? '', apiKey: p.api.apiKey ?? '', model: p.api.model })
            : presetNameOf(slots.coread);
        return (
            <div className="rd-member" key={char.id}>
                <button className="rd-member-head" onClick={() => setOpenMember(open ? null : char.id)}>
                    <span className="rd-member-name">{char.name}</span>
                    <span className="rd-member-sum">{presetName} · {apiLabel} · 每次 {pagesLabel}</span>
                    <CaretDown size={14} className={`rd-fold-chev${open ? ' rd-fold-chev-on' : ''}`} />
                </button>
                {open && (
                    <div className="rd-member-body">
                        <div className="rd-row-label">提示词</div>
                        <div className="rd-btn-row">
                            {(['', 'rp'] as const).map((v) => (
                                <button key={v || 'def'} className={`rd-chip${p.promptPreset === v ? ' rd-chip-on' : ''}`}
                                    onClick={() => setCharReadPrefs(char.id, { promptPreset: v })}>
                                    {v === 'rp' ? 'rp 套' : '默认套'}
                                </button>
                            ))}
                        </div>
                        <div className="rd-muted">默认套写「你正在……」，不提角色扮演；rp 套是留给角色扮演写法的。</div>

                        <div className="rd-row-label">每次读几页</div>
                        <div className="rd-field-row">
                            <RdNumField value={p.pages} min={1} max={30} ariaLabel="每次读几页"
                                onCommit={(v) => setCharReadPrefs(char.id, { pages: v })} />
                            <span className="rd-muted">页（从你眼下这一页往后读；默认 1 页，最多 30）</span>
                        </div>

                        <div className="rd-row-label">每次笔记上限</div>
                        <div className="rd-field-row">
                            <RdNumField value={p.noteLimit} min={1} max={12} ariaLabel="每次笔记上限"
                                onCommit={(v) => setCharReadPrefs(char.id, { noteLimit: v })} />
                            <span className="rd-muted">条</span>
                        </div>

                        {/* 他自己的模型（她 09-20：一个以上角色必须能分人配）——走主预设池 */}
                        {/* 他自己的阅读风格（她 09-20）：笔色 / 气质 / 偏好，分开重取 */}
                        <div className="rd-row-label">阅读风格</div>
                        <button className="rd-btn rd-btn-soft rd-btn-block" onClick={() => setStyleChar(char.id)}>
                            看他的笔色、气质和偏好
                        </button>
                        <div className="rd-muted">
                            {charPrefsOf(charPrefs, char.id).penColor
                                ? `他做笔记用 ${charPrefsOf(charPrefs, char.id).penColor} 这支笔。`
                                : '还没选笔色——第一次读书前会先跑一趟阅读风格分析。'}
                        </div>

                        <div className="rd-row-label">他自己的模型</div>
                        <div className="rd-btn-row">
                            <button
                                className={`rd-chip${!p.api?.model ? ' rd-chip-on' : ''}`}
                                onClick={() => setCharReadPrefs(char.id, { api: undefined })}
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
                                        onClick={() => setCharReadPrefs(char.id, {
                                            api: {
                                                baseUrl: normalizeApiBaseUrl(preset.config.baseUrl),
                                                apiKey: normalizeApiCredential(preset.config.apiKey),
                                                model: normalizeApiModel(preset.config.model),
                                            },
                                        })}
                                    >
                                        {preset.name}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="rd-muted">
                            {p.api?.model
                                ? `他现在用：${p.api.model}（比大设置优先）`
                                : '没单独配——按共读 → 单独读书 → 主 API 往下落。'}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // ── 规则三选一 ──
    const ruleCard = (kind: 'auto' | 'manual' | 'custom', label: string, desc: string) => (
        <button
            className={`rd-rule${ruleKindOf(rule) === kind ? ' rd-rule-on' : ''}`}
            onClick={() => {
                if (kind === 'custom') setRule((r) => ({ ...r, metric: 'calls' }));
                else setRule({ ...DEFAULT_RULE, timing: kind });
            }}
        >
            <span className="rd-rule-name">{label}</span>
            <span className="rd-rule-desc">{desc}</span>
            {ruleKindOf(rule) === kind && <Check size={15} weight="bold" className="rd-rule-tick" />}
        </button>
    );

    const customBody = ruleKindOf(rule) === 'custom' && (
        <div className="rd-rule-body">
            <div className="rd-row-label">水线按什么推</div>
            <div className="rd-btn-row">
                {(['calls', 'msgs', 'notes', 'pages'] as CoReadArchiveMetric[]).map((m) => (
                    <button key={m} className={`rd-chip${rule.metric === m ? ' rd-chip-on' : ''}`}
                        onClick={() => setRule((r) => ({ ...r, metric: m }))}>
                        {RULE_METRIC_LABEL[m]}
                    </button>
                ))}
            </div>
            <div className="rd-field-row">
                <span className="rd-muted">满</span>
                <input className="rd-field rd-field-num" type="number" min={2} max={200} value={rule.threshold}
                    onChange={(e) => setRule((r) => ({ ...r, threshold: Math.max(2, Math.min(200, Number(e.target.value) || 2)) }))} />
                <span className="rd-muted">推一次水线</span>
            </div>
            <div className="rd-row-label">什么时候进他的聊天</div>
            <div className="rd-btn-row">
                {(['auto', 'manual'] as CoReadArchiveTiming[]).map((t) => (
                    <button key={t} className={`rd-chip${rule.timing === t ? ' rd-chip-on' : ''}`}
                        onClick={() => setRule((r) => ({ ...r, timing: t }))}>
                        {RULE_TIMING_LABEL[t]}
                    </button>
                ))}
            </div>
        </div>
    );

    // ── 共读中的设置（规则锁死，只读显示）──
    const runningSettings = (
        <>
            <div className="rd-fold-row">
                <div className="rd-row-label">他读哪套上下文</div>
                <div className="rd-btn-row">
                    <button className={`rd-chip${mode === 'immersive' ? ' rd-chip-on' : ''}`}
                        onClick={() => { setMode('immersive'); updateCoReadSession({ contextMode: 'immersive' }); }}>chat 同款</button>
                    <button className={`rd-chip${mode === 'focused' ? ' rd-chip-on' : ''}`}
                        onClick={() => { setMode('focused'); updateCoReadSession({ contextMode: 'focused' }); }}>核心人设</button>
                </div>
                <div className="rd-muted">
                    {mode === 'immersive'
                        ? 'chat 同款：完整人设 + 世界书 + 用户印象 + 日常记忆，最近几条聊天每轮现读。'
                        : '核心人设：只有核心人格 / 世界观 / 用户设定，不载世界书与用户印象——更专注在书上。'}
                </div>
            </div>

            <div className="rd-fold-row rd-switch-row">
                <div className="rd-row-label">回复模式</div>
                <button
                    className={`rd-switch${replyMode ? ' rd-switch-on' : ''}`}
                    aria-label="回复模式"
                    onClick={() => { const v = !replyMode; setReplyMode(v); updateCoReadSession({ replyMode: v }); }}
                >
                    <span className="rd-switch-knob" />
                </button>
                <div className="rd-muted">
                    {replyMode
                        ? '他自己看着办：他读的那几页上留着的批注都摆给他（当风景看也行、想接哪句就接），你在他参与过的批注下说的话也喂给他；回不回、要不要往下读由他决定。'
                        : '关着就得你点 ⚡ 他才回那条讨论。'}
                </div>
            </div>

            <div className="rd-fold-row">
                <div className="rd-row-label">规则（开读时定下，中途不改）</div>
                <div className="rd-muted">{ruleHint(rule)}</div>
            </div>

            <div className="rd-fold-row">
                <div className="rd-row-label">模型（各管各的）</div>
                <div className="rd-btn-row">
                    <button className="rd-btn rd-btn-soft" onClick={() => setApiOpen(apiOpen === 'coread' ? null : 'coread')}>
                        读书 · {presetNameOf(slots.coread)}
                    </button>
                    <button className="rd-btn rd-btn-soft" onClick={() => setApiOpen(apiOpen === 'reply' ? null : 'reply')}>
                        手动回复 · {presetNameOf(slots.reply)}
                    </button>
                    <button className="rd-btn rd-btn-soft" onClick={() => setApiOpen(apiOpen === 'summary' ? null : 'summary')}>
                        摘要 · {slots.summary.model ? presetNameOf(slots.summary) : '没配（不跑）'}
                    </button>
                </div>
                <div className="rd-muted">没单独配的那档，会顺着往下落（回复 → 读书 → 单独读书 → 主 API）。</div>
            </div>
            {apiOpen && apiForm(apiOpen)}

            {/* 每人的设置（她 09-20：一个以上角色要能分人配；中途加进来的人也在这一列） */}
            <div className="rd-fold-row">
                <div className="rd-row-label">每人的设置</div>
                <div>
                    {session?.charIds.map((id) => {
                        const c = charOf(id);
                        return c ? memberRow(c) : null;
                    })}
                </div>
                <div className="rd-muted">
                    点名字展开：他读哪套提示词、用哪个模型、每次读几页、一次最多留几条笔记。中途加进来的人也在这一列。
                </div>
            </div>

            {/* 中途加人 */}
            {(() => {
                const addable = readingChars.filter((c) => !session?.charIds.includes(c.id));
                if (addable.length === 0) return null;
                return (
                    <div className="rd-fold-row">
                        <div className="rd-row-label">再叫一个人来</div>
                        <div className="rd-char-row">
                            {addable.map((c) => (
                                <button key={c.id} className="rd-chip"
                                    onClick={() => void addPerson(c.id)}>
                                    <Plus size={13} /> {c.name}
                                </button>
                            ))}
                        </div>
                        <div className="rd-muted">加进来的人立刻多一行配置，两边的聊天框里都会收到通知。</div>
                    </div>
                );
            })()}
        </>
    );

    return (
        <div className="rd-sheet-mask" onClick={onClose}>
            <div className="rd-sheet rd-sheet-coread" onClick={(e) => e.stopPropagation()}>
                <div className="rd-sheet-grip" />
                <div className="rd-coread-head">
                    <div className="rd-coread-title"><UsersThree size={18} weight="fill" />一起读书</div>
                    <div className="rd-coread-book">{book.title} · {chapterTitle}</div>
                </div>

                {/* ── 没在共读：三步向导 ── */}
                {!session && step === 1 && (
                    <>
                        <div className="rd-step-title">要邀请谁一起读书</div>
                        {readingChars.length === 0 ? (
                            <div className="rd-empty">
                                <UsersThree size={40} weight="thin" />
                                <div className="rd-empty-text">还没有角色开着读书开关</div>
                                <div className="rd-muted">去「书库」或设置的「使用书库的朋友」里给他打开。</div>
                            </div>
                        ) : (
                            <div className="rd-list">
                                {readingChars.map((c) => {
                                    const on = picks.includes(c.id);
                                    return (
                                        <button key={c.id} className={`rd-item rd-item-tap${on ? ' rd-item-on' : ''}`}
                                            onClick={() => setPicks((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}>
                                            <span className="rd-item-label">{c.name}</span>
                                            <span className={`rd-item-tick${on ? ' rd-item-tick-on' : ''}`}>
                                                {on ? <Check size={15} weight="bold" /> : <Circle size={15} />}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        <div className="rd-actions">
                            <button className="rd-btn rd-btn-primary rd-btn-block" disabled={picks.length === 0}
                                onClick={() => setStep(2)}>
                                一起读书吧
                            </button>
                        </div>
                    </>
                )}

                {!session && step === 2 && (
                    <>
                        <button className="rd-btn rd-coread-back" onClick={() => setStep(1)}>‹ 上一步</button>
                        <div className="rd-step-title">摘要规则</div>
                        <div className="rd-rules">
                            {ruleCard('auto', '自动归档', '一满就总结，并立刻同步进他的聊天')}
                            {ruleCard('manual', '手动归档', '照样总结，先不打扰聊天；共读结束才整段送进去')}
                            {ruleCard('custom', '自定义', '自己定水线按什么推、什么时候进聊天')}
                        </div>
                        {customBody}
                        <div className="rd-actions">
                            <button className="rd-btn rd-btn-primary rd-btn-block" onClick={() => setStep(3)}>下一步</button>
                        </div>
                    </>
                )}

                {!session && step === 3 && (
                    <>
                        <button className="rd-btn rd-coread-back" onClick={() => setStep(2)}>‹ 上一步</button>
                        <div className="rd-step-title">确认设置</div>
                        <div className="rd-muted" style={{ marginBottom: 'var(--rd-space-3)' }}>
                            这些会存进他们各自的设置，下次一起读默认就用它——除非你在这儿改了。
                        </div>
                        <div className="rd-list">{picks.map(charOf).filter((c): c is CharacterProfile => !!c).map(memberRow)}</div>

                        <div className="rd-fold-row rd-switch-row">
                            <div className="rd-row-label">回复模式</div>
                            <button className={`rd-switch${replyMode ? ' rd-switch-on' : ''}`} aria-label="回复模式"
                                onClick={() => setReplyMode((v) => !v)}>
                                <span className="rd-switch-knob" />
                            </button>
                            <div className="rd-muted">
                                开着就不必你点 ⚡：他读到的、你在书上说的都会喂给他，回不回、往下读不读由他决定。
                            </div>
                        </div>

                        <div className="rd-actions">
                            <button className="rd-btn rd-btn-primary rd-btn-block" onClick={() => {
                                if (picks.length === 0) { notify('先挑一个人'); return; }
                                startCoRead({
                                    bookId: book.id, charIds: picks, contextMode: mode, rule, replyMode,
                                });
                                // 开读的这一下要在聊天里留个印子（她文档：聊天界面发一张邀请卡）
                                const who = userProfile?.name ?? '你';
                                const names = picks.map((id) => nameOf(id)).join('、');
                                for (const id of picks) {
                                    void DB.saveMessage({
                                        charId: id,
                                        role: 'system',
                                        type: 'text',
                                        content: `【${who} 邀请 ${names} 一起读《${book.title}》】`,
                                        metadata: {
                                            source: 'reader_coread',
                                            coread: { bookId: book.id, title: book.title, charId: id, opened: true },
                                        },
                                    }).catch(() => { /* 聊天那条发不出去也别拦着开读 */ });
                                }
                                notify(`和 ${names} 开始读了`);
                            }}>
                                开始共读
                            </button>
                        </div>
                    </>
                )}

                {/* ── 共读中：信息页 + 设置 ── */}
                {session && (
                    <>
                        <div className="rd-list">
                            {session.charIds.map((id) => {
                                const at = charPara[id];
                                const prod = produced[id];
                                return (
                                    <div className="rd-status" key={id}>
                                        <div className="rd-status-name">{nameOf(id)}</div>
                                        <div className="rd-status-line">
                                            {at === null || at === undefined ? '还没读到这一章' : `读到第 ${at + 1} 段附近`}
                                        </div>
                                        <div className="rd-status-line rd-muted">
                                            这次留下了 {prod?.ann ?? 0} 条批注 · 回了 {prod?.reply ?? 0} 条讨论
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* 表面上只报进度，规则的全文在下面的「共读设置」里 */}
                        {/* 「已归档 N 条」只对讨论句数有意义——别的口径是按时间窗推的 */}
                        <div className="rd-muted" style={{ marginBottom: 'var(--rd-space-4)' }}>
                            {session.rule.metric === 'msgs'
                                ? `水线：已归档 ${session.summarizedMsgs} 条 · 满 ${session.rule.threshold} 条讨论总结一次`
                                : `水线：满 ${session.rule.threshold} ${RULE_METRIC_UNIT[session.rule.metric]}总结一次`}
                        </div>

                        {recent.length > 0 && (
                            <div className="rd-coread-recent">
                                <div className="rd-row-label">最近读到的</div>
                                {/* 时间线（她 09-20：加时间线、配时间戳；09-21：她的划线和接话也在上面） */}
                                <div className="rd-tl">
                                    {recent.map((it) => (it.kind === 'mine' ? (
                                        <div className="rd-tl-item" key={`m${it.at}${it.text.slice(0, 8)}`}>
                                            <span className="rd-tl-dot" style={{ background: highlightColorOf(prefs, 'user') }} />
                                            <div className="rd-tl-body">
                                                <div className="rd-tl-head">
                                                    <span className="rd-tl-who">{nameOf('user')}</span>
                                                    <span className="rd-tl-time">{fmtClock(it.at)}</span>
                                                </div>
                                                <div className="rd-tl-text">{it.what}{it.text ? `：${it.text}` : ''}</div>
                                                {it.quote && <div className="rd-tl-ex">“{it.quote}”</div>}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="rd-tl-item" key={it.a.id}>
                                            <span
                                                className="rd-tl-dot"
                                                style={{ background: highlightColorOf(prefs, it.a.charId) }}
                                            />
                                            <div className="rd-tl-body">
                                                <div className="rd-tl-head">
                                                    <span className="rd-tl-who">{nameOf(it.a.charId)}</span>
                                                    <span className="rd-tl-time">{fmtClock(it.a.createdAt)}</span>
                                                </div>
                                                <div className="rd-tl-text">{it.a.summary}</div>
                                                {it.a.excerpt && <div className="rd-tl-ex">{it.a.excerpt}</div>}
                                                {it.a.replies?.map((line, i) => (
                                                    <div className="rd-tl-reply" key={i}>{line}</div>
                                                ))}
                                                {it.a.feeling && <div className="rd-coread-feel">{it.a.feeling}</div>}
                                                <div className="rd-tl-meta">
                                                    {it.a.kind === 'summary'
                                                        ? '总结'
                                                        : [
                                                            it.a.annCount ? `批注 ${it.a.annCount}` : '',
                                                            it.a.replyCount ? `回复 ${it.a.replyCount}` : '',
                                                            it.a.pages ? `${it.a.pages} 页` : '',
                                                        ].filter(Boolean).join(' · ') || '读了一段'}
                                                    {(it.a.tokensIn || it.a.tokensOut || it.a.tokens)
                                                        ? ` · ${fmtTok(it.a.tokens)} token（读进去 ${fmtTok(it.a.tokensIn)} / 吐出来 ${fmtTok(it.a.tokensOut)}）`
                                                        : ''}
                                                </div>
                                            </div>
                                        </div>
                                    )))}
                                </div>
                            </div>
                        )}

                        <div className={`rd-fold${fold ? ' rd-fold-open' : ''}`}>
                            <button className="rd-fold-head" onClick={() => setFold((v) => !v)}>
                                <span className="rd-fold-label">共读设置</span>
                                <span className="rd-fold-value">
                                    {mode === 'immersive' ? 'chat 同款' : '核心人设'} · {replyMode ? '回复模式开' : '回复模式关'}
                                </span>
                                <CaretDown size={15} className={`rd-fold-chev${fold ? ' rd-fold-chev-on' : ''}`} />
                            </button>
                            {fold && <div className="rd-fold-body">{runningSettings}</div>}
                        </div>

                        <div className="rd-actions">
                            <button className="rd-btn rd-btn-primary rd-btn-block" onClick={() => void readNow()} disabled={busy !== null}>
                                {busy === 'read' ? '他正在读…' : '让他读'}
                            </button>
                            <button className="rd-btn rd-btn-block" onClick={() => void finish()} disabled={busy !== null}>
                                {busy === 'finish' ? '总结中…' : '共读结束'}
                            </button>
                            <div className="rd-muted">
                                退出去只是存进度，会话还在；「共读结束」会把没到水线的部分补齐、按规则进聊天。
                            </div>
                        </div>
                    </>
                )}
            </div>

            {styleChar && (
                <ReaderCharStyleSheet
                    charId={styleChar}
                    name={nameOf(styleChar)}
                    onClose={() => setStyleChar(null)}
                    notify={notify}
                />
            )}
        </div>
    );
}

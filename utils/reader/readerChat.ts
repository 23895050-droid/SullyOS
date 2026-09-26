// 读书模块 · 共读的 AI 管线（2026-09-15）
//
// 两件事：**读一页**（角色读当前这页 → 划线 + 批注 + 内心活动）和**总结一段**
// （把没总结的部分压成一段备忘，共读结束时汇总成一条 system 消息进 chat）。
//
// 上下文照「协同工作」的两个模式（features/collaboration/context.ts 的 snapshot 分支）：
//   immersive = chat 同款 → ContextBuilder.buildCoreContext（人设/关系/世界观/世界书/用户印象/日常记忆）
//   focused   = 核心人设   → buildRoleSettingsContext(skipMemories) + 备注 + 用户设定，不载世界书与用户印象
// 区别只在快照；两者都**不写回**日常聊天（只有共读结束的摘要例外，那是她拍板的）。
//
// 写入口校验（抄 tasogare 的教训）：角色抄回来的句子**必须真的在这一页里**，
// 找不到就丢掉那一条——宁可少一条批注，也不要一条没有锚点的假批注。

import type { CharacterProfile, Message, UserProfile } from '../../types';
import { ContextBuilder } from '../context';
import { DB } from '../db';
import { getPrompt } from '../promptRegistry';
import { promptForPreset } from '../../apps/reader/readerPromptPresets';
import { extractJson, safeResponseJson } from '../safeApi';
import { normalizeMessageContent } from '../messageFormat';
import {
    appendThreadMessage, listAnnotations, listThreads, putAnnotation, putThread, rdId, threadRowId,
    type RdAnchor, type RdAnnotation, type RdBook, type RdThread, type RdVisibility,
} from './readerDb';
import { threadKeyOf } from './readerParticipants';
import { vibeInjection } from '../../apps/reader/readerCharStyle';
import type { CoReadApiConfig, CoReadContextMode, CoReadPos } from '../../apps/reader/coreadStore';
import { getCharReadPrefs } from '../../apps/reader/readerCharPrefs';

export interface ReaderCallRuntime {
    /** 已带 /v1 后缀 */
    baseUrl: string;
    apiKey: string;
    model: string;
}

const asRuntime = (c?: Partial<CoReadApiConfig> | null): ReaderCallRuntime | null =>
    c && c.apiKey && c.baseUrl && c.model ? { baseUrl: c.baseUrl, apiKey: c.apiKey, model: c.model } : null;

export interface ReadApiSlots {
    /** 共读·读一页的默认槽 */
    coread?: Partial<CoReadApiConfig>;
    /** 手动回复（⚡ 回一条讨论）单独一档（她 09-20 点名要的） */
    reply?: Partial<CoReadApiConfig>;
    /** 单独读书（他自己读）的默认槽 */
    solo?: Partial<CoReadApiConfig>;
    /** 摘要槽 */
    summary?: Partial<CoReadApiConfig>;
}

/**
 * 读书模块的 api 链（她 09-20 钉死，四档：
 * 共读读一页 / 手动回复 / 单独读书 / 摘要）：
 *   · **角色自己的 api 最先**——比大设置页的统一配置优先（角色个人页能单独配）
 *   · 共读读一页 = 角色 → 共读槽 → 单独读书槽 → 主 api
 *   · 手动回复   = 角色 → 回复槽 → 共读槽 → 单独读书槽 → 主 api
 *   · 单独读     = 角色 → 单独读书槽 → 主 api
 *   · 摘要       = **只认摘要槽，没配就不跑**（她原话：摘要 api 没配置不回退）；
 *                  失败了可以在那条活动记录的详细页里补摘
 */
export function resolveReadApi(
    use: 'coread' | 'reply' | 'solo' | 'summary',
    charId: string | null | undefined,
    slots: ReadApiSlots,
    mainApi?: Partial<CoReadApiConfig>,
): ReaderCallRuntime | null {
    if (use === 'summary') return asRuntime(slots.summary);
    const own = charId ? getCharReadPrefs(charId).api : null;
    if (asRuntime(own)) return asRuntime(own);
    const fallback = () => asRuntime(slots.solo) ?? asRuntime(mainApi);
    if (use === 'coread') return asRuntime(slots.coread) ?? fallback();
    if (use === 'reply') return asRuntime(slots.reply) ?? asRuntime(slots.coread) ?? fallback();
    return fallback();
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

/**
 * 讨论回复的**分气泡**解析（她 09-20：回复思路类似 chat，分气泡的日常聊天感）。
 * 新的提示词要数组；模型偶尔给一整段字符串——按换行拆开兜底，一条一句。
 */
export function toBubbles(v: unknown): string[] {
    if (Array.isArray(v)) {
        const out = v.map((x) => str(x).trim()).filter(Boolean);
        if (out.length > 0) return out;
    }
    const one = str(v).trim();
    if (!one) return [];
    return one.split(/\n+/).map((s) => s.trim()).filter(Boolean);
}

/** 一次调用的回执：正文 + 这次花掉的 token。
 *  她 09-16 要活动记录看得出「读进去多少 / 吐出来多少」，所以三个数都留：
 *  tokensIn = 提示词，tokensOut = 回复，tokens = 合计（书库页的排行用它）。 */
export interface ReaderChatReply {
    text: string;
    tokens: number;
    tokensIn: number;
    tokensOut: number;
}

export const postReaderChat = async (api: ReaderCallRuntime, body: Record<string, unknown>): Promise<ReaderChatReply> => {
    const res = await fetch(`${api.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.apiKey}` },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await safeResponseJson(res);
    const usage = data?.usage as { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined;
    const tokensIn = Number(usage?.prompt_tokens ?? 0) || 0;
    const tokensOut = Number(usage?.completion_tokens ?? 0) || 0;
    return {
        text: str(data?.choices?.[0]?.message?.content),
        tokens: Number(usage?.total_tokens ?? 0) || tokensIn + tokensOut || 0,
        tokensIn,
        tokensOut,
    };
};

// ─── 原文定位（写入口校验）────────────────────────────────────────

/** 去掉所有空白后的文本 + 「压缩位 → 原串位」的映射（跨行引文也能找回原位）。 */
function squashWithMap(s: string): { text: string; map: number[] } {
    let text = '';
    const map: number[] = [];
    for (let i = 0; i < s.length; i++) {
        if (/\s/.test(s[i])) continue;
        text += s[i];
        map.push(i);
    }
    return { text, map };
}

const QUOTE_MAX = 200;

/**
 * 角色抄回来的原文 → 锚点（章内段号口径，与阅读页的 data-para-idx 一致）。
 * 先逐段原样找；找不到再退到「忽略空白」的找法。找不到返回 null——调用方丢掉这一条。
 */
export function locateQuote(
    paras: string[],
    quote: string,
    chapterIdx: number,
    /**
     * 只在这一段段号里找。**共读写字的时候一定要给**（她 09-21）：他抄的句子
     * 一定来自他读过的那几页，拿它去整章里找第一个对得上的，短句子要是在前面
     * 也出现过，线就画到他根本没读的页上去了。
     */
    range?: { from?: number; to?: number },
): RdAnchor | null {
    const q = quote.trim().slice(0, QUOTE_MAX);
    if (!q) return null;
    const qSquashed = squashWithMap(q).text;
    if (!qSquashed) return null;

    const lo = Math.max(0, range?.from ?? 0);
    const hi = Math.min(paras.length - 1, range?.to ?? paras.length - 1);
    for (let i = lo; i <= hi; i++) {
        const para = paras[i];
        if (!para) continue;

        let start = para.indexOf(q);
        let end = start >= 0 ? start + q.length : -1;

        if (start < 0) {
            const { text, map } = squashWithMap(para);
            const at = text.indexOf(qSquashed);
            if (at >= 0) {
                start = map[at];
                end = map[at + qSquashed.length - 1] + 1;
            }
        }
        if (start < 0 || end <= start) continue;

        const text = para.slice(start, end).replace(/\s+/g, ' ').trim();
        if (!text) continue;
        return {
            startPara: i,
            startOffset: start,
            endPara: i,
            endOffset: end,
            text: text.slice(0, QUOTE_MAX),
            quoteBefore: para.slice(Math.max(0, start - 24), start) || undefined,
            quoteAfter: para.slice(end, end + 24) || undefined,
        };
    }
    return null;
}

// ─── 上下文（两种模式）────────────────────────────────────────────

const VISIBILITY_RULE =
    '每条批注自己选可见性：public = 谁都能看到（默认）；angel = 只有 Angelica 能看到；self = 只有你自己能看到（不进阅读页，只留给你自己）。';

/** 共读协议头：说明这是什么窗口、只读哪一页、不许编造。 */
const coReadProtocol = (book: RdBook, chapterTitle: string, charName: string, userName: string): string =>
    `### 一起读书规则
你不是在聊天，你是在和 ${userName} 并排读同一本书《${book.title}》。当前章节「${chapterTitle}」。
你说的话会以「批注」和「讨论」的形式落在书页上，${userName} 会看到。

- 你看到的就是这几页的正文，你说的每一句都从这几页里来。
- 划线从这几页正文里原样抄句子（连标点一起），一个字都不要改。
- 批注是你**对这段文字的理解**，不是读后感、也不是对 ${userName} 说的客套话。
- 内心活动（feeling）是你私人的感受，写给自己的，${userName} 只在你的状态里看得到。
- ${VISIBILITY_RULE}`;

/** 快照：immersive = chat 同款；focused = 核心人设（照协同工作的两个 snapshot 分支）。 */
export function buildCoReadSnapshot(
    char: CharacterProfile,
    user: UserProfile,
    mode: CoReadContextMode,
    /** 最近几条聊天原文：世界书按关键词扫它（和聊天同一个口径） */
    scanMsgs?: Message[],
): string {
    if (mode === 'focused') {
        return [
            ContextBuilder.buildRoleSettingsContext(char, { skipMemories: true }),
            char.description?.trim() ? `### ${user.name} 对你的备注/称呼\n${char.description.trim()}\n\n` : '',
            `### 互动对象\n- 名字: ${user.name}\n- 设定/备注: ${user.bio || '无'}\n\n`,
            '### 当前模式\n本次共读用「核心人设」：保留完整核心人格、世界观和用户设定，不载入世界书与用户印象。\n\n',
        ].join('');
    }
    return [
        // 稳定段，**和聊天一样的开头**（她 09-26：照原版结构——稳定的在最前、实时的贴生成点）。
        // deferVolatile = 时间 / 记忆宫殿召回 / 情绪 buff 这三块不进正文，由 buildReaderLiveState
        // 拼成「实时状态」贴到消息末尾（原版 buildVolatileCoreState 同款）。
        ContextBuilder.buildCoreContext(
            char, user, true, undefined, undefined,
            scanMsgs ? { worldbookMessages: scanMsgs } : undefined,
            { deferVolatile: true },
        ),
        '### 当前模式\n本次共读用「chat 同款」：完整保留角色、关系、世界观、世界书、用户印象和日常记忆；此刻的时间、日程这些实时的东西贴在后面。\n\n',
    ].join('');
}

/** 最近几条聊天原文（原始消息：世界书按关键词扫的是同一批）。 */
export async function recentChatMessages(char: CharacterProfile, limit = 20): Promise<Message[]> {
    try {
        const msgs = await DB.getMessagesByCharId(char.id);
        return msgs.slice(-Math.max(1, limit));
    } catch {
        return [];
    }
}

/** 把聊天消息念成一行一行（系统卡念成 [系统]，不挂角色名下——她 09-26）。 */
export function formatChatLines(msgs: Message[], char: CharacterProfile, user: UserProfile): string {
    return msgs
        .map((m) => {
            const who = m.role === 'user' ? user.name : m.role === 'system' ? '[系统]' : char.name;
            return `[${new Date(m.timestamp).toLocaleTimeString()}] ${who}: ${normalizeMessageContent(m, char.name, user.name)}`;
        })
        .join('\n');
}

/** 最近几条聊天原文（immersive 才给；协同的 chatContextLimit 默认 20）。 */
export async function recentChatLines(char: CharacterProfile, user: UserProfile, limit = 20): Promise<string> {
    return formatChatLines(await recentChatMessages(char, limit), char, user);
}

// ─── 读一页 ──────────────────────────────────────────────────────

export interface CoReadMark {
    quote: string;
    note: string;
    visibility: RdVisibility;
}

/** 读的时候顺手回的话：锚在他要回的那句话上（她 09-20：回复像聊天那样分气泡） */
export interface CoReadReply {
    /** 他要回的那句话（从「还没回过的话」里原样抄回来） */
    quote: string;
    /** 分气泡：一句一条 */
    lines: string[];
}

const cleanReplies = (raw: unknown): CoReadReply[] => {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
        .map((r) => ({ quote: str(r.quote).trim(), lines: toBubbles(r.lines ?? r.bubbles ?? r.reply) }))
        .filter((r) => !!r.quote && r.lines.length > 0)
        .slice(0, 8);
};

export interface CoReadPageRead {
    marks: CoReadMark[];
    /** 读的时候顺手接的话（回给别人的批注） */
    replies: CoReadReply[];
    /** 内心活动（私人感受，只在状态里露脸） */
    feeling: string;
    /** 少字数概述这段大概讲了什么事（原文内容概述，进活动记录） */
    excerpt: string;
    /** 表面那句「做了什么」（模型给的一句；没给就调用方自己拼） */
    summary: string;
    /** 这次调用花掉的 token（合计 / 读进去 / 吐出来） */
    tokens: number;
    tokensIn: number;
    tokensOut: number;
    raw: string;
}

const cleanVisibility = (v: unknown): RdVisibility =>
    (['public', 'angel', 'self'] as const).includes(v as never) ? (v as RdVisibility) : 'public';

const cleanMarks = (raw: unknown, limit = 6): CoReadMark[] => {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
        .map((m) => ({
            quote: str(m.quote).trim(),
            note: str(m.note).trim(),
            visibility: cleanVisibility(m.visibility),
        }))
        .filter((m) => m.quote.length >= 2)
        .slice(0, Math.max(1, limit));
};

/**
 * 取这套提示词并展开名字。preset 空 = 默认套（「你正在……」写法），'rp' = 角色扮演套，
 * 其余 = 设置页里她自己新建的套（正文住 readerPromptPresets，没写这条就回落默认套）。
 */
const expand = (label: string, char: CharacterProfile, user: UserProfile, book: RdBook, preset = ''): string =>
    promptForPreset(preset, label)
        .replace(/\{\{char\}\}/g, char.name)
        .replace(/\{\{user\}\}/g, user.name)
        .replace(/\{\{book\}\}/g, book.title);

export interface ReadPageInput {
    char: CharacterProfile;
    user: UserProfile;
    book: RdBook;
    chapterIdx: number;
    chapterTitle: string;
    /** 这一页压着的段落（章内段号 + 正文） */
    paras: Array<{ paraIdx: number; text: string }>;
    session: { contextMode: CoReadContextMode };
    chatLines: string;
    /** 这一次最多留几条批注（角色自己的设置；不给就用默认） */
    noteLimit?: number;
    /**
     * 回复模式（她 09-21 定稿）：
     *   · `notes`  = **他读的那几页上所有的批注**（当风景看也行，感兴趣的自己接）
     *   · `later`  = 他最近几次读过的那几页上，还留着他没接过话的（她加完批注他往后走了，
     *                那些话他的窗口再也扫不到——她希望他能回「以她的话收尾」的讨论）
     *   · `followUps` = 他参与过的讨论里，他说完之后别人接着说的话
     * 开着就不必她点 ⚡——他自己决定回不回、要不要往下读。
     */
    replyFeed?: { notes: string[]; later: string[]; followUps: string[] };
    /** 历史阅读摘要：他之前读过的地方记下来的（十条摘要，时间从早到晚） */
    summaries?: string[];
    /** 最近 15 条讨论记录（时间序，已经念成一行一行） */
    discussion?: string[];
    /** 实时状态段（时间 / 宫殿召回 / 情绪 / 日程）——非核心模式才有，贴消息末尾 */
    liveState?: string;
    /** 两个人各自读到哪（文档第 1 块：主聊天背景与阅读状态） */
    readState?: string;
    /** 最近几条聊天原文：世界书按关键词扫它 */
    scanMsgs?: Message[];
    /** 用哪套提示词（'' = 默认套；'rp' = 角色扮演套）。来自角色自己的读书设置 */
    preset?: string;
    api: ReaderCallRuntime;
}

/** 角色读当前这一页（共读的手动动作「让他读这一页」）。 */
export async function readCoReadPage(input: ReadPageInput): Promise<CoReadPageRead> {
    const { char, user, book, chapterIdx, chapterTitle, paras, session, chatLines, replyFeed, api } = input;
    const pageText = paras
        .map((p) => `[${p.paraIdx}] ${p.text}`)
        .join('\n');

    // 阅读气质（她 09-20）：读书时带的是**气质**，不是偏好；只当基调参考，别当设定
    const vibe = vibeInjection(char.id);
    const instruction = expand('共读·读书', char, user, book, input.preset ?? '');
    // ── 稳定段（system）= 角色本体 + 情境说明 + 共读提示词 + 一起读书规则 + 气质 ──
    // 顺序是她 09-26 定的；前面四块每轮都一样 → 稳定段整段能吃到前缀缓存。
    const snapshot = [
        buildCoReadSnapshot(char, user, session.contextMode, input.scanMsgs),
        `### 你现在在做什么\n${expand('共读·情境说明', char, user, book, input.preset ?? '')}\n\n`,
        instruction,
        `\n${coReadProtocol(book, chapterTitle, char.name, user.name)}`,
        vibe ? `\n### 你的阅读气质（只是气质基调参考，不是要求，也不要把它写进批注）\n${vibe}\n\n` : '',
    ].join('');

    // ── 材料（user）= 在读什么 · 双方进度 · 聊天 N 条 · 十条摘要 · 15 条讨论 · 当前原文 · 已有批注 ──
    // 顺序她 09-26 定；越靠后越新鲜，眼前这几页压在最下面。
    const material = [
        `《${book.title}》· ${chapterTitle}`,
        input.readState ? `\n${input.readState}` : '',
        session.contextMode === 'immersive' && chatLines ? `\n你们最近在聊天里说的话：\n${chatLines}` : '',
        input.summaries && input.summaries.length > 0
            ? `\n你之前读过的部分，当时记下来的（时间从早到晚）：\n${input.summaries.join('\n')}` : '',
        input.discussion && input.discussion.length > 0
            ? `\n书房里最近的讨论（按发生的先后）：\n${input.discussion.join('\n')}` : '',
        `\n你正在读的这几页（段号是它在章节里的位置）：\n\n${pageText}`,
        // 他读的这几页上原本就有的批注（她 09-21：读哪页就看到哪页，当风景看也行）
        replyFeed && replyFeed.notes.length > 0
            ? `\n这几页上已经留着的批注（当风景看也行，想接哪句就接）：\n${replyFeed.notes.join('\n')}` : '',
    ].filter(Boolean).join('\n');

    // ── 收尾（system）= 实时状态 · 要他接的话 · 格式要求（贴着生成点，原版同款）──
    const tail = [
        input.liveState
            ? `[System: 实时状态 (Live Context)]\n（以下是此刻的实时状态；你的人设与读书的规矩见最上方的系统设定，此处不再重复。）\n\n${input.liveState}`
            : '',
        replyFeed && replyFeed.later.length > 0
            ? `你上次读完之后，你读过的那些页上又有新的话（先说这几条）：\n${replyFeed.later.join('\n')}` : '',
        replyFeed && replyFeed.followUps.length > 0
            ? `书房里别处新出现的（你还没读到的页上）：\n${replyFeed.followUps.join('\n')}` : '',
        replyFeed && (replyFeed.notes.length > 0 || replyFeed.later.length > 0 || replyFeed.followUps.length > 0)
            ? '接话写进 replies：quote 照抄「”…”」里那句话，lines 里一句一条，像聊天那样连着说。'
            : '',
        input.noteLimit ? `这次最多划 ${input.noteLimit} 条。` : '',
        `你读到的是第 ${chapterIdx + 1} 章的这几页，读完按格式回复。`,
    ].filter(Boolean).join('\n');

    const reply = await postReaderChat(api, {
        model: api.model,
        messages: [
            { role: 'system', content: snapshot },
            { role: 'user', content: material },
            { role: 'system', content: tail },
        ],
        temperature: 0.85,
        max_tokens: 4000,
    });

    const parsed = extractJson(reply.text);
    if (!parsed) {
        return {
            marks: [], replies: [], feeling: '', excerpt: '', summary: '',
            tokens: reply.tokens, tokensIn: reply.tokensIn, tokensOut: reply.tokensOut, raw: reply.text,
        };
    }
    return {
        marks: cleanMarks(parsed.marks, input.noteLimit ?? 6),
        replies: cleanReplies(parsed.replies),
        feeling: str(parsed.feeling).trim(),
        // 老提示词里这个字段叫 summary（少字数概述这段讲了什么），新提示词叫 excerpt——
        // 两个都认，谁先有就用谁，回头不用清老数据。
        excerpt: (str(parsed.excerpt) || str(parsed.summary)).trim(),
        summary: str(parsed.summary).trim(),
        tokens: reply.tokens,
        tokensIn: reply.tokensIn,
        tokensOut: reply.tokensOut,
        raw: reply.text,
    };
}

/**
 * 把「读的时候顺手接的话」落进对应的讨论（一句一个气泡，她 09-20）。
 * 锚点按句子找：模型抄回来的 quote 必须对得上**某条真实的批注**，对不上就丢掉那一条
 * ——和写入口一个道理：宁可少一句，也不要一句没有锚点的假回复。
 */
export async function writeCoReadReplies(opts: {
    bookId: string;
    charId: string;
    chapterIdx: number;
    replies: CoReadReply[];
}): Promise<{ written: number; missed: number }> {
    const { bookId, charId, chapterIdx, replies } = opts;
    if (replies.length === 0) return { written: 0, missed: 0 };
    const [anns, threads] = await Promise.all([listAnnotations(bookId), listThreads(bookId)]);
    const norm = (s: string) => s.replace(/\s+/g, '');
    /**
     * 他抄回来的那行可能带着「[谁] 」的前缀或「→ 批注」的尾巴（他看到的名单就是那个样子），
     * 先把壳剥掉再比——不然他明明回了，一句都对不上，全丢掉（她 09-21）。
     */
    const cleanQuote = (s: string): string => {
        let t = s.trim();
        const arrow = t.indexOf('→');
        if (arrow > 0) t = t.slice(0, arrow);
        t = t.replace(/^\[[^\]]{1,24}\]\s*/, '');
        t = t.replace(/^你\s*/, '');
        return norm(t);
    };
    let n = 0;
    let missed = 0;
    for (const r of replies) {
        const q = cleanQuote(r.quote);
        if (!q) { missed += 1; continue; }
        // **他自己划的也能接**（她 09-21：她回了他划的那句，他得能在同一条下面回她）；
        // 同一句话在多处出现时优先本章的
        const live = anns.filter((a) => a.kind !== 'bookmark');
        const inChapter = live.filter((a) => (a.chapterIdx ?? chapterIdx) === chapterIdx);
        const pick = (pool: typeof live) => pool.find((a) => norm(a.anchor.text) === q)
            ?? pool.find((a) => norm(a.note ?? '') === q && q.length >= 4)
            ?? pool.find((a) => norm(a.anchor.text).includes(q) || q.includes(norm(a.anchor.text)))
            ?? pool.find((a) => q.length >= 4 && norm(a.note ?? '').includes(q));
        const target = pick(inChapter) ?? pick(live);
        if (!target) { missed += 1; continue; }

        const ci = typeof target.chapterIdx === 'number' ? target.chapterIdx : chapterIdx;
        const thKey = threadKeyOf(ci, target.anchor, target.ownerId);
        const tid = threadRowId(bookId, thKey);
        const now = new Date().toISOString();
        let th: RdThread | null = threads.find((t) => t.id === tid) ?? null;
        for (let i = 0; i < r.lines.length; i += 1) {
            th = await appendThreadMessage(tid, {
                id: rdId('ms'), role: 'char', charId, content: r.lines[i], kind: 'chat',
                createdAt: new Date(Date.now() + i).toISOString(),
            }, (): RdThread => ({
                id: tid, bookId, anchor: target.anchor, anchorKey: thKey, chapterIdx: ci,
                charIds: [charId], messages: [], createdAt: now, updatedAt: now,
            }));
            n += 1;
        }
        if (th && !th.charIds.includes(charId)) await putThread({ ...th, charIds: [...th.charIds, charId] });
    }
    return { written: n, missed };
}

/** 把角色抄回来的句子换算成真锚点并落库；定位不到的丢掉（写入口校验）。 */
export async function writeCoReadMarks(opts: {
    bookId: string;
    charId: string;
    contentRev: string;
    chapterIdx: number;
    percent: number;
    /** 这一页的逐段正文（下标 = 章内段号） */
    paras: string[];
    marks: CoReadMark[];
    /** 只在这一段段号里找位置（= 他这次读过的那几页）；不给就是整章找 */
    searchFrom?: number;
    searchTo?: number;
}): Promise<RdAnnotation[]> {
    const now = new Date().toISOString();
    const written: RdAnnotation[] = [];
    for (const mark of opts.marks) {
        const anchor = locateQuote(opts.paras, mark.quote, opts.chapterIdx,
            { from: opts.searchFrom, to: opts.searchTo });
        if (!anchor) continue;
        const row: RdAnnotation = {
            id: rdId('an'),
            bookId: opts.bookId,
            ownerId: opts.charId,
            anchor,
            kind: 'note',
            visibility: mark.visibility,
            styleSlot: 1,
            note: mark.note || undefined,
            contentRev: opts.contentRev,
            status: 'active',
            chapterIdx: opts.chapterIdx,
            percent: opts.percent,
            createdAt: now,
            updatedAt: now,
        };
        await putAnnotation(row);
        written.push(row);
    }
    return written;
}

// ─── 回一条讨论 ──────────────────────────────────────────────────

export interface ThreadReply {
    /** 分气泡：他要说的那几句短话（渲染时一句一个气泡） */
    bubbles: string[];
    /** 拼起来的一整段（活动记录 / 摘要 / 上下文用） */
    text: string;
    feeling: string;
    tokens: number;
    tokensIn: number;
    tokensOut: number;
}

export interface ThreadReplyInput {
    char: CharacterProfile;
    user: UserProfile;
    book: RdBook;
    chapterIdx: number;
    chapterTitle: string;
    /** 这条划线选中的原文 */
    quote: string;
    /** 那句话所在的正文（前后各给一点，让他知道在说什么） */
    context: string;
    /** 这条讨论已经有的话（含 ${user.name} 说的） */
    threadLines: string[];
    /** ${user.name} 挂在这一句上的批注（可能为空） */
    herNote: string;
    contextMode: CoReadContextMode;
    /** 用哪套提示词（'' = 默认套；'rp' = 角色扮演套） */
    preset?: string;
    chatLines: string;
    /** 历史阅读摘要（十条摘要，时间从早到晚）——当背景 */
    summaries?: string[];
    /** 最近 15 条讨论记录（时间序）——当背景 */
    discussion?: string[];
    /** 实时状态段（非核心模式才有，贴末尾） */
    liveState?: string;
    /** 最近几条聊天原文：世界书按关键词扫它 */
    scanMsgs?: Message[];
    api: ReaderCallRuntime;
}

/**
 * 让角色回一条讨论（共读态下手动 ⚡ 触发的那一下）。
 * 非共读不调这个——她 09-15 定的：非共读要在聊天里跟他说，不能凭空触发。
 */
export async function generateThreadReply(input: ThreadReplyInput): Promise<ThreadReply> {
    const { char, user, book, chapterTitle, quote, context, threadLines, herNote, contextMode, chatLines, api } = input;
    // 同一套分段：稳定段（角色本体 + 情境说明 + 回讨论提示词 + 读书规则）→ 材料 → 收尾（实时状态 + 格式）
    const snapshot = [
        buildCoReadSnapshot(char, user, contextMode, input.scanMsgs),
        `### 你现在在做什么\n${expand('共读·情境说明', char, user, book, input.preset ?? '')}\n\n`,
        expand('共读·回讨论', char, user, book, input.preset ?? ''),
        `\n${coReadProtocol(book, chapterTitle, char.name, user.name)}`,
    ].join('');
    const material = [
        `你们在读《${book.title}》· ${chapterTitle}。`,
        contextMode === 'immersive' && chatLines ? `\n你们最近在聊天里说的话：\n${chatLines}` : '',
        input.summaries && input.summaries.length > 0
            ? `\n你之前读过的部分，当时记下来的（时间从早到晚）：\n${input.summaries.join('\n')}` : '',
        input.discussion && input.discussion.length > 0
            ? `\n书房里最近的讨论（按发生的先后）：\n${input.discussion.join('\n')}` : '',
        `\n被划出来的是这句：「${quote}」`,
        '',
        '它所在的正文：',
        context,
        '',
        herNote ? `${user.name} 的批注：${herNote}` : `${user.name} 还没写批注，只划了这句。`,
        '',
        threadLines.length > 0 ? `这条讨论到现在：\n${threadLines.join('\n')}` : '这条讨论还没有人说过话。',
    ].filter(Boolean).join('\n');
    const tail = [
        input.liveState
            ? `[System: 实时状态 (Live Context)]\n（以下是此刻的实时状态；你的人设与读书的规矩见最上方的系统设定，此处不再重复。）\n\n${input.liveState}`
            : '',
        '回一句（按格式给 JSON）。',
    ].filter(Boolean).join('\n');
    const reply = await postReaderChat(api, {
        model: api.model,
        messages: [
            { role: 'system', content: snapshot },
            { role: 'user', content: material },
            { role: 'system', content: tail },
        ],
        temperature: 0.85,
        max_tokens: 2000,
    });
    const parsed = extractJson(reply.text);
    if (!parsed) {
        const bubbles = toBubbles(reply.text);
        return {
            bubbles, text: bubbles.join('\n'), feeling: '',
            tokens: reply.tokens, tokensIn: reply.tokensIn, tokensOut: reply.tokensOut,
        };
    }
    const bubbles = toBubbles(parsed.reply);
    return {
        bubbles,
        text: bubbles.join('\n'),
        feeling: str(parsed.feeling).trim(),
        tokens: reply.tokens,
        tokensIn: reply.tokensIn,
        tokensOut: reply.tokensOut,
    };
}

// ─── 总结 ────────────────────────────────────────────────────────

export interface SummarizeInput {
    /** 一起读的人（她 09-20：可多选；几个人读就是几次单独的调用，摘要只写一份） */
    chars: CharacterProfile[];
    user: UserProfile;
    book: RdBook;
    from: CoReadPos | null;
    to: CoReadPos;
    /** 这段时间的**讨论记录**（时间序，一行一条，用 readerTimeline 的 lineOf 念好） */
    rows: string[];
    /** 之前已经总结过的（防重复、保持连续） */
    previous: string[];
    /** 这一场共读是什么时候开的（材料里给个范围，写出来的东西才不飘） */
    startedAt?: string;
    api: ReaderCallRuntime;
}

/**
 * **讨论记录摘要**（她 09-25 文档里的 B 类）。
 *
 * 输入是**按时间排序的讨论记录**（谁划了哪句话、谁在哪条下面说了什么），不是按原文分类的
 * 笔记列表；只读事儿——不给人设、不给用户设定。出一段第三人称的正文，进阅读区的历史摘要、
 * 也按规则同步进聊天。
 */
export async function summarizeDiscussionRange(input: SummarizeInput): Promise<string> {
    const { chars, user, book, from, to, rows, previous, api } = input;
    // 多人一起读时用顿号连起来（「阿一、小满」）——摘要只写事儿，名字是唯一的指代
    const names = chars.map((c) => c.name).join('、');
    const prompt = getPrompt('共读·总结')
        .replace(/\{\{char\}\}/g, names)
        .replace(/\{\{user\}\}/g, user.name)
        .replace(/\{\{book\}\}/g, book.title);
    const mins = input.startedAt
        ? Math.max(1, Math.round((Date.now() - new Date(input.startedAt).getTime()) / 60000))
        : 0;
    const durText = mins >= 60 ? `${Math.floor(mins / 60)} 小时 ${mins % 60} 分` : `${mins} 分钟`;
    const reply = await postReaderChat(api, {
        model: api.model,
        messages: [
            { role: 'system', content: prompt },
            {
                role: 'user',
                content: [
                    `《${book.title}》的共读进行到第 ${to.chapterIdx + 1} 章第 ${to.paraIdx + 1} 段。`,
                    from
                        ? `这一段的范围：第 ${from.chapterIdx + 1} 章第 ${from.paraIdx + 1} 段 → 第 ${to.chapterIdx + 1} 章第 ${to.paraIdx + 1} 段。`
                        : `这一段的范围：从开头读到第 ${to.chapterIdx + 1} 章第 ${to.paraIdx + 1} 段。`,
                    mins > 0 ? `这一场共读一共持续了 ${durText}。` : '',
                    // 一起读的人 = 她 + 角色。原来只数了角色（她说三个人写成两个人，就是这儿）
                    `一起读的人一共 ${chars.length + 1} 位：${user.name}${names ? `、${names}` : ''}。`,
                    '',
                    rows.length > 0 ? `这段时间书房里的讨论（按发生的先后）：\n${rows.join('\n')}` : '',
                    '',
                    previous.length > 0 ? `你之前总结过的（只做衔接参考，不要重复）：\n${previous.join('\n')}` : '',
                ].filter(Boolean).join('\n'),
            },
        ],
        temperature: 0.6,
        max_tokens: 2000,
    });
    return reply.text.trim();
}

export interface ContentFlowInput {
    /** 一起读的人（多人时名字都写进材料） */
    chars: CharacterProfile[];
    book: RdBook;
    /** 这一批**活动记录**（老 → 新）：每次读完留下的原文小总结 + 当时的感受 */
    events: Array<{ summary: string; excerpt?: string; feeling?: string }>;
    previous: string[];
    api: ReaderCallRuntime;
}

/**
 * **原文小总结 + 阅读感受的轻量汇总**（她 09-25 文档里的 A 类）。
 *
 * 她 09-26 说这条的用途：**让模型记得自己读过什么、有过什么感受**——不至于每次读新内容
 * 都对之前读过的一无所知，也不至于每次把感受和原文小结全读一遍。所以它只揉这两样，
 * 不逐条复述，也不替他把原文和感受混成一团说不清的叙述。
 */
export async function summarizeContentFlow(input: ContentFlowInput): Promise<string> {
    const { chars, book, events, previous, api } = input;
    const names = chars.map((c) => c.name).join('、') || '他';
    const prompt = getPrompt('共读·内容汇总')
        .replace(/\{\{char\}\}/g, names)
        .replace(/\{\{book\}\}/g, book.title);
    const lines = events.map((e, i) => {
        const seg = [`${i + 1}. 读了：${e.summary}`];
        if (e.excerpt) seg.push(`   这一段讲了：${e.excerpt}`);
        if (e.feeling) seg.push(`   当时心里：${e.feeling}`);
        return seg.join('\n');
    });
    const reply = await postReaderChat(api, {
        model: api.model,
        messages: [
            { role: 'system', content: prompt },
            {
                role: 'user',
                content: [
                    `《${book.title}》，读书的人是：${names}。`,
                    '',
                    lines.length > 0 ? `这段时间一条一条的记录（按先后）：\n${lines.join('\n')}` : '',
                    '',
                    previous.length > 0 ? `你之前汇总过的（只做衔接参考，不要重复）：\n${previous.join('\n')}` : '',
                ].filter(Boolean).join('\n'),
            },
        ],
        temperature: 0.6,
        max_tokens: 2000,
    });
    return reply.text.trim();
}

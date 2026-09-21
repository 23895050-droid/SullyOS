// 读书模块 · 阅读风格分析（她 09-20）
//
// 角色**第一次读书**、而且还没给自己选笔色的时候，第一次输出之前先跑这一趟：
//   ① 阅读偏好（类型流派 / 作者 / BE·HE·GL·BG / 逻辑还是感性 / 五维分数 / 笔色）
//   ② 阅读气质（和阅读无关的六个元素：两个动词 + 两个经典公式或数列 + 两个名词意象）
//
// 两块**分开存、分开重roll、分开开关注入**（她原话）。跑完把笔色写进角色自己的设置，
// 之后他的划线就用那支笔——不至于所有人一上来都是一个颜色。
//
// 上下文照共读那套（人设 + 用户设定），不给书——这是「他这个人怎么读」，不是「这本书怎么样」。

import type { CharacterProfile, UserProfile } from '../../types';
import { ContextBuilder } from '../context';
import { getPrompt } from '../promptRegistry';
import { extractJson } from '../safeApi';
import { setCharReadPrefs, getCharReadPrefs } from '../../apps/reader/readerCharPrefs';
import { setCharStyle, getCharStyle, type CharStylePref, type CharStyleVibe } from '../../apps/reader/readerCharStyle';
import { postReaderChat, type ReaderCallRuntime } from './readerChat';

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const strList = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => str(x).trim()).filter(Boolean) : [];
const num = (v: unknown, lo = 0, hi = 10): number => {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, Math.round(n)));
};
const scoreMap = (v: unknown, keys: string[]): Record<string, number> => {
    const src = (v ?? {}) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const k of keys) out[k] = num(src[k]);
    return out;
};

/**
 * 颜色合法性：只收 #rrggbb / #rgb。
 * 她 09-20 定的唯一一条：**纯黑纯白不要**（那是没挑过的样子）——
 * 明暗浓淡都不限（上一版卡了亮度，结果挑出来的颜色一个比一个暗）。
 */
function cleanPenColor(v: unknown): string | undefined {
    const raw = str(v).trim();
    const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(raw);
    if (!m) return undefined;
    const hex = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (r >= 248 && g >= 248 && b >= 248) return undefined;   // 纯白
    if (r <= 6 && g <= 6 && b <= 6) return undefined;         // 纯黑
    return `#${hex.toLowerCase()}`;
}

/** 气质那六个元素拼成注入用的那一句（她：之后要标注这只是气质基调参考）。 */
export function vibeText(v: { verbs: string[]; forms: string[]; images: string[] }): string {
    const parts: string[] = [];
    if (v.verbs.length) parts.push(`动词：${v.verbs.join('、')}`);
    if (v.forms.length) parts.push(`公式或数列：${v.forms.join('、')}`);
    if (v.images.length) parts.push(`意象：${v.images.join('、')}`);
    return parts.join('；');
}

/** 偏好拼成一段可读的话（给「看书架印象」和界面显示用）。 */
export function prefText(p: Omit<CharStylePref, 'text' | 'at'>): string {
    const bits: string[] = [];
    if (p.genres.length) bits.push(`爱读：${p.genres.join('、')}`);
    if (p.authors.length) bits.push(`常读的作者：${p.authors.join('、')}`);
    const taste = Object.entries(p.taste).filter(([, v]) => v >= 6).map(([k]) => k.toUpperCase());
    if (taste.length) bits.push(`偏爱：${taste.join('、')}`);
    bits.push(`读文本时：${p.logic >= 6 ? '更吃逻辑' : p.logic <= 4 ? '更吃感性' : '逻辑和感性都在'}`);
    const sc = Object.entries(p.scores).filter(([, v]) => v >= 6).map(([k]) => k);
    if (sc.length) bits.push(`偏重：${sc.join('、')}`);
    if (p.appreciation) bits.push(p.appreciation);
    return bits.join('。');
}

/** 上下文照共读的「核心人设」那一档：够写出「他这个人」，又不载世界书和日常记忆。 */
const charContext = (char: CharacterProfile, user: UserProfile): string => [
    ContextBuilder.buildRoleSettingsContext(char, { skipMemories: true }),
    char.description?.trim() ? `### ${user.name} 对你的备注/称呼\n${char.description.trim()}\n\n` : '',
    `### 互动对象\n- 名字: ${user.name}\n- 设定/备注: ${user.bio || '无'}\n\n`,
].join('');

/**
 * 跑一趟分析（两块一起出）。返回跑出来的东西——调用方自己决定怎么提示。
 * 偏好成功就顺手把笔色写进角色设置（她自己选过笔色就不覆盖）。
 */
export async function analyzeCharStyle(input: {
    char: CharacterProfile;
    user: UserProfile;
    api: ReaderCallRuntime;
    /** 只重roll 其中一块时用；'both' = 两块都重跑 */
    which?: 'both' | 'pref' | 'vibe';
    tokensOut?: number;
}): Promise<{ pref?: CharStylePref; vibe?: CharStyleVibe }> {
    const { char, user, api, which = 'both' } = input;
    const context = charContext(char, user);
    const out: { pref?: CharStylePref; vibe?: CharStyleVibe } = {};

    /** 一次调用（提示词走注册表，宏展开） */
    const call = async (label: string, extra: string, maxTokens: number): Promise<Record<string, unknown> | null> => {
        const prompt = getPrompt(label, getCharReadPrefs(char.id).promptPreset)
            .replace(/\{\{char\}\}/g, char.name)
            .replace(/\{\{user\}\}/g, user.name);
        const reply = await postReaderChat(api, {
            model: api.model,
            messages: [
                { role: 'system', content: `${prompt}\n\n${context}` },
                { role: 'user', content: extra || `给 ${char.name} 出一份。按格式回 JSON。` },
            ],
            temperature: 0.9,
            max_tokens: maxTokens,
        });
        return extractJson(reply.text) as Record<string, unknown> | null;
    };

    if (which === 'both' || which === 'pref') {
        const parsed = await call('阅读风格·偏好', '', 2000);
        const taste = scoreMap(parsed?.taste, ['be', 'he', 'gl', 'bg']);
        const scores = scoreMap(parsed?.scores, ['学术', '文艺', '美感', '情感', '互文']);
        const base = {
            genres: strList(parsed?.genres).slice(0, 8),
            authors: strList(parsed?.authors).slice(0, 6),
            taste,
            logic: num(parsed?.logic),
            appreciation: str(parsed?.appreciation).trim(),
            scores,
            penColor: cleanPenColor(parsed?.penColor),
        };
        const pref: CharStylePref = { ...base, text: prefText(base), at: new Date().toISOString() };
        out.pref = pref;
        setCharStyle(char.id, { pref });
        // 笔色：**重取就换新的**（她 09-20 问的：重取两块要能把笔色一起更新）。
        // 这一块没有单独的手动选色，颜色就是分析出来的那支笔——留着旧的没意义。
        // 模型这次挑的颜色要是过不了过滤（黑白灰 / 太白太黑），才退回原来那支。
        if (pref.penColor) setCharReadPrefs(char.id, { penColor: pref.penColor });
    }

    if (which === 'both' || which === 'vibe') {
        // 单独重roll 气质时，把已有的偏好递过去当参考（她原话：可以单独读之前输出的阅读偏好重roll）
        const prevPref = getCharStyle(char.id).pref;
        const extra = prevPref && which === 'vibe'
            ? `他已经有一份阅读偏好（只作参考，别让气质和它呼应）：\n${prevPref.text}\n\n按格式回 JSON。`
            : '';
        const parsed = await call('阅读风格·气质', extra, 1600);
        const six = {
            verbs: strList(parsed?.verbs).slice(0, 2),
            forms: strList(parsed?.forms).slice(0, 2),
            images: strList(parsed?.images).slice(0, 2),
        };
        const vibe: CharStyleVibe = { ...six, text: vibeText(six), at: new Date().toISOString() };
        out.vibe = vibe;
        setCharStyle(char.id, { vibe });
    }

    return out;
}

/** 需要先跑分析吗：第一次读书、而且还没给自己选笔色（她 09-20 的触发条件）。 */
export const needStyleAnalysis = (charId: string): boolean => {
    const prefs = getCharReadPrefs(charId);
    if (prefs.penColor) return false;
    const st = getCharStyle(charId);
    return !st.pref || !st.vibe;
};

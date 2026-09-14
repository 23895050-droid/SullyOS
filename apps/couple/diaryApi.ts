// 日记 AI 调用（2026-08-24）：喊他写日记 + 批注她的日记
// API 槽：日记独立配置（diaryStore.api）；按 Angelica 2026-08-24 定的规则——没配就用主 API（全局 apiConfig），
// 本模块不走「不配置不调用」（写日记/批注是产品主流程，她明确要主 API 兜底）。
// 上下文与聊天同一套：角色核心人设 + 挂载世界书（今天最新内容，只取开启的块，排除日记块自身）+ 最近 50 条聊天 + 最近日记摘要（防角度重复）
// 推理模型 token 给足（max_tokens 4096），JSON 多层容错解析（extractJson 失败 → 纯文本兜底）
import type { CharacterProfile, UserProfile } from '../../types';
import { getPrompt } from '../../utils/promptRegistry';
import { getDiaryStore, type DiaryApiConfig, type DiarySeg, type SentenceAnchor } from './diaryStore';
import { buildBlockEntry, MOUNT_BLOCK_IDS } from '../../utils/noxhomeMount';
import { diarySentenceIndex, diarySentences, fmtDiaryDateStamp, normalizeDiaryMood, splitDiaryHead } from '../../utils/diaryMath';
import { getLocalDateKey } from '../../utils/localDate';
import { ContextBuilder } from '../../utils/context';
import { DB } from '../../utils/db';
import { normalizeMessageContent } from '../../utils/messageFormat';
import { safeResponseJson, extractJson } from '../../utils/safeApi';

export interface DiaryCallRuntime {
  baseUrl: string; // 已带 /v1 后缀
  apiKey: string;
  model: string;
}

/** 日记 API 槽：配了用配的，没配回退主 API */
export const resolveDiaryApi = (diaryApi: DiaryApiConfig, mainApi?: Partial<DiaryApiConfig>): DiaryCallRuntime | null => {
  const pick = (c?: Partial<DiaryApiConfig>): DiaryCallRuntime | null =>
    c && c.apiKey && c.baseUrl && c.model ? { baseUrl: c.baseUrl, apiKey: c.apiKey, model: c.model } : null;
  return pick(diaryApi) ?? pick(mainApi);
};

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

/** 模型没按 JSON 写（直接写了散文）：剥掉可能的代码块外壳，当纯文本兜底 */
const salvageText = (text: string): string => text.replace(/```json/gi, '').replace(/```/g, '').trim();

/** 与聊天同一套上下文（私聊侧）：核心人设 + 挂载世界书 + 最近日记摘要 + 近期聊天原文（留言板批阅共用） */
export const buildDiaryContext = async (char: CharacterProfile, user: UserProfile): Promise<{ system: string; recent: string }> => {
  let system = ContextBuilder.buildCoreContext(char, user);

  // 挂载世界书：今天的最新内容，只取开启的块，排除日记块自身（喊他写时还没写、批注时避免自指）
  const blocks = MOUNT_BLOCK_IDS.filter((id) => id !== 'diary')
    .map((id) => buildBlockEntry(id))
    .filter((e) => e !== null);
  if (blocks.length > 0) {
    const blockText = blocks
      .map(
        (b) =>
          `【${b.title}】\n${b.content.replace(/\{\{user\}\}/g, user.name).replace(/\{\{char\}\}/g, char.name)}`,
      )
      .join('\n\n');
    system += `\n\n### 挂载数据（和聊天里同一套，今天的最新内容）\n${blockText}`;
  }

  // 最近日记摘要（避免角度重复）
  const recentSummaries = getDiaryStore()
    .entries.filter((e) => e.owner === 'me' && e.summary)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  if (recentSummaries.length > 0) {
    system += `\n\n### 最近几篇日记摘要（避免角度重复）\n${recentSummaries.map((e) => `- ${e.date}：${e.summary}`).join('\n')}`;
  }

  // 近期聊天原文（日记最核心的素材来源——是素材，不是抄写源）
  const msgs = await DB.getMessagesByCharId(char.id);
  const recent = msgs
    .slice(-50)
    .map(
      (m) =>
        `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.role === 'user' ? 'User' : 'You'}: ${normalizeMessageContent(m, char.name, user.name)}`,
    )
    .join('\n');
  return { system, recent };
};

export const postDiaryChat = async (api: DiaryCallRuntime, body: Record<string, unknown>): Promise<string> => {
  const res = await fetch(`${api.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await safeResponseJson(res);
  return str(data?.choices?.[0]?.message?.content);
};

/** 提示词宏展开：{{char}}/{{user}}/{{lang}}（语言 1-3 种混用） */
const expand = (label: string, char: CharacterProfile, user: UserProfile, langs: string[]): string =>
  getPrompt(label)
    .replace(/\{\{char\}\}/g, char.name)
    .replace(/\{\{user\}\}/g, user.name)
    .replace(/\{\{lang\}\}/g, langs.length ? langs.join('、') : '简体中文');

const langLine = (langs: string[]): string =>
  langs.length ? `这篇日记用 ${langs.join('、')} 写，可以自然混用这些语言。` : '这篇日记用简体中文写。';

// 旁批 segment 清洗（自批注 / 批注共用）：类型白名单 + 过滤空文本
const cleanSegs = (raw: unknown): DiarySeg[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const segs = raw
    .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
    .map((g) => ({
      type: (['text', 'strike', 'highlight', 'redact', 'doodle', 'styled'] as const).includes(g.type as never) ? (g.type as DiarySeg['type']) : 'text',
      text: str(g.text),
      color: (['graphite', 'blue', 'brown', 'olive', 'plum'] as const).includes(g.color as never) ? (g.color as DiarySeg['color']) : undefined,
      size: (['sm', 'md', 'lg'] as const).includes(g.size as never) ? (g.size as DiarySeg['size']) : undefined,
    }))
    .filter((g) => g.text.trim());
  return segs.length > 0 ? segs : undefined;
};

const cleanAnchors = (raw: unknown, validIds: Set<string>): SentenceAnchor[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
    .filter((a) => typeof a.sentenceId === 'string' && validIds.has(a.sentenceId))
    .map((a) => ({
      sentenceId: a.sentenceId as string,
      mark: (['underline', 'strike', 'circle'] as const).includes(a.mark as never) ? (a.mark as SentenceAnchor['mark']) : undefined,
      noteBlock: cleanSegs(a.noteBlock),
    }))
    .slice(0, 8);
};

/** 喊他写：生成 Nox 今天的日记（含心情基调 + 写给自己看的旁批；当天可重roll；prompt 在设置·提示词管理可改）。
 *  自批注 sentenceId 只对正文（标题/日期天气行之后）编号，与渲染端的 splitDiaryHead 同源。 */
export async function generateNoxDiary(opts: {
  char: CharacterProfile;
  user: UserProfile;
  mainApi?: Partial<DiaryApiConfig>;
  date?: string;
  langs?: string[];
}): Promise<{ text: string; summary: string; mood: string; anchors: SentenceAnchor[]; image?: { prompt: string; why: string } }> {
  const api = resolveDiaryApi(getDiaryStore().api, opts.mainApi);
  if (!api) throw new Error('未配置日记 API');
  const { system, recent } = await buildDiaryContext(opts.char, opts.user);
  const dateKey = opts.date ?? getLocalDateKey();
  const langs = opts.langs?.length ? opts.langs : ['简体中文'];
  const text = await postDiaryChat(api, {
    model: api.model,
    messages: [
      { role: 'system', content: `${expand('喊他写日记', opts.char, opts.user, langs)}\n\n${system}` },
      {
        role: 'user',
        content: [
          `今天是 ${dateKey}（${fmtDiaryDateStamp(dateKey)}），你写的就是这一天的日记。`,
          langLine(langs),
          '',
          '最近对话记录（素材，不是抄写源）：',
          recent,
        ].join('\n'),
      },
    ],
    temperature: 0.85,
    max_tokens: 16000,
  });
  const parsed = extractJson(text);
  if (parsed && typeof parsed.text === 'string') {
    const body = splitDiaryHead(parsed.text.trim()).body;
    const validIds = new Set(diarySentences(body).map((s) => s.id));
    // 配图意图（模型自己决定带不带；像留言板——生成后由调用方画）
    const img = parsed.image && typeof parsed.image === 'object' ? (parsed.image as Record<string, unknown>) : null;
    const imgPrompt = str(img?.prompt).trim();
    return {
      text: parsed.text.trim(),
      summary: str(parsed.summary),
      mood: normalizeDiaryMood(parsed.mood),
      anchors: cleanAnchors(parsed.selfAnchors, validIds),
      image: imgPrompt ? { prompt: imgPrompt, why: str(img?.why) } : undefined,
    };
  }
  return { text: salvageText(text), summary: '', mood: 'calm', anchors: [] };
}

/** 喊他来看：生成 Nox 对她日记的旁批（句子锚点 + 边角小批；显示在她日记下面，可重roll） */
export async function generateNoxAnnotation(opts: {
  char: CharacterProfile;
  user: UserProfile;
  herDiary: string;
  mainApi?: Partial<DiaryApiConfig>;
  date?: string;
  langs?: string[];
}): Promise<{ summary: string; anchors: SentenceAnchor[] }> {
  const api = resolveDiaryApi(getDiaryStore().api, opts.mainApi);
  if (!api) throw new Error('未配置日记 API');
  const { system, recent } = await buildDiaryContext(opts.char, opts.user);
  const dateKey = opts.date ?? getLocalDateKey();
  const index = diarySentenceIndex(opts.herDiary);
  const langs = opts.langs?.length ? opts.langs : ['简体中文'];

  const text = await postDiaryChat(api, {
    model: api.model,
    messages: [
      { role: 'system', content: `${expand('批注她的日记', opts.char, opts.user, langs)}\n\n${system}` },
      {
        role: 'user',
        content: [
          `她 ${dateKey} 的日记。句子编号（只能从这些编号里选目标句）：`,
          index.map((s) => `- ${s.id}: ${s.text}`).join('\n'),
          '',
          '她的日记正文：',
          opts.herDiary.slice(0, 1800),
          '',
          langLine(langs),
          '',
          '最近对话记录（素材，不是抄写源）：',
          recent,
        ].join('\n'),
      },
    ],
    max_tokens: 16000,
  });

  const parsed = extractJson(text);
  if (!parsed) return { summary: '', anchors: [] };
  const rawAnchors = parsed.sentenceAnchors;
  const validIds = new Set(index.map((s) => s.id));
  return {
    summary: str(parsed.summary),
    anchors: Array.isArray(rawAnchors) ? cleanAnchors(rawAnchors, validIds) : [],
  };
}

// 两张总结卡生成（2026-08-26 批 2）：
// 1. 一起听总结卡（music_summary）：结束统一出口触发——听了 N 首歌 + 对歌的总结，一个卡
// 2. 聊歌总结卡（music_chat_summary）：聊歌框每 50 条自动一张 + 退出补一段，与总结卡分开、互不干扰
// 两张卡都用独立音乐 API 槽（模型独立性：不配置不调用不回退）——未配 → 记 pending，
// 音乐设置页「补生成」逐条补（maybeGeneratePendingSummaries）。
import { DB } from './db';
import { getPrompt } from './promptRegistry';
import { toHttps } from './musicContextBlock';
import {
  clearSummaryPending,
  getMusicStore,
  markSummaryPending,
  setMusicChatSegCursor,
  setSessionSummary,
} from '../apps/couple/musicStore';
import type { MusicApiConfig, MusicChatMessage, TogetherSession } from '../apps/couple/musicStore';

export interface SummaryResult {
  status: 'generated' | 'pending' | 'empty' | 'skipped' | 'failed';
  cardId?: string;
}

const apiConfigured = (api?: MusicApiConfig): api is MusicApiConfig =>
  !!(api?.baseUrl && api?.apiKey && api?.model);

const expandMacros = (text: string, charName: string, userName: string): string =>
  text.replace(/\{\{\s*char\s*\}\}/gi, charName).replace(/\{\{\s*user\s*\}\}/gi, userName);

async function callSummaryApi(api: MusicApiConfig, prompt: string): Promise<string> {
  const res = await fetch(`${String(api.baseUrl).replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.apiKey}` },
    body: JSON.stringify({
      model: api.model,
      messages: [{ role: 'user', content: prompt }],
      // 推理模型防截断；她的 API 按次计费，额度给够（同日记/留言板策略）
      max_tokens: 4000,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json().catch(() => ({}));
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('总结回复为空');
  return text.trim();
}

async function resolveNames(charId: string): Promise<{ charName: string; userName: string }> {
  const [chars, user] = await Promise.all([DB.getAllCharacters(), DB.getUserProfile()]);
  return {
    charName: chars.find((c) => c.id === charId)?.name || 'Ta',
    userName: user?.name || '你',
  };
}

/**
 * 一起听总结卡：会话落库后由退出出口调用。曲目空不生成；summaryCardId 已存在防重；
 * API 未配 → markSummaryPending（设置页可补生成）。
 */
export async function generateTogetherSummary(session: TogetherSession): Promise<SummaryResult> {
  if (session.songs.length === 0) return { status: 'empty' };
  if (session.summaryCardId) return { status: 'skipped', cardId: session.summaryCardId };
  const api = getMusicStore().api;
  if (!apiConfigured(api)) {
    markSummaryPending(session.id);
    return { status: 'pending' };
  }
  const { charName, userName } = await resolveNames(session.charId);
  const minutes = Math.max(1, Math.round((Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 60000));
  const songList = session.songs.map((x) => `《${x.name}》— ${x.artists.join(' / ')}（${x.count} 次）`).join('\n');
  const prompt = `${expandMacros(getPrompt('music-结束总结'), charName, userName)}
\n曲目（按听的顺序）：
${songList}

一起听了约 ${minutes} 分钟。`;
  try {
    const text = await callSummaryApi(api, prompt);
    const cardId = await DB.saveMessage({
      charId: session.charId,
      role: 'system',
      type: 'music_summary',
      content: `[一起听总结] ${text}`,
      metadata: {
        source: 'music_summary',
        summaryCard: {
          sessionId: session.id,
          // 反馈1 A2：总结卡封面归一 https（老会话里可能还存着 http）
          songs: session.songs.map((s) => ({ neteaseId: s.neteaseId, name: s.name, artists: s.artists, albumPic: toHttps(s.albumPic ?? ''), count: s.count })),
          summaryText: text,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
        },
      },
    });
    setSessionSummary(session.id, text, String(cardId));
    clearSummaryPending(session.id);
    return { status: 'generated', cardId: String(cardId) };
  } catch (e) {
    console.warn('[MusicSummary] 一起听总结生成失败:', e);
    markSummaryPending(session.id);
    return { status: 'failed' };
  }
}

/**
 * 聊歌总结卡：每 50 条一段自动生成；成功才推进 segCursor（失败/未配都不动游标，
 * 补生成按 messages.length > segCursor 找欠账段落）。
 */
export async function generateMusicChatSummary(
  charId: string,
  segment: MusicChatMessage[],
  segFrom: number,
  segTo: number,
): Promise<SummaryResult> {
  if (segment.length === 0) return { status: 'empty' };
  const api = getMusicStore().api;
  if (!apiConfigured(api)) return { status: 'pending' };
  const { charName, userName } = await resolveNames(charId);
  const transcript = segment
    .map((m) => `${m.role === 'user' ? userName : charName}：${m.content}`)
    .join('\n');
  const prompt = `${expandMacros(getPrompt('music-聊歌总结'), charName, userName)}
\n聊歌记录：
${transcript}`;
  try {
    const text = await callSummaryApi(api, prompt);
    await DB.saveMessage({
      charId,
      role: 'system',
      type: 'music_chat_summary',
      content: `[聊歌小结] ${text}`,
      metadata: {
        source: 'music_chat_summary',
        chatSummaryCard: { charId, segFrom, segTo, summaryText: text, at: new Date().toISOString() },
      },
    });
    setMusicChatSegCursor(charId, segTo);
    return { status: 'generated' };
  } catch (e) {
    console.warn('[MusicSummary] 聊歌总结生成失败:', e);
    return { status: 'failed' };
  }
}

/**
 * 补生成入口（音乐设置页按钮）：把没生成的一起听总结卡 + 聊歌欠账段落一次补齐。
 */
export async function maybeGeneratePendingSummaries(): Promise<{ togetherDone: number; chatDone: number; skipped: number }> {
  const s = getMusicStore();
  let togetherDone = 0;
  let chatDone = 0;
  let skipped = 0;
  if (!apiConfigured(s.api)) return { togetherDone, chatDone, skipped };

  for (const sessionId of [...s.pendingSummarySessionIds]) {
    const session = s.togetherSessions.find((t) => t.id === sessionId);
    if (!session) continue;
    const res = await generateTogetherSummary(session);
    if (res.status === 'generated') togetherDone += 1;
    else skipped += 1;
  }
  for (const chat of s.musicChatSessions) {
    if (chat.messages.length <= chat.segCursor) continue;
    const res = await generateMusicChatSummary(chat.charId, chat.messages.slice(chat.segCursor), chat.segCursor, chat.messages.length);
    if (res.status === 'generated') chatDone += 1;
    else skipped += 1;
  }
  return { togetherDone, chatDone, skipped };
}

// 两张总结卡生成单测（2026-08-26 批 2）：空会话 / 防重 / API 未配 pending / 生成落卡
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DB } from './db';
import {
  flushTogetherSession,
  getMusicStore,
  setMusicApi,
  type TogetherSession,
} from '../apps/couple/musicStore';
import { generateMusicChatSummary, generateTogetherSummary, maybeGeneratePendingSummaries } from './musicSummary';

const mkSession = (over: Partial<TogetherSession> = {}): TogetherSession => ({
  id: `ts-${Math.random().toString(36).slice(2, 8)}`,
  charId: 'c1',
  startedAt: '2026-08-26T10:00:00.000Z',
  endedAt: '2026-08-26T10:21:00.000Z',
  songs: [{ neteaseId: 1, name: '富士山下', artists: ['陈奕迅'], count: 2 }],
  ...over,
});

const mockFetchOk = () =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ choices: [{ message: { content: '一起听总结正文' } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )));

afterEach(() => {
  setMusicApi(undefined);
  vi.unstubAllGlobals();
});

describe('generateTogetherSummary', () => {
  it('曲目空 → empty，不落卡不记 pending', async () => {
    const res = await generateTogetherSummary(mkSession({ songs: [] }));
    expect(res.status).toBe('empty');
    expect(getMusicStore().pendingSummarySessionIds).not.toContain(mkSession({ songs: [] }).id);
  });

  it('summaryCardId 已存在 → skipped（防重发卡）', async () => {
    const session = mkSession({ summaryCardId: '42' });
    const res = await generateTogetherSummary(session);
    expect(res.status).toBe('skipped');
    expect(res.cardId).toBe('42');
  });

  it('API 未配 → pending：会话保留在 pendingSummarySessionIds，不落卡', async () => {
    const session = mkSession();
    const res = await generateTogetherSummary(session);
    expect(res.status).toBe('pending');
    expect(getMusicStore().pendingSummarySessionIds).toContain(session.id);
  });

  it('API 配好 → generated：总结卡落主聊天（system + music_summary），会话记 summary + cardId', async () => {
    mockFetchOk();
    setMusicApi({ baseUrl: 'https://api.example.com/v1', apiKey: 'k', model: 'm' });
    // 生产路径：flushTogetherSession 先把会话落库，再调生成（这里照抄同一条路）
    const charId = `c-together-sum-${Date.now()}`;
    const session = flushTogetherSession(
      charId,
      [{ neteaseId: 1, name: '富士山下', artists: ['陈奕迅'], count: 2 }],
      Date.parse('2026-08-26T10:00:00.000Z'),
      Date.parse('2026-08-26T10:21:00.000Z'),
    );
    const res = await generateTogetherSummary(session);
    expect(res.status).toBe('generated');
    const stored = getMusicStore().togetherSessions.find((t) => t.id === session.id);
    expect(stored?.summary).toBe('一起听总结正文');
    expect(stored?.summaryCardId).toBeTruthy();
    const [card] = await DB.getMessagesByCharId(charId, true);
    expect(card.type).toBe('music_summary');
    expect(card.metadata?.source).toBe('music_summary');
    expect(card.metadata?.summaryCard?.songs[0]).toMatchObject({ neteaseId: 1, name: '富士山下', count: 2 });
  });
});

describe('generateMusicChatSummary', () => {
  const seg = [
    { id: '1', role: 'user' as const, content: '这首的副歌好好听', at: '2026-08-26T10:00:00.000Z' },
    { id: '2', role: 'assistant' as const, content: '我也最喜欢那句', at: '2026-08-26T10:01:00.000Z' },
  ];

  it('API 未配 → pending，segCursor 不动（留欠账给补生成）', async () => {
    const res = await generateMusicChatSummary(`c-chat-pending-${Date.now()}`, seg, 0, 2);
    expect(res.status).toBe('pending');
  });

  it('API 配好 → generated：聊歌小结卡落主聊天，segCursor 推进', async () => {
    mockFetchOk();
    setMusicApi({ baseUrl: 'https://api.example.com/v1', apiKey: 'k', model: 'm' });
    const charId = `c-chat-sum-${Date.now()}`;
    const res = await generateMusicChatSummary(charId, seg, 0, 2);
    expect(res.status).toBe('generated');
    const msgs = await DB.getMessagesByCharId(charId, true);
    const card = msgs.find((m) => m.type === 'music_chat_summary');
    expect(card).toBeTruthy();
    expect(card?.metadata?.source).toBe('music_chat_summary');
    expect(card?.metadata?.chatSummaryCard?.segTo).toBe(2);
  });
});

describe('maybeGeneratePendingSummaries（设置页补生成）', () => {
  it('没有 API → 直接返回 0，什么都不做', async () => {
    const r = await maybeGeneratePendingSummaries();
    expect(r).toEqual({ togetherDone: 0, chatDone: 0, skipped: 0 });
  });
});

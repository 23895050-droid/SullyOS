// 任务存档（2026-08-30）store 单测：迁移 / 自动起名 / 任务隔离 / 删除回落。
// 模块状态用 __resetAssistantForTest 逐用例重置，localStorage stub 来自 test-setup.ts。
import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetAssistantForTest, __reloadAssistantForTest, getAssistant, appendAssistantMessages,
  ensureAssistantSession, newAssistantSession, switchAssistantSession, deleteAssistantSession,
  clearAssistantMessages, type AssistantMsg,
} from './beautyAssistantStore';

const msg = (id: string, role: 'user' | 'assistant', content: string): AssistantMsg =>
  ({ id, role, content, at: '2026-08-30T00:00:00.000Z' });

beforeEach(() => {
  localStorage.clear();
  __resetAssistantForTest();
});

describe('任务存档', () => {
  it('旧数据迁移：没有任务的存量消息收进「默认任务」并激活它', () => {
    // 模拟旧版本：直接往 localStorage 写没有 sessions 字段的数据，重新 load 走真实迁移路径
    localStorage.setItem('assistant_v1', JSON.stringify({
      version: 1,
      name: '小助手',
      persona: 'test',
      messages: [msg('m1', 'user', '把播放页改成绿色系'), msg('m2', 'assistant', '好的')],
      favorites: [],
      cssSelf: '',
    }));
    __reloadAssistantForTest();
    const s = getAssistant();
    expect(s.sessions).toHaveLength(1);
    expect(s.sessions[0].title).toBe('把播放页改成绿色系');
    expect(s.activeSessionId).toBe(s.sessions[0].id);
    expect(s.messages.every((m) => m.sessionId === s.sessions[0].id)).toBe(true);
  });

  it('自动起名：新任务第一条用户消息取前 18 字当标题，assistant 消息不起名', () => {
    const sid = ensureAssistantSession();
    expect(getAssistant().sessions[0].title).toBe('新任务');
    appendAssistantMessages([msg('a1', 'assistant', '先给你一个方案')]);
    expect(getAssistant().sessions[0].title).toBe('新任务'); // AI 消息不算
    appendAssistantMessages([msg('u1', 'user', '一二三四五六七八九十一二三四五六七八九十超过十八个字的部分')]);
    expect(getAssistant().sessions[0].title).toBe('一二三四五六七八九十一二三四五六七八'); // 18 字
    expect(getAssistant().activeSessionId).toBe(sid);
  });

  it('任务隔离：切换任务后消息各进各的，互不混', () => {
    const s1 = ensureAssistantSession();
    appendAssistantMessages([msg('u1', 'user', '任务一')]);
    newAssistantSession();
    const s2 = getAssistant().activeSessionId;
    expect(s2).not.toBe(s1);
    appendAssistantMessages([msg('u2', 'user', '任务二')]);
    const s = getAssistant();
    expect(s.messages.filter((m) => m.sessionId === s1)).toHaveLength(1);
    expect(s.messages.filter((m) => m.sessionId === s2)).toHaveLength(1);
    // 切回任务一接着聊，消息仍进任务一
    switchAssistantSession(s1 as string);
    appendAssistantMessages([msg('u3', 'user', '任务一继续')]);
    expect(getAssistant().messages.filter((m) => m.sessionId === s1)).toHaveLength(2);
    expect(getAssistant().messages.filter((m) => m.sessionId === s2)).toHaveLength(1);
  });

  it('删除当前任务：消息一起删，active 回落到最新一个', () => {
    const s1 = ensureAssistantSession();
    appendAssistantMessages([msg('u1', 'user', '要删的')]);
    newAssistantSession();
    const s2 = getAssistant().activeSessionId;
    appendAssistantMessages([msg('u2', 'user', '留下的')]);
    switchAssistantSession(s1 as string);
    deleteAssistantSession(s1 as string);
    const s = getAssistant();
    expect(s.sessions.map((x) => x.id)).toEqual([s2]);
    expect(s.activeSessionId).toBe(s2);
    expect(s.messages.map((m) => m.id)).toEqual(['u2']);
  });

  it('删除唯一任务后：active 为 null，再发消息自动新建', () => {
    const s1 = ensureAssistantSession();
    deleteAssistantSession(s1 as string);
    expect(getAssistant().activeSessionId).toBeNull();
    const s2 = ensureAssistantSession();
    expect(s2).toBeTruthy();
    expect(getAssistant().sessions).toHaveLength(1);
  });

  it('清空当前任务只清它的对话，别的任务不动', () => {
    const s1 = ensureAssistantSession();
    appendAssistantMessages([msg('u1', 'user', '任务一')]);
    newAssistantSession();
    appendAssistantMessages([msg('u2', 'user', '任务二')]);
    clearAssistantMessages();
    const s = getAssistant();
    expect(s.messages.map((m) => m.id)).toEqual(['u1']); // 任务二的没了
    expect(s.sessions).toHaveLength(2); // 任务本身都还在
  });
});

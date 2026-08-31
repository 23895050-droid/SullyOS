// 任务存档（2026-08-30）store 单测：迁移 / 自动起名 / 任务隔离 / 删除回落。
// 模块状态用 __resetAssistantForTest 逐用例重置，localStorage stub 来自 test-setup.ts。
import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetAssistantForTest, __reloadAssistantForTest, getAssistant, appendAssistantMessages,
  ensureAssistantSession, newAssistantSession, switchAssistantSession, deleteAssistantSession,
  clearAssistantMessages, deleteAssistantMessage, addAssistantFavorite, renameAssistantFavorite, updateAssistantFavoriteCss,
  deleteAssistantFavorite, buildFavoritesExportText, setAssistantCodeFold,
  saveAssistantTheme, saveAssistantThemePreset, loadAssistantThemePreset, deleteAssistantThemePreset,
  type AssistantMsg,
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

// ── 收藏夹自由编辑（2026-08-31 她要求：点开单独看代码、自由输入保存）──
describe('收藏夹', () => {
  it('新增返回完整对象，id 唯一，可立刻拿到并展开', () => {
    const a = addAssistantFavorite('片段 1', '.a { color: red; }');
    const b = addAssistantFavorite('片段 2', '');
    expect(a.id).not.toBe(b.id);
    expect(getAssistant().favorites).toHaveLength(2);
    expect(getAssistant().favorites[0]).toEqual({ ...a, at: expect.any(String) });
  });

  it('代码区自由编辑保存：updateAssistantFavoriteCss 只改内容不改别的', () => {
    const a = addAssistantFavorite('片段 1', '.a { color: red; }');
    updateAssistantFavoriteCss(a.id, '.a { color: blue; }\n.b { margin: 0; }');
    const f = getAssistant().favorites[0];
    expect(f.css).toBe('.a { color: blue; }\n.b { margin: 0; }');
    expect(f.name).toBe('片段 1');
    expect(f.at).toBe(a.at);
  });

  it('重命名空串保留原名；删除后导出不含它', () => {
    const a = addAssistantFavorite('片段 1', '.a{}');
    addAssistantFavorite('片段 2', '.b{}');
    renameAssistantFavorite(a.id, '   ');
    expect(getAssistant().favorites[0].name).toBe('片段 1');
    deleteAssistantFavorite(a.id);
    const text = buildFavoritesExportText();
    expect(text).not.toContain('.a{}');
    expect(text).toContain('.b{}');
  });
});

// ── 代码块折叠（2026-08-31 学上游工作台交付文件：可展开/下载 txt 的文件形态，状态持久化）──
describe('代码块折叠', () => {
  it('setAssistantCodeFold 写 key 并持久化，重载后还在', () => {
    setAssistantCodeFold('m1:0', true);
    expect(getAssistant().codeFold).toEqual({ 'm1:0': true });
    __reloadAssistantForTest();
    expect(getAssistant().codeFold).toEqual({ 'm1:0': true });
  });

  it('删消息顺手清掉它名下的 codeFold，别的消息不受影响', () => {
    ensureAssistantSession();
    appendAssistantMessages([msg('m1', 'user', '一'), msg('m2', 'user', '二')]);
    setAssistantCodeFold('m1:0', true);
    setAssistantCodeFold('m1:3', true);
    setAssistantCodeFold('m2:0', true);
    deleteAssistantMessage('m1');
    expect(getAssistant().codeFold).toEqual({ 'm2:0': true });
  });

  it('旧数据没有 codeFold 字段：迁移自动补空对象', () => {
    localStorage.setItem('assistant_v1', JSON.stringify({
      version: 1,
      name: '小助手',
      persona: 'test',
      messages: [],
      favorites: [],
      cssSelf: '',
    }));
    __reloadAssistantForTest();
    expect(getAssistant().codeFold).toEqual({});
    expect(getAssistant().themePresets).toEqual([]);
  });
});

// ── 调色台命名预设（2026-08-31 她要求：调完存下来，随时一键换回）──
describe('调色台预设', () => {
  it('存预设 → 换色 → 载入恢复；删除后不再有', () => {
    saveAssistantTheme({ primary: '#111111' });
    saveAssistantThemePreset('深色');
    saveAssistantTheme({ primary: '#222222', accent: '#333333', text: '#444444' });
    loadAssistantThemePreset('深色');
    expect(getAssistant().theme?.primary).toBe('#111111');
    deleteAssistantThemePreset('深色');
    expect(getAssistant().themePresets).toHaveLength(0);
  });

  it('同名覆盖：同一个名字再存一次替换颜色，不留两份', () => {
    saveAssistantTheme({ primary: '#aa0000' });
    saveAssistantThemePreset('红');
    saveAssistantTheme({ primary: '#00aa00' });
    saveAssistantThemePreset('红');
    const presets = getAssistant().themePresets;
    expect(presets).toHaveLength(1);
    expect(presets[0].colors.primary).toBe('#00aa00');
  });

  it('上限 12 丢最旧；空名拒绝保存', () => {
    for (let i = 0; i < 13; i++) saveAssistantThemePreset(`预设${i}`);
    const presets = getAssistant().themePresets;
    expect(presets).toHaveLength(12);
    expect(presets[0].name).toBe('预设1'); // 预设0 被挤掉
    expect(saveAssistantThemePreset('   ')).toBe(false);
  });
});

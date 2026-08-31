// 小助手 store（2026-08-30 新建；当天改名通用化——不锁美化，以后可能做别的活）。
// 工作向的小 AI：当前工作是美化各页面 CSS 预设，模式切换靠页面选择器。
// 带版本号 + ISO 时间戳；专属 API 槽：不配置就不调用、不回退主 API（模型独立性）。
// 2026-08-30 任务存档：消息按「任务（会话）」分组，做完一个活就新建任务，不用删聊天记录。
import { useSyncExternalStore } from 'react';
import { deleteBlobRef } from './blobRef';

export interface AssistantMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** 用户消息可带图（blobRef，发给他看的多模态参考图） */
  imageRef?: string;
  /** 所属任务；旧数据迁移时补齐，此后每条都有 */
  sessionId?: string;
  at: string;
}

/** 任务存档（对标官方客户端的会话列表）：做完一个活就新建，历史随时翻出来接着聊 */
export interface AssistantSession {
  id: string;
  title: string;      // 自动取第一条用户消息前 18 字；空 = 「新任务」
  createdAt: string;
  updatedAt: string;
}

export interface AssistantFavorite {
  id: string;
  name: string;
  css: string;
  at: string;
}

/** 调色台命名预设（2026-08-31 她要求）：当前三色存起来，随时一键换回 */
export interface AssistantThemePreset {
  name: string;
  colors: { primary: string; accent: string; text: string };
  savedAt: string;
}

export interface AssistantV1 {
  version: 1;
  updatedAt: string;
  name: string;               // 轻量人设名（默认「小助手」）
  avatarRef?: string;         // 头像 blobRef
  persona: string;            // 轻量人设（可编辑）
  api?: { baseUrl: string; apiKey: string; model: string };
  messages: AssistantMsg[];   // 全局上限 400，丢最旧（跨任务共用上限）
  favorites: AssistantFavorite[]; // 收藏夹：挑中的 CSS 片段，可导出 txt
  /** 调色台（2026-08-30 她要求：紫色受不了）：主色/辅色/文字色，缺省用内置粉紫 */
  theme?: { primary?: string; accent?: string; text?: string };
  /** 调色台命名预设（2026-08-31）：上限 12 套，超了丢最旧 */
  themePresets: AssistantThemePreset[];
  /** 小助手自己页面的 CSS（2026-08-30）：美化他自己 */
  cssSelf: string;
  /** 任务存档（2026-08-30）：上限 30 个，超了丢最久没动的任务（连消息一起） */
  sessions: AssistantSession[];
  activeSessionId: string | null;
  /** 代码块折叠（2026-08-31 学上游工作台「交付文件」）：key = `${messageId}:${代码块序号}`，true = 折叠成文件卡 */
  codeFold: Record<string, boolean>;
}

const KEY = 'assistant_v1';
const MESSAGE_CAP = 400;      // 跨任务全局上限
const SESSION_CAP = 30;
const SESSION_MESSAGE_CAP = 120; // 单任务上限
const THEME_PRESET_CAP = 12; // 调色台预设上限
const NEW_TASK_TITLE = '新任务';
const isoNow = () => new Date().toISOString();
// 与 couple stores 同款：randomUUID 优先，老 WebView 回退时间戳+随机数（同毫秒建两个任务也不撞 id）
const uidLocal = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const DEFAULT_PERSONA =
  '你是她贴身的数字小助手。说话简洁、靠谱、说人话，不油腔滑调。' +
  '交给你的活就认真做完；拿不准的地方先给最稳妥的版本，再补一句可调项。';

const DEFAULT: AssistantV1 = {
  version: 1,
  updatedAt: '1970-01-01T00:00:00.000Z',
  name: '小助手',
  persona: DEFAULT_PERSONA,
  messages: [],
  favorites: [],
  cssSelf: '',
  sessions: [],
  activeSessionId: null,
  codeFold: {},
  themePresets: [],
};

/** 旧数据迁移：把任务存档之前的消息收进一个「默认任务」，保证升级无缝。 */
const migrateSessions = (s: AssistantV1): AssistantV1 => {
  // 脏数据防御：sessions 必须是有效数组，否则从空开始重算
  const sessions = Array.isArray(s.sessions) && s.sessions.every((x) => x && typeof x.id === 'string')
    ? s.sessions
    : [];
  const orphans = s.messages.filter((m) => !m.sessionId);
  let next = { ...s, sessions };
  if (orphans.length > 0) {
    const now = isoNow();
    const first = orphans[0];
    const session: AssistantSession = {
      id: `as-sess-${Date.now()}`,
      title: (first.role === 'user' && first.content.trim() ? first.content.trim().slice(0, 18) : '') || NEW_TASK_TITLE,
      createdAt: first.at || now,
      updatedAt: now,
    };
    next = {
      ...next,
      sessions: [...sessions, session],
      messages: s.messages.map((m) => (m.sessionId ? m : { ...m, sessionId: session.id })),
    };
  }
  // activeSessionId 必须指向真实存在的任务，否则回落到最新一个
  const activeOk = next.sessions.some((x) => x.id === next.activeSessionId);
  return {
    ...next,
    activeSessionId: activeOk
      ? (next.activeSessionId as string)
      : (next.sessions[next.sessions.length - 1]?.id ?? null),
  };
};

const load = (): AssistantV1 => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<AssistantV1>;
    const base = { ...DEFAULT, ...parsed };
    // 旧数据没有 codeFold 字段 → 补空对象（折叠状态从零开始）
    if (!base.codeFold || typeof base.codeFold !== 'object') base.codeFold = {};
    // 旧数据没有 themePresets → 补空数组
    if (!Array.isArray(base.themePresets)) base.themePresets = [];
    return migrateSessions(base);
  } catch {
    return DEFAULT;
  }
};

let state: AssistantV1 = load();
const listeners = new Set<() => void>();

const persist = () => {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 配额满放弃持久化 */ }
};
const setState = (next: AssistantV1) => {
  state = next;
  persist();
  listeners.forEach((l) => l());
};
const patch = (fn: (s: AssistantV1) => AssistantV1) => setState(fn({ ...state }));

export const useAssistant = (): AssistantV1 =>
  useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => state,
  );

export const getAssistant = (): AssistantV1 => state;

/** 仅测试用：把模块状态重置回默认（vitest 里每个用例之间隔离） */
export const __resetAssistantForTest = () => {
  state = { ...DEFAULT };
};

/** 仅测试用：重新从 localStorage 读一遍（测旧数据迁移路径） */
export const __reloadAssistantForTest = () => {
  state = load();
};

/** 名字 + 头像 + 人设（换头像时清旧 blobRef） */
export const saveAssistantProfile = (patch0: { name?: string; avatarRef?: string; persona?: string }) => {
  const prev = state.avatarRef;
  if (prev && patch0.avatarRef !== undefined && prev !== patch0.avatarRef) void deleteBlobRef(prev);
  patch((s) => ({
    ...s,
    name: (patch0.name ?? s.name).trim() || '小助手',
    avatarRef: patch0.avatarRef !== undefined ? patch0.avatarRef : s.avatarRef,
    persona: patch0.persona !== undefined ? patch0.persona : s.persona,
    updatedAt: isoNow(),
  }));
};

export const saveAssistantApi = (api: { baseUrl: string; apiKey: string; model: string }) =>
  patch((s) => ({ ...s, api, updatedAt: isoNow() }));

const touchSession = (sessions: AssistantSession[], sessionId: string, now: string): AssistantSession[] =>
  sessions.map((x) => (x.id === sessionId ? { ...x, updatedAt: now } : x));

/** 自动起名：任务还是「新任务」且来了第一条用户消息 → 用它的前 18 字当标题 */
const autoTitleSession = (s: AssistantV1, msgs: AssistantMsg[], now: string): AssistantSession[] => {
  const firstUser = msgs.find((m) => m.role === 'user' && m.content.trim());
  if (!firstUser) return s.sessions;
  return s.sessions.map((x) =>
    x.id === s.activeSessionId && x.title === NEW_TASK_TITLE
      ? { ...x, title: firstUser.content.trim().slice(0, 18), updatedAt: now }
      : x,
  );
};

/** 当前任务没有就现建一个（send 之前调用），返回 activeSessionId */
export const ensureAssistantSession = (): string | null => {
  if (state.activeSessionId && state.sessions.some((x) => x.id === state.activeSessionId)) {
    return state.activeSessionId;
  }
  const now = isoNow();
  const session: AssistantSession = { id: `as-sess-${uidLocal()}`, title: NEW_TASK_TITLE, createdAt: now, updatedAt: now };
  patch((s) => ({ ...s, sessions: [...s.sessions, session], activeSessionId: session.id, updatedAt: now }));
  return session.id;
};

export const appendAssistantMessages = (msgs: AssistantMsg[]) =>
  patch((s) => {
    const sessionId = s.activeSessionId;
    if (!sessionId) return s; // 没有任务就不落盘（理论上 send 前已 ensure）
    const now = isoNow();
    const stamped = msgs.map((m) => ({ ...m, sessionId }));
    const merged = [...s.messages, ...stamped];
    // 单任务上限：当前任务超过就丢它最旧的
    const inSession = merged.filter((m) => m.sessionId === sessionId);
    const trimmed = inSession.length > SESSION_MESSAGE_CAP
      ? merged.filter((m) => !(m.sessionId === sessionId && inSession.indexOf(m) < inSession.length - SESSION_MESSAGE_CAP))
      : merged;
    return {
      ...s,
      messages: trimmed.slice(-MESSAGE_CAP),
      sessions: touchSession(autoTitleSession(s, msgs, now), sessionId, now),
      updatedAt: now,
    };
  });

export const editAssistantMessage = (id: string, content: string) =>
  patch((s) => ({
    ...s,
    messages: s.messages.map((m) => (m.id === id ? { ...m, content } : m)),
    updatedAt: isoNow(),
  }));

export const deleteAssistantMessage = (id: string) =>
  patch((s) => ({
    ...s,
    messages: s.messages.filter((m) => m.id !== id),
    codeFold: pruneCodeFold(s.codeFold, new Set([id])),
    updatedAt: isoNow(),
  }));

/** 清空「当前任务」的聊天记录（任务本身保留，标题不清） */
export const clearAssistantMessages = () =>
  patch((s) => ({
    ...s,
    messages: s.messages.filter((m) => m.sessionId !== s.activeSessionId),
    codeFold: pruneCodeFold(s.codeFold, new Set(s.messages.filter((m) => m.sessionId === s.activeSessionId).map((m) => m.id))),
    updatedAt: isoNow(),
  }));

/** 批量删除（2026-08-30 多选）：连图清 blobRef */
export const deleteAssistantMessages = (ids: string[]) =>
  patch((s) => {
    const idSet = new Set(ids);
    s.messages.filter((m) => idSet.has(m.id)).forEach((m) => { if (m.imageRef) void deleteBlobRef(m.imageRef); });
    return { ...s, messages: s.messages.filter((m) => !idSet.has(m.id)), codeFold: pruneCodeFold(s.codeFold, idSet), updatedAt: isoNow() };
  });

// ── 任务存档（2026-08-30）：新建 / 切换 / 删除 ──

export const newAssistantSession = () => {
  const now = isoNow();
  const session: AssistantSession = { id: `as-sess-${uidLocal()}`, title: NEW_TASK_TITLE, createdAt: now, updatedAt: now };
  patch((s) => {
    let sessions = [...s.sessions, session];
    // 超过上限：丢最久没动的任务（连它的消息一起）
    if (sessions.length > SESSION_CAP) {
      const drop = sessions
        .slice()
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
      sessions = sessions.filter((x) => x.id !== drop.id);
      const droppedIds = new Set([drop.id]);
      return {
        ...s,
        sessions,
        activeSessionId: session.id,
        messages: s.messages.filter((m) => !droppedIds.has(m.sessionId ?? '')),
        codeFold: pruneCodeFold(s.codeFold, droppedIds),
        updatedAt: now,
      };
    }
    return { ...s, sessions, activeSessionId: session.id, updatedAt: now };
  });
};

export const switchAssistantSession = (id: string) =>
  patch((s) => (s.sessions.some((x) => x.id === id) ? { ...s, activeSessionId: id, updatedAt: isoNow() } : s));

export const deleteAssistantSession = (id: string) =>
  patch((s) => {
    const target = s.sessions.find((x) => x.id === id);
    if (!target) return s;
    // 清这个任务的图（blobRef），消息一起删
    s.messages.filter((m) => m.sessionId === id).forEach((m) => { if (m.imageRef) void deleteBlobRef(m.imageRef); });
    const droppedIds = new Set(s.messages.filter((m) => m.sessionId === id).map((m) => m.id));
    const sessions = s.sessions.filter((x) => x.id !== id);
    const nextActive = s.activeSessionId === id
      ? (sessions[sessions.length - 1]?.id ?? null)
      : s.activeSessionId;
    return {
      ...s,
      sessions,
      activeSessionId: nextActive,
      messages: s.messages.filter((m) => m.sessionId !== id),
      codeFold: pruneCodeFold(s.codeFold, droppedIds),
      updatedAt: isoNow(),
    };
  });

/** 调色台（2026-08-30）：缺省回内置粉紫 */
export const saveAssistantTheme = (theme: { primary?: string; accent?: string; text?: string }) =>
  patch((s) => ({ ...s, theme: { ...s.theme, ...theme }, updatedAt: isoNow() }));

export const resetAssistantTheme = () =>
  patch((s) => ({ ...s, theme: undefined, updatedAt: isoNow() }));

// ── 调色台命名预设（2026-08-31 她要求，仿情侣页 couplePaletteStore）──

/** 当前三色存成命名预设：同名覆盖（和情侣页调色台一致）；缺色补默认；上限 12 丢最旧。返回是否成功 */
export const saveAssistantThemePreset = (name: string): boolean => {
  const n = name.trim();
  if (!n) return false;
  const t = state.theme;
  const preset: AssistantThemePreset = {
    name: n,
    colors: { primary: t?.primary ?? '#c96a8e', accent: t?.accent ?? '#e3a4bc', text: t?.text ?? '#3d3340' },
    savedAt: isoNow(),
  };
  patch((s) => ({
    ...s,
    themePresets: [...s.themePresets.filter((p) => p.name !== n), preset].slice(-THEME_PRESET_CAP),
    updatedAt: isoNow(),
  }));
  return true;
};

/** 预设写回调色台（找不到就什么都不做） */
export const loadAssistantThemePreset = (name: string) =>
  patch((s) => {
    const p = s.themePresets.find((x) => x.name === name);
    return p ? { ...s, theme: { ...p.colors }, updatedAt: isoNow() } : s;
  });

export const deleteAssistantThemePreset = (name: string) =>
  patch((s) => ({ ...s, themePresets: s.themePresets.filter((x) => x.name !== name), updatedAt: isoNow() }));

/** 小助手自己页面的 CSS（2026-08-30）：追加式 */
export const saveAssistantCssSelf = (css: string) =>
  patch((s) => ({ ...s, cssSelf: css, updatedAt: isoNow() }));

/** 代码块折叠（2026-08-31 学上游工作台）：true = 该代码块在消息流里以「交付文件」形态显示，重启后还在 */
export const setAssistantCodeFold = (key: string, folded: boolean) =>
  patch((s) => ({ ...s, codeFold: { ...s.codeFold, [key]: folded }, updatedAt: isoNow() }));

/** 删消息时顺手清掉它名下的 codeFold key（key = `${messageId}:${序号}`；孤儿 key 无害，这里顺手做掉） */
const pruneCodeFold = (fold: Record<string, boolean>, msgIds: Set<string>): Record<string, boolean> =>
  Object.fromEntries(Object.entries(fold).filter(([k]) => !msgIds.has(k.slice(0, k.indexOf(':')))));

/** 收藏夹（CSS 片段）：id 自动生成；返回新建对象方便 UI 直接展开它 */
export const addAssistantFavorite = (name: string, css: string): AssistantFavorite => {
  const fav: AssistantFavorite = { id: `fav-${uidLocal()}`, name: name.trim() || `片段 ${state.favorites.length + 1}`, css, at: isoNow() };
  patch((s) => ({ ...s, favorites: [...s.favorites, fav], updatedAt: isoNow() }));
  return fav;
};

export const renameAssistantFavorite = (id: string, name: string) =>
  patch((s) => ({
    ...s,
    favorites: s.favorites.map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f)),
    updatedAt: isoNow(),
  }));

/** 收藏夹内容自由编辑保存（2026-08-31 她要求）：代码区可自由输入 */
export const updateAssistantFavoriteCss = (id: string, css: string) =>
  patch((s) => ({
    ...s,
    favorites: s.favorites.map((f) => (f.id === id ? { ...f, css } : f)),
    updatedAt: isoNow(),
  }));

export const deleteAssistantFavorite = (id: string) =>
  patch((s) => ({
    ...s,
    favorites: s.favorites.filter((f) => f.id !== id),
    updatedAt: isoNow(),
  }));

/** 导出收藏夹成 txt 文本（Blob 下载在 UI 层做） */
export const buildFavoritesExportText = (): string => {
  const { favorites, name } = state;
  const header = `${name} 的收藏夹 · 导出 ${new Date().toLocaleString('zh-CN')}\n\n`;
  const body = favorites.map((f) => `/* ── ${f.name}（收藏于 ${f.at}）── */\n${f.css}`).join('\n\n');
  return header + body;
};

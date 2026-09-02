// 生理期 store（2026-08-22）——noxhome 库的第一个 store，定规范：
// 版本号 + ISO 时间戳 + owner 字段，从第一天就带（给最后的回流/同步预留地基）
// 存 localStorage（couple_period_v1），轻量数据不占 IndexedDB；写失败时内存态照常可用
// 事件 = 经期 / PMDD / 性生活 三种，全部可勾状态标签（症状）；痛经 ≥ 阈值自动排「吃止痛药」提醒

import { useSyncExternalStore } from 'react';
import type { CycleEvent, CycleEventType, FlowLevel, SymptomKey } from '../../utils/periodMath';

const KEY = 'couple_period_v1';
export const PERIOD_STORE_VERSION = 1;

// ── 类型 ──

export interface MedReminder {
  id: string;
  date: string;        // YYYY-MM-DD（当天）
  text: string;        // 如「吃止痛药」
  done: boolean;
  createdAt: string;   // ISO
  owner: string;       // 'her'
}

export interface PeriodApiConfig {
  baseUrl: string;     // 已带 /v1 后缀，代码里不再补（模型独立性：不配置就不调用，不回退别的模型）
  apiKey: string;
  model: string;
}

export interface PeriodSettings {
  periodLenDefault: number; // 平均经期天数缺失时的兜底（默认 5）
  painThreshold: number;    // 痛经等级 ≥ 此值 → 自动排吃止痛药（默认 7，可调）
  api: PeriodApiConfig;     // 健康小结 + 月经小助手共用
}

export interface PeriodStore {
  version: number;          // = PERIOD_STORE_VERSION
  updatedAt: string;        // ISO
  events: CycleEvent[];
  medReminders: MedReminder[];
  settings: PeriodSettings;
}

// ── 默认值 ──

const DEFAULT_STORE: PeriodStore = {
  version: PERIOD_STORE_VERSION,
  updatedAt: '1970-01-01T00:00:00.000Z',
  events: [],
  medReminders: [],
  settings: {
    periodLenDefault: 5,
    painThreshold: 7,
    api: { baseUrl: '', apiKey: '', model: '' },
  },
};

function load(): PeriodStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_STORE };
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== PERIOD_STORE_VERSION) return { ...DEFAULT_STORE };
    return {
      ...DEFAULT_STORE,
      ...parsed,
      events: Array.isArray(parsed.events) ? parsed.events : [],
      medReminders: Array.isArray(parsed.medReminders) ? parsed.medReminders : [],
      settings: { ...DEFAULT_STORE.settings, ...(parsed.settings ?? {}), api: { ...DEFAULT_STORE.settings.api, ...(parsed.settings?.api ?? {}) } },
    };
  } catch {
    return { ...DEFAULT_STORE };
  }
}

let state = load();
const listeners = new Set<() => void>();

// 导入备份后现场重读（同窗口 setItem 不触发 storage 事件；广播由 ourDataBackup 导入收尾发出）
if (typeof window !== 'undefined') {
  window.addEventListener('our-backup-imported', () => {
    state = load();
    listeners.forEach((l) => l());
  });
}

function commit(next: PeriodStore) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 配额满：数据极小，一般到不了；内存态继续可用，下次写入再试
  }
  listeners.forEach((l) => l());
}

const uid = (): string =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const isoNow = () => new Date().toISOString();

// ── 事件 CRUD ──

export function upsertPeriodEvent(input: Partial<CycleEvent> & { type: CycleEventType; date: string }): CycleEvent {
  const existing = input.id ? state.events.find((e) => e.id === input.id) : undefined;
  const ev: CycleEvent = {
    id: input.id ?? uid(),
    type: input.type,
    date: input.date,
    flow: input.flow,
    pain: input.pain,
    symptoms: input.symptoms ?? [],
    note: input.note ?? '',
    createdAt: existing?.createdAt ?? isoNow(),
    updatedAt: isoNow(),
    owner: 'her',
  };
  const events = existing ? state.events.map((e) => (e.id === ev.id ? ev : e)) : [...state.events, ev];
  commit({ ...state, events, updatedAt: isoNow() });
  return ev;
}

export function deletePeriodEvent(id: string) {
  commit({ ...state, events: state.events.filter((e) => e.id !== id), updatedAt: isoNow() });
}

/** 快捷标红：当天有经期记录就全部撤掉，没有就建一条（默认流量中等）→ 返回是否标上 */
export function quickTogglePeriod(dateKey: string): boolean {
  const has = state.events.some((e) => e.date === dateKey && e.type === 'period');
  if (has) {
    commit({ ...state, events: state.events.filter((e) => !(e.date === dateKey && e.type === 'period')), updatedAt: isoNow() });
    return false;
  }
  upsertPeriodEvent({ type: 'period', date: dateKey, flow: 'medium', pain: 0, symptoms: [] });
  return true;
}

// ── 吃药提醒 ──

/** 痛经 ≥ 阈值 → 当天自动排「吃止痛药」；同一天已有则跳过。返回新建的提醒或 null */
export function ensureMedReminder(dateKey: string, pain: number): MedReminder | null {
  if (pain < state.settings.painThreshold) return null;
  if (state.medReminders.some((r) => r.date === dateKey)) return null;
  const r: MedReminder = { id: uid(), date: dateKey, text: '吃止痛药', done: false, createdAt: isoNow(), owner: 'her' };
  commit({ ...state, medReminders: [...state.medReminders, r], updatedAt: isoNow() });
  return r;
}

export function toggleMedReminder(id: string) {
  commit({
    ...state,
    medReminders: state.medReminders.map((r) => (r.id === id ? { ...r, done: !r.done } : r)),
    updatedAt: isoNow(),
  });
}

export function deleteMedReminder(id: string) {
  commit({ ...state, medReminders: state.medReminders.filter((r) => r.id !== id), updatedAt: isoNow() });
}

// ── 设置 ──

export function updatePeriodSettings(patch: Partial<PeriodSettings>) {
  commit({
    ...state,
    settings: {
      ...state.settings,
      ...patch,
      api: { ...state.settings.api, ...(patch.api ?? {}) },
    },
    updatedAt: isoNow(),
  });
}

// ── 订阅（useSyncExternalStore：CouplePeriod / 组合卡 / 日常页共享同一份响应式状态） ──

export function usePeriodStore(): PeriodStore {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => state,
  );
}

export function getPeriodStore(): PeriodStore {
  return state;
}

// 快捷取今日的吃药提醒（组合卡/日常页用）
export function medRemindersOn(dateKey: string): MedReminder[] {
  return state.medReminders.filter((r) => r.date === dateKey);
}

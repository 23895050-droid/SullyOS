// 活动 store（2026-08-23）——append-only 日常活动日志，活动页按日期时间轴展示
// 谁写：todoStore（加待办/勾待办）、annivStore（加纪念日）、快捷记账（写银行后）、饮食（记饮食后）
// 规范：version + ISO 时间戳 + owner（her 粉 / me 蓝 / together 紫）；上限 2000 条，超出丢最旧
// 月经记录不重复进这里：活动页把 activityStore + periodStore 两源合并渲染
import { createCoupleStore, isoNow, uid } from './coupleStoreBase';
import { getLocalDateKey } from '../../utils/localDate';

export type ActivityKind = 'todo_add' | 'todo_toggle' | 'anniv_add' | 'bank' | 'diet' | 'diary' | 'board' | 'together' | 'music';

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  date: string;   // YYYY-MM-DD（事件所属日）
  text: string;
  owner: 'her' | 'me' | 'together';
  createdAt: string; // ISO
  updatedAt: string;
}

export interface ActivityStore {
  version: number;
  updatedAt: string;
  events: ActivityEvent[];
}

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  todo_add: '待办',
  todo_toggle: '待办',
  anniv_add: '纪念日',
  bank: '记账',
  diet: '饮食',
  diary: '日记',
  board: '留言',
  together: '和Ta',
  music: '音乐',
};

export const ACTIVITY_OWNER_COLORS: Record<ActivityEvent['owner'], string> = {
  her: '#f0a8c0',
  me: '#5b9cf0',
  together: '#a78bfa',
};

const MAX_EVENTS = 2000;

const store = createCoupleStore<ActivityStore>('couple_activity_v1', 1, {
  version: 1,
  updatedAt: '1970-01-01T00:00:00.000Z',
  events: [],
});

export const useActivityStore = store.use;
export const getActivityStore = store.get;

export function addActivity(input: { kind: ActivityKind; date?: string; text: string; owner?: string }): ActivityEvent {
  const ev: ActivityEvent = {
    id: uid(),
    kind: input.kind,
    date: input.date ?? getLocalDateKey(),
    text: input.text,
    // 调用方的 owner 是 string，这里收窄到三种（her 粉 / me 蓝 / together 紫）
    owner: input.owner === 'me' || input.owner === 'together' ? input.owner : 'her',
    createdAt: isoNow(),
    updatedAt: isoNow(),
  };
  store.set((s) => {
    const events = [...s.events, ev];
    // 上限裁剪：丢最旧的
    const trimmed = events.length > MAX_EVENTS ? events.slice(events.length - MAX_EVENTS) : events;
    return { ...s, events: trimmed, updatedAt: isoNow() };
  });
  return ev;
}

export function deleteActivity(id: string) {
  store.set((s) => ({ ...s, events: s.events.filter((e) => e.id !== id), updatedAt: isoNow() }));
}

/** 某天的活动（时间倒序：新的在前） */
export function activitiesOn(date: string): ActivityEvent[] {
  return store
    .get()
    .events.filter((e) => e.date === date)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

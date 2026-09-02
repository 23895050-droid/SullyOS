// couple store 工厂（2026-08-22）——localStorage + useSyncExternalStore 的最小封装
// 规范同 periodStore：version + ISO updatedAt + 每条数据带 owner；写失败内存态兜底
import { useSyncExternalStore } from 'react';

export interface CoupleStoreApi<T> {
  get: () => T;
  set: (updater: (s: T) => T) => void;
  use: () => T;
}

export const uid = (): string =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
export const isoNow = () => new Date().toISOString();

const clone = <X,>(v: X): X => JSON.parse(JSON.stringify(v)) as X;

export function createCoupleStore<T extends { version: number; updatedAt: string }>(
  key: string,
  version: number,
  defaults: T,
  patch?: (parsed: T) => T,
): CoupleStoreApi<T> {
  let state: T = clone(defaults);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as T;
      if (parsed && parsed.version === version) state = patch ? patch(parsed) : { ...defaults, ...parsed };
    }
  } catch {
    // 保持默认
  }
  const listeners = new Set<() => void>();
  // 导入备份后现场重读（同窗口 setItem 不触发 storage 事件；广播由 ourDataBackup 导入收尾发出，不用刷新页面）
  if (typeof window !== 'undefined') {
    window.addEventListener('our-backup-imported', () => {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as T;
          if (parsed && parsed.version === version) state = patch ? patch(parsed) : { ...defaults, ...parsed };
        }
      } catch {
        // 保持现状
      }
      listeners.forEach((l) => l());
    });
  }
  return {
    get: () => state,
    set: (updater) => {
      state = updater(state);
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch {
        // 内存态兜底
      }
      listeners.forEach((l) => l());
    },
    use: () =>
      useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => {
            listeners.delete(cb);
          };
        },
        () => state,
      ),
  };
}

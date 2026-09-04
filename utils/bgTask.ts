// utils/bgTask.ts（2026-09-05，反馈1 批0）——总结类「后台生成」基建
//
// 解决的问题：生成类 API 调用（听歌总结/冰箱总结/日记生成/留言/小助手…）几十秒起步，
// 用户在生成页「坐牢」不能走。现在点生成 → pending 写进 feature store 顶层字段
// （用 coupleStoreBase 工厂的 store 自动获得订阅/持久化/导入重读三件）→ fn 在后台跑完
// 自己把结果写回 store。组件用 store.use() 订阅：离开页面再回来照常显示「生成中」，
// 完成时结果落库、pending 清掉——SPA 内切页不断线（模块级 store 活着，promise 照跑）。
//
// 页面真的重载（promise 死了）时靠 isBgTaskStale：running 但 startedAt 超过
// BG_TASK_STALE_MS = 上次没跑完，UI 显示「上次生成中断」给重试按钮；新一次
// startBgTask 会直接接管。失败也是可重试态：pending 里留 error 文案，重试就是再点一次。
//
// 与 pendingDiary 的区别：那边是「网络副作用最终一致」（预写队列 + 回前台重放），
// 这边是「长 API 生成不打断」（一条 running 态 + 完成落库），不自动重放——生成重放
// 会重复烧 API 钱，失败留给用户手动重试。

export interface BgTaskPending {
  status: 'running' | 'failed';
  key: string;
  startedAt: number;
  error?: string;
}

export const BG_TASK_STALE_MS = 10 * 60 * 1000;

/** running 且 startedAt 超过 10 分钟 = promise 已死（页面重载过），可被新任务接管 */
export const isBgTaskStale = (p: BgTaskPending | null | undefined, now = Date.now()): boolean =>
  !!p && p.status === 'running' && now - p.startedAt > BG_TASK_STALE_MS;

interface BgTaskStore<S> {
  get: () => S;
  set: (updater: (s: S) => S) => void;
}

/**
 * 发起一次后台生成。fn 负责「调用 API + 把结果写回 store」（util 不碰结果，只管 pending 生命周期）。
 * 返回 true = 已开始；false = 该字段已有新鲜 running（防止重入，调用方静默忽略即可）。
 */
export async function startBgTask<S extends Record<string, unknown>>(
  store: BgTaskStore<S>,
  field: keyof S,
  key: string,
  fn: () => Promise<void>,
): Promise<boolean> {
  const cur = store.get()[field] as BgTaskPending | null | undefined;
  if (cur?.status === 'running' && !isBgTaskStale(cur)) return false;
  store.set((s) => ({ ...s, [field]: { status: 'running', key, startedAt: Date.now() } as BgTaskPending }));
  try {
    await fn();
    clearBgTask(store, field);
  } catch (e) {
    store.set((s) => ({
      ...s,
      [field]: {
        status: 'failed',
        key,
        startedAt: Date.now(),
        error: e instanceof Error ? e.message : String(e),
      } as BgTaskPending,
    }));
  }
  return true;
}

/** 清掉字段的 pending（手动取消 / 结果已确认时用）。undefined 值 JSON 序列化时自然消失，持久层干净。 */
export function clearBgTask<S extends Record<string, unknown>>(store: BgTaskStore<S>, field: keyof S): void {
  store.set((s) => ({ ...s, [field]: undefined }));
}

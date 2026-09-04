import { describe, it, expect, vi } from 'vitest';
import { startBgTask, clearBgTask, isBgTaskStale, BG_TASK_STALE_MS, type BgTaskPending } from './bgTask';

// 假 store：结构对齐 coupleStoreBase 的 get/set（订阅无关紧要，这里只钉状态机本身）
type FakeState = { pending?: BgTaskPending; result?: string } & Record<string, unknown>;
const makeStore = () => {
  let state: FakeState = {};
  return {
    get: () => state,
    set: (u: (s: FakeState) => FakeState) => {
      state = u(state);
    },
  };
};

describe('startBgTask 生命周期', () => {
  it('成功：fn 里写的结果落库，pending 被清掉', async () => {
    const store = makeStore();
    const started = await startBgTask(store, 'pending', 'k', async () => {
      store.set((s) => ({ ...s, result: '生成好了' }));
    });
    expect(started).toBe(true);
    expect(store.get().result).toBe('生成好了');
    expect(store.get().pending).toBeUndefined();
  });

  it('失败：pending 留 failed + error 文案（结果由 fn 自己负责写，失败时不该写）', async () => {
    const store = makeStore();
    await startBgTask(store, 'pending', 'k', async () => {
      throw new Error('API 挂了');
    });
    expect(store.get().pending).toMatchObject({ status: 'failed', key: 'k', error: 'API 挂了' });
    expect(store.get().result).toBeUndefined();
  });

  it('失败后可重试：再点一次照常跑', async () => {
    const store = makeStore();
    const fn = vi.fn().mockRejectedValueOnce(new Error('第一次挂了')).mockResolvedValueOnce(undefined);
    await startBgTask(store, 'pending', 'k', fn);
    expect(store.get().pending?.status).toBe('failed');
    const started = await startBgTask(store, 'pending', 'k', fn);
    expect(started).toBe(true);
    expect(store.get().pending).toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('新鲜 running 时重入被拒，fn 只跑一次', async () => {
    const store = makeStore();
    let release!: () => void;
    const fn = vi.fn(() => new Promise<void>((r) => { release = r; }));
    const p1 = startBgTask(store, 'pending', 'k', fn);
    // startBgTask 在第一个 await 前已同步写入 running——此刻再发应被拒
    const started2 = await startBgTask(store, 'pending', 'k', vi.fn());
    expect(started2).toBe(false);
    release();
    await p1;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('running 已过期（页面重载过）→ 新任务直接接管', async () => {
    const store = makeStore();
    store.set((s) => ({ ...s, pending: { status: 'running', key: 'k', startedAt: Date.now() - BG_TASK_STALE_MS - 1 } }));
    const fn = vi.fn().mockResolvedValue(undefined);
    const started = await startBgTask(store, 'pending', 'k', fn);
    expect(started).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(store.get().pending).toBeUndefined();
  });

  it('clearBgTask 手动清 pending', () => {
    const store = makeStore();
    store.set((s) => ({ ...s, pending: { status: 'failed', key: 'k', startedAt: 1, error: 'x' } }));
    clearBgTask(store, 'pending');
    expect(store.get().pending).toBeUndefined();
  });

  it('pending 清掉后 JSON 持久化不留 undefined 键（导入重读安全）', async () => {
    const store = makeStore();
    await startBgTask(store, 'pending', 'k', async () => {});
    expect(JSON.parse(JSON.stringify(store.get())).pending).toBeUndefined();
  });
});

describe('isBgTaskStale', () => {
  const p = (status: BgTaskPending['status'], age: number): BgTaskPending => ({ status, key: 'k', startedAt: Date.now() - age });

  it('新鲜 running 不过期 / 超时 running 过期', () => {
    expect(isBgTaskStale(p('running', 1000))).toBe(false);
    expect(isBgTaskStale(p('running', BG_TASK_STALE_MS + 1))).toBe(true);
  });

  it('failed / undefined / null 一律不算过期（failed 本来就允许重试）', () => {
    expect(isBgTaskStale(p('failed', BG_TASK_STALE_MS * 3))).toBe(false);
    expect(isBgTaskStale(undefined)).toBe(false);
    expect(isBgTaskStale(null)).toBe(false);
  });
});

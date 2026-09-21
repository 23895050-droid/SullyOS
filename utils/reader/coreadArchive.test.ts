// 归档水位线的纯函数（她 09-16 照 TRPG 定的规矩：攒够阈值就总结，最新那条留着做衔接；
// 09-21 她把默认阈值从 31 改成 10——攒太多会糊成一团）；
// 09-20 拆成「口径 × 时机」两个维度）+ 后台任务胶囊的显示窗口。
// （放在 utils/reader 下是因为 vitest 的 include 只吃这几个目录）
import { describe, expect, it } from 'vitest';
import { archiveTake, countRecords, planArchive } from '../../apps/reader/coreadArchive';
import { DEFAULT_RULE } from '../../apps/reader/coreadStore';
import { JOB_LINGER_MS, visibleJobs, type ReaderJob } from '../../apps/reader/readerJobs';

const T = DEFAULT_RULE.threshold;   // 10（她 09-21 改的）


describe('共读归档 · 「记录」口径（她 09-21 拍板）', () => {
    const t = (min: number) => new Date(Date.UTC(2026, 8, 21, 10, min)).toISOString();

    it('角色一次调用算一条', () => {
        expect(countRecords({ calls: [t(0), t(10), t(20)], hers: [] })).toBe(3);
    });

    it('她五分钟之内连着留下的一堆，合起来算一条', () => {
        expect(countRecords({ calls: [], hers: [t(0), t(1), t(2), t(4)] })).toBe(1);
    });

    it('隔开超过五分钟就算下一堆', () => {
        expect(countRecords({ calls: [], hers: [t(0), t(1), t(9), t(10)] })).toBe(2);
    });

    it('两边加起来才是记录数', () => {
        expect(countRecords({ calls: [t(3), t(30)], hers: [t(0), t(2), t(40), t(42)] })).toBe(4);
    });
});
describe('共读归档 · 水位线', () => {
    it('差一条还不总结（阈值才触发，最后那条留着做衔接）', () => {
        expect(planArchive({ pending: T - 1, threshold: T, force: false })).toBe(false);
    });
    it('阈值一到 → 触发；一次吃掉阈值减一条', () => {
        expect(planArchive({ pending: T, threshold: T, force: false })).toBe(true);
        expect(archiveTake({ pendingMsgs: T, force: false })).toBe(T - 1);
    });
    it('水位线推过之后，再看剩下的够不够再来一批', () => {
        expect(planArchive({ pending: T - 1, threshold: T, force: false })).toBe(false);
        expect(planArchive({ pending: T, threshold: T, force: false })).toBe(true);
    });
    it('共读结束（force）：不管攒没攒够都跑，没到水位线的部分一次补齐', () => {
        expect(planArchive({ pending: 7, threshold: T, force: true })).toBe(true);
        expect(archiveTake({ pendingMsgs: 7, force: true })).toBe(7);
    });
    it('一条没攒下就别空跑一趟', () => {
        expect(archiveTake({ pendingMsgs: 0, force: true })).toBe(0);
        expect(archiveTake({ pendingMsgs: 0, force: false })).toBe(0);
    });
    it('口径换一个只是换触发条件：按页数推时，攒够页数就触发（不看讨论条数）', () => {
        expect(planArchive({ pending: 10, threshold: 10, force: false })).toBe(true);
        expect(planArchive({ pending: 9, threshold: 10, force: false })).toBe(false);
    });
    it('默认规则本身：按记录、10 条、自动归档（她 09-21 拍板）', () => {
        expect(DEFAULT_RULE).toEqual({ metric: 'calls', threshold: 10, timing: 'auto' });
    });
});

const job = (over: Partial<ReaderJob>): ReaderJob => ({
    id: 'j1', kind: 'summary', charName: '阿一', bookTitle: '海边的书',
    state: 'running', message: '总结中…', startedAt: '2026-09-16T10:00:00.000Z', ...over,
});

describe('后台任务 · 胶囊显示窗口', () => {
    it('跑着的照常显示', () => {
        expect(visibleJobs([job({})], Date.parse('2026-09-16T10:00:10.000Z'))).toHaveLength(1);
    });
    it('刚跑完的留一会儿（她要看得见成功/失败）', () => {
        const base = Date.parse('2026-09-16T10:00:00.000Z');
        const j = job({ state: 'ok', endedAt: new Date(base + 1000).toISOString() });
        expect(visibleJobs([j], base + 2000)).toHaveLength(1);
        expect(visibleJobs([j], base + JOB_LINGER_MS + 2000)).toHaveLength(0);
    });
    it('没有结束时间的非 running 数据当「早该消失」处理', () => {
        expect(visibleJobs([job({ state: 'error', endedAt: undefined })], Date.now())).toHaveLength(0);
    });
});

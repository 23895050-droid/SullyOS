// 书房归档 · 两把尺子（她 09-25 文档定的）+ 后台任务胶囊的显示窗口。
//
// 尺子的纯函数本体住在 `utils/reader/readerTimeline`（那边有完整单测），这里只钉
// 「归档这一层怎么用它」：内容汇总每满 10 条**活动记录**；讨论摘要满 45 条归档较早的 30 条。
// （放在 utils/reader 下是因为 vitest 的 include 只吃这几个目录）
import { describe, expect, it } from 'vitest';
import { CONTENT_TAKE } from '../../apps/reader/coreadArchive';
import { DEFAULT_CHAT_LINES, DEFAULT_RULE } from '../../apps/reader/coreadStore';
import {
    ACTIVE_WINDOW, ARCHIVE_TAKE, CONTENT_TRIGGER, discussTake, planContentSummary, planDiscussArchive,
} from './readerTimeline';
import { JOB_LINGER_MS, visibleJobs, type ReaderJob } from '../../apps/reader/readerJobs';

describe('归档 · 两把尺子（她 09-25 文档）', () => {
    it('内容汇总：满 10 条活动记录才汇总一次；一趟最多吃 CONTENT_TAKE 条', () => {
        expect(planContentSummary(CONTENT_TRIGGER - 1)).toBe(false);
        expect(planContentSummary(CONTENT_TRIGGER)).toBe(true);
        expect(CONTENT_TAKE).toBeGreaterThanOrEqual(CONTENT_TRIGGER);
    });

    it('讨论摘要：可总结的记录满 45 条 → 归档较早的 30 条，活跃窗口留 15 条', () => {
        expect(planDiscussArchive(ARCHIVE_TAKE + ACTIVE_WINDOW - 1)).toBe(false);
        expect(planDiscussArchive(ARCHIVE_TAKE + ACTIVE_WINDOW)).toBe(true);
        expect(discussTake(ARCHIVE_TAKE + ACTIVE_WINDOW)).toBe(ARCHIVE_TAKE);
    });

    it('规则只剩时机这一件事：默认自动归档', () => {
        expect(DEFAULT_RULE.timing).toBe('auto');
    });

    it('带多少条聊天原文：核心人设 20 条、chat 同款 50 条（她 09-26）', () => {
        expect(DEFAULT_CHAT_LINES).toEqual({ focused: 20, immersive: 50 });
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

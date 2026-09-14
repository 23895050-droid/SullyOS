// 「在一起」天数单测（2026-09-14 G1）——实现住在 apps/couple/annivStore。
// 规则：优先 item.startYear + date；老数据没有 startYear 就从 note 里的 YYYY-MM-DD 解析；
// 都没有 = null（调用方显示占位，不瞎算）。天数口径与原占位常量一致：从起点到今天的整天数。
import { describe, expect, it } from 'vitest';
import { togetherStartKey, daysTogether, type Anniversary } from '../apps/couple/annivStore';

const anniv = (patch: Partial<Anniversary>): Anniversary => ({
  id: 'seed-together', title: '在一起', date: '06-21', emoji: '💙',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', owner: 'together',
  ...patch,
});

describe('togetherStartKey', () => {
  it('有 startYear 就用 startYear + date', () => {
    expect(togetherStartKey([anniv({ startYear: 2025 })])).toBe('2025-06-21');
  });

  it('老数据没有 startYear：从 note 的 YYYY-MM-DD 解析（个位数月份也补齐两位）', () => {
    expect(togetherStartKey([anniv({ note: '2024-1-5 在一起' })])).toBe('2024-01-05');
  });

  it('note 里没有日期 = null（不瞎猜）', () => {
    expect(togetherStartKey([anniv({ note: '就是要在一起' })])).toBeNull();
  });

  it('没有「在一起」这条记录 = null', () => {
    expect(togetherStartKey([anniv({ id: 'x', title: '第一次看电影' })])).toBeNull();
  });
});

describe('daysTogether', () => {
  it('从起点到今天的整天数（起点当天 = 0）', () => {
    const items = [anniv({ startYear: 2025 })];
    expect(daysTogether(items, new Date(2025, 5, 21, 10, 0, 0))).toBe(0);
    expect(daysTogether(items, new Date(2026, 5, 21))).toBe(365);
    expect(daysTogether(items, new Date(2026, 8, 13))).toBe(449);
  });

  it('起点在未来（改错了）兜到 0，不显示负数', () => {
    expect(daysTogether([anniv({ startYear: 2030 })], new Date(2026, 0, 1))).toBe(0);
  });

  it('没配日期 = null（首屏显示占位）', () => {
    expect(daysTogether([anniv({ note: '' })], new Date(2026, 0, 1))).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildCycles, markersForDay, phaseAt, predictNext, splitCycles,
} from './periodMath';

// 固定三组经期：06-01~05 / 06-30~07-04 / 07-28~08-01
// 完整周期：29 天、28 天 → 平均 floor(28.5) = 28 → 下次 08-25，经期窗口 08-25~08-29，排卵日 08-12
const BLEEDING = [
  '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05',
  '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04',
  '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01',
];

describe('splitCycles 周期分割', () => {
  it('相邻日期连续合并', () => {
    expect(splitCycles(['2026-06-01', '2026-06-02', '2026-06-03'])).toEqual([['2026-06-01', '2026-06-02', '2026-06-03']]);
  });

  it('中断 1 天（漏记）合并为同一次经期', () => {
    // 文档文字版规则：中断 1 天合并；若改为按伪代码 gap>=2 切分，把 periodMath 里阈值 3 改成 2，此用例同步改
    expect(splitCycles(['2026-06-01', '2026-06-02', '2026-06-04'])).toEqual([['2026-06-01', '2026-06-02', '2026-06-04']]);
  });

  it('中断 2 天开新周期', () => {
    expect(splitCycles(['2026-06-01', '2026-06-02', '2026-06-05'])).toEqual([['2026-06-01', '2026-06-02'], ['2026-06-05']]);
  });

  it('去重 + 乱序排序后再分割', () => {
    expect(splitCycles(['2026-06-02', '2026-06-01', '2026-06-01'])).toEqual([['2026-06-01', '2026-06-02']]);
  });
});

describe('buildCycles 周期列表', () => {
  it('完整周期带长度，最后一次进行中 length 为 null', () => {
    const cycles = buildCycles(BLEEDING);
    expect(cycles).toHaveLength(3);
    expect(cycles[0]).toEqual({ start: '2026-06-01', end: '2026-06-05', days: 5, length: 29, complete: true });
    expect(cycles[1].length).toBe(28);
    expect(cycles[2]).toMatchObject({ start: '2026-07-28', end: '2026-08-01', days: 5, length: null, complete: false });
  });
});

describe('predictNext 预测', () => {
  it('完整周期不足 2 个时不预测', () => {
    const p = predictNext(['2026-06-01', '2026-06-02']);
    expect(p.nextStart).toBeNull();
    expect(p.completeCount).toBe(0);
  });

  it('两个完整周期 → 平均值向下取整', () => {
    const p = predictNext(BLEEDING);
    expect(p.completeCount).toBe(2);
    expect(p.meanCycle).toBe(28);
    expect(p.nextStart).toBe('2026-08-25');
    expect(p.meanPeriodLen).toBe(5);
    expect(p.predictedPeriodEnd).toBe('2026-08-29');
  });

  it('短于最小周期长度（10 天）的周期不参与预测', () => {
    // 06-01~05 / 06-07~10（间隔 6 天，无效）/ 07-28~08-01（间隔 51 天）→ 有效完整周期只有 1 个 → 不预测
    const days = [
      '2026-06-01', '2026-06-05',
      '2026-06-07', '2026-06-10',
      '2026-07-28', '2026-08-01',
    ];
    const p = predictNext(days);
    expect(p.nextStart).toBeNull();
    expect(p.completeCount).toBe(1);
  });
});

describe('phaseAt 阶段判定', () => {
  const prediction = predictNext(BLEEDING);

  it('出血日 → 经期第 N 天（跨漏记日连续计数）', () => {
    // 06-01、06-02、06-04 是同一周期（中断 1 天合并），06-04 是第 3 天
    const days = ['2026-06-01', '2026-06-02', '2026-06-04'];
    const p = phaseAt('2026-06-04', days, predictNext(days));
    expect(p.phase).toBe('period');
    expect(p.day).toBe(3);
  });

  it('过了预计开始日但没记录 → 预计经期', () => {
    const p = phaseAt('2026-08-26', BLEEDING, prediction);
    expect(p.phase).toBe('predicted-period');
    expect(p.day).toBe(2);
    expect(p.daysToNext).toBe(0);
  });

  it('排卵日 = 下次经期 - 13', () => {
    const p = phaseAt('2026-08-12', BLEEDING, prediction);
    expect(p.phase).toBe('ovulation');
    expect(p.daysToNext).toBe(13);
  });

  it('排卵次日 → 黄体期第 1 天', () => {
    const p = phaseAt('2026-08-13', BLEEDING, prediction);
    expect(p.phase).toBe('luteal');
    expect(p.day).toBe(1);
    expect(p.daysToNext).toBe(12);
  });

  it('经期结束次日 → 卵泡期第 1 天', () => {
    const p = phaseAt('2026-08-02', BLEEDING, prediction);
    expect(p.phase).toBe('follicular');
    expect(p.day).toBe(1);
  });

  it('第一次记录之前 → 未知', () => {
    const p = phaseAt('2026-05-20', BLEEDING, prediction);
    expect(p.phase).toBe('unknown');
  });

  it('完全没有记录 → 未知', () => {
    const p = phaseAt('2026-08-20', [], predictNext([]));
    expect(p.phase).toBe('unknown');
  });
});

describe('markersForDay 日历标记', () => {
  const prediction = predictNext(BLEEDING);
  const bleeding = new Set(BLEEDING);
  const sets = { bleeding, pmdd: new Set<string>(['2026-08-20']), sex: new Set<string>(['2026-08-20']) };

  it('实际出血日只标 period，不标 predicted', () => {
    const m = markersForDay('2026-06-02', sets, prediction);
    expect(m).toEqual(['period']);
  });

  it('预测窗口标 predicted', () => {
    expect(markersForDay('2026-08-26', sets, prediction)).toEqual(['predicted']);
  });

  it('排卵日标 ovulation，黄体期标 luteal', () => {
    expect(markersForDay('2026-08-12', sets, prediction)).toEqual(['ovulation']);
    expect(markersForDay('2026-08-20', sets, prediction)).toEqual(['pmdd', 'sex', 'luteal']);
  });

  it('窗口外的未来日期无标记', () => {
    expect(markersForDay('2026-09-10', sets, prediction)).toEqual([]);
  });
});

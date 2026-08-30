// 生理期周期计算（2026-08-22）——纯函数，无 React / 无存储依赖，供 CouplePeriod / 组合卡 / 测试共用
// 算法照搬苹果基础模型（需求文档《生理期记录.md》）：平均周期预测 + 固定黄体期 13 天 + 日历法
// 日期 key 一律 YYYY-MM-DD（本地日历日，用 utils/localDate 的工具，不手搓时差）

import { addLocalDays, getCalendarDayDifference } from './localDate';

// ── 类型 ──

export type CycleEventType = 'period' | 'pmdd' | 'sex';

/** 一条生理期事件（经期/PMDD/性生活），owner 目前只有 her（引擎事件以后落这里时再扩） */
export interface CycleEvent {
  id: string;
  type: CycleEventType;
  date: string;          // YYYY-MM-DD
  flow?: FlowLevel;
  pain?: number;         // 痛经 0-10
  symptoms: SymptomKey[];
  note?: string;
  createdAt: string;     // ISO
  updatedAt: string;
  owner: string;
}

export type FlowLevel = 'light' | 'medium' | 'heavy';

export const SYMPTOM_KEYS = [
  'allergy', 'headache', 'dizziness', 'chest', 'abdomen', 'back', 'fatigue',
  'fever', 'insomnia', 'irritable', 'anxious', 'low', 'appetite', 'discharge',
] as const;
export type SymptomKey = (typeof SYMPTOM_KEYS)[number];

export const SYMPTOM_LABELS: Record<SymptomKey, string> = {
  allergy: '过敏', headache: '头疼', dizziness: '头晕', chest: '胸胀痛', abdomen: '小腹痛',
  back: '腰痛', fatigue: '乏力', fever: '发烧', insomnia: '失眠', irritable: '烦躁',
  anxious: '焦虑', low: '低落', appetite: '食欲异常', discharge: '白带增多',
};

export const FLOW_LABELS: Record<FlowLevel, string> = { light: '少量', medium: '中等', heavy: '大量' };

/** 一次经期 / 一个周期（分割后的组） */
export interface Cycle {
  start: string;        // 经期开始日
  end: string;          // 经期最后一天
  days: number;         // 本次经期天数（出血天数）
  length: number | null; // 周期长度（到下次经期开始的天数）；进行中的最后一次为 null
  complete: boolean;    // 是否有后继周期
}

export interface Prediction {
  nextStart: string | null;         // 预计下次经期开始日
  predictedPeriodEnd: string | null; // 预计经期窗口最后一天
  meanCycle: number | null;          // 平均周期（向下取整）
  meanPeriodLen: number | null;      // 平均经期天数
  completeCount: number;             // 完整周期数（≥2 才预测）
}

export type PhaseKey = 'period' | 'predicted-period' | 'follicular' | 'ovulation' | 'luteal' | 'unknown';

export interface PhaseInfo {
  phase: PhaseKey;
  day: number;                 // 第N天：经期=本次第几天 / 黄体期=排卵后第几天 / 卵泡期=经期结束后第几天 / 预计经期=预计第几天
  daysToNext: number | null;   // 距下次经期天数
  nextStart: string | null;
  ovulationDate: string | null;
  predicted: boolean;          // 该阶段是否由推算得出
}

export type DayMarker = 'period' | 'predicted' | 'ovulation' | 'luteal' | 'pmdd' | 'sex';

// ── 常数 ──

/** 最小有效周期长度（天），比这短的周期不参与平均预测 */
export const MIN_CYCLE_LENGTH = 10;
/** 固定黄体期：排卵日 = 下次经期开始日 - 13 */
export const LUTEAL_DAYS = 13;
/** 预测最低门槛：至少 2 个完整周期 */
export const MIN_COMPLETE_CYCLES = 2;

// ── 周期分割 ──

/**
 * 把出血日切成周期组。
 * 规则（文档文字版）：中断 1 天（相邻差 2）算漏记、合并为同一次经期；中断 ≥2 天（相邻差 ≥3）开新周期。
 * 注：DS 给的伪代码 `gap >= 2` 切分会把「中断 1 天」也切开，与文字矛盾——先按文字实现，若要按伪代码改，把下方阈值从 3 改成 2 即可。
 */
export function splitCycles(bleedingDays: string[]): string[][] {
  const days = [...new Set(bleedingDays)].sort();
  const cycles: string[][] = [];
  let current: string[] = [];
  for (const day of days) {
    if (!current.length) {
      current.push(day);
      continue;
    }
    const gap = getCalendarDayDifference(current[current.length - 1], day);
    if (gap === null || gap >= 3) {
      cycles.push(current);
      current = [day];
    } else {
      current.push(day);
    }
  }
  if (current.length) cycles.push(current);
  return cycles;
}

/** 周期列表：完整周期的 length = 距下次经期开始的天数；最后一次（进行中）length 为 null */
export function buildCycles(bleedingDays: string[]): Cycle[] {
  const groups = splitCycles(bleedingDays);
  return groups.map((g, i) => {
    const start = g[0];
    const end = g[g.length - 1];
    const nextStart = groups[i + 1]?.[0];
    const length = nextStart ? (getCalendarDayDifference(start, nextStart) ?? null) : null;
    return { start, end, days: g.length, length, complete: length !== null };
  });
}

/** 预测下次经期：完整周期（length ≥ MIN_CYCLE_LENGTH）≥ 2 个才预测，平均值向下取整 */
export function predictNext(bleedingDays: string[]): Prediction {
  const cycles = buildCycles(bleedingDays);
  const complete = cycles.filter((c) => c.complete && c.length !== null && c.length >= MIN_CYCLE_LENGTH);
  if (complete.length < MIN_COMPLETE_CYCLES) {
    return {
      nextStart: null, predictedPeriodEnd: null, meanCycle: null, meanPeriodLen: null,
      completeCount: complete.length,
    };
  }
  const meanCycle = Math.floor(complete.reduce((s, c) => s + (c.length ?? 0), 0) / complete.length);
  const lastStart = cycles[cycles.length - 1].start;
  const nextStart = addLocalDays(lastStart, meanCycle);
  const lens = cycles.map((c) => c.days).filter((d) => d >= 1);
  const meanPeriodLen = lens.length
    ? Math.max(1, Math.round(lens.reduce((s, d) => s + d, 0) / lens.length))
    : null;
  const predictedPeriodEnd = addLocalDays(nextStart, (meanPeriodLen ?? 5) - 1);
  return { nextStart, predictedPeriodEnd, meanCycle, meanPeriodLen: meanPeriodLen ?? null, completeCount: complete.length };
}

// ── 阶段判定 ──

/**
 * 某天的周期阶段。
 * 判定顺序：实际出血 → 已过预计开始日但没记录（预计经期）→ 排卵日 → 黄体期 → 卵泡期 → 未知。
 */
export function phaseAt(dateKey: string, bleedingDays: string[], prediction: Prediction): PhaseInfo {
  const cycles = splitCycles(bleedingDays);

  // 1. 正在出血：本次经期第 N 天
  for (const cyc of cycles) {
    const idx = cyc.indexOf(dateKey);
    if (idx >= 0) {
      return {
        phase: 'period', day: idx + 1, daysToNext: null,
        nextStart: prediction.nextStart, ovulationDate: null, predicted: false,
      };
    }
  }

  const ovulation = prediction.nextStart ? addLocalDays(prediction.nextStart, -LUTEAL_DAYS) : null;
  const ovulationDate = ovulation;

  // 2. 已过预计开始日但没记录 → 预计经期
  if (prediction.nextStart && getCalendarDayDifference(prediction.nextStart, dateKey) !== null && getCalendarDayDifference(prediction.nextStart, dateKey)! >= 0) {
    const day = getCalendarDayDifference(prediction.nextStart, dateKey)! + 1;
    return {
      phase: 'predicted-period', day, daysToNext: 0,
      nextStart: prediction.nextStart, ovulationDate, predicted: true,
    };
  }

  // 3. 排卵日
  if (ovulation && dateKey === ovulation) {
    const daysToNext = getCalendarDayDifference(dateKey, prediction.nextStart!);
    return { phase: 'ovulation', day: 0, daysToNext, nextStart: prediction.nextStart, ovulationDate, predicted: true };
  }

  // 4. 黄体期（排卵次日 ~ 下次经期前一日）
  if (ovulation && getCalendarDayDifference(ovulation, dateKey) !== null && getCalendarDayDifference(ovulation, dateKey)! > 0) {
    const day = getCalendarDayDifference(ovulation, dateKey)!;
    const daysToNext = getCalendarDayDifference(dateKey, prediction.nextStart!);
    return { phase: 'luteal', day, daysToNext, nextStart: prediction.nextStart, ovulationDate, predicted: true };
  }

  // 5. 卵泡期（最近一次经期结束次日起）
  let lastEnd: string | null = null;
  for (const cyc of cycles) {
    const end = cyc[cyc.length - 1];
    if (end < dateKey) lastEnd = end;
    else break;
  }
  if (lastEnd) {
    const day = getCalendarDayDifference(lastEnd, dateKey)!;
    return { phase: 'follicular', day, daysToNext: null, nextStart: prediction.nextStart, ovulationDate, predicted: false };
  }

  // 6. 还没有任何记录 → 引导态
  return { phase: 'unknown', day: 0, daysToNext: null, nextStart: null, ovulationDate: null, predicted: false };
}

// ── 日历标记 ──

export interface MarkerSets {
  bleeding: Set<string>; // 实际出血日
  pmdd: Set<string>;
  sex: Set<string>;
}

/** 某天的日历标记（可能多个：如 PMDD 撞上黄体期） */
export function markersForDay(dateKey: string, sets: MarkerSets, prediction: Prediction): DayMarker[] {
  const out: DayMarker[] = [];
  if (sets.bleeding.has(dateKey)) out.push('period');
  if (sets.pmdd.has(dateKey)) out.push('pmdd');
  if (sets.sex.has(dateKey)) out.push('sex');
  const ovulation = prediction.nextStart ? addLocalDays(prediction.nextStart, -LUTEAL_DAYS) : null;
  if (ovulation) {
    if (dateKey === ovulation) out.push('ovulation');
    else if (dateKey > ovulation && prediction.nextStart && dateKey < prediction.nextStart) out.push('luteal');
    else if (
      prediction.nextStart && prediction.predictedPeriodEnd
      && dateKey >= prediction.nextStart && dateKey <= prediction.predictedPeriodEnd
      && !sets.bleeding.has(dateKey)
    ) out.push('predicted');
  }
  return out;
}

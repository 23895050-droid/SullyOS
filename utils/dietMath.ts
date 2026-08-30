// 饮食计算纯函数（2026-08-23）——无 React / 无存储依赖，供 CoupleDiet / 组合卡 / 测试共用
// 剩余热量 = 预算 - 摄入 + 运动消耗（不为负）；每餐建议区间按预算比例（早餐 418-585/1500 与她的示例对齐）

export type MealKey = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'exercise';

export const MEAL_LABELS: Record<MealKey, string> = {
  breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐', exercise: '运动',
};

export const MEAL_ORDER: MealKey[] = ['breakfast', 'lunch', 'dinner', 'snack', 'exercise'];

export interface DietTotals {
  kcal: number;        // 摄入合计（不含运动）
  protein: number;     // g
  carbs: number;       // g
  fat: number;         // g
  exerciseKcal: number; // 运动消耗合计
}

/** 某天的合计：运动单独计消耗，其余四餐计摄入 */
export function dayTotals(items: Array<{ meal: MealKey; kcal: number; protein: number; carbs: number; fat: number }>): DietTotals {
  const t: DietTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0, exerciseKcal: 0 };
  for (const i of items) {
    if (i.meal === 'exercise') t.exerciseKcal += i.kcal;
    else {
      t.kcal += i.kcal;
      t.protein += i.protein;
      t.carbs += i.carbs;
      t.fat += i.fat;
    }
  }
  return t;
}

/** 还能吃的热量（不为负）：预算 - 摄入 + 运动消耗 */
export function remainingKcal(totals: DietTotals, budget: number): number {
  return Math.max(0, budget - totals.kcal + totals.exerciseKcal);
}

/** 每餐建议热量区间（占预算比例；运动无建议） */
export const MEAL_SUGGEST_RANGES: Record<MealKey, [number, number]> = {
  breakfast: [0.28, 0.39],
  lunch: [0.3, 0.4],
  dinner: [0.28, 0.39],
  snack: [0, 0.1],
  exercise: [0, 0],
};

export function mealSuggestRange(meal: MealKey, budget: number): [number, number] {
  const [a, b] = MEAL_SUGGEST_RANGES[meal];
  return [Math.round(budget * a), Math.round(budget * b)];
}

/** 每 100g 数值 → 实际克数（宏量保留 1 位小数，热量取整） */
export function scaleMacros(
  per100: { kcal: number; protein: number; carbs: number; fat: number },
  grams: number,
): { kcal: number; protein: number; carbs: number; fat: number } {
  const k = Math.max(0, grams) / 100;
  const r1 = (v: number) => Math.round(v * k * 10) / 10;
  return { kcal: Math.round(per100.kcal * k), protein: r1(per100.protein), carbs: r1(per100.carbs), fat: r1(per100.fat) };
}

/** 实际值 → 每 100g（手动记的食物自动建库用） */
export function toPer100(
  item: { kcal: number; protein: number; carbs: number; fat: number },
  grams: number,
): { kcal: number; protein: number; carbs: number; fat: number } {
  const k = Math.max(1, grams) / 100;
  const r1 = (v: number) => Math.round((v / k) * 10) / 10;
  return { kcal: Math.round(item.kcal / k), protein: r1(item.protein), carbs: r1(item.carbs), fat: r1(item.fat) };
}

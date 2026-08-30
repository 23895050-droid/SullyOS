// dietMath 纯函数单测（2026-08-23）
import { describe, expect, it } from 'vitest';
import { dayTotals, mealSuggestRange, remainingKcal, scaleMacros, toPer100 } from './dietMath';

describe('dayTotals', () => {
  it('摄入与运动分开计：四餐加总，运动单列消耗', () => {
    const t = dayTotals([
      { meal: 'breakfast', kcal: 300, protein: 10, carbs: 40, fat: 8 },
      { meal: 'lunch', kcal: 500, protein: 20, carbs: 60, fat: 12 },
      { meal: 'exercise', kcal: 200, protein: 0, carbs: 0, fat: 0 },
    ]);
    expect(t.kcal).toBe(800);
    expect(t.protein).toBe(30);
    expect(t.carbs).toBe(100);
    expect(t.fat).toBe(20);
    expect(t.exerciseKcal).toBe(200);
  });
});

describe('remainingKcal', () => {
  it('预算 - 摄入 + 运动消耗，不为负', () => {
    expect(remainingKcal({ kcal: 1000, protein: 0, carbs: 0, fat: 0, exerciseKcal: 200 }, 1500)).toBe(700);
    expect(remainingKcal({ kcal: 2000, protein: 0, carbs: 0, fat: 0, exerciseKcal: 0 }, 1500)).toBe(0);
  });
});

describe('mealSuggestRange', () => {
  it('早餐区间与她的示例对齐（1500 → 420-585）', () => {
    expect(mealSuggestRange('breakfast', 1500)).toEqual([420, 585]);
    expect(mealSuggestRange('lunch', 1500)).toEqual([450, 600]);
  });
});

describe('scaleMacros / toPer100', () => {
  it('每100g → 实际克数 → 每100g 往返一致', () => {
    const scaled = scaleMacros({ kcal: 200, protein: 10, carbs: 20, fat: 5 }, 150);
    expect(scaled.kcal).toBe(300);
    expect(scaled.protein).toBe(15);
    expect(scaled.carbs).toBe(30);
    expect(scaled.fat).toBe(7.5);
    const back = toPer100({ kcal: 300, protein: 15, carbs: 30, fat: 7.5 }, 150);
    expect(back.kcal).toBe(200);
    expect(back.protein).toBe(10);
    expect(back.carbs).toBe(20);
    expect(back.fat).toBe(5);
  });
});

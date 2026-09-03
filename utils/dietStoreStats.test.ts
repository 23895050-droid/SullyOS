// 饮食 store 派生统计单测（2026-08-23 二批）——recomputeFoodStats 纯函数（实现在 apps/couple/dietStore）
// 核心规则：吃过次数/最近一次吃从记录派生——删掉那次记录，次数回落；食物本身留在库里（吃过 0 次）
import { describe, expect, it } from 'vitest';
import { recomputeFoodStats, type DietRecord, type FoodLibItem } from '../apps/couple/dietStore';

const food = (id: string, name: string): FoodLibItem => ({
  id, name, kcal: 100, protein: 5, carbs: 15, fat: 3, unit: 'g', defaultGrams: 100,
  eatenCount: 99, // 随便塞个旧值，派生会覆盖
  createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', owner: 'her',
});

const record = (id: string, items: Array<{ id: string; foodId?: string; name: string; createdAt: string }>): DietRecord => ({
  id, date: '2026-08-23', meal: 'lunch', items: items.map((i) => ({ ...i, grams: 100, kcal: 100, protein: 5, carbs: 15, fat: 3 })),
  createdAt: '2026-08-23T08:00:00.000Z', updatedAt: '2026-08-23T08:00:00.000Z', owner: 'her',
});

describe('recomputeFoodStats', () => {
  it('按 foodId 精确计数 + 最近一次吃取最新时间', () => {
    const foods = [food('f1', '麻辣烫')];
    const records = [
      record('r1', [
        { id: 'i1', foodId: 'f1', name: '麻辣烫', createdAt: '2026-08-20T12:00:00.000Z' },
        { id: 'i2', foodId: 'f1', name: '麻辣烫', createdAt: '2026-08-22T12:00:00.000Z' },
      ]),
    ];
    const [f] = recomputeFoodStats(foods, records);
    expect(f.eatenCount).toBe(2);
    expect(f.lastEatenAt).toBe('2026-08-22T12:00:00.000Z');
  });

  it('删掉那次记录 → 次数回落，食物仍在库（吃过 0 次、上次吃清空）', () => {
    const foods = [food('f1', '麻辣烫')];
    const records = [record('r1', [{ id: 'i1', foodId: 'f1', name: '麻辣烫', createdAt: '2026-08-20T12:00:00.000Z' }])];
    const [once] = recomputeFoodStats(foods, records);
    expect(once.eatenCount).toBe(1);
    // 模拟删掉那条记录
    const [gone] = recomputeFoodStats(foods, []);
    expect(gone.eatenCount).toBe(0);
    expect(gone.lastEatenAt).toBeUndefined();
  });

  it('老数据没有 foodId → 按名字兜底计数；别的食物同名不同 id 不串', () => {
    const foods = [food('f1', '番茄炒蛋'), food('f2', '水煮鱼')];
    const records = [
      record('r1', [
        { id: 'i1', name: '番茄炒蛋', createdAt: '2026-08-20T12:00:00.000Z' },
        { id: 'i2', foodId: 'f2', name: '水煮鱼', createdAt: '2026-08-21T12:00:00.000Z' },
      ]),
    ];
    const [egg, fish] = recomputeFoodStats(foods, records);
    expect(egg.eatenCount).toBe(1);
    expect(fish.eatenCount).toBe(1);
  });
});

// 饮食 store（2026-08-23）——情侣空间 c2 饮食页 + 食物库
// 规范：version + ISO 时间戳 + owner；预算/宏量目标可改；API 槽一个（多模态，识别+推荐共用，模型独立性：不配置就不调用）
// 拍照识图临时图只存一天（tempPhotos 带日期，load 时清理过期并删 blobRef）；食物库缩略图持久（thumbRef）
// 记过的东西自动进食物库（无 foodId 的按每 100g 换算建档，eatenCount=1）；带 foodId 的 eatenCount+1
import { createCoupleStore, isoNow, uid } from './coupleStoreBase';
import { getLocalDateKey } from '../../utils/localDate';
import { deleteBlobRef } from '../../utils/blobRef';
import { MEAL_LABELS, toPer100, type MealKey } from '../../utils/dietMath';
import { addActivity } from './activityStore';

// ── 类型 ──

export interface DietFoodItem {
  id: string;
  foodId?: string;      // 来自食物库
  name: string;
  grams: number;        // 克 / 毫升
  kcal: number;
  protein: number;      // g
  carbs: number;        // g
  fat: number;          // g
  review?: string;      // 小助手返回的单项评价
  rating?: number;      // 记的时候打的星（0-5，会带进食物库）
  glycemic?: number;    // 升糖值（mmol/L，可带进食物库）
  photoRef?: string;    // 拍照识图临时图（blobRef，只存一天）
  createdAt: string;
}

export interface DietRecord {
  id: string;
  date: string;         // YYYY-MM-DD
  meal: MealKey;
  items: DietFoodItem[];
  createdAt: string;
  updatedAt: string;
  owner: string;
}

/** 家常做法一条：做法 1/2/3…（描述 + 好吃程度 + 评价） */
export interface CookMethod {
  id: string;
  description: string;
  rating?: number; // 1-5
  review?: string;
}

/** 外卖购买记录一条：1 杨国福麻辣烫 12块 5分 很好吃 吃过10次 */
export interface TakeoutRecord {
  id: string;
  shop: string;
  price?: string;
  rating?: number; // 1-5
  eatenTimes?: number;
  review?: string;
}

export interface FoodLibItem {
  id: string;
  name: string;
  kcal: number;         // 每 100g（或每单位）
  protein: number;
  carbs: number;
  fat: number;
  unit: string;         // g / 杯 / 个
  defaultGrams: number; // 默认份量（g）
  thumbRef?: string;    // 缩略图 blobRef（持久，在食物详情里手动上传）
  eatenCount: number;   // 吃了多少遍——从记录派生（删掉记录次数会回落）
  lastEatenAt?: string; // 最近一次吃（ISO，派生）
  rating?: number;      // 食物本身评分 0-5 星
  glycemic?: number;    // 升糖值（mmol/L，给妈妈做饭记录用）
  isHomeCooked?: boolean;  // 是否有家常做法（勾了才显示做法输入）
  isTakeout?: boolean;     // 是否点过外卖（勾了才显示外卖记录输入）
  cookMethods?: CookMethod[];
  takeoutRecords?: TakeoutRecord[];
  price?: string;
  platform?: string;
  createdAt: string;
  updatedAt: string;
  owner: string;
}

export interface DietTargets {
  calorieBudget: number; // 推荐预算（千卡）
  carbGoal: number;      // 碳水推荐 g
  proteinGoal: number;   // 蛋白推荐 g
  fatGoal: number;       // 脂肪推荐 g
}

export interface DietApiConfig {
  baseUrl: string;       // 已带 /v1 后缀
  apiKey: string;
  model: string;         // 多模态：拍照识图 + 推荐下一餐共用
}

/** 个人情况档案（2026-08-23）：身高/体重/饮食偏好/目标——推荐下一餐时给 AI 参考 */
export interface DietProfile {
  height: string;      // 如 165cm
  weight: string;      // 如 50kg
  preferences: string; // 饮食偏好/忌口（如不吃香菜、爱吃辣）
  goals: string;       // 目标（如减脂、增肌）
}

/** 一条购买记录（2026-08-23）：在哪买的/什么时候/季节/多少钱/品质——攒多了能看出涨跌和谁家货好 */
export interface FridgePurchase {
  id: string;
  date: string;       // 购入日期 YYYY-MM-DD
  season?: string;    // 春/夏/秋/冬
  place?: string;     // 在哪买的，如 杨家菜市
  price?: string;     // 价格，如 2元/斤
  quality?: string;   // 品质，如 很好/一般/很差
  note?: string;
  createdAt: string;
}

/** 冰箱食材（2026-08-23 二改）：卡片表面 = 余量 + 上次购入时间；详情 = 购买记录列表 */
export interface FridgeItem {
  id: string;
  name: string;
  amount?: string; // 当前余量，如 2个、半盒
  purchases: FridgePurchase[];
  createdAt: string;
  updatedAt: string;
  owner: string;
}

export interface DietStore {
  version: number;
  updatedAt: string;
  targets: DietTargets;
  api: DietApiConfig;
  profile: DietProfile;
  fridge: FridgeItem[];
  records: DietRecord[];
  foods: FoodLibItem[];
  tempPhotos: Array<{ id: string; date: string; blobRef: string }>;
}

export const DIET_STORE_VERSION = 1;

const DEFAULT_STORE: DietStore = {
  version: DIET_STORE_VERSION,
  updatedAt: '1970-01-01T00:00:00.000Z',
  targets: { calorieBudget: 1500, carbGoal: 100, proteinGoal: 60, fatGoal: 50 },
  api: { baseUrl: '', apiKey: '', model: '' },
  profile: { height: '', weight: '', preferences: '', goals: '' },
  fridge: [],
  records: [],
  foods: [],
  tempPhotos: [],
};

/** 过期临时照片清理（load 时跑一次；顺手删 blobRef 防 IndexedDB 堆积） */
const cleanupTempPhotos = (photos: DietStore['tempPhotos']): DietStore['tempPhotos'] => {
  const today = getLocalDateKey();
  const stale = photos.filter((p) => p.date < today);
  for (const p of stale) {
    try {
      deleteBlobRef(p.blobRef);
    } catch {
      // blob 删除失败不影响列表清理
    }
  }
  return photos.filter((p) => p.date >= today);
};

/** 旧版冰箱数据迁移：没有 purchases 数组的补空数组（note 并入第一条购买记录备注，能留就留） */
const migrateFridge = (fridge: unknown): FridgeItem[] => {
  if (!Array.isArray(fridge)) return [];
  return fridge.map((f) => {
    const old = f as Partial<FridgeItem> & { note?: string };
    if (Array.isArray(old.purchases)) return old as FridgeItem;
    const purchases: FridgePurchase[] = [];
    if (old.note) {
      purchases.push({ id: uid(), date: getLocalDateKey(), note: old.note, createdAt: old.createdAt ?? isoNow() });
    }
    const { note: _note, ...rest } = old;
    return { ...rest, purchases } as FridgeItem;
  });
};

/**
 * 吃过次数/最近一次吃——从记录派生（2026-08-23）：删掉某次记录，次数自动回落；食物本身留在库里（吃过 0 次）。
 * 匹配规则：item.foodId 精确匹配；老数据没有 foodId 的按名字匹配兜底。
 */
export const recomputeFoodStats = (foods: FoodLibItem[], records: DietRecord[]): FoodLibItem[] =>
  foods.map((f) => {
    let count = 0;
    let last = '';
    for (const r of records) {
      for (const it of r.items) {
        const match = it.foodId ? it.foodId === f.id : it.name === f.name;
        if (match) {
          count += 1;
          if (it.createdAt > last) last = it.createdAt;
        }
      }
    }
    const lastEatenAt = last || undefined;
    return f.eatenCount === count && f.lastEatenAt === lastEatenAt ? f : { ...f, eatenCount: count, lastEatenAt };
  });

const store = createCoupleStore<DietStore>('couple_diet_v1', DIET_STORE_VERSION, DEFAULT_STORE, (p) => {
  const records = Array.isArray(p.records) ? p.records : [];
  const foods = recomputeFoodStats(Array.isArray(p.foods) ? p.foods : [], records);
  return {
    ...p,
    profile: { ...DEFAULT_STORE.profile, ...(p.profile ?? {}) },
    fridge: migrateFridge(p.fridge),
    records,
    foods,
    tempPhotos: cleanupTempPhotos(Array.isArray(p.tempPhotos) ? p.tempPhotos : []),
  };
});

export const useDietStore = store.use;
export const getDietStore = store.get;

// ── 记录 CRUD ──

export interface NewDietItem {
  foodId?: string;
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  review?: string;
  rating?: number;
  glycemic?: number;
  photoRef?: string;
}

/** 记一餐：条目进记录；带 foodId 的自动累计，没有的自动按每 100g 建档进食物库（并回填 foodId 给条目，删记录时次数才能回落）；写活动记录 */
export function addDietRecord(input: { date?: string; meal: MealKey; items: NewDietItem[]; owner?: string }): DietRecord {
  const now = isoNow();
  // 先给「食物库建档」的新食物发 id，并回填到条目——之后派生次数靠 foodId 精确匹配
  const items: DietFoodItem[] = input.items.map((it) => ({
    id: uid(),
    foodId: it.foodId,
    name: it.name,
    grams: it.grams,
    kcal: it.kcal,
    protein: it.protein,
    carbs: it.carbs,
    fat: it.fat,
    review: it.review,
    rating: it.rating,
    glycemic: it.glycemic,
    photoRef: it.photoRef,
    createdAt: now,
  }));
  const record: DietRecord = {
    id: uid(),
    date: input.date ?? getLocalDateKey(),
    meal: input.meal,
    items,
    createdAt: now,
    updatedAt: now,
    owner: input.owner ?? 'her',
  };

  store.set((s) => {
    let foods = s.foods;
    for (const it of items) {
      if (!it.foodId) {
        const per100 = toPer100(it, it.grams);
        const newFood: FoodLibItem = {
          id: uid(),
          name: it.name,
          kcal: per100.kcal,
          protein: per100.protein,
          carbs: per100.carbs,
          fat: per100.fat,
          unit: 'g',
          defaultGrams: it.grams > 0 ? it.grams : 100,
          eatenCount: 1, // 先占位，下面 recompute 统一重算
          rating: it.rating,
          glycemic: it.glycemic,
          createdAt: now,
          updatedAt: now,
          owner: input.owner ?? 'her',
        };
        foods = [...foods, newFood];
        it.foodId = newFood.id;
      } else if (it.rating !== undefined || it.glycemic !== undefined) {
        // 手动/拍照记已有食物时带评分或升糖 → 顺手写回食物库
        foods = foods.map((f) =>
          f.id === it.foodId
            ? {
                ...f,
                rating: it.rating !== undefined ? it.rating : f.rating,
                glycemic: it.glycemic !== undefined ? it.glycemic : f.glycemic,
                updatedAt: now,
              }
            : f,
        );
      }
    }
    const records = [...s.records, record];
    return { ...s, records, foods: recomputeFoodStats(foods, records), updatedAt: now };
  });

  const kcalSum = items.reduce((sum, it) => sum + it.kcal, 0);
  addActivity({
    kind: 'diet',
    date: record.date,
    text: `记了${MEAL_LABELS[input.meal]}：${items.map((it) => it.name).join('、')}（共 ${kcalSum} 千卡）`,
    owner: input.owner ?? 'her',
  });
  return record;
}

export function addItemToRecord(recordId: string, item: NewDietItem) {
  const now = isoNow();
  const it: DietFoodItem = { id: uid(), ...item, createdAt: now };
  store.set((s) => {
    let foods = s.foods;
    if (!it.foodId) {
      const newFood: FoodLibItem = {
        id: uid(),
        name: it.name,
        ...toPer100(it, it.grams),
        unit: 'g',
        defaultGrams: it.grams > 0 ? it.grams : 100,
        eatenCount: 1,
        rating: it.rating,
        glycemic: it.glycemic,
        createdAt: now,
        updatedAt: now,
        owner: 'her',
      };
      foods = [...foods, newFood];
      it.foodId = newFood.id;
    } else if (it.rating !== undefined || it.glycemic !== undefined) {
      foods = foods.map((f) =>
        f.id === it.foodId
          ? { ...f, rating: it.rating !== undefined ? it.rating : f.rating, glycemic: it.glycemic !== undefined ? it.glycemic : f.glycemic, updatedAt: now }
          : f,
      );
    }
    const records = s.records.map((r) => (r.id === recordId ? { ...r, items: [...r.items, it], updatedAt: now } : r));
    return { ...s, records, foods: recomputeFoodStats(foods, records), updatedAt: now };
  });
}

export function removeDietItem(recordId: string, itemId: string) {
  const now = isoNow();
  store.set((s) => {
    const records = s.records.map((r) => (r.id === recordId ? { ...r, items: r.items.filter((i) => i.id !== itemId), updatedAt: now } : r));
    return { ...s, records, foods: recomputeFoodStats(s.foods, records), updatedAt: now };
  });
}

export function deleteDietRecord(id: string) {
  const now = isoNow();
  store.set((s) => {
    const records = s.records.filter((r) => r.id !== id);
    return { ...s, records, foods: recomputeFoodStats(s.foods, records), updatedAt: now };
  });
}

/** 某天某餐的记录（一般一条） */
export function recordsOn(date: string, meal?: MealKey): DietRecord[] {
  return store.get().records.filter((r) => r.date === date && (meal === undefined || r.meal === meal));
}

// ── 食物库 ──

export function upsertFood(input: {
  id?: string; name: string; kcal: number; protein: number; carbs: number; fat: number;
  unit?: string; defaultGrams?: number; thumbRef?: string; price?: string; platform?: string;
  rating?: number; glycemic?: number; isHomeCooked?: boolean; isTakeout?: boolean;
  cookMethods?: CookMethod[]; takeoutRecords?: TakeoutRecord[];
}): FoodLibItem {
  const existing = input.id ? store.get().foods.find((f) => f.id === input.id) : undefined;
  const now = isoNow();
  const food: FoodLibItem = {
    id: input.id ?? uid(),
    name: input.name,
    kcal: input.kcal,
    protein: input.protein,
    carbs: input.carbs,
    fat: input.fat,
    unit: input.unit ?? existing?.unit ?? 'g',
    defaultGrams: input.defaultGrams ?? existing?.defaultGrams ?? 100,
    thumbRef: input.thumbRef !== undefined ? input.thumbRef : existing?.thumbRef,
    eatenCount: existing?.eatenCount ?? 0,
    lastEatenAt: existing?.lastEatenAt,
    rating: input.rating !== undefined ? input.rating : existing?.rating,
    glycemic: input.glycemic !== undefined ? input.glycemic : existing?.glycemic,
    isHomeCooked: input.isHomeCooked ?? existing?.isHomeCooked,
    isTakeout: input.isTakeout ?? existing?.isTakeout,
    cookMethods: input.cookMethods ?? existing?.cookMethods,
    takeoutRecords: input.takeoutRecords ?? existing?.takeoutRecords,
    price: input.price !== undefined ? input.price : existing?.price,
    platform: input.platform !== undefined ? input.platform : existing?.platform,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    owner: existing?.owner ?? 'her',
  };
  store.set((s) => ({
    ...s,
    foods: existing ? s.foods.map((f) => (f.id === food.id ? food : f)) : [...s.foods, food],
    updatedAt: now,
  }));
  return food;
}

export function deleteFood(id: string) {
  store.set((s) => ({ ...s, foods: s.foods.filter((f) => f.id !== id), updatedAt: isoNow() }));
}

// ── 目标 / API 配置 ──

export function updateDietTargets(patch: Partial<DietTargets>) {
  store.set((s) => ({ ...s, targets: { ...s.targets, ...patch }, updatedAt: isoNow() }));
}

export function updateDietApi(patch: Partial<DietApiConfig>) {
  store.set((s) => ({ ...s, api: { ...s.api, ...patch }, updatedAt: isoNow() }));
}

// ── 个人档案 / 冰箱 ──

export function updateDietProfile(patch: Partial<DietProfile>) {
  store.set((s) => ({ ...s, profile: { ...s.profile, ...patch }, updatedAt: isoNow() }));
}

export function addFridgeItem(input: { name: string; amount?: string; owner?: string }): FridgeItem {
  const now = isoNow();
  const item: FridgeItem = {
    id: uid(),
    name: input.name.trim(),
    amount: input.amount?.trim() || undefined,
    purchases: [],
    createdAt: now,
    updatedAt: now,
    owner: input.owner ?? 'her',
  };
  store.set((s) => ({ ...s, fridge: [...s.fridge, item], updatedAt: now }));
  return item;
}

/** 改余量 */
export function updateFridgeItem(id: string, patch: { amount?: string }) {
  store.set((s) => ({
    ...s,
    fridge: s.fridge.map((f) => (f.id === id ? { ...f, amount: patch.amount?.trim() || undefined, updatedAt: isoNow() } : f)),
    updatedAt: isoNow(),
  }));
}

/** 加一条购买记录（在哪买的/什么时候/季节/价格/品质） */
export function addFridgePurchase(itemId: string, input: Omit<FridgePurchase, 'id' | 'createdAt'>): FridgePurchase {
  const now = isoNow();
  const purchase: FridgePurchase = {
    id: uid(),
    date: input.date,
    season: input.season?.trim() || undefined,
    place: input.place?.trim() || undefined,
    price: input.price?.trim() || undefined,
    quality: input.quality?.trim() || undefined,
    note: input.note?.trim() || undefined,
    createdAt: now,
  };
  store.set((s) => ({
    ...s,
    fridge: s.fridge.map((f) =>
      f.id === itemId
        ? { ...f, purchases: [...f.purchases, purchase].sort((a, b) => (a.date < b.date ? 1 : -1)), updatedAt: now }
        : f,
    ),
    updatedAt: now,
  }));
  return purchase;
}

export function deleteFridgePurchase(itemId: string, purchaseId: string) {
  store.set((s) => ({
    ...s,
    fridge: s.fridge.map((f) => (f.id === itemId ? { ...f, purchases: f.purchases.filter((p) => p.id !== purchaseId), updatedAt: isoNow() } : f)),
    updatedAt: isoNow(),
  }));
}

export function deleteFridgeItem(id: string) {
  store.set((s) => ({ ...s, fridge: s.fridge.filter((f) => f.id !== id), updatedAt: isoNow() }));
}

/** 全部购买记录总数（攒够 10 条可 AI 总结） */
export const fridgePurchaseTotal = (): number => store.get().fridge.reduce((sum, f) => sum + f.purchases.length, 0);

// ── 临时照片（拍照识图，只存一天） ──

export function addTempPhoto(blobRef: string) {
  const p = { id: uid(), date: getLocalDateKey(), blobRef };
  store.set((s) => ({ ...s, tempPhotos: [...s.tempPhotos, p], updatedAt: isoNow() }));
  return p;
}

export function tempPhotosOn(date: string) {
  return store.get().tempPhotos.filter((p) => p.date === date);
}

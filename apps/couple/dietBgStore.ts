// 饮食后台生成状态（2026-09-13，批D）——冰箱购买记录总结后台跑，生成中可离页
// 用 coupleStoreBase 工厂拿订阅/持久化/导入重读三件；pending 字段走 utils/bgTask 生命周期。
import { createCoupleStore } from './coupleStoreBase';
import type { BgTaskPending } from '../../utils/bgTask';

export interface FridgeSummaryResult {
  text: string;
  at: number;
}

export interface DietBgV1 {
  version: 1;
  updatedAt: string;
  pendingFridgeSummary?: BgTaskPending;
  fridgeSummary?: FridgeSummaryResult;
}

export const dietBgStore = createCoupleStore<DietBgV1>('couple_diet_bg_v1', 1, {
  version: 1,
  updatedAt: new Date().toISOString(),
});

/** bgTask 需要 get/set 句柄 */
export const dietBgStoreApi = dietBgStore;

/** 生成完成时由后台 fn 写结果（供弹窗重开时回显） */
export const setFridgeSummary = (text: string) => {
  dietBgStore.set((s) => ({
    ...s,
    updatedAt: new Date().toISOString(),
    fridgeSummary: { text, at: Date.now() },
  }));
};

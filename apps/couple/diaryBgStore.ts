// 日记/留言后台生成状态（2026-09-13，批E）——生成中可离页，回来续显示，完成落库
// 用 coupleStoreBase 工厂拿订阅/持久化/导入重读三件；pending 字段走 utils/bgTask 生命周期。
import { createCoupleStore } from './coupleStoreBase';
import type { BgTaskPending } from '../../utils/bgTask';

export interface DiaryBgV1 {
  version: 1;
  updatedAt: string;
  pendingDiary?: BgTaskPending;    // 喊他写日记
  pendingAnnotate?: BgTaskPending; // 他批注她的日记
  pendingBoard?: BgTaskPending;    // 留言板「批阅今天」
}

export const diaryBgStore = createCoupleStore<DiaryBgV1>('couple_diary_bg_v1', 1, {
  version: 1,
  updatedAt: new Date().toISOString(),
});

/** bgTask 需要 get/set 句柄 */
export const diaryBgStoreApi = diaryBgStore;

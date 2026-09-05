// 相册后台生成状态（2026-09-05，反馈1 批C）——「他最近看过」观后感 + 批量自动打标
// 用 coupleStoreBase 工厂拿订阅/持久化/导入重读三件；pending 字段走 utils/bgTask 生命周期。
import { createCoupleStore } from './coupleStoreBase';
import type { BgTaskPending } from '../../utils/bgTask';

export interface AlbumRecallResult {
  charId: string;
  charName: string;
  text: string;
  at: number;
}

export interface AlbumBgV1 {
  version: 1;
  updatedAt: string;
  pendingRecall?: BgTaskPending;
  pendingAutoTag?: BgTaskPending;
  recallResult?: AlbumRecallResult;
}

export const albumBgStore = createCoupleStore<AlbumBgV1>('couple_album_bg_v1', 1, {
  version: 1,
  updatedAt: new Date().toISOString(),
});

/** bgTask 需要 get/set 句柄 */
export const albumBgStoreApi = albumBgStore;

/** 生成完成时由后台 fn 写结果（供弹窗重开时回显） */
export const setRecallResult = (result: AlbumRecallResult) => {
  albumBgStore.set(s => ({
    ...s,
    updatedAt: new Date().toISOString(),
    recallResult: result,
  }));
};

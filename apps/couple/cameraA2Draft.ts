// a2「给他看」暂离草稿（2026-09-05，反馈1 批C1）——暂离/关闭相机时把对话快照下来，
// 下次打开同角色 a2 接着聊。「结束」清草稿。
// 走 coupleStoreBase 工厂（订阅/持久化/备份导入重读三件套），key 注册在 ourDataBackup 相机范围。
import { createCoupleStore } from './coupleStoreBase';

export interface A2Draft {
  messages: { role: string; content: string }[];
  hasStarted: boolean;
  customPrompt: string;
  outputMode: 'bubbles' | 'longform';
  savedAt: string;
}

export interface CameraA2DraftsV1 {
  version: 1;
  updatedAt: string;
  drafts: Record<string, A2Draft>;
}

export const cameraA2DraftStore = createCoupleStore<CameraA2DraftsV1>(
  'os_camera_a2_drafts_v1',
  1,
  { version: 1, updatedAt: new Date().toISOString(), drafts: {} },
);

export const saveA2Draft = (charId: string, draft: Omit<A2Draft, 'savedAt'>): void => {
  cameraA2DraftStore.set((s) => ({
    ...s,
    updatedAt: new Date().toISOString(),
    drafts: { ...s.drafts, [charId]: { ...draft, savedAt: new Date().toISOString() } },
  }));
};

export const loadA2Draft = (charId: string): A2Draft | null =>
  cameraA2DraftStore.get().drafts[charId] || null;

export const clearA2Draft = (charId: string): void => {
  cameraA2DraftStore.set((s) => {
    const drafts = { ...s.drafts };
    delete drafts[charId];
    return { ...s, updatedAt: new Date().toISOString(), drafts };
  });
};

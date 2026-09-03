// 留言板 store（2026-08-25）——c1 日常页留言板 + 「喊他留言」批阅
// 规范：version + ISO 时间戳 + owner；按「日期 + owner」一条（与日记同构）
// Nox 的留言 = 读日常页全量信息后写的（当天可重roll/删除；往期只读）
// 留言可以贴一张照片（生图），带 why 小字标注（为什么贴）；照片可留档进相册（archiveId 记录，UI 显示已留档态）
import { createCoupleStore, isoNow, uid } from './coupleStoreBase';
import { getLocalDateKey } from '../../utils/localDate';
import { deleteBlobRef } from '../../utils/blobRef';
import { addActivity } from './activityStore';

// ── 类型 ──

export type BoardOwner = 'me' | 'her';

export interface BoardImage {
  blobRef: string;      // 原图（blob_assets）
  prompt: string;       // 生图提示词（模型输出的画什么）
  why: string;          // 小字标注：为什么贴这张照片
  archiveId?: string;   // 已留档的相册条目 id（留档后写入）
}

export interface BoardMessage {
  id: string;
  date: string;          // YYYY-MM-DD
  owner: BoardOwner;
  content: string;       // 留言正文
  generated?: boolean;   // AI 生成（决定「重roll」按钮）
  image?: BoardImage;    // 贴的照片（可选）
  createdAt: string;
  updatedAt: string;
}

export interface BoardStore {
  version: number;
  updatedAt: string;
  messages: BoardMessage[];
}

const store = createCoupleStore<BoardStore>('couple_board_v1', 1, {
  version: 1,
  updatedAt: '1970-01-01T00:00:00.000Z',
  messages: [],
});

export const useBoardStore = store.use;
export const getBoardStore = store.get;

// ── 纯 getter（挂载 / 转发 / 非 React 代码读） ──

export const boardOn = (messages: BoardMessage[], date: string, owner: BoardOwner): BoardMessage | undefined =>
  messages.find((m) => m.date === date && m.owner === owner);

/** 某个 owner 有留言的日期列表（新→旧；看往期用） */
export const boardDates = (messages: BoardMessage[], owner: BoardOwner): string[] =>
  messages
    .filter((m) => m.owner === owner && m.content.trim())
    .map((m) => m.date)
    .sort()
    .reverse();

// ── 写 ──

/** 保存 / 覆盖一篇留言（当天可重roll；往期由 UI 挡住不调用）。覆盖语义：content/generated/image 整体替换 */
export function saveBoardMessage(input: {
  date?: string; owner: BoardOwner; content: string; generated?: boolean; image?: BoardImage;
}): BoardMessage {
  const s = store.get();
  const date = input.date ?? getLocalDateKey();
  const now = isoNow();
  const existing = boardOn(s.messages, date, input.owner);
  const message: BoardMessage = existing
    ? { ...existing, content: input.content, generated: input.generated, image: input.image, updatedAt: now }
    : {
        id: uid(), date, owner: input.owner, content: input.content,
        generated: input.generated, image: input.image, createdAt: now, updatedAt: now,
      };
  store.set((prev) => ({
    ...prev,
    messages: existing ? prev.messages.map((m) => (m.id === existing.id ? message : m)) : [...prev.messages, message],
    updatedAt: now,
  }));
  // 旧图被新图替换时清理旧 blobRef
  if (existing?.image?.blobRef && existing.image.blobRef !== message.image?.blobRef) {
    void deleteBlobRef(existing.image.blobRef).catch(() => {});
  }
  const who = input.owner === 'me' ? 'Nox' : 'Angelica';
  addActivity({
    kind: 'board', date, owner: input.owner,
    text: message.image ? `${who} 留了言，还贴了一张照片` : `${who} 在留言板留了言`,
  });
  return message;
}

/** 照片留档进相册后，回写 archiveId（UI 显示已留档态） */
export function markBoardArchived(date: string, owner: BoardOwner, archiveId: string) {
  const s = store.get();
  const existing = boardOn(s.messages, date, owner);
  if (!existing?.image) return;
  const message: BoardMessage = {
    ...existing,
    image: { ...existing.image, archiveId },
    updatedAt: isoNow(),
  };
  store.set((prev) => ({
    ...prev,
    messages: prev.messages.map((m) => (m.id === existing.id ? message : m)),
    updatedAt: isoNow(),
  }));
}

/** 删除今天的留言（连同贴的图；往期不可删，UI 挡住） */
export function deleteBoardMessage(date: string, owner: BoardOwner) {
  const s = store.get();
  const existing = boardOn(s.messages, date, owner);
  if (!existing) return;
  if (existing.image?.blobRef) {
    void deleteBlobRef(existing.image.blobRef).catch(() => {});
  }
  store.set((prev) => ({
    ...prev,
    messages: prev.messages.filter((m) => m.id !== existing.id),
    updatedAt: isoNow(),
  }));
}

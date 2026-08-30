// 和 Ta store（2026-08-25）——情侣空间 c9「和 Ta」：回忆（一起做过的事）+ 约定（约好还没做的事）
// 规范：version + ISO 时间戳 + owner。设计文档《和ta页规划.md》：
// 回忆：完成时间/用时 + 手动粘贴的上下文（纯文本）+ 双方感受；不挂载，能转发就行
// 约定：谁提议/地点/内容/是否有时限 + done 标记；挂载到角色（关键词触发，只挂未完成）
// 感受：每条带留下时间，展示按记录次序编号（第 1 次、第 2 次…）；Nox 的 AI 生成可重roll，双方的可删除
// 照片：详情页上传/替换，可从留档相册选（自带文字描述不用再留档）；本地照片留档进相册（charAlbum=true 同时进用户和角色相册）
// 转发：只有照片全部留档过（或没照片）的卡可以转发，角色只读文字描述、全流程不读图
import { createCoupleStore, isoNow, uid } from './coupleStoreBase';
import { getLocalDateKey } from '../../utils/localDate';
import { deleteBlobRef } from '../../utils/blobRef';
import { addActivity } from './activityStore';

// ── 类型 ──

/** 事件类型 → 卡片颜色（togetherMath 里维护色板） */
export type TogetherType = 'travel' | 'food' | 'movie' | 'art' | 'daily' | 'surprise' | 'festival' | 'other';

export interface TogetherPhoto {
  blobRef: string;      // 原图（blob_assets；上传或从留档相册选）
  archiveId?: string;   // 已留档的相册条目 id（留档后写入；从相册选的直接带）
  summary?: string;     // 照片文字描述（角色只读这个；从相册选的直接用原摘要，本地照片留档后写入）
}

export interface TogetherFeeling {
  id: string;
  owner: 'me' | 'her';
  content: string;
  generated?: boolean;  // Nox 的 AI 生成（可重roll）
  createdAt: string;
  updatedAt: string;
}

export interface TogetherMemory {
  id: string;
  title: string;
  type: TogetherType;
  date: string;          // 完成时间 YYYY-MM-DD
  duration?: string;     // 用时（自由文本，如「一下午」）
  context: string;       // 手动粘贴的上下文 / 事件总结（纯文本）
  photos: TogetherPhoto[];
  feelings: TogetherFeeling[];
  createdAt: string;
  updatedAt: string;
}

export interface TogetherPromise {
  id: string;
  title: string;
  type: TogetherType;     // 事件类型 → 卡片颜色（与回忆同色板）
  proposer: 'me' | 'her' | 'together';
  place?: string;
  content: string;
  deadline?: string;     // YYYY-MM-DD（是否有时限）
  done: boolean;         // 已完成勾选（挂载只列未完成的）
  photos: TogetherPhoto[];
  feelings: TogetherFeeling[];
  createdAt: string;
  updatedAt: string;
}

export interface TogetherStore {
  version: number;
  updatedAt: string;
  memories: TogetherMemory[];
  promises: TogetherPromise[];
}

const store = createCoupleStore<TogetherStore>('couple_together_v1', 1, {
  version: 1,
  updatedAt: '1970-01-01T00:00:00.000Z',
  memories: [],
  promises: [],
});

export const useTogetherStore = store.use;
export const getTogetherStore = store.get;

// ── 纯 getter ──

export const memoryById = (memories: TogetherMemory[], id: string): TogetherMemory | undefined =>
  memories.find((m) => m.id === id);

export const promiseById = (promises: TogetherPromise[], id: string): TogetherPromise | undefined =>
  promises.find((p) => p.id === id);

/** 最近一篇回忆（首屏事件卡 A） */
export const latestMemory = (memories: TogetherMemory[]): TogetherMemory | undefined =>
  memories.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];

/** 最近一条未完成约定（首屏事件卡 B） */
export const latestOpenPromise = (promises: TogetherPromise[]): TogetherPromise | undefined =>
  promises
    .filter((p) => !p.done)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];

// ── 写（卡片） ──

export function saveMemory(input: {
  id?: string; title: string; type: TogetherType; date: string; duration?: string; context: string;
}): TogetherMemory {
  const s = store.get();
  const now = isoNow();
  const existing = input.id ? memoryById(s.memories, input.id) : undefined;
  const item: TogetherMemory = existing
    ? { ...existing, title: input.title, type: input.type, date: input.date, duration: input.duration, context: input.context, updatedAt: now }
    : {
        id: uid(), title: input.title, type: input.type, date: input.date, duration: input.duration,
        context: input.context, photos: [], feelings: [], createdAt: now, updatedAt: now,
      };
  store.set((prev) => ({
    ...prev,
    memories: existing ? prev.memories.map((m) => (m.id === existing.id ? item : m)) : [...prev.memories, item],
    updatedAt: now,
  }));
  addActivity({ kind: 'together', date: input.date, text: existing ? `编辑了回忆「${input.title}」` : `记下一段回忆「${input.title}」`, owner: 'together' });
  return item;
}

export function deleteMemory(id: string) {
  const s = store.get();
  const existing = memoryById(s.memories, id);
  if (!existing) return;
  existing.photos.forEach((p) => void deleteBlobRef(p.blobRef).catch(() => {}));
  store.set((prev) => ({ ...prev, memories: prev.memories.filter((m) => m.id !== id), updatedAt: isoNow() }));
}

export function savePromise(input: {
  id?: string; title: string; type?: TogetherType; proposer: 'me' | 'her' | 'together'; place?: string; content: string; deadline?: string;
}): TogetherPromise {
  const s = store.get();
  const now = isoNow();
  const existing = input.id ? promiseById(s.promises, input.id) : undefined;
  const item: TogetherPromise = existing
    ? { ...existing, title: input.title, type: input.type ?? existing.type, proposer: input.proposer, place: input.place, content: input.content, deadline: input.deadline, updatedAt: now }
    : {
        id: uid(), title: input.title, type: input.type ?? 'other', proposer: input.proposer, place: input.place, content: input.content,
        deadline: input.deadline, done: false, photos: [], feelings: [], createdAt: now, updatedAt: now,
      };
  store.set((prev) => ({
    ...prev,
    promises: existing ? prev.promises.map((p) => (p.id === existing.id ? item : p)) : [...prev.promises, item],
    updatedAt: now,
  }));
  addActivity({ kind: 'together', text: existing ? `编辑了约定「${input.title}」` : `约好一件事「${input.title}」`, owner: 'together' });
  return item;
}

export function deletePromise(id: string) {
  const s = store.get();
  const existing = promiseById(s.promises, id);
  if (!existing) return;
  existing.photos.forEach((p) => void deleteBlobRef(p.blobRef).catch(() => {}));
  store.set((prev) => ({ ...prev, promises: prev.promises.filter((p) => p.id !== id), updatedAt: isoNow() }));
}

export function togglePromiseDone(id: string) {
  const s = store.get();
  const existing = promiseById(s.promises, id);
  if (!existing) return;
  const item = { ...existing, done: !existing.done, updatedAt: isoNow() };
  store.set((prev) => ({ ...prev, promises: prev.promises.map((p) => (p.id === existing.id ? item : p)), updatedAt: isoNow() }));
  addActivity({ kind: 'together', text: item.done ? `「${item.title}」完成啦` : `「${item.title}」重新打开`, owner: 'together' });
}

// ── 写（感受 / 照片） ──

function patchCard(section: 'memories' | 'promises', cardId: string, fn: (m: TogetherMemory) => TogetherMemory, fp: (p: TogetherPromise) => TogetherPromise) {
  const s = store.get();
  const now = isoNow();
  if (section === 'memories') {
    const existing = memoryById(s.memories, cardId);
    if (!existing) return;
    store.set((prev) => ({ ...prev, memories: prev.memories.map((m) => (m.id === cardId ? fn(m) : m)), updatedAt: now }));
  } else {
    const existing = promiseById(s.promises, cardId);
    if (!existing) return;
    store.set((prev) => ({ ...prev, promises: prev.promises.map((p) => (p.id === cardId ? fp(p) : p)), updatedAt: now }));
  }
}

/** 加一条感受（她的手动 / 他的 AI 生成都走这；重roll = 覆盖同一条） */
export function saveFeeling(section: 'memories' | 'promises', cardId: string, input: { id?: string; owner: 'me' | 'her'; content: string; generated?: boolean }): TogetherFeeling | undefined {
  const s = store.get();
  const list = section === 'memories' ? s.memories : s.promises;
  const card = list.find((c) => c.id === cardId);
  if (!card) return undefined;
  const now = isoNow();
  const existing = input.id ? card.feelings.find((f) => f.id === input.id) : undefined;
  const feeling: TogetherFeeling = existing
    ? { ...existing, content: input.content, updatedAt: now }
    : { id: uid(), owner: input.owner, content: input.content, generated: input.generated, createdAt: now, updatedAt: now };
  patchCard(
    section, cardId,
    (m) => ({ ...m, feelings: existing ? m.feelings.map((f) => (f.id === existing.id ? feeling : f)) : [...m.feelings, feeling] }),
    (p) => ({ ...p, feelings: existing ? p.feelings.map((f) => (f.id === existing.id ? feeling : f)) : [...p.feelings, feeling] }),
  );
  const who = input.owner === 'me' ? 'Nox' : 'Angelica';
  addActivity({ kind: 'together', text: existing ? `${who} 改写了「${card.title}」的感受` : `${who} 记下了「${card.title}」的感受`, owner: input.owner === 'me' ? 'me' : 'her' });
  return feeling;
}

export function deleteFeeling(section: 'memories' | 'promises', cardId: string, feelingId: string) {
  patchCard(
    section, cardId,
    (m) => ({ ...m, feelings: m.feelings.filter((f) => f.id !== feelingId) }),
    (p) => ({ ...p, feelings: p.feelings.filter((f) => f.id !== feelingId) }),
  );
}

/** 加一张照片（上传 / 从相册选；从相册选的直接带 archiveId + summary，不用再留档） */
export function addPhoto(section: 'memories' | 'promises', cardId: string, photo: TogetherPhoto) {
  patchCard(
    section, cardId,
    (m) => ({ ...m, photos: [...m.photos, photo] }),
    (p) => ({ ...p, photos: [...p.photos, photo] }),
  );
}

/** 删一张照片（连 blobRef） */
export function removePhoto(section: 'memories' | 'promises', cardId: string, index: number) {
  const s = store.get();
  const list = section === 'memories' ? s.memories : s.promises;
  const card = list.find((c) => c.id === cardId);
  const photo = card?.photos[index];
  if (photo) void deleteBlobRef(photo.blobRef).catch(() => {});
  patchCard(
    section, cardId,
    (m) => ({ ...m, photos: m.photos.filter((_, i) => i !== index) }),
    (p) => ({ ...p, photos: p.photos.filter((_, i) => i !== index) }),
  );
}

/** 照片留档进相册后回写 archiveId + summary（角色只读这个描述） */
export function markPhotoArchived(section: 'memories' | 'promises', cardId: string, index: number, archiveId: string, summary: string) {
  patchCard(
    section, cardId,
    (m) => ({ ...m, photos: m.photos.map((p, i) => (i === index ? { ...p, archiveId, summary } : p)) }),
    (p) => ({ ...p, photos: p.photos.map((x, i) => (i === index ? { ...x, archiveId, summary } : x)) }),
  );
}

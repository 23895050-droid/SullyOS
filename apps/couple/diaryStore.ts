// 日记 store（2026-08-24）——情侣空间 c4 日记页 + Nox 的家 b3 内页
// 规范：version + ISO 时间戳 + owner；按「日期 + owner」一条
// 她的日记：手动写，当天可改；他的日记：手动写或「喊他写」AI 生成（当天可重roll）；往期一律只读
// 批阅：她的批阅（批他的日记）手动写纯文本；他的批注（批她的日记）AI 生成——按句锚点旁批（划线/圈点 + 边角小批，可重roll）
// API 槽一个（喊他写 + 批注共用）；按 Angelica 2026-08-24 定的规则：未配置回退主 API（本模块不走「不配置不调用」）
import { createCoupleStore, isoNow, uid } from './coupleStoreBase';
import { getLocalDateKey } from '../../utils/localDate';
import { addActivity } from './activityStore';

// ── 类型 ──

export type DiaryOwner = 'me' | 'her';

/** 旁批 segment（批注 prompt 的输出格式：text/strike/highlight/redact/doodle/styled + 墨色 + 字号） */
export interface DiarySeg {
  type: 'text' | 'strike' | 'highlight' | 'redact' | 'doodle' | 'styled';
  text: string;
  color?: 'graphite' | 'blue' | 'brown' | 'olive' | 'plum';
  size?: 'sm' | 'md' | 'lg';
}

/** 一句旁批：命中她日记里某个句子（sentenceId = p1s1…，与 utils/diaryMath 的分句编号一一对应） */
export interface SentenceAnchor {
  sentenceId: string;
  mark?: 'underline' | 'strike' | 'circle';
  noteBlock?: DiarySeg[];
}

export interface DiaryReview {
  content: string;            // 她的批阅纯文本；他的批注存扁平文本（AI 读 / 转发用）
  anchors?: SentenceAnchor[]; // 只有他的批注有（渲染旁批标记用）；锚点对不上旧正文时渲染端自动跳过
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiaryEntry {
  id: string;
  date: string;          // YYYY-MM-DD
  owner: DiaryOwner;
  content: string;       // 正文
  summary?: string;      // 他的 AI 生成摘要（避免角度重复；她手动写的没有）
  generated?: boolean;   // 他的日记是否 AI 生成（决定「重roll」按钮；手动写的当天可编辑）
  mood?: string;         // 心情基调 → 信纸配色（joy/calm/soft/sad/angry/night；他的由 AI 输出，她手动选）
  anchors?: SentenceAnchor[]; // 他自己的旁批（AI 生成时输出，写在正文句子上；与他的批注渲染同机制）
  photo?: { blobRef: string; archiveId?: string }; // 日记照片（她上传实拍 / 他「配一张图」AI 生成）
  review?: DiaryReview;  // 对方给这篇的批阅
  createdAt: string;
  updatedAt: string;
}

export interface DiaryApiConfig {
  baseUrl: string;       // 已带 /v1 后缀
  apiKey: string;
  model: string;
}

export interface DiaryStore {
  version: number;
  updatedAt: string;
  api: DiaryApiConfig;
  fontRef?: string;      // 自定义手写字体（blobRef，设置页上传 ttf/otf/woff）
  fontName?: string;
  entries: DiaryEntry[];
}

export const DIARY_STORE_VERSION = 1;

const DEFAULT_STORE: DiaryStore = {
  version: DIARY_STORE_VERSION,
  updatedAt: '1970-01-01T00:00:00.000Z',
  api: { baseUrl: '', apiKey: '', model: '' },
  entries: [],
};

const store = createCoupleStore<DiaryStore>('couple_diary_v1', DIARY_STORE_VERSION, DEFAULT_STORE);

export const useDiaryStore = store.use;
export const getDiaryStore = store.get;

// ── 纯 getter（挂载 / 转发 / 非 React 代码读） ──

export const diaryOn = (entries: DiaryEntry[], date: string, owner: DiaryOwner): DiaryEntry | undefined =>
  entries.find((e) => e.date === date && e.owner === owner);

/** 某个 owner 有内容的日期列表（新→旧；写日记页点时间看往期用） */
export const diaryDates = (entries: DiaryEntry[], owner: DiaryOwner): string[] =>
  entries
    .filter((e) => e.owner === owner && e.content.trim())
    .map((e) => e.date)
    .sort()
    .reverse();

/** 最近一篇（情侣页卡片表面：日期 + 正文开头摘要） */
export const latestDiary = (entries: DiaryEntry[], owner: DiaryOwner): DiaryEntry | undefined =>
  entries
    .filter((e) => e.owner === owner && e.content.trim())
    .sort((a, b) => b.date.localeCompare(a.date))[0];

// ── 写 ──

/** 保存 / 更新一篇（当天可改；往期由 UI 挡住不调用）。正文变了批阅保留——她的批阅是她的文字，标记对不上时渲染端跳过 */
export function saveDiaryEntry(input: {
  date?: string; owner: DiaryOwner; content: string; summary?: string; generated?: boolean;
  mood?: string; anchors?: SentenceAnchor[];
}): DiaryEntry {
  const s = store.get();
  const date = input.date ?? getLocalDateKey();
  const now = isoNow();
  const existing = diaryOn(s.entries, date, input.owner);
  const entry: DiaryEntry = existing
    ? {
        ...existing,
        content: input.content,
        summary: input.summary !== undefined ? input.summary : existing.summary,
        generated: input.generated !== undefined ? input.generated : existing.generated,
        mood: input.mood !== undefined ? input.mood : existing.mood,
        anchors: input.anchors !== undefined ? input.anchors : existing.anchors,
        updatedAt: now,
      }
    : {
        id: uid(), date, owner: input.owner, content: input.content,
        summary: input.summary, generated: input.generated, mood: input.mood, anchors: input.anchors,
        createdAt: now, updatedAt: now,
      };
  store.set((prev) => ({
    ...prev,
    entries: existing ? prev.entries.map((e) => (e.id === existing.id ? entry : e)) : [...prev.entries, entry],
    updatedAt: now,
  }));
  addActivity({ kind: 'diary', date, owner: input.owner, text: input.owner === 'me' ? 'Nox 写了日记' : 'Angelica 写了日记' });
  return entry;
}

/** 设/清日记照片（null 清掉）——与正文 upsert 分开：undefined 语义不打架，方便「配一张图」随时覆盖 */
export function setDiaryPhoto(date: string, owner: DiaryOwner, photo: { blobRef: string; archiveId?: string } | null): void {
  const now = isoNow();
  store.set((prev) => ({
    ...prev,
    entries: prev.entries.map((e) => (e.date === date && e.owner === owner ? { ...e, photo: photo ?? undefined, updatedAt: now } : e)),
    updatedAt: now,
  }));
}

/** 写 / 替换一篇的批阅（她的批阅手动、他的批注 AI，都走这个；重roll = 覆盖） */
export function setDiaryReview(date: string, owner: DiaryOwner, review: DiaryReview) {
  const s = store.get();
  const now = isoNow();
  const existing = diaryOn(s.entries, date, owner);
  if (!existing) return;
  const entry = { ...existing, review: { ...review, createdAt: review.createdAt || now, updatedAt: now } };
  store.set((prev) => ({ ...prev, entries: prev.entries.map((e) => (e.id === entry.id ? entry : e)), updatedAt: now }));
  addActivity({
    kind: 'diary', date, owner: owner === 'me' ? 'her' : 'me',
    text: owner === 'me' ? 'Angelica 批阅了 Nox 的日记' : 'Nox 批注了 Angelica 的日记',
  });
}

export function updateDiaryApi(patch: Partial<DiaryApiConfig>) {
  const s = store.get();
  store.set((prev) => ({ ...prev, api: { ...s.api, ...patch }, updatedAt: isoNow() }));
}

/** 换/清除自定义日记字体（blobRef + 文件名，设置页上传） */
export function updateDiaryFont(patch: { fontRef?: string; fontName?: string }) {
  const s = store.get();
  store.set((prev) => ({ ...prev, fontRef: patch.fontRef, fontName: patch.fontName, updatedAt: isoNow() }));
}

/** 删除今天的日记（连同对方批阅；往期不可删，UI 挡住） */
export function deleteDiaryEntry(date: string, owner: DiaryOwner) {
  const s = store.get();
  const existing = diaryOn(s.entries, date, owner);
  if (!existing) return;
  store.set((prev) => ({
    ...prev,
    entries: prev.entries.filter((e) => e.id !== existing.id),
    updatedAt: isoNow(),
  }));
}

/** 删除一篇的批阅（她的批阅手动删 / 他的批注重roll 前的清理不在此） */
export function deleteDiaryReview(date: string, owner: DiaryOwner) {
  const s = store.get();
  const existing = diaryOn(s.entries, date, owner);
  if (!existing) return;
  const { review: _dropped, ...rest } = existing;
  store.set((prev) => ({
    ...prev,
    entries: prev.entries.map((e) => (e.id === existing.id ? rest : e)),
    updatedAt: isoNow(),
  }));
}

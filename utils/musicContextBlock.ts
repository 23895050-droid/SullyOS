// 歌词注入组装纯函数（2026-08-26 她定稿）——全量+窗口双块、热评兜底
// 两个组装点共用：utils/chatRequestPayload.ts deriveListeningFromSnapshot + hooks/useChatAI.ts
// 长期试错区：窗口半径/全量开关是调音台参数，改设置下一条消息生效；数据（快照）不删不减
import type { MusicPlaybackSnapshot } from '../context/MusicContext';
import type { LyricInjectSettings } from '../apps/couple/musicStore';

/** 全量歌词截断上限（超出标后略） */
export const LYRIC_FULL_LIMIT = 1200;
/** 窗口半径范围：0（只当前行）~ 8（前8当前后8） */
export const WINDOW_RADIUS_MAX = 8;
export const DEFAULT_WINDOW_RADIUS = 2;

export interface UserListeningContextLike {
  songName: string;
  artists: string;
  lyricWindow: string[];
  activeIdx: number;
  /** 全量歌词（有轴=全部行拼起来；纯文本=原文），≤1200 字；开关关掉时为 undefined */
  fullLyric?: string;
  /** 彻底没歌词时的热评（2-3 条截 60 字） */
  hotComments?: string[];
}

export const clampRadius = (r: number | undefined): number => {
  if (typeof r !== 'number' || !Number.isFinite(r)) return DEFAULT_WINDOW_RADIUS;
  return Math.min(WINDOW_RADIUS_MAX, Math.max(0, Math.round(r)));
};

/** 关键词扫描条数（照原版世界书 scanDepth 默认 4） */
export const LYRIC_KEYWORD_SCAN_DEPTH = 4;

/** 固定关键词表：提到歌/听歌这件事的词 */
export const LYRIC_KEYWORDS_BASE = ['歌', '音乐', '听歌', '歌词', '唱', '这首', '旋律', '网易云', '一起听', '播放', '歌手', '专辑'];

/** 关键词表 = 固定词 + 当前歌名 + 艺人名（歌名提没提是主要触发） */
export const buildLyricWindowKeywords = (songName: string, artists: string): string[] => {
  const set: string[] = [...LYRIC_KEYWORDS_BASE];
  const push = (v: string) => { const t = v.trim(); if (t && !set.includes(t)) set.push(t); };
  push(songName);
  artists.split(/[/、,，&]+/).forEach(push);
  return set;
};

/** 消息文本（同世界书 messageText：string 或 parts 数组都认） */
const messageText = (message: { role?: string; content: unknown }): string => {
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map(part => (typeof part === 'string' ? part : (part as any)?.text || ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
};

/**
 * 关键词触发判定（照原版世界书 isWorldbookEntryActive 的关键词段）：
 * 扫最近 LYRIC_KEYWORD_SCAN_DEPTH 条消息，任一关键词命中（大小写不敏感）→ 注入窗口块。
 * 没提歌就不注入——免得背景放歌时模型一直讲歌。
 */
export const shouldInjectLyricWindow = (
  messages: Array<{ role?: string; content: unknown }> = [],
  keywords: string[],
): boolean => {
  if (keywords.length === 0) return false;
  const text = messages.slice(-LYRIC_KEYWORD_SCAN_DEPTH).map(messageText).filter(Boolean).join('\n');
  if (!text) return false;
  const lower = text.toLocaleLowerCase();
  return keywords.some(k => k && lower.includes(k.toLocaleLowerCase()));
};

/** 全量歌词文本：有轴取解析后的全部行，纯文本取原文；超长截断标后略 */
export const buildFullLyric = (snap: Pick<MusicPlaybackSnapshot, 'lyric' | 'plainLyric'>): string => {
  const raw = snap.lyric.length > 0
    ? snap.lyric.map((l) => l.text).join('\n')
    : (snap.plainLyric || '');
  if (raw.length <= LYRIC_FULL_LIMIT) return raw;
  return raw.slice(0, LYRIC_FULL_LIMIT) + '\n（歌词较长，后略）';
};

/** 以当前行为轴切窗口（前 N 当前后 N） */
export const sliceWindow = (lyric: { text: string }[], idx: number, radius: number): { window: string[]; activeIdx: number } => {
  const clamped = Math.max(0, Math.min(idx, lyric.length - 1));
  const from = Math.max(0, clamped - radius);
  const to = Math.min(lyric.length, clamped + radius + 1);
  return {
    window: lyric.slice(from, to).map((l) => l.text),
    activeIdx: clamped - from,
  };
};

/**
 * 从播放快照组装 userListening 上下文（两个组装点共用，行为一致）：
 * 有轴 → 窗口（当前行±N）+ 全量；纯文本 → 全量（无窗口）；没词 → 热评。
 * 快照里数据永远保留，这里只按调音台参数切——半径/全量开关现读现用。
 * snap 只要求结构兼容：MusicPlaybackSnapshot 和 useMusic() 返回的对象都能进。
 */
export function buildUserListeningContext(
  snap: Pick<MusicPlaybackSnapshot, 'current' | 'playing' | 'lyric' | 'activeLyricIdx' | 'plainLyric' | 'hotComments'> | null | undefined,
  inject: Pick<LyricInjectSettings, 'windowRadius' | 'fullLyric'>,
): UserListeningContextLike | null {
  if (!snap || !snap.current || !snap.playing) return null;
  const radius = clampRadius(inject.windowRadius);

  // 有轴歌词：窗口 + 全量
  if (snap.lyric.length > 0) {
    const idx = snap.activeLyricIdx >= 0 ? snap.activeLyricIdx : 0;
    const { window, activeIdx } = sliceWindow(snap.lyric, idx, radius);
    return {
      songName: snap.current.name,
      artists: snap.current.artists,
      lyricWindow: window,
      activeIdx,
      fullLyric: inject.fullLyric ? buildFullLyric(snap) : undefined,
      hotComments: [],
    };
  }

  // 纯文本歌词（没时间轴，标不了当前行）：全量、无窗口
  if (snap.plainLyric.trim()) {
    return {
      songName: snap.current.name,
      artists: snap.current.artists,
      lyricWindow: [],
      activeIdx: -1,
      fullLyric: inject.fullLyric ? buildFullLyric(snap) : undefined,
      hotComments: [],
    };
  }

  // 彻底没词：热评兜底（别人的耳朵）
  return {
    songName: snap.current.name,
    artists: snap.current.artists,
    lyricWindow: [],
    activeIdx: -1,
    hotComments: snap.hotComments,
  };
}

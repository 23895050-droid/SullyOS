// 音乐导入导出纯函数（2026-08-26）——CC↔Sully 第一个数据同步区，格式严格
// CC→Sully：schema "sully-music-import-v1"（neteaseId 唯一键，带歌词全文+首条印象+建议歌单）
// Sully→CC：schema "sully-music-export-v1"（播放记录增量 + 印象全量 + 一起听会话）
// 全部纯函数：不碰 localStorage / DB，入参传数据，便于 vitest
import type { ImportedSong, SongPlayRecord, TogetherSession } from '../apps/couple/musicStore';

// ── CC→Sully 导入 ──

export const IMPORT_SCHEMA = 'sully-music-import-v1';
export const EXPORT_SCHEMA = 'sully-music-export-v1';
export const IMPORT_SONG_LIMIT = 500;
export const TAG_LIMIT = 6;
export const TAG_MAX_LEN = 12;

/** 标签数组容错：非数组→undefined；trim、限长、去重、上限 6 */
export const normalizeTags = (v: any): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of v) {
    const t = String(x).trim();
    if (!t || t.length > TAG_MAX_LEN || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= TAG_LIMIT) break;
  }
  return out.length > 0 ? out : undefined;
};

export interface ImportSongInput {
  neteaseId: number;
  name: string;
  artists?: string[] | string;
  album?: string;
  albumPic?: string;
  duration?: number;
  fee?: number;
  lyric?: string;
  impression?: string;
  recommendPlaylist?: string;
  /** 流派标签（CC 打标，≤6 个；纯音乐标「纯音乐」） */
  genres?: string[];
  /** 感情基调标签（CC 打标，≤6 个） */
  moods?: string[];
}

export interface ParseMusicImportResult {
  schema: string;
  exportedAt?: string;
  accountName?: string;
  songs: ImportSongInput[];
  errors: string[];
}

/** 解析导入 JSON（宽松：schema 缺省/不匹配也尝试解析；neteaseId/name 必填；未知字段忽略） */
export function parseMusicImportJson(raw: unknown): ParseMusicImportResult {
  const errors: string[] = [];
  let obj: any = raw;
  if (typeof raw === 'string') {
    let text = raw.trim().replace(/^﻿/, '');
    // 从聊天/文档复制 JSON 常带 ``` 代码围栏 → 剥掉再 parse
    const fenced = text.match(/^```(?:json|JSON)?\s*([\s\S]*?)```$/);
    if (fenced) text = fenced[1].trim();
    // 微信/聊天客户端复制经常把半角引号换成全角 → 换回来再 parse
    const normalized = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    try {
      obj = JSON.parse(normalized);
    } catch {
      return {
        schema: '', songs: [],
        errors: ['这不是合法 JSON——如果从聊天里复制的，检查有没有把 ```json 围栏或多余文字一起带上'],
      };
    }
  }
  // 形态容错：标准 {songs:[...]} / 直接一首歌的对象 / 直接数组
  if (Array.isArray(obj)) {
    obj = { songs: obj };
  } else if (obj && typeof obj === 'object' && !Array.isArray(obj.songs) && typeof (obj as any).neteaseId === 'number' && typeof (obj as any).name === 'string') {
    obj = { songs: [obj] };
  }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.songs)) {
    return { schema: '', songs: [], errors: ['格式不对：需要一个带 songs 数组的对象（schema: sully-music-import-v1）——直接贴一首歌的对象也可以'] };
  }
  if (obj.songs.length > IMPORT_SONG_LIMIT) {
    errors.push(`单次上限 ${IMPORT_SONG_LIMIT} 首，这次有 ${obj.songs.length} 首，请分批导入`);
  }
  const songs: ImportSongInput[] = [];
  for (const item of obj.songs.slice(0, IMPORT_SONG_LIMIT)) {
    const id = (item as any)?.neteaseId;
    const name = (item as any)?.name;
    if (typeof id !== 'number' || !Number.isFinite(id) || id <= 0) {
      errors.push(`跳过一条：缺 neteaseId（${typeof id === 'string' ? id : JSON.stringify(item).slice(0, 60)}）`);
      continue;
    }
    if (typeof name !== 'string' || !name.trim()) {
      errors.push(`跳过一条：neteaseId ${id} 缺 name`);
      continue;
    }
    const rawArtists = (item as any)?.artists;
    const artists = Array.isArray(rawArtists)
      ? rawArtists.map((a) => String(a).trim()).filter(Boolean)
      : typeof rawArtists === 'string' && rawArtists.trim()
        ? rawArtists.split(/[,，、/]+/).map((s) => s.trim()).filter(Boolean)
        : [];
    songs.push({
      neteaseId: id,
      name: name.trim(),
      artists,
      album: typeof (item as any)?.album === 'string' ? (item as any).album : undefined,
      albumPic: typeof (item as any)?.albumPic === 'string' ? (item as any).albumPic : undefined,
      duration: typeof (item as any)?.duration === 'number' ? (item as any).duration : undefined,
      fee: typeof (item as any)?.fee === 'number' ? (item as any).fee : undefined,
      lyric: typeof (item as any)?.lyric === 'string' ? (item as any).lyric : undefined,
      impression: typeof (item as any)?.impression === 'string' ? (item as any).impression : undefined,
      recommendPlaylist: typeof (item as any)?.recommendPlaylist === 'string' ? (item as any).recommendPlaylist : undefined,
      genres: normalizeTags((item as any)?.genres),
      moods: normalizeTags((item as any)?.moods),
    });
  }
  return {
    schema: typeof obj.schema === 'string' ? obj.schema : '',
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : undefined,
    accountName: typeof obj.accountName === 'string' ? obj.accountName : undefined,
    songs,
    errors,
  };
}

/** upsert：新歌直接进；旧歌只更新快照字段（name/artists/album/albumPic/duration/fee/lyric），保留首条印象与导入时间 */
export function mergeImportedSong(existing: ImportedSong | undefined, input: ImportSongInput, batchId: string, nowIso: string): ImportedSong {
  const artistsArr = Array.isArray(input.artists)
    ? input.artists
    : typeof input.artists === 'string' && input.artists.trim()
      ? input.artists.split(/[,，、/]+/).map((s) => s.trim()).filter(Boolean)
      : [];
  if (existing) {
    return {
      ...existing,
      name: input.name,
      artists: artistsArr.length > 0 ? artistsArr : existing.artists,
      album: input.album ?? existing.album,
      albumPic: input.albumPic ?? existing.albumPic,
      duration: input.duration ?? existing.duration,
      fee: input.fee ?? existing.fee,
      lyric: input.lyric?.trim() ? input.lyric : existing.lyric,
      // 印象保留首条：已有就不覆盖（除非本来没有）
      impression: existing.impression?.trim() ? existing.impression : (input.impression ?? undefined),
      // 标签：新导入带了就换新（CC 是打标来源）；没带保留旧的（她可能在详情页点过）
      genres: input.genres ?? existing.genres,
      moods: input.moods ?? existing.moods,
    };
  }
  return {
    neteaseId: input.neteaseId,
    name: input.name,
    artists: artistsArr,
    album: input.album,
    albumPic: input.albumPic,
    duration: input.duration,
    fee: input.fee,
    lyric: input.lyric,
    impression: input.impression,
    recommendPlaylist: input.recommendPlaylist,
    genres: input.genres,
    moods: input.moods,
    importedAt: nowIso,
    importBatchId: batchId,
  };
}

// ── Sully→CC 导出 ──

export interface MusicExportPayload {
  schema: typeof EXPORT_SCHEMA;
  exportedAt: string;
  charName?: string;
  playRecords: { neteaseId: number; name: string; artists: string[]; times: number; lastPlayedAt: string; context?: string }[];
  impressions: { neteaseId: number; name: string; text: string; origin: 'import' | 'chat'; createdAt: string; genres: string[]; moods: string[] }[];
  togetherSessions: { startedAt: string; endedAt: string; durationSec: number; songCount: number; songs: { neteaseId: number; name: string; artists: string[] }[] }[];
}

/**
 * 组装导出 payload：playRecords 按 exportCursor 增量（只导游标之后的），印象全量。
 * 游标推进由调用方（musicStore）负责——纯函数只做切片。
 */
export function buildMusicExportPayload(input: {
  nowIso: string;
  charName?: string;
  playRecords: SongPlayRecord[];
  exportCursor: number;
  importedSongs: ImportedSong[];
  togetherSessions: TogetherSession[];
}): MusicExportPayload {
  const fresh = input.playRecords.filter((r) => Date.parse(r.lastPlayedAt) > input.exportCursor);
  return {
    schema: EXPORT_SCHEMA,
    exportedAt: input.nowIso,
    charName: input.charName,
    playRecords: fresh.map((r) => ({
      neteaseId: r.neteaseId,
      name: r.name,
      artists: r.artists,
      times: r.playCount,
      lastPlayedAt: r.lastPlayedAt,
      context: r.context,
    })),
    impressions: input.importedSongs
      .filter((s) => s.impression?.trim())
      .map((s) => ({
        neteaseId: s.neteaseId,
        name: s.name,
        text: s.impression as string,
        origin: 'import' as const,
        createdAt: s.importedAt,
        // 标签回传：CC 读回她改过的标（详情页 chips）
        genres: s.genres ?? [],
        moods: s.moods ?? [],
      })),
    togetherSessions: input.togetherSessions.map((t) => ({
      startedAt: t.startedAt,
      endedAt: t.endedAt,
      durationSec: Math.max(0, Math.round((Date.parse(t.endedAt) - Date.parse(t.startedAt)) / 1000)),
      songCount: t.songs.length,
      songs: t.songs.map((s) => ({ neteaseId: s.neteaseId, name: s.name, artists: s.artists })),
    })),
  };
}

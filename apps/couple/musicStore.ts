// 音乐 store（2026-08-26）——couple_music_v1 主数据层：CC 导入的歌曲/歌词/首条印象/播放计数/一起听会话/CSS 预设
// 架构：本 store 是主数据层；CharMusicProfile.playlists（角色档案 DB 字段）是镜像层，导入时同步写一份，
// 让原版 addSongToCharPlaylist / buildMusicAtmosphere 链路无感继续工作。印象/歌词/计数只存这里，按 neteaseId 关联。
// 规范：version + ISO 时间戳 + owner；网易云歌不落库，一律在线播放（原版播放链）。
// 模型分配（她 2026-08-26 定）：聊歌/印象/找歌/导入确认走主 API；结束总结用独立 api 槽（未配提示补生成）。
import { createCoupleStore, isoNow, uid } from './coupleStoreBase';
import { deleteBlobRef } from '../../utils/blobRef';
import type { MusicCssPresetId } from '../../utils/musicNightPreset';
import { addActivity } from './activityStore';
import { DB } from '../../utils/db';
import type { MusicPalette } from '../../utils/musicPalette';
import { mergeImportedSong, parseMusicImportJson, buildMusicExportPayload } from '../../utils/musicImportExport';
import type { CharPlaylistSong } from '../../types';

// ── 类型 ──

export interface MusicApiConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface ImportedSong {
  neteaseId: number;        // 唯一键
  name: string;
  artists: string[];
  album?: string;
  albumPic?: string;
  duration?: number;        // 毫秒
  fee?: number;
  lyric?: string;           // 歌词：她的手动标注（写几句/和弦走向）；CC 导入默认不带（Sully 实时拉）
  impression?: string;      // 首条印象（导入携带或详情页生成）
  recommendPlaylist?: string; // CC 建议进哪个角色歌单（模糊匹配 title）
  genres?: string[];        // 流派标签（CC 打标随导入带进/详情页 chips 点选，≤6）
  moods?: string[];         // 感情基调标签（同上）
  importedAt: string;
  importBatchId?: string;
}

/** 歌词注入设置（她 2026-08-26 定：随用随调试的调音台，前端设置卡改） */
export interface LyricInjectSettings {
  /** 当前歌词窗口半径：以当前行 ±N（默认 2） */
  windowRadius: number;
  /** 是否注入全量歌词（默认 true） */
  fullLyric: boolean;
  /** 全量歌词注入位置（参照世界书式挂载原则）：0 角色设定前 / 1 角色设定后（默认）/ 4 聊天记录指定深度 */
  fullLyricPos: 0 | 1 | 4;
  /** 当前窗口（歌名+歌词窗口+指导语）注入位置：1 角色设定后 / 4 聊天记录指定深度（默认） */
  windowPos: 1 | 4;
  /** 窗口块插入聊天记录的深度（windowPos=4 时生效）：插在倒数第 N 条消息前，照原版世界书 depth（默认 4） */
  windowDepth: number;
  /** 关键词触发（默认开）：最近几条消息提到歌/歌词/这首歌名字才注入窗口块，没提不注入——免得没提歌词一直讲歌 */
  keywordTrigger: boolean;
}

export interface SongPlayRecord {
  neteaseId: number;
  name: string;
  artists: string[];
  playCount: number;
  lastPlayedAt: string;
  context?: string;         // 最近一次来源：自己听/一起听
  albumPic?: string;        // 封面（网易云在线歌也有，房间歌曲图/情侣左卡直接用，不依赖导入）
}

export interface TogetherSessionSong {
  neteaseId: number;
  name: string;
  artists: string[];
  count: number;            // 会话内播放次数
  albumPic?: string;        // 总结卡行封面
}

export interface TogetherSession {
  id: string;
  charId: string;           // 一起听伙伴（每位伙伴一份会话，总结卡发进各自的聊天）
  startedAt: string;
  endedAt: string;
  songs: TogetherSessionSong[];
  summary?: string;
  summaryCardId?: string;   // 防重复发卡
}

/** 一起听邀请记录（双向，批 2） */
export interface PendingInvite {
  id: string;
  charId: string;
  /** user=她发起的邀请，等 AI 输出 accept/decline 标签；char=他发起的邀请，等她点卡片上的按钮 */
  direction: 'user' | 'char';
  /** 他邀请时提议的歌名（她点接受时去搜）；她发起时就是当前播放的歌 */
  inviteSongName?: string;
  /** 邀请卡 message id（更新卡片状态用） */
  cardMessageId?: string;
  createdAt: string;
}

export interface ImportBatch {
  id: string;
  importedAt: string;
  fileName?: string;
  songCount: number;
  skippedCount: number;
  note?: string;
}

/** 情侣页右卡「我自己选的一首歌」（2026-08-30）：她亲手挑的 */
export interface MySongPick {
  neteaseId?: number;
  name: string;
  artists: string[];
  albumPic?: string;
  pickedAt: string;
}

export interface MusicChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  at: string;
}

export interface MusicChatSession {
  charId: string;
  messages: MusicChatMessage[];
  /** 已总结进主聊天的段落游标（每 50 条一段） */
  segCursor: number;
  saved: boolean;           // 退出时选了保存 → 回来接着聊
}

export interface CoupleMusicV1 {
  version: 1;
  updatedAt: string;
  api?: MusicApiConfig;             // 独立槽——只给结束总结用
  lyricInject: LyricInjectSettings; // 歌词注入调音台（窗口半径/全量开关）
  importedSongs: ImportedSong[];
  playRecords: SongPlayRecord[];
  togetherSessions: TogetherSession[];
  pendingInvites: PendingInvite[];
  /** 上次被婉拒的邀请时刻（ISO）——他关键词发起邀请的冷却起点（防连环插卡） */
  lastDeclinedInviteAt?: string;
  /** 会话已结束但总结卡没生成（当时没配 API）——设置页「补生成」逐条补 */
  pendingSummarySessionIds: string[];
  cssGlobal: string;                // 基础（--mz-* 变量等，作用所有页面）
  cssPages: Record<string, string>; // 分页 CSS：每页一份（她 2026-08-26 要求分页，模型写起来互不干扰）
  cssPerChar: Record<string, string>; // 角色页的每角色覆盖
  /** 聊歌页背景自设（2026-08-30 她要求开放）：图走 blobRef，颜色任意 CSS 色 */
  chatBgImage?: string;
  chatBgColor?: string;
  /** 聊歌页显示头像开关（2026-08-30 她要求：设置里可开，默认开——页面太空） */
  chatShowAvatar?: boolean;
  /** 情侣页右卡「我自己选的一首歌」（2026-08-30）：她亲手挑的，不是自动数据 */
  mySongPick?: MySongPick;
  /** 内置 CSS 预设（2026-08-30）：'night' = 沉浸夜色（播放页+聊歌页深色版），undefined = 默认浅色 */
  cssPreset?: MusicCssPresetId;
  /** 调色台（2026-08-30 她要求）：音乐页全量 --mz-* 颜色可视化改，与手写 cssGlobal 分开存 */
  palette?: MusicPalette;
  exportCursor: number;             // 已导出 playRecords 游标（lastPlayedAt 时间戳）
  importBatches: ImportBatch[];
  musicChatSessions: MusicChatSession[];
}

/** CSS 分页 key（音乐 App 各视图各一份；'chat' = 聊歌页，'miniplayer' = 全局悬浮窗） */
export type MusicCssPage = 'search' | 'player' | 'profile' | 'settings' | 'playlist' | 'visit_char' | 'chat' | 'miniplayer';
export const MUSIC_CSS_PAGES: MusicCssPage[] = ['search', 'player', 'profile', 'settings', 'playlist', 'visit_char', 'chat', 'miniplayer'];

const store = createCoupleStore<CoupleMusicV1>('couple_music_v1', 1, {
  version: 1,
  updatedAt: '1970-01-01T00:00:00.000Z',
  lyricInject: { windowRadius: 2, fullLyric: true, fullLyricPos: 1, windowPos: 4, windowDepth: 4, keywordTrigger: true },
  importedSongs: [],
  playRecords: [],
  togetherSessions: [],
  pendingInvites: [],
  pendingSummarySessionIds: [],
  cssGlobal: '',
  cssPages: {},
  cssPerChar: {},
  chatBgImage: undefined,
  chatBgColor: undefined,
  chatShowAvatar: true,
  mySongPick: undefined,
  exportCursor: 0,
  importBatches: [],
  musicChatSessions: [],
});

export const useMusicStore = store.use;
export const getMusicStore = store.get;

// ── 纯 getter ──

export const importedSongById = (songs: ImportedSong[], id: number): ImportedSong | undefined =>
  songs.find((s) => s.neteaseId === id);

export const playRecordById = (records: SongPlayRecord[], id: number): SongPlayRecord | undefined =>
  records.find((r) => r.neteaseId === id);

/** 一起听次数：由会话记录聚合（批 2 写入后详情页展示） */
export const togetherCountOf = (sessions: TogetherSession[], neteaseId: number): number =>
  sessions.filter((t) => t.songs.some((s) => s.neteaseId === neteaseId)).length;

// ── 导入（CC→Sully） ──

export interface ImportMusicResult {
  imported: number;
  skipped: number;                 // 镜像歌单里已存在的歌
  mappedToPlaylists: string[];     // 映射进哪些歌单
  errors: string[];
}

/**
 * 导入 CC 导出的 JSON：
 * 1. 解析校验（宽松，neteaseId/name 必填）
 * 2. upsert importedSongs（保留首条印象与歌词）
 * 3. 镜像进角色歌单（recommendPlaylist 模糊匹配，无则「CC 导入」歌单；source='user'）
 * 4. 广播 char-music-profile-updated（复用原版广播，OSContext 已监听同步内存角色）
 */
export async function importMusicJson(charId: string, raw: unknown, fileName?: string): Promise<ImportMusicResult> {
  const parsed = parseMusicImportJson(raw);
  if (parsed.songs.length === 0 && parsed.errors.length > 0) {
    return { imported: 0, skipped: 0, mappedToPlaylists: [], errors: parsed.errors };
  }
  const now = isoNow();
  const batchId = uid();
  const mapped = new Set<string>();

  // 1) upsert 歌曲
  const upserted: ImportedSong[] = [];
  const updatedSongs = [...store.get().importedSongs];
  for (const input of parsed.songs) {
    const existing = importedSongById(updatedSongs, input.neteaseId);
    const merged = mergeImportedSong(existing, input, batchId, now);
    if (existing) {
      updatedSongs[updatedSongs.findIndex((x) => x.neteaseId === input.neteaseId)] = merged;
    } else {
      updatedSongs.push(merged);
    }
    upserted.push(merged);
  }
  store.set((prev) => ({ ...prev, importedSongs: updatedSongs, updatedAt: now }));

  // 2) 镜像进角色歌单（DB 读角色 → 写回 → 广播）
  let skipped = 0;
  try {
    const chars = await DB.getAllCharacters();
    const targetChar = chars.find((c) => c.id === charId);
    if (targetChar?.musicProfile) {
      const profile = targetChar.musicProfile;
      const playlists = profile.playlists.slice();

      const findPl = (title: string): number => {
        const t = title.trim().toLowerCase();
        if (!t) return -1;
        return playlists.findIndex(
          (p) => p.title.trim().toLowerCase() === t || p.title.trim().toLowerCase().includes(t) || t.includes(p.title.trim().toLowerCase()),
        );
      };
      const ensureImportPl = (): number => {
        let idx = playlists.findIndex((p) => p.title === 'CC 导入');
        if (idx < 0) {
          playlists.push({
            id: `pl-cc-import-${Date.now()}`,
            title: 'CC 导入',
            description: '从 Claude Code 那边带过来的歌',
            coverStyle: `gradient-0${(playlists.length % 6) + 1}`,
            songs: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          idx = playlists.length - 1;
        }
        return idx;
      };

      for (const song of upserted) {
        const plIdx = song.recommendPlaylist ? findPl(song.recommendPlaylist) : -1;
        const targetIdx = plIdx >= 0 ? plIdx : ensureImportPl();
        const pl = playlists[targetIdx];
        mapped.add(pl.title);
        if (pl.songs.some((x) => x.id === song.neteaseId)) {
          skipped++;
          continue;
        }
        const plSong: CharPlaylistSong = {
          id: song.neteaseId,
          name: song.name,
          artists: song.artists.join(' / '),
          album: song.album ?? '',
          albumPic: song.albumPic ?? '',
          // 原版 Song.duration 单位是秒；导入的 duration 是毫秒 → 换算
          duration: song.duration ? Math.round(song.duration / 1000) : 0,
          fee: song.fee ?? 0,
          source: 'user',
          addedAt: Date.now(),
        };
        playlists[targetIdx] = { ...pl, songs: [...pl.songs, plSong], updatedAt: Date.now() };
      }

      const updatedProfile = { ...profile, playlists, updatedAt: Date.now() };
      await DB.saveCharacter({ ...targetChar, musicProfile: updatedProfile });
      window.dispatchEvent(new CustomEvent('char-music-profile-updated', {
        detail: { charId, musicProfile: updatedProfile },
      }));
    }
  } catch {
    // 角色写库失败不影响主数据层；回执里不带镜像信息
  }

  // 3) 批次记录
  store.set((prev) => ({
    ...prev,
    importBatches: [
      { id: batchId, importedAt: now, fileName, songCount: parsed.songs.length, skippedCount: skipped, note: parsed.accountName ? `来自 ${parsed.accountName}` : undefined },
      ...prev.importBatches,
    ].slice(0, 50),
    updatedAt: isoNow(),
  }));
  addActivity({ kind: 'music', text: `导入 ${parsed.songs.length} 首歌`, owner: 'together' });

  return { imported: parsed.songs.length, skipped, mappedToPlaylists: Array.from(mapped), errors: parsed.errors };
}

// ── 播放计数（统一入口） ──

/**
 * 角色真的在听一首歌时（批 2 一起听会话）才记：本 store playRecords +1，并顺带补写原版 recentPlays。
 * **手动点播不记**——用户自己点开歌听是用户在听，不是角色在听（她 2026-08-26 纠正）。
 */
export function recordCharSongPlay(charId: string, song: { id: number; name: string; artists: string }, context?: string) {
  const now = isoNow();
  const s = store.get();
  const existing = playRecordById(s.playRecords, song.id);
  const artists = song.artists ? String(song.artists).split(/[/、,]+/).map((x) => x.trim()).filter(Boolean) : [];
  const record: SongPlayRecord = existing
    ? { ...existing, playCount: existing.playCount + 1, lastPlayedAt: now, context: context ?? existing.context }
    : { neteaseId: song.id, name: song.name, artists, playCount: 1, lastPlayedAt: now, context };
  store.set((prev) => ({
    ...prev,
    playRecords: existing
      ? prev.playRecords.map((r) => (r.neteaseId === song.id ? record : r))
      : [...prev.playRecords, record],
    updatedAt: now,
  }));

  appendRecentPlays(charId, [
    {
      song: { id: song.id, name: song.name, artists: String(song.artists), album: '', albumPic: '', duration: 0, fee: 0, source: 'discovered' as const, addedAt: Date.now() },
      at: Date.now(),
      context,
    },
  ]);
  return record;
}

/**
 * 自己听歌的记录（2026-08-30 她要求：音乐信息不依赖导入——播放器每次真播放都记，数据源=近期最常听）。
 * 只写本 store 的 playRecords（封面一起存），不写角色 recentPlays 镜像——
 * 镜像语义是「角色在听」（一起听走 flushTogetherSession），自己点播不是角色在听（她 2026-08-26 纠正）。
 */
export function recordLocalPlay(song: { id: number; name: string; artists: string; albumPic?: string }) {
  const now = isoNow();
  const s = store.get();
  const existing = playRecordById(s.playRecords, song.id);
  const artists = song.artists ? String(song.artists).split(/[/、,]+/).map((x) => x.trim()).filter(Boolean) : [];
  const record: SongPlayRecord = existing
    ? { ...existing, playCount: existing.playCount + 1, lastPlayedAt: now, albumPic: song.albumPic ?? existing.albumPic }
    : { neteaseId: song.id, name: song.name, artists, playCount: 1, lastPlayedAt: now, albumPic: song.albumPic, context: '自己听' };
  store.set((prev) => ({
    ...prev,
    playRecords: existing
      ? prev.playRecords.map((r) => (r.neteaseId === song.id ? record : r))
      : [...prev.playRecords, record],
    updatedAt: now,
  }));
  return record;
}

/** 补写原版 recentPlays（上限 50，unshift 去重）——recordCharSongPlay 和 flushTogetherSession 共用 */
function appendRecentPlays(charId: string, entries: { song: CharPlaylistSong; at: number; context?: string }[]) {
  if (entries.length === 0) return;
  DB.getAllCharacters()
    .then((chars) => {
      const targetChar = chars.find((c) => c.id === charId);
      if (!targetChar || !targetChar.musicProfile) return;
      const profile = targetChar.musicProfile;
      const filtered = profile.recentPlays.filter((r) => !entries.some((e) => e.song.id === r.song.id));
      const recentPlays = [...entries, ...filtered].slice(0, 50);
      const updatedProfile = { ...profile, recentPlays, updatedAt: Date.now() };
      return DB.saveCharacter({ ...targetChar, musicProfile: updatedProfile }).then(() => {
        window.dispatchEvent(new CustomEvent('char-music-profile-updated', {
          detail: { charId, musicProfile: updatedProfile },
        }));
      });
    })
    .catch(() => {});
}

// ── 歌曲详情 ──

export interface SongDetail {
  song: ImportedSong | undefined;
  playCount: number;
  togetherCount: number;
}

export function getSongDetail(neteaseId: number): SongDetail {
  const s = store.get();
  return {
    song: importedSongById(s.importedSongs, neteaseId),
    playCount: playRecordById(s.playRecords, neteaseId)?.playCount ?? 0,
    togetherCount: togetherCountOf(s.togetherSessions, neteaseId),
  };
}

/** 更新/写入首条印象（AI 生成或手动改） */
export function saveSongImpression(neteaseId: number, impression: string) {
  const now = isoNow();
  store.set((prev) => ({
    ...prev,
    importedSongs: prev.importedSongs.map((s) => (s.neteaseId === neteaseId ? { ...s, impression } : s)),
    updatedAt: now,
  }));
}

/** 手动编辑歌词全文（她 2026-08-26：歌词自己写几句比导入全文方便；也放和弦走向） */
export function saveSongLyric(neteaseId: number, lyric: string) {
  const now = isoNow();
  store.set((prev) => ({
    ...prev,
    importedSongs: prev.importedSongs.map((s) => (s.neteaseId === neteaseId ? { ...s, lyric } : s)),
    updatedAt: now,
  }));
}

/** 打标：流派 + 感情基调（详情页 chips 点选；CC 打标随导入进来） */
export function saveSongTags(neteaseId: number, genres: string[], moods: string[]) {
  const now = isoNow();
  store.set((prev) => ({
    ...prev,
    importedSongs: prev.importedSongs.map((s) => (s.neteaseId === neteaseId ? { ...s, genres, moods } : s)),
    updatedAt: now,
  }));
}

/** 歌词注入调音台（窗口半径/全量开关）——设置卡改完下一条消息生效 */
export const setLyricInject = (patch: Partial<LyricInjectSettings>) =>
  store.set((s) => ({ ...s, lyricInject: { ...s.lyricInject, ...patch }, updatedAt: isoNow() }));

// ── CSS 预设 ──

export const setCssGlobal = (css: string) => store.set((s) => ({ ...s, cssGlobal: css, updatedAt: isoNow() }));

/** 调色台（2026-08-30）：只改颜色，patch 里传要改的键；恢复默认传空调用 resetMusicPalette */
export const setMusicPalette = (patch: MusicPalette) =>
  store.set((s) => ({ ...s, palette: { ...s.palette, ...patch }, updatedAt: isoNow() }));

export const resetMusicPalette = () =>
  store.set((s) => ({ ...s, palette: undefined, updatedAt: isoNow() }));

/** 聊歌页背景自设（2026-08-30）：imageRef 传新 blobRef 或 undefined=撤图；color 传 CSS 色或 undefined=恢复默认 */
export const setChatBg = (imageRef: string | undefined, color: string | undefined) =>
  store.set((s) => {
    const prevRef = s.chatBgImage;
    if (prevRef && prevRef !== imageRef) void deleteBlobRef(prevRef); // 换图/撤图时清掉旧图，不攒垃圾
    return { ...s, chatBgImage: imageRef, chatBgColor: color, updatedAt: isoNow() };
  });

/** 聊歌页显示头像开关（2026-08-30） */
export const setChatShowAvatar = (v: boolean) =>
  store.set((s) => ({ ...s, chatShowAvatar: v, updatedAt: isoNow() }));

/** 情侣页右卡「我自己选的一首歌」（2026-08-30）：传 undefined = 清掉选择 */
export const setMySongPick = (pick: Omit<MySongPick, 'pickedAt'> | undefined) =>
  store.set((s) => ({ ...s, mySongPick: pick ? { ...pick, pickedAt: isoNow() } : undefined, updatedAt: isoNow() }));

/** 收听次数最多的歌（播放记录 top1；封面记录自带，导入歌库只补时长等）——房间歌曲图/情侣页左卡共用 */
export const topPlayedSong = (s: CoupleMusicV1): { record: SongPlayRecord; albumPic?: string; duration?: number; fee?: number; album?: string } | undefined => {
  if (s.playRecords.length === 0) return undefined;
  const record = [...s.playRecords].sort((a, b) => b.playCount - a.playCount || (a.lastPlayedAt < b.lastPlayedAt ? 1 : -1))[0];
  const song = importedSongById(s.importedSongs, record.neteaseId);
  return { record, albumPic: record.albumPic ?? song?.albumPic, duration: song?.duration, fee: song?.fee, album: song?.album };
};

/** 内置 CSS 预设切换（2026-08-30）：'night' = 沉浸夜色；undefined = 默认 */
export const setCssPreset = (preset: MusicCssPresetId | undefined) =>
  store.set((s) => ({ ...s, cssPreset: preset, updatedAt: isoNow() }));
export const setCssPage = (page: string, css: string) =>
  store.set((s) => ({ ...s, cssPages: { ...s.cssPages, [page]: css }, updatedAt: isoNow() }));
export const clearCssPage = (page: string) =>
  store.set((s) => {
    const next = { ...s.cssPages };
    delete next[page];
    return { ...s, cssPages: next, updatedAt: isoNow() };
  });
export const setCssPerChar = (charId: string, css: string) =>
  store.set((s) => ({ ...s, cssPerChar: { ...s.cssPerChar, [charId]: css }, updatedAt: isoNow() }));
export const clearCssPerChar = (charId: string) =>
  store.set((s) => {
    const next = { ...s.cssPerChar };
    delete next[charId];
    return { ...s, cssPerChar: next, updatedAt: isoNow() };
  });

// ── 导出（Sully→CC） ──

/** 组装导出 payload 并推进游标。返回 JSON 字符串（调用方负责下载/复制）。 */
export function exportMusicJson(charName?: string): string {
  const now = isoNow();
  const s = store.get();
  const payload = buildMusicExportPayload({
    nowIso: now,
    charName,
    playRecords: s.playRecords,
    exportCursor: s.exportCursor,
    importedSongs: s.importedSongs,
    togetherSessions: s.togetherSessions,
  });
  // 游标 = 本次导出的最新 lastPlayedAt
  const newest = payload.playRecords.reduce((max, r) => Math.max(max, Date.parse(r.lastPlayedAt)), 0);
  const cursor = newest > 0 ? newest : Date.parse(now);
  store.set((prev) => ({ ...prev, exportCursor: cursor, updatedAt: now }));
  return JSON.stringify(payload, null, 2);
}

/** 音乐 API 槽（只给结束总结用；批 2 接） */
export const setMusicApi = (api: MusicApiConfig | undefined) =>
  store.set((s) => ({ ...s, api: api, updatedAt: isoNow() }));

// ── 一起听邀请（批 2：双向显式，邀请卡不作废机制） ──

export const pendingInviteOf = (charId: string): PendingInvite | undefined =>
  store.get().pendingInvites.find((p) => p.charId === charId);

/** 登记邀请（同 char 旧邀请直接覆盖——一次只等一个回应） */
export function addPendingInvite(invite: Omit<PendingInvite, 'id' | 'createdAt'>): PendingInvite {
  const item: PendingInvite = { id: uid(), createdAt: isoNow(), ...invite };
  const now = isoNow();
  store.set((s) => ({
    ...s,
    pendingInvites: [...s.pendingInvites.filter((p) => p.charId !== item.charId), item],
    updatedAt: now,
  }));
  return item;
}

export const removePendingInvite = (charId: string, outcome?: 'accepted' | 'declined') =>
  store.set((s) => ({
    ...s,
    pendingInvites: s.pendingInvites.filter((p) => p.charId !== charId),
    // 婉拒 → 记冷却起点：他这段时间别再关键词发起新邀请（防「拒绝→马上再邀」连环卡）
    lastDeclinedInviteAt: outcome === 'declined' ? isoNow() : s.lastDeclinedInviteAt,
    updatedAt: isoNow(),
  }));

/** 关键词发起邀请的冷却时长：婉拒后这段时间内他不再自动插邀请卡 */
export const KEYWORD_INVITE_COOLDOWN_MS = 10 * 60 * 1000;

/** 他能否用关键词发起新邀请：没有挂着的邀请，且不在婉拒冷却期内 */
export const keywordInviteAllowed = (charId: string): boolean => {
  const s = store.get();
  if (s.pendingInvites.some((p) => p.charId === charId)) return false;
  if (!s.lastDeclinedInviteAt) return true;
  return Date.now() - Date.parse(s.lastDeclinedInviteAt) >= KEYWORD_INVITE_COOLDOWN_MS;
};

/** 清掉婉拒冷却（测试用） */
export const clearDeclinedInviteStamp = () =>
  store.set((s) => ({ ...s, lastDeclinedInviteAt: undefined, updatedAt: isoNow() }));

// ── 一起听会话落库（批 2） ──

/**
 * 会话缓冲 flush 进 togetherSessions；每首歌按会话内次数批量记 playRecords + 原版 recentPlays。
 * 会话一结束就把整段计数一次写完（不像 recordCharSongPlay 那样逐次写库）。
 */
export function flushTogetherSession(
  charId: string,
  songs: TogetherSessionSong[],
  startedAt: number,
  endedAt: number,
): TogetherSession {
  const session: TogetherSession = {
    id: uid(),
    charId,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    songs,
  };
  const now = isoNow();
  store.set((s) => ({ ...s, togetherSessions: [...s.togetherSessions, session].slice(-200), updatedAt: now }));

  if (songs.length > 0) {
    const cur = store.get();
    const records = [...cur.playRecords];
    const recentEntries: { song: CharPlaylistSong; at: number; context?: string }[] = [];
    for (const song of songs) {
      const idx = records.findIndex((r) => r.neteaseId === song.neteaseId);
      const existing = idx >= 0 ? records[idx] : undefined;
      const record: SongPlayRecord = existing
        ? { ...existing, playCount: existing.playCount + song.count, lastPlayedAt: now, context: '一起听' }
        : { neteaseId: song.neteaseId, name: song.name, artists: song.artists, playCount: song.count, lastPlayedAt: now, context: '一起听' };
      if (existing) records[idx] = record; else records.push(record);
      const base = {
        song: { id: song.neteaseId, name: song.name, artists: song.artists.join(' / '), album: '', albumPic: '', duration: 0, fee: 0, source: 'discovered' as const, addedAt: Date.now() },
        context: '一起听' as const,
      };
      for (let i = 0; i < song.count; i++) recentEntries.push({ ...base, at: Date.now() });
    }
    store.set((prev) => ({ ...prev, playRecords: records, updatedAt: isoNow() }));
    appendRecentPlays(charId, recentEntries);
  }
  return session;
}

/** 总结卡已落 → 会话记 summary + cardId（防重发卡） */
export const setSessionSummary = (sessionId: string, summary: string, cardId: string) =>
  store.set((s) => ({
    ...s,
    togetherSessions: s.togetherSessions.map((t) => (t.id === sessionId ? { ...t, summary, summaryCardId: cardId } : t)),
    updatedAt: isoNow(),
  }));

/** 结束总结当时没配 API → 记一笔，设置页「补生成」逐条补 */
export const markSummaryPending = (sessionId: string) =>
  store.set((s) => ({
    ...s,
    pendingSummarySessionIds: s.pendingSummarySessionIds.includes(sessionId) ? s.pendingSummarySessionIds : [...s.pendingSummarySessionIds, sessionId],
    updatedAt: isoNow(),
  }));

export const clearSummaryPending = (sessionId: string) =>
  store.set((s) => ({ ...s, pendingSummarySessionIds: s.pendingSummarySessionIds.filter((id) => id !== sessionId), updatedAt: isoNow() }));

// ── 聊歌独立会话（批 2：按 charId 一份，与主聊天 DB 完全分开） ──

export const musicChatSessionOf = (charId: string): MusicChatSession | undefined =>
  store.get().musicChatSessions.find((c) => c.charId === charId);

/** 追加聊歌消息（新会话自动建档） */
export function appendMusicChatMessages(charId: string, messages: MusicChatMessage[]) {
  if (messages.length === 0) return;
  const now = isoNow();
  store.set((s) => {
    const sessions = [...s.musicChatSessions];
    const idx = sessions.findIndex((c) => c.charId === charId);
    if (idx >= 0) {
      sessions[idx] = { ...sessions[idx], messages: [...sessions[idx].messages, ...messages] };
    } else {
      sessions.push({ charId, messages, segCursor: 0, saved: false });
    }
    return { ...s, musicChatSessions: sessions, updatedAt: now };
  });
}

export const setMusicChatSegCursor = (charId: string, segCursor: number) =>
  store.set((s) => ({
    ...s,
    musicChatSessions: s.musicChatSessions.map((c) => (c.charId === charId ? { ...c, segCursor } : c)),
    updatedAt: isoNow(),
  }));

/** 长按编辑聊歌消息（2026-08-30）：只改正文；已总结过的段落照旧，编辑只影响之后的上下文 */
export const editMusicChatMessage = (charId: string, id: string, content: string) =>
  store.set((s) => ({
    ...s,
    musicChatSessions: s.musicChatSessions.map((c) =>
      c.charId === charId
        ? { ...c, messages: c.messages.map((m) => (m.id === id ? { ...m, content } : m)) }
        : c,
    ),
    updatedAt: isoNow(),
  }));

export const deleteMusicChatMessage = (charId: string, id: string) =>
  store.set((s) => ({
    ...s,
    musicChatSessions: s.musicChatSessions.map((c) =>
      c.charId === charId
        ? { ...c, messages: c.messages.filter((m) => m.id !== id) }
        : c,
    ),
    updatedAt: isoNow(),
  }));

export const setMusicChatSaved = (charId: string, saved: boolean) =>
  store.set((s) => ({
    ...s,
    musicChatSessions: s.musicChatSessions.map((c) => (c.charId === charId ? { ...c, saved } : c)),
    updatedAt: isoNow(),
  }));

export const clearMusicChatSession = (charId: string) =>
  store.set((s) => ({ ...s, musicChatSessions: s.musicChatSessions.filter((c) => c.charId !== charId), updatedAt: isoNow() }));

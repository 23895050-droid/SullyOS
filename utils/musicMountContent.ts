// 音乐挂载块内容生成器（2026-08-26）——世界书第 9 块「音乐」
// 纯函数：入参传数据不引 store（vitest 友好）；空数据返回空串 = 不注入
// 数据源 = musicStore 主数据层（导入歌曲/播放记录/一起听会话），现读现生成，零 DB 依赖
// 歌单概况按 recommendPlaylist 分组（无建议歌单的归「CC 导入」——与镜像规则一致）
// 关键词：配置关键词 ∪ 全部歌名（上限 40）→ 提到歌名直接命中世界书
import type { ImportedSong, SongPlayRecord, TogetherSession } from '../apps/couple/musicStore';

export const MUSIC_MOUNT_KEY_LIMIT = 40;
export const IMPORT_PLAYLIST_TITLE = 'CC 导入';

export interface MusicMountInput {
  charName?: string;
  importedSongs: ImportedSong[];
  playRecords: SongPlayRecord[];
  togetherSessions: TogetherSession[];
}

/** 按 recommendPlaylist 分组（无建议歌单归「CC 导入」，顺序稳定） */
export const groupImportedSongs = (songs: ImportedSong[]): { title: string; items: ImportedSong[] }[] => {
  const groups = new Map<string, ImportedSong[]>();
  for (const s of songs) {
    const t = s.recommendPlaylist?.trim() || IMPORT_PLAYLIST_TITLE;
    const list = groups.get(t);
    if (list) list.push(s);
    else groups.set(t, [s]);
  }
  return Array.from(groups.entries()).map(([title, items]) => ({ title, items }));
};

/** 动态关键词：配置关键词 ∪ 全部歌名（去重、截断） */
export const buildMusicMountKey = (configuredKeys: string[], input: MusicMountInput): string[] => {
  const set = new Set<string>(configuredKeys.filter(Boolean));
  for (const s of input.importedSongs) if (s.name) set.add(s.name.trim());
  return Array.from(set).slice(0, MUSIC_MOUNT_KEY_LIMIT);
};

/** 最近常听 top N（按 playCount 降序，同次数按最近播放） */
export const topPlayRecords = (records: SongPlayRecord[], n: number): SongPlayRecord[] =>
  records
    .slice()
    .sort((a, b) => (b.playCount - a.playCount) || (a.lastPlayedAt < b.lastPlayedAt ? 1 : -1))
    .slice(0, n);

export function buildMusicMountContent(input: MusicMountInput): string {
  const lines: string[] = [];
  const char = input.charName || '我';
  const groups = groupImportedSongs(input.importedSongs);

  // 1) 歌单概况
  if (groups.length > 0) {
    lines.push(`${char} 的音乐歌单：`);
    for (const g of groups) {
      const top3 = g.items.slice(0, 3).map((s) => `《${s.name}》`).join('、');
      lines.push(`- 《${g.title}》（${g.items.length} 首）${top3 ? `，最近在听：${top3}` : ''}`);
    }
  }

  // 2) 最近常听 top 3（带次数）
  const top3 = topPlayRecords(input.playRecords, 3);
  if (top3.length > 0) {
    lines.push(`${char} 最近常听：`);
    for (const r of top3) {
      lines.push(`- 《${r.name}》— ${r.artists.join(' / ')}（听过 ${r.playCount} 次${r.context ? `，最近一次：${r.context}` : ''}）`);
    }
  }

  // 3) 每单挑 1 首附首条印象（有印象才出，防止空壳信息）
  const picked: string[] = [];
  for (const g of groups) {
    for (const s of g.items) {
      const imp = s.impression?.trim();
      if (imp) {
        picked.push(`- 《${s.name}》：${imp}`);
        break;
      }
    }
  }
  if (picked.length > 0) {
    lines.push(`${char} 对几首歌的印象：`);
    lines.push(...picked);
  }

  // 4) 最近一次一起听会话（批 2 写入才有）
  const latest = input.togetherSessions
    .slice()
    .sort((a, b) => (a.endedAt < b.endedAt ? 1 : -1))[0];
  if (latest) {
    const names = latest.songs.map((s) => `《${s.name}》`).join('、');
    lines.push(`最近一次和 {{user}} 一起听歌（${latest.startedAt.slice(0, 10)}）：${names}。`);
  }

  if (lines.length === 0) return '';
  return lines.join('\n');
}

// ── 提歌注入（批 2：聊天里提到导入的歌 → 注入印象/次数） ──

/** 用户消息里命中的导入歌名（最长名优先，最多 3 首，防同名误命中） */
export const detectSongMentions = (text: string, songs: ImportedSong[]): ImportedSong[] =>
  songs
    .filter((s) => s.name && text.includes(s.name.trim()))
    .sort((a, b) => b.name.length - a.name.length)
    .slice(0, 3);

/**
 * 提歌注入块：只写「听过/有印象」的歌——印象、次数、一起听次数。
 * 没听过没印象的命中不在这个块里（调用方走「music-诚实回应」prompt）。
 */
export function buildMusicRecordBlock(
  hits: ImportedSong[],
  playRecords: SongPlayRecord[],
  togetherSessions: TogetherSession[],
): string {
  const lines: string[] = [];
  for (const s of hits) {
    const rec = playRecords.find((r) => r.neteaseId === s.neteaseId);
    const togetherCount = togetherSessions.filter((t) => t.songs.some((x) => x.neteaseId === s.neteaseId)).length;
    if (!rec && togetherCount === 0 && !s.impression) continue;
    const parts: string[] = [];
    if (s.impression) parts.push(`你的印象是「${s.impression}」`);
    if (rec) parts.push(`你听过 ${rec.playCount} 次`);
    if (togetherCount > 0) parts.push(`你们一起听过 ${togetherCount} 次`);
    lines.push(`- 《${s.name}》：${parts.join('；')}。`);
  }
  return lines.length > 0 ? `对方提起了你歌单里的歌：\n${lines.join('\n')}` : '';
}

// ── 他发起/结束一起听的关键词判定（2026-08-27 她定：一起听交互不常驻指令集） ──
// 模型不输出标签、不背协议——他说了什么由前端现判。短语都带「歌」字或完整动作词，
// 刻意避开「听我说」「你还在听歌吗」这类会误伤的日常说法。

const MUSIC_INVITE_PHRASES = [
  '一起听歌', '一起听首', '一起听点', '一起听会儿', '一起听首歌',
  '想听歌', '要听歌', '听首歌', '听点歌', '听会儿歌', '听一首歌',
  '放首歌', '来听歌', '去听歌', '陪你听歌', '陪我听歌', '要不要听歌',
];

// 只留音乐语境明确的话——「先走了/去睡了/去忙了」是日常收尾话，聊天结尾谁都会说，
// 一起听中会被误判成退出（每次误判 = 一次总结 API 调用 + 一张卡，2026-08-27 修）
const MUSIC_EXIT_PHRASES = [
  '不听了', '先不听了', '不一起听了', '下次再听', '下次再一起听', '听够了',
  '今天就到这', '先到这', '就到这', '就到这里', '就到这儿', '先到这儿',
  '结束一起听', '结束这次一起听', '改天再听',
];

/** 「要不要听/想听/放」+《歌名》形态：他点名某首歌邀请（没进短语表也能认出来）。 */
const MUSIC_INVITE_TITLE_RE = /(?:要不要听|想听|一起听|陪我听|放)[《「]([^》」]{1,30})[》」]/;

// 反馈2 #1：裸「一起听」（不带歌字）也要认——她问「一起听吗」，角色回「好啊，一起听吧」，
// 以前短语表全不命中、一张卡都没有。误伤护栏：明显不是听歌的场合（讲座/课/故事…）不认。
const MUSIC_INVITE_DENY_WORDS = ['讲座', '上课', '讲课', '报告', '会议', '故事', '广播', '电台', '相声', '新闻', '播客', '读书', '听书'];

/** 他是否在这条回复里发起一起听（普通聊天和聊歌框共用；不含歌名也成立）。 */
export const detectMusicInviteIntent = (text: string): boolean =>
  MUSIC_INVITE_PHRASES.some((p) => text.includes(p))
  || MUSIC_INVITE_TITLE_RE.test(text)
  || (text.includes('一起听') && !MUSIC_INVITE_DENY_WORDS.some((w) => text.includes(w)));

/** 他是否在这条回复里提出结束一起听。 */
export const detectMusicExitIntent = (text: string): boolean =>
  MUSIC_EXIT_PHRASES.some((p) => text.includes(p));

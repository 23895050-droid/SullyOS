// 音乐挂载内容生成器单测（2026-08-26）——空态不注入/分组歌单概况/关键词并集/印象挑选/提歌注入
import { describe, expect, it } from 'vitest';
import { buildMusicMountContent, buildMusicMountKey, buildMusicRecordBlock, detectMusicExitIntent, detectMusicInviteIntent, detectSongMentions, groupImportedSongs, topPlayRecords, IMPORT_PLAYLIST_TITLE, MUSIC_MOUNT_KEY_LIMIT } from './musicMountContent';
import type { ImportedSong, SongPlayRecord } from '../apps/couple/musicStore';

const songs: ImportedSong[] = [
  { neteaseId: 1, name: '富士山下', artists: ['陈奕迅'], recommendPlaylist: '深夜的耳朵', importedAt: '2026-08-26T10:00:00.000Z', impression: '高三下晚自习耳机里的雨。' },
  { neteaseId: 2, name: '晴天', artists: ['周杰伦'], recommendPlaylist: '深夜的耳朵', importedAt: '2026-08-26T10:00:00.000Z' },
  { neteaseId: 3, name: 'City of Stars', artists: ['Ryan Gosling'], importedAt: '2026-08-26T10:00:00.000Z' },
];

const records: SongPlayRecord[] = [
  { neteaseId: 1, name: '富士山下', artists: ['陈奕迅'], playCount: 5, lastPlayedAt: '2026-08-26T09:00:00.000Z', context: '一起听' },
  { neteaseId: 2, name: '晴天', artists: ['周杰伦'], playCount: 2, lastPlayedAt: '2026-08-25T09:00:00.000Z' },
];

describe('空态', () => {
  it('全空数据返回空串（不注入）', () => {
    expect(buildMusicMountContent({ importedSongs: [], playRecords: [], togetherSessions: [] })).toBe('');
  });
});

describe('分组与内容', () => {
  it('recommendPlaylist 分组；无建议歌单的归「CC 导入」', () => {
    const groups = groupImportedSongs(songs);
    expect(groups).toHaveLength(2);
    const night = groups.find((g) => g.title === '深夜的耳朵');
    expect(night?.items).toHaveLength(2);
    const fallback = groups.find((g) => g.title === IMPORT_PLAYLIST_TITLE);
    expect(fallback?.items[0].name).toBe('City of Stars');
  });

  it('歌单概况带前 3 首歌名；常听 top 带次数与来源；有印象的组挑 1 首', () => {
    const text = buildMusicMountContent({
      charName: 'Nox', importedSongs: songs, playRecords: records, togetherSessions: [],
    });
    expect(text).toContain('Nox 的音乐歌单');
    expect(text).toContain('《深夜的耳朵》（2 首）');
    expect(text).toContain('听过 5 次');
    expect(text).toContain('最近一次：一起听');
    expect(text).toContain('高三下晚自习耳机里的雨');
    // 无印象的歌不单列印象行
    expect(text).not.toContain('《晴天》：');
  });

  it('topPlayRecords 按次数降序', () => {
    const top = topPlayRecords(records, 1);
    expect(top).toHaveLength(1);
    expect(top[0].neteaseId).toBe(1);
  });
});

describe('一起听会话段落', () => {
  it('有会话时输出最近一次（含日期与曲目）', () => {
    const text = buildMusicMountContent({
      importedSongs: [], playRecords: [],
      togetherSessions: [{
        id: 't1', charId: 'c1', startedAt: '2026-08-26T10:00:00.000Z', endedAt: '2026-08-26T10:20:00.000Z',
        songs: [{ neteaseId: 1, name: '富士山下', artists: ['陈奕迅'], count: 2 }],
      }],
    });
    expect(text).toContain('最近一次和 {{user}} 一起听歌（2026-08-26）');
    expect(text).toContain('《富士山下》');
  });
});

describe('动态关键词', () => {
  it('配置 ∪ 全部歌名，去重截断 40', () => {
    const key = buildMusicMountKey(['音乐', '听歌'], { importedSongs: songs, playRecords: [], togetherSessions: [] });
    expect(key).toContain('音乐');
    expect(key).toContain('富士山下');
    expect(key).toContain('City of Stars');
    const many = Array.from({ length: 60 }, (_, i) => ({
      neteaseId: i + 100, name: `歌${i}`, artists: [], importedAt: '2026-08-26T10:00:00.000Z',
    }));
    const big = buildMusicMountKey([], { importedSongs: many, playRecords: [], togetherSessions: [] });
    expect(big.length).toBe(MUSIC_MOUNT_KEY_LIMIT);
  });
});

describe('提歌注入（批 2）', () => {
  it('命中导入歌名：最长名优先、最多 3 首；未命中返回空', () => {
    const text = '我最近在听富士山下，还有晴天';
    const hits = detectSongMentions(text, songs);
    expect(hits.map((h) => h.name)).toEqual(['富士山下', '晴天']);
    expect(detectSongMentions('今天天气不错', songs)).toHaveLength(0);
    // 子串同名时优先长名（提到《富士山下》时，《富士山》短名也命中，长名排前面）
    const dup = [...songs, { neteaseId: 9, name: '富士山', artists: [], importedAt: '2026-08-26T10:00:00.000Z' }];
    expect(detectSongMentions('提到富士山下', dup).map((h) => h.name)).toEqual(['富士山下', '富士山']);
  });

  it('听过/有印象的出块；没听过没印象的跳过（走诚实回应 prompt）', () => {
    const unheard: ImportedSong = { neteaseId: 3, name: 'City of Stars', artists: ['Ryan Gosling'], importedAt: '2026-08-26T10:00:00.000Z' };
    const block = buildMusicRecordBlock([songs[0], unheard], records, []);
    expect(block).toContain('富士山下');
    expect(block).toContain('你的印象是');
    expect(block).toContain('你听过 5 次');
    expect(block).not.toContain('City of Stars');
    expect(buildMusicRecordBlock([unheard], records, [])).toBe('');
  });

  it('一起听次数也进块', () => {
    const sessions = [{
      id: 't1', charId: 'c1', startedAt: '2026-08-26T10:00:00.000Z', endedAt: '2026-08-26T10:20:00.000Z',
      songs: [{ neteaseId: 2, name: '晴天', artists: ['周杰伦'], count: 1 }],
    }];
    const block = buildMusicRecordBlock([songs[1]], records, sessions);
    expect(block).toContain('你们一起听过 1 次');
  });
});

describe('他发起/结束一起听的关键词判定（2026-08-27）', () => {
  it('邀请话术命中；日常说法不误伤', () => {
    for (const t of ['想听歌吗，一起听首歌', '要不要听《富士山下》', '给你放首歌', '陪我听歌好不好']) {
      expect(detectMusicInviteIntent(t)).toBe(true);
    }
    for (const t of ['你先听我说', '你还在听歌吗', '这首歌好好听', '我听完再回你', '今天天气不错']) {
      expect(detectMusicInviteIntent(t)).toBe(false);
    }
  });

  it('反馈2 #1：裸「一起听」命中；非听歌场合不误伤', () => {
    for (const t of ['好啊，一起听吧', '那我们一起听', '一起听，你想听什么？', '一起听呀']) {
      expect(detectMusicInviteIntent(t)).toBe(true);
    }
    for (const t of ['改天一起听讲座', '一起听相声去', '一起听个故事', '晚上一起听广播']) {
      expect(detectMusicInviteIntent(t)).toBe(false);
    }
  });

  it('结束话术命中', () => {
    for (const t of ['今天就到这吧', '先不听了', '下次再听这首', '结束这次一起听']) {
      expect(detectMusicExitIntent(t)).toBe(true);
    }
    expect(detectMusicExitIntent('这首歌真好听')).toBe(false);
  });

  it('日常收尾话不误判成退出（先走了/去忙了 已经出名单）', () => {
    for (const t of ['那我先走了，晚安', '我先去忙了', '准备去睡了']) {
      expect(detectMusicExitIntent(t)).toBe(false);
    }
  });
});

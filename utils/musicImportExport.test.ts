// 音乐导入导出纯函数单测（2026-08-26）——校验宽松/upsert 幂等/导出游标增量
import { describe, expect, it } from 'vitest';
import {
  buildMusicExportPayload, mergeImportedSong, parseMusicImportJson, EXPORT_SCHEMA, IMPORT_SONG_LIMIT,
} from './musicImportExport';
import type { ImportedSong, SongPlayRecord } from '../apps/couple/musicStore';

const mkSong = (over: Partial<ImportedSong> = {}): ImportedSong => ({
  neteaseId: 1,
  name: '富士山下',
  artists: ['陈奕迅'],
  importedAt: '2026-08-26T12:00:00.000Z',
  ...over,
});

describe('CC→Sully 导入解析', () => {
  it('合法 JSON：artists 数组/字符串都收，未知字段忽略', () => {
    const r = parseMusicImportJson({
      schema: 'sully-music-import-v1',
      exportedAt: '2026-08-26T21:00:00+08:00',
      accountName: 'Angelica',
      unknownField: 'ignored',
      songs: [
        { neteaseId: 22721847, name: '富士山下', artists: ['陈奕迅'], lyric: '拦路雨…' },
        { neteaseId: 123, name: '晴天', artists: '周杰伦 / 方文山' },
      ],
    });
    expect(r.songs).toHaveLength(2);
    expect(r.songs[0].artists).toEqual(['陈奕迅']);
    expect(r.songs[1].artists).toEqual(['周杰伦', '方文山']);
    expect(r.songs[0].lyric).toBe('拦路雨…');
    expect(r.errors).toHaveLength(0);
  });

  it('schema 缺省也尝试解析（宽松）；songs 不是数组报错', () => {
    const ok = parseMusicImportJson({ songs: [{ neteaseId: 1, name: '歌' }] });
    expect(ok.songs).toHaveLength(1);
    const bad = parseMusicImportJson({ foo: 1 });
    expect(bad.songs).toHaveLength(0);
    expect(bad.errors.length).toBeGreaterThan(0);
  });

  it('neteaseId/name 缺失逐条跳过并报错', () => {
    const r = parseMusicImportJson({
      songs: [
        { name: '没id' },
        { neteaseId: 2 },
        { neteaseId: 3, name: '  ' },
        { neteaseId: 4, name: '好歌' },
      ],
    });
    expect(r.songs).toHaveLength(1);
    expect(r.songs[0].neteaseId).toBe(4);
    expect(r.errors).toHaveLength(3);
  });

  it('坏 JSON 字符串 → errors', () => {
    const r = parseMusicImportJson('not json');
    expect(r.songs).toHaveLength(0);
    expect(r.errors[0]).toContain('JSON');
  });

  it('带 ```json 围栏也剥掉解析（从聊天里复制）', () => {
    const r = parseMusicImportJson('```json\n{"schema":"sully-music-import-v1","songs":[{"neteaseId":1,"name":"歌"}]}\n```');
    expect(r.songs).toHaveLength(1);
    expect(r.errors).toHaveLength(0);
  });

  it('不是对象/没有 songs 数组 → 指向格式错误的提示', () => {
    const r = parseMusicImportJson('{"foo": 1}');
    expect(r.errors[0]).toContain('songs');
  });

  it('形态容错：直接贴一首歌的对象 / 直接贴数组都能收', () => {
    const single = parseMusicImportJson('{"neteaseId": 186016, "name": "富士山下"}');
    expect(single.songs).toHaveLength(1);
    expect(single.songs[0].name).toBe('富士山下');
    const arr = parseMusicImportJson('[{"neteaseId": 1, "name": "歌A"}, {"neteaseId": 2, "name": "歌B"}]');
    expect(arr.songs).toHaveLength(2);
  });

  it('全角引号（微信复制常见）也能解析', () => {
    const r = parseMusicImportJson('{"schema":"sully-music-import-v1","songs":[{"neteaseId":186016,"name":"富士山下"}]}');
    expect(r.songs).toHaveLength(1);
    expect(r.songs[0].name).toBe('富士山下');
  });

  it('超 500 首报错并截断', () => {
    const songs = Array.from({ length: IMPORT_SONG_LIMIT + 5 }, (_, i) => ({ neteaseId: i + 1, name: `歌${i}` }));
    const r = parseMusicImportJson({ songs });
    expect(r.songs).toHaveLength(IMPORT_SONG_LIMIT);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe('upsert 幂等', () => {
  it('新歌建档带全部字段；旧歌只更新快照，保留首条印象与导入时间', () => {
    const existing = mkSong({ impression: '高三的雨', lyric: '旧歌词', album: '老专辑' });
    const merged = mergeImportedSong(existing, { neteaseId: 1, name: '富士山下（live）', album: '新专辑' }, 'b1', '2026-08-26T13:00:00.000Z');
    expect(merged.name).toBe('富士山下（live）');
    expect(merged.album).toBe('新专辑');
    expect(merged.impression).toBe('高三的雨');   // 保留首条
    expect(merged.lyric).toBe('旧歌词');           // 导入没带歌词不覆盖
    expect(merged.importedAt).toBe('2026-08-26T12:00:00.000Z'); // 保留原导入时间

    const fresh = mergeImportedSong(undefined, { neteaseId: 9, name: '新歌', artists: ['A'] }, 'b2', '2026-08-26T13:00:00.000Z');
    expect(fresh.importedAt).toBe('2026-08-26T13:00:00.000Z');
    expect(fresh.importBatchId).toBe('b2');
  });
});

describe('流派/感情基调打标（CC 打标随导入进、Sully 回传）', () => {
  it('解析：数组容错（trim/去重/上限6/超长跳过/非数组忽略）', () => {
    const r = parseMusicImportJson({
      songs: [
        { neteaseId: 1, name: '歌A', genres: ['民谣', ' 国风 ', '民谣'], moods: ['安静', '怀旧'] },
        { neteaseId: 2, name: '歌B', genres: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], moods: '不是数组' },
        { neteaseId: 3, name: '歌C', genres: ['这个标签名字实在太长了根本放不下'] },
      ],
    });
    expect(r.songs[0].genres).toEqual(['民谣', '国风']);
    expect(r.songs[0].moods).toEqual(['安静', '怀旧']);
    expect(r.songs[1].genres).toHaveLength(6);
    expect(r.songs[1].moods).toBeUndefined();
    expect(r.songs[2].genres).toBeUndefined();
  });

  it('merge：导入带了标换新（CC 是打标来源）；没带保留旧（她详情页点过）', () => {
    const existing = mkSong({ genres: ['民谣'], moods: ['安静'] });
    const withTags = mergeImportedSong(existing, { neteaseId: 1, name: '歌', genres: ['流行'], moods: ['热烈'] }, 'b1', '2026-08-26T13:00:00.000Z');
    expect(withTags.genres).toEqual(['流行']);
    expect(withTags.moods).toEqual(['热烈']);
    const withoutTags = mergeImportedSong(existing, { neteaseId: 1, name: '歌' }, 'b2', '2026-08-26T14:00:00.000Z');
    expect(withoutTags.genres).toEqual(['民谣']);
    expect(withoutTags.moods).toEqual(['安静']);
  });

  it('导出：impressions 回传 tags（CC 读回她改过的标）', () => {
    const payload = buildMusicExportPayload({
      nowIso: '2026-08-26T12:00:00.000Z',
      playRecords: [],
      exportCursor: 0,
      importedSongs: [mkSong({ impression: '高三的雨', genres: ['民谣'], moods: ['安静', '怀旧'] })],
      togetherSessions: [],
    });
    expect(payload.impressions[0].genres).toEqual(['民谣']);
    expect(payload.impressions[0].moods).toEqual(['安静', '怀旧']);
  });
});

describe('Sully→CC 导出', () => {
  const records: SongPlayRecord[] = [
    { neteaseId: 1, name: '富士山下', artists: ['陈奕迅'], playCount: 3, lastPlayedAt: '2026-08-26T10:00:00.000Z', context: '一起听' },
    { neteaseId: 2, name: '老歌', artists: [], playCount: 9, lastPlayedAt: '2026-08-20T10:00:00.000Z' },
  ];

  it('按游标增量：只导游标之后的播放记录', () => {
    const payload = buildMusicExportPayload({
      nowIso: '2026-08-26T12:00:00.000Z',
      charName: 'Nox',
      playRecords: records,
      exportCursor: Date.parse('2026-08-25T00:00:00.000Z'),
      importedSongs: [],
      togetherSessions: [],
    });
    expect(payload.schema).toBe(EXPORT_SCHEMA);
    expect(payload.playRecords).toHaveLength(1);
    expect(payload.playRecords[0].times).toBe(3);
    expect(payload.playRecords[0].context).toBe('一起听');
  });

  it('印象全量导出；一起听会话换算时长', () => {
    const payload = buildMusicExportPayload({
      nowIso: '2026-08-26T12:00:00.000Z',
      playRecords: [],
      exportCursor: 0,
      importedSongs: [mkSong({ impression: '高三的雨' })],
      togetherSessions: [{
        id: 't1', charId: 'c1', startedAt: '2026-08-26T10:00:00.000Z', endedAt: '2026-08-26T10:21:00.000Z',
        songs: [{ neteaseId: 1, name: '富士山下', artists: ['陈奕迅'], count: 2 }],
      }],
    });
    expect(payload.impressions).toHaveLength(1);
    expect(payload.impressions[0].text).toBe('高三的雨');
    expect(payload.togetherSessions[0].durationSec).toBe(1260);
    expect(payload.togetherSessions[0].songCount).toBe(1);
  });
});

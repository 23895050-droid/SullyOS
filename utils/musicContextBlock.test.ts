// 歌词注入组装纯函数单测（2026-08-26）——双块/半径/开关/热评兜底
import { describe, expect, it } from 'vitest';
import {
  buildFullLyric, buildUserListeningContext, clampRadius, sliceWindow,
  buildLyricWindowKeywords, shouldInjectLyricWindow, LYRIC_KEYWORD_SCAN_DEPTH,
  LYRIC_FULL_LIMIT, DEFAULT_WINDOW_RADIUS, WINDOW_RADIUS_MAX,
} from './musicContextBlock';
import type { MusicPlaybackSnapshot } from '../context/MusicContext';

const lyric = (n: number) => Array.from({ length: n }, (_, i) => ({ t: i * 10, text: `第${i + 1}行` }));

const mkSnap = (over: Partial<MusicPlaybackSnapshot> = {}): MusicPlaybackSnapshot => ({
  current: { id: 1, name: '富士山下', artists: '陈奕迅', album: '', albumPic: '', duration: 0, fee: 0 },
  playing: true,
  lyric: lyric(10),
  activeLyricIdx: 5,
  plainLyric: '',
  hotComments: [],
  listeningTogetherWith: [],
  cfg: { workerUrl: 'https://x', cookie: '', quality: 'standard' },
  ...over,
});

const inject = { windowRadius: 2, fullLyric: true };

describe('clampRadius / sliceWindow', () => {
  it('非法值回默认 2；超界 clamp 到 0~8', () => {
    expect(clampRadius(undefined)).toBe(DEFAULT_WINDOW_RADIUS);
    expect(clampRadius(NaN)).toBe(DEFAULT_WINDOW_RADIUS);
    expect(clampRadius(3.6)).toBe(4);
    expect(clampRadius(-5)).toBe(0);
    expect(clampRadius(99)).toBe(WINDOW_RADIUS_MAX);
  });

  it('半径 2 = 前2当前后2；idx 越界按边界夹', () => {
    const lines = lyric(10);
    expect(sliceWindow(lines, 5, 2)).toEqual({ window: ['第4行', '第5行', '第6行', '第7行', '第8行'], activeIdx: 2 });
    expect(sliceWindow(lines, 0, 2).window).toEqual(['第1行', '第2行', '第3行']);
    expect(sliceWindow(lines, 0, 2).activeIdx).toBe(0);
    expect(sliceWindow(lines, 9, 2).window).toEqual(['第8行', '第9行', '第10行']);
    expect(sliceWindow(lines, 9, 2).activeIdx).toBe(2);
    expect(sliceWindow(lines, 5, 0)).toEqual({ window: ['第6行'], activeIdx: 0 });
  });
});

describe('buildFullLyric', () => {
  it('有轴：全部行拼起来；超长截断标后略', () => {
    expect(buildFullLyric({ lyric: lyric(3), plainLyric: '' })).toBe('第1行\n第2行\n第3行');
    const long = { lyric: Array.from({ length: 200 }, (_, i) => ({ t: i, text: 'x'.repeat(10) })), plainLyric: '' };
    const out = buildFullLyric(long);
    expect(out.length).toBeLessThanOrEqual(LYRIC_FULL_LIMIT + 20);
    expect(out).toContain('后略');
  });

  it('纯文本：原文就是全量', () => {
    expect(buildFullLyric({ lyric: [], plainLyric: '没时间轴的歌词\n第二句' })).toBe('没时间轴的歌词\n第二句');
  });
});

describe('buildUserListeningContext（双块组装）', () => {
  it('有轴：窗口按半径 + 全量（开关开）；关掉全量 → undefined', () => {
    const on = buildUserListeningContext(mkSnap(), inject);
    expect(on!.lyricWindow).toEqual(['第4行', '第5行', '第6行', '第7行', '第8行']);
    expect(on!.activeIdx).toBe(2);
    expect(on!.fullLyric).toContain('第10行');
    const off = buildUserListeningContext(mkSnap(), { windowRadius: 2, fullLyric: false });
    expect(off!.fullLyric).toBeUndefined();
    expect(off!.lyricWindow).toHaveLength(5);
  });

  it('activeIdx=-1（开头没到第一句）按第 0 行当轴', () => {
    const on = buildUserListeningContext(mkSnap({ activeLyricIdx: -1 }), inject);
    expect(on!.lyricWindow).toEqual(['第1行', '第2行', '第3行']);
    expect(on!.activeIdx).toBe(0);
  });

  it('纯文本：全量有、窗口空', () => {
    const on = buildUserListeningContext(mkSnap({ lyric: [], plainLyric: '没轴的词' }), inject);
    expect(on!.lyricWindow).toEqual([]);
    expect(on!.activeIdx).toBe(-1);
    expect(on!.fullLyric).toBe('没轴的词');
  });

  it('没词：热评透传、无全量', () => {
    const on = buildUserListeningContext(mkSnap({ lyric: [], plainLyric: '', hotComments: ['A', 'B'] }), inject);
    expect(on!.hotComments).toEqual(['A', 'B']);
    expect(on!.fullLyric).toBeUndefined();
    expect(on!.lyricWindow).toEqual([]);
  });

  it('没在播 / 没歌 → null', () => {
    expect(buildUserListeningContext(null, inject)).toBeNull();
    expect(buildUserListeningContext(mkSnap({ playing: false }), inject)).toBeNull();
    expect(buildUserListeningContext(mkSnap({ current: null }), inject)).toBeNull();
  });
});

describe('关键词触发（照原版世界书：扫最近 N 条，命中才注入）', () => {
  const msgs = (list: string[]) => list.map(content => ({ role: 'user', content }));

  it('关键词表 = 固定词 + 歌名 + 艺人名，去重', () => {
    const kw = buildLyricWindowKeywords('富士山下', '陈奕迅');
    expect(kw).toContain('歌');
    expect(kw).toContain('富士山下');
    expect(kw).toContain('陈奕迅');
    expect(new Set(kw).size).toBe(kw.length);
    // 多艺人 / 分隔符拆开
    const duo = buildLyricWindowKeywords('十年', '陈奕迅 / 王菲');
    expect(duo).toContain('陈奕迅');
    expect(duo).toContain('王菲');
  });

  it('固定词命中（这首/歌词/唱）→ true；大小写不敏感', () => {
    const kw = buildLyricWindowKeywords('富士山下', '陈奕迅');
    expect(shouldInjectLyricWindow(msgs(['今天天气不错', '这首好听']), kw)).toBe(true);
    expect(shouldInjectLyricWindow(msgs(['今天天气不错', '歌词写得真好']), kw)).toBe(true);
    expect(shouldInjectLyricWindow(msgs(['I LOVE THIS SONG']), kw)).toBe(false); // 英文不认（关键词是中文）
  });

  it('歌名命中 → true（提了这首歌就给窗口）', () => {
    const kw = buildLyricWindowKeywords('富士山下', '陈奕迅');
    expect(shouldInjectLyricWindow(msgs(['吃过饭了吗', '富士山下真好听']), kw)).toBe(true);
  });

  it('没提歌 → false（免得背景放歌一直讲歌）', () => {
    const kw = buildLyricWindowKeywords('富士山下', '陈奕迅');
    expect(shouldInjectLyricWindow(msgs(['今天吃了火锅', '明天要下雨吗', '工作好累']), kw)).toBe(false);
    expect(shouldInjectLyricWindow([], kw)).toBe(false);
    expect(shouldInjectLyricWindow(msgs(['今天吃了火锅']), [])).toBe(false);
  });

  it(`只扫最近 ${LYRIC_KEYWORD_SCAN_DEPTH} 条：老消息提到歌不算`, () => {
    const kw = buildLyricWindowKeywords('富士山下', '陈奕迅');
    const old = Array.from({ length: 10 }, () => ({ role: 'user', content: '富士山下真好听' }));
    const recent = msgs(['今天吃了火锅', '明天要下雨吗', '工作好累', '晚饭吃什么']);
    expect(shouldInjectLyricWindow([...old, ...recent], kw)).toBe(false);
    expect(shouldInjectLyricWindow([...old.slice(0, 6), ...recent, { role: 'user', content: '这首不错' }], kw)).toBe(true);
  });

  it('content 是 parts 数组也能扫（同世界书 messageText）', () => {
    const kw = buildLyricWindowKeywords('富士山下', '陈奕迅');
    const parts = [{ role: 'user', content: [{ type: 'text', text: '这首歌' }, { type: 'text', text: '太绝了' }] }];
    expect(shouldInjectLyricWindow(parts, kw)).toBe(true);
  });
});

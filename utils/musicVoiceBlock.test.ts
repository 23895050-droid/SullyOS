// 聊歌语音块解析单测（2026-08-30）
import { describe, expect, it } from 'vitest';
import { isVoiceOnlySegment, splitMusicChatSegments } from './musicVoiceBlock';

describe('splitMusicChatSegments', () => {
  it('纯文本原样切成一个文本段', () => {
    const segs = splitMusicChatSegments('这首歌真好听');
    expect(segs).toEqual([{ type: 'text', content: '这首歌真好听' }]);
  });

  it('纯语音块切成语音段，演出标记被洗掉', () => {
    const segs = splitMusicChatSegments('<语音>今天风很轻 <#2#> [soft] (smiles) 适合听这首</语音>');
    expect(segs).toHaveLength(1);
    const v = segs[0] as { type: 'voice'; text: string; subtitle?: string };
    expect(v.type).toBe('voice');
    expect(v.text).toContain('今天风很轻');
    expect(v.text).not.toContain('<#2#>');
    expect(v.text).not.toContain('[soft]');
    expect(v.text).not.toContain('smiles');
  });

  it('语音 + 紧邻字幕：字幕进 subtitle', () => {
    const segs = splitMusicChatSegments('<语音>listen to this</语音><字幕>听这首</字幕>');
    expect(segs).toHaveLength(1);
    const v = segs[0] as { type: 'voice'; text: string; subtitle?: string };
    expect(v.subtitle).toBe('听这首');
  });

  it('字幕在语音前面也认', () => {
    const segs = splitMusicChatSegments('<字幕>听这首</字幕><语音>listen</语音>');
    expect(segs).toHaveLength(1);
    expect((segs[0] as { subtitle?: string }).subtitle).toBe('听这首');
  });

  it('语音块前后混着正文：文本段和语音段分开', () => {
    const segs = splitMusicChatSegments('你听\n<语音>这里应该轻一点</语音>\n对不对');
    expect(segs).toHaveLength(3);
    expect(segs[0]).toEqual({ type: 'text', content: '你听' });
    expect(segs[1].type).toBe('voice');
    expect(segs[2]).toEqual({ type: 'text', content: '对不对' });
  });

  it('多段语音都切出来', () => {
    const segs = splitMusicChatSegments('<语音>第一句</语音>\n<语音>第二句</语音>');
    expect(segs).toHaveLength(2);
    expect(segs.every((s) => s.type === 'voice')).toBe(true);
  });

  it('isVoiceOnlySegment 只对整段纯语音为真', () => {
    expect(isVoiceOnlySegment('<语音>只有一句</语音>')).toBe(true);
    expect(isVoiceOnlySegment('<语音>一句</语音>\n但还有正文')).toBe(false);
    expect(isVoiceOnlySegment('普通文本')).toBe(false);
  });
});

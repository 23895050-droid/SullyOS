// 音乐 App 内部基础层守卫（2026-09-13 播放页/聊歌页/悬浮窗写死值收编）：
// ① 两层基础 CSS 禁止 !important（用户层必须能同权重覆盖）
// ② 关键类名都在 ③ 小助手提示词不再教对已类化的部位用 !important
import { describe, expect, it } from 'vitest';
import { MUSIC_APP_BASE_CSS, MUSIC_MINI_BASE_CSS } from './musicAppCss';
import { getPromptEntries } from './promptRegistry';

describe('音乐内部基础层', () => {
  it('两层都不得出现 !important', () => {
    expect(MUSIC_APP_BASE_CSS).not.toContain('!important');
    expect(MUSIC_MINI_BASE_CSS).not.toContain('!important');
  });

  it('播放页类都在（黑胶四件/顶栏/时间签/播控/进度条/歌词区）', () => {
    for (const cls of [
      '.mz-vinyl-disc', '.mz-vinyl-label', '.mz-vinyl-pivot', '.mz-vinyl-sheen',
      '.mz-mizu-header', '.mz-metachip', '.mz-play-ring', '.mz-progress-track', '.mz-lyric-box',
    ]) expect(MUSIC_APP_BASE_CSS).toContain(cls);
  });

  it('聊歌页类都在（气泡/头像/输入/发送/语音卡/顶栏）', () => {
    for (const cls of [
      '.mz-chat-bubble-ai', '.mz-chat-bubble-user', '.mz-chat-avatar',
      '.mz-chat-input', '.mz-chat-send', '.mz-chat-voice-text', '.mz-chat-header',
    ]) expect(MUSIC_APP_BASE_CSS).toContain(cls);
  });

  it('悬浮窗类都在（球/暗层/条/把手/封面/按钮）', () => {
    for (const cls of [
      '.mz-globalmini-ball', '.mz-globalmini-ball-overlay', '.mz-globalmini-bar',
      '.mz-globalmini-handle', '.mz-globalmini-cover', '.mz-globalmini-btn',
    ]) expect(MUSIC_MINI_BASE_CSS).toContain(cls);
  });

  it('提示词不再教对已类化部位用 !important（旧话术已删）', () => {
    const vinyl = getPromptEntries().find((e) => e.label === '美化助手-播放页')!;
    expect(vinyl.defaultValue).not.toContain('.mz-vinyl > div + !important');
    const chat = getPromptEntries().find((e) => e.label === '美化助手-聊歌页')!;
    expect(chat.defaultValue).not.toContain('输入框边框是 inline');
    const mini = getPromptEntries().find((e) => e.label === '美化助手-悬浮窗')!;
    expect(mini.defaultValue).not.toContain('inline 样式处加 !important');
  });
});

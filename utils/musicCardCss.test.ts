// 音乐卡基础样式层守卫（2026-09-13 卡片类化）：
// ① 五张卡的根类都要有规则 ② 基础层禁止 !important（否则用户 CSS 又要回到同权重覆盖不了的老路）
// ③ 美化助手-聊天卡片提示词与类名保持同步（提示词点名的类必须真实存在）
import { describe, expect, it } from 'vitest';
import { MUSIC_CARD_BASE_CSS } from './musicCardCss';
import { getPromptEntries } from './promptRegistry';

const CARD_ROOT_CLASSES = [
  'mz-music-card-invite',
  'mz-music-card-accept',
  'mz-music-card-summary',
  'mz-music-card-chatsummary',
  'mz-music-card-song',
];

describe('音乐卡基础样式层', () => {
  it('五张卡的根类都有规则', () => {
    for (const cls of CARD_ROOT_CLASSES) {
      expect(MUSIC_CARD_BASE_CSS).toContain(`.${cls}{`);
    }
  });

  it('基础层不得出现 !important——用户 CSS 排在其后，必须能同权重覆盖', () => {
    expect(MUSIC_CARD_BASE_CSS).not.toContain('!important');
  });

  it('原 inline 渐变值按原样保留（邀请卡/收歌单卡底色）', () => {
    expect(MUSIC_CARD_BASE_CSS).toContain('#fff2f7 0%,#f5edff 55%,#eaf1ff 100%');
  });

  it('常见零件类都在（label/title/sub/text/chip/btn/foot）', () => {
    for (const cls of [
      'mz-music-card-label', 'mz-music-card-title', 'mz-music-card-sub', 'mz-music-card-text',
      'mz-music-card-chip-accepted', 'mz-music-card-chip-pending',
      'mz-music-card-btn-accept', 'mz-music-card-btn-decline', 'mz-music-card-foot',
    ]) {
      expect(MUSIC_CARD_BASE_CSS).toContain(`.${cls}`);
    }
  });
});

describe('美化助手提示词与类名同步', () => {
  it('聊天卡片模式点名的五张卡类在 CSS 里都存在', () => {
    const entry = getPromptEntries().find((e) => e.label === '美化助手-聊天卡片');
    expect(entry).toBeTruthy();
    for (const cls of CARD_ROOT_CLASSES) {
      expect(entry!.defaultValue).toContain(cls);
      expect(MUSIC_CARD_BASE_CSS).toContain(`.${cls}`);
    }
  });

  it('提示词不再教用户对卡片背景用 !important（旧话术已删）', () => {
    const entry = getPromptEntries().find((e) => e.label === '美化助手-聊天卡片');
    expect(entry!.defaultValue).not.toContain('.mz-music-card + !important');
  });

  it('音乐基础模式提到卡片已类化', () => {
    const entry = getPromptEntries().find((e) => e.label === '美化助手-音乐基础');
    expect(entry!.defaultValue).toContain('一起听卡已全部类化');
  });
});

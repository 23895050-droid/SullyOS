import { describe, it, expect } from 'vitest';
import { buildCouplePaletteCss, COUPLE_PALETTE_KEYS, COUPLE_PALETTE_DEFAULTS, CARD_ALPHA_DEFAULT, GLASS_ALPHA } from '../apps/couple/couplePalette';

describe('buildCouplePaletteCss', () => {
  it('空 palette / undefined 返回空串', () => {
    expect(buildCouplePaletteCss(undefined)).toBe('');
    expect(buildCouplePaletteCss({})).toBe('');
  });

  it('选择器是 .cs-palette（变量挂在情侣 tab 根容器上）', () => {
    expect(buildCouplePaletteCss({ text: '#111111' }).startsWith('.cs-palette {')).toBe(true);
  });

  it('纯色项生成 --cp-x 与 -rgb 三元组', () => {
    const css = buildCouplePaletteCss({ text: '#111111', muted: '#222222' });
    expect(css).toContain('--cp-text: #111111;');
    expect(css).toContain('--cp-text-rgb: 17,17,17;');
    expect(css).toContain('--cp-muted: #222222;');
    // 没传的键不生成
    expect(css).not.toContain('--cp-bg:');
  });

  it('card 键烘焙 cardAlpha 透明度（默认 100 = 不透明）', () => {
    expect(buildCouplePaletteCss({ card: '#ffffff' })).toContain('--cp-card: rgba(255,255,255, 1);');
    expect(buildCouplePaletteCss({ card: '#ffffff', cardAlpha: '40' })).toContain('--cp-card: rgba(255,255,255, 0.4);');
  });

  it('cardAlpha 越界/非数字被夹住，缺省用默认', () => {
    expect(buildCouplePaletteCss({ card: '#ffffff', cardAlpha: '999' })).toContain('--cp-card: rgba(255,255,255, 1);');
    expect(buildCouplePaletteCss({ card: '#ffffff', cardAlpha: 'abc' })).toContain(`--cp-card: rgba(255,255,255, ${CARD_ALPHA_DEFAULT / 100});`);
    expect(buildCouplePaletteCss({ card: '#ffffff', cardAlpha: '-5' })).toContain('--cp-card: rgba(255,255,255, 0);');
  });

  it('glass 键烘焙固定白玻璃透明度', () => {
    const css = buildCouplePaletteCss({ glass: '#ffffff' });
    expect(css).toContain(`--cp-glass: rgba(255,255,255, ${GLASS_ALPHA});`);
    expect(css).toContain('--cp-glass-rgb: 255,255,255;');
  });

  it('所有调色键都有默认值', () => {
    for (const k of COUPLE_PALETTE_KEYS) {
      expect(COUPLE_PALETTE_DEFAULTS[k], `缺默认值: ${k}`).toBeTruthy();
    }
  });
});

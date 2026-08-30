import { describe, it, expect } from 'vitest';
import { hexToRgb, buildPaletteCss, MUSIC_PALETTE_KEYS, SURFACE_DEFAULT_PCT, GLASS_DEFAULT_PCT } from './musicPalette';

describe('hexToRgb', () => {
  it('六位 hex 正常换算，带不带 # 都行', () => {
    expect(hexToRgb('#807c9d')).toBe('128,124,157');
    expect(hexToRgb('807c9d')).toBe('128,124,157');
    expect(hexToRgb('#ffffff')).toBe('255,255,255');
  });
  it('坏值回退默认', () => {
    expect(hexToRgb('not-a-color')).toBe('251,251,255');
    expect(hexToRgb('#fff')).toBe('251,251,255');
  });
});

describe('buildPaletteCss', () => {
  it('空 palette / undefined 返回空串', () => {
    expect(buildPaletteCss(undefined)).toBe('');
    expect(buildPaletteCss({})).toBe('');
  });
  it('选择器含 .mz-app（夜色预设直接设在 .mz-app 根节点上，只写 :root 盖不过它）', () => {
    const css = buildPaletteCss({ primary: '#2f6f4f' });
    expect(css.startsWith('.mz-app, :root {')).toBe(true);
    expect(css).toContain(':root');
  });
  it('纯色项成对生成 --mz-x 与 --mz-x-rgb', () => {
    const css = buildPaletteCss({ primary: '#2f6f4f', accent: '#57a87f' });
    expect(css).toContain('--mz-primary: #2f6f4f;');
    expect(css).toContain('--mz-primary-rgb: 47,111,79;');
    expect(css).toContain('--mz-accent: #57a87f;');
    expect(css).toContain('--mz-accent-rgb: 87,168,127;');
    // 没传的键不生成
    expect(css).not.toContain('--mz-bg:');
  });
  it('surface / glass 百分比转 rgba 白色玻璃', () => {
    const css = buildPaletteCss({ surface: '80', glass: '12' });
    expect(css).toContain('--mz-surface: rgba(255,255,255,0.8);');
    expect(css).toContain('--mz-glass: rgba(255,255,255,0.12);');
  });
  it('百分比越界/非数字被夹住，缺省用默认', () => {
    const css = buildPaletteCss({ surface: '200', glass: 'abc' });
    expect(css).toContain('--mz-surface: rgba(255,255,255,1);');
    expect(css).toContain(`--mz-glass: rgba(255,255,255,${GLASS_DEFAULT_PCT / 100});`);
    expect(SURFACE_DEFAULT_PCT).toBe(65);
  });
  it('所有调色键都有默认值', () => {
    for (const k of MUSIC_PALETTE_KEYS) {
      expect(buildPaletteCss({ [k]: '#123456' } as never)).toContain(`--mz-${k}: #123456;`);
    }
  });
});

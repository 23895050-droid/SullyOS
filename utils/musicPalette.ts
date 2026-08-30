// 音乐 App 调色台纯函数（2026-08-30 她要求：音乐页那个紫色可以整个调走）。
// 调色台只管理颜色（--mz-* 变量），生成 :root 变量块；与手写 cssGlobal 分开存、分开注入，互不覆盖。
// 注入顺序：内置预设（夜色）→ 调色台 → 基础 cssGlobal → 当前页 → 角色覆盖（后写的覆盖先写的）。

export const MUSIC_PALETTE_KEYS = [
  'bg', 'bgDeep', 'bgTint', 'primary', 'accent', 'soft', 'glow',
  'sakura', 'lavender', 'deep', 'text', 'muted', 'faint', 'vip', 'danger',
] as const;
export type MusicPaletteKey = (typeof MUSIC_PALETTE_KEYS)[number];

/** surface / glass 是「白色 + 透明度」的玻璃面，调色台用 0-100 的百分比数字存 */
export type MusicPalette = Partial<Record<MusicPaletteKey, string>> & { surface?: string; glass?: string };

export const MUSIC_PALETTE_DEFAULTS: Record<MusicPaletteKey, string> = {
  bg: '#fbfbff', bgDeep: '#f3f1fa', bgTint: '#ebe9f5',
  primary: '#807c9d', accent: '#b3a8ce', soft: '#e0d9f0', glow: '#cdc6e9',
  sakura: '#f4c2cf', lavender: '#cfc3e8', deep: '#9a6bc5',
  text: '#22232a', muted: '#7c779a', faint: '#bcb8cc', vip: '#d4a06a', danger: '#ba1a1a',
};

export const SURFACE_DEFAULT_PCT = 65;
export const GLASS_DEFAULT_PCT = 35;

/** '#aabbcc' → '170,187,204'；坏值回退默认白 */
export const hexToRgb = (hex: string, fallback = '251,251,255'): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

const clampPct = (v: string, fallback: number): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
};

/**
 * 把调色数据拼成变量块（纯色项同步 -rgb 三元组，透明拼接才跟着变）。
 * 选择器用 `.mz-app, :root`：夜色预设把变量直接设在 .mz-app 根节点上，
 * 只用 :root 的话调色值只是「继承值」，输给根节点自己身上的规则（深色下调色台全死）。
 * 同特异度 + 同 style 标签内排在夜色之后 → 调色台盖过夜色；:root 一份让全局悬浮窗也吃上。
 */
export const buildPaletteCss = (palette: MusicPalette | undefined): string => {
  if (!palette) return '';
  const lines: string[] = [];
  for (const key of MUSIC_PALETTE_KEYS) {
    const v = palette[key];
    if (!v) continue;
    lines.push(`--mz-${key}: ${v};`);
    lines.push(`--mz-${key}-rgb: ${hexToRgb(v)};`);
  }
  if (palette.surface !== undefined) {
    lines.push(`--mz-surface: rgba(255,255,255,${clampPct(palette.surface, SURFACE_DEFAULT_PCT) / 100});`);
  }
  if (palette.glass !== undefined) {
    lines.push(`--mz-glass: rgba(255,255,255,${clampPct(palette.glass, GLASS_DEFAULT_PCT) / 100});`);
  }
  return lines.length > 0 ? `.mz-app, :root {\n${lines.map((l) => `  ${l}`).join('\n')}\n}` : '';
};

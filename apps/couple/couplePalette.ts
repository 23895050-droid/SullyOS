// 情侣页调色台纯函数（2026-08-30 她要求：情侣页面每个颜色/卡片透明度/卡片颜色/文字颜色可调 + 命名保存预设）。
// 颜色全部走 --cp-* 变量（组件里 var(--cp-x, 默认值)），本模块只负责：默认值表、CSS 变量块生成、预设结构。
// 与美化区皮肤色（--cs-*，buildTheme 从单个 accent 派生）是两层：皮肤色管派生色与阴影，调色台管整页硬色。
import { hexToRgb } from '../../utils/musicPalette';

export const COUPLE_PALETTE_KEYS = [
  'bg', 'bgMid', 'bgDeep', 'deep', 'soft', 'border',
  'text', 'muted', 'faint', 'card', 'glass',
] as const;
export type CouplePaletteKey = (typeof COUPLE_PALETTE_KEYS)[number];

/** 调色数据：纯色键存 hex（glass 可以是任意 CSS 色）；cardAlpha 0-100 单独一张（卡片透明度，生成时烘焙进 --cp-card） */
export type CouplePalette = Partial<Record<CouplePaletteKey, string>> & { cardAlpha?: string };

// 主粉色 accent 不在这里——它是美化区皮肤色（--cs-*，buildTheme 从单个 accent 派生），已有取色器，不重复做
export const COUPLE_PALETTE_DEFAULTS: Record<CouplePaletteKey, string> = {
  bg: '#ffd3e4', bgMid: '#ffeaf3', bgDeep: '#ffdcec',   // 宣告区渐变三停
  deep: '#e08aa5', soft: '#ffe6eb', border: '#f2d3e0',
  text: '#3a2a33', muted: '#9a7a8a', faint: '#b0909c',
  card: '#ffffff', glass: '#ffffff',                    // glass 生成时烘焙 0.85 白玻璃
};

/** 胶囊条玻璃白度（glass 键生成时烘焙的透明度） */
export const GLASS_ALPHA = 0.85;

export const CARD_ALPHA_DEFAULT = 100;

export interface CouplePalettePreset {
  name: string;
  palette: CouplePalette;
  savedAt: string;
}

const clampPct = (v: string | undefined, fallback: number): number => {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
};

const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v.trim());

/** 生成 CSS 变量块：.cs-palette 作用域（挂在情侣 tab 根容器上）；card 键把透明度烘焙进去，组件直接用 var(--cp-card) */
export const buildCouplePaletteCss = (palette: CouplePalette | undefined): string => {
  if (!palette) return '';
  const lines: string[] = [];
  for (const key of COUPLE_PALETTE_KEYS) {
    const v = palette[key];
    if (!v) continue;
    if (key === 'card') {
      const alpha = clampPct(palette.cardAlpha, CARD_ALPHA_DEFAULT) / 100;
      lines.push(`--cp-card: rgba(${hexToRgb(v)}, ${alpha});`);
      lines.push(`--cp-card-rgb: ${hexToRgb(v)};`);
    } else if (key === 'glass') {
      lines.push(`--cp-glass: rgba(${hexToRgb(v)}, ${GLASS_ALPHA});`);
      lines.push(`--cp-glass-rgb: ${hexToRgb(v)};`);
    } else {
      lines.push(`--cp-${key}: ${v};`);
      if (isHex(v)) lines.push(`--cp-${key}-rgb: ${hexToRgb(v)};`);
    }
  }
  return lines.length > 0 ? `.cs-palette {\n${lines.map((l) => `  ${l}`).join('\n')}\n}` : '';
};

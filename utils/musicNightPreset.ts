/**
 * 沉浸夜色内置预设（2026-08-30，Angelica 附件图一/图二的设计语言）。
 *
 * 播放页 + 聊歌页的深色版：深色渐变背景、rgba(255,255,255,0.1) 胶囊与气泡、
 * 白字、放大的黑胶焦点。以「预设」形态存在——设置页 CSS 卡里选「沉浸夜色」即生效，
 * 默认浅色版原样保留；用户自己写的 CSS 仍叠加在预设之上（后注入，可覆盖）。
 *
 * 生效方式：musicStore.cssPreset === 'night' 时，MusicApp 根节点加 .mz-night，
 * 这里所有规则以 .mz-night 为作用域；--mz-* 变量是组件 inline style 的桥，
 * 覆盖变量即可换肤；少数 inline 写死 rgba 的地方用 !important 定点修。
 */

export type MusicCssPresetId = 'night';

export const MUSIC_NIGHT_PRESET_CSS = `
/* ══ 沉浸夜色 · 整个听歌 App（2026-08-30 她定：不只在播放/聊歌，退出去也不能煞白） ══
   各页底色已改走统一公式 linear-gradient(180deg, --mz-bg → --mz-bgDeep → --mz-bgTint)，
   这里只换变量值——调色台改这三个键在夜色下同样生效（调色台选择器 .mz-app 与本块同特异度、
   同 style 标签内排在本块之后，规则上盖得过）。 */
.mz-night {
  --mz-bg: #1c1926;
  --mz-bgDeep: #15131c;
  --mz-bgTint: #100e16;
  --mz-primary: #e8e4f2;
  --mz-accent: #b8aee0;
  --mz-soft: rgba(255,255,255,0.1);
  --mz-glow: #8f86b8;
  --mz-sakura: #d99aa8;
  --mz-lavender: #b9a8de;
  --mz-deep: #9b86d6;
  --mz-surface: rgba(255,255,255,0.1);
  --mz-glass: rgba(255,255,255,0.08);
  --mz-text: #f2f0f8;
  --mz-muted: #b7b2c8;
  --mz-faint: #8d88a3;
  --mz-vip: #e0b178;
  --mz-danger: #ff8a8a;
  --mz-bg-rgb: 28,25,38;
  --mz-primary-rgb: 232,228,242;
  --mz-accent-rgb: 184,174,224;
  --mz-glow-rgb: 143,134,184;
  --mz-sakura-rgb: 217,154,168;
  --mz-lavender-rgb: 185,168,222;
  --mz-deep-rgb: 155,134,214;
  --mz-muted-rgb: 183,178,200;
  --mz-faint-rgb: 141,136,163;
  --mz-vip-rgb: 224,177,120;
}

/* 玻璃（header / 面板 / 弹层 / 迷你条）换成深色玻璃 */
.mz-night .shizuku-glass-strong {
  background: rgba(22,19,30,0.62) !important;
  border-color: rgba(255,255,255,0.08) !important;
}
.mz-night .shizuku-glass {
  background: rgba(255,255,255,0.06) !important;
  border-color: rgba(255,255,255,0.12) !important;
}

/* 聊歌气泡：AI 侧半透明深色、比背景亮一点；她的消息黑底白字（2026-08-30 她定） */
.mz-night .mz-chat-bubble {
  border-color: rgba(255,255,255,0.12) !important;
}
.mz-night .mz-chat-bubble-user {
  background: rgba(10,10,16,0.92) !important;
  color: #fff !important;
  box-shadow: 0 2px 10px rgba(0,0,0,0.45) !important;
}
.mz-night .mz-chat input {
  border-color: rgba(255,255,255,0.14) !important;
  background: rgba(255,255,255,0.06) !important;
}

/* 唱片：白描边调暗、阴影加深，成为夜色里的焦点 */
.mz-night .mz-vinyl > div {
  border-color: rgba(255,255,255,0.18) !important;
  box-shadow: 0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(143,134,184,0.25) !important;
}

/* 歌词遮罩在深色底上换透明黑渐变，滚动区顶部/底部融进背景 */
.mz-night .mz-player [style*="maskImage"] {
  -webkit-mask-image: linear-gradient(to bottom, transparent, black 18%, black 82%, transparent) !important;
  mask-image: linear-gradient(to bottom, transparent, black 18%, black 82%, transparent) !important;
}
`;

/**
 * 悬浮窗（GlobalMiniPlayer）在夜色预设下的小幅调色。
 * 它挂在 PhoneShell 层、拿不到 .mz-night 作用域，用全局注入器单独注入（mz-css-preset-global）。
 */
export const MUSIC_NIGHT_GLOBAL_CSS = `
/* ══ 沉浸夜色 · 全局悬浮窗 ══ */
.mz-globalmini-ball {
  border-color: rgba(255,255,255,0.35) !important;
  box-shadow: 0 6px 22px rgba(0,0,0,0.5) !important;
}
.mz-globalmini-bar {
  background: rgba(20,17,28,0.78) !important;
  border-color: rgba(255,255,255,0.18) !important;
}
`;

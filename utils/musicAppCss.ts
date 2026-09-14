/**
 * 音乐 App 内部基础样式层（2026-09-13）。
 *
 * 背景：播放页/聊歌页/悬浮窗等组件里，凡走 --mz-* 变量的颜色本来就能改；
 * 但一批「写死字面值」的视觉（白边、玻璃底、黑罩、装饰光斑）是 inline style，
 * 美化小助手的 class 规则覆盖不掉，只能 !important——本文件把它们收进来。
 *
 * 注入：MUSIC_APP_BASE_CSS 排进 MusicApp 的样式层最前（用户 cssGlobal /
 * cssPages / cssPerChar 在其后，同权重时用户胜）；MUSIC_MINI_BASE_CSS 挂在
 * GlobalMusicCssPreset（悬浮窗不在音乐 App 内，跟不到 App 的注入）。
 *
 * 类名速查：
 *   播放页：.mz-vinyl-disc（唱片描边）/ -label（中心标签）/ -pivot（轴心）/
 *          -sheen（表面反光）/ .mz-mizu-header（顶部毛玻璃条下边线）/
 *          .mz-metachip（时间小签）/ .mz-play-ring（播控大钮外圈）/
 *          .mz-progress-track（进度条轨道内影）/ .mz-lyric-box（歌词区上下渐隐）
 *   装饰：.mz-bokeh-blob（全部光斑/星芒背景，想清干净就 display:none）+ 编号 -1~-6
 *   聊歌页：.mz-chat-bubble-ai / -user（气泡描边）/ .mz-chat-avatar（头像描边）/
 *          .mz-chat-input（输入框描边）等
 *   设置页：.mz-pill（胶囊按钮 / ± 小圆钮 / 位置·范围·作用域选择器的默认态白 25% 边；
 *          选中态的边仍是 inline 的 transparent，底色字色走 --mz-* 变量与主题）/
 *          .mz-glass-edge(-35/-45)（玻璃面白边，后缀=透明度）/ .mz-glass-fill（白玻璃底 0.5）/
 *          .mz-soft-card（淡白小卡底 0.06）/ .mz-input（设置页输入框白边 0.2）/
 *          .mz-sheet（底部弹出卡：白底 0.97 + 上圆角 + 上投影）/
 *          .mz-shimmer-sweep（-30 后缀=扫光更亮，搜索钮用）/
 *          .mz-regen-veil（生成中遮罩；-disc = 播放页黑胶上那款）
 *   夜色切换台：.mz-night-tabbar / .mz-night-tab-on / -off / .mz-night-close
 *   变量：--mz-on-text（彩底上的文字色，默认 #fff，覆盖全部白字按钮/选中态）/
 *        --mz-sheet-top（个人页·登录页顶部渐变的顶端色，默认 #ffffff）
 *   悬浮窗：.mz-globalmini-ball / -bar / -expanded 及其零件
 */

export const MUSIC_APP_BASE_CSS = `
/* ── 播放页 · 黑胶唱片 ── */
.mz-vinyl-disc{border:1.5px solid rgba(255,255,255,0.6)}
.mz-vinyl-label{background:radial-gradient(circle at 35% 35%, rgba(255,255,255,0.95), var(--mz-soft, #e0d9f0));border:1px solid rgba(255,255,255,0.85);box-shadow:inset 0 2px 6px rgba(255,255,255,0.6), 0 2px 8px rgba(var(--mz-primary-rgb, 128,124,157), 0.13)}
.mz-vinyl-pivot{box-shadow:inset 0 1px 2px rgba(0,0,0,0.2)}
.mz-vinyl-sheen{background:linear-gradient(135deg, transparent 35%, rgba(255,255,255,0.12) 50%, transparent 65%)}

/* ── 播放页 · 其它 ── */
.mz-mizu-header{border-bottom:1px solid rgba(255,255,255,0.3)}
.mz-metachip{background:rgba(255,255,255,0.55)}
.mz-play-ring{border:1px solid rgba(255,255,255,0.2)}
.mz-progress-track{box-shadow:inset 0 1px 3px rgba(0,0,0,0.06)}
.mz-lyric-box{mask-image:linear-gradient(to bottom, transparent, black 18%, black 82%, transparent);-webkit-mask-image:linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)}
.mz-header-btn{border:1px solid rgba(255,255,255,0.45)}
.mz-together-btn{border:1px solid rgba(255,255,255,0.25)}

/* ── 背景装饰光斑（.mz-bokeh-blob 一条规则可全关）── */
.mz-bokeh-1{background:radial-gradient(circle, rgba(203,201,218,0.38) 0%, rgba(203,201,218,0) 70%);animation:shizuku-float 8s ease-in-out infinite}
.mz-bokeh-2{background:radial-gradient(circle, rgba(203,201,218,0.3) 0%, rgba(203,201,218,0) 70%);animation:shizuku-float 10s ease-in-out 2s infinite}
.mz-bokeh-3{background:radial-gradient(circle, rgba(203,201,218,0.34) 0%, rgba(203,201,218,0) 70%);animation:shizuku-float 7s ease-in-out 1s infinite}
.mz-bokeh-4{background:radial-gradient(circle, rgba(203,201,218,0.24) 0%, rgba(203,201,218,0) 70%);animation:shizuku-drift 12s ease-in-out infinite}
.mz-bokeh-5{background:radial-gradient(circle, rgba(var(--mz-sakura-rgb, 244,194,207), 0.09) 0%, transparent 70%);filter:blur(8px)}
.mz-bokeh-6{background:radial-gradient(circle, rgba(var(--mz-lavender-rgb, 207,195,232), 0.08) 0%, transparent 70%);filter:blur(8px)}

/* ── 聊歌页 ── */
.mz-chat-bubble-ai{border:1px solid rgba(255,255,255,0.4)}
.mz-chat-bubble-user{color:#fff}
.mz-chat-avatar{border:1.5px solid rgba(255,255,255,0.6)}
.mz-chat-input{border:1px solid rgba(255,255,255,0.35)}
.mz-chat-send{border:1px solid rgba(255,255,255,0.4)}
.mz-chat-voice-text{border:1px solid rgba(255,255,255,0.4)}
.mz-chat-header{border-bottom:1px solid rgba(255,255,255,0.3)}

/* ── 设置页胶囊 / 小圆钮（± 圆钮、位置·范围·作用域选择器共用）── */
.mz-pill{border:1px solid rgba(255,255,255,0.25)}

/* ── 设置页 / 个人页的玻璃面与零星写死值（-35/-45 后缀 = 白边透明度，方便按面挑）── */
.mz-glass-edge{border:1px solid rgba(255,255,255,0.3)}
.mz-glass-edge-35{border:1px solid rgba(255,255,255,0.35)}
.mz-glass-edge-45{border:1px solid rgba(255,255,255,0.45)}
.mz-glass-fill{background:rgba(255,255,255,0.5)}
.mz-soft-card{background:rgba(255,255,255,0.06)}
.mz-shimmer-sweep{background:linear-gradient(90deg, transparent 30%, rgba(255,255,255,0.25) 50%, transparent 70%);background-size:200% 100%;animation:shizuku-shimmer 3s ease-in-out infinite}
.mz-shimmer-sweep-30{background:linear-gradient(90deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%);background-size:200% 100%;animation:shizuku-shimmer 3s ease-in-out infinite}
.mz-input{border:1px solid rgba(255,255,255,0.2)}
.mz-sheet{background:rgba(255,255,255,0.97);border-radius:28px 28px 0 0;box-shadow:0 -12px 40px rgba(0,0,0,0.18)}
.mz-regen-veil{background:rgba(0,0,0,0.45);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)}
.mz-regen-veil-disc{background:radial-gradient(circle, rgba(0,0,0,0.55) 30%, rgba(0,0,0,0.35) 70%);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
/* ── 聊歌页夜色切换台（听歌 | 聊歌 + 结束钮；只在夜色预设下出现）── */
.mz-night-tabbar{background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15)}
.mz-night-tab-on{background:rgba(255,255,255,0.16);color:#fff}
.mz-night-tab-off{color:rgba(255,255,255,0.55)}
.mz-night-close{color:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.15)}

/* ── 悬浮窗（GlobalMiniPlayer，全局注入）── */
`.trim();

export const MUSIC_MINI_BASE_CSS = `
.mz-globalmini-ball{border:1px solid rgba(255,255,255,0.25);box-shadow:0 6px 18px rgba(0,0,0,0.35)}
.mz-globalmini-ball-overlay{background:rgba(0,0,0,0.25)}
.mz-globalmini-bar{background:rgba(20,24,35,0.65);backdrop-filter:blur(24px) saturate(1.6);-webkit-backdrop-filter:blur(24px) saturate(1.6);border:1px solid rgba(255,255,255,0.15);box-shadow:0 8px 32px rgba(0,0,0,0.35)}
.mz-globalmini-handle{background:rgba(255,255,255,0.25)}
.mz-globalmini-cover{border:1px solid rgba(255,255,255,0.2)}
.mz-globalmini-btn{background:rgba(255,255,255,0.15)}
`.trim();

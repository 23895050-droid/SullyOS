// 读书模块 · 骨架层 CSS（2026-09-14 立项 / 2026-09-15 UI 轮重写）
//
// 铁律（v3 §3.1）：**骨架层只决定层级/间距/对齐/信息密度，不出现任何具体色值、
// 圆角数值、字号数值**——全部走 var(--rd-*)。皮肤（readerSkinPresets）换的是变量表，
// 不是这几十条规则；用户/小助手写的 CSS 挂在最后一张表里，同权重时它胜出，
// 所以永远不需要 !important。
//
// 版式出处（她 2026-09-15 给的参考图，照抄）：
//   书架 = 三列封面网格 + 筛选胶囊 + 封面下「进度条左右各一个百分比」
//   阅读页 = 纸面 + 衬线正文；底栏三行：阅读时长/剩余 · 进度滑轨 · 工具图标排
//   书详情 = 封面 + 标题/分类/作者/星级 + 字数·时长·状态 + 分页签 + 底部通栏按钮
//   笔记 = 每本书一行（小封面 + 书名 + 章节·日期 + 摘录）
//   统计 = 分段控件 + 大字卡 + 柱状图 + 两格数字卡 + 里程碑行
//   设置 = 分组卡 + 「左边标签 / 右边当前值 / 箭头」行 + iOS 开关
//
// 类名速查（小助手提示词照这份点名，见 utils/promptRegistry 的「美化助手-读书*」）：
//   外壳   .rd-root / .rd-body / .rd-screen / .rd-nav / .rd-nav-btn / .rd-nav-on
//   页头   .rd-head / .rd-head-title / .rd-head-sub / .rd-head-actions
//   通用   .rd-card / .rd-list / .rd-item / .rd-item-label / .rd-item-value / .rd-item-chev
//          .rd-switch / .rd-chip / .rd-chip-on / .rd-btn(-primary/-soft/-block/-row)
//          .rd-field / .rd-muted / .rd-empty / .rd-divider / .rd-icon-btn
//   浮层   .rd-sheet-mask / .rd-sheet / .rd-sheet-grip / .rd-sheet-title / .rd-sheet-body
//          .rd-pill-grid / .rd-pill(.-on/-off) / .rd-pill-tag / .rd-swatch
//   书架   .rd-shelf / .rd-grid / .rd-book / .rd-book-cover(-ph) / .rd-book-title
//          .rd-book-author / .rd-book-prog / .rd-book-pct / .rd-bar / .rd-bar-fill
//   阅读   .rd-reader / .rd-reader-bar / .rd-reader-viewport / .rd-reader-clip
//          .rd-reader-flow / .rd-reader-kicker / .rd-reader-chapter / .rd-para
//          .rd-reader-foot / .rd-reader-stat / .rd-slider(-track/-fill) / .rd-reader-tools / .rd-tool
//          .rd-reader-veil（亮度遮罩，只改 opacity）
//   详情   .rd-detail / .rd-detail-hero / .rd-detail-cover / .rd-detail-title / .rd-stars
//          .rd-detail-meta / .rd-badge / .rd-tabline(-on) / .rd-detail-card / .rd-cta
//   统计   .rd-seg(-on) / .rd-stat-hero / .rd-stat-big / .rd-stat-cell / .rd-chart(-col/-bar/-label)
//   笔记   .rd-note / .rd-note-cover / .rd-note-main / .rd-note-book / .rd-note-sub / .rd-note-quote
//   划线   .rd-hl-layer（覆盖层容器，别给它背景！）/ .rd-hl-rect（真正的划线块）
//
// 颜色/材质的默认值全部在皮肤表里（readerSkinPresets 的 paper 那套就是基准皮肤）；
// 排版默认值在下面的 .rd-root 块——那是「默认排版」的表达，用户设置覆盖的就是这些名字。

export const READER_SKELETON_CSS = `
.rd-root {
  /* 颜色不在这里给默认值——那是皮肤表的活（readerSkinPresets）。
     骨架层只管层级/间距/几何/排版的默认值。 */

  /* ── 排版（字号阶梯，随用户设的正文字号整体缩放，映射见 ReaderSkinPreset）── */
  --rd-font-heading: Georgia, "Songti SC", "Noto Serif SC", serif;
  --rd-font-body: -apple-system, "PingFang SC", "Noto Sans SC", sans-serif;
  --rd-fs-hero: 30px;
  --rd-fs-title: 24px;
  --rd-fs-lg: 20px;
  --rd-fs-body: 17px;
  --rd-fs-md: 15px;
  --rd-fs-sm: 13px;
  --rd-fs-caption: 12px;
  --rd-fs-tab: 10px;
  --rd-lh-body: 1.9;
  --rd-para-gap: 12px;
  --rd-para-indent: 2em;
  --rd-page-gutter: 22px;

  /* ── 几何 ── */
  --rd-r-sm: 8px;
  --rd-r-md: 12px;
  --rd-r-lg: 18px;
  --rd-r-pill: 999px;
  --rd-radius-hl: 2px;
  --rd-space-1: 4px;
  --rd-space-2: 8px;
  --rd-space-3: 12px;
  --rd-space-4: 16px;
  --rd-space-5: 20px;
  --rd-space-6: 24px;
  --rd-nav-h: 52px;

  /* 划线槽 1..6 的颜色由 readerSkinPresets.HIGHLIGHT_SLOTS 供给（见 ReaderSkinPreset） */

  background: var(--rd-bg);
  color: var(--rd-ink);
  font-family: var(--rd-font-body);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  -webkit-tap-highlight-color: transparent;
}

/* 全局没有 border-box 重置（index.html 里没有），而这些行/输入框都是
   width:100% + 内边距——不自己兜住就会往右溢出（截图里「12px」被切掉就是它）。
   作用域只在本模块内，不动上游。 */
.rd-root, .rd-root *, .rd-root *::before, .rd-root *::after { box-sizing: border-box; }

/* ── 外壳：内容区 + 底部五个页签 ── */
.rd-body { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; }
.rd-screen {
  position: absolute; inset: 0;
  overflow-y: auto; overscroll-behavior: contain;
  padding: calc(var(--chrome-top, 0px) + 18px) var(--rd-space-4) var(--rd-space-6);
}
.rd-screen::-webkit-scrollbar { width: 0; }
.rd-screen-flush { padding-left: 0; padding-right: 0; }
.rd-screen-tight { padding-top: calc(var(--chrome-top, 0px) + 6px); }

/* 带返回键的窄顶栏（书详情用；阅读页那根在下面 .rd-reader-bar） */
.rd-headbar { display: flex; align-items: center; gap: 2px; margin-bottom: var(--rd-space-4); }
.rd-headbar-title { flex: 1 1 auto; min-width: 0; text-align: center; font-size: var(--rd-fs-md); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rd-back {
  border: 0; background: transparent; color: var(--rd-accent);
  display: inline-flex; align-items: center; gap: 2px; padding: 4px 2px;
  font-family: var(--rd-font-body); font-size: var(--rd-fs-md);
}

.rd-nav {
  flex: 0 0 auto; display: flex; align-items: stretch;
  padding-bottom: var(--safe-bottom, 0px);
  border-top: 1px solid var(--rd-rule);
  background: var(--rd-nav-bg, var(--rd-card));
}
.rd-nav-btn {
  flex: 1 1 0; min-width: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  height: var(--rd-nav-h);
  border: 0; background: transparent; color: var(--rd-ink-soft);
  font-family: var(--rd-font-body); font-size: var(--rd-fs-tab);
  padding: 0;
}
.rd-nav-btn:active { opacity: 0.6; }
.rd-nav-on { color: var(--rd-accent); }

/* ── 页头（每个 tab 的大标题；跟着内容一起滚） ── */
.rd-head { display: flex; align-items: flex-start; gap: var(--rd-space-3); margin-bottom: var(--rd-space-4); }
.rd-head-main { flex: 1 1 auto; min-width: 0; }
.rd-head-title { font-family: var(--rd-font-heading); font-size: var(--rd-fs-hero); line-height: 1.2; letter-spacing: 0.01em; }
.rd-head-sub { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); margin-top: 4px; }
.rd-head-actions { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; padding-top: 4px; }

.rd-icon-btn {
  border: 0; background: transparent; color: var(--rd-ink);
  width: 36px; height: 36px; flex: 0 0 auto;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--rd-r-pill);
}
.rd-icon-btn:active { background: var(--rd-bg-2); }

/* ── 通用卡片 / 列表行（设置页那套「左标签 右值 箭头」） ── */
.rd-card {
  background: var(--rd-card); border-radius: var(--rd-r-lg);
  box-shadow: var(--rd-shadow-sm);
  padding: var(--rd-space-4);
}
.rd-card-flush { padding: 0; overflow: hidden; }
.rd-list { display: flex; flex-direction: column; }
.rd-item {
  display: flex; align-items: center; gap: var(--rd-space-3);
  width: 100%; min-height: 48px; padding: var(--rd-space-3) var(--rd-space-4);
  border: 0; background: transparent; color: var(--rd-ink);
  font-family: var(--rd-font-body); font-size: var(--rd-fs-md); text-align: left;
}
.rd-item + .rd-item { border-top: 1px solid var(--rd-rule); }
.rd-item-label { flex: 1 1 auto; min-width: 0; }
.rd-item-value { color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); flex: 0 0 auto; }
.rd-item-chev { color: var(--rd-ink-soft); flex: 0 0 auto; display: inline-flex; }
.rd-item:active { background: var(--rd-bg-2); }
.rd-item-danger { color: var(--rd-danger); }
.rd-section-title {
  color: var(--rd-ink-soft); font-size: var(--rd-fs-caption);
  padding: 0 var(--rd-space-1); margin: var(--rd-space-5) 0 var(--rd-space-2);
}
.rd-section-title:first-child { margin-top: 0; }

/* iOS 开关 */
.rd-switch {
  flex: 0 0 auto; width: 46px; height: 28px; border-radius: var(--rd-r-pill);
  background: var(--rd-track); border: 0; padding: 0; position: relative;
  transition: background 180ms ease;
}
.rd-switch-knob {
  position: absolute; top: 2px; left: 2px; width: 24px; height: 24px;
  border-radius: var(--rd-r-pill); background: var(--rd-knob);
  box-shadow: var(--rd-shadow-sm); transition: transform 180ms ease;
}
.rd-switch-on { background: var(--rd-accent); }
.rd-switch-on .rd-switch-knob { transform: translateX(18px); }

/* 胶囊（筛选 / 选择） */
.rd-chips { display: flex; gap: var(--rd-space-2); overflow-x: auto; margin-bottom: var(--rd-space-4); padding-bottom: 2px; }
.rd-chips::-webkit-scrollbar { height: 0; }
.rd-chip {
  flex: 0 0 auto; border: 1px solid var(--rd-rule); background: var(--rd-chip-bg);
  color: var(--rd-ink-soft); border-radius: var(--rd-r-pill);
  padding: 7px var(--rd-space-4); font-size: var(--rd-fs-sm); font-family: var(--rd-font-body);
}
.rd-chip-on { background: var(--rd-chip-on-bg); border-color: var(--rd-chip-on-bg); color: var(--rd-chip-on-ink); }

/* 按钮 */
.rd-btn {
  border: 1px solid var(--rd-rule); background: var(--rd-card); color: var(--rd-ink);
  border-radius: var(--rd-r-pill); padding: var(--rd-space-2) var(--rd-space-4);
  font-size: var(--rd-fs-md); font-family: var(--rd-font-body);
}
.rd-btn:active { background: var(--rd-bg-2); }
.rd-btn-primary { background: var(--rd-accent); border-color: var(--rd-accent); color: var(--rd-on-accent); }
.rd-btn-soft { background: var(--rd-accent-soft); border-color: transparent; color: var(--rd-accent); }
.rd-btn-block { display: block; width: 100%; text-align: center; padding: var(--rd-space-3); font-size: var(--rd-fs-lg); border-radius: var(--rd-r-md); }
.rd-btn:disabled { opacity: 0.45; }
.rd-btn-row { display: flex; gap: var(--rd-space-2); flex-wrap: wrap; }

.rd-field {
  width: 100%; border: 1px solid var(--rd-rule); border-radius: var(--rd-r-md);
  background: var(--rd-card); color: var(--rd-ink); padding: var(--rd-space-2) var(--rd-space-3);
  font-size: var(--rd-fs-md); font-family: var(--rd-font-body);
}
.rd-slider { width: 100%; accent-color: var(--rd-accent); }

/* ── 浮层（底部弹出卡） ── */
.rd-sheet-mask {
  position: fixed; inset: 0; background: var(--rd-scrim); z-index: 60;
  display: flex; align-items: flex-end; animation: rd-fade 160ms ease;
}
.rd-sheet {
  width: 100%; max-height: 86vh; overflow-y: auto; overscroll-behavior: contain;
  background: var(--rd-sheet-bg); color: var(--rd-ink);
  border-radius: var(--rd-r-lg) var(--rd-r-lg) 0 0;
  padding: var(--rd-space-2) var(--rd-space-4) calc(var(--rd-space-5) + var(--safe-bottom, 0px));
  animation: rd-rise 220ms cubic-bezier(0.32, 0.72, 0.28, 1);
}
.rd-sheet::-webkit-scrollbar { width: 0; }
.rd-sheet-grip { width: 38px; height: 4px; border-radius: var(--rd-r-pill); background: var(--rd-rule); margin: 0 auto var(--rd-space-4); }
.rd-sheet-title { font-family: var(--rd-font-heading); font-size: var(--rd-fs-title); margin-bottom: var(--rd-space-3); }
.rd-sheet-body { display: flex; flex-direction: column; gap: var(--rd-space-3); }
.rd-row { display: flex; align-items: center; justify-content: space-between; gap: var(--rd-space-3); font-size: var(--rd-fs-md); }
.rd-row-label { color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); }
.rd-divider { height: 1px; background: var(--rd-rule); margin: var(--rd-space-2) 0; }

/* 「更多」九宫格胶囊（参考图里那排：听书 / 自动翻页 / 编辑 / 统计 …） */
.rd-pill-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--rd-space-3); }
.rd-pill {
  border: 0; background: var(--rd-card); color: var(--rd-ink);
  border-radius: var(--rd-r-md); padding: var(--rd-space-3) var(--rd-space-2);
  font-size: var(--rd-fs-md); font-family: var(--rd-font-body);
  display: flex; align-items: center; justify-content: center; gap: 6px;
  box-shadow: var(--rd-shadow-sm);
}
.rd-pill-on { background: var(--rd-accent-soft); color: var(--rd-accent); }
.rd-pill-off { color: var(--rd-ink-soft); }
.rd-pill-tag { font-size: var(--rd-fs-caption); opacity: 0.7; }

/* 色块（主题 / 划线配色选一个） */
.rd-swatch { width: 34px; height: 34px; border-radius: var(--rd-r-pill); border: 2px solid transparent; }
.rd-swatch-on { border-color: var(--rd-ink); }

/* ── 书架 ── */
.rd-shelf { display: block; }
.rd-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--rd-space-4) var(--rd-space-3); }
.rd-book { display: flex; flex-direction: column; gap: 6px; text-align: left; border: 0; background: transparent; padding: 0; color: inherit; font-family: inherit; }
.rd-book-cover {
  position: relative; width: 100%; aspect-ratio: 2 / 3;
  border-radius: var(--rd-r-sm); overflow: hidden;
  background: var(--rd-card); box-shadow: var(--rd-shadow);
}
.rd-book-cover-ph {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  padding: var(--rd-space-2); text-align: center;
  background: linear-gradient(155deg, var(--rd-cover-a), var(--rd-cover-b));
  color: var(--rd-cover-ink); font-family: var(--rd-font-heading); font-size: var(--rd-fs-sm); line-height: 1.35;
}
.rd-cover-img { width: 100%; height: 100%; object-fit: cover; display: block; }
/* 小封面里的纸样别用正文那号字（44px 的缩略图上会把书名挤成竖排） */
.rd-note-cover .rd-book-cover-ph, .rd-grid-list .rd-book-cover-ph, .rd-result-cover .rd-book-cover-ph { font-size: var(--rd-fs-caption); padding: 2px; }
.rd-book-title { font-size: var(--rd-fs-sm); font-weight: 600; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.rd-book-author { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rd-book-prog { display: flex; align-items: center; gap: 6px; margin-top: 1px; }
.rd-book-pct { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); flex: 0 0 auto; font-variant-numeric: tabular-nums; }
.rd-bar { flex: 1 1 auto; height: 3px; border-radius: var(--rd-r-pill); background: var(--rd-track); overflow: hidden; }
.rd-bar-fill { height: 100%; background: var(--rd-bar-fill); border-radius: var(--rd-r-pill); }

/* 书架第二版式：横向卡片（一行一本） */
.rd-grid-list { display: flex; flex-direction: column; gap: var(--rd-space-3); }
.rd-grid-list .rd-book { flex-direction: row; align-items: center; gap: var(--rd-space-3); background: var(--rd-card); border-radius: var(--rd-r-md); padding: var(--rd-space-3); box-shadow: var(--rd-shadow-sm); }
.rd-grid-list .rd-book-cover { width: 54px; aspect-ratio: 2 / 3; flex: 0 0 auto; box-shadow: none; }
.rd-grid-list .rd-book-meta { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }

/* ── 阅读页 ── */
/* 安全区归**这一层**管：顶栏和底栏都是能藏掉的（沉浸态），安全区不能挂在它们身上
   ——挂上去的结果就是藏栏的时候正文顺势钻到状态栏底下（实机「第 11 章」被时间压住）。
   max() 兜住两种来源：上游给 SELF_SAFE_AREA_APPS 算的 --chrome-top/--safe-bottom，
   以及 iOS 自己的 env()（手机上上游那两个值可能是 0）。取大值，不会双算。 */
.rd-reader {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  padding-top: max(var(--chrome-top, 0px), env(safe-area-inset-top, 0px));
  padding-bottom: max(var(--safe-bottom, 0px), env(safe-area-inset-bottom, 0px));
  background: var(--rd-paper); background-image: var(--rd-paper-tex);
  color: var(--rd-ink);
}
.rd-reader-bar {
  flex: 0 0 auto; display: flex; align-items: center; gap: 2px;
  padding: 5px var(--rd-space-2) 2px;
}
.rd-reader-bar-tools { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; }
.rd-reader-bar-title { flex: 1 1 auto; min-width: 0; text-align: center; color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rd-reader-viewport { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; }
/* 按「这一页的内容高度」裁切：视口通常比一页的内容高一点，不裁的话下一页的第一行
   会在底部露出半个字的边（书页本来就该在页边界处切断，不露下一页的字头）。 */
.rd-reader-clip { position: absolute; left: 0; right: 0; top: 0; overflow: hidden; }
.rd-reader-flow {
  position: absolute; left: var(--rd-page-gutter); right: var(--rd-page-gutter); top: 0;
  will-change: transform;
  transition: transform 260ms cubic-bezier(0.33, 0.7, 0.4, 1);
}
.rd-reader-kicker { color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); letter-spacing: 0.08em; margin-bottom: var(--rd-space-3); }
.rd-reader-chapter { font-family: var(--rd-font-heading); font-size: var(--rd-fs-title); line-height: 1.4; margin: 0 0 var(--rd-space-5); font-weight: 600; }
.rd-para {
  font-size: var(--rd-fs-body); line-height: var(--rd-lh-body);
  margin: 0 0 var(--rd-para-gap);
  text-indent: var(--rd-para-indent);
  white-space: pre-wrap; word-break: break-word;
}
.rd-reader-veil { position: absolute; inset: 0; background: var(--rd-veil); pointer-events: none; }

.rd-reader-foot { flex: 0 0 auto; background: var(--rd-paper-2); border-top: 1px solid var(--rd-rule-soft); }
.rd-reader-stat { display: flex; align-items: center; justify-content: space-between; gap: var(--rd-space-3); padding: var(--rd-space-2) var(--rd-space-4) 0; color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }
.rd-reader-slider { display: flex; align-items: center; gap: var(--rd-space-2); padding: var(--rd-space-2) var(--rd-space-4); }
.rd-slider-nav {
  width: 32px; height: 32px; flex: 0 0 auto; border-radius: var(--rd-r-pill);
  border: 1px solid var(--rd-rule); background: var(--rd-card); color: var(--rd-ink-soft);
  display: inline-flex; align-items: center; justify-content: center;
}
.rd-slider-track { position: relative; flex: 1 1 auto; height: 32px; display: flex; align-items: center; }
.rd-slider-rail { position: absolute; left: 0; right: 0; height: 6px; border-radius: var(--rd-r-pill); background: var(--rd-track); }
.rd-slider-fill { height: 100%; background: var(--rd-bar-fill); border-radius: var(--rd-r-pill); }
/* 轨道末端的圆把手（参考图上那条进度条末端的手感） */
.rd-slider-knob {
  position: absolute; top: 50%; width: 20px; height: 20px; margin: -10px 0 0 -10px;
  border-radius: var(--rd-r-pill); background: var(--rd-bar-fill);
  box-shadow: var(--rd-shadow-sm); pointer-events: none;
}
.rd-reader-tools { display: flex; align-items: center; justify-content: space-between; padding: var(--rd-space-1) var(--rd-space-3) var(--rd-space-2); }
.rd-tool {
  border: 0; background: transparent; color: var(--rd-ink-soft);
  min-width: 44px; height: 38px; padding: 0 6px; border-radius: var(--rd-r-sm);
  display: inline-flex; align-items: center; justify-content: center; gap: 3px;
  font-family: var(--rd-font-body); font-size: var(--rd-fs-sm);
}
.rd-tool:active { background: var(--rd-bg-2); }
.rd-tool-on { color: var(--rd-accent); }

/* ── 阅读页的底部面板（排版 / 主题）：从工具排上面升起，顶替进度那两行 ── */
.rd-reader-panel { padding: var(--rd-space-4) var(--rd-space-4) var(--rd-space-1); animation: rd-rise 200ms ease-out; }
/* 「标签在左、控件在右」的行（参考图那条 Font / Font Size / H Margin / Line Spacing） */
.rd-opt { display: flex; align-items: center; gap: var(--rd-space-3); margin-bottom: var(--rd-space-3); }
.rd-opt-label { width: 84px; flex: 0 0 auto; font-size: var(--rd-fs-md); }
.rd-opt-value {
  flex: 1 1 auto; min-width: 0; height: 36px; display: flex; align-items: center; justify-content: center; gap: 6px;
  border: 0; border-radius: var(--rd-r-sm); background: var(--rd-card); color: var(--rd-ink);
  font-family: var(--rd-font-body); font-size: var(--rd-fs-md); box-shadow: var(--rd-shadow-sm);
}
/* 自绘滑杆：圆角轨 + 已读段 + 写着数值的圆把手（原生 range 做不出参考图那个把手） */
.rd-range { position: relative; flex: 1 1 auto; height: 36px; touch-action: none; }
.rd-range-track { position: absolute; left: 0; right: 0; top: 50%; height: 36px; margin-top: -18px; border-radius: var(--rd-r-pill); background: var(--rd-card); box-shadow: var(--rd-shadow-sm); }
.rd-range-fill { position: absolute; left: 0; top: 50%; height: 36px; margin-top: -18px; border-radius: var(--rd-r-pill); background: var(--rd-accent-soft); }
.rd-range-knob {
  position: absolute; top: 50%; width: 30px; height: 30px; margin: -15px 0 0 -15px;
  border-radius: var(--rd-r-pill); background: var(--rd-accent); color: var(--rd-on-accent);
  display: flex; align-items: center; justify-content: center;
  font-size: var(--rd-fs-caption); font-variant-numeric: tabular-nums;
}
/* 面板里的分段控件（翻页模式 / 主题分组）：浅灰轨道 + 白底选中块 */
.rd-opt-seg { display: flex; gap: 2px; background: var(--rd-track); border-radius: var(--rd-r-sm); padding: 2px; }
.rd-opt-seg-btn {
  flex: 1 1 0; min-width: 0; border: 0; background: transparent; color: var(--rd-ink-soft);
  border-radius: calc(var(--rd-r-sm) - 2px); padding: 7px 4px;
  font-family: var(--rd-font-body); font-size: var(--rd-fs-sm);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rd-opt-seg-on { background: var(--rd-card); color: var(--rd-ink); font-weight: 600; box-shadow: var(--rd-shadow-sm); }

/* 主题面板的色卡网格（参考图 3 列，每张卡就是那套皮肤的纸色） */
.rd-theme-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--rd-space-2); }
.rd-theme-card {
  position: relative; height: 42px; border: 0; border-radius: var(--rd-r-sm);
  font-family: var(--rd-font-body); font-size: var(--rd-fs-sm);
  display: flex; align-items: center; justify-content: center;
}
.rd-theme-card-on { box-shadow: 0 0 0 2px var(--rd-accent); }
.rd-theme-check { position: absolute; right: 4px; bottom: 4px; font-size: var(--rd-fs-caption); }

/* ── 书详情 ── */
.rd-detail { padding-bottom: calc(var(--safe-bottom, 0px) + 88px); }
.rd-detail-hero { display: flex; gap: var(--rd-space-4); }
.rd-detail-cover { width: 104px; flex: 0 0 auto; aspect-ratio: 2 / 3; border-radius: var(--rd-r-sm); overflow: hidden; background: var(--rd-card); box-shadow: var(--rd-shadow); position: relative; }
.rd-detail-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.rd-detail-title { font-family: var(--rd-font-heading); font-size: var(--rd-fs-title); line-height: 1.25; font-weight: 600; }
.rd-detail-sub { color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); }
.rd-stars { display: flex; gap: 4px; margin: 2px 0; color: var(--rd-accent); }
.rd-star { color: var(--rd-rule); }
.rd-star-on { color: var(--rd-accent); }
.rd-detail-meta { display: flex; align-items: center; flex-wrap: wrap; gap: var(--rd-space-3); color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); margin-top: 2px; }
.rd-detail-meta span { display: inline-flex; align-items: center; gap: 4px; }
.rd-badge { color: var(--rd-accent); display: inline-flex; align-items: center; gap: 4px; }

.rd-tabs { display: flex; gap: var(--rd-space-4); overflow-x: auto; margin: var(--rd-space-5) 0 var(--rd-space-3); }
.rd-tabs::-webkit-scrollbar { height: 0; }
.rd-tabline {
  flex: 0 0 auto; border: 0; background: transparent; padding: 0 0 8px;
  color: var(--rd-ink-soft); font-family: var(--rd-font-body); font-size: var(--rd-fs-md);
  border-bottom: 2px solid transparent;
}
.rd-tabline-on { color: var(--rd-ink); font-weight: 600; border-bottom-color: var(--rd-accent); }
.rd-detail-card { background: var(--rd-card); border-radius: var(--rd-r-lg); box-shadow: var(--rd-shadow-sm); padding: var(--rd-space-4); }
.rd-cta {
  position: absolute; left: var(--rd-space-4); right: var(--rd-space-4);
  bottom: calc(var(--safe-bottom, 0px) + var(--rd-space-4));
  display: block; width: auto; text-align: center;
  border: 0; border-radius: var(--rd-r-md); padding: var(--rd-space-4);
  background: var(--rd-accent-soft); color: var(--rd-accent);
  font-family: var(--rd-font-body); font-size: var(--rd-fs-lg);
}

/* ── 笔记（一本书一行） ── */
.rd-note { display: flex; gap: var(--rd-space-3); align-items: flex-start; width: 100%; text-align: left; border: 0; background: transparent; color: inherit; font-family: inherit; padding: var(--rd-space-3) 0; }
.rd-note + .rd-note { border-top: 1px solid var(--rd-rule); }
.rd-note-cover { width: 44px; flex: 0 0 auto; aspect-ratio: 2 / 3; border-radius: var(--rd-r-sm); overflow: hidden; background: var(--rd-card); box-shadow: var(--rd-shadow-sm); position: relative; }
.rd-note-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.rd-note-book { font-size: var(--rd-fs-md); font-weight: 600; }
.rd-note-sub { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }
.rd-note-quote { color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); line-height: 1.55; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.rd-note-text { font-size: var(--rd-fs-sm); line-height: 1.55; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }

/* ── 统计 ── */
.rd-seg { display: flex; background: var(--rd-bg-2); border-radius: var(--rd-r-pill); padding: 3px; margin-bottom: var(--rd-space-4); }
.rd-seg-btn {
  flex: 1 1 0; border: 0; background: transparent; color: var(--rd-ink-soft);
  border-radius: var(--rd-r-pill); padding: 7px 0; font-family: var(--rd-font-body); font-size: var(--rd-fs-sm);
}
.rd-seg-on { background: var(--rd-card); color: var(--rd-ink); font-weight: 600; box-shadow: var(--rd-shadow-sm); }
.rd-stat-hero { background: var(--rd-card); border-radius: var(--rd-r-lg); box-shadow: var(--rd-shadow-sm); padding: var(--rd-space-4); margin-bottom: var(--rd-space-3); }
.rd-stat-cap { color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); }
.rd-stat-big { font-family: var(--rd-font-heading); font-size: var(--rd-fs-hero); line-height: 1.25; margin-top: 2px; }
.rd-stat-delta { color: var(--rd-accent); font-size: var(--rd-fs-caption); margin-top: 4px; }
.rd-stat-cols { display: grid; grid-template-columns: 1fr 1fr; gap: var(--rd-space-3); }
.rd-stat-cell { background: var(--rd-card); border-radius: var(--rd-r-lg); box-shadow: var(--rd-shadow-sm); padding: var(--rd-space-4); }
.rd-stat-num { font-family: var(--rd-font-heading); font-size: var(--rd-fs-title); line-height: 1.3; margin-top: 2px; }
.rd-chart { display: flex; align-items: flex-end; gap: var(--rd-space-2); height: 120px; padding: var(--rd-space-2) 0; }
.rd-chart-col { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 6px; height: 100%; }
.rd-chart-bar { width: 100%; max-width: 16px; border-radius: var(--rd-r-sm); background: var(--rd-chart-bar); min-height: 3px; }
/* 里程碑行（参考图底部那条「3 Day Streak」） */
.rd-stat-row { display: flex; align-items: center; gap: var(--rd-space-3); margin-top: var(--rd-space-3); }
.rd-stat-dot { width: 34px; height: 34px; flex: 0 0 auto; border-radius: var(--rd-r-pill); background: var(--rd-accent-soft); color: var(--rd-accent); display: flex; align-items: center; justify-content: center; }
.rd-chart-label { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }

/* ── 轻提示（一句话反馈） ── */
.rd-toast {
  position: fixed; left: 50%; transform: translateX(-50%);
  bottom: calc(var(--rd-nav-h) + var(--safe-bottom, 0px) + var(--rd-space-4));
  max-width: 82%; text-align: center;
  background: var(--rd-scrim); color: var(--rd-on-scrim);
  border-radius: var(--rd-r-pill);
  padding: var(--rd-space-2) var(--rd-space-4);
  font-size: var(--rd-fs-sm); z-index: 80;
}

/* ── 空态 / 辅助 ── */
.rd-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--rd-space-3); padding: 72px var(--rd-space-6); color: var(--rd-ink-soft); text-align: center; }
.rd-empty-title { color: var(--rd-ink); font-size: var(--rd-fs-lg); font-family: var(--rd-font-heading); }
.rd-empty-text { font-size: var(--rd-fs-sm); line-height: 1.7; max-width: 260px; }
.rd-muted { color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); line-height: 1.6; }

/* ── 划线覆盖层（第二批用；容器永远不给背景） ── */
.rd-hl-layer { position: absolute; inset: 0; pointer-events: none; }
.rd-hl-rect { position: absolute; border-radius: var(--rd-radius-hl); background: rgba(var(--rd-hl-rgb), 0.32); }

/* ── 书架 · 顶部（分类选择 + 菜单）、搜索胶囊、四种版式 ──
   参考图 2/3/4/5：顶部一行「All ⌄ …… ···」、大标题、搜索胶囊、四种版式、搜索页、分类页。 */
.rd-shelf-top { display: flex; align-items: center; gap: var(--rd-space-2); margin-bottom: 2px; }
.rd-shelf-top-spacer { flex: 1 1 auto; }
.rd-shelf-cat {
  display: inline-flex; align-items: center; gap: 4px; border: 0; background: transparent;
  color: var(--rd-ink); font-family: var(--rd-font-body); font-size: var(--rd-fs-lg); font-weight: 600;
  padding: 2px 8px; border-radius: var(--rd-r-sm);
}
.rd-shelf-cat:active { background: var(--rd-bg-2); }
.rd-search-pill {
  display: flex; align-items: center; gap: var(--rd-space-2); width: 100%;
  border: 0; background: var(--rd-card); color: var(--rd-ink-soft);
  border-radius: var(--rd-r-pill); padding: 10px var(--rd-space-4);
  font-family: var(--rd-font-body); font-size: var(--rd-fs-md); text-align: left;
  box-shadow: var(--rd-shadow-sm); margin-bottom: var(--rd-space-3);
}
/* 分组标题（参考图 SYSTEM CATEGORIES / 结果里的分类名） */
.rd-group-head {
  display: flex; align-items: center; justify-content: space-between; gap: var(--rd-space-3);
  color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); letter-spacing: 0.06em;
  margin: var(--rd-space-4) 0 var(--rd-space-1);
}
.rd-group-action { color: var(--rd-accent); font-size: var(--rd-fs-sm); letter-spacing: 0; border: 0; background: transparent; font-family: var(--rd-font-body); padding: 0; }
/* 分类行（文件夹 + 名字 + 计数） */
.rd-folder { display: flex; align-items: center; gap: var(--rd-space-3); width: 100%; border: 0; background: transparent; color: inherit; font-family: inherit; font-size: var(--rd-fs-md); padding: var(--rd-space-3) 0; text-align: left; }
.rd-folder + .rd-folder { border-top: 1px solid var(--rd-rule); }
.rd-folder-icon { color: var(--rd-accent); flex: 0 0 auto; display: inline-flex; }
.rd-folder-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rd-folder-count { color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); flex: 0 0 auto; font-variant-numeric: tabular-nums; }

/* 版式③：纯文字列表（参考图 List View） */
.rd-grid-plain { display: flex; flex-direction: column; }
.rd-grid-plain .rd-book { flex-direction: row; align-items: center; gap: var(--rd-space-3); padding: var(--rd-space-3) 0; }
.rd-grid-plain .rd-book + .rd-book { border-top: 1px solid var(--rd-rule); }
.rd-grid-plain .rd-book-cover { display: none; }
.rd-grid-plain .rd-book-meta { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }

/* 版式④：详情行（参考图 Detail List View：书名 + 星级 + 大小·格式·时间 + 右侧封面） */
.rd-grid-detail { display: flex; flex-direction: column; }
.rd-grid-detail .rd-book { flex-direction: row-reverse; align-items: flex-start; gap: var(--rd-space-3); padding: var(--rd-space-3) 0; }
.rd-grid-detail .rd-book + .rd-book { border-top: 1px solid var(--rd-rule); }
.rd-grid-detail .rd-book-cover { width: 64px; aspect-ratio: 2 / 3; flex: 0 0 auto; box-shadow: var(--rd-shadow-sm); }
.rd-grid-detail .rd-book-meta { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.rd-book-facts { display: flex; flex-wrap: wrap; gap: var(--rd-space-3); color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }
.rd-book-stars { display: flex; gap: 2px; font-size: var(--rd-fs-caption); }
.rd-star-dim { color: var(--rd-rule); }

/* 搜索页（参考图 3/4） */
.rd-search-bar { display: flex; align-items: center; gap: var(--rd-space-3); margin-bottom: var(--rd-space-3); }
.rd-search-input {
  flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: var(--rd-space-2);
  background: var(--rd-bg-2); border-radius: var(--rd-r-sm); padding: 9px var(--rd-space-3); color: var(--rd-ink-soft);
}
.rd-search-input input {
  flex: 1 1 auto; min-width: 0; border: 0; background: transparent; outline: none;
  color: var(--rd-ink); font-family: var(--rd-font-body); font-size: var(--rd-fs-md);
}
.rd-search-cancel { border: 0; background: transparent; color: var(--rd-accent); font-family: var(--rd-font-body); font-size: var(--rd-fs-md); flex: 0 0 auto; padding: 0; }
.rd-search-found { color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); margin: var(--rd-space-3) 0 0; }
/* 搜索结果行（图 4：左书名+星级+元信息，右封面） */
.rd-result { display: flex; flex-direction: row-reverse; align-items: flex-start; gap: var(--rd-space-3); width: 100%; border: 0; background: transparent; color: inherit; font-family: inherit; text-align: left; padding: var(--rd-space-3) 0; }
.rd-result + .rd-result { border-top: 1px solid var(--rd-rule); }
.rd-result-cover { width: 52px; aspect-ratio: 2 / 3; flex: 0 0 auto; border-radius: var(--rd-r-sm); overflow: hidden; background: var(--rd-card); box-shadow: var(--rd-shadow-sm); position: relative; }
.rd-result-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px; }

/* 菜单 sheet 里的小分组标题 */
.rd-menu-label { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); padding: 0 var(--rd-space-4) var(--rd-space-1); }
.rd-menu-gap { height: var(--rd-space-3); }

/* 多选模式的勾选角标 + 底部操作条 */
.rd-book-pick {
  position: absolute; right: 6px; top: 6px; width: 22px; height: 22px; border-radius: var(--rd-r-pill);
  border: 2px solid var(--rd-on-scrim); background: var(--rd-scrim); color: var(--rd-on-scrim);
  display: flex; align-items: center; justify-content: center;
}
.rd-book-pick-on { background: var(--rd-accent); border-color: var(--rd-accent); }
.rd-pickbar {
  position: fixed; left: var(--rd-space-4); right: var(--rd-space-4);
  bottom: calc(var(--rd-nav-h) + var(--safe-bottom, 0px) + var(--rd-space-3));
  display: flex; align-items: center; gap: var(--rd-space-3); z-index: 70;
  background: var(--rd-card); border-radius: var(--rd-r-pill); box-shadow: var(--rd-shadow);
  padding: var(--rd-space-2) var(--rd-space-2) var(--rd-space-2) var(--rd-space-4);
  font-size: var(--rd-fs-sm);
}
.rd-pickbar .rd-btn { padding: 6px var(--rd-space-3); font-size: var(--rd-fs-sm); }
.rd-pickbar > span:first-child { flex: 1 1 auto; color: var(--rd-ink-soft); }
.rd-check { color: var(--rd-accent); flex: 0 0 auto; display: inline-flex; }

@keyframes rd-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes rd-rise { from { transform: translateY(14px) } to { transform: translateY(0) } }
`;

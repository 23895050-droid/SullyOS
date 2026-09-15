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

  /* ── 排版 ──
     字号分两族，**别混**（她 2026-09-15 报的「改里面的字体外面也跟着变」）：
       · 界面字号（hero…caption）= 固定的，正文调多大都不动它们——那是在调书，不是在调 App
       · 书的内容（--rd-fs-body / --rd-fs-chapter）= 只有这俩跟着用户设的字号走
     映射见 ReaderSkinPreset.typographyVars。 */
  --rd-font-heading: Georgia, "Songti SC", "Noto Serif SC", serif;
  --rd-font-body: -apple-system, "PingFang SC", "Noto Sans SC", sans-serif;
  --rd-fs-hero: 30px;
  --rd-fs-title: 24px;
  --rd-fs-lg: 20px;
  --rd-fs-body: 17px;
  --rd-fs-chapter: 22px;
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
  /* 阅读页上下栏的本体高度（安全区另算）。顶栏/底栏是**遮罩**，正文区按这两个数
     让开位置——所以沉浸开关不会让正文重排（ReaderPage 里的 BAR_H / FOOT_H 要跟这里一致）。 */
  --rd-bar-h: 46px;
  --rd-foot-h: 92px;
  /* 正文的上下标准边距（照她 2026-09-15 给的参考图量的）：从安全区下 10px 开始，
     到离屏幕底 88px 结束（= 安全区上 54px）。上下栏是遮罩，压在正文上——**不占位**，
     所以正文该铺到哪就铺到哪，被盖住的那几行翻页后会从页顶露出来。 */
  --rd-page-top: 10px;
  /* 页眉（那一行小章节名）占的高度 + 它和正文之间的空 —— 正文从它下面才开始 */
  --rd-page-head: 32px;
  --rd-page-bottom: 54px;

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
.rd-headbar { position: relative; display: flex; align-items: center; gap: 2px; margin-bottom: var(--rd-space-4); }
/* 标题按**整条**居中，不是按「左右两堆按钮剩下的中间」——左边一个返回、右边两个图标的话，
   右边宽 36px，居中点就被推左 18px（她报的「顶部字歪了」就是这个）。
   所以标题脱离流、绝对压在 50% 上，两边的按钮爱多宽多宽。 */
.rd-headbar-title {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  max-width: 58%; pointer-events: none;
  font-size: var(--rd-fs-md); font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* 标题脱流之后，它后面那串按钮没了推力——第一个自己贴右边，后面的跟着 */
.rd-headbar-title + * { margin-left: auto; }
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
/* 目录/搜索那两张高面板：自己不开滚动条，让里面的列表滚（头和三页签钉在上头） */
.rd-sheet-tall { display: flex; flex-direction: column; overflow: hidden; height: 78vh; }
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
/* 顶栏是**遮罩**：absolute 浮在正文上，不占流。它自己的安全区内边距垫到状态栏后面，
   正文区在 .rd-reader 的 padding 里，所以两边都不越界；沉浸时只淡出，一行都不位移。 */
.rd-reader-bar {
  position: absolute; top: 0; left: 0; right: 0; z-index: 20;
  display: flex; align-items: center; gap: 2px;
  height: calc(var(--rd-bar-h) + max(var(--chrome-top, 0px), env(safe-area-inset-top, 0px)));
  padding: max(var(--chrome-top, 0px), env(safe-area-inset-top, 0px)) var(--rd-space-2) 0;
  background: var(--rd-paper); background-image: var(--rd-paper-tex);
}
/* 标题脱流之后这排按钮没了推力，得自己贴右边 */
.rd-reader-bar-tools { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; margin-left: auto; }
/* 同上：按整条居中。左边一个返回、右边「目录 + 更多」两个，差 36px。
   ⚠️ 竖向别用 top:50% —— 绝对定位是按**含安全区的整个条**算的，安全区越高标题越往上钻
   （真机上就钻到灵动岛底下去了，她 2026-09-15 拍的图）。按「条高 − 上栏本体高度的一半」算，
   正好落在按钮那一行的中线上。 */
.rd-reader-bar-title {
  position: absolute; left: 50%; top: calc(100% - var(--rd-bar-h) / 2); transform: translate(-50%, -50%);
  max-width: 58%; pointer-events: none;
  color: var(--rd-ink-soft); font-size: var(--rd-fs-caption);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rd-reader-viewport {
  position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden;
  /* 横向手势归我们（翻页跟手），纵向留给浏览器（正文本来不滚，这样长按选字不打架） */
  touch-action: pan-y;
}
/* 一屏一片：整章排进**多列流**里，一列就是一页，翻页 = 整列横向平移。
   视口只露一列宽，所以它才是「裁切」的那一层（横排后不再按页高裁，页高恒等于正文区高）。
   正文从标准上边距开始（不是从顶栏下面开始——顶栏是遮罩，压在上面），到标准下边距结束。 */
.rd-reader-clip { position: absolute; left: 0; right: 0; top: calc(var(--rd-page-top) + var(--rd-page-head)); overflow: hidden; }
/* 跟手横滑 + 落位动画都改这一层的 transform（拖拽时 ReaderPage 直接改行内值，不走 React） */
.rd-reader-track {
  position: absolute; left: 0; top: 0; width: 100%; height: 100%;
  will-change: transform;
  transition: transform 260ms cubic-bezier(0.33, 0.7, 0.4, 1);
}
/* 列宽 / 列间距 / 高度 / 左右页边距全部由 ReaderPage 按视口写进行内样式——
   关系必须守住：列宽 + 列间距 = 视口宽 = 一页的横向步长（见 utils/reader/paginate 顶部）。 */
.rd-reader-flow {
  position: absolute; left: 0; top: 0;
  padding: 0 var(--rd-page-gutter);
  column-fill: auto;
  overflow: visible;
  -webkit-user-select: text;
  user-select: text;
}
/* 插图（EPUB 里的图）：不跨列断开，顶端对齐当页 */
.rd-figure {
  display: block; margin: var(--rd-space-4) auto; max-width: 100%;
  max-height: 100%; width: auto; height: auto;
  break-inside: avoid; -webkit-user-select: none; user-select: none;
}
/* 页眉：每页顶上那一行小字（参考图里的「第三章」）——定位在正文区上方，不跟着正文滚 */
.rd-reader-head {
  position: absolute; left: var(--rd-page-gutter); right: var(--rd-page-gutter);
  top: var(--rd-page-top); z-index: 5;
  color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); letter-spacing: 0.04em;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* 页脚：左下时间 + 右下页码（参考图那行 8:29 PM / 103 / 334）。字小，跟标注同一档 */
.rd-reader-footnote {
  position: absolute; left: var(--rd-page-gutter); right: var(--rd-page-gutter);
  bottom: calc(max(var(--safe-bottom, 0px), env(safe-area-inset-bottom, 0px)) + 16px);
  z-index: 19; pointer-events: none;
  display: flex; align-items: baseline; justify-content: space-between; gap: var(--rd-space-3);
  color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); font-variant-numeric: tabular-nums;
}
/* 章标题是「书里的东西」，跟着正文字号走（界面那些字号是固定的，见 .rd-root 那段注释） */
.rd-reader-chapter { font-family: var(--rd-font-heading); font-size: var(--rd-fs-chapter); line-height: 1.4; margin: 0 0 var(--rd-space-5); font-weight: 600; }
.rd-para {
  font-size: var(--rd-fs-body); line-height: var(--rd-lh-body);
  margin: 0 0 var(--rd-para-gap);
  text-indent: var(--rd-para-indent);
  white-space: pre-wrap; word-break: break-word;
}
.rd-reader-veil { position: absolute; inset: 0; background: var(--rd-veil); pointer-events: none; }

/* 底栏同样是遮罩，高度写死——里面的行都靠 flex-end 兜底，加减内容不会把正文顶走 */
.rd-reader-foot {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 20;
  height: calc(var(--rd-foot-h) + max(var(--safe-bottom, 0px), env(safe-area-inset-bottom, 0px)));
  padding-bottom: max(var(--safe-bottom, 0px), env(safe-area-inset-bottom, 0px));
  display: flex; flex-direction: column; justify-content: flex-end;
  background: var(--rd-paper-2);
}
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
/* 排版/主题面板浮在底栏**上面**（bottom:100%），底栏高度不动 → 正文不动 */
.rd-reader-panel {
  position: absolute; left: 0; right: 0; bottom: 100%;
  padding: var(--rd-space-4) var(--rd-space-4) var(--rd-space-3);
  background: var(--rd-paper-2);
  border-radius: var(--rd-r-lg) var(--rd-r-lg) 0 0;
  box-shadow: var(--rd-shadow);
  animation: rd-rise 200ms ease-out;
}
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
.rd-detail-cover {
  width: 104px; flex: 0 0 auto; aspect-ratio: 2 / 3; border-radius: var(--rd-r-sm); overflow: hidden;
  background: var(--rd-card); box-shadow: var(--rd-shadow); position: relative;
  border: 0; padding: 0;   /* 它是 <button>：换封面就点它 */
}
/* 封面下角那条「换封面」 */
.rd-cover-edit {
  position: absolute; left: 0; right: 0; bottom: 0;
  padding: 3px 0; text-align: center;
  background: var(--rd-scrim); color: var(--rd-on-scrim);
  font-size: var(--rd-fs-caption);
}
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
/* 划线覆盖层：挂在 track 上（跟正文同一个坐标系），每一条矩形的坐标由 ReaderPage 按行算出来。
   **别给它背景**——它是一层透明覆盖物，盖住的字还得能选中 */
.rd-hl-layer {
  position: absolute; left: var(--rd-page-gutter); top: 0; width: 100%; height: 100%;
  pointer-events: none; overflow: visible;
}
/* 兜底色是「现在这支笔」；每条划线自己的颜色由行内样式压上来（她：颜色要能一笔一笔挑） */
.rd-hl-rect { position: absolute; border-radius: var(--rd-radius-hl); background: rgba(var(--rd-hl-rgb), 0.32); }
.rd-hl-rect-tap { outline: 1px solid var(--rd-accent); outline-offset: 1px; }

/* 选中/点中划线后浮出来的**工具栏**（她 2026-09-15 给的参考图：深色圆角条 + 图标小字 + 右侧 ›）。
   为什么不是「选中就弹」：那一层会被 iOS 原生的选区菜单压住（她报过）。
   这里**故意不放色卡**——笔的颜色只有一个地方改（.rd-bar-tb 里的「我的颜色」只是入口）。 */
.rd-bar-tb {
  position: fixed; z-index: 62; transform: translate(-50%, -100%);
  display: flex; align-items: stretch; gap: 2px;
  padding: var(--rd-space-2);
  border-radius: var(--rd-r-md);
  background: var(--rd-toolbar-bg); color: var(--rd-toolbar-ink);
  box-shadow: var(--rd-shadow);
}
/* 底下那个小三角：指着被选中的那段话（参考图里也有） */
.rd-bar-tb::after {
  content: ''; position: absolute; left: 50%; bottom: -5px; width: 12px; height: 12px;
  margin-left: -6px; border-radius: var(--rd-radius-hl); transform: rotate(45deg);
  background: var(--rd-toolbar-bg);
}
.rd-bar-tb-item {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  min-width: 54px; padding: var(--rd-space-2) 2px;
  border: 0; background: transparent; color: inherit; white-space: nowrap;
  font-family: var(--rd-font-body); font-size: var(--rd-fs-tab);
}
.rd-bar-tb-item:active { opacity: 0.6; }
.rd-bar-tb-arrow { min-width: 26px; justify-content: center; }
.rd-bar-tb-note { display: flex; align-items: center; gap: var(--rd-space-2); padding: 2px; }
.rd-bar-tb-input {
  width: 190px; border: 0; border-radius: var(--rd-r-pill);
  padding: var(--rd-space-2) var(--rd-space-3);
  background: var(--rd-toolbar-ink); color: var(--rd-ink);
  font-family: var(--rd-font-body); font-size: var(--rd-fs-sm);
}
.rd-bar-tb-text {
  border: 0; background: transparent; color: inherit; white-space: nowrap;
  padding: var(--rd-space-1) var(--rd-space-2);
  font-family: var(--rd-font-body); font-size: var(--rd-fs-sm);
}

/* ── 书架 · 顶部（分类选择 + 菜单）、搜索胶囊、四种版式 ──
   参考图 2/3/4/5：顶部一行「All ⌄ …… ···」、大标题、搜索胶囊、四种版式、搜索页、分类页。 */
.rd-shelf-top { position: relative; display: flex; align-items: center; gap: var(--rd-space-2); margin-bottom: 2px; }
.rd-shelf-top-spacer { flex: 1 1 auto; }
.rd-shelf-cat {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);   /* 同上：按整条居中 */
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

/* 设置首页那排彩色小图标（参考图 10 的「Mine」页）；色相旋转同统计页那套 */
.rd-row-ico {
  width: 26px; height: 26px; flex: 0 0 auto;
  border-radius: var(--rd-r-sm); background: var(--rd-accent-soft); color: var(--rd-accent);
  display: inline-flex; align-items: center; justify-content: center;
}
.rd-row-ico-2 { filter: hue-rotate(118deg); }
.rd-row-ico-3 { filter: hue-rotate(-118deg); }
.rd-row-ico-4 { filter: hue-rotate(58deg); }

/* ── 统计页（参考图 7/8）：问候卡 · 2×2 数字格 · 柱状图 · 热力格 · 年份条 · 时段分布 ── */
.rd-hello { background: var(--rd-card); border-radius: var(--rd-r-lg); box-shadow: var(--rd-shadow-sm); padding: var(--rd-space-4); margin-bottom: var(--rd-space-3); }
.rd-hello-big { font-family: var(--rd-font-heading); font-size: var(--rd-fs-title); line-height: 1.3; }
.rd-stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--rd-space-3); margin-bottom: var(--rd-space-3); }
.rd-stat-tile { background: var(--rd-card); border-radius: var(--rd-r-lg); box-shadow: var(--rd-shadow-sm); padding: var(--rd-space-4); display: flex; flex-direction: column; gap: 6px; }
.rd-stat-ico { width: 26px; height: 26px; border-radius: var(--rd-r-pill); background: var(--rd-accent-soft); color: var(--rd-accent); display: flex; align-items: center; justify-content: center; }
/* 四个格子四个色：不新增皮肤变量，直接把强调色转个色相（任何皮肤下都成立） */
.rd-stat-ico-2 { filter: hue-rotate(118deg); }
.rd-stat-ico-3 { filter: hue-rotate(-118deg); }
.rd-stat-ico-4 { filter: hue-rotate(58deg); }
.rd-stat-tile-cap { color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); }
.rd-stat-tile-num { font-family: var(--rd-font-heading); font-size: var(--rd-fs-title); line-height: 1.2; }
.rd-stat-tile-num small { font-family: var(--rd-font-body); font-size: var(--rd-fs-sm); color: var(--rd-ink-soft); margin-left: 3px; }

/* 热力格（最近 30 天 / 当月 / 年度） */
.rd-heat { display: grid; gap: 4px; }
.rd-heat-30 { grid-template-columns: repeat(10, minmax(0, 1fr)); }
.rd-heat-year { grid-template-columns: repeat(31, minmax(0, 1fr)); }
.rd-heat-cell { aspect-ratio: 1 / 1; border-radius: var(--rd-r-sm); background: var(--rd-track); }
.rd-heat-1 { background: var(--rd-accent-soft); }
.rd-heat-2 { background: var(--rd-accent); opacity: 0.3; }
.rd-heat-3 { background: var(--rd-accent); opacity: 0.6; }
.rd-heat-4 { background: var(--rd-accent); }
.rd-heat-legend { display: flex; align-items: center; justify-content: flex-end; gap: 4px; color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); margin-top: var(--rd-space-3); }
.rd-heat-key { width: 11px; height: 11px; border-radius: var(--rd-r-sm); }
.rd-month-row { display: flex; align-items: center; gap: var(--rd-space-2); margin-bottom: 3px; }
.rd-month-label { width: 30px; flex: 0 0 auto; color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }
.rd-month-cells { flex: 1 1 auto; min-width: 0; display: grid; grid-template-columns: repeat(31, minmax(0, 1fr)); gap: 2px; }
.rd-month-cells > span { aspect-ratio: 1 / 1; border-radius: var(--rd-radius-hl); background: var(--rd-track); }

/* 年份选择条 */
.rd-yearbar { display: flex; align-items: center; justify-content: space-between; gap: var(--rd-space-3); background: var(--rd-card); border-radius: var(--rd-r-lg); box-shadow: var(--rd-shadow-sm); padding: var(--rd-space-3) var(--rd-space-4); margin-bottom: var(--rd-space-3); }
.rd-yearbar-title { font-size: var(--rd-fs-lg); font-weight: 600; font-variant-numeric: tabular-nums; }

/* 时段分布（0:00 - 23:00） */
.rd-hours { display: flex; align-items: flex-end; gap: 3px; height: 64px; }
.rd-hour-col { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; justify-content: flex-end; height: 100%; }
.rd-hour-bar { background: var(--rd-chart-bar); border-radius: var(--rd-r-sm) var(--rd-r-sm) 0 0; min-height: 2px; }
.rd-hour-axis { display: flex; justify-content: space-between; color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); margin-top: 4px; }

/* 工作日 vs 周末 的两格 */
.rd-stat-pair { display: grid; grid-template-columns: 1fr 1fr; gap: var(--rd-space-3); }
.rd-stat-sub { background: var(--rd-bg-2); border-radius: var(--rd-r-md); padding: var(--rd-space-3); text-align: center; }
.rd-stat-sub-num { font-family: var(--rd-font-heading); font-size: var(--rd-fs-lg); margin-top: 2px; }
/* 成就行（最活跃的一天 / 最常读的书 …） */
.rd-achv { display: flex; align-items: center; justify-content: space-between; gap: var(--rd-space-3); padding: var(--rd-space-3) 0; font-size: var(--rd-fs-md); }
.rd-achv + .rd-achv { border-top: 1px solid var(--rd-rule); }
.rd-achv-cap { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }
.rd-achv-val { color: var(--rd-accent); flex: 0 0 auto; font-size: var(--rd-fs-sm); }

/* ── 书签丝带（参考图 1/3：加了书签，纸的右上角挂一条红丝带，垂过状态栏那一段） ── */
.rd-ribbon {
  position: absolute; top: 0; right: 8px; width: 20px; height: 36px; z-index: 40;
  background: var(--rd-ribbon); pointer-events: none;
  animation: rd-drop 220ms ease-out;
}
.rd-ribbon::after {
  content: ''; position: absolute; left: 0; right: 0; top: 100%; height: 9px;
  background: var(--rd-ribbon);
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 50%, 0 100%);
}
@keyframes rd-drop { from { transform: translateY(-100%) } to { transform: translateY(0) } }

/* ── 底栏左二：进度条本体（参考图那个 —◯— ，点或拖都在调进度） ── */
.rd-seek { position: relative; width: 58px; flex: 0 0 auto; height: 32px; touch-action: none; display: flex; align-items: center; }
.rd-seek-rail { position: absolute; left: 0; right: 0; height: 5px; border-radius: var(--rd-r-pill); background: var(--rd-track); }
.rd-seek-fill { position: absolute; left: 0; height: 5px; border-radius: var(--rd-r-pill); background: var(--rd-bar-fill); }
.rd-seek-knob {
  position: absolute; width: 14px; height: 14px; margin-left: -7px; border-radius: var(--rd-r-pill);
  background: var(--rd-knob); box-shadow: var(--rd-shadow-sm);
}
.rd-tool-on .rd-seek-rail { background: transparent; }

/* ── 目录 / 搜索那张面板（参考图「左下一展开」+「右上二搜索」）── */
.rd-toc-head { display: flex; align-items: center; gap: var(--rd-space-3); padding: var(--rd-space-2) 0 var(--rd-space-3); }
.rd-toc-cover { width: 44px; aspect-ratio: 2 / 3; flex: 0 0 auto; border-radius: var(--rd-r-sm); overflow: hidden; background: var(--rd-card); box-shadow: var(--rd-shadow-sm); position: relative; }
.rd-toc-info { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.rd-toc-name { font-size: var(--rd-fs-md); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rd-toc-meta { display: flex; flex-wrap: wrap; gap: var(--rd-space-3); color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }
.rd-toc-group { color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); padding: var(--rd-space-3) 0 2px; }
.rd-toc-row { width: 100%; display: flex; flex-direction: column; gap: 4px; text-align: left; border: 0; background: transparent; color: inherit; font-family: inherit; padding: var(--rd-space-3) 0; }
.rd-toc-row + .rd-toc-row { border-top: 1px solid var(--rd-rule); }
.rd-toc-row-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--rd-space-3); font-size: var(--rd-fs-sm); }
.rd-toc-pct { color: var(--rd-ink-soft); flex: 0 0 auto; font-variant-numeric: tabular-nums; }
.rd-toc-quote { color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); line-height: 1.6; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.rd-toc-time { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); font-variant-numeric: tabular-nums; }
.rd-toc-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding-bottom: var(--rd-space-3); }
.rd-toc-scroll::-webkit-scrollbar { width: 0; }

/* 搜索命中处的高亮（参考图 4：命中的字蓝底） */
.rd-hunt-hit { background: var(--rd-accent-soft); color: var(--rd-accent); border-radius: var(--rd-radius-hl); padding: 0 1px; }
.rd-hunt-empty { color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); padding: var(--rd-space-5) 0; text-align: center; }

/* ── 日报（参考图「每日阅读数据」长图）── */
.rd-daily-hero { background: var(--rd-accent-soft); border-radius: var(--rd-r-lg); padding: var(--rd-space-5) var(--rd-space-4) var(--rd-space-4); text-align: center; margin-bottom: var(--rd-space-3); }
.rd-daily-date { color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); }
.rd-daily-big { font-family: var(--rd-font-heading); font-size: var(--rd-fs-hero); line-height: 1.2; font-weight: 600; margin-top: 2px; }
.rd-daily-cap { color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); margin-top: 2px; }
.rd-daily-cells { display: flex; justify-content: space-between; gap: var(--rd-space-2); margin-top: var(--rd-space-4); }
.rd-daily-cell { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.rd-daily-cell-num { font-size: var(--rd-fs-lg); font-weight: 600; font-variant-numeric: tabular-nums; }
.rd-daily-cell-cap { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }
.rd-daily-pair { display: grid; grid-template-columns: 1fr 1fr; gap: var(--rd-space-3); }
.rd-daily-mcell { background: var(--rd-bg-2); border-radius: var(--rd-r-md); padding: var(--rd-space-3); display: flex; flex-direction: column; gap: 2px; }
.rd-daily-mnum { color: var(--rd-accent); font-size: var(--rd-fs-lg); font-weight: 600; }
.rd-dist { display: flex; flex-direction: column; gap: 2px; padding: var(--rd-space-2) 0; }
.rd-dist-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--rd-space-3); font-size: var(--rd-fs-sm); }
.rd-dist-sub { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }
.rd-dist-bar { height: 6px; border-radius: var(--rd-r-pill); background: var(--rd-track); overflow: hidden; margin-top: 4px; }
.rd-dist-fill { height: 100%; border-radius: var(--rd-r-pill); background: var(--rd-accent); }
.rd-dist-2 { filter: hue-rotate(118deg); }
.rd-dist-3 { filter: hue-rotate(-118deg); }
.rd-dist-4 { filter: hue-rotate(58deg); }
.rd-hour-block { padding: var(--rd-space-3) 0; }
.rd-hour-block + .rd-hour-block { border-top: 1px solid var(--rd-rule); }
.rd-hour-range { display: flex; align-items: center; gap: var(--rd-space-2); font-size: var(--rd-fs-md); font-variant-numeric: tabular-nums; }
.rd-hour-total { background: var(--rd-bg-2); border-radius: var(--rd-r-pill); padding: 1px 9px; color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }
.rd-hour-seg { display: flex; gap: var(--rd-space-3); overflow-x: auto; margin-top: var(--rd-space-3); }
.rd-hour-seg::-webkit-scrollbar { height: 0; }
.rd-hour-seg-item { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 62px; flex: 0 0 auto; }
.rd-hour-seg-cover { width: 52px; aspect-ratio: 2 / 3; border-radius: var(--rd-r-sm); overflow: hidden; background: var(--rd-card); box-shadow: var(--rd-shadow-sm); position: relative; }
.rd-hour-seg-name { font-size: var(--rd-fs-caption); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.rd-hour-seg-sec { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); font-variant-numeric: tabular-nums; }
.rd-best { display: flex; align-items: center; gap: var(--rd-space-3); padding: var(--rd-space-3) 0; }
.rd-best + .rd-best { border-top: 1px solid var(--rd-rule); }
.rd-best-ico { width: 26px; height: 26px; flex: 0 0 auto; border-radius: var(--rd-r-pill); background: var(--rd-accent-soft); color: var(--rd-accent); display: flex; align-items: center; justify-content: center; }
.rd-best-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.rd-best-cap { font-size: var(--rd-fs-sm); color: var(--rd-ink-soft); }
.rd-best-chip { background: var(--rd-accent-soft); color: var(--rd-accent); border-radius: var(--rd-r-pill); padding: 1px 9px; font-size: var(--rd-fs-caption); }
.rd-best-cover { width: 32px; aspect-ratio: 2 / 3; flex: 0 0 auto; border-radius: var(--rd-r-sm); overflow: hidden; background: var(--rd-card); box-shadow: var(--rd-shadow-sm); position: relative; }
.rd-rank { display: flex; align-items: center; gap: var(--rd-space-3); width: 100%; text-align: left; border: 0; background: transparent; color: inherit; font-family: inherit; padding: var(--rd-space-3) 0; }
.rd-rank + .rd-rank { border-top: 1px solid var(--rd-rule); }
.rd-rank-no { width: 20px; flex: 0 0 auto; text-align: center; color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); font-variant-numeric: tabular-nums; }
.rd-rank-cover { width: 32px; aspect-ratio: 2 / 3; flex: 0 0 auto; border-radius: var(--rd-r-sm); overflow: hidden; background: var(--rd-card); position: relative; }
.rd-rank-name { flex: 1 1 auto; min-width: 0; font-size: var(--rd-fs-md); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rd-rank-val { flex: 0 0 auto; color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); font-variant-numeric: tabular-nums; }
/* 统计页顶栏那颗「日报」入口（右上角），跟标题同一行 */
.rd-head-link { border: 0; background: transparent; color: var(--rd-accent); font-family: inherit; font-size: var(--rd-fs-sm); flex: 0 0 auto; padding: 4px 0; }

/* 沉浸：上下栏只淡出、不摘（摘掉正文会重排、跳动——她说的「顶来顶去」就是它） */
.rd-chrome-off { opacity: 0; pointer-events: none; transition: opacity 220ms ease-out; }

/* ── 底栏左二：图标是那个 —◯— ，点了在底栏上方**展开**一条能拖的进度条 ── */
.rd-seek-icon { position: relative; display: block; width: 24px; height: 5px; border-radius: var(--rd-r-pill); background: var(--rd-track); }
.rd-seek-icon-knob { position: absolute; top: 50%; left: 40%; width: 13px; height: 13px; margin: -6.5px 0 0 -6.5px; border-radius: var(--rd-r-pill); background: var(--rd-ink-soft); }
.rd-reader-seekrow {
  position: absolute; left: 0; right: 0; bottom: 100%;
  display: flex; align-items: center; gap: var(--rd-space-2);
  padding: var(--rd-space-3) var(--rd-space-4);
  background: var(--rd-paper-2);
  border-radius: var(--rd-r-lg) var(--rd-r-lg) 0 0;
  box-shadow: var(--rd-shadow);
  animation: rd-rise 200ms ease-out;
}
.rd-reader-seekpct { flex: 0 0 auto; min-width: 46px; text-align: right; color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); font-variant-numeric: tabular-nums; }
.rd-reader-seekrow .rd-slider-track { height: 40px; }

/* ── 书内搜索：整页（参考图 11 的高度，不是被键盘顶出来的小浮层）── */
.rd-hunt {
  position: absolute; inset: 0; z-index: 60;
  display: flex; flex-direction: column;
  padding: max(var(--chrome-top, 0px), env(safe-area-inset-top, 0px)) var(--rd-space-4)
           max(var(--safe-bottom, 0px), env(safe-area-inset-bottom, 0px));
  background: var(--rd-paper); background-image: var(--rd-paper-tex); color: var(--rd-ink);
}
.rd-hunt-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.rd-hunt-body::-webkit-scrollbar { width: 0; }
/* ── 书详情：书签 / 笔记的卡片（参考图 13：章节名 · 引文 · 时间 + 百分比） ── */
.rd-bmk-head { display: flex; align-items: center; justify-content: space-between; gap: var(--rd-space-3); color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); margin: var(--rd-space-3) 0 var(--rd-space-2); }
.rd-bmk-card { background: var(--rd-card); border-radius: var(--rd-r-lg); box-shadow: var(--rd-shadow-sm); padding: var(--rd-space-4); margin-bottom: var(--rd-space-3); }
.rd-bmk-chapter { color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); margin-bottom: 6px; }
.rd-bmk-text { font-size: var(--rd-fs-md); line-height: 1.7; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; }
.rd-bmk-note { font-size: var(--rd-fs-sm); line-height: 1.7; color: var(--rd-accent); margin-top: 6px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.rd-bmk-foot { display: flex; align-items: baseline; justify-content: space-between; gap: var(--rd-space-3); color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); margin-top: var(--rd-space-3); font-variant-numeric: tabular-nums; }

/* 分类面板：从顶部展开的一块，**盖在书架上面**（不是把内容往下推） */
.rd-catpanel {
  position: absolute; left: var(--rd-space-2); right: var(--rd-space-2);
  top: calc(var(--chrome-top, 0px) + 46px); z-index: 30;
  max-height: calc(100% - var(--chrome-top, 0px) - 66px); overflow-y: auto; overscroll-behavior: contain;
  background: var(--rd-sheet-bg); border-radius: var(--rd-r-lg); box-shadow: var(--rd-shadow);
  padding: var(--rd-space-4) var(--rd-space-2) var(--rd-space-4);
  animation: rd-rise 200ms ease-out;
}
.rd-catpanel::-webkit-scrollbar { width: 0; }
.rd-caret-up { transform: rotate(180deg); }
.rd-hunt-hist { display: flex; flex-wrap: wrap; gap: var(--rd-space-2); }
.rd-slider-hue { height: 14px; border-radius: var(--rd-r-pill); appearance: none; -webkit-appearance: none; }
.rd-slider-hue::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: var(--rd-r-pill); background: var(--rd-knob); box-shadow: var(--rd-shadow-sm); }
.rd-hl-preview { width: 30px; height: 30px; border-radius: var(--rd-r-pill); box-shadow: var(--rd-shadow-sm); flex: 0 0 auto; }
.rd-hunt-chip {
  border: 0; border-radius: var(--rd-r-pill); background: var(--rd-card);
  color: var(--rd-ink); font-family: inherit; font-size: var(--rd-fs-sm);
  padding: 6px var(--rd-space-4); box-shadow: var(--rd-shadow-sm);
}
/* 从搜索结果跳过去的那一条：回到列表时有选中态 */
.rd-toc-row-on { background: var(--rd-accent-soft); border-radius: var(--rd-r-md); }
.rd-toc-row-on .rd-toc-row-head span:first-child { color: var(--rd-accent); font-weight: 600; }

@keyframes rd-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes rd-rise { from { transform: translateY(14px) } to { transform: translateY(0) } }
`;

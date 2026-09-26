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
  /* 界面/接话那一路的无衬线栈，**不跟着「字体」设置变**。
     为什么单独一个：默认排版下 --rd-font-body 和 --rd-font-heading 都是 Georgia，
     于是「批注用衬线、接话用无衬线」这个区分会两边一模一样（她 09-21 要的字体区分）。
     接话是聊天，本来就该是无衬线。 */
  --rd-font-ui: -apple-system, "PingFang SC", "Noto Sans SC", sans-serif;
  --rd-fs-hero: 30px;
  --rd-fs-title: 24px;
  --rd-fs-lg: 20px;
  --rd-fs-body: 17px;
  --rd-fs-chapter: 22px;
  --rd-fs-md: 15px;
  --rd-fs-sm: 13px;
  --rd-fs-caption: 12px;
  --rd-fs-tab: 11px;
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
  /* 段落侧面色条：离正文多远、多粗（她要的是「贴着段落边上一根细柱子」） */
  --rd-para-bar-x: 11px;
  --rd-para-bar-w: 3px;
  /* 波浪线用的正弦遮罩（16×6 一格，描边在竖直中间；颜色由 currentColor 铺，遮罩不带色） */
  --rd-wave: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='6'%3E%3Cpath d='M0 3.4 Q 4 0.2 8 3.4 T 16 3.4' fill='none' stroke='%23000' stroke-width='1.7' stroke-linecap='round'/%3E%3C/svg%3E");
  --rd-wave-size: 16px 6px;
  --rd-space-1: 4px;
  --rd-space-2: 8px;
  --rd-space-3: 12px;
  --rd-space-4: 16px;
  --rd-space-5: 20px;
  --rd-space-6: 24px;
  /* 底部导航的高度与让位——**照她 09-21 给的参考图量的**（同尺寸设备 426.7×924.7pt）：
     参考图那条导航整体 82.7pt、图标实墨 18pt、文字下缘离屏幕底 38pt。
     所以它高在**图标和字更大**，不是下面留空更多：按钮 50pt 装得下「24px 图标 + 11px 字」，
     底下让位比安全区少 4pt（≈30pt，home 条本体在离底 8-13pt，净空还够 20pt+）。
     悬浮胶囊（进度/任务条）也按这两个变量算，别各写各的。 */
  --rd-nav-h: 50px;
  --rd-nav-pad: max(12px, calc(var(--safe-bottom, 0px) - 4px));
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
  /* 高度按**可见视口**算，不按外壳容器（同 .rd-reader 那段：独立模式里容器可能比屏幕高一截，
     照它排的话底部页签也跟着压到 home 条上）。dvh 不支持的老浏览器退回 100%。 */
  height: 100%;
  height: 100dvh;
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

/* 页签切换的「聚焦式」转场（她 09-21 定，T7④）。
   两块格子轮流坐庄：**旧页不卸载**（同一格子树，只换 class）——它的数据和滚动位置都留着。
   重挂一次要重新读库，会先闪一帧空的，那是闪屏不是转场。
   谁在上面：**现行的那层绝对定位**（绝对定位画在流内内容之上），旧页留在流里，
   所以 DOM 顺序不用管、也**不给任何一层 z-index**——那会开一个新的层叠上下文，
   把弹卡（position:fixed）关进去，可能被底部导航盖住。 */
.rd-tab { height: 100%; }
.rd-tab-top { position: absolute; inset: 0; }
.rd-tab-ghost { position: relative; pointer-events: none; }
.rd-tab-hidden { visibility: hidden; }
.rd-screen {
  position: absolute; inset: 0;
  overflow-y: auto; overscroll-behavior: contain;
  padding: calc(var(--chrome-top, 0px) + 18px) var(--rd-space-4) var(--rd-space-6);
}
.rd-screen::-webkit-scrollbar { width: 0; }
.rd-screen-flush { padding-left: 0; padding-right: 0; }
.rd-screen-tight { padding-top: calc(var(--chrome-top, 0px) + 6px); }

/* ── 页面入场：聚焦式（她 09-21 反馈：点进去没有过渡，退出去才有）────────
   挂在 .rd-screen 上 = **整屏页（他的个人页 / 活动记录 / 书详情）自动有**，不用逐个记得加。
   ⚠️ 但**页签那两层里的页面根不自己播**——那两层本来就在做交叉转场
   （旧页失焦淡出 + 新页聚焦淡入），两边都播就是糊两层。
   ⚠️ 这条抑制**不能写成「转场那 490ms 里 animation:none」**：转场一结束规则失效，
   animation 从 none 变回 keyframes = 浏览器当成一条新动画从头播一遍，
   于是「过渡多出现一次」（她 09-21 报的，就是这么来的）。所以按结构抑制、不随时间变。
   页签里的**内页**（设置子页、书架搜索那种）想要自己那一下，就在根上挂 page-focus-once。
   ⚠️ 动效类不带 fill：播完 filter 自动消失，不留常驻 containing block。
   ⚠️ **同一个组件里 early-return 出来的两个 .rd-screen，React 复用的是同一个 DOM 节点**
   （元素类型和 key 都没变）——不重挂就不重播。所以「页内换页」还得给根上挂 key
   （CharPage 的 key={view} / ReaderSettings 的 key={page}）才会有那一下。 */
.rd-screen { animation: focusIn 340ms cubic-bezier(0.33, 0.7, 0.4, 1); }
.rd-tab .rd-screen { animation: none; }
.rd-tab .rd-screen.page-focus-once { animation: focusIn 340ms cubic-bezier(0.33, 0.7, 0.4, 1); }
@media (prefers-reduced-motion: reduce) {
    .rd-screen, .rd-tab .rd-screen.page-focus-once { animation-duration: 1ms; }
}

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
  padding-bottom: var(--rd-nav-pad);
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
/* 危险动作（删一条记录这种）：描边红字，别做成实心大红——它不是主按钮 */
.rd-btn-danger { background: transparent; border-color: var(--rd-danger); color: var(--rd-danger); }
/* 通栏按钮：字号跟 .rd-btn 一样（15px）——以前是 20px，她 09-16 说「字太巨大了」 */
.rd-btn-block { display: block; width: 100%; text-align: center; padding: var(--rd-space-3); font-size: var(--rd-fs-md); border-radius: var(--rd-r-md); }
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
  /* 底边同样按**可见视口**算（inset:0 会跟着外壳容器一起跑到屏幕底下，见 .rd-reader 那段） */
  position: fixed; top: 0; left: 0; right: 0; height: 100dvh;
  background: var(--rd-scrim); z-index: 60;
  display: flex; align-items: flex-end; animation: rd-fade 160ms ease;
}
.rd-sheet {
  /* 上限取「视口」和「遮罩（= 可视区）」里小的那个：键盘弹起时遮罩矮了，卡也得跟着矮，
     不然卡顶会被顶出屏幕（她 09-21 报的：编辑提示词时只剩顶上三行露在外面） */
  width: 100%; max-height: min(86vh, 100%); overflow-y: auto; overscroll-behavior: contain;
  background: var(--rd-sheet-bg); color: var(--rd-ink);
  border-radius: var(--rd-r-lg) var(--rd-r-lg) 0 0;
  /* 底部安全区：**用「地板」写法**——--safe-bottom 全项目没人赋值（恒 0），
     env() 在 Safari 里也可能是 0，光靠变量救不了。给一个 40px 的底，
     三者取大、不会双算（同 apps/Camera.tsx 的「安全区地板」注释）。
     她 09-16 报的「一起读书面板下面也留个安全区」就是这里。 */
  padding: var(--rd-space-2) var(--rd-space-4)
    max(40px, var(--safe-bottom, 0px), env(safe-area-inset-bottom, 0px));
  animation: rd-rise 220ms cubic-bezier(0.32, 0.72, 0.28, 1);
}
/* 键盘弹起时：① 遮罩底边从「屏幕底」收到「键盘上沿」——不然弹卡下半截被键盘盖住（她 09-21）；
   ② 收掉给 home 条留的那截底隙（键盘已经把那儿盖住了，留着只会把内容往上挤）。
   平时这两条都不生效，遮罩还是她验收过的 100dvh，别动。 */
body.ios-keyboard-open .rd-sheet-mask,
body.ios-keyboard-open .rd-discuss-mask { height: var(--visual-viewport-height, 100dvh); }
body.ios-keyboard-open .rd-sheet,
body.ios-keyboard-open .rd-discuss { padding-bottom: var(--rd-space-4); }
.rd-sheet::-webkit-scrollbar { width: 0; }
/* 目录/搜索那两张高面板：自己不开滚动条，让里面的列表滚（头和三页签钉在上头） */
.rd-sheet-tall { display: flex; flex-direction: column; overflow: hidden; height: min(78vh, 100%); }
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
  /* **钉在可见视口上，不钉外壳容器**（她 09-16 拍的「全都太靠下」）：
     独立模式里外壳容器可能比屏幕高出一截（--app-height 多出来的 +safe 溢出区），
     照容器的底边排版，整套底部控件就会被推到 home 条底下。
     top:0 + height:100dvh = 自己算底边：容器本来对的时候两者重合，容器高了就按屏幕算。 */
  position: fixed; top: 0; left: 0; right: 0; height: 100dvh;
  display: flex; flex-direction: column;
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
  /* 横向手势归阅读器（翻页跟手），纵向留给浏览器（正文本来不滚，这样长按选字不打架） */
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
  position: relative;
  font-size: var(--rd-fs-body); line-height: var(--rd-lh-body);
  margin: 0 0 var(--rd-para-gap);
  text-indent: var(--rd-para-indent);
  white-space: pre-wrap; word-break: break-word;
}
/* 段落侧面色条（她 09-15 定的口径）：这一段里有谁标注/讨论过，左侧就挂一条色柱，
   颜色按参与时间从上往下排；**≥3 人整条墨色**。
   必须用伪元素——.rd-para 里绝不能加真子节点（分页取 firstChild 的文本节点，见 paginate）。
   颜色与分段由 ReaderPage 算好，塞在行内的 --rd-bar 里（一条 linear-gradient 硬分段，不混色）。 */
.rd-para[data-rd-bar]::before {
  content: '';
  position: absolute;
  left: calc(var(--rd-para-bar-x) * -1);
  top: 0.35em; bottom: 0.35em;
  width: var(--rd-para-bar-w);
  border-radius: var(--rd-r-pill);
  background: var(--rd-bar);
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
/* 这条笔记是谁写的（她 09-16：至少得让我知道谁写的）——笔色点 + 名字 + 日期 */
.rd-note-by { display: flex; align-items: center; gap: var(--rd-space-2); color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }
.rd-note-dot { width: 8px; height: 8px; border-radius: var(--rd-r-pill); flex: 0 0 auto; }
.rd-note-quote { color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); line-height: 1.55; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.rd-note-text { font-size: var(--rd-fs-sm); line-height: 1.55; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }

/* ── 笔记库页（她 09-20 文档）：一本书一行 → 展开是这本书的笔记 → 再展开是批注与原文 + 讨论 ── */
.rd-notes-seg { margin-bottom: var(--rd-space-3); }
.rd-filter-row {
  display: flex; align-items: center; gap: var(--rd-space-2); flex-wrap: wrap;
  margin-bottom: var(--rd-space-4);
}
.rd-filter-clear {
  border: 0; background: transparent; color: var(--rd-ink-soft); font-family: inherit;
  font-size: var(--rd-fs-caption); text-decoration: underline; padding: var(--rd-space-1) var(--rd-space-2);
}
/* 一本书一组：组和组之间一条实线，组里第一条笔记不再另加线 */
.rd-nbook + .rd-nbook { border-top: 1px solid var(--rd-rule); }
/* 卡本身不带左右内边距（rd-card-flush），这里自己留出来——两边不许顶到卡边（她 09-20） */
.rd-nbook-head { align-items: flex-start; padding-left: var(--rd-space-4); padding-right: var(--rd-space-4); }
.rd-nbook-head .rd-fold-chev { flex: 0 0 auto; margin-top: var(--rd-space-2); color: var(--rd-ink-soft); }
/* 展开出来的那条笔记：往右缩一格，看得出它属于上面这本书；右边同样留白 */
.rd-nb-wrap { padding: 0 var(--rd-space-4) 0 calc(var(--rd-space-4) * 2); }
.rd-nb-wrap + .rd-nb-wrap { border-top: 1px solid var(--rd-rule-soft); }
.rd-nb-chapter {
  font-size: var(--rd-fs-caption); color: var(--rd-ink-soft); letter-spacing: 0.08em;
  padding: var(--rd-space-3) 0 var(--rd-space-1);
}
.rd-nb {
  display: block; width: 100%; text-align: left; border: 0; background: transparent;
  color: inherit; font-family: inherit; padding: var(--rd-space-3) 0 var(--rd-space-2);
}
.rd-nb-quote { font-size: var(--rd-fs-sm); line-height: 1.65; }
.rd-nb-meta {
  display: flex; align-items: center; gap: var(--rd-space-2);
  margin-top: var(--rd-space-2); color: var(--rd-ink-soft); font-size: var(--rd-fs-caption);
}
.rd-nb-count::before { content: '·'; margin-right: var(--rd-space-2); }
.rd-nb-chev { margin-left: auto; }
.rd-nb-body {
  display: flex; flex-direction: column; gap: var(--rd-space-3);
  background: var(--rd-bg-2); border-radius: var(--rd-r-md);
  padding: var(--rd-space-3) var(--rd-space-3) var(--rd-space-4);
  margin-bottom: var(--rd-space-3);
}
.rd-nb-note {
  /* 批注用**标题那套衬线**，跟下面接话的聊天气泡在字体上分开（她 09-21） */
  font-family: var(--rd-font-heading); font-size: var(--rd-fs-md); line-height: 1.75;
}
.rd-nb-src {
  display: flex; align-items: flex-start; flex-wrap: wrap; gap: var(--rd-space-2) var(--rd-space-3);
  padding-top: var(--rd-space-3); border-top: 1px solid var(--rd-rule-soft);
}
.rd-nb-goto {
  flex: 0 0 auto; display: inline-flex; align-items: center; gap: 2px;
  border: 0; background: transparent; color: var(--rd-accent);
  font-family: inherit; font-size: var(--rd-fs-caption); padding: 0;
}
.rd-nb-thread {
  display: flex; flex-direction: column; gap: var(--rd-space-3);
  padding-top: var(--rd-space-3); border-top: 1px solid var(--rd-rule-soft);
}
.rd-nb-msg { display: flex; flex-direction: column; gap: var(--rd-space-1); }
.rd-nb-msg-me { align-items: flex-end; text-align: right; }
.rd-nb-msg-head { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); font-family: var(--rd-font-ui); }
.rd-nb-msg-text { font-size: var(--rd-fs-sm); line-height: 1.75; font-family: var(--rd-font-ui); }

/* 阅读风格（气质 / 偏好）那两段正文 */
.rd-style-text { font-size: var(--rd-fs-sm); line-height: 1.75; white-space: pre-wrap; }
/* 书库页：点名字看他的阅读风格（那行原本只有开关） */
.rd-lib-name {
  border: 0; background: transparent; color: inherit; font-family: inherit;
  text-align: left; padding: 0; display: flex; flex-direction: column; gap: 2px;
}

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
  bottom: calc(var(--rd-nav-h) + var(--rd-nav-pad) + var(--rd-space-4));
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
/* 线条类型（她点的四种：下划线 / 波浪线 / 一半 / 完整）。
   线条类的颜色走 currentColor（行内色），「一半」是一条 50% 的渐变，都在下面 */
.rd-hl-rect-line { background: none; }
.rd-hl-rect-underline { background: none; border-bottom: 2px solid currentColor; }
/* 波浪线：两个斜渐变叠出来的「交叉网」是错的（看图一眼就看出来）。
   改成一条正弦遮罩 + currentColor 铺色——遮罩本身不带颜色，颜色还是这一条的笔色 */
.rd-hl-rect-wavy {
  background-image: none;
  background-color: currentColor;
  -webkit-mask-image: var(--rd-wave);
  mask-image: var(--rd-wave);
  -webkit-mask-repeat: repeat-x;
  mask-repeat: repeat-x;
  -webkit-mask-position: bottom left;
  mask-position: bottom left;
  -webkit-mask-size: var(--rd-wave-size);
  mask-size: var(--rd-wave-size);
}
.rd-hl-rect-tap { outline: 1px solid var(--rd-accent); outline-offset: 1px; }

/* ── 点中一条划线的工具条（她 09-16：回到深色六图标那版；「我的颜色」那格换成划线图标，
   点它展开一条颜色排——改的是**这一条**的颜色，跟 Edit Note 那张参考图一个意思） ── */
.rd-bar-wrap {
  position: fixed; z-index: 62; transform: translate(-50%, -100%);
  display: flex; flex-direction: column; align-items: center; gap: var(--rd-space-2);
}
.rd-bar-tb {
  position: relative; display: flex; align-items: stretch; gap: 2px;
  padding: var(--rd-space-2);
  border-radius: var(--rd-r-md);
  background: var(--rd-toolbar-bg); color: var(--rd-toolbar-ink);
  box-shadow: var(--rd-shadow);
}
/* 底下那个小三角：指着被点中的那條线 */
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
/* 颜色排 + 线条类型（点划线图标展开的那一条）：左边三个 A 是画法，右边是颜色 */
.rd-bar-tb-styles {
  display: flex; align-items: center; gap: var(--rd-space-1);
  border-right: 1px solid var(--rd-toolbar-ink); padding-right: var(--rd-space-3);
}
.rd-bar-tb-type {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; flex: 0 0 auto;
  border: 0; border-radius: var(--rd-r-sm);
  background: transparent; color: var(--rd-toolbar-ink);
}
/* 那四个 A：下划线 / 波浪线 / 一半（下半块填色）/ 完整（整块填色） */
.rd-type-glyph {
  display: flex; align-items: flex-end; justify-content: center;
  width: 20px; height: 20px; border-radius: var(--rd-r-sm);
  font-family: var(--rd-font-body); font-size: var(--rd-fs-sm); font-weight: 600; line-height: 1.1;
}
.rd-type-underline { border-bottom: 2px solid currentColor; }
.rd-type-wavy {
  background-image: none;
  background-color: currentColor;
  -webkit-mask-image: var(--rd-wave);
  mask-image: var(--rd-wave);
  -webkit-mask-repeat: repeat-x;
  mask-repeat: repeat-x;
  -webkit-mask-position: bottom left;
  mask-position: bottom left;
  -webkit-mask-size: var(--rd-wave-size);
  mask-size: var(--rd-wave-size);
}
.rd-type-half { background-image: linear-gradient(to bottom, transparent 50%, currentColor 50%); }
.rd-type-full { background: currentColor; color: var(--rd-toolbar-bg); }
.rd-bar-tb-type-on { background: var(--rd-toolbar-ink); color: var(--rd-toolbar-bg); }
.rd-bar-tb-colors {
  display: flex; align-items: center; gap: var(--rd-space-3);
  padding: var(--rd-space-2) var(--rd-space-3);
  border-radius: var(--rd-r-pill);
  background: var(--rd-toolbar-bg); box-shadow: var(--rd-shadow);
}
/* 这条的颜色：一个小取色框（她 09-16 要的调色台调法，替掉了原来那排固定色卡） */
.rd-bar-tb-pick {
  display: flex; align-items: center; gap: var(--rd-space-2);
  color: var(--rd-toolbar-ink); font-size: var(--rd-fs-caption); flex: 0 0 auto;
}
.rd-bar-tb-pick .rd-color-in { border-color: var(--rd-toolbar-ink); background: transparent; }

.rd-notepanel {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 70;
  display: flex; flex-direction: column; gap: var(--rd-space-3);
  height: 72vh; padding: var(--rd-space-4);
  padding-bottom: calc(var(--rd-space-4) + max(var(--safe-bottom, 0px), env(safe-area-inset-bottom, 0px)));
  border-radius: var(--rd-r-lg) var(--rd-r-lg) 0 0;
  background: var(--rd-sheet-bg); color: var(--rd-ink);
  box-shadow: var(--rd-shadow);
}
.rd-notepanel-head { display: flex; align-items: center; justify-content: space-between; }
.rd-notepanel-title { font-family: var(--rd-font-body); font-size: var(--rd-fs-md); font-weight: 600; }
.rd-notepanel-btn { border: 0; background: transparent; color: var(--rd-accent); font-family: var(--rd-font-body); font-size: var(--rd-fs-md); padding: var(--rd-space-1); }
.rd-notepanel-save { font-weight: 600; }
.rd-notepanel-quote {
  flex: 0 0 auto; max-height: 32%; overflow-y: auto;
  padding: var(--rd-space-3); border-radius: var(--rd-r-md);
  background: var(--rd-rule-soft); color: var(--rd-ink-soft);
  font-family: var(--rd-font-body); font-size: var(--rd-fs-sm); line-height: 1.6;
}
.rd-notepanel-area {
  flex: 1 1 auto; min-height: 0; resize: none;
  padding: var(--rd-space-3); border: 1px solid var(--rd-rule); border-radius: var(--rd-r-md);
  background: var(--rd-card); color: var(--rd-ink);
  font-family: var(--rd-font-body); font-size: var(--rd-fs-md); line-height: 1.7;
}

/* ── 一起读书（共读面板）────────────────────────────────────── */
/* 选角色那一排胶囊（只列开了读书开关的角色） */
.rd-char-row { display: flex; flex-wrap: wrap; gap: var(--rd-space-2); }
/* 面板里的多行输入（摘要规则）：比 .rd-field 高一些，能拖 */
.rd-field-area {
  min-height: 84px; resize: vertical; line-height: 1.6;
  font-size: var(--rd-fs-sm); border-radius: var(--rd-r-md);
}
/* 共读中那张状态卡：他读到哪 + 你这一页在哪 */
.rd-coread-card {
  padding: var(--rd-space-3) var(--rd-space-4); border-radius: var(--rd-r-md);
  background: var(--rd-rule-soft);
  /* 上下都留气：她 09-16 说「有些都贴在一起了」——上头那枚「‹ 换一个」、下面那行设置标题 */
  margin: var(--rd-space-3) 0 var(--rd-space-4);
}
.rd-coread-name { font-family: var(--rd-font-heading); font-size: var(--rd-fs-lg); margin-bottom: var(--rd-space-1); }
.rd-coread-recent { margin-top: var(--rd-space-4); }
.rd-coread-act {
  padding: var(--rd-space-3); border-radius: var(--rd-r-md);
  background: var(--rd-card); box-shadow: var(--rd-shadow-sm);
  font-size: var(--rd-fs-sm); line-height: 1.6; margin-bottom: var(--rd-space-2);
}

/* 「最近读到的」时间线（她 09-20：加时间线、配时间戳；回复记录也显示在上面） */
.rd-tl { position: relative; margin-top: var(--rd-space-3); padding-left: var(--rd-space-5); }
.rd-tl::before {
  content: ''; position: absolute; left: 5px; top: var(--rd-space-1); bottom: var(--rd-space-1);
  width: 1px; background: var(--rd-rule);
}
.rd-tl-item { position: relative; padding-bottom: var(--rd-space-5); }
.rd-tl-item:last-child { padding-bottom: 0; }
.rd-tl-dot {
  position: absolute; left: calc(var(--rd-space-5) * -1 + 1px); top: 6px;
  width: 9px; height: 9px; border-radius: var(--rd-r-pill);
  box-shadow: 0 0 0 3px var(--rd-sheet-bg);
}
.rd-tl-head { display: flex; align-items: baseline; gap: var(--rd-space-2); }
.rd-tl-who { font-size: var(--rd-fs-sm); font-weight: 600; }
.rd-tl-time { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); font-variant-numeric: tabular-nums; }
.rd-tl-text { font-size: var(--rd-fs-sm); line-height: 1.6; margin-top: var(--rd-space-1); }
.rd-tl-ex { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); line-height: 1.6; margin-top: var(--rd-space-1); }
/* 他顺手回的话：分行列出来，和「做了什么」区分开 */
.rd-tl-reply {
  margin-top: var(--rd-space-2); padding-left: var(--rd-space-3);
  border-left: 2px solid var(--rd-rule); font-size: var(--rd-fs-sm); line-height: 1.6;
}
.rd-tl-meta { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); margin-top: var(--rd-space-2); }
/* 内心活动：一行小字，斜一点，和「做了什么」分开 */
.rd-coread-feel {
  margin-top: var(--rd-space-1); padding-left: var(--rd-space-3);
  border-left: 2px solid var(--rd-rule);
  color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); font-style: italic;
}
/* 活动记录底下那行 token 账（读进去 / 吐出来是分开的） */
.rd-coread-tok {
  margin-top: var(--rd-space-2); padding-top: var(--rd-space-2);
  border-top: 1px dashed var(--rd-rule);
  color: var(--rd-ink-soft); font-size: var(--rd-fs-tab);
}
.rd-coread-tok-in { color: var(--rd-accent); }
.rd-coread-tok-out { color: var(--rd-ink-soft); }

/* 三个 API 输入竖排 */
.rd-api-form { display: flex; flex-direction: column; gap: var(--rd-space-2); margin-top: var(--rd-space-2); }
/* 共读中：顶栏那枚图标换成角色的头像 */
.rd-coread-avatar-img { width: 26px; height: 26px; border-radius: var(--rd-r-pill); object-fit: cover; }
/* 两个人以上：两个头像叠着，第二个蒙一层半透明、上面写人数（她 09-20 给的样子） */
.rd-coread-stack { width: auto; gap: var(--rd-space-1); padding: 0 2px; }
.rd-coread-stack-face { width: 24px; height: 24px; border-radius: var(--rd-r-pill); object-fit: cover; }
.rd-coread-stack-second { position: relative; display: inline-flex; }
.rd-coread-stack-second::after {
  content: ''; position: absolute; inset: 0;
  border-radius: var(--rd-r-pill); background: var(--rd-scrim);
}
.rd-coread-stack-count {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  /* 蒙版是 ::after，画在子节点上面——人数得抬一层才看得见（踩过：数字整个被盖住） */
  z-index: 1;
  color: var(--rd-on-scrim);
  font-size: var(--rd-fs-caption); font-variant-numeric: tabular-nums;
}
/* 「‹ 换一个」那种返回小按钮 */
.rd-coread-back { align-self: flex-start; padding: var(--rd-space-1) var(--rd-space-2); }

/* ── 共读面板（09-20 按她的三份文档重写）──────────────────────────────────
   版面：面板头 → 三步向导（邀请 / 规则 / 确认设置）或 信息页 + 设置 → 底部动作。
   间距一条原则：**分组之间大（space-5/6）、组内小（space-2/3）**，
   线和字之间永远隔开——她连着两次说「文字和线条都贴上了」。 */
/* 这张卡里全是分组卡片，左右比别的弹卡多给一口气 */
.rd-sheet-coread { padding-left: var(--rd-space-5); padding-right: var(--rd-space-5); }
.rd-sheet-coread .rd-empty { padding: var(--rd-space-6) var(--rd-space-3); }
/* 名单下面接别的东西时留一口气（不然那块像贴在最后一行上） */
.rd-sheet-coread .rd-list { margin-bottom: var(--rd-space-4); }
.rd-sheet-coread .rd-list .rd-item + .rd-item { border-top: 1px solid var(--rd-rule); }
.rd-coread-head { margin-bottom: var(--rd-space-5); }
.rd-coread-title {
  display: flex; align-items: center; gap: var(--rd-space-2);
  font-family: var(--rd-font-heading); font-size: var(--rd-fs-lg); line-height: 1.3;
}
.rd-coread-book { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); margin-top: var(--rd-space-1); }
/* 底部动作区：主按钮 + 次按钮 + 一行小字说明（主按钮只有这一个） */
.rd-coread-actions,
.rd-actions { display: flex; flex-direction: column; gap: var(--rd-space-3); margin-top: var(--rd-space-6); }
.rd-coread-actions .rd-muted,
.rd-actions .rd-muted { margin-top: var(--rd-space-1); }

/* 向导里每一步的标题（衬线，和正文拉开层级） */
.rd-step-title {
  font-family: var(--rd-font-heading); font-size: var(--rd-fs-lg); line-height: 1.35;
  margin-bottom: var(--rd-space-4);
}

/* 邀请名单：一行一个人，点一下选中（勾在行尾，没选时是一枚淡圈——看得出能多选） */
.rd-item-tap { cursor: pointer; }
.rd-item-on { color: var(--rd-accent); }
.rd-list .rd-item { border-radius: var(--rd-r-sm); }
.rd-sheet-coread .rd-item-label { flex: 1 1 auto; min-width: 0; }
.rd-item-tick { flex: 0 0 auto; display: inline-flex; color: var(--rd-ink-soft); opacity: 0.5; }
.rd-item-tick-on { color: var(--rd-accent); opacity: 1; }

/* 规则三选一：竖排三张卡，选中的那张有勾 */
.rd-rules { display: flex; flex-direction: column; gap: var(--rd-space-3); }
.rd-rule {
  position: relative; display: flex; flex-direction: column; gap: var(--rd-space-1);
  width: 100%; text-align: left; cursor: pointer;
  padding: var(--rd-space-4); border: 1px solid var(--rd-rule);
  border-radius: var(--rd-r-md); background: var(--rd-card); color: var(--rd-ink);
  font-family: var(--rd-font-body);
}
.rd-rule-on { border-color: var(--rd-accent); background: var(--rd-accent-soft); }
.rd-rule-name { font-size: var(--rd-fs-md); }
.rd-rule-desc { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); line-height: 1.6; }
.rd-rule-tick { position: absolute; top: var(--rd-space-4); right: var(--rd-space-4); color: var(--rd-accent); }
/* 自定义那块：跟着选中的卡展开，左边留一道竖线做归属 */
.rd-rule-body {
  display: flex; flex-direction: column; gap: var(--rd-space-3);
  margin-top: var(--rd-space-3); padding: var(--rd-space-4);
  border-left: 2px solid var(--rd-accent-soft);
  background: var(--rd-rule-soft); border-radius: var(--rd-r-sm);
}

/* 确认设置里每个人一行：折叠只显示预设名，点开才是可改的表 */
.rd-member {
  border: 1px solid var(--rd-rule); border-radius: var(--rd-r-md);
  background: var(--rd-card); overflow: hidden;
}
.rd-member + .rd-member { margin-top: var(--rd-space-3); }
.rd-member-head {
  display: flex; align-items: baseline; gap: var(--rd-space-3); width: 100%;
  padding: var(--rd-space-4); border: 0; background: transparent; color: var(--rd-ink);
  font-family: var(--rd-font-body); text-align: left;
}
.rd-member-name { flex: 0 0 auto; font-size: var(--rd-fs-md); }
.rd-member-sum {
  flex: 1 1 auto; min-width: 0; color: var(--rd-ink-soft); font-size: var(--rd-fs-caption);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rd-member-body {
  display: flex; flex-direction: column; gap: var(--rd-space-3);
  padding: var(--rd-space-1) var(--rd-space-4) var(--rd-space-5);
}
/* 表里每组之间用一条虚线分开，线上下都留气 */
.rd-member-body .rd-row-label { margin-top: var(--rd-space-3); }
.rd-member-body > .rd-row-label:first-child { margin-top: 0; }

/* 共读中每个人的状态卡 */
.rd-status {
  display: flex; flex-direction: column; gap: var(--rd-space-1);
  padding: var(--rd-space-4); border-radius: var(--rd-r-md);
  background: var(--rd-rule-soft);
}
.rd-status + .rd-status { margin-top: var(--rd-space-3); }
.rd-status-name { font-family: var(--rd-font-heading); font-size: var(--rd-fs-lg); line-height: 1.3; }
.rd-status-line { color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); line-height: 1.6; }

/* 竖排数字输入那一行（页数 a-b / 笔记上限） */
.rd-field-row { display: flex; align-items: center; gap: var(--rd-space-2); flex-wrap: wrap; }
.rd-field-num { width: 68px; text-align: center; }

/* 折叠块（共读设置）：一行当前值，点开才是详情——「叠起来，别都摊在表面上」 */
.rd-fold {
  border: 1px solid var(--rd-rule); border-radius: var(--rd-r-md);
  background: var(--rd-card); overflow: hidden; margin-top: var(--rd-space-5);
}
/* 折叠块里那几行彼此的间距：线在上一行的下面，两边都留够 */
.rd-fold-row + .rd-fold-row {
  border-top: 1px solid var(--rd-rule);
  margin-top: var(--rd-space-5); padding-top: var(--rd-space-5);
}
.rd-fold-open { background: var(--rd-card); }
.rd-fold-head {
  display: flex; align-items: center; gap: var(--rd-space-2); width: 100%;
  padding: var(--rd-space-4);
  border: 0; background: transparent; color: var(--rd-ink);
  font-family: var(--rd-font-body); font-size: var(--rd-fs-md); text-align: left;
}
.rd-fold-label { flex: 0 0 auto; }
.rd-fold-value {
  flex: 1 1 auto; min-width: 0; text-align: right; color: var(--rd-ink-soft);
  font-size: var(--rd-fs-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rd-fold-chev { flex: 0 0 auto; color: var(--rd-ink-soft); transition: transform 160ms ease; }
.rd-fold-chev-on { transform: rotate(180deg); }
/* 提示词那一版折叠头：标题一行、说明两行截断（说明比较长，横着塞不下） */
.rd-prompt-head { flex-direction: column; align-items: stretch; gap: var(--rd-space-1); }
.rd-prompt-top { display: flex; align-items: center; justify-content: space-between; gap: var(--rd-space-2); }
.rd-prompt-desc {
  text-align: left; color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); line-height: 1.5;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
/* 折叠行标题上的小标（提示词管理里标「已改过」） */
.rd-fold-badge {
  margin-left: var(--rd-space-2); padding: 1px var(--rd-space-2);
  border-radius: var(--rd-r-pill); background: var(--rd-accent-soft); color: var(--rd-accent);
  font-size: var(--rd-fs-tab);
}
.rd-fold-open .rd-fold-chev { transform: rotate(180deg); }
.rd-fold-body {
  display: flex; flex-direction: column; gap: var(--rd-space-3);
  padding: var(--rd-space-1) var(--rd-space-4) var(--rd-space-5);
}
.rd-fold-row { display: flex; flex-direction: column; gap: var(--rd-space-2); }
/* 第一行贴着折叠头，得自己补一口气 */
.rd-fold-body > .rd-fold-row:first-child { margin-top: var(--rd-space-3); }
/* 开关那一行：标签和开关排同一行（开关掉到标签底下读着像两个东西）。
   它自己带 display: flex——以前这条只写了方向，靠外面那层给 display（皮肤卡里是这么用的），
   单独用（角色设置页）就退回块级，开关被挤到第二行去了。 */
.rd-switch-row { display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; gap: var(--rd-space-2) var(--rd-space-3); }
.rd-switch-row > .rd-row-label { flex: 1 1 auto; }
.rd-switch-row > .rd-muted { flex: 1 1 100%; }

/* ── 后台任务的状态胶囊（全局悬浮：书房哪一页都看得见）────────────────── */
.rd-jobpill {
  position: fixed; z-index: 95;
  top: calc(var(--safe-top, 0px) + var(--rd-space-3));
  left: 0; right: 0;
  display: flex; flex-direction: column; align-items: center; gap: var(--rd-space-2);
  padding: 0 var(--rd-space-4); pointer-events: none;
}
.rd-jobpill-item {
  display: inline-flex; align-items: center; gap: var(--rd-space-2);
  max-width: 100%;
  padding: var(--rd-space-2) var(--rd-space-4);
  border-radius: var(--rd-r-pill);
  background: var(--rd-card); color: var(--rd-ink);
  box-shadow: var(--rd-shadow); font-size: var(--rd-fs-sm);
  animation: rd-fade 160ms ease;
}
.rd-jobpill-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rd-jobpill-ok { color: var(--rd-accent); }
.rd-jobpill-error { color: var(--rd-danger, var(--rd-accent)); }
.rd-jobpill-ico { flex: 0 0 auto; }
/* 转圈：拿边框画一个环，颜色继承文字色（骨架里不写死色号，守卫测试盯着） */
.rd-jobpill-spin {
  width: 14px; height: 14px; flex: 0 0 auto; border-radius: var(--rd-r-pill);
  border: 2px solid var(--rd-rule); border-top-color: var(--rd-accent);
  animation: rd-spin 720ms linear infinite;
}
@keyframes rd-spin { to { transform: rotate(360deg) } }

/* 原生取色框（调色台那套：点开系统色轮随便调，颜色是运行时值、不写死色号） */
.rd-color-in {
  width: 30px; height: 30px; padding: 0; flex: 0 0 auto; cursor: pointer;
  border: 1px solid var(--rd-rule); border-radius: var(--rd-r-sm);
  background: var(--rd-card);
}
.rd-color-in::-webkit-color-swatch-wrapper { padding: 2px; }
.rd-color-in::-webkit-color-swatch { border: none; border-radius: var(--rd-r-sm); }
/* 设置行右边那组「预览 + 取色框」 */
.rd-row-pick { display: flex; align-items: center; gap: var(--rd-space-3); flex: 0 0 auto; }

/* ── 讨论面板（长按划线拉起来的那张卡；**不是整屏**）───────────── */
/* 遮罩：点面板外面就收起来（她问「这个面板怎么关」——三种关法都留着） */
.rd-discuss-mask {
  /* 底边按可见视口算，同上 */
  position: fixed; top: 0; left: 0; right: 0; height: 100dvh; z-index: 72;
  display: flex; align-items: flex-end;
  animation: rd-fade 160ms ease;
}
.rd-discuss {
  width: 100%;
  display: flex; flex-direction: column; gap: var(--rd-space-5);
  /* **固定高度**（她 09-16）：批注长短不一时面板不许自己长高长矮，里面的流水自己滚。
     72dvh 和笔记面板一个手感——够呼吸，又不是整屏。 */
  height: min(72dvh, 100%);
  padding: var(--rd-space-2) var(--rd-space-5);
  /* 底部多留一截：最下面那行提示不该钻进手机的 home 条 / Safari 底栏里。
     地板写法同上——三值取大，不双算。 */
  padding-bottom: max(40px, var(--safe-bottom, 0px), env(safe-area-inset-bottom, 0px));
  border-radius: var(--rd-r-lg) var(--rd-r-lg) 0 0;
  background: var(--rd-sheet-bg); color: var(--rd-ink);
  box-shadow: var(--rd-shadow);
  animation: rd-rise 200ms cubic-bezier(0.32, 0.72, 0.28, 1);
}
/* 顶上那行：横杠居中（右上角那个 ✕ 她 09-16 让删了，关面板点横杠或点外面） */
.rd-discuss-head { position: relative; display: flex; align-items: center; justify-content: center; }
.rd-discuss-grip {
  width: 38px; height: 4px; border-radius: var(--rd-r-pill);
  background: var(--rd-rule); cursor: pointer;
}
/* 顶部：原文摘录 + 两侧箭头（同一句被多人标注时才出箭头） */
.rd-discuss-quote-row { display: flex; align-items: center; gap: var(--rd-space-2); }
.rd-discuss-quote {
  flex: 1 1 auto; min-width: 0;
  font-family: var(--rd-font-heading); font-size: var(--rd-fs-md); line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.rd-discuss-arrow {
  flex: 0 0 auto; border: 0; background: transparent; color: var(--rd-ink-soft);
  padding: var(--rd-space-1); border-radius: var(--rd-r-pill);
}
.rd-discuss-count { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); text-align: center; }
/* 当前这个人的批注 */
.rd-discuss-note {
  padding: var(--rd-space-3); border-radius: var(--rd-r-md);
  background: var(--rd-rule-soft);
}
.rd-discuss-who { display: flex; align-items: center; gap: var(--rd-space-2); margin-bottom: var(--rd-space-1); }
.rd-discuss-pen { flex: 0 0 auto; width: 3px; height: 15px; border-radius: var(--rd-r-pill); }
.rd-discuss-name { font-size: var(--rd-fs-sm); }
.rd-discuss-time { margin-left: auto; color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }
.rd-discuss-text { font-size: var(--rd-fs-md); line-height: 1.6; }
.rd-discuss-editable { cursor: pointer; }
.rd-discuss-empty { color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); }
.rd-discuss-hint { margin-top: var(--rd-space-1); color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }
/* 讨论流水（时间顺序，每条带作者的笔色）。
   面板高度是固定的（见 .rd-discuss），所以这里只管把剩下的空间全吃掉、自己滚——
   批注卡和输入框之间自然留着一大截（她 09-15 报的挤、09-16 要的固定高度）。 */
.rd-discuss-list {
  flex: 1 1 auto; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--rd-space-4);
  padding-top: var(--rd-space-2);
}
.rd-discuss-msg { display: flex; gap: var(--rd-space-2); }
.rd-discuss-msg-me { flex-direction: row-reverse; }
.rd-discuss-msg-body { min-width: 0; flex: 1 1 auto; }
.rd-discuss-msg-me .rd-discuss-msg-body { text-align: right; }
.rd-discuss-msg-head { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); margin-bottom: 2px; }
.rd-discuss-msg-text { font-size: var(--rd-fs-md); line-height: 1.6; white-space: pre-wrap; }
/* 输入 + 发送 + ⚡：上面一条分隔线，像聊天框的输入行 */
.rd-discuss-input-row {
  display: flex; align-items: center; gap: var(--rd-space-2);
  margin-top: var(--rd-space-3);
  padding-top: var(--rd-space-4);
  border-top: 1px solid var(--rd-rule);
}
.rd-discuss-input-row .rd-field { flex: 1 1 auto; border-radius: var(--rd-r-pill); }
.rd-discuss-send, .rd-discuss-bolt {
  flex: 0 0 auto; border: 0; width: 36px; height: 36px; border-radius: var(--rd-r-pill);
  display: flex; align-items: center; justify-content: center;
}
.rd-discuss-send { background: var(--rd-accent); color: var(--rd-on-accent); }
.rd-discuss-bolt { background: var(--rd-accent-soft); color: var(--rd-accent); }
.rd-discuss-send:disabled, .rd-discuss-bolt:disabled { opacity: 0.4; }
.rd-discuss-foot { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); line-height: 1.5; }

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
  bottom: calc(var(--rd-nav-h) + var(--rd-nav-pad) + var(--rd-space-3));
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
.rd-row-ico-5 { filter: hue-rotate(200deg); }

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

/* ── 划线设置那张卡（T7① 重写：跟书房其它弹卡同一套语言）──────────────
   「我的笔」= 一张卡：左边大色点 + 色号，右边是取色窗（原生 input[type=color] 就长
   一个方块，只给它统一几何）。下面「存下来的颜色」用 .rd-pen-swatches 排，
   不再借 .rd-hunt-hist 那个收集页的类。 */
.rd-pen-card { display: flex; align-items: center; gap: var(--rd-space-4); }
.rd-pen-dot {
  width: 46px; height: 46px; flex: 0 0 auto;
  border-radius: var(--rd-r-pill); box-shadow: var(--rd-shadow-sm);
}
.rd-pen-info { flex: 1 1 auto; min-width: 0; }
.rd-pen-hex { font-family: var(--rd-font-heading); font-size: var(--rd-fs-lg); line-height: 1.4; }
/* 「我的笔」里那个取色窗：比设置行里那枚大一档，跟左边色点等高 */
.rd-pen-pick .rd-color-in { width: 46px; height: 46px; border-radius: var(--rd-r-md); }
.rd-pen-swatches { display: flex; flex-wrap: wrap; gap: var(--rd-space-3); }
.rd-pen-row { display: flex; align-items: center; gap: var(--rd-space-3); }
.rd-pen-mini {
  width: 18px; height: 18px; flex: 0 0 auto;
  border-radius: var(--rd-r-pill); box-shadow: var(--rd-shadow-sm);
}
/* 还没挑笔的人：画一个空心圈，别拿默认色冒充满上（截图里两个「还没挑」旁边顶着
   一绿一蓝两个实心点，看着像他真有那支笔） */
.rd-pen-mini-none { background: transparent; box-shadow: inset 0 0 0 1px var(--rd-rule); }

/* ── 自定义 CSS 面板（T7② 重写）──────────────────────────────────
   ① 层的顺序用三枚小胶囊讲清楚（骨架 → 皮肤 → 你写的），比一段散文好读；
   ② 「可用的名字」是可点的清单——原来那句「类名见骨架层注释」她根本看不见注释。 */
.rd-css-layers { display: flex; align-items: center; gap: var(--rd-space-2); flex-wrap: wrap; }
.rd-css-layer {
  padding: var(--rd-space-1) var(--rd-space-3);
  border-radius: var(--rd-r-pill);
  background: var(--rd-bg-2); color: var(--rd-ink-soft);
  font-size: var(--rd-fs-caption);
}
.rd-css-layer-me { background: var(--rd-chip-on-bg); color: var(--rd-chip-on-ink); }
.rd-css-sep { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }
.rd-css-ref { display: flex; flex-direction: column; }
.rd-css-ref-row {
  display: flex; align-items: baseline; gap: var(--rd-space-3);
  width: 100%; text-align: left; border: 0; background: transparent; color: inherit;
  padding: var(--rd-space-2) 0; font-family: inherit;
}
.rd-css-ref-row + .rd-css-ref-row { border-top: 1px solid var(--rd-rule-soft); }
.rd-css-ref-row:active { background: var(--rd-bg-2); }
.rd-css-ref-name { font-family: var(--rd-font-heading); font-size: var(--rd-fs-sm); flex: 0 0 auto; min-width: 116px; }
.rd-css-ref-what { color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); flex: 1 1 auto; min-width: 0; }

/* ── 小圆圈问号（她 09-21：解释全收进这儿）────────────────────────────
   界面上不再写解释性的散文和括号；一枚小问号，点一下在原地展开。
   展开那块 flex: 1 1 100% = 在 flex 行里自己换到下一行（标题旁边也能用）。 */
.rd-help {
  width: 18px; height: 18px; flex: 0 0 auto; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--rd-rule); border-radius: var(--rd-r-pill);
  background: transparent; color: var(--rd-ink-soft);
  align-self: center;
}
.rd-help-on { background: var(--rd-accent-soft); border-color: transparent; color: var(--rd-accent); }
.rd-help-body {
  flex: 1 1 100%; min-width: 0; margin-top: var(--rd-space-2);
  padding: var(--rd-space-3); border-radius: var(--rd-r-md);
  background: var(--rd-bg-2); color: var(--rd-ink-soft);
  font-family: var(--rd-font-body); font-size: var(--rd-fs-sm); line-height: 1.7;
}
/* 标题 + 右边那枚问号（放在 .rd-sheet-title 上，标题就不会被问号顶成两行） */
.rd-title-row { display: flex; align-items: center; gap: var(--rd-space-2); flex-wrap: wrap; }
/* 段与段之间空一行（问号里的说明常常是好几条） */
.rd-help-body p { margin: 0 0 var(--rd-space-2); }
.rd-help-body p:last-child { margin-bottom: 0; }
.rd-hunt-chip {
  border: 0; border-radius: var(--rd-r-pill); background: var(--rd-card);
  color: var(--rd-ink); font-family: inherit; font-size: var(--rd-fs-sm);
  padding: 6px var(--rd-space-4); box-shadow: var(--rd-shadow-sm);
}
/* 从搜索结果跳过去的那一条：回到列表时有选中态 */
.rd-toc-row-on { background: var(--rd-accent-soft); border-radius: var(--rd-r-md); }
.rd-toc-row-on .rd-toc-row-head span:first-child { color: var(--rd-accent); font-weight: 600; }

/* ── 角色个人页（她 09-20 的 T4；**09-21 照微信读书的排版爆改**）────────
   主页只放「能看出他是个什么样的人」的东西；设置项全在右上角齿轮那一页。 */
/* 卡里自己排版的行（书架行、笔记行）用它补左右留白，字和封面别顶到卡边（她 09-21 的贴边） */
.rd-row-pad { padding-left: var(--rd-space-4); padding-right: var(--rd-space-4); }
/* 页头右端那颗齿轮（.rd-headbar 没有标题时没人顶它） */
.rd-headbar-end { margin-left: auto; }

/* 头部：大圆头像 + 名字 + 小胶囊，全居中 */
.rd-cp-hero { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--rd-space-2); padding: var(--rd-space-2) 0 var(--rd-space-4); }
.rd-cp-face {
  width: 88px; aspect-ratio: 1 / 1; border-radius: var(--rd-r-pill); overflow: hidden;
  background: var(--rd-bg-2); box-shadow: var(--rd-shadow-sm);
  display: flex; align-items: center; justify-content: center;
}
.rd-cp-face img { width: 100%; height: 100%; object-fit: cover; display: block; }
.rd-cp-face-ph { font-family: var(--rd-font-heading); font-size: var(--rd-fs-hero); color: var(--rd-ink-soft); }
.rd-cp-name { font-family: var(--rd-font-heading); font-size: var(--rd-fs-hero); line-height: 1.3; color: var(--rd-accent); }
.rd-cp-tags { display: flex; align-items: center; justify-content: center; gap: var(--rd-space-2); }
.rd-cp-tag {
  border: 1px solid var(--rd-rule); border-radius: var(--rd-r-pill);
  padding: 3px var(--rd-space-3); background: var(--rd-card);
  color: var(--rd-ink-soft); font-size: var(--rd-fs-caption);
}
/* 最近一次的状态（两行小字，点开是详细状态与活动记录） */
.rd-cp-state {
  margin-top: var(--rd-space-2); display: flex; flex-direction: column; gap: 2px;
  align-items: center; width: 100%; padding: 0 var(--rd-space-2);
  border: 0; background: transparent; color: inherit; font-family: inherit; text-align: center;
}
.rd-cp-state:active { opacity: 0.7; }
.rd-cp-state-line { color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); line-height: 1.6; }

/* 三格数字（中间竖线分开） */
.rd-cp-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: var(--rd-space-4) 0; }
.rd-cp-stat {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: var(--rd-space-2) 0; border: 0; background: transparent; color: inherit; font-family: inherit;
}
.rd-cp-stat + .rd-cp-stat { border-left: 1px solid var(--rd-rule); }
.rd-cp-stat:active { opacity: 0.7; }
.rd-cp-stat-num { font-family: var(--rd-font-heading); font-size: var(--rd-fs-title); line-height: 1.2; }
.rd-cp-stat-cap { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }

/* 整条那个开关（参考图里的「关注 / 已关注」）——
   **两种状态的差别在底色**：没开 = 实心主色 + 反白字（像「关注」）；
   开了 = 灰底 + 次要字（像「已关注」）。压一层 active 让它有按下去的手感。 */
.rd-cp-follow {
  display: block; width: 100%; text-align: center;
  padding: var(--rd-space-3); border: 0; border-radius: var(--rd-r-md);
  background: var(--rd-accent); color: var(--rd-on-accent);
  font-family: var(--rd-font-body); font-size: var(--rd-fs-md); font-weight: 600;
}
.rd-cp-follow:active { opacity: 0.82; }
.rd-cp-follow-on {
  background: var(--rd-bg-2); color: var(--rd-ink-soft); font-weight: 400;
}

/* 书架卡：三栏 + 横着划的封面 + 查看书架 */
.rd-cp-card { margin-top: var(--rd-space-4); padding: var(--rd-space-4); background: var(--rd-card); border-radius: var(--rd-r-lg); box-shadow: var(--rd-shadow-sm); }
.rd-cp-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-bottom: var(--rd-space-4); }
.rd-cp-tab {
  position: relative; border: 0; background: transparent; color: var(--rd-ink-soft);
  font-family: inherit; font-size: var(--rd-fs-sm); padding: var(--rd-space-2) 0;
}
.rd-cp-tab-on { color: var(--rd-accent); font-weight: 600; }
.rd-cp-tab-on::after {
  content: ''; position: absolute; left: 50%; bottom: 0; width: 24px; height: 2px;
  margin-left: -12px; border-radius: var(--rd-r-pill); background: var(--rd-accent);
}
.rd-cp-now {
  display: flex; align-items: center; gap: var(--rd-space-2); width: 100%; text-align: left;
  border: 0; background: transparent; font-family: inherit; font-size: var(--rd-fs-sm);
  color: var(--rd-ink-soft); padding: 0 0 var(--rd-space-4);
}
.rd-cp-now-book { color: var(--rd-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rd-cp-now-pct { margin-left: auto; flex: 0 0 auto; color: var(--rd-accent); font-variant-numeric: tabular-nums; }
/* 主页那张卡里的三列封面（**不横划**：她 09-21「书架不要横着的」） */
.rd-cp-grid { gap: var(--rd-space-3); }
.rd-cp-more {
  display: block; width: 100%; text-align: center; margin-top: var(--rd-space-4);
  padding: var(--rd-space-3); border: 0; border-radius: var(--rd-r-md);
  background: var(--rd-bg-2); color: var(--rd-ink); font-family: inherit; font-size: var(--rd-fs-sm);
}

/* 流水那一条：笔记(N) 讨论(N) 活动(N) + 筛选 */
.rd-cp-feedhead { display: flex; align-items: center; gap: var(--rd-space-4); margin: var(--rd-space-5) 0 var(--rd-space-3); }
.rd-cp-feedtab { border: 0; background: transparent; color: var(--rd-ink-soft); font-family: inherit; font-size: var(--rd-fs-md); padding: 0; }
.rd-cp-feedtab-on { color: var(--rd-ink); font-weight: 600; }
.rd-cp-feedhead .rd-icon-btn { margin-left: auto; }

/* 一条笔记/讨论：收着只看到「他写的那段」，点一下才展开
   （她 09-21：转发和查看原文都收进展开里，点表面不跳转） */
.rd-fn { padding: var(--rd-space-3) var(--rd-space-4); }
.rd-fn + .rd-fn { border-top: 1px solid var(--rd-rule-soft); }
.rd-fn-head {
  display: flex; align-items: flex-start; gap: var(--rd-space-3); width: 100%;
  text-align: left; border: 0; background: transparent; color: inherit; font-family: inherit; padding: 0;
}
.rd-fn-dot { width: 8px; height: 8px; border-radius: var(--rd-r-pill); flex: 0 0 auto; margin-top: 6px; }
.rd-fn-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.rd-fn-meta { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); line-height: 1.5; }
/* 收着那行的原文：压在正文上面的一小段引文（她 09-21：个人页表面也要看得见原文） */
.rd-fn-quote-line {
  color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); line-height: 1.6;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.rd-fn-text {
  font-size: var(--rd-fs-sm); line-height: 1.7; white-space: pre-wrap;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
}
/* 展开之后正文全放出来（不再截三行） */
.rd-fn-open .rd-fn-text { display: block; overflow: visible; }
.rd-fn-head .rd-fold-chev { margin-top: var(--rd-space-1); }
.rd-fn-body {
  margin-top: var(--rd-space-3); padding-left: var(--rd-space-4);
  display: flex; flex-direction: column; gap: var(--rd-space-3);
}
/* 展开里那块**原批注**（讨论的根）——衬线，跟下面接话的聊天气泡分开（她 09-21） */
.rd-fn-note { display: flex; flex-direction: column; gap: var(--rd-space-1); }
.rd-fn-note-head { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }
.rd-fn-note-text { font-family: var(--rd-font-heading); font-size: var(--rd-fs-md); line-height: 1.75; }
.rd-fn-thread { display: flex; flex-direction: column; gap: var(--rd-space-3); }
.rd-fn-msg { display: flex; flex-direction: column; gap: 2px; }
.rd-fn-msg-me { align-items: flex-end; text-align: right; }
.rd-fn-msg-head { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); font-family: var(--rd-font-ui); }
.rd-fn-msg-text { font-size: var(--rd-fs-sm); line-height: 1.75; font-family: var(--rd-font-ui); }
.rd-fn-acts { display: flex; align-items: center; gap: var(--rd-space-5); }
.rd-fn-act {
  border: 0; background: transparent; padding: 0;
  color: var(--rd-accent); font-family: inherit; font-size: var(--rd-fs-caption);
}
/* 摆在时间线上的那几行：时间线自己给缩进和圆点，这行就别再补左右留白了 */
.rd-tl-body .rd-fn { padding: 0 0 var(--rd-space-4); }
.rd-tl-body .rd-fn + .rd-fn { border-top: 0; }

/* 时间线摆屏幕上（不在弹卡里）时，圆点外面那圈描边要跟屏幕底色走 */
.rd-tl-screen .rd-tl-dot { box-shadow: 0 0 0 3px var(--rd-bg); }

/* 书库页那行头像也是按钮（点它同样进个人页） */
.rd-lib-open { border: 0; background: transparent; padding: 0; display: inline-flex; flex: 0 0 auto; color: inherit; }

/* ── 「他在这本书上的记录」（参考图第三张：头像 + 封面 + 在读《…》 + 流水）
      主页预览和书架上的封面都点进这一页，**不直接跳进书里**（她 09-21）──────── */
.rd-bk-head2 { text-align: center; margin-bottom: var(--rd-space-4); }
.rd-bk-owner { font-family: var(--rd-font-heading); font-size: var(--rd-fs-lg); line-height: 1.35; }
.rd-bk-sub { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); margin-top: 2px; }
.rd-bk-hero { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--rd-space-4); }
.rd-bk-who { display: flex; align-items: center; gap: var(--rd-space-3); padding-top: var(--rd-space-1); min-width: 0; }
.rd-bk-name { font-family: var(--rd-font-heading); font-size: var(--rd-fs-lg); color: var(--rd-accent); }
.rd-bk-cover {
  /* position: relative 不能少：封面里那张纸样是 absolute inset:0，
     没有定位祖先它会铺满整个屏幕盖住全页（拍出来一片空白，踩过） */
  position: relative; width: 78px; flex: 0 0 auto; aspect-ratio: 2 / 3;
  border-radius: var(--rd-r-sm); overflow: hidden; box-shadow: var(--rd-shadow-sm);
}
.rd-bk-line { margin-top: var(--rd-space-4); color: var(--rd-ink-soft); font-size: var(--rd-fs-md); }
.rd-bk-book { color: var(--rd-ink); margin-left: 2px; }
.rd-bk-stat {
  display: flex; align-items: center; gap: var(--rd-space-2);
  margin-top: var(--rd-space-3); padding-bottom: var(--rd-space-3);
  border-bottom: 1px dashed var(--rd-rule);
  color: var(--rd-ink-soft); font-size: var(--rd-fs-sm);
}
.rd-bk-check { color: var(--rd-accent); }
.rd-bk-tl { margin-top: var(--rd-space-5); }
.rd-bk-act {
  display: flex; flex-direction: column; gap: 4px; width: 100%; text-align: left;
  border: 0; background: transparent; color: inherit; font-family: inherit; padding: 0;
}

/* ── 书库页（T5）：最近的状态 / 阅读排行榜 / 全局活动记录 ────────── */

/* 时间线那一条可点（她 09-21：活动记录做成时间线样式）——把 button 的默认样式按回去，
   padding-bottom 交给 .rd-tl-item（:last-child 那条仍然盖得住） */
.rd-tl-tap {
  display: block; width: 100%; border: 0; background: transparent; color: inherit;
  font-family: inherit; font-size: inherit; text-align: left;
  padding: 0 0 var(--rd-space-5);
}
.rd-tl-body { flex: 1 1 auto; min-width: 0; }

/* 日期条：一排能点的天（她 09-21 照参考图要的，比一排胶囊直观） */
.rd-days { display: flex; align-items: flex-end; gap: 2px; margin-bottom: var(--rd-space-4); }
.rd-day-cell {
  flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 5px;
  border: 0; background: transparent; color: inherit; font-family: inherit; padding: 0;
}
.rd-day-w { font-size: var(--rd-fs-tab); color: var(--rd-ink-soft); line-height: 1; }
.rd-day-n {
  min-width: 32px; height: 32px; padding: 0 var(--rd-space-1);
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--rd-r-pill); color: var(--rd-ink);
  font-size: var(--rd-fs-md); font-variant-numeric: tabular-nums;
}
.rd-day-all { font-size: var(--rd-fs-sm); }
.rd-day-cell-on .rd-day-n { background: var(--rd-chip-on-bg); color: var(--rd-chip-on-ink); }
.rd-day-cell-on .rd-day-w { color: var(--rd-ink); }

/* 小标题右边挂一颗按钮那种行（排行榜换口径） */
.rd-sec-row {
  display: flex; align-items: center; justify-content: space-between; gap: var(--rd-space-3);
  margin: var(--rd-space-5) 0 var(--rd-space-2);
}
.rd-sec-row .rd-section-title { margin: 0; }

/* 搜索 + 筛选开关那一行 */
.rd-act-tools { display: flex; align-items: center; gap: var(--rd-space-2); margin-bottom: var(--rd-space-3); }
.rd-act-tools .rd-search-input { flex: 1 1 auto; min-width: 0; margin-bottom: 0; }
.rd-flt-btn {
  flex: 0 0 auto; display: inline-flex; align-items: center; gap: var(--rd-space-1);
  height: 36px; padding: 0 var(--rd-space-3);
  border: 1px solid var(--rd-rule); border-radius: var(--rd-r-md);
  background: var(--rd-card); color: var(--rd-ink-soft); font-family: inherit; font-size: var(--rd-fs-sm);
}
.rd-flt-btn-on { border-color: var(--rd-accent); color: var(--rd-accent); }
/* 有几个条件在生效（筛起来的时候看一眼就知道） */
.rd-flt-count {
  min-width: 16px; height: 16px; border-radius: var(--rd-r-pill);
  background: var(--rd-accent); color: var(--rd-on-accent);
  font-size: var(--rd-fs-tab); line-height: 16px; text-align: center;
}

/* 按天分组的那行标题（「今天 · 3 条」）——比小字重一点，撑起层次 */
.rd-day { display: flex; align-items: baseline; gap: var(--rd-space-2); margin-bottom: var(--rd-space-3); }
.rd-day-name { font-family: var(--rd-font-heading); font-size: var(--rd-fs-md); }
.rd-day-count { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }

/* 活动记录的一条：卡片 + 左边一道**他自己的笔色**，三层文本（动作 / 谁和书 / 数字） */
.rd-ag-card {
  background: var(--rd-card); border-radius: var(--rd-r-md);
  border-left: 3px solid var(--rd-accent);
  box-shadow: var(--rd-shadow-sm);
  padding: var(--rd-space-3) var(--rd-space-4);
}
.rd-ag-head { display: flex; align-items: baseline; gap: var(--rd-space-2); }
.rd-ag-title { flex: 1 1 auto; min-width: 0; font-size: var(--rd-fs-md); font-weight: 600; line-height: 1.45; }
.rd-ag-time { flex: 0 0 auto; color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); font-variant-numeric: tabular-nums; }
.rd-ag-sub {
  display: flex; align-items: center; gap: var(--rd-space-2);
  margin-top: var(--rd-space-2); color: var(--rd-ink-soft); font-size: var(--rd-fs-sm);
}
.rd-ag-book { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rd-ag-meta { margin-top: var(--rd-space-2); color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }

/* 筛选那几排：左边一个小标签，右边胶囊 */
.rd-flt { display: flex; align-items: flex-start; gap: var(--rd-space-3); margin-bottom: var(--rd-space-2); }
.rd-flt-label {
  flex: 0 0 auto; width: 32px; padding-top: 7px;
  color: var(--rd-ink-soft); font-size: var(--rd-fs-caption);
}
.rd-flt .rd-chips { flex: 1 1 auto; min-width: 0; margin-bottom: 0; }

/* 「查看全部」那种通栏次级按钮（和书架卡的「查看书架」一个样子） */
.rd-more {
  display: block; width: 100%; text-align: center; margin-top: var(--rd-space-4);
  padding: var(--rd-space-3); border: 0; border-radius: var(--rd-r-md);
  background: var(--rd-bg-2); color: var(--rd-ink); font-family: inherit; font-size: var(--rd-fs-sm);
}

/* 圆头像：宽度由调用方给（书库页 38、活动记录那条 32），其余都在这儿 */
.rd-face {
  flex: 0 0 auto; aspect-ratio: 1 / 1; border-radius: var(--rd-r-pill); overflow: hidden;
  background: var(--rd-bg-2); display: flex; align-items: center; justify-content: center;
  color: var(--rd-ink-soft); font-family: var(--rd-font-heading);
}
.rd-face img { width: 100%; height: 100%; object-fit: cover; display: block; }

/* 摘要那行：没摘成时右边挂一颗「补摘」（她 09-20 定的位置） */
.rd-sum-miss { display: flex; align-items: center; gap: var(--rd-space-3); margin-top: var(--rd-space-3); }
.rd-sum-miss .rd-muted { flex: 1 1 auto; }
.rd-sum-miss .rd-btn { flex: 0 0 auto; padding: 2px var(--rd-space-3); font-size: var(--rd-fs-sm); }

/* 最近的状态：**感受是主角**（这就是它和活动记录的差别），所以衬线、大一号、行距松开 */
.rd-st {
  display: block; width: 100%; text-align: left; border: 0; color: inherit; font-family: inherit;
  background: var(--rd-card); border-radius: var(--rd-r-lg); box-shadow: var(--rd-shadow-sm);
  padding: var(--rd-space-4);
}
.rd-st:active { background: var(--rd-bg-2); }
.rd-st-top { display: flex; align-items: center; gap: var(--rd-space-3); }
.rd-st-who { flex: 1 1 auto; min-width: 0; }
.rd-st-name { font-family: var(--rd-font-heading); font-size: var(--rd-fs-lg); line-height: 1.3; }
.rd-st-verb { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); margin-top: 2px; }
.rd-st-time { flex: 0 0 auto; color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); font-variant-numeric: tabular-nums; }
.rd-st-feel {
  margin-top: var(--rd-space-4); padding-top: var(--rd-space-4);
  border-top: 1px solid var(--rd-rule-soft);
  font-family: var(--rd-font-heading); font-size: var(--rd-fs-lg); line-height: 1.75;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical;
}
.rd-st-hint { margin-top: var(--rd-space-3); color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }

/* 活动记录那一条：**第二行（书名 + 那串小字）占满整行**——
   挤在右边那列里会把「进度 13%」拆成两行（拍出来看过）。 */
.rd-act {
  display: grid; grid-template-columns: auto 1fr auto; align-items: center;
  gap: 2px var(--rd-space-3); width: 100%;
  padding: var(--rd-space-3) var(--rd-space-4);
  border: 0; background: transparent; color: var(--rd-ink);
  font-family: var(--rd-font-body); font-size: var(--rd-fs-md); text-align: left;
}
.rd-act + .rd-act { border-top: 1px solid var(--rd-rule); }
.rd-act:active { background: var(--rd-bg-2); }
.rd-act-face { grid-row: 1 / span 2; align-self: center; display: flex; }
.rd-act-who { grid-column: 2; min-width: 0; }
.rd-act-time { grid-column: 3; color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); font-variant-numeric: tabular-nums; }
.rd-act-sub { grid-column: 2 / span 2; color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); line-height: 1.6; }

/* 六个胶囊一排会横着藏起来 → 让它换行 */
.rd-chips-wrap { flex-wrap: wrap; overflow: visible; }
.rd-rank-no { flex: 0 0 auto; width: 18px; color: var(--rd-ink-soft); font-size: var(--rd-fs-sm); font-variant-numeric: tabular-nums; }
.rd-rank-val { flex: 0 0 auto; color: var(--rd-accent); font-size: var(--rd-fs-md); font-variant-numeric: tabular-nums; }

/* ── 设置页 · 挂载规则（2026-09-21 T6）────────────────────────────
   预览框是「现在会注入什么」那块：底色比卡片深一点点（bg-2），字小一号，
   跟卡片的区分靠底色和那行小标题，不靠边框（书房的规矩：边线尽量少）。 */
.rd-preview {
  margin-top: var(--rd-space-2); padding: var(--rd-space-3) var(--rd-space-4);
  background: var(--rd-bg-2); border-radius: var(--rd-r-md);
}
.rd-preview-head {
  display: flex; align-items: center; gap: var(--rd-space-1);
  color: var(--rd-ink-soft); font-size: var(--rd-fs-caption);
}
.rd-preview-body {
  margin-top: var(--rd-space-2); color: var(--rd-ink);
  font-size: var(--rd-fs-caption); line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere;
}
.rd-mt-params { margin-top: var(--rd-space-3); }
.rd-mt-params .rd-row { display: flex; align-items: center; justify-content: space-between; gap: var(--rd-space-3); }
.rd-select {
  flex: 0 0 auto; max-width: 60%; background: var(--rd-bg-2); color: var(--rd-ink);
  border: 1px solid var(--rd-rule); border-radius: var(--rd-r-sm);
  padding: var(--rd-space-1) var(--rd-space-2); font-family: inherit; font-size: var(--rd-fs-sm);
}
/* 命中测试那一行：图标 + 输入框 + 「测」（都在一行里，不换行） */
.rd-hit-row { display: flex; align-items: center; gap: var(--rd-space-2); margin-top: var(--rd-space-3); }
.rd-hit-row > svg { flex: 0 0 auto; color: var(--rd-ink-soft); }
.rd-hit-row .rd-field { flex: 1 1 auto; min-width: 0; }
.rd-hit-row .rd-btn { flex: 0 0 auto; }
/* 逐行的小字说明（一行一句，不挤成一段） */
.rd-hint-list { display: flex; flex-direction: column; gap: var(--rd-space-1); margin-top: var(--rd-space-3); }
.rd-hint-list > .rd-muted { line-height: 1.6; }
/* 命中测试那枚结果小标：命中了是主色，没命中是灰的 */
.rd-hit {
  flex: 0 0 auto; border-radius: var(--rd-r-pill); padding: 2px var(--rd-space-2);
  background: var(--rd-bg-2); color: var(--rd-ink-soft); font-size: var(--rd-fs-caption);
}
.rd-hit-on { background: var(--rd-accent-soft); color: var(--rd-accent); }

/* ── 书摘分享卡（她 09-26）──────────────────────────────────────────
   卡片是一张 canvas（预览和存下来的图同一个东西），浮在暗底上；
   底下那条操作栏点卡片能收起来、再点回来。 */
.rd-share-mask {
  position: fixed; inset: 0; z-index: 96;
  background: var(--rd-scrim);
  display: flex; flex-direction: column;
  animation: rd-fade 160ms ease;
}
/* 卡片区：自己滚——长书摘的卡会比屏幕高，上下划着看。
   居中用**卡自己的 margin:auto**，不用 align-items:center——
   后者在「内容比容器高」的时候会把顶上那截顶出可视区、还滚不回去（老毛病）。 */
.rd-share-stage {
  flex: 1 1 auto; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column;
  padding: calc(var(--chrome-top, 0px) + var(--rd-space-6)) var(--rd-space-5) var(--rd-space-6);
}
/* 操作栏收起来时给它让出全部地方（真正的「整张卡安安静静」） */
.rd-share-stage-full { padding-bottom: calc(var(--rd-space-6) + var(--safe-bottom, 0px)); }
.rd-share-canvas {
  display: block; width: 100%; max-width: 420px; height: auto; margin: auto;
  border-radius: var(--rd-r-sm); box-shadow: var(--rd-shadow);
}
.rd-share-bottombar { flex: 0 0 auto; background: var(--rd-sheet-bg); }
/* 栏收起来之后这条就不该再挡光——留透明，暗底透上来，把手才看得见 */
.rd-share-bottombar-bare { background: transparent; }
/* 栏收起来之后留的那一小条把手（点它把栏唤回来，跟面板顶上那根一个意思） */
.rd-share-grip { display: flex; align-items: center; justify-content: center; padding: var(--rd-space-4) 0 max(var(--rd-space-4), var(--safe-bottom, 0px)); background: transparent; }
.rd-share-grip > span { width: 44px; height: 4px; border-radius: var(--rd-r-pill); background: var(--rd-on-scrim); opacity: 0.5; }
/* 底栏那三颗：图标在上、字在下 */
/* 底下那截留白按三值取大（她 09-26 报的「底部被遮住了」）：--safe-bottom 在有些壳里
   是 0，env() 才是真值，再兜一个地板——三者取大，不双算。面板顶上的 padding 同理。 */
.rd-share-bar {
  display: flex; align-items: stretch; justify-content: space-around;
  padding: var(--rd-space-3) var(--rd-space-2) max(34px, var(--safe-bottom, 0px), env(safe-area-inset-bottom, 0px));
}
.rd-share-act {
  flex: 1 1 0; display: flex; flex-direction: column; align-items: center; gap: var(--rd-space-1);
  border: 0; background: transparent; color: var(--rd-ink);
  font-family: var(--rd-font-body); font-size: var(--rd-fs-caption);
  padding: var(--rd-space-2); border-radius: var(--rd-r-md);
}
.rd-share-act:active { background: var(--rd-bg-2); }
.rd-share-act:disabled { opacity: 0.45; }
/* 换模板的抽屉：主题 / 字体 / 背景 / 圆点 / 落款 / 想法 */
.rd-share-panel {
  display: flex; flex-direction: column; gap: var(--rd-space-4);
  padding: var(--rd-space-5) var(--rd-space-5) max(44px, var(--safe-bottom, 0px), env(safe-area-inset-bottom, 0px));
  max-height: 62dvh; overflow-y: auto;
  animation: rd-rise 200ms cubic-bezier(0.32, 0.72, 0.28, 1);
}
.rd-share-panel::-webkit-scrollbar { width: 0; }
.rd-share-row { display: flex; flex-direction: column; gap: var(--rd-space-2); }
.rd-share-label { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }
.rd-share-chips { display: flex; gap: var(--rd-space-2); flex-wrap: wrap; }
.rd-share-dots { display: flex; align-items: center; gap: var(--rd-space-2); flex-wrap: wrap; }
.rd-share-dot {
  width: 34px; height: 34px; flex: 0 0 auto; padding: 0;
  border: 1px solid var(--rd-rule); border-radius: var(--rd-r-pill);
  background: var(--rd-card); color: var(--rd-ink-soft);
  display: flex; align-items: center; justify-content: center;
  background-size: cover; background-position: center;
}
.rd-share-dot-on { border-color: var(--rd-accent); box-shadow: 0 0 0 2px var(--rd-accent); }
/* 写字的那个圆点（「底色」这种不是颜色的选项） */
.rd-share-dot-word { width: auto; padding: 0 var(--rd-space-3); font-size: var(--rd-fs-caption); }
.rd-share-sign { flex: 1 1 auto; }
.rd-share-toggle { display: flex; align-items: center; gap: var(--rd-space-2); color: var(--rd-ink); font-size: var(--rd-fs-sm); }
/* 「传自己的字体」那一格：只有图标，跟旁边的字胶囊一样高 */
.rd-share-fontup { display: inline-flex; align-items: center; gap: var(--rd-space-1); cursor: pointer; }

@keyframes rd-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes rd-rise { from { transform: translateY(14px) } to { transform: translateY(0) } }
`;

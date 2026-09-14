// 读书模块 · 骨架层 CSS（2026-09-14）
//
// 铁律（v3 §3.1）：**骨架层只决定层级/间距/对齐/信息密度，不出现任何具体色值、
// 圆角数值、字号数值**——全部走 var(--rd-*)。皮肤（readerSkinPresets）换的是变量表，
// 不是这三十条规则；用户/小助手写的 CSS 挂在最后一张表里，同权重时它胜出，
// 所以永远不需要 !important。
//
// 类名速查（小助手提示词照这份点名，见 utils/promptRegistry 的「美化助手-读书*」）：
//   外壳   .rd-root / .rd-tabbar / .rd-tab / .rd-tab-on
//   书架   .rd-shelf / .rd-shelf-grid / .rd-shelf-list / .rd-book-card / .rd-book-cover
//          .rd-book-cover-ph / .rd-book-meta / .rd-book-title / .rd-book-author / .rd-bar / .rd-bar-fill
//   阅读   .rd-reader / .rd-reader-top / .rd-reader-viewport / .rd-reader-flow / .rd-chapter-title
//          .rd-para / .rd-reader-foot / .rd-icon-btn / .rd-meter
//   浮层   .rd-sheet / .rd-sheet-title / .rd-sheet-body / .rd-row / .rd-field / .rd-btn / .rd-btn-primary
//   其它   .rd-empty / .rd-muted / .rd-cover-img
//   划线   .rd-hl-layer（覆盖层容器，别给它背景！）/ .rd-hl-rect（真正的划线块）
//
// 数值默认值全部集中在下面的 .rd-root 块——那是「默认皮肤 + 默认排版」的表达，
// 皮肤表与用户排版设置覆盖的就是这些名字。

export const READER_SKELETON_CSS = `
.rd-root {
  /* 颜色不在这里给默认值——那是皮肤表的活（readerSkinPresets）。
     骨架层只管层级/间距/几何/排版的默认值。 */

  /* 排版（用户可调，映射见 ReaderSkinPreset） */
  --rd-font-heading: Georgia, "Songti SC", "Noto Serif SC", serif;
  --rd-font-body: -apple-system, "PingFang SC", "Noto Sans SC", sans-serif;
  --rd-fs-title: 22px;
  --rd-fs-body: 17px;
  --rd-fs-caption: 12px;
  --rd-lh-body: 1.9;
  --rd-para-gap: 12px;
  --rd-para-indent: 2em;
  --rd-page-gutter: 22px;

  /* 几何 */
  --rd-radius-card: 12px;
  --rd-radius-pill: 999px;
  --rd-radius-hl: 2px;
  --rd-space-1: 4px;
  --rd-space-2: 8px;
  --rd-space-3: 12px;
  --rd-space-4: 16px;
  --rd-space-6: 24px;

  /* 划线槽 1..6 的颜色由 readerSkinPresets.HIGHLIGHT_SLOTS 供给（见 ReaderSkinPreset） */

  background: var(--rd-paper);
  color: var(--rd-ink);
  font-family: var(--rd-font-body);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.rd-content { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.rd-content::-webkit-scrollbar { width: 0; }

/* ── 底部导航 ── */
.rd-tabbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: var(--rd-space-2) var(--rd-space-2) calc(var(--rd-space-2) + var(--safe-bottom, 0px));
  border-top: 1px solid var(--rd-rule);
  background: var(--rd-paper-2);
}
.rd-tab {
  border: 0; background: transparent; color: var(--rd-ink-soft);
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  font-size: var(--rd-fs-caption); font-family: var(--rd-font-body);
  padding: var(--rd-space-1) var(--rd-space-3); border-radius: var(--rd-radius-pill);
}
.rd-tab-on { color: var(--rd-accent); }

/* ── 顶栏（阅读页/各 tab 共用） ── */
.rd-top {
  flex: 0 0 auto;
  display: flex; align-items: center; gap: var(--rd-space-2);
  padding: calc(var(--chrome-top, 0px) + var(--rd-space-2)) var(--rd-space-3) var(--rd-space-2);
  border-bottom: 1px solid var(--rd-rule);
  background: var(--rd-paper-2);
}
.rd-top-title { flex: 1 1 auto; min-width: 0; font-size: var(--rd-fs-body); font-family: var(--rd-font-heading); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rd-icon-btn {
  border: 0; background: transparent; color: var(--rd-ink);
  width: 34px; height: 34px; flex: 0 0 auto;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--rd-radius-pill);
}
.rd-icon-btn:active { background: var(--rd-rule); }

/* ── 书架 ── */
.rd-shelf { padding: var(--rd-space-4) var(--rd-space-4) 96px; }
.rd-shelf-head { display: flex; align-items: baseline; gap: var(--rd-space-2); margin-bottom: var(--rd-space-4); }
.rd-shelf-title { font-family: var(--rd-font-heading); font-size: var(--rd-fs-title); }
.rd-shelf-count { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }
.rd-shelf-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--rd-space-4) var(--rd-space-3); }
.rd-shelf-list { display: flex; flex-direction: column; gap: var(--rd-space-3); }
.rd-book-card { display: flex; flex-direction: column; gap: var(--rd-space-2); text-align: left; border: 0; background: transparent; padding: 0; color: inherit; font-family: inherit; }
.rd-shelf-list .rd-book-card { flex-direction: row; align-items: center; gap: var(--rd-space-3); background: var(--rd-paper-2); border-radius: var(--rd-radius-card); padding: var(--rd-space-3); box-shadow: var(--rd-shadow); }
.rd-book-cover {
  position: relative; width: 100%; aspect-ratio: 3 / 4;
  border-radius: var(--rd-radius-card); overflow: hidden;
  background: var(--rd-paper-2); box-shadow: var(--rd-shadow);
}
.rd-shelf-list .rd-book-cover { width: 56px; aspect-ratio: 3 / 4; flex: 0 0 auto; }
.rd-book-cover-ph {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(160deg, var(--rd-paper-2), var(--rd-paper));
  color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); padding: var(--rd-space-2); text-align: center;
}
.rd-cover-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.rd-book-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.rd-book-title { font-size: var(--rd-fs-body); font-weight: 600; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.rd-book-author { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rd-bar { height: 4px; border-radius: var(--rd-radius-pill); background: var(--rd-rule); overflow: hidden; }
.rd-bar-fill { height: 100%; background: var(--rd-accent); }

/* ── 阅读页 ── */
.rd-reader { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--rd-paper); }
.rd-reader-viewport { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; }
.rd-reader-flow {
  position: absolute; left: var(--rd-page-gutter); right: var(--rd-page-gutter); top: 0;
  will-change: transform;
  transition: transform 260ms cubic-bezier(0.33, 0.7, 0.4, 1);
}
.rd-chapter-title { font-family: var(--rd-font-heading); font-size: var(--rd-fs-title); line-height: 1.4; margin: 0 0 var(--rd-para-gap); }
.rd-para {
  font-size: var(--rd-fs-body); line-height: var(--rd-lh-body);
  margin: 0 0 var(--rd-para-gap);
  text-indent: var(--rd-para-indent);
  white-space: pre-wrap; word-break: break-word;
}
.rd-reader-foot {
  flex: 0 0 auto; display: flex; align-items: center; gap: var(--rd-space-3);
  padding: var(--rd-space-2) var(--rd-space-4) calc(var(--rd-space-2) + var(--safe-bottom, 0px));
  border-top: 1px solid var(--rd-rule); background: var(--rd-paper-2);
  color: var(--rd-ink-soft); font-size: var(--rd-fs-caption);
}
.rd-meter { flex: 1 1 auto; text-align: center; }

/* ── 浮层（导入卡 / 目录 / 设置） ── */
.rd-sheet-mask { position: fixed; inset: 0; background: var(--rd-scrim); z-index: 60; display: flex; align-items: flex-end; }
.rd-sheet {
  width: 100%; max-height: 86vh; overflow-y: auto; overscroll-behavior: contain;
  background: var(--rd-paper); color: var(--rd-ink);
  border-radius: var(--rd-radius-card) var(--rd-radius-card) 0 0;
  padding: var(--rd-space-4) var(--rd-space-4) calc(var(--rd-space-4) + var(--safe-bottom, 0px));
}
.rd-sheet-title { font-family: var(--rd-font-heading); font-size: var(--rd-fs-title); margin-bottom: var(--rd-space-3); }
.rd-sheet-body { display: flex; flex-direction: column; gap: var(--rd-space-3); }
.rd-row { display: flex; align-items: center; justify-content: space-between; gap: var(--rd-space-3); font-size: var(--rd-fs-body); }
.rd-row-label { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }
.rd-field {
  width: 100%; border: 1px solid var(--rd-rule); border-radius: var(--rd-radius-card);
  background: var(--rd-paper-2); color: var(--rd-ink); padding: var(--rd-space-2) var(--rd-space-3);
  font-size: var(--rd-fs-body); font-family: var(--rd-font-body);
}
.rd-btn {
  border: 1px solid var(--rd-rule); background: transparent; color: var(--rd-ink);
  border-radius: var(--rd-radius-pill); padding: var(--rd-space-2) var(--rd-space-4);
  font-size: var(--rd-fs-body); font-family: var(--rd-font-body);
}
.rd-btn-primary { background: var(--rd-accent); border-color: var(--rd-accent); color: var(--rd-paper); }
.rd-btn:disabled { opacity: 0.45; }
.rd-btn-row { display: flex; gap: var(--rd-space-2); flex-wrap: wrap; }

/* ── 轻提示（导入中/已重解这类一句话反馈） ── */
.rd-toast {
  position: fixed; left: 50%; transform: translateX(-50%);
  bottom: calc(96px + var(--safe-bottom, 0px));
  background: var(--rd-scrim); color: var(--rd-paper);
  border-radius: var(--rd-radius-pill);
  padding: var(--rd-space-2) var(--rd-space-4);
  font-size: var(--rd-fs-caption); z-index: 80;
}

/* ── 空态 / 辅助 ── */
.rd-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--rd-space-3); padding: 64px var(--rd-space-6); color: var(--rd-ink-soft); text-align: center; font-size: var(--rd-fs-body); }
.rd-muted { color: var(--rd-ink-soft); font-size: var(--rd-fs-caption); }

/* ── 划线覆盖层（第二批用；容器永远不给背景） ── */
.rd-hl-layer { position: absolute; inset: 0; pointer-events: none; }
.rd-hl-rect { position: absolute; border-radius: var(--rd-radius-hl); background: rgba(var(--rd-hl-rgb), 0.32); }
`;

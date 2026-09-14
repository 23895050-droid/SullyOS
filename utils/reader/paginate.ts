// 读书模块 · 分页引擎（2026-09-14）
//
// 核心立场：**分页是纯函数 `(段落, 度量) → 页`，锚点永远不依赖分页。**
// 锚点只认 (段号, 段内偏移)；字号/窗口/字体一变就重算页表，锚点原地不动——
// v3 的 V7「锚点不漂」因此是结构性的，不是调出来的。
//
// 做法（量文字，不用 CSS 多列）：
//   多列流在 WebKit 上跟「绝对定位的划线覆盖层 + 跨列选区」相处很差（选中框会落在
//   被裁切的坐标系里，浮层跟着错位），而我们的第二批正是要在这层上画划线；
//   实测分页则只用到 Range.getClientRects()——每行一个矩形，分页就是把这些行装进
//   一屏高度里，页边界永远落在整行上。
//
// 渲染策略：整章一次性渲染进 .rd-reader-flow（不平铺、不虚拟化），翻页 = translateY。
// 「当前页正文」（V1 要喂给角色的东西）由 slicesForPage 从同一份行矩形里算出来。

/** 一页里属于某段的一部分（V1 的「当前页正文」就是这些切片按序拼起来）。 */
export interface PageSlice {
    paraIdx: number;
    startOffset: number;
    endOffset: number;
}

export interface RdPageBox {
    index: number;
    /** 相对正文流顶部的 Y（翻页就是 translateY(-top)） */
    top: number;
    height: number;
    fromPara: number;
    toPara: number;
}

export interface LayoutMetrics {
    width: number;
    height: number;
    /** 字体/字号/行高/间距/页边距的指纹（变了才需要重算） */
    fontKey: string;
}

/** 重算页表的依据：书 + 章 + 视口 + 排版指纹。任何一项变了，只重算当前章。 */
export function layoutKeyOf(bookId: string, chapterIdx: number, m: LayoutMetrics): string {
    return `${bookId}#${chapterIdx}:${Math.round(m.width)}x${Math.round(m.height)}:${m.fontKey}`;
}

/** y 落在第几页（纯函数，越界夹到两端）。 */
export function pageIndexAt(pages: RdPageBox[], y: number): number {
    if (pages.length === 0) return 0;
    let lo = 0;
    let hi = pages.length - 1;
    let ans = 0;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (pages[mid].top <= y + 0.5) { ans = mid; lo = mid + 1; }
        else hi = mid - 1;
    }
    return ans;
}

// ─── DOM 度量 ───────────────────────────────────────────────────

const paraElement = (flowEl: HTMLElement, paraIdx: number): HTMLElement | null =>
    flowEl.querySelector<HTMLElement>(`[data-para-idx="${paraIdx}"]`);

function textNodeOf(el: HTMLElement | null): Text | null {
    const first = el?.firstChild;
    return first && first.nodeType === Node.TEXT_NODE ? (first as Text) : null;
}

function lineRects(node: Text, from: number, to: number): DOMRect[] {
    if (to <= from) return [];
    const range = document.createRange();
    range.setStart(node, from);
    range.setEnd(node, to);
    return Array.from(range.getClientRects());
}

/**
 * 量一章、切页。要求 flowEl 里的段落带 `data-para-idx`（0 起连续），
 * 且此刻 flow 的 translateY 不影响结果（内部全部用相对 flow 顶部的差值）。
 */
export function paginateFlow(flowEl: HTMLElement, viewportHeight: number): RdPageBox[] {
    const flowTop = flowEl.getBoundingClientRect().top;
    const pages: RdPageBox[] = [];
    let current: RdPageBox | null = null;
    let pageTop = 0;
    let lastBottom = 0;

    const paraEls = Array.from(flowEl.querySelectorAll<HTMLElement>('[data-para-idx]'));
    for (const el of paraEls) {
        const paraIdx = Number(el.dataset.paraIdx);
        const node = textNodeOf(el);
        if (!node || !node.data) continue;
        const rects = lineRects(node, 0, node.data.length);
        for (const rect of rects) {
            const top = rect.top - flowTop;
            const bottom = rect.bottom - flowTop;
            if (!current) {
                // 第一页从**正文流顶部**起算，不能从第一行起算——章标题在段落之上，
                // 从行高起算会把标题推到视口外（首屏就少个标题）。
                const startTop = pages.length === 0 ? 0 : top;
                current = { index: 0, top: startTop, height: 0, fromPara: paraIdx, toPara: paraIdx };
                pageTop = startTop;
            }
            if (bottom - pageTop > viewportHeight + 0.5) {
                // 这一行装不下：上一行收口，从这一行开新页
                current.height = Math.max(1, lastBottom - current.top);
                pages.push(current);
                current = { index: pages.length, top, height: 0, fromPara: paraIdx, toPara: paraIdx };
                pageTop = top;
            } else {
                current.toPara = paraIdx;
            }
            lastBottom = bottom;
        }
    }
    if (current) {
        current.height = Math.max(1, lastBottom - current.top);
        pages.push(current);
    }
    pages.forEach((p, i) => { p.index = i; });
    return pages;
}

/** 找出这一页真正覆盖的文本切片（V1「当前页正文」的取数口）。 */
export function slicesForPage(flowEl: HTMLElement, page: RdPageBox, viewportHeight: number): PageSlice[] {
    const flowTop = flowEl.getBoundingClientRect().top;
    const pageBottom = page.top + viewportHeight;
    const out: PageSlice[] = [];
    for (let paraIdx = page.fromPara; paraIdx <= page.toPara; paraIdx++) {
        const node = textNodeOf(paraElement(flowEl, paraIdx));
        if (!node || !node.data) continue;
        const len = node.data.length;
        const rects = lineRects(node, 0, len);
        if (rects.length === 0) continue;
        const first = rects[0];
        const last = rects[rects.length - 1];
        const paraTop = first.top - flowTop;
        const paraBottom = last.bottom - flowTop;
        if (paraBottom <= page.top + 0.5 || paraTop >= pageBottom - 0.5) continue;   // 完全不在本页
        if (paraTop >= page.top - 0.5 && paraBottom <= pageBottom + 0.5) {
            out.push({ paraIdx, startOffset: 0, endOffset: len });                    // 整段都在
            continue;
        }
        const startOffset = firstOffsetBelow(node, page.top - flowTop);
        const endOffset = lastOffsetAbove(node, pageBottom - flowTop);
        if (endOffset > startOffset) out.push({ paraIdx, startOffset, endOffset });
    }
    return out;
}

/** 第一个「行底越过 y」的字符偏移（二分）。 */
function firstOffsetBelow(node: Text, y: number): number {
    let lo = 0;
    let hi = node.data.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const rects = lineRects(node, 0, mid + 1);
        const bottom = rects.length ? rects[rects.length - 1].bottom : 0;
        if (bottom > y) hi = mid; else lo = mid + 1;
    }
    return lo;
}

/** 最后一个「行顶还没越过 y」的字符偏移（二分）。 */
function lastOffsetAbove(node: Text, y: number): number {
    let lo = 0;
    let hi = node.data.length;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        const rects = lineRects(node, 0, mid);
        const top = rects.length ? rects[rects.length - 1].top : 0;
        if (rects.length && top < y) lo = mid; else hi = mid - 1;
    }
    return lo;
}

/** 恢复进度：锚点（段号 + 段内偏移）落在第几页。 */
export function pageForAnchor(
    flowEl: HTMLElement,
    pages: RdPageBox[],
    paraIdx: number,
    charOffset: number,
): number {
    if (pages.length === 0) return 0;
    const node = textNodeOf(paraElement(flowEl, paraIdx));
    if (!node) return 0;
    const flowTop = flowEl.getBoundingClientRect().top;
    const off = Math.max(0, Math.min(node.data.length, charOffset));
    const rects = lineRects(node, 0, Math.max(1, off));
    const y = (rects.length ? rects[rects.length - 1].top : node.parentElement!.getBoundingClientRect().top) - flowTop;
    return pageIndexAt(pages, y);
}

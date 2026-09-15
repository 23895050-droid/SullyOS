// 读书模块 · 分页引擎（2026-09-15 改横排：她报「你说是横着翻页的，实际是上下翻的」）
//
// 立场没变：**锚点永远不依赖分页**。锚点只认 (段号, 段内偏移)，排版/窗口一变就重算，
// 锚点原地不动——v3 的 V7「锚点不漂」是结构性的，不是调出来的。
//
// 做法：正文流交给 CSS 多列（column-width / column-gap / column-fill:auto + 定高），
// **一列就是一页**，翻页 = 平移列的整数倍。这样：
//   · 列宽由浏览器算，我们不再自己「量一行行往页里装」——那套在改字号/转屏时最容易出错
//   · 页边界永远落在整行上（列的切分是排版引擎的活）
//   · 横滑是真的横：位移方向 = 阅读方向（以前整章竖着排，翻页只能上下推）
//
// 列几何（与 readerCss 的 .rd-reader-flow 一致）：
//   正文内容盒 = [gutter, pageWidth − gutter]，列宽 = pageWidth − 2·gutter，列间距 = 2·gutter
//   → **步长 step = 列宽 + 列间距 = pageWidth**，第 i 列的左沿正好在 i·step。
//   所以「第几页」= x / step 取整，翻页位移 = i · step。

/** 一页里属于某段的一部分（V1「当前页正文」就是这些切片按序拼起来）。 */
export interface PageSlice {
    paraIdx: number;
    startOffset: number;
    endOffset: number;
}

// ─── 纯几何 ─────────────────────────────────────────────────────

/** x（相对正文内容盒左边）落在第几列。 */
export function columnOfX(x: number, step: number): number {
    if (!(step > 0)) return 0;
    return Math.max(0, Math.floor((x + 0.5) / step));
}

/** 重排的依据：书 + 章 + 视口 + 排版指纹。任何一项变了，这一列的位置就得重算。 */
export function layoutKeyOf(bookId: string, chapterIdx: number, m: { width: number; height: number; fontKey: string }): string {
    return `${bookId}#${chapterIdx}:${Math.round(m.width)}x${Math.round(m.height)}:${m.fontKey}`;
}

// ─── DOM 度量 ───────────────────────────────────────────────────

function paraElements(flowEl: HTMLElement): HTMLElement[] {
    return Array.from(flowEl.querySelectorAll<HTMLElement>('[data-para-idx]'));
}

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

/** 正文内容盒的左沿（= 第一列文字的左边）。流被 translateX 平移了也没关系——
 *  它和下面每个 rect 在同一个坐标系里，差值把平移抵消掉了。 */
function contentLeft(flowEl: HTMLElement): number {
    const box = flowEl.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(flowEl).paddingLeft) || 0;
    return box.left + pad;
}

/** 一个段落占的列区间（图片那种没有文本节点的段落用它的盒子）。 */
function columnsOfElement(el: HTMLElement, flowEl: HTMLElement, step: number): { first: number; last: number } | null {
    const left = contentLeft(flowEl);
    const node = textNodeOf(el);
    const rects = node ? lineRects(node, 0, node.data.length) : [el.getBoundingClientRect()];
    if (rects.length === 0) return null;
    const first = columnOfX(rects[0].left - left, step);
    const last = columnOfX(Math.max(...rects.map((r) => r.right)) - left - 1, step);
    return { first, last: Math.max(first, last) };
}

/** 这一章一共几列（= 几页）。从最后一个有内容的段落往回找，找到就算完。 */
export function columnCountOf(flowEl: HTMLElement, step: number): number {
    const els = paraElements(flowEl);
    for (let i = els.length - 1; i >= 0; i--) {
        const span = columnsOfElement(els[i], flowEl, step);
        if (span) return span.last + 1;
    }
    return 1;
}

/** 锚点（段号 + 段内偏移）落在第几列。恢复进度、批注跳转都走它。 */
export function columnOfAnchor(flowEl: HTMLElement, paraIdx: number, charOffset: number, step: number): number {
    const el = flowEl.querySelector<HTMLElement>(`[data-para-idx="${paraIdx}"]`);
    if (!el) return 0;
    const left = contentLeft(flowEl);
    const node = textNodeOf(el);
    if (!node || !node.data) return columnOfX(el.getBoundingClientRect().left - left, step);
    const off = Math.max(0, Math.min(node.data.length, charOffset));
    const rects = lineRects(node, 0, Math.max(1, off));
    const rect = rects[rects.length - 1] ?? el.getBoundingClientRect();
    return columnOfX(rect.left - left + 1, step);
}

/**
 * 找出这一列真正覆盖的文本切片（V1「当前页正文」的取数口，也是书签「在不在这一页」的依据）。
 * 横排之后判据从「行底越过 y」换成「行左沿/右沿越过 x」。
 */
export function slicesForColumn(flowEl: HTMLElement, columnIdx: number, step: number): PageSlice[] {
    const left = contentLeft(flowEl);
    const x0 = columnIdx * step;
    const x1 = x0 + step;
    const out: PageSlice[] = [];
    for (const el of paraElements(flowEl)) {
        const paraIdx = Number(el.dataset.paraIdx);
        const node = textNodeOf(el);
        if (!node || !node.data) {
            // 图片这类没有文字的段落：落在这一列就算这一页的内容（长度 0，字数不参与统计）
            const box = el.getBoundingClientRect();
            if (box.right > left + x0 + 0.5 && box.left < left + x1 - 0.5) {
                out.push({ paraIdx, startOffset: 0, endOffset: 0 });
            }
            continue;
        }
        const len = node.data.length;
        const rects = lineRects(node, 0, len);
        if (rects.length === 0) continue;
        const band = rects.filter((r) => r.right > left + x0 + 0.5 && r.left < left + x1 - 0.5);
        if (band.length === 0) continue;
        if (band.length === rects.length) {
            out.push({ paraIdx, startOffset: 0, endOffset: len });      // 整段都在这一页
            continue;
        }
        const startOffset = firstOffsetAtOrAfter(node, left + x0);
        const endOffset = lastOffsetBefore(node, left + x1);
        if (endOffset > startOffset) out.push({ paraIdx, startOffset, endOffset });
    }
    return out;
}

/** 第一个「行右沿越过 x」的字符偏移（二分）。 */
function firstOffsetAtOrAfter(node: Text, x: number): number {
    let lo = 0;
    let hi = node.data.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const rects = lineRects(node, 0, mid + 1);
        const right = rects.length ? rects[rects.length - 1].right : 0;
        if (right > x) hi = mid; else lo = mid + 1;
    }
    return lo;
}

/** 最后一个「行左沿还没越过 x」的字符偏移（二分）。 */
function lastOffsetBefore(node: Text, x: number): number {
    let lo = 0;
    let hi = node.data.length;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        const rects = lineRects(node, 0, mid);
        const lt = rects.length ? rects[rects.length - 1].left : 0;
        if (rects.length && lt < x) lo = mid; else hi = mid - 1;
    }
    return lo;
}

// 读书模块 · 书摘分享卡的排版与绘制（2026-09-26）
//
// 拆成两半，**排版是纯的、绘制才是脏的**：
//   · `layoutShareCard(data, style, metrics)` —— 只跟一个「量字宽」的函数打交道，
//     算出画布多高、卡片画在哪儿、每一行字落在哪儿。单测盯着它（换行规则在这儿）。
//   · `drawShareCard(ctx, layout)` —— 拿算好的结果往 canvas 上画，不做任何计算。
//
// 为什么自己画 canvas 而不是截 DOM：预览和导出**同源**，不会有「手机上好看、存下来跑版」
// 这种事（这个模块已经被这类问题坑过几次）。卡片就是那张 canvas 本身。

import {
    RD_SHARE_DOTS, shareBgById, shareFontById, shareThemeById, type RdShareTheme,
} from '../../apps/reader/readerShareThemes';

/** 画布宽度（定死，高度按内容算）。1080 ≈ 手机上 3 倍图，发到哪儿都够清楚。 */
export const SHARE_W = 1080;

export interface ShareCardData {
    /** 划出来的原文 */
    quote: string;
    bookTitle: string;
    author?: string;
    /** 「第一章」这种（有就写进出处那一行） */
    chapterTitle?: string;
    /** 想法（她那句批注）；withNote 关了或没有就不画 */
    note?: string;
    noteWho?: string;
    /** '2026.09.26' */
    date: string;
}

export interface ShareCardStyle {
    themeId: string;
    fontId: string;
    bgId: string;
    /** 纸卡顶上那颗圆的颜色 */
    dot: string;
    /** 落款（空串 = 不画那行） */
    sign: string;
    /** 带不带想法 */
    withNote: boolean;
}

export const DEFAULT_SHARE_STYLE: ShareCardStyle = {
    themeId: 'plain',
    fontId: 'song',
    // bgId 的三个档：'none' = 用这张主题自己的底色 / 色板里的 id / 'image' = 用上传的底图
    bgId: 'none',
    dot: RD_SHARE_DOTS[0],
    sign: '书房',
    withNote: true,
};

/** `rgb(r, g, b)` / `rgba(...)` → 换个透明度（纸卡那层色要拿圆点的颜色兑出来） */
function withAlpha(css: string, alpha: number): string {
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(String(css ?? ''));
    if (!m) return `rgba(255, 255, 255, ${alpha})`;
    return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
}

/** 卡上那个日期戳：`2026.09.26`（给不出时间就用今天） */
export function shareDayOf(iso?: string): string {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

/** 排版只需要这一个能力：给定文字和字体，量出宽度（真正的 ctx 由调用方包一层） */
export interface ShareMetrics {
    width(text: string, font: string): number;
}

/** 不该出现在行首的标点（排到行尾更难看） */
const NO_LINE_START = '，。、；：？！）」』】…—·〉》”’%>';
/** 不该留在行尾的标点（开引号要跟着下一行） */
const NO_LINE_END = '（「『【〈《“‘<';

/**
 * 按宽度折行。**逐字断行**（中文没有词边界）+ 两条朴素避让：
 * 行尾出现开引号就把它挪到下一行；行首遇到不该开头的标点就把它留在上一行。
 * 纯函数——`measure` 由调用方给（画布量字宽 / 单测里假装每个字一样宽）。
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
    const out: string[] = [];
    if (maxWidth <= 0) return out;
    for (const raw of String(text ?? '').split('\n')) {
        if (!raw) { out.push(''); continue; }
        let cur = '';
        for (const ch of raw) {
            const next = cur + ch;
            if (cur && measure(next) > maxWidth) {
                if (NO_LINE_START.includes(ch)) { out.push(next); cur = ''; continue; }
                let head = cur;
                let carry = '';
                while (head && NO_LINE_END.includes(head[head.length - 1])) {
                    carry = head[head.length - 1] + carry;
                    head = head.slice(0, -1);
                }
                out.push(head);
                cur = carry + ch;
                continue;
            }
            cur = next;
        }
        out.push(cur);
    }
    return out;
}

export interface ShareTextBlock {
    lines: string[];
    /** 完整的 canvas font 串（'46px Georgia, serif'） */
    font: string;
    size: number;
    lineHeight: number;
    color: string;
    align: 'left' | 'center';
    /** 画布坐标：这个块第一行的槽顶 */
    y: number;
    /** 内容区左边界（align:center 时是中心） */
    x: number;
    /** 内容区宽度 */
    w: number;
}

export interface ShareRule { x1: number; y1: number; x2: number; y2: number; color: string }

export interface ShareLayout {
    width: number;
    height: number;
    card: {
        x: number; y: number; w: number; h: number; radius: number;
        fill: string;
        /** 卡片上再叠一层色（纸卡版式拿圆点的颜色兑一层很淡的，卡才不会白得看不见） */
        tint?: string;
        stroke?: string;
    };
    /** 卡片内那根竖引用线（简白版式才有） */
    bar?: { x: number; y: number; w: number; h: number; fill: string };
    /** 卡片顶上那颗圆（纸卡版式才有；圆心上沿卡在卡片顶边） */
    circle?: { cx: number; cy: number; r: number; fill: string };
    rules: ShareRule[];
    /** 画在卡片里的字 */
    blocks: ShareTextBlock[];
    /** 画在卡片外、直接落在背景上的字（纸卡版式才有：书名列 + 原文再来一遍） */
    outside: ShareTextBlock[];
    /** 没给底图时铺满画布的底色 */
    canvasFill: string;
}

/** 往上垒字的小笔架：块一块往下摞，返回垒完的高度 */
interface Pen {
    blocks: ShareTextBlock[];
    x: number;
    w: number;
    y: number;
}

function put(
    pen: Pen,
    opts: {
        text: string;
        size: number;
        lineHeight: number;
        stack: string;
        color: string;
        align?: 'left' | 'center';
        /** 这个块**之前**留的空 */
        gapBefore?: number;
        /** 画完这个块之后留的空（含行距） */
        gapAfter?: number;
        /** 最多画几行（超了收省略号） */
        maxLines?: number;
    },
    m: ShareMetrics,
): ShareTextBlock | null {
    const text = String(opts.text ?? '').trim();
    if (!text) return null;
    const font = `${opts.size}px ${opts.stack}`;
    let lines = wrapText(text, pen.w, (s) => m.width(s, font));
    if (opts.maxLines && lines.length > opts.maxLines) {
        lines = lines.slice(0, opts.maxLines);
        const last = lines[lines.length - 1];
        lines[lines.length - 1] = `${last.slice(0, Math.max(1, last.length - 1))}…`;
    }
    pen.y += opts.gapBefore ?? 0;
    const block: ShareTextBlock = {
        lines, font, size: opts.size, lineHeight: opts.lineHeight,
        color: opts.color, align: opts.align ?? 'left', y: pen.y, x: pen.x, w: pen.w,
    };
    pen.blocks.push(block);
    pen.y += lines.length * opts.lineHeight + (opts.gapAfter ?? 0);
    return block;
}

/** 出处那一行（书名 / 作者 / 章节，有什么写什么） */
const originOf = (d: ShareCardData): string =>
    [d.bookTitle, d.author, d.chapterTitle].map((s) => String(s ?? '').trim()).filter(Boolean).join(' · ');

/**
 * 排一张卡。纯函数：同样的输入永远得到同样的版面（单测靠它）。
 * 四种版式对应她给的四路参考（见 readerShareThemes 顶上的注释）。
 */
export function layoutShareCard(data: ShareCardData, style: ShareCardStyle, m: ShareMetrics): ShareLayout {
    const theme: RdShareTheme = shareThemeById(style.themeId);
    const stack = shareFontById(style.fontId).stack;
    // 'none' = 用这张主题自己的底色；'image' = 上传的那张；'bi:xxx' = 打包进来的那张。
    // 后两种都会盖满整张画布，底色只是「图还没到时」的兜底。
    const bg = shareBgById(style.bgId);
    const useThemeCanvas = style.bgId === 'none' || style.bgId === 'image' || style.bgId.startsWith('bi:');
    const themeFill = useThemeCanvas ? theme.canvas : bg.fill;
    const note = style.withNote ? String(data.note ?? '').trim() : '';
    const sign = String(style.sign ?? '').trim();
    const common = { blocks: [] as ShareTextBlock[], x: 0, w: 0, y: 0 };
    const rules: ShareRule[] = [];
    const outside: ShareTextBlock[] = [];

    if (theme.layout === 'quote') {
        // ── 简白：白卡 + 左侧竖引用线 + 引号原文 + 想法 + 日期 ──
        const M = 72;
        const PAD = 64;
        const BAR = 5;
        const BAR_GAP = 38;
        const pen: Pen = {
            blocks: common.blocks,
            x: M + PAD + BAR + BAR_GAP,
            w: SHARE_W - 2 * M - PAD * 2 - BAR - BAR_GAP,
            y: M + PAD,
        };
        const quote = put(pen, { text: `“${data.quote}”`, size: 46, lineHeight: 78, stack, color: theme.ink }, m);
        const noteBlock = put(pen, {
            text: note, size: 34, lineHeight: 58, stack, color: theme.inkSoft, gapBefore: note ? 56 : 0,
        }, m);
        put(pen, { text: data.date, size: 28, lineHeight: 40, stack, color: theme.inkSoft, gapBefore: 48 }, m);
        if (sign) {
            const ruleY = pen.y + 40;
            rules.push({ x1: M + PAD, y1: ruleY, x2: SHARE_W - M - PAD, y2: ruleY, color: theme.rule });
            pen.y = ruleY;
            put(pen, { text: sign, size: 26, lineHeight: 36, stack, color: theme.inkSoft, align: 'center', gapBefore: 40 }, m);
        }
        const cardH = pen.y - M + PAD;
        // 竖线只盖住「原文 + 想法」那一段（参考图里日期是掉在下面的）
        const tail = noteBlock ?? quote;
        const barTop = (quote?.y ?? pen.y) + 12;
        const barBottom = tail ? tail.y + tail.lines.length * tail.lineHeight - 12 : barTop + 24;
        return {
            width: SHARE_W,
            height: M * 2 + cardH,
            card: { x: M, y: M, w: SHARE_W - 2 * M, h: cardH, radius: 44, fill: theme.card, stroke: theme.border },
            bar: { x: M + PAD, y: barTop, w: BAR, h: Math.max(24, barBottom - barTop), fill: theme.accent },
            rules,
            blocks: pen.blocks,
            outside,
            canvasFill: themeFill,
        };
    }

    if (theme.layout === 'circle') {
        // ── 纸卡：顶上一颗圆 + 半透明纸卡 + 书名/横线/原文/作者/日期/横线/落款 ──
        // 卡片下面还留一截背景，把书名和原文再大字写一遍（她给的那五张就是这个样子）
        const CX = 108;
        const PAD = 72;
        const R = 104;
        const TOP = 96 + R;                       // 圆的另一半露在卡片上面
        const cardW = SHARE_W - CX * 2;
        const pen: Pen = { blocks: common.blocks, x: CX + PAD, w: cardW - PAD * 2, y: TOP + PAD + 72 };
        put(pen, { text: `《${data.bookTitle}》`, size: 34, lineHeight: 50, stack, color: theme.ink, gapAfter: 30 }, m);
        rules.push({ x1: CX + PAD, y1: pen.y, x2: CX + cardW - PAD, y2: pen.y, color: theme.rule });
        put(pen, { text: data.quote, size: 46, lineHeight: 78, stack, color: theme.ink, gapBefore: 46 }, m);
        put(pen, {
            text: [data.author, data.chapterTitle].filter(Boolean).join(' · ') || originOf(data),
            size: 30, lineHeight: 44, stack, color: theme.inkSoft, gapBefore: 60,
        }, m);
        put(pen, { text: data.date, size: 26, lineHeight: 38, stack, color: theme.inkSoft, gapBefore: 10 }, m);
        if (note) {
            put(pen, { text: `◇ ${note}`, size: 32, lineHeight: 54, stack, color: theme.inkSoft, gapBefore: 52 }, m);
        }
        if (sign) {
            rules.push({ x1: CX + PAD, y1: pen.y + 56, x2: CX + cardW - PAD, y2: pen.y + 56, color: theme.rule });
            put(pen, { text: sign, size: 26, lineHeight: 36, stack, color: theme.inkSoft, align: 'center', gapBefore: 92 }, m);
        }
        const cardH = pen.y - TOP + PAD;

        // 卡片外那段：背景上再来一遍书名 + 原文（最多两行，长了收省略号）
        const outPen: Pen = { blocks: outside, x: 120, w: SHARE_W - 240, y: TOP + cardH + 104 };
        put(outPen, { text: `《${data.bookTitle}》`, size: 44, lineHeight: 64, stack, color: theme.ink, align: 'center', gapAfter: 26 }, m);
        put(outPen, {
            text: data.quote, size: 48, lineHeight: 74, stack, color: theme.ink, align: 'center', maxLines: 2,
        }, m);

        return {
            width: SHARE_W,
            height: outPen.y + 104,
            card: {
                x: CX, y: TOP, w: cardW, h: cardH, radius: 10,
                // 0.78 而不是更透：底图可能是花里胡哨的，卡太透字就糊了
                // （她 09-26：「花里胡哨的垫在下面，不然会看不清字」）
                fill: 'rgba(255, 255, 255, 0.78)',
                tint: withAlpha(style.dot || theme.accent, 0.14),
                stroke: theme.border,
            },
            circle: { cx: SHARE_W / 2, cy: TOP, r: R, fill: style.dot || theme.accent },
            rules,
            blocks: pen.blocks,
            outside,
            canvasFill: themeFill,
        };
    }

    if (theme.layout === 'sheet') {
        // ── 衬纸：底图（或底色）+ 米白纸质卡 + 大标题 + 副标题 + 正文 + 署名 ──
        const CX = 132;
        const CY = 132;
        const PAD = 78;
        const cardW = SHARE_W - CX * 2;
        const pen: Pen = { blocks: common.blocks, x: CX + PAD, w: cardW - PAD * 2, y: CY + PAD };
        put(pen, { text: data.bookTitle, size: 62, lineHeight: 86, stack, color: theme.accent, gapAfter: 16 }, m);
        put(pen, {
            text: `□ ${[data.chapterTitle, data.author].filter(Boolean).join(' · ')}`,
            size: 28, lineHeight: 40, stack, color: theme.inkSoft, gapAfter: 56,
        }, m);
        put(pen, {
            text: note ? `${data.quote}\n\n◇ ${note}` : data.quote,
            size: 44, lineHeight: 76, stack, color: theme.ink,
        }, m);
        put(pen, {
            text: `—— ${[data.author, `《${data.bookTitle}》`].filter(Boolean).join(' ')}`,
            size: 32, lineHeight: 46, stack, color: theme.inkSoft, gapBefore: 52, gapAfter: sign ? 40 : 0,
        }, m);
        if (sign) put(pen, { text: sign, size: 24, lineHeight: 34, stack, color: theme.inkSoft }, m);
        const cardH = pen.y - CY + PAD;
        return {
            width: SHARE_W,
            height: CY * 2 + cardH,
            card: { x: CX, y: CY, w: cardW, h: cardH, radius: 6, fill: theme.card, stroke: theme.border },
            rules,
            blocks: pen.blocks,
            outside,
            canvasFill: themeFill,
        };
    }

    // ── 夜读：满版深色卡 + 原文 + 出处 ──
    const M = 100;
    const pen: Pen = { blocks: common.blocks, x: M, w: SHARE_W - M * 2, y: 0 };
    put(pen, { text: `“${data.quote}”`, size: 50, lineHeight: 86, stack, color: theme.ink, gapBefore: 108 }, m);
    if (note) put(pen, { text: `◇ ${note}`, size: 34, lineHeight: 58, stack, color: theme.inkSoft, gapBefore: 56 }, m);
    put(pen, {
        text: `/ ${originOf(data)}`, size: 30, lineHeight: 44, stack, color: theme.inkSoft, gapBefore: 64,
    }, m);
    if (sign) put(pen, { text: sign, size: 24, lineHeight: 34, stack, color: theme.inkSoft, align: 'center', gapBefore: 72 }, m);
    const h = pen.y + 108;
    return {
        width: SHARE_W,
        height: h,
        card: { x: 0, y: 0, w: SHARE_W, h, radius: 0, fill: theme.card, stroke: theme.border },
        rules,
        blocks: pen.blocks,
        outside,
        canvasFill: themeFill,
    };
}

/** 圆角矩形路径（自己画：`ctx.roundRect` 在老 iOS 上没有） */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

/** 底图铺满（保持比例裁掉多余的那边，不会拉变形） */
function drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource, w: number, h: number): void {
    const iw = Number((img as HTMLImageElement).width) || 0;
    const ih = Number((img as HTMLImageElement).height) || 0;
    if (!iw || !ih) return;
    const s = Math.max(w / iw, h / ih);
    const dw = iw * s;
    const dh = ih * s;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** 把排好的版面画到画布上（只画，不算）。底图可选，没有就铺 canvasFill。 */
export function drawShareCard(
    ctx: CanvasRenderingContext2D,
    layout: ShareLayout,
    bgImage?: CanvasImageSource | null,
): void {
    const { width, height, card } = layout;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = layout.canvasFill;
    ctx.fillRect(0, 0, width, height);
    if (bgImage) drawCover(ctx, bgImage, width, height);

    roundRectPath(ctx, card.x, card.y, card.w, card.h, card.radius);
    ctx.fillStyle = card.fill;
    ctx.fill();
    if (card.tint) {
        ctx.fillStyle = card.tint;
        ctx.fill();
    }
    if (card.stroke) {
        ctx.strokeStyle = card.stroke;
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    if (layout.circle) {
        ctx.beginPath();
        ctx.arc(layout.circle.cx, layout.circle.cy, layout.circle.r, 0, Math.PI * 2);
        ctx.fillStyle = layout.circle.fill;
        ctx.fill();
    }
    if (layout.bar) {
        roundRectPath(ctx, layout.bar.x, layout.bar.y, layout.bar.w, layout.bar.h, layout.bar.w / 2);
        ctx.fillStyle = layout.bar.fill;
        ctx.fill();
    }
    for (const r of layout.rules) {
        ctx.beginPath();
        ctx.moveTo(r.x1, r.y1);
        ctx.lineTo(r.x2, r.y2);
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    ctx.textBaseline = 'middle';
    for (const b of [...layout.blocks, ...layout.outside]) {
        ctx.font = b.font;
        ctx.fillStyle = b.color;
        ctx.textAlign = b.align;
        const cx = b.align === 'center' ? b.x + b.w / 2 : b.x;
        b.lines.forEach((line, i) => {
            if (!line) return;
            ctx.fillText(line, cx, b.y + i * b.lineHeight + b.lineHeight / 2);
        });
    }
    ctx.textAlign = 'left';
}

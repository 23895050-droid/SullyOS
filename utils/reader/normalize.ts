// 读书模块 · 文本归一化（2026-09-14）
//
// 铁律：**归一化只做一次，落库的文本就是正文本体。** 锚点（段号 + 段内偏移）指向
// 的是落库后的文本，所以这里之后不许再有任何「顺手清一下引号/空格」的再加工——
// 那会让所有既存锚点整体错位（v3 的 V7 会当场破）。要改规则就换 contentRev 重导。

/** 段落：去掉首尾空白与段首缩进，折叠段内连续空白，空行丢弃。 */
export function normalizeParagraph(text: string): string {
    return text
        .replace(/　/g, ' ')      // 全角空格 → 半角（缩进和排版都交给 CSS）
        .replace(/[\t\v\f]/g, ' ')
        .replace(/ {2,}/g, ' ')
        .trim();
}

export function normalizeParagraphs(paras: string[]): string[] {
    const out: string[] = [];
    for (const raw of paras) {
        const p = normalizeParagraph(raw.replace(/\r\n?/g, '\n'));
        if (p) out.push(p);
    }
    return out;
}

/** 句末标点：硬回车断行的 TXT 靠它判断「这一行说完了」。 */
const TERMINAL = /[。！？…”』」》）】\?\!\.]$/;

/**
 * 硬折行还原：中文 TXT 里常见每行固定宽度断开的情况。规则很克制——
 * 只有当**上一行没有句末标点**时才把下一行接上去；对话行几乎都以标点收尾，
 * 所以不会把两个人的对话粘成一段。
 */
export function reflowLines(lines: string[]): string[] {
    const out: string[] = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const prev = out[out.length - 1];
        // 章节标题行是硬边界：不吸收上一行，也不被上一行吸收（标题本身不带句末标点）
        const lineIsHeading = matchChapterHeading(trimmed) !== null;
        const prevIsHeading = prev !== undefined && matchChapterHeading(prev) !== null;
        if (prev && !TERMINAL.test(prev) && !lineIsHeading && !prevIsHeading) {
            out[out.length - 1] = `${prev}${trimmed}`;
        } else {
            out.push(trimmed);
        }
    }
    return out;
}

/** FNV-1a（32 位，十六进制）+ 长度：文本指纹，够用来判断「锚点是不是这一版文本」。 */
export function fnv1a(text: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

export const contentRevOf = (text: string): string => `${fnv1a(text)}:${text.length}`;

// ─── 章节切分 ────────────────────────────────────────────────────

/** 第X章/回/节/卷/篇（中英双轨）。带标题长度与「别把一句话当标题」的护栏。 */
const CN_HEADING = /^第\s*([0-9一二三四五六七八九十百千零两]{1,8})\s*[章回节卷篇部]\s*(.{0,30})$/;
const EN_HEADING = /^(chapter|part|prologue|epilogue)\s*([0-9ivxlcdm]{0,6})\b\s*[:.．]?\s*(.{0,30})$/i;

export interface RawChapter {
    title: string;
    paras: string[];
    /** 插图字节（EPUB 专用）：paras 里的占位段 `\u0000IMG:<下标>\u0000` 按下标引用它，
     *  主线程导入时换成 blobref 令牌（见 importClient）。 */
    images?: Array<{ bytes: ArrayBuffer; mime: string }>;
}

/** 一行是不是章节标题（是就返回标题文本，不是返回 null）。 */
export function matchChapterHeading(line: string): string | null {
    const t = line.trim();
    if (!t || t.length > 40) return null;
    const cn = CN_HEADING.exec(t);
    if (cn) return t;
    const en = EN_HEADING.exec(t);
    if (en) return t;
    // 不认识「光秃秃的数字行」当标题：价格表/清单里的数字会被当成几百个章节，
    // 目录看着像坏了。真识别不出来就走虚拟分卷（分卷只影响目录观感，不动锚点）。
    return null;
}

/** 没命中任何章节结构时的柔性虚拟分卷：约 3000 字 / 卷。 */
export const FALLBACK_CHAPTER_CHARS = 3000;

/**
 * 把归一化后的段落序列切成章节。识别不出结构（标题少于 3 个）就走虚拟分卷——
 * 总比「一本书一章、150 万字」强。
 */
export function splitChapters(paragraphs: string[], fallbackChars = FALLBACK_CHAPTER_CHARS): RawChapter[] {
    const found: Array<{ title: string; start: number }> = [];
    paragraphs.forEach((p, i) => {
        const title = matchChapterHeading(p);
        if (title) found.push({ title, start: i });
    });

    if (found.length < 3) {
        const chapters: RawChapter[] = [];
        for (let i = 0; i < paragraphs.length; i += 1) {
            const slice: string[] = [];
            let chars = 0;
            while (i < paragraphs.length && (chars < fallbackChars || slice.length === 0)) {
                slice.push(paragraphs[i]);
                chars += paragraphs[i].length;
                i++;
            }
            i--;   // 外层循环会再 ++
            chapters.push({ title: `第 ${chapters.length + 1} 卷`, paras: slice });
        }
        return chapters.length > 0 ? chapters : [{ title: '全文', paras: [] }];
    }

    const chapters: RawChapter[] = [];
    // 标题之前的正文（序章/引子）自成一段，别丢
    if (found[0].start > 0) {
        chapters.push({ title: '开篇', paras: paragraphs.slice(0, found[0].start) });
    }
    for (let i = 0; i < found.length; i++) {
        // 标题行本身不进正文（章名交给 chapter.title 渲染，正文里再来一行标题是重复）
        const from = found[i].start + 1;
        const to = i + 1 < found.length ? found[i + 1].start : paragraphs.length;
        chapters.push({ title: found[i].title, paras: paragraphs.slice(from, to) });
    }
    return chapters;
}

/** 把整段文本切成章节（TXT 用；EPUB 走 spine 自己的结构）。 */
export function splitTextToChapters(text: string): RawChapter[] {
    const blocks = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/);
    const paragraphs: string[] = [];
    for (const block of blocks) {
        const lines = block.split('\n');
        for (const p of reflowLines(lines)) {
            const norm = normalizeParagraph(p);
            if (norm) paragraphs.push(norm);
        }
    }
    return splitChapters(paragraphs);
}

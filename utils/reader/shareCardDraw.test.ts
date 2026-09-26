// 书摘分享卡 · 排版（2026-09-26）
//
// 只测**算出来的版面**（真的画布没法单测）。锁三件事：
//   · 折行不会把标点甩到行首、不会让开引号孤零零留在行尾
//   · 四种版式都算得出高度，卡片和每一行字都落在画布里（「存下来是半张图」这种事故）
//   · 开关真的管用（关掉想法就没有想法、落款留空就不画那行）
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_SHARE_STYLE, SHARE_W, layoutShareCard, shareDayOf, toHex6, wrapText,
    type ShareCardData, type ShareMetrics,
} from './shareCardDraw';
import {
    RD_SHARE_BUILTIN_BGS, RD_SHARE_BUILTIN_FONTS, RD_SHARE_BGS, RD_SHARE_FONTS, RD_SHARE_THEMES,
    builtinBgOf, builtinFontFamily, shareBgById, shareFontById,
} from '../../apps/reader/readerShareThemes';

/** 假装每个汉字都占一个字号那么宽（和真实中文排版很接近，够验折行了） */
const metrics: ShareMetrics = {
    width: (text, font) => [...text].length * Number(/(\d+)px/.exec(font)?.[1] ?? 16),
};

const data: ShareCardData = {
    quote: '我是雨和雪的老熟人了，我有九十岁了。雨雪看老了我，我也把它们给看老了。',
    bookTitle: '额尔古纳河右岸',
    author: '迟子建',
    chapterTitle: '第一章',
    note: '写老人和岁月，一句就把一辈子说完了。',
    date: '2026.09.26',
};

describe('wrapText · 折行', () => {
    it('每行都不超过给的那点宽度（唯一的例外是行尾挂着的那一个标点）', () => {
        const lines = wrapText(data.quote, 200, (s) => [...s].length * 46);
        expect(lines.length).toBeGreaterThan(1);
        for (const line of lines) {
            const w = [...line].length * 46;
            if (w <= 200) continue;
            // 标点悬挂：宁可让这一个标点挤出去，也不把它甩到下一行开头
            expect(w, `宽得离谱：${line}`).toBeLessThanOrEqual(200 + 46);
            expect('，。、；：？！）」』】…—·'.includes(line[line.length - 1]), `不是标点还超宽：${line}`).toBe(true);
        }
        // 一个字都没丢
        expect(lines.join('')).toBe(data.quote);
    });

    it('行首不落标点——标点宁可挤在上一行末尾', () => {
        const text = '他说，这是最后一次了，然后就走了。';
        const lines = wrapText(text, 120, (s) => [...s].length * 40);   // 一行恰好 3 个字
        for (const line of lines) {
            expect('，。、；：？！）」』】…—·'.includes(line[0]), `行首是标点：${line}`).toBe(false);
        }
    });

    it('开引号不留行尾（跟着下一行走）', () => {
        const lines = wrapText('他开口说「你好啊老朋友」，然后就走了。', 120, (s) => [...s].length * 40);
        for (const line of lines) {
            expect('（「『【〈《'.includes(line[line.length - 1]), `行尾是开引号：${line}`).toBe(false);
        }
    });

    it('显式换行照拆（衬纸版式靠空行分段）', () => {
        expect(wrapText('上段\n\n下段', 9999, (s) => [...s].length)).toEqual(['上段', '', '下段']);
    });

    it('宽度给 0 / 空文本 → 空数组（不炸）', () => {
        expect(wrapText('随便', 0, (s) => [...s].length)).toEqual([]);
        expect(wrapText('', 100, (s) => [...s].length)).toEqual(['']);
    });
});

describe('卡片底色 / 不透明度 / 字色（她 09-26 追加的三样）', () => {
    const base = { ...DEFAULT_SHARE_STYLE, themeId: 'plain' } as const;

    it('不调 → 老老实实用主题自己的那套', () => {
        const t = RD_SHARE_THEMES.find((x) => x.id === 'plain')!;
        const lay = layoutShareCard(data, base, metrics);
        expect(lay.card.fill).toBe(t.card);
        expect(lay.blocks[0].color).toBe(t.ink);
    });

    it('调了底色就按她的来；不写透明度就是全不透明', () => {
        const lay = layoutShareCard(data, { ...base, cardColor: 'rgb(20, 30, 40)' }, metrics);
        expect(lay.card.fill).toBe('rgba(20, 30, 40, 1)');
    });

    it('透明度单独调 → 换的是主题那一层的透明度', () => {
        const lay = layoutShareCard(data, { ...base, cardAlpha: 50 }, metrics);
        expect(lay.card.fill).toBe('rgba(255, 255, 255, 0.5)');
    });

    it('字色一改，正文和那层小字一起跟着走（小字淡一档，层级还在）', () => {
        const lay = layoutShareCard(data, { ...base, inkColor: 'rgb(240, 240, 240)' }, metrics);
        const colors = lay.blocks.map((b) => b.color);
        expect(colors[0]).toBe('rgb(240, 240, 240)');                 // 原文
        expect(colors.some((c) => c.startsWith('rgba(240, 240, 240, 0.62)'))).toBe(true);   // 日期/落款
        for (const r of lay.rules) expect(r.color.startsWith('rgba(240, 240, 240')).toBe(true);
    });

    it('纸卡自己挑了底色就不再兑圆点那层色（别在她的选择上再糊一层）', () => {
        const paper = { ...DEFAULT_SHARE_STYLE, themeId: 'paper', dot: 'rgb(238, 150, 160)' } as const;
        expect(layoutShareCard(data, paper, metrics).card.tint).toBeTruthy();
        expect(layoutShareCard(data, { ...paper, cardColor: 'rgb(20, 30, 40)' }, metrics).card.tint).toBeUndefined();
    });

    it('从色轮挑的 #hex 也认——不认的话她的选择会变成白卡', () => {
        expect(layoutShareCard(data, { ...base, cardColor: '#1a2b3c' }, metrics).card.fill)
            .toBe('rgba(26, 43, 60, 1)');
        expect(layoutShareCard(data, { ...base, cardColor: '#abc', cardAlpha: 40 }, metrics).card.fill)
            .toBe('rgba(170, 187, 204, 0.4)');
        expect(layoutShareCard(data, { ...base, inkColor: '#ffeedd' }, metrics).blocks[0].color)
            .toBe('#ffeedd');
    });

    it('toHex6：#rrggbb 是原生取色器唯一认的格式', () => {
        expect(toHex6('rgb(255, 255, 255)')).toBe('#ffffff');
        expect(toHex6('rgba(26, 28, 32, 0.9)')).toBe('#1a1c20');
        expect(toHex6('#0a0B0c')).toBe('#0a0b0c');
        expect(toHex6('#abc')).toBe('#aabbcc');
        expect(toHex6('说不清是什么')).toBe('#000000');
    });
});

describe('内置素材（她 09-26 给的那批）', () => {
    it('内置字体认得出，族名对得上注册时那个', () => {
        expect(shareFontById('bf:hug').stack).toContain(builtinFontFamily('hug'));
        expect(shareFontById('bf:letter').label).toBe('见字如面');
    });

    it('不认识的 id 老老实实回落，不炸', () => {
        expect(shareFontById('bf:nope').id).toBe(RD_SHARE_FONTS[0].id);
        expect(builtinBgOf('bi:nope')).toBeUndefined();
        expect(shareBgById('bi:nope').id).toBe(RD_SHARE_BGS[0].id);
    });

    it('内置底图铺满整张画布 → 底色退回主题自己的（图没到的时候才看得见）', () => {
        const lay = layoutShareCard(data, { ...DEFAULT_SHARE_STYLE, themeId: 'plain', bgId: 'bi:paper' }, metrics);
        expect(lay.canvasFill).toBe(RD_SHARE_THEMES.find((t) => t.id === 'plain')!.canvas);
    });

    it('每个内置素材的 id 和文件名都不重样（重了就会串图）', () => {
        const files = RD_SHARE_BUILTIN_BGS.map((b) => b.file);
        const ids = RD_SHARE_BUILTIN_BGS.map((b) => b.id);
        expect(new Set(files).size).toBe(files.length);
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(RD_SHARE_BUILTIN_FONTS.map((f) => f.id)).size).toBe(RD_SHARE_BUILTIN_FONTS.length);
    });
});

describe('shareDayOf · 卡上那个日期戳', () => {
    it('补齐两位：2026.09.06', () => {
        expect(shareDayOf(new Date(2026, 8, 6, 12).toISOString())).toBe('2026.09.06');
    });

    it('给不出时间（没写批注的那种划线）→ 用今天', () => {
        expect(shareDayOf()).toBe(shareDayOf(new Date().toISOString()));
    });

    it('脏值不抛，退成空串', () => {
        expect(shareDayOf('不是时间')).toBe('');
    });
});

describe('layoutShareCard · 四种版式都排得出来', () => {
    it('每一版：卡片在画布内、字在卡片内、画布高度够装下', () => {
        for (const theme of RD_SHARE_THEMES) {
            const lay = layoutShareCard(data, { ...DEFAULT_SHARE_STYLE, themeId: theme.id }, metrics);
            expect(lay.width, theme.id).toBe(SHARE_W);
            expect(lay.height, theme.id).toBeGreaterThan(200);
            expect(lay.card.x, theme.id).toBeGreaterThanOrEqual(0);
            expect(lay.card.y, theme.id).toBeGreaterThanOrEqual(0);
            expect(lay.card.x + lay.card.w, theme.id).toBeLessThanOrEqual(SHARE_W);
            expect(lay.card.y + lay.card.h, theme.id).toBeLessThanOrEqual(lay.height + 1);

            const boxes = [...lay.blocks, ...lay.outside];
            expect(boxes.length, theme.id).toBeGreaterThan(2);
            for (const b of boxes) {
                expect(b.y, `${theme.id} 的字跑到画布上面了`).toBeGreaterThanOrEqual(0);
                expect(b.y + b.lines.length * b.lineHeight, `${theme.id} 的字冲出画布了`)
                    .toBeLessThanOrEqual(lay.height + 1);
            }
        }
    });

    it('简白版式有那根竖引用线，长度盖住原文那一段', () => {
        const lay = layoutShareCard(data, { ...DEFAULT_SHARE_STYLE, themeId: 'plain' }, metrics);
        expect(lay.bar).toBeTruthy();
        expect(lay.bar!.h).toBeGreaterThan(40);
    });

    it('纸卡版式有那颗圆，圆心落在卡片顶边上', () => {
        const lay = layoutShareCard(data, { ...DEFAULT_SHARE_STYLE, themeId: 'paper', dot: 'rgb(1, 2, 3)' }, metrics);
        expect(lay.circle?.cy).toBe(lay.card.y);
        expect(lay.circle?.fill).toBe('rgb(1, 2, 3)');
        expect(lay.circle!.cy - lay.circle!.r).toBeGreaterThanOrEqual(0);   // 圆的上半截也得在画布里
    });

    it('纸卡版式卡片下面还有一段背景大字（书名 + 原文）', () => {
        const lay = layoutShareCard(data, { ...DEFAULT_SHARE_STYLE, themeId: 'paper' }, metrics);
        expect(lay.outside.length).toBe(2);
        expect(lay.outside[0].lines.join('')).toContain('额尔古纳河右岸');
        expect(lay.outside[1].lines.length).toBeLessThanOrEqual(2);        // 再长也收在两行
    });

    it('关掉想法 → 卡上没有那行字；落款留空 → 不画落款', () => {
        for (const theme of RD_SHARE_THEMES) {
            const withNote = layoutShareCard(data, { ...DEFAULT_SHARE_STYLE, themeId: theme.id, withNote: true, sign: '' }, metrics);
            const without = layoutShareCard(data, { ...DEFAULT_SHARE_STYLE, themeId: theme.id, withNote: false, sign: '' }, metrics);
            const flat = (l: typeof withNote) => l.blocks.flatMap((b) => b.lines).join('');
            expect(flat(withNote), theme.id).toContain('一辈子说完了');
            expect(flat(without), theme.id).not.toContain('一辈子说完了');
            expect(flat(without), theme.id).not.toContain('书房');
            expect(without.height, theme.id).toBeLessThanOrEqual(withNote.height);
        }
    });

    it('没作者没章节也排得出来（出处那行退成只有书名）', () => {
        const lay = layoutShareCard({ quote: '短句', bookTitle: '某本书', date: '2026.01.01' },
            { ...DEFAULT_SHARE_STYLE, themeId: 'night' }, metrics);
        expect(lay.blocks.flatMap((b) => b.lines).join('')).toContain('某本书');
    });

    it('超长的原文：纸卡版式外面那段收在两行，卡片里那段一行不丢', () => {
        const long = { ...data, quote: '很长的一句话。'.repeat(60) };
        const lay = layoutShareCard(long, { ...DEFAULT_SHARE_STYLE, themeId: 'paper' }, metrics);
        const inside = lay.blocks.flatMap((b) => b.lines).join('');
        expect(inside).toContain('很长的一句话。'.repeat(60));
        expect(lay.outside[1].lines.length).toBe(2);
        expect(lay.outside[1].lines[1].endsWith('…')).toBe(true);
    });
});

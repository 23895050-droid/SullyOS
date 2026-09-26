// 书摘分享卡 · 排版（2026-09-26）
//
// 只测**算出来的版面**（真的画布没法单测）。锁三件事：
//   · 折行不会把标点甩到行首、不会让开引号孤零零留在行尾
//   · 四种版式都算得出高度，卡片和每一行字都落在画布里（「存下来是半张图」这种事故）
//   · 开关真的管用（关掉想法就没有想法、落款留空就不画那行）
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_SHARE_STYLE, SHARE_W, layoutShareCard, shareDayOf, wrapText,
    type ShareCardData, type ShareMetrics,
} from './shareCardDraw';
import { RD_SHARE_THEMES } from '../../apps/reader/readerShareThemes';

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

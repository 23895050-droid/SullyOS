// 读书模块 · 分页纯函数单测（2026-09-15 改横排后：列几何）
// 只测不依赖布局的部分：x → 列号、layoutKey。真正的度量（列里有哪些字）在浏览器里跑，
// 靠 .tmp-reader/ 的截图自检（见计划里的截图自检条目）。
import { describe, expect, it } from 'vitest';
import { columnOfX, layoutKeyOf, type PageSlice } from './paginate';

const STEP = 430;   // 一页的横向跨度 = 列宽 + 列间距 = 视口宽

describe('paginate · columnOfX', () => {
    it('落在列中间/边界都能定位', () => {
        expect(columnOfX(0, STEP)).toBe(0);
        expect(columnOfX(429, STEP)).toBe(0);
        expect(columnOfX(430, STEP)).toBe(1);
        expect(columnOfX(900, STEP)).toBe(2);
        expect(columnOfX(1290, STEP)).toBe(3);
    });

    it('越界夹到 0（锚点比正文靠前/负位移都不会算出负页）', () => {
        expect(columnOfX(-50, STEP)).toBe(0);
        expect(columnOfX(-0.4, STEP)).toBe(0);
    });

    it('步长非法时不炸（还没量出视口宽的第一次渲染）', () => {
        expect(columnOfX(500, 0)).toBe(0);
        expect(columnOfX(500, Number.NaN)).toBe(0);
    });
});

describe('paginate · PageSlice 形状', () => {
    it('图片段落用零长切片占位（字数不参与统计，但段号要能落在页里）', () => {
        const s: PageSlice = { paraIdx: 7, startOffset: 0, endOffset: 0 };
        expect(s.endOffset - s.startOffset).toBe(0);
    });
});

describe('paginate · layoutKeyOf', () => {
    it('书/章/视口/排版指纹任一变化都换 key；相同输入稳定', () => {
        const m = { width: 430, height: 700, fontKey: 'serif|17|1.9' };
        const a = layoutKeyOf('bk_1', 3, m);
        expect(a).toBe(layoutKeyOf('bk_1', 3, m));
        expect(a).not.toBe(layoutKeyOf('bk_1', 4, m));                       // 换章
        expect(a).not.toBe(layoutKeyOf('bk_2', 3, m));                       // 换书
        expect(a).not.toBe(layoutKeyOf('bk_1', 3, { ...m, height: 701 }));   // 视口变了
        expect(a).not.toBe(layoutKeyOf('bk_1', 3, { ...m, fontKey: 'serif|18|1.9' })); // 字号变了
    });

    it('亚像素抖动不至于每次都重算（取整）', () => {
        const a = layoutKeyOf('bk', 0, { width: 430.2, height: 700.4, fontKey: 'x' });
        const b = layoutKeyOf('bk', 0, { width: 430.4, height: 699.6, fontKey: 'x' });
        expect(a).toBe(b);
    });
});

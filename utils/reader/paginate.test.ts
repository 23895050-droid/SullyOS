// 读书模块 · 分页纯函数单测（2026-09-14）
// 只测不依赖布局的部分：页表查找与 layoutKey。真正的度量（行矩形切页）在浏览器里跑，
// 靠 .tmp-reader/ 的截图自检（见计划里的截图自检条目）。
import { describe, expect, it } from 'vitest';
import { layoutKeyOf, pageIndexAt, type RdPageBox } from './paginate';

const pages: RdPageBox[] = [
    { index: 0, top: 0, height: 600, fromPara: 0, toPara: 3 },
    { index: 1, top: 600, height: 600, fromPara: 3, toPara: 7 },
    { index: 2, top: 1200, height: 480, fromPara: 7, toPara: 9 },
];

describe('paginate · pageIndexAt', () => {
    it('落在页中间/边界都能定位', () => {
        expect(pageIndexAt(pages, 0)).toBe(0);
        expect(pageIndexAt(pages, 599)).toBe(0);
        expect(pageIndexAt(pages, 600)).toBe(1);
        expect(pageIndexAt(pages, 900)).toBe(1);
        expect(pageIndexAt(pages, 1200)).toBe(2);
        expect(pageIndexAt(pages, 1679)).toBe(2);
    });

    it('越界夹到两端（进度恢复时锚点比页表靠后也不会崩）', () => {
        expect(pageIndexAt(pages, -50)).toBe(0);
        expect(pageIndexAt(pages, 99999)).toBe(2);
        expect(pageIndexAt([], 100)).toBe(0);
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

// 读书模块 · 皮肤层守卫（2026-09-14）
// 这条守卫是 V5「换肤只改变量表、不靠 !important」的成本最低的保险：
// 骨架层一旦混进写死的色值/字号，皮肤就再也接管不了（音乐线就是这么返工过一次的）。
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { READER_SKELETON_CSS } from '../../apps/reader/readerCss';
import { READER_SKINS, READER_VAR_KEYS, skinById } from '../../apps/reader/readerSkinPresets';
import { buildReaderCss, typographyVars } from '../../apps/reader/ReaderSkinPreset';
import { DEFAULT_PREFS, DEFAULT_TYPOGRAPHY } from '../../apps/reader/readerPrefs';

const READER_DIR = join(process.cwd(), 'apps', 'reader');

/** 骨架层文件（可以出现 var(--rd-*)，不许出现字面色值/字号） */
const SKELETON_FILES = ['readerCss.ts', 'ReaderSkinPreset.tsx'];

/** 允许写字面值的地方：皮肤表（它就是变量表本体）与设置默认值 */
const LITERAL_OK = new Set(['readerSkinPresets.ts', 'readerPrefs.ts']);

describe('readerCss · 骨架层不允许出现写死的视觉值', () => {
    const read = (f: string) => readFileSync(join(READER_DIR, f), 'utf-8');

    it('骨架 CSS 里没有 #hex / rgb() / px 字号', () => {
        // 变量声明行本身是「默认值」，允许；规则体里不许再出现
        const ruleBodies = READER_SKELETON_CSS
            .split('\n')
            .filter((line) => !/^\s*--rd-/.test(line))
            .join('\n')
            // rgba(var(--rd-hl-rgb), .32) 是「拿变量做透明度合成」，不是写死颜色，放行
            .replace(/rgba\(var\(--rd-[a-z0-9-]+\)/g, '');
        expect(ruleBodies).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(ruleBodies).not.toMatch(/\brgba?\(/);
        expect(ruleBodies).not.toMatch(/font-size:\s*\d/);
        expect(ruleBodies).not.toMatch(/border-radius:\s*\d/);
    });

    it('骨架层文件与阅读器组件里没有内联色值（颜色只能走变量）', () => {
        for (const dir of ['', 'tabs']) {
            const path = dir ? join(READER_DIR, dir) : READER_DIR;
            if (!existsSync(path)) continue;   // tabs/ 还没建时不算失败
            for (const name of readdirSync(path)) {
                if (LITERAL_OK.has(name)) continue;
                const full = join(path, name);
                if (!statSync(full).isFile()) continue;
                if (!/\.(ts|tsx)$/.test(name) || name.endsWith('.test.ts')) continue;
                const src = readFileSync(full, 'utf-8');
                const colorLiterals = src.match(/#[0-9a-fA-F]{6}\b/g) || [];
                expect(colorLiterals, `${name} 里有写死的色值：${colorLiterals.join(', ')}`).toEqual([]);
            }
        }
    });
});

describe('readerSkinPresets · 皮肤表与变量词典', () => {
    it('每张皮肤都覆盖同一批变量名（换肤不会漏掉某个槽）', () => {
        for (const skin of READER_SKINS) {
            for (const key of READER_VAR_KEYS) {
                expect(skin.vars[key], `${skin.id} 缺 ${key}`).toBeTruthy();
            }
        }
    });

    it('未知皮肤 id 落回默认皮肤', () => {
        expect(skinById('不存在的').id).toBe(READER_SKINS[0].id);
    });

    it('每张皮肤都给了工具栏底色/字色（选中文字那条浮条）', () => {
        for (const skin of READER_SKINS) {
            expect(skin.vars['--rd-toolbar-bg'], `${skin.id} 缺工具栏底色`).toBeTruthy();
            expect(skin.vars['--rd-toolbar-ink'], `${skin.id} 缺工具栏字色`).toBeTruthy();
        }
    });
});

describe('ReaderSkinPreset · 四层拼装顺序', () => {
    it('骨架 → 皮肤/排版 → 用户全局 → 用户分页（后写的同权重胜出）', () => {
        const css = buildReaderCss({
            ...DEFAULT_PREFS,
            themeId: 'night',
            cssGlobal: '.rd-para { letter-spacing: 0.02em; }',
            cssPages: { shelf: '.rd-book-card { opacity: 0.9; }' },
        });
        const iSkeleton = css.indexOf('.rd-root {');
        // 皮肤层的定位标记：骨架层不声明任何 --rd-* 颜色（只有 var() 引用），
        // 所以第一处 `--rd-x: ` 声明就落在皮肤那一层——不绑具体色值，改皮肤不会误伤这条。
        const iSkin = css.indexOf('--rd-paper: ');
        const iUserGlobal = css.indexOf('.rd-root.rd-user {');
        const iUserPage = css.indexOf('[data-rd-page="shelf"]');
        expect(iSkeleton).toBeGreaterThanOrEqual(0);
        expect(iSkin).toBeGreaterThan(iSkeleton);
        expect(iUserGlobal).toBeGreaterThan(iSkin);
        expect(iUserPage).toBeGreaterThan(iUserGlobal);
    });

    it('没有用户 CSS 时不产出空层', () => {
        const css = buildReaderCss({ ...DEFAULT_PREFS, cssGlobal: '', cssPages: {} });
        expect(css).not.toContain('.rd-root.rd-user');
    });

    it('排版设置映射进变量（字号/行高/缩进/页边距）', () => {
        const vars = typographyVars({ ...DEFAULT_TYPOGRAPHY, fontSize: 20, lineHeight: 2.1, paragraphIndent: 0, margin: 30 });
        expect(vars['--rd-fs-body']).toBe('20px');
        expect(vars['--rd-lh-body']).toBe('2.1');
        expect(vars['--rd-para-indent']).toBe('0em');
        expect(vars['--rd-page-gutter']).toBe('30px');
    });

    it('离谱的排版数值会被夹住（防手滑输入 500px）', () => {
        const vars = typographyVars({ ...DEFAULT_TYPOGRAPHY, fontSize: 900, margin: 2, lineHeight: 99 });
        expect(vars['--rd-fs-body']).toBe('30px');
        expect(vars['--rd-page-gutter']).toBe('8px');
        expect(vars['--rd-lh-body']).toBe('3');
    });
});

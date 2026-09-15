// 读书模块 · 皮肤表（2026-09-14 立项 / 2026-09-15 UI 轮扩表）
//
// 「换皮肤 = 换一张变量表」——组件层只认 var(--rd-*)，一份皮肤就是一组变量覆盖。
// 皮肤**只管颜色/材质**；字号/行高/缩进属于排版（用户可调，见 readerPrefs.typography）。
//
// 三套表面：外壳（--rd-bg/--rd-card，书架·笔记·统计·设置）／纸面（--rd-paper，阅读页）／
// 浮层（--rd-sheet-bg）。夜间皮肤把三套一起变暗，纸面单独留着护眼的低对比。
//
// ⚠️ 词典是**全表**：每张皮肤都必须覆盖 READER_VAR_KEYS 里的每一个名字（守卫测试盯着），
// 漏一个 = 那套皮肤下某处没有颜色。

export interface ReaderSkin {
    id: string;
    label: string;
    /** 暗色皮肤要同步告诉系统：滚动条/原生控件跟着走 */
    dark?: boolean;
    /** 主题面板的分组：纸纹（带织物纹理）／纯色。缺省 = 纯色 */
    group?: 'color' | 'texture';
    vars: Record<string, string>;
}

/** --rd-* 变量词典（骨架层允许出现的全部名字） */
export const READER_VAR_KEYS = [
    // 外壳
    '--rd-bg', '--rd-bg-2', '--rd-card', '--rd-nav-bg', '--rd-sheet-bg',
    // 纸面
    '--rd-paper', '--rd-paper-2', '--rd-paper-tex',
    // 文字与线
    '--rd-ink', '--rd-ink-soft', '--rd-ink-rgb', '--rd-rule', '--rd-rule-soft',
    // 强调色
    '--rd-accent', '--rd-accent-rgb', '--rd-accent-soft', '--rd-on-accent',
    // 进度与图表
    '--rd-track', '--rd-bar-fill', '--rd-chart-bar', '--rd-knob',
    // 胶囊
    '--rd-chip-bg', '--rd-chip-on-bg', '--rd-chip-on-ink',
    // 没有封面时的纸样封面
    '--rd-cover-a', '--rd-cover-b', '--rd-cover-ink',
    // 浮层与状态
    '--rd-scrim', '--rd-on-scrim', '--rd-veil', '--rd-danger',
    // 书签丝带（纸上的实物红，不跟着皮肤走）
    '--rd-ribbon',
    // 阴影
    '--rd-shadow', '--rd-shadow-sm',
] as const;

/** 亚麻布纹（书页那层很淡的织物纹理；素白/夜间用 none） */
const LINEN = [
    'repeating-linear-gradient(0deg, rgba(126, 100, 64, 0.022) 0 1px, transparent 1px 3px)',
    'repeating-linear-gradient(90deg, rgba(126, 100, 64, 0.018) 0 1px, transparent 1px 3px)',
].join(', ');

const BASE_SKINS: ReaderSkin[] = [
    {
        id: 'paper',
        label: '纸白',
        group: 'texture',
        vars: {
            '--rd-bg': '#f4f1ec',
            '--rd-bg-2': '#e9e5de',
            '--rd-card': '#ffffff',
            '--rd-nav-bg': '#fbfaf8',
            '--rd-sheet-bg': '#fbf9f6',
            '--rd-paper': '#f7f1e6',
            '--rd-paper-2': '#f2ebdf',
            '--rd-paper-tex': LINEN,
            '--rd-ink': '#2a2622',
            '--rd-ink-soft': '#8a8178',
            '--rd-ink-rgb': '42, 38, 34',
            '--rd-rule': 'rgba(42, 38, 34, 0.10)',
            '--rd-rule-soft': 'rgba(42, 38, 34, 0.06)',
            '--rd-accent': '#4a7ba7',
            '--rd-accent-rgb': '74, 123, 167',
            '--rd-accent-soft': '#e7eff6',
            '--rd-on-accent': '#ffffff',
            '--rd-track': '#e4dfd7',
            '--rd-bar-fill': '#4a7ba7',
            '--rd-chart-bar': '#c6d6e4',
            '--rd-knob': '#ffffff',
            '--rd-chip-bg': '#ffffff',
            '--rd-chip-on-bg': '#2a2622',
            '--rd-chip-on-ink': '#f7f4ef',
            '--rd-cover-a': '#eee8de',
            '--rd-cover-b': '#ded5c6',
            '--rd-cover-ink': '#6b6157',
            '--rd-scrim': 'rgba(30, 26, 22, 0.38)',
            '--rd-on-scrim': '#fbf9f6',
            '--rd-veil': '#000000',
            '--rd-danger': '#c1544f',
            '--rd-ribbon': '#e0453a',
            '--rd-shadow': '0 10px 30px rgba(42, 38, 34, 0.10)',
            '--rd-shadow-sm': '0 2px 10px rgba(42, 38, 34, 0.06)',
        },
    },
    {
        id: 'night',
        label: '夜色',
        dark: true,
        vars: {
            '--rd-bg': '#0f1013',
            '--rd-bg-2': '#1b1d21',
            '--rd-card': '#1a1c20',
            '--rd-nav-bg': '#14161a',
            '--rd-sheet-bg': '#17191d',
            '--rd-paper': '#14161a',
            '--rd-paper-2': '#191c21',
            '--rd-paper-tex': 'none',
            '--rd-ink': '#e6e2da',
            '--rd-ink-soft': '#a29d95',
            '--rd-ink-rgb': '230, 226, 218',
            '--rd-rule': 'rgba(230, 226, 218, 0.14)',
            '--rd-rule-soft': 'rgba(230, 226, 218, 0.08)',
            '--rd-accent': '#82a9d6',
            '--rd-accent-rgb': '130, 169, 214',
            '--rd-accent-soft': '#1e2833',
            '--rd-on-accent': '#0e1116',
            '--rd-track': '#2a2e35',
            '--rd-bar-fill': '#82a9d6',
            '--rd-chart-bar': '#4a6076',
            '--rd-knob': '#e6e2da',
            '--rd-chip-bg': '#1b1d21',
            '--rd-chip-on-bg': '#e6e2da',
            '--rd-chip-on-ink': '#14161a',
            '--rd-cover-a': '#23262b',
            '--rd-cover-b': '#1a1c20',
            '--rd-cover-ink': '#a9a49c',
            '--rd-scrim': 'rgba(0, 0, 0, 0.55)',
            '--rd-on-scrim': '#efebe4',
            '--rd-veil': '#000000',
            '--rd-danger': '#d97a72',
            '--rd-ribbon': '#ef5a4d',
            '--rd-shadow': '0 10px 30px rgba(0, 0, 0, 0.45)',
            '--rd-shadow-sm': '0 2px 10px rgba(0, 0, 0, 0.35)',
        },
    },
    {
        id: 'sepia',
        label: '羊皮纸',
        group: 'texture',
        vars: {
            '--rd-bg': '#eadfc8',
            '--rd-bg-2': '#dfd2b8',
            '--rd-card': '#f7efde',
            '--rd-nav-bg': '#f3e9d6',
            '--rd-sheet-bg': '#f5ebd8',
            '--rd-paper': '#ede0c6',
            '--rd-paper-2': '#e6d8bc',
            '--rd-paper-tex': LINEN,
            '--rd-ink': '#3b2f22',
            '--rd-ink-soft': '#7a6a52',
            '--rd-ink-rgb': '59, 47, 34',
            '--rd-rule': 'rgba(59, 47, 34, 0.16)',
            '--rd-rule-soft': 'rgba(59, 47, 34, 0.10)',
            '--rd-accent': '#96603a',
            '--rd-accent-rgb': '150, 96, 58',
            '--rd-accent-soft': '#f0e2cc',
            '--rd-on-accent': '#fdf8ef',
            '--rd-track': '#d9c9aa',
            '--rd-bar-fill': '#96603a',
            '--rd-chart-bar': '#c7a87e',
            '--rd-knob': '#fdf8ef',
            '--rd-chip-bg': '#f7efde',
            '--rd-chip-on-bg': '#3b2f22',
            '--rd-chip-on-ink': '#f7efde',
            '--rd-cover-a': '#f0e0c4',
            '--rd-cover-b': '#dcc6a0',
            '--rd-cover-ink': '#6d5c45',
            '--rd-scrim': 'rgba(59, 47, 34, 0.4)',
            '--rd-on-scrim': '#f7efde',
            '--rd-veil': '#000000',
            '--rd-danger': '#a8462f',
            '--rd-ribbon': '#e0453a',
            '--rd-shadow': '0 10px 30px rgba(59, 47, 34, 0.14)',
            '--rd-shadow-sm': '0 2px 10px rgba(59, 47, 34, 0.10)',
        },
    },
    {
        id: 'plain',
        label: '素白',
        vars: {
            '--rd-bg': '#f2f2f5',
            '--rd-bg-2': '#e7e7eb',
            '--rd-card': '#ffffff',
            '--rd-nav-bg': '#fafafc',
            '--rd-sheet-bg': '#ffffff',
            '--rd-paper': '#ffffff',
            '--rd-paper-2': '#f7f7f9',
            '--rd-paper-tex': 'none',
            '--rd-ink': '#1d1d1f',
            '--rd-ink-soft': '#8a8a8e',
            '--rd-ink-rgb': '29, 29, 31',
            '--rd-rule': 'rgba(29, 29, 31, 0.12)',
            '--rd-rule-soft': 'rgba(29, 29, 31, 0.07)',
            '--rd-accent': '#3b78c3',
            '--rd-accent-rgb': '59, 120, 195',
            '--rd-accent-soft': '#eaf1fa',
            '--rd-on-accent': '#ffffff',
            '--rd-track': '#e5e5ea',
            '--rd-bar-fill': '#3b78c3',
            '--rd-chart-bar': '#c3d7ec',
            '--rd-knob': '#ffffff',
            '--rd-chip-bg': '#ffffff',
            '--rd-chip-on-bg': '#1d1d1f',
            '--rd-chip-on-ink': '#ffffff',
            '--rd-cover-a': '#f0f0f3',
            '--rd-cover-b': '#dcdce2',
            '--rd-cover-ink': '#6f6f76',
            '--rd-scrim': 'rgba(24, 24, 27, 0.38)',
            '--rd-on-scrim': '#ffffff',
            '--rd-veil': '#000000',
            '--rd-danger': '#c0392b',
            '--rd-ribbon': '#e0453a',
            '--rd-shadow': '0 10px 30px rgba(24, 24, 27, 0.10)',
            '--rd-shadow-sm': '0 2px 10px rgba(24, 24, 27, 0.06)',
        },
    },
];

// ── 派生皮肤 ──────────────────────────────────────────────────────────────
// 上面四张（纸白/夜色/羊皮纸/素白）是手调过的，保持原样。下面这一批是「给几个
// 种子色、其余推出来」——以后想加一套皮肤就是加一个 seed 的事。
const chan = (hex: string): number[] => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
const h2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
/** 两个色按 t（0~1）混 */
const mix = (a: string, b: string, t: number): string => {
    const A = chan(a);
    const B = chan(b);
    return `#${A.map((v, i) => h2(v + (B[i] - v) * t)).join('')}`;
};
const trip = (hex: string) => chan(hex).join(', ');
const alpha = (hex: string, a: number) => `rgba(${trip(hex)}, ${a})`;

interface SkinSeed {
    paper: string;
    paper2: string;
    card: string;
    bg: string;
    ink: string;
    inkSoft: string;
    accent: string;
    onAccent?: string;
    tex?: boolean;
}

function derived(id: string, label: string, seed: SkinSeed, dark = false): ReaderSkin {
    const { paper, paper2, card, bg, ink, inkSoft, accent, tex } = seed;
    const onAccent = seed.onAccent ?? (dark ? '#0e1116' : '#ffffff');
    const onScrim = dark ? '#efebe4' : '#fbf9f6';
    return {
        id,
        label,
        dark,
        group: tex ? 'texture' : 'color',
        vars: {
            '--rd-bg': bg,
            '--rd-bg-2': mix(bg, ink, 0.06),
            '--rd-card': card,
            '--rd-nav-bg': mix(card, bg, 0.45),
            '--rd-sheet-bg': mix(card, bg, 0.25),
            '--rd-paper': paper,
            '--rd-paper-2': paper2,
            '--rd-paper-tex': tex ? LINEN : 'none',
            '--rd-ink': ink,
            '--rd-ink-soft': inkSoft,
            '--rd-ink-rgb': trip(ink),
            '--rd-rule': alpha(ink, 0.12),
            '--rd-rule-soft': alpha(ink, 0.07),
            '--rd-accent': accent,
            '--rd-accent-rgb': trip(accent),
            '--rd-accent-soft': mix(card, accent, dark ? 0.22 : 0.14),
            '--rd-on-accent': onAccent,
            '--rd-track': mix(card, ink, 0.10),
            '--rd-bar-fill': accent,
            '--rd-chart-bar': mix(card, accent, 0.30),
            '--rd-knob': dark ? ink : '#ffffff',
            '--rd-chip-bg': card,
            '--rd-chip-on-bg': ink,
            '--rd-chip-on-ink': paper,
            '--rd-cover-a': mix(card, ink, 0.04),
            '--rd-cover-b': mix(card, ink, 0.13),
            '--rd-cover-ink': inkSoft,
            '--rd-scrim': alpha(dark ? '#000000' : ink, dark ? 0.55 : 0.38),
            '--rd-on-scrim': onScrim,
            '--rd-veil': '#000000',
            '--rd-danger': dark ? '#d97a72' : '#c1544f',
            '--rd-ribbon': dark ? '#ef5a4d' : '#e0453a',
            '--rd-shadow': `0 10px 30px ${alpha(ink, dark ? 0.45 : 0.10)}`,
            '--rd-shadow-sm': `0 2px 10px ${alpha(ink, dark ? 0.35 : 0.06)}`,
        },
    };
}

const MORE_SKINS: ReaderSkin[] = [
    derived('sand', '沙', { paper: '#f0e6d5', paper2: '#e9ddc9', card: '#fbf5ea', bg: '#e6dac6', ink: '#3a3126', inkSoft: '#7d7060', accent: '#a1785a', tex: true }),
    derived('stone', '石灰', { paper: '#e9e9e7', paper2: '#e2e2e0', card: '#fdfdfc', bg: '#dedede', ink: '#33343a', inkSoft: '#7c7d83', accent: '#6b7280' }),
    derived('sea', '海蓝', { paper: '#eaf1f6', paper2: '#e1eaf1', card: '#fbfdff', bg: '#dde7ef', ink: '#22333f', inkSoft: '#6a7d8b', accent: '#3f88c5' }),
    derived('mung', '豆绿', { paper: '#eaf1e7', paper2: '#e2ebdf', card: '#fbfdfa', bg: '#dfe9dc', ink: '#2a3830', inkSoft: '#6d7d72', accent: '#5f9e6e' }),
    derived('raspberry', '莓粉', { paper: '#f7eaee', paper2: '#f1e1e7', card: '#fefbfc', bg: '#eedde3', ink: '#3a2a30', inkSoft: '#866f77', accent: '#c96b86' }),
    derived('bamboo', '竹青', { paper: '#e4ece3', paper2: '#dbe5da', card: '#fafcf9', bg: '#d6e2d5', ink: '#28352c', inkSoft: '#67786c', accent: '#3f6b4d' }),
    derived('orange', '橘', { paper: '#fbeee0', paper2: '#f5e5d3', card: '#fffaf4', bg: '#f2e2cd', ink: '#3d2f22', inkSoft: '#8a7460', accent: '#d9822b' }),
    derived('night2', '墨黑', { paper: '#0a0a0c', paper2: '#101013', card: '#141419', bg: '#070708', ink: '#e8e6e2', inkSoft: '#9d9a95', accent: '#8fb0d8', onAccent: '#0b0d11' }, true),
];

/** 皮肤总表：手调的四张 + 派生的那批（主题面板整张网格就是它） */
export const READER_SKINS: ReaderSkin[] = [...BASE_SKINS, ...MORE_SKINS];

export function skinById(id: string): ReaderSkin {
    return READER_SKINS.find((s) => s.id === id) ?? READER_SKINS[0];
}

/** 划线样式槽 1..6 的颜色（每 owner 挑一个槽；`-rgb` 三元组供半透明叠加用）。 */
export const HIGHLIGHT_SLOTS: Array<{ slot: number; label: string; hex: string; rgb: string }> = [
    { slot: 1, label: '琥珀', hex: '#e0a32e', rgb: '224, 163, 46' },
    { slot: 2, label: '藤紫', hex: '#8b6fd0', rgb: '139, 111, 208' },
    { slot: 3, label: '苔绿', hex: '#5f9e6e', rgb: '95, 158, 110' },
    { slot: 4, label: '绯红', hex: '#d2545a', rgb: '210, 84, 90' },
    { slot: 5, label: '湖蓝', hex: '#3f88c5', rgb: '63, 136, 197' },
    { slot: 6, label: '灰蓝', hex: '#7b8794', rgb: '123, 135, 148' },
];

/** '#f2c14e' → '242, 193, 78'（自选划线色要的 rgb 三元组，给 rgba() 用） */
export function hexTriple(hex: string): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return '224, 163, 46';
    return trip(`#${m[1]}`.toLowerCase());
}

export function highlightSlotVars(): Record<string, string> {
    const vars: Record<string, string> = {};
    for (const s of HIGHLIGHT_SLOTS) {
        vars[`--rd-hl-${s.slot}`] = s.hex;
        vars[`--rd-hl-${s.slot}-rgb`] = s.rgb;
    }
    return vars;
}

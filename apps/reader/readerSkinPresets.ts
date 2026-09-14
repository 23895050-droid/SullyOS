// 读书模块 · 皮肤表（2026-09-14）
//
// 「换皮肤 = 换一张变量表」——组件层只认 var(--rd-*)，一份皮肤就是一组变量覆盖。
// 皮肤**只管颜色/材质**；字号/行高/缩进属于排版（用户可调，见 readerPrefs.typography）。
//
// 骨架层 CSS 里的默认值（apps/reader/readerCss.ts）就是 paper 那套；其余皮肤覆盖它。

export interface ReaderSkin {
    id: string;
    label: string;
    /** 暗色皮肤要同步告诉系统：滚动条/原生控件跟着走 */
    dark?: boolean;
    vars: Record<string, string>;
}

/** --rd-* 变量词典（骨架层允许出现的全部名字，读者设置页也照这个列） */
export const READER_VAR_KEYS = [
    '--rd-paper', '--rd-paper-2', '--rd-ink', '--rd-ink-soft', '--rd-ink-rgb',
    '--rd-rule', '--rd-accent', '--rd-accent-rgb', '--rd-scrim', '--rd-shadow',
] as const;

export const READER_SKINS: ReaderSkin[] = [
    {
        id: 'paper',
        label: '纸白',
        vars: {
            '--rd-paper': '#f6f1e7',
            '--rd-paper-2': '#fbf8f1',
            '--rd-ink': '#2f2a24',
            '--rd-ink-soft': '#6b6154',
            '--rd-ink-rgb': '47, 42, 36',
            '--rd-rule': 'rgba(47, 42, 36, 0.14)',
            '--rd-accent': '#8a6f4b',
            '--rd-accent-rgb': '138, 111, 75',
            '--rd-scrim': 'rgba(47, 42, 36, 0.35)',
            '--rd-shadow': '0 8px 24px rgba(47, 42, 36, 0.10)',
        },
    },
    {
        id: 'night',
        label: '夜色',
        dark: true,
        vars: {
            '--rd-paper': '#14151a',
            '--rd-paper-2': '#1c1e25',
            '--rd-ink': '#d9d6cf',
            '--rd-ink-soft': '#8d8a83',
            '--rd-ink-rgb': '217, 214, 207',
            '--rd-rule': 'rgba(217, 214, 207, 0.16)',
            '--rd-accent': '#9aa8c7',
            '--rd-accent-rgb': '154, 168, 199',
            '--rd-scrim': 'rgba(0, 0, 0, 0.5)',
            '--rd-shadow': '0 8px 24px rgba(0, 0, 0, 0.4)',
        },
    },
    {
        id: 'sepia',
        label: '羊皮纸',
        vars: {
            '--rd-paper': '#e8d8bd',
            '--rd-paper-2': '#f0e3cd',
            '--rd-ink': '#3b2f22',
            '--rd-ink-soft': '#6d5c45',
            '--rd-ink-rgb': '59, 47, 34',
            '--rd-rule': 'rgba(59, 47, 34, 0.18)',
            '--rd-accent': '#96603a',
            '--rd-accent-rgb': '150, 96, 58',
            '--rd-scrim': 'rgba(59, 47, 34, 0.35)',
            '--rd-shadow': '0 8px 24px rgba(59, 47, 34, 0.14)',
        },
    },
    {
        id: 'plain',
        label: '素白',
        vars: {
            '--rd-paper': '#ffffff',
            '--rd-paper-2': '#f4f4f5',
            '--rd-ink': '#27272a',
            '--rd-ink-soft': '#71717a',
            '--rd-ink-rgb': '39, 39, 42',
            '--rd-rule': 'rgba(39, 39, 42, 0.12)',
            '--rd-accent': '#3f6ea5',
            '--rd-accent-rgb': '63, 110, 165',
            '--rd-scrim': 'rgba(24, 24, 27, 0.35)',
            '--rd-shadow': '0 8px 24px rgba(24, 24, 27, 0.08)',
        },
    },
];

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

export function highlightSlotVars(): Record<string, string> {
    const vars: Record<string, string> = {};
    for (const s of HIGHLIGHT_SLOTS) {
        vars[`--rd-hl-${s.slot}`] = s.hex;
        vars[`--rd-hl-${s.slot}-rgb`] = s.rgb;
    }
    return vars;
}

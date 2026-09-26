// 读书模块 · 书摘分享卡的主题表（2026-09-26）
//
// 她给的参考（桌面「书摘卡片」那个文件夹）是四路：简白（白卡 + 左侧引用线 + 想法 + 日期）、
// 纸卡（顶上一颗色圆 + 半透明纸卡 + 书名/横线/原文/作者/日期/落款）、衬纸（底图 + 米白纸质卡 +
// 大标题 + 副标题 + 正文 + 署名）、夜读（深色卡 + 原文 + 出处）。这就是四个 layout。
//
// **颜色写成 rgb()/rgba() 而不是 #hex**：`apps/reader/**` 有守卫禁 6 位 hex（骨架层的颜色
// 必须走变量，不然换肤会失效，见 utils/reader/readerCss.test.ts）。这张表是**分享卡自己的
// 调色板**——分享卡不该因为书房切了夜间就跟着变黑，它自成一格，所以它不接皮肤变量。

export type RdShareLayout = 'quote' | 'circle' | 'sheet' | 'night';

export interface RdShareTheme {
    id: string;
    label: string;
    /** 版式（四种参考各一路） */
    layout: RdShareLayout;
    /** 卡片底色 */
    card: string;
    /** 卡内正文 */
    ink: string;
    /** 出处 / 日期那一层浅色 */
    inkSoft: string;
    /** 分隔线 */
    rule: string;
    /** 强调色（引用线 / 大标题 / 落款）。纸卡那颗圆的颜色由「圆点色」另外覆盖 */
    accent: string;
    /** 没选底图时铺的画布底色 */
    canvas: string;
    /** 卡片描边（不写就是不描） */
    border?: string;
}

export const RD_SHARE_THEMES: RdShareTheme[] = [
    {
        id: 'plain',
        label: '简白',
        layout: 'quote',
        card: 'rgb(255, 255, 255)',
        ink: 'rgb(38, 36, 33)',
        inkSoft: 'rgb(152, 147, 140)',
        rule: 'rgba(38, 36, 33, 0.10)',
        accent: 'rgb(178, 174, 168)',
        canvas: 'rgb(240, 238, 234)',
    },
    {
        id: 'paper',
        label: '纸卡',
        layout: 'circle',
        card: 'rgba(255, 255, 255, 0.52)',
        ink: 'rgb(52, 48, 44)',
        inkSoft: 'rgb(138, 130, 122)',
        rule: 'rgba(52, 48, 44, 0.32)',
        accent: 'rgb(238, 150, 160)',
        canvas: 'rgb(248, 246, 242)',
    },
    {
        id: 'sheet',
        label: '衬纸',
        layout: 'sheet',
        card: 'rgba(252, 249, 243, 0.90)',
        ink: 'rgb(58, 50, 42)',
        inkSoft: 'rgb(146, 134, 120)',
        rule: 'rgba(58, 50, 42, 0.22)',
        accent: 'rgb(96, 86, 74)',
        canvas: 'rgb(236, 230, 220)',
    },
    {
        id: 'night',
        label: '夜读',
        layout: 'night',
        card: 'rgb(26, 28, 32)',
        ink: 'rgb(232, 228, 220)',
        inkSoft: 'rgb(148, 144, 136)',
        rule: 'rgba(232, 228, 220, 0.16)',
        accent: 'rgb(122, 170, 226)',
        canvas: 'rgb(17, 18, 21)',
    },
];

export const shareThemeById = (id: string): RdShareTheme =>
    RD_SHARE_THEMES.find((t) => t.id === id) ?? RD_SHARE_THEMES[0];

/** 画布底色（`image` = 用上传的底图铺满，没有图时退回落色） */
export interface RdShareBg {
    id: string;
    label: string;
    fill: string;
}

export const RD_SHARE_BGS: RdShareBg[] = [
    { id: 'white', label: '白', fill: 'rgb(255, 255, 255)' },
    { id: 'sand', label: '米', fill: 'rgb(244, 240, 232)' },
    { id: 'rose', label: '粉', fill: 'rgb(250, 238, 241)' },
    { id: 'mist', label: '雾蓝', fill: 'rgb(237, 242, 248)' },
    { id: 'leaf', label: '草绿', fill: 'rgb(238, 244, 236)' },
    { id: 'violet', label: '淡紫', fill: 'rgb(242, 238, 248)' },
    { id: 'ink', label: '墨', fill: 'rgb(22, 24, 28)' },
];

export const shareBgById = (id: string): RdShareBg => {
    // 内置底图会盖满整张画布，这个 fill 只是个「图还没到时」的兜底
    const b = builtinBgOf(id);
    if (b) return { id: b.id, label: b.label, fill: 'rgb(255, 255, 255)' };
    return RD_SHARE_BGS.find((x) => x.id === id) ?? RD_SHARE_BGS[0];
};

/**
 * 「卡片底色」那排的常用色（她 09-26 要的三样之一）。
 * 排面只是**起点**——旁边那颗取色器是原生的色轮，随便调（跟划线那条一个调法）。
 */
export const RD_SHARE_CARD_COLORS: string[] = [
    'rgb(255, 255, 255)',
    'rgb(248, 244, 236)',
    'rgb(238, 238, 240)',
    'rgb(250, 238, 241)',
    'rgb(237, 242, 248)',
    'rgb(238, 244, 236)',
    'rgb(26, 28, 32)',
];

/** 「字色」那排。深底配浅字、浅底配深字，两边都留了 */
export const RD_SHARE_INK_COLORS: string[] = [
    'rgb(38, 36, 33)',
    'rgb(0, 0, 0)',
    'rgb(90, 70, 52)',
    'rgb(120, 118, 114)',
    'rgb(255, 255, 255)',
];

/** 纸卡顶上那颗圆的颜色（她给的五张：粉 / 紫 / 草绿 / 蓝 + 一个中性灰） */
export const RD_SHARE_DOTS: string[] = [
    'rgb(238, 150, 160)',
    'rgb(178, 156, 214)',
    'rgb(168, 200, 158)',
    'rgb(140, 182, 226)',
    'rgb(170, 166, 160)',
];

export interface RdShareFont {
    id: string;
    /** 卡片上的「字体」那一排的显示名 */
    label: string;
    /**
     * canvas 用的字体栈。**第一个必须是中文里真有的那套**——系统给的
     * Georgia / -apple-system 只是西文兜底，中文字会一路落到后面的中文字体上。
     */
    stack: string;
}

/** 她自己传的那套 ttf 注册成这个族名（和日记那个自定义字体同一个套路） */
export const RD_SHARE_CUSTOM_FONT = 'RDShareCustom';

export const RD_SHARE_FONTS: RdShareFont[] = [
    { id: 'song', label: '宋体', stack: '"Songti SC", "SimSun", "Noto Serif SC", Georgia, serif' },
    { id: 'hei', label: '黑体', stack: '"PingFang SC", "Heiti SC", "Microsoft YaHei", "Noto Sans SC", sans-serif' },
    { id: 'kai', label: '楷体', stack: '"Kaiti SC", "KaiTi", "STKaiti", "Kaiti TC", serif' },
    // 传过 ttf 之后这一档才会在面板上露脸（没传的时候选它等于没字体，不摆空档）
    { id: 'custom', label: '我传的', stack: RD_SHARE_CUSTOM_FONT },
];

// ── 她 2026-09-26 给的素材（打包在 public/ 里，选到哪个才下哪个）────────────
//
// 字体：6 个 ttf 转成 woff2（23MB → 9.9MB），**按需加载**——不选它就不会下载。
// 底图：15 张（压到 1200px / q80，共 3.8MB）；面板里只加载缩略图（24KB 一共），
// 真正选中了才下大图。所以「打开面板」这件事本身只花 24KB。

const BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/';

export interface RdBuiltinFont { id: string; label: string; file: string }
export interface RdBuiltinBg { id: string; label: string; file: string }

/** 内置字体的 id 前缀（自定义上传的那个走 'custom'，不在这儿） */
export const BUILTIN_FONT_PREFIX = 'bf:';
export const BUILTIN_BG_PREFIX = 'bi:';

export const RD_SHARE_BUILTIN_FONTS: RdBuiltinFont[] = [
    { id: 'bf:hug', label: '人类需要拥抱', file: 'hug' },
    { id: 'bf:kitten', label: '奶萌小小喵', file: 'kitten' },
    { id: 'bf:maiden', label: '忧郁少女理论文学', file: 'maiden' },
    { id: 'bf:cheese', label: '日系可爱奶酪体', file: 'cheese' },
    { id: 'bf:drown', label: '溺水痕迹', file: 'drown' },
    { id: 'bf:letter', label: '见字如面', file: 'letter' },
];

export const RD_SHARE_BUILTIN_BGS: RdBuiltinBg[] = [
    { id: 'bi:paper', label: '纸张', file: 'paper' },
    { id: 'bi:paper2', label: '纸张2', file: 'paper2' },
    { id: 'bi:pink', label: '浅粉纹理', file: 'pink' },
    { id: 'bi:bluetex', label: '浅蓝纹理', file: 'bluetex' },
    { id: 'bi:bluewash', label: '浅蓝水彩', file: 'bluewash' },
    { id: 'bi:water', label: '水', file: 'water' },
    { id: 'bi:lemon', label: '柠檬水', file: 'lemon' },
    { id: 'bi:green', label: '草绿', file: 'green' },
    { id: 'bi:monet', label: '莫奈', file: 'monet' },
    { id: 'bi:orange', label: '橘色水彩', file: 'orange' },
    { id: 'bi:oil', label: '油画', file: 'oil' },
    { id: 'bi:mono', label: '黑白渐变', file: 'mono' },
    { id: 'bi:butterfly', label: '蝴蝶', file: 'butterfly' },
    { id: 'bi:bear', label: '熊', file: 'bear' },
    { id: 'bi:hand', label: '手', file: 'hand' },
];

/** canvas 里用的族名（内置字体各自一个，注册时机见 ShareCardSheet） */
export const builtinFontFamily = (file: string): string => `RDShareF_${file}`;

export const builtinFontOf = (id: string): RdBuiltinFont | undefined =>
    RD_SHARE_BUILTIN_FONTS.find((f) => f.id === id);

export const builtinBgOf = (id: string): RdBuiltinBg | undefined =>
    RD_SHARE_BUILTIN_BGS.find((b) => b.id === id);

/** 内置字体的 woff2 地址（`new FontFace` 时才真正去下） */
export const builtinFontUrl = (file: string): string => `${BASE}sharefonts/${file}.woff2`;

/** 内置底图：面板里的小图 / 选中后用的大图 */
export const builtinBgThumbUrl = (file: string): string => `${BASE}sharebg/t/${file}.jpg`;
export const builtinBgUrl = (file: string): string => `${BASE}sharebg/${file}.jpg`;

export const shareFontById = (id: string): RdShareFont => {
    const b = builtinFontOf(id);
    if (b) return { id: b.id, label: b.label, stack: `"${builtinFontFamily(b.file)}", "Songti SC", serif` };
    return RD_SHARE_FONTS.find((f) => f.id === id) ?? RD_SHARE_FONTS[0];
};

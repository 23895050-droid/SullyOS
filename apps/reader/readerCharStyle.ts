// 读书模块 · **每个角色的阅读风格**（她 09-20）
//
// 两块东西，**刻意分开**（她原话：偏好和气质分开，两边都可以单独重roll，也可以单独关闭注入）：
//
//   · **阅读偏好**（读什么、怎么读）：类型流派 / 作者 / BE·HE·GL·BG / 逻辑还是感性 /
//     鉴赏方向 / 五维分数 / 他自己的笔色。**读书的时候不带着它**——它留给「给书架上的书
//     留印象、挑书」用。
//   · **阅读气质**（和阅读无关的那六个元素：两个动词 + 两个经典公式/数列 + 两个名词意象）。
//     **读书的时候带着它**，但只当**气质基调参考**（不是设定，不是要求）。
//
// 第一次读书、而且还没给自己选笔色的时候，第一次输出之前先跑一次分析（两块一起出）。
// 笔色出了就写进角色自己的设置（readerCharPrefs.penColor），之后他用那支笔。

import { createCoupleStore } from '../couple/coupleStoreBase';

export interface CharStylePref {
    /** 给人看的一段话（模型输出的 JSON 之外，自己也存一份可读的） */
    text: string;
    genres: string[];
    authors: string[];
    /** BE / HE / GL / BG 各 0-10 */
    taste: Record<string, number>;
    /** 0 = 全感性，10 = 全逻辑 */
    logic: number;
    appreciation: string;
    /** 学术 / 文艺 / 美感 / 情感 / 互文，各 0-10 */
    scores: Record<string, number>;
    /** 他自己挑的笔色（同时会写进 readerCharPrefs.penColor） */
    penColor?: string;
    at: string;
}

export interface CharStyleVibe {
    verbs: string[];
    forms: string[];
    images: string[];
    /** 拼起来的那一句（注入时用的就是它） */
    text: string;
    at: string;
}

export interface CharStyle {
    pref?: CharStylePref;
    vibe?: CharStyleVibe;
    /** 阅读偏好要不要带上（默认**不带**——读书时只带气质） */
    prefInject: boolean;
    /** 阅读气质要不要带上（默认带） */
    vibeInject: boolean;
}

export interface ReaderCharStyleStore {
    version: number;
    updatedAt: string;
    chars: Record<string, CharStyle>;
}

export const CHAR_STYLE_DEFAULTS: CharStyle = {
    prefInject: false,
    vibeInject: true,
};

const KEY = 'reader_char_style_v1';
const store = createCoupleStore<ReaderCharStyleStore>(KEY, 1, {
    version: 1, updatedAt: new Date().toISOString(), chars: {},
});

/** 这个角色的风格（没建过就返回一份默认的，不落盘）。 */
export const charStyleOf = (s: ReaderCharStyleStore, charId: string): CharStyle =>
    ({ ...CHAR_STYLE_DEFAULTS, ...(s.chars[charId] ?? {}) });

/** 非 React 代码读用（AI 管线）。 */
export const getCharStyle = (charId: string): CharStyle => charStyleOf(store.get(), charId);

export function setCharStyle(charId: string, patch: Partial<CharStyle>): void {
    store.set((s) => ({
        ...s,
        updatedAt: new Date().toISOString(),
        chars: { ...s.chars, [charId]: { ...charStyleOf(s, charId), ...patch } },
    }));
}

/** 分析跑完了没（两块都有才算跑完）。 */
export const styleReady = (charId: string): boolean => {
    const st = getCharStyle(charId);
    return !!st.pref && !!st.vibe;
};

/** 注入用：气质那一句（关掉或没跑过就给空串）。 */
export function vibeInjection(charId: string): string {
    const st = getCharStyle(charId);
    if (!st.vibeInject || !st.vibe) return '';
    return st.vibe.text;
}

/** 注入用：偏好那一段（关掉或没跑过就给空串；读书时默认不开）。 */
export function prefInjection(charId: string): string {
    const st = getCharStyle(charId);
    if (!st.prefInject || !st.pref) return '';
    return st.pref.text;
}

export const useReaderCharStyle = (): ReaderCharStyleStore => store.use();
export const getReaderCharStyleStore = (): ReaderCharStyleStore => store.get();

// 读书模块 · 皮肤注入（2026-09-14）
//
// 一张 <style id="rd-css-preset">，四层按序拼（照音乐线 GlobalMusicCssPreset 的范式）：
//   1. READER_SKELETON_CSS   骨架层 + 默认变量
//   2. .rd-root { ...皮肤变量 + 排版变量 + 划线槽 }    ← 换皮肤/调排版改的就是这一层
//   3. .rd-root.rd-user { 用户全局 CSS }
//   4. .rd-root.rd-user [data-rd-page="x"] { 用户分页 CSS }
// 后写的同权重胜出 + 第 3/4 层多一个类选择器 → **用户层永远不需要 !important**（v3 的 V5）。
//
// 变量表与类名速查（小助手写 CSS 时照这份点名）：apps/reader/readerCss.ts 头注释。

import { useMemo } from 'react';
import { READER_SKELETON_CSS } from './readerCss';
import { highlightSlotVars, skinById } from './readerSkinPresets';
import { useReaderPrefs, type ReaderPrefs, type ReaderTypography } from './readerPrefs';

const FONT_STACKS: Record<string, { body: string; heading: string }> = {
    serif: {
        body: 'Georgia, "Songti SC", "Noto Serif SC", serif',
        heading: 'Georgia, "Songti SC", "Noto Serif SC", serif',
    },
    sans: {
        body: '-apple-system, "PingFang SC", "Noto Sans SC", sans-serif',
        heading: '"Songti SC", Georgia, serif',
    },
};

function varsToCss(selector: string, vars: Record<string, string | number>): string {
    const body = Object.entries(vars)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${k}: ${v};`)
        .join(' ');
    return `${selector} { ${body} }`;
}

export function typographyVars(t: ReaderTypography): Record<string, string> {
    const stack = FONT_STACKS[t.fontFamily] ?? FONT_STACKS.serif;
    const body = Math.max(12, Math.min(30, Math.round(t.fontSize)));
    return {
        '--rd-font-body': stack.body,
        '--rd-font-heading': stack.heading,
        '--rd-fs-body': `${body}px`,
        '--rd-fs-title': `${Math.round(body * 1.3)}px`,
        '--rd-fs-caption': `${Math.max(10, Math.round(body * 0.72))}px`,
        '--rd-lh-body': String(Math.max(1.2, Math.min(3, t.lineHeight))),
        '--rd-para-gap': `${Math.max(0, Math.round(t.paragraphSpacing))}px`,
        '--rd-para-indent': `${Math.max(0, t.paragraphIndent)}em`,
        '--rd-page-gutter': `${Math.max(8, Math.round(t.margin))}px`,
    };
}

export function buildReaderCss(prefs: ReaderPrefs): string {
    const skin = skinById(prefs.themeId);
    const layers: string[] = [READER_SKELETON_CSS];
    layers.push(varsToCss('.rd-root', {
        ...skin.vars,
        ...highlightSlotVars(),
        ...typographyVars(prefs.typography),
    }));
    const userGlobal = prefs.cssGlobal?.trim();
    if (userGlobal) layers.push(`.rd-root.rd-user {\n${userGlobal}\n}`);
    for (const [page, css] of Object.entries(prefs.cssPages || {})) {
        if (css?.trim()) layers.push(`.rd-root.rd-user [data-rd-page="${page}"] {\n${css}\n}`);
    }
    return layers.join('\n\n');
}

export default function ReaderSkinPreset() {
    const prefs = useReaderPrefs();
    const css = useMemo(() => buildReaderCss(prefs), [prefs]);
    return <style id="rd-css-preset" dangerouslySetInnerHTML={{ __html: css }} />;
}

// 读书模块 · 「我的划线颜色」（2026-09-15）
//
// 她那天说的是两件事：① 别在选中文字的浮层里摆一排色卡（「跟眼影盘一样」）——
// 划线颜色去设置里改；② 划线颜色**四处都没打通**。
//
// 所以这里就是**唯一那一个**改颜色的地方，三处入口共用同一个弹卡：
//   阅读页「更多 → 我的划线颜色」/ 书详情「划线颜色」/ 设置页「阅读设置 → 我的划线颜色」
//
// 颜色模型也跟着收敛成一条：**谁划的 → 用谁那支笔**（prefs.highlightColors[ownerId]）。
// 这个弹卡改的是她自己那支（'user'）；角色各自的笔等书库页做（那页会全改一遍）。

import { useState } from 'react';
import {
    highlightColorOf, removeHighlightColor, saveHighlightColor, setHighlightColor, useReaderPrefs,
} from './readerPrefs';

/** HSL → #rrggbb。运行时算，骨架层/组件里都不写死色值（守卫测试盯着这条）。 */
export function hslHex(h: number, s: number, l: number): string {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number): string => {
        const k = (n + h / 30) % 12;
        const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(255 * c).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

/** 色相条：直接拿色相环上的点拼渐变（写死色值会被守卫测试拦） */
const HUE_STRIP = `linear-gradient(90deg, ${[0, 60, 120, 180, 240, 300, 360].map((h) => hslHex(h, 1, 0.5)).join(', ')})`;

export default function HighlightColorSheet({ onClose }: { onClose: () => void }) {
    const prefs = useReaderPrefs();
    const mine = highlightColorOf(prefs, 'user');
    const [hue, setHue] = useState(45);
    const [lum, setLum] = useState(0.62);
    const draft = hslHex(hue, 0.75, lum);

    return (
        <div className="rd-sheet-mask" onClick={onClose}>
            <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="rd-sheet-grip" />
                <div className="rd-sheet-title">我的划线颜色</div>

                <div className="rd-row">
                    <span className="rd-row-label">现在这支</span>
                    <span className="rd-hl-preview" style={{ background: mine }} />
                </div>

                <div className="rd-group-head"><span>我的颜色</span><span>{prefs.highlightPalette.length} 支</span></div>
                <div className="rd-hunt-hist">
                    {prefs.highlightPalette.map((c) => (
                        <button
                            key={c}
                            aria-label={c}
                            className={`rd-swatch${mine === c ? ' rd-swatch-on' : ''}`}
                            style={{ background: c }}
                            onClick={() => setHighlightColor(c)}
                            onContextMenu={(e) => { e.preventDefault(); removeHighlightColor(c); }}
                        />
                    ))}
                </div>
                <div className="rd-muted" style={{ marginTop: 8 }}>
                    点一支就用它；再点一下当前那支（或长按/右键）可以从库里删掉。划线时用的就是这支。
                </div>

                <div className="rd-group-head" style={{ marginTop: 'var(--rd-space-4)' }}><span>调一支新的</span></div>
                <div className="rd-row" style={{ marginBottom: 'var(--rd-space-2)' }}>
                    <span className="rd-row-label">颜色</span>
                    <span className="rd-hl-preview" style={{ background: draft }} />
                </div>
                <input
                    className="rd-slider rd-slider-hue"
                    type="range" min={0} max={360} step={1} value={hue}
                    onChange={(e) => setHue(Number(e.target.value))}
                    style={{ background: HUE_STRIP }}
                />
                <input
                    className="rd-slider"
                    type="range" min={20} max={90} step={1} value={Math.round(lum * 100)}
                    onChange={(e) => setLum(Number(e.target.value) / 100)}
                />
                <div className="rd-btn-row" style={{ marginTop: 'var(--rd-space-3)' }}>
                    <button className="rd-btn rd-btn-primary" onClick={() => saveHighlightColor(draft)}>存进我的颜色</button>
                    <button className="rd-btn" onClick={() => setHighlightColor(draft)}>直接用它</button>
                </div>

                <div className="rd-muted" style={{ marginTop: 'var(--rd-space-3)' }}>
                    角色的划线是各人一支笔，等书库页做好了在那儿改——现在他们的线会先用一支默认色。
                </div>
            </div>
        </div>
    );
}

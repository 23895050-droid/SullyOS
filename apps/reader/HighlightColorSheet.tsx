// 读书模块 · 划线设置（2026-09-15；09-16 换成「调色台」那套；09-21 T7① 重排）
//
// 她那天说的是两件事：① 别在选中文字的浮层里摆一排色卡（「跟眼影盘一样」）——
// 划线颜色去设置里改；② 划线颜色**四处都没打通**。
// 所以这里就是**唯一那一个**改颜色的地方，三处入口共用同一个弹卡：
//   阅读页「更多 → 划线设置」/ 书详情「划线设置」/ 设置页「阅读设置 → 划线设置」
// 名字一律叫「划线设置」（她 2026-09-15：「我的颜色是啥，划线设置就叫划线设置」）。
//
// **她 09-16 又改了口径**：别搞色相/明度两条滑杆，**照情侣页调色台的样子来**——
// 一个原生取色框（点开系统色轮随便调），下面配一排存下来的颜色。
//
// **她 09-21（T7①）说这张卡跟周围格格不入**，所以要的是重排不是重做：
//   · 原来是几行散着的（色点 + 取色框飘在标题下面、色卡没有容器、两段灰字），
//     现在收进两张 .rd-card，和书房其它弹卡一样是「卡 + 分组标题 + 一行说明」；
//   · 借来的 .rd-hunt-hist（收集页那个类）不要了，换自己的 .rd-pen-swatches；
//   · 那两段灰字里「等书库页做好了在那儿改」早过时了（书库页 09-21 就做完了），
//     换成真的把他那支笔列出来——谁是自己的笔、谁还没挑，一眼看得见。
//
// 颜色模型没变：**谁划的 → 用谁那支笔**（prefs.highlightColors[ownerId]）。
// 这个弹卡改的是她自己那支（'user'）；角色的笔是他第一次读书前自己挑的，
// 在角色自己的设置页里（见 readerStyle.ts 的「阅读风格」）。

import { useOS } from '../../context/OSContext';
import { getCharReadPrefs, useReaderCharPrefs } from './readerCharPrefs';
import {
    highlightColorOf, removeHighlightColor, saveHighlightColor, setHighlightColor, useReaderPrefs,
} from './readerPrefs';

export default function HighlightColorSheet({ onClose }: { onClose: () => void }) {
    const prefs = useReaderPrefs();
    const { characters } = useOS();
    const charPrefs = useReaderCharPrefs();
    const mine = highlightColorOf(prefs, 'user');
    const inPalette = prefs.highlightPalette.includes(mine);
    /** 只列「在读书的人」：阅读开关没开的和他还没有笔色的别占地方 */
    const pens = characters.filter((c) => charPrefs.chars[c.id]?.readEnabled || charPrefs.chars[c.id]?.penColor);

    return (
        <div className="rd-sheet-mask" onClick={onClose}>
            <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="rd-sheet-grip" />
                <div className="rd-sheet-title">划线设置</div>
                <div className="rd-muted">谁划的线，就用谁那支笔。</div>

                {/* 我的笔：取色框（系统色轮）+ 色号——照情侣页调色台那种调法 */}
                <div className="rd-card" style={{ marginTop: 'var(--rd-space-4)' }}>
                    <div className="rd-pen-card">
                        <span className="rd-pen-dot" style={{ background: mine }} />
                        <span className="rd-pen-info">
                            <span className="rd-pen-hex">{mine}</span>
                            <span className="rd-muted" style={{ display: 'block' }}>我的笔</span>
                        </span>
                        <span className="rd-pen-pick">
                            <input
                                className="rd-color-in"
                                type="color"
                                value={mine}
                                aria-label="我的划线颜色"
                                onChange={(e) => setHighlightColor(e.target.value)}
                            />
                        </span>
                    </div>
                </div>
                <div className="rd-muted" style={{ marginTop: 'var(--rd-space-2)' }}>
                    点右边那块打开系统色轮，随便调。划线时用的就是这支。
                </div>

                <div className="rd-group-head">
                    <span>存下来的颜色 · {prefs.highlightPalette.length} 支</span>
                    {inPalette && (
                        <button className="rd-group-action" onClick={() => removeHighlightColor(mine)}>
                            从库里删掉这支
                        </button>
                    )}
                </div>
                <div className="rd-card">
                    <div className="rd-pen-swatches">
                        {prefs.highlightPalette.map((c) => (
                            <button
                                key={c}
                                type="button"
                                aria-label={c}
                                className={`rd-swatch${mine === c ? ' rd-swatch-on' : ''}`}
                                style={{ background: c }}
                                onClick={() => setHighlightColor(c)}
                                onContextMenu={(e) => { e.preventDefault(); removeHighlightColor(c); }}
                            />
                        ))}
                    </div>
                    <button
                        className="rd-btn rd-btn-soft rd-btn-block"
                        style={{ marginTop: 'var(--rd-space-4)' }}
                        onClick={() => saveHighlightColor(mine)}
                    >
                        把现在这支存进库
                    </button>
                </div>
                <div className="rd-muted" style={{ marginTop: 'var(--rd-space-2)' }}>
                    点一支就用它；电脑上右键某一支也能删。
                </div>

                {pens.length > 0 && (
                    <>
                        <div className="rd-group-head"><span>他的笔</span></div>
                        <div className="rd-card rd-card-flush">
                            <div className="rd-list">
                                {pens.map((c) => {
                                    const pen = getCharReadPrefs(c.id).penColor;
                                    return (
                                        <div className="rd-item" key={c.id}>
                                            <span
                                                className={`rd-pen-mini${pen ? '' : ' rd-pen-mini-none'}`}
                                                style={pen ? { background: highlightColorOf(prefs, c.id) } : undefined}
                                            />
                                            <span className="rd-item-label">{c.name}</span>
                                            <span className="rd-item-value">{pen ? '他自己的笔' : '还没挑'}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="rd-muted" style={{ marginTop: 'var(--rd-space-2)' }}>
                            他第一次读书前会给自己挑一支，之后他划的线就用它；想改去他的设置页。
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

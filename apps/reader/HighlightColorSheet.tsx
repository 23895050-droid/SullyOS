// 读书模块 · 划线设置（2026-09-15；09-16 换成「调色台」那套）
//
// 她那天说的是两件事：① 别在选中文字的浮层里摆一排色卡（「跟眼影盘一样」）——
// 划线颜色去设置里改；② 划线颜色**四处都没打通**。
// 所以这里就是**唯一那一个**改颜色的地方，三处入口共用同一个弹卡：
//   阅读页「更多 → 划线设置」/ 书详情「划线设置」/ 设置页「阅读设置 → 划线设置」
// 名字一律叫「划线设置」（她 2026-09-15：「我的颜色是啥，划线设置就叫划线设置」）。
//
// **她 09-16 又改了口径**：别搞色相/明度两条滑杆，**照情侣页调色台的样子来**——
// 一个原生取色框（点开系统色轮随便调），下面配一排存下来的颜色。
// 所以 huelum 那套滑杆（和拼渐变的 hslHex）整块删掉了。
//
// 颜色模型没变：**谁划的 → 用谁那支笔**（prefs.highlightColors[ownerId]）。
// 这个弹卡改的是她自己那支（'user'）；角色各自的笔等书库页做（那页会全改一遍）。

import {
    highlightColorOf, removeHighlightColor, saveHighlightColor, setHighlightColor, useReaderPrefs,
} from './readerPrefs';

export default function HighlightColorSheet({ onClose }: { onClose: () => void }) {
    const prefs = useReaderPrefs();
    const mine = highlightColorOf(prefs, 'user');

    return (
        <div className="rd-sheet-mask" onClick={onClose}>
            <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="rd-sheet-grip" />
                <div className="rd-sheet-title">划线设置</div>

                {/* 我的笔：取色框（系统色轮）+ 预览——照情侣页调色台那种调法 */}
                <div className="rd-row">
                    <span className="rd-row-label">
                        我的笔
                        <span className="rd-muted" style={{ display: 'block' }}>点右边的色块，系统色轮里随便调</span>
                    </span>
                    <span className="rd-row-pick">
                        <span className="rd-hl-preview" style={{ background: mine }} />
                        <input
                            className="rd-color-in"
                            type="color"
                            value={mine}
                            aria-label="我的划线颜色"
                            onChange={(e) => setHighlightColor(e.target.value)}
                        />
                    </span>
                </div>

                <div className="rd-group-head" style={{ marginTop: 'var(--rd-space-4)' }}>
                    <span>存下来的颜色</span><span>{prefs.highlightPalette.length} 支</span>
                </div>
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

                <div className="rd-btn-row" style={{ marginTop: 'var(--rd-space-3)' }}>
                    <button className="rd-btn" onClick={() => saveHighlightColor(mine)}>把现在这支存进库</button>
                </div>
                <div className="rd-muted" style={{ marginTop: 'var(--rd-space-2)' }}>
                    点一支就用它；再点一下当前那支（或长按/右键）可以从库里删掉。划线时用的就是这支。
                </div>

                <div className="rd-muted" style={{ marginTop: 'var(--rd-space-3)' }}>
                    角色的划线是各人一支笔，等书库页做好了在那儿改——现在他们的线会先用一支默认色。
                </div>
            </div>
        </div>
    );
}

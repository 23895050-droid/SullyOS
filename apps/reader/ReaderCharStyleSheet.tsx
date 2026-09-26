// 读书模块 · 「他/她的阅读风格」弹卡（她 09-20；09-21 按她的反馈重写）
//
// 两块分开、各自独立（她原话）：
//   · **阅读气质**——读书时带着的那六个元素（两个动词 + 两个经典公式/数列 + 两个名词意象），
//     只作**气质基调参考**；可以单独重roll（重roll 时把已有的偏好递过去当参考）。
//   · **阅读偏好**——读什么、怎么读；**读书时不带**，留给「给书架上的书留印象、挑书」用。
// 笔色也在这张卡上（分析出来的那支笔，也是他划线的颜色）。
//
// **她 09-21 的三条**：
//   ① 「关掉按钮完全没必要」——删了。这张是弹卡，点外面、点上面的把手都能关。
//   ② 「那两个重取选项，只写重新分析气质」——每张卡一颗，标签就写「重新分析气质 / 重新分析偏好」，
//      把原来的「只重取气质（带着已有偏好当参考）」那种括号尾巴去掉。底部那颗「两块一起重取」是她
//      09-20 定的（「重roll 整块 = 两块都换」），保留。
//   ③ 「你所有的解释……全都收到一个小圆圈问号里面」——原来铺在卡片里的几段说明、
//      开关下面那两行小字，全搬进标题旁边那枚问号。界面上只剩标题、正文、开关、按钮。

import { useState } from 'react';
import { ArrowsClockwise, PencilSimple } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { charStyleOf, setCharStyle, useReaderCharStyle } from './readerCharStyle';
import { resolveReadApi } from '../../utils/reader/readerChat';
import { analyzeCharStyle } from '../../utils/reader/readerStyle';
import { getCoReadStore, readApiSlots } from './coreadStore';
import { charPrefsOf, useReaderCharPrefs } from './readerCharPrefs';
import { getPromptEntries } from '../../utils/promptRegistry';
import { presetNameOf, usePromptPresets } from './readerPromptPresets';
import { PromptFold } from './tabs/ReaderSetPrompts';
import RdHelp from './RdHelp';

interface Props {
    /** 只给 id 和名字：完整人设从 OS 里现取（书架那行只有 id/名字） */
    charId: string;
    name: string;
    onClose: () => void;
    notify: (msg: string) => void;
}

export default function ReaderCharStyleSheet({ charId, name, onClose, notify }: Props) {
    const { characters, userProfile, apiConfig } = useOS();
    const full = characters.find((c) => c.id === charId) ?? null;
    const styleStore = useReaderCharStyle();
    const charPrefs = useReaderCharPrefs();
    const style = charStyleOf(styleStore, charId);
    const preset = charPrefsOf(charPrefs, charId).promptPreset;
    const pen = charPrefsOf(charPrefs, charId).penColor;
    const presetStore = usePromptPresets();
    const [busy, setBusy] = useState<null | 'both' | 'pref' | 'vibe'>(null);
    /** 正在改哪条生成提示词（她 09-26：这块的提示词要能就地从这儿改） */
    const [editing, setEditing] = useState<string | null>(null);
    const [, setBump] = useState(0);

    /** 改生成提示词的入口（跟设置页「读书提示词」是同一张折叠卡） */
    const promptEditBtn = (label: string) => (
        <button className="rd-btn rd-btn-soft rd-btn-block" onClick={() => setEditing(label)}>
            <PencilSimple size={15} /> 改生成提示词
        </button>
    );

    const run = async (which: 'both' | 'pref' | 'vibe') => {
        if (!userProfile || !full) { notify('读不到角色设定'); return; }
        const api = resolveReadApi('solo', charId, readApiSlots(getCoReadStore()), apiConfig);
        if (!api) { notify('还没配模型（角色自己 / 单独读书 / 主 API 都空着）'); return; }
        setBusy(which);
        try {
            await analyzeCharStyle({ char: full, user: userProfile, api, which });
            notify(which === 'both' ? '两块都重取了一遍' : which === 'vibe' ? '气质重取了一个' : '偏好重新分析了一遍');
        } catch (err) {
            notify(`没跑成：${err instanceof Error ? err.message : '未知错误'}`);
        } finally {
            setBusy(null);
        }
    };

    const switchRow = (label: string, on: boolean, toggle: () => void) => (
        <div className="rd-switch-row">
            <div className="rd-row-label">{label}</div>
            <button className={`rd-switch${on ? ' rd-switch-on' : ''}`} aria-label={label} onClick={toggle}>
                <span className="rd-switch-knob" />
            </button>
        </div>
    );

    return (
        <>
        <div className="rd-sheet-mask" onClick={onClose}>
            <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="rd-sheet-grip" onClick={onClose} />
                <div className="rd-sheet-title rd-title-row">
                    {name} 的阅读风格
                    <RdHelp label="这页是什么">
                        <p>这一页是他的两块东西，各管各的：</p>
                        <p>阅读气质 —— 读书的时候带着的那六个元素（两个动词 + 两个经典公式或数列 + 两个名词意象），只作气质基调参考，不写进批注、也不当设定用。</p>
                        <p>阅读偏好 —— 读什么、怎么读。读书的过程中不带它（书才是主角），留给「挑书」和「给书架上的书留印象」用。</p>
                        <p>做笔记的笔色 —— 他第一次读书之前自己挑的那支，深、稳、不刺眼。</p>
                        <p>重取的规矩 —— 「重新分析气质」会把已有的偏好递过去当参考，偏好不动；「重新分析偏好」气质不动；「两块一起重取」两块都换一遍。跑的是他那档模型（他自己的 → 单独读书 → 主 API）。</p>
                    </RdHelp>
                </div>

                {/* 笔色 */}
                <div className="rd-card" style={{ marginBottom: 'var(--rd-space-4)' }}>
                    <div className="rd-row">
                        <span className="rd-row-label">做笔记的笔色</span>
                        <span className="rd-note-by">
                            <span className="rd-note-dot" style={{ background: pen ?? 'var(--rd-rule)' }} />
                            {pen ?? '还没选'}
                        </span>
                    </div>
                </div>

                {/* 阅读气质（读书时带着的那一块） */}
                <div className="rd-section-title">阅读气质</div>
                <div className="rd-card">
                    {style.vibe ? (
                        <div className="rd-style-text">{style.vibe.text || '（这一份是空的）'}</div>
                    ) : (
                        <div className="rd-muted">还没取过。等他第一次读书时会自动取一个。</div>
                    )}
                    {switchRow('读书时带上它', style.vibeInject, () => setCharStyle(charId, { vibeInject: !style.vibeInject }))}
                    <button className="rd-btn rd-btn-soft rd-btn-block" disabled={busy !== null}
                        onClick={() => void run('vibe')}>
                        <ArrowsClockwise size={15} /> {busy === 'vibe' ? '正在重取…' : '重新分析气质'}
                    </button>
                    {promptEditBtn('阅读风格·气质')}
                </div>

                {/* 阅读偏好（读书时不带的那一块） */}
                <div className="rd-section-title">阅读偏好</div>
                <div className="rd-card">
                    {style.pref ? (
                        <div className="rd-style-text">{style.pref.text || '（这一份是空的）'}</div>
                    ) : (
                        <div className="rd-muted">还没分析过。</div>
                    )}
                    {switchRow('挑书时带上它', style.prefInject, () => setCharStyle(charId, { prefInject: !style.prefInject }))}
                    <button className="rd-btn rd-btn-soft rd-btn-block" disabled={busy !== null}
                        onClick={() => void run('pref')}>
                        <ArrowsClockwise size={15} /> {busy === 'pref' ? '正在重跑…' : '重新分析偏好'}
                    </button>
                    {promptEditBtn('阅读风格·偏好')}
                </div>

                <div className="rd-actions" style={{ marginTop: 'var(--rd-space-4)' }}>
                    <button className="rd-btn rd-btn-primary rd-btn-block" disabled={busy !== null}
                        onClick={() => void run('both')}>
                        {busy === 'both' ? '两块都在跑…' : '两块一起重取'}
                    </button>
                </div>
            </div>
        </div>

        {/* ── 改生成提示词（她 09-26：就在这一页给个入口）——跟设置页「读书提示词」
               用的是同一张折叠卡，存到的是**这套提示词**里，用这一套的角色都跟着变 ── */}
        {editing && (
            <div className="rd-sheet-mask" style={{ zIndex: 70 }} onClick={() => setEditing(null)}>
                <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                    <div className="rd-sheet-grip" onClick={() => setEditing(null)} />
                    <div className="rd-sheet-title">改生成提示词</div>
                    <div className="rd-muted" style={{ marginBottom: 'var(--rd-space-4)' }}>
                        改的是「{presetNameOf(preset, presetStore)}」里的这一条，<br />
                        用这一套的角色都会跟着变。
                    </div>
                    <PromptFold
                        label={editing}
                        desc={getPromptEntries().find((e) => e.label === editing)?.description ?? ''}
                        users={characters
                            .filter((c) => charPrefsOf(charPrefs, c.id).promptPreset === preset)
                            .map((c) => c.name).join('、')}
                        preset={preset}
                        defaultOpen
                        onSaved={() => setBump((n) => n + 1)}
                    />
                    <div className="rd-actions" style={{ marginTop: 'var(--rd-space-4)' }}>
                        <button className="rd-btn rd-btn-primary rd-btn-block" onClick={() => setEditing(null)}>好了</button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}

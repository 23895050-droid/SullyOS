// 读书模块 · 「他/她的阅读风格」弹卡（她 09-20）
//
// 两块分开、各自独立（她原话）：
//   · **阅读气质**——读书时带着的那六个元素（两个动词 + 两个经典公式/数列 + 两个名词意象），
//     只作**气质基调参考**；可以单独重roll（重roll 时把已有的偏好递过去当参考）。
//   · **阅读偏好**——读什么、怎么读；**读书时不带**，留给「给书架上的书留印象、挑书」用。
// 两个注入开关各管各的；底部还有一个「两块一起重roll」。
// 笔色也在这张卡上（分析出来的那支笔，也是他划线的颜色）。

import { useState } from 'react';
import { ArrowsClockwise, PaintBrush, X } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { charStyleOf, setCharStyle, useReaderCharStyle } from './readerCharStyle';
import { resolveReadApi } from '../../utils/reader/readerChat';
import { analyzeCharStyle } from '../../utils/reader/readerStyle';
import { getCoReadStore, readApiSlots } from './coreadStore';
import { charPrefsOf, useReaderCharPrefs } from './readerCharPrefs';

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
    const pen = charPrefsOf(charPrefs, charId).penColor;
    const [busy, setBusy] = useState<null | 'both' | 'pref' | 'vibe'>(null);

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

    const switchRow = (label: string, on: boolean, toggle: () => void, hint: string) => (
        <div className="rd-switch-row">
            <div className="rd-row-label">{label}</div>
            <button className={`rd-switch${on ? ' rd-switch-on' : ''}`} aria-label={label} onClick={toggle}>
                <span className="rd-switch-knob" />
            </button>
            <div className="rd-muted">{hint}</div>
        </div>
    );

    return (
        <div className="rd-sheet-mask" onClick={onClose}>
            <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="rd-sheet-grip" onClick={onClose} />
                <div className="rd-sheet-title">{name} 的阅读风格</div>

                {/* 笔色 */}
                <div className="rd-card" style={{ marginBottom: 'var(--rd-space-4)' }}>
                    <div className="rd-row">
                        <span className="rd-row-label">做笔记的笔色</span>
                        <span className="rd-note-by">
                            <span className="rd-note-dot" style={{ background: pen ?? 'var(--rd-rule)' }} />
                            {pen ?? '还没选'}
                        </span>
                    </div>
                    <div className="rd-muted">
                        <PaintBrush size={13} /> 第一次读书前他自己挑的：深、稳、不刺眼，避开纯黑纯白和太亮的颜色。
                    </div>
                </div>

                {/* 阅读气质（读书时带着的那一块） */}
                <div className="rd-section-title">阅读气质（读书时带着）</div>
                <div className="rd-card">
                    {style.vibe ? (
                        <div className="rd-style-text">{style.vibe.text || '（这一份是空的）'}</div>
                    ) : (
                        <div className="rd-muted">还没取过。等他第一次读书时会自动取一个。</div>
                    )}
                    {switchRow(
                        '读书时带上它',
                        style.vibeInject,
                        () => setCharStyle(charId, { vibeInject: !style.vibeInject }),
                        '只当气质基调参考，不会写进批注，也不当设定用。',
                    )}
                    <button className="rd-btn rd-btn-soft rd-btn-block" disabled={busy !== null}
                        onClick={() => void run('vibe')}>
                        <ArrowsClockwise size={15} /> {busy === 'vibe' ? '正在重取…' : '只重取气质（带着已有偏好当参考）'}
                    </button>
                </div>

                {/* 阅读偏好（读书时不带的那一块） */}
                <div className="rd-section-title">阅读偏好（挑书、给书留印象用）</div>
                <div className="rd-card">
                    {style.pref ? (
                        <div className="rd-style-text">{style.pref.text || '（这一份是空的）'}</div>
                    ) : (
                        <div className="rd-muted">还没分析过。</div>
                    )}
                    {switchRow(
                        '挑书时带上它',
                        style.prefInject,
                        () => setCharStyle(charId, { prefInject: !style.prefInject }),
                        '读书的过程里不带它——书才是主角。',
                    )}
                    <button className="rd-btn rd-btn-soft rd-btn-block" disabled={busy !== null}
                        onClick={() => void run('pref')}>
                        <ArrowsClockwise size={15} /> {busy === 'pref' ? '正在重跑…' : '只重新分析偏好'}
                    </button>
                </div>

                <div className="rd-actions">
                    <button className="rd-btn rd-btn-primary rd-btn-block" disabled={busy !== null}
                        onClick={() => void run('both')}>
                        {busy === 'both' ? '两块都在跑…' : '两块一起重取'}
                    </button>
                    <button className="rd-btn rd-btn-block" onClick={onClose}>
                        <X size={14} /> 关掉
                    </button>
                </div>
            </div>
        </div>
    );
}

// 读书模块 · 设置页「使用书库的朋友」（2026-09-21，T6 ④）
//
// 书库页最底下那堆开关**搬到这里**（她 09-21 定的：书库页不该是一堆开关）。
//
// 这一页就是「谁在读书」的名册：一个人一行——可以一起读 / 还没开，右边一个开关；
// 点名字进他自己的设置页（提示词套、每次读几页、笔记上限、回复模式、阅读风格、他自己的模型都在那儿）。

import { ArrowLeft } from '@phosphor-icons/react';
import { useOS } from '../../../context/OSContext';
import { useBlobRefUrl } from '../../../utils/blobRef';
import { charPrefsOf, setReadEnabled, useReaderCharPrefs } from '../readerCharPrefs';
import { presetNameOf, usePromptPresets } from '../readerPromptPresets';
import { useReaderCharStyle } from '../readerCharStyle';

/** 圆头像（宽度由调用方给；样式在 `.rd-face`） */
function Face({ avatar, name, size = 38 }: { avatar?: string; name: string; size?: number }) {
    const url = useBlobRefUrl(avatar);
    return (
        <div className="rd-face" style={{ width: size }}>
            {url ? <img src={url} alt="" /> : <span>{name.slice(0, 1)}</span>}
        </div>
    );
}

interface Props {
    onBack: () => void;
    /** 进他的设置页（整屏角色页落在设置那屏） */
    onOpenChar: (charId: string) => void;
}

export default function ReaderSetFriends({ onBack, onOpenChar }: Props) {
    const { characters } = useOS();
    const charPrefs = useReaderCharPrefs();
    const presetStore = usePromptPresets();
    const styleStore = useReaderCharStyle();

    const onCount = characters.filter((c) => charPrefsOf(charPrefs, c.id).readEnabled).length;

    return (
        <div className="rd-screen page-focus-once" data-rd-page="settings-friends">
            <div className="rd-headbar">
                <button className="rd-back" onClick={onBack}><ArrowLeft size={18} />设置</button>
                <div className="rd-headbar-title">使用书库的朋友</div>
            </div>

            <div className="rd-muted" style={{ marginBottom: 'var(--rd-space-3)' }}>
                开了开关的角色才会出现在一起读书的邀请名单里，也才有自己的状态、活动记录和排行榜。
                默认是关的。点名字进他自己的设置页。
            </div>
            <div className="rd-section-title">一共 {onCount} 位在读书</div>

            {characters.length === 0 ? (
                <div className="rd-card rd-muted">还没有角色。</div>
            ) : (
                <div className="rd-card rd-card-flush">
                    <div className="rd-list">
                        {characters.map((c) => {
                            const p = charPrefsOf(charPrefs, c.id);
                            const gotStyle = !!(styleStore.chars[c.id]?.pref || styleStore.chars[c.id]?.vibe);
                            const bits = [
                                p.readEnabled ? '可以一起读' : '还没开',
                                presetNameOf(p.promptPreset, presetStore),
                                p.replyMode ? '回复模式开着' : '',
                                p.penColor ? '有自己的笔色' : '',
                                gotStyle ? '' : '还没做阅读风格分析',
                            ].filter(Boolean);
                            return (
                                <div className="rd-item" key={c.id}>
                                    <button className="rd-lib-open" onClick={() => onOpenChar(c.id)} aria-label={`进 ${c.name} 的设置`}>
                                        <Face avatar={c.avatar} name={c.name} size={38} />
                                    </button>
                                    <button className="rd-item-label rd-lib-name" onClick={() => onOpenChar(c.id)}>
                                        {c.name}
                                        <div className="rd-muted" style={{ fontSize: 'var(--rd-fs-caption)' }}>
                                            {bits.join(' · ')}
                                        </div>
                                    </button>
                                    <button
                                        className={`rd-switch${p.readEnabled ? ' rd-switch-on' : ''}`}
                                        aria-label={`${c.name} 允许读书`}
                                        onClick={() => setReadEnabled(c.id, !p.readEnabled)}
                                    >
                                        <span className="rd-switch-knob" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="rd-section-title">一次全开 / 全关</div>
            <div className="rd-btn-row">
                <button
                    className="rd-btn"
                    onClick={() => characters.forEach((c) => setReadEnabled(c.id, true))}
                >
                    都开
                </button>
                <button
                    className="rd-btn"
                    onClick={() => characters.forEach((c) => setReadEnabled(c.id, false))}
                >
                    都关
                </button>
            </div>
        </div>
    );
}

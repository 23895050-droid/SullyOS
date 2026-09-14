// 读书模块 · 书库页 = 角色读书空间（2026-09-15 UI 轮重写）
//
// 与笔记页的分工（v3 §4.4 特意强调别做成同一个页面的两种排序）：
//   笔记页 = 按书组织，看「这本书上留下了什么痕迹」；
//   书库页 = 按角色组织，看「这个人的读书轨迹」。
// 这一版落地「谁能读书」的开关（默认关，参考图的 iOS 开关那套）；
// 角色书架 / 时间轴 / 各自笔记在批二。
//
// 开关存我们自己的 reader_prefs_v1.readingChars，不碰上游角色表。

import { useEffect, useState } from 'react';
import { SquaresFour } from '@phosphor-icons/react';
import { DB } from '../../../utils/db';
import { useBlobRefUrl } from '../../../utils/blobRef';
import { setReadingChar, useReaderPrefs, type ReaderPrefs } from '../readerPrefs';

interface CharRow { id: string; name: string; avatar?: string }

/** 头像（没有就一个首字圆）——hook 不能进 map，所以单独一个组件 */
function CharAvatar({ avatar, name }: { avatar?: string; name: string }) {
    const url = useBlobRefUrl(avatar);
    if (!url) {
        return (
            <div
                className="rd-note-cover"
                style={{ width: 38, borderRadius: 'var(--rd-r-pill)', aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
                <span style={{ fontSize: 'var(--rd-fs-md)' }}>{name.slice(0, 1)}</span>
            </div>
        );
    }
    return (
        <div className="rd-note-cover" style={{ width: 38, borderRadius: 'var(--rd-r-pill)', aspectRatio: '1 / 1' }}>
            <img className="rd-cover-img" src={url} alt="" />
        </div>
    );
}

export default function ReaderLibrary() {
    const prefs = useReaderPrefs();
    const [chars, setChars] = useState<CharRow[]>([]);

    useEffect(() => {
        void (async () => {
            const all = await DB.getAllCharacters();
            setChars((all || []).map((c: { id: string; name: string; avatar?: string }) => ({
                id: c.id, name: c.name, avatar: c.avatar,
            })));
        })();
    }, []);

    const on = (p: ReaderPrefs, id: string) => p.readingChars.includes(id);

    return (
        <div className="rd-screen" data-rd-page="library">
            <div className="rd-head">
                <div className="rd-head-main">
                    <div className="rd-head-title">书库</div>
                    <div className="rd-head-sub">谁在读书 · {prefs.readingChars.length} 位</div>
                </div>
            </div>

            <div className="rd-muted" style={{ marginBottom: 'var(--rd-space-3)' }}>
                开了开关的角色才会出现在这里，也才能被喊来一起读。默认是关的。
            </div>

            {chars.length === 0 ? (
                <div className="rd-empty">
                    <SquaresFour size={44} weight="thin" />
                    <div className="rd-empty-text">还没有角色</div>
                </div>
            ) : (
                <div className="rd-card rd-card-flush">
                    <div className="rd-list">
                        {chars.map((c) => (
                            <div className="rd-item" key={c.id}>
                                <CharAvatar avatar={c.avatar} name={c.name} />
                                <span className="rd-item-label">
                                    {c.name}
                                    <div className="rd-muted" style={{ fontSize: 'var(--rd-fs-caption)' }}>
                                        {on(prefs, c.id) ? '可以一起读' : '还没开'}
                                    </div>
                                </span>
                                <button
                                    className={`rd-switch${on(prefs, c.id) ? ' rd-switch-on' : ''}`}
                                    aria-label={`${c.name} 允许读书`}
                                    onClick={() => setReadingChar(c.id, !on(prefs, c.id))}
                                >
                                    <span className="rd-switch-knob" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="rd-muted" style={{ marginTop: 'var(--rd-space-4)' }}>
                角色的书架、阅读时间轴、只属于 Ta 的笔记，下一批做。
            </div>
        </div>
    );
}

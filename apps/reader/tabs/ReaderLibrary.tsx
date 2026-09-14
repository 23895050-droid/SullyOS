// 读书模块 · 书库页 = 角色读书空间（2026-09-14）
//
// 与笔记页的分工（v3 §4.4 特意强调别做成同一个页面的两种排序）：
//   笔记页 = 按书组织，看「这本书上留下了什么痕迹」；
//   书库页 = 按角色组织，看「这个人的读书轨迹」。
// 第一批先落地「谁能读书」的开关（默认关）；角色书架 / 时间轴 / 各自笔记在第二批。
//
// 开关存我们自己的 reader_prefs_v1.readingChars，不碰上游角色表。

import { useEffect, useState } from 'react';
import { DB } from '../../../utils/db';
import { setReadingChar, useReaderPrefs, type ReaderPrefs } from '../readerPrefs';

interface CharRow { id: string; name: string }

export default function ReaderLibrary() {
    const prefs = useReaderPrefs();
    const [chars, setChars] = useState<CharRow[]>([]);

    useEffect(() => {
        void (async () => {
            const all = await DB.getAllCharacters();
            setChars((all || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
        })();
    }, []);

    const on = (p: ReaderPrefs, id: string) => p.readingChars.includes(id);

    return (
        <div className="rd-shelf" data-rd-page="library">
            <div className="rd-shelf-head">
                <div className="rd-shelf-title">书库</div>
                <div className="rd-shelf-count">谁在读书</div>
            </div>
            <div className="rd-muted" style={{ marginBottom: 'var(--rd-space-3)' }}>
                开了开关的角色才会出现在这里，也才能被喊来一起读。默认是关的。
            </div>
            <div className="rd-shelf-list">
                {chars.length === 0 && <div className="rd-empty">还没有角色</div>}
                {chars.map((c) => (
                    <div className="rd-row" key={c.id} style={{ background: 'var(--rd-paper-2)', borderRadius: 'var(--rd-radius-card)', padding: 'var(--rd-space-3)' }}>
                        <span>{c.name}</span>
                        <button
                            className={on(prefs, c.id) ? 'rd-btn rd-btn-primary' : 'rd-btn'}
                            onClick={() => setReadingChar(c.id, !on(prefs, c.id))}
                        >
                            {on(prefs, c.id) ? '在读书' : '关着'}
                        </button>
                    </div>
                ))}
            </div>
            <div className="rd-empty" style={{ paddingTop: 'var(--rd-space-6)' }}>
                <div className="rd-muted">
                    角色的书架、阅读时间轴、只属于 Ta 的笔记，在第二批做。
                </div>
            </div>
        </div>
    );
}

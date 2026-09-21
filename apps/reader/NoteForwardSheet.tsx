// 读书模块 · 「转给谁」小弹卡（2026-09-20，T4）
//
// 自包含：笔记库、个人笔记库、角色个人页都用它——传一条笔记进来，选一个人转过去。
// 转出去的是**这张卡上的话**（原文那句 + 批注 + 讨论），不是书里的全文。

import { useState } from 'react';
import { CaretRight, PaperPlaneRight } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { useBlobRefUrl } from '../../utils/blobRef';
import { forwardNoteCard, type NoteForwardCard } from './readerForward';

interface Props {
    card: NoteForwardCard;
    onClose: () => void;
    notify: (msg: string) => void;
}

/** 头像（hook 不能进 map，单独一个组件） */
function Row({ name, avatar, busy, onPick }: {
    name: string; avatar?: string;
    busy: boolean; onPick: () => void;
}) {
    const url = useBlobRefUrl(avatar);
    return (
        <button className="rd-item rd-item-tap" disabled={busy} onClick={onPick}>
            <div className="rd-note-cover" style={{ width: 34, borderRadius: 'var(--rd-r-pill)', aspectRatio: '1 / 1' }}>
                {url
                    ? <img className="rd-cover-img" src={url} alt="" />
                    : <div className="rd-book-cover-ph">{name.slice(0, 1)}</div>}
            </div>
            <span className="rd-item-label">{name}</span>
            <span className="rd-item-chev"><CaretRight size={14} /></span>
        </button>
    );
}

export default function NoteForwardSheet({ card, onClose, notify }: Props) {
    const { characters } = useOS();
    const [busy, setBusy] = useState<string | null>(null);

    const send = async (id: string, name: string) => {
        const target = characters.find((c) => c.id === id);
        if (!target) { notify('找不到这个人了'); return; }
        setBusy(id);
        try {
            await forwardNoteCard(target, card);
            notify(`转给 ${name} 了`);
            onClose();
        } catch (err) {
            notify(`没转出去：${err instanceof Error ? err.message : '未知错误'}`);
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="rd-sheet-mask" onClick={onClose}>
            <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="rd-sheet-grip" onClick={onClose} />
                <div className="rd-sheet-title">转给谁</div>
                <div className="rd-muted" style={{ marginBottom: 'var(--rd-space-4)' }}>
                    转过去的是这张卡上的话：原文那一句、<br />批注和讨论。书里的全文不会跟着过去。
                </div>

                {characters.length === 0 ? (
                    <div className="rd-empty">
                        <PaperPlaneRight size={40} weight="thin" />
                        <div className="rd-empty-text">还没有角色</div>
                    </div>
                ) : (
                    <div className="rd-card rd-card-flush">
                        <div className="rd-list">
                            {characters.map((c) => (
                                <Row
                                    key={c.id}
                                    name={c.name}
                                    avatar={c.avatar}
                                    busy={busy !== null}
                                    onPick={() => void send(c.id, c.name)}
                                />
                            ))}
                        </div>
                    </div>
                )}

                <div className="rd-actions">
                    <button className="rd-btn rd-btn-block" onClick={onClose}>先不转</button>
                </div>
            </div>
        </div>
    );
}

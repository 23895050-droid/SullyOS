// 读书模块 · 一条笔记/讨论的折叠行（她 09-21）
//
// 她原话：「笔记和讨论还是做成折叠展开看详细内容的那种，展开之后才能选择转发或者
// 跳转到原文看，不把转发做在表面，不默认点笔记和讨论就跳转。」
//
// 所以：收着只看得到**他写的那段**（批注正文 / 他说的最后一句）+ 一行小字；
// 点一下才展开——原文那一句、讨论、以及**转发 / 查看原文**两个动作都在展开里。

import { useState, type ReactNode } from 'react';
import { CaretDown } from '@phosphor-icons/react';

interface Props {
    /** 收着也看得见的那行小字（谁 · 第几章 · 日期） */
    meta: ReactNode;
    /** 他写的那段（批注，或他在讨论里说的那句） */
    text: string;
    /** 展开后：原文那一句 */
    quote?: string;
    /** 展开后：讨论（自己拼好传进来） */
    thread?: ReactNode;
    /** 展开后才有 */
    onForward?: () => void;
    onOpenAt?: () => void;
    /** 时间线上那颗点（不传就不画） */
    dotColor?: string;
}

export default function NoteFold({ meta, text, quote, thread, onForward, onOpenAt, dotColor }: Props) {
    const [open, setOpen] = useState(false);
    return (
        <div className={`rd-fn${open ? ' rd-fn-open' : ''}`}>
            <button className="rd-fn-head" onClick={() => setOpen((v) => !v)}>
                {dotColor && <span className="rd-fn-dot" style={{ background: dotColor }} />}
                <span className="rd-fn-main">
                    <span className="rd-fn-meta">{meta}</span>
                    <span className="rd-fn-text">{text}</span>
                </span>
                <CaretDown size={14} className={`rd-fold-chev${open ? ' rd-fold-chev-on' : ''}`} />
            </button>

            {open && (
                <div className="rd-fn-body">
                    {quote && <div className="rd-fn-quote">“{quote}”</div>}
                    {thread}
                    {(onForward || onOpenAt) && (
                        <div className="rd-fn-acts">
                            {onForward && (
                                <button className="rd-fn-act" onClick={onForward}>转发</button>
                            )}
                            {onOpenAt && (
                                <button className="rd-fn-act" onClick={onOpenAt}>查看原文</button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

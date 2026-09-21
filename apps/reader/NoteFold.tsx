// 读书模块 · 一条笔记/讨论的折叠行（她 09-21；当日按她的反馈重排过）
//
// 她 09-21 原话：「笔记和讨论还是做成折叠展开看详细内容的那种，展开之后才能选择转发或者
// 跳转到原文看，不把转发做在表面，不默认点笔记和讨论就跳转。」
//
// 当天她又补了两条（拿她自己的截图对出来的）：
//   · **表面要显示原文**——原来表面只有「他说的那句」，看不出这是在说书里的哪一段；
//   · **展开要是完整的讨论记录**——她那条原批注（讨论的根）原来根本不在展开里，
//     展开只有他接的那几条话。所以现在展开 = 原批注（衬线，和讨论聊天气泡分开）+ 全部讨论话。
//
// 收着：原文那一句 + 他写的那句（有的话）
// 展开：原批注（`note`，没有就不占位）→ 讨论 → 转发 / 查看原文

import { useState, type ReactNode } from 'react';
import { CaretDown } from '@phosphor-icons/react';

interface Props {
    /** 收着也看得见的那行小字（谁 · 第几章 · 日期） */
    meta: ReactNode;
    /** 收着的那行：**原文那一句**（她 09-21：表面要能看见原文） */
    quote?: string;
    /** 收着的那行：他写的那段（批注，或他在讨论里说的最后一句）；没有就不画 */
    text?: string;
    /** 展开里那块**原批注**——只在这一页的表面没写过它时才传（不然就重复了） */
    note?: ReactNode;
    /** 展开后：讨论（自己拼好传进来） */
    thread?: ReactNode;
    /** 展开后才有 */
    onForward?: () => void;
    onOpenAt?: () => void;
    /** 时间线上那颗点（不传就不画） */
    dotColor?: string;
}

export default function NoteFold({ meta, quote, text, note, thread, onForward, onOpenAt, dotColor }: Props) {
    const [open, setOpen] = useState(false);
    return (
        <div className={`rd-fn${open ? ' rd-fn-open' : ''}`}>
            <button className="rd-fn-head" onClick={() => setOpen((v) => !v)}>
                {dotColor && <span className="rd-fn-dot" style={{ background: dotColor }} />}
                <span className="rd-fn-main">
                    <span className="rd-fn-meta">{meta}</span>
                    {quote && <span className="rd-fn-quote-line">“{quote}”</span>}
                    {text && <span className="rd-fn-text">{text}</span>}
                </span>
                <CaretDown size={14} className={`rd-fold-chev${open ? ' rd-fold-chev-on' : ''}`} />
            </button>

            {open && (
                <div className="rd-fn-body">
                    {note}
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

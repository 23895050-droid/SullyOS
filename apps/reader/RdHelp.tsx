// 读书模块 · 小圆圈问号（她 09-21）
//
// 她的原话：「你所有的解释，包括小标题后面的括号都删了，解释的话全都收到一个小圆圈问号里面，
// 点了直接展开这页里面到底是什么东西，重取规则如何。」
//
// 所以规矩是：**界面上不再出现解释性的散文和括号**，一句话以上的说明一律进这儿。
// 收着只有一枚小问号，点一下在原地展开（不弹层、不盖住东西，展开就在它下面那一行）。

import { useState, type ReactNode } from 'react';
import { Question } from '@phosphor-icons/react';

interface Props {
    children: ReactNode;
    /** 无障碍名字，默认「说明」 */
    label?: string;
}

export default function RdHelp({ children, label = '说明' }: Props) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                type="button"
                className={`rd-help${open ? ' rd-help-on' : ''}`}
                aria-label={label}
                aria-expanded={open}
                onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
            >
                <Question size={12} weight="bold" />
            </button>
            {open && <div className="rd-help-body">{children}</div>}
        </>
    );
}

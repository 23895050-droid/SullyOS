// 读书模块 · 读书提示词（2026-09-16）
//
// 她 09-16 点名：**摘要的提示词放书房的大设置里**，别塞在共读面板里
// （面板里只留「摘要规则」——什么时候总结；提示词本身在这儿改）。
//
// 数据源照 noxhome 那套：utils/promptRegistry 的 '读书' 分类（默认值 + 用户覆盖），
// 改完立刻生效、不用重载。这里只是给读书模块做一版**跟书房一个样**的编辑器
// （PromptSettings 那版是情侣页的 tailwind 卡片，配色跟这边不搭）。

import { useState } from 'react';
import { CaretDown, CheckCircle } from '@phosphor-icons/react';
import {
    getPrompt, getPromptEntries, isPromptOverridden, resetPrompt, savePrompt, type PromptEntry,
} from '../../utils/promptRegistry';

function PromptRow({ entry, onChanged }: { entry: PromptEntry; onChanged: () => void }) {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState(getPrompt(entry.label));
    const [saved, setSaved] = useState(false);
    const overridden = isPromptOverridden(entry.label);

    const flash = () => {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1500);
    };

    return (
        <div className={`rd-fold${open ? ' rd-fold-open' : ''}`} style={{ marginTop: 0 }}>
            <button className="rd-fold-head rd-prompt-head" onClick={() => setOpen((v) => !v)}>
                <span className="rd-prompt-top">
                    <span className="rd-fold-label">
                        {entry.label}
                        {overridden && <span className="rd-fold-badge">已改过</span>}
                    </span>
                    <CaretDown size={15} className="rd-fold-chev" />
                </span>
                <span className="rd-prompt-desc">{entry.description}</span>
            </button>
            {open && (
                <div className="rd-fold-body">
                    <textarea
                        className="rd-field rd-field-area"
                        rows={8}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        // 手机上键盘一起来就把光标那行顶到能看见的地方（她 09-21 报的输入框被挡）
                        onFocus={(e) => {
                            const el = e.currentTarget;
                            window.setTimeout(() => el.scrollIntoView({ block: 'center' }), 300);
                        }}
                    />
                    <div className="rd-btn-row">
                        <button
                            className={`rd-btn ${saved ? 'rd-btn-soft' : 'rd-btn-primary'}`}
                            onClick={() => { savePrompt(entry.label, text); flash(); onChanged(); }}
                        >
                            {saved ? '已保存' : '保存'}
                        </button>
                        <button
                            className="rd-btn"
                            onClick={() => { resetPrompt(entry.label); setText(entry.defaultValue); onChanged(); }}
                            disabled={!overridden && text === entry.defaultValue}
                        >
                            恢复默认
                        </button>
                        {saved && <CheckCircle size={16} className="rd-check" />}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function ReaderPromptsSheet({ onClose }: { onClose: () => void }) {
    /** 只列读书分类的（别的模块的提示词在它们各自的地方改） */
    const entries = getPromptEntries().filter((e) => e.category === '读书');
    const [, bump] = useState(0);

    return (
        <div className="rd-sheet-mask" onClick={onClose}>
            <div className="rd-sheet rd-sheet-tall" onClick={(e) => e.stopPropagation()}>
                <div className="rd-sheet-grip" />
                <div className="rd-sheet-title">读书提示词</div>
                <div className="rd-muted" style={{ marginBottom: 'var(--rd-space-3)' }}>
                    共读时发给模型的话，改完立刻生效。「摘要规则」（什么时候总结）在共读面板里选。
                </div>
                <div className="rd-sheet-body" style={{ overflowY: 'auto' }}>
                    {entries.map((e) => (
                        <PromptRow key={e.label} entry={e} onChanged={() => bump((n) => n + 1)} />
                    ))}
                </div>
            </div>
        </div>
    );
}

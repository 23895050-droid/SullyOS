// 读书模块 · 设置页「读书提示词」（2026-09-21，T6 ②）
//
// 她 09-21 定的第二条：这一页要能
//   · 看现在用的是哪一套（默认套 / rp 套 / 她自己新加的套）；
//   · 每个提示词配置给了哪几个角色（每条 fold 下面挂着「谁在用」）；
//   · 可加新预设（新建一套 = 从某一套抄一份当前生效的正文，再逐条改）；
//   · 可为角色切预设（每个角色一行胶囊，点一下就换）。
//
// 底下那三条正文的取用口子是 `promptForPreset(preset, label)`——共读/回复/风格分析
// 三条链路都从那儿取，改了立刻生效（不重载）。
//
// （这一页取代了原来的「读书提示词」底部弹卡：弹卡里只能改默认套，看不见「谁在用」。）

import { useState } from 'react';
import { ArrowLeft, CaretDown, CheckCircle } from '@phosphor-icons/react';
import { useOS } from '../../../context/OSContext';
import { getPromptEntries } from '../../../utils/promptRegistry';
import {
    addPromptPreset, isPresetPromptOverridden, listPromptPresets, presetNameOf, promptForPreset,
    removePromptPreset, renamePromptPreset, resetPresetPrompt, savePresetPrompt, usePromptPresets,
} from '../readerPromptPresets';
import { charPrefsOf, setCharReadPrefs, useReaderCharPrefs } from '../readerCharPrefs';

interface Props {
    onBack: () => void;
    notify?: (msg: string) => void;
}

/** 一条提示词：收着是「名字 + 说明 + 谁在用」，点开才能改（改的是当前选中的那一套） */
function PromptFold({ label, desc, users, preset, onSaved }: {
    label: string;
    desc: string;
    users: string;
    preset: string;
    onSaved: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState(() => promptForPreset(preset, label));
    const [saved, setSaved] = useState(false);
    const overridden = isPresetPromptOverridden(preset, label);

    // 换了一套就从那一套重新取一份（不然文本框里还是上一套的正文）
    const [seen, setSeen] = useState(preset);
    if (seen !== preset) {
        setSeen(preset);
        setText(promptForPreset(preset, label));
    }

    const flash = () => {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1500);
    };

    return (
        <div className={`rd-fold${open ? ' rd-fold-open' : ''}`} style={{ marginTop: 0 }}>
            <button className="rd-fold-head rd-prompt-head" onClick={() => setOpen((v) => !v)}>
                <span className="rd-prompt-top">
                    <span className="rd-fold-label">
                        {label}
                        {overridden && <span className="rd-fold-badge">已改过</span>}
                    </span>
                    <CaretDown size={15} className="rd-fold-chev" />
                </span>
                <span className="rd-prompt-desc">{desc}</span>
                {users && <span className="rd-prompt-desc">谁在用：{users}</span>}
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
                            onClick={() => { savePresetPrompt(preset, label, text); flash(); onSaved(); }}
                        >
                            {saved ? '已保存' : '保存'}
                        </button>
                        <button
                            className="rd-btn"
                            onClick={() => {
                                resetPresetPrompt(preset, label);
                                setText(promptForPreset(preset, label));
                                onSaved();
                            }}
                            disabled={!overridden}
                        >
                            恢复这套的默认
                        </button>
                        {saved && <CheckCircle size={16} className="rd-check" />}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function ReaderSetPrompts({ onBack, notify }: Props) {
    const { characters } = useOS();
    const presetStore = usePromptPresets();
    const charPrefs = useReaderCharPrefs();
    const [editing, setEditing] = useState('');
    /** 存过/恢复过就重画一次（让「已改过」小标和按钮的禁用态跟上） */
    const [, setBump] = useState(0);
    const [newOpen, setNewOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [renaming, setRenaming] = useState(false);
    const [renameText, setRenameText] = useState('');
    const [confirmDel, setConfirmDel] = useState(false);

    const list = listPromptPresets(presetStore);
    const entries = getPromptEntries().filter((e) => e.category === '读书');
    const presetOfChar = (charId: string) => charPrefsOf(charPrefs, charId).promptPreset;

    /** 这一套现在给谁用（名字串） */
    const whoUses = (presetId: string): string =>
        characters.filter((c) => presetOfChar(c.id) === presetId).map((c) => c.name).join('、');

    /** 这条提示词现在给哪几个角色（写清每人在哪一套） */
    const whoOf = (): string =>
        characters.map((c) => `${c.name}（${presetNameOf(presetOfChar(c.id), presetStore)}）`).join('、');

    const custom = editing !== '' && editing !== 'rp';
    const curName = presetNameOf(editing, presetStore);

    return (
        <div className="rd-screen" data-rd-page="settings-prompts">
            <div className="rd-headbar">
                <button className="rd-back" onClick={onBack}><ArrowLeft size={18} />设置</button>
                <div className="rd-headbar-title">读书提示词</div>
            </div>

            {/* ① 有哪几套 + 正在编辑哪一套 */}
            <div className="rd-card">
                <div className="rd-row">
                    <span className="rd-row-label">编辑哪一套</span>
                    <span className="rd-item-value">{curName}</span>
                </div>
                <div className="rd-chips rd-chips-wrap">
                    {list.map((p) => (
                        <button
                            key={p.id || 'def'}
                            className={`rd-chip${editing === p.id ? ' rd-chip-on' : ''}`}
                            onClick={() => { setEditing(p.id); setConfirmDel(false); setRenaming(false); }}
                        >
                            {p.name}{!p.builtin && whoUses(p.id) ? `（${whoUses(p.id)}）` : ''}
                        </button>
                    ))}
                    <button className="rd-chip" onClick={() => { setNewOpen((v) => !v); setNewName(''); }}>
                        ＋ 新建一套
                    </button>
                </div>

                {newOpen && (
                    <div className="rd-field-row" style={{ marginTop: 'var(--rd-space-3)' }}>
                        <input
                            className="rd-field"
                            placeholder="这一套叫什么（比如「温柔版」）"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                        />
                        <button
                            className="rd-btn rd-btn-primary"
                            onClick={() => {
                                const p = addPromptPreset(newName, editing);
                                setEditing(p.id);
                                setNewOpen(false);
                                notify?.(`新建了「${p.name}」，正文是从「${curName}」抄来的，逐条改吧`);
                            }}
                        >
                            建
                        </button>
                    </div>
                )}

                <div className="rd-muted" style={{ marginTop: 'var(--rd-space-3)' }}>
                    {custom
                        ? '这一套是你自己加的：下面每条都能单独改，没改的条目跟着默认套走。'
                        : '内置的两套（默认套写「你正在……」，rp 套是角色扮演写法）也能改，改完立刻生效。'}
                </div>

                {custom && (
                    <div className="rd-btn-row" style={{ marginTop: 'var(--rd-space-3)' }}>
                        {renaming ? (
                            <>
                                <input className="rd-field" value={renameText} onChange={(e) => setRenameText(e.target.value)} />
                                <button className="rd-btn rd-btn-primary" onClick={() => { renamePromptPreset(editing, renameText); setRenaming(false); }}>存</button>
                            </>
                        ) : (
                            <button className="rd-btn" onClick={() => { setRenameText(curName); setRenaming(true); }}>改名</button>
                        )}
                        <button
                            className="rd-btn"
                            onClick={() => {
                                if (!confirmDel) { setConfirmDel(true); return; }
                                for (const c of characters) if (presetOfChar(c.id) === editing) setCharReadPrefs(c.id, { promptPreset: '' });
                                removePromptPreset(editing);
                                setEditing('');
                                setConfirmDel(false);
                                notify?.('删掉了这一套，用它的人回到默认套');
                            }}
                        >
                            {confirmDel ? '再点一次就删' : '删掉这套'}
                        </button>
                    </div>
                )}
            </div>

            {/* ② 谁在用哪一套（可为角色切预设） */}
            <div className="rd-section-title">谁在用哪一套</div>
            {characters.length === 0 ? (
                <div className="rd-card rd-muted">还没有角色。</div>
            ) : (
                <div className="rd-card">
                    {characters.map((c) => (
                        <div key={c.id} style={{ marginBottom: 'var(--rd-space-3)' }}>
                            <div className="rd-row-label">{c.name}</div>
                            <div className="rd-chips rd-chips-wrap">
                                {list.map((p) => (
                                    <button
                                        key={p.id || 'def'}
                                        className={`rd-chip${presetOfChar(c.id) === p.id ? ' rd-chip-on' : ''}`}
                                        onClick={() => setCharReadPrefs(c.id, { promptPreset: p.id })}
                                    >
                                        {p.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                    <div className="rd-muted">换一套立刻生效——下一次共读、下一次回复就用新的。</div>
                </div>
            )}

            {/* ③ 这一套里的每一条 */}
            <div className="rd-section-title">{curName} · 一共 {entries.length} 条</div>
            <div className="rd-card" key={editing}>
                {entries.map((e) => (
                    <PromptFold
                        key={e.label}
                        label={e.label}
                        desc={e.description}
                        users={whoUses(editing)}
                        preset={editing}
                        onSaved={() => setBump((n) => n + 1)}
                    />
                ))}
                <div className="rd-muted" style={{ marginTop: 'var(--rd-space-3)' }}>
                    谁在用（全体）：{whoOf() || '还没有角色'}
                </div>
            </div>
        </div>
    );
}

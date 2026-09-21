// 读书模块 · 设置页「挂到聊天里」（2026-09-21，T6 ②的后半）
//
// 她 09-21 的原话：「**按角色切换注入词挂载规则**（照 noxhome 设置页那套）」。
// 所以这页的骨架和情侣空间那页（apps/couple/MountSettings.tsx）是一样的：
// 选一个角色 → 四块数据各自一张卡（开关 / 当前会注入什么 / 关键词命中测试 / 世界书参数）。
//
// 四块（plan T9 ①）：
//   · 他的阅读状态 —— 提到读书，他知道自己最近五次阅读做了什么
//   · 他的书架进度 —— 提到读书，他知道自己手上几本书读到哪
//   · 某一本书的记录 —— 聊到书名（书名本身是动态触发词）
//   · 你的阅读进度 —— 他知道你读到哪，能自己判断要不要说「你拉我一把」
//
// **命中测试不烧 token**：纯函数本地算（拿关键词跟句子做匹配），随便试。
// 数据是现读现生成的（`primeReaderMount` 读一次库），所以预览里看到的就是下一轮聊天会注入的。

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CaretDown, Eye, Lightning } from '@phosphor-icons/react';
import { useOS } from '../../../context/OSContext';
import {
    READER_MOUNT_BLOCK_DESCS, READER_MOUNT_BLOCK_IDS, READER_MOUNT_BLOCK_LABELS,
    cachedReaderMount, primeReaderMount, readerMountBlockOf, readerMountHit, setReaderMountBlock,
    type ReaderMountBlockId,
} from '../../../utils/reader/readerMount';
import type { MountBlockConfig } from '../../../utils/noxhomeMount';
import type { WorldbookDepthRole, WorldbookPosition, WorldbookSelectiveLogic } from '../../../types';

const POSITION_LABELS: Record<string, string> = {
    '0': '角色定义之前', '1': '角色定义之后', '2': '作者注释之前', '3': '作者注释之后',
    '4': '聊天记录指定深度', '5': '示例消息之前', '6': '示例消息之后',
};
const ROLE_LABELS: Record<string, string> = { '0': '系统', '1': '用户', '2': 'AI' };
const LOGIC_LABELS: Record<string, string> = { '0': '任一命中', '1': '并非全部命中', '2': '全部未命中', '3': '全部命中' };

/** 一份逗号分隔的输入（关键词那种小字段都用它） */
function KeyField({ value, placeholder, onCommit }: { value: string[]; placeholder: string; onCommit: (v: string[]) => void }) {
    const [text, setText] = useState(value.join('，'));
    const [seen, setSeen] = useState(value);
    if (seen !== value) {
        setSeen(value);
        setText(value.join('，'));
    }
    return (
        <input
            className="rd-field"
            value={text}
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => onCommit(text.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean))}
        />
    );
}

function BlockCard({ charId, id, name }: { charId: string; id: ReaderMountBlockId; name: string }) {
    const block = readerMountBlockOf(charId, id);
    const [open, setOpen] = useState(false);
    const [test, setTest] = useState('');
    const [hitResult, setHitResult] = useState<string[] | null>(null);
    /** 预览要现读一次库（角色一变就重读） */
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let alive = true;
        void primeReaderMount(charId).then(() => { if (alive) setTick((n) => n + 1); });
        return () => { alive = false; };
    }, [charId, block.enabled]);

    const preview = useMemo(() => cachedReaderMount(charId, id)?.content ?? '', [charId, id, tick]);
    const set = (patch: Partial<MountBlockConfig>) => setReaderMountBlock(charId, id, patch);

    return (
        <div className="rd-card" style={{ marginBottom: 'var(--rd-space-4)' }}>
            <div className="rd-switch-row">
                <div className="rd-row-label">{READER_MOUNT_BLOCK_LABELS[id]}</div>
                <button
                    className={`rd-switch${block.enabled ? ' rd-switch-on' : ''}`}
                    aria-label={`${READER_MOUNT_BLOCK_LABELS[id]}开关`}
                    onClick={() => set({ enabled: !block.enabled })}
                >
                    <span className="rd-switch-knob" />
                </button>
            </div>
            <div className="rd-muted" style={{ margin: '2px 0 var(--rd-space-3)' }}>{READER_MOUNT_BLOCK_DESCS[id]}</div>

            {/* 预览：现在会注入什么（透明化的核心） */}
            <div className="rd-preview">
                <div className="rd-preview-head">
                    <Eye size={12} />
                    <span>{block.enabled ? `现在会注入（${name}的下一轮聊天）` : '预览（没开，不会注入）'}</span>
                </div>
                <div className="rd-preview-body">
                    {preview || '（现在没有可注入的内容——他还没读过、或者你还没读过）'}
                </div>
            </div>

            {/* 命中测试：把聊天里可能出现的话贴进来（纯本地，不烧 token） */}
            {!block.constant && (
                <div className="rd-hit-row">
                    <Lightning size={13} />
                    <input
                        className="rd-field"
                        placeholder="测试：把聊天里可能出现的话贴进来"
                        value={test}
                        onChange={(e) => { setTest(e.target.value); setHitResult(null); }}
                    />
                    <button className="rd-btn rd-btn-soft" onClick={() => setHitResult(readerMountHit(charId, test))}>
                        测
                    </button>
                    {hitResult && (
                        <span className={`rd-hit${hitResult.includes(id) ? ' rd-hit-on' : ''}`}>
                            {hitResult.includes(id) ? '命中 ✓' : '未命中'}
                        </span>
                    )}
                </div>
            )}

            <button className="rd-fold-head" style={{ marginTop: 'var(--rd-space-3)' }} onClick={() => setOpen((v) => !v)}>
                <span className="rd-fold-label">世界书参数</span>
                <CaretDown size={14} className={`rd-fold-chev${open ? ' rd-fold-chev-on' : ''}`} />
            </button>
            {open && (
                <div className="rd-mt-params">
                    <div className="rd-row">
                        <span className="rd-row-label">注入位置</span>
                        <select className="rd-select" value={String(block.position)}
                            onChange={(e) => set({ position: Number(e.target.value) as WorldbookPosition })}>
                            {Object.entries(POSITION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                    </div>
                    <div className="rd-row">
                        <span className="rd-row-label">顺序</span>
                        <input className="rd-field rd-field-num" type="number" value={block.order}
                            onChange={(e) => set({ order: Number(e.target.value) || 0 })} />
                    </div>
                    <div className="rd-row">
                        <span className="rd-row-label">插入深度</span>
                        <input className="rd-field rd-field-num" type="number" min={0} max={20} value={block.depth}
                            onChange={(e) => set({ depth: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })} />
                    </div>
                    <div className="rd-row">
                        <span className="rd-row-label">以谁的身份插入</span>
                        <select className="rd-select" value={String(block.role)}
                            onChange={(e) => set({ role: Number(e.target.value) as WorldbookDepthRole })}>
                            {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                    </div>
                    <div className="rd-row">
                        <span className="rd-row-label">扫描最近几条</span>
                        <input className="rd-field rd-field-num" type="number" min={1} max={50} value={block.scanDepth}
                            onChange={(e) => set({ scanDepth: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} />
                    </div>
                    <div className="rd-switch-row">
                        <div className="rd-row-label">每轮都注入（常量）</div>
                        <button className={`rd-switch${block.constant ? ' rd-switch-on' : ''}`} aria-label="常量注入"
                            onClick={() => set({ constant: !block.constant })}>
                            <span className="rd-switch-knob" />
                        </button>
                    </div>
                    {!block.constant && (
                        <>
                            <div className="rd-row-label" style={{ marginTop: 'var(--rd-space-3)' }}>关键词</div>
                            <KeyField value={block.key} placeholder="逗号分隔，比如：读书，看书" onCommit={(v) => set({ key: v })} />
                            {id === 'book' && (
                                <div className="rd-muted" style={{ marginTop: 4 }}>
                                    这一块的书名是动态触发词——书架上有哪几本，它们就自动是关键词。
                                </div>
                            )}
                            <div className="rd-row-label" style={{ marginTop: 'var(--rd-space-3)' }}>辅助关键词</div>
                            <KeyField value={block.keysecondary} placeholder="留空就不用" onCommit={(v) => set({ keysecondary: v })} />
                            {block.keysecondary.length > 0 && (
                                <div className="rd-row">
                                    <span className="rd-row-label">辅助逻辑</span>
                                    <select className="rd-select" value={String(block.selectiveLogic)}
                                        onChange={(e) => set({ selectiveLogic: Number(e.target.value) as WorldbookSelectiveLogic, selective: true })}>
                                        {Object.entries(LOGIC_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                    </select>
                                </div>
                            )}
                            <div className="rd-switch-row">
                                <div className="rd-row-label">按几率触发</div>
                                <button className={`rd-switch${block.useProbability ? ' rd-switch-on' : ''}`} aria-label="按几率触发"
                                    onClick={() => set({ useProbability: !block.useProbability })}>
                                    <span className="rd-switch-knob" />
                                </button>
                            </div>
                            {block.useProbability && (
                                <div className="rd-row">
                                    <span className="rd-row-label">几率 %</span>
                                    <input className="rd-field rd-field-num" type="number" min={0} max={100} value={block.probability}
                                        onChange={(e) => set({ probability: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default function ReaderSetMount({ onBack }: { onBack: () => void }) {
    const { characters } = useOS();
    const [charId, setCharId] = useState<string>('');
    const active = characters.find((c) => c.id === charId) ?? characters[0];

    if (characters.length === 0) {
        return (
            <div className="rd-screen" data-rd-page="settings-mount">
                <div className="rd-headbar">
                    <button className="rd-back" onClick={onBack}><ArrowLeft size={18} />设置</button>
                    <div className="rd-headbar-title">挂到聊天里</div>
                </div>
                <div className="rd-card rd-muted">还没有角色。</div>
            </div>
        );
    }

    return (
        <div className="rd-screen" data-rd-page="settings-mount">
            <div className="rd-headbar">
                <button className="rd-back" onClick={onBack}><ArrowLeft size={18} />设置</button>
                <div className="rd-headbar-title">挂到聊天里</div>
            </div>

            <div className="rd-muted" style={{ marginBottom: 'var(--rd-space-3)' }}>
                挂给谁：这几块会跟着他的每一次聊天走；关键词命中（或者常量）才拼进上下文。
                数据是现读现生成的——书架上、书上、记录里改了，下一轮聊天就是新的。
            </div>
            <div className="rd-chips rd-chips-wrap" style={{ marginBottom: 'var(--rd-space-4)' }}>
                {characters.map((c) => (
                    <button
                        key={c.id}
                        className={`rd-chip${active?.id === c.id ? ' rd-chip-on' : ''}`}
                        onClick={() => setCharId(c.id)}
                    >
                        {c.name}
                    </button>
                ))}
            </div>

            {active && READER_MOUNT_BLOCK_IDS.map((id) => (
                <BlockCard key={`${active.id}-${id}`} charId={active.id} id={id} name={active.name} />
            ))}
        </div>
    );
}

// 读书模块 · 设置页「模型与接口」（2026-09-21，T6 ①）
//
// 她 09-21 定的第一条：**读书的默认 api 分三档**（共读 / 单独读书 / 摘要）+ 手动回复那档
// （09-20 加的第 4 档），并且能进**角色自己的 api 配置页**。
//
// 四档的链子写在 utils/reader/readerChat.ts 的 resolveReadApi 里，这里只负责配：
//   · 角色自己的模型最先（比这里优先）——所以这页底下专门列一行「每个角色自己的模型」；
//   · 摘要那档**只认它自己**（没配就不跑，事后在活动记录里补摘）；
//   · 其余三档没配就往下落，落到底是大设置的那个主 API。
//
// 填 API 的界面一律接**主预设池**（她 08-30 的规矩）：点一下胶囊填三件套，匹配上的那颗点亮。

import { ArrowLeft, CaretRight } from '@phosphor-icons/react';
import { useOS } from '../../../context/OSContext';
import { setReadApiSlot, useCoReadStore, type CoReadApiConfig, type ReadApiSlot } from '../coreadStore';
import { charPrefsOf, useReaderCharPrefs } from '../readerCharPrefs';
import { normalizeApiBaseUrl, normalizeApiCredential, normalizeApiModel } from '../../../utils/apiConfigNormalize';

const SLOTS: Array<{ key: ReadApiSlot; label: string; desc: string }> = [
    { key: 'coread', label: '共读模型', desc: '一起读书时他读这一页用哪个。没配就落到单独读书 → 主 API' },
    { key: 'reply', label: '回复模型', desc: '手动 ⚡ 回一条讨论用哪个。没配就跟着共读模型' },
    { key: 'solo', label: '单独读书模型', desc: '他自己读书那条线用的。没配就落到主 API' },
    { key: 'summary', label: '摘要模型', desc: '共读/追逐的摘要用它——只认它自己，没配就不跑（事后能在活动记录里补摘）' },
];

interface Props {
    onBack: () => void;
    /** 进某个角色的 api 页（整屏角色页，落在 api 那屏） */
    onOpenChar: (charId: string) => void;
}

export default function ReaderSetApi({ onBack, onOpenChar }: Props) {
    const { characters, apiPresets } = useOS();
    const coread = useCoReadStore();
    const charPrefs = useReaderCharPrefs();

    const slots: Record<ReadApiSlot, CoReadApiConfig> = {
        coread: coread.coreadApi, reply: coread.replyApi, solo: coread.soloApi, summary: coread.summaryApi,
    };

    return (
        <div className="rd-screen page-focus-once" data-rd-page="settings-api">
            <div className="rd-headbar">
                <button className="rd-back" onClick={onBack}><ArrowLeft size={18} />设置</button>
                <div className="rd-headbar-title">模型与接口</div>
            </div>

            <div className="rd-muted" style={{ marginBottom: 'var(--rd-space-4)' }}>
                这里配的是读书的默认模型。角色自己配了就用他的——那比这里优先。
            </div>

            {SLOTS.map((slot) => {
                const cur = slots[slot.key];
                const filled = !!(cur.apiKey && cur.baseUrl && cur.model);
                const set = (patch: Partial<CoReadApiConfig>) => setReadApiSlot(slot.key, patch);
                return (
                    <div className="rd-card" key={slot.key} style={{ marginBottom: 'var(--rd-space-4)' }}>
                        <div className="rd-row-label">{slot.label}</div>
                        <div className="rd-muted" style={{ margin: '2px 0 var(--rd-space-3)' }}>{slot.desc}</div>
                        <div className="rd-chips rd-chips-wrap">
                            <button
                                className={`rd-chip${filled ? '' : ' rd-chip-on'}`}
                                onClick={() => setReadApiSlot(slot.key, { baseUrl: '', apiKey: '', model: '' })}
                            >
                                跟着大设置
                            </button>
                            {apiPresets.map((preset) => {
                                const on = filled
                                    && normalizeApiModel(cur.model) === normalizeApiModel(preset.config.model)
                                    && normalizeApiBaseUrl(cur.baseUrl) === normalizeApiBaseUrl(preset.config.baseUrl);
                                return (
                                    <button
                                        key={preset.id}
                                        className={`rd-chip${on ? ' rd-chip-on' : ''}`}
                                        onClick={() => set({
                                            baseUrl: normalizeApiBaseUrl(preset.config.baseUrl),
                                            apiKey: normalizeApiCredential(preset.config.apiKey),
                                            model: normalizeApiModel(preset.config.model),
                                        })}
                                    >
                                        {preset.name}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="rd-api-form">
                            <input className="rd-field" placeholder="baseUrl（带 /v1）" value={cur.baseUrl}
                                onChange={(e) => set({ baseUrl: e.target.value })} />
                            <input className="rd-field" placeholder="apiKey" value={cur.apiKey}
                                onChange={(e) => set({ apiKey: e.target.value })} />
                            <input className="rd-field" placeholder="model" value={cur.model}
                                onChange={(e) => set({ model: e.target.value })} />
                        </div>
                        <div className="rd-muted" style={{ marginTop: 'var(--rd-space-3)' }}>
                            {filled ? `现在用：${cur.model}` : (slot.key === 'summary' ? '没配 —— 摘要不会跑' : '现在往下落')}
                        </div>
                    </div>
                );
            })}

            <div className="rd-section-title">每个角色自己的模型</div>
            {characters.length === 0 ? (
                <div className="rd-card rd-muted">还没有角色。</div>
            ) : (
                <div className="rd-card rd-card-flush">
                    <div className="rd-list">
                        {characters.map((c) => {
                            const own = charPrefsOf(charPrefs, c.id).api;
                            return (
                                <button className="rd-item rd-item-tap" key={c.id} onClick={() => onOpenChar(c.id)}>
                                    <span className="rd-item-label">
                                        {c.name}
                                        <div className="rd-muted">{own?.model ? own.model : '跟着大设置'}</div>
                                    </span>
                                    <span className="rd-item-chev"><CaretRight size={14} /></span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
            <div className="rd-muted" style={{ marginTop: 'var(--rd-space-3)' }}>
                点名字进去配他自己的——配了他就用那一个，比这页的四档都优先。
            </div>
        </div>
    );
}

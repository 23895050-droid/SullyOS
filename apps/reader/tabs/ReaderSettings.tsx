// 读书模块 · 设置页（2026-09-14）
//
// 全局设置：主题 / 排版 / 书架版式 / 阅读模式 / 划线槽 / 用户 CSS（皮肤层注入槽）。
// 单书设置（总结策略、批量归档）在第二批随共读一起进来。
//
// 用户 CSS 就是「皮肤层」的最后一层：先注入的骨架层同权重会被它盖掉，
// 所以这里贴的规则永远不需要 !important（v3 的 V5）。小助手写 CSS 的入口在第三批接。

import { useState } from 'react';
import {
    DEFAULT_TYPOGRAPHY, setCssGlobal, setReadingMode, setShelfLayout, setTheme, setTypography, useReaderPrefs,
} from '../readerPrefs';
import { HIGHLIGHT_SLOTS, READER_SKINS } from '../readerSkinPresets';
import { setHighlightSlot } from '../readerPrefs';

export default function ReaderSettings() {
    const prefs = useReaderPrefs();
    const [cssDraft, setCssDraft] = useState<string | null>(null);
    const t = prefs.typography;

    return (
        <div className="rd-shelf" data-rd-page="settings">
            <div className="rd-shelf-head">
                <div className="rd-shelf-title">设置</div>
            </div>

            <div className="rd-sheet-body">
                <div className="rd-sheet">
                    <div className="rd-row-label" style={{ marginBottom: 8 }}>主题</div>
                    <div className="rd-btn-row">
                        {READER_SKINS.map((skin) => (
                            <button
                                key={skin.id}
                                className={prefs.themeId === skin.id ? 'rd-btn rd-btn-primary' : 'rd-btn'}
                                onClick={() => setTheme(skin.id)}
                            >
                                {skin.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="rd-sheet">
                    <div className="rd-row-label" style={{ marginBottom: 8 }}>排版</div>
                    <div className="rd-row">
                        <span className="rd-row-label">字体</span>
                        <div className="rd-btn-row">
                            <button className={t.fontFamily === 'serif' ? 'rd-btn rd-btn-primary' : 'rd-btn'} onClick={() => setTypography({ fontFamily: 'serif' })}>衬线</button>
                            <button className={t.fontFamily === 'sans' ? 'rd-btn rd-btn-primary' : 'rd-btn'} onClick={() => setTypography({ fontFamily: 'sans' })}>黑体</button>
                        </div>
                    </div>
                    <div className="rd-row">
                        <span className="rd-row-label">字号 {t.fontSize}px</span>
                        <input
                            type="range" min={13} max={26} step={1} value={t.fontSize}
                            onChange={(e) => setTypography({ fontSize: Number(e.target.value) })}
                        />
                    </div>
                    <div className="rd-row">
                        <span className="rd-row-label">行高 {t.lineHeight.toFixed(1)}</span>
                        <input
                            type="range" min={1.3} max={2.6} step={0.1} value={t.lineHeight}
                            onChange={(e) => setTypography({ lineHeight: Number(e.target.value) })}
                        />
                    </div>
                    <div className="rd-row">
                        <span className="rd-row-label">段间距 {t.paragraphSpacing}px</span>
                        <input
                            type="range" min={0} max={28} step={2} value={t.paragraphSpacing}
                            onChange={(e) => setTypography({ paragraphSpacing: Number(e.target.value) })}
                        />
                    </div>
                    <div className="rd-row">
                        <span className="rd-row-label">首行缩进 {t.paragraphIndent}em</span>
                        <input
                            type="range" min={0} max={3} step={0.5} value={t.paragraphIndent}
                            onChange={(e) => setTypography({ paragraphIndent: Number(e.target.value) })}
                        />
                    </div>
                    <div className="rd-row">
                        <span className="rd-row-label">页边距 {t.margin}px</span>
                        <input
                            type="range" min={10} max={44} step={2} value={t.margin}
                            onChange={(e) => setTypography({ margin: Number(e.target.value) })}
                        />
                    </div>
                    <button className="rd-btn" onClick={() => setTypography(DEFAULT_TYPOGRAPHY)}>排版恢复默认</button>
                </div>

                <div className="rd-sheet">
                    <div className="rd-row-label" style={{ marginBottom: 8 }}>书架版式（切了立刻生效）</div>
                    <div className="rd-btn-row">
                        <button className={prefs.shelfLayout === 'grid' ? 'rd-btn rd-btn-primary' : 'rd-btn'} onClick={() => setShelfLayout('grid')}>封面网格</button>
                        <button className={prefs.shelfLayout === 'list' ? 'rd-btn rd-btn-primary' : 'rd-btn'} onClick={() => setShelfLayout('list')}>横向卡片</button>
                    </div>
                </div>

                <div className="rd-sheet">
                    <div className="rd-row-label" style={{ marginBottom: 8 }}>共读模式</div>
                    <div className="rd-btn-row">
                        <button className={prefs.readingMode === 'focus' ? 'rd-btn rd-btn-primary' : 'rd-btn'} onClick={() => setReadingMode('focus')}>专注（本页为主）</button>
                        <button className={prefs.readingMode === 'casual' ? 'rd-btn rd-btn-primary' : 'rd-btn'} onClick={() => setReadingMode('casual')}>随心（带日常上下文）</button>
                    </div>
                    <div className="rd-muted" style={{ marginTop: 6 }}>
                        专注模式：上下文以当前页正文为主，只带本页最近几条批注；随心模式：保留正常聊天上下文。
                    </div>
                </div>

                <div className="rd-sheet">
                    <div className="rd-row-label" style={{ marginBottom: 8 }}>划线配色（自己一个槽，每个角色各一个）</div>
                    <div className="rd-row">
                        <span className="rd-row-label">我</span>
                        <div className="rd-btn-row">
                            {HIGHLIGHT_SLOTS.map((s) => (
                                <button
                                    key={s.slot}
                                    aria-label={s.label}
                                    onClick={() => setHighlightSlot('user', s.slot)}
                                    style={{
                                        width: 26, height: 26, borderRadius: 'var(--rd-radius-pill)',
                                        border: (prefs.highlightStyles.user ?? 1) === s.slot ? '2px solid var(--rd-ink)' : '1px solid var(--rd-rule)',
                                        background: `rgb(var(--rd-hl-${s.slot}-rgb))`,
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="rd-muted" style={{ marginTop: 6 }}>角色的槽位跟着书库页的开关走，第二批接上。</div>
                </div>

                <div className="rd-sheet">
                    <div className="rd-row-label" style={{ marginBottom: 8 }}>自定义 CSS（皮肤层）</div>
                    <textarea
                        className="rd-field"
                        rows={5}
                        placeholder={'.rd-para { letter-spacing: 0.02em; }'}
                        value={cssDraft ?? prefs.cssGlobal}
                        onChange={(e) => setCssDraft(e.target.value)}
                    />
                    <div className="rd-btn-row" style={{ marginTop: 8 }}>
                        <button className="rd-btn rd-btn-primary" onClick={() => { setCssGlobal(cssDraft ?? prefs.cssGlobal); setCssDraft(null); }}>保存</button>
                        <button className="rd-btn" onClick={() => { setCssGlobal(''); setCssDraft(''); }}>清空</button>
                    </div>
                    <div className="rd-muted" style={{ marginTop: 6 }}>
                        这里写的规则挂在骨架层之后，同权重时你的生效——不用写 !important。类名见骨架层注释。
                    </div>
                </div>
            </div>
        </div>
    );
}

// 读书模块 · 设置页（2026-09-15 UI 轮重写）
//
// 参考图版式：分组卡 + 「左边标签 / 右边当前值 / 箭头」行 + iOS 开关；值点开是一张底部弹卡。
// 分两组：阅读偏好（字号 / 字体 / 背景色 / 夜间模式 / 行距那几根滑杆）与应用设置
// （书架版式 / 划线配色 / 自定义 CSS）。
//
// 共读模式**不在这里**——它是单书设置，住那本书信息页右上角的小设置（v3 §4.6，
// 见 apps/reader/BookDetails.tsx）。大设置页只放全局的。
//
// 自定义 CSS 是皮肤层的最后一层：先注入的骨架层同权重会被它盖掉，
// 所以这里贴的规则永远不需要 !important（v3 的 V5）。小助手写 CSS 的入口在第三批接。

import { useState, type ReactNode } from 'react';
import {
    DEFAULT_TYPOGRAPHY, setCssGlobal, setHighlightSlot, setShelfLayout, setTheme, setTypography, useReaderPrefs,
} from '../readerPrefs';
import { HIGHLIGHT_SLOTS, READER_SKINS } from '../readerSkinPresets';

type Sheet = null | 'size' | 'font' | 'bg' | 'layout' | 'hl' | 'css';

/** 一行：「左标签 / 右当前值 / 箭头」 */
function Row({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
    return (
        <button className="rd-item" onClick={onClick}>
            <span className="rd-item-label">{label}</span>
            <span className="rd-item-value">{value}</span>
            <span className="rd-item-chev">›</span>
        </button>
    );
}

/** 一行带滑杆（值就在标签右边，不用再弹一层） */
function SliderRow({ label, value, children }: { label: string; value: string; children: ReactNode }) {
    return (
        <div className="rd-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="rd-row"><span className="rd-row-label">{label}</span><span className="rd-item-value">{value}</span></div>
            {children}
        </div>
    );
}

export default function ReaderSettings() {
    const prefs = useReaderPrefs();
    const [sheet, setSheet] = useState<Sheet>(null);
    const [cssDraft, setCssDraft] = useState<string | null>(null);
    const t = prefs.typography;
    const night = prefs.themeId === 'night';
    const skin = READER_SKINS.find((s) => s.id === prefs.themeId) ?? READER_SKINS[0];
    const slot = prefs.highlightStyles.user ?? 1;

    return (
        <div className="rd-screen" data-rd-page="settings">
            <div className="rd-head">
                <div className="rd-head-main">
                    <div className="rd-head-title">设置</div>
                    <div className="rd-head-sub">看得舒服比什么都重要</div>
                </div>
            </div>

            <div className="rd-section-title">阅读偏好</div>
            <div className="rd-card rd-card-flush">
                <div className="rd-list">
                    <Row label="字号" value={`${t.fontSize}px`} onClick={() => setSheet('size')} />
                    <Row label="字体" value={t.fontFamily === 'sans' ? '黑体' : '衬线'} onClick={() => setSheet('font')} />
                    <Row label="背景色" value={skin.label} onClick={() => setSheet('bg')} />
                    <div className="rd-item">
                        <span className="rd-item-label">夜间模式</span>
                        <button
                            className={`rd-switch${night ? ' rd-switch-on' : ''}`}
                            aria-label="夜间模式"
                            onClick={() => setTheme(night ? 'paper' : 'night')}
                        >
                            <span className="rd-switch-knob" />
                        </button>
                    </div>
                    <SliderRow label="行高" value={t.lineHeight.toFixed(1)}>
                        <input className="rd-slider" type="range" min={1.3} max={2.6} step={0.1} value={t.lineHeight}
                            onChange={(e) => setTypography({ lineHeight: Number(e.target.value) })} />
                    </SliderRow>
                    <SliderRow label="段间距" value={`${t.paragraphSpacing}px`}>
                        <input className="rd-slider" type="range" min={0} max={28} step={2} value={t.paragraphSpacing}
                            onChange={(e) => setTypography({ paragraphSpacing: Number(e.target.value) })} />
                    </SliderRow>
                    <SliderRow label="首行缩进" value={`${t.paragraphIndent}em`}>
                        <input className="rd-slider" type="range" min={0} max={3} step={0.5} value={t.paragraphIndent}
                            onChange={(e) => setTypography({ paragraphIndent: Number(e.target.value) })} />
                    </SliderRow>
                    <SliderRow label="页边距" value={`${t.margin}px`}>
                        <input className="rd-slider" type="range" min={10} max={44} step={2} value={t.margin}
                            onChange={(e) => setTypography({ margin: Number(e.target.value) })} />
                    </SliderRow>
                    <button className="rd-item" onClick={() => setTypography(DEFAULT_TYPOGRAPHY)}>
                        <span className="rd-item-label">排版恢复默认</span>
                    </button>
                </div>
            </div>

            <div className="rd-section-title">应用设置</div>
            <div className="rd-card rd-card-flush">
                <div className="rd-list">
                    <Row
                        label="书架版式"
                        value={prefs.shelfLayout === 'list' ? '横向卡片' : '封面网格'}
                        onClick={() => setSheet('layout')}
                    />
                    <Row
                        label="我的划线配色"
                        value={HIGHLIGHT_SLOTS.find((s) => s.slot === slot)?.label ?? '琥珀'}
                        onClick={() => setSheet('hl')}
                    />
                    <Row label="自定义 CSS" value={prefs.cssGlobal ? '已写' : '没写'} onClick={() => setSheet('css')} />
                </div>
            </div>

            <div className="rd-muted" style={{ marginTop: 'var(--rd-space-4)' }}>
                共读模式（专注 / 随心）是**单书**设置，在那本书的信息页右上角 ⚙ 里改。
            </div>

            {/* ── 字号 ── */}
            {sheet === 'size' && (
                <div className="rd-sheet-mask" onClick={() => setSheet(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">字号</div>
                        <SliderRow label="正文字号" value={`${t.fontSize}px`}>
                            <input className="rd-slider" type="range" min={13} max={26} step={1} value={t.fontSize}
                                onChange={(e) => setTypography({ fontSize: Number(e.target.value) })} />
                        </SliderRow>
                        <div className="rd-muted" style={{ marginTop: 8 }}>界面上的字会跟着一起缩放。</div>
                    </div>
                </div>
            )}

            {/* ── 字体 ── */}
            {sheet === 'font' && (
                <div className="rd-sheet-mask" onClick={() => setSheet(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">字体</div>
                        <div className="rd-btn-row">
                            <button className={t.fontFamily === 'sans' ? 'rd-btn' : 'rd-btn rd-btn-primary'} onClick={() => { setTypography({ fontFamily: 'serif' }); setSheet(null); }}>衬线</button>
                            <button className={t.fontFamily === 'sans' ? 'rd-btn rd-btn-primary' : 'rd-btn'} onClick={() => { setTypography({ fontFamily: 'sans' }); setSheet(null); }}>黑体</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 背景色 ── */}
            {sheet === 'bg' && (
                <div className="rd-sheet-mask" onClick={() => setSheet(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">背景色</div>
                        <div className="rd-btn-row">
                            {READER_SKINS.map((s) => (
                                <button
                                    key={s.id}
                                    className={prefs.themeId === s.id ? 'rd-btn rd-btn-primary' : 'rd-btn'}
                                    onClick={() => { setTheme(s.id); setSheet(null); }}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── 书架版式 ── */}
            {sheet === 'layout' && (
                <div className="rd-sheet-mask" onClick={() => setSheet(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">书架版式</div>
                        <div className="rd-btn-row">
                            <button className={prefs.shelfLayout === 'grid' ? 'rd-btn rd-btn-primary' : 'rd-btn'} onClick={() => { setShelfLayout('grid'); setSheet(null); }}>封面网格</button>
                            <button className={prefs.shelfLayout === 'list' ? 'rd-btn rd-btn-primary' : 'rd-btn'} onClick={() => { setShelfLayout('list'); setSheet(null); }}>横向卡片</button>
                        </div>
                        <div className="rd-muted" style={{ marginTop: 8 }}>切了立刻生效。</div>
                    </div>
                </div>
            )}

            {/* ── 划线配色 ── */}
            {sheet === 'hl' && (
                <div className="rd-sheet-mask" onClick={() => setSheet(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">划线配色</div>
                        <div className="rd-row">
                            <span className="rd-row-label">我</span>
                            <div className="rd-btn-row">
                                {HIGHLIGHT_SLOTS.map((s) => (
                                    <button
                                        key={s.slot}
                                        aria-label={s.label}
                                        className={`rd-swatch${slot === s.slot ? ' rd-swatch-on' : ''}`}
                                        onClick={() => setHighlightSlot('user', s.slot)}
                                        style={{ background: `rgb(var(--rd-hl-${s.slot}-rgb))` }}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="rd-muted" style={{ marginTop: 8 }}>角色的槽位跟着书库页的开关走，第二批接上。</div>
                    </div>
                </div>
            )}

            {/* ── 自定义 CSS ── */}
            {sheet === 'css' && (
                <div className="rd-sheet-mask" onClick={() => setSheet(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">自定义 CSS（皮肤层）</div>
                        <textarea
                            className="rd-field"
                            rows={6}
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
            )}
        </div>
    );
}

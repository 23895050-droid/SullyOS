// 读书模块 · 设置页（2026-09-15 UI 轮重写 / v4 照竞品分页）
//
// 参考图（图 10「Mine」/ 图 11「Read Settings」/ 图 9「Appearance Setting」）的做法是
// **设置首页 + 两张子页**，不是一长条。所以这里也拆三层：
//   首页   分组卡 + 「彩图标 + 标题 + 右箭头」行（图 10）
//   阅读设置 LAYOUT / APPEARANCE / INTERACTION 三组（图 11）
//   外观设置 SHELF / THEME / APPEARANCE 三组，主题直接嵌色卡网格（图 9）
//
// 共读模式**不在这里**——它是单书设置，住那本书信息页右上角的小设置（v3 §4.6，
// 见 apps/reader/BookDetails.tsx）。大设置页只放全局的。
//
// **2026-09-21（T6）**：全局设置里补上「一起读书」那一组四个内页——
//   模型与接口（四档 api + 每个角色自己的模型）/ 读书提示词（套 + 谁在用 + 给谁用）/
//   挂到聊天里（按角色的关键词挂载规则）/ 使用书库的朋友（书库页那堆开关搬过来）/
//   数据导入导出（范围勾选 + 分角色）。
//
// 自定义 CSS 是皮肤层的最后一层：先注入的骨架层同权重会被它盖掉，
// 所以这里贴的规则永远不需要 !important（v3 的 V5）。

import { useState, type ReactNode } from 'react';
import { ArrowLeft, BookOpen, PaintBrush, Pen, Code, TextAa, ChatCircleDots, Plugs, Broadcast, Users, DownloadSimple } from '@phosphor-icons/react';
import {
    DEFAULT_TYPOGRAPHY, setCssGlobal, setShelfAsc, setShelfGrouped, setShelfLayout,
    setTheme, setTypography, useReaderPrefs, type ShelfLayout,
} from '../readerPrefs';
import { READER_SKINS } from '../readerSkinPresets';
import HighlightColorSheet from '../HighlightColorSheet';
import ReaderSetApi from './ReaderSetApi';
import ReaderSetPrompts from './ReaderSetPrompts';
import ReaderSetMount from './ReaderSetMount';
import ReaderSetFriends from './ReaderSetFriends';
import ReaderSetData from './ReaderSetData';
import { highlightColorOf } from '../readerPrefs';

type Sheet = null | 'size' | 'font' | 'lineHeight' | 'paraGap' | 'indent' | 'margin' | 'layout' | 'hl' | 'css';

export type SettingsPage = 'root' | 'read' | 'look' | 'api' | 'prompts' | 'mount' | 'friends' | 'data';

interface Props {
    /** 进某个角色的页面（设置里点名字：落在他的设置页 / 他的模型页） */
    onOpenChar?: (charId: string, view?: 'settings' | 'api') => void;
    notify?: (msg: string) => void;
    /** 停在哪个内页（外壳拿着它——进角色页再回来还是那一页） */
    page?: SettingsPage;
    onPage?: (p: SettingsPage) => void;
}

const LAYOUT_OPTS: Array<{ key: ShelfLayout; label: string }> = [
    { key: 'grid', label: '封面网格' },
    { key: 'list', label: '纯文字列表' },
    { key: 'thumb', label: '缩略图列表' },
    { key: 'detail', label: '详情列表' },
];

/**
 * 「可用的名字」清单（T7② 重写时加的）。
 * 原来是「类名见骨架层注释」——注释在 readerCss.ts 里，她根本看不见，等于没说。
 * 点一下就把起手式加进框里，省得对着空白框想名字（全部名字在 readerCss.ts 头注释那份速查表）。
 */
const CSS_REFS: Array<{ name: string; what: string; snip: string }> = [
    { name: '.rd-para', what: '正文段落', snip: '.rd-para { letter-spacing: 0.02em; }' },
    { name: '.rd-reader-flow', what: '整章正文的容器', snip: '.rd-reader-flow { }' },
    { name: '.rd-reader-bar', what: '阅读页顶栏', snip: '.rd-reader-bar { }' },
    { name: '.rd-reader-foot', what: '阅读页底栏', snip: '.rd-reader-foot { }' },
    { name: '.rd-hl-rect', what: '划出来的那一道', snip: '.rd-hl-rect { }' },
    { name: '.rd-book-title', what: '书架上的书名', snip: '.rd-book-title { }' },
    { name: '.rd-note-quote', what: '笔记里的摘录', snip: '.rd-note-quote { }' },
    { name: '--rd-fs-body', what: '正文字号', snip: '--rd-fs-body: 18px;' },
    { name: '--rd-page-gutter', what: '左右页边距', snip: '--rd-page-gutter: 26px;' },
    { name: '--rd-lh-body', what: '正文行高', snip: '--rd-lh-body: 2;' },
];

/** 一行：「左标签 / 右当前值 / 箭头」 */
function Row({ label, value, onClick, icon }: { label: string; value?: string; onClick: () => void; icon?: ReactNode }) {
    return (
        <button className="rd-item" onClick={onClick}>
            {icon}
            <span className="rd-item-label">{label}</span>
            {value !== undefined && <span className="rd-item-value">{value}</span>}
            <span className="rd-item-chev">›</span>
        </button>
    );
}

/** 一行带开关 */
function SwitchRow({ label, on, onToggle, icon }: { label: string; on: boolean; onToggle: () => void; icon?: ReactNode }) {
    return (
        <div className="rd-item">
            {icon}
            <span className="rd-item-label">{label}</span>
            <button className={`rd-switch${on ? ' rd-switch-on' : ''}`} aria-label={label} onClick={onToggle}>
                <span className="rd-switch-knob" />
            </button>
        </div>
    );
}

/** 一行带滑杆（值就在标签右边） */
function SliderRow({ label, value, children }: { label: string; value: string; children: ReactNode }) {
    return (
        <div className="rd-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="rd-row"><span className="rd-row-label">{label}</span><span className="rd-item-value">{value}</span></div>
            {children}
        </div>
    );
}

const ico = (n: 1 | 2 | 3 | 4 | 5, node: ReactNode) => (
    <span className={`rd-row-ico${n > 1 ? ` rd-row-ico-${n}` : ''}`}>{node}</span>
);

export default function ReaderSettings({ onOpenChar, notify, page: pageProp, onPage }: Props) {
    const prefs = useReaderPrefs();
    const [ownPage, setOwnPage] = useState<SettingsPage>('root');
    const page: SettingsPage = pageProp ?? ownPage;
    const setPage = (p: SettingsPage) => { setOwnPage(p); onPage?.(p); };
    const [sheet, setSheet] = useState<Sheet>(null);
    const [cssDraft, setCssDraft] = useState<string | null>(null);
    const t = prefs.typography;
    const night = prefs.themeId.startsWith('night');


    const head = (title: string, sub: string) => (
        <div className="rd-headbar">
            <button className="rd-back" onClick={() => setPage('root')}><ArrowLeft size={18} />设置</button>
            <div className="rd-headbar-title">{title}</div>
            <span style={{ width: 44 }} />
        </div>
    );

    // ── 子页 · 阅读设置（图 11 的 LAYOUT / APPEARANCE / INTERACTION）──
    if (page === 'read') {
        return (
            <div className="rd-screen rd-screen-tight page-focus-once" data-rd-page="settings-read" key={page}>
                {head('阅读设置', '')}

                <div className="rd-section-title">版式</div>
                <div className="rd-card rd-card-flush">
                    <div className="rd-list">
                        <Row label="首行缩进" value={`${t.paragraphIndent} 字`} onClick={() => setSheet('indent')} />
                        <Row label="行距" value={t.lineHeight.toFixed(1)} onClick={() => setSheet('lineHeight')} />
                        <Row label="段间距" value={`${t.paragraphSpacing}px`} onClick={() => setSheet('paraGap')} />
                        <Row label="页边距" value={`${t.margin}px`} onClick={() => setSheet('margin')} />
                    </div>
                </div>

                <div className="rd-section-title">外观</div>
                <div className="rd-card rd-card-flush">
                    <div className="rd-list">
                        <Row label="正文字号" value={`${t.fontSize}px`} onClick={() => setSheet('size')} icon={ico(4, <TextAa size={15} weight="bold" />)} />
                        <Row label="字体" value={t.fontFamily === 'sans' ? '黑体' : '衬线体'} onClick={() => setSheet('font')} />
                    </div>
                </div>

                {/* 翻页方式这一行**删了**（她 09-21 报的 bug：它点开的是「书架版式」那张卡）。
                    翻页目前只有横滑一种（ReaderPage 是 translateX 的横向轨道），
                    真要成可切的设置就是另一颗（上下滚动要另写一条渲染路径），先不摆假开关。 */}

                <button className="rd-btn rd-btn-block" style={{ marginTop: 'var(--rd-space-4)' }} onClick={() => setTypography(DEFAULT_TYPOGRAPHY)}>
                    排版恢复默认
                </button>

                <SheetHost sheet={sheet} setSheet={setSheet} t={t} prefs={prefs} cssDraft={cssDraft} setCssDraft={setCssDraft} />
            </div>
        );
    }

    // ── 子页 · 外观设置（图 9 的 SHELF / THEME / APPEARANCE）──
    if (page === 'look') {
        return (
            <div className="rd-screen rd-screen-tight page-focus-once" data-rd-page="settings-look" key={page}>
                {head('外观设置', '')}

                <div className="rd-section-title">书架</div>
                <div className="rd-card rd-card-flush">
                    <div className="rd-list">
                        <Row
                            label="书架版式"
                            value={LAYOUT_OPTS.find((l) => l.key === prefs.shelfLayout)?.label ?? '封面网格'}
                            onClick={() => setSheet('layout')}
                        />
                        <SwitchRow label="按分类分组" on={prefs.shelfGrouped} onToggle={() => setShelfGrouped(!prefs.shelfGrouped)} />
                        <SwitchRow label="升序排列" on={prefs.shelfAsc} onToggle={() => setShelfAsc(!prefs.shelfAsc)} />
                    </div>
                </div>

                <div className="rd-section-title">主题</div>
                <div className="rd-card">
                    <div className="rd-theme-grid">
                        {READER_SKINS.map((s) => (
                            <button
                                key={s.id}
                                className={`rd-theme-card${prefs.themeId === s.id ? ' rd-theme-card-on' : ''}`}
                                onClick={() => setTheme(s.id)}
                                style={{ background: s.vars['--rd-paper'], color: s.vars['--rd-ink'] }}
                            >
                                {s.label}
                                {prefs.themeId === s.id && <span className="rd-theme-check">✓</span>}
                            </button>
                        ))}
                    </div>
                    <div className="rd-muted" style={{ marginTop: 'var(--rd-space-3)' }}>
                        皮肤只管颜色和纸纹，字号行距在「阅读设置」里调。想自己改颜色去下面那格自定义 CSS。
                    </div>
                </div>

                <div className="rd-section-title">其它</div>
                <div className="rd-card rd-card-flush">
                    <div className="rd-list">
                        <SwitchRow
                            label="夜间模式"
                            on={night}
                            onToggle={() => setTheme(night ? 'paper' : 'night')}
                        />
                        <Row
                            label="划线设置"
                            value={highlightColorOf(prefs, 'user')}
                            onClick={() => setSheet('hl')}
                        />
                        <Row label="自定义 CSS" value={prefs.cssGlobal ? '已写' : '没写'} onClick={() => setSheet('css')} />
                    </div>
                </div>

                <SheetHost sheet={sheet} setSheet={setSheet} t={t} prefs={prefs} cssDraft={cssDraft} setCssDraft={setCssDraft} />
            </div>
        );
    }

    // ── 内页：一起读书那四页（T6，都自带返回）──
    if (page === 'api') return <ReaderSetApi onBack={() => setPage('root')} onOpenChar={(id) => onOpenChar?.(id, 'api')} />;
    if (page === 'prompts') return <ReaderSetPrompts onBack={() => setPage('root')} notify={notify} />;
    if (page === 'mount') return <ReaderSetMount onBack={() => setPage('root')} />;
    if (page === 'friends') return <ReaderSetFriends onBack={() => setPage('root')} onOpenChar={(id) => onOpenChar?.(id, 'settings')} />;
    if (page === 'data') return <ReaderSetData onBack={() => setPage('root')} notify={notify ?? (() => {})} />;

    // ── 首页（图 10 的排版：分组 + 彩图标 + 右箭头）──
    return (
        <div className="rd-screen" data-rd-page="settings" key={page}>
            <div className="rd-head">
                <div className="rd-head-main">
                    <div className="rd-head-title">设置</div>
                    <div className="rd-head-sub">看得舒服比什么都重要</div>
                </div>
            </div>

            <div className="rd-section-title">阅读</div>
            <div className="rd-card rd-card-flush">
                <div className="rd-list">
                    <Row label="阅读设置" value="字号 · 行距 · 边距" onClick={() => setPage('read')} icon={ico(1, <BookOpen size={16} weight="bold" />)} />
                    <Row label="外观设置" value="皮肤 · 书架版式" onClick={() => setPage('look')} icon={ico(2, <PaintBrush size={16} weight="bold" />)} />
                    <Row label="划线设置" value={highlightColorOf(prefs, 'user')} onClick={() => setSheet('hl')} icon={ico(3, <Pen size={16} weight="bold" />)} />
                    <Row label="自定义 CSS" value={prefs.cssGlobal ? '已写' : '没写'} onClick={() => setSheet('css')} icon={ico(4, <Code size={16} weight="bold" />)} />
                </div>
            </div>

            {/* 她 09-16：共读/摘要的提示词放这儿改（面板里只留「什么时候总结」的规则）
                她 09-21（T6）：这一组补齐——模型四档、提示词套、挂载规则、谁在读书、导入导出 */}
            <div className="rd-section-title">一起读书</div>
            <div className="rd-card rd-card-flush">
                <div className="rd-list">
                    <Row label="模型与接口" value="共读 · 回复 · 单独读 · 摘要" onClick={() => setPage('api')} icon={ico(1, <Plugs size={16} weight="bold" />)} />
                    <Row label="读书提示词" value="谁在用哪一套" onClick={() => setPage('prompts')} icon={ico(2, <ChatCircleDots size={16} weight="bold" />)} />
                    <Row label="挂到聊天里" value="按角色配关键词" onClick={() => setPage('mount')} icon={ico(3, <Broadcast size={16} weight="bold" />)} />
                    <Row label="使用书库的朋友" value="谁可以一起读" onClick={() => setPage('friends')} icon={ico(4, <Users size={16} weight="bold" />)} />
                    <Row label="数据导入导出" value="范围勾选 · 分角色" onClick={() => setPage('data')} icon={ico(5, <DownloadSimple size={16} weight="bold" />)} />
                </div>
            </div>

            <div className="rd-muted" style={{ marginTop: 'var(--rd-space-4)' }}>
                共读模式（专注 / 随心）是单书设置——在那本书的信息页右上角 ⚙ 里改。
            </div>

            <SheetHost sheet={sheet} setSheet={setSheet} t={t} prefs={prefs} cssDraft={cssDraft} setCssDraft={setCssDraft} />
        </div>
    );
}

/** 三张页共用的那几张底部弹卡 */
function SheetHost({ sheet, setSheet, t, prefs, cssDraft, setCssDraft }: {
    sheet: Sheet;
    setSheet: (s: Sheet) => void;
    t: ReturnType<typeof useReaderPrefs>['typography'];
    prefs: ReturnType<typeof useReaderPrefs>;
    cssDraft: string | null;
    setCssDraft: (v: string | null) => void;
}) {
    const close = () => setSheet(null);
    if (!sheet) return null;

    const sliderSheet = (title: string, label: string, value: string, min: number, max: number, step: number, cur: number, apply: (v: number) => void, hint?: string) => (
        <div className="rd-sheet-mask" onClick={close}>
            <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="rd-sheet-grip" />
                <div className="rd-sheet-title">{title}</div>
                <SliderRow label={label} value={value}>
                    <input className="rd-slider" type="range" min={min} max={max} step={step} value={cur}
                        onChange={(e) => apply(Number(e.target.value))} />
                </SliderRow>
                {hint && <div className="rd-muted" style={{ marginTop: 8 }}>{hint}</div>}
            </div>
        </div>
    );

    if (sheet === 'size') return sliderSheet('正文字号', '字号', `${t.fontSize}px`, 13, 26, 1, t.fontSize, (v) => setTypography({ fontSize: v }), '只改书里的字，界面上的字号不动。');
    if (sheet === 'lineHeight') return sliderSheet('行距', '行距', t.lineHeight.toFixed(1), 1.3, 2.6, 0.1, t.lineHeight, (v) => setTypography({ lineHeight: v }));
    if (sheet === 'paraGap') return sliderSheet('段间距', '段间距', `${t.paragraphSpacing}px`, 0, 28, 2, t.paragraphSpacing, (v) => setTypography({ paragraphSpacing: v }));
    if (sheet === 'indent') return sliderSheet('首行缩进', '缩进', `${t.paragraphIndent} 字`, 0, 3, 0.5, t.paragraphIndent, (v) => setTypography({ paragraphIndent: v }));
    if (sheet === 'margin') return sliderSheet('页边距', '左右边距', `${t.margin}px`, 10, 44, 2, t.margin, (v) => setTypography({ margin: v }));

    if (sheet === 'font') {
        return (
            <div className="rd-sheet-mask" onClick={close}>
                <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                    <div className="rd-sheet-grip" />
                    <div className="rd-sheet-title">字体</div>
                    <div className="rd-btn-row">
                        <button className={t.fontFamily === 'sans' ? 'rd-btn' : 'rd-btn rd-btn-primary'} onClick={() => { setTypography({ fontFamily: 'serif' }); close(); }}>衬线体</button>
                        <button className={t.fontFamily === 'sans' ? 'rd-btn rd-btn-primary' : 'rd-btn'} onClick={() => { setTypography({ fontFamily: 'sans' }); close(); }}>黑体</button>
                    </div>
                </div>
            </div>
        );
    }

    if (sheet === 'layout') {
        return (
            <div className="rd-sheet-mask" onClick={close}>
                <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                    <div className="rd-sheet-grip" />
                    <div className="rd-sheet-title">书架版式</div>
                    <div className="rd-card rd-card-flush">
                        <div className="rd-list">
                            {LAYOUT_OPTS.map((l) => (
                                <button key={l.key} className="rd-item" onClick={() => { setShelfLayout(l.key); close(); }}>
                                    <span className="rd-item-label">{l.label}</span>
                                    {prefs.shelfLayout === l.key && <span className="rd-check">✓</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="rd-muted" style={{ marginTop: 8 }}>切了立刻生效。</div>
                </div>
            </div>
        );
    }

    if (sheet === 'hl') return <HighlightColorSheet onClose={close} />;

    // css —— T7② 重排：层的顺序用三枚小胶囊讲清楚，「可用的名字」换成点得动的清单
    const cur = cssDraft ?? prefs.cssGlobal;
    const insert = (snip: string) => {
        const t = cur.replace(/\s+$/, '');
        setCssDraft(t ? `${t}\n${snip}\n` : `${snip}\n`);
    };
    return (
        <div className="rd-sheet-mask" onClick={close}>
            <div className="rd-sheet rd-sheet-tall" onClick={(e) => e.stopPropagation()}>
                <div className="rd-sheet-grip" />
                <div className="rd-sheet-title">自定义 CSS</div>
                <div className="rd-muted">它挂在最后一张表里，同权重时以你写的为准——所以不用写 !important。</div>

                <div className="rd-sheet-body" style={{ overflowY: 'auto' }}>
                    <div className="rd-css-layers">
                        <span className="rd-css-layer">骨架层</span>
                        <span className="rd-css-sep">›</span>
                        <span className="rd-css-layer">皮肤</span>
                        <span className="rd-css-sep">›</span>
                        <span className="rd-css-layer rd-css-layer-me">你写的这层</span>
                    </div>

                    <textarea
                        className="rd-field"
                        rows={6}
                        placeholder={'.rd-para { letter-spacing: 0.02em; }'}
                        value={cur}
                        onChange={(e) => setCssDraft(e.target.value)}
                    />

                    <div className="rd-group-head" style={{ marginTop: 0 }}>
                        <span>可用的名字</span><span>点一下加进框里</span>
                    </div>
                    <div className="rd-css-ref">
                        {CSS_REFS.map((r) => (
                            <button key={r.name} type="button" className="rd-css-ref-row" onClick={() => insert(r.snip)}>
                                <span className="rd-css-ref-name">{r.name}</span>
                                <span className="rd-css-ref-what">{r.what}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="rd-btn-row" style={{ marginTop: 'var(--rd-space-4)' }}>
                    <button className="rd-btn rd-btn-primary" onClick={() => { setCssGlobal(cur); setCssDraft(null); }}>保存</button>
                    <button className="rd-btn" onClick={() => { setCssGlobal(''); setCssDraft(''); }}>清空</button>
                </div>
                <div className="rd-muted" style={{ marginTop: 'var(--rd-space-2)' }}>
                    现在是：{prefs.cssGlobal ? `写了 ${prefs.cssGlobal.split('\n').length} 行` : '还没写'}
                </div>
            </div>
        </div>
    );
}

// 读书模块截图 harness（不进 git）
// 先往 IndexedDB 写几本假书（带进度），再按 ?page= 渲染对应的东西——
// prefs 在模块加载时读 localStorage，所以假设置必须在这之前写好。
// 任何异常都画到页面上（截图就是我的控制台）。
//
//   ?page=app|reader|detail     （app = 整个书房外壳）
//   &tab=shelf|notes|library|stats|settings
//   &theme=paper|night|sepia|plain  &layout=grid|list  &small=1
import React from 'react';
import { createRoot } from 'react-dom/client';

const params = new URLSearchParams(location.search);
const BOOK_ID = 'bk_demo';

const rootEl = document.getElementById('root')!;
const root = createRoot(rootEl);
const showError = (label: string, err: unknown) => {
    const msg = err instanceof Error ? `${err.message}\n\n${err.stack || ''}` : String(err);
    root.render(<pre style={{ padding: 12, fontSize: 11, whiteSpace: 'pre-wrap', color: '#b00' }}>{label}{'\n'}{msg}</pre>);
};
window.addEventListener('error', (e) => showError('window error:', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showError('unhandled rejection:', (e as PromiseRejectionEvent).reason));

/** 画一条假状态栏 + 假 home indicator：安全区对不对，截图里一眼就能看出来 */
function PhoneChrome({ dark }: { dark?: boolean }) {
    const ink = dark ? '#f2efe9' : '#111';
    return (
        <>
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 48, zIndex: 999, pointerEvents: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 30px',
                font: '600 15px -apple-system, system-ui, sans-serif', color: ink,
            }}>
                <span>11:02</span>
                <span style={{ letterSpacing: 2 }}>▮▮▮ ⌾ ▰</span>
            </div>
            <div style={{
                position: 'absolute', bottom: 9, left: '50%', transform: 'translateX(-50%)',
                width: 140, height: 5, borderRadius: 3, background: ink, zIndex: 999, pointerEvents: 'none',
            }} />
        </>
    );
}

/** ?click=a>>b 按顺序点（拍面板用：先进更多、再点排版）。`@x,y` = 在那个坐标点一下
    （沉浸态要走它——el.click() 没有坐标，会落到「上一页」那一档）。 */
function autoClick(spec: string) {
    const sels = spec.split('>>');
    let i = 0;
    const step = () => {
        if (i >= sels.length) return;
        const token = sels[i];
        i++;
        if (token.startsWith('~')) {
            // ~选择器~文字：往输入框里打字（React 受控输入要走原生 setter + input 事件）
            const [, sel, text] = token.split('~');
            const input = document.querySelector(sel) as HTMLInputElement | null;
            if (input) {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                setter?.call(input, text);
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        } else if (token.startsWith('!')) {
            // !选择器：在那个输入框上敲回车（React 的 onKeyDown 只认真按键）
            const input = document.querySelector(token.slice(1)) as HTMLInputElement | null;
            input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        } else if (token.startsWith('@')) {
            const [x, y] = token.slice(1).split(',').map(Number);
            const el = document.elementFromPoint(x, y) as HTMLElement | null;
            for (const type of ['mousedown', 'mouseup', 'click']) {
                el?.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
            }
        } else {
            (document.querySelector(token) as HTMLElement | null)?.click();
        }
        window.setTimeout(step, 340);
    };
    window.setTimeout(step, 1100);
}

const SENTENCES = [
    '海面上浮着一层薄薄的雾，天还没完全亮，船已经解了缆。',
    '他把手插在口袋里，看着岸上的灯一盏一盏地灭下去。',
    '“我们得在天黑之前靠岸。”她说这话的时候没有回头。',
    '风从东北方向来，带着盐和铁锈混在一起的味道。',
    '船舱里那盏灯一直在晃，影子跟着在墙上走来走去。',
    '很多年以后他还会想起这个清晨，想起甲板上被踩碎的贝壳。',
    '海水并不总是蓝的，有时候它是铅灰色，像一块没有擦干净的玻璃。',
    '她数着浪头，数到第七个的时候就睡着了。',
];

function paragraphs(count: number, seed: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
        const a = SENTENCES[(i + seed) % SENTENCES.length];
        const b = SENTENCES[(i * 3 + seed + 2) % SENTENCES.length];
        const c = SENTENCES[(i * 5 + seed + 5) % SENTENCES.length];
        out.push(a + b + c);
    }
    return out;
}

async function boot() {
    const { chapterRowId, putBook, putChapters, putProgress, putAnnotation } = await import('../utils/reader/readerDb');

    const chapters = ['第一章 启航', '第二章 海雾', '第三章 归港', '第四章 灯塔'].map((title, idx) => {
        const paras = paragraphs(20 + idx * 3, idx * 3);
        return {
            id: chapterRowId(BOOK_ID, idx),
            bookId: BOOK_ID,
            idx,
            title,
            paras,
            chars: paras.reduce((n, p) => n + p.length, 0),
        };
    });

    const totalChars = chapters.reduce((n, c) => n + c.chars, 0);
    const shelf = [
        { id: BOOK_ID, title: '海边的书', author: '某人', category: '小说', rating: 4, chapters },
        { id: 'bk_2', title: '小王子', author: '圣埃克苏佩里', category: '童话', rating: 5, chapters: chapters.slice(0, 2) },
        { id: 'bk_3', title: '在轮下', author: '黑塞', category: '小说', rating: 3, chapters: chapters.slice(0, 1) },
        { id: 'bk_4', title: '夜晚的潜水艇', author: '陈春成', category: '短篇集', rating: 0, chapters: chapters.slice(0, 1) },
        { id: 'bk_5', title: 'The Power of Small Habits', author: 'James Clear', category: '未分类', rating: 2, chapters: chapters.slice(0, 1) },
    ];

    for (const b of shelf) {
        const chars = b.chapters.reduce((n, c) => n + c.chars, 0);
        await putBook({
            id: b.id,
            title: b.title,
            author: b.author,
            intro: b.id === BOOK_ID ? '一本用来截图的书。海雾、灯塔、和没有说完的话。' : '',
            format: b.id === 'bk_5' ? 'epub' : 'txt',
            sourceFileName: `${b.title}.txt`,
            fileBytes: 524288,
            fileRef: 'blobref:b_fake',
            status: 'ready',
            contentRev: 'demo:0',
            chapterCount: b.chapters.length,
            totalChars: chars,
            chapterStartPara: b.chapters.map((_, i) => i * 20),
            toc: b.chapters.map((c, i) => ({ title: c.title, chapterIdx: i })),
            tags: b.category && b.category !== '未分类' ? [b.category] : [],
            rating: b.rating,
            category: b.category,
            onShelf: true,
            order: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        await putChapters(b.chapters.map((c) => ({ ...c, bookId: b.id, id: chapterRowId(b.id, c.idx) })));
    }

    // 进度：每本不一样，书架上的两个百分比、统计页的柱子才有东西看
    const progs: Array<[string, number, number, number]> = [
        [BOOK_ID, 0, 3, 3600],
        ['bk_2', 1, 12, 2400],
        ['bk_3', 0, 6, 900],
        ['bk_4', 0, 1, 120],
    ];
    for (const [id, chIdx, paraIdx, sec] of progs) {
        await putProgress({
            bookId: id, ownerId: 'user', chapterIdx: chIdx, paraIdx, charOffset: 0,
            percent: id === BOOK_ID ? 12.5 : id === 'bk_2' ? 76 : id === 'bk_3' ? 42 : 8,
            readingSeconds: sec, sessionCount: 3, updatedAt: new Date().toISOString(),
        });
    }

    // 一条划线 + 一条批注（笔记页有东西看）
    await putAnnotation({
        id: 'an_1', bookId: BOOK_ID, ownerId: 'user',
        anchor: { startPara: 4, startOffset: 0, endPara: 4, endOffset: 26, text: SENTENCES[4] },
        kind: 'note', styleSlot: 1, note: '这句有点像那天晚上。',
        contentRev: 'demo:0', status: 'active',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });

    // 阅读流水（统计页/日报要看的：每天读多久 / 翻页 / 字数 / 时段 / 每本书各读多少）
    {
        const BOOKS = [BOOK_ID, 'bk_2', 'bk_3'];
        const zero = () => new Array(24).fill(0);
        const days: Record<string, unknown> = {};
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const p = (n: number) => String(n).padStart(2, '0');
            const key = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
            const r = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
            if (r < 0.28 && i !== 0) continue;            // 有些天没读，热力图才有层次（今天必须有）
            const sec = Math.round(300 + r * 4200);
            const hours = zero();
            const books: Record<string, unknown> = {};
            // 每天挑 1-2 本，落在不同的钟点上（日报的小时明细才有东西画）
            const n = r > 0.6 ? 2 : 1;
            let rest = sec;
            for (let k = 0; k < n; k++) {
                const id = BOOKS[(i + k) % BOOKS.length];
                const bSec = k === n - 1 ? rest : Math.round(sec * 0.6);
                rest -= bSec;
                const h = 8 + ((i * 3 + k * 5) % 13);
                hours[h] += bSec;
                const bh = zero();
                bh[h] = bSec;
                books[id] = {
                    sec: bSec, pages: Math.round(bSec / 42), chars: Math.round(bSec * 6.5),
                    opens: 1 + (k % 2),
                    firstAt: new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 12).toISOString(),
                    lastAt: new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 40).toISOString(),
                    hours: bh,
                };
            }
            if (i === 0) {
                // 今天：多给几段，日报的小时明细/排行都好看
                const h2 = 21;
                hours[h2] += 600;
                const b = books[BOOK_ID] as Record<string, number | number[]>;
                b.sec = (b.sec as number) + 600;
                (b.hours as number[])[h2] = 600;
            }
            days[key] = {
                sec, pages: Math.round(sec / 42), chars: Math.round(sec * 6.5), opens: n, hours, books,
            };
        }
        localStorage.setItem('reader_stats_v1', JSON.stringify({
            version: 1, updatedAt: new Date().toISOString(), days,
        }));
    }

    // 假设置（必须在组件动态 import 之前落盘）
    // ⚠️ 这两个每次都写死：localStorage 在同一浏览器 profile 里跨导航留存，
    // 不写死的话上一张截图用的皮肤会粘到下一张上（踩过）。
    const prefsOverride: Record<string, unknown> = {
        themeId: params.get('theme') || 'paper',
        shelfLayout: params.get('layout') || 'grid',
    };
    if (params.get('fs')) {
        prefsOverride.typography = {
            fontFamily: params.get('font') || 'serif', fontSize: Number(params.get('fs')),
            lineHeight: 1.9, paragraphSpacing: 12, paragraphIndent: 2, margin: 22,
        };
    }
    if (params.get('small')) {
        prefsOverride.typography = { fontFamily: 'serif', fontSize: 15, lineHeight: 1.8, paragraphSpacing: 8, paragraphIndent: 1.5, margin: 24 };
    }
    if (Object.keys(prefsOverride).length > 0) {
        let existing: Record<string, unknown> = {};
        try { existing = JSON.parse(localStorage.getItem('reader_prefs_v1') || '{}'); } catch { existing = {}; }
        localStorage.setItem('reader_prefs_v1', JSON.stringify({
            ...existing, ...prefsOverride, version: 1, updatedAt: new Date().toISOString(),
        }));
    }

    const page = params.get('page') || 'app';
    const noop = () => { /* 截图用 */ };

    // 安全区的模拟值：真机上由上游（SELF_SAFE_AREA_APPS）和 iOS env() 提供，
    // 这里写死一个 iPhone 的数，截图里就能看出正文有没有钻到状态栏底下。
    const safeVars = {
        '--chrome-top': params.get('chrome') ?? '48px',
        '--safe-bottom': params.get('safeb') ?? '34px',
    } as React.CSSProperties;
    const isDark = (params.get('theme') || 'paper').startsWith('night');
    const clickSpec = params.get('click');
    /** ?sel=段号:起-止 —— 选中正文里那一段（拍「选中浮层」用） */
    const selSpec = params.get('sel');
    const autoSelect = () => {
        if (!selSpec) return;
        const [pi, range] = selSpec.split(':');
        const [from, to] = range.split('-').map(Number);
        window.setTimeout(() => {
            const p = document.querySelector(`[data-para-idx="${pi}"]`);
            const node = p?.firstChild;
            if (!node) return;
            const r = document.createRange();
            r.setStart(node, from); r.setEnd(node, to);
            const s = window.getSelection();
            s?.removeAllRanges(); s?.addRange(r);
        }, 900);
    };
    const mount = (node: React.ReactNode) => {
        root.render(<div className="rd-root" style={safeVars}><PhoneChrome dark={isDark} />{node}</div>);
        if (clickSpec) autoClick(clickSpec);
        autoSelect();
    };

    if (page === 'reader') {
        const [{ default: ReaderPage }, { default: ReaderSkinPreset }] = await Promise.all([
            import('../apps/reader/ReaderPage'), import('../apps/reader/ReaderSkinPreset'),
        ]);
        mount(<><ReaderSkinPreset /><ReaderPage bookId={BOOK_ID} notify={noop} onOpenDetails={noop} onOpenStats={noop} onBack={noop} /></>);
        return;
    }

    if (page === 'detail') {
        const [{ default: BookDetails }, { default: ReaderSkinPreset }] = await Promise.all([
            import('../apps/reader/BookDetails'), import('../apps/reader/ReaderSkinPreset'),
        ]);
        mount(<><ReaderSkinPreset /><BookDetails bookId={BOOK_ID} notify={noop} onRead={noop} onDeleted={noop} onBack={noop} /></>);
        return;
    }

    const tab = params.get('tab');
    if (tab) sessionStorage.setItem('sully_reader_open', tab);
    const { default: ReaderApp } = await import('../apps/reader/ReaderApp');
    // ReaderApp 自己会渲染 .rd-root——这里套一层只为了带安全区变量和假状态栏
    root.render(
        <div style={{ position: 'absolute', inset: 0, ...safeVars }}>
            <PhoneChrome dark={isDark} />
            <ReaderApp onBack={() => { /* 截图 harness：真机上这里传的是 closeApp */ }} />
        </div>,
    );
    if (clickSpec) autoClick(clickSpec);
}

boot().catch((e) => showError('boot failed:', e));

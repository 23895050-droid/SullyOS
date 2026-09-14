// 读书模块 · 阅读页（2026-09-14）
//
// 一屏一章：整章渲染进 .rd-reader-flow，翻页 = translateY（不是重新挂载文本）。
// 页表由 utils/reader/paginate 量行矩形算出；锚点只认 (段号, 段内偏移)——
// 所以换字号/转屏/重排之后，你还在原来的位置（V7）。
//
// 「当前页正文」这个数据口（V1 要喂给角色的东西）就是切片：point 在 currentSlicesRef，
// 第二批的划线/讨论与共读上下文都从这里取，不重算第二套。

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ListBullets, TextAa } from '@phosphor-icons/react';
import { getBook, getChapter, getProgress, putProgress, type RdBook, type RdChapter } from '../../utils/reader/readerDb';
import {
    pageForAnchor, paginateFlow, slicesForPage, type PageSlice, type RdPageBox,
} from '../../utils/reader/paginate';
import { setTheme, setTypography, useReaderPrefs } from './readerPrefs';
import { READER_SKINS } from './readerSkinPresets';
import { DEFAULT_TYPOGRAPHY } from './readerPrefs';

const SAVE_DEBOUNCE = 900;

interface Props {
    bookId: string;
    onBack: () => void;
}

export default function ReaderPage({ bookId, onBack }: Props) {
    const prefs = useReaderPrefs();
    const [book, setBook] = useState<RdBook | null>(null);
    const [chapter, setChapter] = useState<RdChapter | null>(null);
    const [chapterIdx, setChapterIdx] = useState(0);
    const [pages, setPages] = useState<RdPageBox[]>([]);
    const [pageIdx, setPageIdx] = useState(0);
    const [tocOpen, setTocOpen] = useState(false);
    const [styleOpen, setStyleOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [layoutNonce, setLayoutNonce] = useState(0);

    const viewportRef = useRef<HTMLDivElement>(null);
    const flowRef = useRef<HTMLDivElement>(null);
    /** 章节切换后要落在哪一页（页码或锚点） */
    const pendingRef = useRef<{ page?: number; anchor?: { paraIdx: number; charOffset: number } } | null>(null);
    /** 当前页覆盖的文本切片（V1 的数据口） */
    const currentSlicesRef = useRef<PageSlice[]>([]);
    const saveTimerRef = useRef<number | null>(null);
    const touchRef = useRef<{ x: number; y: number; t: number; locked: boolean } | null>(null);
    const restoringRef = useRef(true);

    // ── 打开书：读书目 + 恢复进度 ──
    useEffect(() => {
        let alive = true;
        void (async () => {
            const b = await getBook(bookId);
            if (!alive) return;
            if (!b) { setError('这本书不见了'); return; }
            setBook(b);
            const prog = await getProgress(bookId, 'user');
            const startChapter = prog?.chapterIdx ?? 0;
            setChapterIdx(Math.max(0, Math.min(startChapter, Math.max(0, b.chapterCount - 1))));
            if (prog) pendingRef.current = { anchor: { paraIdx: prog.paraIdx, charOffset: prog.charOffset } };
            else pendingRef.current = { page: 0 };
        })();
        return () => { alive = false; };
    }, [bookId]);

    // ── 章节加载 ──
    useEffect(() => {
        let alive = true;
        void (async () => {
            const ch = await getChapter(bookId, chapterIdx);
            if (!alive) return;
            if (!ch) { setError('这一章读不出来'); return; }
            setChapter(ch);
        })();
        return () => { alive = false; };
    }, [bookId, chapterIdx]);

    // ── 量页（章节/排版变化后重算，并落到该落的页）──
    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        const flow = flowRef.current;
        if (!chapter || !viewport || !flow) return;
        const height = viewport.clientHeight;
        if (height < 40) return;                       // 布局还没铺开，等下一次
        const next = paginateFlow(flow, height);
        if (next.length === 0) { setPages([]); return; }
        setPages(next);
        const pending = pendingRef.current;
        let idx = 0;
        if (pending?.anchor) idx = pageForAnchor(flow, next, pending.anchor.paraIdx, pending.anchor.charOffset);
        else if (typeof pending?.page === 'number') idx = Math.max(0, Math.min(pending.page, next.length - 1));
        pendingRef.current = null;
        setPageIdx(idx);
        restoringRef.current = false;
    }, [chapter, prefs.typography, layoutNonce]);

    // ── 视口变化（转屏/键盘）：保住位置再重排 ──
    const anchorOfCurrentPage = useCallback((): { paraIdx: number; charOffset: number } | null => {
        const flow = flowRef.current;
        const viewport = viewportRef.current;
        const page = pages[pageIdx];
        if (!flow || !viewport || !page) return null;
        const slices = slicesForPage(flow, page, viewport.clientHeight);
        currentSlicesRef.current = slices;
        const first = slices[0];
        return first ? { paraIdx: first.paraIdx, charOffset: first.startOffset } : null;
    }, [pages, pageIdx]);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport || typeof ResizeObserver === 'undefined') return;
        let timer: number | null = null;
        const ro = new ResizeObserver(() => {
            if (timer) window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                const anchor = anchorOfCurrentPage();
                if (anchor) pendingRef.current = { anchor };
                setLayoutNonce((n) => n + 1);
            }, 150);
        });
        ro.observe(viewport);
        return () => { if (timer) window.clearTimeout(timer); ro.disconnect(); };
    }, [anchorOfCurrentPage]);

    // ── 翻页 + 进度存 ──
    const goPage = useCallback((delta: number) => {
        if (pages.length === 0) return;
        const next = pageIdx + delta;
        if (next >= 0 && next < pages.length) { setPageIdx(next); return; }
        // 跨章
        if (!book) return;
        const nextChapter = chapterIdx + delta;
        if (nextChapter < 0 || nextChapter >= book.chapterCount) return;
        pendingRef.current = delta > 0 ? { page: 0 } : { page: Number.MAX_SAFE_INTEGER };
        setChapterIdx(nextChapter);
    }, [pages.length, pageIdx, book, chapterIdx]);

    useEffect(() => {
        if (!book || !chapter || pages.length === 0) return;
        const anchor = anchorOfCurrentPage();
        const span = 100 / Math.max(1, book.chapterCount);
        const percent = Math.round((chapterIdx * span + ((pageIdx + 1) / pages.length) * span) * 10) / 10;
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => {
            void (async () => {
                const prev = await getProgress(book.id, 'user');
                await putProgress({
                    bookId: book.id,
                    ownerId: 'user',
                    chapterIdx,
                    paraIdx: anchor?.paraIdx ?? 0,
                    charOffset: anchor?.charOffset ?? 0,
                    percent,
                    readingSeconds: (prev?.readingSeconds ?? 0) + 30,
                    sessionCount: prev?.sessionCount ?? 1,
                    updatedAt: new Date().toISOString(),
                });
            })();
        }, SAVE_DEBOUNCE);
        return () => { if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current); };
    }, [pageIdx, chapterIdx, pages.length, book, chapter, anchorOfCurrentPage]);

    // ── 触摸：左右滑翻页（纵向不管） ──
    const onTouchStart = (e: React.TouchEvent) => {
        const t = e.touches[0];
        touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now(), locked: false };
    };
    const onTouchMove = (e: React.TouchEvent) => {
        const start = touchRef.current;
        if (!start || start.locked) return;
        const t = e.touches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) start.locked = true;   // 纵向 = 别的意图
    };
    const onTouchEnd = (e: React.TouchEvent) => {
        const start = touchRef.current;
        touchRef.current = null;
        if (!start || start.locked) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const dt = Date.now() - start.t;
        const w = viewportRef.current?.clientWidth ?? 380;
        const far = Math.abs(dx) > w * 0.18;
        const flick = dt < 300 && Math.abs(dx) > w * 0.07;
        if (far || flick) goPage(dx < 0 ? 1 : -1);
    };

    const atEnd = book ? chapterIdx >= book.chapterCount - 1 && pageIdx >= pages.length - 1 : false;
    const top = pages[pageIdx]?.top ?? 0;

    if (error) {
        return (
            <div className="rd-reader">
                <div className="rd-top">
                    <button className="rd-icon-btn" onClick={onBack} aria-label="返回"><ArrowLeft size={18} /></button>
                    <div className="rd-top-title">读书</div>
                </div>
                <div className="rd-empty">{error}</div>
            </div>
        );
    }

    return (
        <div className="rd-reader" data-rd-page="reader">
            <div className="rd-top">
                <button className="rd-icon-btn" onClick={onBack} aria-label="返回"><ArrowLeft size={18} /></button>
                <div className="rd-top-title">{book?.title ?? '…'}</div>
                <button className="rd-icon-btn" onClick={() => setStyleOpen(true)} aria-label="排版"><TextAa size={18} /></button>
                <button className="rd-icon-btn" onClick={() => setTocOpen(true)} aria-label="目录"><ListBullets size={18} /></button>
            </div>

            <div
                className="rd-reader-viewport"
                ref={viewportRef}
                onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = (e.clientX - rect.left) / rect.width;
                    if (ratio < 0.3) goPage(-1);
                    else if (ratio > 0.7) goPage(1);
                }}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                <div
                    className="rd-reader-flow"
                    ref={flowRef}
                    style={{ transform: `translateY(${-top}px)`, transition: restoringRef.current ? 'none' : undefined }}
                >
                    {chapter && <div className="rd-chapter-title">{chapter.title}</div>}
                    {chapter?.paras.map((p, i) => (
                        <p className="rd-para" key={i} data-para-idx={i}>{p}</p>
                    ))}
                </div>
            </div>

            <div className="rd-reader-foot">
                <button className="rd-icon-btn" onClick={() => goPage(-1)} aria-label="上一页"><ArrowLeft size={16} /></button>
                <div className="rd-meter">
                    {chapter?.title ?? ''}
                    {' · '}
                    {pages.length ? `${pageIdx + 1} / ${pages.length} 页 · 本章` : '排版中…'}
                </div>
                <button
                    className="rd-icon-btn"
                    onClick={() => goPage(1)}
                    aria-label="下一页"
                    style={{ transform: 'rotate(180deg)' }}
                >
                    <ArrowLeft size={16} />
                </button>
            </div>

            {atEnd && (
                <div className="rd-reader-foot" style={{ borderTop: 'none', justifyContent: 'center' }}>
                    这本书读完了 ·{book?.totalChars ? ` ${Math.round(book.totalChars / 1000)} 千字` : ''}
                </div>
            )}

            {tocOpen && book && (
                <div className="rd-sheet-mask" onClick={() => setTocOpen(false)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-title">目录</div>
                        <div className="rd-sheet-body">
                            {book.toc.length === 0 && <div className="rd-muted">这本书没有目录</div>}
                            {book.toc.map((item) => (
                                <button
                                    key={`${item.chapterIdx}-${item.title}`}
                                    className="rd-btn"
                                    style={{ textAlign: 'left', borderColor: item.chapterIdx === chapterIdx ? 'var(--rd-accent)' : undefined }}
                                    onClick={() => {
                                        pendingRef.current = { page: 0 };
                                        setChapterIdx(item.chapterIdx);
                                        setTocOpen(false);
                                    }}
                                >
                                    {item.title}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {styleOpen && (
                <div className="rd-sheet-mask" onClick={() => setStyleOpen(false)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-title">排版与主题</div>
                        <div className="rd-sheet-body">
                            <div className="rd-row">
                                <span className="rd-row-label">字号</span>
                                <div className="rd-btn-row">
                                    <button className="rd-btn" onClick={() => setTypography({ fontSize: prefs.typography.fontSize - 1 })}>A-</button>
                                    <span className="rd-muted" style={{ alignSelf: 'center' }}>{prefs.typography.fontSize}</span>
                                    <button className="rd-btn" onClick={() => setTypography({ fontSize: prefs.typography.fontSize + 1 })}>A+</button>
                                </div>
                            </div>
                            <div className="rd-row">
                                <span className="rd-row-label">行高</span>
                                <div className="rd-btn-row">
                                    <button className="rd-btn" onClick={() => setTypography({ lineHeight: Math.round((prefs.typography.lineHeight - 0.1) * 10) / 10 })}>紧</button>
                                    <span className="rd-muted" style={{ alignSelf: 'center' }}>{prefs.typography.lineHeight.toFixed(1)}</span>
                                    <button className="rd-btn" onClick={() => setTypography({ lineHeight: Math.round((prefs.typography.lineHeight + 0.1) * 10) / 10 })}>松</button>
                                </div>
                            </div>
                            <div className="rd-row">
                                <span className="rd-row-label">页边距</span>
                                <div className="rd-btn-row">
                                    <button className="rd-btn" onClick={() => setTypography({ margin: prefs.typography.margin - 4 })}>窄</button>
                                    <button className="rd-btn" onClick={() => setTypography({ margin: prefs.typography.margin + 4 })}>宽</button>
                                </div>
                            </div>
                            <div className="rd-row">
                                <span className="rd-row-label">主题</span>
                                <div className="rd-btn-row">
                                    {READER_SKINS.map((skin) => (
                                        <button
                                            key={skin.id}
                                            className="rd-btn"
                                            style={{ borderColor: prefs.themeId === skin.id ? 'var(--rd-accent)' : undefined }}
                                            onClick={() => setTheme(skin.id)}
                                        >
                                            {skin.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="rd-btn-row">
                                <button className="rd-btn" onClick={() => setTypography(DEFAULT_TYPOGRAPHY)}>
                                    排版恢复默认
                                </button>
                                <button className="rd-btn" onClick={() => setStyleOpen(false)}>收起</button>
                            </div>
                            <div className="rd-muted">
                                {book ? `${book.format.toUpperCase()} · 第 ${chapterIdx + 1} / ${book.chapterCount} 章` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

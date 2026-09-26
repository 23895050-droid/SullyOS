// 读书模块 · 书摘分享卡（2026-09-26）
//
// 交互照微信读书（她 09-26 定的）：
//   · 卡片浮在暗底上，底下一条操作栏；**点卡片把那栏收起来**（安安静静看整张卡），
//     **再点一次栏回来**
//   · 长书摘卡片自己变高，高出屏幕就上下划着看（stage 自己滚）
//   · 「更换模板」→ 主题 / 字体 / 背景（含上传自己的图）+ 带不带想法 + 落款
//   · 「保存图片」走 shareOrDownloadBlob：手机上是系统面板里的「存储图像」，桌面是下载
//
// 卡就是一张 canvas：**预览和存下来的图是同一个东西**，不会出现「手机上好看、存下来跑版」。
// 排版在 utils/reader/shareCardDraw.ts（纯函数、有单测），这儿只管把它画出来。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DownloadSimple, Palette, SquaresFour, UploadSimple, X } from '@phosphor-icons/react';
import { getBlobForRef, putImageBlob, useBlobRefUrl } from '../../utils/blobRef';
import { shareOrDownloadBlob } from '../../utils/shareExport';
import {
    drawShareCard, layoutShareCard, type ShareCardData, type ShareMetrics,
} from '../../utils/reader/shareCardDraw';
import {
    RD_SHARE_BGS, RD_SHARE_BUILTIN_BGS, RD_SHARE_BUILTIN_FONTS, RD_SHARE_CARD_COLORS,
    RD_SHARE_CUSTOM_FONT, RD_SHARE_DOTS, RD_SHARE_FONTS, RD_SHARE_INK_COLORS, RD_SHARE_THEMES,
    builtinBgOf, builtinBgThumbUrl, builtinBgUrl, builtinFontFamily, builtinFontOf, builtinFontUrl,
    shareFontById, shareThemeById,
} from './readerShareThemes';
import { toHex6 } from '../../utils/reader/shareCardDraw';
import { setShareBgRef, setShareFontRef, setShareStyle, useReaderShareStore } from './readerShareStore';
import type { RdBook } from '../../utils/reader/readerDb';

interface Props {
    book: RdBook;
    /** 要分享的那条划线 */
    quote: string;
    /** 挂在它上面的想法（有就画，画不画由「带想法」那个开关管） */
    note?: string;
    chapterTitle: string;
    date: string;
    notify: (msg: string) => void;
    onClose: () => void;
}

/** 落款默认用「书房」；她改过就一直用她改的（存在 store 里） */

export default function ShareCardSheet({ book, quote, note, chapterTitle, date, notify, onClose }: Props) {
    const store = useReaderShareStore();
    const [panel, setPanel] = useState(false);
    const [chrome, setChrome] = useState(true);
    const [busy, setBusy] = useState(false);
    const [bgImg, setBgImg] = useState<HTMLImageElement | null>(null);
    const [fontsReady, setFontsReady] = useState(false);
    /** 选中的那套字体装好了没（装好之前量出来的字宽是错的，得等它） */
    const [fontReady, setFontReady] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    /** 已经注册进 document 的字体（族名 → FontFace）：同一个不用重复下、重复注册 */
    const facesRef = useRef<Map<string, FontFace>>(new Map());
    // 传过字体才摆「我传的」那一档；没传的时候选了它等于没字体，回落宋体
    const style = store.fontRef || store.style.fontId !== 'custom'
        ? store.style
        : { ...store.style, fontId: 'song' };
    const builtinBg = builtinBgOf(style.bgId);
    const uploadedUrl = useBlobRefUrl(store.bgRef || undefined);
    const bgUrl = builtinBg ? builtinBgUrl(builtinBg.file) : uploadedUrl;

    const data: ShareCardData = useMemo(() => ({
        quote,
        bookTitle: book.title,
        // **她自己在「书本详情 → 编辑资料」里填的那个优先**（跟详情页一个口径，09-26）：
        // 导入解析出来的作者常常是空的（epub 的 dc:creator 没写），她手填了却不显示就说不过去了
        author: book.customAuthor || book.author,
        chapterTitle,
        note,
        date,
    }), [quote, book.title, book.author, book.customAuthor, chapterTitle, note, date]);

    // 底图：从 blobref 解出来的 URL 再包成 Image（canvas 只认这个）
    useEffect(() => {
        if (!bgUrl) { setBgImg(null); return; }
        let alive = true;
        const img = new Image();
        img.onload = () => { if (alive) setBgImg(img); };
        img.onerror = () => { if (alive) setBgImg(null); };
        img.src = bgUrl;
        return () => { alive = false; };
    }, [bgUrl]);

    /**
     * 把选中的那套字体装进文档——**只装选中的这一套**。
     * 内置的 6 个是 woff2 打包在 `public/sharefonts/`，这一行才真正去下（不选不下）；
     * 自己传的从 blob 池读。装好之前量出来的字宽是错的，折行会跑，所以要等它。
     */
    useEffect(() => {
        let alive = true;
        setFontReady(false);
        const builtin = builtinFontOf(style.fontId);
        const family = builtin
            ? builtinFontFamily(builtin.file)
            : (style.fontId === 'custom' ? RD_SHARE_CUSTOM_FONT : '');
        if (!family) { setFontReady(true); return; }              // 系统字体，本来就绪
        if (facesRef.current.has(family)) { setFontReady(true); return; }
        void (async () => {
            try {
                let buf: ArrayBuffer | null = null;
                if (builtin) {
                    const res = await fetch(builtinFontUrl(builtin.file));
                    buf = res.ok ? await res.arrayBuffer() : null;
                } else if (store.fontRef) {
                    const blob = await getBlobForRef(store.fontRef);
                    buf = blob ? await blob.arrayBuffer() : null;
                }
                if (!buf) throw new Error('拿不到这个字体');
                const face = new FontFace(family, buf);
                await face.load();
                if (!alive) return;
                document.fonts.add(face);
                facesRef.current.set(family, face);
                setFontReady(true);
            } catch {
                // 下不动就当没有：按兜底字体画，别把整张卡卡死
                if (alive) setFontReady(true);
            }
        })();
        return () => { alive = false; };
    }, [style.fontId, store.fontRef]);

    // 走的时候把注册过的字体摘掉（不然它们会一直挂在 document.fonts 上）
    useEffect(() => () => {
        for (const face of facesRef.current.values()) {
            try { document.fonts.delete(face); } catch { /* 已经没了 */ }
        }
        facesRef.current.clear();
    }, []);

    // 字体要先落地再量字宽，不然第一帧量的是兜底字体、折行位置是错的
    useEffect(() => {
        let alive = true;
        const stack = shareFontById(style.fontId).stack;
        Promise.all([62, 50, 46, 44, 34, 32, 30, 28, 26, 24].map(
            (size) => document.fonts.load(`${size}px ${stack}`).catch(() => undefined),
        )).catch(() => undefined).finally(() => { if (alive) setFontsReady(true); });
        return () => { alive = false; };
    }, [style.fontId, fontReady]);

    /** 画一版；返回排好的版面（保存时不用重算） */
    const paint = useCallback((): void => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const metrics: ShareMetrics = {
            width: (text, font) => { ctx.font = font; return ctx.measureText(text).width; },
        };
        const lay = layoutShareCard(data, style, metrics);
        // 设尺寸会把画布状态清空，所以**先定尺寸再画**
        canvas.width = lay.width;
        canvas.height = lay.height;
        drawShareCard(ctx, lay, bgImg);
    }, [data, style, bgImg]);

    // 系统字体和选中的那套都就位了才画（不然量出来的字宽是错的，折行会跑）
    const ready = fontsReady && fontReady;
    useEffect(() => { if (ready) paint(); }, [ready, paint]);

    const save = async () => {
        const canvas = canvasRef.current;
        if (!canvas || busy) return;
        setBusy(true);
        try {
            const blob = await new Promise<Blob | null>((resolve) => {
                canvas.toBlob((b) => resolve(b), 'image/png');
            });
            if (!blob) { notify('图片没做出来'); return; }
            const safe = book.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 24);
            const r = await shareOrDownloadBlob({
                blob, fileName: `书摘_${safe}_${date.replace(/\./g, '')}.png`, shareTitle: '书摘',
            });
            if (r === 'cancelled') return;
            notify(r === 'shared' ? '已打开系统保存/分享' : '图片已开始下载');
        } catch (err) {
            notify(`没存上：${err instanceof Error ? err.message : '未知错误'}`);
        } finally {
            setBusy(false);
        }
    };

    /** 换底图：压到 1600px 再进 blob 池（原图直接塞会撑爆配额） */
    const pickBg = async (file: File | undefined) => {
        if (!file) return;
        try {
            const url = URL.createObjectURL(file);
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const el = new Image();
                el.onload = () => resolve(el);
                el.onerror = () => reject(new Error('这张图读不出来'));
                el.src = url;
            });
            const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(img.width * scale));
            c.height = Math.max(1, Math.round(img.height * scale));
            c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            const blob = await new Promise<Blob | null>((resolve) => c.toBlob((b) => resolve(b), 'image/jpeg', 0.86));
            if (!blob) throw new Error('这张图转不出来');
            // 换图不删旧令牌：存过的卡片可能还引用着它，blob 池自己按内容去重
            setShareBgRef(await putImageBlob(blob));
            setShareStyle({ bgId: 'image' });
            notify('底图换好了');
        } catch (err) {
            notify(err instanceof Error ? err.message : '这张图用不了');
        }
    };

    /** 传字体：ttf/otf/woff 都行（她是照着「字体那几档看着都一样」提的，09-26） */
    const pickFont = async (file: File | undefined) => {
        if (!file) return;
        try {
            setShareFontRef(await putImageBlob(file));
            setShareStyle({ fontId: 'custom' });
            // 上一份自己传的已经换了，把注册过的那个摘掉，不然新字体会被老的压住
            const old = facesRef.current.get(RD_SHARE_CUSTOM_FONT);
            if (old) {
                try { document.fonts.delete(old); } catch { /* 已经没了 */ }
                facesRef.current.delete(RD_SHARE_CUSTOM_FONT);
            }
            setFontReady(false);
            notify('字体换好了');
        } catch {
            notify('这个字体文件用不了');
        }
    };

    const theme = RD_SHARE_THEMES.find((t) => t.id === style.themeId) ?? RD_SHARE_THEMES[0];
    const dotty = theme.layout === 'circle';
    // 系统三档 → 她给的六个 → 自己传的（没传过就不摆这一档）
    const fontChoices = [
        ...RD_SHARE_FONTS.filter((f) => f.id !== 'custom'),
        ...RD_SHARE_BUILTIN_FONTS,
        ...RD_SHARE_FONTS.filter((f) => f.id === 'custom' && !!store.fontRef),
    ];

    // 点卡片外面关掉它——**要拦住冒泡**：这张卡是从讨论面板里拉起来的，
    // 不拦的话关卡片会顺手把底下那张讨论面板也关掉
    return (
        <div className="rd-share-mask" onClick={(e) => { e.stopPropagation(); onClose(); }}>
            {/* 点卡片 = 把底下那条栏收起来 / 再点唤回来；
                点卡片**外面**（卡片周围的暗底）才关掉整张卡 */}
            <div className={`rd-share-stage${chrome ? '' : ' rd-share-stage-full'}`}>
                <canvas
                    ref={canvasRef}
                    className="rd-share-canvas"
                    onClick={(e) => { e.stopPropagation(); setChrome((v) => !v); }}
                />
            </div>

            {/* 栏收起来时这里留一小条把手：点它也能把栏唤回来（不至于找不到路） */}
            <div
                className={`rd-share-bottombar${chrome ? '' : ' rd-share-bottombar-bare'}`}
                onClick={(e) => { e.stopPropagation(); if (!chrome) setChrome(true); }}
            >
                {!chrome ? (
                    <div className="rd-share-grip"><span /></div>
                ) : panel ? (
                    <div className="rd-share-panel">
                        <div className="rd-share-row">
                            <div className="rd-share-label">主题</div>
                            <div className="rd-share-chips">
                                {RD_SHARE_THEMES.map((t) => (
                                    <button
                                        key={t.id}
                                        className={`rd-chip${t.id === style.themeId ? ' rd-chip-on' : ''}`}
                                        onClick={() => setShareStyle({ themeId: t.id })}
                                    >{t.label}</button>
                                ))}
                            </div>
                        </div>
                        <div className="rd-share-row">
                            <div className="rd-share-label">字体</div>
                            <div className="rd-share-chips">
                                {fontChoices.map((f) => (
                                    <button
                                        key={f.id}
                                        className={`rd-chip${f.id === style.fontId ? ' rd-chip-on' : ''}`}
                                        onClick={() => setShareStyle({ fontId: f.id })}
                                    >{f.label}</button>
                                ))}
                                {/* 自己的 ttf（她 09-26：系统那三档看着差不多，愿意给字体） */}
                                <label className="rd-chip rd-share-fontup" aria-label="传自己的字体">
                                    <UploadSimple size={14} />
                                    <input
                                        type="file"
                                        accept=".ttf,.otf,.woff,.woff2,font/*"
                                        style={{ display: 'none' }}
                                        onChange={(e) => { void pickFont(e.target.files?.[0]); e.target.value = ''; }}
                                    />
                                </label>
                            </div>
                        </div>
                        <div className="rd-share-row">
                            <div className="rd-share-label">背景色</div>
                            <div className="rd-share-dots">
                                {/* 「底色」= 不铺色，用这张主题自己的底色（每个主题都配好了） */}
                                <button
                                    className={`rd-share-dot rd-share-dot-word${style.bgId === 'none' ? ' rd-share-dot-on' : ''}`}
                                    aria-label="用主题自己的底色"
                                    onClick={() => setShareStyle({ bgId: 'none' })}
                                >底色</button>
                                {RD_SHARE_BGS.map((b) => (
                                    <button
                                        key={b.id}
                                        className={`rd-share-dot${b.id === style.bgId ? ' rd-share-dot-on' : ''}`}
                                        style={{ background: b.fill }}
                                        aria-label={b.label}
                                        onClick={() => setShareStyle({ bgId: b.id })}
                                    />
                                ))}
                            </div>
                        </div>
                        {/* 底图（她 09-26 给的那批）：垫在卡片下面，字在卡上还是清楚的。
                            这儿只加载缩略图（一共 24KB），真正选中了才去下大图。 */}
                        <div className="rd-share-row">
                            <div className="rd-share-label">底图</div>
                            <div className="rd-share-dots">
                                {RD_SHARE_BUILTIN_BGS.map((b) => (
                                    <button
                                        key={b.id}
                                        className={`rd-share-dot${b.id === style.bgId ? ' rd-share-dot-on' : ''}`}
                                        style={{ backgroundImage: `url(${builtinBgThumbUrl(b.file)})` }}
                                        aria-label={b.label}
                                        onClick={() => setShareStyle({ bgId: b.id })}
                                    />
                                ))}
                                {store.bgRef ? (
                                    <button
                                        className={`rd-share-dot${style.bgId === 'image' ? ' rd-share-dot-on' : ''}`}
                                        style={uploadedUrl ? { backgroundImage: `url(${uploadedUrl})` } : undefined}
                                        aria-label="用自己传的底图"
                                        onClick={() => setShareStyle({ bgId: 'image' })}
                                    />
                                ) : null}
                                <label className="rd-share-dot rd-share-dot-up" aria-label="传自己的底图">
                                    <UploadSimple size={16} />
                                    <input
                                        type="file"
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        onChange={(e) => { void pickBg(e.target.files?.[0]); e.target.value = ''; }}
                                    />
                                </label>
                            </div>
                        </div>
                        {dotty && (
                            <div className="rd-share-row">
                                <div className="rd-share-label">圆点</div>
                                <div className="rd-share-dots">
                                    {RD_SHARE_DOTS.map((c) => (
                                        <button
                                            key={c}
                                            className={`rd-share-dot${c === style.dot ? ' rd-share-dot-on' : ''}`}
                                            style={{ background: c }}
                                            aria-label="圆点颜色"
                                            onClick={() => setShareStyle({ dot: c })}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                        {/* 卡片底色 / 不透明度 / 字色（她 09-26 追加）。三个是一组：
                            底色调深了通常得连字色一起换，排在一块儿调才顺手。
                            取色器是原生的色轮，跟划线「这条」那颗一个调法。 */}
                        <div className="rd-share-row">
                            <div className="rd-share-label">卡片底色</div>
                            <div className="rd-share-dots">
                                <button
                                    className={`rd-share-dot rd-share-dot-word${style.cardColor ? '' : ' rd-share-dot-on'}`}
                                    aria-label="跟这张主题自己的底色"
                                    onClick={() => setShareStyle({ cardColor: undefined, cardAlpha: undefined })}
                                >跟主题</button>
                                {RD_SHARE_CARD_COLORS.map((c) => (
                                    <button
                                        key={c}
                                        className={`rd-share-dot${c === style.cardColor ? ' rd-share-dot-on' : ''}`}
                                        style={{ background: c }}
                                        aria-label="卡片底色"
                                        onClick={() => setShareStyle({ cardColor: c })}
                                    />
                                ))}
                                <label className="rd-share-dot rd-share-dot-up" aria-label="自己挑一个卡片色">
                                    <Palette size={16} />
                                    <input
                                        className="rd-share-color"
                                        type="color"
                                        aria-label="卡片底色"
                                        value={toHex6(style.cardColor || shareThemeById(style.themeId).card)}
                                        onChange={(e) => setShareStyle({ cardColor: e.target.value })}
                                    />
                                </label>
                            </div>
                            <div className="rd-share-alpha">
                                <span className="rd-share-label">不透明度</span>
                                <input
                                    className="rd-slider"
                                    type="range"
                                    min={10}
                                    max={100}
                                    value={style.cardAlpha ?? 100}
                                    aria-label="卡片不透明度"
                                    onChange={(e) => setShareStyle({ cardAlpha: Number(e.target.value) })}
                                />
                                <span className="rd-share-num">{style.cardAlpha ?? 100}%</span>
                            </div>
                        </div>
                        <div className="rd-share-row">
                            <div className="rd-share-label">字色</div>
                            <div className="rd-share-dots">
                                <button
                                    className={`rd-share-dot rd-share-dot-word${style.inkColor ? '' : ' rd-share-dot-on'}`}
                                    aria-label="跟这张主题自己的字色"
                                    onClick={() => setShareStyle({ inkColor: undefined })}
                                >跟主题</button>
                                {RD_SHARE_INK_COLORS.map((c) => (
                                    <button
                                        key={c}
                                        className={`rd-share-dot${c === style.inkColor ? ' rd-share-dot-on' : ''}`}
                                        style={{ background: c }}
                                        aria-label="字色"
                                        onClick={() => setShareStyle({ inkColor: c })}
                                    />
                                ))}
                                <label className="rd-share-dot rd-share-dot-up" aria-label="自己挑一个字色">
                                    <Palette size={16} />
                                    <input
                                        className="rd-share-color"
                                        type="color"
                                        aria-label="字色"
                                        value={toHex6(style.inkColor || shareThemeById(style.themeId).ink)}
                                        onChange={(e) => setShareStyle({ inkColor: e.target.value })}
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="rd-share-row">
                            <div className="rd-share-label">落款</div>
                            <input
                                className="rd-field rd-share-sign"
                                placeholder="留空就不写"
                                value={style.sign}
                                onChange={(e) => setShareStyle({ sign: e.target.value })}
                            />
                        </div>
                        <div className="rd-share-row">
                            <label className="rd-share-toggle">
                                <input
                                    type="checkbox"
                                    checked={style.withNote}
                                    onChange={(e) => setShareStyle({ withNote: e.target.checked })}
                                />
                                <span>带上我写的那句想法</span>
                            </label>
                        </div>
                        <button className="rd-btn rd-btn-primary rd-btn-block" onClick={() => setPanel(false)}>完成</button>
                    </div>
                ) : (
                    <div className="rd-share-bar">
                        <button className="rd-share-act" onClick={() => setPanel(true)}>
                            <SquaresFour size={22} />
                            <span>更换模板</span>
                        </button>
                        <button className="rd-share-act" onClick={() => void save()} disabled={busy}>
                            <DownloadSimple size={22} />
                            <span>{busy ? '正在存…' : '保存图片'}</span>
                        </button>
                        <button className="rd-share-act" onClick={onClose}>
                            <X size={22} />
                            <span>关闭</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// 读书模块 · 书架（2026-09-14 立项 / 2026-09-15 UI 轮重写 / 2026-09-15 v4 照竞品细化）
//
// 参考图版式（图 2/3/4/5）：
//   顶部一行 = 中间「分类 ⌄」+ 右上 ···（菜单）
//   大标题 + 计数 → 搜索胶囊 → 筛选胶囊 → 四种版式 / 可切「按分类分组」
//   ··· 菜单 = 选择 · 管理分类 · 按分类显示 · 随机开一本 · 显示（4 版式）· 排序（4 键）· 升/降序
//   搜索页（图 3/4）= 搜索框 + Cancel + 两行筛选胶囊 + 搜索历史 + 结果行（书名/星级/大小·格式·时间/右侧封面）
//   分类页（图 5）= 分类·标签·作者 分段 + 系统分类（带计数）+ 我的分类（可重命名/清空）
//
// 两个百分比的口径：左 = 全书进度（rd_progress.percent），右 = 读到第几章。
// 长按卡片 → 书详情 / 换封面 / 换编码重解 / 删除。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft, BookOpen, CaretDown, Check, DotsThree, Folder, MagnifyingGlass, Plus, Star, Tag, Trash, User, X,
} from '@phosphor-icons/react';
import { deleteBookDeep, getProgress, listBooks, patchBook, putBook, type RdBook, type RdProgress } from '../../../utils/reader/readerDb';
import {
    clearSearchHistory, pushSearchHistory, setShelfAsc, setShelfGrouped, setShelfLayout, setShelfSort,
    useReaderPrefs, type ShelfLayout, type ShelfSort,
} from '../readerPrefs';
import ImportSheet from '../ImportSheet';
import { addCat, loadCats, removeCat, renameCat } from '../readerCats';
import ReaderCover, { shrinkCoverImage } from '../ReaderCover';

interface Props {
    onOpenBook: (bookId: string) => void;
    /** 退出书房（回桌面/来处）——书架是 App 首页，出口在这儿 */
    onExit?: () => void;
    onOpenDetails: (bookId: string) => void;
    notify: (msg: string) => void;
    /** 已导入但还没打开：书架自己刷新（ReaderApp 传自增的号） */
    refreshToken: number;
    onChanged: () => void;
}

type Filter = 'all' | 'reading' | 'done' | 'unread';
type ShelfView = 'shelf' | 'search';

const FILTERS: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: '全部' },
    { key: 'reading', label: '在读' },
    { key: 'done', label: '读完' },
    { key: 'unread', label: '未读' },
];

/** 参考图 ··· 菜单里的 Display 组 */
const LAYOUTS: Array<{ key: ShelfLayout; label: string }> = [
    { key: 'list', label: '列表视图' },
    { key: 'grid', label: '网格视图' },
    { key: 'thumb', label: '缩略图列表' },
    { key: 'detail', label: '详情列表' },
];
const LAYOUT_CLASS: Record<ShelfLayout, string> = {
    grid: 'rd-grid',
    list: 'rd-grid-plain',
    thumb: 'rd-grid-list',
    detail: 'rd-grid-detail',
};
/** 参考图 ··· 菜单里的 Sort 组 */
const SORTS: Array<{ key: ShelfSort; label: string }> = [
    { key: 'lastRead', label: '按最近阅读' },
    { key: 'addTime', label: '按加入时间' },
    { key: 'fileSize', label: '按文件大小' },
    { key: 'fileName', label: '按文件名' },
];

/** 本章读到哪了：全书进度反推章内比例（percent 本身 = (章号 + 章内比例) / 章数） */
const chapterPercent = (b: RdBook, p?: RdProgress | null): number => {
    if (!p || b.chapterCount <= 0) return 0;
    const within = (p.percent ?? 0) * (b.chapterCount / 100) - (p.chapterIdx ?? 0);
    return Math.max(0, Math.min(100, Math.round(within * 100)));
};

const pctOf = (p?: RdProgress | null) => Math.round(p?.percent ?? 0);
const kbOf = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);
const dayOf = (iso?: string) => (iso ? iso.slice(0, 10) : '—');
const catOf = (b: RdBook) => (b.category || '').trim() || '未分类';

/** 五星（书架详情行用；跟书详情同一套图标与类名） */
function Stars({ value }: { value?: number }) {
    return (
        <div className="rd-book-stars">
            {[1, 2, 3, 4, 5].map((n) => (
                <Star
                    key={n}
                    size={13}
                    weight={n <= (value ?? 0) ? 'fill' : 'regular'}
                    className={n <= (value ?? 0) ? 'rd-star-on' : 'rd-star-dim'}
                />
            ))}
        </div>
    );
}

// ── 搜索页（参考图 3 / 4）──
type Field = 'all' | 'title' | 'category' | 'author' | 'tag';
const FIELDS: Array<{ key: Field; label: string }> = [
    { key: 'all', label: '全部' },
    { key: 'title', label: '书名' },
    { key: 'category', label: '分类' },
    { key: 'author', label: '作者' },
    { key: 'tag', label: '标签' },
];
const STATES: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: '不限' },
    { key: 'reading', label: '在读' },
    { key: 'unread', label: '未读' },
    { key: 'done', label: '读完' },
];

function ShelfSearch({ books, prog, onOpen, onClose }: {
    books: RdBook[];
    prog: Record<string, RdProgress | null>;
    onOpen: (id: string) => void;
    onClose: () => void;
}) {
    const prefs = useReaderPrefs();
    const [word, setWord] = useState('');
    const [field, setField] = useState<Field>('all');
    const [state, setState] = useState<Filter>('all');

    const hit = useCallback((b: RdBook): boolean => {
        const p = pctOf(prog[b.id]);
        if (state === 'reading' && !(p > 0 && p < 99)) return false;
        if (state === 'done' && p < 99) return false;
        if (state === 'unread' && p !== 0) return false;
        const q = word.trim().toLowerCase();
        if (!q) return true;
        const pool: Record<Field, string> = {
            all: `${b.title} ${b.customAuthor || b.author || ''} ${catOf(b)} ${(b.tags || []).join(' ')}`,
            title: b.title,
            category: catOf(b),
            author: b.customAuthor || b.author || '',
            tag: (b.tags || []).join(' '),
        };
        return pool[field].toLowerCase().includes(q);
    }, [word, field, state, prog]);

    const found = useMemo(() => books.filter(hit), [books, hit]);
    /** 结果按分类分组（参考图 4 的「Uncategorized」小标题） */
    const groups = useMemo(() => {
        const map = new Map<string, RdBook[]>();
        for (const b of found) {
            const c = catOf(b);
            map.set(c, [...(map.get(c) ?? []), b]);
        }
        return Array.from(map.entries());
    }, [found]);

    const submit = (raw: string) => {
        const q = raw.trim();
        if (q) pushSearchHistory(q);
    };

    return (
        <div className="rd-screen rd-screen-tight page-focus-once" data-rd-page="shelf-search">
            <div className="rd-search-bar">
                <div className="rd-search-input">
                    <MagnifyingGlass size={17} />
                    <input
                        autoFocus
                        value={word}
                        placeholder="搜索书名、作者、分类或标签"
                        onChange={(e) => setWord(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submit(word); }}
                    />
                    {word && (
                        <button className="rd-search-cancel" onClick={() => setWord('')} aria-label="清空"><X size={15} /></button>
                    )}
                </div>
                <button className="rd-search-cancel" onClick={() => { submit(word); onClose(); }}>取消</button>
            </div>

            <div className="rd-chips">
                {FIELDS.map((f) => (
                    <button key={f.key} className={`rd-chip${field === f.key ? ' rd-chip-on' : ''}`} onClick={() => setField(f.key)}>
                        {f.label}
                    </button>
                ))}
            </div>
            <div className="rd-chips">
                {STATES.map((s) => (
                    <button key={s.key} className={`rd-chip${state === s.key ? ' rd-chip-on' : ''}`} onClick={() => setState(s.key)}>
                        {s.label}
                    </button>
                ))}
            </div>

            {!word && prefs.searchHistory.length > 0 && (
                <>
                    <div className="rd-group-head">
                        <span>搜索历史</span>
                        <button className="rd-group-action" onClick={clearSearchHistory} aria-label="清空历史"><Trash size={15} /></button>
                    </div>
                    <div className="rd-chips" style={{ marginBottom: 0 }}>
                        {prefs.searchHistory.map((h) => (
                            <button key={h} className="rd-chip" onClick={() => { setWord(h); submit(h); }}>{h}</button>
                        ))}
                    </div>
                </>
            )}

            {word.trim() !== '' && (
                <>
                    <div className="rd-search-found">{found.length} 本匹配</div>
                    {groups.map(([cat, list]) => (
                        <div key={cat}>
                            <div className="rd-group-head">
                                <span>{cat}</span>
                                <span>{list.length} 本</span>
                            </div>
                            <div className="rd-card rd-card-flush">
                                <div className="rd-list" style={{ padding: '0 var(--rd-space-4)' }}>
                                    {list.map((b) => (
                                        <button key={b.id} className="rd-result" onClick={() => onOpen(b.id)}>
                                            <div className="rd-result-cover">
                                                <ReaderCover coverRef={b.coverRef} title={b.title} compact />
                                            </div>
                                            <div className="rd-result-main">
                                                <div className="rd-book-title">{b.title}</div>
                                                <Stars value={b.rating} />
                                                <div className="rd-book-facts">
                                                    <span>{kbOf(b.fileBytes)}</span>
                                                    <span>{b.format.toUpperCase()}</span>
                                                    <span>{dayOf(b.updatedAt)}</span>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}

// ── 分类面板（参考图 5 + 图 9）：点顶部标题**从上往下展开**，再点收回去 ──
type CatSeg = 'category' | 'tag' | 'author';

function CatPanel({ books, prog, onPick, onClose, notify, onChanged }: {
    books: RdBook[];
    prog: Record<string, RdProgress | null>;
    onPick: (cat: string) => void;
    onClose: () => void;
    notify: (msg: string) => void;
    onChanged: () => void;
}) {
    const [seg, setSeg] = useState<CatSeg>('category');
    const [word, setWord] = useState('');
    const [renaming, setRenaming] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    /** 编辑态：每行后面挂「改名 / 删除」 */
    const [editing, setEditing] = useState(false);
    /** 「添加分类」的行内输入 */
    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState('');

    /** 系统分类那五行（参考图：All / Uncategorized / Unread / Finished / Reading） */
    const system = useMemo(() => {
        const pcts = books.map((b) => pctOf(prog[b.id]));
        return [
            { label: '全部', n: books.length },
            { label: '未分类', n: books.filter((b) => catOf(b) === '未分类').length },
            { label: '未读', n: pcts.filter((p) => p === 0).length },
            { label: '读完', n: pcts.filter((p) => p >= 99).length },
            { label: '在读', n: pcts.filter((p) => p > 0 && p < 99).length },
        ];
    }, [books, prog]);

    const tags = useMemo(() => {
        const m = new Map<string, number>();
        books.forEach((b) => (b.tags || []).forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
        return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    }, [books]);
    const authors = useMemo(() => {
        const m = new Map<string, number>();
        books.forEach((b) => { const a = (b.customAuthor || b.author || '').trim() || '佚名'; m.set(a, (m.get(a) ?? 0) + 1); });
        return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    }, [books]);
    /** 我的分类 = 书上用着的 ∪ 名册里建的（新建的哪怕没书用也列出来，计数 0） */
    const cats = useMemo(() => {
        const m = new Map<string, number>();
        books.forEach((b) => { const c = catOf(b); if (c !== '未分类') m.set(c, (m.get(c) ?? 0) + 1); });
        for (const c of loadCats()) if (!m.has(c.name)) m.set(c.name, 0);
        return Array.from(m.entries()).filter(([k]) => k !== '未分类').sort((a, b) => b[1] - a[1]);
    }, [books]);

    const q = word.trim().toLowerCase();
    const list = (seg === 'category' ? cats : seg === 'tag' ? tags : authors).filter(([k]) => !q || k.toLowerCase().includes(q));

    /** 重命名：把这一类下所有书上的那个字段改掉（分类是书上的自由文本，没有单独的「分类表」） */
    const applyRename = async (from: string, to: string) => {
        const name = to.trim();
        setRenaming(null);
        if (!name || name === from) return;
        const targets = books.filter((b) => (seg === 'category' ? catOf(b) : seg === 'tag' ? (b.tags || []).includes(from) : (b.customAuthor || b.author || '').trim() === from));
        for (const b of targets) {
            const patch: Partial<RdBook> = {};
            if (seg === 'category') patch.category = name;
            else if (seg === 'tag') patch.tags = Array.from(new Set((b.tags || []).map((t) => (t === from ? name : t))));
            else patch.customAuthor = name;
            await putBook({ ...b, ...patch, updatedAt: new Date().toISOString() });
        }
        if (seg === 'category') renameCat(from, name);
        notify(`「${from}」改成「${name}」了，${targets.length} 本跟着变`);
        onChanged();
    };

    /** 删分类：名册里去掉 + 那些书回到「未分类」（书本身不动） */
    const dropCat = async (name: string) => {
        const targets = books.filter((b) => catOf(b) === name);
        for (const b of targets) await putBook({ ...b, category: '', updatedAt: new Date().toISOString() });
        if (seg === 'category') removeCat(name);
        notify(`「${name}」删了，${targets.length} 本回到未分类`);
        onChanged();
    };

    return (
        <div className="rd-catpanel" data-rd-page="shelf-cats">
            <div className="rd-opt-seg" style={{ marginBottom: 'var(--rd-space-3)' }}>
                {([['category', '分类'], ['tag', '标签'], ['author', '作者']] as Array<[CatSeg, string]>).map(([k, label]) => (
                    <button key={k} className={`rd-opt-seg-btn${seg === k ? ' rd-opt-seg-on' : ''}`} onClick={() => setSeg(k)}>{label}</button>
                ))}
            </div>

            <div className="rd-search-input" style={{ marginBottom: 'var(--rd-space-3)' }}>
                <MagnifyingGlass size={17} />
                <input value={word} placeholder="搜索分类" onChange={(e) => setWord(e.target.value)} />
            </div>

            {seg === 'category' && (
                <>
                    <div className="rd-group-head"><span>系统分类</span></div>
                    <div className="rd-card rd-card-flush">
                        <div className="rd-list" style={{ padding: '0 var(--rd-space-4)' }}>
                            {system.map((s) => (
                                <CatRow
                                    key={s.label}
                                    icon={<Folder size={19} weight="fill" />}
                                    label={s.label}
                                    count={s.n}
                                    onClick={() => { onPick(s.label === '全部' ? '__all__' : s.label); onClose(); }}
                                />
                            ))}
                        </div>
                    </div>
                </>
            )}

            <div className="rd-group-head">
                <span>{seg === 'category' ? '我的分类' : seg === 'tag' ? '标签' : '作者'}</span>
                {seg === 'category' && (
                    <span style={{ display: 'inline-flex', gap: 'var(--rd-space-3)' }}>
                        <button className="rd-group-action" onClick={() => { setEditing((v) => !v); setAdding(false); }}>
                            {editing ? '改完了' : '编辑分类'}
                        </button>
                        <button className="rd-group-action" onClick={() => { setAdding(true); setEditing(false); setNewName(''); }}>添加分类</button>
                    </span>
                )}
            </div>

            {seg === 'category' && adding && (
                <div className="rd-folder">
                    <span className="rd-folder-icon"><Folder size={19} weight="fill" /></span>
                    <input
                        className="rd-folder-label"
                        autoFocus
                        value={newName}
                        placeholder="新分类叫什么"
                        style={{ border: 0, background: 'transparent', color: 'inherit', font: 'inherit', outline: 'none' }}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            const n = newName.trim();
                            if (!n) { setAdding(false); return; }
                            addCat(n);
                            notify(`加了「${n}」`);
                            setAdding(false);
                            onChanged();
                        }}
                    />
                    <button
                        className="rd-group-action"
                        onClick={() => {
                            const n = newName.trim();
                            if (!n) { setAdding(false); return; }
                            addCat(n);
                            notify(`加了「${n}」`);
                            setAdding(false);
                            onChanged();
                        }}
                    >加</button>
                    <button className="rd-group-action" style={{ color: 'var(--rd-ink-soft)' }} onClick={() => setAdding(false)}>取消</button>
                </div>
            )}

            <div className="rd-card rd-card-flush">
                <div className="rd-list" style={{ padding: '0 var(--rd-space-4)' }}>
                    {list.length === 0 && <div className="rd-muted" style={{ padding: 'var(--rd-space-4) 0' }}>还没有</div>}
                    {list.map(([name, count]) => (
                        <CatRow
                            key={name}
                            icon={seg === 'category' ? <Folder size={19} weight="fill" /> : seg === 'tag' ? <Tag size={17} /> : <User size={17} />}
                            label={name}
                            count={count}
                            editing={renaming === name}
                            draft={draft}
                            onDraft={setDraft}
                            onRename={() => { setRenaming(name); setDraft(name); }}
                            onCommit={() => void applyRename(name, draft)}
                            onCancel={() => setRenaming(null)}
                            showActions={editing && seg === 'category'}
                            onDrop={() => void dropCat(name)}
                            onClick={() => { onPick(name); onClose(); }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

function CatRow({ icon, label, count, onClick, editing, draft = '', onDraft, onRename, onCommit, onCancel, showActions, onDrop }: {
    icon: React.ReactNode;
    label: string;
    count: number;
    onClick: () => void;
    editing?: boolean;
    draft?: string;
    onDraft?: (v: string) => void;
    onRename?: () => void;
    onCommit?: () => void;
    onCancel?: () => void;
    /** 编辑态：行尾挂「改名 / 删除」 */
    showActions?: boolean;
    onDrop?: () => void;
}) {
    if (editing) {
        return (
            <div className="rd-folder">
                <span className="rd-folder-icon">{icon}</span>
                <input
                    className="rd-folder-label"
                    autoFocus
                    value={draft}
                    style={{ border: 0, background: 'transparent', color: 'inherit', font: 'inherit', outline: 'none' }}
                    onChange={(e) => onDraft?.(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onCommit?.(); }}
                />
                <button className="rd-group-action" onClick={onCommit}>改</button>
                <button className="rd-group-action" style={{ color: 'var(--rd-ink-soft)' }} onClick={onCancel}>取消</button>
            </div>
        );
    }
    if (showActions) {
        return (
            <div className="rd-folder">
                <span className="rd-folder-icon">{icon}</span>
                <span className="rd-folder-label">{label}</span>
                <span className="rd-folder-count">{count}</span>
                <button className="rd-group-action" onClick={onRename}>改名</button>
                <button className="rd-group-action" style={{ color: 'var(--rd-danger)' }} onClick={onDrop}>删除</button>
            </div>
        );
    }
    return (
        <button className="rd-folder" onClick={onClick} onContextMenu={(e) => { e.preventDefault(); onRename?.(); }}>
            <span className="rd-folder-icon">{icon}</span>
            <span className="rd-folder-label">{label}</span>
            <span className="rd-folder-count">{count}</span>
        </button>
    );
}

export default function ReaderShelf({ onOpenBook, onOpenDetails, notify, refreshToken, onChanged, onExit }: Props) {
    const prefs = useReaderPrefs();
    const [books, setBooks] = useState<RdBook[]>([]);
    const [prog, setProg] = useState<Record<string, RdProgress | null>>({});
    const [view, setView] = useState<ShelfView>('shelf');
    const [filter, setFilter] = useState<Filter>('all');
    const [catFilter, setCatFilter] = useState('__all__');
    const [importOpen, setImportOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    /** 分类面板展开着没有（点顶部那颗标题切换，从上往下展开） */
    const [catOpen, setCatOpen] = useState(false);
    const [selecting, setSelecting] = useState(false);
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [menuBook, setMenuBook] = useState<RdBook | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<RdBook[] | null>(null);
    /** 换编码重解：把存住的原文件取出来，用新编码重导入 */
    const [reparse, setReparse] = useState<{ book: RdBook; file: File } | null>(null);
    const pressRef = useRef<{ timer: number | null; fired: boolean }>({ timer: null, fired: false });

    const reload = useCallback(async () => {
        const list = await listBooks();
        setBooks(list);
        const pairs = await Promise.all(list.map(async (b) => {
            const p = await getProgress(b.id, 'user');
            return [b.id, p] as const;
        }));
        setProg(Object.fromEntries(pairs));
    }, []);

    useEffect(() => { void reload(); }, [reload, refreshToken]);

    const startPress = (book: RdBook) => {
        pressRef.current.fired = false;
        pressRef.current.timer = window.setTimeout(() => {
            pressRef.current.fired = true;
            setMenuBook(book);
        }, 520);
    };
    const endPress = () => {
        if (pressRef.current.timer) window.clearTimeout(pressRef.current.timer);
    };

    const doDelete = async (list: RdBook[]) => {
        setConfirmDelete(null);
        setMenuBook(null);
        for (const b of list) await deleteBookDeep(b.id);
        notify(list.length > 1 ? `删掉 ${list.length} 本，书上的批注也一起清了` : '删掉了，书上的批注也一起清了');
        setSelecting(false);
        setPicked(new Set());
        await reload();
        onChanged();
    };

    const openReparse = async (book: RdBook) => {
        setMenuBook(null);
        const { getBlobForRef } = await import('../../../utils/blobRef');
        const blob = await getBlobForRef(book.fileRef);
        if (!blob) { notify('原文件已经不在了，请重新选一次文件'); return; }
        setReparse({ book, file: new File([blob], book.sourceFileName, { type: blob.type || 'text/plain' }) });
    };

    /** 换封面：挑一张图，压到 720 存 blobref（跟相机/美化区同一套 blob 存储） */
    const changeCover = async (book: RdBook) => {
        setMenuBook(null);
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
            const f = input.files?.[0];
            if (!f) return;
            void (async () => {
                try {
                    const { putImageBlob } = await import('../../../utils/blobRef');
                    const ref = await putImageBlob(await shrinkCoverImage(f));
                    await patchBook(book.id, { coverRef: ref, updatedAt: new Date().toISOString() });
                    notify('封面换好了');
                    await reload();
                    onChanged();
                } catch {
                    notify('这张图读不出来，换一张试试');
                }
            })();
        };
        input.click();
    };

    const shown = useMemo(() => {
        const list = books.filter((b) => {
            if (catFilter !== '__all__' && catOf(b) !== catFilter) return false;
            const p = pctOf(prog[b.id]);
            if (filter === 'reading') return p > 0 && p < 99;
            if (filter === 'done') return p >= 99;
            if (filter === 'unread') return p === 0;
            return true;
        });
        const val = (b: RdBook): number | string => {
            switch (prefs.shelfSort) {
                case 'lastRead': return prog[b.id]?.updatedAt ?? '';
                case 'fileSize': return b.fileBytes ?? 0;
                case 'fileName': return (b.title || '').toLowerCase();
                default: return b.createdAt ?? '';
            }
        };
        const asc = prefs.shelfAsc;
        return [...list].sort((a, b) => {
            const x = val(a);
            const y = val(b);
            if (typeof x === 'number' && typeof y === 'number') return asc ? x - y : y - x;
            return asc ? String(x).localeCompare(String(y)) : String(y).localeCompare(String(x));
        });
    }, [books, prog, filter, catFilter, prefs.shelfSort, prefs.shelfAsc]);

    const readingCount = books.filter((b) => {
        const p = pctOf(prog[b.id]);
        return p > 0 && p < 99;
    }).length;

    const gridClass = LAYOUT_CLASS[prefs.shelfLayout] ?? 'rd-grid';
    const layout = prefs.shelfLayout;

    const bcard = (book: RdBook) => {
        const p = prog[book.id];
        const pct = pctOf(p);
        const chPct = chapterPercent(book, p);
        const on = picked.has(book.id);
        return (
            <button
                key={book.id}
                className="rd-book"
                onClick={() => {
                    if (selecting) {
                        setPicked((s) => {
                            const n = new Set(s);
                            if (n.has(book.id)) n.delete(book.id);
                            else n.add(book.id);
                            return n;
                        });
                        return;
                    }
                    if (!pressRef.current.fired) onOpenBook(book.id);
                }}
                onTouchStart={() => startPress(book)}
                onTouchEnd={endPress}
                onTouchMove={endPress}
                onContextMenu={(e) => { e.preventDefault(); setMenuBook(book); }}
            >
                <div className="rd-book-cover">
                    <ReaderCover coverRef={book.coverRef} title={book.title} compact={layout !== 'grid'} />
                    {selecting && (
                        <span className={`rd-book-pick${on ? ' rd-book-pick-on' : ''}`}>{on && <Check size={13} weight="bold" />}</span>
                    )}
                </div>
                <div className="rd-book-meta">
                    <div className="rd-book-title">{book.title}</div>

                    {(layout === 'grid' || layout === 'thumb') && (
                        <div className="rd-book-author">{book.customAuthor || book.author || book.format.toUpperCase()}</div>
                    )}
                    {layout === 'grid' && (
                        <div className="rd-book-prog">
                            <span className="rd-book-pct">{pct}%</span>
                            <div className="rd-bar"><div className="rd-bar-fill" style={{ width: `${pct}%` }} /></div>
                            <span className="rd-book-pct">{chPct}%</span>
                        </div>
                    )}
                    {layout === 'thumb' && (
                        <div className="rd-book-prog">
                            <span className="rd-book-pct">{pct}%</span>
                            <div className="rd-bar"><div className="rd-bar-fill" style={{ width: `${pct}%` }} /></div>
                        </div>
                    )}
                    {layout === 'list' && (
                        <div className="rd-book-facts">
                            <span>{book.customAuthor || book.author || '佚名'}</span>
                            <span>{pct}%</span>
                        </div>
                    )}
                    {layout === 'detail' && (
                        <>
                            <Stars value={book.rating} />
                            <div className="rd-book-facts">
                                <span>{kbOf(book.fileBytes)}</span>
                                <span>{book.format.toUpperCase()}</span>
                                <span>{dayOf(book.updatedAt)}</span>
                            </div>
                        </>
                    )}
                </div>
            </button>
        );
    };

    const groupsForRender = useMemo(() => {
        if (!prefs.shelfGrouped) return null;
        const m = new Map<string, RdBook[]>();
        for (const b of shown) {
            const c = catOf(b);
            m.set(c, [...(m.get(c) ?? []), b]);
        }
        return Array.from(m.entries());
    }, [shown, prefs.shelfGrouped]);

    if (view === 'search') {
        return (
            <ShelfSearch
                books={books}
                prog={prog}
                onOpen={(id) => { setView('shelf'); onOpenBook(id); }}
                onClose={() => setView('shelf')}
            />
        );
    }
    return (
        <div className="rd-screen" data-rd-page="shelf">
            {/* 顶部一行：中间分类（参考图的 All ⌄）+ 右上 ···
                点中间那颗直接进分类页（参考图 9 那张「文件夹式」的），不再弹小菜单 */}
            <div className="rd-shelf-top" style={{ position: 'relative' }}>
                {onExit
                    ? <button className="rd-icon-btn" onClick={onExit} aria-label="退出书房"><ArrowLeft size={20} /></button>
                    : <span className="rd-shelf-top-spacer" />}
                <button className="rd-shelf-cat" onClick={() => setCatOpen((v) => !v)} aria-expanded={catOpen}>
                    {catFilter === '__all__' ? '全部' : catFilter}
                    <CaretDown size={13} weight="bold" className={catOpen ? 'rd-caret-up' : undefined} />
                </button>
                <span className="rd-shelf-top-spacer" />
                <button className="rd-icon-btn" onClick={() => setMenuOpen(true)} aria-label="书架菜单"><DotsThree size={22} /></button>
            </div>

            {/* 分类面板：就从顶上展开（她：不是点开去一个新页面） */}
            {catOpen && (
                <CatPanel
                    books={books}
                    prog={prog}
                    notify={notify}
                    onChanged={() => void reload().then(onChanged)}
                    onPick={(c) => {
                        // 系统分类里那四个状态不是「分类」，落到状态筛选上
                        const asState: Partial<Record<string, Filter>> = { 未读: 'unread', 读完: 'done', 在读: 'reading' };
                        if (c === '__all__') { setCatFilter('__all__'); setFilter('all'); return; }
                        if (asState[c]) { setCatFilter('__all__'); setFilter(asState[c] as Filter); return; }
                        setCatFilter(c);
                        setFilter('all');
                    }}
                    onClose={() => setCatOpen(false)}
                />
            )}

            <div className="rd-head">
                <div className="rd-head-main">
                    <div className="rd-head-title">书架</div>
                    <div className="rd-head-sub">{books.length} 本 · 在读 {readingCount} 本</div>
                </div>
            </div>

            <button className="rd-search-pill" onClick={() => setView('search')}>
                <MagnifyingGlass size={17} /> 搜索书名、作者、分类或标签
            </button>

            {books.length > 0 && (
                <div className="rd-chips">
                    {FILTERS.map((f) => (
                        <button key={f.key} className={`rd-chip${filter === f.key ? ' rd-chip-on' : ''}`} onClick={() => setFilter(f.key)}>
                            {f.label}
                        </button>
                    ))}
                </div>
            )}

            {books.length === 0 ? (
                <div className="rd-empty">
                    <BookOpen size={44} weight="thin" />
                    <div className="rd-empty-title">书架还空着</div>
                    <div className="rd-empty-text">导入一本 EPUB 或 TXT，就从这里开始读。</div>
                    <button className="rd-btn rd-btn-primary" onClick={() => setImportOpen(true)}>导入第一本书</button>
                </div>
            ) : shown.length === 0 ? (
                <div className="rd-empty">
                    <div className="rd-empty-text">这一类还没有书</div>
                </div>
            ) : groupsForRender ? (
                groupsForRender.map(([cat, list]) => (
                    <div key={cat}>
                        <div className="rd-group-head"><span>{cat}</span><span>{list.length}</span></div>
                        <div className={gridClass}>{list.map(bcard)}</div>
                    </div>
                ))
            ) : (
                <div className={gridClass}>{shown.map(bcard)}</div>
            )}

            {/* 多选模式的操作条（参考图 Select） */}
            {selecting && (
                <div className="rd-pickbar">
                    <span>已选 {picked.size} 本</span>
                    <button className="rd-btn" onClick={() => { setSelecting(false); setPicked(new Set()); }}>取消</button>
                    <button
                        className="rd-btn rd-btn-primary"
                        disabled={picked.size === 0}
                        onClick={() => setConfirmDelete(books.filter((b) => picked.has(b.id)))}
                    >
                        删除
                    </button>
                </div>
            )}

            {/* ── ··· 菜单（参考图 2） ── */}
            {menuOpen && (
                <div className="rd-sheet-mask" onClick={() => setMenuOpen(false)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">书架</div>

                        <div className="rd-card rd-card-flush">
                            <div className="rd-list">
                                {/* 导入原来在页头那颗「+」上，她让收进这里 */}
                                <button className="rd-item" onClick={() => { setMenuOpen(false); setImportOpen(true); }}>
                                    <span className="rd-item-label">导入书籍</span>
                                    <span className="rd-item-chev"><Plus size={16} /></span>
                                </button>
                                <button className="rd-item" onClick={() => { setSelecting(true); setPicked(new Set()); setMenuOpen(false); }}>
                                    <span className="rd-item-label">选择</span>
                                    <span className="rd-item-chev"><Check size={16} /></span>
                                </button>
                                <button className="rd-item" onClick={() => { setMenuOpen(false); setCatOpen(true); }}>
                                    <span className="rd-item-label">管理分类</span>
                                    <span className="rd-item-chev"><Folder size={17} /></span>
                                </button>
                                <button className="rd-item" onClick={() => setShelfGrouped(!prefs.shelfGrouped)}>
                                    <span className="rd-item-label">按分类显示</span>
                                    {prefs.shelfGrouped && <span className="rd-check">✓</span>}
                                    <span className="rd-item-chev"><Folder size={17} /></span>
                                </button>
                                <button
                                    className="rd-item"
                                    onClick={() => {
                                        setMenuOpen(false);
                                        const pool = shown.filter((b) => pctOf(prog[b.id]) < 99);
                                        const list = pool.length > 0 ? pool : shown;
                                        if (list.length === 0) { notify('书架还空着'); return; }
                                        onOpenBook(list[Math.floor(Math.random() * list.length)].id);
                                    }}
                                >
                                    <span className="rd-item-label">随机开一本</span>
                                    <span className="rd-item-chev">⇄</span>
                                </button>
                            </div>
                        </div>

                        <div className="rd-menu-label" style={{ marginTop: 'var(--rd-space-4)' }}>显示</div>
                        <div className="rd-card rd-card-flush">
                            <div className="rd-list">
                                {LAYOUTS.map((l) => (
                                    <button key={l.key} className="rd-item" onClick={() => setShelfLayout(l.key)}>
                                        <span className="rd-item-label">{l.label}</span>
                                        {prefs.shelfLayout === l.key && <span className="rd-check">✓</span>}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rd-menu-label" style={{ marginTop: 'var(--rd-space-4)' }}>排序</div>
                        <div className="rd-card rd-card-flush">
                            <div className="rd-list">
                                {SORTS.map((s) => (
                                    <button key={s.key} className="rd-item" onClick={() => setShelfSort(s.key)}>
                                        <span className="rd-item-label">{s.label}</span>
                                        {prefs.shelfSort === s.key && <span className="rd-check">✓</span>}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rd-card rd-card-flush" style={{ marginTop: 'var(--rd-space-3)' }}>
                            <div className="rd-list">
                                <button className="rd-item" onClick={() => setShelfAsc(true)}>
                                    <span className="rd-item-label">升序</span>
                                    {prefs.shelfAsc && <span className="rd-check">✓</span>}
                                    <span className="rd-item-chev">↑</span>
                                </button>
                                <button className="rd-item" onClick={() => setShelfAsc(false)}>
                                    <span className="rd-item-label">降序</span>
                                    {!prefs.shelfAsc && <span className="rd-check">✓</span>}
                                    <span className="rd-item-chev">↓</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 单本长按菜单 ── */}
            {menuBook && (
                <div className="rd-sheet-mask" onClick={() => setMenuBook(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">{menuBook.title}</div>
                        <div className="rd-muted" style={{ marginBottom: 'var(--rd-space-3)' }}>
                            {menuBook.format.toUpperCase()} · {kbOf(menuBook.fileBytes)} · 第 {menuBook.chapterCount} 章
                            {menuBook.encoding ? ` · ${menuBook.encoding}` : ''}
                        </div>
                        <div className="rd-card rd-card-flush">
                            <div className="rd-list">
                                <button className="rd-item" onClick={() => { setMenuBook(null); onOpenDetails(menuBook.id); }}>
                                    <span className="rd-item-label">书本详情</span>
                                    <span className="rd-item-chev">›</span>
                                </button>
                                <button className="rd-item" onClick={() => void changeCover(menuBook)}>
                                    <span className="rd-item-label">换一张封面</span>
                                    <span className="rd-item-chev">›</span>
                                </button>
                                {menuBook.format === 'txt' && (
                                    <button className="rd-item" onClick={() => void openReparse(menuBook)}>
                                        <span className="rd-item-label">换编码重解（乱码时用）</span>
                                        <span className="rd-item-chev">›</span>
                                    </button>
                                )}
                                <button className="rd-item rd-item-danger" onClick={() => { setConfirmDelete([menuBook]); setMenuBook(null); }}>
                                    <span className="rd-item-label">删除这本书</span>
                                </button>
                            </div>
                        </div>
                        <button className="rd-btn rd-btn-block" style={{ marginTop: 'var(--rd-space-3)' }} onClick={() => setMenuBook(null)}>取消</button>
                    </div>
                </div>
            )}

            {importOpen && (
                <ImportSheet
                    onClose={() => setImportOpen(false)}
                    onImported={(id) => {
                        setImportOpen(false);
                        void reload().then(() => onOpenBook(id));
                    }}
                    onBusyChange={setBusy}
                />
            )}

            {reparse && (
                <ImportSheet
                    presetFile={reparse.file}
                    presetEncoding="gb18030"
                    onClose={() => setReparse(null)}
                    onImported={() => {
                        setReparse(null);
                        notify('已按新编码重解成一本新书，旧书和它的批注还留着');
                        void reload();
                        onChanged();
                    }}
                    onBusyChange={setBusy}
                />
            )}

            {confirmDelete && (
                <div className="rd-sheet-mask" onClick={() => setConfirmDelete(null)}>
                    <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="rd-sheet-grip" />
                        <div className="rd-sheet-title">
                            {confirmDelete.length > 1 ? `删掉这 ${confirmDelete.length} 本？` : `删掉《${confirmDelete[0].title}》？`}
                        </div>
                        <div className="rd-muted" style={{ marginBottom: 'var(--rd-space-3)' }}>
                            这些书的批注和讨论会一起删掉，删了就找不回来了。书能重新导入，批注不能。
                        </div>
                        <div className="rd-btn-row">
                            <button className="rd-btn" onClick={() => setConfirmDelete(null)}>再想想</button>
                            <button className="rd-btn rd-btn-primary" onClick={() => void doDelete(confirmDelete)}>删掉</button>
                        </div>
                    </div>
                </div>
            )}

            {busy && <div className="rd-toast">正在导入…</div>}
        </div>
    );
}

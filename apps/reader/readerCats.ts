// 读书模块 · 分类名册（2026-09-15 加，她问「为什么分类不能添加」）
//
// 分类本来只是**书上那个自由文本字段**（book.category），所以「添加分类」没有地方可加、
// 书详情也只能手打。这张名册补上那一半：
//   · 分类页的「添加分类」写这里 → 新分类立刻出现在「我的分类」里（哪怕一本书都还没用它）
//   · 书详情的分类从「名册 + 书上用过的」里挑，也能现打一个新的（自动进名册）
//
// **书的 category 字段仍然是唯一事实**：改分类 = 改书（批量重命名就是这么干的），
// 名册只负责「有哪些分类可以选」。删掉名册里的一条不会动书。
//
// 存 localStorage：`reader_cats_v1`（纯文本、很小，跟我们的备份口径一起走）

const KEY = 'reader_cats_v1';

export interface CatEntry {
    name: string;
    createdAt: string;
}

function read(): CatEntry[] {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as CatEntry[] | { cats?: CatEntry[] };
        const list = Array.isArray(parsed) ? parsed : (parsed.cats ?? []);
        return list.filter((c) => c && typeof c.name === 'string' && c.name.trim() !== '');
    } catch {
        return [];
    }
}

function write(list: CatEntry[]): CatEntry[] {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* 配额满了就算了 */ }
    return list;
}

export function loadCats(): CatEntry[] {
    return read();
}

/** 加一个分类（同名不重复加，返回最新名册） */
export function addCat(name: string): CatEntry[] {
    const n = name.trim();
    if (!n) return read();
    const list = read();
    if (list.some((c) => c.name === n)) return list;
    return write([...list, { name: n, createdAt: new Date().toISOString() }]);
}

/** 从名册里删一个（不动书；书上的分类由调用方决定要不要清） */
export function removeCat(name: string): CatEntry[] {
    return write(read().filter((c) => c.name !== name));
}

/** 名册里改名（书上的批量改由调用方做） */
export function renameCat(from: string, to: string): CatEntry[] {
    const n = to.trim();
    if (!n || n === from) return read();
    const list = read().filter((c) => c.name !== from);
    if (!list.some((c) => c.name === n)) list.push({ name: n, createdAt: new Date().toISOString() });
    return write(list);
}

/**
 * 能选的全部分类 = 名册 ∪ 书上真的用着的（书是主，名册是补充）。
 * 顺序：书用得多的在前，名册里新增的跟在后面。
 */
export function allCatNames(used: Array<[string, number]>): string[] {
    const names = used.map(([n]) => n);
    for (const c of read()) if (c.name !== '未分类' && !names.includes(c.name)) names.push(c.name);
    return names.filter((n) => n !== '未分类');
}

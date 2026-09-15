// 读书模块 · 分类与标签名册（2026-09-15 加，她问「为什么分类不能添加」「标签没有添加的地方」）
//
// 分类和标签本来都只是**书上那个自由文本字段**（book.category / book.tags），所以
// 「添加分类」没有地方可加、书详情也只能手打。这两张名册补上那一半：
//   · 分类页的「添加分类 / 添加标签」写这里 → 立刻出现在「我的分类」里（哪怕一本书都没用）
//   · 书详情从「名册 + 书上用过的」里挑，也能现打一个新的（自动进名册）
//
// **书上的字段仍然是唯一事实**：改分类/标签 = 改书（批量重命名就是这么干的），
// 名册只负责「有哪些可以选」。删掉名册里的一条不会动书。
//
// 存 localStorage：`reader_cats_v1` / `reader_tags_v1`（纯文本、很小，跟我们的备份口径一起走）

export interface CatEntry {
    name: string;
    createdAt: string;
}

function makeRoster(key: string) {
    const read = (): CatEntry[] => {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return [];
            const parsed = JSON.parse(raw) as CatEntry[] | { cats?: CatEntry[] };
            const list = Array.isArray(parsed) ? parsed : (parsed.cats ?? []);
            return list.filter((c) => c && typeof c.name === 'string' && c.name.trim() !== '');
        } catch {
            return [];
        }
    };
    const write = (list: CatEntry[]): CatEntry[] => {
        try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* 配额满了就算了 */ }
        return list;
    };
    return {
        load: read,
        /** 加一条（同名不重复加，返回最新名册） */
        add(name: string): CatEntry[] {
            const n = name.trim();
            if (!n) return read();
            const list = read();
            if (list.some((c) => c.name === n)) return list;
            return write([...list, { name: n, createdAt: new Date().toISOString() }]);
        },
        /** 从名册里删一条（不动书；书上的字段由调用方决定要不要清） */
        remove(name: string): CatEntry[] {
            return write(read().filter((c) => c.name !== name));
        },
        /** 名册里改名（书上的批量改由调用方做） */
        rename(from: string, to: string): CatEntry[] {
            const n = to.trim();
            if (!n || n === from) return read();
            const list = read().filter((c) => c.name !== from);
            if (!list.some((c) => c.name === n)) list.push({ name: n, createdAt: new Date().toISOString() });
            return write(list);
        },
    };
}

const cats = makeRoster('reader_cats_v1');
const tags = makeRoster('reader_tags_v1');

export const loadCats = cats.load;
export const addCat = cats.add;
export const removeCat = cats.remove;
export const renameCat = cats.rename;

export const loadTags = tags.load;
export const addTag = tags.add;
export const removeTag = tags.remove;
export const renameTag = tags.rename;

/**
 * 能选的全部分类 = 名册 ∪ 书上真的用着的（书是主，名册是补充）。
 * 顺序：书用得多的在前，名册里新增的跟在后面。
 */
export function allCatNames(used: Array<[string, number]>): string[] {
    const names = used.map(([n]) => n);
    for (const c of cats.load()) if (c.name !== '未分类' && !names.includes(c.name)) names.push(c.name);
    return names.filter((n) => n !== '未分类');
}

/** 标签同理（书架上用着的 + 名册里建的）。 */
export function allTagNames(used: Array<[string, number]>): string[] {
    const names = used.map(([n]) => n);
    for (const t of tags.load()) if (!names.includes(t.name)) names.push(t.name);
    return names;
}

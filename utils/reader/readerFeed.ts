// 读书模块 · **开读之前摆到他眼前的东西**（她 09-21 定稿；09-21 深夜抽成纯函数 + 单测）
//
// 三块：
//   ① **他眼下这几页上所有的批注**——当风景看也行，想接哪句就接。他接过话的那几条后面
//      标一句，省得他对着同一条说第二遍；他自己划的也在里头（那一页本来就是他看到的样子）。
//   ② **他最近几次读过的那几页上，他还没接过话的**——他读完往后走了以后，她又在那些页上
//      留了话，他的窗口再也扫不到。她原话：「我还是希望他能回那些以我的话收尾的讨论」。
//      名单**现读**：她删掉那条批注，下一次这儿就没有了。
//   ③ **他参与过的讨论**里，他说完之后别人接着说——关于他的事他得知道。
//
// 抽出来的原因：她连着两轮问「里面真的有我最近的批注吗」，光靠嘴说不如让单测把这句话钉住
// （`readerFeed.test.ts`）。组件那边只负责取数据 + 拼行。
//
// 「有哪几页」全部用**章内段号**；跨章的段号会撞车，所以过滤时章号也要对。

import {
    canSee, getChapter, listAnnotations, listRoamActivities, listThreads,
    type RdAnnotation, type RdRoamActivity, type RdThread,
} from './readerDb';
import { threadKeyOf } from './readerParticipants';

export interface PageFeed {
    /** 他眼下这几页上的批注（一行一条，按书上顺序） */
    notes: string[];
    /** 他最近几次读过的那几页上还没接过话的，**一页一条**（带那页原文 + 那页的批注和讨论） */
    later: string[];
    /** 他参与过的讨论里，他说完之后别人接着说的 */
    followUps: string[];
}

/** 往前看几次「他读过的记录」（她 09-21 说「最近读到的里面最近几条」） */
export const FEED_READ_LOOKBACK = 8;
/** 那块最多摆**几页**（一页一大块，塞太多会把眼前这几页的正文挤小） */
export const FEED_LATER_MAX = 3;
/** 一页原文最多给多少字（超了截断，段号照留） */
const PAGE_TEXT_MAX = 900;
/** 一页上最多摆几条批注 / 每条的讨论最多摆几句 */
const PAGE_ANNS_MAX = 6;
const THREAD_LINES_MAX = 6;

export interface BuildFeedInput {
    charId: string;
    bookId: string;
    /** 当前这一章（段号是章内的；批注没写章号时按它算） */
    chapterIdx: number;
    /** 他眼下读的段落范围（章内段号，含两头） */
    from: number;
    to: number;
    anns: RdAnnotation[];
    threads: RdThread[];
    /** 他的活动记录（这个函数自己挑「读过的」那几条、自己排序） */
    reads: RdRoamActivity[];
    /** 拿某一章的正文（正文只用来给「他需要回的那一页」垫背景） */
    parasOf?: (chapterIdx: number) => string[] | undefined;
    nameOf: (ownerId: string) => string;
}

/** 一页（章 + 页号 + 段范围）——由他的读书记录还原 */
interface PageRef {
    chapterIdx: number;
    page: number;
    from: number;
    to: number;
    /** 他读到这一页那次是什么时候 */
    at: string;
    pageFrom: number;
    pageTo: number;
}

/** 一次读书记录 → 它盖住的每一页 */
function pagesOfRead(r: RdRoamActivity, fallbackChapter: number): PageRef[] {
    const chapterIdx = r.chapterIdx ?? fallbackChapter;
    const from = r.fromPara;
    const to = r.toPara;
    if (from === undefined || to === undefined) return [];
    const pageFrom = r.fromPage ?? 1;
    const perPage = Math.max(1, r.perPage ?? (to - from + 1));
    const out: PageRef[] = [];
    for (let p = from, page = pageFrom; p <= to; p += perPage, page += 1) {
        out.push({
            chapterIdx, page, from: p, to: Math.min(to, p + perPage - 1),
            at: r.createdAt, pageFrom, pageTo: r.toPage ?? pageFrom,
        });
    }
    return out;
}

/** 把数据摆成三块（纯函数：同样的数据进来，同样的行出去）。 */
export function buildPageFeed(input: BuildFeedInput): PageFeed {
    const { charId, bookId, chapterIdx, from, to, anns, threads, reads, parasOf, nameOf } = input;
    const keyOf = (a: RdAnnotation): string => threadKeyOf(a.chapterIdx ?? chapterIdx, a.anchor, a.ownerId);
    /** 批注落在哪一段：章号跟段号是一对（段号是章内的，只看段号会串章） */
    const inWindow = (a: RdAnnotation, w: { chapterIdx: number; from: number; to: number }): boolean =>
        (a.chapterIdx ?? chapterIdx) === w.chapterIdx
        && a.anchor.startPara >= w.from && a.anchor.startPara <= w.to;

    // 他接过话的讨论（认锚点）→ 那一条后面标一句
    const joined = new Set(
        threads
            .filter((t) => t.messages.some((m) => m.role === 'char' && m.charId === charId))
            .map((t) => t.anchorKey),
    );
    /** 一条批注 → 给他的那一行 */
    const lineOf = (a: RdAnnotation): string => {
        const who = a.ownerId === charId ? '你' : `[${nameOf(a.ownerId)}]`;
        const done = joined.has(keyOf(a)) ? '（你已经接过话了）' : '';
        return `${who} “${a.anchor.text}” → ${a.note}${done}`;
    };
    const readable = anns
        .filter((a) => a.kind !== 'bookmark' && !!a.note)
        .filter((a) => canSee(a, charId));

    // ① 他眼下这几页（顺序就是书上从上到下）
    const here = readable.filter((a) => inWindow(a, { chapterIdx, from, to }));
    const seen = new Set(here.map((a) => a.id));

    // ② 他最近几次读过的**页**：哪几页上还留着他没接过的话，一页摆一块
    const clock = (iso: string): string => {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    const threadOf = (a: RdAnnotation): RdThread | undefined =>
        threads.find((t) => t.anchorKey === keyOf(a));
    /**
     * 这一条还需要他回吗？
     *   · 别人留的：他没在这条下面说过话（说过就不再催）
     *   · **他自己划的**（她 09-21：我自己都回了他划的线，怎么就不算）：只要别人在这条
     *     下面说过话、而最后一句不是他，就得给他看——那正是「她回了我，我还没回她」
     */
    const needsAnswer = (a: RdAnnotation): boolean => {
        const th = threadOf(a);
        const msgs = th?.messages ?? [];
        if (a.ownerId === charId) {
            const others = msgs.filter((m) => !(m.role === 'char' && m.charId === charId));
            if (others.length === 0) return false;
            const last = msgs[msgs.length - 1];
            return !(last && last.role === 'char' && last.charId === charId);
        }
        return !joined.has(keyOf(a));
    };
    const pages: PageRef[] = reads
        .filter((a) => a.bookId === bookId && a.kind === 'annotate' && a.mode === 'coread')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(-FEED_READ_LOOKBACK)
        .flatMap((r) => pagesOfRead(r, chapterIdx));

    /** 这一页上他还得回的话 */
    const pendingOn = (pg: PageRef): RdAnnotation[] => readable.filter((a) => (
        (a.chapterIdx ?? chapterIdx) === pg.chapterIdx
        && a.anchor.startPara >= pg.from && a.anchor.startPara <= pg.to
        && !seen.has(a.id)            // 眼下这几页已经摆过的，不重复
        && needsAnswer(a)
    ));

    // 同一页可能在好几次记录里都出现 → 按「章 + 页号」合成一块
    const byPage = new Map<string, { pg: PageRef; items: RdAnnotation[] }>();
    for (const pg of pages) {
        const items = pendingOn(pg);
        if (items.length === 0) continue;
        const k = `${pg.chapterIdx}|${pg.page}`;
        const hit = byPage.get(k);
        if (hit) {
            for (const a of items) if (!hit.items.some((x) => x.id === a.id)) hit.items.push(a);
        } else {
            byPage.set(k, { pg, items });
        }
    }

    /** 一页 = 那一页的原文 + 那一页上的批注和讨论（她 09-21：他回话得带着这些） */
    const pageBlock = (pg: PageRef, items: RdAnnotation[]): string => {
        const span = pg.pageFrom === pg.pageTo ? `第 ${pg.pageFrom} 页` : `第 ${pg.pageFrom}–${pg.pageTo} 页`;
        const lines = [`■ 第 ${pg.page} 页${pg.at ? `（你 ${clock(pg.at)} 读的是${span}）` : ''}`];
        const paras = parasOf?.(pg.chapterIdx);
        if (paras) {
            let text = '';
            let cut = false;
            for (let i = pg.from; i <= pg.to; i += 1) {
                const seg = `[${i}] ${paras[i] ?? ''}`;
                if (text.length + seg.length > PAGE_TEXT_MAX) { cut = true; break; }
                text += (text ? '\n' : '') + seg;
            }
            lines.push('那一页的原文：', cut ? `${text}\n……（这一页后面还有）` : text);
        }
        lines.push('那一页上的批注和讨论：');
        for (const a of items.slice(0, PAGE_ANNS_MAX)) {
            const who = a.ownerId === charId ? '你' : `[${nameOf(a.ownerId)}]`;
            lines.push(`${who} “${a.anchor.text}” → ${a.note}`);
            for (const m of (threadOf(a)?.messages ?? []).slice(-THREAD_LINES_MAX)) {
                const mine = m.role === 'char' && m.charId === charId;
                const said = m.role === 'user' ? nameOf('user') : nameOf(m.charId ?? '');
                lines.push(`　↳ ${mine ? '你' : said}：${m.content}`);
            }
        }
        return lines.join('\n');
    };

    const later = [...byPage.values()]
        .sort((x, y) => y.pg.at.localeCompare(x.pg.at))                       // 最近读过的那几页在前
        .slice(0, FEED_LATER_MAX)
        .sort((x, y) => x.pg.chapterIdx - y.pg.chapterIdx || x.pg.page - y.pg.page)
        .map(({ pg, items }) => pageBlock(pg, items));

    // ③ 他参与过的讨论里，他说完之后别人接着说
    const followUps: string[] = [];
    for (const t of threads) {
        const his = t.messages.filter((m) => m.role === 'char' && m.charId === charId);
        if (his.length === 0) continue;           // 他连话都没说过的不打扰他
        const lastMineAt = his[his.length - 1].createdAt;
        for (const m of t.messages) {
            if (m.createdAt <= lastMineAt) continue;
            if (m.role === 'char' && m.charId === charId) continue;
            const who = m.role === 'user' ? nameOf('user') : nameOf(m.charId ?? '');
            followUps.push(`[${who}] 在“${t.anchor.text}”那条下面说：${m.content}`);
        }
    }

    return { notes: here.map(lineOf), later, followUps: followUps.slice(-10) };
}

/** 取数据 + 摆盘（组件用这个）。 */
export async function gatherPageFeed(opts: {
    charId: string;
    bookId: string;
    chapterIdx: number;
    from: number;
    to: number;
    nameOf: (ownerId: string) => string;
}): Promise<PageFeed> {
    const [anns, threads, reads] = await Promise.all([
        listAnnotations(opts.bookId),
        listThreads(opts.bookId),
        listRoamActivities(opts.charId, 200).catch(() => [] as RdRoamActivity[]),
    ]);
    // 「他需要回的那一页」要垫上那页原文：把他最近读过的几章取出来（通常就一章）
    const need = new Set<number>();
    for (const r of reads) {
        if (r.bookId === opts.bookId && r.kind === 'annotate' && r.mode === 'coread') {
            need.add(r.chapterIdx ?? opts.chapterIdx);
        }
    }
    need.add(opts.chapterIdx);
    const chapters = new Map<number, string[]>();
    await Promise.all([...need].map(async (ci) => {
        const ch = await getChapter(opts.bookId, ci).catch(() => null);
        if (ch) chapters.set(ci, ch.paras);
    }));
    return buildPageFeed({
        ...opts,
        anns, threads, reads,
        parasOf: (ci) => chapters.get(ci),
    });
}

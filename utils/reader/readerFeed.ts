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

import { canSee, listAnnotations, listRoamActivities, listThreads, type RdAnnotation, type RdRoamActivity, type RdThread } from './readerDb';
import { threadKeyOf } from './readerParticipants';

export interface PageFeed {
    /** 他眼下这几页上的批注（一行一条，按书上顺序） */
    notes: string[];
    /** 他最近几次读过的那几页上，他还没接过话的（一行一条，按书上顺序） */
    later: string[];
    /** 他参与过的讨论里，他说完之后别人接着说的 */
    followUps: string[];
}

/** 往前看几次「他读过的记录」（她 09-21 说「最近读到的里面最近几条」） */
export const FEED_READ_LOOKBACK = 8;
/** 那块最多摆几条（一次全塞给他会把眼前这几页的正文挤小） */
export const FEED_LATER_MAX = 8;

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
    nameOf: (ownerId: string) => string;
}

/** 把数据摆成三块（纯函数：同样的数据进来，同样的行出去）。 */
export function buildPageFeed(input: BuildFeedInput): PageFeed {
    const { charId, bookId, chapterIdx, from, to, anns, threads, reads, nameOf } = input;
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

    // ② 他最近几次读过的段落（跨章也认：他昨天读的是上一章，那几页也得算）
    const windows = reads
        .filter((a) => a.bookId === bookId && a.kind === 'annotate' && a.mode === 'coread'
            && a.fromPara !== undefined && a.toPara !== undefined)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(-FEED_READ_LOOKBACK)
        .map((a) => ({ chapterIdx: a.chapterIdx ?? chapterIdx, from: a.fromPara as number, to: a.toPara as number }));
    const later = (windows.length === 0 ? [] : readable
        .filter((a) => a.ownerId !== charId)                 // 「别人说的话你还没接」——他自己划的不算
        .filter((a) => !seen.has(a.id))                      // 眼下这几页已经摆过的，不重复
        .filter((a) => windows.some((w) => inWindow(a, w)))
        .filter((a) => !joined.has(keyOf(a)))                // 他已经接过话的不再催
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(-FEED_LATER_MAX)
        .sort((a, b) => (a.chapterIdx ?? chapterIdx) - (b.chapterIdx ?? chapterIdx)
            || a.anchor.startPara - b.anchor.startPara
            || a.anchor.startOffset - b.anchor.startOffset))
        .map(lineOf);

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
    return buildPageFeed({ ...opts, anns, threads, reads });
}

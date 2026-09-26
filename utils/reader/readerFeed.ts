// 读书模块 · **开读之前摆到他眼前的东西**（她 09-21 定稿；09-25 文档改了「未读」的口径）
//
// 两块：
//   ① **他眼下这几页上所有的批注**——当风景看也行，想接哪句就接。他接过话的那几条后面标一句，
//      省得他对着同一条说第二遍；他自己划的也在里头（那一页本来就是他看到的样子）。
//   ② **未读的**——她 09-25 文档的定义：**他还没接收过的**。以他上次读到什么时候为准（水位线），
//      那之后书房里新出现的批注和回复都算。落在他读过的那些页上的，**一页一块**摆给他：
//      那一页的原文 + 那一页大家的批注 + 谁说过什么话（她 09-21 要的「回话得带着记录」）；
//      落在他还没读到的页上的，就简单列一行，让他知道有这么回事。
//
// **别把「未读」和「没接过话」当成一回事**（文档原话）：他看过没接的，下一次不再重复摆。
// 水位线由调用方给（`reader_context_v1` 里按角色存 `seen`），他每读一次就推一次。
//
// 抽成纯函数的原因：她连着两轮问「里面真的有我最近的批注吗」，光靠嘴说不如让单测把这句话钉住
// （`readerFeed.test.ts`）。组件那边只负责取数据 + 拼行。
//
// 「有哪几页」全部用**章内段号**；跨章的段号会撞车，所以过滤时章号也要对。

import {
    canSee, getChapter, listAnnotations, listRoamActivities, listThreads,
    type RdAnnotation, type RdRoamActivity, type RdThread,
} from './readerDb';
import { threadKeyOf } from './readerParticipants';
import { activeWindow, buildTimeline, lineOf, type TimelineRow } from './readerTimeline';
import { recentMemos, seenAt } from '../../apps/reader/readerContextStore';

export interface PageFeed {
    /** 他眼下这几页上的批注（一行一条，按书上顺序） */
    notes: string[];
    /** 他上次读完之后新出现的、落在他读过那几页上的，**一页一条**（带原文 + 批注 + 讨论） */
    later: string[];
    /** 别处新出现的（他还没读到的页上）——一行一条，让他知道有这么回事 */
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
/** 别处那些最多列几条 */
const ELSEWHERE_MAX = 10;

export interface BuildFeedInput {
    charId: string;
    bookId: string;
    /** 当前这一章（段号是章内的；批注没写章号时按它算） */
    chapterIdx: number;
    /** 他眼下读的段落范围（章内段号，含两头） */
    from: number;
    to: number;
    /** 他的未读水位线：上次读到什么时候（null / 不给 = 什么都还没接收过） */
    since?: string | null;
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

/** `HH:MM` */
const clock = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 把数据摆成三块（纯函数：同样的数据进来，同样的行出去）。 */
export function buildPageFeed(input: BuildFeedInput): PageFeed {
    const { charId, chapterIdx, from, to, anns, threads, reads, parasOf, nameOf } = input;
    const since = input.since ?? null;
    const keyOf = (a: RdAnnotation): string => threadKeyOf(a.chapterIdx ?? chapterIdx, a.anchor, a.ownerId);

    const readable = anns
        .filter((a) => a.kind !== 'bookmark' && !!a.note)
        .filter((a) => canSee(a, charId));

    // 他接过话的讨论（认锚点）→ 那一条后面标一句
    const joined = new Set(
        threads
            .filter((t) => t.messages.some((m) => m.role === 'char' && m.charId === charId))
            .map((t) => t.anchorKey),
    );

    // ① 他眼下这几页（顺序就是书上从上到下）
    const key = (a: RdAnnotation): string => `${a.chapterIdx ?? chapterIdx}|${a.anchor.startPara}`;
    const here = readable.filter((a) => (a.chapterIdx ?? chapterIdx) === chapterIdx
        && a.anchor.startPara >= from && a.anchor.startPara <= to);
    const notes = here.map((a) => {
        const who = a.ownerId === charId ? '你' : `[${nameOf(a.ownerId)}]`;
        const done = joined.has(keyOf(a)) ? '（你已经接过话了）' : '';
        return `${who} “${a.anchor.text}” → ${a.note}${done}`;
    });
    const noteKeys = new Set(here.map(key));

    // ② 未读：他上次读完之后新出现的（别人写的），落在他读过的那些页上的按页归堆
    const rows = buildTimeline({ anns, threads, viewer: charId, nameOf, chapterFallback: chapterIdx });
    const unread = (since ? rows.filter((r) => r.at > since) : rows)
        .filter((r) => r.ownerId !== charId)
        // 眼下这几页上的批注已经当风景摆过一遍了，不再重复
        .filter((r) => !(r.kind === 'note' && r.chapterIdx === chapterIdx
            && r.para >= from && r.para <= to));

    const pages: PageRef[] = reads
        .filter((a) => a.kind === 'annotate' && a.mode === 'coread')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(-FEED_READ_LOOKBACK)
        .flatMap((r) => pagesOfRead(r, chapterIdx));

    const elsewhere: TimelineRow[] = [];
    const byPage = new Map<string, { pg: PageRef; rows: TimelineRow[] }>();
    for (const r of unread) {
        const pg = [...pages].reverse().find((p) => p.chapterIdx === r.chapterIdx
            && r.para >= p.from && r.para <= p.to);
        if (!pg) { elsewhere.push(r); continue; }
        const k = `${pg.chapterIdx}|${pg.page}`;
        const hit = byPage.get(k);
        if (hit) hit.rows.push(r);
        else byPage.set(k, { pg, rows: [r] });
    }

    /** 这一页上能看见的批注（谁留的都摆——他要回话得有那一页的全貌） */
    const annsOnPage = (pg: PageRef): RdAnnotation[] => readable.filter((a) => (
        (a.chapterIdx ?? chapterIdx) === pg.chapterIdx
        && a.anchor.startPara >= pg.from && a.anchor.startPara <= pg.to
        && !noteKeys.has(key(a))       // 眼下这几页上的，风景那块已经摆过
    ));

    /** 一页 = 那一页的原文 + 那一页上的批注和讨论（她 09-21：他回话得带着这些） */
    const pageBlock = (pg: PageRef, fresh: TimelineRow[]): string => {
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
        const items = annsOnPage(pg).slice(0, PAGE_ANNS_MAX);
        lines.push('那一页上的批注和讨论：');
        for (const a of items) {
            const who = a.ownerId === charId ? '你' : `[${nameOf(a.ownerId)}]`;
            lines.push(`${who} “${a.anchor.text}” → ${a.note}`);
            const th = threads.find((t) => t.anchorKey === keyOf(a));
            for (const m of (th?.messages ?? []).slice(-THREAD_LINES_MAX)) {
                const mine = m.role === 'char' && m.charId === charId;
                const said = m.role === 'user' ? nameOf('user') : nameOf(m.charId ?? '');
                lines.push(`　↳ ${mine ? '你' : said}：${m.content}`);
            }
        }
        // 新出现的那几句单列出来（可能落在没批注的段上，别漏）
        const freshLines = fresh.map((r) => lineOf(r, { withTime: true }));
        if (freshLines.length > 0) {
            lines.push('你上次读完之后新出现的：');
            for (const l of freshLines) lines.push(`　${l}`);
        }
        return lines.join('\n');
    };

    const later = [...byPage.values()]
        .sort((x, y) => y.pg.at.localeCompare(x.pg.at))                       // 最近读过的那几页在前
        .slice(0, FEED_LATER_MAX)
        .sort((x, y) => x.pg.chapterIdx - y.pg.chapterIdx || x.pg.page - y.pg.page)
        .map(({ pg, rows: fresh }) => pageBlock(pg, fresh));

    const followUps = elsewhere.slice(-ELSEWHERE_MAX).map((r) => lineOf(r, { withTime: true }));

    return { notes, later, followUps };
}

/** 历史阅读摘要最多给几条（她 09-26：读最近十条） */
export const FEED_SUMMARY_MAX = 10;

/**
 * 阅读上下文里的另外两块（她 09-25 文档、09-26 定的拼接顺序）：
 *   · **历史阅读摘要**：最近十条（每满 10 条活动记录揉一条那条 + 讨论归档那条，按时间混排）
 *   · **最近的讨论记录**：活跃窗口最近 15 条（15 条以外的已经归档进摘要了，不重复塞）
 */
export async function gatherReaderWindow(opts: {
    charId: string;
    bookId: string;
    chapterIdx: number;
    nameOf: (ownerId: string) => string;
}): Promise<{ summaries: string[]; discussion: string[] }> {
    const [anns, threads] = await Promise.all([
        listAnnotations(opts.bookId).catch(() => [] as RdAnnotation[]),
        listThreads(opts.bookId).catch(() => [] as RdThread[]),
    ]);
    const rows = buildTimeline({
        anns, threads, viewer: opts.charId, nameOf: opts.nameOf, chapterFallback: opts.chapterIdx,
    });
    return {
        summaries: recentMemos(opts.bookId, FEED_SUMMARY_MAX).map((r) => r.text),
        discussion: activeWindow(rows).map((r) => lineOf(r, { withTime: true })),
    };
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
        since: seenAt(opts.bookId, opts.charId),
        parasOf: (ci) => chapters.get(ci),
    });
}

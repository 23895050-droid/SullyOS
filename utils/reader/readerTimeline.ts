// 读书模块 · 阅读讨论记录（互动时间线）——她 09-25 的文档定稿
//
// 文档《阅读上下文与摘要规则说明》把「讨论记录」定义成：**阅读区里按实际发生时间排序的
// 互动时间线**，用来还原「先发生了什么、后来又讨论了什么」。所以这条线上有两种行：
//   · note  某人划了一句、写下批注
//   · reply 某人在某条批注下面接着说了一句
// 裁剪**只按这条线的顺序来**（文档原话：不要按原文笔记分组后再裁剪）。
// 三个节奏常量（文档里写死的）：活跃窗口 15 条；攒到 45 条归档较早的 30 条；
// 另有「每满 10 条活动记录汇总一次原文小总结 + 感受」——那条数的是**活动记录**，不是讨论记录。
//
// 纯函数，单测在 `readerTimeline.test.ts`。

import { canSee, type RdAnnotation, type RdThread } from './readerDb';
import { threadKeyOf } from './readerParticipants';

/** 一条讨论记录（批注 或 回复） */
export interface TimelineRow {
    /** 什么时候发生的（ISO） */
    at: string;
    kind: 'note' | 'reply';
    /** 'user' 或角色 id（旁白行是 'narrator'） */
    ownerId: string;
    /** 念出来的名字 */
    who: string;
    chapterIdx: number;
    /** 锚点落在章内第几段（归到「第几页」要用它） */
    para: number;
    /** 划的那句话 / 被回复的那句话 */
    quote: string;
    /** 批注正文 / 回复正文 */
    text: string;
    /** 挂在哪个讨论键上（note 行的键就是它自己那条批注） */
    key: string;
}

/** 活跃窗口：最近这么多条留在阅读上下文里（她 09-25 文档：15） */
export const ACTIVE_WINDOW = 15;
/** 可总结的讨论记录攒到这么多条就归档一次（文档：45 = 留下的 15 + 归档的 30） */
export const ARCHIVE_TRIGGER = 45;
/** 归档一次吃掉**较早的**这么多条（文档：30） */
export const ARCHIVE_TAKE = 30;
/**
 * 每满这么多条**活动记录**（他的一次调用算一条）汇总一次「原文小总结 + 阅读感受」。
 * 她 09-25 说的用途：让模型记得自己读过什么、有过什么感受，不至于每次读新内容都对
 * 之前读过的一无所知，也不至于每次都把感受和原文摘要全读一遍。
 */
export const CONTENT_TRIGGER = 10;

/** `HH:MM`（时间线上一行前面那个戳） */
export function clockOf(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * 把批注和讨论消息摆成一条时间线（同一本书的数据进来，时间序出去）。
 * **他看不见的（别人 self 档的批注）不进这条线**——视角是必填的。
 */
export function buildTimeline(opts: {
    anns: RdAnnotation[];
    threads: RdThread[];
    /** 谁的视角（'user' 或角色 id） */
    viewer: string;
    /** 批注没写章号时按它算 */
    chapterFallback?: number;
    nameOf: (ownerId: string) => string;
}): TimelineRow[] {
    const { anns, threads, viewer, nameOf } = opts;
    const fallback = opts.chapterFallback ?? 0;
    const rows: TimelineRow[] = [];

    for (const a of anns) {
        if (a.kind === 'bookmark' || !a.note) continue;
        if (!canSee(a, viewer)) continue;
        const chapterIdx = a.chapterIdx ?? fallback;
        rows.push({
            at: a.createdAt,
            kind: 'note',
            ownerId: a.ownerId,
            who: nameOf(a.ownerId),
            chapterIdx,
            para: a.anchor.startPara,
            quote: a.anchor.text,
            text: a.note,
            key: threadKeyOf(chapterIdx, a.anchor, a.ownerId),
        });
    }

    for (const t of threads) {
        for (const m of t.messages) {
            // 保鲜小结是系统写的，不是「谁说了什么」，不进这条线
            if (m.kind !== 'chat') continue;
            const ownerId = m.role === 'user' ? 'user' : m.role === 'char' ? (m.charId ?? 'unknown') : 'narrator';
            rows.push({
                at: m.createdAt,
                kind: 'reply',
                ownerId,
                who: ownerId === 'narrator' ? '旁白' : nameOf(ownerId),
                chapterIdx: t.chapterIdx ?? fallback,
                para: t.anchor.startPara,
                quote: t.anchor.text,
                text: m.content,
                key: t.anchorKey,
            });
        }
    }

    return rows.sort((x, y) => x.at.localeCompare(y.at));
}

/**
 * 喂给模型的活跃窗口：那条线**最后 15 条**。
 * 裁剪按整条线的顺序（不按笔记分组），归档过的老记录本来就不在里面。
 */
export function activeWindow(rows: TimelineRow[], limit = ACTIVE_WINDOW): TimelineRow[] {
    return rows.slice(-Math.max(1, limit));
}

/** 水位线之后还没归档的那些（水位线是「上次归档到什么时候」） */
export function pendingRows(rows: TimelineRow[], since?: string | null): TimelineRow[] {
    if (!since) return rows;
    return rows.filter((r) => r.at > since);
}

/** 该归档了吗（文档：可总结的讨论记录达到 45 条） */
export function planDiscussArchive(pending: number): boolean {
    return pending >= ARCHIVE_TRIGGER;
}

/** 归档一次吃几条（文档：较早的 30 条；不够 30 就全吃） */
export function discussTake(pending: number): number {
    return Math.min(Math.max(0, pending), ARCHIVE_TAKE);
}

/** 该汇总「原文小总结 + 感受」了吗（文档：每满 10 条活动记录） */
export function planContentSummary(pending: number): boolean {
    return pending >= CONTENT_TRIGGER;
}

/**
 * 这条记录怎么念给模型听（活跃窗口和讨论摘要的输入都用它）。
 * `withTime` 打开就带上「HH:MM」——给模型看时间线时带，喂给摘要模型时不用。
 */
export function lineOf(row: TimelineRow, opts: { withTime?: boolean } = {}): string {
    const stamp = opts.withTime ? `${clockOf(row.at)} ` : '';
    const quote = row.quote.replace(/\s+/g, ' ').trim();
    const text = row.text.replace(/\s+/g, ' ').trim();
    return row.kind === 'note'
        ? `[${stamp}${row.who}] 划了「${quote}」，写下：${text}`
        : `[${stamp}${row.who}] 在「${quote}」那条下面说：${text}`;
}

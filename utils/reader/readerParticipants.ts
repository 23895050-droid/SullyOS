// 读书模块 · 「谁参与了这一段 / 这一句」（纯函数，2026-09-15）
//
// 色条（段落侧面的色柱）和讨论面板的两侧箭头都问同一个问题：这段里有人动过吗、都有谁、谁先来的。
// 答案全部从已有的 rd_annotations + rd_threads 现算——不另存一份索引，就不会有索引失同步的事。
//
// 两个口径：
//   · 段落参与者 = 覆盖了这一段的所有标注（书签不算）+ 挂在这一段上的讨论发言
//   · 同句       = 锚点键一模一样，或者两段选区重叠过半（她在同一句话上划了两次长短不一的线）
//
// 纯函数，测试见 utils/reader/readerParticipants.test.ts。

import type { RdAnchor, RdAnnotation, RdOwnerId, RdThread, RdThreadMsg } from './readerDb';
import { anchorKeyOf } from './readerDb';

export interface RdParticipant {
    ownerId: RdOwnerId;
    /** 这个人在这段/这句上最早一次动作的时间（色条排序、箭头排序都用它） */
    firstAt: string;
    /** 划了几条 + 说了几句（表面数字，面板上要显示） */
    annotationCount: number;
    messageCount: number;
}

/**
 * 线程键 = 章号 + 锚点键 + **这条批注是谁的**。
 *
 * 讨论跟着批注走（她 09-16 定的）：同一句上你一条他一条，是**两条批注、两条讨论**，
 * 互不相通——任何人对某一条批注的回复，只进那一条批注的讨论。
 * （之前只按锚点建键，两个人的批注共用一条流水，她一眼就看出来了。）
 *
 * **锚点里的段号是章内段号**（阅读页的 data-para-idx 就是它），所以单用 anchorKeyOf
 * 会让两章里「同一段同一偏移」的两条线共用一条线程——键里带上章号才是唯一的那条线。
 */
export const threadKeyOf = (chapterIdx: number, anchor: RdAnchor, ownerId: RdOwnerId): string =>
    `${chapterIdx}|${anchorKeyOf(anchor)}|${ownerId}`;

/** 把「段号 + 段内偏移」压成一个可比的标量：段落之间留出足够长的段内空间。 */
const PARA_SPAN = 1_000_000;
const scalar = (paraIdx: number, offset: number): number => paraIdx * PARA_SPAN + offset;

function spanOf(anchor: RdAnchor): { from: number; to: number } {
    return {
        from: scalar(anchor.startPara, anchor.startOffset),
        to: scalar(anchor.endPara, anchor.endOffset),
    };
}

/**
 * 两条标注是不是「同一句」。
 * 锚点键相等一定算；否则看重叠——交集长度 ÷ 较短那条的长度 ≥ 0.5 就算同一句。
 * 零长度选区（不该出现，防一手）永不判同。
 */
export function isSameSentence(a: RdAnchor, b: RdAnchor): boolean {
    if (anchorKeyOf(a) === anchorKeyOf(b)) return true;
    const sa = spanOf(a);
    const sb = spanOf(b);
    const overlap = Math.min(sa.to, sb.to) - Math.max(sa.from, sb.from);
    if (overlap <= 0) return false;
    const shorter = Math.min(sa.to - sa.from, sb.to - sb.from);
    if (shorter <= 0) return false;
    return overlap / shorter >= 0.5;
}

/** 一句话是谁说的（system 不算人，返回 null）。 */
function actorOf(msg: RdThreadMsg): RdOwnerId | null {
    if (msg.role === 'user') return 'user';
    if (msg.role === 'char') return msg.charId ?? null;
    return null;
}

/** 把「谁、什么时候、几条几条」攒成一行——两条来源（标注 / 发言）共用的汇总器。 */
class Tally {
    private map = new Map<RdOwnerId, RdParticipant>();

    add(ownerId: RdOwnerId, at: string, kind: 'annotation' | 'message'): void {
        const row = this.map.get(ownerId);
        if (!row) {
            this.map.set(ownerId, {
                ownerId,
                firstAt: at,
                annotationCount: kind === 'annotation' ? 1 : 0,
                messageCount: kind === 'message' ? 1 : 0,
            });
            return;
        }
        if (at < row.firstAt) row.firstAt = at;
        if (kind === 'annotation') row.annotationCount += 1;
        else row.messageCount += 1;
    }

    /** 按「谁先来的」排——色条从上到下就是这个顺序。 */
    list(): RdParticipant[] {
        return [...this.map.values()].sort((a, b) => a.firstAt.localeCompare(b.firstAt));
    }
}

const coversPara = (anchor: RdAnchor, paraIdx: number): boolean =>
    anchor.startPara <= paraIdx && anchor.endPara >= paraIdx;

/** 标注算不算「参与」：书签是阅读位置的记号，不是在这段里留下的东西。 */
const countedAnnotation = (a: RdAnnotation): boolean => a.kind !== 'bookmark';

/**
 * 这一段里都有谁动过（色条用）。返回顺序 = 参与时间先后。
 */
export function participantsOfParagraph(
    annotations: RdAnnotation[],
    threads: RdThread[],
    paraIdx: number,
): RdParticipant[] {
    const tally = new Tally();

    for (const a of annotations) {
        if (!countedAnnotation(a)) continue;
        if (!coversPara(a.anchor, paraIdx)) continue;
        tally.add(a.ownerId, a.createdAt, 'annotation');
    }

    for (const t of threads) {
        if (!coversPara(t.anchor, paraIdx)) continue;
        for (const msg of t.messages) {
            const who = actorOf(msg);
            if (who) tally.add(who, msg.createdAt, 'message');
        }
    }

    return tally.list();
}

/**
 * 这一句上都有谁（讨论面板的两侧箭头用）。
 * 同句判定走 isSameSentence——她长短划两次也认。
 */
export function participantsOfSentence(
    annotations: RdAnnotation[],
    threads: RdThread[],
    anchor: RdAnchor,
): RdParticipant[] {
    const tally = new Tally();

    for (const a of annotations) {
        if (!countedAnnotation(a)) continue;
        if (!isSameSentence(a.anchor, anchor)) continue;
        tally.add(a.ownerId, a.createdAt, 'annotation');
    }

    for (const t of threads) {
        if (!isSameSentence(t.anchor, anchor)) continue;
        for (const msg of t.messages) {
            const who = actorOf(msg);
            if (who) tally.add(who, msg.createdAt, 'message');
        }
    }

    return tally.list();
}

/**
 * 这一段里每个人最近一次动作的时间（色条「有新动静」的亮暗、笔记页排序都要）。
 * 段落 → 该段所有参与者里最晚的那个时间。
 */
export function latestActivityAt(annotations: RdAnnotation[], threads: RdThread[], paraIdx: number): string | null {
    let latest: string | null = null;
    for (const a of annotations) {
        if (!countedAnnotation(a)) continue;
        if (!coversPara(a.anchor, paraIdx)) continue;
        if (a.createdAt > (latest ?? '')) latest = a.createdAt;
    }
    for (const t of threads) {
        if (!coversPara(t.anchor, paraIdx)) continue;
        for (const msg of t.messages) {
            if (msg.createdAt > (latest ?? '')) latest = msg.createdAt;
        }
    }
    return latest;
}

/** 整本书里最新一次互动的时间（笔记页「最近有人互动」排书用）。 */
export function latestActivityOfBook(annotations: RdAnnotation[], threads: RdThread[]): string | null {
    let latest: string | null = null;
    for (const a of annotations) {
        if (!countedAnnotation(a)) continue;
        if (a.createdAt > (latest ?? '')) latest = a.createdAt;
    }
    for (const t of threads) {
        for (const msg of t.messages) {
            if (msg.createdAt > (latest ?? '')) latest = msg.createdAt;
        }
    }
    return latest;
}

// 读书模块 · 共读归档（2026-09-16，09-20 扩成三维规则 + 多角色）
//
// 她 09-20 把规则拆成**两个维度**（面板上是三枚胶囊 = 自动 / 手动 / 自定义）：
//   · 口径 metric：拿什么推水位线——讨论句数（默认）/ 笔记条数 / 读了多少页
//   · 时机 timing：总结完什么时候进聊天——auto 立刻同步 / manual 结束时整段送
// 水位线是同一条：攒到 threshold 就总结，**最新那条留着做衔接**；没攒够就点结束 →
// 把水位线以下剩下的全补总结。
//
// **总结模型只读事儿**（她 09-16 钉死）：喂进去的是 ① 大家这段时间读到了什么（活动记录，
// 含当时写下的内心活动）② 这段时间说了什么（讨论流水）。不读角色人设、不读用户设定。
// 多人一起读时，**一份摘要写几个人的事**，同步进各自聊天的是同一段内容，
// 但活动记录各归各的（她 09-20 的原话）。
//
// 活儿是普通 Promise：组件卸载、面板收起、退回书架都不打断（她 09-16：要能后台进行）；
// 进度写在 readerJobs 的胶囊上。

import type { CharacterProfile, UserProfile } from '../../types';
import { DB } from '../../utils/db';
import {
    appendRoamActivity, listAnnotations, listRoamActivities, listThreads, newRoamGroup, rdId,
    type RdBook, type RdRoamActivity,
} from '../../utils/reader/readerDb';
import { summarizeCoReadRange, type ReaderCallRuntime } from '../../utils/reader/readerChat';
import { appendCoReadSummary, getCoReadStore, type CoReadPos, type CoReadRule } from './coreadStore';
import { beginJob, endJob } from './readerJobs';

export interface ArchiveCtx {
    book: RdBook;
    /** 一起读的人（一个或多个） */
    chars: CharacterProfile[];
    user: UserProfile;
    /** 当前这一章（兜底正文切它） */
    chapterIdx: number;
    chapterParas: string[];
    /** 现在读到这一章的哪一段（水位线的落点显示用） */
    pageTo: number;
    /** 讨论流水的作者名（ownerId → 名字） */
    nameOf: (ownerId: string) => string;
    /** 摘要槽的解析结果；**null = 没配，这一趟就不跑**（她 09-20：摘要 api 没配置不回退） */
    api: ReaderCallRuntime | null;
}

export interface ArchiveResult {
    /** 这一趟真的总结了没有 */
    ran: boolean;
    /** 这次吃掉了几条讨论 */
    took: number;
    /** 总结出来的那段（没跑就是空串） */
    text: string;
    /** 为什么没跑（没配 API / 没攒够 / 没东西可总结） */
    reason?: 'no-api' | 'below-trigger' | 'nothing';
}

/**
 * 这一趟该不该总结（纯函数，单测盯着）。
 * 口径只决定**什么时候**推水位线；`force`（共读结束）时无条件跑，
 * 把水位线以下剩下的全补上。
 */
export function planArchive(opts: { pending: number; threshold: number; force: boolean }): boolean {
    if (opts.force) return true;
    return opts.pending >= Math.max(1, opts.threshold);
}

/**
 * 一次总结吃几条讨论（纯函数，单测盯着）。
 * **最新那条留着做衔接**——她 09-16 的原话「讨论到 31 条总结前 30 条」，
 * 阈值 31 时正好吃 30。force（共读结束）时全吃。
 */
export function archiveTake(opts: { pendingMsgs: number; force: boolean }): number {
    if (opts.pendingMsgs <= 0) return 0;
    if (opts.force) return opts.pendingMsgs;
    return Math.max(1, opts.pendingMsgs - 1);
}

/**
 * 这本书的讨论流水（时间序）——水位线数的是它。
 *
 * **`since` 之前的一律不算**（她 09-21）：这本书的讨论是**一本书一条河**，从第一次读就有；
 * 水位线却从 0 起数，不切时间的话，新开一场共读会把**以前**的话（她自己读书时说的、
 * 上一个会话的旧账）当成「这段时间说的」总结进去——她看到的「把之前非共读的批注
 * 也算进共读的总结」就是这个。传会话开始时间就干净了。
 */
export async function collectDiscussion(
    bookId: string,
    nameOf: (ownerId: string) => string,
    since?: string,
): Promise<Array<{ who: string; text: string; at: string }>> {
    const threads = await listThreads(bookId);
    const rows: Array<{ who: string; text: string; at: string }> = [];
    for (const t of threads) {
        for (const m of t.messages) {
            if (since && m.createdAt <= since) continue;
            const who = m.role === 'user' ? 'user' : (m.role === 'char' ? (m.charId ?? null) : null);
            rows.push({ who: who ? nameOf(who) : '旁白', text: m.content, at: m.createdAt });
        }
    }
    rows.sort((a, b) => a.at.localeCompare(b.at));
    return rows;
}

/**
 * 这段时间里大家读到了什么（参与共读的每个人各自的调用都算），时间序。
 * **只认这场共读读出来的**（`mode === 'coread'`，她 09-21）：他自己单独读书、
 * 翻笔记那些不算「我们一起读到的」。
 */
async function activitiesSince(ctx: ArchiveCtx, since: string): Promise<RdRoamActivity[]> {
    const groups = await Promise.all(
        ctx.chars.map((c) => listRoamActivities(c.id, 200).catch(() => [] as RdRoamActivity[])),
    );
    return groups
        .flat()
        .filter((a) => a.bookId === ctx.book.id && a.createdAt > since && a.kind !== 'summary'
            && a.mode === 'coread')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** 口径是「笔记条数」时，这段时间留下了几条笔记（谁留的都算）。 */
async function notesSince(ctx: ArchiveCtx, since: string): Promise<number> {
    const anns = await listAnnotations(ctx.book.id).catch(() => []);
    return anns.filter((a) => a.kind !== 'bookmark' && a.createdAt > since).length;
}

/**
 * 跑一次归档。`force=true` 时**不管攒没攒够**，把水位线以下剩下的全总结掉（共读结束走它）。
 * 自己管胶囊（跑起来才开，跑完标成功/失败）——攒不够就静悄悄什么都不做。
 */
export async function runArchive(ctx: ArchiveCtx, opts: { force: boolean }): Promise<ArchiveResult> {
    const s = getCoReadStore();
    const cur = s.session;
    if (!cur || cur.bookId !== ctx.book.id || ctx.chars.length === 0) {
        return { ran: false, took: 0, text: '', reason: 'nothing' };
    }
    if (!ctx.api) return { ran: false, took: 0, text: '', reason: 'no-api' };

    const since = cur.summarizedAt ?? cur.startedAt;
    // 只数**这场共读开始之后**说的话（她 09-21：以前的旧账不算这次的）
    const all = await collectDiscussion(ctx.book.id, ctx.nameOf, cur.startedAt);
    const pendingMsgs = Math.max(0, all.length - cur.summarizedMsgs);
    const activities = await activitiesSince(ctx, since);

    // 口径（她 09-20）：拿什么数推水位线
    const pending = cur.rule.metric === 'msgs' ? pendingMsgs
        : cur.rule.metric === 'notes' ? await notesSince(ctx, since)
            : activities.reduce((n, a) => n + (a.pages ?? 0), 0);

    if (!planArchive({ pending, threshold: cur.rule.threshold, force: opts.force })) {
        return { ran: false, took: 0, text: '', reason: 'below-trigger' };
    }

    const take = archiveTake({ pendingMsgs, force: opts.force });
    const batch = all.slice(cur.summarizedMsgs, cur.summarizedMsgs + take);
    if (batch.length === 0 && activities.length === 0) {
        return { ran: false, took: 0, text: '', reason: 'nothing' };
    }

    const to: CoReadPos = { chapterIdx: ctx.chapterIdx, paraIdx: ctx.pageTo };
    const from = cur.summarizedTo;
    const startPara = from && from.chapterIdx === ctx.chapterIdx ? from.paraIdx + 1 : 0;
    const excerpt = ctx.chapterParas.slice(startPara, ctx.pageTo + 1).join('\n').slice(0, 800);

    const job = beginJob({
        kind: 'summary',
        charName: ctx.chars.map((c) => c.name).join('、'),
        bookTitle: ctx.book.title,
        message: '这段一起读的，正在整理成一条记录…',
    });
    try {
        const text = await summarizeCoReadRange({
            chars: ctx.chars, user: ctx.user, book: ctx.book,
            from, to,
            activities: activities.map((a) => ({ summary: a.summary, feeling: a.feeling })),
            lines: batch.map(({ who, text: t }) => ({ who, text: t })),
            excerpt,
            previous: s.summaries.slice(-3).map((x) => x.text),
            startedAt: cur.startedAt,
            api: ctx.api,
        });

        // 摘要本身就是一条活动记录（kind:'summary'）——挂在**这段里最后一次活动**的 group 下，
        // 这样点开那条活动就能看到「里面每条调用 + 这次的摘要」（她 09-20 的口径）。
        const anchorAct = activities[activities.length - 1];
        await appendRoamActivity({
            id: rdId('rr'),
            charId: anchorAct?.charId ?? ctx.chars[0].id,
            bookId: ctx.book.id,
            kind: 'summary',
            group: anchorAct?.group ?? newRoamGroup(),
            seq: (anchorAct?.seq ?? -1) + 1,
            summary: `记录了这段一起读的（${take} 条讨论）`,
            excerpt: text.slice(0, 300),
            mode: 'coread',
            createdAt: new Date().toISOString(),
        });

        appendCoReadSummary(from ?? { chapterIdx: ctx.chapterIdx, paraIdx: -1 }, to, text, take);

        // 自动归档：**每个人的聊天里都放同一段摘要**（活动记录还是各归各的）
        if (cur.rule.timing === 'auto') {
            for (const c of ctx.chars) {
                await DB.saveMessage({
                    charId: c.id,
                    role: 'system',
                    type: 'text',
                    content: `[共读：${ctx.book.title}] ${text}`,
                    metadata: {
                        source: 'reader_coread',
                        coread: { bookId: ctx.book.id, title: ctx.book.title, charId: c.id, archived: take },
                    },
                });
            }
        }

        endJob(job, 'ok', cur.rule.timing === 'auto'
            ? `总结好了，已同步进聊天（${take} 条讨论）`
            : `总结好了（${take} 条讨论，结束共读时一起进聊天）`);
        return { ran: true, took: take, text };
    } catch (err) {
        endJob(job, 'error', `总结失败：${err instanceof Error ? err.message : '未知错误'}`);
        return { ran: false, took: 0, text: '' };
    }
}

/**
 * 补摘（她 09-20：摘要失败的入口放在**活动记录详细页的摘要记录那行**）。
 * 上一次没摘成，水位线没动过，所以补摘就是把水位线以下没总结的部分补上——
 * 就是一次 `force` 的跑法，跑完该进聊天还照规则进（自动归档立刻同步，手动归档攒着）。
 */
export async function retryArchive(ctx: ArchiveCtx): Promise<ArchiveResult> {
    return runArchive(ctx, { force: true });
}

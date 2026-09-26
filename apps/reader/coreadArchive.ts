// 读书模块 · 书房归档（2026-09-16 起；09-26 照她的《阅读上下文与摘要规则说明》重排）
//
// 她 09-25 的文档把摘要分成**两类**，各有一把尺子（都在 utils/reader/readerTimeline）：
//   · **内容汇总**（kind:'content'）：每满 10 条**活动记录**（他一次调用一条），把这批里
//     每次读完留下的「原文小总结 + 感受」揉成一条轻的——她 09-26 说这条的用处是让模型
//     记得自己读过什么、有过什么感受，不至于每次读新内容都对之前读到的一无所知。
//   · **讨论摘要**（kind:'discuss'）：讨论记录（批注 + 回复，按发生时间排）满 45 条时，
//     把**较早的 30 条**归档成一条，活跃窗口留最近 15 条（那 15 条留在阅读上下文里）。
//
// 两条水位线都**按书**存（`reader_context_v1`）：讨论记录是一本书一条河，跨会话接着数。
// 摘要进阅读上下文当背景（他下次读书看得见），也按面板上的时机开关同步进聊天：
//   · 自动归档：这一趟新写出来的摘要**立刻**进聊天
//   · 手动归档：先攒着，点「共读结束」时整段送（范围 / 时长 / 人数由我们拼在抬头，不指望模型写）
//
// 活儿是普通 Promise：组件卸载、面板收起、退回书架都不打断（她 09-16：要能后台进行）；
// 进度写在 readerJobs 的胶囊上。

import type { CharacterProfile, UserProfile } from '../../types';
import { DB } from '../../utils/db';
import {
    appendRoamActivity, listAnnotations, listRoamActivities, listThreads, newRoamGroup, rdId,
    type RdAnnotation, type RdBook, type RdRoamActivity, type RdThread,
} from '../../utils/reader/readerDb';
import {
    buildTimeline, discussTake, lineOf, pendingRows, planContentSummary, planDiscussArchive,
    type TimelineRow,
} from '../../utils/reader/readerTimeline';
import { summarizeContentFlow, summarizeDiscussionRange, type ReaderCallRuntime } from '../../utils/reader/readerChat';
import { appendCoReadSummary, getCoReadStore, type CoReadPos } from './coreadStore';
import { appendMemo, bookContext, recentMemoTexts, setContentAt, setDiscussAt } from './readerContextStore';
import { beginJob, endJob } from './readerJobs';

/** 一次内容汇总最多吃掉多少条活动记录（多了就分几趟，剩下的下次再汇总） */
export const CONTENT_TAKE = 30;

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
    /** 总结出来的（两类拼在一起；没跑就是空串） */
    text: string;
    /** 为什么没跑（没配 API / 没攒够 / 没东西可总结） */
    reason?: 'no-api' | 'below-trigger' | 'nothing';
}

/**
 * 这本书的**讨论记录**（时间序）——摘要数的是它。
 *
 * 摘要会同步进每个人的聊天，所以**只拿公开的**：别人设成「只给自己看」的批注不掺进来。
 * （她 09-26：讨论记录按时间排序，裁剪也按这条线的顺序，不按原文笔记分组。）
 */
async function discussionRows(ctx: ArchiveCtx): Promise<TimelineRow[]> {
    const [anns, threads] = await Promise.all([
        listAnnotations(ctx.book.id).catch(() => [] as RdAnnotation[]),
        listThreads(ctx.book.id).catch(() => [] as RdThread[]),
    ]);
    const shared = anns.filter((a) => (a.visibility ?? 'public') === 'public');
    return buildTimeline({
        anns: shared, threads, viewer: 'user', nameOf: ctx.nameOf, chapterFallback: ctx.chapterIdx,
    });
}

/** 水位线之后的活动记录（他这一批读了什么；summary 那条本身不算）。 */
async function activitiesPending(ctx: ArchiveCtx, since: string | null): Promise<RdRoamActivity[]> {
    const groups = await Promise.all(
        ctx.chars.map((c) => listRoamActivities(c.id, 200).catch(() => [] as RdRoamActivity[])),
    );
    return groups
        .flat()
        .filter((a) => a.bookId === ctx.book.id && a.kind !== 'summary' && !(since && a.createdAt <= since))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * 这一段的范围（**只给会话记录用**，不进摘要、也不进聊天）。
 *
 * 用的是这批活动记录真正跨过的范围：起点 = 时间序第一条读到哪，终点 = 这批里**到过的最远位置**
 * （往回翻不算新进度——她 09-26 报的「从 39 页读到 36 页」就是这么来的）。
 * 没有活动记录时退回上一次总结的落点。
 */
function spanOfActivities(acts: RdRoamActivity[], fallback: CoReadPos | null): { from: CoReadPos | null; to: CoReadPos | null } {
    if (acts.length === 0) return { from: fallback, to: null };
    const first = acts[0];
    const from: CoReadPos = { chapterIdx: first.chapterIdx ?? 0, paraIdx: first.fromPara ?? 0 };
    let to: CoReadPos = { chapterIdx: first.chapterIdx ?? 0, paraIdx: first.toPara ?? 0 };
    for (const a of acts) {
        const ci = a.chapterIdx ?? 0;
        const pi = a.toPara ?? 0;
        if (ci > to.chapterIdx || (ci === to.chapterIdx && pi > to.paraIdx)) to = { chapterIdx: ci, paraIdx: pi };
    }
    return { from, to };
}

/**
 * 跑一次归档。`force=true`（共读结束）时**不管攒没攒够**，把水位线以下剩下的全总结掉。
 * 自己管胶囊（跑起来才开，跑完标成功/失败）——攒不够就静悄悄什么都不做。
 */
export async function runArchive(ctx: ArchiveCtx, opts: { force: boolean }): Promise<ArchiveResult> {
    const s = getCoReadStore();
    const cur = s.session;
    if (!cur || cur.bookId !== ctx.book.id || ctx.chars.length === 0) {
        return { ran: false, took: 0, text: '', reason: 'nothing' };
    }
    if (!ctx.api) return { ran: false, took: 0, text: '', reason: 'no-api' };

    const bk = bookContext(ctx.book.id);
    const rows = await discussionRows(ctx);
    const pendingDisc = pendingRows(rows, bk.discussAt);
    const acts = await activitiesPending(ctx, bk.contentAt);

    const wantContent = planContentSummary(acts.length);
    const wantDiscuss = opts.force ? pendingDisc.length > 0 : planDiscussArchive(pendingDisc.length);
    if (!wantContent && !wantDiscuss) {
        return {
            ran: false, took: 0, text: '',
            reason: acts.length === 0 && pendingDisc.length === 0 ? 'nothing' : 'below-trigger',
        };
    }

    const span = spanOfActivities(acts, cur.summarizedTo);
    const job = beginJob({
        kind: 'summary',
        charName: ctx.chars.map((c) => c.name).join('、'),
        bookTitle: ctx.book.title,
        message: '这段一起读的，正在整理成一条记录…',
    });

    const texts: string[] = [];
    let took = 0;
    let didContent = false;
    try {
        // ① 内容汇总：原文小总结 + 感受（每满 10 条活动记录一次）
        if (wantContent) {
            const use = acts.slice(0, Math.min(acts.length, CONTENT_TAKE));
            const text = await summarizeContentFlow({
                chars: ctx.chars, book: ctx.book,
                events: use.map((a) => ({ summary: a.summary, excerpt: a.excerpt, feeling: a.feeling })),
                previous: recentMemoTexts(ctx.book.id, 'content'),
                api: ctx.api,
            });
            if (text) {
                appendMemo(ctx.book.id, { kind: 'content', text, covers: use.length });
                setContentAt(ctx.book.id, use[use.length - 1].createdAt);
                texts.push(text);
                didContent = true;
            }
        }

        // ② 讨论摘要：讨论记录满 45 条 → 归档较早的 30 条（结束时把剩下的全归档）
        if (wantDiscuss) {
            const take = opts.force ? pendingDisc.length : discussTake(pendingDisc.length);
            const batch = pendingDisc.slice(0, take);
            const text = await summarizeDiscussionRange({
                chars: ctx.chars, user: ctx.user, book: ctx.book,
                rows: batch.map((r) => lineOf(r)),
                previous: recentMemoTexts(ctx.book.id, 'discuss'),
                api: ctx.api,
            });
            if (text) {
                appendMemo(ctx.book.id, { kind: 'discuss', text, covers: batch.length });
                setDiscussAt(ctx.book.id, batch[batch.length - 1].at);
                took = batch.length;
                texts.push(text);

                // 摘要本身就是一条活动记录（kind:'summary'）——挂在**这段里最后一次活动**的 group 下，
                // 这样点开那条活动就能看到「里面每条调用 + 这次的摘要」（她 09-20 的口径）。
                const anchorAct = acts[acts.length - 1];
                const label = [didContent ? '记下了读到的和心里的' : '', `${batch.length} 条讨论`].filter(Boolean).join(' · ');
                await appendRoamActivity({
                    id: rdId('rr'),
                    charId: anchorAct?.charId ?? ctx.chars[0].id,
                    bookId: ctx.book.id,
                    kind: 'summary',
                    group: anchorAct?.group ?? newRoamGroup(),
                    seq: (anchorAct?.seq ?? -1) + 1,
                    summary: `整理了这段时间的读书记录（${label}）`,
                    excerpt: text.slice(0, 300),
                    mode: 'coread',
                    createdAt: new Date().toISOString(),
                });
            }
        }

        if (texts.length === 0) {
            endJob(job, 'error', '这一趟没写出东西');
            return { ran: false, took: 0, text: '', reason: 'nothing' };
        }

        // 会话自己那份记录（「共读结束」整段送进聊天时拼的就是它；from/to 是它的意义）
        appendCoReadSummary(
            span.from ?? { chapterIdx: ctx.chapterIdx, paraIdx: -1 },
            span.to ?? { chapterIdx: ctx.chapterIdx, paraIdx: ctx.pageTo },
            texts.join('\n\n'),
            took,
        );

        // 自动归档：**每个人的聊天里都放同一段摘要**（活动记录还是各归各的）。
        // 抬头只有书名——进度、时长、页数归「结束共读」那张结算卡（她 09-26）。
        if (cur.rule.timing === 'auto') {
            for (const c of ctx.chars) {
                await DB.saveMessage({
                    charId: c.id,
                    role: 'system',
                    type: 'text',
                    content: `[共读：${ctx.book.title}] ${texts.join('\n\n')}`,
                    metadata: {
                        source: 'reader_coread',
                        coread: { bookId: ctx.book.id, title: ctx.book.title, charId: c.id, archived: took },
                    },
                });
            }
        }

        endJob(job, 'ok', cur.rule.timing === 'auto'
            ? `整理好了，已同步进聊天${took ? `（${took} 条讨论）` : ''}`
            : `整理好了${took ? `（${took} 条讨论，结束共读时一起进聊天）` : '（结束共读时一起进聊天）'}`);
        return { ran: true, took, text: texts.join('\n\n') };
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

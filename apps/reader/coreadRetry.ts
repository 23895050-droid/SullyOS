// 读书模块 · 补摘（2026-09-21，T5）
//
// 她 09-20 定的：摘要槽**没配就不跑**（不回退），失败了也不拦着共读——
// 但得留个补的地方：「**补摘**」就挂在活动记录详细页的摘要那行上。
//
// 补摘 = 把水位线以下还没总结的部分补上（`coreadArchive.retryArchive` 的 force 跑法），
// 所以这里只干一件事：点的时候**现场把 ArchiveCtx 攒出来**——
// 补的时候人可能已经退出阅读页了，没有 ReaderCoRead 那边的闭包可用。

import type { APIConfig, CharacterProfile } from '../../types';
import { DB } from '../../utils/db';
import { getBook, getChapter, getProgress, type RdRoamActivity } from '../../utils/reader/readerDb';
import { resolveReadApi } from '../../utils/reader/readerChat';
import { coReadOf, getCoReadStore, readApiSlots } from './coreadStore';
import { retryArchive } from './coreadArchive';

export interface RetryOutcome {
    ok: boolean;
    /** 给用户看的一句话（成了是「补好了…」，没成是为什么） */
    message: string;
}

/**
 * 这一次活动该不该有摘要。共读里的活动才有「摘要」这回事——
 * 你自己读、角色自己读（T8）都不进这个流程。
 */
export function canRetrySummary(calls: RdRoamActivity[]): boolean {
    if (calls.some((a) => a.kind === 'summary')) return false;
    return calls.some((a) => a.mode === 'coread' && a.charId !== 'user');
}

/** 现场攒 ctx 补一次摘。成没成都给一句话，调用方拿去 notify / 写在弹卡里。 */
export async function retrySummaryFor(
    calls: RdRoamActivity[],
    apiConfig?: APIConfig,
): Promise<RetryOutcome> {
    const head = [...calls].reverse().find((a) => a.kind !== 'summary') ?? calls[calls.length - 1];
    if (!head) return { ok: false, message: '这条活动记录是空的' };

    const book = await getBook(head.bookId);
    if (!book) return { ok: false, message: '找不到这本书了' };

    // 水位线在会话里（总结过到第几条、上次读到哪）——共读结束后就没得补了
    const session = coReadOf(getCoReadStore(), book.id);
    if (!session) return { ok: false, message: '这本书的共读已经结束了，补不了。重新喊他一起读吧。' };

    const all = await DB.getAllCharacters();
    const chars = session.charIds
        .map((id) => (all || []).find((c) => c.id === id))
        .filter((c): c is CharacterProfile => !!c);
    if (chars.length === 0) return { ok: false, message: '读不到一起读的人' };

    const user = await DB.getUserProfile();
    if (!user) return { ok: false, message: '读不到你自己的设定' };

    const api = resolveReadApi('summary', null, readApiSlots(getCoReadStore()), apiConfig);
    if (!api) return { ok: false, message: '摘要模型还没配（在共读面板的设置里配一栏），配好了再来补。' };

    // 补的落点：他现在读到哪（拿不到就退回上次总结的位置）
    const prog = await getProgress(book.id, chars[0].id);
    const chapterIdx = prog?.chapterIdx ?? session.summarizedTo?.chapterIdx ?? 0;
    const chapter = await getChapter(book.id, chapterIdx);
    const nameOf = (ownerId: string): string => (
        ownerId === 'user'
            ? (user.name ?? 'Angel')
            : ((all || []).find((c) => c.id === ownerId)?.name ?? ownerId)
    );

    const res = await retryArchive({
        book, chars, user, chapterIdx,
        chapterParas: chapter?.paras ?? [],
        pageTo: prog?.paraIdx ?? session.summarizedTo?.paraIdx ?? 0,
        nameOf,
        api,
    });

    if (res.ran) return { ok: true, message: `补好了，摘了 ${res.took} 条讨论` };
    if (res.reason === 'nothing') return { ok: false, message: '这段里没有可总结的东西' };
    if (res.reason === 'no-api') return { ok: false, message: '摘要模型还没配' };
    if (res.reason === 'below-trigger') return { ok: false, message: '还没攒够，再读一会儿' };
    return { ok: false, message: '没摘成——看看摘要模型配好没有，或者稍后再试' };
}

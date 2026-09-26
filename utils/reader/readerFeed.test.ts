// 读书模块 · 摆给他的那几页（buildPageFeed 纯函数）
//
// 她 09-21 连着问了两轮「里面真的有我最近的批注吗」，09-25 的文档把「未读」的口径钉死成
// **他还没接收过的**（时间水位线），所以这份单测主要盯两件事：
//   · 她在「他上次读完之后」留的话，一定要出现在 later 里
//   · 他看过没接的，下一次不再重复催

import { describe, expect, it } from 'vitest';
import { buildPageFeed, FEED_LATER_MAX, FEED_READ_LOOKBACK } from './readerFeed';
import type { RdAnnotation, RdRoamActivity, RdThread } from './readerDb';
import type { RdAnchor } from './readerDb';
import { threadKeyOf } from './readerParticipants';

const iso = (m: number) => new Date(Date.UTC(2026, 8, 21, 10, m)).toISOString();

const anchor = (para: number, text: string): RdAnchor => ({
    startPara: para, startOffset: 0, endPara: para, endOffset: text.length, text,
});

let seq = 0;
const ann = (patch: Partial<RdAnnotation> & { ownerId: string; note?: string; chapterIdx?: number; para?: number }): RdAnnotation => {
    const para = patch.para ?? 0;
    const text = patch.anchor?.text ?? `第${para}段的原文`;
    seq += 1;
    return {
        id: patch.id ?? `an-${seq}`,
        bookId: 'b1',
        ownerId: patch.ownerId,
        anchor: patch.anchor ?? anchor(para, text),
        kind: patch.kind ?? 'note',
        visibility: patch.visibility,
        styleSlot: 1,
        note: patch.note,
        contentRev: 'rev',
        status: 'active',
        chapterIdx: patch.chapterIdx ?? 0,
        createdAt: patch.createdAt ?? iso(seq),
        updatedAt: iso(seq),
    };
};

const readRec = (patch: Partial<RdRoamActivity>): RdRoamActivity => ({
    id: patch.id ?? `rr-${Math.random().toString(36).slice(2, 8)}`,
    charId: patch.charId ?? 'A',
    bookId: patch.bookId ?? 'b1',
    kind: patch.kind ?? 'annotate',
    group: 'g1',
    seq: 0,
    mode: patch.mode ?? 'coread',
    summary: '读了',
    createdAt: patch.createdAt ?? iso(1),
    ...patch,
} as RdRoamActivity);

const thread = (patch: Partial<RdThread> & { anchorKey: string; messages: RdThread['messages'] }): RdThread => ({
    id: patch.id ?? `th-${patch.anchorKey}`,
    bookId: 'b1',
    anchor: patch.anchor ?? anchor(1, '第1段的原文'),
    anchorKey: patch.anchorKey,
    chapterIdx: 0,
    charIds: patch.charIds ?? ['A'],
    messages: patch.messages,
    createdAt: iso(1),
    updatedAt: iso(1),
});

const nameOf = (id: string) => (id === 'user' ? 'Angelica' : id === 'A' ? '阿一' : id === 'B' ? '小满' : id);

const base = {
    charId: 'A',
    bookId: 'b1',
    chapterIdx: 0,
    from: 10,
    to: 14,          // 他眼下读第 10–14 段
    reads: [] as RdRoamActivity[],
    threads: [] as RdThread[],
    nameOf,
};

describe('buildPageFeed · 他眼下这几页', () => {
    it('这几页上的批注都摆出来（谁的都摆，包括他自己划的）', () => {
        const feed = buildPageFeed({
            ...base,
            anns: [
                ann({ ownerId: 'user', para: 11, note: '她的话' }),
                ann({ ownerId: 'A', para: 12, note: '他自己的' }),
                ann({ ownerId: 'B', para: 9, note: '上一页的，不算' }),
            ],
        });
        expect(feed.notes).toHaveLength(2);
        expect(feed.notes[0]).toContain('Angelica');
        expect(feed.notes[1]).toContain('你');       // 他自己划的写成「你」
        expect(feed.later).toHaveLength(0);
    });

    it('他接过话的那条后面标一句', () => {
        const a = ann({ ownerId: 'user', para: 11, note: '她的话' });
        const feed = buildPageFeed({
            ...base,
            anns: [a],
            threads: [thread({
                anchorKey: threadKeyOf(0, a.anchor, 'user'),
                messages: [{ id: 'm1', role: 'char', charId: 'A', content: '接过了', kind: 'chat', createdAt: iso(2) }],
            })],
        });
        expect(feed.notes[0]).toContain('你已经接过话了');
    });
});

describe('buildPageFeed · 未读（她 09-25 文档：他还没接收过的）', () => {
    it('**她在他上次读完之后留的话，一定在里面**（她问了两轮的那件事）', () => {
        const feed = buildPageFeed({
            ...base,
            from: 20, to: 24,                       // 他眼下读到第 20–24 段了
            since: iso(5),                          // 上次读到 10:05
            reads: [readRec({ fromPara: 10, toPara: 14, createdAt: iso(5) })],
            anns: [ann({ ownerId: 'user', para: 12, note: '我读完了，留一句', createdAt: iso(6) })],
        });
        expect(feed.later).toHaveLength(1);
        expect(feed.later[0]).toContain('我读完了，留一句');
    });

    it('他上次读之前就有的话，不再催（看过了没接的也不重复摆）', () => {
        const feed = buildPageFeed({
            ...base,
            from: 20, to: 24,
            since: iso(6),                          // 上次读到 10:06
            reads: [readRec({ fromPara: 10, toPara: 14 })],
            anns: [ann({ ownerId: 'user', para: 12, note: '他上次已经看过这句了', createdAt: iso(5) })],
        });
        expect(feed.later).toHaveLength(0);
    });

    it('他自己划的不算未读（不用他回自己）', () => {
        const feed = buildPageFeed({
            ...base,
            from: 20, to: 24,
            since: iso(5),
            reads: [readRec({ fromPara: 10, toPara: 14 })],
            anns: [ann({ ownerId: 'A', para: 12, note: '他自己留的', createdAt: iso(6) })],
        });
        expect(feed.later).toHaveLength(0);
    });

    it('别人留的、他还没接收过的也算', () => {
        const feed = buildPageFeed({
            ...base,
            from: 20, to: 24,
            since: iso(5),
            reads: [readRec({ fromPara: 10, toPara: 14 })],
            anns: [ann({ ownerId: 'B', para: 13, note: '小满说的', createdAt: iso(6) })],
        });
        expect(feed.later).toHaveLength(1);
        expect(feed.later[0]).toContain('小满');
    });

    it('**她回了他划的线**，这条回复算未读（她 09-21 亲口要的）', () => {
        const his = ann({ ownerId: 'A', para: 12, note: '他划的', createdAt: iso(2) });
        const feed = buildPageFeed({
            ...base,
            from: 20, to: 24,
            since: iso(5),
            reads: [readRec({ fromPara: 10, toPara: 14 })],
            anns: [his],
            threads: [thread({
                anchorKey: threadKeyOf(0, his.anchor, 'A'),
                anchor: his.anchor,
                messages: [{ id: 'm1', role: 'user', content: '我回了他划的这句', kind: 'chat', createdAt: iso(6) }],
            })],
        });
        expect(feed.later).toHaveLength(1);
        expect(feed.later[0]).toContain('我回了他划的这句');
    });

    it('他读过太久以前的那几页不算（只往前看最近几次）', () => {
        // 老的读书记录排在前面，最新的 FEED_READ_LOOKBACK 条已经不含第 10–14 段
        const old = readRec({ fromPara: 10, toPara: 14, createdAt: iso(1) });
        const newer = Array.from({ length: FEED_READ_LOOKBACK }, (_, i) =>
            readRec({ fromPara: 30 + i * 5, toPara: 34 + i * 5, createdAt: iso(20 + i) }));
        const feed = buildPageFeed({
            ...base,
            from: 80, to: 84,
            since: iso(18),
            reads: [old, ...newer],
            anns: [ann({ ownerId: 'user', para: 12, note: '很久以前那页上的', createdAt: iso(19) })],
        });
        expect(feed.later).toHaveLength(0);
        expect(feed.followUps).toHaveLength(1);      // 还是会告诉他一声（别处新出现的）
    });

    it('上一章读过的也认（章号对上才算，段号相同不串章）', () => {
        const feed = buildPageFeed({
            ...base,
            chapterIdx: 1,
            from: 20, to: 24,
            since: iso(5),
            reads: [readRec({ chapterIdx: 0, fromPara: 10, toPara: 14 })],
            anns: [
                ann({ ownerId: 'user', chapterIdx: 0, para: 12, note: '上一章她留的', createdAt: iso(6) }),
                ann({ ownerId: 'user', chapterIdx: 3, para: 12, note: '别的章、段号撞上了', createdAt: iso(7) }),
            ],
        });
        expect(feed.later).toHaveLength(1);
        expect(feed.later[0]).toContain('上一章她留的');
        expect(feed.followUps).toHaveLength(1);      // 别的章那条列一行
    });

    it('最多摆 FEED_LATER_MAX 页（一页一块，不是一条一块）', () => {
        // 每页 5 段（perPage=5），他读了 6 页（第 1–6 页 = 第 10–39 段），每页都有一条没接的话
        const feed = buildPageFeed({
            ...base,
            from: 90, to: 94,
            since: iso(0),
            reads: [readRec({ fromPara: 10, toPara: 39, perPage: 5, fromPage: 1, toPage: 6 })],
            anns: [10, 15, 20, 25, 30, 35].map((para, i) =>
                ann({ ownerId: 'user', para, note: `第 ${i} 页的话`, createdAt: iso(i + 1) })),
        });
        expect(feed.later).toHaveLength(FEED_LATER_MAX);
        expect(feed.later[0]).toContain('■ 第 1 页');   // 摆的时候按书上的顺序
    });

    it('一块里带齐他回话要的东西：那一页的原文 + 那一页的批注 + 谁说过什么', () => {
        const hers = ann({ ownerId: 'user', para: 11, note: '她的话', createdAt: iso(6) });
        const his = ann({ ownerId: 'A', para: 12, note: '他划的', createdAt: iso(2) });
        const feed = buildPageFeed({
            ...base,
            from: 20, to: 24,
            since: iso(5),
            reads: [readRec({ fromPara: 10, toPara: 14, perPage: 5, fromPage: 3, toPage: 3 })],
            anns: [hers, his],
            parasOf: () => ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九',
                '第十段正文', '第十一段正文', '第十二段正文', '第十三段', '第十四段'],
            threads: [thread({
                anchorKey: threadKeyOf(0, hers.anchor, 'user'),
                anchor: hers.anchor,
                messages: [{ id: 'm1', role: 'user', content: '她接着说', kind: 'chat', createdAt: iso(6) }],
            })],
        });
        const block = feed.later.find((b) => b.includes('■ 第 3 页')) ?? '';
        expect(block).toContain('■ 第 3 页');
        expect(block).toContain('[11] 第十一段正文');        // 那一页的原文
        expect(block).toContain('那一页上的批注和讨论');
        expect(block).toContain('她的话');                    // 那页的批注
        expect(block).toContain('↳ Angelica：她接着说');       // 谁说过什么
        expect(block).toContain('你上次读完之后新出现的');      // 新出现的那几条单列
    });

    it('他看不见的（别人 self 档）不摆', () => {
        const feed = buildPageFeed({
            ...base,
            from: 20, to: 24,
            since: iso(5),
            reads: [readRec({ fromPara: 10, toPara: 14 })],
            anns: [ann({ ownerId: 'B', para: 12, note: '只给自己看的', visibility: 'self' })],
        });
        expect(feed.later).toHaveLength(0);
        expect(feed.notes).toHaveLength(0);
    });
});

// 读书模块 · 摆给他的那几页（buildPageFeed 纯函数）
//
// 她 09-21 连着问了两轮「里面真的有我最近的批注吗」，所以这份单测主要盯一件事：
// **她在「他已经读过的那几页」上留的话，一定要出现在 later 里**——以及它什么时候不该出现。

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
    threads: [] as RdThread[],
    nameOf,
};

describe('buildPageFeed · 他眼下这几页', () => {
    it('这几页上的批注都摆出来（谁的都摆，包括他自己划的）', () => {
        const feed = buildPageFeed({
            ...base,
            reads: [],
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
            reads: [],
            anns: [a],
            threads: [thread({
                anchorKey: threadKeyOf(0, a.anchor, 'user'),
                messages: [{ id: 'm1', role: 'char', charId: 'A', content: '接过了', kind: 'chat', createdAt: iso(2) }],
            })],
        });
        expect(feed.notes[0]).toContain('你已经接过话了');
    });
});

describe('buildPageFeed · 他上几次读到的那几页上还没接过话的', () => {
    it('**她在他读过的那几页上留的话，一定在里面**（她问了两轮的那件事）', () => {
        const feed = buildPageFeed({
            ...base,
            from: 20, to: 24,                       // 他眼下读到第 20–24 段了
            reads: [readRec({ fromPara: 10, toPara: 14, createdAt: iso(5) })],
            anns: [ann({ ownerId: 'user', para: 12, note: '我读完了，留一句', createdAt: iso(6) })],
        });
        expect(feed.later).toHaveLength(1);
        expect(feed.later[0]).toContain('我读完了，留一句');
    });

    it('他已经接过话的，不再催', () => {
        const a = ann({ ownerId: 'user', para: 12, note: '她的话' });
        const feed = buildPageFeed({
            ...base,
            from: 20, to: 24,
            reads: [readRec({ fromPara: 10, toPara: 14 })],
            anns: [a],
            threads: [thread({
                anchorKey: threadKeyOf(0, a.anchor, 'user'),
                messages: [{ id: 'm1', role: 'char', charId: 'A', content: '接了', kind: 'chat', createdAt: iso(3) }],
            })],
        });
        expect(feed.later).toHaveLength(0);
    });

    it('他自己划的不算（不用他回自己）', () => {
        const feed = buildPageFeed({
            ...base,
            from: 20, to: 24,
            reads: [readRec({ fromPara: 10, toPara: 14 })],
            anns: [ann({ ownerId: 'A', para: 12, note: '他自己留的' })],
        });
        expect(feed.later).toHaveLength(0);
    });

    it('别人留的、他没接过的也算', () => {
        const feed = buildPageFeed({
            ...base,
            from: 20, to: 24,
            reads: [readRec({ fromPara: 10, toPara: 14 })],
            anns: [ann({ ownerId: 'B', para: 13, note: '小满说的' })],
        });
        expect(feed.later).toHaveLength(1);
        expect(feed.later[0]).toContain('小满');
    });

    it('他读过太久以前的那几页不算（只往前看最近几次）', () => {
        // 老的读书记录排在前面，最新的 FEED_READ_LOOKBACK 条已经不含第 10–14 段
        const old = readRec({ fromPara: 10, toPara: 14, createdAt: iso(1) });
        const newer = Array.from({ length: FEED_READ_LOOKBACK }, (_, i) =>
            readRec({ fromPara: 30 + i * 5, toPara: 34 + i * 5, createdAt: iso(20 + i) }));
        const feed = buildPageFeed({
            ...base,
            from: 80, to: 84,
            reads: [old, ...newer],
            anns: [ann({ ownerId: 'user', para: 12, note: '很久以前那页上的' })],
        });
        expect(feed.later).toHaveLength(0);
    });

    it('上一章读过的也认（章号对上才算，段号相同不串章）', () => {
        const feed = buildPageFeed({
            ...base,
            chapterIdx: 1,
            from: 20, to: 24,
            reads: [readRec({ chapterIdx: 0, fromPara: 10, toPara: 14 })],
            anns: [
                ann({ ownerId: 'user', chapterIdx: 0, para: 12, note: '上一章她留的' }),
                ann({ ownerId: 'user', chapterIdx: 3, para: 12, note: '别的章、段号撞上了' }),
            ],
        });
        expect(feed.later).toHaveLength(1);
        expect(feed.later[0]).toContain('上一章她留的');
    });

    it('最多摆 FEED_LATER_MAX 条', () => {
        const feed = buildPageFeed({
            ...base,
            from: 90, to: 94,
            reads: [readRec({ fromPara: 10, toPara: 60 })],
            anns: Array.from({ length: FEED_LATER_MAX + 5 }, (_, i) =>
                ann({ ownerId: 'user', para: 10 + i, note: `第 ${i} 条`, createdAt: iso(i + 1) })),
        });
        expect(feed.later).toHaveLength(FEED_LATER_MAX);
    });

    it('他看不见的（别人 self 档）不摆', () => {
        const feed = buildPageFeed({
            ...base,
            from: 20, to: 24,
            reads: [readRec({ fromPara: 10, toPara: 14 })],
            anns: [ann({ ownerId: 'B', para: 12, note: '只给自己看的', visibility: 'self' })],
        });
        expect(feed.later).toHaveLength(0);
        expect(feed.notes).toHaveLength(0);
    });
});

describe('buildPageFeed · 他参与过的讨论', () => {
    it('他说完之后别人接着说 → 摆给他', () => {
        const feed = buildPageFeed({
            ...base,
            reads: [],
            anns: [],
            threads: [thread({
                anchorKey: 'k1',
                messages: [
                    { id: 'm1', role: 'char', charId: 'A', content: '他说的', kind: 'chat', createdAt: iso(1) },
                    { id: 'm2', role: 'user', content: '她接的', kind: 'chat', createdAt: iso(2) },
                ],
            })],
        });
        expect(feed.followUps).toHaveLength(1);
        expect(feed.followUps[0]).toContain('她接的');
    });

    it('他没说过话的讨论不动他', () => {
        const feed = buildPageFeed({
            ...base,
            reads: [],
            anns: [],
            threads: [thread({
                anchorKey: 'k2',
                messages: [{ id: 'm1', role: 'user', content: '她一个人的话', kind: 'chat', createdAt: iso(1) }],
            })],
        });
        expect(feed.followUps).toHaveLength(0);
    });
});

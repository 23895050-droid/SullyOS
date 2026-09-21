// 「谁参与了这一段 / 这一句」纯函数单测（2026-09-15）。
// 锁的是色条和面板箭头的口径：书签不算参与、跨段线覆盖的每一段都算、
// 同句判定认「锚点相同」也认「长短划重叠过半」、排序永远按谁先来。
import { describe, expect, it } from 'vitest';
import {
    isSameSentence, latestActivityAt, latestActivityOfBook, participantsOfParagraph, participantsOfSentence,
} from './readerParticipants';
import type { RdAnchor, RdAnnotation, RdThread, RdThreadMsg } from './readerDb';

const mkAnchor = (over: Partial<RdAnchor> = {}): RdAnchor => ({
    startPara: 1, startOffset: 0, endPara: 1, endOffset: 4, text: '测试原文', ...over,
});

const mkAnn = (over: Partial<RdAnnotation> = {}): RdAnnotation => ({
    id: `an_${Math.random().toString(36).slice(2, 8)}`, bookId: 'bk_1', ownerId: 'user',
    anchor: mkAnchor(), kind: 'highlight', styleSlot: 1, contentRev: 'rev1', status: 'active',
    createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z', ...over,
});

const mkMsg = (over: Partial<RdThreadMsg> = {}): RdThreadMsg => ({
    id: `ms_${Math.random().toString(36).slice(2, 8)}`, role: 'char', charId: 'char_a',
    content: '说一句', kind: 'chat', createdAt: '2026-09-02T10:00:00.000Z', ...over,
});

const mkThread = (over: Partial<RdThread> = {}): RdThread => ({
    id: 'th_1', bookId: 'bk_1', anchor: mkAnchor(), anchorKey: '1:0-1:4', charIds: ['char_a'],
    messages: [mkMsg()], createdAt: '2026-09-02T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z', ...over,
});

describe('readerParticipants · 同句判定', () => {
    it('锚点键完全相同 → 同一句', () => {
        expect(isSameSentence(mkAnchor(), mkAnchor())).toBe(true);
    });

    it('长短划重叠过半 → 同一句；只擦个边 → 不是', () => {
        const long = mkAnchor({ startOffset: 0, endOffset: 10 });
        const inner = mkAnchor({ startOffset: 2, endOffset: 8 });   // 全包在里面，重叠 6/6
        const half = mkAnchor({ startOffset: 5, endOffset: 15 });   // 重叠 5/10 = 0.5
        const edge = mkAnchor({ startOffset: 9, endOffset: 20 });   // 重叠 1/11
        expect(isSameSentence(long, inner)).toBe(true);
        expect(isSameSentence(long, half)).toBe(true);
        expect(isSameSentence(long, edge)).toBe(false);
    });

    it('不同段、哪怕偏移一样，也不算同句', () => {
        expect(isSameSentence(mkAnchor({ startPara: 1 }), mkAnchor({ startPara: 2 }))).toBe(false);
    });
});

describe('readerParticipants · 段落参与者', () => {
    it('按参与时间排序，批注与发言分别计数', () => {
        const anns = [
            mkAnn({ ownerId: 'user', createdAt: '2026-09-01T09:00:00.000Z' }),
            mkAnn({ ownerId: 'char_a', createdAt: '2026-09-01T11:00:00.000Z' }),
        ];
        const threads = [mkThread({ messages: [mkMsg({ role: 'user', charId: undefined }) ] })];

        const got = participantsOfParagraph(anns, threads, 1);
        expect(got.map((p) => p.ownerId)).toEqual(['user', 'char_a']);
        expect(got[0]).toMatchObject({ annotationCount: 1, messageCount: 1, firstAt: '2026-09-01T09:00:00.000Z' });
        expect(got[1]).toMatchObject({ annotationCount: 1, messageCount: 0 });
    });

    it('书签不算参与；system 发言不算人', () => {
        const anns = [mkAnn({ kind: 'bookmark' })];
        const threads = [mkThread({ messages: [mkMsg({ role: 'system', charId: undefined })] })];
        expect(participantsOfParagraph(anns, threads, 1)).toEqual([]);
    });

    it('跨段划线覆盖到的每一段都算它一份', () => {
        const anns = [mkAnn({ anchor: mkAnchor({ startPara: 3, startOffset: 0, endPara: 5, endOffset: 2 }) })];
        expect(participantsOfParagraph(anns, [], 3)).toHaveLength(1);
        expect(participantsOfParagraph(anns, [], 4)).toHaveLength(1);
        expect(participantsOfParagraph(anns, [], 5)).toHaveLength(1);
        expect(participantsOfParagraph(anns, [], 6)).toEqual([]);
    });
});

describe('readerParticipants · 同句参与者', () => {
    it('长短划两次同句 → 合并成一个人，计数累加', () => {
        const box = mkAnchor({ startOffset: 0, endOffset: 10 });
        const anns = [
            mkAnn({ ownerId: 'char_a', anchor: mkAnchor({ startOffset: 1, endOffset: 5 }) }),
            mkAnn({ ownerId: 'char_a', anchor: mkAnchor({ startOffset: 2, endOffset: 9 }) }),
            mkAnn({ ownerId: 'user', anchor: box, createdAt: '2026-08-01T09:00:00.000Z' }),
        ];
        const got = participantsOfSentence(anns, [], box);
        expect(got.map((p) => p.ownerId)).toEqual(['user', 'char_a']);
        expect(got[1].annotationCount).toBe(2);
    });
});

describe('readerParticipants · 最近动静', () => {
    it('段落级取该段最晚一条；书级取整本最晚一条', () => {
        const anns = [
            mkAnn({ anchor: mkAnchor({ startPara: 2, endPara: 2 }), createdAt: '2026-09-01T09:00:00.000Z' }),
            mkAnn({ anchor: mkAnchor({ startPara: 7, endPara: 7 }), createdAt: '2026-09-05T09:00:00.000Z' }),
        ];
        expect(latestActivityAt(anns, [], 2)).toBe('2026-09-01T09:00:00.000Z');
        expect(latestActivityAt(anns, [], 99)).toBeNull();
        expect(latestActivityOfBook(anns, [])).toBe('2026-09-05T09:00:00.000Z');
        expect(latestActivityOfBook([], [])).toBeNull();
    });
});

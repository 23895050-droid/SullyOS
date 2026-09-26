// 读书模块 · 讨论记录时间线（buildTimeline 纯函数）
//
// 她 09-25 的文档把口径钉死了，这份单测盯住四条：
//   · 批注和回复**按实际发生时间**混排（不是按原文笔记分组）
//   · 他看不见的（别人 self 档）不进这条线
//   · 活跃窗口 = 最后 15 条；攒到 45 条归档较早的 30 条
//   · 每满 10 条**活动记录**才汇总一次内容与感受（数的不是讨论）

import { describe, expect, it } from 'vitest';
import {
    ACTIVE_WINDOW, ARCHIVE_TAKE, ARCHIVE_TRIGGER, CONTENT_TRIGGER,
    activeWindow, buildTimeline, discussTake, lineOf, pendingRows, planContentSummary, planDiscussArchive,
    type TimelineRow,
} from './readerTimeline';
import type { RdAnnotation, RdAnchor, RdThread } from './readerDb';
import { threadKeyOf } from './readerParticipants';

const iso = (m: number) => new Date(Date.UTC(2026, 8, 25, 10, m)).toISOString();

const anchor = (para: number, text: string): RdAnchor => ({
    startPara: para, startOffset: 0, endPara: para, endOffset: text.length, text,
});

let seq = 0;
const ann = (patch: Partial<RdAnnotation> & { ownerId: string; para?: number; at?: number }): RdAnnotation => {
    const para = patch.para ?? 0;
    seq += 1;
    return {
        id: patch.id ?? `an-${seq}`,
        bookId: 'b1',
        ownerId: patch.ownerId,
        anchor: patch.anchor ?? anchor(para, `第${para}段的原句`),
        kind: patch.kind ?? 'note',
        visibility: patch.visibility,
        styleSlot: 1,
        note: patch.note,
        contentRev: 'rev',
        status: 'active',
        chapterIdx: patch.chapterIdx ?? 0,
        createdAt: patch.createdAt ?? iso(patch.at ?? seq),
        updatedAt: iso(patch.at ?? seq),
    };
};

const thread = (patch: Partial<RdThread> & { anchorKey: string; messages: RdThread['messages'] }): RdThread => ({
    id: patch.id ?? `th-${patch.anchorKey}`,
    bookId: 'b1',
    anchor: patch.anchor ?? anchor(1, '第1段的原句'),
    anchorKey: patch.anchorKey,
    chapterIdx: 0,
    charIds: patch.charIds ?? ['A'],
    messages: patch.messages,
    createdAt: iso(1),
    updatedAt: iso(1),
});

const nameOf = (id: string) => (id === 'user' ? 'Angelica' : id === 'A' ? '阿一' : id === 'B' ? '小满' : id);

describe('buildTimeline · 一条时间线', () => {
    it('批注和回复按实际发生时间混排（不按原文分组）', () => {
        const hers = ann({ ownerId: 'user', para: 3, note: '她先说话', at: 1 });
        const his = ann({ ownerId: 'A', para: 9, note: '他后说话', at: 3 });
        const rows = buildTimeline({
            anns: [his, hers],                      // 故意乱序进来
            threads: [thread({
                anchorKey: threadKeyOf(0, hers.anchor, 'user'),
                messages: [{ id: 'm1', role: 'char', charId: 'A', content: '他接了一句', kind: 'chat', createdAt: iso(2) }],
            })],
            viewer: 'A',
            nameOf,
        });
        expect(rows.map((r) => r.text)).toEqual(['她先说话', '他接了一句', '他后说话']);
        expect(rows.map((r) => r.kind)).toEqual(['note', 'reply', 'note']);
    });

    it('他看不见的（别人 self 档）不进这条线', () => {
        const rows = buildTimeline({
            anns: [
                ann({ ownerId: 'user', para: 1, note: '她公开说的' }),
                ann({ ownerId: 'B', para: 2, note: '只给自己看的', visibility: 'self' }),
            ],
            threads: [],
            viewer: 'A',
            nameOf,
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].text).toBe('她公开说的');
    });

    it('保鲜小结（系统写的 summary）不进这条线', () => {
        const rows = buildTimeline({
            anns: [],
            threads: [thread({
                anchorKey: 'k1',
                messages: [
                    { id: 'm1', role: 'user', content: '她说的', kind: 'chat', createdAt: iso(1) },
                    { id: 'm2', role: 'user', content: '系统保鲜小结', kind: 'summary', createdAt: iso(2) },
                ],
            })],
            viewer: 'A',
            nameOf,
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].text).toBe('她说的');
    });

    it('回复行带着被回的那句话和它的讨论键', () => {
        const hers = ann({ ownerId: 'user', para: 3, note: '她的话', at: 1 });
        const rows = buildTimeline({
            anns: [hers],
            threads: [thread({
                anchorKey: threadKeyOf(0, hers.anchor, 'user'),
                anchor: hers.anchor,
                messages: [{ id: 'm1', role: 'char', charId: 'A', content: '接了', kind: 'chat', createdAt: iso(2) }],
            })],
            viewer: 'A',
            nameOf,
        });
        const reply = rows.find((r) => r.kind === 'reply') as TimelineRow;
        expect(reply.quote).toBe(hers.anchor.text);
        expect(reply.key).toBe(threadKeyOf(0, hers.anchor, 'user'));
        expect(reply.who).toBe('阿一');
    });
});

describe('活跃窗口与归档（文档：留 15、攒 45 归档 30）', () => {
    const rows: TimelineRow[] = Array.from({ length: 60 }, (_, i) => ({
        at: iso(i), kind: 'note', ownerId: 'user', who: 'Angelica', chapterIdx: 0, para: i,
        quote: `第${i}句`, text: `第${i}条`, key: `k${i}`,
    }));

    it('活跃窗口只留最后 15 条', () => {
        const win = activeWindow(rows);
        expect(win).toHaveLength(ACTIVE_WINDOW);
        expect(win[0].text).toBe('第45条');
        expect(win[win.length - 1].text).toBe('第59条');
    });

    it('攒到 45 条才归档，一次吃较早的 30 条（留下 15 条）', () => {
        expect(planDiscussArchive(ARCHIVE_TRIGGER - 1)).toBe(false);
        expect(planDiscussArchive(ARCHIVE_TRIGGER)).toBe(true);
        const pending = ARCHIVE_TRIGGER;
        const take = discussTake(pending);
        expect(take).toBe(ARCHIVE_TAKE);
        expect(pending - take).toBe(ACTIVE_WINDOW);
    });

    it('水位线之后剩下的才算「可总结的」', () => {
        const pending = pendingRows(rows, iso(20));
        expect(pending).toHaveLength(39);
        expect(pending[0].text).toBe('第21条');
        expect(pendingRows(rows, null)).toHaveLength(60);
    });

    it('内容汇总数的是活动记录（每满 10 条），讨论条数不管用', () => {
        expect(planContentSummary(CONTENT_TRIGGER - 1)).toBe(false);
        expect(planContentSummary(CONTENT_TRIGGER)).toBe(true);
    });
});

describe('lineOf · 怎么念给他听', () => {
    it('批注和回复两种说法，带时间时前面加 HH:MM', () => {
        const [note, reply] = buildTimeline({
            anns: [ann({ ownerId: 'user', para: 3, note: '她的话', at: 5 })],
            threads: [thread({
                anchorKey: 'k1',
                anchor: anchor(3, '被回的那句'),
                messages: [{ id: 'm1', role: 'char', charId: 'A', content: '他接的', kind: 'chat', createdAt: iso(6) }],
            })],
            viewer: 'A',
            nameOf,
        });
        expect(lineOf(note)).toBe('[Angelica] 划了「第3段的原句」，写下：她的话');
        // 带时间时前面是「HH:MM 谁」（时区随本机，只认形状）
        expect(lineOf(note, { withTime: true })).toMatch(/^\[\d\d:\d\d Angelica\] 划了「第3段的原句」/);
        expect(lineOf(reply)).toBe('[阿一] 在「被回的那句」那条下面说：他接的');
    });
});

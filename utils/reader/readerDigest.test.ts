// 书库页汇总口径单测（2026-09-21，T5）
// 锁的是「六张榜各算各的口径」：token 三档分得开、批注只数字数不算划线、
// 讨论只数角色说过的话、页数只算共读里读的。
import { describe, expect, it } from 'vitest';
import {
    BOARDS, buildBoards, dayLabel, fmtRank, groupByDay, mergeRuns, roamVerb, runHitKinds, runMeta, runVerbs,
    withinDays,
} from './readerDigest';
import type { RdAnnotation, RdRoamActivity, RdThread } from './readerDb';

const iso = (d: string) => new Date(`${d}T10:00:00.000Z`).toISOString();

// group 默认**一条一个**（想验「同一次活动捆在一起」就自己传 group）
const mkRoam = (over: Partial<RdRoamActivity> = {}): RdRoamActivity => ({
    id: `rr_${Math.random().toString(36).slice(2)}`, charId: 'char_a', bookId: 'bk_1',
    kind: 'annotate', group: `g_${Math.random().toString(36).slice(2)}`, seq: 0, summary: '读了',
    mode: 'roam', createdAt: iso('2026-09-20'),
    ...over,
});

const mkAnn = (over: Partial<RdAnnotation> = {}): RdAnnotation => ({
    id: `an_${Math.random().toString(36).slice(2)}`, bookId: 'bk_1', ownerId: 'char_a',
    anchor: { startPara: 1, startOffset: 0, endPara: 1, endOffset: 4, text: '原文' },
    kind: 'note', styleSlot: 1, contentRev: 'rev1', status: 'active',
    createdAt: iso('2026-09-20'), updatedAt: iso('2026-09-20'), ...over,
});

const mkThread = (msgs: Array<{ role: 'user' | 'char' | 'system'; charId?: string }>): RdThread => ({
    id: `th_${Math.random().toString(36).slice(2)}`, bookId: 'bk_1',
    anchor: { startPara: 1, startOffset: 0, endPara: 1, endOffset: 4, text: '原文' },
    anchorKey: 'k', charIds: ['char_a'], createdAt: iso('2026-09-20'), updatedAt: iso('2026-09-20'),
    messages: msgs.map((m, i) => ({ id: `m${i}`, content: '话', kind: 'chat' as const, createdAt: iso('2026-09-20'), ...m })),
});

describe('readerDigest · 六张榜', () => {
    it('三档 token 各算各的，总 token 独立于进出两档', () => {
        const b = buildBoards({
            charIds: ['char_a', 'char_b'],
            roam: [
                mkRoam({ charId: 'char_a', tokens: 100, tokensIn: 70, tokensOut: 30 }),
                mkRoam({ charId: 'char_a', tokens: 50, tokensIn: 20, tokensOut: 30 }),
                mkRoam({ charId: 'char_b', tokens: 10, tokensIn: 4, tokensOut: 6 }),
            ],
            anns: [], threads: [],
        });
        expect(b.tokens.map((r) => r.value)).toEqual([150, 10]);
        expect(b.tokensIn.map((r) => r.value)).toEqual([90, 4]);
        expect(b.tokensOut.map((r) => r.value)).toEqual([60, 6]);
    });

    it('批注总字数：只数 note 的字，划线和书签不算', () => {
        const b = buildBoards({
            charIds: ['char_a'],
            roam: [],
            anns: [
                mkAnn({ note: '三个字' }),
                mkAnn({ kind: 'highlight', note: undefined }),
                mkAnn({ kind: 'bookmark' }),
            ],
            threads: [],
        });
        expect(b.noteChars[0].value).toBe(3);
    });

    it('参与讨论：只数角色自己说过的话，别人说的不算', () => {
        const b = buildBoards({
            charIds: ['char_a'],
            roam: [],
            anns: [],
            threads: [mkThread([
                { role: 'user' }, { role: 'char', charId: 'char_a' }, { role: 'char', charId: 'char_b' },
            ])],
        });
        expect(b.talks[0].value).toBe(1);
    });

    it('一起读书页：只算共读里的页数', () => {
        const b = buildBoards({
            charIds: ['char_a'],
            roam: [
                mkRoam({ pages: 5, mode: 'coread', kind: 'annotate' }),
                mkRoam({ pages: 9, mode: 'roam', kind: 'readon' }),
            ],
            anns: [], threads: [],
        });
        expect(b.pages[0].value).toBe(5);
    });

    it('榜上只有角色、并列不抖、全 0 也留位', () => {
        const b = buildBoards({ charIds: ['char_a', 'char_b', 'char_c'], roam: [mkRoam({ charId: 'user', tokens: 999 })], anns: [], threads: [] });
        for (const { key } of BOARDS) {
            expect(b[key].map((r) => r.ownerId)).toEqual(['char_a', 'char_b', 'char_c']);
            expect(b[key].every((r) => r.value === 0)).toBe(true);
        }
    });
});

describe('readerDigest · 活动记录的合并', () => {
    const t = (min: number) => new Date(Date.UTC(2026, 8, 21, 1, 0) + min * 60000).toISOString();

    it('同一个人同一本书、十分钟内 → 折成一条；超过十分钟 → 另起一条', () => {
        const runs = mergeRuns([
            mkRoam({ id: 'a', createdAt: t(0), pages: 2 }),
            mkRoam({ id: 'b', createdAt: t(3), kind: 'discuss', replyCount: 2 }),
            mkRoam({ id: 'c', createdAt: t(40), kind: 'annotate' }),
        ]);
        expect(runs).toHaveLength(2);
        expect(runs[0].calls.map((x) => x.id)).toEqual(['c']);        // 新的在前
        expect(runs[1].calls.map((x) => x.id)).toEqual(['a', 'b']);
    });

    it('不是同一个人 / 不是同一本书 → 不合并（哪怕挨着）', () => {
        const runs = mergeRuns([
            mkRoam({ id: 'a', createdAt: t(0) }),
            mkRoam({ id: 'b', charId: 'char_b', createdAt: t(1) }),
            mkRoam({ id: 'c', bookId: 'bk_2', createdAt: t(2) }),
        ]);
        expect(runs).toHaveLength(3);
    });

    it('同一个 group 的调用永远在一起——哪怕摘要那趟隔了四十分钟', () => {
        const runs = mergeRuns([
            mkRoam({ id: 'a', group: 'g1', seq: 0, createdAt: t(0), pages: 2 }),
            mkRoam({ id: 'b', group: 'g1', seq: 1, kind: 'summary', createdAt: t(40), tokens: 200 }),
        ]);
        expect(runs).toHaveLength(1);
        expect(runs[0].calls.map((x) => x.id)).toEqual(['a', 'b']);
        expect(runVerbs(runs[0])).toBe('读了新内容');
    });

    it('多人共读的同一个 group **按人拆开**（不然另一个人的名字就没了）', () => {
        const runs = mergeRuns([
            mkRoam({ id: 'a', group: 'g1', seq: 0, createdAt: t(0) }),
            mkRoam({ id: 'b', group: 'g1', seq: 1, charId: 'char_b', createdAt: t(1) }),
            mkRoam({ id: 'c', group: 'g1', seq: 2, kind: 'summary', createdAt: t(2) }),
        ]);
        expect(runs.map((r) => r.ownerId)).toEqual(['char_a', 'char_b']);
        expect(runs[0].calls.map((x) => x.id)).toEqual(['a', 'c']);   // 摘要挂在读的那个人身上
    });

    it('中间插进来别人的一段，不会把同一个人的前后两段切断', () => {
        const runs = mergeRuns([
            mkRoam({ id: 'a', group: 'g1', seq: 0, createdAt: t(0) }),
            mkRoam({ id: 'b', group: 'g1', seq: 1, kind: 'summary', createdAt: t(20) }),
            mkRoam({ id: 'x', group: 'g2', charId: 'char_b', createdAt: t(1) }),
            mkRoam({ id: 'c', group: 'g3', kind: 'discuss', createdAt: t(5) }),
        ]);
        expect(runs.map((r) => r.ownerId)).toEqual(['char_a', 'char_b']);
        expect(runs[0].calls.map((x) => x.id)).toEqual(['a', 'c', 'b']);
    });

    it('合并之后内部按时间排（跨组并进来的一条不该跑到末尾）', () => {
        const runs = mergeRuns([
            mkRoam({ id: 'a', group: 'g1', seq: 0, createdAt: t(0) }),
            mkRoam({ id: 'b', group: 'g1', seq: 1, kind: 'summary', createdAt: t(30) }),
            mkRoam({ id: 'c', group: 'g2', seq: 0, kind: 'discuss', createdAt: t(10) }),
        ]);
        expect(runs).toHaveLength(1);
        expect(runs[0].calls.map((x) => x.id)).toEqual(['a', 'c', 'b']);
        expect(runs[0].from).toBe(t(0));
        expect(runs[0].to).toBe(t(30));
    });

    it('合并之后：动作去重按固定顺序念，数字全是加总的', () => {
        const [run] = mergeRuns([
            mkRoam({ id: 'a', createdAt: t(0), pages: 2, annCount: 3, tokens: 1000, tokensIn: 700, tokensOut: 300 }),
            mkRoam({ id: 'b', createdAt: t(2), kind: 'discuss', replyCount: 2, pages: 1, tokens: 500 }),
            mkRoam({ id: 'c', createdAt: t(4), kind: 'summary', tokens: 200 }),
        ]);
        expect(run.calls).toHaveLength(3);
        expect(runVerbs(run)).toBe('读了新内容、接了话');            // summary 不进动作词
        expect(runMeta(run, 42)).toBe('看了 3 页 · 进度 42% · 3 条批注 · 2 条回复 · 1.7k token');
    });

    it('自己那条不写 token（她 09-21：读了几分钟也拿掉了）', () => {
        const [run] = mergeRuns([mkRoam({
            charId: 'user', mode: 'user', kind: 'read', durationMs: 26 * 60000, pages: 5, tokens: 900,
        })]);
        expect(runMeta(run)).toBe('看了 5 页');
        expect(runVerbs(run)).toBe('读了书');
    });

    it('性质筛：多选是「或」，空 = 不筛', () => {
        const [coread] = mergeRuns([mkRoam({ mode: 'coread', kind: 'annotate' })]);
        const [mine] = mergeRuns([mkRoam({ charId: 'user', mode: 'user', kind: 'read' })]);
        expect(runHitKinds(coread, [])).toBe(true);
        expect(runHitKinds(coread, ['coread'])).toBe(true);
        expect(runHitKinds(coread, ['annotate', 'self'])).toBe(true);
        expect(runHitKinds(mine, ['coread', 'annotate'])).toBe(false);
        expect(runHitKinds(mine, ['self'])).toBe(true);
    });

    it('按天分组 + 今天/昨天/几月几号', () => {
        const runs = mergeRuns([
            mkRoam({ id: 'a', createdAt: '2026-09-21T02:00:00.000Z' }),
            mkRoam({ id: 'b', createdAt: '2026-09-21T01:00:00.000Z' }),
            mkRoam({ id: 'c', createdAt: '2026-09-19T01:00:00.000Z' }),
        ]);
        const days = groupByDay(runs);
        expect(days.map((d) => d.runs.length)).toEqual([2, 1]);
        expect(dayLabel(days[0].day, days[0].day)).toBe('今天');
        expect(dayLabel('2026-09-19', '2026-09-21')).toBe('09/19');
        expect(withinDays('2026-09-15T00:00:00.000Z', 7, Date.parse('2026-09-21T00:00:00.000Z'))).toBe(true);
        expect(withinDays('2026-09-01T00:00:00.000Z', 7, Date.parse('2026-09-21T00:00:00.000Z'))).toBe(false);
    });
});

describe('readerDigest · 表面那行', () => {
    it('动作词组：共读加「一起」，自读不加', () => {
        expect(roamVerb(mkRoam({ kind: 'annotate', mode: 'coread' }))).toBe('一起读了新内容');
        expect(roamVerb(mkRoam({ kind: 'annotate', mode: 'roam' }))).toBe('读了新内容');
        expect(roamVerb(mkRoam({ kind: 'reread' }))).toBe('重温了旧内容');
        expect(roamVerb(mkRoam({ kind: 'readon' }))).toBe('追了进度');
    });

    it('榜单数字带单位；没有单位的那种是 token', () => {
        expect(fmtRank('noteChars', 320)).toBe('320 字');
        expect(fmtRank('noteChars', 1200)).toBe('1.2k 字');
        expect(fmtRank('talks', 3)).toBe('3 次');
        expect(fmtRank('pages', 12)).toBe('12 页');
        expect(fmtRank('tokens', 12000)).toBe('1.2w token');
    });
});

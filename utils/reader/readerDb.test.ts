// 读书模块数据层单测（2026-09-14）——fake-indexeddb 由 test-setup.ts 注入。
// 这里锁的是「结构性质」而不是实现细节：多游标不互相覆盖（V9）、讨论只增不改、
// 书目删掉时级联清干净、半截导入会被清扫。
import { describe, expect, it } from 'vitest';
import {
    RD_STORE, anchorKeyOf, appendThreadMessage, chapterRowId, countChapters, deleteBookDeep,
    getBook, getChapter, getProgress, getThreadByAnchor, listAnnotations, listBooks, listChapters,
    listProgressByBook, patchBook, putAnnotation, putBook, putChapters, putProgress, rdId,
    sweepStaleImports, threadRowId, type RdAnchor, type RdAnnotation, type RdBook, type RdChapter,
    type RdThread,
} from './readerDb';
import { DB } from '../db';

const iso = () => new Date().toISOString();

const mkBook = (over: Partial<RdBook> = {}): RdBook => ({
    id: rdId('bk'), title: '测试书', format: 'txt', sourceFileName: 'a.txt', fileBytes: 10,
    fileRef: 'blobref:b_test', status: 'ready', contentRev: 'rev1', chapterCount: 1, totalChars: 12,
    chapterStartPara: [0], toc: [{ title: '第一章', chapterIdx: 0 }], tags: [], onShelf: true,
    order: 0, createdAt: iso(), updatedAt: iso(), ...over,
});

const mkChapter = (bookId: string, idx: number, paras: string[]): RdChapter => ({
    id: chapterRowId(bookId, idx), bookId, idx, title: `第${idx + 1}章`, paras,
    chars: paras.join('').length,
});

const mkAnchor = (over: Partial<RdAnchor> = {}): RdAnchor => ({
    startPara: 1, startOffset: 0, endPara: 1, endOffset: 4, text: '测试原文', ...over,
});

describe('readerDb · 书目', () => {
    it('写入 / 读出 / 按 order 排序', async () => {
        const later = mkBook({ order: 5, title: '后面那本' });
        const earlier = mkBook({ order: 1, title: '前面那本' });
        await putBook(later);
        await putBook(earlier);
        const all = await listBooks();
        const mine = all.filter((b) => b.id === later.id || b.id === earlier.id);
        expect(mine.map((b) => b.title)).toEqual(['前面那本', '后面那本']);
        expect((await getBook(earlier.id))?.title).toBe('前面那本');
    });

    it('patchBook 局部改元数据（评分/标签/自写简介）且 updatedAt 前移', async () => {
        const book = mkBook({ title: '待改', updatedAt: '2000-01-01T00:00:00.000Z' });
        await putBook(book);
        const next = await patchBook(book.id, { rating: 5, tags: ['哲学'], customIntro: '我自己写的简介' });
        expect(next?.rating).toBe(5);
        expect(next?.tags).toEqual(['哲学']);
        expect(next?.customIntro).toBe('我自己写的简介');
        expect(next?.title).toBe('待改');            // 没传的字段不动
        expect(Date.parse(next!.updatedAt)).toBeGreaterThan(Date.parse('2000-01-01T00:00:00.000Z'));
    });
});

describe('readerDb · 章节', () => {
    it('一章一行、按 idx 升序取出、段号是全书单调的', async () => {
        const book = mkBook();
        await putBook(book);
        await putChapters([mkChapter(book.id, 1, ['第二段', '第三段']), mkChapter(book.id, 0, ['第一段'])]);
        const chapters = await listChapters(book.id);
        expect(chapters.map((c) => c.idx)).toEqual([0, 1]);
        expect(chapters[0].paras).toEqual(['第一段']);
        expect(await countChapters(book.id)).toBe(2);
        expect((await getChapter(book.id, 1))?.paras).toEqual(['第二段', '第三段']);
        // 别的书的章节不会串进来
        const other = mkBook();
        await putBook(other);
        await putChapters([mkChapter(other.id, 0, ['别人的'])]);
        expect(await countChapters(book.id)).toBe(2);
    });
});

describe('readerDb · 进度：多游标互不覆盖（V9）', () => {
    it('用户与两个角色各写各的，互不干扰', async () => {
        const book = mkBook();
        await putBook(book);
        await putProgress({
            bookId: book.id, ownerId: 'user', chapterIdx: 0, paraIdx: 3, charOffset: 2,
            percent: 10, readingSeconds: 60, sessionCount: 1, updatedAt: iso(),
        });
        await putProgress({
            bookId: book.id, ownerId: 'char_nox', chapterIdx: 2, paraIdx: 99, charOffset: 0,
            percent: 80, readingSeconds: 0, sessionCount: 1, updatedAt: iso(),
        });
        const user = await getProgress(book.id, 'user');
        const nox = await getProgress(book.id, 'char_nox');
        expect(user?.percent).toBe(10);
        expect(nox?.percent).toBe(80);
        // 角色再往前走，用户那行纹丝不动
        await putProgress({ ...nox!, percent: 95, paraIdx: 120, updatedAt: iso() });
        expect((await getProgress(book.id, 'user'))?.percent).toBe(10);
        expect((await getProgress(book.id, 'char_nox'))?.percent).toBe(95);
        expect(await listProgressByBook(book.id)).toHaveLength(2);
        expect(await getProgress(book.id, 'char_other')).toBeNull();
    });
});

describe('readerDb · 讨论（append-only 资产）', () => {
    it('同一段选区一条线程，消息只增不改、顺序保留', async () => {
        const book = mkBook();
        await putBook(book);
        const anchor = mkAnchor();
        const key = anchorKeyOf(anchor);
        const skeleton = (): RdThread => ({
            id: threadRowId(book.id, key), bookId: book.id, anchor, anchorKey: key,
            charIds: ['char_nox'], messages: [], createdAt: iso(), updatedAt: iso(),
        });
        await appendThreadMessage(threadRowId(book.id, key), {
            id: rdId('m'), role: 'user', content: '这句好', kind: 'chat', createdAt: iso(),
        }, skeleton);
        const after = await appendThreadMessage(threadRowId(book.id, key), {
            id: rdId('m'), role: 'char', charId: 'char_nox', content: '我也喜欢', kind: 'chat', createdAt: iso(),
        }, skeleton);
        expect(after.messages.map((m) => m.content)).toEqual(['这句好', '我也喜欢']);
        const read = await getThreadByAnchor(book.id, key);
        expect(read?.messages).toHaveLength(2);
        // 总结是 message 的一种，仍然只进线程
        const withSummary = await appendThreadMessage(threadRowId(book.id, key), {
            id: rdId('m'), role: 'system', content: '小结：围绕这句聊了喜欢', kind: 'summary', createdAt: iso(),
        }, skeleton);
        expect(withSummary.messages).toHaveLength(3);
        expect(withSummary.messages[2].kind).toBe('summary');
    });
});

describe('readerDb · 级联删除与半截导入清扫', () => {
    it('deleteBookDeep 连章节/批注/讨论/进度一起清掉', async () => {
        const book = mkBook();
        await putBook(book);
        await putChapters([mkChapter(book.id, 0, ['一'])]);
        const anchor = mkAnchor();
        const ann: RdAnnotation = {
            id: rdId('an'), bookId: book.id, ownerId: 'user', anchor, kind: 'highlight', styleSlot: 1,
            contentRev: 'rev1', status: 'active', createdAt: iso(), updatedAt: iso(),
        };
        await putAnnotation(ann);
        await appendThreadMessage(threadRowId(book.id, anchorKeyOf(anchor)), {
            id: rdId('m'), role: 'user', content: 'x', kind: 'chat', createdAt: iso(),
        }, () => ({
            id: threadRowId(book.id, anchorKeyOf(anchor)), bookId: book.id, anchor,
            anchorKey: anchorKeyOf(anchor), charIds: [], messages: [], createdAt: iso(), updatedAt: iso(),
        }));
        await putProgress({
            bookId: book.id, ownerId: 'user', chapterIdx: 0, paraIdx: 0, charOffset: 0,
            percent: 1, readingSeconds: 0, sessionCount: 1, updatedAt: iso(),
        });

        await deleteBookDeep(book.id);

        expect(await getBook(book.id)).toBeNull();
        expect(await listChapters(book.id)).toEqual([]);
        expect(await listAnnotations(book.id)).toEqual([]);
        expect(await listProgressByBook(book.id)).toEqual([]);
        const threads = await DB.getRowsByIndex(RD_STORE.threads, 'bookId', book.id);
        expect(threads).toEqual([]);
    });

    it('sweepStaleImports 只清「超时且仍是 importing」的书', async () => {
        const stale = mkBook({ status: 'importing', createdAt: '2020-01-01T00:00:00.000Z' });
        const fresh = mkBook({ status: 'importing' });
        const ready = mkBook({ status: 'ready', createdAt: '2020-01-01T00:00:00.000Z' });
        await putBook(stale);
        await putBook(fresh);
        await putBook(ready);
        await putChapters([mkChapter(stale.id, 0, ['半截'])]);

        const swept = await sweepStaleImports();

        expect(swept).toContain(stale.id);
        expect(await getBook(stale.id)).toBeNull();
        expect(await listChapters(stale.id)).toEqual([]);   // 章节跟着走，不留隐形重量
        expect(await getBook(fresh.id)).not.toBeNull();
        expect(await getBook(ready.id)).not.toBeNull();
    });
});

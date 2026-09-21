// 读书模块 · 导入导出（T6）单测：范围勾得住、分角色筛得对、导回来一致
import { describe, expect, it } from 'vitest';
import { FULL_EXPORT_SCOPE, applyReaderImport, buildReaderExport, isReaderBundle } from './readerExport';
import {
    appendRoamActivity, chapterRowId, getProgress, listAnnotations, listBooks, listChapters,
    listProgressByBook, listRoamActivities, putAnnotation, putBook, putChapters, putProgress, rdId,
    type RdAnchor, type RdAnnotation, type RdBook, type RdChapter, type RdProgress, type RdRoamActivity,
} from './readerDb';

const iso = () => new Date().toISOString();

const mkBook = (over: Partial<RdBook> = {}): RdBook => ({
    id: rdId('xb'), title: '测试书', format: 'txt', sourceFileName: 'a.txt', fileBytes: 10,
    fileRef: 'blobref:b_test', status: 'ready', contentRev: 'rev', chapterCount: 1, totalChars: 8,
    chapterStartPara: [0], toc: [{ title: '第一章', chapterIdx: 0 }], tags: [], onShelf: true,
    order: 0, createdAt: iso(), updatedAt: iso(), ...over,
});

const mkChapter = (bookId: string): RdChapter => ({
    id: chapterRowId(bookId, 0), bookId, idx: 0, title: '第一章', paras: ['一句话。'], chars: 4,
});

const anchor: RdAnchor = { startPara: 0, startOffset: 0, endPara: 0, endOffset: 3, text: '一句话' };

const mkAnn = (bookId: string, ownerId: string, note: string): RdAnnotation => ({
    id: rdId('xa'), bookId, ownerId, anchor, kind: 'note', styleSlot: 1, style: 'underline',
    visibility: 'public', note, contentRev: 'rev', status: 'active', createdAt: iso(), updatedAt: iso(),
});

const mkProg = (bookId: string, ownerId: string): RdProgress => ({
    bookId, ownerId, chapterIdx: 0, paraIdx: 0, charOffset: 0, percent: 30,
    readingSeconds: 10, sessionCount: 1, updatedAt: iso(),
});

const mkRoam = (bookId: string, charId: string): RdRoamActivity => ({
    id: rdId('xr'), charId, bookId, kind: 'annotate', group: rdId('grp'), seq: 0,
    summary: '读了这一段', mode: 'coread', createdAt: iso(),
});

const NO_CONTENT = { ...FULL_EXPORT_SCOPE, content: false, media: false, settings: false };

describe('readerExport · 范围勾选', () => {
    it('只勾笔记就只有笔记，正文和活动记录都是空的', async () => {
        const book = mkBook();
        await putBook(book);
        await putAnnotation(mkAnn(book.id, 'user', '我的批注'));
        const bundle = await buildReaderExport({ scope: { ...NO_CONTENT, notes: true } });
        expect(bundle.annotations.some((a) => a.bookId === book.id)).toBe(true);
        expect(bundle.books).toEqual([]);
        expect(bundle.chapters).toEqual([]);
        expect(bundle.roam).toEqual([]);
        expect(bundle.settings).toBeUndefined();
    });

    it('勾了书内容就有书目和正文；勾了设置就有设置那一块', async () => {
        const book = mkBook();
        await putBook(book);
        await putChapters([mkChapter(book.id)]);
        const bundle = await buildReaderExport({ scope: { ...FULL_EXPORT_SCOPE, media: false, notes: false, text: false } });
        expect(bundle.books.map((b) => b.id)).toContain(book.id);
        expect(bundle.chapters.map((c) => c.bookId)).toContain(book.id);
        expect(bundle.settings?.prefs).toBeTruthy();
    });
});

describe('readerExport · 分角色', () => {
    it('挑了一个人，就只导他的痕迹；书也只带他碰过的', async () => {
        const mineBook = mkBook({ title: '他的书' });
        const otherBook = mkBook({ title: '别人的书' });
        await putBook(mineBook);
        await putBook(otherBook);
        await putChapters([mkChapter(mineBook.id), mkChapter(otherBook.id)]);
        await putAnnotation(mkAnn(mineBook.id, 'char_a', '他划的'));
        await putAnnotation(mkAnn(otherBook.id, 'char_b', '别人划的'));
        await putProgress(mkProg(mineBook.id, 'char_a'));
        await appendRoamActivity(mkRoam(otherBook.id, 'char_b'));

        const bundle = await buildReaderExport({
            scope: { ...FULL_EXPORT_SCOPE, media: false, text: true },
            owners: ['char_a'],
        });
        expect(bundle.annotations.every((a) => a.ownerId === 'char_a')).toBe(true);
        expect(bundle.annotations.some((a) => a.bookId === otherBook.id)).toBe(false);
        expect(bundle.books.map((b) => b.id)).toEqual([mineBook.id]);
        expect(bundle.chapters.map((c) => c.bookId)).toEqual([mineBook.id]);
        expect(bundle.roam.every((r) => r.charId === 'char_a')).toBe(true);
    });
});

describe('readerExport · 导回来一致', () => {
    it('导出的包导回去，库里还是那些行（按 id 覆盖，不翻倍）', async () => {
        const book = mkBook();
        await putBook(book);
        await putChapters([mkChapter(book.id)]);
        const ann = mkAnn(book.id, 'char_a', '他划的');
        await putAnnotation(ann);
        const roam = mkRoam(book.id, 'char_a');
        await appendRoamActivity(roam);

        const bundle = await buildReaderExport({
            scope: { ...FULL_EXPORT_SCOPE, media: false },
            owners: ['char_a'],
        });
        expect(isReaderBundle(bundle)).toBe(true);

        const result = await applyReaderImport(JSON.parse(JSON.stringify(bundle)));
        // 同一个库里跑过别的用例，别人的书也在包里——这里只认「这本带上了」
        expect(bundle.books.map((b) => b.id)).toContain(book.id);
        expect(result.books).toBeGreaterThanOrEqual(1);
        expect(result.chapters).toBeGreaterThanOrEqual(1);
        expect(result.annotations).toBeGreaterThanOrEqual(1);
        expect(result.roam).toBeGreaterThanOrEqual(1);

        // 同一份再导一遍：行数不翻倍（id 覆盖）
        const annsBefore = (await listAnnotations(book.id)).length;
        const progsBefore = (await listProgressByBook(book.id)).length;
        await applyReaderImport(JSON.parse(JSON.stringify(bundle)));
        expect((await listAnnotations(book.id)).length).toBe(annsBefore);
        expect((await listProgressByBook(book.id)).length).toBe(progsBefore);
        expect((await listBooks()).filter((b) => b.id === book.id)).toHaveLength(1);
        expect((await listChapters(book.id)).length).toBe(1);
        expect((await listRoamActivities('char_a')).filter((r) => r.id === roam.id)).toHaveLength(1);
    });

    it('不是书房的包会被挡下来', async () => {
        await expect(applyReaderImport({ kind: 'something-else' })).rejects.toThrow();
        expect(isReaderBundle({ kind: 'sullyos-reader-export' })).toBe(true);
    });
});

describe('readerExport · 进度那条也在包里', () => {
    it('进度按 owner 筛，导回去读得到', async () => {
        const book = mkBook();
        await putBook(book);
        await putProgress(mkProg(book.id, 'char_a'));
        const bundle = await buildReaderExport({ scope: { ...NO_CONTENT, notes: true }, owners: ['char_a'] });
        expect(bundle.progress.filter((p) => p.bookId === book.id)).toHaveLength(1);
        expect(bundle.progress.every((p) => p.ownerId === 'char_a')).toBe(true);
        await applyReaderImport(JSON.parse(JSON.stringify(bundle)));
        expect((await getProgress(book.id, 'char_a'))?.percent).toBe(30);
    });
});

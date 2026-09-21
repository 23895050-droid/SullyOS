// 读书模块 · 挂载（T6）单测：内容怎么念、谁能命中、配置按角色存
// 纯函数为主（读库那几个走 fake-indexeddb，见 test-setup）。
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_READER_BLOCKS, READER_MOUNT_BLOCK_IDS, READER_MOUNT_KEY,
    actsLines, mergeReaderMountConfig, readerMountBlockOf, readerMountHit, setReaderMountBlock, shelfLines,
} from './readerMount';
import { rdId, type RdBook, type RdProgress, type RdRoamActivity } from './readerDb';

const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60 * 1000).toISOString();

const mkRoam = (over: Partial<RdRoamActivity>): RdRoamActivity => ({
    id: rdId('rm'), charId: 'c1', bookId: 'b1', kind: 'annotate', group: rdId('grp'), seq: 0,
    summary: '读了这一段', mode: 'coread', createdAt: iso(0), ...over,
});

const mkBook = (over: Partial<RdBook>): RdBook => ({
    id: 'b1', title: '海边', format: 'txt', sourceFileName: 'a.txt', fileBytes: 1, fileRef: 'blobref:b_x',
    status: 'ready', contentRev: 'r', chapterCount: 2, totalChars: 10, chapterStartPara: [0, 5],
    toc: [{ title: '第一章 潮水', chapterIdx: 0 }, { title: '第二章 灯塔', chapterIdx: 1 }],
    tags: [], onShelf: true, order: 0, createdAt: iso(0), updatedAt: iso(0), ...over,
});

const mkProg = (over: Partial<RdProgress>): RdProgress => ({
    bookId: 'b1', ownerId: 'c1', chapterIdx: 1, paraIdx: 6, charOffset: 0, percent: 42,
    readingSeconds: 60, sessionCount: 1, updatedAt: iso(10), ...over,
});

describe('readerMount · 内容怎么念', () => {
    it('阅读状态：一次活动的调用并成一条，写清时间/动作/书名', () => {
        const g = rdId('grp');
        const rows = [
            mkRoam({ group: g, seq: 0, kind: 'annotate', createdAt: iso(8), tokens: 1200 }),
            mkRoam({ group: g, seq: 1, kind: 'discuss', createdAt: iso(7), tokens: 800 }),
            mkRoam({ group: g, seq: 2, kind: 'summary', createdAt: iso(6) }),
        ];
        const lines = actsLines(rows, () => '海边');
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('一起读了新内容、接了话《海边》');
        expect(lines[0]).toContain('2.0k token');
    });

    it('书架进度：按最近更新排，写清百分比和章名', () => {
        const books = [mkBook({ id: 'b1', title: '海边' }), mkBook({ id: 'b2', title: '山' })];
        const lines = shelfLines([
            mkProg({ bookId: 'b1', percent: 42, chapterIdx: 1, updatedAt: iso(100) }),
            mkProg({ bookId: 'b2', percent: 7, chapterIdx: 0, updatedAt: iso(5) }),
        ], books);
        expect(lines[0]).toContain('《山》读到 7%');
        expect(lines[0]).toContain('第一章 潮水');
        expect(lines[1]).toContain('《海边》读到 42%');
        expect(lines[1]).toContain('第二章 灯塔');
    });
});

describe('readerMount · 谁能命中', () => {
    it('提到「读书」命中状态/书架/你的进度；提到别的什么都不命中', () => {
        const hit = readerMountHit('c1', '你最近在读书吗');
        expect(hit).toContain('acts');
        expect(hit).toContain('shelf');
        expect(hit).toContain('userProgress');
        expect(readerMountHit('c1', '今天天气不错')).toEqual([]);
    });

    it('常量块不看关键词，每轮都命中', () => {
        setReaderMountBlock('c9', 'acts', { constant: true });
        expect(readerMountHit('c9', '随便一句话')).toContain('acts');
        localStorage.removeItem(READER_MOUNT_KEY);
    });
});

describe('readerMount · 配置按角色存', () => {
    it('没配过是默认值；配了只影响这个人', () => {
        localStorage.removeItem(READER_MOUNT_KEY);
        expect(readerMountBlockOf('c1', 'acts').enabled).toBe(false);
        setReaderMountBlock('c1', 'acts', { enabled: true, probability: 30 });
        expect(readerMountBlockOf('c1', 'acts').enabled).toBe(true);
        expect(readerMountBlockOf('c1', 'acts').probability).toBe(30);
        expect(readerMountBlockOf('c2', 'acts').enabled).toBe(false);
    });

    it('导入是**按角色合并**：带进来的角色覆盖，没带的角色原样', () => {
        localStorage.removeItem(READER_MOUNT_KEY);
        setReaderMountBlock('c1', 'shelf', { enabled: true });
        setReaderMountBlock('c2', 'shelf', { enabled: true });
        mergeReaderMountConfig({
            version: 1, updatedAt: iso(0),
            chars: { c2: { ...DEFAULT_READER_BLOCKS, shelf: { ...DEFAULT_READER_BLOCKS.shelf, enabled: false } } },
        });
        expect(readerMountBlockOf('c1', 'shelf').enabled).toBe(true);   // 没带进来的不动
        expect(readerMountBlockOf('c2', 'shelf').enabled).toBe(false);  // 带进来的覆盖
        localStorage.removeItem(READER_MOUNT_KEY);
    });

    it('每块都有名字和默认关键词（书名那块是动态的，静态留空）', () => {
        for (const id of READER_MOUNT_BLOCK_IDS) {
            expect(DEFAULT_READER_BLOCKS[id]).toBeTruthy();
            if (id !== 'book') expect(DEFAULT_READER_BLOCKS[id].key.length).toBeGreaterThan(0);
        }
        expect(DEFAULT_READER_BLOCKS.book.key).toEqual([]);
    });
});

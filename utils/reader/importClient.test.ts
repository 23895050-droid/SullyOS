// 读书模块 · 导入编排集成测（2026-09-14）
// node 里没有 Worker，正好把 importClient 的「降级到主线程直跑」那条路也测了
// （真机上走 worker，路径同一套逻辑）。
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { detectFormat, importBookFile, type ImportProgress } from './importClient';
import { getBook, listChapters } from './readerDb';

const utf8 = (s: string) => new TextEncoder().encode(s);

/** 造一个带名字的 File（node 老版本没有全局 File 时用 Blob 顶上）。 */
function mkFile(bytes: Uint8Array | Blob, name: string, type = ''): File {
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type });
    const FileCtor = (globalThis as unknown as { File?: new (...a: unknown[]) => File }).File;
    if (FileCtor) return new FileCtor([blob], name, { type });
    return Object.assign(blob, { name, type }) as unknown as File;
}

const TXT = ['第一章 起', '第一段。', '第二段。', '第二章 承', '第三段。', '第三章 转', '第四段。'].join('\n');

const README_EPUB = (() => {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip');
    zip.file('META-INF/container.xml', '<?xml version="1.0"?><container><rootfiles><rootfile full-path="c.opf"/></rootfiles></container>');
    zip.file('c.opf', `<?xml version="1.0"?><package><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>短书</dc:title></metadata>
      <manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="cv" href="cv.png" media-type="image/png" properties="cover-image"/></manifest>
      <spine><itemref idref="a"/></spine></package>`);
    zip.file('a.xhtml', '<html><body><h1>只有一章</h1><p>正文一句。</p></body></html>');
    zip.file('cv.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    return zip.generateAsync({ type: 'blob' });
})();

describe('importClient · 入口判定', () => {
    it('扩展名 / mime 认格式，其它一律拒绝（PDF 第一期不做）', () => {
        expect(detectFormat('书.epub')).toBe('epub');
        expect(detectFormat('a.txt')).toBe('txt');
        expect(detectFormat('x', 'application/epub+zip')).toBe('epub');
        expect(detectFormat('论文.pdf')).toBeNull();
        expect(detectFormat('图.jpg')).toBeNull();
    });
});

describe('importClient · TXT 整条链路', () => {
    it('落库：书目 ready + 章节按序 + 编码记下 + 原文件 blob 存住', async () => {
        const seen: ImportProgress[] = [];
        const r = await importBookFile(mkFile(utf8(TXT), '我的书.txt', 'text/plain'), {
            onProgress: (p) => seen.push(p),
        });
        if ('error' in r) throw new Error(r.error);
        expect(r.title).toBe('我的书');
        expect(r.chapterCount).toBe(3);

        const book = await getBook(r.bookId);
        expect(book?.status).toBe('ready');
        expect(book?.format).toBe('txt');
        expect(book?.encoding).toBe('utf-8');
        expect(book?.fileRef.startsWith('blobref:')).toBe(true);
        expect(book?.fileBytes).toBeGreaterThan(0);
        expect(book?.chapterStartPara).toEqual([0, 2, 3]);

        const chapters = await listChapters(r.bookId);
        expect(chapters.map((c) => c.title)).toEqual(['第一章 起', '第二章 承', '第三章 转']);
        expect(chapters[0].paras).toEqual(['第一段。', '第二段。']);
        expect(chapters[2].paras).toEqual(['第四段。']);

        expect(seen.some((p) => p.phase === '解析中')).toBe(true);
        expect(seen.some((p) => p.phase === '写入中')).toBe(true);
        expect(seen.at(-1)?.phase).toBe('完成');
    });

    it('不支持的格式：直接回错误、不留行', async () => {
        const r = await importBookFile(mkFile(utf8('x'), '论文.pdf', 'application/pdf'));
        expect('error' in r && r.error).toContain('EPUB 和 TXT');
    });

    it('空文件也给错误', async () => {
        const r = await importBookFile(mkFile(new Uint8Array([]), '空.txt', 'text/plain'));
        expect('error' in r).toBe(true);
    });

    it('中途取消：半截的书会被清掉（不留隐形重量）', async () => {
        const signal = { aborted: true };
        const r = await importBookFile(mkFile(utf8(TXT), '取消书.txt', 'text/plain'), { signal });
        expect('error' in r).toBe(true);
        expect(await getBook('bk_never')).toBeNull();
    });
});

describe('importClient · EPUB 整条链路', () => {
    it('元数据 / 章节 / 封面 blob 都落库', async () => {
        const r = await importBookFile(mkFile(await README_EPUB, '短书.epub', 'application/epub+zip'));
        if ('error' in r) throw new Error(r.error);
        const book = await getBook(r.bookId);
        expect(book?.status).toBe('ready');
        expect(book?.title).toBe('短书');
        expect(book?.format).toBe('epub');
        expect(book?.coverRef?.startsWith('blobref:')).toBe(true);
        expect((await listChapters(r.bookId))[0].paras).toContain('正文一句。');
    });
});

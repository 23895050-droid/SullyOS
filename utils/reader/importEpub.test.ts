// 读书模块 · EPUB 解析单测（2026-09-14）
// 用 jszip 现搭一个最小 EPUB（container → OPF → spine → nav + 封面），在纯 node 里跑。
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { parseEpub, xhtmlToParagraphs } from './importEpub';

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const OPF = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>海边的书</dc:title>
    <dc:creator>某人</dc:creator>
    <dc:language>zh</dc:language>
    <meta name="cover" content="cover-img"/>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="cover-img" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>
  </manifest>
  <spine><itemref idref="c1"/><itemref idref="c2"/></spine>
</package>`;

const NAV = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title></head>
<body><nav epub:type="toc"><ol>
  <li><a href="ch1.xhtml">第一章 启航</a></li>
  <li><a href="ch2.xhtml">第二章 归港</a></li>
</ol></nav></body></html>`;

const CH1 = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>ch1</title><style>p{color:red}</style></head>
<body><h1>第一章 启航</h1>
<p>船在清晨离港。</p>
<p>海面上有雾，&amp;远处传来汽笛声。</p>
<div><p>他站在船头，没有回头。</p></div>
</body></html>`;

const CH2 = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>ch2</title></head>
<body><h1>第二章 归港</h1><p>很多年以后，船回来了。</p><p>港口空着。<br/>只留下一封信。</p></body></html>`;

async function buildEpub(): Promise<Blob> {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip');
    zip.file('META-INF/container.xml', CONTAINER);
    zip.file('OEBPS/content.opf', OPF);
    zip.file('OEBPS/nav.xhtml', NAV);
    zip.file('OEBPS/ch1.xhtml', CH1);
    zip.file('OEBPS/ch2.xhtml', CH2);
    zip.file('OEBPS/images/cover.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));
    return zip.generateAsync({ type: 'blob' });
}

describe('importEpub · XHTML 抽段', () => {
    it('块级标签分段、剥标签、还原实体，style/script 不产文本', () => {
        expect(xhtmlToParagraphs(CH1)).toEqual([
            '第一章 启航',
            '船在清晨离港。',
            '海面上有雾，&远处传来汽笛声。',
            '他站在船头，没有回头。',
        ]);
    });

    it('br 当一个换行边界（不粘成一段）', () => {
        const paras = xhtmlToParagraphs('<body><p>港口空着。<br/>只留下一封信。</p></body>');
        expect(paras).toEqual(['港口空着。', '只留下一封信。']);
    });
});

describe('importEpub · 整条链路', () => {
    it('元数据 / 章名（取目录）/ 段号单调 / 封面字节都拿到', async () => {
        const epub = await buildEpub();
        const r = await parseEpub(epub, { fileName: '海边的书.epub' });
        if ('error' in r) throw new Error(r.error);
        expect(r.meta.title).toBe('海边的书');
        expect(r.meta.author).toBe('某人');
        expect(r.chapters.map((c) => c.title)).toEqual(['第一章 启航', '第二章 归港']);
        expect(r.chapters[0].paras).toEqual([
            '第一章 启航',   // 正文里的 h1 也保留（EPUB 由 spine 切章，标题行不另剥）
            '船在清晨离港。',
            '海面上有雾，&远处传来汽笛声。',
            '他站在船头，没有回头。',
        ]);
        expect(r.chapterStartPara).toEqual([0, 4]);
        expect(r.toc).toHaveLength(2);
        expect(r.totalChars).toBeGreaterThan(20);
        expect(r.contentRev).toMatch(/^[0-9a-f]{8}:\d+$/);
        expect(r.cover?.mime).toBe('image/jpeg');
        expect(new Uint8Array(r.cover!.bytes)[0]).toBe(0xff);
        expect(r.encoding).toBe('utf-8');
    });

    it('坏文件给 error 而不是抛异常', async () => {
        const notZip = new Blob([new Uint8Array([1, 2, 3, 4])]);
        const r = await parseEpub(notZip);
        expect('error' in r).toBe(true);
    });

    it('是 zip 但不是 EPUB（缺 container.xml）也给 error', async () => {
        const zip = new JSZip();
        zip.file('readme.txt', 'hi');
        const r = await parseEpub(await zip.generateAsync({ type: 'blob' }));
        expect('error' in r).toBe(true);
    });
});

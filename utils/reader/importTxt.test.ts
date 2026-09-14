// 读书模块 · 解码 / 归一化 / TXT 导入 单测（2026-09-14）
// 纯函数，不碰 IndexedDB。
import { describe, expect, it } from 'vitest';
import { decodeTextBytes, scoreDecodedText } from './decodeText';
import { contentRevOf, matchChapterHeading, normalizeParagraphs, reflowLines, splitChapters, splitTextToChapters } from './normalize';
import { fileNameToTitle, parseTxt } from './importTxt';

const utf8 = (s: string) => new TextEncoder().encode(s);

// GBK 字节（手工核过的常用码位）：你好，世界 = C4E3 BAC3 A3AC CAC0 BDE7
const GBK_HELLO = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3, 0xa3, 0xac, 0xca, 0xc0, 0xbd, 0xe7]);
const GBK_HANZI = '你好，世界';

describe('decodeText · 编码探测', () => {
    it('UTF-8 BOM：认出 BOM 并剥掉', () => {
        const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('第一章\n内容')]);
        const r = decodeTextBytes(bytes);
        expect('error' in r).toBe(false);
        if ('error' in r) return;
        expect(r.via).toBe('bom');
        expect(r.encoding).toBe('utf-8');
        expect(r.text).toBe('第一章\n内容');
    });

    it('无 BOM 的 UTF-8：整文件 fatal 试解通过', () => {
        const r = decodeTextBytes(utf8('中文测试 text'));
        if ('error' in r) throw new Error(r.error);
        expect(r.via).toBe('utf8');
        expect(r.text).toBe('中文测试 text');
    });

    it('GBK 中文：候选打分选出 gb18030，文本正确', () => {
        const r = decodeTextBytes(GBK_HELLO);
        if ('error' in r) throw new Error(r.error);
        expect(r.text).toBe(GBK_HANZI);
        expect(r.encoding.startsWith('gb')).toBe(true);
    });

    it('用户强制编码：直接用它，且不影响别的路径', () => {
        const r = decodeTextBytes(GBK_HELLO, 'gb18030');
        if ('error' in r) throw new Error(r.error);
        expect(r.via).toBe('forced');
        expect(r.text).toBe(GBK_HANZI);
    });

    it('强制编码解不出来 → 回错误信息（导入卡显示人话）', () => {
        const r = decodeTextBytes(GBK_HELLO, 'utf-8');
        expect('error' in r).toBe(true);
    });

    it('打分：正常中文 > 乱码', () => {
        expect(scoreDecodedText('今天天气很好，我们出去走走吧。'))
            .toBeGreaterThan(scoreDecodedText('浠婂ぉ澶╂皵寰堝ソ'));
    });
});

describe('normalize · 段落与折行', () => {
    it('段首缩进/全角空格/连续空白都收干净，空段丢掉', () => {
        expect(normalizeParagraphs(['　　他 说 ：', '   ', '\t你好'])).toEqual(['他 说 ：', '你好']);
    });

    it('硬折行还原：上一行没句末标点才接下一行', () => {
        expect(reflowLines(['这是一段被硬回车断开的', '长句子，接下去。', '“你好。”', '“再见。”']))
            .toEqual(['这是一段被硬回车断开的长句子，接下去。', '“你好。”', '“再见。”']);
    });

    it('contentRev 同样输入同值、改一个字就变', () => {
        expect(contentRevOf('abc')).toBe(contentRevOf('abc'));
        expect(contentRevOf('abc')).not.toBe(contentRevOf('abd'));
    });
});

describe('normalize · 章节切分', () => {
    it('第一章/第二章/第三章 命中标题，标题之前的正文进「开篇」', () => {
        const paras = ['引子一段', '第一章 起点', '正文一', '第二章 转折', '正文二', '第三章 尾声', '正文三'];
        const chapters = splitChapters(paras);
        expect(chapters.map((c) => c.title)).toEqual(['开篇', '第一章 起点', '第二章 转折', '第三章 尾声']);
        expect(chapters[0].paras).toEqual(['引子一段']);
        expect(chapters[1].paras).toEqual(['正文一']);   // 标题行不进正文
        expect(chapters[2].paras).toEqual(['正文二']);
    });

    it('标题不足 3 个 → 柔性虚拟分卷（不给一本书一章）', () => {
        const paras = Array.from({ length: 12 }, (_, i) => 'x'.repeat(1000) + i);
        const chapters = splitChapters(paras, 3000);
        expect(chapters.length).toBeGreaterThan(1);
        expect(chapters.every((c) => c.title.startsWith('第 '))).toBe(true);
        // 没有段落被丢掉
        expect(chapters.reduce((n, c) => n + c.paras.length, 0)).toBe(paras.length);
    });

    it('「第二天早上」这类句子不会被误判成标题', () => {
        expect(matchChapterHeading('第二天早上，他醒得很早。')).toBeNull();
        expect(matchChapterHeading('第三章 归途')).toBe('第三章 归途');
        expect(matchChapterHeading('Chapter 3: The Return')).toBe('Chapter 3: The Return');
    });
});

describe('importTxt · 整条链路', () => {
    it('UTF-8 三章：段号全书单调 / 目录 / 字数 / 指纹', () => {
        const text = [
            '第一章 开始', '第一段。', '第二段。',
            '第二章 继续', '第三段。',
            '第三章 结束', '第四段。', '第五段。',
        ].join('\n');
        const r = parseTxt(utf8(text), { fileName: '我的书.txt' });
        if ('error' in r) throw new Error(r.error);
        expect(r.chapters.map((c) => c.title)).toEqual(['第一章 开始', '第二章 继续', '第三章 结束']);
        // 正文段（标题行不算段）：ch1=[0,1] ch2=[2] ch3=[3,4] → 段号全书单调
        expect(r.chapterStartPara).toEqual([0, 2, 3]);
        expect(r.toc).toHaveLength(3);
        expect(r.totalChars).toBe('第一段。第二段。第三段。第四段。第五段。'.length);
        expect(r.meta.title).toBe('我的书');
        expect(r.encoding).toBe('utf-8');
        expect(r.contentRev).toMatch(/^[0-9a-f]{8}:\d+$/);
    });

    it('GBK 文件走通（含中文标点），编码记进 payload', () => {
        const bytes = new Uint8Array([...GBK_HELLO]);
        const r = parseTxt(bytes, { fileName: 'gbk.txt' });
        if ('error' in r) throw new Error(r.error);
        expect(r.chapters[0].paras.join('')).toContain(GBK_HANZI);
        expect(r.encoding?.startsWith('gb')).toBe(true);
    });

    it('强制编码失败 → error 而不是抛异常', () => {
        const r = parseTxt(GBK_HELLO, { forcedEncoding: 'utf-8' });
        expect('error' in r).toBe(true);
    });

    it('同一份文本切两次 → 指纹一致（锚点可跨导入校验）', () => {
        const text = '第一章\n甲。\n第二章\n乙。\n第三章\n丙。';
        const a = parseTxt(utf8(text));
        const b = parseTxt(utf8(text));
        if ('error' in a || 'error' in b) throw new Error('unexpected');
        expect(a.contentRev).toBe(b.contentRev);
        expect(splitTextToChapters(text).length).toBe(3);
    });

    it('文件名去扩展名当书名', () => {
        expect(fileNameToTitle('三体（全集）.epub')).toBe('三体（全集）');
        expect(fileNameToTitle('noext')).toBe('noext');
    });
});

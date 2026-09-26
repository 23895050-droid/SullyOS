import { describe, expect, it } from 'vitest';
import { forwardLineText, forwardNoteText, type NoteForwardCard } from './forwardText';

const full: NoteForwardCard = {
    kind: '笔记',
    title: '额尔古纳河右岸',
    author: '迟子建',
    chapter: '第 1 章',
    quote: '我是雨和雪的老熟人了。',
    note: '这句有点像那天晚上。',
    by: 'Angel',
    at: '2026-09-26 12:41',
    thread: [
        { who: '阿一', text: '我是说那种晃。', at: '2026-09-16 21:01' },
        { who: 'Angel', text: '我知道你说的是哪种。', at: '2026-09-16 21:03' },
    ],
};

describe('转出去的笔记写成给 AI 读的那段话', () => {
    it('书名、作者、正文、批注、讨论、时间，一样都不少', () => {
        const text = forwardNoteText(full);
        expect(text).toContain('《额尔古纳河右岸》');
        expect(text).toContain('迟子建');
        expect(text).toContain('正文：「我是雨和雪的老熟人了。」');
        expect(text).toContain('批注（Angel，2026-09-26 12:41）：这句有点像那天晚上。');
        expect(text).toContain('笔记写在 2026-09-26 12:41');
        expect(text).toContain('第 1 章');
    });

    it('每个说话的人都标了名字和时间', () => {
        const text = forwardNoteText(full);
        expect(text).toContain('阿一（2026-09-16 21:01）：我是说那种晃。');
        expect(text).toContain('Angel（2026-09-16 21:03）：我知道你说的是哪种。');
        expect(text.split('\n').findIndex((l) => l === '讨论：')).toBeGreaterThan(0);
    });

    it('只划了线没写批注：不占一行空的', () => {
        const text = forwardNoteText({ ...full, note: undefined, thread: undefined });
        expect(text).not.toContain('批注');
        expect(text).not.toContain('讨论');
        expect(text).toContain('正文：「我是雨和雪的老熟人了。」');
    });

    it('作者没填也能转（只少那一截）', () => {
        const text = forwardNoteText({ ...full, author: undefined });
        expect(text.split('\n')[0]).toBe('【笔记】《额尔古纳河右岸》');
    });

    it('讨论一行没写时间也读得通', () => {
        expect(forwardLineText({ who: '旁白', text: '窗外下雨了。' })).toBe('旁白：窗外下雨了。');
    });
});

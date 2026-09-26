// 共读管线里的两个纯函数（2026-09-26，缓存那趟）
//
// 只锁**跟模型返回格式有关**的两处，它们最容易在中转换一家之后悄悄坏掉：
//   · readCachedTokens：「这次提示词白赚了多少」——各家 usage 字段名不一样，认不出来就 0
//   · toBubbles：回复要分气泡，模型偶尔给一整段字符串，得按换行兜底拆开
// 真正拼上下文的顺序在 readCoReadPage / generateThreadReply 里（要打网络，不在这儿测）。
import { describe, expect, it } from 'vitest';
import { readCachedTokens, toBubbles } from './readerChat';

describe('readCachedTokens · 认得出各家报缓存的口径', () => {
    it('OpenAI / 通义 / 月之暗面 / 智谱：prompt_tokens_details.cached_tokens', () => {
        expect(readCachedTokens({ prompt_tokens: 9000, prompt_tokens_details: { cached_tokens: 8192 } })).toBe(8192);
    });

    it('DeepSeek 老口径：prompt_cache_hit_tokens', () => {
        expect(readCachedTokens({ prompt_tokens: 9000, prompt_cache_hit_tokens: 4096 })).toBe(4096);
    });

    it('少数中转直接给 cached_tokens', () => {
        expect(readCachedTokens({ cached_tokens: 2048 })).toBe(2048);
    });

    it('没报 / 报了 0 / 给了脏值 → 一律 0（0 的语义是「这家不报」，不是「没命中」）', () => {
        expect(readCachedTokens(undefined)).toBe(0);
        expect(readCachedTokens({})).toBe(0);
        expect(readCachedTokens({ prompt_tokens_details: { cached_tokens: 0 } })).toBe(0);
        expect(readCachedTokens({ prompt_cache_hit_tokens: 'N/A' })).toBe(0);
        expect(readCachedTokens({ cached_tokens: -5 })).toBe(0);
    });

    it('小数向下取整（有的中转给的是浮点）', () => {
        expect(readCachedTokens({ cached_tokens: 1024.7 })).toBe(1024);
    });
});

describe('toBubbles · 回复分气泡', () => {
    it('数组就直接用（提示词要的格式）', () => {
        expect(toBubbles(['嗯', '这句我也停了一下'])).toEqual(['嗯', '这句我也停了一下']);
    });

    it('数组里有空白项 → 去掉；全是空白 → 落到字符串兜底', () => {
        expect(toBubbles(['  ', '有一句'])).toEqual(['有一句']);
        expect(toBubbles(['  ', ''])).toEqual([]);
    });

    it('模型给了一整段 → 按换行拆开，一条一句', () => {
        expect(toBubbles('第一句\n\n第二句\n第三句')).toEqual(['第一句', '第二句', '第三句']);
    });

    it('什么都没有 → 空数组（调用方靠它判「他没说话」）', () => {
        expect(toBubbles(undefined)).toEqual([]);
        expect(toBubbles('   ')).toEqual([]);
    });
});

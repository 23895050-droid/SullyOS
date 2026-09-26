// 生图的图怎么落进消息（2026-09-26）
//
// 锁一条口径：**图落进消息时存短令牌，不存 base64**。
// 她描述的「生图之后整个 App 半天加载不出来、把图压成二进制就好了」就是 base64 惹的——
// 一条消息里塞几 MB 的字符串，谁读这批消息谁就得扛着走。
import { describe, expect, it } from 'vitest';
import { storeImageContent } from './photoTagHandler';
import { getBlobForRef, isBlobRef } from './blobRef';

/** 1×1 的真 PNG，够验「转得动、拿得回来」 */
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('storeImageContent · 图落库时存什么', () => {
    it('data URL → 存成短令牌，令牌比原来的 base64 短一大截', async () => {
        const token = await storeImageContent({ dataUrl: TINY_PNG });
        expect(isBlobRef(token)).toBe(true);
        expect(token.length).toBeLessThan(TINY_PNG.length / 2);
    });

    it('令牌拿得回原来那张图（不是把图弄丢了换个空壳）', async () => {
        const token = await storeImageContent({ dataUrl: TINY_PNG });
        const blob = await getBlobForRef(token);
        expect(blob).not.toBeNull();
        expect(blob!.size).toBeGreaterThan(0);
    });

    it('生成时就给过令牌 → 直接用它，不再转一遍', async () => {
        expect(await storeImageContent({ dataUrl: TINY_PNG, blobRef: 'blobref:b_seed' })).toBe('blobref:b_seed');
    });

    it('本来就不是 data URL（http 外链 / 已经是令牌）→ 原样过', async () => {
        expect(await storeImageContent({ dataUrl: 'https://example.com/a.png' })).toBe('https://example.com/a.png');
        expect(await storeImageContent({ dataUrl: 'blobref:b_already' })).toBe('blobref:b_already');
    });

    it('什么都没有 → 空串，不炸（生图失败那条路会走到这儿）', async () => {
        expect(await storeImageContent({})).toBe('');
        expect(await storeImageContent({ dataUrl: undefined })).toBe('');
    });
});

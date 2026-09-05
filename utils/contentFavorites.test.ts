import { beforeEach, describe, expect, it } from 'vitest';
import type { GalleryImage, Message } from '../types';
import { DB } from './db';
import {
    CONTENT_FAVORITES_INDEX_ASSET_ID,
    contentFavoriteIdForMessage,
    favoriteImageAssetId,
    listContentFavorites,
    removeContentFavoriteById,
    resolveContentFavorite,
    saveGalleryImageContentFavorite,
    saveMessageContentFavorite,
} from './contentFavorites';

const CHAR_ID = 'content-favorite-test-char';

const message = (overrides: Partial<Message> = {}): Message => ({
    id: 701,
    charId: CHAR_ID,
    role: 'assistant',
    type: 'text',
    content: '只存在于原消息里的正文',
    timestamp: 100,
    ...overrides,
});

beforeEach(async () => {
    await DB.deleteAsset(CONTENT_FAVORITES_INDEX_ASSET_ID).catch(() => undefined);
    await DB.clearMessages(CHAR_ID).catch(() => undefined);
    const images = await DB.getGalleryImages(CHAR_ID).catch(() => []);
    await Promise.all(images.map(image => DB.deleteGalleryImage(image.id)));
});

describe('content favorites reference index', () => {
    it('keeps a lightweight chat snapshot readable after the original is deleted', async () => {
        const sourceId = await DB.saveMessage({
            charId: CHAR_ID,
            role: 'assistant',
            type: 'text',
            content: '只存在于原消息里的正文',
        });
        const source = message({ id: sourceId });
        await saveMessageContentFavorite(source, 'Sully');

        const items = await listContentFavorites();
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            kind: 'chat',
            messageId: source.id,
            charId: CHAR_ID,
        });
        expect(items[0].kind === 'chat' && items[0].snapshot?.content).toBe(source.content);

        await DB.deleteMessage(source.id);
        const resolved = await resolveContentFavorite((await listContentFavorites())[0]);
        expect('message' in resolved && resolved.message?.content).toBe(source.content);
        expect('sourceAvailable' in resolved && resolved.sourceAvailable).toBe(false);
    });

    it('deduplicates the same image across chat and gallery while keeping a favorite-owned copy', async () => {
        const url = 'data:image/png;base64,QUJDREVGRw==';
        const sourceMessageId = await DB.saveMessage({
            charId: CHAR_ID,
            role: 'assistant',
            type: 'image',
            content: url,
        });
        const sourceMessage = message({ id: sourceMessageId, type: 'image', content: url });
        const galleryImage: GalleryImage = {
            id: 'favorite-gallery-702',
            charId: CHAR_ID,
            url,
            timestamp: 101,
        };

        await DB.saveGalleryImage(galleryImage);
        await saveMessageContentFavorite(sourceMessage, 'Sully');
        const linkedFromChat = (await listContentFavorites())[0];
        expect(linkedFromChat.kind === 'image' ? linkedFromChat.references : []).toHaveLength(3);
        const retainedAssetId = favoriteImageAssetId(linkedFromChat.kind === 'image' ? linkedFromChat.fingerprint : '');
        // 收藏时刻就写好 favorite-owned 副本（索引本身仍不携带媒体）
        expect(await DB.getAssetRaw(retainedAssetId)).toMatchObject({ imageUrl: url });

        await saveGalleryImageContentFavorite(galleryImage, 'Sully');
        const items = await listContentFavorites();
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ kind: 'image', id: contentFavoriteIdForMessage(sourceMessage) });
        expect(items[0].kind === 'image' && items[0].references).toHaveLength(3);
        const rawIndex = JSON.stringify(await DB.getAssetRaw(CONTENT_FAVORITES_INDEX_ASSET_ID));
        expect(rawIndex).not.toContain(url);
        expect(rawIndex).not.toContain('base64');

        await DB.deleteMessage(sourceMessage.id);
        await DB.deleteGalleryImage(galleryImage.id);

        const retained = (await listContentFavorites())[0];
        const resolved = await resolveContentFavorite(retained);
        expect(resolved.favorite.kind).toBe('image');
        expect('imageUrl' in resolved && resolved.imageUrl).toBe(url);
        expect('reference' in resolved && resolved.reference?.source).toBe('favorite_asset');
        expect(await DB.getAssetRaw(retainedAssetId)).toMatchObject({ imageUrl: url });

        // 活源回来后再收藏：副本按同一指纹原地覆盖，不增不减
        await DB.saveGalleryImage(galleryImage);
        await saveGalleryImageContentFavorite(galleryImage, 'Sully');
        expect(await DB.getAssetRaw(retainedAssetId)).toMatchObject({ imageUrl: url });
        await DB.deleteGalleryImage(galleryImage.id);
        expect(await DB.getAssetRaw(retainedAssetId)).toMatchObject({ imageUrl: url });

        await removeContentFavoriteById(retained.id);
        expect(await DB.getAssetRaw(retainedAssetId)).toBeNull();
    });

    it('keeps favorites whose image content is a blobref token resolvable and deletion-proof', async () => {
        const token = 'blobref:b_token_content_test';
        const sourceMessageId = await DB.saveMessage({
            charId: CHAR_ID,
            role: 'assistant',
            type: 'image',
            content: token,
        });
        const sourceMessage = message({ id: sourceMessageId, type: 'image', content: token });
        await saveMessageContentFavorite(sourceMessage, 'Sully');

        const retained = (await listContentFavorites())[0];
        expect(retained.kind).toBe('image');
        const assetId = favoriteImageAssetId(retained.kind === 'image' ? retained.fingerprint : '');
        expect(await DB.getAssetRaw(assetId)).toMatchObject({ imageUrl: token });

        // 令牌内容原样解析出来（渲染端 TokenImg 负责把令牌变成可用的 objectURL）
        const resolved = await resolveContentFavorite(retained);
        expect('imageUrl' in resolved && resolved.imageUrl).toBe(token);
        expect('reference' in resolved && resolved.reference?.source).toBe('chat');

        // 原消息删除后改由副本供图，依然返回令牌
        await DB.deleteMessage(sourceMessage.id);
        const after = await resolveContentFavorite((await listContentFavorites())[0]);
        expect('imageUrl' in after && after.imageUrl).toBe(token);
        expect('reference' in after && after.reference?.source).toBe('favorite_asset');
    });
});

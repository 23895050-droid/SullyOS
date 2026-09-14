// 我们自己的「常驻 objectURL 缓存」hook（2026-09-14）——插件化原则：能不动上游文件就不动。
//
// 背景：上游的 useBlobRefUrl 每次挂载都异步读一次 IDB 才拿得到 objectURL、卸载立刻 revoke；
// 页面/页签切换会把整棵子树重挂载，那一屏的 blobref 图片（整屏背景、头像、照片、封面）
// 就全部先空一帧再长出来 —— 看起来就是「切页面闪一下」。
//
// 这里把 objectURL 的生命周期收到我们自己的模块里：同一个令牌只建一次、卸载不 revoke、
// 重挂载在渲染期就命中（首帧即有图）。上游 utils/blobRef.ts 只留一行接进来，将来上游
// 改那个 hook，我们照原样重新接一次即可，缓存逻辑不受影响。
//
// 代价与边界（她 2026-09-14 问「原来那样设计应该有原因吧」——有，是为了内存）：
// objectURL 会把 Blob 一直吊在内存里，标准做法就是卸载即 revoke。我们改成常驻，
// 换「切页面不闪」；所以这里按 条数(256) + 字节(48MB) 双上限 LRU 淘汰，淘汰时才 revoke，
// 内存有界、且只按原图字节算（解码后的位图仍由浏览器自己按需回收）。
// 令牌 id 内容寻址（同一 id = 同一份字节），所以缓存不会过期；blob 被删后旧 URL 还活着
// 只是多占一点内存，淘汰即回收；引用该令牌的界面在数据里已经指不到它，不会显示错图。

import { useEffect, useState } from 'react';
import { blobStore } from './blobStore';

// ── 常驻缓存本体 ────────────────────────────────────────────────
const BLOB_URL_CACHE = new Map<string, { url: string; size: number }>();
const BLOB_URL_CACHE_MAX = 256;                      // 条数上限
const BLOB_URL_CACHE_MAX_BYTES = 48 * 1024 * 1024;   // 字节上限：别把手机内存吃满（解码后的图按需由浏览器自己丢，这里只按原图字节算）
let blobUrlCacheBytes = 0;
const BLOB_URL_INFLIGHT = new Map<string, Promise<string | undefined>>();

/** 超上限就按最旧的开始淘汰并 revoke（只有这一条路径会 revoke，条数和字节数都得守住） */
const evictBlobUrls = () => {
    while (BLOB_URL_CACHE.size > BLOB_URL_CACHE_MAX
        || (blobUrlCacheBytes > BLOB_URL_CACHE_MAX_BYTES && BLOB_URL_CACHE.size > 1)) {
        const oldest = BLOB_URL_CACHE.keys().next().value as string | undefined;
        if (oldest === undefined) return;
        const entry = BLOB_URL_CACHE.get(oldest);
        BLOB_URL_CACHE.delete(oldest);
        if (entry) {
            blobUrlCacheBytes -= entry.size;
            URL.revokeObjectURL(entry.url);
        }
    }
};

/** 取（或建）某个令牌的常驻 objectURL；同一令牌并发请求只读一次 Blob、只建一个 URL */
const getCachedBlobUrl = (ref: string): Promise<string | undefined> => {
    const hit = BLOB_URL_CACHE.get(ref);
    if (hit) return Promise.resolve(hit.url);
    const inflight = BLOB_URL_INFLIGHT.get(ref);
    if (inflight) return inflight;
    const task = blobStore
        .get(ref)
        .then((blob) => {
            if (!blob) return undefined;
            const url = URL.createObjectURL(blob);
            const existing = BLOB_URL_CACHE.get(ref);
            if (existing) { URL.revokeObjectURL(url); return existing.url; } // 竞态兜底：留先到的
            BLOB_URL_CACHE.set(ref, { url, size: blob.size });
            blobUrlCacheBytes += blob.size;
            evictBlobUrls();
            return url;
        })
        .catch(() => undefined)
        .finally(() => { BLOB_URL_INFLIGHT.delete(ref); });
    BLOB_URL_INFLIGHT.set(ref, task);
    return task;
};

/** 仅测试用：清空缓存（连带 revoke 自己建过的 URL） */
export const __clearBlobUrlCacheForTest = () => {
    for (const entry of BLOB_URL_CACHE.values()) URL.revokeObjectURL(entry.url);
    BLOB_URL_CACHE.clear();
    BLOB_URL_INFLIGHT.clear();
    blobUrlCacheBytes = 0;
};

/** 缓存版 hook：blobref 走上面的常驻缓存，其余值原样透传（渲染期同步，无一帧滞后） */
export function useCachedBlobUrl(resolved: string | undefined | null): string | undefined {
    const ref = blobStore.isRef(resolved) ? resolved : null;
    const [url, setUrl] = useState<string | undefined>(() =>
        ref ? BLOB_URL_CACHE.get(ref)?.url : (resolved ?? undefined),
    );
    useEffect(() => {
        if (!ref) { setUrl(resolved ?? undefined); return; }
        const cached = BLOB_URL_CACHE.get(ref);
        if (cached) { setUrl(cached.url); return; } // 命中缓存：重挂载首帧就有图
        let alive = true;
        setUrl(undefined);
        void getCachedBlobUrl(ref).then((u) => { if (alive) setUrl(u); });
        // 不 revoke：URL 交给缓存淘汰（卸载就 revoke 正是「切页面闪」的成因）
        return () => { alive = false; };
    }, [ref, resolved]);
    return ref ? url : (resolved ?? undefined);
}


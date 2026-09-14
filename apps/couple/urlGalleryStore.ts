// 外链图库 store（2026-09-14 外链通道）——「我桶里有什么」的直观清单：
// 存 URL / 看缩略图 / 复制链接 / 删除 + 桶到期倒计时。
//
// 只存链接、不打包图片：槽位和图库里都是纯字符串 URL，渲染层原样透传
// （utils/blobRef.ts），备份（utils/ourDataBackup.ts 的 album scope）只带链接文本。
// 上传到自己桶（要桶名/密钥）是第二步，本 store 的字段先按那一步预留 name。
import { createCoupleStore, uid, isoNow } from './coupleStoreBase';
import { normalizeImageUrl, urlDisplayName, parseUrlList } from './urlGalleryMath';

export interface UrlImage {
  id: string;
  url: string;
  /** 显示名（添加时从 URL 猜，可改） */
  name: string;
  addedAt: string;
}

export interface UrlGalleryState {
  version: number;
  updatedAt: string;
  items: UrlImage[];
  /** 桶到期日（YYYY-MM-DD）——顶部倒计时条用；默认她的腾讯云 COS 桶 */
  bucketExpiry: string;
}

/** 她的腾讯云 COS 桶到期日（2026-09-14 她给的；可在图库页里改） */
export const DEFAULT_BUCKET_EXPIRY = '2026-12-25';

const store = createCoupleStore<UrlGalleryState>('url_gallery_v1', 1, {
  version: 1,
  updatedAt: isoNow(),
  items: [],
  bucketExpiry: DEFAULT_BUCKET_EXPIRY,
});

export const useUrlGallery = store.use;
export const getUrlGallery = store.get;
export const urlGalleryStoreApi = store;

/**
 * 批量添加（支持一次粘贴多行）。同 URL 只留一条（已有的算重复）。
 * 返回给 toast 用的计数。
 */
export function addUrlImages(text: string): { added: number; dup: number; invalid: number } {
  const { urls, invalid } = parseUrlList(text);
  let added = 0;
  let dup = 0;
  store.set((s) => {
    const seen = new Set(s.items.map((i) => i.url));
    const items = [...s.items];
    for (const u of urls) {
      if (seen.has(u)) { dup++; continue; }
      seen.add(u);
      items.push({ id: uid(), url: u, name: urlDisplayName(u), addedAt: isoNow() });
      added++;
    }
    return { ...s, items, updatedAt: isoNow() };
  });
  return { added, dup, invalid: invalid.length };
}

export function removeUrlImage(id: string): void {
  store.set((s) => ({ ...s, items: s.items.filter((i) => i.id !== id), updatedAt: isoNow() }));
}

/**
 * 改显示名 / 改 URL。URL 非法或与别的条重复时不动，返回原因。
 */
export function updateUrlImage(id: string, patch: { name?: string; url?: string }): { ok: boolean; reason?: 'invalid' | 'dup' | 'missing' } {
  let ok = true;
  let reason: 'invalid' | 'dup' | 'missing' | undefined;
  store.set((s) => {
    const idx = s.items.findIndex((i) => i.id === id);
    if (idx < 0) { ok = false; reason = 'missing'; return s; }
    const next = { ...s.items[idx] };
    if (patch.name !== undefined) next.name = patch.name.trim() || urlDisplayName(next.url);
    if (patch.url !== undefined) {
      const u = normalizeImageUrl(patch.url);
      if (!u) { ok = false; reason = 'invalid'; return s; }
      if (s.items.some((i, k) => k !== idx && i.url === u)) { ok = false; reason = 'dup'; return s; }
      next.url = u;
    }
    const items = [...s.items];
    items[idx] = next;
    return { ...s, items, updatedAt: isoNow() };
  });
  return ok ? { ok } : { ok: false, reason };
}

/** 设置桶到期日（YYYY-MM-DD）。格式不对不动，返回 false。 */
export function setBucketExpiry(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) return false;
  store.set((s) => ({ ...s, bucketExpiry: date.trim(), updatedAt: isoNow() }));
  return true;
}

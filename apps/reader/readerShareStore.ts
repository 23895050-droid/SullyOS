// 读书模块 · 书摘分享卡的偏好（2026-09-26）
//
// 只有一件事要记住：**上次挑的那套样子**。她说「正常这个后面的图片也做成可以自定义上传的」，
// 所以上传的底图也存这儿（图本身进 blob 池，这儿只留 blobref 令牌）。
// 出生带 version + ISO 时间戳 + owner（store 规范），走 coupleStoreBase 的工厂。

import { createCoupleStore, isoNow } from '../couple/coupleStoreBase';
import { deleteBlobRefIfUnreferenced } from '../../utils/blobRef';
import { DEFAULT_SHARE_STYLE, type ShareCardStyle } from '../../utils/reader/shareCardDraw';

export interface ReaderShareStore {
    version: number;
    updatedAt: string;
    owner: string;
    /** 卡的样子（主题 / 字体 / 背景 / 圆点 / 落款 / 带不带想法） */
    style: ShareCardStyle;
    /** 她自己上传的底图（blobref 令牌；空 = 没传过） */
    bgRef: string;
    /** 她自己上传的字体（blobref 令牌；空 = 没传过） */
    fontRef: string;
}

const store = createCoupleStore<ReaderShareStore>('reader_share_v1', 1, {
    version: 1,
    updatedAt: isoNow(),
    owner: 'angelica-home',
    style: DEFAULT_SHARE_STYLE,
    bgRef: '',
    fontRef: '',
});

export const getShareStore = store.get;
export const useReaderShareStore = store.use;

/** 改卡的样子（传谁改谁，别的原样） */
export const setShareStyle = (patch: Partial<ShareCardStyle>): void => {
    store.set((s) => ({ ...s, updatedAt: isoNow(), style: { ...s.style, ...patch } }));
};

/**
 * 换底图。**上一次那张顺手回收**（她 09-26 问的「这么塞会不会占存储」）：
 * 图存在 IndexedDB 的 blob 池里（不是 localStorage，撑不爆那 5MB），但也不能白攒着。
 *
 * 回收用的是 `deleteBlobRefIfUnreferenced`——**不是**裸删：令牌可能被别处共享
 * （内容去重会把同一张图收敛成一个令牌，背面还有「优化资源存储」那个合并工具），
 * 裸删会把别处的图删成碎图。它自己会先扫一遍确认没人再引用才动手。
 * 顺序也不能倒：**先把指针写回库里**，再让它去扫（扫描看的是库里的现状）。
 */
export const setShareBgRef = (ref: string): void => {
    const old = store.get().bgRef;
    store.set((s) => ({ ...s, updatedAt: isoNow(), bgRef: ref }));
    if (old && old !== ref) void deleteBlobRefIfUnreferenced(old);
};

/** 换自己传的字体（旧的走同一套回收） */
export const setShareFontRef = (ref: string): void => {
    const old = store.get().fontRef;
    store.set((s) => ({ ...s, updatedAt: isoNow(), fontRef: ref }));
    if (old && old !== ref) void deleteBlobRefIfUnreferenced(old);
};

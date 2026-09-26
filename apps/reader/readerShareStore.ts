// 读书模块 · 书摘分享卡的偏好（2026-09-26）
//
// 只有一件事要记住：**上次挑的那套样子**。她说「正常这个后面的图片也做成可以自定义上传的」，
// 所以上传的底图也存这儿（图本身进 blob 池，这儿只留 blobref 令牌）。
// 出生带 version + ISO 时间戳 + owner（store 规范），走 coupleStoreBase 的工厂。

import { createCoupleStore, isoNow } from '../couple/coupleStoreBase';
import { DEFAULT_SHARE_STYLE, type ShareCardStyle } from '../../utils/reader/shareCardDraw';

export interface ReaderShareStore {
    version: number;
    updatedAt: string;
    owner: string;
    /** 卡的样子（主题 / 字体 / 背景 / 圆点 / 落款 / 带不带想法） */
    style: ShareCardStyle;
    /** 她自己上传的底图（blobref 令牌；空 = 没传过） */
    bgRef: string;
}

const store = createCoupleStore<ReaderShareStore>('reader_share_v1', 1, {
    version: 1,
    updatedAt: isoNow(),
    owner: 'angelica-home',
    style: DEFAULT_SHARE_STYLE,
    bgRef: '',
});

export const getShareStore = store.get;
export const useReaderShareStore = store.use;

/** 改卡的样子（传谁改谁，别的原样） */
export const setShareStyle = (patch: Partial<ShareCardStyle>): void => {
    store.set((s) => ({ ...s, updatedAt: isoNow(), style: { ...s.style, ...patch } }));
};

/** 换底图 */
export const setShareBgRef = (ref: string): void => {
    store.set((s) => ({ ...s, updatedAt: isoNow(), bgRef: ref }));
};

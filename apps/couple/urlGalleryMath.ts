// 外链图库纯函数（2026-09-14 外链通道）：URL 校验 / 批量解析 / 显示名 / 桶到期倒计时。
//
// 只存链接、不打包图片：http(s) 值在渲染层原样透传（utils/blobRef.ts 的
// isImageValue / useBlobRefUrl），备份（utils/ourDataBackup.ts）只带链接文本，零 base64。

/** 合法外链图片地址（http/https）→ 归一后的 URL（去首尾空白）；不合规 → null。 */
export function normalizeImageUrl(raw: string): string | null {
    const t = raw.trim();
    if (!t) return null;
    return /^https?:\/\/\S+$/i.test(t) ? t : null;
}

/**
 * 批量粘贴解析：按换行 / 逗号（中英文）/ 空白切开，逐条归一。
 * 返回保序的合法列表和不合法的原文（给用户看是哪几行没收）。
 */
export function parseUrlList(text: string): { urls: string[]; invalid: string[] } {
    const urls: string[] = [];
    const invalid: string[] = [];
    for (const piece of text.split(/[\s,，]+/)) {
        const t = piece.trim();
        if (!t) continue;
        const u = normalizeImageUrl(t);
        if (u) urls.push(u);
        else invalid.push(t);
    }
    return { urls, invalid };
}

/** 显示名：URL 里的文件名；没有文件名就用域名。解不出就截断原文。 */
export function urlDisplayName(url: string): string {
    try {
        const u = new URL(url);
        const seg = u.pathname.split('/').filter(Boolean).pop() ?? '';
        const name = decodeURIComponent(seg);
        return name || u.hostname;
    } catch {
        return url.slice(0, 40);
    }
}

/**
 * 距桶到期还有几天（到期当天算 0，过期是负数）。日期不合法 → null。
 * 与首屏「在一起天数」同口径：按本地日期整天算，不算小时。
 */
export function daysUntilExpiry(expiry: string, now: Date = new Date()): number | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expiry.trim());
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const end = new Date(y, mo - 1, d);
    if (Number.isNaN(end.getTime()) || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((end.getTime() - today.getTime()) / 86400000);
}

/** 倒计时文案（图库页顶部那条）。日期不合法 → null，调用方不显示。 */
export function expiryText(expiry: string, now: Date = new Date()): { text: string; urgent: boolean } | null {
    const days = daysUntilExpiry(expiry, now);
    if (days === null) return null;
    if (days < 0) return { text: `已过期 ${-days} 天`, urgent: true };
    if (days === 0) return { text: '今天到期', urgent: true };
    return { text: `还有 ${days} 天到期`, urgent: days <= 30 };
}

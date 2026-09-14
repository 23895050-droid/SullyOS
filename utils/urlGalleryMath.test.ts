// 外链图库纯函数守卫（2026-09-14 外链通道）：
// URL 归一 / 批量粘贴解析 / 显示名 / 桶到期倒计时（当天算 0、过期负数、非法日期 null）
import { describe, expect, it } from 'vitest';
import { normalizeImageUrl, parseUrlList, urlDisplayName, daysUntilExpiry, expiryText } from '../apps/couple/urlGalleryMath';

describe('normalizeImageUrl', () => {
  it('认 http/https，去首尾空白', () => {
    expect(normalizeImageUrl('  https://a.com/x.png  ')).toBe('https://a.com/x.png');
    expect(normalizeImageUrl('http://a.com/x.png')).toBe('http://a.com/x.png');
  });
  it('非 http(s) 一律拒绝（防把 blobref / data: / 纯文字当链接存进来）', () => {
    expect(normalizeImageUrl('blobref:b_1')).toBeNull();
    expect(normalizeImageUrl('data:image/png;base64,xx')).toBeNull();
    expect(normalizeImageUrl('a.com/x.png')).toBeNull();
    expect(normalizeImageUrl('ftp://a.com/x.png')).toBeNull();
    expect(normalizeImageUrl('   ')).toBeNull();
  });
});

describe('parseUrlList', () => {
  it('按换行/逗号/空白切开，保序', () => {
    const r = parseUrlList('https://a.com/1.png\nhttps://a.com/2.png， https://a.com/3.png,https://a.com/4.png');
    expect(r.urls).toEqual(['https://a.com/1.png', 'https://a.com/2.png', 'https://a.com/3.png', 'https://a.com/4.png']);
    expect(r.invalid).toEqual([]);
  });
  it('不合法的原文单独收好（给人看是哪几行没收）', () => {
    const r = parseUrlList('https://a.com/1.png\n随便写的一行\nftp://a.com/2.png');
    expect(r.urls).toEqual(['https://a.com/1.png']);
    expect(r.invalid).toEqual(['随便写的一行', 'ftp://a.com/2.png']);
  });
  it('空文本 → 全空', () => {
    expect(parseUrlList('\n\n  \n')).toEqual({ urls: [], invalid: [] });
  });
});

describe('urlDisplayName', () => {
  it('取 URL 文件名', () => {
    expect(urlDisplayName('https://bucket.cos.ap-shanghai.myqcloud.com/photos/2026/猫猫.webp')).toBe('猫猫.webp');
  });
  it('没有文件名就用域名', () => {
    expect(urlDisplayName('https://bucket.cos.ap-shanghai.myqcloud.com/')).toBe('bucket.cos.ap-shanghai.myqcloud.com');
  });
  it('解不出的原文截断兜底', () => {
    expect(urlDisplayName('https://')).toBe('https://');
  });
});

describe('daysUntilExpiry / expiryText', () => {
  const now = new Date(2026, 8, 14); // 2026-09-14
  it('按本地日期整天算：到期当天=0、前一天=1', () => {
    expect(daysUntilExpiry('2026-09-14', now)).toBe(0);
    expect(daysUntilExpiry('2026-09-15', now)).toBe(1);
    expect(daysUntilExpiry('2026-12-25', now)).toBe(102);
  });
  it('过期是负数', () => {
    expect(daysUntilExpiry('2026-09-13', now)).toBe(-1);
  });
  it('非法日期 → null', () => {
    expect(daysUntilExpiry('', now)).toBeNull();
    expect(daysUntilExpiry('2026/12/25', now)).toBeNull();
    expect(daysUntilExpiry('2026-13-01', now)).toBeNull();
  });
  it('文案：>30 天不报警，≤30 天与已过期报警', () => {
    expect(expiryText('2026-12-25', now)).toEqual({ text: '还有 102 天到期', urgent: false });
    expect(expiryText('2026-10-01', now)).toEqual({ text: '还有 17 天到期', urgent: true });
    expect(expiryText('2026-09-14', now)).toEqual({ text: '今天到期', urgent: true });
    expect(expiryText('2026-09-10', now)).toEqual({ text: '已过期 4 天', urgent: true });
    expect(expiryText('乱写的', now)).toBeNull();
  });
});

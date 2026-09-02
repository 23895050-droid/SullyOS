import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// fork 改编：Live2D 批（0addf2fb）未搬运，原版的 Live2D 弹窗断言与
// NETWORK_TRANSIT 排序断言不适用，只保留协同弹窗与手册链接的守卫。
describe('Collaboration update notification references', () => {
  it('adds the collaboration popup before older update notices and names the ChatApp plus-menu route', () => {
    const source = readFileSync(path.resolve(__dirname, '../components/UpdateNotificationEvent.tsx'), 'utf8');
    expect(source).toContain('CollaborationUpdatePopup');
    expect(source).toContain("UPDATE_NOTIFICATION_KEY_2026_08_30 = 'sullyos_update_2026_08_30_collaboration_seen'");
    expect(source).toContain('点输入框左侧的 <b>＋</b>');
    expect(source.indexOf('UPDATE_NOTIFICATION_KEY_2026_08_30, render')).toBeLessThan(source.indexOf('UPDATE_NOTIFICATION_KEY_2026_08_03, render'));
  });

  it('links the handbook collaboration entry to its detailed release note', () => {
    const faqSource = readFileSync(path.resolve(__dirname, '../apps/FAQApp.tsx'), 'utf8');
    const detailSource = readFileSync(path.resolve(__dirname, '../public/changelogs/2026-8-30.html'), 'utf8');
    expect(faqSource).toContain('id: CHANGELOG_2026_08_30');
    expect(faqSource).toContain("src: 'changelogs/2026-8-30.html'");
    expect(detailSource).toContain('ChatApp');
    expect(detailSource).toContain('设置 → 导出');
    expect(detailSource).toContain('长按删除');
  });
});

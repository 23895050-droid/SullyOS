/**
 * 全局音乐 CSS 预设注入器（2026-08-30）。
 *
 * MusicApp 自带的注入器只在音乐 App 内生效（按当前 View 叠「基础 → 当前页 → 角色」）；
 * 全局悬浮窗（GlobalMiniPlayer）挂在 PhoneShell 层、不在音乐 App 里，跟不到那份注入。
 * 这里注入「基础 + 悬浮窗」两层，id 用 mz-css-preset-global 与 App 内的 mz-css-preset 分开，
 * 两边各管各的，互不覆盖。
 */
import React, { useEffect } from 'react';
import { useMusicStore } from '../../apps/couple/musicStore';
import { MUSIC_NIGHT_GLOBAL_CSS } from '../../utils/musicNightPreset';

const GlobalMusicCssPreset: React.FC = () => {
  const musicStore = useMusicStore();
  const css = [
    musicStore.cssPreset === 'night' ? MUSIC_NIGHT_GLOBAL_CSS : '',
    musicStore.cssGlobal,
    musicStore.cssPages.miniplayer ?? '',
    musicStore.cssPages.cards ?? '',   // 音乐卡片渲染在聊天 App 里，也要走全局注入
  ].filter(Boolean).join('\n');

  useEffect(() => {
    let el = document.getElementById('mz-css-preset-global') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'mz-css-preset-global';
      document.head.appendChild(el);
    }
    el.textContent = css;
  }, [css]);

  return null;
};

export default GlobalMusicCssPreset;

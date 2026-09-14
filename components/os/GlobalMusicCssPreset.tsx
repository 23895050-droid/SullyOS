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
import { MUSIC_CARD_BASE_CSS } from '../../utils/musicCardCss';
import { MUSIC_APP_BASE_CSS, MUSIC_MINI_BASE_CSS } from '../../utils/musicAppCss';

const GlobalMusicCssPreset: React.FC = () => {
  const musicStore = useMusicStore();
  const css = [
    // 内置基础层：一起听卡片的背景/边框/文字色（2026-09-13 从 inline 搬来）。
    // 必须排最前——用户层在其后，同权重时后者胜，自定义 CSS 无需 !important。
    MUSIC_APP_BASE_CSS,    // 播放页/聊歌页内置基础层（写死字面值收编，2026-09-13）——放全局：写歌 App 等复用同一批组件
    MUSIC_CARD_BASE_CSS,
    MUSIC_MINI_BASE_CSS,   // 悬浮窗内置基础层
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

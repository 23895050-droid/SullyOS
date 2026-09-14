/**
 * 雫 (shizuku) 主题 — 音乐 App 视觉组件
 * 水滴般清澈 + 二次元装饰: 玻璃拟态, 浮游粒子, 星芒, 柔光, 梦幻渐变
 */
import React, { useEffect } from 'react';
import {
  ArrowLeft, X, MagnifyingGlass,
  Play, Pause, SkipBack, SkipForward, Headphones, CaretRight, MusicNote,
} from '@phosphor-icons/react';
import { isBlobRef, useBlobRefUrl } from '../../utils/blobRef';
import TokenImg from '../../components/os/TokenImg';

/* ══════════ 色板 — 水滴 × 星空 ══════════ */
/* 2026-08-26 CSS 预设机制：全部 token 桥接成 CSS 变量（var(--mz-*, 默认值)）。
   预设 CSS 只需要覆盖 --mz-* 自定义属性就能整体换肤；默认值不变，零逻辑改动。 */
export const C = {
  bg:       'var(--mz-bg, #fbfbff)',       // 几乎纯白 (一抹紫灰)
  bgDeep:   'var(--mz-bgDeep, #f3f1fa)',   // 轻雾紫
  bgTint:   'var(--mz-bgTint, #ebe9f5)',   // 最深层也只是浅紫雾
  primary:  'var(--mz-primary, #807c9d)',  // 淡紫调灰 — 比深紫更柔，饱和度更低
  accent:   'var(--mz-accent, #b3a8ce)',   // 淡紫
  soft:     'var(--mz-soft, #e0d9f0)',     // secondary container — 紫雾
  glow:     'var(--mz-glow, #cdc6e9)',     // 发光淡紫
  sakura:   'var(--mz-sakura, #f4c2cf)',   // 樱花粉 (装饰)
  lavender: 'var(--mz-lavender, #cfc3e8)', // 薰衣草 (装饰)
  deep:     'var(--mz-deep, #9a6bc5)',     // 渐变深紫尾停（当前歌词行等渐变第三停，调色台接管）
  surface:  'var(--mz-surface, rgba(255,255,255,0.65))',
  glass:    'var(--mz-glass, rgba(255,255,255,0.35))',
  text:     'var(--mz-text, #22232a)',     // 正文
  muted:    'var(--mz-muted, #7c779a)',    // 弱文字 (紫调)
  faint:    'var(--mz-faint, #bcb8cc)',    // 超弱
  vip:      'var(--mz-vip, #d4a06a)',      // VIP
  danger:   'var(--mz-danger, #ba1a1a)',
} as const;

/* ══════════ 全局 CSS 动画 (注入一次) ══════════ */
const STYLE_ID = '__shizuku_anims';
const injectStyles = () => {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
@keyframes shizuku-float{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-18px) scale(1.08)}}
@keyframes shizuku-drift{0%{transform:translateX(0) translateY(0) rotate(0deg)}25%{transform:translateX(12px) translateY(-10px) rotate(5deg)}50%{transform:translateX(-6px) translateY(-20px) rotate(-3deg)}75%{transform:translateX(8px) translateY(-8px) rotate(4deg)}100%{transform:translateX(0) translateY(0) rotate(0deg)}}
@keyframes shizuku-twinkle{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:.9;transform:scale(1.2)}}
@keyframes shizuku-ripple{0%{transform:scale(0);opacity:.6}100%{transform:scale(4);opacity:0}}
@keyframes shizuku-glow{0%,100%{box-shadow:0 0 15px rgba(var(--mz-glow-rgb, 205,198,233), 0.19),0 0 40px rgba(var(--mz-glow-rgb, 205,198,233), 0.06)}50%{box-shadow:0 0 25px rgba(var(--mz-glow-rgb, 205,198,233), 0.31),0 0 60px rgba(var(--mz-glow-rgb, 205,198,233), 0.13)}}
@keyframes shizuku-vinyl{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes shizuku-shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes shizuku-drop{0%{transform:translateY(-30px) scale(0);opacity:0}40%{opacity:.7}100%{transform:translateY(100vh) scale(1);opacity:0}}
.shizuku-glass{background:rgba(255,255,255,0.22);backdrop-filter:blur(16px) saturate(1.4);-webkit-backdrop-filter:blur(16px) saturate(1.4);border:1px solid rgba(255,255,255,0.35)}
.shizuku-glass-strong{background:rgba(255,255,255,0.45);backdrop-filter:blur(24px) saturate(1.6);-webkit-backdrop-filter:blur(24px) saturate(1.6);border:1px solid rgba(255,255,255,0.5)}
.shizuku-scrollbar::-webkit-scrollbar{width:3px}
.shizuku-scrollbar::-webkit-scrollbar-thumb{background:rgba(var(--mz-faint-rgb, 188,184,204), 0.38);border-radius:3px}
.shizuku-scrollbar::-webkit-scrollbar-track{background:transparent}
`;
  document.head.appendChild(style);
};

/* ══════════ 星芒 kirakira ✦ (带闪烁动画) ══════════ */
export const Sparkle: React.FC<{ className?: string; size?: number; color?: string; delay?: number }> = ({
  className = '', size = 10, color = C.accent, delay = 0,
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" className={className} fill={color}
    style={{ opacity: 0.7, animation: `shizuku-twinkle 2.5s ease-in-out ${delay}s infinite` }}>
    <path d="M10 0 L12 8 L20 10 L12 12 L10 20 L8 12 L0 10 L8 8 Z" />
  </svg>
);

/* ══════════ 十字四芒星 ✦ (窄瘦版, 用于歌词两侧) ══════════ */
export const CrossStar: React.FC<{ className?: string; size?: number; color?: string; delay?: number; solid?: boolean }> = ({
  className = '', size = 12, color = C.accent, delay = 0, solid = true,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill={color}
    style={{
      opacity: solid ? 1 : 0.5,
      filter: `drop-shadow(0 0 6px ${color})`,
      animation: `shizuku-twinkle 1.8s ease-in-out ${delay}s infinite`,
    }}>
    {/* 四角星:瘦长菱形+横向菱形叠加 */}
    <path d="M12 0 L13.5 10.5 L24 12 L13.5 13.5 L12 24 L10.5 13.5 L0 12 L10.5 10.5 Z" />
  </svg>
);

/* ══════════ 水滴装饰 ══════════ */
const WaterDrop: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 8 }) => (
  <svg width={size} height={size * 1.4} viewBox="0 0 10 14" className={className} fill={C.glow} style={{ opacity: 0.4 }}>
    <path d="M5 0 C5 0 0 7 0 9.5 C0 12 2.2 14 5 14 C7.8 14 10 12 10 9.5 C10 7 5 0 5 0Z" />
  </svg>
);

/* ══════════ Header — 毛玻璃导航条 ══════════ */
export const MizuHeader: React.FC<{
  title: string;
  onBack?: () => void;
  onClose?: () => void;
  right?: React.ReactNode;
}> = ({ title, onBack, onClose, right }) => (
  <div className="flex items-center justify-between px-4 h-12 shrink-0 shizuku-glass-strong relative z-20 mz-mizu-header"
    style={{ paddingTop: 'var(--safe-top)', boxSizing: 'content-box' }}>
    <button
      className="w-8 h-8 flex items-center justify-center rounded-full transition-all"
      style={{ color: C.primary }}
      onClick={onBack || onClose}
    >
      {onBack ? <ArrowLeft size={16} weight="bold" /> : <X size={16} weight="bold" />}
    </button>
    <div className="flex items-center gap-2">
      <Sparkle size={7} delay={0} />
      <WaterDrop size={5} />
      <span className="text-xs tracking-[0.2em] font-light" style={{ color: C.primary, fontFamily: `'Georgia', serif`, letterSpacing: '0.2em' }}>{title}</span>
      <WaterDrop size={5} />
      <Sparkle size={7} delay={1.2} />
    </div>
    <div className="w-8 flex justify-end">{right}</div>
  </div>
);

/* ══════════ 搜索栏 — 水晶胶囊 ══════════ */
export const SearchBar: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  searching: boolean;
}> = ({ value, onChange, onSearch, searching }) => (
  <div className="flex gap-2 px-4 py-3 relative z-10">
    <div className="flex-1 flex items-center gap-2.5 rounded-2xl px-4 py-2 shizuku-glass transition-all"
      style={{
        boxShadow: `0 2px 20px rgba(var(--mz-glow-rgb, 205,198,233), 0.08), inset 0 1px 0 rgba(255,255,255,0.4)`,
      }}>
      <MagnifyingGlass size={15} color={C.muted} weight="bold" />
      <input
        className="flex-1 bg-transparent outline-none text-sm placeholder:italic"
        style={{ color: C.text }}
        placeholder="搜一首想听的歌..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
      />
      <Sparkle size={6} color={C.sakura} delay={0.5} />
    </div>
    <button
      onClick={onSearch}
      disabled={searching}
      className="px-4 py-2 rounded-2xl text-xs text-white disabled:opacity-50 transition-all relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`,
        boxShadow: `0 3px 15px rgba(var(--mz-primary-rgb, 128,124,157), 0.19)`,
      }}
    >
      <span className="relative z-10">{searching ? '...' : '搜索'}</span>
      {/* shimmer 扫光 */}
      <div className="absolute inset-0 pointer-events-none mz-shimmer-sweep-30" />
    </button>
  </div>
);

/* ══════════ 歌曲列表项 — 玻璃卡片 ══════════ */
export const SongRow: React.FC<{
  name: string;
  artists: string;
  album: string;
  albumPic: string;
  duration: string;
  isVip: boolean;
  isActive: boolean;
  onClick: () => void;
}> = ({ name, artists, album, albumPic, duration, isVip, isActive, onClick }) => {
  const resolvedAlbumPic = useBlobRefUrl(albumPic) || '';
  return (
  <button
    onClick={onClick}
    className="mz-songrow w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all mb-1.5 mx-1"
    style={{
      background: isActive
        ? `linear-gradient(135deg, ${C.glass}, rgba(137,212,255,0.15))`
        : 'rgba(255,255,255,0.08)',
      backdropFilter: isActive ? 'blur(12px)' : 'none',
      border: isActive ? `1px solid rgba(255,255,255,0.4)` : '1px solid transparent',
      boxShadow: isActive ? `0 2px 16px rgba(var(--mz-glow-rgb, 205,198,233), 0.08)` : 'none',
    }}
  >
    {/* 封面 — 圆角 + 水光边框 */}
    <div className="relative shrink-0">
      <img src={resolvedAlbumPic} alt="" className="w-11 h-11 rounded-xl object-cover"
        style={{ border: `1.5px solid ${isActive ? C.accent + '60' : C.faint + '40'}` }} />
      {isActive && <div className="absolute -top-0.5 -right-0.5"><Sparkle size={8} color={C.glow} delay={0.3} /></div>}
    </div>
    <div className="flex-1 min-w-0 text-left">
      <div className="flex items-center gap-1.5 text-sm truncate" style={{ color: C.text }}>
        {isVip && (
          <span className="text-[8px] px-1.5 py-[1px] rounded-full text-white font-medium shrink-0"
            style={{ background: `linear-gradient(135deg, ${C.vip}, #e0b88a)`, letterSpacing: '0.05em' }}>VIP</span>
        )}
        <span className="truncate font-normal">{name}</span>
      </div>
      <div className="text-[11px] truncate mt-0.5" style={{ color: C.muted }}>{artists} · {album}</div>
    </div>
    <div className="text-[10px] shrink-0 tabular-nums" style={{ color: C.faint }}>{duration}</div>
  </button>
  );
};

/* ══════════ 小头像 — 处理 emoji / URL / data: 三种 avatar ══════════ */
export const TinyAvatar: React.FC<{
  avatar?: string;
  name: string;
  size?: number;
  ring?: string;
}> = ({ avatar, name, size = 28, ring = C.sakura }) => {
  const resolvedAvatar = useBlobRefUrl(avatar);
  const isImg = !!resolvedAvatar && (resolvedAvatar.startsWith('http') || resolvedAvatar.startsWith('data:') || resolvedAvatar.startsWith('blob:'));
  const style: React.CSSProperties = {
    width: size,
    height: size,
    border: `1.5px solid ${ring}`,
    boxShadow: `0 0 0 2px ${ring}22, 0 2px 8px ${ring}40`,
  };
  if (isImg) {
    return <img src={resolvedAvatar} alt="" className="rounded-full object-cover shrink-0" style={style} />;
  }
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 font-medium"
      style={{
        ...style,
        background: `linear-gradient(135deg, ${C.sakura}, ${C.lavender})`,
        color: 'var(--mz-on-text, #fff)',
        fontSize: Math.round(size * 0.42),
      }}
    >
      {avatar && avatar.length <= 4 ? avatar : (name || '·').slice(0, 1)}
    </div>
  );
};

/* ══════════ 一起听徽章 — 居中 · 两个头像 · 粉紫高级感 ══════════ */
export const TogetherHeader: React.FC<{
  userAvatar?: string;
  userName?: string;
  companions: { id: string; name: string; avatar?: string }[];
  onKick?: (id: string) => void;
}> = ({ userAvatar, userName = '你', companions, onKick }) => {
  // 目前最多和一个 char 一起听 —— 居中两头像是刚好的"小情侣"结构；
  // 万一哪天同时和多个 char 听，改成主头像 + 叠头像组还能自然兼容。
  const main = companions[0];
  const extraCount = companions.length - 1;
  return (
    <div className="mz-together relative mb-2 pt-1 pb-2 rounded-2xl overflow-hidden"
      style={{
        background: `linear-gradient(135deg, rgba(var(--mz-sakura-rgb, 244,194,207), 0.09) 0%, rgba(var(--mz-lavender-rgb, 207,195,232), 0.09) 50%, rgba(var(--mz-glow-rgb, 205,198,233), 0.07) 100%)`,
        border: `1px solid rgba(var(--mz-sakura-rgb, 244,194,207), 0.21)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 12px rgba(var(--mz-sakura-rgb, 244,194,207), 0.13)`,
      }}
    >
      {/* 背景光晕 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background: `radial-gradient(ellipse at 30% 40%, rgba(var(--mz-sakura-rgb, 244,194,207), 0.25) 0%, transparent 45%),
                       radial-gradient(ellipse at 70% 60%, rgba(var(--mz-lavender-rgb, 207,195,232), 0.22) 0%, transparent 50%)`,
        }} />
      {/* 居中两头像 + 中间的心 */}
      <div className="relative flex items-center justify-center gap-2">
        <TinyAvatar avatar={userAvatar} name={userName} size={30} ring={C.glow} />
        <div className="flex flex-col items-center justify-center -mx-1"
          style={{ color: C.sakura }}>
          <svg width="16" height="14" viewBox="0 0 24 22" fill="none"
            style={{ filter: `drop-shadow(0 0 4px ${C.sakura})`, animation: 'shizuku-glow 2.2s ease-in-out infinite' }}>
            <path d="M12 21s-8-5.3-8-11.5C4 6 6.5 3.5 9.5 3.5c1.6 0 3 .8 2.5 2.2C11.5 4.3 12.9 3.5 14.5 3.5 17.5 3.5 20 6 20 9.5 20 15.7 12 21 12 21z"
              fill="currentColor" />
          </svg>
        </div>
        <TinyAvatar avatar={main?.avatar} name={main?.name || ''} size={30} ring={C.sakura} />
        {extraCount > 0 && (
          <span className="ml-0.5 text-[9px] px-1.5 py-0.5 rounded-full"
            style={{ background: `rgba(var(--mz-lavender-rgb, 207,195,232), 0.2)`, color: C.primary, border: `1px solid rgba(var(--mz-lavender-rgb, 207,195,232), 0.33)` }}>
            +{extraCount}
          </span>
        )}
      </div>
      {/* 文案 */}
      <div className="relative mt-1 flex items-center justify-center gap-1.5">
        <div className="text-[10px] tracking-[0.25em] uppercase font-semibold"
          style={{ color: C.primary, opacity: 0.75 }}>
          Listening Together
        </div>
      </div>
      <div className="relative mt-0.5 text-center text-[11px]"
        style={{ color: C.primary, fontFamily: `'Noto Serif', serif` }}>
        <span className="font-medium">{userName}</span>
        <span className="mx-1 opacity-60">·</span>
        <span className="font-medium">{main?.name || ''}</span>
        {extraCount > 0 && <span className="opacity-70"> 等 {companions.length} 人</span>}
      </div>
      {/* 结束一起听 —— 右上角小 × */}
      {onKick && main && (
        <button
          onClick={(e) => { e.stopPropagation(); onKick(main.id); }}
          aria-label={`结束和 ${main.name} 的一起听`}
          className="absolute top-1 right-1.5 p-0.5 rounded-full transition-colors mz-glass-fill"
          style={{ color: C.primary }}
          title="结束一起听">
          <X size={10} weight="bold" />
        </button>
      )}
    </div>
  );
};

/* ══════════ 邀请一起听弹层（2026-08-30：专用邀请弹层，不再是转发选人）══════════ */
const InviteCharAvatar: React.FC<{ avatar?: string; name: string }> = ({ avatar, name }) => {
  const url = useBlobRefUrl(avatar);
  if (url) return <img src={url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />;
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white font-semibold"
      style={{ background: `linear-gradient(135deg, ${C.sakura}, ${C.lavender})`, fontSize: 13 }}>
      {name.slice(0, 1)}
    </div>
  );
};

export const InviteTogetherModal: React.FC<{
  songName?: string;
  artists?: string;
  characters: { id: string; name: string; avatar?: string }[];
  onPick: (c: { id: string; name: string }) => void;
  onClose: () => void;
}> = ({ songName, artists, characters, onPick, onClose }) => (
  <div className="fixed inset-0 flex items-end justify-center"
    style={{ zIndex: 130, background: 'rgba(30,22,40,0.35)' }}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="flex flex-col mz-sheet"
      style={{
        width: 'min(100%, 560px)',
        padding: 20, paddingBottom: 'calc(20px + var(--safe-bottom, 0px))', gap: 12,
      }}>
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Headphones size={18} weight="duotone" color={C.sakura} />
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>邀请 Ta 一起听</span>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
          style={{ color: C.muted, background: C.glass }} aria-label="关闭">
          <X size={13} weight="bold" />
        </button>
      </div>
      {/* 当前歌 */}
      <div className="flex items-center gap-2 rounded-2xl px-3 py-2.5"
        style={{ background: `linear-gradient(135deg, rgba(var(--mz-sakura-rgb, 244,194,207), 0.14), rgba(var(--mz-lavender-rgb, 207,195,232), 0.14))`, border: `1px solid rgba(var(--mz-sakura-rgb, 244,194,207), 0.25)` }}>
        <MusicNote size={16} weight="duotone" color={C.primary} className="shrink-0" />
        {songName ? (
          <div className="min-w-0">
            <div className="text-[12px] font-semibold truncate" style={{ color: C.text }}>{songName}</div>
            <div className="text-[10px] truncate" style={{ color: C.muted }}>{artists || '·'}</div>
          </div>
        ) : (
          <div className="text-[12px]" style={{ color: C.muted }}>现在没在放歌——先一起戴上耳机，歌你来放</div>
        )}
      </div>
      {/* 角色列表 */}
      <div className="space-y-1.5 max-h-[46vh] overflow-y-auto shizuku-scrollbar">
        {characters.length === 0 && (
          <div className="text-center py-4 text-[11px]" style={{ color: C.faint }}>还没有角色</div>
        )}
        {characters.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c)}
            className="w-full flex items-center gap-2.5 rounded-2xl px-3 py-2.5 transition-all active:scale-[0.98] text-left mz-glass-edge-45"
            style={{ background: C.glass }}
          >
            <InviteCharAvatar avatar={c.avatar} name={c.name} />
            <span className="flex-1 min-w-0 truncate text-[12px] font-medium" style={{ color: C.text }}>{c.name}</span>
            <span className="text-[9px] shrink-0" style={{ color: C.sakura }}>一起听</span>
            <CaretRight size={13} color={C.faint} />
          </button>
        ))}
      </div>
      <button type="button" onClick={onClose} className="w-full py-2 text-[11px] border-0 cursor-pointer"
        style={{ color: C.faint, background: 'transparent' }}>
        取消
      </button>
    </div>
  </div>
);

/* ══════════ 夜色预设 · 双人状态区（2026-08-30 附件图一/图二）══════════ */
export const NightTogetherStrip: React.FC<{
  userAvatar?: string;
  userName?: string;
  companion: { name: string; avatar?: string };
}> = ({ userAvatar, userName, companion }) => {
  const resolvedUser = useBlobRefUrl(userAvatar) || '';
  const resolvedChar = useBlobRefUrl(companion.avatar) || '';
  return (
    <div className="mz-together-strip shrink-0 flex flex-col items-center pt-2.5">
      {/* 重叠双头像 + 极细弧线半包围 */}
      <div className="relative" style={{ width: 96, height: 46 }}>
        <svg className="absolute inset-0" width="96" height="46" viewBox="0 0 96 46" fill="none" style={{ overflow: 'visible' }}>
          <path d="M 16 40 A 32 32 0 0 1 80 40" stroke="rgba(255,255,255,0.28)" strokeWidth="1" strokeLinecap="round" />
        </svg>
        <div className="absolute top-1 rounded-full overflow-hidden" style={{ left: 20, width: 36, height: 36, border: '1.5px solid rgba(255,255,255,0.45)' }}>
          {resolvedUser ? <img src={resolvedUser} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: 'rgba(255,255,255,0.16)' }} />}
        </div>
        <div className="absolute top-1 rounded-full overflow-hidden" style={{ left: 40, width: 36, height: 36, border: '1.5px solid rgba(255,255,255,0.45)' }}>
          {resolvedChar ? <img src={resolvedChar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: 'rgba(255,255,255,0.16)' }} />}
        </div>
      </div>
      {/* 状态文本 */}
      <div className="mt-0.5 text-[9px] tracking-[0.22em]" style={{ color: 'rgba(255,255,255,0.45)' }}>
        {userName || '你'} ♥ {companion.name}
      </div>
    </div>
  );
};

/* ══════════ Mini 播放器 — 浮游玻璃条 ══════════ */
export const MiniPlayer: React.FC<{
  name: string;
  artists: string;
  albumPic: string;
  playing: boolean;
  onTap: () => void;
  onPrev: () => void;
  onToggle: () => void;
  onNext: () => void;
  userAvatar?: string;   // 当前用户的头像（给"一起听"顶部用）
  userName?: string;     // 当前用户昵称
  companions?: { id: string; name: string; avatar?: string }[];   // 正在一起听的 char（切歌自动清空）
  // 点 × 立刻把该 char 从"一起听"名单里移除；下次 chat 发送时
  // 氛围/工具提示词都会掉回旁观措辞。
  onKickCompanion?: (charId: string) => void;
  charsWithSong?: { id: string; name: string; playlistTitle: string }[]; // 歌单里也有这首歌的 char
  regenStatus?: string;  // 当前歌正在重录时的状态文案，置则显示进度条
}> = ({ name, artists, albumPic, playing, onTap, onPrev, onToggle, onNext, userAvatar, userName, companions, onKickCompanion, charsWithSong, regenStatus }) => {
  const resolvedAlbumPic = useBlobRefUrl(albumPic) || '';
  return (
  <div
    onClick={onTap}
    className="mz-miniplayer absolute left-3 right-3 bottom-3 z-30 rounded-2xl px-3 py-2.5 cursor-pointer shizuku-glass-strong"
    style={{
      boxShadow: `0 4px 30px rgba(var(--mz-glow-rgb, 205,198,233), 0.13), 0 1px 0 inset rgba(255,255,255,0.4)`,
      animation: 'shizuku-glow 4s ease-in-out infinite',
    }}
  >
    {/* 伴听徽章 — 居中两个头像 + 心 */}
    {(companions && companions.length > 0) && (
      <TogetherHeader
        userAvatar={userAvatar}
        userName={userName}
        companions={companions}
        onKick={onKickCompanion}
      />
    )}
    <div className="flex items-center gap-3">
      {/* 封面 — 水滴圆角 */}
      <div className="relative">
        <img src={resolvedAlbumPic} alt="" className="w-10 h-10 rounded-xl object-cover"
          style={{ border: `1.5px solid rgba(var(--mz-accent-rgb, 179,168,206), 0.25)`, opacity: regenStatus ? 0.4 : 1 }} />
        {playing && !regenStatus && <div className="absolute -bottom-1 -right-1"><Sparkle size={6} color={C.glow} /></div>}
        {regenStatus && (
          <div className="absolute inset-0 rounded-xl flex items-center justify-center mz-regen-veil">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="text-xs font-normal truncate" style={{ color: C.text }}>{name}</div>
        {regenStatus ? (
          <div className="flex items-center gap-1 text-[10px] truncate" style={{ color: C.primary, fontFamily: 'monospace' }}>
            <span>● 重录中 ·</span>
            <span className="truncate" style={{ color: C.muted }}>{regenStatus}</span>
          </div>
        ) : (
          <div className="text-[10px] truncate" style={{ color: C.muted }}>{artists}</div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button onClick={(e) => { e.stopPropagation(); onPrev(); }} className="p-1.5 rounded-full transition-colors" style={{ color: C.muted }}><SkipBack size={14} weight="fill" /></button>
        <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="p-2 rounded-full transition-all"
          style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, boxShadow: `0 2px 10px rgba(var(--mz-primary-rgb, 128,124,157), 0.19)` }}>
          {playing ? <Pause size={14} weight="fill" color="white" /> : <Play size={14} weight="fill" color="white" />}
        </button>
        <button onClick={(e) => { e.stopPropagation(); onNext(); }} className="p-1.5 rounded-full transition-colors" style={{ color: C.muted }}><SkipForward size={14} weight="fill" /></button>
      </div>
    </div>
    {/* 同款歌单提示 */}
    {(!companions || companions.length === 0) && charsWithSong && charsWithSong.length > 0 && (
      <div className="mt-1.5 text-[9px] italic truncate" style={{ color: C.muted }}>
        🎵 {charsWithSong[0].name} 的《{charsWithSong[0].playlistTitle}》里也有
        {charsWithSong.length > 1 && ` · 还有 ${charsWithSong.length - 1} 位`}
      </div>
    )}
  </div>
  );
};

/* ══════════ 唱片 — iridescent 星云版 ══════════ */
export const VinylDisc: React.FC<{
  albumPic: string;
  playing: boolean;
  size?: number;
  bitrate?: string;
}> = ({ albumPic, playing, size = 180, bitrate }) => {
  const resolvedAlbumPic = useBlobRefUrl(albumPic) || '';
  return (
  <div className="mz-vinyl relative" style={{ width: size, height: size }}>
    {/* 单层柔光 — 收敛简洁，不再散乱 */}
    <div className="absolute rounded-full pointer-events-none"
      style={{
        inset: -size * 0.08,
        background: `radial-gradient(circle, rgba(var(--mz-glow-rgb, 205,198,233), 0.19) 0%, rgba(var(--mz-glow-rgb, 205,198,233), 0.06) 50%, transparent 75%)`,
        filter: 'blur(20px)',
      }} />

    {/* 唱片本体 — 旋转 */}
    <div className="relative w-full h-full rounded-full overflow-hidden mz-vinyl-disc"
      style={{
        animation: playing ? 'shizuku-vinyl 18s linear infinite' : 'none',
        boxShadow: `0 8px 32px rgba(var(--mz-primary-rgb, 128,124,157), 0.13), 0 0 0 1px rgba(var(--mz-glow-rgb, 205,198,233), 0.19)`,
      }}>
      {/* 单张封面 — 完全不透明，干净清晰 */}
      <img src={resolvedAlbumPic} alt=""
        className="absolute inset-0 w-full h-full object-cover" />

      {/* 中心标签 — 不旋转跟随，保持唱片标识 */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="rounded-full flex items-center justify-center mz-vinyl-label"
          style={{
            width: size * 0.34,
            height: size * 0.34,
          }}>
          {/* 中心轴心 */}
          <div className="rounded-full mz-vinyl-pivot"
            style={{
              width: size * 0.04,
              height: size * 0.04,
              background: C.muted,
            }} />
        </div>
      </div>

      {/* 极轻表面反光 — 一道高光，不抢戏 */}
      <div className="absolute inset-0 pointer-events-none rounded-full mz-vinyl-sheen" />
    </div>

    {/* 比特率徽章 (chip) */}
    {bitrate && (
      <div className="absolute -bottom-2 -right-2 px-2 py-0.5 rounded-sm text-[9px] tracking-[0.2em] shizuku-glass-strong"
        style={{
          color: C.primary,
          fontFamily: `'Space Grotesk', 'SF Mono', monospace`,
          letterSpacing: '0.18em',
          border: `1px solid rgba(var(--mz-primary-rgb, 128,124,157), 0.13)`,
        }}>
        {bitrate}
      </div>
    )}

    {/* 装饰粒子 — 星芒 + 水滴，绕着唱片漂浮 */}
    <Sparkle size={11} className="absolute -top-2 right-3" color={C.glow} delay={0} />
    <Sparkle size={9} className="absolute top-1/4 -left-3.5" color={C.sakura} delay={0.8} />
    <Sparkle size={7} className="absolute -bottom-1 left-7" color={C.lavender} delay={1.5} />
    <Sparkle size={6} className="absolute top-[58%] -right-3" color={C.glow} delay={2.2} />
    <WaterDrop size={6} className="absolute top-[60%] -right-3.5" />
    <WaterDrop size={5} className="absolute top-[12%] left-[18%]" />
  </div>
  );
};

/* ══════════ 时间 / 元数据 chip ══════════ */
export const MetaChip: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span className={`px-2 py-0.5 text-[9px] tracking-[0.15em] mz-metachip ${className}`}
    style={{
      color: C.primary,
      border: `1px solid rgba(var(--mz-faint-rgb, 188,184,204), 0.25)`,
      fontFamily: `'Space Grotesk', 'SF Mono', monospace`,
    }}>
    {children}
  </span>
);

/* ══════════ 子操作行 (Like / Sync / Loop / Add) ══════════ */
export type SubPlayMode = 'loop' | 'single' | 'shuffle';
export const SubActions: React.FC<{
  onLike?: () => void;
  liked?: boolean;
  onSync?: () => void;             // 手动对轴 (仅本地歌显示)
  showSync?: boolean;
  onDownload?: () => void;         // 下载本地生成的音频 (仅本地歌显示)
  showDownload?: boolean;
  playMode?: SubPlayMode;
  onCyclePlayMode?: () => void;    // 循环模式切换
  onAdd?: () => void;
}> = ({ onLike, liked, onSync, showSync, onDownload, showDownload, playMode = 'loop', onCyclePlayMode, onAdd }) => {
  const Item = ({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick?: () => void; active?: boolean }) => (
    <button onClick={onClick}
      className="flex flex-col items-center gap-1 transition-opacity active:scale-95"
      style={{ opacity: active ? 1 : 0.5 }}>
      <div className="flex items-center justify-center w-8 h-8">{icon}</div>
      <span className="text-[8px] uppercase tracking-[0.15em]"
        style={{ color: C.primary, fontFamily: `'Space Grotesk', 'SF Mono', monospace` }}>{label}</span>
    </button>
  );

  // SVG icon factories
  const heartSvg = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? C.sakura : 'none'} stroke={C.primary} strokeWidth="1.5">
      <path d="M12 21s-7-4.5-7-11a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 6.5-7 11-7 11z" />
    </svg>
  );
  const syncSvg = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.5">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="3" x2="12" y2="9" />
      <line x1="12" y1="15" x2="12" y2="21" />
      <line x1="3" y1="12" x2="9" y2="12" />
      <line x1="15" y1="12" x2="21" y2="12" />
      <circle cx="12" cy="12" r="2" fill={C.primary} stroke="none" />
    </svg>
  );
  const loopSvg = playMode === 'single' ? (
    // 单曲循环 — 圆环带数字 1
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.5">
      <path d="M17 4l3 3-3 3" /><path d="M20 7H8a4 4 0 0 0-4 4v0" />
      <path d="M7 20l-3-3 3-3" /><path d="M4 17h12a4 4 0 0 0 4-4v0" />
      <text x="12" y="14.5" fontSize="7" fontWeight="700" fill={C.primary} stroke="none" textAnchor="middle">1</text>
    </svg>
  ) : playMode === 'shuffle' ? (
    // 随机
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.5">
      <path d="M3 6h3l12 12h3" /><path d="M18 6h3l-3-3M3 18h3l12-12h3" /><path d="M18 18h3l-3 3" />
    </svg>
  ) : (
    // 列表循环
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.5">
      <path d="M17 4l3 3-3 3" /><path d="M20 7H8a4 4 0 0 0-4 4v0" />
      <path d="M7 20l-3-3 3-3" /><path d="M4 17h12a4 4 0 0 0 4-4v0" />
    </svg>
  );
  const addSvg = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.5">
      <path d="M3 6h13M3 12h13M3 18h9M17 15v6M14 18h6" />
    </svg>
  );
  const downloadSvg = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v12" />
      <path d="M7 11l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );

  const playModeLabel: Record<SubPlayMode, string> = { loop: 'Loop', single: 'One', shuffle: 'Mix' };

  return (
    <div className="flex items-end justify-around gap-4 max-w-[280px] mx-auto">
      <Item onClick={onLike} active={liked} label="Like" icon={heartSvg} />
      {showSync && onSync && <Item onClick={onSync} active label="Sync" icon={syncSvg} />}
      {showDownload && onDownload && <Item onClick={onDownload} active label="Save" icon={downloadSvg} />}
      {onCyclePlayMode && <Item onClick={onCyclePlayMode} active={playMode !== 'loop'} label={playModeLabel[playMode]} icon={loopSvg} />}
      {onAdd && <Item onClick={onAdd} label="Add" icon={addSvg} />}
    </div>
  );
};

/* ══════════ 玻璃进度条 — 水滴指示器 ══════════ */
export const GlassProgress: React.FC<{
  progress: number;
  duration: number;
  fmtTime: (s: number) => string;
  onSeek: (pct: number) => void;
}> = ({ progress, duration, fmtTime, onSeek }) => {
  const pct = duration ? (progress / duration) * 100 : 0;
  return (
    <div className="w-full">
      <div className="relative h-[6px] rounded-full cursor-pointer shizuku-glass mz-progress-track"
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          onSeek((e.clientX - rect.left) / rect.width);
        }}>
        {/* 已播进度 */}
        <div className="absolute top-0 left-0 h-full rounded-full transition-[width] duration-150"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${C.primary}, ${C.glow})`,
            boxShadow: `0 0 10px rgba(var(--mz-glow-rgb, 205,198,233), 0.25)`,
          }} />
        {/* 水滴指示点 */}
        <div className="absolute top-1/2 -translate-y-1/2 transition-[left] duration-150"
          style={{ left: `${pct}%`, transform: `translateX(-50%) translateY(-50%)` }}>
          <div className="w-3 h-3 rounded-full"
            style={{
              background: `radial-gradient(circle at 35% 35%, white, ${C.glow})`,
              boxShadow: `0 0 8px rgba(var(--mz-glow-rgb, 205,198,233), 0.38)`,
            }} />
        </div>
      </div>
      <div className="flex justify-between mt-1.5 px-0.5">
        <span className="text-[9px] tracking-wider" style={{ color: C.muted, fontFamily: 'monospace' }}>{fmtTime(progress)}</span>
        <span className="text-[9px] tracking-wider" style={{ color: C.muted, fontFamily: 'monospace' }}>{fmtTime(duration)}</span>
      </div>
    </div>
  );
};

/* ══════════ 播放控制 — 发光按钮组 ══════════ */
export const PlayControls: React.FC<{
  playing: boolean;
  loading: boolean;
  onPrev: () => void;
  onToggle: () => void;
  onNext: () => void;
}> = ({ playing, loading, onPrev, onToggle, onNext }) => (
  <div className="flex items-center justify-center gap-8 mt-3 mb-1">
    <button onClick={onPrev} className="p-2 rounded-full transition-all"
      style={{ color: C.muted }}>
      <SkipBack size={22} weight="fill" />
    </button>
    <button
      onClick={onToggle}
      className="w-[56px] h-[56px] rounded-full flex items-center justify-center transition-transform active:scale-95 relative"
      style={{
        background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`,
        boxShadow: `0 4px 24px rgba(var(--mz-glow-rgb, 205,198,233), 0.25), 0 0 60px rgba(var(--mz-glow-rgb, 205,198,233), 0.08)`,
        animation: playing ? 'shizuku-glow 3s ease-in-out infinite' : 'none',
      }}
    >
      {loading ? (
        <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      ) : playing ? (
        <Pause size={22} weight="fill" color="white" />
      ) : (
        <Play size={22} weight="fill" color="white" />
      )}
      {/* 外圈装饰 */}
      <div className="absolute inset-[-3px] rounded-full pointer-events-none mz-play-ring" />
    </button>
    <button onClick={onNext} className="p-2 rounded-full transition-all"
      style={{ color: C.muted }}>
      <SkipForward size={22} weight="fill" />
    </button>
  </div>
);

/* ══════════ 背景装饰 — 浮游粒子 + 光斑 + 水滴 ══════════ */
export const BokehBg: React.FC = () => {
  useEffect(() => { injectStyles(); }, []);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {/* 白色柔光 bokeh (主力)——2026-08-30 调暗：纯白大球晃眼睛，换成淡紫灰且透明度压低 */}
      <div className="absolute top-[8%] right-[5%] w-32 h-32 rounded-full mz-bokeh-blob mz-bokeh-1" />
      <div className="absolute bottom-[25%] left-[0%] w-48 h-48 rounded-full mz-bokeh-blob mz-bokeh-2" />
      <div className="absolute top-[45%] left-[25%] w-16 h-16 rounded-full mz-bokeh-blob mz-bokeh-3" />
      <div className="absolute top-[25%] right-[32%] w-24 h-24 rounded-full mz-bokeh-blob mz-bokeh-4" />
      {/* 轻微彩色点缀 (极低饱和) */}
      <div className="absolute top-[65%] right-[10%] w-20 h-20 rounded-full mz-bokeh-blob mz-bokeh-5" />
      <div className="absolute top-[15%] left-[20%] w-16 h-16 rounded-full mz-bokeh-blob mz-bokeh-6" />
      {/* 浮游星芒 */}
      <Sparkle size={10} className="absolute top-[12%] left-[15%]" color={C.glow} delay={0} />
      <Sparkle size={7} className="absolute top-[30%] right-[20%]" color={C.sakura} delay={1} />
      <Sparkle size={5} className="absolute bottom-[40%] left-[30%]" color={C.lavender} delay={2} />
      <Sparkle size={8} className="absolute bottom-[15%] right-[12%]" color={C.accent} delay={0.5} />
      <Sparkle size={6} className="absolute top-[55%] left-[8%]" color={C.glow} delay={1.8} />
      {/* 水滴粒子 */}
      <WaterDrop size={5} className="absolute top-[20%] right-[35%]" />
      <WaterDrop size={4} className="absolute bottom-[35%] left-[45%]" />
      <WaterDrop size={6} className="absolute top-[65%] right-[8%]" />
    </div>
  );
};

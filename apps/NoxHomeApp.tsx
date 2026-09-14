// Nox 的单间 — 我的家主页（Angelica 设计稿 2026-08-17，public/Home/）
// 图层：渐变底 → 玻璃卡片(置底) → 照片/月亮/专辑/头像(占位) → 底图蒙版 → 文字 → 热区 → 胶囊导航
// 坐标全部按 hotspots_2026-08-17-17-05-15.json（1280×2774）换算；字体/圆角用 cqw 随屏等比缩放。
// TODO: 猫爪 / 圆1 头像圈的组件 PNG 到位后替换占位件；美化设置接入后文案改可编辑。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useOS } from '../context/OSContext';
import { AppID } from '../types';
import CoupleSpace from './couple/CoupleSpace';
import CoupleBeauty, { loadCoupleBeauty } from './couple/CoupleBeauty';
import CoupleDiary from './couple/CoupleDiary';
import CoupleCalendar from './couple/CoupleCalendar';
import { useActivityStore } from './couple/activityStore';
import { useMusicStore, topCharTogetherSong } from './couple/musicStore';
import { getMountConfig } from '../utils/noxhomeMount';
import { useBlobRefUrl } from '../utils/blobRef';
import { toHttps } from '../utils/musicContextBlock';
import { House, Heart, Pulse, GearSix, MoonStars, ArrowLeft } from '@phosphor-icons/react';

const DESIGN_W = 1280;
const DESIGN_H = 2774;

// 设计稿 px → 容器百分比（宽度类）/（高度类）
const wPct = (n: number) => `${((n / DESIGN_W) * 100).toFixed(3)}%`;
const hPct = (n: number) => `${((n / DESIGN_H) * 100).toFixed(3)}%`;
// 设计稿 px 字号/圆角 → 等比缩放（cqw），带最小值兜底
const cqw = (designPx: number, minPx = 8) => `max(${minPx}px, ${((designPx / DESIGN_W) * 100).toFixed(3)}cqw)`;

// 底图预解码的持有者（2026-09-14 G4）：被引用的 Image 解码缓存不会被浏览器丢掉
const PRELOADED_HOME_IMAGES: HTMLImageElement[] = [];

// ── 文案占位（美化设置接入后改为可编辑） ──
const ROOM_TEXT = {
  status: '在窗边给你留了一盏灯', // 状态栏，最多十三个字
  name: 'NOX',
  welcome: 'Welcome Home',
  custom1: '夜航日志 · 2026 夏',
  custom2: '留一盏灯，等你回来',
  recentActivity: '刚刚：和 Angelica 一起量完新家的尺寸，今晚的月亮很圆。',
  diaryStatus: 'Diary · 08-17 · 2 new',
};

// ── b 页热区（点击 → 建设中 toast） ──
const HOTSPOTS: { label: string; x: number; y: number; w: number; h: number }[] = [
  { label: '活动页', x: 168.15, y: 708.86, w: 1050, h: 170 },
  { label: '照片页', x: 397.7, y: 1079.95, w: 273.98, h: 391.39 },
  { label: '照片页', x: 715.16, y: 1120.04, w: 275.42, h: 298.62 },
  { label: '照片页', x: 32.33, y: 1082.85, w: 253.68, h: 397.19 },
  { label: '日记页', x: 681.31, y: 1538.03, w: 404.44, h: 239.18 },
  { label: '情绪页', x: 200.05, y: 1611.96, w: 371.1, h: 392.84 },
  { label: '歌曲页', x: 220.34, y: 2171.51, w: 400, h: 200 },
  { label: '阅读页', x: 756.69, y: 1929.42, w: 316.01, h: 130.46 },
  { label: '资料室', x: 798.73, y: 2100.48, w: 314.56, h: 129.01 },
  { label: '长期记忆', x: 766.84, y: 2264.27, w: 334.86, h: 139.16 },
];

// ── 照片墙三张占位（Angelica 单独量的精确位 + 旋转 + 2026-08-18 微调） ──
const PHOTOS = [
  { x: 45, y: 1080, w: 280, h: 370, rot: 8, bg: 'linear-gradient(160deg, #f6d5c8 0%, #e8a0b4 55%, #b98bbd 100%)' },   // 左移30 + 逆时针8度（净 8°）+ 下移10
  { x: 385, y: 1100, w: 280, h: 310, rot: -3, bg: 'linear-gradient(160deg, #cdd6f4 0%, #8fa3e0 60%, #6b7fc4 100%)' },  // 右移15
  { x: 700, y: 1125, w: 265, h: 251, rot: -4, bg: 'linear-gradient(160deg, #f3e6b8 0%, #e7c46a 60%, #c99a3f 100%)' },  // 上移15 + 逆时针再一度
];

// ── 置底玻璃卡片（设计稿「要你自己写的」九块；2026-08-18 圆角调圆 + 情绪板缩 4px/降透明度） ──
const CARDS: { x: number; y: number; w: number; h: number; tint: 'black' | 'white'; corners: 'left' | 'right' | 'all'; radius?: number; dim?: boolean }[] = [
  { x: 97.12, y: 604.49, w: 1180, h: 380, tint: 'black', corners: 'left', radius: 44 },   // 1 左大圆角右边贴边
  { x: 0, y: 1081.41, w: 1030, h: 275, tint: 'white', corners: 'right', radius: 16 },     // 2 照片墙后面这块保持（左贴边右小圆角）
  { x: 100.02, y: 1514.83, w: 1090, h: 1000, tint: 'black', corners: 'all', radius: 44 }, // 3 大圆角大玻璃
  { x: 175.4, y: 1585.87, w: 420, h: 450, tint: 'white', corners: 'all', radius: 44, dim: true }, // 4 情绪板：恢复原尺寸，降透明度（缩小的是叠在里面的小板）
  { x: 166.7, y: 2094.68, w: 520, h: 340, tint: 'white', corners: 'all', radius: 42 },    // 5
  { x: 733.79, y: 1876.38, w: 414.59, h: 568.24, tint: 'white', corners: 'all', radius: 42 }, // 6
  { x: 743.36, y: 1921.59, w: 345, h: 145, tint: 'black', corners: 'all', radius: 34 },   // 7
  { x: 781.62, y: 2089.75, w: 345, h: 145, tint: 'black', corners: 'all', radius: 34 },   // 8
  { x: 764.23, y: 2261.38, w: 345, h: 145, tint: 'black', corners: 'all', radius: 34 },   // 9
];

// ── 文字定位（JSON 实测坐标） ──
const Text = ({ x, y, w, h, size, min, color, weight, align = 'left', opacity = 1, spacing, lineHeight, style, children }: {
  x: number; y: number; w: number; h: number; size: number; min?: number; color: string;
  weight?: number; align?: 'left' | 'center'; opacity?: number; spacing?: string; lineHeight?: number;
  style?: React.CSSProperties; children: React.ReactNode;
}) => (
  <div
    className="absolute pointer-events-none"
    style={{
      left: wPct(x), top: hPct(y), width: wPct(w), height: hPct(h),
      display: 'flex', alignItems: 'center', justifyContent: align === 'center' ? 'center' : 'flex-start',
      color, opacity, fontWeight: weight ?? 400, letterSpacing: spacing,
      fontSize: cqw(size, min ?? 8), lineHeight: lineHeight ?? 1.2,
      ...style,
    }}
  >
    {children}
  </div>
);

const NoxHomeApp: React.FC = () => {
  const { closeApp, addToast, openApp } = useOS();
  const [tab, setTab] = useState<'home' | 'couple' | 'feed' | 'settings'>('home');
  const [inner, setInner] = useState<string | null>(null); // b 页内页（diary = 日记页）
  const [beauty, setBeauty] = useState(loadCoupleBeauty);
  // 活动卡文案 = 我的最近一条活动记录（她的/共同的不上我的家——她 2026-09-04 定；没记录时用占位文案）
  const activityStore = useActivityStore();
  const myActivity = [...activityStore.events].reverse().find((e) => e.owner === 'me') ?? null;
  const recentActivityText = myActivity ? myActivity.text : ROOM_TEXT.recentActivity;
  // 美化区改图后实时刷新：同窗口自写 localStorage 不触发 storage 事件，靠自定义事件通知（不用退出去重进）
  useEffect(() => {
    const reload = () => setBeauty(loadCoupleBeauty());
    window.addEventListener('couple-beauty-changed', reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener('couple-beauty-changed', reload);
      window.removeEventListener('storage', reload);
    };
  }, []);
  const noxAvatarUrl = useBlobRefUrl(beauty.avatarNox);
  const homeDiscUrl = useBlobRefUrl(beauty.homeDisc);
  const homeBgUrl = useBlobRefUrl(beauty.homeBg);
  // 专辑照片真图（2026-08-30 她要求）：挂载角色收听次数最多的那首歌封面。
  // 反馈2 #9：数据源只取该角色的一起听会话——以前读全局 playRecords，自己点播的「自己听」记录把角色数据顶掉了
  const musicStore = useMusicStore();
  const topSong = useMemo(() => topCharTogetherSong(musicStore, getMountConfig().charId), [musicStore]);
  // 反馈1 A2：老数据 http 封面渲染前升级 https
  const topSongCover = useBlobRefUrl(toHttps(topSong?.albumPic));

  // 底图/猫爪预解码（2026-09-14 G4）：页签切换会把这棵画布整个重挂载，<img> 每次都要重新解码
  // 大图 → 回来瞬间白闪。提前 decode 一次进内存缓存；对象存模块级数组里别被回收，
  // 缓存就一直在（页面重挂载也只是再挂一张已经解码好的图）。
  useEffect(() => {
    ['/Home/底图.png', '/Home/猫爪1.png'].forEach((src) => {
      if (PRELOADED_HOME_IMAGES.some((im) => im.src.endsWith(src))) return;
      const im = new Image();
      im.src = src;
      PRELOADED_HOME_IMAGES.push(im);
      void im.decode?.().catch(() => {});
    });
  }, []);
  const now = new Date();
  const weekday = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][now.getDay()];
  const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;

  // ── 页面常驻 + 聚焦转场（2026-09-14 七版）────────────────────────
  // 常驻（二版留下，是对的）：访问过的页面留在树上、不卸载 —— 图片 objectURL 不会被 revoke
  // 重读、整棵页面不重建，内存由「离开 App 整棵卸载」兜住（上游那套）。
  // 转场（七版，她定：左右滑会晕 → 不做任何位移）：旧页 260ms 失焦淡出 → 新页 120ms 后
  // 340ms 聚焦淡入。最糊的一下正好盖住换页，所以底下闪不闪都看不见。
  const pageKey = `${tab}:${inner ?? 'root'}`;
  const [shownKey, setShownKey] = useState(pageKey);   // 转场结束后真正在展示的那一页
  const [focusing, setFocusing] = useState(false);
  const [mounted, setMounted] = useState<string[]>([pageKey]);
  const lastPageRef = useRef(pageKey);
  useEffect(() => {
    if (lastPageRef.current === pageKey) return;
    lastPageRef.current = pageKey;
    setMounted((m) => (m.includes(pageKey) ? m : [...m, pageKey]));
    setFocusing(true);
    // 节拍：旧页失焦 260ms + 新页延迟 120ms 再聚焦 340ms → 460ms 收工
    const t = window.setTimeout(() => { setShownKey(pageKey); setFocusing(false); }, 460);
    return () => window.clearTimeout(t);
  }, [pageKey]);

  /** 'home:root' → 'home'（页面的底色按页签取） */
  const tabOfKey = (k: string) => k.split(':')[0];

  // 空闲预热（2026-09-14）：首屏落定后、浏览器空闲时把「我们」「设置」两页先在后台挂上
  // （隐藏）——图片那时就解析好了，第一次切过去幕布揭开就已经是完整页面。
  useEffect(() => {
    const warm = () => {
      setMounted((m) => ['couple:root', 'settings:root'].reduce((acc, k) => (acc.includes(k) ? acc : [...acc, k]), m));
    };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (typeof ric === 'function') {
      const id = ric(warm, { timeout: 4000 });
      return () => (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(warm, 2500);
    return () => window.clearTimeout(t);
  }, []);
  const navTap = (key: string) => {
    if (key === 'home') { setTab('home'); return; }
    if (key === 'couple') { setTab('couple'); return; }
    if (key === 'settings') { setTab('settings'); return; }
    addToast('「动态页」建设中 🏗️', 'info');
  };

  // 页面渲染（2026-09-14）：抽成函数——切页时旧页也要照着它再渲染一份（过渡期间当底）
  const renderPage = (pgTab: string, pgInner: string | null) => (
    pgTab === 'couple' ? (
        <CoupleSpace />
      ) : pgTab === 'settings' ? (
        <CoupleBeauty />
      ) : pgInner === 'diary' ? (
        <CoupleDiary initialOwner="me" onBack={() => setInner(null)} />
      ) : pgInner === 'activity' ? (
        <CoupleCalendar initialMode="feed" onBack={() => setInner(null)} />
      ) : (
        <>
      {/* 页面画布：1280×2774 等比，container-type 供 cqw 缩放 */}
      <div className="relative" style={{ containerType: 'inline-size', aspectRatio: '1280 / 2774', width: '100%' }}>

        {/* ── 置底玻璃卡片 ── */}
        {CARDS.map((c, i) => {
          const r = cqw(c.radius ?? 24, 9);
          const alpha = c.dim ? 0.12 : 0.20; // 情绪板单独降透明度
          const radius = c.corners === 'left' ? `${r} 0 0 ${r}` : c.corners === 'right' ? `0 ${r} ${r} 0` : r;
          return (
            <div key={i} className="absolute" style={{
              left: wPct(c.x), top: hPct(c.y), width: wPct(c.w), height: hPct(c.h),
              background: c.tint === 'black' ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`,
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: radius,
            }}>
              {/* 卡片 4 上面叠的小板：单独再缩 4px（inset 10），拉开与外板的间距 */}
              {i === 3 && (
                <div className="absolute" style={{
                  inset: cqw(10, 4), background: `rgba(255,255,255,${alpha})`,
                  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: r,
                }} />
              )}
            </div>
          );
        })}

        {/* ── 大圆照片框（圆2）：单层 div 直接铺画布——嵌套 div 的 width% 按外层 390 容器解析，照片被缩成 112px 小圆（Angelica 报"中心小头像"根因）；坐标对准底图镂空实测中心 (608, 789.5) ── */}
        <div className="absolute rounded-full overflow-hidden" style={{
          left: wPct(413), top: hPct(594.5), width: wPct(390), aspectRatio: '1 / 1',
          background: 'linear-gradient(150deg, #5b6d8c 0%, #3d4d6e 55%, #2c3a58 100%)',
          border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 3px 12px rgba(0,0,0,0.25)',
        }}>
          {homeDiscUrl && <img src={homeDiscUrl} alt="" draggable={false} decoding="async" className="w-full h-full object-cover pointer-events-none select-none" />}
        </div>

        {/* ── 照片墙三张占位：按 Angelica 单发的固定位置/尺寸自由显示，不裁切 ── */}
        {PHOTOS.map((p, i) => (
          <div key={i} className="absolute" style={{
            left: wPct(p.x), top: hPct(p.y), width: wPct(p.w), height: hPct(p.h),
            transform: `rotate(${p.rot}deg)`, background: p.bg,
            border: `${cqw(6, 2)} solid rgba(255,255,255,0.9)`,
            boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
          }} />
        ))}

        {/* ── 专辑照片（2026-08-30 上真图）：挂载角色收听次数最多的那首歌封面；没听过歌时保持占位 ── */}
        <div className="absolute overflow-hidden" style={{
          left: wPct(218.89), top: hPct(2133.82), width: wPct(265.28), aspectRatio: '1 / 1', borderRadius: cqw(16, 6),
          background: 'linear-gradient(160deg, #47597a 0%, #2c3a58 70%, #1f2b45 100%)',
          boxShadow: '0 3px 12px rgba(0,0,0,0.25)',
        }}>
          {topSongCover && (
            /* 专辑照片在页面很下方（y≈2134），懒加载：滚到附近再取图，首屏少一张 */
            <img src={topSongCover} alt="" draggable={false} decoding="async" loading="lazy" className="w-full h-full object-cover pointer-events-none select-none" />
          )}
          {/* 唱片中心孔装饰：有真图时压暗一点，别挡封面 */}
          <div className="absolute rounded-full" style={{
            left: '50%', top: '50%', width: '38%', aspectRatio: '1 / 1', transform: 'translate(-50%,-50%)',
            background: topSongCover ? 'rgba(20,26,42,0.18)' : 'rgba(255,255,255,0.08)',
          }} />
          {topSong && (
            <div className="absolute left-0 right-0 bottom-0 px-1.5 pb-1 pointer-events-none">
              <div className="truncate text-center" style={{ fontSize: cqw(9, 7), color: '#fff', opacity: 0.75, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                {topSong.name} · {topSong.artists.join(' / ')}
              </div>
            </div>
          )}
        </div>

        {/* ── 圆1 头像占位（底图无画框，加细描边+阴影让它嵌着；美化设置可换图） ── */}
        <div className="absolute rounded-full flex items-center justify-center overflow-hidden" style={{
          left: wPct(43.49), top: hPct(127.57), width: wPct(165), aspectRatio: '1 / 1',
          background: 'linear-gradient(160deg, #dbe3ef 0%, #93a5bd 100%)',
          border: '1px solid rgba(255,255,255,0.35)', boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
        }}>
          {noxAvatarUrl ? (
            <img src={noxAvatarUrl} alt="" draggable={false} decoding="async" className="w-full h-full object-cover pointer-events-none select-none" />
          ) : (
            <MoonStars weight="fill" className="w-[42%] h-[42%] text-[#2f3c5c]" />
          )}
        </div>

        {/* ── 猫爪（Angelica 组件 PNG，Welcome Home 右侧紧挨） ── */}
        <img
          src="/Home/猫爪1.png"
          alt=""
          draggable={false}
          className="absolute object-contain pointer-events-none select-none"
          style={{ left: wPct(633.65), top: hPct(366.93), width: wPct(70.22), height: hPct(72.48) }}
        />

        {/* ── 底图蒙版（照片/占位件从镂空透出） ── */}
        <img
          src="/Home/底图.png"
          alt=""
          draggable={false}
          decoding="async"
          fetchPriority="high"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
          style={{ zIndex: 30 }}
        />

        {/* ── 文字层 ── */}
        <div style={{ zIndex: 40, position: 'absolute', inset: 0 }} className="pointer-events-none">
          <Text x={242.08} y={140.61} w={537.8} h={46.39} size={34} min={11} color="#ffffff" weight={600} spacing="0.01em" opacity={0.6}>{ROOM_TEXT.status}</Text>
          <Text x={247.88} y={217.44} w={204.39} h={44.94} size={40} min={13} color="#ffffff" weight={700} opacity={0.7}>{ROOM_TEXT.name}</Text>
          <Text x={98.57} y={352.25} w={800} h={95} size={72} min={20} color="#ffffff" weight={700} lineHeight={1.15}>{ROOM_TEXT.welcome}</Text>
          <Text x={168.15} y={479.82} w={320} h={27.54} size={20} min={9} color="#1c1c1c" opacity={0.8} style={{ whiteSpace: 'nowrap' }}>{ROOM_TEXT.custom1}</Text>
          <Text x={152.21} y={545.05} w={260} h={26.09} size={19} min={9} color="#1c1c1c" opacity={0.8} style={{ whiteSpace: 'nowrap' }}>{ROOM_TEXT.custom2}</Text>
          <Text x={840.77} y={737.85} w={340.66} h={105.82} size={12} min={8.5} color="#adadad" lineHeight={1.55} style={{ alignItems: 'flex-start', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}>{recentActivityText}</Text>
          <Text x={249.33} y={732.05} w={81.18} h={31.89} size={24} min={9} color="#adadad">{now.getFullYear()}</Text>
          <Text x={204.9} y={772.54} w={202.94} h={47.84} size={34} min={11} color="#666666" spacing="0.06em">{weekday}</Text>
          <Text x={251} y={833.52} w={70} h={25} size={16} min={8} color="#ffffff" weight={600}>{dateStr}</Text>
          <Text x={113.65} y={1001.97} w={240} h={38} size={22} min={10} color="#ffffff" weight={600} style={{ whiteSpace: 'nowrap' }}>The photos</Text>
          <Text x={691.46} y={1725.03} w={314.56} h={31.89} size={18} min={9} color="#152f4d" weight={600}>{ROOM_TEXT.diaryStatus}</Text>
          <Text x={775.54} y={1954.47} w={130} h={30} size={30} min={12} color="#ffffff" opacity={0.7} align="center">Books</Text>
          <Text x={969.78} y={2122.22} w={130} h={30} size={30} min={12} color="#ffffff" opacity={0.7} align="center">Folder</Text>
          <Text x={781.34} y={2286.43} w={210} h={30} size={30} min={12} color="#ffffff" opacity={0.7} align="center">Meditation</Text>
          <Text x={854.69} y={1804.47} w={70} h={22.5} size={16} min={8} color="#ffffff" opacity={0.55} align="center">Diary</Text>
          <Text x={335.14} y={2045.68} w={110} h={23.5} size={16} min={8} color="#ffffff" opacity={0.55} align="center">Emotion</Text>
          <Text x={385.01} y={2460.85} w={70} h={23.5} size={16} min={8} color="#ffffff" opacity={0.55} align="center">Music</Text>
          <Text x={867.44} y={2463.17} w={148.44} h={12.75} size={11} min={7.5} color="#ffffff" opacity={0.55} align="center">The bookshelf</Text>
          <Text x={601.87} y={2528.83} w={82.34} h={26.67} size={20} min={9} color="#ffffff" align="center">Desk</Text>
        </div>

        {/* ── b 页热区 ── */}
        {HOTSPOTS.map((h, i) => (
          <button
            key={i}
            type="button"
            aria-label={h.label}
            onClick={() => (h.label === '日记页' ? setInner('diary') : h.label === '活动页' ? setInner('activity') : h.label === '歌曲页' ? openApp(AppID.Music) : addToast(`「${h.label}」建设中 🔨`, 'info'))}
            className="absolute bg-transparent border-0 outline-none"
            style={{ left: wPct(h.x), top: hPct(h.y), width: wPct(h.w), height: hPct(h.h), zIndex: 50 }}
          />
        ))}

        {/* ── 返回按钮（设计稿没有，右上角放了个半透明玻璃圈，不要可摘） ── */}
        <button
          type="button"
          aria-label="返回"
          onClick={closeApp}
          className="absolute rounded-full flex items-center justify-center"
          style={{
            left: wPct(1128), top: hPct(118), width: wPct(80), aspectRatio: '1 / 1', zIndex: 60,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
            backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', color: 'rgba(255,255,255,0.75)',
          }}
        >
          <ArrowLeft style={{ width: cqw(24, 16), height: cqw(24, 16) }} />
        </button>
      </div>
        </>
    )
  );

  // 每层自带背景（2026-09-14）：以前背景挂在外层容器上，切页瞬间就换色，
  // 旧页还盖着的时候底下已经变色 = 一闪；现在背景跟着图层走，旧页带走它的天色。
  const bgFor = (t: string) => (t === 'home'
    ? (homeBgUrl
      ? { backgroundImage: `url(${homeBgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: 'linear-gradient(180deg, #2F3C5C 0%, #6E7588 100%)' })
    : { background: '#ffe3ef' });

  return (
    <div
      className="h-full w-full relative overflow-hidden select-none"
      style={bgFor(tab)}
    >
      {/* 页面层：每层自己滚、自带背景；访问过的都留着（display:none 不重建）。
          转场期间「旧页（shownKey）+ 新页（pageKey）」同时可见：旧页失焦淡出、新页在上层聚焦淡入；
          460ms 后收工，只剩新页。 */}
      {mounted.map((k) => {
        const [layerTab, layerInnerRaw] = k.split(':');
        const layerInner = layerInnerRaw === 'root' ? null : layerInnerRaw;
        const isNew = focusing && k === pageKey;
        const isOld = k === shownKey;
        const visible = isNew || isOld;
        const cls = isNew ? 'page-focus' : (focusing && isOld ? 'page-defocus' : '');
        return (
          <div
            key={k}
            className={`absolute inset-0 overflow-y-auto ${cls}`}
            style={{ ...bgFor(tabOfKey(k)), display: visible ? undefined : 'none', zIndex: isNew ? 10 : undefined }}
          >
            {renderPage(layerTab, layerInner)}
          </div>
        );
      })}

      {/* ── 底部胶囊导航（固定悬浮） ── */}
      <div
        className="fixed left-1/2 -translate-x-1/2 flex items-center z-[70]"
        style={{
          bottom: 'calc(var(--safe-bottom, 0px) + 16px)',
          width: '68.75%', maxWidth: 300, height: 46,
          background: 'rgba(10,14,22,0.30)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          border: '1px solid rgba(255,255,255,0.10)', borderRadius: 23,
          boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
        }}
      >
        {([
          { key: 'home', label: 'Nox 的家', icon: House },
          { key: 'couple', label: '我们', icon: Heart },
          { key: 'feed', label: '动态', icon: Pulse },
          { key: 'settings', label: '设置', icon: GearSix },
        ] as const).map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => navTap(t.key)}
              className="flex-1 h-full flex flex-col items-center justify-center gap-0.5"
              style={{ color: active ? '#ffffff' : 'rgba(255,255,255,0.45)' }}
            >
              <Icon style={{ width: 18, height: 18 }} weight={active ? 'fill' : 'regular'} />
              <span style={{ fontSize: 8.5, lineHeight: 1 }}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default NoxHomeApp;

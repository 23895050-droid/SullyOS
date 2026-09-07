// 情侣空间 — 「我们」tab 首屏（Angelica 设计 2026-08-19，桌面文档：情侣空间首屏ui1.md + 首屏参考附录.md）
// 设计稿比例：附录 JSON 1290×2796（坐标仅供结构参考，按文档第 3 节结构微调）
// 图层（z）：宣告区背景占位(1) → 白色主卡(2) → 心电图(3) → 头像(4) → 气泡(5) → 胶囊条(5) → 内容(6) → 各卡片(10) → 便签(11) → 整卡热区(12) → 播放按钮(14) → 快捷卡(20) → 待办弹窗(100)
// 自绘：粉色爱心(#ffe3ef) / 黑白播放按钮 / 心电图动画；素材：public/Couple/（定位图标 / 耳机 / 留白图 / 猫爪1 / 月亮）
// 占位数据：COUPLE.startDate / birthday / location / songs，情侣设置页接入后改为可编辑；整屏背景 --couple-bg 默认 #ffe3ef
import React, { useEffect, useState } from 'react';
import QuickBankModal from './QuickBankModal';
import CoupleDiet from './CoupleDiet';
import CoupleDiary from './CoupleDiary';
import CoupleTogether from './CoupleTogether';
import { ArrowLeft, Plus, ForkKnife, Drop, PiggyBank, Gift } from '@phosphor-icons/react';
import { useBlobRefUrl } from '../../utils/blobRef';
import { loadCoupleBeauty, buildTheme } from './CoupleBeauty';
import CoupleBelow from './CoupleBelow';
import CoupleCalendar from './CoupleCalendar';
import { useOS } from '../../context/OSContext';
import { useMusic, musicApi, toHttps, loadMusicCfgStandalone } from '../../context/MusicContext';
import { AppID } from '../../types';
import { useTodoStore, fixedTodos, shortTodosOn, toggleTodo as toggleTodoStore, addTodo as addTodoStore } from './todoStore';
import { useAnnivStore, daysUntilAnniv } from './annivStore';
import { getLocalDateKey } from '../../utils/localDate';
import { useMusicStore, topCharTogetherSong, setMySongPick, importedSongById } from './musicStore';
import { getMountConfig } from '../../utils/noxhomeMount';
import { useCouplePaletteStore } from './couplePaletteStore';
import { buildCouplePaletteCss } from './couplePalette';

const DESIGN_W = 1290;
const DESIGN_H = 2796;

const wPct = (n: number) => `${((n / DESIGN_W) * 100).toFixed(3)}%`;
const hPct = (n: number) => `${((n / DESIGN_H) * 100).toFixed(3)}%`;
const cqw = (designPx: number, minPx = 8) => `max(${minPx}px, ${((designPx / DESIGN_W) * 100).toFixed(3)}cqw)`;

// 阴影跟随皮肤色（CSS 变量在画布根由 buildTheme 设置，fallback 是默认粉色）
const CARD_SHADOW = 'var(--cs-shadow-soft, 0 10px 30px rgba(233,160,190,0.16), 0 2px 8px rgba(60,30,50,0.05))';
const QUICK_SHADOW = 'var(--cs-shadow-strong, 0 22px 44px rgba(214,110,150,0.22), 0 8px 18px rgba(60,30,50,0.08))';

// ── 占位数据（等 Angelica 给真值 / 情侣设置页接入后改为可编辑） ──
const COUPLE = {
  startDate: '2024-01-01', // 在一起的日期（示例，改成你们的日子）
  names: ['Nox', 'Angelica'] as const,
  combined: 'Nox & Angel',
  status: 'In Love',
  location: 'On the Moon', // Nox 选的：今晚还要一起看月亮（英文短语更精致）
};

const PHRASES = [
  '今晚的月亮很圆，一起看呀',
  '今天也有好好想你',
  '记得喝水，也记得想我',
  '被爱着的一天，值得记录',
  '有一盏灯一直为你留着',
  '今天想吃什么？我陪你',
];

const WEEKDAY_EN = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const daysTogether = (now: Date) =>
  Math.max(0, Math.floor((now.getTime() - new Date(COUPLE.startDate + 'T00:00:00').getTime()) / 86400000));

// ── 定位文字（与 NoxHome 同款思路） ──
const Text: React.FC<{
  x: number; y: number; w: number; h: number; size: number; min?: number; color: string;
  weight?: number; align?: 'left' | 'center'; opacity?: number; spacing?: string; lineHeight?: number;
  style?: React.CSSProperties; z?: number; children: React.ReactNode;
}> = ({ x, y, w, h, size, min, color, weight, align = 'left', opacity = 1, spacing, lineHeight, style, z, children }) => (
  <div
    className="absolute pointer-events-none"
    style={{
      left: wPct(x), top: hPct(y), width: wPct(w), height: hPct(h),
      display: 'flex', alignItems: 'center', justifyContent: align === 'center' ? 'center' : 'flex-start',
      color, opacity, fontWeight: weight ?? 400, letterSpacing: spacing,
      fontSize: cqw(size, min ?? 8), lineHeight: lineHeight ?? 1.2, zIndex: z ?? 6,
      ...style,
    }}
  >
    {children}
  </div>
);

// ── 自绘粉色爱心（必须自绘，#ffe3ef 与整屏背景同色） ──
const HeartSelf: React.FC<{ width: number }> = ({ width }) => (
  <svg viewBox="0 0 32 29" style={{ width: cqw(width, 20), height: cqw(width * (29 / 32), 18) }} aria-hidden>
    <path
      d="M16 28.2C9.6 24.1 2.5 18.9 2.5 11.6 2.5 6.9 6.6 2.5 11.6 2.5c2.7 0 4.4 1.3 5.4 2.7 1-1.4 2.7-2.7 5.4-2.7 5 0 9.1 4.4 9.1 9.1 0 7.3-7.1 12.5-15.5 16.6z"
      fill="#ffe3ef"
    />
  </svg>
);

// ── 自绘黑白播放按钮（简洁黑白，非系统图标） ──
const PlayBtn: React.FC<{ playing: boolean }> = ({ playing }) => (
  <svg viewBox="0 0 28 28" style={{ width: '52%', height: '52%' }} aria-hidden>
    {playing ? (
      <>
        <rect x="8.5" y="7" width="4.6" height="14" rx="1.8" fill="#fff" />
        <rect x="15" y="7" width="4.6" height="14" rx="1.8" fill="#fff" />
      </>
    ) : (
      <path d="M12.5 9.2 L20 14 L12.5 18.8 Z" fill="#fff" />
    )}
  </svg>
);

const QUICK_OPTIONS = [
  { label: '饮食', icon: ForkKnife, route: 'c2' },
  { label: '经期', icon: Drop, route: 'c1-period' },
  { label: '记账', icon: PiggyBank, route: 'c3' },
] as const;

// ── 整卡热区（透明按钮盖在卡片上，负责跳转） ──
const Hotspot: React.FC<{ x: number; y: number; w: number; h: number; z: number; onTap: () => void }> = ({ x, y, w, h, z, onTap }) => (
  <button
    type="button"
    aria-label="进入"
    onClick={onTap}
    className="absolute bg-transparent border-0 outline-none cursor-pointer"
    style={{ left: wPct(x), top: hPct(y), width: wPct(w), height: hPct(h), zIndex: z }}
  />
);

// ── 待办新增弹窗（大卡片） ──
const TodoModal: React.FC<{ onClose: () => void; onAdd: (text: string) => void }> = ({ onClose, onAdd }) => {
  const [draft, setDraft] = useState('');
  const submit = () => {
    const text = draft.trim();
    if (text) onAdd(text);
    else onClose();
  };
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: 'rgba(50,20,35,0.28)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-3xl p-6 flex flex-col gap-4"
        style={{ width: 'min(80%, 330px)', background: 'var(--cp-card, #fff)', boxShadow: '0 24px 60px rgba(60,30,50,0.25)' }}
      >
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--cp-text, #3a2a33)' }}>新增待办</div>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="想做点什么？"
          style={{ border: '1.5px solid var(--cs-border, #f2d3e0)', background: 'var(--cp-soft, #fdf4f8)', borderRadius: 14, padding: '10px 14px', fontSize: 14, color: 'var(--cp-text, #4a3a44)', outline: 'none' }}
        />
        <div className="flex justify-end items-center gap-4">
          <button type="button" onClick={onClose} className="border-0 bg-transparent" style={{ color: 'var(--cp-muted, #9a7a8a)', fontSize: 14 }}>取消</button>
          <button type="button" onClick={submit} className="border-0" style={{ background: 'var(--cs-accent, #f0a8c0)', color: '#fff', borderRadius: 999, padding: '8px 20px', fontSize: 14, fontWeight: 600 }}>添加</button>
        </div>
      </div>
    </div>
  );
};

// ── 选歌弹层（2026-08-30）：右卡「我自己选的一首歌」，从歌库/听过的记录里挑 ──
const PickerSongRow: React.FC<{
  name: string;
  artists: string;
  albumPic?: string;
  onClick: () => void;
}> = ({ name, artists, albumPic, onClick }) => {
  const url = useBlobRefUrl(albumPic);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 rounded-2xl px-3 py-2 transition-all active:scale-[0.98] text-left border-0 cursor-pointer"
      style={{ background: 'var(--cp-glass, rgba(255,255,255,0.85))', border: '1px solid rgba(233,160,190,0.18)' }}
    >
      <img src={url || '/Couple/留白图.jpg'} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold truncate" style={{ color: 'var(--cp-text, #3a2a33)' }}>{name}</div>
        <div className="text-[10px] truncate" style={{ color: 'var(--cp-faint, #b0909c)' }}>{artists}</div>
      </div>
      <span className="text-[9px] shrink-0" style={{ color: 'var(--cp-deep, #e08aa5)' }}>选这首</span>
    </button>
  );
};

const SongPickerModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const musicStore = useMusicStore();
  const [tab, setTab] = useState<'lib' | 'played' | 'search'>('lib');
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<{ id: number; name: string; artists: string[]; albumPic: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const { addToast } = useOS();
  const lib = musicStore.importedSongs.slice(0, 100);
  const played = [...musicStore.playRecords].sort((a, b) => b.playCount - a.playCount).slice(0, 50);
  const pick = (s: { neteaseId?: number; name: string; artists: string[]; albumPic?: string }) => {
    setMySongPick({ neteaseId: s.neteaseId, name: s.name, artists: s.artists, albumPic: s.albumPic });
    onClose();
  };
  // 搜索任意歌（2026-08-30 她要求：我喜欢的歌不限于歌库/他听过的，任何一首都能选）
  const doSearch = async () => {
    const kw = keyword.trim();
    if (!kw || searching) return;
    setSearching(true);
    try {
      const r = await musicApi.search(loadMusicCfgStandalone(), kw);
      const songs = (r?.result?.songs || []).map((s: any) => ({
        id: s.id, name: s.name,
        artists: (s.ar || s.artists || []).map((a: any) => a.name),
        albumPic: toHttps(s.al?.picUrl || s.album?.picUrl || ''),
      }));
      setResults(songs);
      if (!songs.length) addToast('没找到——换个关键词试试', 'info');
    } catch (e: any) {
      addToast(`搜索失败：${e.message}`, 'error');
    } finally {
      setSearching(false);
    }
  };
  return (
    <div className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 130, background: 'rgba(58,32,50,0.35)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex flex-col"
        style={{
          width: 'min(100%, 560px)', background: 'var(--cp-card, #fff)', borderRadius: '28px 28px 0 0',
          padding: 18, paddingBottom: 'calc(18px + var(--safe-bottom, 0px))', gap: 10,
          boxShadow: '0 -12px 40px rgba(60,30,50,0.2)',
        }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--cp-text, #3a2a33)' }}>选一首歌放这里</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center border-0 cursor-pointer"
            style={{ background: 'var(--cp-soft, #ffe6eb)', color: 'var(--cp-deep, #9a6a80)', fontSize: 12 }} aria-label="关闭">✕</button>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTab('lib')}
            className="rounded-full px-3 py-1.5 border-0 cursor-pointer transition-all"
            style={{
              fontSize: 10, fontWeight: 600,
              background: tab === 'lib' ? 'var(--cp-deep, #e08aa5)' : 'var(--cp-soft, #fff5f9)',
              color: tab === 'lib' ? '#fff' : 'var(--cp-muted, #9a7a8a)',
            }}
          >
            歌库（{lib.length}）
          </button>
          <button
            type="button"
            onClick={() => setTab('played')}
            className="rounded-full px-3 py-1.5 border-0 cursor-pointer transition-all"
            style={{
              fontSize: 10, fontWeight: 600,
              background: tab === 'played' ? 'var(--cp-deep, #e08aa5)' : 'var(--cp-soft, #fff5f9)',
              color: tab === 'played' ? '#fff' : 'var(--cp-muted, #9a7a8a)',
            }}
          >
            听过的（{played.length}）
          </button>
          <button
            type="button"
            onClick={() => setTab('search')}
            className="rounded-full px-3 py-1.5 border-0 cursor-pointer transition-all"
            style={{
              fontSize: 10, fontWeight: 600,
              background: tab === 'search' ? 'var(--cp-deep, #e08aa5)' : 'var(--cp-soft, #fff5f9)',
              color: tab === 'search' ? '#fff' : 'var(--cp-muted, #9a7a8a)',
            }}
          >
            搜索任何歌
          </button>
        </div>
        {tab === 'search' && (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void doSearch(); }}
              placeholder="歌名 / 歌手，任何一首都可以"
              style={{ flex: 1, border: '1.5px solid var(--cp-border, #f2d3e0)', background: 'var(--cp-soft, #fdf4f8)', borderRadius: 12, padding: '8px 12px', fontSize: 12, color: 'var(--cp-text, #4a3a44)', outline: 'none' }}
            />
            <button
              type="button"
              onClick={() => void doSearch()}
              disabled={searching}
              className="rounded-full px-4 py-2 border-0 cursor-pointer disabled:opacity-50"
              style={{ fontSize: 11, fontWeight: 600, background: 'var(--cp-soft, #ffe6eb)', color: 'var(--cp-text, #6b4a58)' }}
            >
              {searching ? '搜着…' : '搜索'}
            </button>
          </div>
        )}
        <div className="space-y-1.5 max-h-[46vh] overflow-y-auto">
          {tab === 'lib' && lib.length === 0 && (
            <div className="text-center py-4 text-[11px]" style={{ color: 'var(--cp-faint, #b0909c)' }}>歌库还是空的——也可以去「搜索任何歌」直接挑</div>
          )}
          {tab === 'lib' && lib.map((s) => (
            <PickerSongRow key={s.neteaseId} name={s.name} artists={s.artists.join(' / ')} albumPic={s.albumPic}
              onClick={() => pick({ neteaseId: s.neteaseId, name: s.name, artists: s.artists, albumPic: s.albumPic })} />
          ))}
          {tab === 'played' && played.length === 0 && (
            <div className="text-center py-4 text-[11px]" style={{ color: 'var(--cp-faint, #b0909c)' }}>还没有听歌记录</div>
          )}
          {tab === 'played' && played.map((r) => (
            <PickerSongRow key={r.neteaseId} name={r.name} artists={r.artists.join(' / ')} albumPic={r.albumPic}
              onClick={() => pick({ neteaseId: r.neteaseId, name: r.name, artists: r.artists, albumPic: r.albumPic })} />
          ))}
          {tab === 'search' && !searching && keyword.trim() === '' && (
            <div className="text-center py-4 text-[11px]" style={{ color: 'var(--cp-faint, #b0909c)' }}>不限于歌库——搜到的任何一首都能放这里</div>
          )}
          {tab === 'search' && results.length === 0 && keyword.trim() !== '' && !searching && (
            <div className="text-center py-4 text-[11px]" style={{ color: 'var(--cp-faint, #b0909c)' }}>没搜到，换个关键词试试</div>
          )}
          {tab === 'search' && results.map((s) => (
            <PickerSongRow key={s.id} name={s.name} artists={s.artists.join(' / ')} albumPic={s.albumPic}
              onClick={() => pick({ neteaseId: s.id, name: s.name, artists: s.artists, albumPic: s.albumPic })} />
          ))}
        </div>
        <button
          type="button"
          onClick={() => { setMySongPick(undefined); onClose(); }}
          className="w-full py-1.5 text-[11px] border-0 cursor-pointer"
          style={{ color: 'var(--cp-faint, #b0909c)', background: 'transparent' }}
        >
          清掉选择
        </button>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2 rounded-full text-[11px] font-semibold border-0 cursor-pointer"
          style={{ background: 'var(--cp-soft, #ffe6eb)', color: 'var(--cp-text, #6b4a58)' }}
        >
          取消
        </button>
      </div>
    </div>
  );
};

// ── 首屏 ──
const CoupleFirstScreen: React.FC<{ onOpen: (route: string) => void }> = ({ onOpen }) => {
  const [now, setNow] = useState(() => new Date());
  const [showTodoModal, setShowTodoModal] = useState(false);
  const [showSongPicker, setShowSongPicker] = useState(false);
  // 歌曲双卡真数据（2026-08-30）：左 = 角色听最多的歌；右 = 她亲手选的歌
  const musicStore = useMusicStore();
  const { current, playing: musicPlaying, playSong } = useMusic();
  // 反馈2 #9：左卡只取挂载角色的一起听会话（角色自己的听歌数据），不再读混合池
  const topSong = topCharTogetherSong(musicStore, getMountConfig().charId);
  // 反馈1 A2：老数据里的 http 封面渲染前升级 https（blobRef 令牌由 useBlobRefUrl 解析，toHttps 只碰 http 前缀）
  const topSongCover = useBlobRefUrl(toHttps(topSong?.albumPic));
  const myPick = musicStore.mySongPick;
  const myPickCover = useBlobRefUrl(toHttps(myPick?.albumPic));
  const [beauty] = useState(loadCoupleBeauty);
  const headerBgUrl = useBlobRefUrl(beauty.headerBg);
  const capsuleBgUrl = useBlobRefUrl(beauty.capsuleBg);
  const noxAvatarUrl = useBlobRefUrl(beauty.avatarNox);
  const angelicaAvatarUrl = useBlobRefUrl(beauty.avatarAngelica);
  // 皮肤色主题：爱心固定粉色，其余粉色元素全部吃 CSS 变量（美化区可改）
  const theme = buildTheme(beauty.accent);
  const themeVars = {
    ['--cs-accent' as string]: theme.accent,
    ['--cs-soft' as string]: theme.soft,
    ['--cs-border' as string]: theme.border,
    ['--cs-deep' as string]: theme.deep,
    ['--cs-scroll' as string]: theme.scroll,
    ['--cs-shadow-soft' as string]: theme.shadowSoft,
    ['--cs-shadow-strong' as string]: theme.shadowStrong,
  } as React.CSSProperties;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ampm = now.getHours() >= 12 ? 'PM' : 'AM';
  const days = daysTogether(now);
  // 待办/纪念日真数据（2026-08-22 接通：与日历页同一份 store）
  const todoStore = useTodoStore();
  const annivStore = useAnnivStore();
  const todayKey = getLocalDateKey();
  const homeTodos = [...fixedTodos(todoStore.todos), ...shortTodosOn(todoStore.todos, todayKey)];
  const nearestAnniv = [...annivStore.items].sort((a, b) => daysUntilAnniv(a.date, now) - daysUntilAnniv(b.date, now))[0];
  const lunar = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' }).format(now);
  const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}月${String(now.getDate()).padStart(2, '0')}日 ${WEEKDAY_CN[now.getDay()]} ${hh}:${mm}`;
  const phrase = PHRASES[Math.floor(now.getTime() / 86400000) % PHRASES.length];

  // 右侧迷你日历：当月 6 行格子，今天粉色高亮
  const today = now.getDate();
  const monthStartDow = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const monthDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const miniCells: (number | null)[] = [];
  for (let i = 0; i < 42; i++) {
    const d = i - monthStartDow + 1;
    miniCells.push(d >= 1 && d <= monthDays ? d : null);
  }

  // 美化区自定义背景（blobref 解析成 url，无自定义时用默认渐变/白底）
  const headerBgStyle: React.CSSProperties = headerBgUrl
    ? { backgroundImage: `url(${headerBgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: 'radial-gradient(circle at 50% 32%, rgba(255,255,255,0.55), transparent 62%), linear-gradient(165deg, var(--cp-bg, #ffd3e4) 0%, var(--cp-bgMid, #ffeaf3) 55%, var(--cp-bgDeep, #ffdcec) 100%)' };
  const capsuleBgStyle: React.CSSProperties = capsuleBgUrl
    ? { backgroundImage: `url(${capsuleBgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: 'var(--cp-glass, rgba(255,255,255,0.85))' };

  const toggleTodo = (id: string) => toggleTodoStore(id, todayKey);
  const addTodo = (text: string) => {
    addTodoStore({ text, kind: 'fixed' });
    setShowTodoModal(false);
  };

  // 歌卡播放（2026-08-30 她要求：任何一首都能播）——歌库里有的带完整信息，
  // 搜索选的歌不在歌库也直接按网易云在线播（duration 交给播放器自己量）
  const { addToast } = useOS();
  const playPicked = (neteaseId: number | undefined, name: string, artists?: string[], albumPic?: string) => {
    if (neteaseId === undefined) return;
    const song = importedSongById(musicStore.importedSongs, neteaseId);
    playSong({
      id: neteaseId,
      name: song?.name ?? name,
      artists: song ? song.artists.join(' / ') : (artists ?? []).join(' / '),
      album: song?.album ?? '',
      albumPic: song?.albumPic ?? albumPic ?? '',
      duration: song?.duration ? Math.round(song.duration / 1000) : 0,
      fee: song?.fee ?? 0,
    });
  };
  const leftPlaying = !!topSong && current?.id === topSong.neteaseId && musicPlaying;
  const rightPlaying = myPick?.neteaseId !== undefined && current?.id === myPick.neteaseId && musicPlaying;

  return (
    <div className="h-full w-full overflow-y-auto cs-scroll">
      <style>{`@keyframes csEcg { from { stroke-dashoffset: 340; } to { stroke-dashoffset: -340; } } .cs-ecg path { stroke-dasharray: 340; animation: csEcg 5s linear infinite; } .cs-todos, .cs-scroll { scrollbar-width: thin; scrollbar-color: var(--cs-scroll, rgba(233,160,190,0.55)) transparent; } .cs-todos::-webkit-scrollbar, .cs-scroll::-webkit-scrollbar { width: 4px; } .cs-todos::-webkit-scrollbar-thumb, .cs-scroll::-webkit-scrollbar-thumb { background: var(--cs-scroll, rgba(233,160,190,0.55)); border-radius: 2px; }`}</style>

      {/* 页面画布：1290×2796 等比（width 100% + maxWidth 卡帽，与首屏以下各画布同源同宽） */}
      <div className="relative overflow-hidden" style={{ containerType: 'inline-size', aspectRatio: '1290 / 2796', width: '100%', maxWidth: 'calc(100dvh * (1290 / 2796))', margin: '0 auto', ...themeVars }}>

        {/* ── 3.1 主身份宣告区 ── */}
        {/* 背景图占位（用户可上传替换，参考图是雨天窗户；这里用低饱和柔粉渐变占位） */}
        {/* 宣告区背景图：绑定「设置-美化」，可替换本地图片 */}
        <div className="absolute overflow-hidden" style={{
          left: wPct(120), top: hPct(215), width: wPct(1060), height: hPct(400), zIndex: 1, borderRadius: cqw(36, 12),
          ...headerBgStyle,
        }} />
        {/* 白色圆角大卡（视觉核心） */}
        <div className="absolute" style={{ left: wPct(100), top: hPct(509), width: wPct(1093), height: hPct(515), zIndex: 2, background: 'var(--cp-card, #fff)', borderRadius: cqw(36, 12), boxShadow: CARD_SHADOW }} />
        {/* 心电图连接线（自绘，动画） */}
        <div className="absolute" style={{ left: wPct(530), top: hPct(457), width: wPct(232), height: hPct(132), zIndex: 3 }}>
          <svg viewBox="0 0 232 132" className="cs-ecg" style={{ width: '100%', height: '100%' }}>
            <path d="M0 66 L50 66 L63 66 L71 38 L81 94 L89 66 L122 66 L135 66 L143 42 L151 90 L159 66 L192 66 L232 66"
              fill="none" stroke="var(--cs-accent, #e8a0b4)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        {/* 两个圆形头像：骑缝压在背景图与白卡交界 */}
        <div className="absolute rounded-full overflow-hidden" style={{ left: wPct(290), top: hPct(365), width: wPct(240), aspectRatio: '1 / 1', zIndex: 4, background: 'linear-gradient(160deg, #dbe3ef 0%, #93a5bd 100%)', border: `${cqw(4, 2)} solid rgba(255,255,255,0.95)`, boxShadow: '0 8px 20px rgba(60,30,50,0.18)' }}>
          {noxAvatarUrl ? (
            <img src={noxAvatarUrl} alt="" draggable={false} decoding="async" className="w-full h-full object-cover pointer-events-none select-none" />
          ) : (
            <img src="/Couple/月亮.png" alt="" draggable={false} className="w-full h-full object-contain pointer-events-none select-none" style={{ padding: '14%' }} />
          )}
        </div>
        <div className="absolute rounded-full overflow-hidden" style={{ left: wPct(760), top: hPct(365), width: wPct(240), aspectRatio: '1 / 1', zIndex: 4, background: 'linear-gradient(160deg, #f6cddc 0%, #e2a8c3 100%)', border: `${cqw(4, 2)} solid rgba(255,255,255,0.95)`, boxShadow: '0 8px 20px rgba(60,30,50,0.18)' }}>
          {angelicaAvatarUrl ? (
            <img src={angelicaAvatarUrl} alt="" draggable={false} decoding="async" className="w-full h-full object-cover pointer-events-none select-none" />
          ) : (
            <img src="/Couple/猫爪1.png" alt="" draggable={false} className="w-full h-full object-contain pointer-events-none select-none" style={{ padding: '20%' }} />
          )}
        </div>
        {/* 昵称气泡（白色，带小尾巴） */}
        {COUPLE.names.map((name, i) => (
          <div key={name} className="absolute flex items-center justify-center" style={{
            left: wPct(i === 0 ? 204 : 923), top: hPct(i === 0 ? 290 : 285), width: wPct(i === 0 ? 186 : 184), height: hPct(i === 0 ? 59 : 62), zIndex: 5,
            background: 'var(--cp-card, rgba(255,255,255,0.95))', borderRadius: cqw(14, 7), boxShadow: '0 4px 14px rgba(60,30,50,0.10)',
            fontSize: cqw(13, 9), color: '#6a5a64', fontWeight: 600,
          }}>
            {name}
            <div style={{ position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderTop: '7px solid rgba(255,255,255,0.95)' }} />
          </div>
        ))}
        {/* 昵称组合 / 状态 / 天数 / 地点（横向绝对居中） */}
        <Text x={533} y={631} w={258} h={67} size={30} min={13} color="#3a2a33" weight={700} align="center" z={6}>{COUPLE.combined}</Text>
        <Text x={575} y={722} w={140} h={34} size={14} min={8} color="#9a7a8a" align="center" z={6}>{COUPLE.status}</Text>
        <div className="absolute flex items-end justify-center" style={{ left: wPct(516), top: hPct(799), width: wPct(260), height: hPct(75), zIndex: 6 }}>
          <HeartSelf width={46} />
          <span style={{ fontSize: cqw(46, 18), fontWeight: 700, color: 'var(--cp-text, #3a2a33)', lineHeight: 1, marginLeft: cqw(10, 4) }}>{days}</span>
          <span style={{ fontSize: cqw(15, 9), color: 'var(--cp-muted, #9a7a8a)', fontWeight: 500, marginLeft: cqw(8, 3), paddingBottom: cqw(5, 2) }}>days</span>
        </div>
        <div className="absolute" style={{ left: wPct(562), top: hPct(900), width: wPct(44), height: hPct(60), zIndex: 6 }}>
          <img src="/Couple/定位图标.png" alt="" draggable={false} className="w-full h-full object-contain pointer-events-none select-none" />
        </div>
        <Text x={621} y={920} w={150} h={39} size={14} min={8} color="#9a7a8a" z={6} style={{ whiteSpace: 'nowrap' }}>{COUPLE.location}</Text>

        {/* ── 3.2 中部功能双卡区 ── */}
        {/* 纪念日倒计时卡（2026-08-22 接真数据：显示最近的纪念日，数据在日历页「纪念日」tab 管理） */}
        <div className="absolute" style={{ left: wPct(100), top: hPct(1110), width: wPct(420), height: hPct(440), zIndex: 10, background: 'var(--cp-card, #fff)', borderRadius: cqw(36, 12), boxShadow: CARD_SHADOW }} />
        <Text x={127} y={1180} w={260} h={30} size={13} min={8} color="#9a7a8a" z={11}>{nearestAnniv ? `${nearestAnniv.title} · 倒计时` : '纪念日倒计时'}</Text>
        <div className="absolute flex items-end" style={{ left: wPct(127), top: hPct(1235), width: wPct(230), height: hPct(84), zIndex: 11 }}>
          <span style={{ fontSize: cqw(50, 20), fontWeight: 700, color: 'var(--cp-text, #3a2a33)', lineHeight: 1 }}>{nearestAnniv ? daysUntilAnniv(nearestAnniv.date, now) : '—'}</span>
          <span style={{ fontSize: cqw(15, 9), color: 'var(--cp-muted, #9a7a8a)', fontWeight: 500, marginLeft: cqw(8, 3), paddingBottom: cqw(6, 3) }}>days</span>
        </div>
        <div className="absolute rounded-full flex items-center justify-center" style={{ left: wPct(140), top: hPct(1368), width: cqw(70, 38), aspectRatio: '1 / 1', zIndex: 11, background: 'var(--cs-soft, #fce8f1)' }}>
          <Gift style={{ width: cqw(38, 22), height: cqw(38, 22), color: 'var(--cs-deep, #d98ba9)' }} weight="regular" />
        </div>
        <Text x={237} y={1386} w={250} h={80} size={12} min={8} color="var(--cs-deep, #d98ba9)" weight={700} spacing="0.15em" lineHeight={1.7} z={11} style={{ whiteSpace: 'pre-line' }}>{nearestAnniv ? `${nearestAnniv.emoji}\n${nearestAnniv.date}` : ''}</Text>

        {/* 待办事项卡 */}
        <div className="absolute" style={{ left: wPct(570), top: hPct(1110), width: wPct(620), height: hPct(440), zIndex: 10, background: 'var(--cp-card, #fff)', borderRadius: cqw(36, 12), boxShadow: CARD_SHADOW }} />
        <Text x={605} y={1146} w={250} h={26} size={18} min={11} color="#4a3a44" weight={700} spacing="0.12em" z={11}>TO DO LIST</Text>
        {/* 便签条（自绘装饰，斜贴右上角，pointer-events 穿透） */}
        <div className="absolute pointer-events-none" style={{ left: wPct(959), top: hPct(1063), width: wPct(266), height: hPct(336), zIndex: 11, transform: 'rotate(-5deg)' }}>
          <div className="absolute inset-0" style={{
            background: '#fff8d6', borderRadius: cqw(12, 5), boxShadow: '0 12px 26px rgba(60,30,50,0.12)',
            backgroundImage: `repeating-linear-gradient(transparent, transparent ${cqw(21, 9)}, rgba(200,180,120,0.4) ${cqw(21, 9)}, rgba(200,180,120,0.4) ${cqw(22, 9)})`,
          }} />
          <div className="absolute" style={{ left: '20%', top: 0, bottom: 0, width: 2, background: 'rgba(232,150,150,0.55)' }} />
          <div className="absolute" style={{ left: '27%', top: '12%', right: '6%', fontSize: cqw(15, 9), lineHeight: 2, color: '#8a7a55', fontWeight: 500 }}>
            七夕 20:00 · 一起看月亮
            <br />
            花店 9:00 开门 🌷
          </div>
          <div className="absolute" style={{ top: -7, left: '36%', width: '28%', height: cqw(16, 8), background: 'rgba(255,255,255,0.65)', borderRadius: 4, transform: 'rotate(-3deg)', boxShadow: '0 2px 5px rgba(60,30,50,0.10)' }} />
        </div>
        {/* 待办列表（真数据 couple_todos_v3：固定每天 + 今天短期；文字在左、勾选框在右；宽度收在便签左侧，绝不压便签） */}
        <div className="cs-todos absolute" style={{ left: wPct(595), top: hPct(1208), width: wPct(340), height: hPct(240), zIndex: 13, overflowY: 'auto', paddingRight: cqw(6, 2) }}>
          {homeTodos.length === 0 && (
            <div style={{ fontSize: 9, color: 'var(--cp-faint, #b8a8b0)', padding: `${cqw(4, 2)} 0` }}>还没有待办 · 点右边的 + 加一条</div>
          )}
          {homeTodos.map((t) => {
            const checked = t.kind === 'fixed' ? t.doneDates.includes(todayKey) : t.done;
            return (
              <button key={t.id} type="button" onClick={() => toggleTodo(t.id)} className="flex items-center justify-between w-full text-left border-0 bg-transparent" style={{ padding: `${cqw(4, 2)} 0`, gap: cqw(10, 5) }}>
                <span className="flex-1" style={{ fontSize: 9, color: checked ? 'var(--cp-faint, #b8a8b0)' : 'var(--cp-text, #4a3a44)', textDecoration: checked ? 'line-through' : 'none', textDecorationColor: 'var(--cp-faint, #d9a9bb)', transition: 'color .2s ease', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.text}</span>
                <span className="relative shrink-0" style={{ width: 15, height: 15 }}>
                  <span className="absolute inset-0 rounded-md" style={{
                    border: '2px solid', borderColor: checked ? 'var(--cs-accent, #f0a8c0)' : 'var(--cp-faint, #c9b4c0)', background: 'transparent',
                    transition: 'all .2s ease',
                  }} />
                  {checked && (
                    <svg viewBox="0 0 16 12" style={{ position: 'absolute', width: 10, height: 8, left: '50%', top: '50%', transform: 'translate(-50%,-60%) rotate(-4deg)' }} aria-hidden>
                      <path d="M1 6 L6 11 L15 1" fill="none" stroke="var(--cs-deep, #c25a82)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {/* + 新增入口（便签下方，避开其斜角） */}
        <button
          type="button"
          aria-label="新增待办"
          onClick={() => setShowTodoModal(true)}
          className="absolute rounded-full flex items-center justify-center border-0 cursor-pointer transition-transform active:scale-90"
          style={{ left: wPct(1130), top: hPct(1460), width: cqw(34, 26), aspectRatio: '1 / 1', zIndex: 13, background: 'var(--cs-soft, #fce8f1)', border: '1.5px solid var(--cs-border, #f0c4d8)', color: 'var(--cs-deep, #c25a82)', boxShadow: '0 3px 10px rgba(214,110,150,0.18)' }}
        >
          <Plus weight="bold" style={{ width: '58%', height: '58%' }} />
        </button>

        {/* ── 3.3 日历与快捷记录叠加区 ── */}
        {/* 底层：日历卡片（偏左；左边实时时钟区，右边动态迷你日历） */}
        <div className="absolute" style={{ left: wPct(100), top: hPct(1690), width: wPct(700), height: hPct(370), zIndex: 10, background: 'var(--cp-card, #fff)', borderRadius: cqw(36, 12), boxShadow: CARD_SHADOW }} />
        <Text x={140} y={1746} w={290} h={30} size={12} min={8} color="#9a7a8a" spacing="0.08em" z={11}>{`${WEEKDAY_EN[now.getDay()]} · ${ampm}`}</Text>
        <Text x={140} y={1794} w={290} h={82} size={46} min={18} color="#3a2a33" weight={700} z={11} style={{ fontVariantNumeric: 'tabular-nums' }}>{`${hh}:${mm}`}</Text>
        <Text x={140} y={1882} w={290} h={30} size={13} min={8} color="var(--cp-muted, #8a6a7a)" z={11}>{`农历 · ${lunar}`}</Text>
        <Text x={140} y={1948} w={290} h={34} size={12} min={8} color="#b0909c" z={11}>{phrase}</Text>
        {/* 右侧动态迷你日历（当月月历，今天皮肤色高亮；整体上移 20px，min 地板压低——小屏上 min 像素会把行高撑爆容器导致溢出） */}
        <div className="absolute pointer-events-none" style={{ left: wPct(440), top: hPct(1732), width: wPct(300), height: hPct(240), zIndex: 11 }}>
          <div style={{ textAlign: 'center', fontSize: cqw(12, 7), fontWeight: 600, color: 'var(--cp-text, #6b4a58)', letterSpacing: '0.08em', lineHeight: 1.2 }}>
            {['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'][now.getMonth()]}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', alignContent: 'start', marginTop: cqw(8, 3) }}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={`h${i}`} className="flex items-center justify-center" style={{ height: cqw(20, 7), fontSize: cqw(10, 6), color: 'var(--cp-faint, #c9b4c0)' }}>{d}</div>
            ))}
            {miniCells.map((d, i) => (
              <div key={`d${i}`} className="flex items-center justify-center" style={{ height: cqw(30, 9) }}>
                {d !== null && (
                  <span className="flex items-center justify-center rounded-full" style={{
                    width: cqw(26, 8), aspectRatio: '1 / 1', fontSize: cqw(10, 6),
                    background: d === today ? 'var(--cs-accent, #f0a8c0)' : 'transparent', color: d === today ? '#fff' : 'var(--cp-text, #6b4a58)',
                  }}>{d}</span>
                )}
              </div>
            ))}
          </div>
        </div>
        {/* 上层：快捷记录卡（叠在日历卡右上，强投影浮起） */}
        <div className="absolute" style={{ left: wPct(740), top: hPct(1635), width: wPct(470), height: hPct(470), zIndex: 20, background: 'var(--cp-card, #fff)', borderRadius: cqw(36, 12), boxShadow: QUICK_SHADOW }} />
        <Text x={789} y={1685} w={300} h={32} size={12} min={8} color="#b0909c" z={21}>{dateStr}</Text>
        <Text x={789} y={1726} w={320} h={46} size={18} min={11} color="#3a2a33" weight={700} z={21}>现在想记点什么？</Text>
        {QUICK_OPTIONS.map((opt, i) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => onOpen(opt.route)}
              className="absolute flex items-center justify-between border-0 cursor-pointer"
              style={{ left: wPct(800), top: hPct(1805 + i * 83), width: wPct(350), height: hPct(60), zIndex: 21, background: 'var(--cs-soft, #fff5f9)', borderRadius: cqw(16, 8), padding: `0 ${cqw(16, 8)} 0 ${cqw(16, 8)}` }}
            >
              <span style={{ fontSize: cqw(13, 9), color: 'var(--cp-text, #6b4a58)', fontWeight: 500 }}>{opt.label}</span>
              <Icon style={{ width: cqw(17, 12), height: cqw(17, 12), color: 'var(--cs-deep, #d98ba9)' }} weight="regular" />
            </button>
          );
        })}

        {/* ── 3.4 歌曲卡片区 ── */}
        {/* 底部胶囊条（贯穿歌曲卡下方，背景图绑定「设置-美化」可替换；先渲染在下层） */}
        <div className="absolute overflow-hidden" style={{ left: wPct(95), top: hPct(2300), width: wPct(1100), height: hPct(245), zIndex: 5, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderRadius: 999, boxShadow: '0 8px 24px rgba(233,160,190,0.14)', border: '1px solid rgba(255,255,255,0.7)', ...capsuleBgStyle }} />
        {/* 耳机素材（原样纯白显示，不加滤镜——胶囊底图可换，不怕隐身） */}
        <div className="absolute pointer-events-none" style={{ left: wPct(680), top: hPct(2300), width: wPct(415), height: hPct(200), zIndex: 6 }}>
          <img src="/Couple/耳机.png" alt="" draggable={false} className="w-full h-full object-contain select-none" />
        </div>
        {/* 装饰波点/波浪线已按需求移除，胶囊条保持纯净（只剩耳机素材） */}
        {/* 歌曲卡 ×2（2026-08-30 上真数据）：左 = 他听最多的歌；右 = 她亲手选的歌（点卡片挑） */}
        {/* 左卡 */}
        <div className="absolute" style={{ left: wPct(140), top: hPct(2155), width: wPct(265), height: hPct(340), zIndex: 10, background: 'var(--cp-card, #fff)', borderRadius: cqw(24, 10), boxShadow: CARD_SHADOW }} />
        <div className="absolute overflow-hidden" style={{ left: wPct(150), top: hPct(2165), width: wPct(245), aspectRatio: '1 / 1', zIndex: 11, borderRadius: cqw(14, 6), border: '1px solid rgba(60,30,50,0.05)' }}>
          <img src={topSongCover || '/Couple/留白图.jpg'} alt="" draggable={false} className="w-full h-full object-cover pointer-events-none select-none" />
        </div>
        <Text x={150} y={2420} w={150} h={26} size={15} min={9} color="#3a2a33" weight={600} z={11} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{topSong ? topSong.name : '他听最多的歌'}</Text>
        <Text x={150} y={2452} w={150} h={22} size={12} min={8} color="#b0909c" z={11} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{topSong ? topSong.artists.join(' / ') : '还没有听歌记录'}</Text>
        <button
          type="button"
          aria-label={leftPlaying ? '暂停' : '播放'}
          onClick={(e) => { e.stopPropagation(); if (topSong) playPicked(topSong.neteaseId, topSong.name, topSong.artists, topSong.albumPic); }}
          className="absolute rounded-full flex items-center justify-center border-0 cursor-pointer transition-transform active:scale-90"
          style={{ left: wPct(335), top: hPct(2392), width: cqw(38, 24), aspectRatio: '1 / 1', zIndex: 14, background: '#2b2b2b', boxShadow: '0 3px 10px rgba(0,0,0,0.25)' }}
        >
          <PlayBtn playing={!!leftPlaying} />
        </button>
        <Hotspot x={140} y={2155} w={265} h={340} z={12} onTap={() => (topSong ? playPicked(topSong.neteaseId, topSong.name, topSong.artists, topSong.albumPic) : onOpen('c5'))} />

        {/* 右卡（她的选择） */}
        <div className="absolute" style={{ left: wPct(420), top: hPct(2155), width: wPct(265), height: hPct(340), zIndex: 10, background: 'var(--cp-card, #fff)', borderRadius: cqw(24, 10), boxShadow: CARD_SHADOW }} />
        <div className="absolute overflow-hidden" style={{ left: wPct(430), top: hPct(2165), width: wPct(245), aspectRatio: '1 / 1', zIndex: 11, borderRadius: cqw(14, 6), border: '1px solid rgba(60,30,50,0.05)' }}>
          <img src={myPickCover || '/Couple/留白图.jpg'} alt="" draggable={false} className="w-full h-full object-cover pointer-events-none select-none" />
        </div>
        <Text x={430} y={2420} w={150} h={26} size={15} min={9} color="#3a2a33" weight={600} z={11} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{myPick ? myPick.name : '选一首歌放这里'}</Text>
        <Text x={430} y={2452} w={150} h={22} size={12} min={8} color="#b0909c" z={11} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{myPick ? myPick.artists.join(' / ') : '你喜欢的，点卡片挑'}</Text>
        <button
          type="button"
          aria-label={rightPlaying ? '暂停' : '播放'}
          onClick={(e) => { e.stopPropagation(); if (myPick?.neteaseId !== undefined) playPicked(myPick.neteaseId, myPick.name, myPick.artists, myPick.albumPic); else setShowSongPicker(true); }}
          className="absolute rounded-full flex items-center justify-center border-0 cursor-pointer transition-transform active:scale-90"
          style={{ left: wPct(615), top: hPct(2392), width: cqw(38, 24), aspectRatio: '1 / 1', zIndex: 14, background: '#2b2b2b', boxShadow: '0 3px 10px rgba(0,0,0,0.25)' }}
        >
          <PlayBtn playing={!!rightPlaying} />
        </button>
        {myPick && (
          <button
            type="button"
            aria-label="清掉选择"
            onClick={(e) => { e.stopPropagation(); setMySongPick(undefined); }}
            className="absolute rounded-full flex items-center justify-center border-0 cursor-pointer transition-all active:scale-90"
            style={{ left: wPct(648), top: hPct(2162), width: cqw(22, 16), aspectRatio: '1 / 1', zIndex: 15, background: 'rgba(58,42,51,0.5)', color: '#fff', fontSize: cqw(10, 8) }}
          >
            ✕
          </button>
        )}
        <Hotspot x={420} y={2155} w={265} h={340} z={12} onTap={() => setShowSongPicker(true)} />

        {/* ── 整卡跳转热区 ── */}
        <Hotspot x={100} y={1110} w={420} h={440} z={12} onTap={() => onOpen('c1')} />
        <Hotspot x={100} y={1690} w={700} h={370} z={12} onTap={() => onOpen('c1')} />
      </div>

      {/* ── 首屏以下：二屏（天气/阅读/饮食经期/记账日记）+ 三屏（事件记录），CoupleBelow.tsx ── */}
      <CoupleBelow onOpen={onOpen} />

      {/* 底部空白：滚到底时让最后一张事件卡完全露在固定胶囊导航上方（导航 46px + 距底 16px，留足余量） */}
      <div aria-hidden style={{ height: 'calc(var(--safe-bottom, 0px) + 100px)' }} />

      {showTodoModal && <TodoModal onClose={() => setShowTodoModal(false)} onAdd={addTodo} />}
      {showSongPicker && <SongPickerModal onClose={() => setShowSongPicker(false)} />}
    </div>
  );
};

// ── c1 / c5 占位页（路由链路先打通，内容页后续文档再接） ──
const StubPage: React.FC<{ title: string; note: string; onBack: () => void }> = ({ title, note, onBack }) => (
  <div className="absolute inset-0 flex flex-col" style={{ paddingTop: 'calc(var(--chrome-top, 0px) + 12px)' }}>
    <div className="flex items-center gap-3 px-5 py-3">
      <button type="button" onClick={onBack} aria-label="返回" className="rounded-full p-2 border-0 cursor-pointer" style={{ background: 'rgba(255,255,255,0.9)', boxShadow: '0 2px 8px rgba(233,160,190,0.2)' }}>
        <ArrowLeft style={{ width: 20, height: 20, color: 'var(--cp-muted, #8a5a6e)' }} />
      </button>
      <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--cp-text, #3a2a33)' }}>{title}</span>
    </div>
    <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ paddingBottom: 96 }}>
      <span style={{ fontSize: 34 }}>🏗️</span>
      <p style={{ fontSize: 14, color: 'var(--cp-muted, #9a7a8a)', maxWidth: 260, textAlign: 'center', lineHeight: 1.7 }}>{note}</p>
    </div>
  </div>
);

// ── 情侣空间（「我们」tab 根，内部路由 first / c1 / c5） ──
// ── 路由：首屏 + 各功能页（c3 记账直接开 Sully 现有 Bank App，不进本页路由）；c4/c4her = 双人日记页 ──
type Route = 'first' | 'c1' | 'c2' | 'c4' | 'c4her' | 'c5' | 'c6' | 'c7' | 'c71' | 'c72' | 'c9';

const STUB_COPY: Record<string, [string, string]> = {
  c6: ['天气', '天气页施工中：逐小时预报、一周天气，后续文档接入'],
  c7: ['本地书架', '书架页施工中：正在读的书、书摘记录，后续文档接入'],
  c71: ['阅读详情', '阅读详情页施工中：共读进度、章节笔记，后续文档接入'],
  c72: ['书摘记录', '书摘页施工中：导入数据、批注记录，后续文档接入'],
};

const CoupleSpace: React.FC = () => {
  const { openApp } = useOS();
  const [page, setPage] = useState<Route>('first');
  const [c1Mode, setC1Mode] = useState<'daily' | 'feed' | 'period' | 'anniv'>('daily');
  const [bankOpen, setBankOpen] = useState(false);
  const [beauty] = useState(loadCoupleBeauty);
  const coupleBgUrl = useBlobRefUrl(beauty.coupleBg);
  // 调色台（2026-08-30）：--cp-* 变量注入挂在根容器 .cs-palette 上，首屏/首屏以下都吃
  const paletteStore = useCouplePaletteStore();
  const paletteCss = buildCouplePaletteCss(paletteStore.palette);
  useEffect(() => {
    const id = 'cp-css-preset';
    let tag = document.getElementById(id) as HTMLStyleElement | null;
    if (!paletteCss) {
      if (tag) tag.remove();
      return;
    }
    if (!tag) {
      tag = document.createElement('style');
      tag.id = id;
      document.head.appendChild(tag);
    }
    tag.textContent = paletteCss;
    return () => {
      const t = document.getElementById(id);
      if (t && t.textContent === paletteCss) t.remove();
    };
  }, [paletteCss]);
  const open = (route: string) => {
    if (route === 'c1-period') { setC1Mode('period'); setPage('c1'); return; }
    if (route === 'c3') { setBankOpen(true); return; } // 记账：弹大卡片直接写 Sully 银行，不跳转
    if (route === 'c5') { openApp(AppID.Music); return; } // 音乐：入口打开原版音乐 App（我们在它上面加东西）
    setPage(route as Route);
  };
  return (
    <div className="cs-palette absolute inset-0 flex items-center justify-center overflow-hidden" style={coupleBgUrl ? { backgroundImage: `url(${coupleBgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: '#ffe3ef' }}>
      {page === 'first' ? (
        <CoupleFirstScreen onOpen={open} />
      ) : page === 'c1' ? (
        <CoupleCalendar initialMode={c1Mode} onBack={() => setPage('first')} />
      ) : page === 'c2' ? (
        <CoupleDiet onBack={() => setPage('first')} />
      ) : page === 'c4' ? (
        <CoupleDiary initialOwner="me" onBack={() => setPage('first')} />
      ) : page === 'c4her' ? (
        <CoupleDiary initialOwner="her" onBack={() => setPage('first')} />
      ) : page === 'c9' ? (
        <CoupleTogether initialTab="memories" onBack={() => setPage('first')} />
      ) : (
        <StubPage title={STUB_COPY[page][0]} note={STUB_COPY[page][1]} onBack={() => setPage('first')} />
      )}
      {bankOpen && <QuickBankModal onClose={() => setBankOpen(false)} />}
    </div>
  );
};

export default CoupleSpace;

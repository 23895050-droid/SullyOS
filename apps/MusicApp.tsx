
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOS } from '../context/OSContext';
import { useMusic, musicApi, normalizeCookie, toHttps, Song } from '../context/MusicContext';
import { DB } from '../utils/db';
import { trackEvent } from '../utils/analytics';
import { Gear, User as UserIcon, Crosshair, Play as PlayIcon, Pause as PauseIcon, MusicNote, X, Headphones, ChatCircleText, CaretDown } from '@phosphor-icons/react';
import {
  C, Sparkle, CrossStar, MizuHeader, SearchBar, SongRow, MiniPlayer,
  VinylDisc, GlassProgress, PlayControls, BokehBg,
  MetaChip, SubActions, TogetherHeader, NightTogetherStrip, InviteTogetherModal,
} from './music/MusicUI';
import NeteaseProfilePage from './music/NeteaseProfilePage';
import CharVisitPage from './music/CharVisitPage';
import { shareOrDownloadBlob } from '../utils/shareExport';
import { getProxyWorkerUrl } from '../utils/proxyWorker';
import PlaylistHomePage from './music/PlaylistHomePage';
import MusicChatBox from './music/MusicChatBox';
import { useMusicStore, musicStoreApi, importMusicJson, exportMusicJson, setCssGlobal, setCssPage, clearCssPage, setCssPerChar, clearCssPerChar, setLyricInject, setMusicApi, setChatBg, setChatShowAvatar, setCssPreset, setMusicPalette, resetMusicPalette, addPendingInvite, pendingInviteOf, cancelPendingInviteForResend } from './couple/musicStore';
import DataBackupPanel from './couple/DataBackupPanel';
import { buildPaletteCss, MUSIC_PALETTE_KEYS, MUSIC_PALETTE_DEFAULTS, SURFACE_DEFAULT_PCT, GLASS_DEFAULT_PCT } from '../utils/musicPalette';
import { putImageBlob } from '../utils/blobRef';
import { MUSIC_NIGHT_PRESET_CSS } from '../utils/musicNightPreset';
import { getMountConfig } from '../utils/noxhomeMount';
import { maybeGeneratePendingSummaries } from '../utils/musicSummary';
import { configFromPreset, presetMatchesConfig } from '../utils/apiPresetSwitch';
import { startBgTaskForResult, isBgTaskStale } from '../utils/bgTask';
import ConfirmDialog from '../components/os/ConfirmDialog';

// ------------------------- 工具 -------------------------
const fmtTime = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
};

type View = 'search' | 'settings' | 'player' | 'profile' | 'visit_char' | 'playlist' | 'chat';

// 调色台标签（2026-08-30）：与 utils/musicPalette MUSIC_PALETTE_KEYS 一一对应
const PALETTE_LABELS: Record<string, string> = {
  bg: '页面底色', bgDeep: '渐变深层', bgTint: '最深紫雾',
  primary: '主色', accent: '渐变第二色', soft: '容器浅底', glow: '发光色',
  sakura: '樱花粉', lavender: '薰衣草', deep: '渐变深紫', text: '正文', muted: '弱文字',
  faint: '超弱文字', vip: 'VIP', danger: '危险色',
};

// ── 设置页折叠卡（2026-08-30 她要求：每个类别折叠起来，点开再展开，别一长列） ──
const SettingsFold: React.FC<{ title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }> = ({ title, right, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl shizuku-glass overflow-hidden" style={{ boxShadow: `0 2px 16px ${C.glow}08` }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); } }}
        className="flex items-center justify-between gap-2 cursor-pointer select-none"
        style={{ padding: '14px 14px' }}
      >
        <span className="text-[10px] tracking-wider flex items-center gap-1.5" style={{ color: C.muted }}>{title}</span>
        <span className="flex items-center gap-2 shrink-0">
          <span onClick={(e) => e.stopPropagation()}>{right}</span>
          <CaretDown size={12} weight="bold" style={{ color: C.faint, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }} />
        </span>
      </div>
      {open && <div className="px-3.5 pb-3.5 pt-1">{children}</div>}
    </div>
  );
};

// ========================= 主组件 =========================
const MusicApp: React.FC = () => {
  const { closeApp, addToast, characters, userProfile, apiPresets } = useOS();
  const {
    cfg, setCfg, effectiveWorkerUrl,
    current, playing, progress, duration, loadingSong,
    lyric, tlyric, activeLyricIdx,
    profile, playSong, togglePlay, nextSong, prevSong, seek,
    liked, toggleLike, setToastHandler,
    listeningTogetherWith, removeListeningPartner, endListeningTogether,
    addLocalSong, removeLocalSong, localAlbumSongs,
    playMode, setPlayMode,
    regeneratingId, regeneratingStatus,
  } = useMusic();
  const isCurrentRegenerating = !!current && current.id === regeneratingId;
  // 把对轴入口和单曲循环按钮移到 SubActions 里，避免散乱
  // 下载本地生成的歌曲到本地文件系统
  const downloadCurrentLocal = useCallback(async () => {
    if (!current?.local || !current.localAssetKey) return;
    try {
      const entry = await DB.getAssetRaw(current.localAssetKey).catch(() => null) as
        | { blob?: Blob; mimeType?: string }
        | Blob
        | null;
      const blob: Blob | null = entry instanceof Blob
        ? entry
        : (entry?.blob instanceof Blob ? entry.blob : null);
      if (!blob) { addToast('音频文件丢失', 'error'); return; }
      const mime = current.localMimeType || (entry && !(entry instanceof Blob) ? entry.mimeType : '') || blob.type || 'audio/mpeg';
      const ext = /wav/i.test(mime) ? 'wav' : /ogg/i.test(mime) ? 'ogg' : /flac/i.test(mime) ? 'flac' : /m4a|aac|mp4/i.test(mime) ? 'm4a' : 'mp3';
      const safe = (current.name || 'song').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
      const result = await shareOrDownloadBlob({ blob, fileName: `${safe}.${ext}`, shareTitle: current.name || '生成的歌曲' });
      if (result === 'cancelled') return;
      addToast(result === 'shared' ? '已打开系统保存/分享' : '已开始下载', 'success');
      trackEvent('下载生成的歌到本地文件');
    } catch {
      addToast('下载失败', 'error');
    }
  }, [current, addToast]);

  const cyclePlayMode = useCallback(() => {
    const order: ('loop' | 'single' | 'shuffle')[] = ['loop', 'single', 'shuffle'];
    const next = order[(order.indexOf(playMode) + 1) % order.length];
    setPlayMode(next);
    trackEvent('切换播放模式', { mode: next });
    addToast(next === 'loop' ? '列表循环' : next === 'single' ? '单曲循环' : '随机播放', 'info');
  }, [playMode, setPlayMode, addToast]);

  // 伴听 char 名单（用于 MiniPlayer / 播放页徽章）—— 带头像，给"小情侣"头像块用
  const companions = useMemo(() => {
    return listeningTogetherWith
      .map(id => characters.find(c => c.id === id))
      .filter((c): c is typeof characters[number] => !!c)
      .map(c => ({ id: c.id, name: c.name, avatar: c.avatar }));
  }, [listeningTogetherWith, characters]);

  // 当前歌在哪些 char 的歌单里（用于 MiniPlayer 的"也收藏"提示）
  const charsWithSong = useMemo(() => {
    if (!current) return [];
    return characters
      .map(c => {
        const pl = c.musicProfile?.playlists.find(p => p.songs.some(s => s.id === current.id));
        return pl ? { id: c.id, name: c.name, playlistTitle: pl.title } : null;
      })
      .filter((x): x is { id: string; name: string; playlistTitle: string } => !!x);
  }, [current, characters]);

  // 把 OS toast 注入到 Music Context（这样全局播放报错也能弹 toast）
  useEffect(() => { setToastHandler(addToast); }, [addToast, setToastHandler]);

  const [view, setView] = useState<View>('profile');
  // ── 手动对轴 modal state ──
  const [showLyricSync, setShowLyricSync] = useState(false);
  const [syncDraft, setSyncDraft] = useState<number[]>([]);
  const [visitCharId, setVisitCharId] = useState<string | null>(null);
  // ── 一起听（批 2）：她发起邀请（选角色）→ 轻确认退出 ──
  const [showInvitePicker, setShowInvitePicker] = useState(false);
  const [confirmEndChar, setConfirmEndChar] = useState<string | null>(null);
  // 聊歌框对象：一起听伙伴 > 从歌单页进的角色 > 挂载角色
  const [chatCharId, setChatCharId] = useState<string | null>(null);

  /** 方向 A：她发起邀请 → 系统邀请卡（等 AI accept/decline）+ pendingInvites 记录 */
  const doSendInvite = async (c: { id: string; name: string }) => {
    const song = current
      ? { songId: current.id, name: current.name, artists: current.artists, album: current.album, albumPic: current.albumPic, duration: current.duration, fee: current.fee }
      : null;
    // 卡正文是写给角色看的：邀请 + 回应协议内联在卡里（2026-08-27 她定：一起听交互不常驻
    // 指令集，接受/婉拒的协议就住在邀请卡里）。卡在界面上渲染自己的样式，这段正文只进模型。
    const uName = userProfile?.name || '她';
    const respondGuide = '愿意接受就在这条回复的任意位置带上 [[MUSIC_ACTION:accept]]；想婉拒就带上 [[MUSIC_ACTION:decline]]。带上标签后照常说话就好，标签会被自动替换成卡片。';
    const cardId = await DB.saveMessage({
      charId: c.id,
      role: 'system',
      type: 'music_invite',
      content: song
        ? `[${uName} 邀请你一起听《${song.name}》。${respondGuide}]`
        : `[${uName} 邀请你一起听首歌。${respondGuide}]`,
      metadata: { source: 'music_invite', invite: { direction: 'user', song, inviteSongName: song?.name, status: 'pending' } },
    });
    addPendingInvite({ charId: c.id, direction: 'user', inviteSongName: song?.name, cardMessageId: String(cardId) });
    addToast(`已邀请 ${c.name} 一起听`, 'info');
    trackEvent('邀请角色一起听');
  };

  // 反馈2 #3：旧邀请状态删不掉会卡死双方（她的再发起被挡、他的关键词再邀也被挡）。
  // 还挂着未回应的邀请 → 弹确认（不再静默 toast 拒绝）；确认 = 取消旧状态 + 旧卡标「已取消」+ 重新发起。
  const [inviteResend, setInviteResend] = useState<{ id: string; name: string } | null>(null);
  const sendInvite = (c: { id: string; name: string }) => {
    setShowInvitePicker(false);
    if (pendingInviteOf(c.id)) {
      setInviteResend(c);
      return;
    }
    void doSendInvite(c);
  };
  const confirmResendInvite = async () => {
    const c = inviteResend;
    setInviteResend(null);
    if (!c) return;
    const old = cancelPendingInviteForResend(c.id);
    if (old?.cardMessageId) {
      await DB.updateMessageMetadata(Number(old.cardMessageId), (prev) => ({
        ...(prev || {}),
        invite: { ...((prev || {}).invite || {}), status: 'cancelled' },
      })).catch(() => {});
    }
    await doSendInvite(c);
  };

  /** 退出确认：charId 有值 = 只结束和这一个；null = 全部结束（统一出口） */
  const requestEndTogether = (charId: string | null) => setConfirmEndChar(charId);
  const doEndTogether = (charId: string | null) => {
    setConfirmEndChar(null);
    void endListeningTogether(charId ?? undefined);
    trackEvent('结束一起听');
  };
  // ── 角色歌单主页（2026-08-26）：charId = 拜访的角色 → 挂载角色 → 第一个角色 ──
  const musicStore = useMusicStore();
  // 反馈1 A5：补生成走 bgTask（后台生成，可离页）——状态在 store.pendingSummary，订阅式刷新
  const pendingSummary = musicStore.pendingSummary;
  const summariesRunning = pendingSummary?.status === 'running' && !isBgTaskStale(pendingSummary);
  const summariesInterrupted = pendingSummary?.status === 'running' && isBgTaskStale(pendingSummary);
  const playlistCharId = visitCharId || getMountConfig().charId || characters[0]?.id || '';
  // ── CSS 预设注入（2026-08-26 分页版；2026-08-30 加调色台层）：内置预设(夜色) → 调色台 → 基础(全局) → 当前页面 → 角色覆盖 ──
  // 内置预设排最前，用户自己的 CSS 在后 → 后注入的覆盖预设，可自行微调
  const cssScopeCharId = view === 'visit_char' ? (visitCharId ?? '') : view === 'playlist' ? playlistCharId : '';
  const nightPreset = musicStore.cssPreset === 'night';
  const paletteCss = buildPaletteCss(musicStore.palette);
  useEffect(() => {
    const layers = [
      nightPreset ? MUSIC_NIGHT_PRESET_CSS : '',
      paletteCss,
      musicStore.cssGlobal,
      musicStore.cssPages[view] ?? '',
      cssScopeCharId ? (musicStore.cssPerChar[cssScopeCharId] ?? '') : '',
    ].filter(Boolean);
    const css = layers.join('\n');
    let el = document.getElementById('mz-css-preset') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'mz-css-preset';
      document.head.appendChild(el);
    }
    el.textContent = css;
    if (!css && el.parentNode) el.parentNode.removeChild(el);
    return () => {
      const tag = document.getElementById('mz-css-preset');
      if (tag && tag.textContent === css && tag.parentNode) tag.parentNode.removeChild(tag);
    };
  }, [nightPreset, paletteCss, musicStore.cssGlobal, musicStore.cssPages, musicStore.cssPerChar, view, cssScopeCharId]);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<Song[]>([]);
  const [searching, setSearching] = useState(false);
  // ── 导入导出（CC 歌单） ──
  const [importText, setImportText] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  // ── 结束总结 API 槽（从家里设置页搬来） ──
  const [musicApiForm, setMusicApiForm] = useState({ baseUrl: musicStore.api?.baseUrl ?? '', apiKey: musicStore.api?.apiKey ?? '', model: musicStore.api?.model ?? '' });
  // ── 自定义 CSS 预设（分页：基础 + 六页 + 角色页每角色覆盖） ──
  const [cssScope, setCssScope] = useState<'base' | 'search' | 'player' | 'profile' | 'playlist' | 'visit_char' | 'settings' | 'chat' | 'miniplayer' | 'cards'>('base');
  const [cssCharId, setCssCharId] = useState('');
  const [cssDraft, setCssDraft] = useState('');
  const cssCurrentValue = () => {
    if (cssScope === 'base') return musicStore.cssGlobal;
    if (cssScope === 'visit_char' && cssCharId) return musicStore.cssPerChar[cssCharId] ?? '';
    return musicStore.cssPages[cssScope] ?? '';
  };
  const pickCssScope = (scope: typeof cssScope) => {
    setCssScope(scope);
    const v = scope === 'base'
      ? musicStore.cssGlobal
      : scope === 'visit_char' && cssCharId
        ? (musicStore.cssPerChar[cssCharId] ?? '')
        : (musicStore.cssPages[scope] ?? '');
    setCssDraft(v);
  };
  const pickCssChar = (id: string) => {
    setCssCharId(id);
    setCssDraft(id ? (musicStore.cssPerChar[id] ?? '') : (musicStore.cssPages.visit_char ?? ''));
  };
  const saveCss = () => {
    if (cssScope === 'base') setCssGlobal(cssDraft);
    else if (cssScope === 'visit_char' && cssCharId) setCssPerChar(cssCharId, cssDraft);
    else setCssPage(cssScope, cssDraft);
    addToast('CSS 已保存', 'success');
  };
  const resetCss = () => {
    if (cssScope === 'base') setCssGlobal('');
    else if (cssScope === 'visit_char' && cssCharId) clearCssPerChar(cssCharId);
    else clearCssPage(cssScope);
    setCssDraft('');
    addToast('已恢复默认样式', 'success');
  };
  const handleImport = async (raw?: unknown) => {
    if (!playlistCharId) { addToast('先选一个角色再导入', 'error'); return; }
    if (importBusy) return;
    setImportBusy(true);
    try {
      // raw 只认字符串（文件读取传入）；按钮点击传进来的是事件对象，一律用 textarea 的 importText
      const payload = typeof raw === 'string' ? raw : importText;
      const result = await importMusicJson(playlistCharId, payload);
      if (result.errors.length > 0 && result.imported === 0) {
        addToast(`导入失败：${result.errors[0]}`, 'error');
        return;
      }
      const mapped = result.mappedToPlaylists.length > 0 ? `，进了：${result.mappedToPlaylists.join('、')}` : '';
      addToast(`导入 ${result.imported} 首${result.skipped > 0 ? `（重复跳过 ${result.skipped}）` : ''}${mapped}`, 'success');
      setImportText('');
      trackEvent('导入 CC 歌单');
    } catch (e: any) {
      addToast(`导入失败：${e.message}`, 'error');
    } finally {
      setImportBusy(false);
    }
  };
  const handleImportFile = (file: File) => {
    file.text().then((t) => { setImportText(t); handleImport(t); }).catch(() => addToast('文件读不出来', 'error'));
  };
  const handleExport = () => {
    const charName = characters.find((c) => c.id === playlistCharId)?.name;
    const json = exportMusicJson(charName);
    const blob = new Blob([json], { type: 'application/json' });
    void shareOrDownloadBlob({ blob, fileName: `sully-music-export-${new Date().toISOString().slice(0, 10)}.json` });
    addToast('已导出（新增播放记录 + 全部印象）', 'success');
    trackEvent('导出音乐数据给 CC');
  };
  const lyricBoxRef = useRef<HTMLDivElement | null>(null);

  // 歌词自动滚动：把 current line 对齐到滚动容器视觉中心
  // 注意 offsetTop 依赖 offsetParent，容器没 position:relative 时会跨到祖先节点、值偏大，
  // 导致 current line 被推到中心上方。改用 getBoundingClientRect 对齐，和 DOM 嵌套解耦。
  useEffect(() => {
    if (view !== 'player') return;
    const box = lyricBoxRef.current; if (!box || activeLyricIdx < 0) return;
    const el = box.querySelector<HTMLDivElement>(`[data-lyric-idx="${activeLyricIdx}"]`);
    if (!el) return;
    const boxRect = box.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const elTopInBox = elRect.top - boxRect.top + box.scrollTop;
    box.scrollTo({ top: elTopInBox - box.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' });
  }, [activeLyricIdx, view]);

  // ── 搜索 ──
  const doSearch = useCallback(async () => {
    const kw = keyword.trim(); if (!kw) return;
    setSearching(true);
    trackEvent('搜索一首歌');
    try {
      const r = await musicApi.search(cfg, kw);
      const songs: Song[] = (r?.result?.songs || []).map((s: any) => ({
        id: s.id, name: s.name,
        artists: (s.ar || s.artists || []).map((a: any) => a.name).join(' / '),
        album: s.al?.name || s.album?.name || '',
        albumPic: toHttps(s.al?.picUrl || s.album?.picUrl || ''),
        duration: (s.dt || s.duration || 0) / 1000,
        fee: s.fee ?? 0,
      }));
      setResults(songs);
      if (!songs.length) {
        const hint = r?.msg || r?.message || (r?.code != null ? `code=${r.code}` : '') || '无数据';
        addToast(`没找到: ${hint}`, 'info');
      }
    } catch (e: any) {
      addToast(`搜索失败：${e.message}`, 'error');
    } finally {
      setSearching(false);
    }
  }, [keyword, cfg, addToast]);

  // ════════════════ 搜索页 ════════════════
  const renderSearch = () => (
    <div className="mz-search flex flex-col h-full relative"
      style={{ background: `linear-gradient(180deg, ${C.bg} 0%, ${C.bgDeep} 50%, ${C.bgTint} 100%)` }}>
      <BokehBg />
      <MizuHeader
        title="未来音楽"
        onClose={closeApp}
        right={
          <div className="flex items-center gap-1">
            <button
              onClick={() => setView('playlist')}
              className="p-1.5 rounded-full transition-all"
              style={{ color: C.primary }}
              title="角色歌单"
            >
              <MusicNote size={16} weight="bold" />
            </button>
            <button
              onClick={() => setView('profile')}
              className="p-1.5 rounded-full transition-all"
              style={{ color: C.primary }}
              title="我的"
            >
              <UserIcon size={16} weight="bold" />
            </button>
            <button
              onClick={() => setView('settings')}
              className="p-1.5 rounded-full transition-all"
              style={{ color: C.primary }}
            >
              <Gear size={16} weight="bold" />
            </button>
          </div>
        }
      />
      <SearchBar value={keyword} onChange={setKeyword} onSearch={doSearch} searching={searching} />

      {/* 用户状态 — 玻璃标签 */}
      {profile && (
        <div className="px-5 -mt-1 mb-1.5 flex items-center gap-1.5 relative z-10">
          <button
            onClick={() => setView('profile')}
            className="inline-flex items-center gap-2 pl-0.5 pr-3 py-0.5 rounded-full text-[10px] shizuku-glass cursor-pointer"
            style={{ color: C.muted }}
          >
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
            ) : <Sparkle size={6} color={C.sakura} delay={0.3} />}
            {profile.nickname} · {cfg.quality}
          </button>
        </div>
      )}
      {!cfg.cookie && (
        <div className="px-5 -mt-1 mb-1.5 relative z-10">
          <button
            onClick={() => setView('profile')}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] cursor-pointer"
            style={{ background: `rgba(var(--mz-vip-rgb, 212,160,106), 0.09)`, color: C.vip, border: `1px solid rgba(var(--mz-vip-rgb, 212,160,106), 0.19)` }}
          >
            未登录 — 点击登录网易云
          </button>
        </div>
      )}

      {/* 歌曲列表 */}
      <div className="flex-1 overflow-y-auto px-2 pb-24 relative z-10 shizuku-scrollbar">
        {results.length === 0 && !searching && (
          <div className="text-center mt-16 space-y-4">
            <div className="relative inline-block">
              <Sparkle size={24} className="mx-auto" color={C.glow} delay={0} />
              <Sparkle size={12} className="absolute -top-1 -right-3" color={C.sakura} delay={0.8} />
              <Sparkle size={8} className="absolute -bottom-2 -left-2" color={C.lavender} delay={1.5} />
            </div>
            <div className="text-xs italic" style={{ color: C.faint, fontFamily: `'Georgia', serif` }}>
              搜一首想听的歌吧
            </div>
          </div>
        )}
        {results.map(s => (
          <SongRow
            key={s.id}
            name={s.name}
            artists={s.artists}
            album={s.album}
            albumPic={s.albumPic}
            duration={fmtTime(s.duration)}
            isVip={s.fee === 1}
            isActive={current?.id === s.id}
            onClick={() => { playSong(s); trackEvent('播放搜索结果里的一首歌'); }}
          />
        ))}
      </div>

      {current && (
        <MiniPlayer
          name={current.name}
          artists={current.artists}
          albumPic={current.albumPic}
          playing={playing}
          onTap={() => { setView('player'); trackEvent('打开播放页'); }}
          onPrev={() => { prevSong(); trackEvent('切歌（上一首/下一首）', { direction: 'prev' }); }}
          onToggle={togglePlay}
          onNext={() => { nextSong(); trackEvent('切歌（上一首/下一首）', { direction: 'next' }); }}
          userAvatar={userProfile?.avatar}
          userName={userProfile?.name}
          companions={companions}
          onKickCompanion={charId => { requestEndTogether(charId); trackEvent('结束和角色的一起听'); }}
          charsWithSong={charsWithSong}
          regenStatus={isCurrentRegenerating ? regeneratingStatus : undefined}
        />
      )}
    </div>
  );

  // ════════════════ 播放页 ════════════════
  const bitrateMap: Record<string, string> = {
    standard: '128 kbps',
    higher:   '192 kbps',
    exhigh:   '320 kbps',
    lossless: '1411 kbps',
    hires:    '24bit · Hi-Res',
  };

  const renderPlayer = () => {
    if (!current) return null;
    return (
      <div className="mz-player flex flex-col h-full relative"
        style={{ background: `linear-gradient(180deg, ${C.bg} 0%, ${C.bgDeep} 50%, ${C.bgTint} 100%)` }}>
        <BokehBg />
        <MizuHeader title="Now Playing" onBack={() => setView('search')} right={
          <div className="flex items-center gap-1.5">
            {/* 聊歌入口：只有在一起听中才出现（没邀请人跟谁聊） */}
            {companions.length > 0 && (
              <button
                onClick={() => { setChatCharId(companions[0]?.id ?? playlistCharId); setView('chat'); trackEvent('打开聊歌框'); }}
                aria-label="聊歌"
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
                style={{ color: C.primary, border: '1px solid rgba(255,255,255,0.45)', background: C.glass }}
              >
                <ChatCircleText size={15} weight="duotone" />
              </button>
            )}
            {/* 一起听：未开始=邀请，进行中=点亮态 */}
            {companions.length === 0 ? (
              <button
                onClick={() => { setShowInvitePicker(true); trackEvent('打开一起听邀请'); }}
                aria-label="邀请一起听"
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
                style={{ color: C.sakura, border: `1px solid rgba(var(--mz-sakura-rgb, 244,194,207), 0.45)`, background: C.glass }}
              >
                <Headphones size={15} weight="duotone" />
              </button>
            ) : (
              <button
                onClick={() => addToast(`${companions[0]?.name || 'Ta'} 正在和你一起听`, 'info')}
                aria-label="正在一起听"
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
                style={{ color: '#fff', background: `linear-gradient(135deg, ${C.sakura}, ${C.lavender})`, boxShadow: `0 2px 8px rgba(var(--mz-sakura-rgb, 244,194,207), 0.35)` }}
              >
                <Headphones size={15} weight="fill" />
              </button>
            )}
          </div>
        } />

        {/* 夜色预设：双人状态区（重叠头像 + 弧线 + 状态文本，附件图一） */}
        {nightPreset && companions.length > 0 && (
          <NightTogetherStrip
            userAvatar={userProfile.avatar}
            userName={userProfile.name}
            companion={companions[0]}
          />
        )}

        <div className="flex-1 flex flex-col items-center px-5 pt-4 pb-3 relative z-10 overflow-hidden">
          <div className="shrink-0 mt-1 relative">
            <VinylDisc albumPic={current.albumPic} playing={playing} size={150} bitrate={bitrateMap[cfg.quality]} />
            {/* 重录中覆盖层 — 只在本地歌且 regeneratingId 匹配时显示 */}
            {isCurrentRegenerating && (
              <div className="absolute inset-0 rounded-full flex items-center justify-center pointer-events-none"
                style={{
                  background: `radial-gradient(circle, rgba(0,0,0,0.55) 30%, rgba(0,0,0,0.35) 70%)`,
                  backdropFilter: 'blur(6px)',
                  WebkitBackdropFilter: 'blur(6px)',
                  boxShadow: `0 0 30px rgba(var(--mz-glow-rgb, 205,198,233), 0.5)`,
                  animation: 'shizuku-glow 2s ease-in-out infinite',
                }}
              >
                <div className="text-center space-y-1.5 px-3">
                  <div className="w-7 h-7 mx-auto border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <div className="text-[10px] tracking-[0.2em] text-white font-semibold" style={{ fontFamily: 'Georgia, serif' }}>
                    正在重录
                  </div>
                  <div className="text-[9px] text-white/80 truncate max-w-[120px]" style={{ fontFamily: 'monospace' }}>
                    {regeneratingStatus || '处理中…'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 横幅形式的重录提示 — 进入播放页第一时间看到状态 */}
          {isCurrentRegenerating && (
            <div className="mt-3 px-3 py-1.5 rounded-full flex items-center gap-2 text-[10px] tracking-wider"
              style={{
                background: `linear-gradient(135deg, rgba(var(--mz-primary-rgb, 128,124,157), 0.08), rgba(var(--mz-lavender-rgb, 207,195,232), 0.15))`,
                border: `1px solid rgba(var(--mz-glow-rgb, 205,198,233), 0.38)`,
                color: C.primary,
              }}
            >
              <Sparkle size={9} color={C.sakura} delay={0} />
              <span>新版本即将到来 · {regeneratingStatus || '处理中'}</span>
              <Sparkle size={9} color={C.lavender} delay={0.5} />
            </div>
          )}

          <section className="mt-5 text-center space-y-1.5 shrink-0 px-2">
            <h2 className="font-light tracking-tight leading-tight"
              style={{ color: C.primary, fontFamily: `'Noto Serif','Georgia',serif`, fontSize: '22px' }}>
              {current.name}
            </h2>
            <p className="text-[10px] uppercase opacity-70"
              style={{ color: C.muted, fontFamily: `'Space Grotesk','SF Mono',monospace`, letterSpacing: '0.2em' }}>
              {current.artists}
            </p>
          </section>

          <div
            ref={lyricBoxRef}
            className="flex-1 w-full my-3 min-h-0 overflow-y-auto text-center scroll-smooth shizuku-scrollbar px-2"
            style={{
              maskImage: 'linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)',
            }}
          >
            {lyric.length === 0 ? (
              <div className="pt-6 flex flex-col items-center gap-2" style={{ color: C.faint }}>
                <Sparkle size={12} color={C.glow} />
                <span className="text-[11px] italic tracking-wider" style={{ fontFamily: `'Noto Serif','Georgia',serif` }}>
                  {loadingSong ? 'loading...' : 'no lyrics'}
                </span>
              </div>
            ) : (
              <div className="space-y-4 py-8">
                {lyric.map((l, i) => {
                  const tr = tlyric.find(t => Math.abs(t.t - l.t) < 0.2);
                  const active = i === activeLyricIdx;
                  // 关键：字号 / 字重不随 active 变 —— 变了会触发重排换行。
                  //     只让外层盒子用 transform:scale 视觉放大，不动内部文字度量。
                  return (
                    <div key={i} data-lyric-idx={i}
                      className="transition-transform duration-300 will-change-transform"
                      style={{
                        transform: active ? 'scale(1.05)' : 'scale(1)',
                        transformOrigin: 'center center',
                        opacity: active ? 1 : 0.45,
                      }}>
                      <div className="flex items-center justify-center gap-2 px-3">
                        <CrossStar
                          size={12}
                          color={C.sakura}
                          delay={0}
                          solid={active}
                          className={active ? '' : 'opacity-0'}
                        />
                        <div
                          className="text-[16px] leading-[1.4]"
                          style={{
                            fontFamily: `'Noto Serif','Georgia',serif`,
                            fontWeight: 400,
                            maxWidth: '100%',
                            wordBreak: 'break-word',
                            color: active ? undefined : C.faint,
                            ...(active
                              ? {
                                  background: `linear-gradient(135deg, ${C.primary} 0%, ${C.accent} 50%, ${C.deep} 100%)`,
                                  WebkitBackgroundClip: 'text',
                                  WebkitTextFillColor: 'transparent',
                                  backgroundClip: 'text',
                                  filter: `drop-shadow(0 0 14px rgba(var(--mz-glow-rgb, 205,198,233), 0.63)) drop-shadow(0 0 4px rgba(var(--mz-sakura-rgb, 244,194,207), 0.5))`,
                                }
                              : {}),
                          }}
                        >
                          {l.text}
                        </div>
                        <CrossStar
                          size={12}
                          color={C.lavender}
                          delay={0.9}
                          solid={active}
                          className={active ? '' : 'opacity-0'}
                        />
                      </div>
                      {tr && (
                        <div
                          className="text-[12px] leading-[1.4] mt-1 px-3"
                          style={{
                            fontWeight: 400,
                            maxWidth: '100%',
                            wordBreak: 'break-word',
                            opacity: active ? 0.78 : 0.4,
                            color: active ? C.accent : C.faint,
                          }}
                        >
                          {tr.text}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="w-full shrink-0 max-w-sm">
            <div className="flex justify-between items-center mb-2 px-0.5">
              <MetaChip>{fmtTime(progress)}</MetaChip>
              <MetaChip>{fmtTime(duration)}</MetaChip>
            </div>
            <GlassProgress progress={progress} duration={duration} fmtTime={fmtTime} onSeek={seek} />
          </div>

          <div className="shrink-0 relative">
            <Sparkle size={9} className="absolute top-1 left-[30%]" color={C.sakura} delay={0} />
            <Sparkle size={7} className="absolute top-3 right-[28%]" color={C.lavender} delay={1.2} />
            <PlayControls
              playing={playing}
              loading={loadingSong}
              onPrev={() => { prevSong(); trackEvent('切歌（上一首/下一首）', { direction: 'prev' }); }}
              onToggle={togglePlay}
              onNext={() => { nextSong(); trackEvent('切歌（上一首/下一首）', { direction: 'next' }); }}
            />
          </div>

          {/* 一起听状态条（批 2）：正在一起听时出现——双头像 + 聊歌入口 + 结束
              夜色预设下不显示（底部是胶囊切换台，这个条和附件设计不符） */}
          {!nightPreset && companions.length > 0 && (
            <div className="shrink-0 mt-3 w-full max-w-sm">
              <TogetherHeader
                userAvatar={userProfile?.avatar}
                userName={userProfile?.name}
                companions={companions}
                onKick={(id) => requestEndTogether(id)}
              />
              <div className="flex items-center justify-center gap-2 -mt-1.5">
                <button
                  onClick={() => { setChatCharId(companions[0]?.id ?? playlistCharId); setView('chat'); trackEvent('打开聊歌框'); }}
                  className="rounded-full px-3 py-1 text-[10px] font-semibold transition-all active:scale-95"
                  style={{ color: C.primary, border: `1px solid rgba(var(--mz-lavender-rgb, 207,195,232), 0.4)`, background: C.glass }}
                >
                  💬 聊这首歌
                </button>
                <button
                  onClick={() => requestEndTogether(null)}
                  className="rounded-full px-3 py-1 text-[10px] font-medium transition-all active:scale-95"
                  style={{ color: C.muted, border: '1px solid rgba(255,255,255,0.25)', background: C.glass }}
                >
                  结束一起听
                </button>
              </div>
            </div>
          )}

          <div className="shrink-0 mt-3 w-full">
            <SubActions
              liked={liked}
              onLike={() => { toggleLike(); trackEvent('收藏或取消收藏当前歌', { action: liked ? 'unlike' : 'like' }); }}
              showSync={!!(current.local && current.localLyrics && lyric.length > 0)}
              onSync={() => {
                setSyncDraft(lyric.map(l => l.t));
                setShowLyricSync(true);
                trackEvent('打开歌词对轴面板');
              }}
              showDownload={!!(current.local && current.localAssetKey)}
              onDownload={downloadCurrentLocal}
              playMode={playMode}
              onCyclePlayMode={cyclePlayMode}
            />
          </div>
        </div>

        {/* 夜色预设：底部「听歌 | 聊歌」胶囊切换台（附件图一） */}
        {nightPreset && (
          <div className="shrink-0 relative z-10 flex items-center justify-center pb-[calc(var(--safe-bottom)+10px)]">
            <div className="flex items-center rounded-full px-1 py-1"
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}>
              <button
                className="mz-night-tab flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[10px] font-semibold transition-all"
                style={{ background: 'rgba(255,255,255,0.16)', color: '#fff' }}
              >
                <MusicNote size={12} weight="duotone" /> 听歌
              </button>
              <button
                onClick={() => { setChatCharId(companions[0]?.id ?? playlistCharId); setView('chat'); }}
                className="mz-night-tab flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[10px] transition-all"
                style={{ color: 'rgba(255,255,255,0.55)' }}
              >
                <ChatCircleText size={12} weight="duotone" /> 聊歌
              </button>
            </div>
            {companions.length > 0 && (
              <button
                onClick={() => requestEndTogether(null)}
                className="absolute right-4 w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
                style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)' }}
                aria-label="结束一起听"
                title="结束一起听"
              >
                <X size={11} weight="bold" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // ════════════════ 聊歌框（批 2：独立会话，对象 = 一起听伙伴 > 挂载角色） ════════════════
  const renderChat = () => {
    const partnerId = chatCharId || getMountConfig().charId || characters[0]?.id || '';
    const partner = characters.find((c) => c.id === partnerId);
    if (!partner) return null;
    return <MusicChatBox charId={partner.id} onBack={() => setView('player')} />;
  };

  // ════════════════ 设置页 ════════════════
  // 退出网易云登录（反馈2 #7 挪到设置页；行为与「我的」页原按钮一致：清 cookie 即回未登录态）
  const doLogout = async () => {
    try { await musicApi.logout(cfg); } catch {}
    setCfg({ ...cfg, cookie: '' });
    addToast('已退出', 'success');
    trackEvent('退出网易云登录');
  };

  const renderSettings = () => {
    const setDraft = (updates: Partial<typeof cfg>) => setCfg({ ...cfg, ...updates });
    const commit = () => {
      addToast('已保存', 'success');
      setView('search');
    };
    const followsCentral = !cfg.workerUrl.trim();
    return (
      <div className="mz-settings flex flex-col h-full relative"
        style={{ background: `linear-gradient(180deg, ${C.bg} 0%, ${C.bgDeep} 50%, ${C.bgTint} 100%)` }}>
        <BokehBg />
        <MizuHeader title="设置" onBack={() => setView('search')} />
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 text-sm relative z-10 shizuku-scrollbar">
          <SettingsFold title={<span className="flex items-center gap-1.5"><Sparkle size={6} color={C.glow} delay={0} /> 服务地址</span>} right={cfg.workerUrl.trim() !== getProxyWorkerUrl() ? (
            <button onClick={() => setDraft({ workerUrl: getProxyWorkerUrl() })}
              className="text-[9px] underline border-0 bg-transparent cursor-pointer" style={{ color: C.muted }}>恢复默认</button>
          ) : null}>
            <input className="w-full rounded-xl px-3 py-2 outline-none text-xs shizuku-glass" value={cfg.workerUrl}
              onChange={e => setDraft({ workerUrl: e.target.value })} placeholder={effectiveWorkerUrl}
              style={{ color: C.text }} />
            <div className="text-[9px] mt-1.5 italic" style={{ color: C.faint }}>
              {followsCentral
                ? <>跟随「设置 → 网络代理」：{effectiveWorkerUrl}</>
                : <>只在音乐里用这个地址，「设置 → 网络代理」改了也不跟</>}
            </div>
          </SettingsFold>
          <SettingsFold title={<span className="flex items-center gap-1.5"><Sparkle size={6} color={C.sakura} delay={0.5} /> 会员 Cookie</span>}>
            <textarea className="w-full rounded-xl px-3 py-2 outline-none text-[10px] shizuku-glass" rows={3} value={cfg.cookie}
              onChange={e => setDraft({ cookie: e.target.value })} placeholder="MUSIC_U=xxx 或直接粘贴值..."
              style={{ color: C.text, fontFamily: 'monospace', resize: 'none' }} />
            <div className="text-[9px] mt-1.5 italic" style={{ color: C.faint }}>
              也可以在「我的」页面里扫码 / 手机号登录，自动填入 cookie
            </div>
          </SettingsFold>
          {/* 账号（反馈2 #7：退出登录从「我的」页挪到设置页） */}
          <SettingsFold title={<span className="flex items-center gap-1.5"><Sparkle size={6} color={C.danger} delay={0.3} /> 账号</span>}>
            {cfg.cookie ? (
              <>
                <div className="text-[9px] mb-2" style={{ color: C.faint }}>已登录网易云——Cookie 可在「会员 Cookie」里查看 / 修改</div>
                <button
                  onClick={() => void doLogout()}
                  className="w-full py-2 rounded-xl text-[10px] transition-all shizuku-glass"
                  style={{ color: C.danger, border: `1px solid rgba(var(--mz-danger-rgb, 224,86,122), 0.25)` }}
                >
                  退出登录
                </button>
              </>
            ) : (
              <div className="text-[9px] italic" style={{ color: C.faint }}>未登录——去「我的」页面扫码 / 手机号登录</div>
            )}
          </SettingsFold>
          <SettingsFold title={<span className="flex items-center gap-1.5"><Sparkle size={6} color={C.lavender} delay={1} /> 音质</span>}>
            <div className="grid grid-cols-5 gap-1.5">
              {(['standard', 'higher', 'exhigh', 'lossless', 'hires'] as const).map(q => (
                <button key={q} onClick={() => { setDraft({ quality: q }); trackEvent('切换音质档位', { quality: q }); }}
                  className="py-2 rounded-xl text-[10px] transition-all"
                  style={{
                    background: cfg.quality === q ? `linear-gradient(135deg, ${C.primary}, ${C.accent})` : C.glass,
                    color: cfg.quality === q ? 'white' : C.muted,
                    border: cfg.quality === q ? '1px solid transparent' : `1px solid rgba(255,255,255,0.3)`,
                    boxShadow: cfg.quality === q ? `0 2px 12px rgba(var(--mz-glow-rgb, 205,198,233), 0.19)` : 'none',
                    backdropFilter: 'blur(8px)',
                  }}
                >{q}</button>
              ))}
            </div>
            <div className="text-[9px] mt-1.5 italic" style={{ color: C.faint }}>lossless / hires 需要黑胶 SVIP</div>
          </SettingsFold>
          {/* ── 我们的数据备份（2026-09-04 分功能入口） ── */}
          <SettingsFold title={<span className="flex items-center gap-1.5"><Sparkle size={6} color={C.sakura} delay={0.8} /> 数据备份</span>}>
            <DataBackupPanel scope="music" />
          </SettingsFold>
          {/* ── 导入导出（2026-08-26：CC↔Sully 第一个数据同步区） ── */}
          <SettingsFold title={<span className="flex items-center gap-1.5"><Sparkle size={6} color={C.primary} delay={0.3} /> 导入导出（Claude Code 歌单）</span>}>
            {/* 角色选择 */}
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {characters.slice(0, 8).map((c) => {
                const selected = playlistCharId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setVisitCharId(c.id)}
                    className="rounded-full px-3 py-1.5 transition-all"
                    style={{
                      fontSize: 10, fontWeight: 600,
                      background: selected ? C.primary : C.glass,
                      color: selected ? '#fff' : C.muted,
                      border: `1px solid ${selected ? 'transparent' : 'rgba(255,255,255,0.25)'}`,
                    }}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
            <textarea
              className="w-full rounded-xl px-3 py-2 outline-none text-[10px] shizuku-glass"
              rows={3}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={'粘贴 Claude Code 导出的 JSON（schema: sully-music-import-v1）'}
              style={{ color: C.text, fontFamily: 'monospace', resize: 'none' }}
            />
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => handleImport()}
                disabled={importBusy}
                className="flex-1 py-2 rounded-xl text-[10px] font-semibold text-white transition-all disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})` }}
              >
                {importBusy ? '导入中…' : '粘贴导入'}
              </button>
              <label className="flex-1 py-2 rounded-xl text-[10px] font-semibold text-center cursor-pointer"
                style={{ color: C.primary, border: `1px solid rgba(var(--mz-primary-rgb, 128,124,157), 0.27)` }}>
                选择文件导入
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImportFile(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            <button
              onClick={handleExport}
              className="w-full mt-2 py-2 rounded-xl text-[10px] font-semibold"
              style={{ color: C.vip, border: `1px solid rgba(var(--mz-vip-rgb, 212,160,106), 0.19)` }}
            >
              导出给 Claude Code（播放记录 + 印象）
            </button>
            {musicStore.importBatches.length > 0 && (
              <div className="mt-2 pt-2" style={{ borderTop: `1px dashed rgba(var(--mz-faint-rgb, 188,184,204), 0.2)` }}>
                <div className="text-[9px] mb-1 tracking-wider" style={{ color: C.faint }}>最近导入</div>
                {musicStore.importBatches.slice(0, 3).map((b) => (
                  <div key={b.id} className="text-[9px] leading-relaxed" style={{ color: C.muted }}>
                    {b.importedAt.slice(0, 16).replace('T', ' ')} · {b.songCount} 首{b.skippedCount > 0 ? ` · 重复跳过 ${b.skippedCount}` : ''}{b.note ? ` · ${b.note}` : ''}
                  </div>
                ))}
              </div>
            )}
          </SettingsFold>

          {/* ── 歌词注入（2026-08-26 她定：随用随调试的调音台，长期试错区） ── */}
          <SettingsFold title={<span className="flex items-center gap-1.5"><Sparkle size={6} color={C.primary} delay={0.1} /> 歌词注入（模型读到的歌词）</span>}>
            <div className="text-[9px] mb-2 italic" style={{ color: C.faint }}>
              位置参照世界书式挂载原则（0 角色设定前 / 1 角色设定后 / 4 聊天记录指定深度＝插在倒数第 N 条消息前）。改完下一条消息生效，随用随调。
            </div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-[10px]" style={{ color: C.text }}>窗口半径（当前行 ±N）</div>
                <div className="text-[9px]" style={{ color: C.faint }}>前后各 N 行，0 = 只看当前行</div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setLyricInject({ windowRadius: Math.max(0, (musicStore.lyricInject.windowRadius ?? 2) - 1) })}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ color: C.muted, border: '1px solid rgba(255,255,255,0.25)' }}
                >−</button>
                <div className="min-w-[20px] text-center text-[12px] font-bold" style={{ color: C.text }}>{musicStore.lyricInject.windowRadius ?? 2}</div>
                <button
                  type="button"
                  onClick={() => setLyricInject({ windowRadius: Math.min(8, (musicStore.lyricInject.windowRadius ?? 2) + 1) })}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ color: C.muted, border: '1px solid rgba(255,255,255,0.25)' }}
                >+</button>
              </div>
            </div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px]" style={{ color: C.text }}>全量歌词位置</div>
              <div className="flex items-center gap-1">
                {([[0, '角色设定前'], [1, '角色设定后'], [4, '聊天深度']] as const).map(([pos, label]) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setLyricInject({ fullLyricPos: pos })}
                    className="rounded-full px-2.5 py-1 text-[9px] font-semibold transition-all"
                    style={{
                      background: (musicStore.lyricInject.fullLyricPos ?? 1) === pos ? C.primary : C.glass,
                      color: (musicStore.lyricInject.fullLyricPos ?? 1) === pos ? '#fff' : C.muted,
                      border: (musicStore.lyricInject.fullLyricPos ?? 1) === pos ? '1px solid transparent' : '1px solid rgba(255,255,255,0.25)',
                    }}
                  >{label}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px]" style={{ color: C.text }}>当前窗口位置</div>
              <div className="flex items-center gap-1">
                {([[1, '角色设定后'], [4, '聊天深度']] as const).map(([pos, label]) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setLyricInject({ windowPos: pos })}
                    className="rounded-full px-2.5 py-1 text-[9px] font-semibold transition-all"
                    style={{
                      background: (musicStore.lyricInject.windowPos ?? 4) === pos ? C.primary : C.glass,
                      color: (musicStore.lyricInject.windowPos ?? 4) === pos ? '#fff' : C.muted,
                      border: (musicStore.lyricInject.windowPos ?? 4) === pos ? '1px solid transparent' : '1px solid rgba(255,255,255,0.25)',
                    }}
                  >{label}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-[10px]" style={{ color: C.text }}>窗口深度（倒数第 N 条消息前）</div>
                <div className="text-[9px]" style={{ color: C.faint }}>窗口位置选「聊天深度」时生效，照世界书 depth</div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setLyricInject({ windowDepth: Math.max(0, (musicStore.lyricInject.windowDepth ?? 4) - 1) })}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ color: C.muted, border: '1px solid rgba(255,255,255,0.25)' }}
                >−</button>
                <div className="min-w-[20px] text-center text-[12px] font-bold" style={{ color: C.text }}>{musicStore.lyricInject.windowDepth ?? 4}</div>
                <button
                  type="button"
                  onClick={() => setLyricInject({ windowDepth: Math.min(8, (musicStore.lyricInject.windowDepth ?? 4) + 1) })}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ color: C.muted, border: '1px solid rgba(255,255,255,0.25)' }}
                >+</button>
              </div>
            </div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-[10px]" style={{ color: C.text }}>注入全量歌词</div>
                <div className="text-[9px]" style={{ color: C.faint }}>关掉后模型只读窗口，不读整首</div>
              </div>
              <button
                type="button"
                onClick={() => setLyricInject({ fullLyric: !(musicStore.lyricInject.fullLyric ?? true) })}
                className="rounded-full px-3 py-1.5 text-[10px] font-semibold transition-all"
                style={{
                  background: (musicStore.lyricInject.fullLyric ?? true) ? `linear-gradient(135deg, ${C.primary}, ${C.accent})` : C.glass,
                  color: (musicStore.lyricInject.fullLyric ?? true) ? '#fff' : C.muted,
                  border: (musicStore.lyricInject.fullLyric ?? true) ? '1px solid transparent' : '1px solid rgba(255,255,255,0.25)',
                }}
              >
                {(musicStore.lyricInject.fullLyric ?? true) ? '已开启' : '已关闭'}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px]" style={{ color: C.text }}>关键词触发</div>
                <div className="text-[9px]" style={{ color: C.faint }}>最近 4 条提到歌/歌词/这首歌名字才给窗口，没提不注入</div>
              </div>
              <button
                type="button"
                onClick={() => setLyricInject({ keywordTrigger: !(musicStore.lyricInject.keywordTrigger ?? true) })}
                className="rounded-full px-3 py-1.5 text-[10px] font-semibold transition-all"
                style={{
                  background: (musicStore.lyricInject.keywordTrigger ?? true) ? `linear-gradient(135deg, ${C.primary}, ${C.accent})` : C.glass,
                  color: (musicStore.lyricInject.keywordTrigger ?? true) ? '#fff' : C.muted,
                  border: (musicStore.lyricInject.keywordTrigger ?? true) ? '1px solid transparent' : '1px solid rgba(255,255,255,0.25)',
                }}
              >
                {(musicStore.lyricInject.keywordTrigger ?? true) ? '已开启' : '已关闭'}
              </button>
            </div>
          </SettingsFold>

          {/* ── 结束总结 API（2026-08-26 她定：从家里设置页搬来，音乐的事都在音乐 App 配） ── */}
          <SettingsFold title={<span className="flex items-center gap-1.5"><Sparkle size={6} color={C.sakura} delay={0.4} /> 一起听结束总结 API（独立槽）</span>}>
            <div className="text-[9px] mb-2 italic" style={{ color: C.faint }}>
              一起听结束时生成总结卡用。留空 = 退出时提示「会话已保存，配置后补生成」。聊歌、印象生成走主 API，不在这里配。
            </div>
            {/* 预设池胶囊（2026-09-05 反馈1 A3）：点一下即切即存，高亮 = 当前生效的预设 */}
            {apiPresets.length > 0 && (
              <div className="flex flex-wrap mb-2" style={{ gap: 6 }}>
                {apiPresets.map((preset) => {
                  const active = presetMatchesConfig(preset, {
                    baseUrl: musicStore.api?.baseUrl ?? '',
                    apiKey: musicStore.api?.apiKey ?? '',
                    model: musicStore.api?.model ?? '',
                  });
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        const patch = configFromPreset(preset);
                        setMusicApi({ baseUrl: patch.baseUrl ?? '', apiKey: patch.apiKey ?? '', model: patch.model ?? '' });
                        setMusicApiForm({ baseUrl: patch.baseUrl ?? '', apiKey: patch.apiKey ?? '', model: patch.model ?? '' });
                        addToast(`音乐总结 API 已切换到预设「${preset.name}」`, 'success');
                      }}
                      className="rounded-full px-3 py-1.5 text-[10px] font-semibold transition-all"
                      style={{
                        background: active ? `linear-gradient(135deg, ${C.primary}, ${C.accent})` : C.glass,
                        color: active ? '#fff' : C.muted,
                        border: active ? '1px solid transparent' : '1px solid rgba(255,255,255,0.25)',
                      }}
                    >
                      {preset.name}{active ? ' · 使用中' : ''}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex flex-col mb-2" style={{ gap: 6 }}>
              <input value={musicApiForm.baseUrl} onChange={(e) => setMusicApiForm({ ...musicApiForm, baseUrl: e.target.value })} placeholder="总结 API Base URL（已带 /v1）" className="shizuku-input text-[10px]" style={{ background: C.glass, color: C.text, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '6px 8px', outline: 'none' }} />
              <input value={musicApiForm.apiKey} onChange={(e) => setMusicApiForm({ ...musicApiForm, apiKey: e.target.value })} placeholder="总结 API Key" className="shizuku-input text-[10px]" style={{ background: C.glass, color: C.text, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '6px 8px', outline: 'none' }} />
              <input value={musicApiForm.model} onChange={(e) => setMusicApiForm({ ...musicApiForm, model: e.target.value })} placeholder="总结模型名" className="shizuku-input text-[10px]" style={{ background: C.glass, color: C.text, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '6px 8px', outline: 'none' }} />
            </div>
            <button
              type="button"
              onClick={() => { setMusicApi({ baseUrl: musicApiForm.baseUrl.trim(), apiKey: musicApiForm.apiKey.trim(), model: musicApiForm.model.trim() }); addToast('音乐总结 API 已保存', 'success'); }}
              className="rounded-full w-full border-0 cursor-pointer"
              style={{ padding: '8px 0', fontSize: 11, fontWeight: 700, color: '#fff', background: `linear-gradient(135deg, ${C.primary}, ${C.accent})` }}
            >
              保存
            </button>
            {/* 反馈1 A5：补生成后台跑（bgTask）——生成中可离页，回来还在跑；失败/中断可重试 */}
            <button
              type="button"
              disabled={summariesRunning}
              onClick={() => {
                void startBgTaskForResult(musicStoreApi, 'pendingSummary', 'music-summaries', () => maybeGeneratePendingSummaries())
                  .then(({ started, result }) => {
                    if (!started) return; // 已有新鲜 running，静默忽略
                    if (result) {
                      if (result.togetherDone + result.chatDone > 0) {
                        addToast(`补生成完成：总结卡 ${result.togetherDone} 张、聊歌小结 ${result.chatDone} 段`, 'success');
                      } else {
                        addToast('没有可补的内容（或 API 未配置）', 'info');
                      }
                    } else {
                      addToast('补生成失败，重试一次看看', 'error');
                    }
                  });
              }}
              className="rounded-full w-full border-0 cursor-pointer mt-2 disabled:opacity-50"
              style={{ padding: '7px 0', fontSize: 10, fontWeight: 600, color: C.primary, border: `1px solid rgba(var(--mz-lavender-rgb, 207,195,232), 0.4)`, background: C.glass }}
            >
              {summariesRunning ? '补生成中…（可离开，回来还在跑）' : '补生成没落下的总结卡'}
            </button>
            {summariesRunning && (
              <div className="mt-2 text-[9px]" style={{ color: C.sakura }}>生成中……切去别的页面也不中断，回来这里看结果（新卡片会发进对应聊天）。</div>
            )}
            {summariesInterrupted && (
              <div className="mt-2 text-[9px]" style={{ color: C.danger }}>上次生成被页面重载打断了，再点一次补生成重试。</div>
            )}
            {pendingSummary?.status === 'failed' && (
              <div className="mt-2 text-[9px]" style={{ color: C.danger }}>补生成失败：{pendingSummary.error || '未知错误'}。再点一次重试。</div>
            )}
          </SettingsFold>

          {/* ── 聊歌页背景自设（2026-08-30 她要求：聊歌页背景开放自设；头像开关同批） ── */}
          <SettingsFold title={<span className="flex items-center gap-1.5"><Sparkle size={6} color={C.lavender} delay={0.8} /> 聊歌页</span>} right={<span className="text-[9px]" style={{ color: C.faint }}>背景图 + 底色 + 头像开关，即时生效</span>}>
            {/* 头像开关（2026-08-30）：气泡旁显示你和 Ta 的头像 */}
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-[10px]" style={{ color: C.text }}>显示头像</div>
                <div className="text-[9px]" style={{ color: C.faint }}>气泡旁带上你和 Ta 的头像，页面更满一点</div>
              </div>
              <button
                type="button"
                onClick={() => setChatShowAvatar(musicStore.chatShowAvatar === false)}
                className="rounded-full px-3 py-1.5 text-[10px] font-semibold transition-all"
                style={{
                  background: musicStore.chatShowAvatar !== false ? `linear-gradient(135deg, ${C.primary}, ${C.accent})` : C.glass,
                  color: musicStore.chatShowAvatar !== false ? '#fff' : C.muted,
                  border: musicStore.chatShowAvatar !== false ? '1px solid transparent' : '1px solid rgba(255,255,255,0.25)',
                }}
              >
                {musicStore.chatShowAvatar !== false ? '已开启' : '已关闭'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex-1 rounded-xl px-3 py-2 text-center text-[10px] cursor-pointer transition-all"
                style={{ color: C.primary, background: C.glass, border: '1px dashed rgba(var(--mz-primary-rgb, 128,124,157), 0.4)' }}>
                上传背景图
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const ref = await putImageBlob(file);
                      setChatBg(ref, musicStore.chatBgColor);
                      addToast('聊歌背景已更新', 'success');
                    } catch {
                      addToast('背景图保存失败', 'error');
                    }
                    e.target.value = '';
                  }}
                />
              </label>
              <button
                type="button"
                disabled={!musicStore.chatBgImage}
                onClick={() => { setChatBg(undefined, musicStore.chatBgColor); addToast('背景图已撤下', 'info'); }}
                className="rounded-xl px-3 py-2 text-[10px] transition-all disabled:opacity-40"
                style={{ color: C.muted, background: C.glass, border: '1px solid rgba(255,255,255,0.3)' }}
              >
                撤图
              </button>
              <input
                type="color"
                value={musicStore.chatBgColor || '#fdf4f7'}
                onChange={(e) => setChatBg(musicStore.chatBgImage, e.target.value)}
                className="w-9 h-9 rounded-lg cursor-pointer"
                style={{ border: '1px solid rgba(255,255,255,0.35)', background: C.glass }}
                aria-label="聊歌背景底色"
              />
            </div>
            {musicStore.chatBgColor && (
              <div className="text-[9px] mt-1.5 italic" style={{ color: C.faint }}>
                底色 {musicStore.chatBgColor} · 想回到默认就把它清掉（切到 #fdf4f7 即默认底色）
              </div>
            )}
          </SettingsFold>

          {/* ── 调色台（2026-08-30 她要求：音乐页那个紫色整个可调，这一页所有颜色都放进来） ── */}
          <SettingsFold title={<span className="flex items-center gap-1.5"><Sparkle size={6} color={C.sakura} delay={0.6} /> 调色台（整页配色）</span>} right={
            <button
              type="button"
              onClick={() => { resetMusicPalette(); addToast('配色已恢复默认', 'success'); }}
              className="text-[9px] underline border-0 cursor-pointer"
              style={{ color: C.muted, background: 'transparent' }}
            >
              恢复默认
            </button>
          }>
            <div className="text-[9px] mb-2 italic" style={{ color: C.faint }}>
              改完即时生效。调色盖在内置预设（夜色）之上，自己手写的 CSS 仍然盖过调色台。透明拼接用的 -rgb 变量自动同步，不用管。
            </div>
            <div className="grid grid-cols-4 gap-1.5 mb-2.5">
              {MUSIC_PALETTE_KEYS.map((key) => (
                <div key={key} className="flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5"
                  style={{ background: 'rgba(255,255,255,0.5)' }}>
                  <span className="text-[8px]" style={{ color: C.muted }}>{PALETTE_LABELS[key]}</span>
                  <input
                    type="color"
                    value={musicStore.palette?.[key] ?? MUSIC_PALETTE_DEFAULTS[key]}
                    onChange={(e) => setMusicPalette({ [key]: e.target.value })}
                    className="w-7 h-7 rounded-md cursor-pointer"
                    style={{ border: '1px solid rgba(255,255,255,0.45)', background: 'transparent' }}
                    aria-label={`${PALETTE_LABELS[key]}调色`}
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <div className="text-[9px]" style={{ color: C.text }}>玻璃面白度（surface）</div>
                <div className="text-[8px]" style={{ color: C.faint }}>气泡/面板的白色玻璃深浅</div>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="range" min={0} max={100} step={5}
                  value={Number(musicStore.palette?.surface ?? SURFACE_DEFAULT_PCT)}
                  onChange={(e) => setMusicPalette({ surface: e.target.value })}
                  style={{ width: 90 }}
                />
                <span className="text-[9px] tabular-nums" style={{ color: C.muted }}>{musicStore.palette?.surface ?? SURFACE_DEFAULT_PCT}%</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[9px]" style={{ color: C.text }}>玻璃面白度（glass）</div>
                <div className="text-[8px]" style={{ color: C.faint }}>按钮/轨道等浅玻璃</div>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="range" min={0} max={100} step={5}
                  value={Number(musicStore.palette?.glass ?? GLASS_DEFAULT_PCT)}
                  onChange={(e) => setMusicPalette({ glass: e.target.value })}
                  style={{ width: 90 }}
                />
                <span className="text-[9px] tabular-nums" style={{ color: C.muted }}>{musicStore.palette?.glass ?? GLASS_DEFAULT_PCT}%</span>
              </div>
            </div>
          </SettingsFold>

          {/* ── 自定义 CSS（2026-08-26 她的意见：放音乐设置页顺手） ── */}
          <SettingsFold title={<span className="flex items-center gap-1.5"><Sparkle size={6} color={C.sakura} delay={0.2} /> 自定义 CSS（换肤 / 深度定制）</span>} right={<span className="text-[9px]" style={{ color: C.faint }}>写法说明见 docs/music-css-presets.md</span>}>
            <div className="text-[9px] mb-2 italic" style={{ color: C.faint }}>
              基础 = 全局变量（--mz-*），作用所有页面；每个页面单独一份，互不干扰；角色页可以再按角色覆盖。三层按「基础 → 当前页 → 角色」叠加。
            </div>
            {/* 内置预设（2026-08-30）：沉浸夜色 = 播放页/聊歌页深色版，选上后自己写的 CSS 仍叠加在上 */}
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <span className="text-[9px] mr-1" style={{ color: C.faint }}>内置预设</span>
              {([
                [undefined, '默认'],
                ['night', '沉浸夜色'],
              ] as const).map(([key, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setCssPreset(key)}
                  className="rounded-full px-3 py-1.5 transition-all"
                  style={{
                    fontSize: 10, fontWeight: 600,
                    background: (musicStore.cssPreset ?? undefined) === key ? `linear-gradient(135deg, ${C.primary}, ${C.accent})` : C.glass,
                    color: (musicStore.cssPreset ?? undefined) === key ? '#fff' : C.muted,
                    border: `1px solid ${(musicStore.cssPreset ?? undefined) === key ? 'transparent' : 'rgba(255,255,255,0.25)'}`,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              {([
                ['base', '基础'],
                ['search', '搜索页'],
                ['player', '播放页'],
                ['profile', '我的页'],
                ['playlist', '歌单页'],
                ['visit_char', '角色页'],
                ['chat', '聊歌页'],
                ['miniplayer', '悬浮窗'],
                ['cards', '聊天卡片'],
                ['settings', '设置页'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => pickCssScope(key)}
                  className="rounded-full px-3 py-1.5 transition-all"
                  style={{
                    fontSize: 10, fontWeight: 600,
                    background: cssScope === key ? C.primary : C.glass,
                    color: cssScope === key ? '#fff' : C.muted,
                    border: `1px solid ${cssScope === key ? 'transparent' : 'rgba(255,255,255,0.25)'}`,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {cssScope === 'visit_char' && (
              <div className="flex items-center gap-1.5 flex-wrap mb-2">
                <span className="text-[9px]" style={{ color: C.faint }}>给谁：</span>
                <button
                  type="button"
                  onClick={() => pickCssChar('')}
                  className="rounded-full px-3 py-1 transition-all"
                  style={{
                    fontSize: 10, fontWeight: 600,
                    background: cssCharId === '' ? C.primary : C.glass,
                    color: cssCharId === '' ? '#fff' : C.muted,
                    border: `1px solid ${cssCharId === '' ? 'transparent' : 'rgba(255,255,255,0.25)'}`,
                  }}
                >
                  所有角色
                </button>
                {characters.slice(0, 8).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pickCssChar(c.id)}
                    className="rounded-full px-3 py-1 transition-all"
                    style={{
                      fontSize: 10, fontWeight: 600,
                      background: cssCharId === c.id ? C.primary : C.glass,
                      color: cssCharId === c.id ? '#fff' : C.muted,
                      border: `1px solid ${cssCharId === c.id ? 'transparent' : 'rgba(255,255,255,0.25)'}`,
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            <textarea
              className="w-full rounded-xl px-3 py-2 outline-none text-[10px] shizuku-glass"
              rows={5}
              value={cssDraft}
              onChange={(e) => setCssDraft(e.target.value)}
              placeholder={'例如（换成明显不同的颜色一眼能看出来）：\n:root { --mz-primary: #2f6f4f; --mz-primary-rgb: 47,111,79; --mz-accent: #57a87f; --mz-glow: #8fd0ab; --mz-glow-rgb: 143,208,171; }\n\n换色同时改 -rgb 变量（透明色用得上）。'}
              style={{ color: C.text, fontFamily: 'monospace', resize: 'vertical', minHeight: 90 }}
            />
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={saveCss}
                className="flex-1 py-2 rounded-xl text-[10px] font-semibold text-white"
                style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})` }}
              >
                应用并保存
              </button>
              {cssCurrentValue() ? (
                <button
                  type="button"
                  onClick={resetCss}
                  className="py-2 px-4 rounded-xl text-[10px] font-semibold"
                  style={{ color: C.vip, border: `1px solid ${C.vip}30` }}
                >
                  恢复默认
                </button>
              ) : null}
            </div>
          </SettingsFold>

          <div className="space-y-3 pt-1">
            <button
              onClick={async () => {
                trackEvent('运行音乐服务诊断');
                const lines: string[] = [];
                const ck = normalizeCookie(cfg.cookie);
                lines.push(`Worker: ${effectiveWorkerUrl}${followsCentral ? '（跟随中心）' : '（音乐单独设的）'}`);
                lines.push(`Cookie: ${ck ? ck.slice(0, 18) + '...(' + ck.length + 'c)' : '(未填)'}`);
                try {
                  const res = await fetch(`${effectiveWorkerUrl}/netease/search`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', ...(ck ? { 'X-Netease-Cookie': ck } : {}) },
                    body: JSON.stringify({ keyword: '晴天', limit: 3 }),
                  });
                  lines.push(`HTTP ${res.status}`);
                  const txt = await res.text(); lines.push(txt.slice(0, 800));
                  try { const j = JSON.parse(txt); lines.push(`---\ncode=${j.code}  songs=${j?.result?.songs?.length ?? 'N/A'}`); } catch {}
                } catch (e: any) { lines.push(`异常: ${e.message}`); }
                alert(lines.join('\n'));
              }}
              className="w-full py-2.5 rounded-2xl text-[10px] tracking-wider shizuku-glass transition-all"
              style={{ color: C.vip, border: `1px solid rgba(var(--mz-vip-rgb, 212,160,106), 0.19)` }}
            >诊断（搜索晴天）</button>
            <button onClick={commit}
              className="w-full py-3 rounded-2xl text-xs text-white tracking-wider transition-all relative overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, boxShadow: `0 3px 18px rgba(var(--mz-glow-rgb, 205,198,233), 0.19)` }}>
              <span className="relative z-10">保存</span>
              <div className="absolute inset-0 pointer-events-none" style={{
                background: `linear-gradient(90deg, transparent 30%, rgba(255,255,255,0.25) 50%, transparent 70%)`,
                backgroundSize: '200% 100%', animation: 'shizuku-shimmer 3s ease-in-out infinite',
              }} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`mz-app absolute inset-0 overflow-hidden${nightPreset ? ' mz-night' : ''}`}>
      {/* 视图切换过渡（2026-08-30）：听歌 ↔ 聊歌切页淡入，不再硬切 */}
      <div key={view} className="absolute inset-0 animate-fade-in" style={{ animationDuration: '260ms' }}>
        {view === 'search' && renderSearch()}
        {view === 'player' && renderPlayer()}
        {view === 'settings' && renderSettings()}
        {view === 'chat' && renderChat()}
      {view === 'profile' && (
        <NeteaseProfilePage
          onBack={closeApp}
          onOpenPlayer={() => setView('player')}
          onOpenSearch={() => setView('search')}
          onOpenSettings={() => setView('settings')}
          onVisitChar={id => { setVisitCharId(id); setView('visit_char'); trackEvent('进入角色音乐角落'); }}
        />
      )}
      {/* 手动对轴 modal — 全屏覆盖，不开新 view */}
      {showLyricSync && current && current.local && (() => {
        const fmt = (s: number) => {
          if (!isFinite(s)) return '0:00.0';
          const m = Math.floor(s / 60);
          const sec = (s % 60).toFixed(1).padStart(4, '0');
          return `${m}:${sec}`;
        };
        const setLineTime = (idx: number, t: number) => {
          setSyncDraft(prev => {
            const next = [...prev];
            next[idx] = Math.max(0, t);
            return next;
          });
        };
        const tapCurrent = (idx: number) => setLineTime(idx, progress);
        const resetAuto = () => {
          if (!duration || duration <= 0) return;
          const intro = Math.min(2, duration * 0.05);
          const outro = Math.min(3, duration * 0.05);
          const usable = Math.max(duration - intro - outro, duration * 0.6);
          const step = usable / lyric.length;
          setSyncDraft(lyric.map((_, i) => intro + i * step));
        };
        const saveSync = () => {
          if (!current) return;
          // 把 draft 写到 song.lyricLineTimings 里 → addLocalSong 上行覆盖
          const updated: Song = { ...current, lyricLineTimings: syncDraft };
          addLocalSong(updated);
          // 重新 playSong 让 LyricLine 立即用新时间
          playSong(updated, { alsoSetQueue: false });
          setShowLyricSync(false);
          addToast('对轴已保存 ✦', 'success');
          trackEvent('保存歌词对轴');
        };

        return (
          <div className="absolute inset-0 z-50 flex flex-col"
            style={{ background: `linear-gradient(180deg, ${C.bg} 0%, ${C.bgDeep} 50%, ${C.bgTint} 100%)` }}>
            <BokehBg />
            {/* Header */}
            <div className="relative z-10 shizuku-glass-strong"
              style={{ borderBottom: `1px solid rgba(255,255,255,0.3)`, paddingTop: 'var(--safe-top)' }}>
              <div className="flex items-center justify-between h-12 px-4">
                <button onClick={() => setShowLyricSync(false)} className="text-[11px] px-2 py-1 rounded-full" style={{ color: C.muted }}>取消</button>
                <div className="flex items-center gap-1.5">
                  <Crosshair size={13} weight="duotone" color={C.primary} />
                  <span className="text-[12px] tracking-[0.25em]" style={{ color: C.primary, fontFamily: 'Georgia, serif' }}>歌词对轴</span>
                </div>
                <button onClick={saveSync} className="text-[11px] font-bold px-3 py-1 rounded-full"
                  style={{
                    background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`,
                    color: 'white',
                    boxShadow: `0 2px 10px rgba(var(--mz-glow-rgb, 205,198,233), 0.31)`,
                  }}>保存</button>
              </div>
            </div>

            {/* Live progress + transport */}
            <div className="relative z-10 px-4 pt-3 pb-2 shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <button onClick={togglePlay}
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 active:scale-95 transition-transform"
                  style={{
                    background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`,
                    color: 'white',
                    boxShadow: `0 3px 12px rgba(var(--mz-glow-rgb, 205,198,233), 0.31)`,
                  }}
                >
                  {playing ? <PauseIcon size={14} weight="fill" /> : <PlayIcon size={14} weight="fill" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-[10px] mb-1" style={{ color: C.muted, fontFamily: 'monospace' }}>
                    <span style={{ color: C.primary, fontWeight: 600 }}>{fmt(progress)}</span>
                    <span>{fmt(duration)}</span>
                  </div>
                  <div className="h-1 rounded-full shizuku-glass cursor-pointer relative"
                    onClick={(e) => {
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      seek((e.clientX - rect.left) / rect.width);
                    }}
                  >
                    <div className="absolute top-0 left-0 h-full rounded-full"
                      style={{
                        width: `${duration > 0 ? (progress / duration) * 100 : 0}%`,
                        background: `linear-gradient(90deg, ${C.primary}, ${C.glow})`,
                      }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <button onClick={resetAuto} className="text-[10px] underline" style={{ color: C.muted }}>
                  重置为均匀分布
                </button>
                <p className="text-[10px] flex-1 text-right" style={{ color: C.muted }}>
                  播放时点 ⊙ 把当前时间设给那一句
                </p>
              </div>
            </div>

            {/* Lyric list with tap-to-set */}
            <div className="flex-1 overflow-y-auto px-3 pb-6 shizuku-scrollbar relative z-10 pt-1">
              {lyric.length === 0 ? (
                <div className="text-center text-[11px] py-12" style={{ color: C.faint }}>没有歌词可对轴</div>
              ) : (
                <div className="space-y-1.5">
                  {lyric.map((l, i) => {
                    const t = syncDraft[i] ?? l.t;
                    const isActive = i === activeLyricIdx;
                    return (
                      <div key={i}
                        className="flex items-center gap-2 rounded-xl px-2.5 py-2 transition-all"
                        style={{
                          background: isActive
                            ? `linear-gradient(135deg, rgba(var(--mz-glow-rgb, 205,198,233), 0.15), rgba(var(--mz-lavender-rgb, 207,195,232), 0.09))`
                            : 'rgba(255,255,255,0.5)',
                          border: `1px solid ${isActive ? C.glow + '60' : C.faint + '30'}`,
                          boxShadow: isActive ? `0 2px 12px rgba(var(--mz-glow-rgb, 205,198,233), 0.19)` : 'none',
                        }}
                      >
                        <span className="text-[9px] tabular-nums w-5 text-center shrink-0" style={{ color: C.faint }}>{i + 1}</span>
                        <button
                          onClick={() => tapCurrent(i)}
                          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 active:scale-90 transition-all"
                          style={{
                            background: `rgba(var(--mz-primary-rgb, 128,124,157), 0.08)`,
                            border: `1px solid rgba(var(--mz-primary-rgb, 128,124,157), 0.19)`,
                            color: C.primary,
                          }}
                          title="把这一句设到当前播放时间"
                        >
                          ⊙
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] truncate" style={{ color: isActive ? C.primary : C.text, fontWeight: isActive ? 600 : 400 }}>
                            {l.text}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[9px] tabular-nums" style={{ color: C.muted, fontFamily: 'monospace' }}>{fmt(t)}</span>
                            <button
                              onClick={() => setLineTime(i, t - 0.2)}
                              className="text-[9px] px-1 rounded"
                              style={{ color: C.faint }}
                            >−.2s</button>
                            <button
                              onClick={() => setLineTime(i, t + 0.2)}
                              className="text-[9px] px-1 rounded"
                              style={{ color: C.faint }}
                            >+.2s</button>
                            <button
                              onClick={() => seek(duration > 0 ? t / duration : 0)}
                              className="text-[9px] px-1 rounded ml-auto"
                              style={{ color: C.accent }}
                            >跳到此处</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {view === 'playlist' && (
        <PlaylistHomePage
          charId={playlistCharId}
          onBack={() => setView('profile')}
          onOpenPlayer={() => setView('player')}
          onOpenSettings={() => setView('settings')}
          onOpenChat={() => { setChatCharId(playlistCharId); setView('chat'); trackEvent('打开聊歌框'); }}
        />
      )}
      {view === 'visit_char' && visitCharId && (
        <CharVisitPage
          charId={visitCharId}
          onBack={() => { setView('profile'); setVisitCharId(null); }}
          onOpenPlayer={() => setView('player')}
        />
      )}

      {/* 一起听邀请专用弹层（2026-08-30：不再复用转发选人器——标题/当前歌/角色卡片都是邀请观感） */}
      {showInvitePicker && (
        <InviteTogetherModal
          songName={current?.name}
          artists={current?.artists}
          characters={characters.map((c) => ({ id: c.id, name: c.name, avatar: c.avatar }))}
          onPick={(c) => void sendInvite(c)}
          onClose={() => setShowInvitePicker(false)}
        />
      )}

      {/* 结束一起听轻确认（统一出口，×/结束按钮都走这里） */}
      <ConfirmDialog
        isOpen={confirmEndChar !== null}
        title="结束一起听"
        message={confirmEndChar
          ? `结束和 ${characters.find((c) => c.id === confirmEndChar)?.name || 'Ta'} 的这次一起听？会留下这次一起听的总结卡。`
          : '结束这次一起听？会留下这次一起听的总结卡。'}
        confirmText="结束"
        cancelText="再听会儿"
        variant="info"
        onConfirm={() => doEndTogether(confirmEndChar)}
        onCancel={() => setConfirmEndChar(null)}
      />

      {/* 重新发起前取消旧邀请（反馈2 #3：旧状态删不掉 → 确认后直接取消再发） */}
      <ConfirmDialog
        isOpen={inviteResend !== null}
        title="重新发起一起听"
        message={inviteResend ? `${inviteResend.name}还没回应一起听，是否要取消上次的邀请重新发起？` : ''}
        confirmText="重新发起"
        cancelText="先不"
        variant="info"
        onConfirm={() => void confirmResendInvite()}
        onCancel={() => setInviteResend(null)}
      />
      </div>
    </div>
  );
};

export default MusicApp;

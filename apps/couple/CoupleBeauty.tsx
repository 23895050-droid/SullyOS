// 美化区 — 设置 tab（2026-08-19）：情侣空间图片自定义（宣告区背景 / 胶囊条背景）+ 单间美化的入口占位
// 图片走 blobRef（IndexedDB blob_assets），配置存 localStorage couple_beauty_v1；旧值/渐变字符串原样透传
import React, { useEffect, useRef, useState } from 'react';
import { useOS } from '../../context/OSContext';
import { ArrowCounterClockwise, ImageSquare, CaretDown } from '@phosphor-icons/react';
import { putImageBlob, useBlobRefUrl } from '../../utils/blobRef';
import PromptSettings from '../../components/settings/PromptSettings';
import MountSettings from './MountSettings';
import { gatherBoardDayInfo } from './boardApi';
import { getMountConfig } from '../../utils/noxhomeMount';
import { getLocalDateKey } from '../../utils/localDate';
import DataBackupPanel from './DataBackupPanel';
import { deleteBlobRef } from '../../utils/blobRef';
import { updateDiaryApi, updateDiaryFont, useDiaryStore } from './diaryStore';
import { useCouplePaletteStore, setCouplePalette, resetCouplePalette, saveCouplePreset, loadCouplePreset, deleteCouplePreset } from './couplePaletteStore';
import { COUPLE_PALETTE_KEYS, COUPLE_PALETTE_DEFAULTS, CARD_ALPHA_DEFAULT } from './couplePalette';

const BEAUTY_KEY = 'couple_beauty_v1';
type CoupleBeauty = { headerBg?: string; capsuleBg?: string; accent?: string; avatarNox?: string; avatarAngelica?: string; homeDisc?: string; homeBg?: string; coupleBg?: string };

export const loadCoupleBeauty = (): CoupleBeauty => {
  try {
    return JSON.parse(localStorage.getItem(BEAUTY_KEY) ?? '{}');
  } catch {
    return {};
  }
};

const saveCoupleBeauty = (b: CoupleBeauty) => {
  localStorage.setItem(BEAUTY_KEY, JSON.stringify(b));
  // 同窗口自写 localStorage 不会触发 storage 事件，派发自定义事件让 NoxHome 实时刷新（不用退出去重进）
  window.dispatchEvent(new Event('couple-beauty-changed'));
};

// ── 皮肤色主题：爱心固定粉色，其余粉色元素全部跟随 accent ──
export const DEFAULT_ACCENT = '#f0a8c0';
export const ACCENT_PRESETS = ['#f0a8c0', '#b9a0e0', '#a0c4e8', '#a0dcc0', '#e8b890'];

export type CoupleTheme = {
  accent: string; soft: string; border: string; deep: string;
  scroll: string; shadowSoft: string; shadowStrong: string;
};

// 主色 → 派生浅色底 / 边框 / 深色字 / 滚动条 / 阴影（线性混合，不依赖外部库）
export const buildTheme = (accent?: string): CoupleTheme => {
  const hex = (accent ?? DEFAULT_ACCENT).replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  const ok = !isNaN(r) && !isNaN(g) && !isNaN(b);
  const R = ok ? r : 240, G = ok ? g : 168, B = ok ? b : 192;
  const mix = (t: number, tr: number, tg: number, tb: number) =>
    `rgb(${Math.round(R + (tr - R) * t)}, ${Math.round(G + (tg - G) * t)}, ${Math.round(B + (tb - B) * t)})`;
  return {
    accent: ok ? `#${hex}` : DEFAULT_ACCENT,
    soft: mix(0.86, 255, 255, 255),
    border: mix(0.55, 255, 255, 255),
    deep: mix(0.45, 138, 32, 64),
    scroll: `rgba(${R}, ${G}, ${B}, 0.55)`,
    shadowSoft: `0 10px 30px rgba(${R}, ${G}, ${B}, 0.16), 0 2px 8px rgba(60,30,50,0.05)`,
    shadowStrong: `0 22px 44px rgba(${R}, ${G}, ${B}, 0.22), 0 8px 18px rgba(60,30,50,0.08)`,
  };
};

// 所有可自定义图片的槽位 key 与成功文案
type BeautyKey = 'headerBg' | 'capsuleBg' | 'avatarNox' | 'avatarAngelica' | 'homeDisc' | 'homeBg' | 'coupleBg';
const PICK_LABELS: Record<BeautyKey, string> = {
  headerBg: '宣告区背景图已更新',
  capsuleBg: '胶囊条背景图已更新',
  avatarNox: 'Nox 头像已更新',
  avatarAngelica: 'Angelica 头像已更新',
  homeDisc: '大圆照片已更新',
  homeBg: '单间背景图已更新',
  coupleBg: '情侣空间背景图已更新',
};

// 各槽位上传即压缩到上限宽度（手机解码几 MB 原图是卡顿/点不动的主因；webp 保留透明，不支持回退 png）
const SLOT_MAX_W: Record<BeautyKey, number> = {
  headerBg: 1000, capsuleBg: 1000, avatarNox: 512, avatarAngelica: 512, homeDisc: 512, homeBg: 1000, coupleBg: 1000,
};

const shrinkImage = (file: File, maxW: number): Promise<Blob> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.naturalWidth <= maxW) { resolve(file); return; }
      const c = document.createElement('canvas');
      c.width = maxW;
      c.height = Math.max(1, Math.round((img.naturalHeight * maxW) / img.naturalWidth));
      const ctx = c.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => {
        if (b) resolve(b);
        else c.toBlob((b2) => resolve(b2 ?? file), 'image/png');
      }, 'image/webp', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });

// 单个图片槽位：预览 + 更换（本地图片 → blobRef）+ 恢复默认
const Slot: React.FC<{
  label: string; desc: string; value?: string;
  onPick: (file: File) => Promise<void>; onReset: () => void;
}> = ({ label, desc, value, onPick, onReset }) => {
  const url = useBlobRefUrl(value);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3 rounded-2xl p-3.5" style={{ background: '#fff', boxShadow: '0 6px 18px rgba(233,160,190,0.14)' }}>
      <div className="rounded-xl overflow-hidden shrink-0 flex items-center justify-center" style={{ width: 52, height: 52, background: url ? 'transparent' : 'linear-gradient(165deg, #ffd3e4, #ffeaf3)', border: '1px solid var(--cs-border, #f2d3e0)' }}>
        {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <ImageSquare style={{ width: 18, height: 18, color: 'var(--cs-deep, #d98ba9)' }} />}
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 14, fontWeight: 600, color: '#3a2a33' }}>{label}</div>
        <div style={{ fontSize: 11, color: '#9a7a8a', marginTop: 2 }}>{desc}</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) await onPick(f);
        }}
      />
      <button type="button" onClick={() => inputRef.current?.click()} className="border-0 cursor-pointer rounded-full" style={{ background: 'var(--cs-soft, #fce8f1)', color: 'var(--cs-deep, #c25a82)', fontSize: 12, padding: '6px 14px', fontWeight: 600 }}>更换</button>
      <button type="button" aria-label="恢复默认" onClick={onReset} className="border-0 bg-transparent cursor-pointer" style={{ color: '#b0909c' }}>
        <ArrowCounterClockwise style={{ width: 16, height: 16 }} />
      </button>
    </div>
  );
};

// ── 日记设置（2026-08-24）：「喊他写日记」+「批注她的日记」共用的 API 槽；没配就用主 API；可上传手写字体 ──
const DiarySettings: React.FC = () => {
  const { addToast } = useOS();
  const store = useDiaryStore();
  const fontInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ baseUrl: store.api.baseUrl, apiKey: store.api.apiKey, model: store.api.model });
  const inputCss: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', fontSize: 12, color: '#3a2a33', border: '1px solid #f2d3e0',
    borderRadius: 10, padding: '8px 10px', background: '#faf7f8', outline: 'none',
  };
  const pickFont = async (f: File) => {
    try {
      const ref = await putImageBlob(f);
      updateDiaryFont({ fontRef: ref, fontName: f.name });
      addToast(`字体「${f.name}」已生效`, 'success');
    } catch {
      addToast('字体保存失败', 'error');
    }
  };
  const resetFont = async () => {
    if (store.fontRef) await deleteBlobRef(store.fontRef).catch(() => {});
    updateDiaryFont({ fontRef: undefined, fontName: undefined });
    addToast('已恢复默认字体', 'success');
  };
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-2" style={{ background: '#fff', boxShadow: '0 6px 18px rgba(233,160,190,0.14)' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#3a2a33' }}>日记 API</div>
      <div style={{ fontSize: 11, color: '#9a7a8a', lineHeight: 1.6 }}>
        「喊他写日记」「批注她的日记」和留言板「喊他留言」共用这个 API。留空就用主 API（聊天 API），不用单独配。提示词在「提示词管理 · 日记 / 日常」分类里改。
      </div>
      <div className="flex flex-col" style={{ gap: 6, marginTop: 2 }}>
        <input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="Base URL（已带 /v1，留空用主 API）" style={inputCss} />
        <input value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="API Key（留空用主 API）" style={inputCss} />
        <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="模型名（留空用主 API）" style={inputCss} />
      </div>
      <button
        type="button"
        onClick={() => { updateDiaryApi({ baseUrl: form.baseUrl.trim(), apiKey: form.apiKey.trim(), model: form.model.trim() }); addToast('日记 API 已保存', 'success'); }}
        className="border-0 cursor-pointer rounded-full"
        style={{ padding: '9px 0', fontSize: 12, fontWeight: 700, color: '#fff', background: 'var(--cs-accent, #f0a8c0)' }}
      >
        保存
      </button>
      {/* 手写字体（2026-08-24 二批）：上传 ttf/otf/woff，日记页整页换成这个字体 */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#3a2a33', marginTop: 6 }}>日记字体</div>
      <div style={{ fontSize: 11, color: '#9a7a8a', lineHeight: 1.6 }}>上传自己的手写字体（ttf / otf / woff），日记页的正文、标题、旁批都会用它。</div>
      <input
        ref={fontInput}
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) await pickFont(f);
        }}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fontInput.current?.click()}
          className="border-0 cursor-pointer rounded-full"
          style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#fff', background: '#8a5a3b' }}
        >
          {store.fontName ? `已用「${store.fontName}」· 更换` : '上传字体'}
        </button>
        {store.fontRef && (
          <button type="button" onClick={resetFont} className="border-0 cursor-pointer rounded-full" style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#8a5a3b', background: '#f4e9da' }}>
            恢复默认
          </button>
        )}
      </div>
    </div>
  );
};

// ── 设置页折叠卡（2026-08-30 她要求：家里设置页每个类别也折叠，点开再展开） ──
const BeautyFold: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', boxShadow: '0 6px 18px rgba(233,160,190,0.14)' }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); } }}
        className="flex items-center justify-between cursor-pointer select-none"
        style={{ padding: '14px 16px' }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: '#3a2a33' }}>{title}</span>
        <CaretDown size={14} weight="bold" style={{ color: '#b0909c', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }} />
      </div>
      {open && <div className="px-4 pb-4 flex flex-col gap-3">{children}</div>}
    </div>
  );
};

// ── 留言板批阅输入预览（透明化：他每次「批阅今天」读到的就是这段） ──
const BoardInputPreview: React.FC = () => {
  const { userProfile, characters } = useOS();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    try {
      const raw = await gatherBoardDayInfo(getLocalDateKey());
      const char = characters.find((c) => c.id === getMountConfig().charId);
      setText(
        raw
          .replace(/\{\{user\}\}/g, userProfile?.name ?? '她')
          .replace(/\{\{char\}\}/g, char?.name ?? '他'),
      );
    } catch {
      setText('读取失败，点下面刷新重试');
    } finally {
      setBusy(false);
    }
  };
  // BeautyFold 折叠时不渲染 children：展开即重新读一次，总是最新数据
  useEffect(() => { void load(); }, []);
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <div style={{ fontSize: 11, color: '#8aa397', lineHeight: 1.7 }}>
        他每次「批阅今天」读到的就是下面这段（今天的实时数据）。她日记的正文不会进来，只给「写没写」的状态。
      </div>
      <div
        className="rounded-xl"
        style={{ background: '#fdf7fa', border: '1px solid #f3dbe6', padding: 10, fontSize: 11, color: '#5a4a52', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' }}
      >
        {busy ? '读取中…' : text || '（今天还没有可用于批阅的记录）'}
      </div>
      <button
        type="button"
        onClick={load}
        disabled={busy}
        className="border-0 cursor-pointer rounded-full"
        style={{ padding: '7px 0', fontSize: 12, fontWeight: 600, color: '#b2568a', background: '#fbeef4' }}
      >
        {busy ? '读取中…' : '刷新'}
      </button>
    </div>
  );
};

// ── 情侣页调色台面板（2026-08-30 她要求：情侣页面每个颜色/卡片透明度/卡片颜色/文字颜色可调 + 命名保存预设） ──
const CP_LABELS: Record<string, string> = {
  bg: '渐变上端', bgMid: '渐变中段', bgDeep: '渐变下端',
  deep: '深粉/选中', soft: '浅粉底', border: '描边',
  text: '正文', muted: '弱文字', faint: '更弱文字',
  card: '卡片色', glass: '玻璃条',
};

const CouplePalettePanel: React.FC = () => {
  const { addToast } = useOS();
  const paletteStore = useCouplePaletteStore();
  const [presetName, setPresetName] = useState('');
  return (
    <>
      <div style={{ fontSize: 11, color: '#9a7a8a', lineHeight: 1.6 }}>首屏 + 首屏以下的颜色都能改，改完即时生效；主粉色在「皮肤颜色」里改。</div>
      <div className="grid grid-cols-4 gap-1.5">
        {COUPLE_PALETTE_KEYS.map((key) => (
          <div key={key} className="flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5" style={{ background: '#fff5f9' }}>
            <span style={{ fontSize: 10, color: '#9a7a8a' }}>{CP_LABELS[key]}</span>
            <input
              type="color"
              value={paletteStore.palette?.[key] ?? COUPLE_PALETTE_DEFAULTS[key]}
              onChange={(e) => setCouplePalette({ [key]: e.target.value })}
              className="w-7 h-7 rounded-md cursor-pointer"
              style={{ border: '1px solid rgba(0,0,0,0.08)', background: 'transparent' }}
              aria-label={`${CP_LABELS[key]}调色`}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div>
          <div style={{ fontSize: 12, color: '#3a2a33' }}>卡片透明度</div>
          <div style={{ fontSize: 10, color: '#b0909c' }}>白卡/气泡的透明度，滑低能看到后面的背景</div>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="range" min={20} max={100} step={5}
            value={Number(paletteStore.palette?.cardAlpha ?? CARD_ALPHA_DEFAULT)}
            onChange={(e) => setCouplePalette({ cardAlpha: e.target.value })}
            style={{ width: 90 }}
          />
          <span style={{ fontSize: 11, color: '#9a7a8a', fontVariantNumeric: 'tabular-nums' }}>{paletteStore.palette?.cardAlpha ?? CARD_ALPHA_DEFAULT}%</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => { resetCouplePalette(); addToast('情侣页配色已恢复默认', 'success'); }}
        className="border-0 cursor-pointer rounded-full self-start"
        style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#9a7a8a', background: '#fff5f9' }}
      >
        恢复默认
      </button>
      {/* 预设（2026-08-30）：当前配色存成命名预设，随时载入/删除 */}
      <div className="flex flex-col gap-2" style={{ borderTop: '1px dashed #f2d3e0', paddingTop: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#3a2a33' }}>预设</div>
        <div className="flex items-center gap-2">
          <input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { if (saveCouplePreset(presetName)) { addToast(`预设「${presetName.trim()}」已保存`, 'success'); setPresetName(''); } else addToast('先调几样颜色再存', 'info'); } }}
            placeholder="给这套配色起个名"
            style={{ flex: 1, border: '1.5px solid #f2d3e0', background: '#fdf4f8', borderRadius: 10, padding: '7px 10px', fontSize: 12, color: '#3a2a33', outline: 'none' }}
          />
          <button
            type="button"
            onClick={() => { if (saveCouplePreset(presetName)) { addToast(`预设「${presetName.trim()}」已保存`, 'success'); setPresetName(''); } else addToast('先调几样颜色再存', 'info'); }}
            className="border-0 cursor-pointer rounded-full"
            style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#fff', background: 'var(--cs-accent, #f0a8c0)' }}
          >
            保存当前配色
          </button>
        </div>
        {paletteStore.presets.length === 0 && (
          <div style={{ fontSize: 11, color: '#b0909c' }}>还没有预设——调好一套颜色，存个名字，下次一键载入</div>
        )}
        {paletteStore.presets.map((p) => (
          <div key={p.name} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: '#fff5f9' }}>
            <span style={{ fontSize: 12, color: '#3a2a33' }}>{p.name}</span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { loadCouplePreset(p.name); addToast(`已载入「${p.name}」`, 'success'); }}
                className="border-0 cursor-pointer rounded-full"
                style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600, color: '#fff', background: 'var(--cs-accent, #f0a8c0)' }}
              >
                载入
              </button>
              <button
                type="button"
                aria-label={`删除预设 ${p.name}`}
                onClick={() => { deleteCouplePreset(p.name); addToast(`已删除「${p.name}」`, 'info'); }}
                className="border-0 cursor-pointer rounded-full"
                style={{ padding: '5px 9px', fontSize: 11, color: '#9a7a8a', background: 'transparent' }}
              >
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>
    </>
  );
};

const CoupleBeauty: React.FC = () => {
  const { addToast } = useOS();
  const [beauty, setBeauty] = useState<CoupleBeauty>(loadCoupleBeauty);

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

  const pick = async (key: BeautyKey, file: File) => {
    try {
      const ref = await putImageBlob(await shrinkImage(file, SLOT_MAX_W[key]));
      const next = { ...beauty, [key]: ref };
      setBeauty(next);
      saveCoupleBeauty(next);
      addToast(PICK_LABELS[key], 'success');
    } catch {
      addToast('图片保存失败，请重试', 'error');
    }
  };
  const reset = (key: BeautyKey) => {
    const next = { ...beauty, [key]: undefined };
    setBeauty(next);
    saveCoupleBeauty(next);
    addToast('已恢复默认', 'info');
  };
  const setAccent = (accent?: string) => {
    const next = { ...beauty, accent };
    setBeauty(next);
    saveCoupleBeauty(next);
    addToast(accent ? '皮肤颜色已更新' : '已恢复默认肤色', 'info');
  };

  return (
    <div className="absolute inset-0 overflow-y-auto" style={{ background: '#ffe3ef', paddingTop: 'calc(var(--chrome-top, 0px) + 16px)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 96px)', ...themeVars }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#3a2a33', padding: '0 24px 16px' }}>设置</div>
      <div className="flex flex-col gap-3 px-5">
        {/* 每类折叠（2026-08-30 她要求：设置页点开再展开，别一长列） */}
        <BeautyFold title="数据备份">
          <DataBackupPanel scope="all" />
        </BeautyFold>

        <BeautyFold title="情侣空间 · 图片与皮肤色">
          <Slot label="宣告区背景图" desc="头像后面的那块大背景，支持本地图片替换" value={beauty.headerBg} onPick={(f) => pick('headerBg', f)} onReset={() => reset('headerBg')} />
          <Slot label="胶囊条背景图" desc="歌曲卡片下方的横向胶囊条" value={beauty.capsuleBg} onPick={(f) => pick('capsuleBg', f)} onReset={() => reset('capsuleBg')} />
          <Slot label="Nox 头像" desc="同时复用到 Nox 的单间左上角" value={beauty.avatarNox} onPick={(f) => pick('avatarNox', f)} onReset={() => reset('avatarNox')} />
          <Slot label="Angelica 头像" desc="宣告区右边的圆形头像" value={beauty.avatarAngelica} onPick={(f) => pick('avatarAngelica', f)} onReset={() => reset('avatarAngelica')} />
          <Slot label="情侣空间背景图" desc="整个情侣空间页面背景（默认粉 #ffe3ef）" value={beauty.coupleBg} onPick={(f) => pick('coupleBg', f)} onReset={() => reset('coupleBg')} />
          {/* 皮肤颜色：爱心固定粉色，其余粉色元素跟随此颜色 */}
          <div className="flex flex-col gap-3" style={{ borderTop: '1px dashed #f2d3e0', paddingTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#3a2a33' }}>皮肤颜色</div>
            <div style={{ fontSize: 11, color: '#9a7a8a' }}>爱心图标固定粉色，其余粉色元素跟随此颜色</div>
            <div className="flex items-center gap-2.5 flex-wrap">
              {ACCENT_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`肤色 ${c}`}
                  onClick={() => setAccent(c)}
                  className="rounded-full border-0 cursor-pointer transition-transform active:scale-90"
                  style={{ width: 28, height: 28, background: c, border: (beauty.accent ?? DEFAULT_ACCENT) === c ? '2px solid #3a2a33' : '2px solid rgba(0,0,0,0.08)' }}
                />
              ))}
              <label className="cursor-pointer flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--cs-deep, #c25a82)', fontWeight: 600 }}>
                自定义
                <input type="color" value={beauty.accent ?? DEFAULT_ACCENT} onChange={(e) => setAccent(e.target.value)} className="hidden" />
                <span className="rounded-full overflow-hidden" style={{ width: 26, height: 26, background: beauty.accent ?? DEFAULT_ACCENT, border: '1px solid rgba(0,0,0,0.1)', display: 'inline-block' }} />
              </label>
              <button type="button" aria-label="恢复默认肤色" onClick={() => setAccent(undefined)} className="border-0 bg-transparent cursor-pointer" style={{ color: '#b0909c' }}>
                <ArrowCounterClockwise style={{ width: 16, height: 16 }} />
              </button>
            </div>
          </div>
        </BeautyFold>

        <BeautyFold title="情侣页配色（调色台）">
          <CouplePalettePanel />
        </BeautyFold>

        <BeautyFold title="Nox 的单间">
          <Slot label="大圆照片" desc="主页上部的大圆形照片框（专辑/照片墙后续接入）" value={beauty.homeDisc} onPick={(f) => pick('homeDisc', f)} onReset={() => reset('homeDisc')} />
          <Slot label="单间背景图" desc="Nox 的单间整页背景（默认深蓝渐变）" value={beauty.homeBg} onPick={(f) => pick('homeBg', f)} onReset={() => reset('homeBg')} />
        </BeautyFold>

        <BeautyFold title="提示词管理">
          <PromptSettings />
          <div style={{ fontSize: 11, color: '#9a7a8a', lineHeight: 1.6 }}>美化小助手的提示词不在这一页——去小助手 App 的齿轮 ⚙ 里改（美化分类）。</div>
        </BeautyFold>

        <BeautyFold title="日记设置">
          <DiarySettings />
        </BeautyFold>

        <BeautyFold title="挂载到角色">
          <MountSettings />
        </BeautyFold>

        <BeautyFold title="留言板批阅输入">
          <BoardInputPreview />
        </BeautyFold>
      </div>
    </div>
  );
};

export default CoupleBeauty;

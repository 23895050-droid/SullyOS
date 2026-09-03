import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, ArrowClockwise, WarningCircle, Trash, Plus, X, PencilSimple, Scroll } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import {
  loadImageGenSettings,
  saveImageGenSettings,
  addImageGenPreset,
  deleteImageGenPreset,
  DEFAULT_IMAGE_GEN_SETTINGS,
} from '../../utils/imageGenStorage';
import { loadImageGenLogs, clearImageGenLogs, addImageGenLog, type ImageGenLogEntry } from '../../utils/imageGenLog';
import type { ImageGenerationSettings, ImageGenPreset } from '../../types';

const SIZE_OPTIONS = ['auto', '1024x1024', '1024x1536', '1536x1024', '1792x1024', '1024x1792'];
const QUALITY_OPTIONS = ['auto', 'low', 'medium', 'high'];
const SIZE_LABELS: Record<string, string> = { auto: '自动', '1024x1024': '1024×1024 (1:1)', '1024x1536': '1024×1536 (3:4)', '1536x1024': '1536×1024 (3:2)', '1792x1024': '1792×1024 (16:9)', '1024x1792': '1024×1792 (9:16)' };
const QUALITY_LABELS: Record<string, string> = { auto: '自动', low: '低', medium: '中', high: '高' };

const TEST_PRESET_NAME = '测试专用';
const TEST_PRESET_PROMPT = '白色陶瓷咖啡杯放在木质桌面上，柔和自然光从窗户斜照进来，浅景深，暖色调，真实照片质感';

/* ── 折叠区块 ── */
const ImageGenSection: React.FC<{
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}> = ({ icon, title, badge, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="bg-white/80 rounded-3xl p-5 shadow-sm border border-white/50">
      <div className={`flex items-center justify-between gap-2 ${open ? 'mb-4' : ''}`}>
        <button type="button" onClick={() => setOpen(v => !v)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          {icon}
          <h2 className="text-sm font-semibold text-slate-600 tracking-wider truncate">{title}</h2>
          {badge}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={`w-3 h-3 text-slate-300 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </div>
      {open && children}
    </section>
  );
};

/* ── 图片预览弹窗 ── */
const ImagePreviewModal: React.FC<{ src: string; onClose: () => void }> = ({ src, onClose }) => (
  <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
    <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
      <button onClick={onClose} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center text-slate-500 hover:text-slate-700 z-10">
        <X size={16} />
      </button>
      <img src={src} alt="测试结果" className="max-w-[90vw] max-h-[85vh] rounded-2xl shadow-2xl object-contain" />
    </div>
  </div>
);

/* ── 确保测试预设存在 ── */
function ensureTestPreset(settings: ImageGenerationSettings): ImageGenerationSettings {
  if (!settings.presets.some(p => p.name === TEST_PRESET_NAME)) {
    settings.presets.unshift({
      id: 'builtin-test',
      name: TEST_PRESET_NAME,
      prompt: TEST_PRESET_PROMPT,
    });
  }
  return settings;
}

const ImageGenSettings: React.FC = () => {
  const { addToast } = useOS();
  const [settings, setSettings] = useState<ImageGenerationSettings>(() => ensureTestPreset(loadImageGenSettings()));
  const [isTesting, setIsTesting] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [newPresetName, setNewPresetName] = useState('');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingPresetPrompt, setEditingPresetPrompt] = useState('');
  const [showPresetInput, setShowPresetInput] = useState(false);
  const [logs, setLogs] = useState<ImageGenLogEntry[]>(() => loadImageGenLogs());

  const refreshLogs = useCallback(() => setLogs(loadImageGenLogs()), []);

  // 首次加载时，如果没有选默认预设，自动选测试专用
  useEffect(() => {
    const s = loadImageGenSettings();
    if (!s.defaultPresetId && s.presets.length > 0) {
      s.defaultPresetId = s.presets[0].id;
      saveImageGenSettings(s);
    }
    setSettings(s);
  }, []);

  // 确保总有一个选中
  useEffect(() => {
    if (!settings.defaultPresetId && settings.presets.length > 0) {
      persist({ ...settings, defaultPresetId: settings.presets[0].id });
    }
  }, []);

  const generatingRef = React.useRef(false);

  const activePreset = useMemo(() => settings.presets.find(p => p.id === settings.defaultPresetId) || null, [settings.presets, settings.defaultPresetId]);

  const persist = useCallback((next: ImageGenerationSettings) => {
    setSettings(next);
    saveImageGenSettings(next);
  }, []);

  const update = useCallback((patch: Partial<ImageGenerationSettings>) => {
    persist({ ...settings, ...patch });
  }, [persist, settings]);

  /* ── 测试生图 ── */
  const testGeneration = async () => {
    if (generatingRef.current) return; // 防重复点击
    if (!settings.apiKey.trim() || !settings.baseUrl.trim() || !settings.model.trim()) {
      addToast('请先填写接口地址、密钥和模型名', 'error');
      return;
    }
    generatingRef.current = true;
    setIsTesting(true);
    const prompt = (activePreset?.prompt?.trim()) ? activePreset.prompt : TEST_PRESET_PROMPT;
    const url = settings.baseUrl.trim().replace(/\/+$/, '') + '/images/generations';
    const t0 = performance.now();
    try {
      const body: Record<string, any> = { model: settings.model, prompt, n: 1 };
      if (settings.size !== 'auto') body.size = settings.size;
      if (settings.quality !== 'auto') body.quality = settings.quality;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);

      const b64 = data.data?.[0]?.b64_json || data.b64_json || data.b64 || data.base64;
      const imgUrl = data.data?.[0]?.url || data.url || data.image_url;
      if (b64) {
        const mime = data.data?.[0]?.mime_type || 'image/png';
        setPreviewSrc(`data:${mime};base64,${b64}`);
      } else if (imgUrl) {
        setPreviewSrc(imgUrl);
      } else {
        throw new Error('API 返回中没有找到图片字段，请检查模型名是否正确。');
      }
      addImageGenLog({
        endpoint: 'generations', url, model: settings.model, prompt,
        size: settings.size, quality: settings.quality, hasReference: false,
        ok: true, status: res.status,
        revisedPrompt: data.data?.[0]?.revised_prompt || data.revised_prompt,
        durationMs: Math.round(performance.now() - t0),
        mimeType: data.data?.[0]?.mime_type || 'image/png',
      });
      refreshLogs();
      addToast('测试成功！图片已生成 ✨', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addImageGenLog({
        endpoint: 'generations', url, model: settings.model, prompt,
        size: settings.size, quality: settings.quality, hasReference: false,
        ok: false, status: 0, error: msg,
        durationMs: Math.round(performance.now() - t0),
      });
      refreshLogs();
      addToast(`生图失败：${msg}`, 'error');
    } finally {
      setIsTesting(false);
      generatingRef.current = false;
    }
  };

  /* ── 预设操作 ── */
  const handleAddPreset = () => {
    if (!newPresetName.trim()) return;
    addImageGenPreset(newPresetName.trim(), '');
    const updated = loadImageGenSettings();
    setSettings(updated);
    setNewPresetName('');
    setShowPresetInput(false);
  };

  const handleDeletePreset = (id: string) => {
    deleteImageGenPreset(id);
    setSettings(loadImageGenSettings());
  };

  const selectPreset = (id: string) => {
    persist({ ...settings, defaultPresetId: id });
  };

  const startEditPreset = (p: ImageGenPreset) => {
    setEditingPresetId(p.id);
    setEditingPresetPrompt(p.prompt);
  };

  const saveEditPreset = (id: string) => {
    const updated = settings.presets.map(p => p.id === id ? { ...p, prompt: editingPresetPrompt } : p);
    persist({ ...settings, presets: updated });
    setEditingPresetId(null);
    setEditingPresetPrompt('');
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── 总开关 ── */}
      <div className="bg-white/80 backdrop-blur-xl rounded-3xl px-5 py-4 shadow-sm border border-white/50 flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-xs font-bold text-slate-700">启用自动生图</div>
          <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">角色输出 [photo:...] 标签时自动调用生图 API。前缀预设会自动拼接到提示词前面。</p>
        </div>
        <button
          onClick={() => update({ enabled: !settings.enabled })}
          className={`w-11 h-6 rounded-full transition-colors shrink-0 ${settings.enabled ? 'bg-sky-500' : 'bg-slate-300'}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.enabled ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
        </button>
      </div>

      {/* ── 默认预设选择 ── */}
      <div className="bg-white/80 backdrop-blur-xl rounded-3xl px-5 py-4 shadow-sm border border-white/50 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">自动生图默认预设</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">日常 (非自拍)</label>
            <select
              value={settings.defaultPresetId || ''}
              onChange={e => persist({ ...settings, defaultPresetId: e.target.value || null })}
              className="w-full text-xs px-3 py-2 rounded-xl bg-white/60 border border-slate-200 outline-none"
            >
              <option value="">不使用预设</option>
              {settings.presets.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-pink-600 uppercase tracking-wider">自拍 (selfie)</label>
            <select
              value={settings.defaultSelfiePresetId || ''}
              onChange={e => persist({ ...settings, defaultSelfiePresetId: e.target.value || null })}
              className="w-full text-xs px-3 py-2 rounded-xl bg-white/60 border border-slate-200 outline-none"
            >
              <option value="">不使用预设</option>
              {settings.presets.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── API 配置 ── */}
      <ImageGenSection
        icon={<Image size={20} weight="fill" className="text-sky-500" />}
        title="生图 API 配置"
        badge={settings.apiKey && settings.model ? <span className="text-[9px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full">已配置</span> : undefined}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">接口地址</label>
            <input type="url" value={settings.baseUrl} onChange={e => update({ baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="w-full text-xs px-3 py-2 rounded-xl bg-white/60 border border-slate-200 outline-none focus:border-sky-400" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">密钥</label>
            <input type="password" value={settings.apiKey} onChange={e => update({ apiKey: e.target.value })}
              placeholder="sk-..."
              className="w-full text-xs px-3 py-2 rounded-xl bg-white/60 border border-slate-200 outline-none focus:border-sky-400" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">模型名</label>
            <input type="text" value={settings.model} onChange={e => update({ model: e.target.value })}
              placeholder="dall-e-3 / gpt-image-2"
              className="w-full text-xs px-3 py-2 rounded-xl bg-white/60 border border-slate-200 outline-none focus:border-sky-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">全局尺寸</label>
              <select value={settings.size} onChange={e => update({ size: e.target.value })}
                className="w-full text-xs px-3 py-2 rounded-xl bg-white/60 border border-slate-200 outline-none">
                {SIZE_OPTIONS.map(o => <option key={o} value={o}>{SIZE_LABELS[o]}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">质量</label>
              <select value={settings.quality} onChange={e => update({ quality: e.target.value })}
                className="w-full text-xs px-3 py-2 rounded-xl bg-white/60 border border-slate-200 outline-none">
                {QUALITY_OPTIONS.map(o => <option key={o} value={o}>{QUALITY_LABELS[o]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">日常比例 <span className="text-amber-500">(非自拍)</span></label>
              <select value={settings.landscapeSize} onChange={e => update({ landscapeSize: e.target.value })}
                className="w-full text-xs px-3 py-2 rounded-xl bg-white/60 border border-slate-200 outline-none">
                <option value="">跟随全局</option>
                {SIZE_OPTIONS.map(o => <option key={o} value={o}>{SIZE_LABELS[o] || o}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">自拍比例 <span className="text-pink-500">(selfie)</span></label>
              <select value={settings.selfieSize} onChange={e => update({ selfieSize: e.target.value })}
                className="w-full text-xs px-3 py-2 rounded-xl bg-white/60 border border-slate-200 outline-none">
                <option value="">跟随全局</option>
                {SIZE_OPTIONS.map(o => <option key={o} value={o}>{SIZE_LABELS[o] || o}</option>)}
              </select>
            </div>
          </div>
          <button onClick={testGeneration} disabled={isTesting}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 text-white text-xs font-bold active:scale-95 transition-transform disabled:opacity-50">
            {isTesting ? <ArrowClockwise size={14} className="animate-spin" /> : <Image size={14} />}
            {isTesting ? '生成中…' : '测试生图'}
          </button>
        </div>
      </ImageGenSection>

      {/* ── 前缀提示词预设 ── */}
      <ImageGenSection
        icon={<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>}
        title="前缀提示词预设"
        badge={<span className="text-[9px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full">{settings.presets.length}个</span>}
      >
        <div className="flex flex-col gap-3">
          <p className="text-[10px] text-slate-400 leading-relaxed">
            前缀提示词会自动拼接在生图描述前面，用于统一风格。点击某个预设 → 设为默认。
          </p>

          {/* 新建预设 */}
          {showPresetInput ? (
            <div className="flex gap-1">
              <input value={newPresetName} onChange={e => setNewPresetName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddPreset(); }}
                placeholder="预设名称" autoFocus
                className="flex-1 text-[10px] px-2.5 py-1.5 rounded-lg bg-white/60 border border-violet-300 outline-none" />
              <button onClick={handleAddPreset}
                className="text-[10px] font-bold text-white bg-violet-500 px-2.5 py-1.5 rounded-lg">保存</button>
              <button onClick={() => { setShowPresetInput(false); setNewPresetName(''); }}
                className="text-[10px] text-slate-400 px-2 py-1.5">取消</button>
            </div>
          ) : (
            <button onClick={() => setShowPresetInput(true)}
              className="flex items-center justify-center gap-1 w-full py-2 rounded-xl border border-dashed border-violet-300 text-[10px] font-bold text-violet-500 hover:bg-violet-50 active:scale-95 transition-all">
              <Plus size={12} /> 新建预设
            </button>
          )}

          {/* 预设列表 */}
          {settings.presets.length === 0 && (
            <p className="text-[10px] text-slate-300 text-center py-2">还没有预设，在上方新建一个吧。</p>
          )}
          {settings.presets.map(p => (
            <div key={p.id} className={`rounded-xl p-3 transition-colors ${p.id === settings.defaultPresetId ? 'bg-violet-50 border border-violet-200' : 'bg-slate-50 border border-transparent'}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-xs font-bold truncate ${p.id === settings.defaultPresetId ? 'text-violet-700' : 'text-slate-600'}`}>{p.name}</span>
                  {p.id === settings.defaultPresetId && (
                    <span className="text-[8px] bg-violet-500 text-white px-1.5 py-0.5 rounded-full font-bold shrink-0">使用中</span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {p.id !== settings.defaultPresetId && (
                    <button onClick={() => selectPreset(p.id)}
                      className="text-[9px] font-bold text-violet-500 bg-violet-100 px-1.5 py-0.5 rounded-full">使用</button>
                  )}
                  <button onClick={() => startEditPreset(p)} className="text-slate-300 hover:text-violet-500">
                    <PencilSimple size={11} />
                  </button>
                  <button onClick={() => handleDeletePreset(p.id)} className="text-slate-300 hover:text-red-400">
                    <Trash size={11} />
                  </button>
                </div>
              </div>
              {editingPresetId === p.id ? (
                <div className="flex gap-1">
                  <textarea value={editingPresetPrompt} onChange={e => setEditingPresetPrompt(e.target.value)} rows={3}
                    className="flex-1 text-[10px] px-2.5 py-1.5 rounded-lg bg-white border border-violet-300 outline-none resize-none" />
                  <button onClick={() => saveEditPreset(p.id)}
                    className="text-[10px] font-bold text-white bg-violet-500 px-2.5 py-1.5 rounded-lg shrink-0">保存</button>
                </div>
              ) : (
                <button onClick={() => startEditPreset(p)}
                  className="text-left w-full text-[10px] text-slate-400 px-2 py-1 rounded-lg hover:bg-white/60 truncate transition-colors">
                  {p.prompt || '点击编辑前缀提示词…'}
                </button>
              )}
            </div>
          ))}
        </div>
      </ImageGenSection>

      {/* ── 相机同步 ── */}
      <ImageGenSection
        icon={<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><path d="M12 2v4"/><path d="m16.24 7.76-2.12 2.12"/><path d="m5.64 7.76 2.12 2.12"/><circle cx="12" cy="17" r="5"/><path d="M12 22v-4"/></svg>}
        title="相机同步"
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-700">相机活动同步到聊天</div>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">开启后，相机 App 的操作会自动注入聊天上下文，角色不会失忆。</p>
          </div>
          <button
            onClick={() => update({ syncCameraToChat: !settings.syncCameraToChat })}
            className={`w-11 h-6 rounded-full transition-colors shrink-0 ${settings.syncCameraToChat ? 'bg-sky-500' : 'bg-slate-300'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.syncCameraToChat ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
          </button>
        </div>
      </ImageGenSection>

      {/* ── 生图日志 ── */}
      <ImageGenSection
        icon={<Scroll size={20} className="text-slate-500" />}
        title="生图日志"
        badge={logs.length > 0 ? <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{logs.length}条</span> : undefined}
      >
        <div className="flex flex-col gap-2">
          {logs.length === 0 && (
            <p className="text-[10px] text-slate-300 text-center py-4">还没有生图记录。测试一次生图或从聊天触发后会出现在这里。</p>
          )}
          {logs.slice(0, 20).map(log => (
            <details key={log.id} className={`rounded-xl border text-left text-xs ${log.ok ? 'border-emerald-200 bg-emerald-50/30' : 'border-red-200 bg-red-50/30'}`}>
              <summary className="px-3 py-2 flex items-center gap-2 cursor-pointer select-none">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${log.ok ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                <span className="font-bold text-slate-600 shrink-0">{log.ok ? '✓' : '✗'}</span>
                <code className="text-[10px] text-slate-500 bg-white/60 px-1 rounded">{log.endpoint}</code>
                <span className="truncate text-slate-400 flex-1 min-w-0">{log.prompt.slice(0, 40)}{log.prompt.length > 40 ? '…' : ''}</span>
                <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">{new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </summary>
              <div className="px-3 pb-3 space-y-1.5 border-t border-slate-100/50 pt-2">
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  <div><span className="text-slate-400">模型：</span><span className="text-slate-600 font-mono text-[10px]">{log.model}</span></div>
                  <div><span className="text-slate-400">耗时：</span><span className="text-slate-600">{log.durationMs != null ? `${log.durationMs}ms` : '—'}</span></div>
                  {log.size && log.size !== 'auto' && <div><span className="text-slate-400">尺寸：</span><span className="text-slate-600">{log.size}</span></div>}
                  {log.mimeType && <div><span className="text-slate-400">格式：</span><span className="text-slate-600 text-[10px]">{log.mimeType}</span></div>}
                  {log.imageBytes != null && <div><span className="text-slate-400">大小：</span><span className="text-slate-600">{log.imageBytes > 1024 ? `${(log.imageBytes / 1024).toFixed(1)}KB` : `${log.imageBytes}B`}</span></div>}
                  {log.revisedPrompt && <div className="col-span-2"><span className="text-slate-400">改写：</span><span className="text-slate-500 text-[10px]">{log.revisedPrompt}</span></div>}
                </div>
                <div className="pt-1">
                  <span className="text-[10px] text-slate-400">Prompt：</span>
                  <p className="text-[10px] text-slate-600 whitespace-pre-wrap bg-white/50 rounded-lg p-1.5 mt-0.5 leading-relaxed max-h-20 overflow-y-auto">{log.prompt}</p>
                </div>
                {!log.ok && log.error && (
                  <div className="pt-1">
                    <span className="text-[10px] text-red-400 font-bold">错误：</span>
                    <p className="text-[10px] text-red-500 bg-red-100/50 rounded-lg p-1.5 mt-0.5 leading-relaxed max-h-16 overflow-y-auto">{log.error}</p>
                  </div>
                )}
              </div>
            </details>
          ))}
          {logs.length > 0 && (
            <button onClick={() => { clearImageGenLogs(); setLogs([]); addToast('日志已清空', 'info'); }}
              className="flex items-center justify-center gap-1 w-full py-1.5 text-[10px] text-slate-400 hover:text-red-400 active:scale-95 transition-all">
              <Trash size={10} /> 清空日志
            </button>
          )}
        </div>
      </ImageGenSection>

      {/* ── 测试结果弹窗 ── */}
      {previewSrc && <ImagePreviewModal src={previewSrc} onClose={() => setPreviewSrc(null)} />}

      {/* ── 正在生成悬浮胶囊 ── */}
      {isTesting && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[500] pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/95 backdrop-blur-xl shadow-xl border border-sky-200 animate-in slide-in-from-bottom-2">
            <ArrowClockwise size={14} className="animate-spin text-sky-500" />
            <span className="text-xs font-bold text-sky-600">正在生成图片…</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageGenSettings;

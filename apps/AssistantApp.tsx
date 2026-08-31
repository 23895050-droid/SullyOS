// 小助手（2026-08-30 新建；当天两轮大改）——工作向小 AI。
// - 不是美化专属：当前工作 = 美化各页面 CSS 预设，以后可能做别的活（工作模式=加号面板里选）
// - 加号面板 = 正常聊天软件那种：点加号在输入行上方展开（模块 → 页面 → 卡片 三级选），不遮全屏
// - 白框 CSS 编辑：对标主聊天「白框自定义」——底部白卡弹层，边写边实时生效
// - 专属 API 槽（不配置不调用、不回退主 API），max_tokens 16000（一次输出很多，含代码）
// - 自己的系统提示词：轻量人设（可编辑）+ 工作规矩 + 模块/页面/卡片知识（promptRegistry「美化助手」分类，改入口在齿轮里）
// - 消息长按：复制 / 修改（自己的）/ 删除 / 多选批量删除；回复里 ```css 代码块带 复制/收藏/应用
// - 调色台（她 2026-08-30：紫色受不了）：主色/辅色/文字色在设置里随便改
import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, GearSix, PaperPlaneTilt, Copy, PaintBrush, Trash, Plus, PencilSimple,
  ImageSquare, BookmarkSimple, DownloadSimple, X, CaretDown, CheckSquare, FolderSimple, Stop,
  FileText, CaretRight,
} from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import { getPrompt, savePrompt, resetPrompt, isPromptOverridden, getPromptEntries } from '../utils/promptRegistry';
import { putImageBlob, useBlobRefUrl, deleteBlobRef } from '../utils/blobRef';
import { normalizeApiBaseUrl, normalizeApiCredential, normalizeApiModel } from '../utils/apiConfigNormalize';
import type { ApiPreset } from '../types';
import { setCssGlobal, setCssPage, getMusicStore } from './couple/musicStore';
import {
  useAssistant, getAssistant, appendAssistantMessages, editAssistantMessage, deleteAssistantMessage,
  deleteAssistantMessages, clearAssistantMessages, saveAssistantApi, saveAssistantProfile,
  saveAssistantTheme, resetAssistantTheme, saveAssistantCssSelf,
  addAssistantFavorite, renameAssistantFavorite, updateAssistantFavoriteCss, deleteAssistantFavorite, buildFavoritesExportText,
  ensureAssistantSession, newAssistantSession, switchAssistantSession, deleteAssistantSession,
  setAssistantCodeFold,
  saveAssistantThemePreset, loadAssistantThemePreset, deleteAssistantThemePreset,
  type AssistantMsg,
} from '../utils/beautyAssistantStore';

// ── 工作模式树（2026-08-30 重构）：模块 → 页面 → 卡片。
//    页面 key 同时是 CSS 槽位：'base' = cssGlobal、'self' = 小助手自己页面（cssSelf），其余 = musicStore.cssPages[key]。
//    卡片 = 更细的知识焦点（只影响 prompt 里的「本次目标」，不影响 CSS 槽位）。 ──
const MODULES = [
  {
    key: 'music', label: '音乐 App',
    pages: [
      { key: 'base', label: '音乐基础', desc: '全局变量与玻璃', promptLabel: '美化助手-音乐基础',
        cards: [{ key: 'whole', label: '整体' }] },
      { key: 'player', label: '播放页', desc: '唱片·歌词·播控', promptLabel: '美化助手-播放页',
        cards: [
          { key: 'whole', label: '整体' }, { key: 'topbar', label: '顶部导航' },
          { key: 'vinyl', label: '黑胶唱片' }, { key: 'title', label: '歌名区' },
          { key: 'lyric', label: '歌词区' }, { key: 'progress', label: '进度条' },
          { key: 'controls', label: '播控区' }, { key: 'together', label: '一起听区' },
        ] },
      { key: 'chat', label: '聊歌页', desc: '气泡·输入·面板', promptLabel: '美化助手-聊歌页',
        cards: [
          { key: 'whole', label: '整体' }, { key: 'header', label: '头部' },
          { key: 'bubble', label: '气泡' }, { key: 'voice', label: '语音条' },
          { key: 'input', label: '输入行' }, { key: 'panel', label: '上下文面板' },
          { key: 'bg', label: '背景层' },
        ] },
      { key: 'miniplayer', label: '悬浮窗', desc: '小球与展开条', promptLabel: '美化助手-悬浮窗',
        cards: [{ key: 'whole', label: '整体' }, { key: 'ball', label: '小球' }, { key: 'bar', label: '展开条' }] },
      { key: 'cards', label: '聊天卡片', desc: '一起听四张卡', promptLabel: '美化助手-聊天卡片',
        cards: [
          { key: 'whole', label: '整体' }, { key: 'invite', label: '邀请卡' },
          { key: 'accept', label: '回应卡' }, { key: 'summary', label: '总结卡' },
          { key: 'chat_summary', label: '聊歌小结卡' },
        ] },
    ],
  },
  {
    key: 'assistant', label: '小助手自身',
    pages: [
      { key: 'self', label: '小助手界面', desc: '顶栏·气泡·代码块', promptLabel: '美化助手-小助手界面',
        cards: [
          { key: 'whole', label: '整体' }, { key: 'header', label: '顶栏' },
          { key: 'bubble', label: '气泡' }, { key: 'code', label: '代码块' },
          { key: 'input', label: '输入行' }, { key: 'plus', label: '加号面板' },
        ] },
    ],
  },
];

type PageKey = 'base' | 'player' | 'chat' | 'miniplayer' | 'cards' | 'self';
type PageDef = { key: string; label: string; desc: string; promptLabel: string; cards: { key: string; label: string }[] };

const ALL_PAGES: PageDef[] = MODULES.flatMap((m) => m.pages.map((p) => ({ ...p })));
const pageOf = (key: string): PageDef => ALL_PAGES.find((p) => p.key === key) ?? ALL_PAGES[1];
const moduleOf = (key: string) => MODULES.find((m) => m.pages.some((p) => p.key === key)) ?? MODULES[0];

// ── 调色台（2026-08-30）：主色/辅色/文字色随便改，缺省回内置粉紫 ──
interface AssistantColors {
  bg: string; bgDeep: string;
  primary: string; accent: string; text: string;
  muted: string; faint: string;
  bubbleUser: string; bubbleAi: string;
}
const buildColors = (theme?: { primary?: string; accent?: string; text?: string }): AssistantColors => {
  const primary = theme?.primary ?? '#c96a8e';
  const accent = theme?.accent ?? '#e3a4bc';
  const text = theme?.text ?? '#3d3340';
  return {
    bg: '#fdf4f8', bgDeep: '#f9ecf2',
    primary, accent, text,
    muted: '#9a8690', faint: '#c9b8c0',
    bubbleUser: `linear-gradient(135deg, ${primary}, ${accent})`,
    bubbleAi: 'rgba(255,255,255,0.85)',
  };
};

/** 把回复文本拆成 文本/代码块 片段 */
const splitCodeBlocks = (text: string): Array<{ type: 'text' | 'code'; content: string }> => {
  const parts: Array<{ type: 'text' | 'code'; content: string }> = [];
  const re = /```([a-zA-Z+]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      const t = text.slice(last, m.index).trim();
      if (t) parts.push({ type: 'text', content: t });
    }
    if (m[2].trim()) parts.push({ type: 'code', content: m[2].trim() });
    last = re.lastIndex;
  }
  if (last < text.length) {
    const t = text.slice(last).trim();
    if (t) parts.push({ type: 'text', content: t });
  }
  return parts;
};

/** 代码块折叠后的文件名（2026-08-31 学上游工作台交付文件）：
 *  取最后一行 /* 改：xxx *\/ 注释里的 xxx（交付规矩已要求这行）；没有就 代码片段 N。 */
const codeFileName = (content: string, ordinal: number): string => {
  const lines = content.split('\n');
  const last = lines[lines.length - 1] ?? '';
  const m = last.match(/\/\*\s*改\s*[:：]\s*(.+?)\s*\*\//);
  const raw = m ? m[1].trim() : '';
  const safe = raw.replace(/[\\/:*?"<>|]/g, '').trim();
  return (safe || `代码片段 ${ordinal + 1}`).slice(0, 30);
};

const useLongPress = (onLong: () => void) => {
  const timer = useRef<number | null>(null);
  const clear = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => clear, []);
  return {
    onTouchStart: () => { timer.current = window.setTimeout(onLong, 500); },
    onTouchEnd: clear,
    onTouchMove: clear,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); onLong(); },
  };
};

const AssistantApp: React.FC = () => {
  const { closeApp, addToast, userProfile, apiPresets } = useOS();
  const store = useAssistant();
  const avatarUrl = useBlobRefUrl(store.avatarRef);
  const colors = buildColors(store.theme);

  const [mode, setMode] = useState<PageKey>('player');
  const [card, setCard] = useState<string>('whole');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [showPlus, setShowPlus] = useState(false);
  const [showFavs, setShowFavs] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [showCssEditor, setShowCssEditor] = useState(false);
  const [cssDraft, setCssDraft] = useState('');
  const [favNameDraft, setFavNameDraft] = useState('');
  const [favTarget, setFavTarget] = useState<string | null>(null); // 待收藏的 css
  // 收藏夹展开编辑（2026-08-31 她要求）：点开单独看代码，自由输入保存
  const [favOpenId, setFavOpenId] = useState<string | null>(null);
  const [favDraft, setFavDraft] = useState({ name: '', css: '' });
  const [profileForm, setProfileForm] = useState({ name: store.name, persona: store.persona });
  const [apiForm, setApiForm] = useState({ baseUrl: store.api?.baseUrl ?? '', apiKey: store.api?.apiKey ?? '', model: store.api?.model ?? '' });
  const [apiPresetId, setApiPresetId] = useState<string | null>(null);
  // 调色台预设（2026-08-31 她要求）：存命名预设，随时换回来
  const [showPresetSave, setShowPresetSave] = useState(false);
  const [presetNameDraft, setPresetNameDraft] = useState('');

  // API 预设池联通（她 2026-08-30 要求）：和原版设置页一样——点预设胶囊填表，点「保存」后生效，
  // 不用每次手填。以后凡是要填 API 的地方都接预设池。
  const loadApiPreset = (preset: ApiPreset) => {
    setApiPresetId(preset.id);
    setApiForm({
      baseUrl: normalizeApiBaseUrl(preset.config.baseUrl),
      apiKey: normalizeApiCredential(preset.config.apiKey),
      model: normalizeApiModel(preset.config.model),
    });
    addToast(`已载入预设：${preset.name}；点「保存」后生效`, 'info');
  };
  const [menuMsg, setMenuMsg] = useState<AssistantMsg | null>(null);
  const [editMsg, setEditMsg] = useState<AssistantMsg | null>(null);
  const [editText, setEditText] = useState('');
  // 多选批量删除（2026-08-30 她要求，对标主聊天 selectionMode）
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const userName = userProfile?.name || '你';
  const pageInfo = pageOf(mode);
  const moduleInfo = moduleOf(mode);
  const cardInfo = pageInfo.cards.find((c) => c.key === card) ?? pageInfo.cards[0];

  // 任务存档（2026-08-30）：消息按当前任务过滤；任务按最近动过排序
  const activeSession = store.sessions.find((s) => s.id === store.activeSessionId) ?? null;
  const sessionMessages = store.messages.filter((m) => m.sessionId === store.activeSessionId);
  const sortedSessions = [...store.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const sessionMeta = (id: string) => {
    const msgs = store.messages.filter((m) => m.sessionId === id);
    return { count: msgs.length };
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [store.messages.length, streaming, store.activeSessionId]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // 小助手自己页面的 CSS 注入（2026-08-30：美化他也可以写他自己）
  useEffect(() => {
    const css = store.cssSelf;
    let el = document.getElementById('as-css-preset') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'as-css-preset';
      document.head.appendChild(el);
    }
    el.textContent = css;
    if (!css && el.parentNode) el.parentNode.removeChild(el);
    return () => {
      const tag = document.getElementById('as-css-preset');
      if (tag && tag.textContent === css && tag.parentNode) tag.parentNode.removeChild(tag);
    };
  }, [store.cssSelf]);

  // 长按菜单（事件总线）
  useEffect(() => {
    const onMenu = (e: Event) => {
      const m = (e as CustomEvent<AssistantMsg>).detail;
      if (m) setMenuMsg(m);
    };
    window.addEventListener('assistant-message-menu', onMenu);
    return () => window.removeEventListener('assistant-message-menu', onMenu);
  }, []);

  const copyText = async (t: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(t);
      } else {
        // 手机局域网 http 预览不是 secure context，clipboard API 不可用 → 老式 execCommand 兜底
        const ta = document.createElement('textarea');
        ta.value = t;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (!ok) throw new Error('execCommand failed');
      }
      addToast('已复制', 'info');
    } catch {
      addToast('复制失败，请长按文字手动复制', 'error');
    }
  };

  // ── CSS 槽位读写（base=全局 / self=自己页面 / 其余=对应页面，追加式后写覆盖先写） ──
  const slotValue = (): string => {
    if (mode === 'self') return getAssistant().cssSelf;
    if (mode === 'base') return getMusicStore().cssGlobal;
    return getMusicStore().cssPages[mode] ?? '';
  };
  const slotSave = (css: string) => {
    if (mode === 'self') saveAssistantCssSelf(css);
    else if (mode === 'base') setCssGlobal(css);
    else setCssPage(mode, css);
  };

  /** 应用 CSS（AI 回复里的代码块一键应用）：追加到当前槽位 */
  const applyCss = (css: string) => {
    const prev = slotValue();
    slotSave(prev ? `${prev}\n${css}` : css);
    addToast(`已应用到「${pageInfo.label}」`, 'success');
  };

  /** 当前调色存成命名预设（2026-08-31） */
  const savePreset = () => {
    const name = presetNameDraft.trim();
    if (!name) { addToast('先给配色起个名字', 'info'); return; }
    saveAssistantThemePreset(name);
    setPresetNameDraft('');
    setShowPresetSave(false);
    addToast(`配色「${name}」已存为预设`, 'success');
  };

  const buildSystemPrompt = (): string => {
    const pagePrompt = getPrompt(pageInfo.promptLabel)
      .replace(/\{\{\s*user\s*\}\}/gi, userName);
    const focus = cardInfo.key === 'whole'
      ? `【本次目标】美化「${pageInfo.label}」整体，按你的判断做。`
      : `【本次目标】这次只美化「${pageInfo.label} · ${cardInfo.label}」这一块卡片，其它区域保持原样。`;
    // 借鉴上游工作台的思路（2026-08-30）：把「现状」给他，他改而不是凭空重写；
    // 交付规矩学 COLLABORATION_PROTOCOL——一个完整可用的成品，不要只给思路。
    const currentCss = slotValue().trim().slice(0, 4000);
    const cssState = currentCss
      ? `\n【当前已生效的 CSS（节选 4000 字）】先读现状：能改的就改、该补的补，别把用户写好的东西整个推翻重写。\n\`\`\`css\n${currentCss}\n\`\`\``
      : '\n【当前槽位还没有 CSS】从零写，但先给最稳的方案。';
    return [
      `你是${store.name}，${userName}的私人小助手。\n${store.persona}`,
      `【当前工作】${moduleInfo.label} · ${pageInfo.label}（${pageInfo.desc}）\n${focus}`,
      '【交付规矩】回复 = 一两句说明 + 一个完整可直接应用的 ```css 代码块；不要只给思路不给代码；代码里不要省略号、不要「其它样式不变」这类注释占位；最后一行用注释简述这次改了哪里（如 /* 改：气泡圆角 16px，主色换暖棕 */）。\n' +
      '【CSS 铁律】不要写 position:fixed / position:sticky；不要写 z-index（会把设置、收藏夹等弹窗卡片盖住）；只改已有元素的外观，不新增覆盖层或浮层。改顶栏时只调整已有元素（返回钮、头像、名字、状态 chip、齿轮）的间距/颜色/字号，保持一行排齐，不重排位置。',
      `【这份工作的知识与工具】\n${pagePrompt}${cssState}`,
    ].join('\n\n');
  };

  /** 发消息（文本 / 带图）；图片 = 截图或参考图，给他看的 */
  const send = (text?: string, imageRef?: string) => {
    const content = (text ?? input).trim();
    if ((!content && !imageRef) || busyRef.current) return;
    const api = getAssistant().api;
    if (!api?.baseUrl || !api.apiKey || !api.model) {
      addToast('先给小助手配一个专属 API（齿轮里）', 'info');
      setShowSettings(true);
      return;
    }
    setInput('');
    setShowPlus(false);
    busyRef.current = true;
    setBusy(true);
    setStreaming('');

    // 任务存档：没有任务就现建一个，消息只进当前任务
    const sessionId = ensureAssistantSession();
    const userMsg: AssistantMsg = { id: `as-${Date.now()}-u`, role: 'user', content, imageRef, at: new Date().toISOString() };
    appendAssistantMessages([userMsg]);

    // 上下文只看当前任务的对话（任务之间互不共享，和上游工作台同款隔离）
    const history = getAssistant().messages.filter((m) => m.sessionId === sessionId);
    const apiMessages = [
      { role: 'system' as const, content: buildSystemPrompt() },
      ...history.slice(-30).map((m) => {
        if (m.role === 'user' && m.imageRef) {
          // 多模态：文字 + 图片一起给他
          return {
            role: 'user' as const,
            content: [
              { type: 'text' as const, text: m.content || '（看这张图）' },
              { type: 'image_url' as const, image_url: { url: m.imageRef } },
            ],
          };
        }
        return { role: m.role as 'user' | 'assistant', content: m.content };
      }),
    ];

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    void (async () => {
      // buffer/fullContent 在 try 外面声明：手动停止（AbortError）时 catch 要拿 fullContent 落半截消息
      let buffer = '';
      let fullContent = '';
      try {
        const baseUrl = String(api.baseUrl).replace(/\/+$/, '');
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.apiKey}` },
          // 一次输出很多（含代码），额度给够（她的前端 API 按次计费，返回太少反而亏）
          body: JSON.stringify({ model: api.model, messages: apiMessages, max_tokens: 16000, stream: true }),
          signal: abort.signal,
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error((errData as any).error?.message || `HTTP ${res.status}`);
        }
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                setStreaming(fullContent);
              }
            } catch { /* 忽略坏行 */ }
          }
        }
        const assistantMsg: AssistantMsg = { id: `as-${Date.now()}-a`, role: 'assistant', content: fullContent.trim(), at: new Date().toISOString() };
        appendAssistantMessages([assistantMsg]);
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          // 手动停止：已经流出来的内容别白写，保留成一条消息
          if (fullContent.trim()) {
            const partialMsg: AssistantMsg = { id: `as-${Date.now()}-a`, role: 'assistant', content: fullContent.trim(), at: new Date().toISOString() };
            appendAssistantMessages([partialMsg]);
          }
          addToast('已停止', 'info');
        } else {
          addToast(`小助手出错了：${e?.message || '网络错误'}`, 'error');
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
        setStreaming('');
      }
    })();
  };

  const pickImage = async (file: File) => {
    try {
      const ref = await putImageBlob(file);
      send(input, ref);
    } catch {
      addToast('图片保存失败', 'error');
    }
  };

  const exportFavorites = () => {
    const text = buildFavoritesExportText();
    if (!store.favorites.length) {
      addToast('收藏夹是空的', 'info');
      return;
    }
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `assistant-favorites-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** 折叠文件的下载（2026-08-31）：与导出收藏夹同款 Blob + a.download */
  const downloadTextFile = (name: string, text: string) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openCssEditor = () => {
    setCssDraft(slotValue());
    setShowCssEditor(true);
  };

  // 多选：切换单条 / 全选 / 删除 / 退出
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelected((prev) => (prev.size === sessionMessages.length ? new Set() : new Set(sessionMessages.map((m) => m.id))));
  };
  const batchDelete = () => {
    if (selected.size === 0) return;
    deleteAssistantMessages([...selected]);
    setSelected(new Set());
    setSelectMode(false);
    addToast(`已删除 ${selected.size} 条`, 'info');
  };
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  const renderAssistantContent = (content: string, keyPrefix: string) => {
    const parts = splitCodeBlocks(content);
    const isStream = keyPrefix === 'stream';
    return (
      <div className="space-y-2">
        {parts.map((part, i) => {
          if (part.type === 'text') {
            return (
              <div key={`${keyPrefix}-t${i}`} className="text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: colors.text }}>
                {part.content}
              </div>
            );
          }
          // 代码块序号（消息里第几个代码块）——折叠状态 key 用它，比数组下标稳（中间插文本不改号）
          const ordinal = parts.slice(0, i).filter((p) => p.type === 'code').length;
          const foldKey = `${keyPrefix}:${ordinal}`;
          const folded = !isStream && !!store.codeFold[foldKey];
          // 折叠态 = 交付文件卡（2026-08-31 学上游工作台）：留在消息流原位，点开展开，可下载 txt
          if (folded) {
            const name = codeFileName(part.content, ordinal);
            return (
              <div key={`${keyPrefix}-c${i}`} className="as-code-file rounded-xl"
                style={{ border: '1px solid rgba(201,106,142,0.25)', background: 'rgba(255,255,255,0.75)' }}>
                <div className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                  onClick={() => { if (!selectMode) setAssistantCodeFold(foldKey, false); }}>
                  <FileText size={14} style={{ color: colors.primary, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold truncate" style={{ color: colors.text }}>{name}.txt</div>
                    <div className="text-[9px]" style={{ color: colors.faint }}>交付文件 · {part.content.length} 字符 · 点开展开</div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); downloadTextFile(name, part.content); }}
                    className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] shrink-0 transition-all active:scale-95 border-0 cursor-pointer"
                    style={{ color: colors.primary, border: '1px solid rgba(201,106,142,0.25)' }}
                  >
                    <DownloadSimple size={9} /> 下载 txt
                  </button>
                  <CaretRight size={12} style={{ color: colors.muted, flexShrink: 0 }} />
                </div>
              </div>
            );
          }
          return (
            <div key={`${keyPrefix}-c${i}`} className="as-code rounded-xl overflow-hidden"
              style={{ border: `1px solid rgba(201,106,142,0.18)`, background: 'rgba(255,255,255,0.65)' }}>
              <div className="flex items-center justify-between px-2 py-1"
                style={{ background: `rgba(227,164,188,0.14)` }}>
                <span className="text-[8px] tracking-[0.18em] uppercase" style={{ color: colors.muted }}>css</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => void copyText(part.content)}
                    className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] transition-all active:scale-95"
                    style={{ color: colors.primary, border: `1px solid rgba(201,106,142,0.25)` }}
                  >
                    <Copy size={9} /> 复制
                  </button>
                  <button
                    onClick={() => { setFavTarget(part.content); setFavNameDraft(`${pageInfo.label}片段 ${store.favorites.length + 1}`); }}
                    className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] transition-all active:scale-95"
                    style={{ color: colors.muted, border: `1px solid rgba(201,106,142,0.2)` }}
                  >
                    <BookmarkSimple size={9} /> 收藏
                  </button>
                  <button
                    onClick={() => applyCss(part.content)}
                    className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold text-white transition-all active:scale-95"
                    style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})` }}
                  >
                    <PaintBrush size={9} /> 应用到{pageInfo.label}
                  </button>
                  {/* 流式中的代码块 key 不稳，不给折叠；只对已落库消息生效 */}
                  {!isStream && (
                    <button
                      onClick={() => setAssistantCodeFold(foldKey, true)}
                      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] transition-all active:scale-95 border-0 cursor-pointer"
                      style={{ color: colors.muted, border: '1px solid rgba(201,106,142,0.2)' }}
                    >
                      <FileText size={9} /> 折叠
                    </button>
                  )}
                </div>
              </div>
              <pre className="px-2.5 py-2 overflow-x-auto text-[10px] leading-relaxed"
                style={{ color: colors.text, fontFamily: `'SF Mono','Cascadia Code',Consolas,monospace`, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {part.content}
              </pre>
            </div>
          );
        })}
      </div>
    );
  };

  const bubbleStyle = (user: boolean): React.CSSProperties =>
    user
      ? { background: colors.bubbleUser, borderTopRightRadius: 6, boxShadow: '0 2px 10px rgba(227,164,188,0.3)' }
      : { background: colors.bubbleAi, borderTopLeftRadius: 6, border: '1px solid rgba(255,255,255,0.6)', boxShadow: '0 2px 8px rgba(201,106,142,0.06)' };

  const chipStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 10, fontWeight: 600,
    background: active ? `linear-gradient(135deg, ${colors.primary}, ${colors.accent})` : 'rgba(255,255,255,0.8)',
    color: active ? '#fff' : colors.muted,
    border: `1px solid ${active ? 'transparent' : 'rgba(201,106,142,0.18)'}`,
  });

  return (
    <div className="as-app absolute inset-0 flex flex-col overflow-hidden"
      style={{ background: `linear-gradient(180deg, #ffffff 0%, ${colors.bg} 45%, ${colors.bgDeep} 100%)` }}>

      {/* 页面主体整体隔离（2026-08-31 修「顶框挡弹窗」）：isolation 造独立堆叠上下文——
          他写的 CSS 不管给顶栏/气泡加多高的 z-index 或 fixed，都被关在这层里，
          盖不到外面作为兄弟节点的设置/收藏等弹窗卡片（z-40）。 */}
      <div className="min-h-0 flex-1 flex flex-col" style={{ isolation: 'isolate' }}>

      {/* Header（安全区自理：--chrome-top 覆盖状态栏，见 utils/safeAreaApps.ts 名单） */}
      <div className="as-header shrink-0 relative z-20"
        style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(20px) saturate(1.4)', WebkitBackdropFilter: 'blur(20px) saturate(1.4)', borderBottom: '1px solid rgba(201,106,142,0.1)', paddingTop: 'var(--chrome-top)' }}>
        <div className="flex items-center gap-2 h-12 px-3">
          <button onClick={closeApp} className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90" style={{ color: colors.primary }}>
            <ArrowLeft size={17} weight="bold" />
          </button>
          {/* 点标题区 = 任务存档（2026-08-30）：像官方客户端的会话列表，做完一个活就新建任务 */}
          <button onClick={() => setShowSessions(true)} className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-full overflow-hidden shrink-0" style={{ border: '1.5px solid rgba(201,106,142,0.3)', background: colors.bubbleUser }}>
              {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : <PaintBrush size={14} color="#fff" className="m-auto block mt-1.5" />}
            </div>
            <div className="min-w-0 text-left">
              <div className="text-[12px] font-semibold truncate" style={{ color: colors.text }}>{store.name}</div>
              <div className="text-[9px] truncate flex items-center gap-1" style={{ color: colors.faint }}>
                <span className="truncate">▸ {activeSession?.title ?? '你的工作小助手'}</span>
                {store.sessions.length > 1 && <span className="shrink-0 opacity-70">· {store.sessions.length} 个任务</span>}
              </div>
            </div>
          </button>
          {/* 当前工作状态（选哪个模式/卡片就在这显示做哪个） */}
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold max-w-[120px] truncate"
            style={{ background: 'rgba(201,106,142,0.1)', color: colors.primary, border: '1px solid rgba(201,106,142,0.2)' }}>
            {pageInfo.label}{cardInfo.key !== 'whole' ? ` · ${cardInfo.label}` : ''}
          </span>
          <button onClick={() => setShowSettings(true)} className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90" style={{ color: colors.muted }}>
            <GearSix size={16} />
          </button>
        </div>
      </div>

      {/* 消息流（只看当前任务的对话） */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 relative z-10">
        {sessionMessages.length === 0 && !streaming && (
          <div className="pt-16 flex flex-col items-center gap-2.5" style={{ color: colors.faint }}>
            <PaintBrush size={22} color={colors.accent} />
            <div className="text-[11px] italic tracking-wider">告诉 {store.name} 想把哪页变成什么样</div>
            <div className="text-[9px] text-center leading-relaxed px-8">
              左边「＋」先选模块 → 页面 → 卡片<br />回复里的 CSS 一键应用到当前模式
            </div>
            <div className="text-[9px] px-8 text-center leading-relaxed" style={{ color: colors.faint }}>
              点顶部名字可以翻历史任务——<br />做完一个活就新建任务，不用删聊天记录
            </div>
          </div>
        )}
        {sessionMessages.map((m) => (
          <AssistantBubble
            key={m.id}
            m={m}
            colors={colors}
            renderContent={renderAssistantContent}
            selectMode={selectMode}
            selected={selected.has(m.id)}
            onToggleSelect={() => toggleSelect(m.id)}
          />
        ))}
        {streaming && (
          <div className="flex justify-start">
            <div className="max-w-[88%] rounded-2xl px-3 py-2" style={bubbleStyle(false)}>
              {renderAssistantContent(streaming, 'stream')}
              <span className="inline-block w-1.5 h-3 ml-0.5 align-middle animate-pulse" style={{ background: colors.primary }} />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* 加号面板（2026-08-30 改）：内联在输入行上方展开，不遮全屏——正常聊天软件点加号怎么弹就这么弹 */}
      {showPlus && (
        <div className="as-plus-panel shrink-0 px-3 pb-2 pt-0 relative z-10">
          <div className="rounded-2xl p-3"
            style={{ background: 'rgba(255,255,255,0.97)', border: `1px solid rgba(201,106,142,0.16)`, boxShadow: '0 -4px 20px rgba(201,106,142,0.08)' }}>
            <div className="text-[9px] mb-1.5 tracking-wider font-semibold" style={{ color: colors.muted }}>模块</div>
            <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
              {MODULES.map((mod) => {
                const active = mod.pages.some((p) => p.key === mode);
                return (
                  <button
                    key={mod.key}
                    onClick={() => { setMode(mod.pages[0].key as PageKey); setCard('whole'); }}
                    className="rounded-full px-3 py-1.5 transition-all active:scale-95 border-0 cursor-pointer"
                    style={chipStyle(active)}
                  >
                    {mod.label}
                  </button>
                );
              })}
            </div>
            <div className="text-[9px] mb-1.5 tracking-wider font-semibold" style={{ color: colors.muted }}>页面</div>
            <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
              {moduleInfo.pages.map((p) => (
                <button
                  key={p.key}
                  onClick={() => { setMode(p.key as PageKey); setCard('whole'); }}
                  className="rounded-full px-3 py-1.5 transition-all active:scale-95 border-0 cursor-pointer"
                  style={chipStyle(mode === p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="text-[9px] mb-1.5 tracking-wider font-semibold" style={{ color: colors.muted }}>
              卡片（只改这一块 · 选「整体」就自由发挥）
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
              {pageInfo.cards.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setCard(c.key)}
                  className="rounded-full px-3 py-1 transition-all active:scale-95 border-0 cursor-pointer"
                  style={chipStyle(card === c.key)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="border-t pt-2.5 space-y-1.5" style={{ borderColor: 'rgba(201,106,142,0.12)' }}>
              <button
                onClick={() => { setShowPlus(false); openCssEditor(); }}
                className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-all active:scale-[0.98] border-0 cursor-pointer"
                style={{ background: 'rgba(201,106,142,0.06)' }}
              >
                <PaintBrush size={16} color={colors.primary} />
                <span className="text-[11px] font-medium" style={{ color: colors.text }}>CSS 编辑（白框，边写边实时生效）</span>
              </button>
              <button
                onClick={() => { setShowPlus(false); fileRef.current?.click(); }}
                className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-all active:scale-[0.98] border-0 cursor-pointer"
                style={{ background: 'rgba(201,106,142,0.06)' }}
              >
                <ImageSquare size={16} color={colors.primary} />
                <span className="text-[11px] font-medium" style={{ color: colors.text }}>上传图片（截图 / 参考图给他看）</span>
              </button>
              <button
                onClick={() => { setShowPlus(false); setShowFavs(true); }}
                className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-all active:scale-[0.98] border-0 cursor-pointer"
                style={{ background: 'rgba(201,106,142,0.06)' }}
              >
                <BookmarkSimple size={16} color={colors.primary} />
                <span className="text-[11px] font-medium" style={{ color: colors.text }}>收藏夹（{store.favorites.length}）</span>
              </button>
              <button
                onClick={() => { setShowPlus(false); setShowSessions(true); }}
                className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-all active:scale-[0.98] border-0 cursor-pointer"
                style={{ background: 'rgba(201,106,142,0.06)' }}
              >
                <FolderSimple size={16} color={colors.primary} />
                <span className="text-[11px] font-medium" style={{ color: colors.text }}>任务存档（{store.sessions.length}）· 新建/切换/删除任务</span>
              </button>
            </div>
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pickImage(file);
          e.target.value = '';
        }}
      />

      {/* 多选模式底部条（2026-08-30）：全选 / 删除 / 取消 */}
      {selectMode ? (
        <div className="shrink-0 px-3 pb-3 pt-1.5 relative z-10">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold" style={{ color: colors.text }}>已选 {selected.size} 条</span>
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-semibold border-0 cursor-pointer transition-all active:scale-95"
              style={{ color: colors.primary, border: `1px solid rgba(201,106,142,0.25)`, background: 'rgba(255,255,255,0.8)' }}
            >
              <CheckSquare size={12} /> {selected.size === store.messages.length ? '取消全选' : '全选'}
            </button>
            <button
              onClick={batchDelete}
              disabled={selected.size === 0}
              className="ml-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-semibold border-0 cursor-pointer transition-all active:scale-95 disabled:opacity-40"
              style={{ color: '#e05b6e', border: '1px solid rgba(224,91,110,0.35)', background: 'rgba(255,255,255,0.8)' }}
            >
              <Trash size={12} /> 删除
            </button>
            <button
              onClick={exitSelect}
              className="rounded-full px-3 py-1.5 text-[10px] font-semibold border-0 cursor-pointer"
              style={{ color: colors.muted, background: 'rgba(255,255,255,0.8)' }}
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        /* 输入行 + 加号 */
        <div className="as-input-row shrink-0 px-3 pb-3 pt-1.5 relative z-10">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPlus((v) => !v)}
              className="as-plus-btn w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90"
              style={{ background: 'rgba(255,255,255,0.85)', color: colors.primary, border: '1px solid rgba(201,106,142,0.2)' }}
              aria-label="更多"
            >
              <Plus size={17} weight="bold" />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(); }}
              placeholder={`想让 ${pageInfo.label} 变成什么样？`}
              className="flex-1 min-w-0 rounded-full px-4 py-2.5 outline-none text-[12px]"
              style={{ color: colors.text, background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(201,106,142,0.18)' }}
            />
            <button
              onClick={() => { if (busy) { abortRef.current?.abort(); } else { send(); } }}
              className="as-send-btn w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90"
              style={busy
                ? { background: 'rgba(255,255,255,0.85)', color: '#e05b6e', border: '1.5px solid rgba(224,91,110,0.5)' }
                : { background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`, color: '#fff', boxShadow: '0 3px 12px rgba(201,106,142,0.3)' }}
              aria-label={busy ? '停止' : '发送'}
            >
              {busy ? (
                <Stop size={16} weight="fill" />
              ) : (
                <PaperPlaneTilt size={16} weight="fill" />
              )}
            </button>
          </div>
          <div className="text-center text-[8px] mt-1" style={{ color: colors.faint }}>
            专属 API · 一次输出很多 · 代码块可复制 / 收藏 / 一键应用
          </div>
        </div>
      )}

      </div>{/* 页面主体隔离层结束——下面的弹窗是它的兄弟节点，永远盖在页面上方 */}

      {/* 白框 CSS 编辑弹层（2026-08-30：对标主聊天「白框自定义」——底部白卡，边写边生效） */}
      {showCssEditor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(60,30,44,0.3)' }} onClick={() => setShowCssEditor(false)}>
          <div className="w-full max-h-[72vh] overflow-y-auto rounded-t-3xl p-4"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 -12px 40px rgba(0,0,0,0.18)', paddingBottom: 'calc(1rem + var(--safe-bottom))' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-1.5">
              <div>
                <div className="text-[13px] font-bold" style={{ color: colors.text }}>CSS 编辑 · {moduleInfo.label} · {pageInfo.label}</div>
                <div className="text-[10px] mt-0.5" style={{ color: colors.faint }}>
                  边写边实时生效（目标页面打开就能看到）；当前卡片焦点：{cardInfo.label}
                </div>
              </div>
              <button onClick={() => setShowCssEditor(false)} className="px-2 text-lg leading-none border-0 cursor-pointer" style={{ color: colors.muted }}>×</button>
            </div>
            <textarea
              value={cssDraft}
              onChange={(e) => { setCssDraft(e.target.value); slotSave(e.target.value); }}
              rows={10}
              className="w-full rounded-xl px-3 py-2 outline-none text-[11px]"
              style={{
                fontFamily: 'monospace', color: colors.text, background: 'rgba(249,236,242,0.6)',
                border: '1px solid rgba(201,106,142,0.2)', resize: 'vertical',
              }}
              placeholder={'例如（换成明显不同的颜色一眼能看出来）：\n:root { --mz-primary: #2f6f4f; --mz-primary-rgb: 47,111,79; --mz-accent: #57a87f; --mz-glow: #8fd0ab; --mz-glow-rgb: 143,208,171; }\n\n换色同时改 -rgb 变量（透明色用得上）。'}
            />
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => { slotSave(''); setCssDraft(''); addToast('已还原默认样式', 'success'); }}
                className="flex-1 py-2 rounded-full text-[11px] font-semibold border-0 cursor-pointer"
                style={{ color: '#e05b6e', border: '1px solid rgba(224,91,110,0.35)', background: 'rgba(255,255,255,0.8)' }}
              >
                清空此槽（还原默认）
              </button>
              <button
                onClick={() => setShowCssEditor(false)}
                className="flex-1 py-2 rounded-full text-[11px] font-semibold text-white border-0 cursor-pointer"
                style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})` }}
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 收藏夹弹层（2026-08-31 她要求改）：点开单独看代码，代码区自由输入保存 */}
      {showFavs && (
        <div className="absolute inset-0 z-40 flex items-center justify-center px-6" style={{ background: 'rgba(60,30,44,0.4)' }} onClick={() => setShowFavs(false)}>
          <div className="w-full max-w-[340px] rounded-2xl p-4 space-y-2 max-h-[75%] flex flex-col"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-semibold" style={{ color: colors.text }}>收藏夹</div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    const added = addAssistantFavorite(`片段 ${store.favorites.length + 1}`, '');
                    setFavOpenId(added.id);
                    setFavDraft({ name: added.name, css: '' });
                    addToast('新片段已建，写点内容吧', 'info');
                  }}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-semibold border-0 cursor-pointer"
                  style={{ color: colors.primary, border: '1px solid rgba(201,106,142,0.25)' }}
                >
                  <Plus size={10} weight="bold" /> 新增
                </button>
                <button
                  onClick={exportFavorites}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-semibold text-white border-0 cursor-pointer"
                  style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})` }}
                >
                  <DownloadSimple size={10} /> 导出 txt
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {store.favorites.length === 0 ? (
                <div className="py-6 text-center text-[10px] italic" style={{ color: colors.faint }}>
                  还没有收藏的片段<br />点右上角「新增」写一个，或在回复的代码块上点「收藏」
                </div>
              ) : (
                store.favorites.map((f) => {
                  const open = favOpenId === f.id;
                  const preview = f.css.trim() ? f.css.trim().split('\n')[0].slice(0, 40) : '';
                  return (
                    <div key={f.id} className="rounded-xl overflow-hidden"
                      style={{ background: 'rgba(201,106,142,0.05)', border: `1px solid ${open ? 'rgba(201,106,142,0.32)' : 'rgba(201,106,142,0.12)'}` }}>
                      {/* 收起行：点一下展开看代码 */}
                      <div
                        className="px-3 py-2 flex items-center gap-2 cursor-pointer"
                        onClick={() => {
                          if (open) { setFavOpenId(null); } else { setFavOpenId(f.id); setFavDraft({ name: f.name, css: f.css }); }
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-semibold truncate" style={{ color: colors.text }}>{f.name}</div>
                          <div className="text-[9px] truncate" style={{ color: colors.faint }}>
                            {preview || '（空片段，点开写内容）'}
                          </div>
                        </div>
                        <CaretDown
                          size={12}
                          style={{ color: colors.muted, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s ease' }}
                        />
                      </div>
                      {/* 展开：自由编辑 + 保存 / 复制 / 删除 */}
                      {open && (
                        <div className="px-3 pb-2.5 space-y-1.5">
                          <input
                            value={favDraft.name}
                            onChange={(e) => setFavDraft((d) => ({ ...d, name: e.target.value }))}
                            placeholder="片段名"
                            className="w-full rounded-lg px-2.5 py-1.5 outline-none text-[11px] font-medium"
                            style={{ color: colors.text, background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(201,106,142,0.18)' }}
                          />
                          <textarea
                            value={favDraft.css}
                            onChange={(e) => setFavDraft((d) => ({ ...d, css: e.target.value }))}
                            rows={7}
                            placeholder="在这里自由写 / 粘贴 CSS"
                            className="w-full rounded-lg px-2.5 py-2 outline-none text-[10px] leading-relaxed"
                            style={{
                              fontFamily: "'SF Mono','Cascadia Code',Consolas,monospace", color: colors.text,
                              background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(201,106,142,0.18)', resize: 'vertical',
                            }}
                          />
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                renameAssistantFavorite(f.id, favDraft.name);
                                updateAssistantFavoriteCss(f.id, favDraft.css);
                                addToast('已保存', 'success');
                              }}
                              className="flex-1 py-1.5 rounded-full text-[10px] font-semibold text-white border-0 cursor-pointer"
                              style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})` }}
                            >
                              保存
                            </button>
                            <button
                              onClick={() => void copyText(favDraft.css)}
                              className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] border-0 cursor-pointer"
                              style={{ color: colors.primary, border: '1px solid rgba(201,106,142,0.25)' }}
                            >
                              <Copy size={11} /> 复制
                            </button>
                            <button
                              onClick={() => { deleteAssistantFavorite(f.id); setFavOpenId(null); }}
                              className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] border-0 cursor-pointer"
                              style={{ color: '#e05b6e', border: '1px solid rgba(224,91,110,0.35)' }}
                            >
                              <Trash size={11} /> 删除
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <button onClick={() => setShowFavs(false)} className="w-full py-1.5 text-[10px] border-0 cursor-pointer" style={{ color: colors.faint }}>
              关闭
            </button>
          </div>
        </div>
      )}

      {/* 收藏命名弹层 */}
      {favTarget && (
        <div className="absolute inset-0 z-40 flex items-center justify-center px-7" style={{ background: 'rgba(60,30,44,0.4)' }} onClick={() => setFavTarget(null)}>
          <div className="w-full max-w-[280px] rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.97)' }} onClick={(e) => e.stopPropagation()}>
            <div className="text-[12px] font-semibold mb-2" style={{ color: colors.text }}>收进收藏夹</div>
            <input
              value={favNameDraft}
              onChange={(e) => setFavNameDraft(e.target.value)}
              placeholder="给这段取个名字"
              className="w-full rounded-xl px-3 py-2 outline-none text-[11px]"
              style={{ color: colors.text, border: '1px solid rgba(201,106,142,0.2)' }}
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => { addAssistantFavorite(favNameDraft, favTarget); setFavTarget(null); addToast('已收藏', 'success'); }}
                className="flex-1 py-2 rounded-full text-[11px] font-semibold text-white border-0 cursor-pointer"
                style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})` }}
              >
                收藏
              </button>
              <button onClick={() => setFavTarget(null)} className="flex-1 py-2 rounded-full text-[11px] border-0 cursor-pointer"
                style={{ color: colors.muted, border: '1px solid rgba(201,106,142,0.2)' }}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 长按操作面板（2026-08-30 加多选入口） */}
      {menuMsg && (
        <div className="absolute inset-0 z-40 flex items-end" style={{ background: 'rgba(60,30,44,0.35)' }} onClick={() => setMenuMsg(null)}>
          <div className="w-full rounded-t-2xl p-3 pb-5" style={{ background: 'rgba(255,255,255,0.97)' }} onClick={(e) => e.stopPropagation()}>
            <div className="text-center text-[9px] mb-2 truncate px-6" style={{ color: colors.faint }}>
              {menuMsg.content.slice(0, 40) || '（图片消息）'}
            </div>
            <div className="flex justify-center gap-2 flex-wrap">
              <button
                onClick={() => { void copyText(menuMsg.content); setMenuMsg(null); }}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[11px] font-semibold text-white border-0 cursor-pointer"
                style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})` }}
              >
                <Copy size={13} /> 复制
              </button>
              {menuMsg.role === 'user' && (
                <button
                  onClick={() => { setEditMsg(menuMsg); setEditText(menuMsg.content); setMenuMsg(null); }}
                  className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[11px] font-semibold border-0 cursor-pointer"
                  style={{ color: colors.primary, border: '1px solid rgba(201,106,142,0.25)' }}
                >
                  <PencilSimple size={13} /> 修改
                </button>
              )}
              <button
                onClick={() => {
                  if (menuMsg.imageRef) void deleteBlobRef(menuMsg.imageRef);
                  deleteAssistantMessage(menuMsg.id);
                  setMenuMsg(null);
                  addToast('已删除', 'info');
                }}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[11px] font-semibold border-0 cursor-pointer"
                style={{ color: '#e05b6e', border: '1px solid rgba(224,91,110,0.35)' }}
              >
                <Trash size={13} /> 删除
              </button>
              <button
                onClick={() => { setMenuMsg(null); setSelectMode(true); }}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[11px] font-semibold border-0 cursor-pointer"
                style={{ color: colors.muted, border: '1px solid rgba(201,106,142,0.2)' }}
              >
                <CheckSquare size={13} /> 多选
              </button>
            </div>
            <button onClick={() => setMenuMsg(null)} className="w-full text-center text-[10px] mt-2.5 border-0 cursor-pointer" style={{ color: colors.faint }}>
              取消
            </button>
          </div>
        </div>
      )}

      {/* 编辑弹层 */}
      {editMsg && (
        <div className="absolute inset-0 z-40 flex items-center justify-center px-7" style={{ background: 'rgba(60,30,44,0.4)' }} onClick={() => setEditMsg(null)}>
          <div className="w-full max-w-[280px] rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.97)' }} onClick={(e) => e.stopPropagation()}>
            <div className="text-[12px] font-semibold mb-2" style={{ color: colors.text }}>修改消息</div>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={3}
              className="w-full rounded-xl px-3 py-2 outline-none text-[12px]"
              style={{ color: colors.text, resize: 'none', border: '1px solid rgba(201,106,142,0.2)' }}
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => { editAssistantMessage(editMsg.id, editText.trim()); setEditMsg(null); addToast('已修改', 'success'); }}
                className="flex-1 py-2 rounded-full text-[11px] font-semibold text-white border-0 cursor-pointer"
                style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})` }}
              >
                保存
              </button>
              <button onClick={() => setEditMsg(null)} className="flex-1 py-2 rounded-full text-[11px] border-0 cursor-pointer"
                style={{ color: colors.muted, border: '1px solid rgba(201,106,142,0.2)' }}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 任务存档弹层（2026-08-30）：新建/切换/删除——做完一个活就新建，不用删聊天记录 */}
      {showSessions && (
        <div className="absolute inset-0 z-40 flex items-center justify-center px-6" style={{ background: 'rgba(60,30,44,0.4)' }} onClick={() => setShowSessions(false)}>
          <div className="w-full max-w-[320px] rounded-2xl p-4 space-y-2 max-h-[70%] flex flex-col"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-semibold" style={{ color: colors.text }}>任务存档</div>
              <button
                onClick={() => { newAssistantSession(); addToast('新任务已开，开始派活吧', 'success'); setShowSessions(false); }}
                disabled={busy}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-semibold text-white border-0 cursor-pointer disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})` }}
              >
                <Plus size={10} weight="bold" /> 新建任务
              </button>
            </div>
            <div className="text-[9px]" style={{ color: colors.faint }}>
              历史任务点一下接着聊；每个任务互不混消息。做完的活留着，随时翻出来。
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {sortedSessions.length === 0 ? (
                <div className="py-6 text-center text-[10px] italic" style={{ color: colors.faint }}>还没有任务，点右上角新建</div>
              ) : (
                sortedSessions.map((sess) => {
                  const meta = sessionMeta(sess.id);
                  const isActive = sess.id === store.activeSessionId;
                  const date = new Date(sess.updatedAt);
                  const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`;
                  return (
                    <div key={sess.id}
                      className="rounded-xl px-3 py-2 flex items-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
                      style={{
                        background: isActive ? 'rgba(201,106,142,0.1)' : 'rgba(201,106,142,0.04)',
                        border: `1px solid ${isActive ? 'rgba(201,106,142,0.35)' : 'rgba(201,106,142,0.1)'}`,
                      }}
                      onClick={() => {
                        if (isActive) { setShowSessions(false); return; }
                        if (busy) { addToast('等他回完再切换任务', 'info'); return; }
                        switchAssistantSession(sess.id);
                        setShowSessions(false);
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold truncate flex items-center gap-1" style={{ color: colors.text }}>
                          {isActive && <span className="shrink-0" style={{ color: colors.primary }}>▸</span>}
                          <span className="truncate">{sess.title}</span>
                        </div>
                        <div className="text-[9px]" style={{ color: colors.faint }}>{dateLabel} · {meta.count} 条</div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (busy) { addToast('等他回完再删任务', 'info'); return; }
                          deleteAssistantSession(sess.id);
                          addToast(isActive ? '任务已删除' : '任务已删除', 'info');
                        }}
                        className="p-1.5 rounded-full transition-all active:scale-90 border-0 cursor-pointer"
                        style={{ color: '#e05b6e' }}
                        aria-label="删除任务"
                      >
                        <Trash size={13} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <button onClick={() => setShowSessions(false)} className="w-full py-1.5 text-[10px] border-0 cursor-pointer" style={{ color: colors.faint }}>
              关闭
            </button>
          </div>
        </div>
      )}

      {/* 设置弹层：名字头像人设 + 调色台 + API + 美化提示词 + 清空 */}
      {showSettings && (
        <div className="absolute inset-0 z-40 flex items-center justify-center px-5" style={{ background: 'rgba(60,30,44,0.4)' }} onClick={() => setShowSettings(false)}>
          <div className="w-full max-w-[360px] rounded-2xl p-4 space-y-3 max-h-[85%] overflow-y-auto"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-semibold" style={{ color: colors.text }}>小助手设置</div>
              <button onClick={() => setShowSettings(false)} className="p-1 rounded-full transition-all active:scale-90 border-0 cursor-pointer" style={{ color: colors.muted }}>
                <X size={15} />
              </button>
            </div>

            {/* 名字 + 头像 + 人设（轻量人设，就这三样） */}
            <div>
              <div className="text-[9px] mb-1 tracking-wider" style={{ color: colors.muted }}>名字与头像</div>
              <div className="flex items-center gap-2">
                <label className="w-9 h-9 rounded-full overflow-hidden cursor-pointer shrink-0"
                  style={{ border: '1.5px solid rgba(201,106,142,0.3)', background: colors.bubbleUser }}>
                  {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : (
                    <PaintBrush size={16} color="#fff" className="m-auto block mt-2.5" />
                  )}
                  <input
                    type="file" accept="image/*" className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const ref = await putImageBlob(file);
                        saveAssistantProfile({ avatarRef: ref });
                        addToast('头像已更新', 'success');
                      } catch {
                        addToast('头像保存失败', 'error');
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                <input
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  onBlur={() => saveAssistantProfile({ name: profileForm.name })}
                  placeholder="名字"
                  className="flex-1 min-w-0 rounded-xl px-3 py-2 outline-none text-[11px]"
                  style={{ color: colors.text, border: '1px solid rgba(201,106,142,0.2)' }}
                />
              </div>
            </div>

            <div>
              <div className="text-[9px] mb-1 tracking-wider" style={{ color: colors.muted }}>轻量人设（一两句就行）</div>
              <textarea
                value={profileForm.persona}
                onChange={(e) => setProfileForm({ ...profileForm, persona: e.target.value })}
                onBlur={() => saveAssistantProfile({ persona: profileForm.persona })}
                rows={3}
                className="w-full rounded-xl px-3 py-2 outline-none text-[11px] leading-relaxed"
                style={{ color: colors.text, resize: 'none', border: '1px solid rgba(201,106,142,0.2)' }}
              />
            </div>

            {/* 调色台（2026-08-30 她要求）：主色/辅色/文字色，改完立刻生效 */}
            <div>
              <div className="text-[9px] mb-1 tracking-wider flex items-center justify-between" style={{ color: colors.muted }}>
                <span>调色台（界面配色）</span>
                <button
                  onClick={() => { resetAssistantTheme(); addToast('已恢复默认配色', 'success'); }}
                  className="text-[9px] underline border-0 cursor-pointer"
                  style={{ color: colors.muted }}
                >
                  恢复默认
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  ['primary', '主色', store.theme?.primary ?? '#c96a8e'],
                  ['accent', '辅色', store.theme?.accent ?? '#e3a4bc'],
                  ['text', '文字色', store.theme?.text ?? '#3d3340'],
                ] as const).map(([key, label, val]) => (
                  <div key={key} className="flex flex-col items-center gap-1 rounded-xl px-2 py-2"
                    style={{ background: 'rgba(201,106,142,0.05)' }}>
                    <span className="text-[9px]" style={{ color: colors.muted }}>{label}</span>
                    <input
                      type="color"
                      value={val}
                      onChange={(e) => saveAssistantTheme({ [key]: e.target.value } as { primary?: string; accent?: string; text?: string })}
                      className="w-8 h-8 rounded-md cursor-pointer"
                      style={{ border: '1px solid rgba(201,106,142,0.25)', background: 'transparent' }}
                      aria-label={`${label}调色`}
                    />
                  </div>
                ))}
              </div>
              <div className="text-[9px] mt-1" style={{ color: colors.faint }}>
                主色/辅色拼成渐变（气泡、按钮、状态 chip 都吃这个渐变）；文字色管正文。
              </div>
              {/* 配色预设（2026-08-31 她要求）：调完存命名预设，随时一键换回来 */}
              <div className="flex items-center gap-1.5 mt-1.5">
                <button
                  onClick={() => setShowPresetSave((v) => !v)}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-semibold border-0 cursor-pointer"
                  style={{ color: colors.primary, border: '1px solid rgba(201,106,142,0.25)' }}
                >
                  <BookmarkSimple size={10} /> 存为预设
                </button>
                <span className="text-[9px]" style={{ color: colors.faint }}>{store.themePresets.length}/12</span>
              </div>
              {showPresetSave && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <input
                    value={presetNameDraft}
                    onChange={(e) => setPresetNameDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) savePreset(); }}
                    placeholder="预设名（如 薄荷）"
                    className="flex-1 min-w-0 rounded-full px-3 py-1.5 outline-none text-[10px]"
                    style={{ color: colors.text, border: '1px solid rgba(201,106,142,0.2)' }}
                  />
                  <button
                    onClick={savePreset}
                    className="rounded-full px-3 py-1.5 text-[10px] font-semibold text-white border-0 cursor-pointer"
                    style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})` }}
                  >
                    保存
                  </button>
                </div>
              )}
              {store.themePresets.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {store.themePresets.map((p) => (
                    <div key={p.name} className="flex items-center gap-1 rounded-full pl-1.5 py-0.5"
                      style={{ background: 'rgba(201,106,142,0.06)', border: '1px solid rgba(201,106,142,0.14)' }}>
                      {/* 三色圆点预览 */}
                      <span className="flex -space-x-1">
                        {[p.colors.primary, p.colors.accent, p.colors.text].map((c, ci) => (
                          <span key={ci} className="w-3 h-3 rounded-full" style={{ background: c, border: '1px solid rgba(255,255,255,0.8)' }} />
                        ))}
                      </span>
                      <button
                        onClick={() => { loadAssistantThemePreset(p.name); addToast(`已应用配色「${p.name}」`, 'success'); }}
                        className="text-[10px] font-medium border-0 bg-transparent cursor-pointer"
                        style={{ color: colors.text }}
                      >
                        {p.name}
                      </button>
                      <button
                        onClick={() => deleteAssistantThemePreset(p.name)}
                        className="p-0.5 mr-0.5 border-0 bg-transparent cursor-pointer"
                        style={{ color: colors.faint }}
                        aria-label={`删除预设 ${p.name}`}
                      >
                        <X size={9} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* API */}
            <div>
              <div className="text-[9px] mb-1 tracking-wider" style={{ color: colors.muted }}>专属 API（不配置就不调用，不回退别的模型）</div>
              {/* 预设池：点胶囊填表（和原版设置页同款交互） */}
              {apiPresets.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mb-1.5">
                  {apiPresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => loadApiPreset(preset)}
                      className="rounded-full px-2.5 py-1 text-[9.5px] font-medium cursor-pointer transition-all active:scale-95"
                      style={{
                        color: apiPresetId === preset.id ? '#fff' : colors.text,
                        background: apiPresetId === preset.id
                          ? `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`
                          : 'rgba(201,106,142,0.08)',
                        border: `1px solid ${apiPresetId === preset.id ? 'transparent' : 'rgba(201,106,142,0.25)'}`,
                      }}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="space-y-1.5">
                <input value={apiForm.baseUrl} onChange={(e) => setApiForm({ ...apiForm, baseUrl: e.target.value })} placeholder="Base URL（已带 /v1）"
                  className="w-full rounded-xl px-3 py-2 outline-none text-[10px]" style={{ color: colors.text, border: '1px solid rgba(201,106,142,0.2)' }} />
                <input value={apiForm.apiKey} onChange={(e) => setApiForm({ ...apiForm, apiKey: e.target.value })} placeholder="API Key"
                  className="w-full rounded-xl px-3 py-2 outline-none text-[10px]" style={{ color: colors.text, border: '1px solid rgba(201,106,142,0.2)' }} />
                <input value={apiForm.model} onChange={(e) => setApiForm({ ...apiForm, model: e.target.value })} placeholder="模型名"
                  className="w-full rounded-xl px-3 py-2 outline-none text-[10px]" style={{ color: colors.text, border: '1px solid rgba(201,106,142,0.2)' }} />
              </div>
            </div>

            {/* 美化分类 · 提示词（2026-08-30 她定：美化助手的 prompt 在这里改，不进 noxhome） */}
            <div>
              <div className="text-[9px] mb-1 tracking-wider" style={{ color: colors.muted }}>美化分类 · 提示词（每个工作模式的页面知识）</div>
              <div className="space-y-1.5">
                {getPromptEntries().filter((e) => e.category === '美化助手').map((entry) => (
                  <AssistantPromptItem key={entry.label} label={entry.label} description={entry.description} colors={colors} />
                ))}
              </div>
            </div>

            <button
              onClick={() => { saveAssistantApi({ baseUrl: apiForm.baseUrl.trim(), apiKey: apiForm.apiKey.trim(), model: apiForm.model.trim() }); addToast('API 已保存', 'success'); setShowSettings(false); }}
              className="w-full py-2 rounded-full text-[11px] font-semibold text-white border-0 cursor-pointer"
              style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})` }}
            >
              保存
            </button>
            <button
              onClick={() => { clearAssistantMessages(); addToast('当前任务的对话已清空', 'info'); }}
              className="w-full py-1.5 rounded-full text-[10px] flex items-center justify-center gap-1 border-0 cursor-pointer"
              style={{ color: colors.muted, border: '1px solid rgba(201,106,142,0.2)' }}
            >
              <Trash size={11} /> 清空当前任务对话
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/** 用户消息里带的图（blobRef → url） */
const UserImage: React.FC<{ ref0: string }> = ({ ref0 }) => {
  const url = useBlobRefUrl(ref0);
  if (!url) return null;
  return <img src={url} alt="" className="w-full max-w-[200px] rounded-xl mb-1.5 object-cover" />;
};

/** 单条消息气泡（抽子组件：useLongPress 不能进 map；多选模式下点按=选中） */
const AssistantBubble: React.FC<{
  m: AssistantMsg;
  colors: AssistantColors;
  renderContent: (content: string, keyPrefix: string) => React.ReactNode;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}> = ({ m, colors, renderContent, selectMode, selected, onToggleSelect }) => {
  const lp = useLongPress(() => {
    if (!selectMode) window.dispatchEvent(new CustomEvent('assistant-message-menu', { detail: m }));
  });
  const selStyle: React.CSSProperties = selectMode
    ? { cursor: 'pointer', outline: selected ? `2px solid ${colors.primary}` : '2px dashed rgba(201,106,142,0.35)', outlineOffset: 1 }
    : {};
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className={`as-bubble-user max-w-[78%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap text-white relative`}
          style={{ background: colors.bubbleUser, borderTopRightRadius: 6, boxShadow: '0 2px 10px rgba(227,164,188,0.3)', ...selStyle }}
          {...lp}
          onClick={selectMode ? onToggleSelect : undefined}
        >
          {selected && (
            <span className="absolute -left-2 -top-2 w-5 h-5 rounded-full flex items-center justify-center text-white"
              style={{ background: colors.primary, boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }}>
              ✓
            </span>
          )}
          {m.imageRef && <UserImage ref0={m.imageRef} />}
          {m.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div
        className="as-bubble-ai max-w-[88%] rounded-2xl px-3 py-2 relative"
        style={{ background: colors.bubbleAi, borderTopLeftRadius: 6, border: '1px solid rgba(255,255,255,0.6)', boxShadow: '0 2px 8px rgba(201,106,142,0.06)', ...selStyle }}
        {...lp}
        onClick={selectMode ? onToggleSelect : undefined}
      >
        {selected && (
          <span className="absolute -left-2 -top-2 w-5 h-5 rounded-full flex items-center justify-center text-white"
            style={{ background: colors.primary, boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }}>
            ✓
          </span>
        )}
        {renderContent(m.content, m.id)}
      </div>
    </div>
  );
};

/** 美化提示词编辑项（齿轮里的「美化分类」；改了立刻生效，不用重载） */
const AssistantPromptItem: React.FC<{ label: string; description: string; colors: AssistantColors }> = ({ label, description, colors }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(getPrompt(label));
  const [saved, setSaved] = useState(false);
  const overridden = isPromptOverridden(label);
  const flash = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };
  return (
    <div className="rounded-xl" style={{ background: 'rgba(201,106,142,0.05)', border: '1px solid rgba(201,106,142,0.12)' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-2 cursor-pointer border-0 bg-transparent text-left"
      >
        <CaretDown size={12} style={{ color: colors.muted, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold" style={{ color: colors.text }}>{label.replace('美化助手-', '')}</span>
            {overridden && (
              <span className="text-[8px] px-1.5 py-0.5 rounded-full" style={{ background: '#fdeef0', color: '#e35d6a' }}>已改过</span>
            )}
          </div>
          <div className="text-[9px] mt-0.5 truncate" style={{ color: colors.faint }}>{description}</div>
        </div>
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="w-full rounded-xl px-2.5 py-2 outline-none text-[10px] leading-relaxed"
            style={{ color: colors.text, resize: 'vertical', border: '1px solid rgba(201,106,142,0.2)', background: 'rgba(255,255,255,0.7)' }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { savePrompt(label, text); flash(); }}
              className="px-3 py-1.5 rounded-full text-[10px] font-semibold text-white cursor-pointer border-0"
              style={{ background: saved ? '#6cae7e' : colors.primary, transition: 'background 0.3s' }}
            >
              {saved ? '已保存 ✓' : '保存'}
            </button>
            <button
              type="button"
              onClick={() => { resetPrompt(label); setText(getPromptEntries().find((e) => e.label === label)?.defaultValue ?? ''); flash(); }}
              disabled={!overridden}
              className="px-3 py-1.5 rounded-full text-[10px] font-medium cursor-pointer border-0 disabled:opacity-40"
              style={{ color: colors.muted, background: 'rgba(201,106,142,0.08)' }}
            >
              恢复默认
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssistantApp;

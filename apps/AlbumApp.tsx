// 相册 App（我的相册）— 近期接收 / 我的留档 / 收藏夹 / 角色相册 / 他最近看过
// 数据源：memory_archive（localStorage 留档卡片）+ image_receipts（IndexedDB 原图备份）
// 规则：留档卡片不存原图（缩略图仅展示）；原图只在近期接收和聊天框可看。
// 转发格式：[历史照片：xxx]，AI 只读文本不读图。
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import type { CharacterProfile } from '../types';
import ConfirmDialog from '../components/os/ConfirmDialog';
import TokenImg from '../components/os/TokenImg';
import ImageReceiptsApp from './ImageReceiptsApp';
import { loadImageGenSettings } from '../utils/imageGenStorage';
import DataBackupPanel from './couple/DataBackupPanel';
import {
  loadArchive, updateArchive, deleteArchives, toggleFavorite,
  searchArchives, formatArchiveTime, buildForwardText, compactArchiveThumbnails, type ArchiveEntry, type ArchiveKind,
} from '../utils/archive';
import { startBgTask, startBgTaskForResult, isBgTaskStale } from '../utils/bgTask';
import { albumBgStore, albumBgStoreApi, setRecallResult } from './couple/albumBgStore';

type View =
  | { name: 'home' }
  | { name: 'myAlbums' }
  | { name: 'receipts' }
  | { name: 'archives' }
  | { name: 'favorites' }
  | { name: 'charAlbum'; charId: string };

type KindFilter = 'all' | ArchiveKind;
const KIND_LABEL: Record<ArchiveKind, string> = { camera: '相机', chat: '聊天', board: '留言板', together: '和Ta' };
const kindOf = (e: ArchiveEntry): ArchiveKind =>
  (e.kind === 'chat' || e.kind === 'board' || e.kind === 'together') ? e.kind : 'camera';

const clamp5: React.CSSProperties = {
  display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden',
};

// 居中弹层容器：只有「按下时」就在遮罩上才允许点击关闭，
// 防止键盘弹起卡片抬升后，手指抬起落在遮罩上误关弹窗（iOS 弹一下又回去的元凶）
const ModalOverlay: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => {
  const startedOnBackdrop = useRef(false);
  return (
    <div
      className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4"
      onMouseDown={(e) => { startedOnBackdrop.current = e.target === e.currentTarget; }}
      onTouchStart={(e) => { startedOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={() => { if (startedOnBackdrop.current) onClose(); }}
    >
      {children}
    </div>
  );
};

// ── 通用顶栏 ──
const SectionHeader: React.FC<{
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
}> = ({ title, onBack, right }) => (
  <div className="bg-white/80 backdrop-blur-xl border-b border-slate-100/60 shrink-0 z-10" style={{ paddingTop: 'var(--chrome-top)' }}>
    <div className="h-14 flex items-center px-4">
      <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-black/5 active:scale-90 transition-transform">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-600"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
      </button>
      <h1 className="text-base font-semibold text-slate-800 ml-1 tracking-tight">{title}</h1>
      <div className="ml-auto flex items-center gap-1">{right}</div>
    </div>
  </div>
);

// ── 角色头像（dataUrl / emoji 都兼容） ──
const CharAvatar: React.FC<{ char: CharacterProfile | null; fallbackName: string; className?: string }> = ({
  char, fallbackName, className = 'w-9 h-9',
}) => {
  const avatar = char?.avatar || '';
  if (avatar && /^(data:|blob:|blobref:|https?:)/.test(avatar)) {
    return <TokenImg value={avatar} alt={char?.name || fallbackName} className={`${className} rounded-full object-cover shrink-0 bg-slate-100`} />;
  }
  return (
    <div className={`${className} rounded-full bg-[#ffe6eb] flex items-center justify-center shrink-0`}>
      <span className="text-sm text-[#383639] font-medium">{avatar || (char?.name || fallbackName).slice(0, 1)}</span>
    </div>
  );
};

// ── 留档卡片 ──
const ArchiveCard: React.FC<{
  e: ArchiveEntry;
  selectMode: boolean;
  selected: boolean;
  onOpen: (e: ArchiveEntry) => void;
  onToggleSelect: (id: string) => void;
  onMutate: () => void;
}> = ({ e, selectMode, selected, onOpen, onToggleSelect, onMutate }) => (
  <div
    className="relative bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm cursor-pointer active:scale-[0.98] transition-transform"
    onClick={() => (selectMode ? onToggleSelect(e.id) : onOpen(e))}
  >
    <div className="aspect-square bg-slate-100 overflow-hidden">
      {e.thumbnail
        ? <img src={e.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
        : <div className="w-full h-full flex items-center justify-center text-2xl text-slate-300">🖼️</div>}
    </div>
    {/* 收藏 */}
    <button
      type="button"
      onClick={(ev) => { ev.stopPropagation(); toggleFavorite(e.id); onMutate(); }}
      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/85 shadow flex items-center justify-center text-sm active:scale-90"
    >
      {e.favorite ? '❤️' : '♡'}
    </button>
    {/* 批量勾选 */}
    {selectMode && (
      <div className={`absolute top-1.5 left-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center text-white text-xs font-bold ${selected ? 'bg-[#383639] border-[#383639]' : 'border-white bg-black/25'}`}>
        {selected ? '✓' : ''}
      </div>
    )}
    <div className="p-2.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-slate-700 truncate">{e.charName}</span>
        <span className="text-slate-400 shrink-0 ml-1">{formatArchiveTime(e.timestamp, false)}</span>
      </div>
      {e.summary && <p className="mt-1 text-xs text-slate-600 leading-relaxed" style={clamp5}>{e.summary}</p>}
      <p className="mt-1.5 text-[10px] text-slate-300">点击查看详情 →</p>
    </div>
  </div>
);

// ── 留档详情大卡片 ──
const ArchiveDetailModal: React.FC<{
  entry: ArchiveEntry;
  onClose: () => void;
  onMutate: () => void;
  addToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
  characters: CharacterProfile[];
}> = ({ entry, onClose, onMutate, addToast, characters }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ summary: '', description: '', tags: '', date: '', kind: 'camera' as ArchiveKind });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);

  // ── 键盘抬升（a2 同款算法）：聚焦时量输入框到屏底距离，键盘弹起抬卡片 ──
  const cardRef = useRef<HTMLDivElement>(null);
  const vvHandlerRef = useRef<(() => void) | null>(null);
  const baseDistRef = useRef(90);
  const onFieldFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const el = e.target;
    baseDistRef.current = window.innerHeight - el.getBoundingClientRect().bottom;
    const onResize = () => {
      const card = cardRef.current;
      const vv = window.visualViewport;
      if (!card || !vv) return;
      const offset = window.innerHeight - vv.height;
      card.style.transform = offset > 100
        ? `translateY(-${Math.max(0, offset - baseDistRef.current + 8)}px)`
        : '';
    };
    vvHandlerRef.current = onResize;
    window.visualViewport?.addEventListener('resize', onResize);
  };
  const onFieldBlur = () => {
    if (cardRef.current) cardRef.current.style.transform = '';
    if (vvHandlerRef.current && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', vvHandlerRef.current);
      vvHandlerRef.current = null;
    }
  };

  const startEdit = () => {
    const d = new Date(entry.timestamp);
    const pad = (n: number) => String(n).padStart(2, '0');
    setDraft({
      summary: entry.summary,
      description: entry.description,
      tags: (entry.tags || []).join('，'),
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      kind: kindOf(entry),
    });
    setEditing(true);
  };

  const saveEdit = () => {
    const old = new Date(entry.timestamp);
    const [y, m, d] = draft.date.split('-').map(Number);
    const ts = y && m && d
      ? new Date(y, m - 1, d, old.getHours(), old.getMinutes()).getTime()
      : entry.timestamp;
    updateArchive(entry.id, {
      summary: draft.summary.trim(),
      description: draft.description.trim(),
      tags: draft.tags.split(/[,，、]/).map(t => t.trim()).filter(Boolean),
      timestamp: ts,
      kind: draft.kind,
    });
    setEditing(false);
    onMutate();
    addToast('已保存', 'success');
  };

  // 转发：先选目标角色，再以「照片卡片」形式发到聊天框（AI 只读文本标记）
  const confirmForward = async (target: CharacterProfile) => {
    try {
      await DB.saveMessage({
        charId: target.id,
        role: 'system',
        type: 'text',
        content: buildForwardText(entry),
        metadata: {
          source: 'album_forward',
          forwardCard: {
            thumbnail: entry.thumbnail,
            charName: entry.charName,
            timestamp: entry.timestamp,
            summary: entry.summary || entry.description,
          },
        },
      });
      addToast(`已转发给 ${target.name} 📤`, 'success');
      setForwardOpen(false);
      onClose();
    } catch {
      addToast('转发失败', 'error');
    }
  };

  const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="text-xs leading-relaxed">
      <div className="text-slate-400 mb-0.5">{label}</div>
      {children}
    </div>
  );

  return (
    <ModalOverlay onClose={onClose}>
      <div ref={cardRef} className="bg-white rounded-3xl w-full max-w-sm max-h-[88vh] overflow-y-auto transition-transform">
        <div className="h-44 bg-slate-100 overflow-hidden shrink-0">
          {entry.thumbnail
            ? <img src={entry.thumbnail} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-3xl text-slate-300">🖼️</div>}
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { toggleFavorite(entry.id); onMutate(); }}
              className="w-7 h-7 rounded-full bg-[#ffe6eb] flex items-center justify-center text-sm active:scale-90"
            >
              {entry.favorite ? '❤️' : '♡'}
            </button>
            <span className="font-semibold text-slate-800">{entry.charName}</span>
            <span className="text-xs text-slate-400 ml-auto">{formatArchiveTime(entry.timestamp, false)}</span>
          </div>

          {editing ? (
            <div className="space-y-3">
              <Field label="日期">
                <input type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} onFocus={onFieldFocus} onBlur={onFieldBlur}
                  className="w-full text-xs rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-slate-700 focus:outline-none" />
              </Field>
              <Field label="摘要">
                <textarea value={draft.summary} onChange={e => setDraft({ ...draft, summary: e.target.value })} rows={4} onFocus={onFieldFocus} onBlur={onFieldBlur}
                  className="w-full text-xs rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-slate-700 focus:outline-none resize-none" />
              </Field>
              <Field label="描述">
                <textarea value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} rows={3} onFocus={onFieldFocus} onBlur={onFieldBlur}
                  className="w-full text-xs rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-slate-700 focus:outline-none resize-none" />
              </Field>
              <Field label="标签（逗号分隔）">
                <input value={draft.tags} onChange={e => setDraft({ ...draft, tags: e.target.value })} onFocus={onFieldFocus} onBlur={onFieldBlur}
                  className="w-full text-xs rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-slate-700 focus:outline-none" />
              </Field>
              <Field label="来源">
                <select value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as ArchiveKind })}
                  className="w-full text-xs rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-slate-700 focus:outline-none">
                  {(['camera', 'chat', 'board', 'together'] as const).map(k => (
                    <option key={k} value={k}>{KIND_LABEL[k]}</option>
                  ))}
                </select>
              </Field>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="日期">{formatArchiveTime(entry.timestamp)}</Field>
              {entry.summary && <Field label="摘要"><span className="text-slate-700 whitespace-pre-wrap">{entry.summary}</span></Field>}
              {entry.description && <Field label="描述"><span className="text-slate-700 whitespace-pre-wrap">{entry.description}</span></Field>}
              {entry.prefixPrompt && <Field label="生图词前缀"><span className="text-slate-400 select-text">{entry.prefixPrompt}</span></Field>}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">类型</span>
                <span className="px-2 py-0.5 rounded-full bg-[#ffe6eb] text-[#383639]">{KIND_LABEL[kindOf(entry)]}</span>
              </div>
              {(entry.tags || []).length > 0 && (
                <Field label="标签">
                  <div className="flex flex-wrap gap-1.5">
                    {entry.tags.map((t, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px]">#{t}</span>
                    ))}
                  </div>
                </Field>
              )}
            </div>
          )}

          <div className="grid grid-cols-4 gap-2 pt-1">
            {editing ? (
              <>
                <button onClick={saveEdit} className="col-span-2 py-2.5 rounded-xl bg-[#383639] text-white text-xs font-medium active:scale-95 transition-transform">保存</button>
                <button onClick={() => setEditing(false)} className="col-span-2 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-medium active:scale-95 transition-transform">取消</button>
              </>
            ) : (
              <>
                <button onClick={() => setForwardOpen(true)} className="py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-medium active:scale-95 transition-transform">转发</button>
                <button onClick={() => { toggleFavorite(entry.id); onMutate(); }} className="py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-medium active:scale-95 transition-transform">
                  {entry.favorite ? '取消收藏' : '收藏'}
                </button>
                <button onClick={() => setConfirmDelete(true)} className="py-2.5 rounded-xl bg-red-50 text-red-500 text-xs font-medium active:scale-95 transition-transform">删除</button>
                <button onClick={startEdit} className="py-2.5 rounded-xl bg-[#ffe6eb] text-[#383639] text-xs font-medium active:scale-95 transition-transform">编辑</button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 转发选角色 */}
      {forwardOpen && (
        <ModalOverlay onClose={() => setForwardOpen(false)}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-800 text-center">转发给谁？</h3>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {characters.map(c => (
                <button
                  key={c.id}
                  onClick={() => void confirmForward(c)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#ffe6eb] text-[#383639] text-xs active:scale-95 transition-transform"
                >
                  <CharAvatar char={c} fallbackName={c.name} className="w-5 h-5" />
                  {c.name}
                </button>
              ))}
            </div>
            <button onClick={() => setForwardOpen(false)} className="w-full py-2 rounded-xl text-xs text-slate-400 active:scale-95">取消</button>
          </div>
        </ModalOverlay>
      )}

      {confirmDelete && (
        <ConfirmDialog
          isOpen
          title="确定删除这张留档吗？"
          message="此操作不可恢复。"
          variant="danger"
          confirmText="确定删除"
          onConfirm={() => {
            deleteArchives([entry.id]);
            setConfirmDelete(false);
            onClose();
            onMutate();
            addToast('已删除', 'success');
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </ModalOverlay>
  );
};

// ── 留档列表（我的留档 / 收藏夹 / 角色相册共用） ──
const ArchiveListSection: React.FC<{
  title: string;
  entries: ArchiveEntry[];
  onBack: () => void;
  onMutate: () => void;
  addToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
  characters: CharacterProfile[];
  batchKind: 'archive' | 'favorite';
  showFromUserFilter?: boolean;
  showCharFilter?: boolean;
}> = ({ title, entries, onBack, onMutate, addToast, characters, batchKind, showFromUserFilter, showCharFilter }) => {
  const [searchOn, setSearchOn] = useState(false);
  const [q, setQ] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [charFilter, setCharFilter] = useState<string>('all');
  const [fromUserFilter, setFromUserFilter] = useState<'all' | 'me'>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagModal, setTagModal] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [pendingBatchDelete, setPendingBatchDelete] = useState(false);
  const albumBg = albumBgStore.use();
  const pendingTag = albumBg.pendingAutoTag;
  const taggingRunning = pendingTag?.status === 'running' && !isBgTaskStale(pendingTag);
  const taggingInterrupted = pendingTag?.status === 'running' && isBgTaskStale(pendingTag);

  const [detailEntry, setDetailEntry] = useState<ArchiveEntry | null>(null);

  const filtered = useMemo(() => {
    let list = searchArchives(entries, q);
    if (kindFilter !== 'all') list = list.filter(e => kindOf(e) === kindFilter);
    if (showCharFilter && charFilter !== 'all') list = list.filter(e => e.charId === charFilter);
    if (showFromUserFilter && fromUserFilter === 'me') list = list.filter(e => e.fromUser);
    if (monthFilter !== 'all') {
      list = list.filter(e => {
        const d = new Date(e.timestamp);
        return `${d.getFullYear()}-${d.getMonth() + 1}` === monthFilter;
      });
    }
    return list;
  }, [entries, q, kindFilter, charFilter, fromUserFilter, monthFilter, showCharFilter, showFromUserFilter]);

  const months = useMemo(() => {
    const s = new Set<string>();
    entries.forEach(e => {
      const d = new Date(e.timestamp);
      s.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
    });
    return [...s].sort().reverse();
  }, [entries]);

  const charList = useMemo(() => {
    const s = new Map<string, string>();
    entries.forEach(e => { if (!s.has(e.charId)) s.set(e.charId, e.charName); });
    return [...s.entries()];
  }, [entries]);

  const toggleSel = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); setTagModal(false); };

  const applyTags = (tags: string[]) => {
    selected.forEach(id => {
      const e = entries.find(x => x.id === id);
      if (!e) return;
      const merged = [...(e.tags || [])];
      tags.forEach(t => { if (!merged.includes(t)) merged.push(t); });
      updateArchive(id, { tags: merged });
    });
    onMutate();
  };

  const manualTag = () => {
    const tags = tagInput.split(/[,，、]/).map(t => t.trim()).filter(Boolean);
    if (tags.length === 0) { addToast('先填标签', 'info'); return; }
    applyTags(tags);
    setTagModal(false);
    setTagInput('');
    exitSelect();
    addToast(`已给 ${selected.size} 张留档打标`, 'success');
  };

  // 自动打标：调提示词生成模型，一次性返回 JSON（后台跑，选中项在点按钮瞬间快照；
  // 生成中可离开页面，标签写 localStorage，回来重读就有）
  const autoTag = () => {
    const gs = loadImageGenSettings();
    if (!gs.promptGenApiKey || !gs.promptGenBaseUrl || !gs.promptGenModel) {
      addToast('未配置提示词生成模型（在相机 ⚙ 里配）', 'error');
      return;
    }
    const items = [...selected].map(id => entries.find(e => e.id === id)).filter(Boolean) as ArchiveEntry[];
    if (items.length === 0) return;
    void startBgTask(albumBgStoreApi, 'pendingAutoTag', 'album-autotag', async () => {
      const res = await fetch(`${gs.promptGenBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gs.promptGenApiKey}` },
        body: JSON.stringify({
          model: gs.promptGenModel,
          messages: [
            { role: 'system', content: '你是照片归档助手。根据留档摘要给出简洁中文标签。只输出 JSON 数组，格式 [{"i":0,"tags":["标签1","标签2"]}]，每项 2-4 个标签，不要任何解释。' },
            { role: 'user', content: JSON.stringify(items.map((e, i) => ({ i, text: `${e.summary || ''} ${e.description || ''}`.slice(0, 200) }))) },
          ],
          max_tokens: 2000,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw: string = data?.choices?.[0]?.message?.content || '';
      const jsonStr = raw.replace(/```json|```/g, '').trim();
      let parsed: { i: number; tags: string[] }[];
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        const words = raw.replace(/[\[\]{}"：:]/g, ' ').split(/[,，、\s]+/).filter(w => w.length > 0 && w.length <= 8).slice(0, 12);
        parsed = [{ i: 0, tags: words }];
      }
      if (!Array.isArray(parsed)) throw new Error('返回格式不对');
      let applied = 0;
      parsed.forEach(p => {
        const item = items[p.i];
        if (!item || !Array.isArray(p.tags)) return;
        applyTagsTo(item.id, p.tags.map(String));
        applied++;
      });
      if (applied === 0) throw new Error('没有应用到任何卡片');
      onMutate();
      setTagModal(false);
      exitSelect();
      addToast(`自动打标完成（${applied} 张）`, 'success');
    }).then((started) => {
      if (!started) addToast('自动打标还在进行中', 'info');
    });
  };

  const applyTagsTo = (id: string, tags: string[]) => {
    const e = entries.find(x => x.id === id);
    if (!e) return;
    const merged = [...(e.tags || [])];
    tags.forEach(t => { if (!merged.includes(t)) merged.push(t); });
    updateArchive(id, { tags: merged });
  };

  const batchDelete = () => {
    deleteArchives([...selected]);
    setPendingBatchDelete(false);
    exitSelect();
    onMutate();
    addToast(`已删除 ${selected.size} 张留档`, 'success');
  };

  const batchUnfavorite = () => {
    selected.forEach(id => updateArchive(id, { favorite: false }));
    exitSelect();
    onMutate();
    addToast('已移除收藏', 'success');
  };

  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap shrink-0 transition-colors ${active ? 'bg-[#383639] text-white' : 'bg-white text-slate-500 border border-slate-200'}`;

  return (
    <div className="h-full bg-slate-50 flex flex-col relative">
      <SectionHeader
        title={title}
        onBack={onBack}
        right={
          <>
            <button
              onClick={() => { setSearchOn(v => !v); if (searchOn) setQ(''); }}
              className={`p-2 rounded-full active:scale-90 transition-all ${searchOn ? 'bg-[#ffe6eb] text-[#383639]' : 'text-slate-400 hover:bg-black/5'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
            </button>
            <button
              onClick={() => setSelectMode(v => !v)}
              className={`text-xs font-medium px-2.5 py-1.5 rounded-full active:scale-95 transition-all ${selectMode ? 'bg-[#383639] text-white' : 'bg-[#ffe6eb] text-[#383639]'}`}
            >
              {selectMode ? '退出编辑' : batchKind === 'favorite' ? '批量移除收藏' : '批量编辑'}
            </button>
          </>
        }
      />

      {searchOn && (
        <div className="px-3 pt-2 shrink-0">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="搜索角色 / 标签 / 关键词…"
            className="w-full text-xs rounded-full bg-white border border-slate-200 px-4 py-2 text-slate-700 focus:outline-none"
          />
        </div>
      )}

      {/* 筛选行 */}
      <div className="flex gap-1.5 px-3 pt-2 overflow-x-auto shrink-0" style={{ scrollbarWidth: 'none' }}>
        <button className={chip(kindFilter === 'all')} onClick={() => setKindFilter('all')}>全部</button>
        {(['camera', 'chat', 'board', 'together'] as const).map(k => (
          <button key={k} className={chip(kindFilter === k)} onClick={() => setKindFilter(k)}>{KIND_LABEL[k]}</button>
        ))}
        {showFromUserFilter && (
          <button className={chip(fromUserFilter === 'me')} onClick={() => setFromUserFilter(v => v === 'all' ? 'me' : 'all')}>只看个人的</button>
        )}
        <select
          value={monthFilter}
          onChange={e => setMonthFilter(e.target.value)}
          className="text-[11px] rounded-full border border-slate-200 bg-white text-slate-500 px-2 py-1 focus:outline-none shrink-0"
        >
          <option value="all">全部时间</option>
          {months.map(m => {
            const [y, mo] = m.split('-');
            return <option key={m} value={m}>{y}年{mo}月</option>;
          })}
        </select>
      </div>
      {showCharFilter && charList.length > 1 && (
        <div className="flex gap-1.5 px-3 pt-1.5 overflow-x-auto shrink-0" style={{ scrollbarWidth: 'none' }}>
          <button className={chip(charFilter === 'all')} onClick={() => setCharFilter('all')}>全部角色</button>
          {charList.map(([id, name]) => (
            <button key={id} className={chip(charFilter === id)} onClick={() => setCharFilter(id)}>{name}</button>
          ))}
        </div>
      )}

      {/* 卡片网格 */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3 pb-24">
            <div className="text-4xl">📔</div>
            <p className="text-sm">还没有留档</p>
            <p className="text-[11px] text-slate-300">去相机里拍一张，点「留档」就能存到这里</p>
          </div>
        ) : (
          <div className={`grid grid-cols-2 gap-2.5 p-3 ${selectMode ? 'pb-24' : ''}`}>
            {filtered.map(e => (
              <ArchiveCard
                key={e.id}
                e={e}
                selectMode={selectMode}
                selected={selected.has(e.id)}
                onOpen={setDetailEntry}
                onToggleSelect={toggleSel}
                onMutate={onMutate}
              />
            ))}
          </div>
        )}
      </div>

      {/* 批量操作底栏 */}
      {selectMode && (
        <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-100 z-30" style={{ paddingBottom: 'max(12px, var(--safe-bottom))' }}>
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
            <button
              onClick={() => {
                const all = filtered.map(e => e.id);
                setSelected(prev => prev.size === all.length ? new Set() : new Set(all));
              }}
              className="text-xs text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-full active:scale-95"
            >
              {selected.size === filtered.length ? '取消全选' : '全选'}
            </button>
            <span className="flex-1 text-[11px] text-slate-400">已选 {selected.size} 张</span>
            {batchKind === 'archive' && (
              <button onClick={() => setTagModal(true)} className="text-xs text-[#383639] bg-[#ffe6eb] px-2.5 py-1.5 rounded-full active:scale-95">打标</button>
            )}
            <button
              onClick={() => (batchKind === 'archive' ? setPendingBatchDelete(true) : batchUnfavorite())}
              className="text-xs text-red-500 bg-red-50 px-2.5 py-1.5 rounded-full active:scale-95"
            >
              {batchKind === 'archive' ? '删除' : '移除收藏'}
            </button>
          </div>
        </div>
      )}

      {/* 打标弹窗 */}
      {tagModal && (
        <ModalOverlay onClose={() => setTagModal(false)}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 text-center">批量打标（{selected.size} 张）</h3>
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              placeholder="标签1，标签2…"
              className="w-full text-xs rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-slate-700 focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={manualTag} className="py-2.5 rounded-xl bg-[#383639] text-white text-xs font-medium active:scale-95">手动打标</button>
              <button
                onClick={() => autoTag()}
                disabled={taggingRunning}
                className="py-2.5 rounded-xl bg-[#ffe6eb] text-[#383639] text-xs font-medium active:scale-95 disabled:opacity-60"
              >
                {taggingRunning ? '打标中…（可离开页面）' : '自动打标'}
              </button>
            </div>
            {taggingInterrupted && !taggingRunning && (
              <p className="text-[11px] text-amber-600">上次打标中断了（页面刷新过），点自动打标接着跑</p>
            )}
            {pendingTag?.status === 'failed' && !taggingRunning && (
              <p className="text-[11px] text-red-500">上次打标失败：{pendingTag.error}，可重试</p>
            )}
            <button onClick={() => setTagModal(false)} className="w-full py-2 rounded-xl text-xs text-slate-400 active:scale-95">取消</button>
          </div>
        </ModalOverlay>
      )}

      {/* 批量删除确认 */}
      {pendingBatchDelete && (
        <ConfirmDialog
          isOpen
          title={`确定删除 ${selected.size} 张留档吗？`}
          message="此操作不可恢复。"
          variant="danger"
          confirmText="确定删除"
          onConfirm={batchDelete}
          onCancel={() => setPendingBatchDelete(false)}
        />
      )}

      {/* 详情大卡片 */}
      {detailEntry && (
        <ArchiveDetailModal
          entry={detailEntry}
          onClose={() => setDetailEntry(null)}
          onMutate={onMutate}
          addToast={addToast}
          characters={characters}
        />
      )}
    </div>
  );
};

// ── 他最近看过… ──
const RecallModal: React.FC<{
  onClose: () => void;
  characters: CharacterProfile[];
  apiConfig: { baseUrl: string; apiKey: string; model: string };
  addToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
}> = ({ onClose, characters, apiConfig, addToast }) => {
  const [charId, setCharId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [result, setResult] = useState('');
  const [syncOn, setSyncOn] = useState(false);
  const char = characters.find(c => c.id === charId) || null;
  const albumBg = albumBgStore.use();
  const pendingRecall = albumBg.pendingRecall;
  const recallRunning = pendingRecall?.status === 'running' && !isBgTaskStale(pendingRecall);
  const recallInterrupted = pendingRecall?.status === 'running' && isBgTaskStale(pendingRecall);
  const storeResult = albumBg.recallResult && albumBg.recallResult.charId === charId ? albumBg.recallResult.text : '';
  const shownResult = result || storeResult;

  const generate = () => {
    if (!char) { addToast('先选一个角色', 'info'); return; }
    if (!apiConfig.baseUrl || !apiConfig.apiKey || !apiConfig.model) { addToast('未配置聊天模型', 'error'); return; }
    const sync = syncOn;
    void startBgTaskForResult(albumBgStoreApi, 'pendingRecall', 'album-recall', async () => {
      setResult('');
      const msgs = await DB.getMessagesByCharId(char.id);
      const recent = msgs
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-12)
        .map(m => `${m.role === 'user' ? '我' : char.name}：${(typeof m.content === 'string' ? m.content : '[图片]').replace(/\s+/g, ' ').slice(0, 200)}`);
      const cards = loadArchive().filter(a => a.charId === char.id && (a.summary || a.description)).slice(0, 5);
      const system = `${char.systemPrompt || ''}\n${char.worldview ? `世界观：${char.worldview}` : ''}`.trim();
      const user = [
        `【补充提示词】${note.trim() || '（无）'}`,
        `【最近聊天】\n${recent.join('\n') || '（无）'}`,
        `【最近留档照片】\n${cards.map(c => `· ${(c.summary || c.description).slice(0, 120)}`).join('\n') || '（无）'}`,
        `\n请代入${char.name}，写一段TA翻看这些旧照片时的观后感（300字内，自然口语，不要用markdown格式）。`,
      ].join('\n\n');
      const baseUrl = apiConfig.baseUrl.replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiConfig.apiKey}` },
        body: JSON.stringify({
          model: apiConfig.model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          max_tokens: 4000, // 推理模型的 thinking 会吃额度，给足
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const text: string = data?.choices?.[0]?.message?.content || '';
      if (!text.trim()) throw new Error('空回复');
      setResult(text);
      setRecallResult({ charId: char.id, charName: char.name, text, at: Date.now() });
      if (sync) {
        await DB.saveMessage({
          charId: char.id, role: 'system', type: 'text',
          content: `🖼 翻看旧照片\n\n${text}`,
          metadata: { source: 'album_recall' },
        });
        addToast('已同步到聊天上下文 📤', 'success');
      } else {
        addToast('回忆生成完成', 'success');
      }
    }).then(({ started }) => {
      if (!started) addToast('回忆生成还在进行中', 'info');
    });
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm max-h-[88vh] overflow-y-auto p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-800 text-center">他最近看过…</h3>
        <div className="space-y-2">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">选择角色</div>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
            {characters.map(c => (
              <button
                key={c.id}
                onClick={() => setCharId(c.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs transition-colors ${charId === c.id ? 'bg-[#ffe6eb] text-[#383639]' : 'bg-slate-100 text-slate-600'}`}
              >
                <CharAvatar char={c} fallbackName={c.name} className="w-5 h-5" />
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          placeholder="补充提示词（可选），比如「聊聊上周那张合照」"
          className="w-full text-xs rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-slate-700 focus:outline-none resize-none"
        />
        {shownResult && (
          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto">{shownResult}</div>
        )}
        {recallInterrupted && !recallRunning && (
          <p className="text-[11px] text-amber-600">上次生成中断了（页面刷新过），点生成接着跑</p>
        )}
        {pendingRecall?.status === 'failed' && !recallRunning && (
          <p className="text-[11px] text-red-500">上次生成失败：{pendingRecall.error}，点生成重试</p>
        )}
        <label className="flex items-center justify-between text-xs text-slate-500">
          <span>本次回忆同步到聊天上下文</span>
          <input type="checkbox" checked={syncOn} onChange={e => setSyncOn(e.target.checked)} className="accent-[#383639] w-4 h-4" />
        </label>
        <button
          onClick={() => generate()}
          disabled={recallRunning}
          className="w-full py-3 rounded-xl bg-[#383639] text-white text-sm font-medium active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {recallRunning ? '回忆中…（可离开弹窗）' : shownResult ? '重新生成' : '生成'}
        </button>
        <button onClick={onClose} className="w-full py-2 rounded-xl text-xs text-slate-400 active:scale-95">关闭</button>
      </div>
    </ModalOverlay>
  );
};

// ── 设置卡片 ──
const SettingsCard: React.FC<{
  archiveCount: number;
  receiptCount: number;
  onClose: () => void;
}> = ({ archiveCount, receiptCount, onClose }) => {
  const gs = loadImageGenSettings();
  const promptGenOk = !!(gs.promptGenApiKey && gs.promptGenBaseUrl && gs.promptGenModel);
  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-800 text-center">相册设置</h3>
        <div className="space-y-2 text-xs text-slate-600">
          <div className="flex justify-between"><span>留档卡片</span><span className="text-slate-400">{archiveCount} / 200</span></div>
          <div className="flex justify-between"><span>近期接收原图</span><span className="text-slate-400">{receiptCount} 张</span></div>
          <div className="flex justify-between">
            <span>提示词生成模型</span>
            <span className={promptGenOk ? 'text-emerald-500' : 'text-amber-500'}>{promptGenOk ? '已配置' : '未配置'}</span>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          留档摘要与自动打标使用提示词生成模型，在「相机 ⚙ 设置」里配置。
          留档卡片只存缩略图，原图在近期接收里。
        </p>
        {/* 数据备份（2026-09-04 分功能入口） */}
        <div className="pt-2 border-t border-slate-100">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">数据备份</div>
          <DataBackupPanel scope="album" />
        </div>
        <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-[#ffe6eb] text-[#383639] text-xs font-medium active:scale-95">关闭</button>
      </div>
    </ModalOverlay>
  );
};

// ── 相册 App 主组件 ──
const AlbumApp: React.FC = () => {
  const { closeApp, characters, apiConfig, addToast } = useOS();
  const [view, setView] = useState<View>({ name: 'home' });
  const [archive, setArchive] = useState<ArchiveEntry[]>(() => loadArchive());
  const [receiptCount, setReceiptCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showRecall, setShowRecall] = useState(false);

  const refresh = useCallback(() => setArchive(loadArchive()), []);

  useEffect(() => {
    DB.getAllImageReceipts().then(rs => setReceiptCount(rs.length)).catch(() => {});
    // 旧留档存的是全尺寸缩略图，会撑爆 localStorage 配额；挂载时压一遍并刷新列表
    void compactArchiveThumbnails().then(() => setArchive(loadArchive()));
  }, []);

  const favorites = useMemo(() => archive.filter(e => e.favorite), [archive]);

  // 角色相册封面：有 charAlbum 留档的角色
  const albumChars = useMemo(() => {
    const map = new Map<string, { charId: string; charName: string; count: number }>();
    archive.forEach(e => {
      if (!e.charAlbum) return;
      const key = e.charId || e.charName;
      const cur = map.get(key);
      if (cur) cur.count++;
      else map.set(key, { charId: e.charId, charName: e.charName, count: 1 });
    });
    return [...map.values()];
  }, [archive]);

  const charOf = (charId: string) => characters.find(c => c.id === charId) || null;

  const back = () => setView({ name: 'home' });

  // 页面常驻 + 聚焦转场（2026-09-14 定稿规范）：访问过的视图留在树上（display:none 隐藏、不卸载），
  // 切视图时旧页 260ms 失焦淡出、新页 120ms 后 340ms 聚焦淡入，460ms 收工并摘掉动画类。
  const vkey = (v: View) => (v.name === 'charAlbum' ? `charAlbum:${v.charId}` : v.name);
  const [shownView, setShownView] = useState<View>(view);
  const [focusing, setFocusing] = useState(false);
  const [mountedViews, setMountedViews] = useState<View[]>([view]);
  const lastViewRef = useRef(vkey(view));
  useEffect(() => {
    const k = vkey(view);
    if (lastViewRef.current === k) return;
    lastViewRef.current = k;
    setMountedViews(m => (m.some(v => vkey(v) === k) ? m : [...m, view]));
    setFocusing(true);
    const t = window.setTimeout(() => { setShownView(view); setFocusing(false); }, 460);
    return () => window.clearTimeout(t);
  }, [view]);

  const renderBody = (view: View) => (
    <>
      {view.name === 'receipts' ? (
        /* 内嵌页：进场动画交给外层视图层（聚焦转场），这里不再自带淡入 */
        <div className="h-full">
          <ImageReceiptsApp embedded onEmbeddedBack={() => setView({ name: 'myAlbums' })} />
        </div>
      ) : view.name === 'archives' ? (
        <ArchiveListSection
          title="我的留档"
          entries={archive}
          onBack={back}
          onMutate={refresh}
          addToast={addToast}
          characters={characters}
          batchKind="archive"
          showCharFilter
        />
      ) : view.name === 'favorites' ? (
        <ArchiveListSection
          title="收藏夹"
          entries={favorites}
          onBack={back}
          onMutate={refresh}
          addToast={addToast}
          characters={characters}
          batchKind="favorite"
          showCharFilter
        />
      ) : view.name === 'charAlbum' ? (
        (() => {
          const meta = albumChars.find(m => m.charId === view.charId);
          return (
            <ArchiveListSection
              title={meta?.charName ? `${meta.charName}的相册` : '角色相册'}
              entries={archive.filter(e => e.charAlbum && e.charId === view.charId)}
              onBack={back}
              onMutate={refresh}
              addToast={addToast}
              characters={characters}
              batchKind="archive"
              showFromUserFilter
            />
          );
        })()
      ) : view.name === 'myAlbums' ? (
        <div className="h-full flex flex-col">
          <SectionHeader title="我的相册" onBack={back} />
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <button
              onClick={() => setView({ name: 'receipts' })}
              className="w-full bg-white rounded-3xl border border-slate-100 shadow-sm p-4 flex items-center gap-4 active:scale-[0.98] transition-transform"
            >
              <div className="w-14 h-14 rounded-2xl bg-sky-50 flex items-center justify-center text-2xl">🗂️</div>
              <div className="flex-1 text-left">
                <div className="text-sm font-semibold text-slate-800">近期接收</div>
                <div className="text-[11px] text-slate-400 mt-0.5">原图备份 · 后悔药 · 可下载到系统相册</div>
              </div>
              <span className="text-xs text-slate-400 font-mono">{receiptCount}</span>
            </button>
            <button
              onClick={() => setView({ name: 'archives' })}
              className="w-full bg-white rounded-3xl border border-slate-100 shadow-sm p-4 flex items-center gap-4 active:scale-[0.98] transition-transform"
            >
              <div className="w-14 h-14 rounded-2xl bg-[#fff5da] flex items-center justify-center text-2xl">📔</div>
              <div className="flex-1 text-left">
                <div className="text-sm font-semibold text-slate-800">我的留档</div>
                <div className="text-[11px] text-slate-400 mt-0.5">文字记忆卡片 · 可编辑 · 可转发</div>
              </div>
              <span className="text-xs text-slate-400 font-mono">{archive.length}</span>
            </button>
          </div>
        </div>
      ) : (
        /* ── 主页 ── */
        <div className="h-full flex flex-col">
          <SectionHeader
            title="相册"
            onBack={closeApp}
            right={
              <button onClick={() => setShowSettings(true)} className="p-2 rounded-full text-slate-400 hover:bg-black/5 active:scale-90 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
              </button>
            }
          />

          <div className="flex-1 overflow-y-auto">
            <div className="p-3 space-y-3">
              {/* 上方 1:2 大入口 */}
              <button
                onClick={() => setView({ name: 'myAlbums' })}
                className="w-full rounded-3xl p-6 flex flex-col items-center justify-center gap-3 active:scale-[0.98] transition-transform shadow-sm"
                style={{ background: 'linear-gradient(160deg, #ffe6eb 0%, #fdf2f8 55%, #ffffff 100%)' }}
              >
                <div className="text-4xl">📸</div>
                <div className="text-base font-bold text-[#383639]">我的相册</div>
                <div className="text-[11px] text-[#8b8b8b]">近期接收 {receiptCount} 张 · 留档 {archive.length} 张</div>
              </button>

              {/* 中间 1:1 两个卡片 */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowRecall(true)}
                  className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 flex flex-col items-center gap-2 active:scale-[0.98] transition-transform"
                >
                  <div className="text-2xl">👀</div>
                  <div className="text-xs font-semibold text-slate-700">他最近看过…</div>
                  <div className="text-[10px] text-slate-400">角色翻旧照片的观后感</div>
                </button>
                <button
                  onClick={() => setView({ name: 'favorites' })}
                  className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 flex flex-col items-center gap-2 active:scale-[0.98] transition-transform"
                >
                  <div className="text-2xl">❤️</div>
                  <div className="text-xs font-semibold text-slate-700">收藏夹</div>
                  <div className="text-[10px] text-slate-400">{favorites.length} 张收藏</div>
                </button>
              </div>

              {/* 角色相册 */}
              <div className="pt-1">
                <div className="text-xs font-semibold text-slate-500 px-1 mb-2">角色相册</div>
                {albumChars.length === 0 ? (
                  <div className="text-center text-[11px] text-slate-300 py-8">
                    留档时勾选「同时存入角色相册」，这里会出现一本本相册
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2.5">
                    {albumChars.map(m => (
                      <button
                        key={m.charId || m.charName}
                        onClick={() => setView({ name: 'charAlbum', charId: m.charId })}
                        className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 flex flex-col items-center gap-2 active:scale-[0.98] transition-transform"
                      >
                        <CharAvatar char={charOf(m.charId)} fallbackName={m.charName} className="w-12 h-12" />
                        <div className="text-[11px] font-medium text-slate-700 w-full truncate text-center">{m.charName}</div>
                        <div className="text-[10px] text-slate-400">{m.count} 张</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="relative h-full bg-slate-50">
      {mountedViews.map((v) => {
        const k = vkey(v);
        const isNew = focusing && k === vkey(view);
        const isOld = k === vkey(shownView);
        return (
          <div
            key={k}
            className={`absolute inset-0${isNew ? ' page-focus' : focusing && isOld ? ' page-defocus' : ''}`}
            style={{ display: isNew || isOld ? undefined : 'none', zIndex: isNew ? 10 : undefined }}
          >
            {renderBody(v)}
          </div>
        );
      })}

      {showRecall && (
        <RecallModal
          onClose={() => setShowRecall(false)}
          characters={characters}
          apiConfig={apiConfig}
          addToast={addToast}
        />
      )}
      {showSettings && (
        <SettingsCard
          archiveCount={archive.length}
          receiptCount={receiptCount}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
};

export default AlbumApp;

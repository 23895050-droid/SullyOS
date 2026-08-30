// 和 Ta（2026-08-25）——c9：回忆（一起做过的事）+ 约定（约好还没做的事），AB 页内切换
// 设计文档《和ta页规划.md》：
// - 回忆：完成时间/用时 + 手动粘贴的上下文（纯文本）+ 双方感受；不挂载，能转发就行
// - 约定：谁提议/地点/内容/是否有时限 + 完成勾选；挂载到角色（关键词触发，只挂未完成）
// - 感受：每条带留下时间，按记录次序编号（第 1 次、第 2 次…）；Nox 的 AI 生成可重roll，双方可删除
// - 照片：详情页上传/替换，可从留档相册选（自带文字描述，不用再留档）；留档同时进用户和角色相册
// - 转发：只有照片全部留档过（或没照片）的卡可以转发，可勾选附感受；角色只读文字描述、全流程不读图
// - 卡片：横向（左文字右图），颜色随事件类型；详情页与外面同色
import React, { useMemo, useState } from 'react';
import { ArrowLeft, Camera, Check, ImageSquare, PaperPlaneTilt, PencilSimple, Plus, Sparkle, SpinnerGap, Trash, UploadSimple, X } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import {
  addPhoto, deleteFeeling, deleteMemory, deletePromise, markPhotoArchived, removePhoto, saveFeeling,
  saveMemory, savePromise, togglePromiseDone, useTogetherStore,
  type TogetherFeeling, type TogetherMemory, type TogetherPromise, type TogetherType,
} from './togetherStore';
import { getDiaryStore } from './diaryStore';
import { resolveDiaryApi } from './diaryApi';
import { generateTogetherFeeling, archiveTogetherPhoto } from './togetherApi';
import { getMountConfig } from '../../utils/noxhomeMount';
import { getLocalDateKey } from '../../utils/localDate';
import { fmtDiaryDateStamp } from '../../utils/diaryMath';
import {
  buildMemoryForwardBody, buildPromiseForwardBody, fmtFeelingSeq, filterTogetherByType,
  hasUnarchivedPhoto, searchTogether, togetherTypeDef, TOGETHER_TYPES,
} from '../../utils/togetherMath';
import { getBlobForRef, blobToDataUrl, putImageBlob, migrateDataUrlToRef, useBlobRefUrl } from '../../utils/blobRef';
import { loadArchive, type ArchiveEntry } from '../../utils/archive';
import { forwardTogetherCard } from './coupleForward';
import { loadCoupleBeauty, buildTheme } from './CoupleBeauty';
import { ForwardPicker } from './CouplePeriod';
import ConfirmDialog from '../../components/os/ConfirmDialog';

const CARD: React.CSSProperties = { background: '#fff', borderRadius: 24, boxShadow: 'var(--cs-shadow-soft, 0 10px 30px rgba(233,160,190,0.16), 0 2px 8px rgba(60,30,50,0.05))' };
const TITLE: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#9a7a8a', letterSpacing: '0.1em' };
const NOTE: React.CSSProperties = { fontSize: 11, color: '#b0909c', lineHeight: 1.7 };

type Tab = 'memories' | 'promises';
type Section = 'memories' | 'promises';

/** 照片缩略（blobRef → 可渲染 URL；hook 不能进 map，抽子组件） */
const PhotoThumb: React.FC<{ blobRef: string; size: number }> = ({ blobRef, size }) => {
  const url = useBlobRefUrl(blobRef);
  if (!url) {
    return <div className="rounded-xl shrink-0" style={{ width: size, height: size, background: '#f6f1f4' }} />;
  }
  return <img src={url} alt="" className="rounded-xl shrink-0 object-cover" style={{ width: size, height: size, border: '1px solid #f0e2e8' }} />;
};

// ── 从留档相册选照片（自带 archiveId + summary，不用再留档总结） ──

const ArchivePicker: React.FC<{ onPick: (e: ArchiveEntry) => void; onClose: () => void }> = ({ onPick, onClose }) => {
  const [q, setQ] = useState('');
  const entries = useMemo(() => {
    const all = loadArchive();
    if (!q.trim()) return all;
    const s = q.trim().toLowerCase();
    return all.filter((e) => [e.charName, e.summary, e.description, ...(e.tags ?? [])].join(' ').toLowerCase().includes(s));
  }, [q]);
  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 130, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 16, gap: 10, maxHeight: 'calc(100dvh - 120px)', overflowY: 'auto' }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 15, fontWeight: 700, color: '#3a2a33' }}>从留档相册选照片</span>
          <button type="button" onClick={onClose} aria-label="关闭" className="border-0 cursor-pointer rounded-full p-2" style={{ background: 'var(--cs-soft, #fce8f1)' }}>
            <X style={{ width: 15, height: 15, color: '#8a5a6e' }} />
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#9a7a8a', margin: 0, lineHeight: 1.6 }}>
          选留档过的照片：自带文字描述，不用再留档总结，发给角色时他只会读到描述。
        </p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索留档（名字/标签/摘要）"
          style={{ fontSize: 13, color: '#3a2a33', border: '1px solid #e8d5de', borderRadius: 14, padding: '10px 12px', background: '#fdf8fa', outline: 'none' }}
        />
        {entries.length === 0 && <p style={{ ...NOTE, margin: 0 }}>相册里还没有留档。</p>}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {entries.slice(0, 60).map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onPick(e)}
              className="border-0 cursor-pointer rounded-xl overflow-hidden"
              style={{ padding: 0, background: '#f6f1f4', aspectRatio: '1/1' }}
            >
              <img src={e.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
        <p style={{ fontSize: 10, color: '#b5a68c', margin: 0, textAlign: 'center' }}>显示最近 {Math.min(entries.length, 60)} 张（可在上方搜索）</p>
      </div>
    </div>
  );
};

// ── 编辑弹卡（回忆 / 约定） ──

const MemoryEditModal: React.FC<{ initial?: TogetherMemory; onClose: () => void }> = ({ initial, onClose }) => {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [type, setType] = useState<TogetherType>(initial?.type ?? 'daily');
  const [date, setDate] = useState(initial?.date ?? getLocalDateKey());
  const [duration, setDuration] = useState(initial?.duration ?? '');
  const [context, setContext] = useState(initial?.context ?? '');
  const inputCss: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 13, color: '#3a2a33', border: '1px solid #e8d5de', borderRadius: 14, padding: '10px 12px', background: '#fdf8fa', outline: 'none' };
  const save = () => {
    if (!title.trim()) return;
    saveMemory({ id: initial?.id, title: title.trim(), type, date, duration: duration.trim(), context: context.trim() });
    onClose();
  };
  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 130, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 16, gap: 12, maxHeight: 'calc(100dvh - 120px)', overflowY: 'auto' }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 15, fontWeight: 700, color: '#3a2a33' }}>{initial ? '编辑回忆' : '记一段回忆'}</span>
          <button type="button" onClick={onClose} aria-label="关闭" className="border-0 cursor-pointer rounded-full p-2" style={{ background: 'var(--cs-soft, #fce8f1)' }}>
            <X style={{ width: 15, height: 15, color: '#8a5a6e' }} />
          </button>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="事件名，如「海边的日出」" style={inputCss} />
        <div className="flex flex-wrap" style={{ gap: 6 }}>
          {TOGETHER_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setType(t.key)}
              className="border-0 cursor-pointer rounded-full"
              style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, background: type === t.key ? t.color : '#f6f1f4', color: type === t.key ? '#fff' : '#6a5a63' }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center" style={{ gap: 8 }}>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ ...inputCss, flex: 2 }} />
          <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="用时（如：一下午）" style={{ ...inputCss, flex: 1 }} />
        </div>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="手动粘贴当时的上下文 / 事件总结（纯文本保存，舍不得的原对话可以粘在这里）"
          rows={5}
          style={{ ...inputCss, resize: 'none', lineHeight: 1.7 }}
        />
        <button
          type="button" onClick={save} disabled={!title.trim()}
          className="border-0 cursor-pointer rounded-full"
          style={{ padding: '11px 0', fontSize: 14, fontWeight: 700, color: '#fff', background: title.trim() ? 'var(--cs-accent, #f0a8c0)' : '#e8dce2' }}
        >
          保存
        </button>
      </div>
    </div>
  );
};

const PromiseEditModal: React.FC<{ initial?: TogetherPromise; onClose: () => void }> = ({ initial, onClose }) => {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [type, setType] = useState<TogetherType>(initial?.type ?? 'other');
  const [proposer, setProposer] = useState<TogetherPromise['proposer']>(initial?.proposer ?? 'together');
  const [place, setPlace] = useState(initial?.place ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [deadline, setDeadline] = useState(initial?.deadline ?? '');
  const inputCss: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 13, color: '#3a2a33', border: '1px solid #e8d5de', borderRadius: 14, padding: '10px 12px', background: '#fdf8fa', outline: 'none' };
  const save = () => {
    if (!title.trim()) return;
    savePromise({ id: initial?.id, title: title.trim(), type, proposer, place: place.trim(), content: content.trim(), deadline: deadline || undefined });
    onClose();
  };
  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 130, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 16, gap: 12, maxHeight: 'calc(100dvh - 120px)', overflowY: 'auto' }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 15, fontWeight: 700, color: '#3a2a33' }}>{initial ? '编辑约定' : '记一件约好的事'}</span>
          <button type="button" onClick={onClose} aria-label="关闭" className="border-0 cursor-pointer rounded-full p-2" style={{ background: 'var(--cs-soft, #fce8f1)' }}>
            <X style={{ width: 15, height: 15, color: '#8a5a6e' }} />
          </button>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="事件名，如「一起去看海边的日出」" style={inputCss} />
        <div className="flex flex-wrap" style={{ gap: 6 }}>
          {TOGETHER_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setType(t.key)}
              className="border-0 cursor-pointer rounded-full"
              style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, background: type === t.key ? t.color : '#f6f1f4', color: type === t.key ? '#fff' : '#6a5a63' }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {([['me', 'Nox 提议'], ['her', 'Angelica 提议'], ['together', '一起定下的']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setProposer(k)}
              className="flex-1 border-0 cursor-pointer rounded-full"
              style={{ padding: '8px 0', fontSize: 12, fontWeight: 600, background: proposer === k ? 'var(--cs-accent, #f0a8c0)' : '#f6f1f4', color: proposer === k ? '#fff' : '#6a5a63' }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center" style={{ gap: 8 }}>
          <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="地点（可选）" style={{ ...inputCss, flex: 1 }} />
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ ...inputCss, flex: 2 }} />
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="事件内容（怎么约的、细节都行）"
          rows={4}
          style={{ ...inputCss, resize: 'none', lineHeight: 1.7 }}
        />
        <button
          type="button" onClick={save} disabled={!title.trim()}
          className="border-0 cursor-pointer rounded-full"
          style={{ padding: '11px 0', fontSize: 14, fontWeight: 700, color: '#fff', background: title.trim() ? 'var(--cs-accent, #f0a8c0)' : '#e8dce2' }}
        >
          保存
        </button>
      </div>
    </div>
  );
};

// ── 写感受弹卡（她的手动） ──

const FeelingModal: React.FC<{ onSave: (content: string) => void; onClose: () => void }> = ({ onSave, onClose }) => {
  const [content, setContent] = useState('');
  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 130, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 16, gap: 12 }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 15, fontWeight: 700, color: '#3a2a33' }}>记下此刻的感受</span>
          <button type="button" onClick={onClose} aria-label="关闭" className="border-0 cursor-pointer rounded-full p-2" style={{ background: 'var(--cs-soft, #fce8f1)' }}>
            <X style={{ width: 15, height: 15, color: '#8a5a6e' }} />
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#9a7a8a', margin: 0, lineHeight: 1.6 }}>坦诚记给自己看，不是为了说给对方听。会自动标上留下时间并按次序编号。</p>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="当时的感受……"
          rows={4}
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, color: '#3a2a33', border: '1px solid #e8d5de', borderRadius: 14, padding: '10px 12px', background: '#fdf8fa', outline: 'none', resize: 'none', lineHeight: 1.7 }}
        />
        <button
          type="button" onClick={() => { if (content.trim()) { onSave(content.trim()); onClose(); } }} disabled={!content.trim()}
          className="border-0 cursor-pointer rounded-full"
          style={{ padding: '11px 0', fontSize: 14, fontWeight: 700, color: '#fff', background: content.trim() ? 'var(--cs-accent, #f0a8c0)' : '#e8dce2' }}
        >
          保存
        </button>
      </div>
    </div>
  );
};

// ── 详情页 ──

const DetailView: React.FC<{
  section: Section;
  card: TogetherMemory | TogetherPromise;
  onBack: () => void;
}> = ({ section, card, onBack }) => {
  const { addToast, apiConfig, characters, userProfile } = useOS();
  const def = togetherTypeDef(card.type);
  const isMemory = section === 'memories';
  const mountChar = characters.find((c) => c.id === getMountConfig().charId) ?? null;

  const [editOpen, setEditOpen] = useState(false);
  const [feelOpen, setFeelOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [feelBusy, setFeelBusy] = useState<string | null>(null); // 生成中/重roll 中的感受 id（生成新 = 'new'）
  const [archiveBusy, setArchiveBusy] = useState<number | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [delFeel, setDelFeel] = useState<TogetherFeeling | null>(null);
  const [delPhotoIdx, setDelPhotoIdx] = useState<number | null>(null);
  const [fwdStep, setFwdStep] = useState<null | 'choose' | 'pick'>(null);
  const [fwdFeel, setFwdFeel] = useState(true);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const metaLine = isMemory
    ? `${def.label} · ${(card as TogetherMemory).date}${(card as TogetherMemory).duration ? ` · 用时${(card as TogetherMemory).duration}` : ''}`
    : `${(card as TogetherPromise).proposer === 'me' ? 'Nox 提议' : (card as TogetherPromise).proposer === 'her' ? 'Angelica 提议' : '一起定下的'}${(card as TogetherPromise).place ? ` · ${(card as TogetherPromise).place}` : ''}${(card as TogetherPromise).deadline ? ` · ${(card as TogetherPromise).deadline} 前` : ''}`;

  const cardText = isMemory
    ? `标题：${card.title}\n类型：${def.label}\n完成时间：${(card as TogetherMemory).date}${(card as TogetherMemory).duration ? `\n用时：${(card as TogetherMemory).duration}` : ''}\n事件内容：${(card as TogetherMemory).context}`
    : `标题：${card.title}\n提议人：${(card as TogetherPromise).proposer === 'me' ? 'Nox' : (card as TogetherPromise).proposer === 'her' ? 'Angelica' : '一起'}\n地点：${(card as TogetherPromise).place ?? '未记'}\n时限：${(card as TogetherPromise).deadline ?? '没有时限'}\n事件内容：${(card as TogetherPromise).content}`;

  const feelings = [...card.feelings].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  const genFeel = async (existing?: TogetherFeeling) => {
    if (!mountChar) { addToast('先去「挂载设置」选要挂载的角色', 'info'); return; }
    if (!userProfile?.name) { addToast('还没有用户资料', 'info'); return; }
    if (!resolveDiaryApi(getDiaryStore().api, apiConfig)) { addToast('还没配置 API（日记设置或主 API）', 'info'); return; }
    setFeelBusy(existing?.id ?? 'new');
    try {
      const content = await generateTogetherFeeling({
        char: mountChar, user: userProfile, mainApi: apiConfig,
        cardText, rerollOf: existing?.content,
      });
      saveFeeling(section, card.id, { id: existing?.id, owner: 'me', content, generated: true });
      addToast(existing ? '感受重写好了 💭' : '他记下了感受 💭', 'success');
    } catch {
      addToast('生成失败，请重试', 'error');
    } finally {
      setFeelBusy(null);
    }
  };

  const doArchivePhoto = async (idx: number) => {
    const photo = card.photos[idx];
    if (!photo || photo.archiveId || !mountChar || !userProfile) return;
    setArchiveBusy(idx);
    try {
      const blob = await getBlobForRef(photo.blobRef);
      if (!blob) throw new Error('图片数据丢失');
      const dataUrl = await blobToDataUrl(blob);
      const { summary, archiveId } = await archiveTogetherPhoto({
        char: mountChar, user: userProfile,
        eventTitle: card.title, dateLabel: fmtDiaryDateStamp(isMemory ? (card as TogetherMemory).date : getLocalDateKey()),
        note: '', imageDataUrl: dataUrl,
      });
      markPhotoArchived(section, card.id, idx, archiveId, summary);
      addToast('已留档到相册 📋（同时进了他的相册）', 'success');
    } catch {
      addToast('留档失败，请重试', 'error');
    } finally {
      setArchiveBusy(null);
    }
  };

  const onUpload = async (file: File) => {
    try {
      const blobRef = await putImageBlob(file);
      addPhoto(section, card.id, { blobRef });
      addToast('照片已加上', 'success');
    } catch {
      addToast('上传失败', 'error');
    }
  };

  const onPickArchive = async (entry: ArchiveEntry) => {
    try {
      const blobRef = await migrateDataUrlToRef(entry.thumbnail);
      addPhoto(section, card.id, { blobRef, archiveId: entry.id, summary: entry.summary || entry.description });
      addToast('已从留档相册选入（自带描述，不用再留档）', 'success');
    } catch {
      addToast('选入失败', 'error');
    }
    setPickerOpen(false);
  };

  const doForward = () => {
    if (hasUnarchivedPhoto(card.photos)) {
      addToast('有照片还没留档：先把照片留档进相册才能转发', 'info');
      return;
    }
    setFwdStep('choose');
  };

  const pill: React.CSSProperties = {
    border: 'none', cursor: 'pointer', borderRadius: 999,
    background: 'var(--cs-soft, #fce8f1)', color: '#8a5a6e',
    fontSize: 10, fontWeight: 600, padding: '4px 12px',
  };

  return (
    <div className="flex flex-col gap-3" style={{ width: 'min(100%, 560px)' }}>
      {/* 顶行：返回 + 标题 + 编辑/删除 */}
      <div className="flex items-center gap-2 px-1">
        <button type="button" onClick={onBack} aria-label="返回" className="rounded-full p-2 border-0 cursor-pointer shrink-0" style={{ background: 'rgba(255,255,255,0.9)', boxShadow: '0 2px 8px rgba(233,160,190,0.2)' }}>
          <ArrowLeft style={{ width: 18, height: 18, color: '#8a5a6e' }} />
        </button>
        <span className="flex-1 min-w-0" style={{ fontSize: 16, fontWeight: 700, color: '#3a2a33', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.title}</span>
        <button type="button" onClick={() => setEditOpen(true)} aria-label="编辑" style={pill}>
          <PencilSimple style={{ width: 11, height: 11 }} /> 编辑
        </button>
        <button type="button" onClick={() => setDelOpen(true)} aria-label="删除" style={{ ...pill, background: '#fdeef0', color: '#c98b95' }}>
          <Trash style={{ width: 11, height: 11 }} /> 删除
        </button>
      </div>

      {/* 详情卡（颜色与外面一样：类型 soft 底 + 主色缘条） */}
      <div className="rounded-3xl p-4 flex flex-col gap-3" style={{ background: def.soft, borderRadius: 24, border: `1px solid ${def.color}33` }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="rounded-full" style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: def.color, padding: '2px 10px' }}>{def.label}</span>
          <span style={{ fontSize: 11, color: '#6a5a63' }}>{metaLine}</span>
          {!isMemory && (
            <button
              type="button"
              onClick={() => togglePromiseDone(card.id)}
              className="flex items-center gap-1 border-0 cursor-pointer rounded-full"
              style={{ padding: '2px 10px', fontSize: 10, fontWeight: 600, background: (card as TogetherPromise).done ? '#7aa17a' : 'rgba(255,255,255,0.8)', color: (card as TogetherPromise).done ? '#fff' : '#6a5a63' }}
            >
              {(card as TogetherPromise).done && <Check style={{ width: 11, height: 11 }} weight="bold" />}
              {(card as TogetherPromise).done ? '已完成' : '标记完成'}
            </button>
          )}
        </div>

        {/* 事件内容 */}
        <div style={{ fontSize: 13, color: '#3a2a33', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'rgba(255,255,255,0.72)', borderRadius: 16, padding: '10px 12px' }}>
          {isMemory ? (card as TogetherMemory).context || '（还没有上下文，点编辑粘贴当时的对话或总结）' : (card as TogetherPromise).content || '（还没有内容）'}
        </div>

        {/* 照片区 */}
        <div className="flex flex-col" style={{ gap: 8 }}>
          <div className="flex items-center justify-between">
            <span style={TITLE}>照片</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPickerOpen(true)} style={{ ...pill, background: '#eef3fb', color: '#5b7fa8' }}>
                <ImageSquare style={{ width: 11, height: 11 }} /> 从留档相册选
              </button>
              <button type="button" onClick={() => fileInput.current?.click()} style={{ ...pill, background: '#eef3fb', color: '#5b7fa8' }}>
                <UploadSimple style={{ width: 11, height: 11 }} /> 上传
              </button>
            </div>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
              e.target.value = '';
            }}
          />
          {card.photos.length === 0 && <p style={{ ...NOTE, margin: 0 }}>还没有照片。上传一张，或从留档相册里选。</p>}
          <div className="flex flex-wrap" style={{ gap: 8 }}>
            {card.photos.map((p, i) => (
              <div key={`${p.blobRef}-${i}`} className="flex flex-col" style={{ gap: 4 }}>
                <div className="relative">
                  <PhotoThumb blobRef={p.blobRef} size={92} />
                  <button
                    type="button"
                    onClick={() => setDelPhotoIdx(i)}
                    aria-label="删除照片"
                    className="border-0 cursor-pointer rounded-full flex items-center justify-center"
                    style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, background: '#fdeef0' }}
                  >
                    <X style={{ width: 12, height: 12, color: '#c98b95' }} weight="bold" />
                  </button>
                </div>
                {p.archiveId ? (
                  <span className="rounded-full text-center" style={{ fontSize: 9, fontWeight: 600, color: '#7aa17a', background: '#eef7ee', padding: '2px 6px' }}>已留档</span>
                ) : (
                  <button type="button" onClick={() => void doArchivePhoto(i)} disabled={archiveBusy === i} style={{ ...pill, background: '#eef3fb', color: '#5b7fa8', opacity: archiveBusy === i ? 0.5 : 1 }}>
                    {archiveBusy === i ? '留档中…' : '留档进相册'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 感受记录 */}
        <div className="flex flex-col" style={{ gap: 8 }}>
          <div className="flex items-center justify-between">
            <span style={TITLE}>感受记录</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setFeelOpen(true)} style={{ ...pill, background: '#fdf6e5', color: '#b08a3e' }}>
                <Plus style={{ width: 11, height: 11 }} /> 我写一条
              </button>
              <button
                type="button" onClick={() => void genFeel()} disabled={feelBusy !== null}
                className="flex items-center gap-1"
                style={{ ...pill, background: '#eef3fb', color: '#5b7fa8', opacity: feelBusy !== null ? 0.5 : 1 }}
              >
                {feelBusy === 'new' ? <SpinnerGap className="animate-spin" style={{ width: 11, height: 11 }} /> : <Sparkle style={{ width: 11, height: 11 }} />}
                生成他的感受
              </button>
            </div>
          </div>
          {feelings.length === 0 && <p style={{ ...NOTE, margin: 0 }}>还没有感受记录。你写一条，或者生成他的——感受是记给自己看的，不是给对方听的。</p>}
          <div className="flex flex-col" style={{ gap: 6 }}>
            {feelings.map((f) => (
              <div key={f.id} className="flex items-start" style={{ gap: 8, background: 'rgba(255,255,255,0.8)', borderRadius: 16, padding: '10px 12px' }}>
                <span className="rounded-full shrink-0" style={{ width: 8, height: 8, marginTop: 6, background: f.owner === 'me' ? '#5b9cf0' : '#f0a8c0' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ fontSize: 11, fontWeight: 700, color: f.owner === 'me' ? '#4a7fc4' : '#c2738f' }}>{f.owner === 'me' ? 'Nox' : 'Angelica'}</span>
                    <span style={{ fontSize: 9.5, color: '#b0909c' }}>{fmtFeelingSeq(card.feelings, f.id)}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#3a2a33', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 3 }}>{f.content}</div>
                </div>
                <div className="flex flex-col shrink-0" style={{ gap: 4 }}>
                  {f.generated && (
                    <button
                      type="button"
                      onClick={() => void genFeel(f)}
                      disabled={feelBusy !== null}
                      aria-label="重roll"
                      className="border-0 cursor-pointer rounded-full p-1.5"
                      style={{ background: '#eef3fb', opacity: feelBusy !== null ? 0.5 : 1 }}
                    >
                      {feelBusy === f.id ? <SpinnerGap className="animate-spin" style={{ width: 12, height: 12, color: '#5b7fa8' }} /> : <Camera style={{ width: 12, height: 12, color: '#5b7fa8' }} />}
                    </button>
                  )}
                  <button type="button" onClick={() => setDelFeel(f)} aria-label="删除感受" className="border-0 cursor-pointer rounded-full p-1.5" style={{ background: '#fdeef0' }}>
                    <Trash style={{ width: 12, height: 12, color: '#c98b95' }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 转发 */}
        <button
          type="button"
          onClick={doForward}
          className="flex items-center justify-center gap-2 border-0 cursor-pointer rounded-full"
          style={{ padding: '11px 0', fontSize: 13, fontWeight: 700, color: '#fff', background: 'var(--cs-accent, #f0a8c0)' }}
        >
          <PaperPlaneTilt style={{ width: 14, height: 14 }} /> 转发给角色
        </button>
      </div>

      {/* 弹层 */}
      {editOpen && (isMemory
        ? <MemoryEditModal initial={card as TogetherMemory} onClose={() => setEditOpen(false)} />
        : <PromiseEditModal initial={card as TogetherPromise} onClose={() => setEditOpen(false)} />)}
      {feelOpen && (
        <FeelingModal
          onClose={() => setFeelOpen(false)}
          onSave={(content) => saveFeeling(section, card.id, { owner: 'her', content })}
        />
      )}
      {pickerOpen && <ArchivePicker onClose={() => setPickerOpen(false)} onPick={(e) => void onPickArchive(e)} />}

      {fwdStep === 'choose' && (
        <div
          className="fixed inset-0 flex items-end justify-center"
          style={{ zIndex: 130, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setFwdStep(null); }}
        >
          <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 10, gap: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#3a2a33', textAlign: 'center', padding: '6px 0' }}>转发「{card.title}」</div>
            <button
              type="button"
              onClick={() => setFwdFeel(!fwdFeel)}
              className="flex items-center gap-2 border-0 cursor-pointer rounded-2xl"
              style={{ padding: '11px 14px', background: '#f6f1f4', textAlign: 'left' }}
            >
              <span
                className="rounded-full flex items-center justify-center shrink-0"
                style={{ width: 22, height: 22, background: fwdFeel ? 'var(--cs-accent, #f0a8c0)' : '#fff', border: `1.5px solid ${fwdFeel ? 'var(--cs-accent, #f0a8c0)' : '#e0d1d4'}`, boxSizing: 'border-box' }}
              >
                {fwdFeel && <Check style={{ width: 13, height: 13, color: '#fff' }} weight="bold" />}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#3a2a33' }}>附带往期感受记录</span>
            </button>
            <button
              type="button"
              onClick={() => { setFwdStep('pick'); }}
              className="border-0 cursor-pointer rounded-2xl"
              style={{ padding: '11px 0', fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--cs-accent, #f0a8c0)' }}
            >
              选角色
            </button>
            <button type="button" onClick={() => setFwdStep(null)} className="border-0 cursor-pointer" style={{ padding: '9px 0', fontSize: 12, color: '#9a7a8a', background: 'transparent' }}>
              取消
            </button>
          </div>
        </div>
      )}

      {fwdStep === 'pick' && (
        <ForwardPicker
          onClose={() => setFwdStep(null)}
          onPick={async (c) => {
            try {
              const withFeel = fwdFeel;
              const subtitle = isMemory
                ? `${def.label} · ${(card as TogetherMemory).date}`
                : metaLine;
              await forwardTogetherCard(c, {
                kind: isMemory ? '回忆' : '约定',
                title: card.title,
                subtitle,
                body: isMemory
                  ? buildMemoryForwardBody(card as TogetherMemory, { withFeelings: withFeel })
                  : buildPromiseForwardBody(card as TogetherPromise, { withFeelings: withFeel }),
                color: def.color,
              });
              addToast('已转发', 'success');
            } catch {
              addToast('转发失败', 'error');
            }
            setFwdStep(null);
          }}
        />
      )}

      <ConfirmDialog
        isOpen={delOpen}
        title={`删除「${card.title}」吗？`}
        message="卡片、照片和全部感受记录会一起删除，不可恢复。"
        variant="danger"
        confirmText="删除"
        onConfirm={() => { if (isMemory) deleteMemory(card.id); else deletePromise(card.id); setDelOpen(false); onBack(); }}
        onCancel={() => setDelOpen(false)}
      />
      <ConfirmDialog
        isOpen={!!delFeel}
        title="删除这条感受吗？"
        message={delFeel ? `${fmtFeelingSeq(card.feelings, delFeel.id)}，${delFeel.owner === 'me' ? 'Nox' : 'Angelica'}的记录` : ''}
        variant="danger"
        confirmText="删除"
        onConfirm={() => { if (delFeel) deleteFeeling(section, card.id, delFeel.id); setDelFeel(null); }}
        onCancel={() => setDelFeel(null)}
      />
      <ConfirmDialog
        isOpen={delPhotoIdx !== null}
        title="删除这张照片吗？"
        message="已留档的相册条目不受影响，这里只是从卡片上拿掉。"
        variant="danger"
        confirmText="删除"
        onConfirm={() => { if (delPhotoIdx !== null) removePhoto(section, card.id, delPhotoIdx); setDelPhotoIdx(null); }}
        onCancel={() => setDelPhotoIdx(null)}
      />
    </div>
  );
};

// ── 卡片表面（横向：左文字右图，颜色随类型） ──

const CardSurface: React.FC<{ section: Section; card: TogetherMemory | TogetherPromise; onOpen: () => void }> = ({ section, card, onOpen }) => {
  const def = togetherTypeDef(card.type);
  const isMemory = section === 'memories';
  const firstPhoto = card.photos[0];
  const snippet = (isMemory ? (card as TogetherMemory).context : (card as TogetherPromise).content).trim();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-3xl p-4 flex items-center gap-3 border-0 cursor-pointer text-left"
      style={{ background: def.soft, boxShadow: 'var(--cs-shadow-soft, 0 10px 30px rgba(233,160,190,0.16), 0 2px 8px rgba(60,30,50,0.05))', border: `1px solid ${def.color}33` }}
    >
      <span className="rounded-full shrink-0" style={{ width: 8, height: 44, background: def.color }} />
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 14, fontWeight: 700, color: '#3a2a33', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.title}</div>
        <div style={{ fontSize: 10.5, color: '#8a6a7a', marginTop: 3 }}>
          {isMemory
            ? `${def.label} · ${(card as TogetherMemory).date}${(card as TogetherMemory).duration ? ` · ${(card as TogetherMemory).duration}` : ''}`
            : `${def.label} · ${(card as TogetherPromise).proposer === 'me' ? 'Nox 提议' : (card as TogetherPromise).proposer === 'her' ? 'Angelica 提议' : '一起定下的'}${(card as TogetherPromise).deadline ? ` · ${(card as TogetherPromise).deadline} 前` : ''}${(card as TogetherPromise).done ? ' · 已完成' : ''}`}
        </div>
        {snippet && (
          <div style={{ fontSize: 11, color: '#9a7a8a', marginTop: 4, lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {snippet}
          </div>
        )}
      </div>
      {firstPhoto && <PhotoThumb blobRef={firstPhoto.blobRef} size={64} />}
    </button>
  );
};

// ── 主页面 ──

const CoupleTogether: React.FC<{ initialTab?: Tab; onBack: () => void }> = ({ initialTab = 'memories', onBack }) => {
  const store = useTogetherStore();
  const [beauty] = useState(loadCoupleBeauty);
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

  const [tab, setTab] = useState<Tab>(initialTab);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<TogetherType | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editNew, setEditNew] = useState(false);

  const memories = useMemo(() => {
    const sorted = [...store.memories].sort((a, b) => (a.date < b.date ? 1 : -1));
    return filterTogetherByType(searchTogether(sorted, q), typeFilter);
  }, [store.memories, q, typeFilter]);

  const promises = useMemo(() => {
    const sorted = [...store.promises].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1; // 未完成在前
      return a.createdAt < b.createdAt ? 1 : -1;
    });
    return filterTogetherByType(searchTogether(sorted, q), typeFilter);
  }, [store.promises, q, typeFilter]);

  const detailCard = detailId
    ? (tab === 'memories' ? store.memories.find((m) => m.id === detailId) : store.promises.find((p) => p.id === detailId))
    : undefined;

  if (detailCard) {
    return (
      <div className="absolute inset-0 overflow-y-auto flex flex-col items-center" style={{ paddingTop: 'calc(var(--chrome-top, 0px) + 12px)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 96px)', ...themeVars }}>
        <DetailView
          section={tab}
          card={detailCard}
          onBack={() => setDetailId(null)}
        />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-y-auto" style={{ paddingTop: 'calc(var(--chrome-top, 0px) + 12px)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 96px)', ...themeVars }}>
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-5 py-3">
        <button type="button" onClick={onBack} aria-label="返回" className="rounded-full p-2 border-0 cursor-pointer" style={{ background: 'rgba(255,255,255,0.9)', boxShadow: '0 2px 8px rgba(233,160,190,0.2)' }}>
          <ArrowLeft style={{ width: 20, height: 20, color: '#8a5a6e' }} />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: '#3a2a33' }}>和 Ta</span>
        <button
          type="button"
          onClick={() => setEditNew(true)}
          aria-label="新建"
          className="ml-auto rounded-full flex items-center justify-center border-0 cursor-pointer"
          style={{ width: 32, height: 32, background: 'var(--cs-accent, #f0a8c0)' }}
        >
          <Plus style={{ width: 16, height: 16, color: '#fff' }} weight="bold" />
        </button>
      </div>

      {/* AB 切换 */}
      <div className="mx-5 flex" style={{ background: 'rgba(255,255,255,0.9)', borderRadius: 999, padding: 4, boxShadow: '0 2px 10px rgba(233,160,190,0.12)' }}>
        {([['memories', '回忆'], ['promises', '约好的事']] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => { setTab(k); setDetailId(null); setTypeFilter(null); }}
            className="flex-1 border-0 cursor-pointer rounded-full transition-colors duration-200"
            style={{ padding: '8px 0', fontSize: 13, fontWeight: 600, background: tab === k ? 'var(--cs-accent, #f0a8c0)' : 'transparent', color: tab === k ? '#fff' : '#9a7a8a' }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 搜索 + 类型筛选 */}
      <div className="flex flex-col gap-2 px-5 mt-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tab === 'memories' ? '搜索回忆（标题/内容）' : '搜索约定（标题/内容/地点）'}
          style={{ fontSize: 13, color: '#3a2a33', border: '1px solid #e8d5de', borderRadius: 14, padding: '10px 12px', background: '#fff', outline: 'none', boxShadow: '0 2px 10px rgba(233,160,190,0.08)' }}
        />
        <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          <button
            type="button"
            onClick={() => setTypeFilter(null)}
            className="shrink-0 border-0 cursor-pointer rounded-full"
            style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, background: typeFilter === null ? 'var(--cs-accent, #f0a8c0)' : '#fff', color: typeFilter === null ? '#fff' : '#8a6a7a' }}
          >
            全部
          </button>
          {TOGETHER_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTypeFilter(typeFilter === t.key ? null : t.key)}
              className="shrink-0 border-0 cursor-pointer rounded-full"
              style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, background: typeFilter === t.key ? t.color : '#fff', color: typeFilter === t.key ? '#fff' : '#8a6a7a' }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 列表 */}
      <div className="flex flex-col gap-3 px-5 mt-3">
        {tab === 'memories' ? (
          memories.length === 0 ? (
            <div className="rounded-3xl p-4" style={CARD}>
              <p style={{ ...NOTE, margin: 0 }}>还没有回忆。点右上角 + 记下第一件一起做过的事吧（可粘贴当时的上下文，舍不得的原对话就存在这里）。</p>
            </div>
          ) : (
            memories.map((m) => <CardSurface key={m.id} section="memories" card={m} onOpen={() => setDetailId(m.id)} />)
          )
        ) : (
          promises.length === 0 ? (
            <div className="rounded-3xl p-4" style={CARD}>
              <p style={{ ...NOTE, margin: 0 }}>还没有约好的事。记下「约好了」「之前说好的」那些事，他聊天时提到就会想起来（挂载设置里可开关）。</p>
            </div>
          ) : (
            promises.map((p) => <CardSurface key={p.id} section="promises" card={p} onOpen={() => setDetailId(p.id)} />)
          )
        )}
      </div>

      {editNew && (tab === 'memories'
        ? <MemoryEditModal onClose={() => setEditNew(false)} />
        : <PromiseEditModal onClose={() => setEditNew(false)} />)}
    </div>
  );
};

export default CoupleTogether;

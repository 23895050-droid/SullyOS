// 留言板卡片（2026-08-25）——c1 日常页
// 「喊他留言」= 批阅：读日常页全量信息（生理期/纪念日/待办/饮食/记账/活动/日记）写今天的留言，当天可重roll/删除
// 留言可贴一张照片（模型输出配图意图 → 相机生图 API 生成；生图未配置就不画，模型独立性）
// 照片带 why 小字标注（为什么贴）；可留档进相册（三点摘要：时间与语境 / 为什么贴 / 照片什么样）
// 往期只读（日期列表 → 详情弹卡）
import React, { useState } from 'react';
import { ArrowLeft, Camera, PencilSimple, SpinnerGap, X } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { useBoardStore, boardOn, boardDates, deleteBoardMessage, markBoardArchived, saveBoardMessage, type BoardImage, type BoardMessage } from './boardStore';
import { getDiaryStore } from './diaryStore';
import { resolveDiaryApi } from './diaryApi';
import { generateBoardMessage, archiveBoardImage } from './boardApi';
import { getMountConfig } from '../../utils/noxhomeMount';
import { getPrompt } from '../../utils/promptRegistry';
import { getLocalDateKey } from '../../utils/localDate';
import { fmtDiaryDateStamp } from '../../utils/diaryMath';
import { useDiaryHandFont } from './CoupleDiary';
import { diaryBgStore, diaryBgStoreApi } from './diaryBgStore';
import { isBgTaskStale, startBgTaskForResult } from '../../utils/bgTask';
import { generateImage } from '../../utils/imageGenService';
import { loadImageGenSettings } from '../../utils/imageGenStorage';
import { getBlobForRef, blobToDataUrl, useBlobRefUrl } from '../../utils/blobRef';
import ConfirmDialog from '../../components/os/ConfirmDialog';

const CARD: React.CSSProperties = { background: '#fff', borderRadius: 24, boxShadow: 'var(--cs-shadow-soft, 0 10px 30px rgba(233,160,190,0.16), 0 2px 8px rgba(60,30,50,0.05))' };
const TITLE: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#9a7a8a', letterSpacing: '0.1em' };
const NOTE: React.CSSProperties = { fontSize: 11, color: '#b0909c', lineHeight: 1.7 };

const timeOf = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** 贴的照片（blobRef → 可渲染 URL；hook 不能进 map，抽子组件） */
const BoardImageThumb: React.FC<{ blobRef: string }> = ({ blobRef }) => {
  const url = useBlobRefUrl(blobRef);
  if (!url) return <div className="rounded-2xl" style={{ width: '62%', aspectRatio: '1/1', background: '#f6f1f4' }} />;
  return (
    <img
      src={url}
      alt="他贴的照片"
      className="rounded-2xl"
      style={{ width: '62%', objectFit: 'cover', border: '1px solid #f0e2e8', boxShadow: '0 4px 14px rgba(60,30,50,0.08)' }}
    />
  );
};

/** 往期留言详情（只读） */
const BoardHistoryDetail: React.FC<{ m: BoardMessage; onBack: () => void; onClose: () => void; fontFamily: string }> = ({ m, onBack, onClose, fontFamily }) => (
  <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 16, gap: 10, maxHeight: 'calc(100dvh - 120px)', overflowY: 'auto' }}>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} aria-label="返回列表" className="border-0 cursor-pointer rounded-full p-2" style={{ background: 'var(--cs-soft, #fce8f1)' }}>
          <ArrowLeft style={{ width: 15, height: 15, color: '#8a5a6e' }} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#3a2a33' }}>{fmtDiaryDateStamp(m.date)}</span>
      </div>
      <button type="button" onClick={onClose} aria-label="关闭" className="border-0 cursor-pointer rounded-full p-2" style={{ background: 'var(--cs-soft, #fce8f1)' }}>
        <X style={{ width: 15, height: 15, color: '#8a5a6e' }} />
      </button>
    </div>
    <span style={{ fontSize: 10, color: '#c4aeb8' }}>Nox · {timeOf(m.createdAt)} 留言</span>
    <div style={{ fontSize: 13, color: '#3a2a33', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily }}>{m.content}</div>
    {m.image && (
      <div className="flex flex-col" style={{ gap: 6 }}>
        <BoardImageThumb blobRef={m.image.blobRef} />
        {m.image.why && <span style={{ fontSize: 10, color: '#b0909c', fontStyle: 'italic', lineHeight: 1.5 }}>📌 {m.image.why}</span>}
      </div>
    )}
    <p style={{ fontSize: 10, color: '#b5a68c', margin: 0, textAlign: 'center' }}>往期留言不能更改，只供回看。</p>
  </div>
);

/** 往期留言（日期列表 → 详情） */
const BoardHistory: React.FC<{ messages: BoardMessage[]; onClose: () => void }> = ({ messages, onClose }) => {
  const [sel, setSel] = useState<BoardMessage | null>(null);
  const fontFamily = useDiaryHandFont();
  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 120, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {sel ? (
        <BoardHistoryDetail m={sel} onBack={() => setSel(null)} onClose={onClose} fontFamily={fontFamily} />
      ) : (
        <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 16, gap: 10, maxHeight: 'calc(100dvh - 120px)', overflowY: 'auto' }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 15, fontWeight: 700, color: '#3a2a33' }}>往期留言（Nox）</span>
            <button type="button" onClick={onClose} aria-label="关闭" className="border-0 cursor-pointer rounded-full p-2" style={{ background: 'var(--cs-soft, #fce8f1)' }}>
              <X style={{ width: 15, height: 15, color: '#8a5a6e' }} />
            </button>
          </div>
          {messages.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSel(m)}
              className="border-0 cursor-pointer rounded-2xl flex flex-col items-start"
              style={{ gap: 3, padding: '10px 14px', background: '#fdf8fa', border: '1px solid #f3e2e9', textAlign: 'left' }}
            >
              <span className="flex items-center gap-2" style={{ fontSize: 13, fontWeight: 600, color: '#3a2a33' }}>
                {fmtDiaryDateStamp(m.date)}
                {m.image && <Camera style={{ width: 12, height: 12, color: '#c9a0b2' }} />}
              </span>
              <span style={{ fontSize: 11, color: '#b0909c', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', fontFamily }}>{m.content}</span>
            </button>
          ))}
          <p style={{ fontSize: 10, color: '#b5a68c', margin: 0, textAlign: 'center' }}>往期留言不能更改，只供回看。</p>
        </div>
      )}
    </div>
  );
};

// ── 留言板卡片 ──

const BoardPanel: React.FC = () => {
  const { addToast, apiConfig, characters, userProfile } = useOS();
  const store = useBoardStore();
  const today = getLocalDateKey();
  const todayMe = boardOn(store.messages, today, 'me');
  const past = boardDates(store.messages, 'me')
    .filter((d) => d !== today)
    .map((d) => boardOn(store.messages, d, 'me'))
    .filter((m): m is BoardMessage => Boolean(m));
  const mountChar = characters.find((c) => c.id === getMountConfig().charId) ?? null;
  const fontFamily = useDiaryHandFont();

  const [busy, setBusy] = useState<'gen' | 'archive' | null>(null);
  // 后台生成状态（生成中可离页，回来续显示）
  const bg = diaryBgStore.use();
  const boardPending = bg.pendingBoard;
  const boardRunning = !!boardPending && boardPending.status === 'running' && !isBgTaskStale(boardPending);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  /** 喊他留言 / 重roll（后台跑：生成中可离页；模型输出配图意图 → 生图 API 生成，未配生图就不画） */
  const gen = (isReroll: boolean) => {
    if (!mountChar) { addToast('先去「挂载设置」选要挂载的角色', 'info'); return; }
    if (!userProfile?.name) { addToast('还没有用户资料', 'info'); return; }
    if (!resolveDiaryApi(getDiaryStore().api, apiConfig)) { addToast('还没配置 API（日记设置或主 API）', 'info'); return; }
    void startBgTaskForResult(diaryBgStoreApi, 'pendingBoard', 'board', async () => {
      const { content, image } = await generateBoardMessage({
        char: mountChar, user: userProfile, mainApi: apiConfig, date: today,
        rerollOf: isReroll ? todayMe?.content : undefined,
      });
      let imgData: BoardImage | undefined;
      if (image) {
        const ig = loadImageGenSettings();
        if (ig.enabled && ig.apiKey.trim() && ig.baseUrl.trim() && ig.model.trim()) {
          try {
            // 共享出图风格（设置·提示词管理「生图·随手拍风格」，日记配图同一条）
            const style = getPrompt('生图·随手拍风格').replace(/\{\{char\}\}/g, mountChar.name);
            const r = await generateImage(style ? `${style}\n${image.prompt}` : image.prompt, { settings: ig });
            imgData = { blobRef: r.blobRef, prompt: image.prompt, why: image.why };
          } catch {
            addToast('配图没画出来，留言先贴上了', 'info');
          }
        }
      }
      saveBoardMessage({ date: today, owner: 'me', content, generated: true, image: imgData });
      return true;
    }).then(({ started, result }) => {
      if (!started) { addToast('上一次生成还在进行中', 'info'); return; }
      if (result === null) addToast('生成失败，再点一次就能重试', 'error');
      else addToast(isReroll ? '留言重写好了 ✍️' : '他留言了 💬', 'success');
    });
  };

  /** 照片留档进相册（三点摘要：时间与语境 / 为什么贴 / 照片什么样） */
  const doArchive = async () => {
    const img = todayMe?.image;
    if (!img || img.archiveId || !mountChar || !userProfile) return;
    setBusy('archive');
    try {
      const blob = await getBlobForRef(img.blobRef);
      if (!blob) throw new Error('图片数据丢失');
      const dataUrl = await blobToDataUrl(blob);
      const { archiveId } = await archiveBoardImage({
        char: mountChar, user: userProfile, date: today,
        prompt: img.prompt, why: img.why, imageDataUrl: dataUrl,
      });
      markBoardArchived(today, 'me', archiveId);
      addToast('已留档到相册 📋', 'success');
    } catch {
      addToast('留档失败，请重试', 'error');
    } finally {
      setBusy(null);
    }
  };

  const pill: React.CSSProperties = {
    border: 'none', cursor: 'pointer', borderRadius: 999,
    background: 'var(--cs-soft, #fce8f1)', color: '#8a5a6e',
    fontSize: 10, fontWeight: 600, padding: '4px 12px',
  };

  return (
    <>
      <div className="rounded-3xl p-4 flex flex-col gap-2" style={CARD}>
        <div className="flex items-center justify-between">
          <span style={TITLE}>留言板</span>
          <div className="flex items-center gap-2">
            {past.length > 0 && (
              <button type="button" onClick={() => setHistoryOpen(true)} style={pill}>往期留言 · {past.length}</button>
            )}
            {!todayMe && (
              <button
                type="button"
                onClick={() => void gen(false)}
                disabled={boardRunning}
                className="flex items-center gap-1.5"
                style={{ ...pill, background: 'var(--cs-accent, #f0a8c0)', color: '#fff', opacity: boardRunning ? 0.6 : 1 }}
              >
                {boardRunning ? (
                  <>
                    <SpinnerGap className="animate-spin" style={{ width: 11, height: 11 }} />
                    写留言中…
                  </>
                ) : (
                  <PencilSimple style={{ width: 11, height: 11 }} />
                )}
                {!boardRunning && '喊他留言'}
              </button>
            )}
          </div>
        </div>

        {boardRunning && todayMe && (
          <p style={{ ...NOTE, marginTop: 2 }}>正在重写今天的留言……</p>
        )}
        {boardPending?.status === 'failed' && (
          <p style={{ ...NOTE, marginTop: 2, color: '#b08a8a' }}>上次生成失败过，再点一次就能重试。</p>
        )}

        {todayMe ? (
          <>
            <span style={{ fontSize: 10, color: '#c4aeb8' }}>{fmtDiaryDateStamp(today)} · {timeOf(todayMe.createdAt)}</span>
            <div style={{ fontSize: 13, color: '#3a2a33', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily }}>{todayMe.content}</div>
            {todayMe.image && (
              <div className="flex flex-col" style={{ gap: 6, marginTop: 2 }}>
                <BoardImageThumb blobRef={todayMe.image.blobRef} />
                {todayMe.image.why && (
                  <span style={{ fontSize: 10, color: '#b0909c', fontStyle: 'italic', lineHeight: 1.5 }}>📌 {todayMe.image.why}</span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
              <button type="button" onClick={() => void gen(true)} disabled={busy !== null} style={{ ...pill, opacity: busy !== null ? 0.5 : 1 }}>重roll</button>
              <button type="button" onClick={() => setDelOpen(true)} style={{ ...pill, background: '#fdeef0', color: '#c98b95' }}>删除</button>
              {todayMe.image && (
                todayMe.image.archiveId ? (
                  <span className="rounded-full" style={{ fontSize: 10, fontWeight: 600, color: '#7aa17a', background: '#eef7ee', padding: '4px 12px' }}>已留档 📋</span>
                ) : (
                  <button type="button" onClick={() => void doArchive()} disabled={busy !== null} style={{ ...pill, background: '#eef3fb', color: '#5b7fa8', opacity: busy !== null ? 0.5 : 1 }}>
                    {busy === 'archive' ? '留档中…' : '留档进相册'}
                  </button>
                )
              )}
            </div>
          </>
        ) : (
          busy !== 'gen' && (
            <p style={{ ...NOTE, marginTop: 4 }}>
              今天他还没留言。点「喊他留言」，让他看看今天（生理期、待办、吃的、记的账……都会看到），给你留句话。
            </p>
          )
        )}
      </div>

      {historyOpen && <BoardHistory messages={past} onClose={() => setHistoryOpen(false)} />}

      <ConfirmDialog
        isOpen={delOpen}
        title="删除今天的留言吗？"
        message="留言和贴的照片会一起删除，不可恢复。"
        variant="danger"
        confirmText="删除"
        onConfirm={() => { deleteBoardMessage(today, 'me'); setDelOpen(false); }}
        onCancel={() => setDelOpen(false)}
      />
    </>
  );
};

export default BoardPanel;

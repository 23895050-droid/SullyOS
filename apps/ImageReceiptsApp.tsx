// 近期接收 — 独立原图备份站
// 生图成功时自动写入 image_receipts store，与聊天消息完全解耦，各删各的。
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import type { Message, ImageReceipt } from '../types';
import ImageLightbox from '../components/chat/ImageLightbox';
import ConfirmDialog from '../components/os/ConfirmDialog';
import { downloadChatImage } from '../utils/imageDownload';
import { useBlobRefUrl, deleteBlobRefIfUnreferenced } from '../utils/blobRef';
import { trackEvent } from '../utils/analytics';

interface Entry {
  receipt: ImageReceipt;
}

// 从 receipt 构造一个假的 Message（content 用 blobRef 令牌，由 ReceiptLightbox 解析）
function receiptToMessage(r: ImageReceipt): Message {
  return {
    id: 0,
    charId: r.charId,
    role: 'assistant',
    type: 'image',
    content: r.blobRef,
    timestamp: r.timestamp,
    metadata: {
      imageGenDescription: r.description,
      imageGenBlobRef: r.blobRef,
      imageGenMimeType: r.mimeType,
      imageGenIsSelfie: r.isSelfie,
      imageGenStatus: 'generated',
    },
  };
}

// Lightbox wrapper — 用 useBlobRefUrl 把 blobref 解析成真实 URL 再传 ImageLightbox
const ReceiptLightbox: React.FC<{
  entry: Entry;
  charName: string;
  onClose: () => void;
  onDownload: (msg: Message) => void;
  onDelete: (msg: Message) => void;
}> = ({ entry, charName, onClose, onDownload, onDelete }) => {
  const resolvedUrl = useBlobRefUrl(entry.receipt.blobRef);
  const msg = receiptToMessage(entry.receipt);
  // 用解析后的 URL 代替 blobref 令牌
  const displayMsg: Message = resolvedUrl ? { ...msg, content: resolvedUrl } : msg;
  return (
    <ImageLightbox
      msg={displayMsg}
      charName={charName}
      onClose={onClose}
      onDownload={onDownload}
      onDelete={onDelete}
    />
  );
};

// embedded 模式：被相册 App 内嵌时，返回按钮回到相册而不是关闭 App
const ImageReceiptsApp: React.FC<{ embedded?: boolean; onEmbeddedBack?: () => void }> = ({
  embedded = false,
  onEmbeddedBack,
}) => {
  const { closeApp, characters, addToast } = useOS();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<Entry | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Entry | null>(null);
  const isInitialLoad = useRef(true);

  const charNameOf = useCallback((charId: string) =>
    characters.find(c => c.id === charId)?.name || '角色', [characters]);

  const load = useCallback(async () => {
    if (isInitialLoad.current) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    const minEnd = Date.now() + 500; // 最小旋转 500ms，保证有视觉反馈
    try {
      const receipts = await DB.getAllImageReceipts();
      setEntries(receipts.map(r => ({ receipt: r })));
    } catch { /* ignore */ }
    const remain = minEnd - Date.now();
    if (remain > 0) await new Promise(r => setTimeout(r, remain));
    setLoading(false);
    setRefreshing(false);
    isInitialLoad.current = false;
  }, []);

  useEffect(() => { void load(); }, [load]);

  // 聊天里新生成图片后自动刷新
  useEffect(() => {
    const onNew = () => { void load(); };
    window.addEventListener('photo-tag-generated', onNew);
    return () => window.removeEventListener('photo-tag-generated', onNew);
  }, [load]);

  const handleDownload = useCallback(async (msg: Message) => {
    const charName = charNameOf(msg.charId);
    await downloadChatImage(msg, { charName, notify: addToast });
  }, [charNameOf, addToast]);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const { receipt } = pendingDelete;
    try {
      await DB.deleteImageReceipt(receipt.id);
      if (receipt.blobRef) {
        try { await deleteBlobRefIfUnreferenced(receipt.blobRef); } catch { /* ignore */ }
      }
      setEntries(prev => prev.filter(e => e.receipt.id !== receipt.id));
      if (previewEntry?.receipt.id === receipt.id) setPreviewEntry(null);
      addToast('已删除', 'success');
      trackEvent('近期接收删除一张图片');
    } catch {
      addToast('删除失败', 'error');
    }
    setPendingDelete(null);
  }, [pendingDelete, previewEntry, addToast]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="h-full bg-slate-50 flex flex-col">
      {/* 顶栏 — 参照 Gallery 模式 */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-slate-100/60 shrink-0 z-10" style={{ paddingTop: 'var(--chrome-top)' }}>
        <div className="h-14 flex items-center px-4">
          <button onClick={embedded && onEmbeddedBack ? onEmbeddedBack : closeApp} className="p-2 -ml-2 rounded-full hover:bg-black/5 active:scale-90 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-600"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
          </button>
          <h1 className="text-base font-semibold text-slate-800 ml-1 tracking-tight">近期接收</h1>
          <span className="text-xs text-slate-400 ml-2 font-mono">{entries.length}</span>
          <button
            onClick={() => void load()}
            className={`ml-auto p-2 rounded-full hover:bg-black/5 active:scale-90 transition-all text-slate-400 ${refreshing ? 'animate-spin' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
          </button>
        </div>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          // 首次加载：6 个骨架方块
          <div className="grid grid-cols-3 gap-1.5 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-xl bg-slate-200 animate-pulse" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3 pb-24">
            <div className="text-4xl">🖼️</div>
            <p className="text-sm">还没有接收过图片</p>
            <p className="text-[11px] text-slate-300">去聊天里让角色发一张「生成图片」试试</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 p-3">
            {entries.map(entry => {
              const r = entry.receipt;
              return (
                <div
                  key={r.id}
                  className="relative group aspect-square rounded-xl overflow-hidden bg-slate-200 cursor-pointer"
                  onClick={() => setPreviewEntry(entry)}
                >
                  <ReceiptThumbnail blobRef={r.blobRef} />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent pt-6 pb-1.5 px-2">
                    <div className="text-white text-[10px] leading-tight truncate">{r.description || '图片'}</div>
                    <div className="text-white/60 text-[8px]">{charNameOf(r.charId)} · {formatTime(r.timestamp)}</div>
                  </div>
                  <button
                    type="button"
                    aria-label="删除"
                    onClick={(e) => { e.stopPropagation(); setPendingDelete(entry); }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity active:scale-90"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox — 用 ReceiptLightbox 解析 blobref */}
      {previewEntry && (
        <ReceiptLightbox
          entry={previewEntry}
          charName={charNameOf(previewEntry.receipt.charId)}
          onClose={() => setPreviewEntry(null)}
          onDownload={handleDownload}
          onDelete={(msg) => {
            const e = entries.find(x => x.receipt.blobRef === (msg.metadata as any)?.imageGenBlobRef);
            if (e) setPendingDelete(e);
          }}
        />
      )}

      {/* 删除确认 */}
      {pendingDelete && (
        <ConfirmDialog
          isOpen
          title="删除这张图片？"
          message="仅从近期接收中移除，不会删除聊天记录中的图片。"
          variant="danger"
          confirmText="删除"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
};

// 小缩略图组件 — 用 useBlobRefUrl 解析 blobref 令牌
const ReceiptThumbnail: React.FC<{ blobRef: string }> = ({ blobRef }) => {
  const url = useBlobRefUrl(blobRef);
  if (!url) return <div className="w-full h-full bg-slate-200" />;
  return (
    <img
      src={url}
      alt=""
      className="w-full h-full object-cover"
      loading="lazy"
      decoding="async"
    />
  );
};

export default ImageReceiptsApp;

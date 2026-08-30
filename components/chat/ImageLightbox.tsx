// 图片全屏预览 Lightbox — portal 到 document.body（避开 reply-swipe transform 容器）。
// 聊天 MessageItem 和近期接收 App 共用。
import React, { useEffect } from 'react';
import type { Message } from '../../types';

export interface ImageLightboxProps {
  msg: Message | null;                  // null = 关闭
  charName?: string;
  onClose: () => void;
  onDownload?: (msg: Message) => void;  // 聊天与近期接收都传
  onDelete?: (msg: Message) => void;    // 仅近期接收页传；聊天不传
}

const ImageLightbox: React.FC<ImageLightboxProps> = ({ msg, charName, onClose, onDownload, onDelete }) => {
  // Escape 关闭
  useEffect(() => {
    if (!msg) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [msg, onClose]);

  if (!msg) return null;

  const meta = msg.metadata as any;
  const desc = typeof meta?.imageGenDescription === 'string' ? meta.imageGenDescription : undefined;

  return (
    <div
      className="fixed inset-0 z-[400] bg-black/85 flex flex-col items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative max-w-[94vw] max-h-[85vh] flex flex-col items-center"
        onClick={e => e.stopPropagation()}
      >
        <div className="relative">
          <img
            src={msg.content}
            alt={desc || '聊天图片'}
            className="max-w-[92vw] max-h-[78vh] object-contain rounded-lg shadow-2xl"
          />
          <button
            onClick={onClose}
            aria-label="关闭"
            className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center text-slate-500 hover:text-slate-700 z-10 text-sm"
          >
            ✕
          </button>
        </div>

        {/* Caption */}
        {(desc || charName) && (
          <div className="mt-3 text-center max-w-[92vw] space-y-1">
            {desc && <p className="text-white/90 text-sm line-clamp-3">{desc}</p>}
            <p className="text-white/50 text-xs">
              {charName ? `${charName} · ` : ''}
              {new Date(msg.timestamp).toLocaleString()}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex gap-3">
          {onDownload && (
            <button
              onClick={() => onDownload(msg)}
              className="px-5 py-2.5 rounded-full bg-white/90 text-slate-700 text-sm font-semibold active:scale-95 transition-transform"
            >
              下载图片
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(msg)}
              className="px-5 py-2.5 rounded-full bg-red-500/90 text-white text-sm font-semibold active:scale-95 transition-transform"
            >
              删除
            </button>
          )}
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-full bg-white/15 text-white text-sm font-semibold active:scale-95 transition-transform"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageLightbox;

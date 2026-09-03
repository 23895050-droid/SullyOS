// 聊天图片下载工具 — 被 Chat.tsx、MessageItem、近期接收共用。
// 优先从 metadata.imageGenBlobRef 拿原始 Blob，拿不到回退 dataUrl。
import type { Message } from '../types';
import { getBlobForRef, dataUrlToBlob, isBlobRef } from './blobRef';
import { generatedImageFilename } from './imageGenService';
import { shareOrDownloadBlob } from './shareExport';
import { trackEvent } from './analytics';

/** 从 content data URL 提取 mime（'data:image/png;base64,…' → 'image/png'）；非 data URL 返回 undefined。 */
function mimeFromContent(content: string): string | undefined {
  if (!content.startsWith('data:')) return undefined;
  const semi = content.indexOf(';');
  return semi > 5 ? content.slice(5, semi) : undefined;
}

/** 解析消息图片为 Blob：优先 metadata.imageGenBlobRef 的原始 Blob；
 *  其次检查 content 是否本身就是 blobref 令牌；最后回退 data URL → Blob。
 *  都失败返回 null。 */
export async function resolveChatImageBlob(msg: Message): Promise<Blob | null> {
  const meta = msg.metadata as any;
  const ref = typeof meta?.imageGenBlobRef === 'string' ? meta.imageGenBlobRef : undefined;
  if (ref) {
    const b = await getBlobForRef(ref);
    if (b) return b;
  }
  if (isBlobRef(msg.content)) return getBlobForRef(msg.content);
  if (msg.content.startsWith('data:')) {
    try { return dataUrlToBlob(msg.content); } catch { return null; }
  }
  return null;
}

/** 生成下载文件名。
 *  生图：用 imageGenDescription → generatedImageFilename（含 CJK 安全处理）；
 *  无描述时回退「角色名_图片_消息id.ext」。 */
export function chatImageFilename(msg: Message, charName?: string): string {
  const meta = msg.metadata as any;
  const desc = typeof meta?.imageGenDescription === 'string' ? meta.imageGenDescription : undefined;
  const mime = (typeof meta?.imageGenMimeType === 'string' ? meta.imageGenMimeType : undefined)
    || mimeFromContent(msg.content) || 'image/png';
  if (desc) return generatedImageFilename(desc, mime);
  const base = (charName || '角色').replace(/[\\/:*?"<>|]/g, '_');
  const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');
  return `${base}_图片_${msg.id || Date.now()}.${ext}`;
}

/** 一键下载聊天图片（含 toast 与埋点）。
 *  notify 由调用方注入（Chat 用 addToast，近期接收页同理）。 */
export async function downloadChatImage(
  msg: Message,
  opts: { charName?: string; notify: (text: string, type?: 'error' | 'success' | 'info') => void },
): Promise<void> {
  const blob = await resolveChatImageBlob(msg);
  if (!blob) {
    opts.notify('这张图片已经丢失，无法下载', 'error');
    return;
  }
  const result = await shareOrDownloadBlob({
    blob,
    fileName: chatImageFilename(msg, opts.charName),
    shareTitle: opts.charName ? `${opts.charName}发来的图片` : '聊天图片',
  });
  if (result === 'cancelled') return;
  opts.notify(result === 'shared' ? '已打开系统保存/分享' : '图片已开始下载', 'success');
  trackEvent('下载聊天图片');
}

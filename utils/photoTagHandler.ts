// 聊天生图标签处理：[photo:描述] 和 [photo:selfie:描述]
//
// 用法：
//   角色在聊天中输出 [photo:一杯咖啡在桌上冒着热气] → 调生图 API，结果作为图片消息追加
//   角色输出 [photo:selfie:在花园里散步] → 锁脸模式，带角色参考图走 edits endpoint
//
// 处理流程：
//   1. parsePhotoTags() — 从文本中提取标签并剥离
//   2. processPhotoTags() — 生图并落库为 image 消息，然后刷新 UI

import type { CharacterProfile, ImageGenerationSettings } from '../types';
import { generateImage } from './imageGenService';
import { loadImageGenSettings } from './imageGenStorage';
import { DB } from './db';

export interface PhotoRequest {
  /** 生图描述（不含前缀，纯场景） */
  description: string;
  /** 是否锁脸（使用角色的 referenceImageAssetId + appearanceDescription） */
  isSelfie: boolean;
  /** 标签在原文中的原始匹配文本 */
  rawTag: string;
}

/** 匹配 [photo:...] 或 [photo:selfie:...] */
const PHOTO_TAG_RE = /\[photo(?::selfie)?\s*:\s*([^\]]+)\]/gi;

/**
 * 从文本中提取 [photo:...] 标签，返回剥离后的纯净文本 + 待生图列表。
 */
export function parsePhotoTags(text: string): {
  cleanText: string;
  photos: PhotoRequest[];
} {
  const photos: PhotoRequest[] = [];
  const cleanText = text.replace(PHOTO_TAG_RE, (match, description) => {
    const desc = (description as string).trim();
    if (!desc) return ''; // 空描述直接移除
    photos.push({
      description: desc,
      isSelfie: /selfie/i.test(match),
      rawTag: match,
    });
    return '';
  });

  // 清理多余空行
  return {
    cleanText: cleanText.replace(/\n{3,}/g, '\n\n').trim(),
    photos,
  };
}

/**
 * 检查文本中是否包含生图标签。
 */
export function hasPhotoTags(text: string): boolean {
  PHOTO_TAG_RE.lastIndex = 0;
  return PHOTO_TAG_RE.test(text);
}

/**
 * 在聊天上下文中处理生图标签：生图 → 落库 → 派发事件通知 UI 刷新。
 *
 * 调用时机：applyAssistantPostProcessing 保存完本轮文字消息后，fire-and-forget。
 * 每条 photo 独立生图、独立落库、独立刷新 UI。
 *
 * @param char - 当前角色（读取 appearanceDescription / referenceImageAssetId）
 * @param charId - 角色 id
 * @param settings - 生图设置（可选，不传则从 localStorage 读取）
 */
export async function processPhotoTags(
  photos: PhotoRequest[],
  char: Pick<CharacterProfile, 'appearanceDescription' | 'referenceImageAssetId'>,
  charId: string,
  settings?: ImageGenerationSettings,
): Promise<void> {
  const imgSettings = settings ?? loadImageGenSettings();
  if (!imgSettings.enabled) {
    console.log('[PhotoTag] 生图功能未启用，跳过', photos.length, '条');
    return;
  }

  for (const photo of photos) {
    // 1) 先落一条 pending 消息——UI 立刻显示骨架
    let pendingMsgId: number | null = null;
    try {
      pendingMsgId = await DB.saveMessage({
        charId,
        role: 'assistant',
        type: 'image',
        content: '', // 生成中，暂无图片
        metadata: {
          imageGenStatus: 'pending',
          imageGenDescription: photo.description,
          imageGenIsSelfie: photo.isSelfie,
          photoTagRaw: photo.rawTag,
        },
      } as any);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('photo-tag-generated', {
          detail: { charId, pending: true, description: photo.description },
        }));
      }
    } catch {
      // 落 pending 失败不阻塞生图
    }

    try {
      console.log('[PhotoTag] 开始生图:', photo.description.slice(0, 50), photo.isSelfie ? '(锁脸)' : '');

      // 2) 根据 selfie/日常 选不同的预设 + 尺寸
      const presetId = photo.isSelfie
        ? (imgSettings.defaultSelfiePresetId || imgSettings.defaultPresetId)
        : imgSettings.defaultPresetId;
      const presetPrompt = presetId
        ? (imgSettings.presets.find(p => p.id === presetId)?.prompt?.trim() || undefined)
        : undefined;
      const sizeOverride = photo.isSelfie
        ? (imgSettings.selfieSize || undefined)
        : (imgSettings.landscapeSize || undefined);

      const result = await generateImage(photo.description, {
        referenceImageAssetId: photo.isSelfie ? char.referenceImageAssetId : undefined,
        appearanceDescription: photo.isSelfie ? char.appearanceDescription : undefined,
        presetPrompt,
        settings: sizeOverride ? { ...imgSettings, size: sizeOverride } : imgSettings,
      });

      // 3) 更新 pending 消息 → 成功
      if (pendingMsgId != null) {
        await DB.updateMessage(pendingMsgId, result.dataUrl);
        await DB.updateMessageMetadata(pendingMsgId, () => ({
          imageGenStatus: 'generated',
          imageGenPrompt: result.prompt,
          imageGenRevisedPrompt: result.revisedPrompt,
          imageGenUsedReference: result.usedReference,
          imageGenBlobRef: result.blobRef,
          imageGenMimeType: result.mimeType,
          imageGenDescription: photo.description,
          imageGenIsSelfie: photo.isSelfie,
          photoTagRaw: photo.rawTag,
        }));

      // 4) 写入近期接收（独立备份站，与聊天消息解耦）
      if (result.blobRef) {
        try {
          await DB.saveImageReceipt({
            id: result.blobRef.replace('blobref:', ''),
            blobRef: result.blobRef,
            charId,
            description: photo.description,
            timestamp: Date.now(),
            mimeType: result.mimeType || 'image/png',
            isSelfie: photo.isSelfie,
          });
        } catch { /* 近期接收写入失败不影响主流程 */ }
      }
      } else {
        // 兜底：pending 没落成，直接存新消息
        await DB.saveMessage({
          charId,
          role: 'assistant',
          type: 'image',
          content: result.dataUrl,
          metadata: {
            imageGenStatus: 'generated',
            imageGenDescription: photo.description,
            imageGenPrompt: result.prompt,
            imageGenBlobRef: result.blobRef,
          },
        } as any);
      }

      // 通知聊天 UI 刷新
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('photo-tag-generated', {
          detail: { charId, dataUrl: result.dataUrl, description: photo.description },
        }));
      }
    } catch (error) {
      console.error('[PhotoTag] 生图失败:', photo.description.slice(0, 50), error);
      const errMsg = error instanceof Error ? error.message : String(error);

      // 4) 更新 pending 消息 → 失败
      if (pendingMsgId != null) {
        try {
          await DB.updateMessage(pendingMsgId, ''); // keep content empty
          await DB.updateMessageMetadata(pendingMsgId, () => ({
            imageGenStatus: 'failed',
            imageGenError: errMsg,
            imageGenDescription: photo.description,
            imageGenIsSelfie: photo.isSelfie,
            photoTagRaw: photo.rawTag,
          }));
        } catch {
          // metadata 更新失败不阻塞
        }
      } else {
        // 兜底：pending 没落成，发错误文本
        try {
          await DB.saveMessage({
            charId,
            role: 'assistant',
            type: 'text',
            content: `❌ [生图失败] ${photo.description.slice(0, 40)}… — ${errMsg}`,
            metadata: { photoTagError: errMsg, photoTagRaw: photo.rawTag },
          } as any);
        } catch { /* ignore */ }
      }

      // 通知 UI 刷新
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('photo-tag-failed', {
          detail: { charId, error: errMsg, description: photo.description },
        }));
      }
    }
  }
}

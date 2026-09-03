// 相机 App — Angelica 设计的 iOS 风格生图相机
// 主页 = 纯图标按钮，零文字、零输入框、零复选框。复杂交互进居中大圆角卡片。
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { mergedMountedWorldbooks } from '../utils/noxhomeMount';
import ImageLightbox from '../components/chat/ImageLightbox';
import ConfirmDialog from '../components/os/ConfirmDialog';
import { downloadChatImage } from '../utils/imageDownload';
import { useBlobRefUrl, putImageBlob, deleteBlobRef, getBlobForRef, blobToDataUrl } from '../utils/blobRef';
import { loadImageGenSettings, saveImageGenSettings } from '../utils/imageGenStorage';
import { downscaleImage, addArchiveSafe, compactArchiveThumbnails } from '../utils/archive';
import type { ImageGenResult } from '../utils/imageGenService';
import type { Message, ImageGenPreset } from '../types';
import DataBackupPanel from './couple/DataBackupPanel';

// ── 辅助：从 ImageGenResult 构造 Message 给 lightbox / download ──
function resultToMessage(r: ImageGenResult, charId: string, desc: string): Message {
  return {
    id: 0,
    charId,
    role: 'assistant',
    type: 'image',
    content: r.dataUrl,
    timestamp: Date.now(),
    metadata: {
      imageGenDescription: desc,
      imageGenBlobRef: r.blobRef,
      imageGenMimeType: r.mimeType,
      imageGenStatus: 'generated',
      imageGenPrompt: r.prompt,
      imageGenRevisedPrompt: r.revisedPrompt,
      imageGenUsedReference: r.usedReference,
    },
  };
}

// ── 参考图模式 ──
type RefMode = 'face_lock' | 'style_ref' | 'none';
const REF_MODE_LABELS: Record<RefMode, string> = {
  face_lock: '锁脸',
  style_ref: '画风',
  none: '无参考',
};

// ── 主组件 ──
const CameraApp: React.FC = () => {
  const { closeApp, characters, addToast, apiConfig, userProfile } = useOS();

  // 当前角色（'user' = 自己）
  const [charId, setCharId] = useState<string>(() => characters[0]?.id || 'user');
  const char = charId === 'user' ? null : characters.find(c => c.id === charId);

  // 拍照的人的名字（留档用）
  const photographerName = charId === 'user' ? 'Angelica' : (char?.name || '角色');

  // 参考图
  const [refMode, setRefMode] = useState<RefMode>('none');
  const [customRefBlobRef, setCustomRefBlobRef] = useState<string | null>(null);

  // a3 提示词状态
  const [prefixPrompt, setPrefixPrompt] = useState('');
  const [scenePrompt, setScenePrompt] = useState('');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  // UI 状态
  const [showAPanel, setShowAPanel] = useState(false);
  const [showRefPicker, setShowRefPicker] = useState(false);
  const [showA3Card, setShowA3Card] = useState(false);
  const [showArchiveCard, setShowArchiveCard] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveStep, setArchiveStep] = useState<'summary' | 'options' | null>(null);
  const [archiveSummary, setArchiveSummary] = useState('');
  const [archiveTags, setArchiveTags] = useState('');
  const [archiveFavorite, setArchiveFavorite] = useState(false);
  const [archiveToChar, setArchiveToChar] = useState(false);

  // 结果
  const [lastResult, setLastResult] = useState<ImageGenResult | null>(null);
  const [lastDesc, setLastDesc] = useState('');
  const [previewMsg, setPreviewMsg] = useState<Message | null>(null);

  // a4 提示词生成
  const [showA4Card, setShowA4Card] = useState(false);
  const [a4Requirement, setA4Requirement] = useState('');
  const [a4RefBlobRef, setA4RefBlobRef] = useState<string | null>(null);
  const [a4RefDataUrl, setA4RefDataUrl] = useState<string | null>(null);
  const [a4GeneratedPrompt, setA4GeneratedPrompt] = useState('');
  const [a4IsGenerating, setA4IsGenerating] = useState(false);
  const [a4Copied, setA4Copied] = useState(false);

  // a1 转发
  const [showA1Card, setShowA1Card] = useState(false);
  const [a1SelectedCharId, setA1SelectedCharId] = useState<string | null>(null);
  const [a1Message, setA1Message] = useState('');
  const [a1Sending, setA1Sending] = useState(false);

  // a5 比例
  const [showA5Card, setShowA5Card] = useState(false);
  const [a5Size, setA5Size] = useState<string>('auto');

  // a6 预设
  const [showA6Card, setShowA6Card] = useState(false);

  // a2 给他看
  const [showA2Card, setShowA2Card] = useState(false);
  const [a2SelectedCharId, setA2SelectedCharId] = useState<string | null>(null);
  const [a2Input, setA2Input] = useState('');
  const [a2Messages, setA2Messages] = useState<Array<{ role: string; content: string }>>([]);
  const [a2IsLoading, setA2IsLoading] = useState(false);
  const [a2StreamingContent, setA2StreamingContent] = useState('');
  const [a2HasStarted, setA2HasStarted] = useState(false);
  const [a2CustomPrompt, setA2CustomPrompt] = useState('');
  const [editingMsgIdx, setEditingMsgIdx] = useState<number | null>(null);
  const [editingMsgContent, setEditingMsgContent] = useState('');
  const [a2IsSummarizing, setA2IsSummarizing] = useState(false);
  const [a2OutputMode, setA2OutputMode] = useState<'bubbles' | 'longform'>('bubbles');
  const [a2ShowCharPicker, setA2ShowCharPicker] = useState(false);
  const [a2ShowPresets, setA2ShowPresets] = useState(false);
  const [a2SavedPresets, setA2SavedPresets] = useState<Array<{ name: string; text: string }>>(() => {
    try { return JSON.parse(localStorage.getItem('os_camera_a2_presets') || '[]'); } catch { return []; }
  });
  const [a2ActivePresetName, setA2ActivePresetName] = useState('');
  const [a2NewPresetName, setA2NewPresetName] = useState('');
  const a2LastUserMsgRef = useRef<string>('');
  const a2LastAssistantCountRef = useRef<number>(0);
  const a2AbortRef = useRef<AbortController | null>(null);
  const a2ChatEndRef = useRef<HTMLDivElement>(null);
  const a2InputRef = useRef<HTMLTextAreaElement>(null);
  const a2SendRef = useRef<HTMLButtonElement>(null);
  const a2VVHandlerRef = useRef<(() => void) | null>(null);
  const a2SendBaseDistRef = useRef<number>(90);

  const allA2Presets = [
    ...A2_CUSTOM_PRESETS.map(p => ({ name: p.label, text: p.text, isDefault: true })),
    ...a2SavedPresets.map(p => ({ ...p, isDefault: false })),
  ];

  const saveA2Preset = () => {
    const name = a2NewPresetName.trim() || `预设${a2SavedPresets.length + 1}`;
    const text = a2CustomPrompt.trim();
    if (!text) { addToast('请先输入自定义提示词内容', 'info'); return; }
    const updated = [...a2SavedPresets.filter(p => p.name !== name), { name, text }];
    setA2SavedPresets(updated);
    localStorage.setItem('os_camera_a2_presets', JSON.stringify(updated));
    setA2ActivePresetName(name);
    setA2NewPresetName('');
    addToast(`已保存预设：${name}`, 'success');
  };

  const deleteA2Preset = (name: string) => {
    const updated = a2SavedPresets.filter(p => p.name !== name);
    setA2SavedPresets(updated);
    localStorage.setItem('os_camera_a2_presets', JSON.stringify(updated));
    if (a2ActivePresetName === name) setA2ActivePresetName('');
  };

  // 设置卡片
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState(() => loadImageGenSettings());

  // ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const a4FileInputRef = useRef<HTMLInputElement>(null);

  // 当前生效的参考图 blobRef
  const effectiveRefBlobRef = customRefBlobRef || char?.referenceImageAssetId || null;
  const effectiveRefUrl = useBlobRefUrl(effectiveRefBlobRef);
  const a4RefDisplayUrl = useBlobRefUrl(a4RefBlobRef);

  // 当前生效的预设
  const settings = loadImageGenSettings();
  const activePreset = activePresetId
    ? settings.presets.find(p => p.id === activePresetId) || null
    : null;

  // ── 参考图选择弹窗 ──
  const openRefPicker = () => setShowRefPicker(true);

  const selectCharRef = (cId: string) => {
    setCharId(cId);
    setCustomRefBlobRef(null);
    setShowRefPicker(false);
  };

  const handleCustomUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (customRefBlobRef) {
        try { await deleteBlobRef(customRefBlobRef); } catch { /* ignore */ }
      }
      const ref = await putImageBlob(file);
      setCustomRefBlobRef(ref);
      setShowRefPicker(false);
      addToast('参考图已上传', 'success');
    } catch {
      addToast('上传失败', 'error');
    }
  };

  // ── 快门：生图 ──
  const handleCapture = useCallback(async () => {
    const desc = scenePrompt.trim();
    if (!desc) {
      addToast('请先在 a3 中输入生图提示词', 'info');
      return;
    }
    const genSettings = loadImageGenSettings();
    if (!genSettings.enabled || !genSettings.apiKey || !genSettings.baseUrl || !genSettings.model) {
      addToast('请先在设置中配置生图 API', 'error');
      return;
    }
    setIsGenerating(true);
    try {
      const { generateImage } = await import('../utils/imageGenService');
      const presetPrompt = activePreset?.prompt?.trim() || prefixPrompt.trim() || undefined;
      const hasRef = refMode !== 'none' && effectiveRefBlobRef;
      const result = await generateImage(desc, {
        referenceImageAssetId: hasRef ? effectiveRefBlobRef : undefined,
        appearanceDescription: refMode === 'face_lock' ? char?.appearanceDescription : undefined,
        presetPrompt,
        settings: genSettings,
      });
      setLastResult(result);
      setLastDesc(desc);
      // 写入近期接收
      if (result.blobRef) {
        try {
          await DB.saveImageReceipt({
            id: result.blobRef.replace('blobref:', ''),
            blobRef: result.blobRef,
            charId: char?.id || charId,
            description: desc,
            timestamp: Date.now(),
            mimeType: result.mimeType || 'image/png',
            isSelfie: refMode === 'face_lock',
          });
        } catch (e) {
          console.warn('[Camera] saveImageReceipt failed:', e);
          addToast('近期接收写入失败，但图片已生成', 'info');
        }
      }
      // 持久化到 localStorage，后台回来能恢复
      try {
        localStorage.setItem('os_camera_last', JSON.stringify({
          blobRef: result.blobRef,
          desc,
          mimeType: result.mimeType || 'image/png',
          prompt: result.prompt,
          revisedPrompt: result.revisedPrompt,
          usedReference: result.usedReference,
          timestamp: Date.now(),
        }));
      } catch { /* ignore */ }
      addToast('生成完成 ✨', 'success');
    } catch (err) {
      addToast(`生图失败：${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setIsGenerating(false);
    }
  }, [scenePrompt, activePreset, prefixPrompt, refMode, effectiveRefBlobRef, char, charId, addToast]);

  // 近期接收选择器
  const [showGalleryPicker, setShowGalleryPicker] = useState(false);
  const [galleryImages, setGalleryImages] = useState<Array<{ id: string; blobRef: string; description: string; timestamp: number; mimeType: string }>>([]);

  const openGalleryPicker = async () => {
    try {
      const all = await DB.getAllImageReceipts();
      setGalleryImages(all.sort((a, b) => b.timestamp - a.timestamp).slice(0, 30));
    } catch {
      setGalleryImages([]);
    }
    setShowGalleryPicker(true);
  };

  const loadFromReceipt = async (receipt: { id: string; blobRef: string; description: string; mimeType: string }) => {
    try {
      const blob = await getBlobForRef(receipt.blobRef);
      if (!blob) { addToast('图片数据已丢失', 'error'); return; }
      const dataUrl = await blobToDataUrl(blob);
      setLastResult({
        blobRef: receipt.blobRef,
        dataUrl,
        blob,
        mimeType: receipt.mimeType || 'image/png',
        prompt: receipt.description,
        usedReference: false,
      });
      setLastDesc(receipt.description);
      // 更新持久化
      try {
        localStorage.setItem('os_camera_last', JSON.stringify({
          blobRef: receipt.blobRef,
          desc: receipt.description,
          mimeType: receipt.mimeType,
          prompt: receipt.description,
          timestamp: Date.now(),
        }));
      } catch { /* ignore */ }
      setShowGalleryPicker(false);
      addToast('已加载照片', 'success');
    } catch {
      addToast('加载失败', 'error');
    }
  };

  // ── 挂载时恢复上次照片 ──
  useEffect(() => {
    // 旧留档存的是全尺寸 base64 缩略图，会撑爆 localStorage 配额导致新留档写不进去；
    // 挂载时顺手把超尺寸缩略图压一遍（幂等，压缩过的直接跳过）
    void compactArchiveThumbnails();
    const saved = localStorage.getItem('os_camera_last');
    if (!saved) return;
    try {
      const data = JSON.parse(saved);
      if (!data.blobRef || !data.desc) return;
      getBlobForRef(data.blobRef).then(blob => {
        if (!blob) return;
        blobToDataUrl(blob).then(dataUrl => {
          setLastResult({
            blobRef: data.blobRef,
            dataUrl,
            blob,
            mimeType: data.mimeType || 'image/png',
            prompt: data.prompt || '',
            revisedPrompt: data.revisedPrompt,
            usedReference: data.usedReference || false,
          });
          setLastDesc(data.desc || '');
        }).catch(() => {});
      }).catch(() => {});
    } catch { /* ignore */ }
  }, []);

  // ── 重roll ──
  const handleReroll = () => {
    if (!lastDesc) {
      addToast('还没有生成过图片', 'info');
      return;
    }
    void handleCapture();
  };

  // ── 下载到本地 ──
  const handleDownload = async () => {
    if (!lastResult) { addToast('还没有生成图片', 'info'); return; }
    const msg = resultToMessage(lastResult, char?.id || charId, lastDesc);
    await downloadChatImage(msg, { charName: char?.name, notify: addToast });
  };

  // ── 大图预览 ──
  const openPreview = () => {
    if (!lastResult) return;
    setPreviewMsg(resultToMessage(lastResult, char?.id || charId, lastDesc));
  };

  // ── 留档 ──
  const handleArchive = async () => {
    if (!lastResult) { addToast('还没有生成图片', 'info'); return; }
    setIsArchiving(true);
    setArchiveStep('summary');
    setShowArchiveCard(true);
    try {
      const genSettings = loadImageGenSettings();
      // 用提示词生成模型写摘要（纯文字，不走识图）
      const key = genSettings.promptGenApiKey;
      const url = genSettings.promptGenBaseUrl;
      const model = genSettings.promptGenModel;
      if (!key || !url || !model) {
        // 无摘要模型时用简单模板
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const ts = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        setArchiveSummary(`${ts}，${photographerName}拍了这张照片。画面：${lastDesc.slice(0, 100)}。`);
      } else {
        const res = await fetch(url.replace(/\/+$/, '') + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content: `你是记录助手。${photographerName}拍了一张照片。请用第三人称写一段简短的画面描述和感受（50字以内），用"${photographerName}"而不是"我"。格式："${photographerName}拍了这张照片。画面中……${photographerName}觉得……"。直接输出，不要任何前缀。`,
              },
              {
                role: 'user',
                content: `这张照片的拍摄提示词是："${lastDesc.slice(0, 300)}"。请简单描述画面并表达感受。`,
              },
            ],
            // 推理模型的 thinking 会吃掉 max_tokens，给足额度防止正文截断
            max_tokens: 4000,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error((data as any).error?.message || `HTTP ${res.status}`);
        const summary = data.choices?.[0]?.message?.content?.trim() || '';
        setArchiveSummary(summary || `${photographerName}拍了一张照片：${lastDesc.slice(0, 80)}。`);
      }
    } catch {
      setArchiveSummary(`${photographerName}拍了一张照片：${lastDesc.slice(0, 100)}。`);
    } finally {
      setIsArchiving(false);
      setArchiveStep('options');
    }
  };

  const confirmArchive = async () => {
    // 存入 memory_archive（localStorage，上限 200 条；缩略图压缩后入库；
    // quota 满时 addArchiveSafe 会先把库里的超尺寸旧缩略图压掉再重试）
    try {
      const ok = await addArchiveSafe({
        id: `ma_${Date.now()}`,
        thumbnail: await downscaleImage(lastResult?.dataUrl || '', 320),
        charId: char?.id || charId,
        charName: char?.name || '',
        summary: archiveSummary,
        description: lastDesc,
        prefixPrompt,
        presetName: activePreset?.name || '',
        refMode,
        tags: (() => {
          const manual = archiveTags.split(/[,，]/).map(t => t.trim()).filter(Boolean);
          return manual.length > 0 ? manual : ['相机'];
        })(),
        favorite: archiveFavorite,
        charAlbum: archiveToChar,
        fromUser: (char?.id || charId) === 'user',
        kind: refMode === 'face_lock' ? 'selfie' : 'other',
        timestamp: Date.now(),
      });
      addToast(ok ? '留档成功 📋' : '留档失败', ok ? 'success' : 'error');
    } catch {
      addToast('留档失败', 'error');
    }
    // 重置
    setShowArchiveCard(false);
    setArchiveStep(null);
    setArchiveSummary('');
    setArchiveTags('');
    setArchiveFavorite(false);
    setArchiveToChar(false);
  };

  // ── a4 参考图上传 ──
  const handleA4RefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (a4RefBlobRef) {
        try { await deleteBlobRef(a4RefBlobRef); } catch { /* ignore */ }
      }
      const ref = await putImageBlob(file);
      setA4RefBlobRef(ref);
      // 同时存 dataUrl 给 vision API 用
      const blob = await getBlobForRef(ref);
      if (blob) {
        const dataUrl = await blobToDataUrl(blob);
        setA4RefDataUrl(dataUrl);
      }
      addToast('参考图已上传', 'success');
    } catch {
      addToast('上传失败', 'error');
    }
  };

  // ── a4 提示词生成 ──
  const handleA4Generate = async () => {
    if (!a4Requirement.trim()) {
      addToast('请先输入需求描述', 'info');
      return;
    }
    const genSettings = loadImageGenSettings();
    const key = genSettings.promptGenApiKey;
    const url = genSettings.promptGenBaseUrl;
    const model = genSettings.promptGenModel;
    if (!key || !url || !model) {
      addToast('请先在设置中配置提示词生成模型（API地址+密钥+模型名）', 'error');
      return;
    }
    setA4IsGenerating(true);
    setA4GeneratedPrompt('');
    try {
      const userContent: any[] = [];
      if (a4RefBlobRef && a4RefDataUrl) {
        userContent.push({ type: 'text', text: '参考这张图片的风格、构图和氛围：' });
        userContent.push({ type: 'image_url', image_url: { url: a4RefDataUrl } });
      }
      userContent.push({ type: 'text', text: `请根据以下需求，生成一段详细、高质量的英文 Stable Diffusion / DALL-E 风格生图提示词。只输出提示词本身，不要任何解释或前缀。\n\n需求：${a4Requirement}` });

      const res = await fetch(url.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的 AI 生图提示词工程师。根据用户的需求描述（可能附带参考图），生成详细、高质量的英文生图提示词。提示词应包含：主体描述、构图、光线、风格、氛围、细节。只输出提示词本身，不要任何解释或前缀。',
            },
            { role: 'user', content: userContent },
          ],
          // 推理模型（如 gemini-3-flash）的 thinking 会吃掉 max_tokens，给足额度防止正文截断
          max_tokens: 8000,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
      const prompt = data.choices?.[0]?.message?.content?.trim() || '';
      setA4GeneratedPrompt(prompt || '生成失败，请重试');
    } catch (err) {
      addToast(`生成失败：${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setA4IsGenerating(false);
    }
  };

  const handleA4Copy = async () => {
    if (!a4GeneratedPrompt) return;
    try {
      await navigator.clipboard.writeText(a4GeneratedPrompt);
      setA4Copied(true);
      addToast('已复制到剪贴板', 'success');
      setTimeout(() => setA4Copied(false), 2000);
    } catch {
      addToast('复制失败', 'error');
    }
  };

  const handleA4FillToPrompt = () => {
    if (!a4GeneratedPrompt) return;
    setScenePrompt(a4GeneratedPrompt);
    setShowA4Card(false);
    addToast('已填入生图提示词 ✨', 'success');
  };

  // ── a1 转发 ──
  const handleA1Send = async () => {
    if (!a1SelectedCharId) { addToast('请选择转发对象', 'info'); return; }
    if (!lastResult) { addToast('还没有生成图片', 'info'); return; }
    setA1Sending(true);
    try {
      const note = a1Message.trim();
      // 先发文字（如有留言）
      if (note) {
        await DB.saveMessage({
          charId: a1SelectedCharId,
          role: 'user',
          type: 'text',
          content: note,
        });
      }
      // 确保图片有 blobRef，没有则存入
      let blobRef = lastResult.blobRef;
      if (!blobRef && lastResult.blob) {
        blobRef = await putImageBlob(lastResult.blob);
      }
      // 再发图片
      await DB.saveMessage({
        charId: a1SelectedCharId,
        role: 'user',
        type: 'image',
        content: lastResult.dataUrl,
        metadata: {
          imageGenDescription: lastDesc || '分享了一张照片',
          imageGenBlobRef: blobRef,
          imageGenMimeType: lastResult.mimeType || 'image/png',
          imageGenStatus: 'generated',
          imageGenPrompt: lastResult.prompt,
          imageGenRevisedPrompt: lastResult.revisedPrompt,
          imageGenUsedReference: lastResult.usedReference,
          forwardedFromCamera: true,
          forwardNote: note || undefined,
        },
      });
      const targetChar = characters.find(c => c.id === a1SelectedCharId);
      addToast(`已转发给 ${targetChar?.name || '角色'} 📤`, 'success');
      setShowA1Card(false);
      setA1SelectedCharId(null);
      setA1Message('');
    } catch (err) {
      addToast(`转发失败：${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setA1Sending(false);
    }
  };

  // ── a2 给他看 ──
  const openA2Card = () => {
    if (!lastResult) { addToast('请先生成一张图片', 'info'); return; }
    setA2SelectedCharId(characters[0]?.id || null);
    setA2Input('');
    setA2Messages([]);
    setA2StreamingContent('');
    setA2HasStarted(false);
    setA2CustomPrompt('');
    setA2ActivePresetName('');
    setA2ShowCharPicker(false);
    setA2ShowPresets(false);
    setShowA2Card(true);
  };

  const buildA2SystemPrompt = (
    charData: typeof characters[number],
    worldbookText: string,
    recentContext: string,
  ): string => {
    const parts: string[] = [];
    const userName = userProfile?.name || '用户';
    // 基础人设
    parts.push(charData.systemPrompt || `你是${charData.name}。`);
    if (charData.worldview) parts.push(`\n世界观：${charData.worldview}`);
    if (charData.description) parts.push(`\n关于你：${charData.description}`);
    // 世界书
    if (worldbookText) parts.push(`\n## 扩展设定（世界书）\n${worldbookText}`);
    // 近期聊天上下文
    if (recentContext) parts.push(`\n## ${userName}和${charData.name}最近的对话\n${recentContext}`);
    // 固定前缀 + 自定义
    const custom = a2CustomPrompt.trim();
    const context = custom
      ? `${userName}给你看了一张照片。${custom}`
      : `${userName}给你看了一张照片。`;
    parts.push(`\n[系统：${context} 请保持你的角色设定，自然地讨论、评价、或回应这张照片——就像你们真的在一起看着它一样。]
${a2OutputMode === 'bubbles'
  ? '[输出格式：你必须用独占一行的 "---" 来分隔不同气泡。你的回复中不允许出现任何换行——每个气泡是纯文本的一整段。用 --- 分气泡，不要换行。]'
  : '[输出格式：你可以写较长的文字，自然分段换行。不要使用 --- 分隔符。]'
}`);
    return parts.join('\n');
  };

  const handleA2Send = async () => {
    const input = a2Input.trim();
    if (!input || !a2SelectedCharId) return;
    const charData = characters.find(c => c.id === a2SelectedCharId);
    if (!charData) return;
    if (!apiConfig.baseUrl || !apiConfig.apiKey || !apiConfig.model) {
      addToast('请先在设置中配置聊天 API', 'error');
      return;
    }
    // 取消上一次请求
    a2AbortRef.current?.abort();
    const abort = new AbortController();
    a2AbortRef.current = abort;

    const userMsg = { role: 'user' as const, content: input };
    a2LastUserMsgRef.current = input;
    setA2Messages(prev => [...prev, userMsg]);
    setA2Input('');
    setA2IsLoading(true);
    setA2StreamingContent('');
    setA2HasStarted(true);

    try {
      // 加载世界书 + 近期聊天上下文（含 noxhome 动态挂载条目）
      let worldbookText = '';
      const mountedWbs = mergedMountedWorldbooks(charData as any) as Array<{ title: string; content: string }>;
      if (mountedWbs.length > 0) {
        worldbookText = mountedWbs.map(wb => `### ${wb.title}\n${wb.content}`).join('\n\n');
      }
      let recentContext = '';
      try {
        const recentMsgs = await DB.getRecentMessagesByCharId(charData.id, 12, false);
        if (recentMsgs.length > 0) {
          const userName = userProfile?.name || '用户';
          recentContext = recentMsgs
            .filter(m => m.type === 'text' && m.content)
            .slice(-8)
            .map(m => `${m.role === 'user' ? userName : charData.name}：${typeof m.content === 'string' ? m.content.slice(0, 200) : ''}`)
            .join('\n');
        }
      } catch { /* DB unavailable */ }

      // 构建消息列表
      const systemPrompt = buildA2SystemPrompt(charData, worldbookText, recentContext);
      const apiMessages: any[] = [{ role: 'system', content: systemPrompt }];

      // 历史消息（不含刚加的 user 消息，它已经在下面单独加入）
      for (const msg of a2Messages) {
        apiMessages.push({ role: msg.role, content: msg.content });
      }

      // 当前用户消息：首次对话带照片描述（不传原图，聊天模型读文字即可）
      const isFirstTurn = a2Messages.length === 0;
      if (isFirstTurn && lastDesc) {
        const photoNote = `\n\n[📷 用户刚拍了一张照片。画面描述：${lastDesc.length > 200 ? lastDesc.slice(0, 200) + '…' : lastDesc}]`;
        apiMessages.push({ role: 'user', content: input + photoNote });
      } else {
        apiMessages.push({ role: 'user', content: input });
      }

      const baseUrl = apiConfig.baseUrl.replace(/\/+$/, '');
      const res = await fetch(baseUrl + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiConfig.apiKey}` },
        body: JSON.stringify({ model: apiConfig.model, messages: apiMessages, max_tokens: 2000, stream: true }),
        signal: abort.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as any).error?.message || `HTTP ${res.status}`);
      }

      // SSE 流式读取
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

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
              setA2StreamingContent(fullContent);
            }
          } catch { /* skip */ }
        }
      }

      if (fullContent) {
        const blocks = fullContent.split(/^\s*---\s*$/m).filter(b => b.trim());
        const newMsgs = blocks.map(b => ({ role: 'assistant' as const, content: b.trim() }));
        a2LastAssistantCountRef.current = newMsgs.length;
        setA2Messages(prev => [...prev, ...newMsgs]);
        setA2StreamingContent('');
      } else {
        setA2Messages(prev => [...prev, { role: 'assistant', content: '(空回复)' }]);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      addToast(`发送失败：${err?.message || String(err)}`, 'error');
      // 回滚最后一条 user 消息
      setA2Messages(prev => prev.slice(0, -1));
    } finally {
      setA2IsLoading(false);
      setA2StreamingContent('');
      a2AbortRef.current = null;
      // 滚动到底部
      setTimeout(() => a2ChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  const handleA2End = async () => {
    if (a2Messages.length === 0) { setShowA2Card(false); return; }
    const charData = characters.find(c => c.id === a2SelectedCharId);
    setA2IsSummarizing(true);
    const userName = userProfile?.name || '用户';
    const charName = charData?.name || '角色';
    let summary = '';
    try {
      const genSettings = loadImageGenSettings();
      const key = genSettings.promptGenApiKey;
      const url = genSettings.promptGenBaseUrl;
      const model = genSettings.promptGenModel;
      if (key && url && model) {
        const transcript = a2Messages.map(m => `${m.role === 'user' ? userName : charName}：${m.content}`).join('\n');

        const res = await fetch(url.replace(/\/+$/, '') + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model,
            messages: [{
              role: 'system',
              content: `你是记录助手。${userName}和${charName}一起看了一张照片并聊了聊。请写一段完整的摘要，要求：1)照片内容一笔带过即可，不要展开描述画面 2)不要加任何前缀（如"摘要："）3)重点记录${charName}的反应、情绪、说的话，以及两人交流中流露出的感受和氛围。用第三人称和"${userName}""${charName}"的名字。`,
            }, {
              role: 'user',
              content: `照片：${lastDesc.slice(0, 200)}\n\n对话：\n${transcript.slice(-3000)}`,
            }],
            // 推理模型的 thinking 会吃掉 max_tokens，给足额度防止正文截断
            max_tokens: 4000,
          }),
        });
        const data = await res.json();
        if (res.ok) summary = data.choices?.[0]?.message?.content?.trim() || '';
      }
    } catch (e) {
      console.warn('[Camera] a2 summary API failed:', e);
    }

    // 摘要写入聊天上下文 — system role + source=camera_a2 → MessageItem 渲染为粉色卡片
    const chatSummary = summary || `${userName}和${charName}一起看了一张照片并进行了讨论。`;
    const photoPreview = lastDesc.length > 150 ? lastDesc.slice(0, 150) + '…' : lastDesc;
    const messageContent = `📷 一起看照片\n\n${chatSummary}\n\n🖼 ${photoPreview}`;
    try {
      await DB.saveMessage({
        charId: a2SelectedCharId!,
        role: 'system',
        type: 'text',
        content: messageContent,
        metadata: { source: 'camera_a2', photoDesc: lastDesc },
      });
      addToast('摘要已同步到聊天 📤', 'success');
    } catch { /* ignore */ }

    // 留档到 memory_archive（quota 满时 addArchiveSafe 会自动压缩旧缩略图后重试）
    try {
      await addArchiveSafe({
        id: `ma_${Date.now()}`,
        thumbnail: await downscaleImage(lastResult?.dataUrl || '', 320),
        charId: a2SelectedCharId || '',
        charName,
        summary: chatSummary,
        description: lastDesc,
        prefixPrompt,
        presetName: activePreset?.name || '',
        refMode,
        tags: ['一起看过'],
        favorite: false,
        charAlbum: true,
        fromUser: false,
        kind: 'other',
        timestamp: Date.now(),
        a2Transcript: a2Messages.map(m => ({ role: m.role, content: m.content })),
      });
    } catch { /* ignore */ }
    setA2IsSummarizing(false);
    setShowA2Card(false);
    setA2Messages([]);
    setA2HasStarted(false);
  };

  // ── a2 重roll 最近回复 ──
  const handleA2Reroll = () => {
    const count = a2LastAssistantCountRef.current;
    if (count <= 0) { addToast('没有可重roll的回复', 'info'); return; }
    // 删掉最后 N 条 assistant 消息
    setA2Messages(prev => {
      const cut = [...prev];
      let removed = 0;
      while (removed < count && cut.length > 0 && cut[cut.length - 1].role === 'assistant') {
        cut.pop();
        removed++;
      }
      return cut;
    });
    // 恢复用户输入并重发
    setA2Input(a2LastUserMsgRef.current);
    setTimeout(() => {
      if (a2LastUserMsgRef.current.trim()) handleA2Send();
    }, 100);
  };

  // ── a5 比例快捷选择 ──
  const openA5Card = () => {
    const s = loadImageGenSettings();
    setA5Size(s.size || 'auto');
    setShowA5Card(true);
  };

  const handleA5Select = (size: string) => {
    const s = loadImageGenSettings();
    saveImageGenSettings({ ...s, size });
    setA5Size(size);
    addToast(`比例已切换为 ${SIZE_LABELS[size] || size}`, 'success');
    setShowA5Card(false);
  };

  // ── a6 预设快捷选择 ──
  const handleA6Select = (preset: ImageGenPreset) => {
    setActivePresetId(preset.id);
    setPrefixPrompt(preset.prompt);
    addToast(`已选用预设：${preset.name}`, 'success');
    setShowA6Card(false);
  };

  // ── a3 保存提示词 ──
  const saveA3 = () => {
    if (activePreset && prefixPrompt.trim() && prefixPrompt.trim() !== activePreset.prompt) {
      // 更新当前预设的 prompt
      const updated = settings.presets.map(p =>
        p.id === activePreset.id ? { ...p, prompt: prefixPrompt.trim() } : p,
      );
      saveImageGenSettings({ ...settings, presets: updated });
    }
    setShowA3Card(false);
    addToast('提示词已保存', 'success');
  };

  // ── 空状态取景器 ──
  const ViewfinderEmpty = () => (
    <div className="flex flex-col items-center justify-center h-full text-white/30 gap-3">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={0.8} stroke="currentColor" className="w-12 h-12">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
      </svg>
      <p className="text-[11px] font-medium tracking-wider">取景器</p>
      <button
        onClick={openGalleryPicker}
        className="px-3 py-1.5 rounded-full bg-white/10 text-white/50 text-[10px] font-medium active:scale-95 transition-all hover:bg-white/20"
      >
        从近期接收选择照片
      </button>
    </div>
  );

  // ── a1-a6 按钮数据（#202020 深色圆钮 + 白色线性图标） ──
  const A_BUTTONS = [
    { id: 'a1', label: '转发', icon: (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>) },
    { id: 'a2', label: '给他看', icon: (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>) },
    { id: 'a3', label: '提示词', icon: (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" /></svg>) },
    { id: 'a4', label: 'AI写', icon: (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" /></svg>) },
    { id: 'a5', label: '比例', icon: (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>) },
    { id: 'a6', label: '预设', icon: (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" /></svg>) },
  ];

  // ── a2 新 UI 派生值（PNG 镂空设计）──
  const a2Char = characters.find(c => c.id === a2SelectedCharId);
  const a2CharName = a2Char?.name || '';
  const a2Now = new Date();
  const a2DateStr = `${a2Now.getFullYear()}年${a2Now.getMonth() + 1}月${a2Now.getDate()}日`;
  const a2LastAssistant = [...a2Messages].reverse().find(m => m.role === 'assistant');

  // ── 渲染 ──
  return (
    <div className="h-full bg-black flex flex-col select-none">
      {/* ═══ 顶栏 ═══ */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2" style={{ paddingTop: 'calc(var(--chrome-top) + 0.25rem)' }}>
        {/* 左侧：返回 + 留档 */}
        <div className="flex items-center gap-1">
          <button onClick={closeApp} className="w-9 h-9 rounded-full flex items-center justify-center text-white/80 active:scale-90 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
          </button>
          <button
            onClick={handleArchive}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 active:scale-90 transition-transform"
            title="留档"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg>
          </button>
        </div>

        {/* 中央：小按钮 a */}
        <button
          onClick={() => setShowAPanel(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 active:scale-90 transition-all"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
            className={`w-4 h-4 text-white/70 transition-transform duration-300 ${showAPanel ? 'rotate-180' : ''}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
          </svg>
        </button>

        {/* 右侧：设置 */}
        <button
          onClick={() => { setSettingsForm(loadImageGenSettings()); setShowSettings(true); }}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white/60 active:scale-90 transition-transform"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.127c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
        </button>
      </div>

      {/* ═══ 取景器 ═══ */}
      <div className="flex-1 mx-4 my-2 rounded-3xl overflow-hidden relative bg-white/5" onClick={() => showAPanel && setShowAPanel(false)}>
        {lastResult ? (
          <>
            <img
              src={lastResult.dataUrl}
              alt=""
              className="w-full h-full object-contain cursor-pointer"
              onClick={openPreview}
            />
            {/* 右上角：从近期接收选择 */}
            <button
              onClick={(e) => { e.stopPropagation(); openGalleryPicker(); }}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/70 active:scale-90 transition-transform hover:bg-black/60"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" /></svg>
            </button>
            {/* 左下角下载按钮 */}
            <button
              onClick={(e) => { e.stopPropagation(); handleDownload(); }}
              className="absolute bottom-3 left-3 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/80 active:scale-90 transition-transform hover:bg-black/60"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
            </button>
          </>
        ) : (
          <ViewfinderEmpty />
        )}
        {/* 生成中动画 */}
        {isGenerating && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm">
            <div className="w-12 h-12 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          </div>
        )}
      </div>

      {/* ═══ a 面板（a1-a6） ═══ */}
      <div className={`shrink-0 overflow-hidden transition-all duration-300 ${showAPanel ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="flex justify-center gap-2.5 px-4 pb-2">
          {A_BUTTONS.map(btn => (
            <button
              key={btn.id}
              onClick={() => {
                if (btn.id === 'a3') setShowA3Card(true);
                else if (btn.id === 'a4') setShowA4Card(true);
                else if (btn.id === 'a1') { if (!lastResult) { addToast('请先生成一张图片', 'info'); return; } setShowA1Card(true); }
                else if (btn.id === 'a2') openA2Card();
                else if (btn.id === 'a5') openA5Card();
                else if (btn.id === 'a6') setShowA6Card(true);
                else addToast(`${btn.label}即将开放`, 'info');
              }}
              className="w-11 h-11 rounded-full bg-[#202020] text-white flex items-center justify-center active:scale-90 transition-transform shadow-lg"
              title={btn.label}
            >
              {btn.icon}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ 底部：参考图 + 快门 + 重roll ═══ */}
      <div className="shrink-0 flex items-center justify-between px-8 pb-6" style={{ paddingBottom: 'max(1.5rem, var(--safe-bottom))' }}>
        {/* 左下：参考图（正方形） */}
        <button
          onClick={openRefPicker}
          className="w-12 h-12 rounded-2xl bg-white/10 overflow-hidden flex items-center justify-center active:scale-90 transition-transform border border-white/10"
        >
          {effectiveRefUrl ? (
            <img src={effectiveRefUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-6 h-6 text-white/30"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>
          )}
        </button>

        {/* 中央：快门（白外环 + 内圆，按压内圆缩小） */}
        <ShutterButton onClick={handleCapture} disabled={isGenerating} />

        {/* 右下：重roll */}
        <button
          onClick={handleReroll}
          disabled={isGenerating || !lastResult}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white/60 active:scale-90 transition-transform disabled:opacity-20"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
        </button>
      </div>

      {/* ═══ 参考图选择弹窗 ═══ */}
      {showRefPicker && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center" onClick={() => setShowRefPicker(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-800 mb-4 text-center">选择参考图</h3>
            {/* 自己 */}
            <div className="mb-4">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">拍照的人</p>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => { setCharId('user'); setCustomRefBlobRef(null); setShowRefPicker(false); }}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${charId === 'user' && !customRefBlobRef ? 'bg-sky-100 ring-2 ring-sky-400' : 'hover:bg-slate-100'}`}
                >
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-sm font-bold">我</div>
                  <span className="text-[10px] text-slate-600">Angelica</span>
                </button>
              </div>
            </div>
            {/* 角色 tab：全部角色都列出来（2026-08-30 修「选角色选不了」——以前只列有参考图的角色，
                角色没存参考图时这一栏整个消失；现在无参考图的角色也可选，锁脸图去角色设置里补） */}
            {characters.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">角色参考图</p>
                <div className="flex gap-2 flex-wrap">
                  {characters.map(c => (
                    <button
                      key={c.id}
                      onClick={() => selectCharRef(c.id)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${c.id === charId && !customRefBlobRef ? 'bg-sky-100 ring-2 ring-sky-400' : 'hover:bg-slate-100'}`}
                    >
                      {c.referenceImageAssetId ? (
                        <CharRefAvatar charId={c.id} />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center text-white text-sm font-bold">{c.name.charAt(0)}</div>
                      )}
                      <span className="text-[10px] text-slate-600 truncate max-w-[60px]">{c.name}</span>
                    </button>
                  ))}
                </div>
                {!characters.some(c => c.referenceImageAssetId) && (
                  <p className="text-[9px] text-slate-400 mt-1.5 leading-relaxed">角色还没存参考图：选中的角色仍可作为拍照人；想锁脸生图，去角色设置「外貌描述 & 参考图」补一张。</p>
                )}
              </div>
            )}
            {/* 自定义上传 */}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">自定义上传</p>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleCustomUpload} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`w-full py-3 rounded-xl border-2 border-dashed text-xs font-bold transition-colors ${customRefBlobRef ? 'border-violet-300 bg-violet-50 text-violet-600' : 'border-slate-300 text-slate-400 hover:border-slate-400'}`}
              >
                {customRefBlobRef ? '已上传自定义参考图（点击更换）' : '上传参考图'}
              </button>
            </div>
            {/* 清除 */}
            {customRefBlobRef && (
              <button onClick={() => { setCustomRefBlobRef(null); addToast('已清除自定义参考图', 'info'); }} className="w-full mt-2 py-2 text-[10px] text-red-400 font-bold">清除参考图</button>
            )}
            <button onClick={() => setShowRefPicker(false)} className="w-full mt-2 py-2.5 text-xs font-bold text-slate-400 bg-slate-100 rounded-xl">关闭</button>
          </div>
        </div>
      )}

      {/* ═══ 近期接收选择器 ═══ */}
      {showGalleryPicker && (
        <div className="fixed inset-0 z-[320] flex items-end sm:items-center justify-center" onClick={() => setShowGalleryPicker(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm max-h-[80vh] overflow-y-auto p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-800 mb-4 text-center">从近期接收选择</h3>
            {galleryImages.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-8">暂无历史照片</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {galleryImages.map(img => (
                  <GalleryThumb key={img.id} receipt={img} onSelect={loadFromReceipt} />
                ))}
              </div>
            )}
            <button onClick={() => setShowGalleryPicker(false)} className="w-full mt-4 py-2.5 text-xs font-bold text-slate-400 bg-slate-100 rounded-xl">关闭</button>
          </div>
        </div>
      )}

      {/* ═══ a1 转发卡片 ═══ */}
      {showA1Card && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => { setShowA1Card(false); setA1SelectedCharId(null); setA1Message(''); }}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-800 mb-4 text-center">转发</h3>

            {/* 缩略图预览 */}
            {lastResult && (
              <div className="mb-3 rounded-xl overflow-hidden bg-slate-100">
                <img src={lastResult.dataUrl} alt="" className="w-full h-32 object-contain" />
              </div>
            )}

            {/* 角色选择 */}
            <div className="mb-3">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">转发给</label>
              <div className="flex gap-1.5 flex-wrap mt-1 max-h-32 overflow-y-auto">
                {characters.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setA1SelectedCharId(c.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-colors ${
                      a1SelectedCharId === c.id
                        ? 'bg-sky-100 ring-2 ring-sky-400 text-sky-700'
                        : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                      {c.name.charAt(0)}
                    </span>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 留言 */}
            <div className="mb-3">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">说点什么（可选）</label>
              <textarea
                value={a1Message}
                onChange={e => setA1Message(e.target.value)}
                rows={2}
                placeholder="附带留言…"
                className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-sky-400 resize-none mt-1"
              />
            </div>

            <button
              onClick={handleA1Send}
              disabled={a1Sending || !a1SelectedCharId}
              className="w-full py-3 rounded-xl bg-sky-500 text-white text-xs font-bold active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {a1Sending ? (
                <><div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> 发送中…</>
              ) : (
                '↗ 发送'
              )}
            </button>
            <button onClick={() => { setShowA1Card(false); setA1SelectedCharId(null); setA1Message(''); }} className="w-full mt-2 py-2.5 text-xs text-slate-400 font-bold">取消</button>
          </div>
        </div>
      )}

      {/* ═══ a5 比例快捷选择 ═══ */}
      {showA5Card && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setShowA5Card(false)}>
          <div className="bg-white rounded-3xl w-full max-w-xs p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-800 mb-4 text-center">画面比例</h3>
            <div className="grid grid-cols-3 gap-2">
              {SIZE_OPTS.map(size => (
                <button
                  key={size}
                  onClick={() => handleA5Select(size)}
                  className={`py-3 rounded-xl text-[11px] font-bold transition-colors ${
                    a5Size === size
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <div className="text-base mb-0.5">{SIZE_ICONS[size] || '⬜'}</div>
                  {SIZE_LABELS[size] || size}
                </button>
              ))}
            </div>
            <button onClick={() => setShowA5Card(false)} className="w-full mt-3 py-2.5 text-xs text-slate-400 font-bold">取消</button>
          </div>
        </div>
      )}

      {/* ═══ a6 预设快捷选择 ═══ */}
      {showA6Card && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setShowA6Card(false)}>
          <div className="bg-white rounded-3xl w-full max-w-xs p-5 shadow-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-800 mb-4 text-center">选择预设</h3>
            {settings.presets.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-6">暂无预设，请先在设置中创建</p>
            ) : (
              <div className="space-y-1.5">
                {settings.presets.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleA6Select(p)}
                    className={`w-full text-left px-4 py-3 rounded-xl text-xs font-medium transition-colors ${
                      activePresetId === p.id
                        ? 'bg-indigo-50 ring-2 ring-indigo-400 text-indigo-700'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-bold">{p.name}</div>
                    {p.prompt && <div className="text-[10px] text-slate-400 mt-0.5 truncate">{p.prompt}</div>}
                  </button>
                ))}
              </div>
            )}
            {activePresetId && (
              <button
                onClick={() => { setActivePresetId(null); setPrefixPrompt(''); addToast('已取消预设', 'info'); setShowA6Card(false); }}
                className="w-full mt-2 py-2.5 text-xs text-red-400 font-bold"
              >
                取消预设
              </button>
            )}
            <button onClick={() => setShowA6Card(false)} className="w-full mt-2 py-2.5 text-xs text-slate-400 font-bold">关闭</button>
          </div>
        </div>
      )}

      {/* ═══ a2 给他看 — 全屏 PNG 镂空设计 ═══ */}
      {showA2Card && (
        <div
          className="fixed inset-0 z-[300] bg-black/60 flex justify-center"
          onClick={() => { setShowA2Card(false); if (!a2HasStarted) setA2Messages([]); }}
        >
          <div
            className="a2-card relative h-full w-full max-w-[420px] bg-white flex flex-col overflow-hidden transition-transform duration-200"
            onClick={e => e.stopPropagation()}
            style={{ paddingTop: 'max(0px, var(--safe-top))' }}
          >
            {/* 聊天背景 talkto.png — 从卡片顶部铺开（与上半区 PNG 同起点），上半区蒙版盖住其顶部 */}
            <img
              src="Camerachat/talkto.png"
              alt=""
              draggable={false}
              className="absolute top-0 left-0 w-full pointer-events-none select-none"
            />

            {/* ── 上半区：照片 + cameraui2.png 蒙版 + 文本层 ── */}
            <div className="relative w-full shrink-0" style={{ aspectRatio: '918 / 775' }}>
              {/* 图层1：照片（镂空位置，向右旋转 8°。中心 (240,417.5)，尺寸 ~352x389 + 6% 出血） */}
              <div
                className="absolute overflow-hidden bg-slate-200"
                style={{ left: '5.9%', top: '27.5%', width: '40.5%', height: '52.8%', transform: 'rotate(8deg)' }}
              >
                {lastResult && <img src={lastResult.dataUrl} alt="" draggable={false} className="w-full h-full object-cover" />}
              </div>
              {/* 图层2：PNG 蒙版（只显示，不接事件） */}
              <img
                src="Camerachat/cameraui2.png"
                alt=""
                draggable={false}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
              />
              {/* 图层3：照片热区（上半区唯一交互）→ 大图 */}
              <button
                onClick={openPreview}
                aria-label="查看大图"
                className="absolute"
                style={{ left: '5.9%', top: '27.5%', width: '40.5%', height: '52.8%', transform: 'rotate(8deg)' }}
              />
              {/* 人名 #393939 */}
              <div className="absolute flex items-center overflow-hidden" style={{ left: '54.5%', top: '34.8%', width: '27.2%', height: '5.8%' }}>
                <span className="truncate font-bold tracking-wide" style={{ color: '#393939', fontSize: 'clamp(11px, 4.2vw, 17px)' }}>
                  {a2CharName || '选个角色吧'}
                </span>
              </div>
              {/* 状态栏：流式自动填 #7a7a7a（人名已在上方人名区，这里不重复） */}
              <div className="absolute overflow-hidden" style={{ left: '55%', top: '45.2%', width: '29.4%', height: '19.4%' }}>
                <div className="leading-snug overflow-hidden" style={{ color: '#7a7a7a', fontSize: 'clamp(8px, 3vw, 11px)', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                  {a2StreamingContent || a2LastAssistant?.content?.slice(0, 60) || '待机中…'}
                  {a2StreamingContent && <span className="inline-block w-1 h-2.5 bg-slate-400 animate-pulse align-middle ml-0.5" />}
                </div>
              </div>
              {/* 描述栏 #7a7a7a（短文案，长内容等后续换） */}
              <div className="absolute overflow-hidden" style={{ left: '55%', top: '65.2%', width: '29.4%', height: '12.3%' }}>
                <p className="leading-snug" style={{ color: '#7a7a7a', fontSize: 'clamp(7px, 2.6vw, 10.5px)', wordBreak: 'break-all' }}>
                  {(lastDesc || '还没有照片描述').slice(0, 36)}
                </p>
              </div>
              {/* 日期 #7a7a7a */}
              <div className="absolute flex items-end overflow-hidden" style={{ left: '55%', top: '77.4%', width: '19.6%', height: '2.6%' }}>
                <span className="truncate" style={{ color: '#7a7a7a', fontSize: 'clamp(6px, 2.2vw, 9px)', lineHeight: 1 }}>
                  {a2DateStr}
                </span>
              </div>
            </div>

            {/* ── 下半区：聊天（背景即卡片底层的 talkto.png） ── */}
            <div className="relative flex-1 flex flex-col overflow-hidden">
              {/* 消息区（空态即背景里的 "Talk to him now"） */}
              <div className="relative flex-1 overflow-y-auto px-3 pt-2 pb-1 space-y-2">
                {a2Messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {editingMsgIdx === i ? (
                      <div className="w-full space-y-1.5">
                        <textarea
                          value={editingMsgContent}
                          onChange={e => setEditingMsgContent(e.target.value)}
                          rows={4}
                          className="w-full text-[11px] px-3 py-2 rounded-xl bg-white outline-none resize-none border"
                          style={{ borderColor: '#8b8b8b' }}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const updated = [...a2Messages];
                              updated[i] = { ...updated[i], content: editingMsgContent };
                              setA2Messages(updated);
                              setEditingMsgIdx(null);
                            }}
                            className="px-3 py-1.5 rounded-lg text-white text-[10px] font-bold"
                            style={{ backgroundColor: '#383639' }}
                          >保存</button>
                          <button
                            onClick={() => setEditingMsgIdx(null)}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-bold"
                          >取消</button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`max-w-[85%] px-3 py-2 rounded-2xl text-[11px] leading-relaxed cursor-pointer ${
                          msg.role === 'user'
                            ? 'bg-sky-500 text-white rounded-br-md'
                            : 'bg-white/90 text-slate-700 rounded-bl-md border border-pink-200/70 shadow-sm'
                        }`}
                        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                        onDoubleClick={() => {
                          setEditingMsgIdx(i);
                          setEditingMsgContent(msg.content);
                        }}
                        title="双击编辑消息"
                      >
                        {msg.content}
                      </div>
                    )}
                  </div>
                ))}
                {a2StreamingContent && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-bl-md bg-white/90 text-slate-700 text-[11px] leading-relaxed border border-pink-200/70 shadow-sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {a2StreamingContent}
                      <span className="inline-block w-1.5 h-3.5 bg-slate-400 animate-pulse ml-0.5 align-middle" />
                    </div>
                  </div>
                )}
                {a2IsLoading && !a2StreamingContent && (
                  <div className="flex justify-start">
                    <div className="px-3 py-2 rounded-2xl rounded-bl-md bg-white/90 border border-pink-200/70 shadow-sm">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={a2ChatEndRef} />
              </div>

              {/* 弹层：角色选择 */}
              {a2ShowCharPicker && !a2HasStarted && (
                <div className="absolute left-3 right-3 bottom-[204px] z-20 bg-white rounded-2xl shadow-xl border border-[#e0d1d4] p-3 animate-in fade-in slide-in-from-bottom-2 max-h-48 overflow-y-auto">
                  <div className="flex gap-1 flex-wrap">
                    {characters.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setA2SelectedCharId(c.id); setA2ShowCharPicker(false); }}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-medium transition-colors ${
                          a2SelectedCharId === c.id ? 'text-[#383639]' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                        }`}
                        style={a2SelectedCharId === c.id ? { backgroundColor: '#ffe6eb' } : undefined}
                      >
                        <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[7px] font-bold shrink-0" style={{ backgroundColor: '#8b8b8b' }}>
                          {c.name.charAt(0)}
                        </span>
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 弹层：预设池 */}
              {a2ShowPresets && (
                <div className="absolute left-3 right-3 bottom-[204px] z-20 bg-white rounded-2xl shadow-xl border border-[#e0d1d4] p-3 animate-in fade-in slide-in-from-bottom-2 space-y-1.5 max-h-56 overflow-y-auto">
                  <div className="flex gap-1 flex-wrap">
                    {allA2Presets.map(p => (
                      <button
                        key={p.name}
                        onClick={() => { setA2CustomPrompt(p.text); setA2ActivePresetName(p.name); }}
                        className={`px-2 py-1 rounded-lg text-[9px] font-medium transition-colors ${
                          a2ActivePresetName === p.name
                            ? 'text-white'
                            : 'text-[#8e8e8e]'
                        }`}
                        style={{ backgroundColor: a2ActivePresetName === p.name ? '#383639' : '#fdf2f8' }}
                      >
                        {p.name}
                        {!p.isDefault && (
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteA2Preset(p.name); }}
                            className="ml-1 text-[8px] opacity-50 hover:opacity-100"
                          >×</button>
                        )}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={a2CustomPrompt}
                    onChange={e => { setA2CustomPrompt(e.target.value); setA2ActivePresetName(''); }}
                    rows={2}
                    placeholder="自定义：谁拍的？谁的手机？什么场景？…"
                    className="w-full text-[10px] px-2 py-1.5 rounded-lg outline-none resize-none border"
                    style={{ backgroundColor: '#fdf2f8', borderColor: '#8b8b8b' }}
                  />
                  <div className="flex gap-1">
                    <input
                      value={a2NewPresetName}
                      onChange={e => setA2NewPresetName(e.target.value)}
                      placeholder="预设名称"
                      className="flex-1 text-[10px] px-2 py-1 rounded-lg bg-white border border-slate-200 outline-none"
                    />
                    <button
                      onClick={saveA2Preset}
                      disabled={!a2CustomPrompt.trim()}
                      className="px-3 py-1 rounded-lg text-white text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40"
                      style={{ backgroundColor: '#383639' }}
                    >保存预设</button>
                  </div>
                </div>
              )}

              {/* 控制行：角色选择 + Prompt 长框 + 重roll（输入框上方） */}
              <div className="relative shrink-0 flex items-center gap-2 px-5 pb-2">
                <button
                  onClick={() => !a2HasStarted && setA2ShowCharPicker(v => !v)}
                  disabled={a2HasStarted}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-medium transition-colors shrink-0 ${a2HasStarted ? 'opacity-60' : ''}`}
                  style={{ backgroundColor: '#ffe6eb', color: '#383639' }}
                >
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0" style={{ backgroundColor: '#8b8b8b' }}>
                    {a2CharName?.charAt(0) || '?'}
                  </span>
                  <span className="truncate max-w-[70px]">{a2CharName || '选择角色'}</span>
                  <svg className={`w-3 h-3 transition-transform ${a2ShowCharPicker ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                </button>
                <button
                  onClick={() => setA2ShowPresets(v => !v)}
                  className={`flex-1 min-w-0 flex items-center justify-between px-3 py-2 rounded-xl text-[10px] border transition-colors ${
                    a2ActivePresetName ? 'text-[#383639]' : 'text-[#8e8e8e]'
                  }`}
                  style={{ backgroundColor: a2ActivePresetName ? '#ffe6eb' : '#fdf2f8', borderColor: '#e0d1d4' }}
                >
                  <span className="truncate italic">{a2ActivePresetName || 'Prompt'}</span>
                  <svg className={`w-3 h-3 shrink-0 transition-transform ${a2ShowPresets ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                </button>
                {a2LastAssistantCountRef.current > 0 && (
                  <button
                    onClick={handleA2Reroll}
                    disabled={a2IsLoading}
                    className="shrink-0 w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 active:scale-90 transition-transform disabled:opacity-30"
                    title="重roll最近回复"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
                  </button>
                )}
              </div>

              {/* 输入行：输入框 + 气泡/文本切换 */}
              <div className="relative shrink-0 flex items-center gap-2 px-5 pb-2">
                <textarea
                  ref={a2InputRef}
                  value={a2Input}
                  onChange={e => setA2Input(e.target.value)}
                  onFocus={() => {
                    // 键盘弹出时：把卡片抬到「发送键正好在键盘上方」，抬多少按发送键实际位置算
                    if (window.visualViewport) {
                      a2SendBaseDistRef.current = a2SendRef.current
                        ? window.innerHeight - a2SendRef.current.getBoundingClientRect().bottom
                        : 90;
                      const onResize = () => {
                        const card = a2InputRef.current?.closest('.a2-card') as HTMLElement;
                        if (!card) return;
                        const offset = window.innerHeight - window.visualViewport!.height;
                        card.style.transform = offset > 100
                          ? `translateY(-${Math.max(0, offset - a2SendBaseDistRef.current + 8)}px)`
                          : '';
                      };
                      a2VVHandlerRef.current = onResize;
                      window.visualViewport.addEventListener('resize', onResize);
                    }
                  }}
                  onBlur={() => {
                    const card = a2InputRef.current?.closest('.a2-card') as HTMLElement;
                    if (card) card.style.transform = '';
                    if (a2VVHandlerRef.current && window.visualViewport) {
                      window.visualViewport.removeEventListener('resize', a2VVHandlerRef.current);
                      a2VVHandlerRef.current = null;
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (a2Input.trim() && !a2IsLoading) handleA2Send();
                    }
                  }}
                  rows={1}
                  placeholder="message……"
                  className="flex-1 text-xs px-4 py-2.5 rounded-full bg-slate-50 outline-none resize-none"
                  disabled={a2IsLoading}
                />
                <button
                  onClick={() => setA2OutputMode(m => m === 'bubbles' ? 'longform' : 'bubbles')}
                  className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-[13px] transition-colors"
                  style={{ backgroundColor: a2OutputMode === 'bubbles' ? '#f1f9ff' : '#fff5da' }}
                  title={a2OutputMode === 'bubbles' ? '气泡模式' : '长文模式'}
                >
                  {a2OutputMode === 'bubbles' ? '💬' : '📝'}
                </button>
              </div>

              {/* 发送行（原样式）：发送 + 结束 */}
              <div className="relative shrink-0 flex gap-2 px-5 pb-1.5">
                <button
                  ref={a2SendRef}
                  onClick={handleA2Send}
                  disabled={!a2Input.trim() || a2IsLoading || !a2SelectedCharId}
                  className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center"
                  style={{ backgroundColor: '#383639' }}
                >
                  {a2IsLoading ? '回复中…' : '发送'}
                </button>
                {a2HasStarted && (
                  <button
                    onClick={handleA2End}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-500 text-xs font-bold active:scale-95 transition-transform"
                  >
                    结束
                  </button>
                )}
              </div>

              {/* 取消 / 暂离（原样式） */}
              <div className="relative shrink-0 px-5 pb-[max(48px,var(--safe-bottom))]">
                {!a2HasStarted ? (
                  <button onClick={() => { setShowA2Card(false); setA2Messages([]); }} className="w-full py-1 text-[10px] text-slate-400 font-medium flex items-center justify-center">取消</button>
                ) : (
                  <button onClick={() => setShowA2Card(false)} className="w-full py-1 text-[10px] text-slate-400 font-medium flex items-center justify-center">暂离（聊天已保留）</button>
                )}
              </div>

              {/* 摘要生成中覆盖层 */}
              {a2IsSummarizing && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-30">
                  <div className="w-10 h-10 rounded-full border-2 border-pink-200 border-t-pink-500 animate-spin" />
                  <p className="text-xs text-slate-500 font-medium">正在生成摘要并留档…</p>
                  <p className="text-[10px] text-slate-400">完成后会自动关闭</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ a3 提示词修改卡片 ═══ */}
      {showA3Card && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setShowA3Card(false)}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-800 mb-4 text-center">全部提示词修改</h3>
            {/* 1) 前缀提示词 + 预设 */}
            <div className="mb-4">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">前缀提示词</label>
              <div className="flex gap-1 mt-1 mb-2">
                <select
                  value={activePresetId || ''}
                  onChange={e => {
                    const id = e.target.value;
                    setActivePresetId(id || null);
                    if (id) {
                      const p = settings.presets.find(x => x.id === id);
                      if (p) setPrefixPrompt(p.prompt);
                    }
                  }}
                  className="text-[10px] px-2 py-1.5 rounded-lg bg-slate-100 border-none outline-none flex-1"
                >
                  <option value="">不使用预设</option>
                  {settings.presets.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <textarea
                value={prefixPrompt}
                onChange={e => setPrefixPrompt(e.target.value)}
                rows={2}
                placeholder="前缀提示词（自动拼接到生图描述前）"
                className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-violet-400 resize-none"
              />
            </div>
            {/* 2) 具体生图提示词 */}
            <div className="mb-4">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">生图提示词</label>
              <textarea
                value={scenePrompt}
                onChange={e => setScenePrompt(e.target.value)}
                rows={4}
                placeholder="描述你想要生成的画面..."
                className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-violet-400 resize-none mt-1"
              />
            </div>
            {/* 3) 参考图模式 */}
            <div className="mb-4">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">参考图模式</label>
              <div className="flex gap-1.5 mt-1">
                {(['face_lock', 'style_ref', 'none'] as RefMode[]).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setRefMode(mode)}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-bold transition-colors ${refMode === mode ? 'bg-violet-500 text-white' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {REF_MODE_LABELS[mode]}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={saveA3} className="w-full py-3 rounded-xl bg-violet-500 text-white text-xs font-bold active:scale-95 transition-transform">
              保存提示词
            </button>
            <button onClick={() => setShowA3Card(false)} className="w-full mt-2 py-2.5 text-xs text-slate-400 font-bold">取消</button>
          </div>
        </div>
      )}

      {/* ═══ a4 提示词生成卡片 ═══ */}
      {showA4Card && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setShowA4Card(false)}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-800 mb-4 text-center">AI 写提示词</h3>

            {/* 需求输入 */}
            <div className="mb-3">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">需求描述</label>
              <textarea
                value={a4Requirement}
                onChange={e => setA4Requirement(e.target.value)}
                rows={3}
                placeholder="用自然语言描述你想要的画面，AI 会帮你扩展成专业的生图提示词…"
                className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-amber-400 resize-none mt-1"
              />
            </div>

            {/* 可选参考图（仅用于分析，与主生图参考图不互通） */}
            <div className="mb-3">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                参考图（可选 · 仅供 AI 分析用）
              </label>
              <div className="flex items-center gap-2 mt-1">
                <input ref={a4FileInputRef} type="file" accept="image/*" onChange={handleA4RefUpload} className="hidden" />
                <button
                  onClick={() => a4FileInputRef.current?.click()}
                  className={`shrink-0 px-3 py-2 rounded-xl text-[10px] font-bold border transition-colors ${
                    a4RefBlobRef
                      ? 'border-amber-300 bg-amber-50 text-amber-600'
                      : 'border-dashed border-slate-300 text-slate-400 hover:border-slate-400'
                  }`}
                >
                  {a4RefBlobRef ? '更换参考图' : '上传参考图'}
                </button>
                {a4RefDisplayUrl && (
                  <div className="relative shrink-0">
                    <img src={a4RefDisplayUrl} alt="" className="w-10 h-10 rounded-xl object-cover border border-slate-200" />
                    <button
                      onClick={() => { setA4RefBlobRef(null); setA4RefDataUrl(null); }}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-400 text-white text-[8px] flex items-center justify-center hover:bg-red-400 transition-colors"
                    >×</button>
                  </div>
                )}
              </div>
              <p className="text-[9px] text-slate-400 mt-1">此参考图仅用于 AI 分析生成提示词，不与相机主参考图互通</p>
            </div>

            {/* 生成按钮 */}
            <button
              onClick={handleA4Generate}
              disabled={a4IsGenerating || !a4Requirement.trim()}
              className="w-full py-2.5 rounded-xl bg-amber-500 text-white text-xs font-bold active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {a4IsGenerating ? (
                <><div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> 生成中…</>
              ) : (
                <>✨ 生成提示词</>
              )}
            </button>

            {/* 生成结果 */}
            {a4GeneratedPrompt && (
              <div className="mt-3">
                <div className="bg-slate-50 rounded-xl p-3 max-h-44 overflow-y-auto">
                  <p className="text-[11px] text-slate-700 leading-relaxed whitespace-pre-wrap">{a4GeneratedPrompt}</p>
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleA4Copy}
                    className={`flex-1 py-2 rounded-xl text-[11px] font-bold active:scale-95 transition-all ${
                      a4Copied ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {a4Copied ? '已复制 ✓' : '一键复制'}
                  </button>
                  <button
                    onClick={handleA4FillToPrompt}
                    className="flex-1 py-2 rounded-xl bg-violet-500 text-white text-[11px] font-bold active:scale-95 transition-transform"
                  >
                    填入提示词
                  </button>
                </div>
              </div>
            )}

            <button onClick={() => setShowA4Card(false)} className="w-full mt-3 py-2.5 text-xs text-slate-400 font-bold">关闭</button>
          </div>
        </div>
      )}

      {/* ═══ 留档卡片 ═══ */}
      {showArchiveCard && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => { setShowArchiveCard(false); setArchiveStep(null); }}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            {archiveStep === 'summary' && (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="w-10 h-10 rounded-full border-2 border-slate-200 border-t-violet-500 animate-spin" />
                <p className="text-xs text-slate-500">正在分析图片…</p>
              </div>
            )}
            {archiveStep === 'options' && (
              <>
                <h3 className="text-sm font-bold text-slate-800 mb-3 text-center">留档</h3>
                <p className="text-[11px] text-slate-500 mb-4 leading-relaxed bg-slate-50 rounded-xl p-3 max-h-32 overflow-y-auto">{archiveSummary}</p>
                {/* 选项 */}
                <div className="space-y-2 mb-4">
                  <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={archiveFavorite} onChange={e => setArchiveFavorite(e.target.checked)} className="rounded" />
                    同时收藏
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={!!archiveTags} onChange={e => { if (!e.target.checked) setArchiveTags(''); }} className="rounded" />
                    手动打标
                    {archiveTags !== '' && (
                      <input
                        type="text"
                        value={archiveTags}
                        onChange={e => setArchiveTags(e.target.value)}
                        placeholder="标签，逗号分隔"
                        className="flex-1 text-[10px] px-2 py-1 rounded-lg bg-slate-100 border-none outline-none"
                        autoFocus
                        onClick={e => e.stopPropagation()}
                      />
                    )}
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={archiveToChar} onChange={e => setArchiveToChar(e.target.checked)} className="rounded" />
                    同时存入角色相册
                  </label>
                </div>
                <button onClick={confirmArchive} className="w-full py-3 rounded-xl bg-violet-500 text-white text-xs font-bold active:scale-95 transition-transform">
                  确认留档
                </button>
                <button onClick={() => { setShowArchiveCard(false); setArchiveStep(null); }} className="w-full mt-2 py-2.5 text-xs text-slate-400 font-bold">取消</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ 设置卡片 ═══ */}
      {showSettings && <CameraSettings
        form={settingsForm}
        onChange={setSettingsForm}
        onClose={() => setShowSettings(false)}
        addToast={addToast}
      />}

      {/* ═══ ImageLightbox ═══ */}
      {previewMsg && (
        <ImageLightbox
          msg={previewMsg}
          charName={char?.name}
          onClose={() => setPreviewMsg(null)}
          onDownload={handleDownload}
          onDelete={() => {
            setPreviewMsg(null);
            setLastResult(null);
            setLastDesc('');
          }}
        />
      )}
    </div>
  );
};

// ── a2 快捷预设 ──
const A2_CUSTOM_PRESETS = [
  { label: '我拍的你', text: '这是我拍的你的照片。' },
  { label: '你拍的我', text: '这是你用你的手机拍的我。' },
  { label: '你拍的', text: '这是你自己拍的。' },
  { label: '我们一起的', text: '这是我们在一起的合影。' },
  { label: '别人帮拍的', text: '这是别人帮我们拍的合影。' },
];

// ── 尺寸选项（模块级，CameraApp 和 CameraSettings 共用）──
const SIZE_OPTS = ['auto', '1024x1024', '1024x1536', '1536x1024', '1792x1024', '1024x1792'];
const SIZE_LABELS: Record<string, string> = { auto: '自动', '1024x1024': '1:1', '1024x1536': '3:4', '1536x1024': '3:2', '1792x1024': '16:9', '1024x1792': '9:16' };
const SIZE_ICONS: Record<string, string> = { auto: '🔄', '1024x1024': '⬜', '1024x1536': '📱', '1536x1024': '🖥', '1792x1024': '🎬', '1024x1792': '📲' };

// ── 设置卡片子组件 ──

const CameraSettings: React.FC<{
  form: ReturnType<typeof loadImageGenSettings>;
  onChange: (f: ReturnType<typeof loadImageGenSettings>) => void;
  onClose: () => void;
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}> = ({ form, onChange, onClose, addToast }) => {
  const { apiPresets } = useOS();
  const [systemPrompt, setSystemPrompt] = useState(() => {
    try { return localStorage.getItem('os_camera_system_prompt') || ''; } catch { return ''; }
  });
  const [testing, setTesting] = useState(false);
  const [localForm, setLocalForm] = useState(form);
  const [imgPresetId, setImgPresetId] = useState<string | null>(null);
  const [promptGenPresetId, setPromptGenPresetId] = useState<string | null>(null);

  const update = (patch: Partial<typeof localForm>) => setLocalForm(prev => ({ ...prev, ...patch }));

  const loadPreset = (presetId: string, target: 'img' | 'promptGen') => {
    const preset = apiPresets.find(p => p.id === presetId);
    if (!preset) return;
    const base = preset.config.baseUrl?.trim() || '';
    const key = preset.config.apiKey?.trim() || '';
    const model = typeof preset.config.model === 'string' ? preset.config.model.trim() : '';
    if (target === 'img') {
      setImgPresetId(presetId);
      update({ baseUrl: base, apiKey: key, model });
    } else {
      setPromptGenPresetId(presetId);
      update({ promptGenBaseUrl: base, promptGenApiKey: key, promptGenModel: model });
    }
    addToast(`已载入预设：${preset.name}`, 'info');
  };

  const saveAll = () => {
    saveImageGenSettings(localForm);
    try { localStorage.setItem('os_camera_system_prompt', systemPrompt); } catch { /* ignore */ }
    onChange(localForm);
    addToast('设置已保存', 'success');
    onClose();
  };

  const testConnection = async () => {
    const s = localForm;
    if (!s.apiKey.trim() || !s.baseUrl.trim() || !s.model.trim()) {
      addToast('请先填写生图 API 配置', 'error');
      return;
    }
    setTesting(true);
    try {
      const url = s.baseUrl.trim().replace(/\/+$/, '') + '/images/generations';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.apiKey}` },
        body: JSON.stringify({ model: s.model, prompt: 'test', n: 1, ...(s.size !== 'auto' ? { size: s.size } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
      addToast('连接成功 ✨', 'success');
    } catch (err) {
      addToast(`连接失败：${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setTesting(false);
    }
  };

  // 胶囊式预设选择
  const PresetCapsules: React.FC<{ activeId: string | null; onSelect: (id: string) => void }> = ({ activeId, onSelect }) => (
    <div className="flex gap-1.5 flex-wrap">
      {apiPresets.map(p => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSelect(p.id)}
          className={`text-[10px] px-2.5 py-1 rounded-lg border font-medium transition-colors ${
            activeId === p.id
              ? 'bg-violet-50 border-violet-300 text-violet-600'
              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
          }`}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
  const MemoPresetCapsules = React.memo(PresetCapsules);

  return (
    <div className="fixed inset-0 z-[350] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-5 space-y-5">
          <h3 className="text-sm font-bold text-slate-800 text-center">相机设置</h3>

          {/* ── 生图 API ── */}
          <Section title="生图 API">
            <MemoPresetCapsules activeId={imgPresetId} onSelect={id => loadPreset(id, 'img')} />
            <InputRow label="接口地址" value={localForm.baseUrl} onChange={v => { setImgPresetId(null); update({ baseUrl: v }); }} placeholder="https://api.openai.com/v1" />
            <InputRow label="密钥" value={localForm.apiKey} onChange={v => { setImgPresetId(null); update({ apiKey: v }); }} placeholder="sk-..." password />
            <InputRow label="模型名" value={localForm.model} onChange={v => { setImgPresetId(null); update({ model: v }); }} placeholder="dall-e-3 / gpt-image-2" />
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">尺寸</label>
                <select value={localForm.size} onChange={e => update({ size: e.target.value })}
                  className="w-full text-[10px] px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 outline-none mt-0.5">
                  {SIZE_OPTS.map(o => <option key={o} value={o}>{SIZE_LABELS[o] || o}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">质量</label>
                <select value={localForm.quality} onChange={e => update({ quality: e.target.value })}
                  className="w-full text-[10px] px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 outline-none mt-0.5">
                  {['auto', 'low', 'medium', 'high'].map(o => <option key={o} value={o}>{o === 'auto' ? '自动' : o}</option>)}
                </select>
              </div>
            </div>
            <button onClick={testConnection} disabled={testing}
              className="w-full py-2 rounded-xl bg-sky-500 text-white text-[11px] font-bold active:scale-95 transition-transform disabled:opacity-50">
              {testing ? '测试中…' : '测试连接'}
            </button>
          </Section>

          {/* ── 提示词生成模型 ── */}
          <Section title="提示词生成模型（a4 AI写提示词用）">
            <MemoPresetCapsules activeId={promptGenPresetId} onSelect={id => loadPreset(id, 'promptGen')} />
            <InputRow label="接口地址" value={localForm.promptGenBaseUrl} onChange={v => { setPromptGenPresetId(null); update({ promptGenBaseUrl: v }); }} placeholder="https://api.openai.com/v1" />
            <InputRow label="密钥" value={localForm.promptGenApiKey} onChange={v => { setPromptGenPresetId(null); update({ promptGenApiKey: v }); }} placeholder="sk-..." password />
            <InputRow label="模型名" value={localForm.promptGenModel} onChange={v => { setPromptGenPresetId(null); update({ promptGenModel: v }); }} placeholder="gpt-4o-mini" />
          </Section>

          {/* ── 系统提示词 ── */}
          <Section title="系统提示词">
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              rows={4}
              placeholder="自定义生图时的系统提示词（给 AI 的风格/质量指令）"
              className="w-full text-[11px] px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-violet-400 resize-none"
            />
          </Section>

          {/* ── 数据备份（2026-09-04 分功能入口）── */}
          <Section title="数据备份">
            <DataBackupPanel scope="camera" />
          </Section>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-500 text-xs font-bold">取消</button>
            <button onClick={saveAll} className="flex-1 py-2.5 rounded-xl bg-violet-500 text-white text-xs font-bold active:scale-95 transition-transform">保存</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-2">
    <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{title}</h4>
    {children}
  </div>
);

const InputRow: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  password?: boolean;
}> = ({ label, value, onChange, placeholder, password }) => (
  <div className="flex flex-col gap-0.5">
    <label className="text-[10px] text-slate-400">{label}</label>
    <input
      type={password ? 'password' : 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full text-[11px] px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-sky-400"
    />
  </div>
);

// ── 快门按钮子组件 ──
const ShutterButton: React.FC<{ onClick: () => void; disabled?: boolean }> = ({ onClick, disabled }) => {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      className="w-16 h-16 rounded-full flex items-center justify-center disabled:opacity-40 select-none touch-none"
    >
      <svg width="64" height="64" viewBox="0 0 64 64">
        {/* 外白环: r=30, stroke=3 → 外缘30, 内缘27 */}
        <circle cx="32" cy="32" r="30" fill="none" stroke="white" strokeWidth="3" opacity="0.9" />
        {/* 内白圆: r=22，按压时 scale 缩小 */}
        <g
          style={{
            transform: pressed ? 'scale(0.77)' : 'scale(1)',
            transformOrigin: '32px 32px',
            transition: 'transform 0.12s ease-out',
          }}
        >
          <circle cx="32" cy="32" r="24" fill="white" opacity="0.9" />
        </g>
      </svg>
    </button>
  );
};

// ── 角色参考图缩略图子组件 ──
const CharRefAvatar: React.FC<{ charId: string }> = ({ charId }) => {
  const { characters } = useOS();
  const char = characters.find(c => c.id === charId);
  const url = useBlobRefUrl(char?.referenceImageAssetId);
  if (!url) return <div className="w-12 h-12 rounded-full bg-slate-200" />;
  return <img src={url} alt="" className="w-12 h-12 rounded-full object-cover" />;
};

// ── 近期接收缩略图子组件 ──
const GalleryThumb: React.FC<{
  receipt: { id: string; blobRef: string; description: string; mimeType: string };
  onSelect: (r: { id: string; blobRef: string; description: string; mimeType: string }) => void;
}> = React.memo(({ receipt, onSelect }) => {
  const url = useBlobRefUrl(receipt.blobRef);
  return (
    <button
      onClick={() => onSelect(receipt)}
      className="aspect-square rounded-xl overflow-hidden bg-slate-100 active:scale-95 transition-transform relative group"
    >
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[9px] text-slate-400">无预览</div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-black/50 py-1 px-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-[8px] text-white truncate">{receipt.description.slice(0, 20)}</p>
      </div>
    </button>
  );
});

export default CameraApp;

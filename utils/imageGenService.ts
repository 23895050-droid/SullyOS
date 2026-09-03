// 生图引擎 —— 直接调 OpenAI 兼容 /v1/images/generations 与 /v1/images/edits。
// 搬运自 ai-virtual-phone-ref 并适配 SullyOS 的 Blob 存储（blobRef）与设置体系。
//
// 关键设计：
//   · 浏览器直连（requestMode: 'direct'），不走 Worker 代理
//   · 多格式响应解析：b64_json / url / data[] / 直接返回 image/*
//   · 参考图（edits endpoint）：从 blobRef 读 Blob → FormData multipart
//   · 360s 超时 + AbortSignal 联动

import type { ImageGenerationSettings } from '../types';
import { loadImageGenSettings } from './imageGenStorage';
import { getBlobForRef, putImageBlob, blobToDataUrl, dataUrlToBlob } from './blobRef';
import { addImageGenLog } from './imageGenLog';

// ── 类型 ──────────────────────────────────────────────

export type ImageGenResult = {
  /** blobref 令牌，指向 blob_assets 中存储的图片 */
  blobRef: string;
  /** 浏览器可直接渲染的 data URL */
  dataUrl: string;
  blob: Blob;
  mimeType: string;
  /** 实际发送给 API 的完整 prompt */
  prompt: string;
  /** 是否使用了参考图（走了 edits endpoint） */
  usedReference: boolean;
  /** API 返回的 revised_prompt（DALL-E 系会返回改写后的 prompt） */
  revisedPrompt?: string;
};

type ExtractedImage =
  | { kind: 'b64'; b64: string; mimeType?: string; revisedPrompt?: string }
  | { kind: 'url'; url: string; revisedPrompt?: string };

// ── 图片模型嗅探关键词 ───────────────────────────────

const IMAGE_MODEL_HINTS = [
  'image', 'img', 'dall', 'flux', 'stable', 'sd', 'midjourney', 'mj',
  'ideogram', 'imagen', 'qwen-image', 'kolors', 'wan',
];

// ── 辅助函数 ──────────────────────────────────────────

function base64ToBlob(b64: string, mimeType: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function imageExtension(mimeType: string): string {
  const subtype = mimeType.split('/')[1] || 'png';
  return subtype.replace('jpeg', 'jpg');
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
    .replace(/\/images\/(?:generations|edits)$/i, '')
    .replace(/\/images$/i, '');
}

function buildImageUrl(baseUrl: string, mode: 'generations' | 'edits'): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (/\/images\/(?:generations|edits)$/i.test(trimmed)) {
    return trimmed.replace(/\/images\/(?:generations|edits)$/i, `/images/${mode}`);
  }
  if (/\/images$/i.test(trimmed)) return `${trimmed}/${mode}`;
  return `${normalizeBaseUrl(trimmed)}/images/${mode}`;
}

function buildModelsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (/\/models$/i.test(trimmed)) return trimmed;
  return `${normalizeBaseUrl(trimmed)}/models`;
}

function cleanBase64(value: string): { b64: string; mimeType?: string } {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(value.trim());
  if (match) return { mimeType: match[1], b64: match[2] };
  return { b64: value.trim() };
}

// ── 响应解析（多格式兼容）────────────────────────────

function extractFromObject(data: unknown): ExtractedImage | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const revisedPrompt =
    typeof record.revised_prompt === 'string' ? record.revised_prompt : undefined;

  // 1) 常见 base64 字段
  for (const key of ['b64_json', 'base64', 'b64', 'image', 'result']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      if (/^https?:\/\//i.test(value.trim()))
        return { kind: 'url', url: value.trim(), revisedPrompt };
      const cleaned = cleanBase64(value);
      return { kind: 'b64', ...cleaned, revisedPrompt };
    }
  }

  // 2) URL 字段
  for (const key of ['url', 'image_url']) {
    const value = record[key];
    if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) {
      return { kind: 'url', url: value.trim(), revisedPrompt };
    }
    if (value && typeof value === 'object') {
      const nested = (value as Record<string, unknown>).url;
      if (typeof nested === 'string' && /^https?:\/\//i.test(nested.trim())) {
        return { kind: 'url', url: nested.trim(), revisedPrompt };
      }
    }
  }

  // 3) 数组字段：data / images / output / content
  for (const key of ['data', 'images', 'output', 'content']) {
    const value = record[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.trim()) {
          if (/^https?:\/\//i.test(item.trim()))
            return { kind: 'url', url: item.trim(), revisedPrompt };
          const cleaned = cleanBase64(item);
          return { kind: 'b64', ...cleaned, revisedPrompt };
        }
        const nested = extractFromObject(item);
        if (nested) return { ...nested, revisedPrompt: nested.revisedPrompt || revisedPrompt };
      }
    }
  }

  return null;
}

// ── URL 下载为 base64 ─────────────────────────────────

async function fetchImageUrlAsBase64(
  url: string,
  signal?: AbortSignal,
): Promise<{ b64: string; mimeType: string }> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`图片 URL 下载失败 ${res.status}: ${text.slice(0, 160)}`);
  }
  const blob = await res.blob();
  const dataUrl = await blobToDataUrl(blob);
  const cleaned = cleanBase64(dataUrl);
  return { b64: cleaned.b64, mimeType: cleaned.mimeType || blob.type || 'image/png' };
}

// ── 响应解析主入口 ────────────────────────────────────

async function parseImageGenResponse(
  res: Response,
  signal?: AbortSignal,
): Promise<{ b64: string; mimeType: string; revisedPrompt?: string }> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`生图 API 错误 ${res.status}: ${text.slice(0, 600)}`);
  }

  // 直接返回图片二进制
  if (contentType.startsWith('image/')) {
    const blob = await res.blob();
    const dataUrl = await blobToDataUrl(blob);
    const cleaned = cleanBase64(dataUrl);
    return { b64: cleaned.b64, mimeType: cleaned.mimeType || contentType };
  }

  // JSON 响应
  const json = await res.json();
  const extracted = extractFromObject(json);
  if (!extracted) {
    const keys = Object.keys(json || {}).join(', ');
    throw new Error(`生图 API 返回中没有找到图片字段。返回的 key: ${keys.slice(0, 200)}`);
  }

  if (extracted.kind === 'url') {
    const downloaded = await fetchImageUrlAsBase64(extracted.url, signal);
    return { ...downloaded, revisedPrompt: extracted.revisedPrompt };
  }

  return {
    b64: extracted.b64,
    mimeType: extracted.mimeType || 'image/png',
    revisedPrompt: extracted.revisedPrompt,
  };
}

// ── Direct API 调用 ───────────────────────────────────

async function generateImageDirect(params: {
  settings: ImageGenerationSettings;
  prompt: string;
  referenceImageDataUrl: string | null;
  signal?: AbortSignal;
}): Promise<{ b64: string; mimeType: string; revisedPrompt?: string }> {
  const { settings, prompt, referenceImageDataUrl, signal } = params;
  const hasReference = Boolean(referenceImageDataUrl);
  const url = buildImageUrl(settings.baseUrl, hasReference ? 'edits' : 'generations');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${settings.apiKey}`,
  };
  let body: BodyInit;

  if (hasReference) {
    const converted = dataUrlToBlob(referenceImageDataUrl!);
    if (!converted) throw new Error('参考图格式无效');
    const form = new FormData();
    form.set('model', settings.model);
    form.set('prompt', prompt);
    if (settings.size && settings.size !== 'auto') form.set('size', settings.size);
    if (settings.quality && settings.quality !== 'auto') form.set('quality', settings.quality);
    form.append('image', converted, `reference.${imageExtension('image/png')}`);
    body = form;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({
      model: settings.model,
      prompt,
      ...(settings.size && settings.size !== 'auto' ? { size: settings.size } : {}),
      ...(settings.quality && settings.quality !== 'auto' ? { quality: settings.quality } : {}),
    });
  }

  // 360s 总超时 + 外部 AbortSignal 联动
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onOuterAbort, { once: true });
  const totalTimer = setTimeout(() => controller.abort(), 360_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    return await parseImageGenResponse(res, signal);
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new Error('生图请求超时（360 秒未返回）');
    }
    if (error instanceof TypeError) {
      throw new Error('浏览器直连失败：该 API 可能未允许跨域请求（CORS）');
    }
    throw error;
  } finally {
    clearTimeout(totalTimer);
    if (signal) signal.removeEventListener('abort', onOuterAbort);
  }
}

// ── Prompt 组装 ───────────────────────────────────────

/**
 * 把场景描述 + 前缀预设 + 外貌描述拼成最终生图 prompt。
 * 只有 scene（用户输入/LLM 场景描述）是必填的。
 */
export function buildImagePrompt(params: {
  scene: string;
  presetPrompt?: string;
  appearanceDescription?: string;
}): string {
  const parts: string[] = [];

  if (params.appearanceDescription?.trim()) {
    parts.push(params.appearanceDescription.trim());
  }
  if (params.scene.trim()) {
    parts.push(params.scene.trim());
  }
  if (params.presetPrompt?.trim()) {
    parts.push(params.presetPrompt.trim());
  }

  return parts.join('\n\n');
}

// ── 公共 API ──────────────────────────────────────────

/**
 * 从 blobRef 令牌读取参考图并转为 data URL。令牌不存在或 Blob 已丢时返回 null。
 */
async function resolveReferenceImage(blobRefToken?: string): Promise<string | null> {
  if (!blobRefToken) return null;
  try {
    const blob = await getBlobForRef(blobRefToken);
    if (!blob) return null;
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

/**
 * 主入口：根据配置生成一张图片。
 *
 * @param scene - 场景描述（用户输入或 LLM 改写，必填）
 * @param opts.referenceImageAssetId - 角色参考图 blobRef（可选，有则走 edits endpoint 锁脸）
 * @param opts.appearanceDescription - 角色外貌描述（可选，拼入 prompt）
 * @param opts.presetPrompt - 前缀预设 prompt（可选）
 * @param opts.settings - 生图设置（可选，不传则从 localStorage 读取）
 * @param opts.signal - AbortSignal（可选，用于取消请求）
 */
export async function generateImage(
  scene: string,
  opts?: {
    referenceImageAssetId?: string;
    appearanceDescription?: string;
    presetPrompt?: string;
    settings?: ImageGenerationSettings;
    signal?: AbortSignal;
  },
): Promise<ImageGenResult> {
  const settings = opts?.settings ?? loadImageGenSettings();

  if (!settings.enabled) throw new Error('生图功能未启用');
  const description = scene.trim();
  if (!description) throw new Error('缺少场景描述');
  if (!settings.apiKey.trim() || !settings.baseUrl.trim() || !settings.model.trim()) {
    throw new Error('生图配置不完整：请填入 API Key、Base URL 和模型');
  }

  const prompt = buildImagePrompt({
    scene: description,
    presetPrompt: opts?.presetPrompt,
    appearanceDescription: opts?.appearanceDescription,
  });

  // 解析参考图
  const referenceImageDataUrl = await resolveReferenceImage(opts?.referenceImageAssetId);
  const hasReference = Boolean(referenceImageDataUrl);

  const t0 = performance.now();
  try {
    const data = await generateImageDirect({
      settings,
      prompt,
      referenceImageDataUrl,
      signal: opts?.signal,
    });

    const mimeType = data.mimeType || 'image/png';
    const blob = base64ToBlob(data.b64, mimeType);

    // 存为 Blob 并返回 blobRef 令牌
    const blobRef = await putImageBlob(blob);

    // 成功日志
    addImageGenLog({
      endpoint: hasReference ? 'edits' : 'generations',
      url: buildImageUrl(settings.baseUrl, hasReference ? 'edits' : 'generations'),
      model: settings.model,
      prompt,
      size: settings.size,
      quality: settings.quality,
      hasReference,
      referenceAssetId: opts?.referenceImageAssetId,
      ok: true,
      status: 200,
      revisedPrompt: data.revisedPrompt,
      durationMs: Math.round(performance.now() - t0),
      imageBytes: blob.size,
      mimeType,
    });

    return {
      blobRef,
      dataUrl: `data:${mimeType};base64,${data.b64}`,
      blob,
      mimeType,
      prompt,
      usedReference: hasReference,
      revisedPrompt: data.revisedPrompt,
    };
  } catch (error) {
    // 失败日志
    addImageGenLog({
      endpoint: hasReference ? 'edits' : 'generations',
      url: buildImageUrl(settings.baseUrl, hasReference ? 'edits' : 'generations'),
      model: settings.model,
      prompt,
      size: settings.size,
      quality: settings.quality,
      hasReference,
      referenceAssetId: opts?.referenceImageAssetId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Math.round(performance.now() - t0),
    });
    throw error;
  }
}

/**
 * 生成图片文件名（用于下载/存储）。
 */
export function generatedImageFilename(description: string, mimeType = 'image/png'): string {
  const safe = description
    .replace(/\s+/g, '-')
    .replace(/[^一-龥A-Za-z0-9_-]+/g, '')
    .slice(0, 28) || 'generated-image';
  return `${safe}.${imageExtension(mimeType)}`;
}

// ── 模型列表 ──────────────────────────────────────────

function extractModels(data: unknown): string[] {
  const results: string[] = [];
  const push = (value: unknown) => {
    if (typeof value !== 'string') return;
    const normalized = value.replace(/^models\//, '').trim();
    if (normalized) results.push(normalized);
  };

  if (Array.isArray(data)) {
    data.forEach(item => {
      if (typeof item === 'string') push(item);
      else if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>;
        push(row.id ?? row.name ?? row.model);
      }
    });
  } else if (data && typeof data === 'object') {
    const row = data as Record<string, unknown>;
    for (const key of ['data', 'models', 'items']) {
      const value = row[key];
      if (Array.isArray(value)) results.push(...extractModels(value));
    }
    push(row.id ?? row.name ?? row.model);
  }

  return Array.from(new Set(results));
}

/**
 * 只保留可能是生图模型的条目。
 */
export function filterImageModels(models: string[]): string[] {
  const filtered = models.filter(model =>
    IMAGE_MODEL_HINTS.some(hint => model.toLowerCase().includes(hint)),
  );
  return filtered.length > 0 ? filtered : models;
}

/**
 * 拉取生图模型列表（用于设置页模型选择器）。
 */
export async function fetchImageModels(
  settings: Pick<ImageGenerationSettings, 'apiKey' | 'baseUrl'>,
): Promise<string[]> {
  const url = buildModelsUrl(settings.baseUrl);
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${settings.apiKey}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`模型列表 API 错误 ${res.status}: ${text.slice(0, 400)}`);
  }
  return extractModels(JSON.parse(text));
}

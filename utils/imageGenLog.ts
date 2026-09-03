// 生图 API 调用日志 —— 每次 generateImage / 测试生图都会记录。
// 存在 localStorage，最多保留 50 条，超过自动淘汰旧记录。
// 在 ImageGenSettings 的「生图日志」区查看。

export interface ImageGenLogEntry {
  id: string;
  /** 调用时间戳 ms */
  timestamp: number;
  /** generations | edits */
  endpoint: string;
  /** 实际请求 URL */
  url: string;
  model: string;
  /** 发送给 API 的完整 prompt（多段拼接后的最终版） */
  prompt: string;
  size?: string;
  quality?: string;
  /** 是否使用了参考图（走了 edits endpoint） */
  hasReference: boolean;
  /** 参考图 blobRef（不存 Blob 原文，太占空间） */
  referenceAssetId?: string;
  // ── 响应 ──
  /** HTTP 状态码 */
  status?: number;
  /** 成功拿到图片 */
  ok: boolean;
  /** 错误信息 */
  error?: string;
  /** API 返回的 revised_prompt */
  revisedPrompt?: string;
  /** 请求耗时 ms */
  durationMs?: number;
  /** 返回图片大小（bytes） */
  imageBytes?: number;
  /** 返回图片 mimeType */
  mimeType?: string;
}

const STORAGE_KEY = 'os_image_gen_logs';
const MAX_LOGS = 50;

export function loadImageGenLogs(): ImageGenLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveImageGenLogs(logs: ImageGenLogEntry[]): void {
  try {
    // 最多保留 MAX_LOGS 条
    const trimmed = logs.slice(0, MAX_LOGS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota exceeded — 静默丢弃最旧的一半 */
    try {
      const trimmed = logs.slice(0, Math.floor(MAX_LOGS / 2));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      /* 实在写不进就算 */
    }
  }
}

export function addImageGenLog(entry: Omit<ImageGenLogEntry, 'id' | 'timestamp'>): void {
  const logs = loadImageGenLogs();
  const record: ImageGenLogEntry = {
    ...entry,
    id: `iglog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
  };
  logs.unshift(record); // 最新在前
  saveImageGenLogs(logs);
}

export function clearImageGenLogs(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

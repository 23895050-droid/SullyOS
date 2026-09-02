// 我们自己的功能 · 独立导出/导入（2026-09-03 她定稿的第一件事）
//
// 与原版备份完全独立：独立文件格式、独立入口、互不经过、互不影响。
// 覆盖的数据面 = 我们功能的 localStorage key + 近期接收表（image_receipts）+ 这些数据引用的 blob 二进制。
//
// blob 机制：字段里只存编号（blobref:xxx），真正的图片/字体二进制在 blob_assets 柜子里。
// 导出 = 编号原样带走 + 柜子里对应的文件 base64 旁路打包（保留原 mime）；导入 = 按原编号
// 放回柜子（restoreBlobRef，SDK 现成支持），字段零改写。编号扫描是对收集到的数据整段找子串，
// 字段以后加新编号自动覆盖，不用维护第二张清单。
//
// 全量导出 = 所有功能合一份；分功能导出 = 各自范围（同一套函数，scope 不同）。
// 插件化设计原则（她定）：以后我们新写功能，第一件事就是来 OUR_FEATURE_SCOPES 登记自己的 key。

import { DB } from './db';
import { getBlobForRef, restoreBlobRef, blobToDataUrl, dataUrlToBlob } from './blobRef';
import type { ImageReceipt } from '../types';

// ─── 功能面清单（她 2026-09-03 验收过；每个功能自己记账自己的 key）───────────────

export type OurFeatureId = 'camera' | 'album' | 'receipts' | 'noxhome' | 'assistant' | 'music';

export interface OurFeatureScope {
  id: OurFeatureId;
  label: string;
  localStorageKeys: string[];
  /** 近期接收表（image_receipts）算不算这个功能的数据 */
  includeReceipts: boolean;
}

export const OUR_FEATURE_SCOPES: OurFeatureScope[] = [
  {
    id: 'camera', label: '相机',
    localStorageKeys: [
      'os_image_gen_settings',   // 生图设置 + 预设
      'os_image_gen_logs',       // 生图调用日志
      'os_camera_a2_presets',    // a2 背景预设
      'os_camera_system_prompt', // 系统提示词
      'os_camera_last',          // 取景器最后一张（临时状态，一样不丢）
    ],
    includeReceipts: false,
  },
  { id: 'album', label: '相册', localStorageKeys: ['os_memory_archive'], includeReceipts: false },
  { id: 'receipts', label: '近期接收', localStorageKeys: [], includeReceipts: true },
  {
    id: 'noxhome', label: 'NoxHome（含情侣空间）',
    localStorageKeys: [
      'couple_beauty_v1', 'couple_palette_v1', 'couple_todos_v3', 'couple_anniv_v1',
      'couple_period_v1', 'couple_activity_v1', 'couple_diet_v1', 'couple_diary_v1',
      'couple_board_v1', 'couple_together_v1', 'couple_music_v1',
      'noxhome_mount_v1', 'noxhome_prompts_v1',
    ],
    includeReceipts: false,
  },
  { id: 'assistant', label: '小助手', localStorageKeys: ['assistant_v1'], includeReceipts: false },
  { id: 'music', label: '音乐', localStorageKeys: ['couple_music_v1'], includeReceipts: false },
];

export function scopeLocalStorageKeys(scope: OurFeatureId | 'all'): string[] {
  if (scope === 'all') {
    return Array.from(new Set(OUR_FEATURE_SCOPES.flatMap((s) => s.localStorageKeys)));
  }
  const found = OUR_FEATURE_SCOPES.find((s) => s.id === scope);
  return found ? [...found.localStorageKeys] : [];
}

export function scopeIncludesReceipts(scope: OurFeatureId | 'all'): boolean {
  return scope === 'all' || scope === 'receipts';
}

// ─── blob 编号扫描 ─────────────────────────────────────────────────

const BLOBREF_TOKEN_RE = /blobref:([A-Za-z0-9_-]+)/g;

/** 从一串 JSON 文本里收集所有 blobref 编号（去重）。字段以后加新编号自动覆盖。 */
export function collectBlobTokens(texts: string[]): Set<string> {
  const tokens = new Set<string>();
  for (const text of texts) {
    BLOBREF_TOKEN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BLOBREF_TOKEN_RE.exec(text)) !== null) tokens.add(m[1]);
  }
  return tokens;
}

// ─── 备份文件格式 ─────────────────────────────────────────────────

export const OUR_BACKUP_FORMAT = 'sullyos-fork-features-backup';
export const OUR_BACKUP_FORMAT_VERSION = 1;

export interface OurBackupPayload {
  format: typeof OUR_BACKUP_FORMAT;
  formatVersion: number;
  exportedAt: string;
  scope: OurFeatureId | 'all';
  /** key → 原始字符串（值本身已是 JSON 字符串，原样带走，不做二次解析） */
  localStorage: Record<string, string>;
  imageReceipts: ImageReceipt[];
  /** blobref 编号 → base64 data URL（保留原 mime） */
  blobs: Record<string, string>;
  /** 导出时柜子里已经找不到的编号（图已丢）——导入会照样写字段，只是那张图是裂的 */
  missingBlobs?: string[];
}

export function isOurBackupPayload(v: unknown): v is OurBackupPayload {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  if (p.format !== OUR_BACKUP_FORMAT || p.formatVersion !== OUR_BACKUP_FORMAT_VERSION) return false;
  if (typeof p.exportedAt !== 'string') return false;
  if (p.scope !== 'all' && !OUR_FEATURE_SCOPES.some((s) => s.id === p.scope)) return false;
  if (typeof p.localStorage !== 'object' || p.localStorage === null) return false;
  if (!Object.values(p.localStorage).every((x) => typeof x === 'string')) return false;
  if (!Array.isArray(p.imageReceipts)) return false;
  if (typeof p.blobs !== 'object' || p.blobs === null) return false;
  if (!Object.values(p.blobs).every((x) => typeof x === 'string')) return false;
  return true;
}

// ─── 盘点（导出前先看这台设备上有什么）────────────────────────────

export interface OurDataSurveyKey {
  key: string;
  bytes: number;
}

export interface OurDataSurvey {
  /** 清单里有数据的 key（按大小从大到小排） */
  keys: OurDataSurveyKey[];
  /** 清单里有、但这台设备上没有的 key */
  missingKeys: string[];
  receiptsCount: number;
  /** localStorage 部分的总字节数（UTF-8 实测，含内嵌的 base64 图） */
  totalBytes: number;
}

/** 盘点某个范围的数据：哪些 key 有、各多大、近期接收几条。导出就是照这些原样打包。 */
export async function surveyOurData(scope: OurFeatureId | 'all'): Promise<OurDataSurvey> {
  const keys: OurDataSurveyKey[] = [];
  const missingKeys: string[] = [];
  let totalBytes = 0;
  for (const key of scopeLocalStorageKeys(scope)) {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      missingKeys.push(key);
      continue;
    }
    const bytes = new Blob([raw]).size;
    keys.push({ key, bytes });
    totalBytes += bytes;
  }
  keys.sort((a, b) => b.bytes - a.bytes);
  const receiptsCount = scopeIncludesReceipts(scope) ? (await DB.getAllImageReceipts()).length : 0;
  return { keys, missingKeys, receiptsCount, totalBytes };
}

// ─── 全部存储原始清单（排错用：这台设备 localStorage 里真实存在的每个 key）────────────

export interface OurDataRawKey {
  key: string;
  bytes: number;
  /** 在我们功能清单里的 = 导出会收；不在的 = 原版/其他数据，导出不收 */
  known: boolean;
}

export interface OurDataRawSurvey {
  keys: OurDataRawKey[];
  totalBytes: number;
}

/** 把 localStorage 里每一个 key 原样列出来（含原版的数据），大的在前。 */
export function surveyAllLocalStorage(): OurDataRawSurvey {
  const known = new Set(scopeLocalStorageKeys('all'));
  const keys: OurDataRawKey[] = [];
  let totalBytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    const bytes = new Blob([raw]).size;
    keys.push({ key, bytes, known: known.has(key) });
    totalBytes += bytes;
  }
  keys.sort((a, b) => b.bytes - a.bytes);
  return { keys, totalBytes };
}

// ─── 导出 ─────────────────────────────────────────────────────────

export async function exportOurData(scope: OurFeatureId | 'all'): Promise<OurBackupPayload> {
  const localStorageData: Record<string, string> = {};
  for (const key of scopeLocalStorageKeys(scope)) {
    const raw = localStorage.getItem(key);
    if (raw !== null) localStorageData[key] = raw;
  }

  const imageReceipts = scopeIncludesReceipts(scope) ? await DB.getAllImageReceipts() : [];

  const tokens = collectBlobTokens([...Object.values(localStorageData), JSON.stringify(imageReceipts)]);
  const blobs: Record<string, string> = {};
  const missingBlobs: string[] = [];
  for (const token of tokens) {
    const blob = await getBlobForRef(`blobref:${token}`);
    if (blob) blobs[token] = await blobToDataUrl(blob);
    else missingBlobs.push(token);
  }

  const payload: OurBackupPayload = {
    format: OUR_BACKUP_FORMAT,
    formatVersion: OUR_BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    scope,
    localStorage: localStorageData,
    imageReceipts,
    blobs,
  };
  if (missingBlobs.length > 0) payload.missingBlobs = missingBlobs;
  return payload;
}

/** 下载备份 JSON（格式化输出）。文件名带日期，全量/分功能一个套路。 */
export function downloadOurBackup(payload: OurBackupPayload): void {
  const json = JSON.stringify(payload, null, 2);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `our-data-backup_${payload.scope}_${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 读备份文件 → payload。格式不对直接抛错，调用方弹提示。 */
export async function readOurBackupFile(file: Blob): Promise<OurBackupPayload> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('备份文件不是合法的 JSON');
  }
  if (!isOurBackupPayload(parsed)) throw new Error('备份文件不是我们的数据备份（格式或版本对不上）');
  return parsed;
}

// ─── 导入 ─────────────────────────────────────────────────────────

export interface OurImportReport {
  localStorageWritten: number;
  localStorageFailed: string[];
  receiptsWritten: number;
  receiptsFailed: string[];
  blobsRestored: number;
  blobsSkipped: number;
  blobsFailed: string[];
}

/**
 * 导入：补写不破坏。localStorage 逐 key 写（配额失败记下来不中断）；
 * 近期接收按 id 写回（put，同 id 覆盖 = 快照恢复语义）；blob 已存在跳过、缺失按原编号放回柜子。
 */
export async function importOurData(payload: OurBackupPayload): Promise<OurImportReport> {
  const report: OurImportReport = {
    localStorageWritten: 0,
    localStorageFailed: [],
    receiptsWritten: 0,
    receiptsFailed: [],
    blobsRestored: 0,
    blobsSkipped: 0,
    blobsFailed: [],
  };

  for (const [key, value] of Object.entries(payload.localStorage)) {
    try {
      localStorage.setItem(key, value);
      report.localStorageWritten++;
    } catch {
      report.localStorageFailed.push(key);
    }
  }

  for (const receipt of payload.imageReceipts) {
    try {
      await DB.saveImageReceipt(receipt);
      report.receiptsWritten++;
    } catch {
      report.receiptsFailed.push(receipt.id);
    }
  }

  for (const [token, dataUrl] of Object.entries(payload.blobs)) {
    try {
      if (await getBlobForRef(`blobref:${token}`)) {
        report.blobsSkipped++;
        continue;
      }
      await restoreBlobRef(`blobref:${token}`, dataUrlToBlob(dataUrl));
      report.blobsRestored++;
    } catch {
      report.blobsFailed.push(token);
    }
  }

  return report;
}

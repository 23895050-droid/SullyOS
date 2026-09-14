// 我们自己的功能 · 独立导出/导入（2026-09-03 她定稿的第一件事）
//
// 与原版备份完全独立：独立文件格式、独立入口、互不经过、互不影响。
// 覆盖的数据面 = 我们功能的 localStorage key + 近期接收表（image_receipts）+ 这些数据引用的 blob 二进制。
//
// 文件格式 v2（2026-09-04 她验收后改）：zip 容器，同上游 v3 备份的思路——
//   · backup.json（格式化 JSON）：数据区原样 + blobIndex（编号 → mime/字节数），不含二进制；
//   · blobs/<id>：原文件直放（STORE 不压缩、不转 base64、不重编码，画质像素级不动）；
//   · 导入按原编号放回柜子（restoreBlobRef），字段零改写。
// v1（旧导出，纯 JSON + blobs base64）只读兼容，导入照常还原。
//
// 编号扫描是对收集到的数据整段找子串，字段以后加新编号自动覆盖，不用维护第二张清单。
// 全量导出 = 所有功能合一份；分功能导出 = 各自范围（同一套函数，scope 不同）。
// 插件化设计原则（她定）：以后我们新写功能，第一件事就是来 OUR_FEATURE_SCOPES 登记自己的 key。

import JSZip from 'jszip';
import { DB } from './db';
import { getBlobForRef, restoreBlobRef, dataUrlToBlob } from './blobRef';
import { shareOrDownloadBlob } from './shareExport';
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
      'os_camera_a2_drafts_v1',  // a2 暂离草稿
    ],
    includeReceipts: false,
  },
  { id: 'album', label: '相册', localStorageKeys: ['os_memory_archive', 'couple_album_bg_v1', 'url_gallery_v1'], includeReceipts: false },
  { id: 'receipts', label: '近期接收', localStorageKeys: [], includeReceipts: true },
  {
    id: 'noxhome', label: 'NoxHome（含情侣空间）',
    localStorageKeys: [
      'couple_beauty_v1', 'couple_palette_v1', 'couple_todos_v3', 'couple_anniv_v1',
      'couple_period_v1', 'couple_activity_v1', 'couple_diet_v1', 'couple_diet_bg_v1', 'couple_diary_v1', 'couple_diary_bg_v1',
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

// ─── 备份文件格式 ─────────────────────────────────────────────────

export const OUR_BACKUP_FORMAT = 'sullyos-fork-features-backup';
export const OUR_BACKUP_FORMAT_VERSION = 2;

/** zip 里一个原文件的索引项（backup.json 的 blobIndex） */
export interface OurBackupBlobEntry {
  id: string;
  /** Blob 的 mime（如 image/png）；可能为空串，导入时原样重建 */
  type: string;
  /** 字节数 */
  size: number;
}

export interface OurBackupPayload {
  format: typeof OUR_BACKUP_FORMAT;
  formatVersion: number;
  exportedAt: string;
  scope: OurFeatureId | 'all';
  /** key → 原始字符串（值本身已是 JSON 字符串，原样带走，不做二次解析） */
  localStorage: Record<string, string>;
  imageReceipts: ImageReceipt[];
  /** 原文件索引（v2）；二进制在 zip 的 blobs/<id> */
  blobIndex: OurBackupBlobEntry[];
  /** 清单里有但这台设备上没有的 key（没用过就没有，不是丢数据） */
  missingKeys?: string[];
  /** 导出时柜子里已经找不到的编号（图已丢）——导入会照样写字段，只是那张图是裂的 */
  missingBlobs?: string[];
}

/** v1 旧导出（纯 JSON + blobs base64），只读兼容 */
export interface OurBackupPayloadV1 {
  format: typeof OUR_BACKUP_FORMAT;
  formatVersion: 1;
  exportedAt: string;
  scope: OurFeatureId | 'all';
  localStorage: Record<string, string>;
  imageReceipts: ImageReceipt[];
  blobs: Record<string, string>;
  missingBlobs?: string[];
}

export type OurBackupPayloadAny = OurBackupPayload | OurBackupPayloadV1;

export function isOurBackupPayload(v: unknown): v is OurBackupPayloadAny {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  if (p.format !== OUR_BACKUP_FORMAT) return false;
  if (p.formatVersion !== 1 && p.formatVersion !== OUR_BACKUP_FORMAT_VERSION) return false;
  if (typeof p.exportedAt !== 'string') return false;
  if (p.scope !== 'all' && !OUR_FEATURE_SCOPES.some((s) => s.id === p.scope)) return false;
  if (typeof p.localStorage !== 'object' || p.localStorage === null) return false;
  if (!Object.values(p.localStorage).every((x) => typeof x === 'string')) return false;
  if (!Array.isArray(p.imageReceipts)) return false;
  if (p.formatVersion === 2 && !Array.isArray(p.blobIndex)) return false;
  if (p.formatVersion === 1 && (typeof p.blobs !== 'object' || p.blobs === null)) return false;
  return true;
}

// ─── 导出 ─────────────────────────────────────────────────────────

export interface OurBackupBuild {
  /** 展示用（谁占大头 / 缺了哪些 key 都从这里读） */
  payload: OurBackupPayload;
  zipBlob: Blob;
}

/**
 * 导出：数据区进 backup.json，被引用的原文件直放 zip 的 blobs/<id>（STORE 不压缩）。
 * 大文件不转 base64、不重编码——导出多大 = 原文件多大 ×（1 + 少量开销），画质不动。
 */
export async function exportOurData(scope: OurFeatureId | 'all'): Promise<OurBackupBuild> {
  const allKeys = scopeLocalStorageKeys(scope);
  const localStorageData: Record<string, string> = {};
  const missingKeys: string[] = [];
  for (const key of allKeys) {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      missingKeys.push(key);
      continue;
    }
    localStorageData[key] = raw;
  }

  const imageReceipts = scopeIncludesReceipts(scope) ? await DB.getAllImageReceipts() : [];

  const tokens = collectBlobTokens([...Object.values(localStorageData), JSON.stringify(imageReceipts)]);
  const zip = new JSZip();
  const blobIndex: OurBackupBlobEntry[] = [];
  const missingBlobs: string[] = [];
  for (const token of tokens) {
    const blob = await getBlobForRef(`blobref:${token}`);
    if (blob) {
      // 转 ArrayBuffer 再进 zip（jszip 在部分环境不认 Blob 实例；内存峰值同上游 = 单个文件的字节）
      zip.file(`blobs/${token}`, await blob.arrayBuffer());
      blobIndex.push({ id: token, type: blob.type || '', size: blob.size });
    } else {
      missingBlobs.push(token);
    }
  }

  const payload: OurBackupPayload = {
    format: OUR_BACKUP_FORMAT,
    formatVersion: OUR_BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    scope,
    localStorage: localStorageData,
    imageReceipts,
    blobIndex,
    missingKeys,
  };
  if (missingBlobs.length > 0) payload.missingBlobs = missingBlobs;

  zip.file('backup.json', JSON.stringify(payload, null, 2));
  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  return { payload, zipBlob };
}

/** 下载备份 zip（走统一分享：原生 App 出系统分享面板，Web 端下载）。文件名带日期，全量/分功能一个套路。 */
export function downloadOurBackup(zipBlob: Blob, scope: OurFeatureId | 'all'): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  return shareOrDownloadBlob({ blob: zipBlob, fileName: `our-data-backup_${scope}_${stamp}.zip`, nativeChunked: true });
}

// ─── 导入 ─────────────────────────────────────────────────────────

export interface OurBackupBundle {
  payload: OurBackupPayloadAny;
  /** 按编号取原文件：zip 读 blobs/<id>；旧 JSON 从内嵌 base64 解 */
  getBlob: (id: string) => Promise<Blob | null>;
}

/** 读备份文件（zip 或旧版 JSON）→ 数据 + 按编号取原文件的通道。格式不对直接抛错。 */
export async function readOurBackupFile(file: Blob): Promise<OurBackupBundle> {
  const buf = await file.arrayBuffer();
  // zip 魔数 PK（比 .name 后缀可靠：File/Blob 通吃）
  const isZip = buf.byteLength >= 2 && new Uint8Array(buf, 0, 2)[0] === 0x50 && new Uint8Array(buf, 0, 2)[1] === 0x4b;
  if (isZip) {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buf);
    } catch {
      throw new Error('备份 zip 读不了（文件损坏？）');
    }
    const entry = zip.file('backup.json');
    if (!entry) throw new Error('备份里没有 backup.json（不是我们的备份？）');
    let payload: unknown;
    try {
      payload = JSON.parse(await entry.async('string'));
    } catch {
      throw new Error('backup.json 不是合法的 JSON');
    }
    if (!isOurBackupPayload(payload)) throw new Error('备份文件不是我们的数据备份（格式或版本对不上）');
    const index = payload.formatVersion === 2
      ? new Map((payload as OurBackupPayload).blobIndex.map((b) => [b.id, b.type]))
      : new Map<string, string>();
    return {
      payload,
      getBlob: async (id: string) => {
        const e = zip.file(`blobs/${id}`);
        if (!e) return null;
        const buf = await e.async('arraybuffer');
        return new Blob([buf], { type: index.get(id) ?? '' });
      },
    };
  }

  // 旧版 v1 JSON（2026-09-04 之前的导出）
  const text = new TextDecoder().decode(buf);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('备份文件不是合法的 JSON');
  }
  if (!isOurBackupPayload(parsed)) throw new Error('备份文件不是我们的数据备份（格式或版本对不上）');
  const v1 = parsed as OurBackupPayloadV1;
  return {
    payload: v1,
    getBlob: (id: string) => {
      const dataUrl = v1.blobs?.[id];
      if (!dataUrl) return Promise.resolve(null);
      try {
        return Promise.resolve(dataUrlToBlob(dataUrl));
      } catch {
        return Promise.resolve(null);
      }
    },
  };
}

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
 * 收尾广播 our-backup-imported：各 store 现场重读 localStorage，不用刷新页面。
 */
export async function importOurData(bundle: OurBackupBundle): Promise<OurImportReport> {
  const payload = bundle.payload;
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

  const blobIds: string[] = payload.formatVersion === 2
    ? (payload as OurBackupPayload).blobIndex.map((b) => b.id)
    : Object.keys((payload as OurBackupPayloadV1).blobs ?? {});
  for (const id of blobIds) {
    try {
      if (await getBlobForRef(`blobref:${id}`)) {
        report.blobsSkipped++;
        continue;
      }
      const blob = await bundle.getBlob(id);
      if (!blob) {
        report.blobsFailed.push(id);
        continue;
      }
      await restoreBlobRef(`blobref:${id}`, blob);
      report.blobsRestored++;
    } catch {
      report.blobsFailed.push(id);
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('our-backup-imported'));
    window.dispatchEvent(new Event('couple-beauty-changed'));
  }

  return report;
}

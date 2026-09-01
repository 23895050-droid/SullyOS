// 留档存储层 — memory_archive 数据模型 + CRUD
// localStorage key: os_memory_archive，上限 200 条。
// 留档卡片只存缩略图 dataUrl + 文字，不存原图（原图在 image_receipts / blob_assets）。

export interface ArchiveEntry {
  id: string;
  thumbnail: string;          // 缩略图 dataUrl（仅展示，不可点开看原图）
  charId: string;             // 'user' = 自己拍的
  charName: string;
  summary: string;            // 留档摘要（前因后果 + 当下感受）
  description: string;        // 图片描述（llm 生图前描述 / 留档识图）
  prefixPrompt: string;       // 生图词前缀（仅显示，不可编辑）
  presetName: string;
  refMode: string;            // none / face_lock / style_ref / image_pad
  tags: string[];
  favorite: boolean;          // 收藏夹
  charAlbum: boolean;         // 同时存入角色相册
  timestamp: number;
  fromUser?: boolean;         // 是否用户自己拍的
  kind?: 'selfie' | 'daily' | 'other'; // 类型：自拍 / 日常 / 其他
  a2Transcript?: { role: string; content: string }[]; // a2 对话记录（如有）
}

const KEY = 'os_memory_archive';
const MAX = 200;

export function loadArchive(): ArchiveEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveArchive(list: ArchiveEntry[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    return true;
  } catch { /* quota 满了就放弃写入，旧数据还在 */ return false; }
}

export function addArchive(entry: ArchiveEntry) {
  const list = loadArchive();
  list.unshift(entry);
  saveArchive(list);
}

// ── 配额自愈 ─────────────────────────────────────────────
// 相册 App 之前的旧留档存的是全尺寸 base64 缩略图（一张 1-3MB），几条就能把
// localStorage 配额（iOS Safari 仅 ~5MB）撑爆，之后所有新留档 setItem 都会抛
// QuotaExceededError——旧数据读得出来、新数据写不进去。这里把超尺寸缩略图压到
// 320px 回收空间；替换写入比旧值小，配额已满时也能成功落库。
const OVERSIZE_THRESHOLD = 120_000; // 120K 字符 ≈ 90KB；320px jpeg 通常只有 10-50K 字符

/** 压缩库里所有超尺寸缩略图（旧留档迁移），返回压缩条数。可安全重复调用。 */
export async function compactArchiveThumbnails(): Promise<number> {
  const list = loadArchive();
  if (!list.some(e => e.thumbnail && e.thumbnail.length > OVERSIZE_THRESHOLD)) return 0;
  let count = 0;
  const compacted = await Promise.all(list.map(async (e) => {
    if (e.thumbnail && e.thumbnail.length > OVERSIZE_THRESHOLD) {
      const small = await downscaleImage(e.thumbnail, 320);
      if (small && small.length < e.thumbnail.length) {
        count++;
        return { ...e, thumbnail: small };
      }
    }
    return e;
  }));
  saveArchive(compacted);
  return count;
}

/**
 * 带自愈的入库：先正常写；quota 满失败时把库里所有超尺寸缩略图压一遍再重试一次。
 * 相机留档 / a2 留档都走这里，旧数据撑爆配额时新留档也能自动救回来。
 */
export async function addArchiveSafe(entry: ArchiveEntry): Promise<boolean> {
  const list = loadArchive();
  list.unshift(entry);
  if (saveArchive(list)) return true;
  const compacted = await Promise.all(list.map(async (e) => {
    if (e.thumbnail && e.thumbnail.length > OVERSIZE_THRESHOLD) {
      const small = await downscaleImage(e.thumbnail, 320);
      return small && small.length < e.thumbnail.length ? { ...e, thumbnail: small } : e;
    }
    return e;
  }));
  return saveArchive(compacted);
}

export function updateArchive(id: string, patch: Partial<ArchiveEntry>) {
  const list = loadArchive();
  const idx = list.findIndex(e => e.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...patch };
  saveArchive(list);
}

export function deleteArchives(ids: string[]) {
  const set = new Set(ids);
  saveArchive(loadArchive().filter(e => !set.has(e.id)));
}

export function toggleFavorite(id: string) {
  const list = loadArchive();
  const idx = list.findIndex(e => e.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], favorite: !list[idx].favorite };
  saveArchive(list);
}

// ── 搜索（角色名 / 标签 / 前缀预设名 / 前缀关键词 / 摘要描述） ──
export function searchArchives(list: ArchiveEntry[], q: string): ArchiveEntry[] {
  const query = q.trim().toLowerCase();
  if (!query) return list;
  return list.filter(e => {
    const hay = [
      e.charName, e.presetName, e.prefixPrompt, e.summary, e.description,
      ...(e.tags || []),
    ].join(' ').toLowerCase();
    return hay.includes(query);
  });
}

export function formatArchiveTime(ts: number, withYear = true): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return withYear
    ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
    : `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

// ── 转发文案：[历史照片：{信息}]，AI 只读文本不读图 ──
export function buildForwardText(e: ArchiveEntry): string {
  const d = new Date(e.timestamp);
  const date = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  // 留档摘要（前因后果 + 当下感受）与图片描述全部进上下文，不再截断——
  // 角色只读文字，文字越完整越知道这张照片是什么、为什么留着。
  const summary = (e.summary || '').trim();
  const description = (e.description || '').trim();
  const tags = (e.tags || []).filter(Boolean).map(t => `#${t}`).join(' ');
  const parts = [summary, description && description !== summary ? description : '', tags];
  const body = parts.filter(Boolean).join('。');
  return `[历史照片：${e.charName}，${date}。${body}]`;
}

// ── 缩略图压缩：大图 dataUrl → 最长边 max px 的 jpeg（localStorage 存不下大图） ──
export function downscaleImage(dataUrl: string, max = 320): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl) { resolve(''); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(dataUrl); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      } catch { resolve(dataUrl); }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// 和 Ta 纯函数（2026-08-25）——类型色板 / 感受编号 / 搜索筛选 / 转发文案 / 约定挂载内容
// 设计文档《和ta页规划.md》：卡片颜色随事件类型；感受按记录次序编号；转发时角色只读文字描述、全流程不读图
import type { TogetherFeeling, TogetherMemory, TogetherPromise, TogetherType } from '../apps/couple/togetherStore';

// ── 事件类型 → 卡片颜色（type 主色 + soft 浅底；详情页与表面同色） ──

export interface TogetherTypeDef {
  key: TogetherType;
  label: string;
  color: string;
  soft: string;
}

export const TOGETHER_TYPES: TogetherTypeDef[] = [
  { key: 'travel', label: '旅行', color: '#5b9cd6', soft: '#eaf3fb' },
  { key: 'food', label: '美食', color: '#e08e5e', soft: '#fdf1e7' },
  { key: 'movie', label: '电影', color: '#9b7fd6', soft: '#f2edfb' },
  { key: 'art', label: '看展', color: '#d9789c', soft: '#fceef3' },
  { key: 'daily', label: '日常', color: '#6fbc8e', soft: '#edf8f1' },
  { key: 'surprise', label: '惊喜', color: '#d9a94e', soft: '#fdf6e5' },
  { key: 'festival', label: '节日', color: '#d96a72', soft: '#fdeeef' },
  { key: 'other', label: '其他', color: '#9a8a93', soft: '#f5f1f3' },
];

export const togetherTypeDef = (t: TogetherType): TogetherTypeDef =>
  TOGETHER_TYPES.find((x) => x.key === t) ?? TOGETHER_TYPES[TOGETHER_TYPES.length - 1];

// ── 感受编号（按记录次序：createdAt 升序 → 第 1 次、第 2 次…；删中间一条后面自动递补） ──

export const feelingSeq = (feelings: TogetherFeeling[], feelingId: string): number | null => {
  const sorted = feelings.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const idx = sorted.findIndex((f) => f.id === feelingId);
  return idx === -1 ? null : idx + 1;
};

export const fmtFeelingSeq = (feelings: TogetherFeeling[], feelingId: string): string => {
  const seq = feelingSeq(feelings, feelingId);
  if (seq === null) return '';
  const iso = feelings.find((f) => f.id === feelingId)?.createdAt ?? '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `第 ${seq} 次 · ${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// ── 搜索 / 筛选 ──

type TogetherCard = TogetherMemory | TogetherPromise;

export const searchTogether = (items: TogetherCard[], q: string): TogetherCard[] => {
  const query = q.trim().toLowerCase();
  if (!query) return items;
  return items.filter((c) => {
    const body = 'context' in c ? c.context : c.content;
    const hay = [c.title, body, 'place' in c ? c.place ?? '' : ''].join(' ').toLowerCase();
    return hay.includes(query);
  });
};

export const filterTogetherByType = (items: TogetherCard[], t: TogetherType | null): TogetherCard[] =>
  t === null ? items : items.filter((c) => c.type === t);

// ── 照片描述（角色只读这个；留档过才有） ──

export const photoHasArchive = (photos: TogetherMemory['photos']): boolean =>
  photos.length > 0 && photos.every((p) => Boolean(p.archiveId));

/** 有照片但存在未留档的 → 转发前挡住（方便管理：只有留档过的卡片可以转发） */
export const hasUnarchivedPhoto = (photos: TogetherMemory['photos']): boolean =>
  photos.some((p) => !p.archiveId);

export const photoDescLines = (photos: TogetherMemory['photos']): string[] =>
  photos
    .map((p, i) => {
      const desc = p.summary?.trim();
      return desc ? `${i + 1}. ${desc}` : '';
    })
    .filter(Boolean);

// ── 转发文案（纯文本，AI 只读；照片只用文字描述） ──

export const buildMemoryForwardBody = (m: TogetherMemory, opts: { withFeelings: boolean }): string => {
  const def = togetherTypeDef(m.type);
  const lines = [
    `${def.label} · ${m.date}${m.duration ? ` · 用时${m.duration}` : ''}`,
  ];
  if (m.context.trim()) lines.push(m.context.trim());
  const descs = photoDescLines(m.photos);
  if (descs.length > 0) lines.push(`照片：\n${descs.join('\n')}`);
  if (opts.withFeelings && m.feelings.length > 0) {
    const sorted = m.feelings.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    lines.push(
      '感受记录：',
      sorted.map((f, i) => `${i + 1}. ${f.owner === 'me' ? 'Nox' : 'Angelica'}：${f.content}`).join('\n'),
    );
  }
  return lines.join('\n');
};

export const buildPromiseForwardBody = (p: TogetherPromise, opts: { withFeelings: boolean }): string => {
  const proposerLabel = p.proposer === 'me' ? 'Nox 提议' : p.proposer === 'her' ? 'Angelica 提议' : '一起定下的';
  const lines = [
    `${proposerLabel}${p.place ? ` · 地点：${p.place}` : ''}${p.deadline ? ` · 时限：${p.deadline} 前` : ''}${p.done ? ' · 已完成' : ''}`,
  ];
  if (p.content.trim()) lines.push(p.content.trim());
  const descs = photoDescLines(p.photos);
  if (descs.length > 0) lines.push(`照片：\n${descs.join('\n')}`);
  if (opts.withFeelings && p.feelings.length > 0) {
    const sorted = p.feelings.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    lines.push(
      '感受记录：',
      sorted.map((f, i) => `${i + 1}. ${f.owner === 'me' ? 'Nox' : 'Angelica'}：${f.content}`).join('\n'),
    );
  }
  return lines.join('\n');
};

// ── 约定挂载内容（世界书块）：只挂未完成的；提示挑重点聊，别全倒出来 ──

export const buildPromisesMountContent = (input: { dateKey: string; items: TogetherPromise[] }): string => {
  const open = input.items.filter((p) => !p.done);
  if (open.length === 0) return '';
  const proposerLabel = (p: TogetherPromise) => (p.proposer === 'me' ? 'Nox 提议' : p.proposer === 'her' ? '{{user}} 提议' : '一起定下的');
  const lines = [`{{user}} 和你约好的事（还没完成，共 ${open.length} 件）：`];
  for (const p of open) {
    lines.push(`- ${p.title}（${proposerLabel(p)}${p.place ? `，地点：${p.place}` : ''}${p.deadline ? `，${p.deadline} 前` : ''}）${p.content.trim() ? `：${p.content.trim().slice(0, 120)}` : ''}`);
  }
  lines.push('（提到「约好了」「之前说好的」「你答应我的」这类话题时，挑最重要的 1-2 件聊，不要全部倒出来。）');
  return lines.join('\n');
};

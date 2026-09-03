// 纪念日 store（2026-08-22）——一个纪念日一张卡片：标题/日期/倒计时；添加按钮；长按编辑/删除（删除弹确认框）
// 规范：version + ISO 时间戳 + owner；每年循环（MM-DD），note 记起点年份等
import { createCoupleStore, isoNow, uid } from './coupleStoreBase';
import { addActivity } from './activityStore';
import { getLocalDateKey } from '../../utils/localDate';

export interface Anniversary {
  id: string;
  title: string;
  date: string;     // 'MM-DD' 每年循环
  emoji: string;    // 卡片图标
  note?: string;    // 如「2024-01-01 在一起」
  createdAt: string; // ISO
  updatedAt: string;
  owner: string;
}

export interface AnnivStore {
  version: number;
  updatedAt: string;
  items: Anniversary[];
}

const DEFAULTS: AnnivStore = {
  version: 1,
  updatedAt: '1970-01-01T00:00:00.000Z',
  items: [
    { id: 'seed-together', title: '在一起', date: '01-01', emoji: '💙', note: '示例数据，改成你们的纪念日', createdAt: isoNow(), updatedAt: isoNow(), owner: 'together' },
    { id: 'seed-birthday', title: 'Ta 的生日', date: '02-14', emoji: '🎂', note: '示例数据，改成真实的生日', createdAt: isoNow(), updatedAt: isoNow(), owner: 'her' },
  ],
};

const store = createCoupleStore<AnnivStore>('couple_anniv_v1', 1, DEFAULTS, (p) => ({
  ...p,
  items: Array.isArray(p.items) ? p.items : DEFAULTS.items,
}));

export const useAnnivStore = store.use;
/** 纯 getter（世界书挂载等非 React 代码用） */
export const getAnnivStore = store.get;

export function saveAnniv(input: { id?: string; title: string; date: string; emoji: string; note?: string; owner?: string }): Anniversary {
  const existing = input.id ? store.get().items.find((a) => a.id === input.id) : undefined;
  const item: Anniversary = {
    id: input.id ?? uid(),
    title: input.title,
    date: input.date,
    emoji: input.emoji,
    note: input.note ?? '',
    createdAt: existing?.createdAt ?? isoNow(),
    updatedAt: isoNow(),
    owner: input.owner ?? 'together',
  };
  store.set((s) => ({
    ...s,
    items: existing ? s.items.map((a) => (a.id === item.id ? item : a)) : [...s.items, item],
    updatedAt: isoNow(),
  }));
  // 同步活动记录（只记新增，编辑不记）
  if (!existing) {
    addActivity({
      kind: 'anniv_add',
      date: getLocalDateKey(),
      text: `添加了纪念日「${input.emoji}${input.title}」${input.date}`,
      owner: 'together',
    });
  }
  return item;
}

export function deleteAnniv(id: string) {
  store.set((s) => ({ ...s, items: s.items.filter((a) => a.id !== id), updatedAt: isoNow() }));
}

/** 距下一个纪念日还有几天（今天 = 0） */
export const daysUntilAnniv = (dateKey: string, now: Date): number => {
  const [m, d] = dateKey.split('-').map(Number);
  if (!m || !d) return 0;
  const target = new Date(now.getFullYear(), m - 1, d);
  if (target.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) target.setFullYear(now.getFullYear() + 1);
  return Math.max(0, Math.round((target.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000));
};

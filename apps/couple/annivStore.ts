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
  note?: string;    // 如「2025-06-21 在一起」
  /** 起点年份（2026-09-14 G1）：「在一起」这类要从某一年开始算天数的纪念日才有；
   *  老数据没有就退回从 note 里解析 YYYY-MM-DD */
  startYear?: number;
  createdAt: string; // ISO
  updatedAt: string;
  owner: string;
}

export interface AnnivStore {
  version: number;
  updatedAt: string;
  items: Anniversary[];
}

const SEED_NOTE_TOGETHER = '示例数据，改成你们的纪念日';
const SEED_NOTE_BIRTHDAY = '示例数据，改成真实的生日';

const DEFAULTS: AnnivStore = {
  version: 1,
  updatedAt: '1970-01-01T00:00:00.000Z',
  items: [
    { id: 'seed-together', title: '在一起', date: '06-21', emoji: '💙', note: '2025-06-21 在一起', startYear: 2025, createdAt: isoNow(), updatedAt: isoNow(), owner: 'together' },
    { id: 'seed-birthday', title: 'Ta 的生日', date: '03-22', emoji: '🎂', note: 'Angelica 的生日', createdAt: isoNow(), updatedAt: isoNow(), owner: 'her' },
  ],
};

/** 示例种子升级（2026-09-14）：装的还是原封未动的示例种子就换成真值；她改过的（note 变了）绝不碰 */
const upgradeSeed = (a: Anniversary): Anniversary => {
  if (a.id === 'seed-together' && a.note === SEED_NOTE_TOGETHER) return { ...DEFAULTS.items[0], createdAt: a.createdAt };
  if (a.id === 'seed-birthday' && a.note === SEED_NOTE_BIRTHDAY) return { ...DEFAULTS.items[1], createdAt: a.createdAt };
  return a;
};

const store = createCoupleStore<AnnivStore>('couple_anniv_v1', 1, DEFAULTS, (p) => ({
  ...p,
  items: Array.isArray(p.items) ? p.items.map(upgradeSeed) : DEFAULTS.items,
}));

export const useAnnivStore = store.use;
/** 纯 getter（世界书挂载等非 React 代码用） */
export const getAnnivStore = store.get;

export function saveAnniv(input: { id?: string; title: string; date: string; emoji: string; note?: string; startYear?: number; owner?: string }): Anniversary {
  const existing = input.id ? store.get().items.find((a) => a.id === input.id) : undefined;
  const item: Anniversary = {
    id: input.id ?? uid(),
    title: input.title,
    date: input.date,
    emoji: input.emoji,
    note: input.note ?? '',
    startYear: input.startYear ?? existing?.startYear,
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

/** 「在一起」的起点日期 YYYY-MM-DD（2026-09-14 G1）：优先 startYear + date；
 *  老数据没有 startYear 就从 note 里的 YYYY-MM-DD 解析；都没有 = null（调用方显示占位，不瞎算） */
export const togetherStartKey = (items: Anniversary[]): string | null => {
  const item = items.find((a) => a.id === 'seed-together') ?? items.find((a) => a.title.includes('在一起'));
  if (!item) return null;
  if (item.startYear) return `${item.startYear}-${item.date}`;
  const m = (item.note ?? '').match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
};

/** 在一起天数（首屏大字用）＝从起点到今天的整天数，口径与原占位常量完全一致，只换了日期来源；
 *  没配置返回 null（调用方显示占位） */
export const daysTogether = (items: Anniversary[], now: Date): number | null => {
  const key = togetherStartKey(items);
  if (!key) return null;
  const start = new Date(`${key}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.floor((today - start.getTime()) / 86400000));
};

/** 距下一个纪念日还有几天（今天 = 0） */
export const daysUntilAnniv = (dateKey: string, now: Date): number => {
  const [m, d] = dateKey.split('-').map(Number);
  if (!m || !d) return 0;
  const target = new Date(now.getFullYear(), m - 1, d);
  if (target.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) target.setFullYear(now.getFullYear() + 1);
  return Math.max(0, Math.round((target.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000));
};

// 世界书式动态挂载（2026-08-23）——noxhome 数据（当日经期/纪念日/日常）→ 世界书条目 → 挂载到选中角色的聊天上下文
// 机制照抄上游世界书：关键词/次关键词/概率/注入位置 0-6/深度/扫描条数，匹配引擎直接复用 utils/worldbook 的纯函数
// 关键设计：条目在每次上下文构建时「现读现生成」——couple store 一更新，下一轮聊天上下文就是新的，零同步代码
// 配置存 localStorage（noxhome_mount_v1）：version + ISO updatedAt；挂载单角色（charId），其他人无涉
// 默认全部关闭（opt-in）：挂载会占上下文额度，她自己决定开哪块

import type { CharacterProfile, MountedWorldbook, WorldbookDepthRole, WorldbookPosition, WorldbookSelectiveLogic } from '../types';
import { FLOW_LABELS, SYMPTOM_LABELS, phaseAt, predictNext, type SymptomKey } from './periodMath';
import { getCalendarDayDifference, getLocalDateKey } from './localDate';
import { getPeriodStore } from '../apps/couple/periodStore';
import { getTodoStore } from '../apps/couple/todoStore';
import { getAnnivStore } from '../apps/couple/annivStore';
import { getDietStore, type DietRecord, type FoodLibItem, type FridgeItem } from '../apps/couple/dietStore';
import { getDiaryStore, diaryOn, type DiaryEntry } from '../apps/couple/diaryStore';
import { getTogetherStore } from '../apps/couple/togetherStore';
import { getMusicStore, charPlayRecordsFromSessions } from '../apps/couple/musicStore';
import { loadMusicPlaybackSnapshot, loadMusicTogetherState } from '../context/MusicContext';
import { buildPromisesMountContent } from './togetherMath';
import { buildMusicMountContent, buildMusicMountKey } from './musicMountContent';
import { MEAL_LABELS, MEAL_ORDER } from './dietMath';

// ── 配置类型 ──

export type MountBlockId = 'period' | 'anniv' | 'daily' | 'dietToday' | 'dietLibrary' | 'dietFridge' | 'diary' | 'promises' | 'music';
export const MOUNT_BLOCK_IDS: MountBlockId[] = ['period', 'anniv', 'daily', 'dietToday', 'dietLibrary', 'dietFridge', 'diary', 'promises', 'music'];
export const MOUNT_BLOCK_LABELS: Record<MountBlockId, string> = {
  period: '当日经期',
  anniv: '纪念日',
  daily: '日常',
  dietToday: '今日饮食',
  dietLibrary: '饮食库',
  dietFridge: '冰箱',
  diary: '日记',
  promises: '约好的事',
  music: '音乐',
};

/** 每块数据的完整世界书参数（默认照抄上游世界书条目形状，UI 全部可调） */
export interface MountBlockConfig {
  enabled: boolean;
  position: WorldbookPosition;       // 默认 4：聊天记录指定深度（临时状态/近期事件最合适）
  order: number;
  key: string[];                     // 主关键词（逗号分隔存）
  keysecondary: string[];            // 辅助关键词
  selective: boolean;                // 辅助关键词开关
  selectiveLogic: WorldbookSelectiveLogic;
  constant: boolean;                 // 常量：无视关键词每轮都注入
  probability: number;               // 0-100
  useProbability: boolean;
  depth: number;                     // position=4 时的插入深度
  role: WorldbookDepthRole;          // position=4 时的消息角色
  scanDepth: number;                 // 扫描最近 N 条消息做关键词匹配
}

export interface NoxhomeMountConfig {
  version: number;
  updatedAt: string; // ISO
  charId: string | null; // 挂载到的角色（单角色，其他人无涉）
  blocks: Record<MountBlockId, MountBlockConfig>;
}

export const MOUNT_STORE_VERSION = 1;
const MOUNT_KEY = 'noxhome_mount_v1';

export const DEFAULT_BLOCKS: Record<MountBlockId, MountBlockConfig> = {
  period: {
    enabled: false, position: 4, order: 100,
    key: ['月经', '生理期', '痛经', '大姨妈', '例假'],
    keysecondary: [], selective: false, selectiveLogic: 0,
    constant: false, probability: 100, useProbability: false,
    depth: 4, role: 0, scanDepth: 8,
  },
  anniv: {
    enabled: false, position: 4, order: 101,
    key: ['纪念日', '在一起多久', '生日'],
    keysecondary: [], selective: false, selectiveLogic: 0,
    constant: false, probability: 100, useProbability: false,
    depth: 4, role: 0, scanDepth: 8,
  },
  daily: {
    enabled: false, position: 4, order: 102,
    key: ['待办', '日程', '清单'],
    keysecondary: [], selective: false, selectiveLogic: 0,
    constant: false, probability: 100, useProbability: false,
    depth: 4, role: 0, scanDepth: 8,
  },
  dietToday: {
    enabled: false, position: 4, order: 103,
    key: ['今天吃了', '吃什么', '饮食'],
    keysecondary: [], selective: false, selectiveLogic: 0,
    constant: false, probability: 100, useProbability: false,
    depth: 4, role: 0, scanDepth: 8,
  },
  dietLibrary: {
    enabled: false, position: 4, order: 104,
    key: ['食物库', '吃过什么', '爱吃什么', '常吃'],
    keysecondary: [], selective: false, selectiveLogic: 0,
    constant: false, probability: 100, useProbability: false,
    depth: 4, role: 0, scanDepth: 8,
  },
  dietFridge: {
    enabled: false, position: 4, order: 105,
    key: ['冰箱', '家里有什么菜', '做饭'],
    keysecondary: [], selective: false, selectiveLogic: 0,
    constant: false, probability: 100, useProbability: false,
    depth: 4, role: 0, scanDepth: 8,
  },
  diary: {
    enabled: false, position: 4, order: 106,
    key: ['日记', '今天写日记', '写没写'],
    keysecondary: [], selective: false, selectiveLogic: 0,
    constant: false, probability: 100, useProbability: false,
    depth: 4, role: 0, scanDepth: 8,
  },
  promises: {
    enabled: false, position: 4, order: 107,
    key: ['约好了', '之前说好的', '你答应我的', '约定', '答应'],
    keysecondary: [], selective: false, selectiveLogic: 0,
    constant: false, probability: 100, useProbability: false,
    depth: 4, role: 0, scanDepth: 8,
  },
  music: {
    enabled: false, position: 4, order: 108,
    // 动态关键词：配置关键词 ∪ 歌单全部歌名（buildBlockEntry 里并集）
    key: ['音乐', '歌', '听歌', '歌单', '歌词', '网易云', '一起听'],
    keysecondary: [], selective: false, selectiveLogic: 0,
    constant: false, probability: 100, useProbability: false,
    depth: 4, role: 0, scanDepth: 8,
  },
};

const freshBlocks = (): Record<MountBlockId, MountBlockConfig> =>
  Object.fromEntries(MOUNT_BLOCK_IDS.map((id) => [id, { ...DEFAULT_BLOCKS[id] }])) as Record<MountBlockId, MountBlockConfig>;

const defaultConfig = (): NoxhomeMountConfig => ({
  version: MOUNT_STORE_VERSION,
  updatedAt: '1970-01-01T00:00:00.000Z',
  charId: null,
  blocks: freshBlocks(),
});

function load(): NoxhomeMountConfig {
  try {
    const raw = localStorage.getItem(MOUNT_KEY);
    if (!raw) return defaultConfig();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== MOUNT_STORE_VERSION) return defaultConfig();
    const fresh = freshBlocks();
    for (const id of MOUNT_BLOCK_IDS) {
      fresh[id] = { ...fresh[id], ...(parsed.blocks?.[id] ?? {}) };
    }
    return {
      version: MOUNT_STORE_VERSION,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '1970-01-01T00:00:00.000Z',
      charId: typeof parsed.charId === 'string' ? parsed.charId : null,
      blocks: fresh,
    };
  } catch {
    return defaultConfig();
  }
}

let state = load();
const listeners = new Set<() => void>();

// 导入备份后现场重读（2026-09-08 反馈3 根因修）：挂载配置是模块级 state，
// 导入会整体重写 localStorage（charId/块参数来自旧设备或旧时刻），不重读就会整段
// 会话继续用旧配置生成挂载内容——看起来就是「挂载数据不再更新/挂错了人」。
if (typeof window !== 'undefined') {
  window.addEventListener('our-backup-imported', () => {
    state = load();
    listeners.forEach((l) => l());
  });
}

function commit(next: NoxhomeMountConfig) {
  state = next;
  try {
    localStorage.setItem(MOUNT_KEY, JSON.stringify(state));
  } catch {
    // 配额满：配置极小，内存态继续可用
  }
  listeners.forEach((l) => l());
}

export const getMountConfig = (): NoxhomeMountConfig => state;
export const subscribeMountConfig = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export const setMountCharId = (charId: string | null) => {
  commit({ ...state, charId, updatedAt: new Date().toISOString() });
};

export const setMountBlock = (id: MountBlockId, patch: Partial<MountBlockConfig>) => {
  commit({
    ...state,
    blocks: { ...state.blocks, [id]: { ...state.blocks[id], ...patch } },
    updatedAt: new Date().toISOString(),
  });
};

// ── 内容生成器（纯函数，可单测）──

const PHASE_LABELS: Record<string, (p: { day: number }) => string> = {
  period: (p) => `经期第 ${p.day} 天`,
  'predicted-period': (p) => `预计经期第 ${p.day} 天（已到预计开始日但还没记录）`,
  ovulation: () => '排卵日',
  luteal: (p) => `黄体期第 ${p.day} 天`,
  follicular: (p) => `卵泡期第 ${p.day} 天`,
  unknown: () => '还没有周期记录',
};

export interface MountPeriodEvent {
  type: 'period' | 'pmdd' | 'sex';
  date: string;
  flow?: 'light' | 'medium' | 'heavy';
  pain?: number;
  symptoms?: string[];
  note?: string;
}

const symptomText = (symptoms?: string[]) =>
  (symptoms ?? []).map((s) => SYMPTOM_LABELS[s as SymptomKey] ?? s).filter(Boolean).join('、');

const periodEventLine = (e: MountPeriodEvent): string => {
  if (e.type === 'period') {
    const parts: string[] = [];
    if (e.flow) parts.push(`流量${FLOW_LABELS[e.flow] ?? e.flow}`);
    if (typeof e.pain === 'number' && e.pain > 0) parts.push(`痛经 ${e.pain}/10`);
    const syms = symptomText(e.symptoms);
    if (syms) parts.push(`伴随：${syms}`);
    if (e.note) parts.push(`备注：${e.note}`);
    return parts.length ? `经期记录：${parts.join('；')}` : '经期记录';
  }
  if (e.type === 'pmdd') {
    const parts = ['PMDD 记录'];
    const syms = symptomText(e.symptoms);
    if (syms) parts.push(`伴随：${syms}`);
    if (e.note) parts.push(`备注：${e.note}`);
    return parts.join('；');
  }
  return e.note ? `性生活记录：${e.note}` : '性生活记录';
};

/** 当日经期块：周期阶段 + 当天记录（经期/PMDD/性生活）+ 吃药提醒 + 预测。无任何记录时也至少有阶段行 */
export function buildPeriodContent(input: {
  dateKey: string;
  events: MountPeriodEvent[];
  medReminders: Array<{ date: string; text: string; done: boolean }>;
}): string {
  const { dateKey, events, medReminders } = input;
  const bleedingDays = events.filter((e) => e.type === 'period').map((e) => e.date);
  const prediction = predictNext(bleedingDays);
  const phase = phaseAt(dateKey, bleedingDays, prediction);
  const phaseLine = PHASE_LABELS[phase.phase] ? PHASE_LABELS[phase.phase](phase) : phase.phase;

  const lines: string[] = [`{{user}} 的周期情况（${dateKey}）：${phaseLine}`];
  const today = events.filter((e) => e.date === dateKey);
  const order: MountPeriodEvent['type'][] = ['period', 'pmdd', 'sex'];
  for (const t of order) {
    for (const e of today.filter((x) => x.type === t)) lines.push(periodEventLine(e));
  }
  for (const r of medReminders.filter((r) => r.date === dateKey)) {
    lines.push(`吃药提醒「${r.text}」${r.done ? '已完成' : '还未完成'}`);
  }
  if (prediction.nextStart) {
    lines.push(`预计下次经期 ${prediction.nextStart}（平均周期 ${prediction.meanCycle} 天，经期约 ${prediction.meanPeriodLen ?? 5} 天）`);
  } else if (bleedingDays.length > 0) {
    lines.push('周期数据还不足（少于 2 个完整周期），暂未预测下次经期');
  }
  return lines.join('\n');
}

/** 纪念日块：今天是什么纪念日（含「自 XX 起已 N 天」）+ 最近的 3 个倒计时 */
export function buildAnnivContent(input: {
  dateKey: string;
  now: Date;
  items: Array<{ title: string; date: string; emoji: string; note?: string }>;
}): string {
  const { dateKey, now, items } = input;
  const lines: string[] = [];
  const mmdd = dateKey.slice(5);

  const noteDayCount = (note?: string): number | null => {
    if (!note) return null;
    const m = /^(\d{4}-\d{2}-\d{2})$/.exec(note.trim());
    if (!m) return null;
    const diff = getCalendarDayDifference(m[1], dateKey);
    return diff !== null && diff >= 0 ? diff : null;
  };

  const today = items.filter((i) => i.date === mmdd);
  for (const i of today) {
    lines.push(`今天是纪念日：${i.emoji}${i.title}`);
    const days = noteDayCount(i.note);
    if (days !== null) lines.push(`（自 ${i.note!.trim()} 起，已 ${days} 天）`);
  }

  const upcoming = items
    .filter((i) => i.date !== mmdd)
    .map((i) => {
      const [m, d] = i.date.split('-').map(Number);
      const target = new Date(now.getFullYear(), m - 1, d);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (target.getTime() < todayStart.getTime()) target.setFullYear(now.getFullYear() + 1);
      return { item: i, days: Math.round((target.getTime() - todayStart.getTime()) / 86400000) };
    })
    .filter((x) => x.days > 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 3);
  for (const { item, days } of upcoming) {
    lines.push(`距「${item.emoji}${item.title}」还有 ${days} 天（${item.date.slice(0, 2)}月${item.date.slice(3)}日）`);
  }

  if (lines.length === 0) lines.push('还没有纪念日');
  return lines.join('\n');
}

/** 日常块：今日待办清单（固定每日 + 今天到期的短期），全部完成/没有待办时返回空串（不注入） */
export function buildDailyContent(input: {
  dateKey: string;
  todos: Array<{ text: string; kind: 'fixed' | 'short'; date?: string; done: boolean; doneDates?: string[] }>;
}): string {
  const { dateKey, todos } = input;
  const fixed = todos.filter((t) => t.kind === 'fixed');
  const shorts = todos.filter((t) => t.kind === 'short' && t.date === dateKey);
  if (fixed.length === 0 && shorts.length === 0) return '';

  const line = (text: string, done: boolean) => `- [${done ? 'x' : ' '}] ${text}`;
  const rows: string[] = [];
  for (const t of fixed) rows.push(line(t.text, (t.doneDates ?? []).includes(dateKey)));
  for (const t of shorts) rows.push(line(t.text, t.done));

  const doneCount = [...fixed.map((t) => (t.doneDates ?? []).includes(dateKey)), ...shorts.map((t) => t.done)].filter(Boolean).length;
  return `与{{user}}的今日待办（${dateKey}，已完成 ${doneCount}/${fixed.length + shorts.length}）：\n${rows.join('\n')}`;
}

// ── 动态条目装配 ──

/** 今日饮食块：今天记下的全部饮食（按餐次 + 每样食物克数热量 + 小计）；没记 → 空串（不注入） */
export function buildDietTodayContent(input: { dateKey: string; records: DietRecord[] }): string {
  const { dateKey, records } = input;
  const today = records.filter((r) => r.date === dateKey);
  if (today.length === 0) return '';
  const lines: string[] = [`{{user}} 今天的饮食记录（${dateKey}）：`];
  for (const m of MEAL_ORDER) {
    const items = today.filter((r) => r.meal === m).flatMap((r) => r.items);
    if (items.length === 0) continue;
    const kcal = items.reduce((sum, i) => sum + i.kcal, 0);
    lines.push(`- ${MEAL_LABELS[m]}：${items.map((i) => `${i.name} ${i.grams}g ${i.kcal}千卡`).join('、')}（小计 ${Math.round(kcal)} 千卡）`);
  }
  return lines.join('\n');
}

const fmtEaten = (iso?: string): string => {
  if (!iso) return '还没记';
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[1])}月${Number(m[2])}日` : iso.slice(0, 10);
};

/** 饮食库概况块：每种食物吃过几次 / 最近一次吃 / 家常 / 外卖 / 评分；没食物 → 空串（不注入） */
export function buildDietLibraryContent(input: { foods: FoodLibItem[] }): string {
  const { foods } = input;
  if (foods.length === 0) return '';
  const sorted = foods.slice().sort((a, b) => b.eatenCount - a.eatenCount);
  const shown = sorted.slice(0, 30);
  const lines = [`{{user}} 的食物库（共 ${foods.length} 种，按吃过次数排序）：`];
  for (const f of shown) {
    const bits = [
      `吃过 ${f.eatenCount} 次`,
      `最近一次 ${fmtEaten(f.lastEatenAt)}`,
      f.isHomeCooked ? '有家常做法' : '',
      f.isTakeout ? '点过外卖' : '',
      f.rating ? `评分 ${f.rating}/5` : '',
      f.glycemic !== undefined ? `升糖 ${f.glycemic}` : '',
    ].filter(Boolean);
    lines.push(`- ${f.name}：${bits.join('，')}`);
  }
  if (sorted.length > shown.length) lines.push(`（其余 ${sorted.length - shown.length} 种略）`);
  return lines.join('\n');
}

/** 冰箱块：冰箱里有什么的全部信息（余量 + 全部购买记录：日期/季节/地点/价格/品质）；没食材 → 空串（不注入） */
export function buildDietFridgeContent(input: { fridge: FridgeItem[] }): string {
  const { fridge } = input;
  if (fridge.length === 0) return '';
  const lines = [`{{user}} 的冰箱（${fridge.length} 种食材）：`];
  for (const f of fridge) {
    const buys = f.purchases.map(
      (p) => `${p.date}${p.season ? `（${p.season}）` : ''} ${p.place ?? '未记地点'} ${p.price ?? '未记价格'} 品质${p.quality ?? '未记'}`,
    );
    lines.push(`- ${f.name}：余量 ${f.amount ?? '未记'}${buys.length ? `；购买记录：${buys.join('；')}` : '；还没有购买记录'}`);
  }
  return lines.join('\n');
}

/** 日记块：今天两人写没写日记；Nox 写了带全文（截断防爆上下文）。她的内容不进——他只有通过她转发的批阅卡片才能读到 */
export function buildDiaryContent(input: { dateKey: string; entries: DiaryEntry[] }): string {
  const { dateKey, entries } = input;
  const his = diaryOn(entries, dateKey, 'me');
  const hers = diaryOn(entries, dateKey, 'her');
  const lines: string[] = [];
  if (his && his.content.trim()) {
    const body = his.content.trim();
    const capped = body.length > 1000 ? `${body.slice(0, 1000)}……（今天日记较长，此处截断）` : body;
    lines.push(`Nox 今天（${dateKey}）写了日记：\n${capped}`);
  } else {
    lines.push(`Nox 今天（${dateKey}）还没写日记。`);
  }
  lines.push(
    hers && hers.content.trim()
      ? '{{user}} 今天写了日记（你还没读过内容，不知道她写了什么）。'
      : '{{user}} 今天还没写日记。',
  );
  return lines.join('\n');
}

/** builder 可返回纯内容或带动态关键词（music 块把歌名并进 key，提到歌名直接命中） */
type BlockBuilderResult = string | { content: string; key?: string[] };

const BLOCK_BUILDERS: Record<MountBlockId, () => BlockBuilderResult> = {
  period: () => {
    const s = getPeriodStore();
    return buildPeriodContent({ dateKey: getLocalDateKey(), events: s.events as MountPeriodEvent[], medReminders: s.medReminders });
  },
  anniv: () => {
    const s = getAnnivStore();
    return buildAnnivContent({ dateKey: getLocalDateKey(), now: new Date(), items: s.items });
  },
  daily: () => {
    const s = getTodoStore();
    return buildDailyContent({ dateKey: getLocalDateKey(), todos: s.todos });
  },
  dietToday: () => buildDietTodayContent({ dateKey: getLocalDateKey(), records: getDietStore().records }),
  dietLibrary: () => buildDietLibraryContent({ foods: getDietStore().foods }),
  dietFridge: () => buildDietFridgeContent({ fridge: getDietStore().fridge }),
  diary: () => buildDiaryContent({ dateKey: getLocalDateKey(), entries: getDiaryStore().entries }),
  promises: () => buildPromisesMountContent({ dateKey: getLocalDateKey(), items: getTogetherStore().promises }),
  music: () => {
    const s = getMusicStore();
    // 一起听会话按 charId 各存一份（批 2）——挂载块只给挂载角色的那一份
    const charId = getMountConfig().charId;
    let togetherSessions = charId ? s.togetherSessions.filter((t) => t.charId === charId) : s.togetherSessions;
    // 2026-09-08 反馈3：进行中的一起听实时可见——会话缓冲只在「结束一起听」时才 flush 落库，
    // 之前挂载块看不到「正在听的这轮」（听了三次的新歌不在、旧纪录在，就是她报的现象）。
    // 挂载角色此刻正在一起听时，把内存缓冲当作一条进行中的会话并入（结束落库后自然被正式记录替代）。
    try {
      const snap = loadMusicPlaybackSnapshot();
      const live = loadMusicTogetherState();
      if (charId && live && live.songs.length > 0 && (snap?.listeningTogetherWith || []).includes(charId)) {
        togetherSessions = [
          ...togetherSessions,
          {
            id: '__live__',
            charId,
            startedAt: new Date(live.startedAt).toISOString(),
            endedAt: new Date().toISOString(),
            songs: live.songs.map((x) => ({
              neteaseId: x.id,
              name: x.name,
              artists: x.artists ? String(x.artists).split(/[/、,]+/).map((a) => a.trim()).filter(Boolean) : [],
              count: x.count,
              albumPic: x.albumPic,
            })),
          },
        ];
      }
    } catch { /* 挂载块是同步纯路径，live 合并失败不拦主流程 */ }
    // 「最近常听」按角色分源——有挂载角色时用其一起听会话聚合（含 live），
    // 不用她自己点播的混合池（混合池全时排行被导入的旧计数定死，看起来不再更新）
    const playRecords = charId ? charPlayRecordsFromSessions(togetherSessions, charId) : s.playRecords;
    const input = { importedSongs: s.importedSongs, playRecords, togetherSessions };
    return {
      content: buildMusicMountContent(input),
      key: buildMusicMountKey([], input),
    };
  },
};

/** 把一块数据装成世界书条目（内容空 → null）。ignoreEnabled 供设置页预览未开启的块 */
export function buildBlockEntry(id: MountBlockId, opts?: { ignoreEnabled?: boolean }): MountedWorldbook | null {
  const cfg = getMountConfig();
  const block = cfg.blocks[id];
  if (!block) return null;
  if (!block.enabled && !opts?.ignoreEnabled) return null;
  const built = BLOCK_BUILDERS[id]();
  const content = (typeof built === 'string' ? built : built.content).trim();
  if (!content) return null;
  const dynamicKey = typeof built === 'string' ? undefined : built.key;
  return {
    id: `noxhome-${id}`,
    title: MOUNT_BLOCK_LABELS[id],
    content,
    category: 'NoxHome',
    key: [...block.key, ...(dynamicKey ?? [])],
    keysecondary: [...block.keysecondary],
    selective: block.selective,
    selectiveLogic: block.selectiveLogic,
    constant: block.constant,
    order: block.order,
    position: block.position,
    disable: false,
    probability: block.probability,
    useProbability: block.useProbability,
    depth: block.depth,
    role: block.role,
    scanDepth: block.scanDepth,
  };
}

/** 当前配置下所有生效的动态条目（每次调用现读现生成） */
export function buildDynamicWorldbooks(charId?: string): MountedWorldbook[] {
  const cfg = getMountConfig();
  if (!cfg.charId) return [];
  if (charId !== undefined && charId !== cfg.charId) return [];
  return MOUNT_BLOCK_IDS.map((id) => buildBlockEntry(id)).filter((e): e is MountedWorldbook => e !== null);
}

/** 注入点统一入口：原世界书 + 动态条目（仅在 char 是被挂载角色时追加） */
export function mergedMountedWorldbooks(char: Pick<CharacterProfile, 'id' | 'mountedWorldbooks'>): MountedWorldbook[] {
  return [...(char.mountedWorldbooks || []), ...buildDynamicWorldbooks(char.id)];
}

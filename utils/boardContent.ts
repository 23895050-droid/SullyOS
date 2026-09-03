// 留言板「批阅今天」的日常全量信息组装（2026-08-25）——纯函数，输入全是普通数据，输出文本
// 复用 noxhomeMount 的各块生成器（与聊天挂载同一套口径）；差一段：日记部分只给「写没写」状态——
// 她的日记内容永不进批阅输入（防幻觉铁律：他只有通过她转发的批阅卡片才能读到）
import { buildAnnivContent, buildDailyContent, buildDietTodayContent, buildPeriodContent, type MountPeriodEvent } from './noxhomeMount';
import type { DietRecord } from '../apps/couple/dietStore';
import type { DiaryEntry } from '../apps/couple/diaryStore';

export interface BoardBankTx {
  amount: number;
  category: string;
  note?: string;
}

export interface BoardActivityRow {
  label: string;   // 活动类别标签（待办/纪念日/记账/饮食/日记/留言…）
  text: string;
  time: string;    // HH:mm
}

export interface BoardDayInput {
  dateKey: string;
  now?: Date;
  todos: Array<{ text: string; kind: 'fixed' | 'short'; date?: string; doneDates?: string[]; done: boolean }>;
  periodEvents: MountPeriodEvent[];
  medReminders: Array<{ date: string; text: string; done: boolean }>;
  dietRecords: DietRecord[];
  bankTx: BoardBankTx[];
  activities: BoardActivityRow[];
  annivItems: Array<{ title: string; date: string; emoji: string; note?: string }>;
  hisDiary?: DiaryEntry;      // 他的日记（全文截断在生成器里做）
  herDiaryWritten: boolean;   // 她写没写（只有布尔值——内容不进）
}

/** 日记段：他的带全文（截断），她的只有写没写状态 */
export function buildBoardDiarySection(dateKey: string, his?: DiaryEntry, herWritten = false): string {
  const lines: string[] = [];
  if (his && his.content.trim()) {
    const body = his.content.trim();
    const capped = body.length > 1000 ? `${body.slice(0, 1000)}……（今天日记较长，此处截断）` : body;
    lines.push(`Nox 今天（${dateKey}）写了日记：\n${capped}`);
  } else {
    lines.push(`Nox 今天（${dateKey}）还没写日记。`);
  }
  lines.push(
    herWritten
      ? '{{user}} 今天写了日记（你还没读过内容，不知道她写了什么）。'
      : '{{user}} 今天还没写日记。',
  );
  return lines.join('\n');
}

/** 记账段：今天全部流水（金额/分类/备注） */
export function buildBoardBankSection(txs: BoardBankTx[]): string {
  if (txs.length === 0) return '今天还没有记账。';
  const rows = txs.map((t) => `- ¥${t.amount.toFixed(2)}（${t.category}）${t.note ? `：${t.note}` : ''}`);
  return `今天记的账（共 ${txs.length} 笔）：\n${rows.join('\n')}`;
}

/** 活动段：今天活动日志里的全部事件（时间倒序） */
export function buildBoardActivitiesSection(rows: BoardActivityRow[]): string {
  if (rows.length === 0) return '今天还没有活动记录。';
  return `今天发生的活动：\n${rows.map((r) => `- ${r.time} ${r.label}：${r.text}`).join('\n')}`;
}

/** 组装七段全量日常（生理期/纪念日/待办/饮食/记账/活动/日记），供「批阅今天」提示词使用 */
export function buildBoardDayInfo(input: BoardDayInput): string {
  const { dateKey, now = new Date() } = input;

  const sections: Array<[string, string]> = [];

  sections.push(['今天 · 生理期', buildPeriodContent({ dateKey, events: input.periodEvents, medReminders: input.medReminders })]);
  sections.push(['今天 · 纪念日', buildAnnivContent({ dateKey, now, items: input.annivItems })]);
  sections.push([
    '今天 · 待办',
    buildDailyContent({ dateKey, todos: input.todos }) || '今天还没有待办。',
  ]);
  sections.push([
    '今天 · 饮食',
    buildDietTodayContent({ dateKey, records: input.dietRecords }) || '今天还没记饮食。',
  ]);
  sections.push(['今天 · 记账', buildBoardBankSection(input.bankTx)]);
  sections.push(['今天 · 活动', buildBoardActivitiesSection(input.activities)]);
  sections.push(['今天 · 日记', buildBoardDiarySection(dateKey, input.hisDiary, input.herDiaryWritten)]);

  return sections.map(([title, body]) => `【${title}】\n${body}`).join('\n\n');
}

// 留言板批阅输入组装单测（2026-08-25）——日常全量信息七段；她的日记内容永不进（防幻觉铁律）
import { describe, expect, it } from 'vitest';
import { buildBoardActivitiesSection, buildBoardBankSection, buildBoardDayInfo, buildBoardDiarySection, type BoardDayInput } from './boardContent';
import type { DiaryEntry } from '../apps/couple/diaryStore';

const hisEntry: DiaryEntry = {
  id: 'd1', date: '2026-08-25', owner: 'me', content: '夜航日志\n2026年8月25日 晴\n今天很好。',
  createdAt: '2026-08-25T10:00:00.000Z', updatedAt: '2026-08-25T10:00:00.000Z',
};

describe('buildBoardDiarySection 日记段', () => {
  it('他的日记带全文；她的只有「写没写」状态，内容永不进', () => {
    const text = buildBoardDiarySection('2026-08-25', hisEntry, true);
    expect(text).toContain('今天很好。');
    expect(text).toContain('{{user}} 今天写了日记（你还没读过内容，不知道她写了什么）');
  });

  it('都没写时出两条状态行', () => {
    const text = buildBoardDiarySection('2026-08-25', undefined, false);
    expect(text).toContain('Nox 今天（2026-08-25）还没写日记。');
    expect(text).toContain('{{user}} 今天还没写日记。');
  });

  it('他的日记超 1000 字截断', () => {
    const long: DiaryEntry = { ...hisEntry, content: `标题\n日期\n${'长'.repeat(1500)}` };
    const text = buildBoardDiarySection('2026-08-25', long, false);
    expect(text).toContain('（今天日记较长，此处截断）');
    expect(text.length).toBeLessThan(1500);
  });
});

describe('buildBoardBankSection 记账段', () => {
  it('流水逐行（金额/分类/备注）', () => {
    const text = buildBoardBankSection([
      { amount: 22.8, category: '餐饮', note: '午饭' },
      { amount: 15, category: '交通' },
    ]);
    expect(text).toContain('共 2 笔');
    expect(text).toContain('¥22.80（餐饮）：午饭');
    expect(text).toContain('¥15.00（交通）');
  });

  it('没记账出空态行', () => {
    expect(buildBoardBankSection([])).toBe('今天还没有记账。');
  });
});

describe('buildBoardActivitiesSection 活动段', () => {
  it('按行输出时间/标签/内容', () => {
    const text = buildBoardActivitiesSection([{ time: '09:30', label: '待办', text: '加了待办' }]);
    expect(text).toContain('- 09:30 待办：加了待办');
  });

  it('空态', () => {
    expect(buildBoardActivitiesSection([])).toBe('今天还没有活动记录。');
  });
});

describe('buildBoardDayInfo 全量组装', () => {
  const base: BoardDayInput = {
    dateKey: '2026-08-25',
    now: new Date(2026, 7, 25, 12),
    todos: [],
    periodEvents: [],
    medReminders: [],
    dietRecords: [],
    bankTx: [],
    activities: [],
    annivItems: [],
    hisDiary: hisEntry,
    herDiaryWritten: true,
  };

  it('七段齐全，标题都在', () => {
    const text = buildBoardDayInfo(base);
    for (const h of ['今天 · 生理期', '今天 · 纪念日', '今天 · 待办', '今天 · 饮食', '今天 · 记账', '今天 · 活动', '今天 · 日记']) {
      expect(text).toContain(`【${h}】`);
    }
  });

  it('无数据时待办/饮食落空态行（buildDailyContent 空串兜底）', () => {
    const text = buildBoardDayInfo(base);
    expect(text).toContain('今天还没有待办。');
    expect(text).toContain('今天还没记饮食。');
  });

  it('有数据时待办带完成状态、经期带记录', () => {
    const text = buildBoardDayInfo({
      ...base,
      todos: [
        { text: '吃药', kind: 'fixed', doneDates: ['2026-08-25'], done: true },
        { text: '寄快递', kind: 'short', date: '2026-08-25', done: false },
      ],
      periodEvents: [{ type: 'period', date: '2026-08-25', flow: 'medium', pain: 6, symptoms: ['abdomen'], note: '累' }],
    });
    expect(text).toContain('- [x] 吃药');
    expect(text).toContain('- [ ] 寄快递');
    expect(text).toContain('流量中等');
    expect(text).toContain('痛经 6/10');
  });

  it('她的日记内容结构上就进不来（只接收布尔值）', () => {
    // 输入类型里根本没有她的正文字段——组装输出里出现的只能是「写没写」状态行
    const text = buildBoardDayInfo(base);
    expect(text).toContain('{{user}} 今天写了日记');
  });
});

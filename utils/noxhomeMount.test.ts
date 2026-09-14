// noxhomeMount 内容生成器单测（2026-08-23）——纯函数，不碰 localStorage
import { describe, expect, it } from 'vitest';
import { buildAnnivContent, buildDailyContent, buildDiaryContent, buildDietFridgeContent, buildDietLibraryContent, buildDietTodayContent, buildPeriodContent, buildWeatherContent, DEFAULT_BLOCKS, MOUNT_BLOCK_IDS, MOUNT_BLOCK_LABELS } from './noxhomeMount';

describe('buildPeriodContent', () => {
  it('经期中：阶段行 + 当天记录 + 吃药提醒 + 数据不足提示', () => {
    const content = buildPeriodContent({
      dateKey: '2026-08-23',
      events: [
        { type: 'period', date: '2026-08-20', flow: 'medium' },
        { type: 'period', date: '2026-08-21', flow: 'medium' },
        { type: 'period', date: '2026-08-22', flow: 'medium', pain: 8 },
        { type: 'period', date: '2026-08-23', flow: 'heavy', pain: 8, symptoms: ['headache', 'abdomen'], note: '比昨天疼' },
        { type: 'pmdd', date: '2026-08-23', note: '易怒' },
      ],
      medReminders: [{ date: '2026-08-23', text: '吃止痛药', done: false }],
    });
    expect(content).toContain('经期第 4 天');
    expect(content).toContain('流量大量');
    expect(content).toContain('痛经 8/10');
    expect(content).toContain('头疼、小腹痛');
    expect(content).toContain('比昨天疼');
    expect(content).toContain('PMDD 记录；备注：易怒');
    expect(content).toContain('吃药提醒「吃止痛药」还未完成');
    expect(content).toContain('周期数据还不足');
  });

  it('黄体期第 7 天 + 预测行（两个完整周期）', () => {
    const content = buildPeriodContent({
      dateKey: '2026-07-25',
      events: [
        { type: 'period', date: '2026-05-01' }, { type: 'period', date: '2026-05-02' },
        { type: 'period', date: '2026-05-03' }, { type: 'period', date: '2026-05-04' },
        { type: 'period', date: '2026-06-01' }, { type: 'period', date: '2026-06-02' },
        { type: 'period', date: '2026-06-03' }, { type: 'period', date: '2026-06-04' },
        { type: 'period', date: '2026-07-01' }, { type: 'period', date: '2026-07-02' },
        { type: 'period', date: '2026-07-03' }, { type: 'period', date: '2026-07-04' },
      ],
      medReminders: [],
    });
    expect(content).toContain('黄体期第 7 天');
    expect(content).toContain('预计下次经期 2026-07-31');
    expect(content).toContain('平均周期 30 天');
    expect(content).toContain('经期约 4 天');
  });

  it('无记录 → 引导态', () => {
    const content = buildPeriodContent({ dateKey: '2026-08-23', events: [], medReminders: [] });
    expect(content).toContain('还没有周期记录');
  });
});

describe('buildAnnivContent', () => {
  it('今天是纪念日（note 日期算已多少天）+ 最近的倒计时', () => {
    const content = buildAnnivContent({
      dateKey: '2025-01-01',
      now: new Date(2025, 0, 1, 12),
      items: [
        { title: '在一起', date: '01-01', emoji: '💙', note: '2024-01-01' },
        { title: 'Ta 的生日', date: '02-14', emoji: '🎂' },
      ],
    });
    expect(content).toContain('今天是纪念日：💙在一起');
    expect(content).toContain('自 2024-01-01 起，已 366 天');
    expect(content).toContain('距「🎂Ta 的生日」还有');
    expect(content).toContain('02月14日');
  });

  it('无纪念日 → 占位行', () => {
    const content = buildAnnivContent({ dateKey: '2026-06-21', now: new Date(2026, 5, 21), items: [] });
    expect(content).toContain('还没有纪念日');
  });

  it('note 不是日期 → 不算天数', () => {
    const content = buildAnnivContent({
      dateKey: '2026-06-21',
      now: new Date(2026, 5, 21),
      items: [{ title: '在一起', date: '06-21', emoji: '💙', note: '第一次见面' }],
    });
    expect(content).toContain('今天是纪念日：💙在一起');
    expect(content).not.toContain('已 ');
  });
});

describe('buildDailyContent', () => {
  it('固定（按日勾选）+ 当天短期 + 完成统计，明天的短期不进来', () => {
    const content = buildDailyContent({
      dateKey: '2026-08-23',
      todos: [
        { text: '吃维C', kind: 'fixed', done: false, doneDates: [] },
        { text: '喝水', kind: 'fixed', done: false, doneDates: ['2026-08-23'] },
        { text: '取快递', kind: 'short', date: '2026-08-23', done: true },
        { text: '明天的会', kind: 'short', date: '2026-08-24', done: false },
      ],
    });
    expect(content).toContain('- [ ] 吃维C');
    expect(content).toContain('- [x] 喝水');
    expect(content).toContain('- [x] 取快递');
    expect(content).not.toContain('明天的会');
    expect(content).toContain('已完成 2/3');
  });

  it('没有待办 → 空串（不注入）', () => {
    expect(buildDailyContent({ dateKey: '2026-08-23', todos: [] })).toBe('');
  });
});

// ── 饮食三块（2026-08-23 二批） ──

const dietRecord = (date: string, meal: string, items: Array<{ name: string; grams: number; kcal: number; createdAt: string }>) => ({
  id: `r-${meal}`,
  date,
  meal,
  items: items.map((i, n) => ({ id: `i-${meal}-${n}`, ...i, createdAt: i.createdAt })),
  createdAt: '2026-08-23T08:00:00.000Z',
  updatedAt: '2026-08-23T08:00:00.000Z',
  owner: 'her',
});

describe('buildDietTodayContent', () => {
  it('按餐次列出今天的全部饮食（克数+热量+小计），昨天的记录不进来', () => {
    const records = [
      dietRecord('2026-08-23', 'breakfast', [{ name: '牛奶', grams: 250, kcal: 140, createdAt: '2026-08-23T01:00:00.000Z' }]),
      dietRecord('2026-08-23', 'lunch', [
        { name: '米饭', grams: 200, kcal: 232, createdAt: '2026-08-23T04:00:00.000Z' },
        { name: '番茄炒蛋', grams: 150, kcal: 130, createdAt: '2026-08-23T04:00:00.000Z' },
      ]),
      dietRecord('2026-08-22', 'dinner', [{ name: '面条', grams: 300, kcal: 420, createdAt: '2026-08-22T11:00:00.000Z' }]),
    ];
    const content = buildDietTodayContent({ dateKey: '2026-08-23', records: records as never });
    expect(content).toContain('早餐：牛奶 250g 140千卡');
    expect(content).toContain('午餐：米饭 200g 232千卡、番茄炒蛋 150g 130千卡（小计 362 千卡）');
    expect(content).not.toContain('面条');
  });

  it('当天没记 → 空串（不注入）', () => {
    expect(buildDietTodayContent({ dateKey: '2026-08-23', records: [] })).toBe('');
  });
});

describe('buildDietLibraryContent', () => {
  it('每种食物：吃过次数/最近一次/家常/外卖/评分，按次数排序，上限 30', () => {
    const food = (name: string, eatenCount: number, extra: Record<string, unknown> = {}) => ({
      id: name, name, kcal: 100, protein: 5, carbs: 15, fat: 3, unit: 'g', defaultGrams: 100,
      eatenCount, lastEatenAt: '2026-08-20T12:00:00.000Z', createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-20T12:00:00.000Z', owner: 'her', ...extra,
    });
    const foods = [
      food('麻辣烫', 10, { isTakeout: true, rating: 5 }),
      food('番茄炒蛋', 3, { isHomeCooked: true, rating: 4, glycemic: 2.3 }),
    ];
    const content = buildDietLibraryContent({ foods: foods as never });
    expect(content.indexOf('麻辣烫')).toBeLessThan(content.indexOf('番茄炒蛋'));
    expect(content).toContain('吃过 10 次');
    expect(content).toContain('最近一次 8月20日');
    expect(content).toContain('点过外卖');
    expect(content).toContain('有家常做法');
    expect(content).toContain('评分 5/5');
    expect(content).toContain('升糖 2.3');
  });

  it('空库 → 空串（不注入）', () => {
    expect(buildDietLibraryContent({ foods: [] })).toBe('');
  });
});

describe('buildDietFridgeContent', () => {
  it('全部食材：余量 + 每次购买的时间/季节/地点/价格/品质', () => {
    const fridge = [
      {
        id: 'f1', name: '辣椒', amount: '半斤',
        purchases: [
          { id: 'p1', date: '2026-08-23', season: '秋', place: '杨家菜市', price: '2元/斤', quality: '很差', createdAt: '2026-08-23T02:00:00.000Z' },
          { id: 'p2', date: '2026-08-15', season: '秋', place: '永辉', price: '3元/斤', quality: '很好', createdAt: '2026-08-15T02:00:00.000Z' },
        ],
        createdAt: '2026-08-15T00:00:00.000Z', updatedAt: '2026-08-23T02:00:00.000Z', owner: 'her',
      },
    ];
    const content = buildDietFridgeContent({ fridge: fridge as never });
    expect(content).toContain('辣椒：余量 半斤');
    expect(content).toContain('2026-08-23（秋） 杨家菜市 2元/斤 品质很差');
    expect(content).toContain('2026-08-15（秋） 永辉 3元/斤 品质很好');
  });

  it('空冰箱 → 空串（不注入）', () => {
    expect(buildDietFridgeContent({ fridge: [] })).toBe('');
  });
});

// ── 日记块（2026-08-24）──

const diaryEntry = (date: string, owner: 'me' | 'her', content: string) => ({
  id: `d-${owner}-${date}`, date, owner, content, createdAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z`,
});

describe('buildDiaryContent', () => {
  it('自己写了带全文（截断保护），她的内容不进——只说她写没写', () => {
    const content = buildDiaryContent({
      dateKey: '2026-08-24',
      entries: [
        diaryEntry('2026-08-24', 'me', '标题\n2026年8月24日 晴\n今天很好。'),
        diaryEntry('2026-08-24', 'her', '她的秘密日记内容'),
      ],
    });
    expect(content).toContain('Nox 今天（2026-08-24）写了日记：');
    expect(content).toContain('今天很好。');
    expect(content).toContain('{{user}} 今天写了日记');
    expect(content).not.toContain('她的秘密日记内容'); // 核心规则：他不能从挂载读到她的内容
  });

  it('都没写 → 两行状态（防幻觉：不知道就是不知道）', () => {
    const content = buildDiaryContent({ dateKey: '2026-08-24', entries: [] });
    expect(content).toContain('还没写日记');
    expect(content).toContain('{{user}} 今天还没写日记');
  });

  it('全文超长截断', () => {
    const long = 'a'.repeat(1600);
    const content = buildDiaryContent({ dateKey: '2026-08-24', entries: [diaryEntry('2026-08-24', 'me', long)] });
    expect(content).toContain('此处截断');
    expect(content.length).toBeLessThan(1200);
  });
});

describe('promises 挂载块注册', () => {
  it('MOUNT_BLOCK_IDS 含 promises、标签与默认关键词就位', () => {
    expect(MOUNT_BLOCK_IDS).toContain('promises');
    expect(MOUNT_BLOCK_LABELS.promises).toBe('约好的事');
    expect(DEFAULT_BLOCKS.promises.key).toContain('约好了');
    expect(DEFAULT_BLOCKS.promises.order).toBeGreaterThan(DEFAULT_BLOCKS.diary.order);
  });
});

describe('music 挂载块注册', () => {
  it('MOUNT_BLOCK_IDS 含 music、标签与默认关键词就位，order 排在最后', () => {
    expect(MOUNT_BLOCK_IDS).toContain('music');
    expect(MOUNT_BLOCK_LABELS.music).toBe('音乐');
    expect(DEFAULT_BLOCKS.music.key).toContain('一起听');
    expect(DEFAULT_BLOCKS.music.order).toBeGreaterThan(DEFAULT_BLOCKS.promises.order);
  });
});

describe('weather 挂载块注册（2026-09-15）', () => {
  it('MOUNT_BLOCK_IDS 含 weather、标签与默认关键词就位，order 排在 music 之后', () => {
    expect(MOUNT_BLOCK_IDS).toContain('weather');
    expect(MOUNT_BLOCK_LABELS.weather).toBe('天气');
    expect(DEFAULT_BLOCKS.weather.key).toContain('天气');
    expect(DEFAULT_BLOCKS.weather.order).toBeGreaterThan(DEFAULT_BLOCKS.music.order);
  });

  it('buildWeatherContent：有数据出 {{user}} 城市/温度/体感/今天，无数据空串', () => {
    const data = {
      now: { temp: 26, feels: 25, code: 0 },
      hours: [],
      days: [{ date: '2026-09-14', code: 1, min: 17, max: 33, pop: 20 }],
      aqi: { aqi: 42 },
    };
    const s = buildWeatherContent({ cityName: '上海', data });
    expect(s).toContain('{{user}} 那边的天气（上海）');
    expect(s).toContain('Clear 26°（体感 25°）');
    expect(s).toContain('今天 17° ~ 33°，降水概率 20%');
    expect(s).toContain('空气质量 42（Good）');
    expect(buildWeatherContent({ cityName: '上海', data: null })).toBe('');
  });
});

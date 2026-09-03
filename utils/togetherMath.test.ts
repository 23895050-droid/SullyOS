// 和 Ta 纯函数单测（2026-08-25）——感受编号 / 搜索筛选 / 转发文案（角色只读文字）/ 约定挂载内容
import { describe, expect, it } from 'vitest';
import {
  buildMemoryForwardBody, buildPromiseForwardBody, buildPromisesMountContent, feelingSeq,
  filterTogetherByType, fmtFeelingSeq, hasUnarchivedPhoto, photoDescLines, searchTogether, togetherTypeDef,
} from './togetherMath';
import type { TogetherFeeling, TogetherMemory, TogetherPromise } from '../apps/couple/togetherStore';

const mem: TogetherMemory = {
  id: 'm1', title: '海边的日出', type: 'travel', date: '2026-08-20', duration: '一下午',
  context: '开车去海边，看了日出。',
  photos: [
    { blobRef: 'b1', archiveId: 'ma_1', summary: '2026年8月20日，Nox 和 Angelica 在海边。画面中太阳刚升起，两个人站在礁石上。' },
    { blobRef: 'b2' },
  ],
  feelings: [
    { id: 'f1', owner: 'her', content: '风很大但是很开心。', createdAt: '2026-08-20T10:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z' },
    { id: 'f2', owner: 'me', content: '她头发被吹得乱七八糟。', generated: true, createdAt: '2026-08-20T11:00:00.000Z', updatedAt: '2026-08-20T11:00:00.000Z' },
  ],
  createdAt: '2026-08-20T09:00:00.000Z', updatedAt: '2026-08-20T09:00:00.000Z',
};

const prom: TogetherPromise = {
  id: 'p1', title: '一起去看海边的日出', type: 'daily', proposer: 'me', place: '海边',
  content: '之前说好的，找个周末去。', deadline: '2026-09-15', done: false,
  photos: [], feelings: [], createdAt: '2026-08-19T10:00:00.000Z', updatedAt: '2026-08-19T10:00:00.000Z',
};

describe('类型色板', () => {
  it('合法类型取对应色，非法回退 other', () => {
    expect(togetherTypeDef('travel').label).toBe('旅行');
    expect(togetherTypeDef('festival').color).toBe('#d96a72');
    expect(togetherTypeDef('unknown' as never).key).toBe('other');
  });
});

describe('感受编号（按记录次序）', () => {
  it('按 createdAt 升序编号；删掉中间一条后面递补', () => {
    const feelings = [...mem.feelings];
    expect(feelingSeq(feelings, 'f1')).toBe(1);
    expect(feelingSeq(feelings, 'f2')).toBe(2);
    const afterDelete: TogetherFeeling[] = [feelings[1]];
    expect(feelingSeq(afterDelete, 'f2')).toBe(1);
  });

  it('找不到返回 null / 空文案', () => {
    expect(feelingSeq(mem.feelings, 'nope')).toBeNull();
    expect(fmtFeelingSeq(mem.feelings, 'nope')).toBe('');
    expect(fmtFeelingSeq(mem.feelings, 'f2')).toContain('第 2 次');
  });
});

describe('搜索 / 筛选', () => {
  it('标题/内容/地点模糊匹配；空查询全量', () => {
    expect(searchTogether([mem, prom], '日出').length).toBe(2);
    expect(searchTogether([mem, prom], '海边').length).toBe(2);
    expect(searchTogether([mem, prom], '不存在的词')).toEqual([]);
    expect(searchTogether([mem, prom], '')).toHaveLength(2);
  });

  it('按类型筛选', () => {
    expect(filterTogetherByType([mem, prom], 'travel')).toEqual([mem]);
    expect(filterTogetherByType([mem, prom], null)).toHaveLength(2);
  });
});

describe('照片留档规则', () => {
  it('有未留档照片 → 转发前挡住；全部留档 → 放行', () => {
    expect(hasUnarchivedPhoto(mem.photos)).toBe(true);
    expect(hasUnarchivedPhoto([mem.photos[0]])).toBe(false);
    expect(hasUnarchivedPhoto([])).toBe(false);
  });

  it('照片描述只出留档过的文字（角色只读这个）', () => {
    const lines = photoDescLines(mem.photos);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('太阳刚升起');
  });
});

describe('转发文案', () => {
  it('回忆：类型/日期/用时 + 上下文 + 照片描述；不带感受时不出现', () => {
    const noFeel = buildMemoryForwardBody({ ...mem, photos: [mem.photos[0]] }, { withFeelings: false });
    expect(noFeel).toContain('旅行 · 2026-08-20 · 用时一下午');
    expect(noFeel).toContain('开车去海边');
    expect(noFeel).toContain('太阳刚升起');
    expect(noFeel).not.toContain('感受记录');
  });

  it('回忆：带感受时按编号列出双方', () => {
    const withFeel = buildMemoryForwardBody(mem, { withFeelings: true });
    expect(withFeel).toContain('1. Angelica：风很大但是很开心。');
    expect(withFeel).toContain('2. Nox：她头发被吹得乱七八糟。');
  });

  it('约定：提议人/地点/时限 + 内容', () => {
    const body = buildPromiseForwardBody(prom, { withFeelings: false });
    expect(body).toContain('Nox 提议 · 地点：海边 · 时限：2026-09-15 前');
    expect(body).toContain('之前说好的');
  });
});

describe('约定挂载内容', () => {
  it('只挂未完成的；完成的排除', () => {
    const done = { ...prom, id: 'p2', done: true };
    const text = buildPromisesMountContent({ dateKey: '2026-08-25', items: [prom, done] });
    expect(text).toContain('共 1 件');
    expect(text).toContain('一起去看海边的日出');
    expect(text).toContain('挑最重要的 1-2 件聊');
  });

  it('全完成/没有约定 → 空串（不注入）', () => {
    expect(buildPromisesMountContent({ dateKey: '2026-08-25', items: [{ ...prom, done: true }] })).toBe('');
    expect(buildPromisesMountContent({ dateKey: '2026-08-25', items: [] })).toBe('');
  });
});

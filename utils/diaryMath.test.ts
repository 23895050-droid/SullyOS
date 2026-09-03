// 日记纯函数单测（2026-08-24）——分句编号必须稳定（发 prompt 与渲染定位同一套）；旁批扁平化；日期文案
import { describe, expect, it } from 'vitest';
import { diarySentences, diarySplitSentences, flattenAnchors, fmtDiaryDateStamp, fmtDiaryMeta, normalizeDiaryMood, splitDiaryHead } from './diaryMath';

describe('diarySentences 分句编号', () => {
  it('按段分句：p1s1… 编号与段落对应（空行跳过不占号）', () => {
    const sents = diarySentences('今天吃了火锅。很辣！\n\n晚上看了月亮。');
    expect(sents.map((s) => s.id)).toEqual(['p1s1', 'p1s2', 'p2s1']);
    expect(sents[0].text).toBe('今天吃了火锅。');
    expect(sents[2].p).toBe(1);
  });

  it('空行不占段落号，空串返回空', () => {
    expect(diarySentences('')).toEqual([]);
    expect(diarySentences('\n\n')).toEqual([]);
  });

  it('同一内容切两次结果一致（prompt 与渲染同源）', () => {
    const content = '第一句。第二句！第三句……\n\n第四句；第五句。';
    expect(diarySentences(content)).toEqual(diarySentences(content));
  });
});

describe('diarySplitSentences 无 lookbehind 切句（旧 iOS 兼容）', () => {
  it('每个标点后切一刀，标点留在前一句；无标点整段', () => {
    expect(diarySplitSentences('今天很好。是的！')).toEqual(['今天很好。', '是的！']);
    expect(diarySplitSentences('没有标点的一段')).toEqual(['没有标点的一段']);
  });

  it('半角与省略号都按标点处理', () => {
    expect(diarySplitSentences('好？no!')).toEqual(['好？', 'no!']);
    expect(diarySplitSentences('他说……\n然后')).toEqual(['他说…', '…', '\n然后']);
  });

  it('空串返回空', () => {
    expect(diarySplitSentences('')).toEqual([]);
  });
});

describe('flattenAnchors 旁批扁平化', () => {
  it('命中句子带引用 + 标记 + 旁批文字；没命中的只留旁批文字', () => {
    const content = '今天吃了火锅。很辣！';
    const sents = diarySentences(content);
    const text = flattenAnchors(
      [
        { sentenceId: 'p1s1', mark: 'underline', noteBlock: [{ type: 'text', text: '我也想吃' }] },
        { sentenceId: 'p1s2', mark: 'circle', noteBlock: [{ type: 'strike', text: '谁让你点变态辣' }] },
        { sentenceId: 'p9s9', mark: 'strike', noteBlock: [{ type: 'text', text: '旧锚点' }] },
      ],
      sents,
    );
    expect(text).toContain('「今天吃了火锅。」（划线）：我也想吃');
    expect(text).toContain('「很辣！」（圈出）：谁让你点变态辣');
    expect(text).toContain('旧锚点'); // 对不上正文的锚点：只出旁批文字，不出引用
  });

  it('只有标记没有旁批：出引用不出冒号', () => {
    const sents = diarySentences('一句话。');
    const text = flattenAnchors([{ sentenceId: 'p1s1', mark: 'circle' }], sents);
    expect(text).toBe('「一句话。」（圈出）');
  });
});

describe('日期文案', () => {
  it('fmtDiaryMeta：今天 / 昨天 / N 天前', () => {
    const now = new Date(2026, 7, 24, 12); // 2026-08-24
    expect(fmtDiaryMeta('2026-08-24', now)).toBe('今天');
    expect(fmtDiaryMeta('2026-08-23', now)).toBe('昨天');
    expect(fmtDiaryMeta('2026-08-21', now)).toBe('3 天前');
  });

  it('fmtDiaryDateStamp：中文日期 + 星期', () => {
    expect(fmtDiaryDateStamp('2026-08-24')).toBe('2026年8月24日 · 星期一');
    expect(fmtDiaryDateStamp('2026-08-23')).toBe('2026年8月23日 · 星期日');
  });
});

// ── 二批（2026-08-24）：他的日记头部拆分 + 心情校验 ──

describe('splitDiaryHead 头部拆分', () => {
  it('≥3 行：第一行标题、第二行日期天气、其余正文', () => {
    const { title, meta, body } = splitDiaryHead('夜航日志\n2026年8月24日 晴\n今天很好。\n第二段。');
    expect(title).toBe('夜航日志');
    expect(meta).toBe('2026年8月24日 晴');
    expect(body).toBe('今天很好。\n第二段。');
  });

  it('少于 3 行：整段当正文（不误吞内容）', () => {
    const { title, meta, body } = splitDiaryHead('就两句。\n第二句。');
    expect(title).toBeUndefined();
    expect(meta).toBeUndefined();
    expect(body).toBe('就两句。\n第二句。');
  });

  it('空串：正文空串', () => {
    expect(splitDiaryHead('')).toEqual({ body: '' });
  });
});

describe('normalizeDiaryMood 心情校验', () => {
  it('合法值原样返回（含二批新增 flirt/ache）', () => {
    expect(normalizeDiaryMood('joy')).toBe('joy');
    expect(normalizeDiaryMood('night')).toBe('night');
    expect(normalizeDiaryMood('flirt')).toBe('flirt');
    expect(normalizeDiaryMood('ache')).toBe('ache');
  });

  it('非法值回退 calm', () => {
    expect(normalizeDiaryMood('happy')).toBe('calm');
    expect(normalizeDiaryMood(undefined)).toBe('calm');
    expect(normalizeDiaryMood(42)).toBe('calm');
  });
});

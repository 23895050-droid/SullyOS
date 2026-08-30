// 日记纯函数（2026-08-24）——分句编号 + 旁批扁平化
// 分句必须稳定：发给 AI 的句子编号与渲染定位用同一次切分（同一 content 再 split 结果一致），
// 编号格式 p段落s句（p1s1 / p2s3 …），与批注 prompt 里的 sentenceId 约定一致。
// 她编辑正文后旧锚点可能对不上：渲染端按 id 找句，找不到就跳过该锚点，不报错。
import type { SentenceAnchor } from '../apps/couple/diaryStore';

export interface DiarySentence {
  id: string;
  text: string;
  p: number; // 段落序号（0 起）
  s: number; // 段内句子序号（0 起）
}

/** 在句号/问号/叹号/省略号/分号之后切句（每个标点后切一刀，标点留在前一句）。
 *  不用正则后行断言（lookbehind 在旧 iOS Safari 直接炸，noLookbehind 守卫测试盯着）。
 *  逐字符扫描，行为与 split(/(?<=…)/) 完全一致。 */
export const diarySplitSentences = (s: string): string[] => {
  const PUNCTS = '。！？!?…；;';
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (PUNCTS.includes(s[i])) {
      out.push(s.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < s.length) out.push(s.slice(start));
  return out;
};

/** 按段落 → 句号/问号/叹号/省略号/分号 切句（切完 trim + 去空） */
export const diarySentences = (content: string): DiarySentence[] => {
  const out: DiarySentence[] = [];
  content.split(/\n+/).forEach((para, p) => {
    if (!para.trim()) return;
    diarySplitSentences(para)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((text, s) => {
        out.push({ id: `p${p + 1}s${s + 1}`, text, p, s });
      });
  });
  return out;
};

/** 供 prompt 的句子编号清单（只有 id + 原文，不让模型自己编位置） */
export const diarySentenceIndex = (content: string): Array<{ id: string; text: string }> =>
  diarySentences(content).map(({ id, text }) => ({ id, text }));

/** 旁批扁平成纯文本（存 review.content / 转发 / AI 读） */
export const flattenAnchors = (anchors: SentenceAnchor[], sentences: DiarySentence[]): string =>
  anchors
    .map((a) => {
      const s = sentences.find((x) => x.id === a.sentenceId);
      const mark = a.mark === 'underline' ? '划线' : a.mark === 'strike' ? '划掉' : a.mark === 'circle' ? '圈出' : '';
      const note = (a.noteBlock ?? []).map((g) => g.text).join('');
      if (!s) return note || '';
      const prefix = s ? `「${s.text}」${mark ? `（${mark}）` : ''}` : '';
      return note ? `${prefix}：${note}` : prefix;
    })
    .filter(Boolean)
    .join('\n');

/** 往期相对天数文案（今天 / 昨天 / N 天前） */
export const fmtDiaryMeta = (date: string, now: Date): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (days === 0) return '今天';
  if (days === -1) return '昨天';
  if (days < 0) return `${-days} 天前`;
  return `${days} 天后`;
};

/** 他的日记头部拆分：第一行标题、第二行日期天气、其余正文（AI 按 prompt 输出；少于 3 行整段当正文）。
 *  自批注的 sentenceId 只对 body 编号（正文从 p1s1 重新开始），prompt 与渲染共用这一份拆分。 */
export const splitDiaryHead = (content: string): { title?: string; meta?: string; body: string } => {
  const lines = content.split(/\n+/).filter((l) => l.trim());
  if (lines.length >= 3) return { title: lines[0], meta: lines[1], body: lines.slice(2).join('\n') };
  return { body: lines.join('\n') };
};

/** 心情基调 → 信纸配色（他的日记由 AI 输出 mood，她手动写的自己选） */
export const DIARY_MOODS = ['joy', 'calm', 'soft', 'flirt', 'ache', 'sad', 'angry', 'night'] as const;
export type DiaryMood = (typeof DIARY_MOODS)[number];

export const MOOD_LABELS: Record<DiaryMood, string> = {
  joy: '晴朗',
  calm: '平静',
  soft: '温柔',
  flirt: '调情',
  ache: '拉扯',
  sad: '低气压',
  angry: '上头',
  night: '深夜',
};

export const normalizeDiaryMood = (v: unknown): DiaryMood =>
  (DIARY_MOODS as readonly string[]).includes(v as string) ? (v as DiaryMood) : 'calm';

/** 日记可选语言（语言爱好者 1-3 种混用） */
export const DIARY_LANGS = ['简体中文', '英语', '日语', '韩语', '法语', '德语', '西班牙语', '意大利语', '俄语', '繁体中文'];

/** 日记页日期戳文案（如 2026年8月24日 · 星期日） */
export const fmtDiaryDateStamp = (date: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const week = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][d.getDay()];
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日 · ${week}`;
};

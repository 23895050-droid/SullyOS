// 留言板 AI 调用（2026-08-25）：批阅今天（读日常页全量信息写留言，可选配图）+ 留言照片留档进相册
// API 槽：复用日记槽（diaryStore.api，未配回退主 API）——与写日记/批注同一个人格，内外统一
// 上下文与聊天同一套：核心人设 + 挂载世界书（排除日记块）+ 最近 50 条聊天 + 日常全量信息
// 配图：模型输出 image{prompt, why} 意图后，由调用方用相机生图 API 生成（生图未配置就不画——模型独立性）
// 留档：提示词生成模型多模态识图写「时间/语境/画面」三点摘要 → addArchiveSafe 进相册；未配 promptGen 用模板兜底
import type { CharacterProfile, UserProfile } from '../../types';
import { getPrompt } from '../../utils/promptRegistry';
import { getDiaryStore, type DiaryApiConfig } from './diaryStore';
import { buildDiaryContext, postDiaryChat, resolveDiaryApi } from './diaryApi';
import { getPeriodStore } from './periodStore';
import { getTodoStore } from './todoStore';
import { getAnnivStore } from './annivStore';
import { getDietStore } from './dietStore';
import { diaryOn } from './diaryStore';
import { activitiesOn, ACTIVITY_KIND_LABELS } from './activityStore';
import { buildBoardDayInfo } from '../../utils/boardContent';
import type { MountPeriodEvent } from '../../utils/noxhomeMount';
import { fmtDiaryDateStamp } from '../../utils/diaryMath';
import { getLocalDateKey } from '../../utils/localDate';
import { DB } from '../../utils/db';
import { safeResponseJson, extractJson } from '../../utils/safeApi';
import { loadImageGenSettings } from '../../utils/imageGenStorage';
import { addArchiveSafe, downscaleImage } from '../../utils/archive';

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

/** 模型没按 JSON 写（直接写了散文）：剥掉可能的代码块外壳，当纯文本兜底 */
const salvageText = (text: string): string => text.replace(/```json/gi, '').replace(/```/g, '').trim();

const timeOf = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** 组装某天的日常全量信息（生理期/纪念日/待办/饮食/记账/活动/日记七段）——批阅与留档提示词共用 */
export async function gatherBoardDayInfo(dateKey: string): Promise<string> {
  const period = getPeriodStore();
  const todos = getTodoStore();
  const anniv = getAnnivStore();
  const diet = getDietStore();
  const diary = getDiaryStore();
  const txs = (await DB.getAllTransactions()).filter((t) => t.dateStr === dateKey);
  const acts = activitiesOn(dateKey).map((a) => ({
    label: ACTIVITY_KIND_LABELS[a.kind],
    text: a.text,
    time: timeOf(a.createdAt),
  }));
  return buildBoardDayInfo({
    dateKey,
    todos: todos.todos.map((t) => ({ text: t.text, kind: t.kind, date: t.date, doneDates: t.doneDates, done: t.done })),
    periodEvents: period.events.filter((e) => e.date === dateKey) as MountPeriodEvent[],
    medReminders: period.medReminders.filter((r) => r.date === dateKey).map((r) => ({ date: r.date, text: r.text, done: r.done })),
    dietRecords: diet.records.filter((r) => r.date === dateKey),
    bankTx: txs.map((t) => ({ amount: t.amount, category: t.category, note: t.note })),
    activities: acts,
    annivItems: anniv.items.map((i) => ({ title: i.title, date: i.date, emoji: i.emoji, note: i.note })),
    hisDiary: diaryOn(diary.entries, dateKey, 'me'),
    herDiaryWritten: Boolean(diaryOn(diary.entries, dateKey, 'her')?.content.trim()),
  });
}

/** 批阅今天：读日常页全量信息，写今天的留言（可带配图意图；当天可重roll） */
export async function generateBoardMessage(opts: {
  char: CharacterProfile;
  user: UserProfile;
  mainApi?: Partial<DiaryApiConfig>;
  date?: string;
  rerollOf?: string; // 重roll：今天旧留言，要求换一版
}): Promise<{ content: string; image?: { prompt: string; why: string } }> {
  const api = resolveDiaryApi(getDiaryStore().api, opts.mainApi);
  if (!api) throw new Error('未配置日记 API');
  const dateKey = opts.date ?? getLocalDateKey();
  const { system, recent } = await buildDiaryContext(opts.char, opts.user);
  const dayInfo = await gatherBoardDayInfo(dateKey);
  const macros = (s: string) => s.replace(/\{\{user\}\}/g, opts.user.name).replace(/\{\{char\}\}/g, opts.char.name);

  const lines = [
    `今天是 ${dateKey}（${fmtDiaryDateStamp(dateKey)}）。你给这一天写留言。`,
    '',
    '她今天的日常记录（全量）：',
    macros(dayInfo),
  ];
  if (opts.rerollOf) {
    lines.push('', `这是你今天的旧留言：\n${opts.rerollOf.slice(0, 600)}\n\n重写一版，不要和刚才一样。`);
  }
  lines.push('', '最近对话记录（素材，不是抄写源）：', recent);

  const text = await postDiaryChat(api, {
    model: api.model,
    messages: [
      { role: 'system', content: `${macros(getPrompt('批阅今天'))}\n\n${system}` },
      { role: 'user', content: lines.join('\n') },
    ],
    temperature: 0.85,
    max_tokens: 16000,
  });

  const parsed = extractJson(text);
  if (!parsed || typeof parsed.content !== 'string' || !parsed.content.trim()) {
    return { content: salvageText(text) };
  }
  const img = parsed.image && typeof parsed.image === 'object' ? (parsed.image as Record<string, unknown>) : null;
  const prompt = str(img?.prompt).trim();
  const why = str(img?.why).trim();
  return {
    content: String(parsed.content).trim(),
    image: prompt ? { prompt, why } : undefined,
  };
}

/** 留言照片留档进相册：三点摘要（时间与语境 / 为什么贴 / 照片什么样）→ 缩略图压缩 → addArchiveSafe */
export async function archiveBoardImage(opts: {
  char: CharacterProfile;
  user: UserProfile;
  date: string;
  prompt: string;       // 生图提示词（画面参照）
  why: string;          // 为什么贴这张照片
  imageDataUrl: string; // 原图
}): Promise<{ summary: string; archiveId: string }> {
  const genSettings = loadImageGenSettings();
  const key = genSettings.promptGenApiKey;
  const url = genSettings.promptGenBaseUrl;
  const model = genSettings.promptGenModel;
  const dateLabel = fmtDiaryDateStamp(opts.date);
  const fallback = `${dateLabel}，${opts.char.name}因为${opts.why || '想到了点什么'}贴了这张照片。画面：${opts.prompt.slice(0, 80)}。`;

  let summary = fallback;
  if (key && url && model) {
    try {
      const dayInfo = await gatherBoardDayInfo(opts.date);
      const systemPrompt = getPrompt('批阅图片留档')
        .replace(/\{\{char\}\}/g, opts.char.name)
        .replace(/\{\{user\}\}/g, opts.user.name)
        .replace(/\{\{date\}\}/g, dateLabel)
        .replace(/\{\{why\}\}/g, opts.why || '（没有特别的原因）');
      const res = await fetch(url.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: `当天日常（语境参考）：\n${dayInfo.slice(0, 3000)}` },
                { type: 'text', text: '照片就是这张：' },
                { type: 'image_url', image_url: { url: opts.imageDataUrl } },
              ],
            },
          ],
          // 推理模型的 thinking 会吃掉 max_tokens，给足额度防止正文截断
          max_tokens: 4000,
        }),
      });
      const data = await safeResponseJson(res);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const s = str(data?.choices?.[0]?.message?.content);
      if (s.trim()) summary = s.trim();
    } catch {
      // 识图失败用模板兜底，不阻塞留档
    }
  }

  const archiveId = `ma_${Date.now()}`;
  const ok = await addArchiveSafe({
    id: archiveId,
    thumbnail: await downscaleImage(opts.imageDataUrl, 320),
    charId: opts.char.id,
    charName: opts.char.name,
    summary,
    description: opts.prompt,
    prefixPrompt: '',
    presetName: '',
    refMode: 'none',
    tags: ['留言', '日常'],
    favorite: false,
    charAlbum: false,
    fromUser: false,
    kind: 'board',
    timestamp: Date.now(),
  });
  if (!ok) throw new Error('留档写入失败（存储配额不足）');
  return { summary, archiveId };
}

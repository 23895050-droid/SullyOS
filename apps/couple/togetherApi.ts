// 和 Ta AI 调用（2026-08-25）：生成 Nox 的感受（回忆/约定卡片）+ 卡片照片留档进相册
// API 槽：复用日记槽（diaryStore.api，未配回退主 API）；上下文与聊天同一套（buildDiaryContext）
// 感受 Prompt 强调：感受不是给对方听的，是对自己当下感受的坦诚记录（promptRegistry「回忆感受」可改）
// 留档：promptGen 多模态识图写「时间与事件/照片与事件的关系/照片什么样」三点摘要 → addArchiveSafe
//   charAlbum=true：留档照片同时进用户的和角色的相册（文档要求）；未配 promptGen 模板兜底
import type { CharacterProfile, UserProfile } from '../../types';
import { getPrompt } from '../../utils/promptRegistry';
import { getDiaryStore, type DiaryApiConfig } from './diaryStore';
import { buildDiaryContext, postDiaryChat, resolveDiaryApi } from './diaryApi';
import { safeResponseJson } from '../../utils/safeApi';
import { loadImageGenSettings } from '../../utils/imageGenStorage';
import { addArchiveSafe, downscaleImage } from '../../utils/archive';

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

/** 生成 Nox 对一张卡片的真实感受（坦诚自记，不是给她看的话）；重roll = 再调一次覆盖 */
export async function generateTogetherFeeling(opts: {
  char: CharacterProfile;
  user: UserProfile;
  mainApi?: Partial<DiaryApiConfig>;
  cardText: string;   // 卡片内容（标题/类型/日期/上下文等，纯文本）
  rerollOf?: string;  // 重roll：旧感受，要求换一版
}): Promise<string> {
  const api = resolveDiaryApi(getDiaryStore().api, opts.mainApi);
  if (!api) throw new Error('未配置日记 API');
  const { system, recent } = await buildDiaryContext(opts.char, opts.user);
  const prompt = getPrompt('回忆感受')
    .replace(/\{\{char\}\}/g, opts.char.name)
    .replace(/\{\{user\}\}/g, opts.user.name);
  const lines = [
    `事件卡片：\n${opts.cardText}`,
  ];
  if (opts.rerollOf) {
    lines.push('', `你之前记的感受：\n${opts.rerollOf}\n\n重写一版，不要和刚才一样。`);
  }
  lines.push('', '最近对话记录（素材，不是抄写源）：', recent);

  const text = await postDiaryChat(api, {
    model: api.model,
    messages: [
      { role: 'system', content: `${prompt}\n\n${system}` },
      { role: 'user', content: lines.join('\n') },
    ],
    temperature: 0.85,
    max_tokens: 16000,
  });
  return text.replace(/```/g, '').trim();
}

/** 卡片照片留档进相册：三点摘要 → 缩略图压缩 → addArchiveSafe（charAlbum=true 同时进角色相册） */
export async function archiveTogetherPhoto(opts: {
  char: CharacterProfile;
  user: UserProfile;
  eventTitle: string;
  dateLabel: string;   // 中文日期文案（摘要里的时间锚点）
  note: string;        // 照片与事件的关系（可空，留给模型判断）
  imageDataUrl: string;
}): Promise<{ summary: string; archiveId: string }> {
  const genSettings = loadImageGenSettings();
  const key = genSettings.promptGenApiKey;
  const url = genSettings.promptGenBaseUrl;
  const model = genSettings.promptGenModel;
  const fallback = `${opts.dateLabel}，${opts.char.name}和${opts.user.name}的「${opts.eventTitle}」里的一张照片。画面：${opts.note || '记录这件事的瞬间'}`;

  let summary = fallback;
  if (key && url && model) {
    try {
      const systemPrompt = getPrompt('回忆照片留档')
        .replace(/\{\{char\}\}/g, opts.char.name)
        .replace(/\{\{user\}\}/g, opts.user.name)
        .replace(/\{\{date\}\}/g, opts.dateLabel)
        .replace(/\{\{note\}\}/g, opts.note || '（未标注，请根据画面和事件判断）');
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
                { type: 'text', text: `事件卡片：${opts.eventTitle}（${opts.dateLabel}）` },
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
    description: `${opts.eventTitle}（${opts.dateLabel}）`,
    prefixPrompt: '',
    presetName: '',
    refMode: 'none',
    tags: ['和Ta', '回忆'],
    favorite: false,
    charAlbum: true,   // 同时进用户的和角色的相册（文档要求）
    fromUser: false,
    kind: 'together',
    timestamp: Date.now(),
  });
  if (!ok) throw new Error('留档写入失败（存储配额不足）');
  return { summary, archiveId };
}

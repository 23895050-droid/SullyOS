// 情侣空间转发到 chat（2026-08-22，转发的第一次尝试）——复用相册 album_forward 管线：
// DB.saveMessage system 消息（AI 只读文本标记）+ metadata.forwardCard → MessageItem 渲染 couple_forward 卡片
// 日常页（当天日常/待办含完成情况二选一）· 活动页（分条）· 生理期（当天所有记录）· 纪念日（单条）
// 饮食（2026-08-23）：今日饮食整卡 / 食物库概况整卡 / 冰箱整卡 / 单食物详情卡（与挂载的全量卡不同——转发是这张卡的详细信息）
import { DB } from '../../utils/db';
import type { CharacterProfile } from '../../types';
import type { CookMethod, TakeoutRecord } from './dietStore';

export interface CoupleForwardCard {
  kind: string;        // 卡片角标，如「生理期」「待办」「纪念日」
  title: string;       // 卡片标题
  subtitle?: string;   // 副标题（如日期）
  body: string;        // 正文（纯文本，AI 只读）
}

/** 转发一条 couple 卡片到指定角色的聊天框；content 用 [类型：标题] 文本标记，AI 只读文本 */
export const forwardCoupleCard = async (target: CharacterProfile, card: CoupleForwardCard): Promise<void> => {
  await DB.saveMessage({
    charId: target.id,
    role: 'system',
    type: 'text',
    content: `[${card.kind}：${card.title}] ${card.body}`,
    metadata: { source: 'couple_forward', forwardCard: card },
  });
};

// ── 日记转发（2026-08-24）：批阅 + 原文打包成日记感卡片，与粉色 couple 卡分开的纸张样式 ──
// 这是他唯一读到她的日记的通道：挂载块只告诉他「她写了/没写」，内容只有通过这张卡进上下文

export interface DiaryForwardCard {
  kind: string;        // 「日记·批阅」/「日记·批注」
  title: string;
  subtitle?: string;   // 日期戳
  date: string;        // YYYY-MM-DD
  original: string;    // 日记原文
  review: string;      // 批阅 / 批注内容
}

export const forwardDiaryCard = async (target: CharacterProfile, card: DiaryForwardCard): Promise<void> => {
  const body = `日记（${card.date}）\n${card.original}\n\n批阅：\n${card.review}`;
  await DB.saveMessage({
    charId: target.id,
    role: 'system',
    type: 'text',
    content: `[${card.kind}：${card.title}] ${body}`,
    metadata: { source: 'diary_forward', forwardCard: card },
  });
};

/** 单食物转发所需字段（FoodFormModal 未保存的草稿也能转） */
export interface FoodDetailInput {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  eatenCount: number;
  lastEatenAt?: string;
  rating?: number;
  glycemic?: number;
  isHomeCooked?: boolean;
  isTakeout?: boolean;
  cookMethods?: CookMethod[];
  takeoutRecords?: TakeoutRecord[];
  price?: string;
  platform?: string;
}

// ── 和 Ta 转发（2026-08-25）：回忆 / 约定卡片。只有照片全部留档过（或没照片）的卡可以转发——
// 转发给角色时角色只能读到文字描述（照片描述/上下文/感受），全流程不读图。
// 卡片样式在 MessageItem 里（together_forward：回忆暖橙 / 约定淡蓝，与粉色 couple 卡区分）

export interface TogetherForwardCard {
  kind: string;        // 「回忆」/「约定」
  title: string;
  subtitle?: string;   // 日期 / 时限等
  body: string;        // 事件详情（纯文本，AI 只读）
  feelings?: string;   // 感受记录（勾选附上时才有）
  photosDesc?: string; // 照片文字描述（留档过的才有）
  color?: string;      // 事件类型主色（卡片左缘条）
}

export const forwardTogetherCard = async (target: CharacterProfile, card: TogetherForwardCard): Promise<void> => {
  const parts = [card.subtitle ? `（${card.subtitle}）` : '', card.body, card.photosDesc ? `照片：${card.photosDesc}` : '', card.feelings ? `感受记录：${card.feelings}` : ''].filter(Boolean);
  await DB.saveMessage({
    charId: target.id,
    role: 'system',
    type: 'text',
    content: `[${card.kind}：${card.title}] ${parts.join('\n')}`,
    metadata: { source: 'together_forward', forwardCard: card },
  });
};

/** 转发单个食物的详细单卡（评分/升糖/家常做法/外卖记录全带上） */
export const forwardFoodDetail = async (target: CharacterProfile, food: FoodDetailInput): Promise<void> => {
  const lines = [
    `${food.name}（每 100g：${food.kcal} 千卡，蛋白 ${food.protein}g，碳水 ${food.carbs}g，脂肪 ${food.fat}g）`,
    `吃过 ${food.eatenCount} 次${food.lastEatenAt ? `，最近一次 ${food.lastEatenAt.slice(0, 10)}` : ''}`,
  ];
  if (food.rating) lines.push(`评分：${food.rating}/5 星`);
  if (food.glycemic !== undefined) lines.push(`升糖值：${food.glycemic} mmol/L`);
  if (food.price || food.platform) lines.push(`常买：${[food.platform, food.price].filter(Boolean).join(' ')}`);
  if (food.isHomeCooked && food.cookMethods?.length) {
    lines.push('家常做法：');
    food.cookMethods.forEach((m, i) => {
      lines.push(`  ${i + 1}. ${m.description}${m.rating ? `（${m.rating}分）` : ''}${m.review ? `——${m.review}` : ''}`);
    });
  }
  if (food.isTakeout && food.takeoutRecords?.length) {
    lines.push('外卖记录：');
    food.takeoutRecords.forEach((t, i) => {
      const bits = [`${i + 1}. ${t.shop}`, t.price, t.rating ? `${t.rating}分` : '', t.eatenTimes ? `吃过 ${t.eatenTimes} 次` : '', t.review ? `——${t.review}` : ''].filter(Boolean);
      lines.push(`  ${bits.join(' ')}`);
    });
  }
  await forwardCoupleCard(target, { kind: '饮食·食物', title: food.name, body: lines.join('\n') });
};

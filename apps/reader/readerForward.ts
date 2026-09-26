// 读书模块 · 把一条笔记转进聊天框（2026-09-20，T4；09-26 深夜二按她的口径重写）
//
// 走的还是相册/情侣空间那条转发管线（`apps/couple/coupleForward.ts` 同款）：
// `DB.saveMessage` 落一条 system 消息，content 是那段文字标记
// ——**AI 读到的就是这一段**（书名、作者、正文、谁的批注、谁的回复、笔记形成的时间都在），
// metadata.forwardCard 给 MessageItem 渲染卡片：**表面只放书名 / 作者 / 一句原文 / 时间，
// 点开卡片才铺开批注和讨论**（她 09-26 的口径，照微信转发聊天记录那种思路）。
//
// 那段话怎么写、卡片长什么样，都在 `utils/reader/forwardText.ts`（纯函数、有单测），这儿只管落库。
//
// **进上下文的只有这张卡上的话**（原文那一句 + 批注 + 讨论），不是书里的全文——
// 书的正文永远不进他的上下文（spec 的可见性口径），转给他的是「你在这句话上说了什么」。

import { DB } from '../../utils/db';
import { forwardNoteText, type NoteForwardCard } from '../../utils/reader/forwardText';
import type { CharacterProfile } from '../../types';

export type { NoteForwardCard, NoteForwardLine } from '../../utils/reader/forwardText';

export const forwardNoteCard = async (target: CharacterProfile, card: NoteForwardCard): Promise<void> => {
    await DB.saveMessage({
        charId: target.id,
        role: 'system',
        type: 'text',
        content: forwardNoteText(card),
        metadata: { source: 'reader_forward', forwardCard: card },
    });
};

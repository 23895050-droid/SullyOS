// 读书模块 · 把一条笔记转进聊天框（2026-09-20，T4）
//
// 走的还是相册/情侣空间那条转发管线（`apps/couple/coupleForward.ts` 同款）：
// `DB.saveMessage` 落一条 system 消息，content 是 `[笔记：书名] …` 这样的文本标记
// （AI 只读文字），metadata.forwardCard 给 MessageItem 渲染卡片。
//
// **进上下文的只有这张卡上的话**（原文那一句 + 批注 + 讨论），不是书里的全文——
// 书的正文永远不进他的上下文（spec 的可见性口径），转给他的是「你在这句话上说了什么」。

import { DB } from '../../utils/db';
import type { CharacterProfile } from '../../types';

export interface NoteForwardCard {
    /** 角标（「笔记」/「批注」） */
    kind: string;
    /** 书名 */
    title: string;
    /** 第 N 章 · 谁留的 · 什么时候 */
    subtitle?: string;
    /** 原文那句 */
    quote: string;
    /** 批注（只划了线、没写批注的就空着） */
    note?: string;
    /** 讨论（一行一条，已经写成「谁：话」） */
    thread?: string[];
    /** 留笔记那个人的笔色（卡片左缘条和引号用它） */
    color?: string;
}

export const forwardNoteCard = async (target: CharacterProfile, card: NoteForwardCard): Promise<void> => {
    const parts = [
        `原文：${card.quote}`,
        card.note ? `批注：${card.note}` : '',
        card.thread?.length ? `讨论：\n${card.thread.join('\n')}` : '',
    ].filter(Boolean);
    await DB.saveMessage({
        charId: target.id,
        role: 'system',
        type: 'text',
        content: `[${card.kind}：${card.title}]${card.subtitle ? `（${card.subtitle}）` : ''}\n${parts.join('\n')}`,
        metadata: { source: 'reader_forward', forwardCard: card },
    });
};

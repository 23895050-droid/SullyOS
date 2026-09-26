// 读书模块 · 转出去的笔记写成「给 AI 读的那段话」（纯函数，有单测）
//
// 她 09-26 定的口径：**卡上表面信息少，给 AI 读的要是全量**——
// 书名、作者、正文、谁的批注、谁的回复、笔记形成的时间，一样不能少，而且要标清楚谁是谁。
// 卡片那边（`components/chat/MessageItem.tsx`）读的是同一个对象，所以两边永远对得上。

/** 讨论里的一条话：谁说的、说了什么、什么时候 */
export interface NoteForwardLine {
    who: string;
    text: string;
    at?: string;
}

export interface NoteForwardCard {
    /** 角标（「笔记」） */
    kind: string;
    /** 书名 */
    title: string;
    /** 书的作者 */
    author?: string;
    /** 第几章 */
    chapter?: string;
    /** 正文那一句 */
    quote: string;
    /** 批注（只划了线、没写批注的就空着） */
    note?: string;
    /** 批注是谁写的 */
    by?: string;
    /** 笔记是什么时候写的（卡头那行也用它） */
    at?: string;
    /** 讨论（谁、什么、什么时候） */
    thread?: NoteForwardLine[];
    /** 留笔记那个人的笔色（卡片左缘条和引号用它） */
    color?: string;
}

/** 讨论的一行写成一整句 */
export const forwardLineText = (l: NoteForwardLine): string =>
    `${l.who}${l.at ? `（${l.at}）` : ''}：${l.text}`;

/**
 * 一段话把这条笔记交代清楚：给谁转、转的什么书、谁在哪句话上说了什么、什么时候说的。
 * 角色只读这段文字（书里的全文不进他的上下文），所以他要知道的都在这里。
 */
export const forwardNoteText = (card: NoteForwardCard): string => {
    const head = `【笔记】《${card.title}》${card.author ? ` ${card.author}` : ''}`;
    const parts = [
        [card.chapter, card.at ? `笔记写在 ${card.at}` : ''].filter(Boolean).join(' · '),
        `正文：「${card.quote}」`,
        card.note
            ? `批注${card.by ? `（${card.by}${card.at ? `，${card.at}` : ''}）` : ''}：${card.note}`
            : '',
        card.thread?.length ? `讨论：\n${card.thread.map(forwardLineText).join('\n')}` : '',
    ].filter(Boolean);
    return [head, ...parts].join('\n');
};

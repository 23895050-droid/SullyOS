// 小助手上下文组装（2026-08-31 附件化 + 折叠占位）：纯函数，和渲染共用同一套拆块逻辑。
// - 折叠占位（学上游工作台交付文件）：历史消息里已折叠的代码块只给「文件名 + 字符数」占位，
//   不喂全文——小助手没有 compact，旧代码一直占上下文；需要哪个文件就由用户挂附件精确注入。
// - 文件附件：按「消息 id + 代码块序号」精确定位（和折叠状态同一套 key），不靠名字猜——
//   名字只是显示用，说不全/撞名都不影响命中。
import type { AssistantAttachment, AssistantMsg } from './beautyAssistantStore';

/** 把回复文本拆成 文本/代码块 片段（渲染端与上下文组装共用，编号永远同源） */
export const splitCodeBlocks = (text: string): Array<{ type: 'text' | 'code'; content: string }> => {
  const parts: Array<{ type: 'text' | 'code'; content: string }> = [];
  const re = /```([a-zA-Z+]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      const t = text.slice(last, m.index).trim();
      if (t) parts.push({ type: 'text', content: t });
    }
    if (m[2].trim()) parts.push({ type: 'code', content: m[2].trim() });
    last = re.lastIndex;
  }
  if (last < text.length) {
    const t = text.slice(last).trim();
    if (t) parts.push({ type: 'text', content: t });
  }
  return parts;
};

/** 代码块折叠后的文件名：最后一行 /* 改：xxx *\/ 注释里的 xxx（交付规矩已要求这行）；没有就 代码片段 N */
export const codeFileName = (content: string, ordinal: number): string => {
  const lines = content.split('\n');
  const last = lines[lines.length - 1] ?? '';
  const m = last.match(/\/\*\s*改\s*[:：]\s*(.+?)\s*\*\//);
  const raw = m ? m[1].trim() : '';
  const safe = raw.replace(/[\\/:*?"<>|]/g, '').trim();
  return (safe || `代码片段 ${ordinal + 1}`).slice(0, 30);
};

/** 历史 AI 消息 → API 内容：已折叠的代码块换成一行占位（文件名 + 字符数），没折叠的原样保留 */
export const foldFoldedCodeBlocks = (content: string, messageId: string, codeFold: Record<string, boolean>): string => {
  let codeIdx = 0;
  return splitCodeBlocks(content)
    .map((p) => {
      if (p.type === 'text') return p.content;
      const name = codeFileName(p.content, codeIdx);
      const folded = !!codeFold[`${messageId}:${codeIdx}`];
      codeIdx += 1;
      return folded
        ? `[交付文件 ${name}.txt 已折叠：${p.content.length} 字符，需要完整代码请用户点文件卡的「引用」挂成附件]`
        : `\`\`\`css\n${p.content}\n\`\`\``;
    })
    .join('\n\n');
};

type ApiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/** 文件附件 → 注入文本：找到原消息按序号取代码块；消息/代码块没了就占位说明（不悄悄塞错内容） */
const resolveFileAttachment = (a: Extract<AssistantAttachment, { kind: 'file' }>, allMessages: AssistantMsg[]): string => {
  const target = allMessages.find((x) => x.id === a.messageId);
  if (!target) return `[附件 ${a.name}.txt：原消息已删除，内容不可用]`;
  const code = splitCodeBlocks(target.content).filter((p) => p.type === 'code')[a.ordinal]?.content;
  if (!code) return `[附件 ${a.name}.txt：原代码块已不在，内容不可用]`;
  return `[附件：${a.name}.txt]\n\`\`\`css\n${code}\n\`\`\``;
};

/** 用户消息 → API content：纯文字返回原字符串（保持旧形态）；带附件时返回多 part——
 *  文字 + 图片附件(image_url) + 文件附件（完整代码注入，[附件：xxx.txt] 头） */
export const buildAssistantUserParts = (
  m: AssistantMsg,
  allMessages: AssistantMsg[],
): string | ApiContentPart[] => {
  const attachments = m.attachments ?? [];
  const images = attachments.filter((a) => a.kind === 'image');
  const files = attachments.filter((a) => a.kind === 'file');
  if (images.length === 0 && files.length === 0) return m.content;
  const parts: ApiContentPart[] = [];
  if (m.content) parts.push({ type: 'text', text: m.content });
  for (const a of images) parts.push({ type: 'image_url', image_url: { url: a.ref } });
  const fileText = files
    .map((a) => resolveFileAttachment(a as Extract<AssistantAttachment, { kind: 'file' }>, allMessages))
    .join('\n\n');
  if (fileText) parts.push({ type: 'text', text: fileText });
  return parts;
};

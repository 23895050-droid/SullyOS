// 小助手上下文组装（2026-08-31 附件化 + 折叠占位）单测：折叠只留文件名 / 文件附件精确注入 / 失效兜底。
import { describe, expect, it } from 'vitest';
import {
  splitCodeBlocks, codeFileName, foldFoldedCodeBlocks, buildAssistantUserParts,
} from './assistantContext';
import type { AssistantMsg } from './beautyAssistantStore';

const codeMsg = (id: string, content: string): AssistantMsg =>
  ({ id, role: 'assistant', content, at: '2026-08-31T00:00:00.000Z' });

describe('折叠占位', () => {
  it('折叠的代码块只剩文件名占位，没折叠的原样保留', () => {
    const content = '先看这段\n```css\n.a { color: red; }\n```\n再看这段\n```css\n.b { color: blue; }\n/* 改：气泡圆角 */\n```';
    const out = foldFoldedCodeBlocks(content, 'm1', { 'm1:1': true });
    expect(out).toContain('.a { color: red; }'); // 没折叠：全文保留
    expect(out).not.toContain('.b { color: blue; }'); // 折叠：正文不喂
    expect(out).toContain('[交付文件 气泡圆角.txt 已折叠');
  });

  it('纯文字消息原样返回；没有折叠记录时代码块全保留', () => {
    expect(foldFoldedCodeBlocks('没有代码', 'm1', {})).toBe('没有代码');
    const out = foldFoldedCodeBlocks('```css\n.x{}\n```', 'm1', {});
    expect(out).toContain('.x{}');
  });
});

describe('文件附件解析', () => {
  it('挂文件附件 → 注入完整代码，带 [附件：xxx.txt] 头', () => {
    const target = codeMsg('a1', '```css\n.x{color:red}\n/* 改：气泡 */\n```');
    const user: AssistantMsg = {
      id: 'u1', role: 'user', content: '改成蓝色',
      attachments: [{ kind: 'file', messageId: 'a1', ordinal: 0, name: '气泡' }],
      at: '2026-08-31T00:00:00.000Z',
    };
    const parts = buildAssistantUserParts(user, [target, user]) as Array<{ type: string; text?: string }>;
    expect(parts[0]).toEqual({ type: 'text', text: '改成蓝色' });
    const filePart = parts.find((p) => p.type === 'text' && p.text!.includes('[附件：气泡.txt]'))!;
    expect(filePart.text).toContain('.x{color:red}');
  });

  it('失效兜底：原消息删除 / 序号越界 → 占位说明，不悄悄塞错内容', () => {
    const target = codeMsg('a1', '```css\n.x{}\n```');
    const gone: AssistantMsg = {
      id: 'u1', role: 'user', content: '',
      attachments: [{ kind: 'file', messageId: 'gone', ordinal: 0, name: '旧文件' }],
      at: '2026-08-31T00:00:00.000Z',
    };
    const parts1 = buildAssistantUserParts(gone, [gone]) as Array<{ text?: string }>;
    expect(parts1.some((p) => p.text?.includes('原消息已删除'))).toBe(true);
    const outOfRange: AssistantMsg = {
      id: 'u2', role: 'user', content: '',
      attachments: [{ kind: 'file', messageId: 'a1', ordinal: 5, name: '越界' }],
      at: '2026-08-31T00:00:00.000Z',
    };
    const parts2 = buildAssistantUserParts(outOfRange, [target, outOfRange]) as Array<{ text?: string }>;
    expect(parts2.some((p) => p.text?.includes('已不在'))).toBe(true);
  });
});

describe('用户消息形态', () => {
  it('图片附件转 image_url；纯文字消息返回字符串（保持旧形态）', () => {
    const user: AssistantMsg = {
      id: 'u1', role: 'user', content: '看这张',
      attachments: [{ kind: 'image', ref: 'blobref:abc' }],
      at: '2026-08-31T00:00:00.000Z',
    };
    const parts = buildAssistantUserParts(user, [user]) as Array<{ type: string; image_url?: { url: string } }>;
    expect(parts.find((p) => p.type === 'image_url')?.image_url?.url).toBe('blobref:abc');
    const plain: AssistantMsg = { id: 'u2', role: 'user', content: '纯文字', at: '2026-08-31T00:00:00.000Z' };
    expect(buildAssistantUserParts(plain, [plain])).toBe('纯文字');
  });

  it('codeFileName：最后一行注释取名，非法字符清掉，没有就序号', () => {
    expect(codeFileName('.a{}', 0)).toBe('代码片段 1');
    expect(codeFileName('.a{}\n/* 改：气泡圆角 16px */', 1)).toBe('气泡圆角 16px');
    expect(codeFileName('.a{}\n/* 改：a/b:c */', 0)).toBe('abc');
  });

  it('splitCodeBlocks：文本与代码块交替拆出，空代码块跳过', () => {
    const parts = splitCodeBlocks('说一句\n```css\n.x{}\n```\n\n```\n\n```\n结尾');
    expect(parts).toEqual([
      { type: 'text', content: '说一句' },
      { type: 'code', content: '.x{}' },
      { type: 'text', content: '结尾' },
    ]);
  });
});

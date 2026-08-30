import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (relative: string): string => readFileSync(
    fileURLToPath(new URL(relative, import.meta.url)),
    'utf8',
).replace(/\r\n?/g, '\n');

describe('用户反馈回归保护', () => {
    // fork 注：以下三个用例依赖尚未搬运的上游改动，搬对应批次时补回——
    // ① DateSession Firefox 窄屏修复（fix-aug12 批）② StoryPresetMaker 采样参数说明（feature-batch）
    // ③ StaticCompanionPortrait/CompanionHome 静态 PNG 触摸反馈（feature-batch）
    it('剧情重试会在再次生成前先尝试归档，避免超长上下文把后置归档永久卡死', () => {
        const source = read('../components/date/story/StoryTheaterSession.tsx');
        const send = source.slice(source.indexOf('const send = useCallback'), source.indexOf('const archivedCount ='));
        const preflight = send.indexOf('const promptEntry = await archiveIfNeeded() || entry;');
        const completion = send.indexOf('const generated = await callCompletion');

        expect(preflight).toBeGreaterThanOrEqual(0);
        expect(completion).toBeGreaterThan(preflight);
        expect(send).toContain('mirrorArchived(message, promptEntry)');
        expect(send).toContain('promptEntry.archives.filter');
    });

    it('剧情预算里的预设只统计启用项，不把关闭的提示词算进总量', () => {
        const editor = read('../components/date/story/StoryTheaterEditor.tsx');

        expect(editor).toContain('document.prompts.filter(prompt => prompt.enabled).map(prompt => prompt.content)');
    });

    it('剧情预设导出复用原生分享链路，不依赖 Android WebView 的 a.download', () => {
        const storyTheater = read('./storyTheater.ts');

        expect(storyTheater).toContain("import { shareOrDownloadFile } from './shareExport'");
        expect(storyTheater).toContain('shareOrDownloadFile({');
        expect(storyTheater).not.toContain("anchor.download = `${preset.name");
    });

    // fork 注：clampClaudeTemperature 用例依赖 #579（call-story-worker-fixes 批），搬该批时补回

    it('聊天翻译支持按角色保存直接展开模式，并在气泡内同时渲染原文和译文', () => {
        const chat = read('../apps/Chat.tsx');
        const modals = read('../components/chat/ChatModals.tsx');
        const item = read('../components/chat/MessageItem.tsx');

        expect(chat).toContain('chat_translate_expanded_${activeCharacterId}');
        expect(modals).toContain('原文与译文同时展开');
        expect(item).toContain('showExpandedTranslation');
        expect(item).toContain('{renderContent(langBContent)}');
    });
});

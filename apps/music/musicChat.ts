// 聊歌框管道（2026-08-26 批 2）——独立会话（couple_music_v1.musicChatSessions，按 charId），
// 与主聊天 DB 完全分开：
// - 每满 50 条自动生成「聊歌总结卡」进主聊天（成功才推进 segCursor；失败/未配 API 留欠账，
//   音乐设置页「补生成」按 messages.length > segCursor 补）
// - 与主聊天同一套上下文：buildSystemPromptParts（人设/世界书挂载/音乐氛围/歌词全量+窗口，
//   全走调音台）+ 世界书位置 4 条目按 depth 深度插入（同主聊天）
// - 场景规则 = promptRegistry「music-聊歌场景」（剧情式一起听，歌是此刻主题）
// - 聊歌走主 API（全局 apiConfig）；分段总结走独立音乐槽（utils/musicSummary）
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOS } from '../../context/OSContext';
import { loadMusicHooks, loadMusicPlaybackSnapshot } from '../../context/MusicContext';
import { ChatPrompts } from '../../utils/chatPrompts';
import { ChatParser } from '../../utils/chatParser';
import { buildUserListeningContext } from '../../utils/musicContextBlock';
import { getPrompt } from '../../utils/promptRegistry';
import {
  appendMusicChatMessages,
  clearMusicChatSession,
  deleteMusicChatMessage,
  editMusicChatMessage,
  getMusicStore,
  musicChatSessionOf,
  setMusicChatSaved,
  setMusicChatSegCursor,
} from '../couple/musicStore';
import type { MusicChatMessage } from '../couple/musicStore';
import { generateMusicChatSummary } from '../../utils/musicSummary';
import { injectWorldbookDepthEntries, resolveWorldbookEntries } from '../../utils/worldbook';
import { mergedMountedWorldbooks } from '../../utils/noxhomeMount';

export const MUSIC_CHAT_SEG = 50;

export interface MusicChatRuntime {
  messages: MusicChatMessage[];
  streaming: string;
  busy: boolean;
  /** 提示行（总结欠账等） */
  note: string;
  /** 只把消息存进会话，不调 AI——回复要等她点触发按钮（2026-08-30 她定：不做发消息立刻有回复） */
  queue: (text: string) => void;
  /** 触发按钮：就当前会话生成一条回复 */
  trigger: () => void;
  /** 长按编辑 / 删除（2026-08-30） */
  editMessage: (id: string, content: string) => void;
  deleteMessage: (id: string) => void;
  /** save=true 保留会话回来接着聊；false 清空 */
  endSession: (save: boolean) => Promise<void>;
  clearNote: () => void;
}

export const useMusicChat = (charId: string): MusicChatRuntime => {
  const { characters, userProfile, groups, apiConfig, addToast } = useOS();
  const char = characters.find((c) => c.id === charId);
  const [messages, setMessages] = useState<MusicChatMessage[]>([]);
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const messagesRef = useRef<MusicChatMessage[]>([]);
  const busyRef = useRef(false);
  const segmentingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const session = musicChatSessionOf(charId);
    const msgs = session?.messages ?? [];
    messagesRef.current = msgs;
    setMessages(msgs);
    setNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charId]);

  /** 每满 50 条一段：逐段生成总结卡（并发守卫，防止两条回复同时触发重复发卡） */
  const settleSegments = useCallback(async (msgs: MusicChatMessage[]) => {
    if (segmentingRef.current) return;
    segmentingRef.current = true;
    try {
      const cur = musicChatSessionOf(charId)?.segCursor ?? 0;
      let cursor = cur;
      while (cursor + MUSIC_CHAT_SEG <= msgs.length) {
        const res = await generateMusicChatSummary(charId, msgs.slice(cursor, cursor + MUSIC_CHAT_SEG), cursor, cursor + MUSIC_CHAT_SEG);
        if (res.status === 'generated') {
          cursor += MUSIC_CHAT_SEG;
        } else {
          if (res.status === 'pending') setNote('总结 API 未配置：这一段先欠着，配好后到音乐设置页「补生成」。');
          break;
        }
      }
      if (cursor !== cur) setMusicChatSegCursor(charId, cursor);
    } finally {
      segmentingRef.current = false;
    }
  }, [charId]);

  /** 只存消息，不调 AI（2026-08-30 她定：聊歌不做「发消息立刻有回复」，回复要点按钮触发） */
  const queue = useCallback((text: string) => {
    const input = (text || '').trim();
    if (!input || busyRef.current || !char) return;
    const userMsg: MusicChatMessage = { id: `mc-${Date.now()}-u`, role: 'user', content: input, at: new Date().toISOString() };
    const next = [...messagesRef.current, userMsg];
    messagesRef.current = next;
    setMessages(next);
    appendMusicChatMessages(charId, [userMsg]);
  }, [charId, char]);

  /** 触发按钮：就当前会话生成一条回复 */
  const trigger = useCallback(() => {
    if (busyRef.current || !char) return;
    if (!apiConfig.baseUrl || !apiConfig.apiKey || !apiConfig.model) {
      addToast('请先在设置中配置聊天 API', 'error');
      return;
    }
    if (messagesRef.current.length === 0) {
      addToast('先发一句再喊 Ta 吧', 'info');
      return;
    }
    const last = messagesRef.current[messagesRef.current.length - 1];
    if (last.role === 'assistant') {
      addToast('Ta 已经回过了，再说点什么吧', 'info');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setStreaming('');

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    void (async () => {
      try {
        const snap = loadMusicPlaybackSnapshot();
        const userListeningContext = snap ? buildUserListeningContext(snap, getMusicStore().lyricInject) : null;
        const isListeningTogether = !!snap && snap.listeningTogetherWith.includes(charId);

        // 与主聊天同一套三段式 system prompt；当前消息窗 = 聊歌会话本身（世界书关键词也扫它）
        const chatMsgs = messagesRef.current.map((m, i) => ({
          id: i,
          charId,
          role: m.role as 'user' | 'assistant' | 'system',
          type: 'text' as const,
          content: m.content,
          timestamp: Date.parse(m.at),
        }));
        const parts = await ChatPrompts.buildSystemPromptParts(
          char, userProfile, groups, [], [], chatMsgs,
          undefined, undefined, userListeningContext, isListeningTogether, snap?.cfg,
          undefined, undefined,
        );

        const apiMessages = messagesRef.current.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
        const resolved = resolveWorldbookEntries(mergedMountedWorldbooks(char), apiMessages, char.name, userProfile?.name || '你');
        const withDepth = injectWorldbookDepthEntries(
          apiMessages,
          [
            ...resolved.filter((e) => e.position === 4),
            ...(parts.lyricWindow
              ? [{ content: parts.lyricWindow.content, book: { depth: parts.lyricWindow.depth, role: 0 } }]
              : []),
          ],
        );

        // 场景规则拼在钢印之前（钢印永远是模型开口前读到的最后内容）
        const sceneRule = getPrompt('music-聊歌场景')
          .replace(/\{\{\s*char\s*\}\}/gi, char.name)
          .replace(/\{\{\s*user\s*\}\}/gi, userProfile?.name || '你');

        const fullMessages = [
          { role: 'system', content: parts.stable },
          ...(parts.afterChar ? [{ role: 'system', content: parts.afterChar }] : []),
          ...withDepth,
          { role: 'system', content: `${parts.volatileState}\n\n${sceneRule}\n\n${parts.recencyTail}` },
        ];

        const baseUrl = String(apiConfig.baseUrl).replace(/\/+$/, '');
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiConfig.apiKey}` },
          // 推理模型防截断（她的 API 按次计费，额度给够——同日记/留言板策略）
          body: JSON.stringify({ model: apiConfig.model, messages: fullMessages, max_tokens: 8000, stream: true }),
          signal: abort.signal,
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error((errData as any).error?.message || `HTTP ${res.status}`);
        }
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                setStreaming(fullContent);
              }
            } catch { /* 忽略坏行 */ }
          }
        }

        // 音乐动作标签走同一套状态机（add 收歌 / invite / accept / exit）
        const cleaned = await ChatParser.parseAndExecuteActions(
          fullContent, charId, char.name, addToast, loadMusicHooks() ?? undefined,
        );

        const assistantMsg: MusicChatMessage = {
          id: `mc-${Date.now()}-a`,
          role: 'assistant',
          content: cleaned.trim(),
          at: new Date().toISOString(),
        };
        const next = [...messagesRef.current, assistantMsg];
        messagesRef.current = next;
        setMessages(next);
        appendMusicChatMessages(charId, [assistantMsg]);
        void settleSegments(next);
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          addToast(`聊歌失败：${e?.message || '网络错误'}`, 'error');
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
        setStreaming('');
      }
    })();
  }, [charId, char, userProfile, groups, apiConfig, addToast, settleSegments]);

  /** 退出：没总结的尾巴生成小结卡（新段落接在旧卡下）；save=false 清空会话 */
  const endSession = useCallback(async (save: boolean) => {
    const msgs = messagesRef.current;
    const cur = musicChatSessionOf(charId)?.segCursor ?? 0;
    if (msgs.length > cur) {
      const res = await generateMusicChatSummary(charId, msgs.slice(cur), cur, msgs.length);
      if (res.status === 'pending') setNote('总结 API 未配置：这段先欠着，配好后到音乐设置页「补生成」。');
    }
    setMusicChatSaved(charId, save);
    if (!save) {
      clearMusicChatSession(charId);
      messagesRef.current = [];
      setMessages([]);
    }
  }, [charId]);

  const clearNote = useCallback(() => setNote(''), []);

  /** 长按编辑（2026-08-30）：改 store + 本地状态同帧更新 */
  const editMessage = useCallback((id: string, content: string) => {
    const text = (content || '').trim();
    if (!text) return;
    editMusicChatMessage(charId, id, text);
    const next = messagesRef.current.map((m) => (m.id === id ? { ...m, content: text } : m));
    messagesRef.current = next;
    setMessages(next);
  }, [charId]);

  const deleteMessage = useCallback((id: string) => {
    deleteMusicChatMessage(charId, id);
    const next = messagesRef.current.filter((m) => m.id !== id);
    messagesRef.current = next;
    setMessages(next);
  }, [charId]);

  return { messages, streaming, busy, note, queue, trigger, editMessage, deleteMessage, endSession, clearNote };
};

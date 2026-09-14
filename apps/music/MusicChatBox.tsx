// 聊歌框（2026-08-26 批 2；2026-08-30 三轮改版）：
// - 剧情式一起听——歌是此刻主题，氛围浓郁
// - 气泡按 ChatParser.chunkText 与主聊天同一套规则切分；<语音>/<字幕> 块渲染成语音条
// - 发消息只存会话，点右侧四角星按钮才生成回复（不做发消息立刻有回复）
// - 消息长按：复制 / 修改（自己的消息）/ 删除
// - 退出一起听 = 退出聊歌（music-together-exited 事件自动收尾退回），不再有单独结束按钮
// - 夜色预设下底部出现「听歌 | 聊歌」胶囊切换台
import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, PaperPlaneTilt, Sparkle as SparkleIcon, MusicNotes,
  SpeakerHigh, Copy, PencilSimple, Trash, X, CaretRight,
} from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { useMusic, toHttps } from '../../context/MusicContext';
import { ChatParser } from '../../utils/chatParser';
import { splitMusicChatSegments } from '../../utils/musicVoiceBlock';
import { C, Sparkle, NightTogetherStrip } from './MusicUI';
import { useMusicChat } from './musicChat';
import { useMusicStore } from '../couple/musicStore';
import { useBlobRefUrl } from '../../utils/blobRef';
import type { MusicChatMessage } from '../couple/musicStore';

const SCENE_RULE_COPY = '剧情式一起听：这首歌就是你们此刻的主题，像并肩戴一副耳机。每条回复 2-5 个短气泡；切歌时跟着新歌走。';

// 长按（touchstart 500ms + PC 右键），对标主聊天操作面板的触发方式
const useLongPress = (onLong: () => void) => {
  const timer = useRef<number | null>(null);
  const clear = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => clear, []);
  return {
    onTouchStart: () => { timer.current = window.setTimeout(onLong, 500); },
    onTouchEnd: clear,
    onTouchMove: clear,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); onLong(); },
  };
};

/* ── 语音条（参考主聊天语音消息的视觉：波形 + 转文字；聊歌无 TTS，只有文字态） ── */
const VoiceBar: React.FC<{ text: string; subtitle?: string }> = ({ text, subtitle }) => {
  const [open, setOpen] = useState(false);
  const bars = [4, 10, 6, 14, 8, 12, 5, 11, 7, 13, 4, 9, 6, 11, 5, 8, 10, 7, 12, 6];
  return (
    <div className="mz-chat-voice max-w-[76%]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 px-3 py-2 rounded-2xl transition-all active:scale-[0.97] select-none w-full text-left"
        style={{
          background: 'linear-gradient(135deg, rgba(var(--mz-sakura-rgb, 244,194,207), 0.35), rgba(var(--mz-lavender-rgb, 207,195,232), 0.35))',
          border: '1px solid rgba(var(--mz-lavender-rgb, 207,195,232), 0.45)',
          borderTopLeftRadius: 6,
        }}
      >
        <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: C.surface, color: C.primary }}>
          <SpeakerHigh size={12} weight="fill" />
        </div>
        <div className="flex-1 flex items-center gap-[3px] h-5 overflow-hidden">
          {bars.map((h, i) => (
            <div key={i} className="w-[2.5px] rounded-full"
              style={{ height: `${Math.max(2, h * 0.45)}px`, background: `rgba(var(--mz-primary-rgb, 128,124,157), ${0.3 + (h / 14) * 0.4})` }} />
          ))}
        </div>
        <span className="shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-lg" style={{ color: C.primary, background: C.glass }}>
          {open ? '收起' : '转文字'}
        </span>
      </button>
      {open && (
        <div className="mt-1 px-3 py-2 rounded-2xl text-[11px] leading-relaxed whitespace-pre-wrap mz-chat-voice-text"
          style={{ background: C.surface, color: C.text, borderTopLeftRadius: 6 }}>
          {text || subtitle}
          {subtitle && text && (
            <div className="mt-1 pt-1 text-[10px]" style={{ color: C.muted, borderTop: '1px dashed rgba(var(--mz-muted-rgb, 124,119,154), 0.3)' }}>
              {subtitle}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ── 气泡旁头像（2026-08-30 设置开关）：blobRef/http/data: 全兼容 ── */
const ChatAvatar: React.FC<{ avatar?: string; name: string }> = ({ avatar, name }) => {
  const url = useBlobRefUrl(avatar);
  if (url) {
    return <img src={url} alt="" className="mz-chat-avatar w-7 h-7 rounded-full object-cover shrink-0" />;
  }
  return (
    <div className="mz-chat-avatar w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white font-semibold"
      style={{ background: `linear-gradient(135deg, ${C.sakura}, ${C.lavender})`, fontSize: 11 }}>
      {name.slice(0, 1)}
    </div>
  );
};

/* ── 单条消息（含所有气泡）：抽子组件才能用 hook（Rules of Hooks） ── */
const ChatBubbleRow: React.FC<{
  m: MusicChatMessage;
  charId: string;
  showAvatar: boolean;
  userAvatar?: string;
  charAvatar?: string;
  userName: string;
  charName: string;
  onEdit: (m: MusicChatMessage) => void;
  onDelete: (m: MusicChatMessage) => void;
  onCopy: (text: string) => void;
}> = ({ m, charId, showAvatar, userAvatar, charAvatar, userName, charName, onEdit, onDelete, onCopy }) => {
  const isUser = m.role === 'user';
  const lp = useLongPress(() => {
    // 长按弹出操作面板（事件总线传给外层挂面板）
    window.dispatchEvent(new CustomEvent('mc-message-menu', { detail: m }));
  });

  const bubbleStyle = (user: boolean): React.CSSProperties =>
    user
      ? { background: `linear-gradient(135deg, ${C.sakura}, ${C.lavender})`, borderTopRightRadius: 6, boxShadow: `0 2px 10px rgba(var(--mz-sakura-rgb, 244,194,207), 0.28)` }
      : { background: C.surface, color: C.text, borderTopLeftRadius: 6 };

  const textBubble = (content: string, key: string) => (
    <div key={key} className={`mz-chat-bubble ${isUser ? 'mz-chat-bubble-user' : 'mz-chat-bubble-ai'} max-w-[76%] rounded-2xl px-3 py-2 whitespace-pre-wrap text-[12px] leading-relaxed`}
      style={bubbleStyle(isUser)}
      {...lp}
    >
      {content}
    </div>
  );

  const avatarEl = showAvatar ? (
    isUser ? <ChatAvatar avatar={userAvatar} name={userName} /> : <ChatAvatar avatar={charAvatar} name={charName} />
  ) : null;

  // AI 回复：语音块 → 语音条；文本 → chunkText 同主聊天切气泡
  if (!isUser) {
    const segs = splitMusicChatSegments(m.content);
    return (
      <div key={m.id} className="flex items-start gap-2">
        {avatarEl}
        <div className="flex-1 min-w-0 flex flex-col items-start gap-1.5">
          {segs.map((seg, i) =>
            seg.type === 'voice' ? (
              <div key={`${m.id}-v${i}`} {...lp}>
                <VoiceBar text={seg.text} subtitle={seg.subtitle} />
              </div>
            ) : (
              ChatParser.chunkText(seg.content).map((chunk, j) => textBubble(chunk, `${m.id}-t${i}-${j}`))
            ),
          )}
        </div>
      </div>
    );
  }
  return (
    <div key={m.id} className="flex items-start gap-2 justify-end">
      <div className="flex-1 min-w-0 flex flex-col items-end gap-1.5">
        {ChatParser.chunkText(m.content).map((chunk, j) => textBubble(chunk, `${m.id}-u${j}`))}
      </div>
      {avatarEl}
    </div>
  );
};

const MusicChatBox: React.FC<{ charId: string; onBack: () => void }> = ({ charId, onBack }) => {
  const { characters, userProfile, addToast } = useOS();
  const { current, lyric, activeLyricIdx, plainLyric, playing, listeningTogetherWith, endListeningTogether } = useMusic();
  const chat = useMusicChat(charId);
  const [input, setInput] = useState('');
  const [showPanel, setShowPanel] = useState(false);
  const [menuMsg, setMenuMsg] = useState<MusicChatMessage | null>(null);
  const [editMsg, setEditMsg] = useState<MusicChatMessage | null>(null);
  const [editText, setEditText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const panelLyricRef = useRef<HTMLDivElement>(null);
  const char = characters.find((c) => c.id === charId);
  const userName = userProfile?.name || '你';
  const musicStore = useMusicStore();
  const chatBgUrl = useBlobRefUrl(musicStore.chatBgImage);
  // 反馈1 A2：当前歌封面渲染前归一（blobRef 令牌 + http→https）
  const currentCoverUrl = useBlobRefUrl(toHttps(current?.albumPic));
  const night = musicStore.cssPreset === 'night';
  const togetherNow = listeningTogetherWith.includes(charId);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages.length, chat.streaming]);

  // 上下文面板：当前行滚进视野
  useEffect(() => {
    if (!showPanel) return;
    const el = panelLyricRef.current?.querySelector<HTMLDivElement>(`[data-mc-lyric-idx="${activeLyricIdx}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [showPanel, activeLyricIdx]);

  // 长按菜单（跨组件传递用事件总线）
  useEffect(() => {
    const onMenu = (e: Event) => {
      const m = (e as CustomEvent<MusicChatMessage>).detail;
      if (m) setMenuMsg(m);
    };
    window.addEventListener('mc-message-menu', onMenu);
    return () => window.removeEventListener('mc-message-menu', onMenu);
  }, []);

  const send = () => {
    const t = input.trim();
    if (!t || chat.busy) return;
    setInput('');
    chat.queue(t);
  };

  // 退出一起听 = 退出聊歌（2026-08-30 她定：听歌结束一起聊天不单独做了）。
  // endListeningTogether 广播被退出的伙伴名单，命中当前聊歌对象就收尾并退回播放页。
  useEffect(() => {
    const onExited = (e: Event) => {
      const ids = (e as CustomEvent<string[]>).detail ?? [];
      if (ids.includes(charId)) {
        void chat.endSession(true).then(onBack);
      }
    };
    window.addEventListener('music-together-exited', onExited);
    return () => window.removeEventListener('music-together-exited', onExited);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charId]);

  const playlistTop = (char?.musicProfile?.playlists ?? []).flatMap((p) => p.songs).slice(0, 30);

  const copyText = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      addToast('已复制', 'info');
    } catch {
      addToast('复制失败', 'error');
    }
  };

  return (
    <div className="mz-chat absolute inset-0 flex flex-col"
      style={{ background: `linear-gradient(180deg, #ffffff 0%, ${C.bg} 55%, ${C.bgDeep} 100%)` }}>
      {/* 背景自设层（2026-08-30）：图铺满 + 底色按图透/不透明度叠加；没设图只盖底色 */}
      {(chatBgUrl || musicStore.chatBgColor) && (
        <div className="absolute inset-0 z-0 pointer-events-none"
          style={{
            backgroundColor: musicStore.chatBgColor || 'transparent',
            backgroundImage: chatBgUrl ? `url(${chatBgUrl})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: musicStore.chatBgColor && chatBgUrl ? 0.9 : 1,
          }} />
      )}

      {/* Header */}
      <div className="shizuku-glass-strong relative z-20 shrink-0 mz-chat-header"
        style={{ paddingTop: 'var(--safe-top)' }}>
        <div className="flex items-center gap-2 h-12 px-3">
          <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90" style={{ color: C.primary }}>
            <ArrowLeft size={16} weight="bold" />
          </button>
          <div className="flex-1 flex items-center justify-center gap-1.5">
            <Sparkle size={7} delay={0} color={C.sakura} />
            <span className="text-xs tracking-[0.12em]" style={{ color: C.primary, fontFamily: `'Georgia', serif` }}>
              和 {char?.name || 'Ta'} 聊这首歌
            </span>
            <Sparkle size={7} delay={1.1} color={C.lavender} />
          </div>
          {/* 右上角：歌曲上下文面板开关（2026-08-30 换掉丑 Info，改音符圆钮） */}
          <button
            onClick={() => setShowPanel((v) => !v)}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
            style={{ color: C.primary, background: showPanel ? C.soft : 'transparent', border: `1px solid ${showPanel ? 'transparent' : 'rgba(255,255,255,0.45)'}` }}
            aria-label="歌曲上下文"
            title="当前歌 · 歌词 · 歌单"
          >
            <MusicNotes size={15} weight="duotone" />
          </button>
        </div>
        {/* 夜色预设：双人状态区 + 分割线（附件图二） */}
        {night && togetherNow && (
          <>
            <NightTogetherStrip
              userAvatar={userProfile?.avatar}
              userName={userProfile?.name}
              companion={{ name: char?.name || 'Ta', avatar: char?.avatar }}
            />
            <div className="mt-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
          </>
        )}
      </div>

      {/* 消息流 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 shizuku-scrollbar relative z-10">
        {chat.messages.length === 0 && !chat.streaming && (
          <div className="pt-14 flex flex-col items-center gap-2" style={{ color: C.faint }}>
            <Sparkle size={12} color={C.glow} />
            <span className="text-[11px] italic tracking-wider" style={{ fontFamily: `'Noto Serif','Georgia',serif` }}>
              歌放到哪，就聊到哪
            </span>
          </div>
        )}
        {chat.messages.map((m) => (
          <ChatBubbleRow
            key={m.id}
            m={m}
            charId={charId}
            showAvatar={musicStore.chatShowAvatar !== false}
            userAvatar={userProfile?.avatar}
            charAvatar={char?.avatar}
            userName={userName}
            charName={char?.name || 'Ta'}
            onEdit={(msg) => { setEditMsg(msg); setEditText(msg.content); setMenuMsg(null); }}
            onDelete={(msg) => { chat.deleteMessage(msg.id); setMenuMsg(null); addToast('已删除', 'info'); }}
            onCopy={(t) => void copyText(t)}
          />
        ))}
        {chat.streaming && ChatParser.chunkText(chat.streaming).map((chunk, i, arr) => (
          <div key={`stream-${i}`} className="flex justify-start">
            <div className="mz-chat-bubble mz-chat-bubble-ai max-w-[76%] rounded-2xl px-3 py-2 whitespace-pre-wrap text-[12px] leading-relaxed"
              style={{ background: C.surface, color: C.text, borderTopLeftRadius: 6 }}>
              {chunk}
              {i === arr.length - 1 && (
                <span className="inline-block w-1.5 h-3 ml-0.5 align-middle animate-pulse" style={{ background: C.primary }} />
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* 输入行 + 触发按钮 */}
      <div className="shrink-0 px-3 pb-3 pt-2 relative z-10">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(); }}
            placeholder="说点什么…"
            className="flex-1 rounded-full px-4 py-2.5 outline-none text-[12px] shizuku-glass mz-chat-input"
            style={{ color: C.text }}
          />
          <button
            onClick={send}
            disabled={chat.busy}
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90 disabled:opacity-50 mz-chat-send"
            style={{ background: C.soft, color: C.primary }}
            aria-label="发送（只存进会话）"
            title="只存进会话，回复要点 ▶"
          >
            <PaperPlaneTilt size={16} weight="fill" />
          </button>
          <button
            onClick={() => chat.trigger()}
            disabled={chat.busy}
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90 disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, color: '#fff', boxShadow: `0 3px 12px rgba(var(--mz-glow-rgb, 205,198,233), 0.3)` }}
            aria-label="触发回复"
            title="点这里 Ta 才会回复"
          >
            {chat.busy ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <SparkleIcon size={16} weight="fill" />
            )}
          </button>
        </div>
        {chat.note && <div className="text-[9px] mt-1.5 text-right" style={{ color: C.faint }}>{chat.note}</div>}
      </div>

      {/* 夜色预设：底部「听歌 | 聊歌」胶囊切换台（附件图一/图二） */}
      {night && (
        <div className="shrink-0 relative z-10 flex items-center justify-center pb-[calc(var(--safe-bottom)+10px)]">
          <div className="flex items-center rounded-full px-1 py-1"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <button
              onClick={onBack}
              className="mz-night-tab flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[10px] transition-all"
              style={{ color: 'rgba(255,255,255,0.55)' }}
            >
              <MusicNotes size={12} weight="duotone" /> 听歌
            </button>
            <button
              className="mz-night-tab flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[10px] font-semibold transition-all"
              style={{ background: 'rgba(255,255,255,0.16)', color: '#fff' }}
            >
              <CaretRight size={12} weight="bold" /> 聊歌
            </button>
          </div>
          {togetherNow && (
            <button
              onClick={() => void endListeningTogether(charId)}
              className="absolute right-4 w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
              style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)' }}
              aria-label="结束一起听"
              title="结束一起听"
            >
              <X size={11} weight="bold" />
            </button>
          )}
        </div>
      )}

      {/* 右侧上下文面板 */}
      {showPanel && (
        <div className="absolute right-3 top-[calc(var(--safe-top)+56px)] bottom-3 w-[72%] max-w-[290px] rounded-2xl z-30 overflow-y-auto shizuku-scrollbar p-3 shizuku-glass-strong"
          style={{ boxShadow: `0 8px 32px rgba(var(--mz-glow-rgb, 205,198,233), 0.2)` }}>
          {/* 当前歌卡 */}
          {current && (
            <div className="rounded-xl p-2 flex items-center gap-2"
              style={{ background: `linear-gradient(135deg, rgba(var(--mz-sakura-rgb, 244,194,207), 0.14), rgba(var(--mz-lavender-rgb, 207,195,232), 0.14))` }}>
              <img src={currentCoverUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0"
                style={{ opacity: playing ? 1 : 0.5 }} referrerPolicy="no-referrer" />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold truncate" style={{ color: C.text }}>{current.name}</div>
                <div className="text-[9px] truncate" style={{ color: C.muted }}>{current.artists}</div>
                <div className="text-[8px] mt-0.5" style={{ color: playing ? C.sakura : C.faint }}>{playing ? '● 正在放' : '已暂停'}</div>
              </div>
            </div>
          )}

          {/* 全量歌词（高亮当前行） */}
          <div className="mt-2.5 mb-1 text-[9px] tracking-[0.25em] uppercase font-semibold" style={{ color: C.muted }}>
            歌词
          </div>
          <div ref={panelLyricRef} className="max-h-44 overflow-y-auto rounded-lg px-1">
            {lyric.length > 0 ? (
              lyric.map((l, i) => (
                <div key={i} data-mc-lyric-idx={i} className="py-1 text-[10px] leading-snug transition-all"
                  style={{
                    color: i === activeLyricIdx ? C.primary : C.faint,
                    fontWeight: i === activeLyricIdx ? 700 : 400,
                    transform: i === activeLyricIdx ? 'scale(1.02)' : 'none',
                    transformOrigin: 'left center',
                  }}>
                  {i === activeLyricIdx ? '▶ ' : ''}{l.text}
                </div>
              ))
            ) : plainLyric ? (
              <div className="py-1 text-[10px] leading-relaxed whitespace-pre-wrap" style={{ color: C.muted }}>{plainLyric}</div>
            ) : (
              <div className="py-1 text-[9px] italic" style={{ color: C.faint }}>这首歌没有歌词</div>
            )}
          </div>

          {/* 歌单 top 30 */}
          <div className="mt-2.5 mb-1 text-[9px] tracking-[0.25em] uppercase font-semibold" style={{ color: C.muted }}>
            {char?.name || 'Ta'} 的歌单
          </div>
          <div className="max-h-32 overflow-y-auto">
            {playlistTop.length > 0 ? (
              playlistTop.map((s) => (
                <div key={s.id} className="py-1 text-[10px] truncate" style={{ color: C.muted }}>♪ {s.name}</div>
              ))
            ) : (
              <div className="py-1 text-[9px] italic" style={{ color: C.faint }}>歌单还是空的</div>
            )}
          </div>

          {/* 场景规则 */}
          <div className="mt-2.5 mb-1 text-[9px] tracking-[0.25em] uppercase font-semibold" style={{ color: C.muted }}>
            场景规则
          </div>
          <div className="text-[9px] leading-relaxed" style={{ color: C.faint }}>{SCENE_RULE_COPY}</div>
        </div>
      )}

      {/* 长按操作面板 */}
      {menuMsg && (
        <div className="absolute inset-0 z-40 flex items-end" style={{ background: 'rgba(20,14,24,0.4)' }} onClick={() => setMenuMsg(null)}>
          <div className="w-full rounded-t-2xl p-3 pb-5 shizuku-glass-strong" onClick={(e) => e.stopPropagation()}>
            <div className="text-center text-[9px] mb-2 truncate px-6" style={{ color: C.faint }}>
              {menuMsg.content.slice(0, 40)}
            </div>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => { void copyText(menuMsg.content); setMenuMsg(null); }}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[11px] font-semibold text-white"
                style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})` }}
              >
                <Copy size={13} /> 复制
              </button>
              {menuMsg.role === 'user' && (
                <button
                  onClick={() => { setEditMsg(menuMsg); setEditText(menuMsg.content); setMenuMsg(null); }}
                  className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[11px] font-semibold"
                  style={{ color: C.primary, border: '1px solid rgba(var(--mz-lavender-rgb, 207,195,232), 0.45)', background: C.glass }}
                >
                  <PencilSimple size={13} /> 修改
                </button>
              )}
              <button
                onClick={() => { chat.deleteMessage(menuMsg.id); setMenuMsg(null); addToast('已删除', 'info'); }}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[11px] font-semibold"
                style={{ color: '#e05b6e', border: '1px solid rgba(224,91,110,0.35)', background: C.glass }}
              >
                <Trash size={13} /> 删除
              </button>
            </div>
            <button onClick={() => setMenuMsg(null)} className="w-full text-center text-[10px] mt-2.5" style={{ color: C.faint }}>
              取消
            </button>
          </div>
        </div>
      )}

      {/* 编辑弹层 */}
      {editMsg && (
        <div className="absolute inset-0 z-40 flex items-center justify-center px-7" style={{ background: 'rgba(20,14,24,0.45)' }} onClick={() => setEditMsg(null)}>
          <div className="w-full max-w-[280px] rounded-2xl p-4 shizuku-glass-strong" onClick={(e) => e.stopPropagation()}>
            <div className="text-[12px] font-semibold mb-2" style={{ color: C.text }}>修改消息</div>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={3}
              className="w-full rounded-xl px-3 py-2 outline-none text-[12px] shizuku-glass"
              style={{ color: C.text, resize: 'none' }}
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => { chat.editMessage(editMsg.id, editText); setEditMsg(null); addToast('已修改', 'success'); }}
                className="flex-1 py-2 rounded-full text-[11px] font-semibold text-white"
                style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})` }}
              >
                保存
              </button>
              <button onClick={() => setEditMsg(null)} className="flex-1 py-2 rounded-full text-[11px]"
                style={{ color: C.muted, border: '1px solid rgba(255,255,255,0.3)' }}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MusicChatBox;

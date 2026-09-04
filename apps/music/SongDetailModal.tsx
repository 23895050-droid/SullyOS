/**
 * 歌曲详情弹层（2026-08-26）——角色歌单里一首歌的详情
 * 封面 / 完整歌词（滚动）/ 首条印象（可生成可改）/ 播放次数 / 一起听次数 / 播放
 * 印象生成走主 API（全局 apiConfig），prompt 走注册表「music-印象生成」（透明可改）
 */
import React, { useMemo, useState } from 'react';
import { useOS } from '../../context/OSContext';
import { useMusic } from '../../context/MusicContext';
import { useMusicStore, getSongDetail, saveSongImpression, saveSongLyric, saveSongTags } from '../couple/musicStore';
import { getPrompt } from '../../utils/promptRegistry';
import { useBlobRefUrl } from '../../utils/blobRef';
import { toHttps } from '../../utils/musicContextBlock';
import { C } from './MusicUI';
import { Play, SpinnerGap, X, Sparkle } from '@phosphor-icons/react';

interface Props {
  charId: string;
  charName: string;
  neteaseId: number;
  onClose: () => void;
  onOpenPlayer: () => void;
  /** 批 2：打开聊歌框（和这个角色聊当前这首歌） */
  onOpenChat?: () => void;
}

/** 打标预设（她 2026-08-26：全一些、便捷——chips 点选即存） */
const GENRE_TAGS = ['流行', '摇滚', '民谣', '国风', '说唱', 'R&B', '爵士', '电子', '古典', '金属', '朋克', '蓝调', '乡村', '雷鬼', '纯音乐', '影视原声', '轻音乐', '氛围'];
const MOOD_TAGS = ['温柔', '热烈', '安静', '悲伤', '治愈', '燃', '怀旧', '甜蜜', '孤独', '自由', '浪漫', '慵懒', '清新', '深沉', '空灵', '忧郁'];
const TAG_CAP = 6;

const TagRow: React.FC<{ label: string; tags: string[]; selected: string[]; onToggle: (t: string) => void }> = ({ label, tags, selected, onToggle }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>{label}</div>
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => {
        const on = selected.includes(t);
        return (
          <button
            key={t}
            type="button"
            onClick={() => onToggle(t)}
            className="rounded-full px-2.5 py-1 transition-all"
            style={{
              fontSize: 10,
              color: on ? '#fff' : C.muted,
              background: on ? `linear-gradient(135deg, ${C.primary}, ${C.accent})` : 'transparent',
              border: on ? '1px solid transparent' : '1px solid rgba(var(--mz-faint-rgb, 188,184,204), 0.25)',
            }}
          >
            {t}
          </button>
        );
      })}
    </div>
  </div>
);

const callLlm = async (api: { baseUrl: string; apiKey?: string; model: string }, sys: string, user: string): Promise<string> => {
  const baseUrl = api.baseUrl.replace(/\/+$/, '');
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${api.apiKey || 'sk-none'}`,
    },
    body: JSON.stringify({
      model: api.model,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      temperature: 0.85,
      max_tokens: 2000,
      stream: false,
    }),
    __sullyMeta: { appName: '音乐', purpose: '歌曲印象生成' },
  } as RequestInit);
  if (!resp.ok) throw new Error(`LLM ${resp.status}`);
  const j = await resp.json();
  return j?.choices?.[0]?.message?.content || '';
};

const SongDetailModal: React.FC<Props> = ({ charId, charName, neteaseId, onClose, onOpenPlayer, onOpenChat }) => {
  const { apiConfig, addToast } = useOS();
  const musicStore = useMusicStore();
  const { playSong } = useMusic();
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingLyric, setEditingLyric] = useState(false);
  const [lyricDraft, setLyricDraft] = useState('');

  const detail = useMemo(() => getSongDetail(neteaseId), [neteaseId, musicStore]);
  const song = detail.song;
  // 反馈1 A2：封面渲染前归一（blobRef 令牌解析 + http→https），老数据/导入歌都能显示
  const coverUrl = useBlobRefUrl(toHttps(song?.albumPic));
  if (!song) {
    return (
      <div className="absolute inset-0 z-[130] flex items-center justify-center" style={{ background: 'rgba(20,14,24,0.55)' }} onClick={onClose}>
        <div className="rounded-3xl p-6 mx-6" style={{ background: C.bg }}>
          <div style={{ color: C.muted, fontSize: 13 }}>这首歌还没进过歌单</div>
        </div>
      </div>
    );
  }

  const play = () => {
    playSong({
      id: song.neteaseId,
      name: song.name,
      artists: song.artists.join(' / '),
      album: song.album ?? '',
      albumPic: song.albumPic ?? '',
      duration: song.duration ? Math.round(song.duration / 1000) : 0,
      fee: song.fee ?? 0,
    });
    // 手动点播不记角色听歌次数（次数由一起听会话贡献，批 2）
    onOpenPlayer();
  };

  const genImpression = async () => {
    if (!apiConfig?.baseUrl || !apiConfig?.model) {
      addToast('没配置主 API', 'error');
      return;
    }
    setGenerating(true);
    try {
      const prompt = getPrompt('印象生成')
        .replaceAll('{{char}}', charName)
        .replaceAll('{{songName}}', song.name)
        .replaceAll('{{artists}}', song.artists.join(' / '));
      const raw = await callLlm(apiConfig, prompt, `歌名：${song.name}\n歌手：${song.artists.join(' / ')}`);
      const text = (raw || '').trim().slice(0, 120);
      if (!text) throw new Error('空回复');
      saveSongImpression(neteaseId, text);
      addToast('印象写好了', 'success');
    } catch (e: any) {
      addToast(`印象生成失败：${e.message}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const saveDraft = () => {
    saveSongImpression(neteaseId, draft.trim().slice(0, 200));
    setEditing(false);
    addToast('已保存', 'success');
  };

  const toggleTag = (kind: 'genres' | 'moods', tag: string) => {
    const cur = kind === 'genres' ? (song.genres ?? []) : (song.moods ?? []);
    const next = cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag];
    if (next.length > TAG_CAP) return;
    if (kind === 'genres') saveSongTags(neteaseId, next, song.moods ?? []);
    else saveSongTags(neteaseId, song.genres ?? [], next);
  };

  const lyrics = song.lyric?.trim() || '';
  const impression = song.impression?.trim() || '';

  return (
    <div className="mz-detail absolute inset-0 z-[130] flex items-end sm:items-center justify-center" style={{ background: 'rgba(20,14,24,0.55)' }} onClick={onClose}>
      <div
        className="w-full max-w-[420px] max-h-[82%] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
        style={{ background: C.bg, boxShadow: '0 -8px 40px rgba(0,0,0,0.3)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头 */}
        <div className="flex items-center justify-between px-4 h-12 shrink-0">
          <div style={{ color: C.muted, fontSize: 12, letterSpacing: '0.15em' }}>歌曲详情</div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ color: C.muted }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {/* 封面 + 基本信息 */}
          <div className="flex items-center gap-4">
            {coverUrl ? (
              <img src={coverUrl} alt="" className="w-20 h-20 rounded-2xl object-cover shrink-0" />
            ) : (
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center shrink-0" style={{ background: C.glass }}>
                <Sparkle size={20} color={C.glow} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 17, fontWeight: 700, color: C.text }} className="truncate">{song.name}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }} className="truncate">{song.artists.join(' / ')}</div>
              {song.album ? <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }} className="truncate">{song.album}</div> : null}
              <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                听过 {detail.playCount} 次{detail.togetherCount > 0 ? ` · 一起听 ${detail.togetherCount} 次` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={play}
              className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
              style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, color: '#fff', boxShadow: `0 4px 16px rgba(var(--mz-glow-rgb, 205,198,233), 0.25)` }}
            >
              <Play size={18} weight="fill" />
            </button>
          </div>

          {/* 聊歌入口（批 2）：和这个角色聊这首歌——详情页第二入口 */}
          {onOpenChat && (
            <button
              type="button"
              onClick={onOpenChat}
              className="mt-4 w-full py-2.5 rounded-full"
              style={{ fontSize: 11, fontWeight: 600, color: C.primary, border: `1px solid rgba(var(--mz-lavender-rgb, 207,195,232), 0.4)`, background: C.glass }}
            >
              💬 和 {charName} 聊这首歌
            </button>
          )}

          {/* 印象 */}
          <div className="mt-5 rounded-2xl p-4" style={{ background: C.glass }}>
            <div className="flex items-center justify-between">
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, letterSpacing: '0.1em' }}>我的印象</div>
              <div className="flex items-center gap-2">
                {impression && !editing && (
                  <button
                    type="button"
                    onClick={() => { setDraft(impression); setEditing(true); }}
                    className="rounded-full px-3 py-1"
                    style={{ fontSize: 10, color: C.primary, background: 'transparent', border: `1px solid rgba(var(--mz-primary-rgb, 128,124,157), 0.27)` }}
                  >
                    改写
                  </button>
                )}
                {!impression && !editing && (
                  <button
                    type="button"
                    onClick={genImpression}
                    disabled={generating}
                    className="rounded-full px-3 py-1 flex items-center gap-1"
                    style={{ fontSize: 10, color: '#fff', background: `linear-gradient(135deg, ${C.primary}, ${C.accent})` }}
                  >
                    {generating ? <SpinnerGap size={11} className="animate-spin" /> : <Sparkle size={11} />}
                    生成印象
                  </button>
                )}
              </div>
            </div>
            {editing ? (
              <div className="mt-2">
                <textarea
                  className="w-full rounded-xl p-3 outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', color: C.text, fontSize: 13, minHeight: 90, resize: 'none', border: `1px solid rgba(var(--mz-faint-rgb, 188,184,204), 0.2)` }}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button type="button" onClick={() => setEditing(false)} className="rounded-full px-3 py-1.5" style={{ fontSize: 11, color: C.muted, background: 'transparent' }}>
                    取消
                  </button>
                  <button type="button" onClick={saveDraft} className="rounded-full px-4 py-1.5" style={{ fontSize: 11, color: '#fff', background: C.primary }}>
                    保存
                  </button>
                </div>
              </div>
            ) : impression ? (
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.8, marginTop: 8, fontStyle: 'italic' }}>{impression}</div>
            ) : (
              <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>
                还没有印象——生成一条，或直接写：下次提到这首歌，我就知道它对你意味着什么。
              </div>
            )}
          </div>

          {/* 打标：流派 + 感情基调（点一下即存） */}
          <div className="mt-4 rounded-2xl p-4" style={{ background: C.glass }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text, letterSpacing: '0.1em' }}>打标</div>
            <div style={{ marginTop: 8 }}>
              <TagRow label="流派" tags={GENRE_TAGS} selected={song.genres ?? []} onToggle={(t) => toggleTag('genres', t)} />
              <TagRow label="感情基调" tags={MOOD_TAGS} selected={song.moods ?? []} onToggle={(t) => toggleTag('moods', t)} />
            </div>
          </div>

          {/* 歌词（可手动编辑：有时候自己写几句比导入全文方便） */}
          <div className="mt-4">
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, letterSpacing: '0.1em' }}>歌词</div>
              <button
                type="button"
                onClick={() => {
                  if (editingLyric) setEditingLyric(false);
                  else { setLyricDraft(lyrics); setEditingLyric(true); }
                }}
                className="rounded-full px-3 py-1"
                style={{ fontSize: 10, color: C.primary, background: 'transparent', border: `1px solid rgba(var(--mz-primary-rgb, 128,124,157), 0.27)` }}
              >
                {editingLyric ? '取消编辑' : '编辑歌词'}
              </button>
            </div>
            {editingLyric ? (
              <div>
                <textarea
                  className="w-full rounded-xl p-3 outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', color: C.text, fontSize: 12, minHeight: 140, resize: 'vertical', border: `1px solid rgba(var(--mz-faint-rgb, 188,184,204), 0.25)`, lineHeight: 1.8 }}
                  value={lyricDraft}
                  onChange={(e) => setLyricDraft(e.target.value)}
                  placeholder={'自己写几句，或记和弦走向——纯音乐也能留点东西（带 [mm:ss] 时间戳可以跟唱，不带也能看全文）'}
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      saveSongLyric(neteaseId, lyricDraft);
                      setEditingLyric(false);
                      addToast('歌词已保存', 'success');
                    }}
                    className="rounded-full px-4 py-1.5"
                    style={{ fontSize: 11, color: '#fff', background: C.primary }}
                  >
                    保存
                  </button>
                </div>
              </div>
            ) : lyrics ? (
              <div className="rounded-2xl p-4 max-h-64 overflow-y-auto" style={{ background: C.glass, color: C.text, fontSize: 12.5, lineHeight: 2 }}>
                {lyrics.split(/\r?\n/).map((l, i) => (
                  <div key={i} style={{ opacity: l.trim() ? 0.92 : 0.3 }}>{l.trim() || '　'}</div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl p-4" style={{ background: C.glass, color: C.faint, fontSize: 12 }}>
                这首歌没带歌词。点「编辑歌词」自己写几句——带 [mm:ss] 时间戳可以跟唱，不带也能看全文。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SongDetailModal;

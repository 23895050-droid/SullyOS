/**
 * 角色歌单主页（2026-08-26）——「我的歌单」：CC 导入的歌曲列表
 * 按 recommendPlaylist 分组展示；点歌播放（统一计数）；点行开详情弹层；空态引导导入
 * 数据源 = couple_music_v1 主数据层（现读现生成）
 */
import React, { useMemo, useState } from 'react';
import { useOS } from '../../context/OSContext';
import { useMusic } from '../../context/MusicContext';
import { useMusicStore, playRecordById } from '../couple/musicStore';
import { groupImportedSongs } from '../../utils/musicMountContent';
import { useBlobRefUrl } from '../../utils/blobRef';
import { toHttps } from '../../utils/musicContextBlock';
import SongDetailModal from './SongDetailModal';
import { C, MizuHeader, BokehBg } from './MusicUI';
import { Play, MusicNote, ArrowRight } from '@phosphor-icons/react';
import { type CharacterProfile } from '../../types';

/** 封面小方块（反馈1 A2）：blobRef 令牌解析 + http→https，list 里逐行 hook 只能抽子组件 */
const PlaylistCover: React.FC<{ src?: string }> = ({ src }) => {
  const url = useBlobRefUrl(toHttps(src));
  if (url) {
    return <img src={url} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0" />;
  }
  return (
    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `rgba(var(--mz-primary-rgb, 128,124,157), 0.13)` }}>
      <MusicNote size={16} color={C.primary} />
    </div>
  );
};

interface Props {
  charId: string;
  onBack: () => void;
  onOpenPlayer: () => void;
  onOpenSettings: () => void;
  /** 批 2：打开聊歌框（和这个角色聊歌） */
  onOpenChat?: () => void;
}

const PlaylistHomePage: React.FC<Props> = ({ charId, onBack, onOpenPlayer, onOpenSettings, onOpenChat }) => {
  const { characters } = useOS();
  const musicStore = useMusicStore();
  const { playSong } = useMusic();
  const [detailId, setDetailId] = useState<number | null>(null);

  const char: CharacterProfile | undefined = characters.find((c) => c.id === charId);

  const groups = useMemo(
    () => groupImportedSongs(musicStore.importedSongs),
    [musicStore.importedSongs],
  );

  const play = (neteaseId: number) => {
    const song = musicStore.importedSongs.find((s) => s.neteaseId === neteaseId);
    if (!song) return;
    playSong({
      id: song.neteaseId,
      name: song.name,
      artists: song.artists.join(' / '),
      album: song.album ?? '',
      albumPic: song.albumPic ?? '',
      duration: song.duration ? Math.round(song.duration / 1000) : 0,
      fee: song.fee ?? 0,
    });
    // 手动点播 = 用户在听，不记角色听歌次数（次数由一起听会话贡献，批 2）
    onOpenPlayer();
  };

  return (
    <div className="mz-charhome flex flex-col h-full relative" style={{ background: `linear-gradient(180deg, var(--mz-sheet-top, #ffffff) 0%, ${C.bg} 50%, ${C.bgDeep} 100%)` }}>
      <BokehBg />
      <MizuHeader title={char ? `${char.name} 的歌单` : '我的歌单'} onBack={onBack} />

      <div className="flex-1 overflow-y-auto px-4 py-3 relative z-10 shizuku-scrollbar">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-16 h-16 rounded-3xl flex items-center justify-center" style={{ background: C.glass }}>
              <MusicNote size={26} color={C.muted} />
            </div>
            <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>歌单还是空的</div>
            <div style={{ fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 1.8, maxWidth: 240 }}>
              我（Claude Code）在网易云里挑好的歌，会导成文件带进来。带进来的歌会自动归进「CC 导入」或你指定的歌单。
            </div>
            <button
              type="button"
              onClick={onOpenSettings}
              className="mt-2 rounded-full px-5 py-2.5"
              style={{ fontSize: 12, fontWeight: 600, color: 'var(--mz-on-text, #fff)', background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, boxShadow: `0 4px 16px rgba(var(--mz-glow-rgb, 205,198,233), 0.19)` }}
            >
              去音乐设置页导入
            </button>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.title} className="mb-5">
              <div className="flex items-baseline justify-between px-1 mb-2">
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{g.title}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{g.items.length} 首</div>
              </div>
              {g.items.map((s) => {
                const rec = playRecordById(musicStore.playRecords, s.neteaseId);
                return (
                  <div
                    key={s.neteaseId}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5 mb-1.5 cursor-pointer transition-transform active:scale-[0.98]"
                    style={{ background: C.glass }}
                    onClick={() => setDetailId(s.neteaseId)}
                  >
                    <PlaylistCover src={s.albumPic} />
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }} className="truncate">{s.name}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }} className="truncate">
                        {s.artists.join(' / ')}{rec ? ` · 听过 ${rec.playCount} 次` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="播放"
                      onClick={(e) => { e.stopPropagation(); play(s.neteaseId); }}
                      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: `rgba(var(--mz-primary-rgb, 128,124,157), 0.09)`, color: C.primary }}
                    >
                      <Play size={14} weight="fill" />
                    </button>
                    <ArrowRight size={14} color={C.faint} className="shrink-0" />
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {detailId !== null && char && (
        <SongDetailModal
          charId={charId}
          charName={char.name}
          neteaseId={detailId}
          onClose={() => setDetailId(null)}
          onOpenPlayer={onOpenPlayer}
          onOpenChat={onOpenChat}
        />
      )}
    </div>
  );
};

export default PlaylistHomePage;

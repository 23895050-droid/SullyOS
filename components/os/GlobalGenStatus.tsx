import React from 'react';
import { isBgTaskStale, type BgTaskPending } from '../../utils/bgTask';
import { diaryBgStore } from '../../apps/couple/diaryBgStore';
import { dietBgStore } from '../../apps/couple/dietBgStore';
import { albumBgStore } from '../../apps/couple/albumBgStore';
import { useMusicStore } from '../../apps/couple/musicStore';

// 全局「后台生成」状态条 —— 挂在 PhoneShell，任何页面/App 里都可见（样式对齐原版人格模拟/梦境指示条）。
// 数据源 = 各 feature store 的 bgTask pending（running 且未过期才显示；多个任务时显示最早开始的那个）。
const GlobalGenStatus: React.FC = () => {
  const diary = diaryBgStore.use();
  const diet = dietBgStore.use();
  const album = albumBgStore.use();
  const music = useMusicStore();

  const actives: { at: number; text: string }[] = [];
  const push = (p: BgTaskPending | undefined, text: string) => {
    if (p && p.status === 'running' && !isBgTaskStale(p)) actives.push({ at: p.startedAt, text });
  };
  push(diary.pendingDiary, 'Nox 正在写日记…');
  push(diary.pendingAnnotate, 'Nox 正在批注日记…');
  push(diary.pendingBoard, 'Nox 正在写留言…');
  push(diet.pendingFridgeSummary, '正在总结购买记录…');
  push(album.pendingRecall, '正在生成观后感…');
  push(album.pendingAutoTag, '正在整理相册标签…');
  push(music.pendingSummary, '正在补听歌总结…');
  if (!actives.length) return null;
  actives.sort((a, b) => a.at - b.at);

  return (
    <div className="absolute top-12 left-0 w-full flex justify-center px-4 z-[65] pointer-events-none">
      <div
        className="animate-fade-in flex items-center gap-2.5 rounded-full px-4 py-2.5 border"
        style={{ background: 'rgba(28,24,48,0.94)', borderColor: 'rgba(184,155,255,0.3)' }}
      >
        <span className="w-3.5 h-3.5 border-2 border-[#b89bff]/40 border-t-[#b89bff] rounded-full animate-spin" />
        <span className="text-[12px] font-semibold text-white/85">
          {actives[0].text}{actives.length > 1 ? `（还有 ${actives.length - 1} 个）` : ''}
        </span>
      </div>
    </div>
  );
};

export default GlobalGenStatus;

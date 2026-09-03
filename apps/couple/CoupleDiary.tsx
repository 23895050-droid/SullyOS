// 情侣空间日记页（2026-08-24，需求文档《日记与批阅.txt》+ 朋友 prompt 参考 + 验收二批）——笔记纸风
// 双 owner 页：她的日记（手动写，当天可改/可删）｜他的日记（手动写或「喊他写」AI 生成，当天可重roll/可删）；往期一律只读
// 批阅：他的日记下面 = 她的批阅（手动，棕墨便签，可删）；她的日记里 = 他的旁批（AI，句子划线/圈点 + 边角小批，蓝墨，当天可重roll）
// 二批（2026-08-24）：①她的批阅可删 ②他自己写日记也带旁批（selfAnchors，写在自己句子上）③当天日记可删 ④自定义 ttf 字体 ⑤心情基调→信纸配色（他的 AI 输出 mood / 她的手动选）⑥语言选择 1-3 种
// 交换日记 = 两篇都写 + 双方都批；完成后两张卡片转发进聊天——这是他唯一读到她的日记的通道
// API 槽：日记独立配置，未配回退主 API（diaryApi.resolveDiaryApi）；提示词在设置·提示词管理可改
// 分句编号必须与 utils/diaryMath.diarySentences 完全一致（发 prompt 与渲染定位用同一套）
import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, ArrowsLeftRight, CaretDown, Check, Circle, PaperPlaneTilt,
  PencilSimple, Sparkle, SpinnerGap, Trash, X,
} from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { useBlobRefUrl } from '../../utils/blobRef';
import type { CharacterProfile } from '../../types';
import { getLocalDateKey } from '../../utils/localDate';
import { getMountConfig } from '../../utils/noxhomeMount';
import {
  deleteDiaryEntry, deleteDiaryReview, diaryDates, diaryOn, saveDiaryEntry, setDiaryReview, useDiaryStore,
  type DiaryOwner, type DiarySeg, type SentenceAnchor,
} from './diaryStore';
import {
  DIARY_LANGS, DIARY_MOODS, diarySentences, diarySplitSentences, flattenAnchors, fmtDiaryDateStamp, fmtDiaryMeta,
  MOOD_LABELS, normalizeDiaryMood, splitDiaryHead, type DiaryMood,
} from '../../utils/diaryMath';
import { generateNoxAnnotation, generateNoxDiary, resolveDiaryApi } from './diaryApi';
import { forwardDiaryCard } from './coupleForward';
import { ForwardPicker } from './CouplePeriod';
import ConfirmDialog from '../../components/os/ConfirmDialog';

// ── 纸张设计常量 ──

const SERIF = "Georgia, 'Times New Roman', 'Songti SC', 'STKaiti', 'KaiTi', serif";
const HIS_INK = '#3d4d6e'; // 他的页：靛蓝墨
const HER_INK = '#a35d74'; // 她的页：玫棕墨
const NOTE_INK = '#4a7ab5'; // 他的旁批：蓝墨
const REVIEW_INK = '#8a5a3b'; // 她的批阅：棕墨

interface MoodPaper {
  pageBg: string;
  paper: string;
  ink: string;
  titleInk: string;
  line: string;
  margin: string;
  metaInk: string;
}

/** 心情基调 → 信纸配色（深夜 mood 是深色纸；flirt 紫色调情 / ache 深蓝墨笔记纸，其余浅色纸） */
const MOOD_PAPER: Record<DiaryMood, MoodPaper> = {
  joy: { pageBg: '#f8f2dd', paper: '#fff9e8', ink: '#4a3a1e', titleInk: '#b07a2a', line: 'rgba(180,140,60,0.14)', margin: 'rgba(200,150,60,0.35)', metaInk: '#a08a55' },
  calm: { pageBg: '#f6f1e6', paper: '#fffdf6', ink: '#3a2f28', titleInk: '#3d4d6e', line: 'rgba(139,110,80,0.10)', margin: 'rgba(196,110,132,0.28)', metaInk: '#9a8a76' },
  soft: { pageBg: '#f9eef2', paper: '#fdf4f7', ink: '#4a2f38', titleInk: '#a35d74', line: 'rgba(196,110,150,0.12)', margin: 'rgba(214,120,150,0.35)', metaInk: '#b08a95' },
  flirt: { pageBg: '#f1e8f6', paper: '#f9f1fc', ink: '#3b2a4d', titleInk: '#7d5ba6', line: 'rgba(140,90,190,0.14)', margin: 'rgba(150,100,200,0.32)', metaInk: '#9a84b0' },
  ache: { pageBg: '#e8edf5', paper: '#f4f6fb', ink: '#1f3a5f', titleInk: '#24456e', line: 'rgba(70,110,160,0.14)', margin: 'rgba(90,130,180,0.30)', metaInk: '#7d93b0' },
  sad: { pageBg: '#e9f0f6', paper: '#f2f6fa', ink: '#33404d', titleInk: '#5b7d99', line: 'rgba(90,120,150,0.12)', margin: 'rgba(110,140,170,0.30)', metaInk: '#8599ab' },
  angry: { pageBg: '#f8ede4', paper: '#fff5ee', ink: '#50302a', titleInk: '#c26a4a', line: 'rgba(190,100,70,0.14)', margin: 'rgba(205,110,80,0.35)', metaInk: '#a8846e' },
  night: { pageBg: '#232838', paper: '#2c3244', ink: '#e8ecf5', titleInk: '#c9d4f0', line: 'rgba(255,255,255,0.08)', margin: 'rgba(160,180,220,0.25)', metaInk: '#8d97b0' },
};

const INK: Record<string, string> = { graphite: '#3f3f46', blue: '#4a7ab5', brown: '#8a5a3b', olive: '#6b7a3f', plum: '#8b5e83' };

const segStyle = (g: DiarySeg): React.CSSProperties => {
  const s: React.CSSProperties = {
    color: g.color ? INK[g.color] : undefined,
    fontSize: g.size === 'lg' ? 15 : g.size === 'sm' ? 10 : 12,
  };
  if (g.type === 'strike') s.textDecoration = 'line-through';
  if (g.type === 'highlight') { s.background = '#ffe98a'; s.borderRadius = 3; } // 荧光笔：必须够黄，浅了在彩色信纸上看着像白底
  if (g.type === 'doodle') { s.fontSize = 10; s.opacity = 0.85; }
  if (g.type === 'styled') s.fontWeight = 600;
  return s;
};

/** 一个旁批 segment：redact 渲染成涂黑条（想写又不想被看到） */
const SegSpan: React.FC<{ g: DiarySeg }> = ({ g }) =>
  g.type === 'redact' ? (
    <span style={{ background: '#3f3f46', color: 'transparent', borderRadius: 3, userSelect: 'none' }}>{g.text}</span>
  ) : (
    <span style={segStyle(g)}>{g.text}</span>
  );

/** 句末的边角小批（便签条）：底色要压过信纸，浮起来才像真便签 */
const NoteChip: React.FC<{ segs: DiarySeg[] }> = ({ segs }) => (
  <span
    className="inline-block align-baseline"
    style={{ margin: '2px 0 2px 8px', padding: '2px 8px', background: '#dcebfa', border: '1px solid #bcd6f2', borderRadius: 8, maxWidth: '86%', lineHeight: 1.6, boxShadow: '0 1px 4px rgba(90,130,180,0.18)' }}
  >
    {segs.map((g, i) => <SegSpan key={i} g={g} />)}
  </span>
);

/** 日记正文渲染：按段分句，批注锚点命中 → 划线/圈点 + 句末便签；旧锚点对不上（正文改过）自动跳过。
 *  他的日记 = 他自己的旁批（entry.anchors）；她的日记 = 他的批注（review.anchors） */
const DiaryBody: React.FC<{ content: string; anchors?: SentenceAnchor[] }> = ({ content, anchors }) => {
  const byId = new Map((anchors ?? []).map((a) => [a.sentenceId, a]));
  const paras = content.split(/\n+/).filter((p) => p.trim());
  const markStyle = (a?: SentenceAnchor): React.CSSProperties | undefined => {
    if (!a) return undefined;
    if (a.mark === 'underline') return { borderBottom: '2px solid #7ba3d4', paddingBottom: 1 };
    if (a.mark === 'strike') return { textDecoration: 'line-through', color: '#9a8a7a' };
    if (a.mark === 'circle') return { border: '1.5px solid #7ba3d4', borderRadius: 10, padding: '0 5px' };
    return undefined;
  };
  return (
    <>
      {paras.map((para, pi) => {
        const sents = diarySplitSentences(para).map((s) => s.trim()).filter(Boolean);
        return (
          <p key={pi} style={{ margin: '0 0 10px', lineHeight: 2 }}>
            {sents.map((s, si) => {
              const id = `p${pi + 1}s${si + 1}`;
              const a = byId.get(id);
              return (
                <span key={si}>
                  <span style={markStyle(a)}>{s}</span>
                  {a?.noteBlock ? <NoteChip segs={a.noteBlock} /> : null}
                </span>
              );
            })}
          </p>
        );
      })}
    </>
  );
};

/** 笔记纸：纸底按心情配色 + 横线 + 左红边距线 */
const PaperSheet: React.FC<{ mood: DiaryMood; children: React.ReactNode; minHeight?: number }> = ({ mood, children, minHeight = 300 }) => {
  const p = MOOD_PAPER[mood];
  return (
    <div className="relative overflow-hidden" style={{ background: p.paper, borderRadius: 18, boxShadow: '0 10px 28px rgba(60,50,30,0.16)', padding: '22px 18px 22px 50px', minHeight }}>
      <div className="absolute" style={{ left: 38, top: 0, bottom: 0, width: 1, background: p.margin }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: `repeating-linear-gradient(transparent, transparent 31px, ${p.line} 31px, ${p.line} 32px)` }} />
      <div className="relative">{children}</div>
    </div>
  );
};

const Pill: React.FC<{ onClick: () => void; children: React.ReactNode; ink: string; ghost?: boolean; disabled?: boolean }> = ({ onClick, children, ink, ghost, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="border-0 cursor-pointer rounded-full flex items-center"
    style={{
      gap: 5, padding: '8px 14px', fontSize: 12, fontWeight: 600,
      color: ghost ? ink : '#fff',
      background: ghost ? 'rgba(255,255,255,0.85)' : ink,
      opacity: disabled ? 0.5 : 1,
    }}
  >
    {children}
  </button>
);

// ── 语言选择（语言爱好者：1-3 种混用，每次现选） ──

const LangChips: React.FC<{ langs: string[]; onToggle: (l: string) => void }> = ({ langs, onToggle }) => (
  <div className="flex items-center flex-wrap" style={{ gap: 6 }}>
    {DIARY_LANGS.map((l) => {
      const on = langs.includes(l);
      return (
        <button
          key={l}
          type="button"
          onClick={() => onToggle(l)}
          className="border-0 cursor-pointer rounded-full"
          style={{ padding: '5px 11px', fontSize: 11, fontWeight: 600, background: on ? HIS_INK : '#f1ece3', color: on ? '#fff' : '#6b5a4a' }}
        >
          {l}
        </button>
      );
    })}
  </div>
);

/** 喊他写 / 喊他来看 的公共弹卡：选语言（最多 3 种）+ 开始 */
const GenModal: React.FC<{
  title: string;
  note: string;
  langs: string[];
  onToggle: (l: string) => void;
  onStart: () => void;
  busy: boolean;
  onClose: () => void;
}> = ({ title, note, langs, onToggle, onStart, busy, onClose }) => {
  const toggle = (l: string) => {
    if (langs.includes(l)) onToggle(l);
    else if (langs.length < 3) onToggle(l);
  };
  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 120, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 16, gap: 12 }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 15, fontWeight: 700, color: '#3a2a33' }}>{title}</span>
          <button type="button" onClick={onClose} aria-label="关闭" className="border-0 cursor-pointer rounded-full p-2" style={{ background: '#f4eee6' }}>
            <X style={{ width: 15, height: 15, color: '#6b5a4a' }} />
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#9a8a76', margin: 0, lineHeight: 1.7 }}>{note}</p>
        <LangChips langs={langs} onToggle={toggle} />
        <p style={{ fontSize: 10, color: '#b5a68c', margin: 0 }}>可选 1-3 种语言，混着写也没问题。</p>
        <button
          type="button"
          onClick={onStart}
          disabled={busy || langs.length === 0}
          className="border-0 cursor-pointer rounded-full flex items-center justify-center"
          style={{ gap: 6, padding: '11px 0', fontSize: 13, fontWeight: 700, color: '#fff', background: busy ? '#9db4d6' : NOTE_INK, opacity: langs.length === 0 ? 0.5 : 1 }}
        >
          {busy ? <SpinnerGap className="animate-spin" style={{ width: 14, height: 14 }} /> : <Sparkle style={{ width: 14, height: 14 }} />}
          {busy ? '正在写…' : '开始'}
        </button>
      </div>
    </div>
  );
};

// ── 写日记弹卡（今天专用：她/他手动写 + 她的信纸心情选择） ──

const MOOD_DOT: Record<DiaryMood, string> = {
  joy: '#e8c35a', calm: '#e6dcc8', soft: '#e8b7c6', flirt: '#b48fd9', ache: '#3f5f8f', sad: '#a8c0d6', angry: '#d98a66', night: '#3a4157',
};

const WriteModal: React.FC<{
  owner: DiaryOwner;
  initial: string;
  initialMood: DiaryMood;
  onSave: (text: string, mood: DiaryMood) => void;
  onClose: () => void;
}> = ({ owner, initial, initialMood, onSave, onClose }) => {
  const [draft, setDraft] = useState(initial);
  const [mood, setMood] = useState<DiaryMood>(initialMood);
  const ink = owner === 'me' ? HIS_INK : HER_INK;
  const p = MOOD_PAPER[mood];
  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 120, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 16, gap: 12 }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 15, fontWeight: 700, color: '#3a2a33' }}>{owner === 'me' ? '写 Nox 的日记' : '写日记'}</span>
          <button type="button" onClick={onClose} aria-label="关闭" className="border-0 cursor-pointer rounded-full p-2" style={{ background: '#f4eee6' }}>
            <X style={{ width: 15, height: 15, color: '#6b5a4a' }} />
          </button>
        </div>
        {/* 信纸心情（她的日记自己选；他的手动写也可以顺手选） */}
        <div className="flex items-center" style={{ gap: 8 }}>
          <span style={{ fontSize: 11, color: '#9a8a76', flexShrink: 0 }}>信纸</span>
          {DIARY_MOODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMood(m)}
              aria-label={MOOD_LABELS[m]}
              className="rounded-full border-0 cursor-pointer"
              style={{
                width: 24, height: 24, background: MOOD_DOT[m],
                border: mood === m ? '2.5px solid #3a2f28' : '2px solid rgba(0,0,0,0.08)',
                boxShadow: mood === m ? '0 0 0 3px rgba(58,47,40,0.15)' : 'none',
              }}
            />
          ))}
          <span style={{ fontSize: 10, color: '#b5a68c' }}>{MOOD_LABELS[mood]}</span>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="把今天留下来……"
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box', minHeight: 240, fontFamily: SERIF, fontSize: 14, lineHeight: 1.9,
            color: p.ink, background: p.paper, border: '1px solid #e7dcc8', borderRadius: 14, padding: 14, outline: 'none', resize: 'none',
          }}
        />
        <button
          type="button"
          onClick={() => { if (!draft.trim()) return; onSave(draft.trim(), mood); onClose(); }}
          className="border-0 cursor-pointer rounded-full"
          style={{ padding: '11px 0', fontSize: 13, fontWeight: 700, color: '#fff', background: ink }}
        >
          保存
        </button>
      </div>
    </div>
  );
};

// ── 她的批阅弹卡（批他的日记，纯手动） ──

const ReviewWriteModal: React.FC<{ initial: string; onSave: (text: string) => void; onClose: () => void }> = ({ initial, onSave, onClose }) => {
  const [draft, setDraft] = useState(initial);
  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 120, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 16, gap: 12 }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 15, fontWeight: 700, color: '#3a2a33' }}>批阅 Nox 的日记</span>
          <button type="button" onClick={onClose} aria-label="关闭" className="border-0 cursor-pointer rounded-full p-2" style={{ background: '#f4eee6' }}>
            <X style={{ width: 15, height: 15, color: '#6b5a4a' }} />
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#9a8a76', margin: 0, lineHeight: 1.7 }}>
          用你的话回应他今天写下的东西——想说的话、想补的细节、想吐槽的地方都行。这张批阅会和他的日记原文一起打包成卡片，转发给他。
        </p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="我批注……"
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box', minHeight: 200, fontFamily: SERIF, fontSize: 14, lineHeight: 1.9,
            color: REVIEW_INK, background: '#fffaf0', border: '1px solid #e7dcc8', borderRadius: 14, padding: 14, outline: 'none', resize: 'none',
          }}
        />
        <button
          type="button"
          onClick={() => { if (!draft.trim()) return; onSave(draft.trim()); onClose(); }}
          className="border-0 cursor-pointer rounded-full"
          style={{ padding: '11px 0', fontSize: 13, fontWeight: 700, color: '#fff', background: REVIEW_INK }}
        >
          保存批阅
        </button>
      </div>
    </div>
  );
};

// ── 往期日记清单（点写日记页的时间戳进入；只读） ──

const DatesSheet: React.FC<{ owner: DiaryOwner; entries: { date: string; snippet: string }[]; onPick: (date: string) => void; onClose: () => void }> = ({ owner, entries, onPick, onClose }) => (
  <div
    className="fixed inset-0 flex items-end justify-center"
    style={{ zIndex: 120, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  >
    <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 16, gap: 10, maxHeight: 'calc(100dvh - 120px)', overflowY: 'auto' }}>
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 15, fontWeight: 700, color: '#3a2a33' }}>往期日记（{owner === 'me' ? 'Nox' : 'Angel'}）</span>
        <button type="button" onClick={onClose} aria-label="关闭" className="border-0 cursor-pointer rounded-full p-2" style={{ background: '#f4eee6' }}>
          <X style={{ width: 15, height: 15, color: '#6b5a4a' }} />
        </button>
      </div>
      {entries.length === 0 && <p style={{ fontSize: 12, color: '#9a8a76', margin: 0, padding: '8px 2px' }}>还没有写过日记。</p>}
      {entries.map((e) => (
        <button
          key={e.date}
          type="button"
          onClick={() => { onPick(e.date); onClose(); }}
          className="border-0 cursor-pointer rounded-2xl flex flex-col items-start"
          style={{ gap: 3, padding: '10px 14px', background: '#fffdf6', border: '1px solid #eee3cf', textAlign: 'left' }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: '#3a2f28' }}>{fmtDiaryDateStamp(e.date)}</span>
          <span style={{ fontSize: 11, color: '#9a8a76', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{e.snippet}</span>
        </button>
      ))}
      <p style={{ fontSize: 10, color: '#b5a68c', margin: 0, textAlign: 'center' }}>往期日记不能更改，只供回看。</p>
    </div>
  </div>
);

// ── 交换日记弹卡（4 步检查 + 完成后的两张转发卡） ──

const ExchangeModal: React.FC<{
  steps: Array<{ label: string; done: boolean }>;
  onJump: (to: 'his' | 'hers' | 'review-his' | 'annotate-hers') => void;
  onForward: (kind: 'review-his' | 'review-hers') => void;
  onClose: () => void;
}> = ({ steps, onJump, onForward, onClose }) => {
  const allDone = steps.every((s) => s.done);
  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 120, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 16, gap: 12 }}>
        <div className="flex items-center justify-between">
          <span className="flex items-center" style={{ gap: 6, fontSize: 15, fontWeight: 700, color: '#3a2a33' }}>
            <ArrowsLeftRight style={{ width: 16, height: 16, color: HER_INK }} /> 交换日记
          </span>
          <button type="button" onClick={onClose} aria-label="关闭" className="border-0 cursor-pointer rounded-full p-2" style={{ background: '#f4eee6' }}>
            <X style={{ width: 15, height: 15, color: '#6b5a4a' }} />
          </button>
        </div>
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-center rounded-xl" style={{ gap: 8, padding: '9px 12px', background: s.done ? '#f2f8f3' : '#faf6f0' }}>
            {s.done ? <Check style={{ width: 14, height: 14, color: '#5c9a72' }} /> : <Circle style={{ width: 14, height: 14, color: '#c9b9a2' }} weight="regular" />}
            <span className="flex-1" style={{ fontSize: 12, color: s.done ? '#4a6b56' : '#8a7a64' }}>{s.label}</span>
            {!s.done && (
              <button
                type="button"
                onClick={() => onJump(i === 0 ? 'his' : i === 1 ? 'hers' : i === 2 ? 'review-his' : 'annotate-hers')}
                className="border-0 cursor-pointer rounded-full"
                style={{ padding: '5px 10px', fontSize: 10, fontWeight: 600, color: '#8a5a3b', background: '#f4e9da' }}
              >
                {i === 0 ? '去写/喊他写' : i === 1 ? '去写' : i === 2 ? '去批阅' : '喊他来看'}
              </button>
            )}
          </div>
        ))}
        {allDone ? (
          <>
            <p style={{ fontSize: 11, color: '#9a8a76', margin: 0, lineHeight: 1.7 }}>
              交换完成 🎉 两张卡片可以转发了。转发后他会读到你日记的原文——这是他能读到你的日记的唯一方式。
            </p>
            <button
              type="button"
              onClick={() => onForward('review-his')}
              className="border-0 cursor-pointer rounded-full flex items-center justify-center"
              style={{ gap: 6, padding: '11px 0', fontSize: 13, fontWeight: 700, color: '#fff', background: REVIEW_INK }}
            >
              <PaperPlaneTilt style={{ width: 14, height: 14 }} /> 转发「Angel 批阅 + Nox 原文」给他
            </button>
            <button
              type="button"
              onClick={() => onForward('review-hers')}
              className="border-0 cursor-pointer rounded-full flex items-center justify-center"
              style={{ gap: 6, padding: '11px 0', fontSize: 13, fontWeight: 700, color: '#fff', background: NOTE_INK }}
            >
              <PaperPlaneTilt style={{ width: 14, height: 14 }} /> 转发「Nox 批注 + Angel 原文」给他
            </button>
          </>
        ) : (
          <p style={{ fontSize: 11, color: '#9a8a76', margin: 0, lineHeight: 1.7 }}>
            前置条件：两人都写了日记。双方互相批阅（你批他的 + 他批你的），两张卡片才齐。
          </p>
        )}
      </div>
    </div>
  );
};

// ── 日记页主组件 ──

const CoupleDiary: React.FC<{ initialOwner: DiaryOwner; onBack: () => void }> = ({ initialOwner, onBack }) => {
  const store = useDiaryStore();
  const { addToast, apiConfig, characters, userProfile } = useOS();
  const [owner, setOwner] = useState<DiaryOwner>(initialOwner);
  const today = getLocalDateKey();
  const [viewDate, setViewDate] = useState(today);
  const [writeOpen, setWriteOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const [busy, setBusy] = useState<'diary' | 'annotate' | null>(null);
  const [rerollConfirm, setRerollConfirm] = useState(false);
  const [delConfirm, setDelConfirm] = useState<'entry' | 'review' | null>(null);
  const [genFor, setGenFor] = useState<'diary' | 'annotate' | null>(null);
  const [langs, setLangs] = useState<string[]>(['简体中文']);
  const [forwardKind, setForwardKind] = useState<'review-his' | 'review-hers' | null>(null);
  const [exchangeOpen, setExchangeOpen] = useState(false);

  // 自定义字体（设置页上传 ttf）：blob URL → FontFace 注册，卸掉旧的同名字体防堆积
  const fontUrl = useBlobRefUrl(store.fontRef);
  useEffect(() => {
    if (!fontUrl) return;
    let face: FontFace | null = null;
    let alive = true;
    const ff = new FontFace('DiaryHand', `url(${fontUrl})`);
    ff.load()
      .then((loaded) => {
        if (!alive) return;
        face = loaded;
        document.fonts.add(loaded);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (face) document.fonts.delete(face);
    };
  }, [fontUrl]);
  const fontStack = store.fontRef ? `'DiaryHand', ${SERIF}` : SERIF;

  const entry = diaryOn(store.entries, viewDate, owner);
  const isToday = viewDate === today;
  const ink = owner === 'me' ? HIS_INK : HER_INK;
  const mood: DiaryMood = normalizeDiaryMood(entry?.mood);
  const paper = MOOD_PAPER[mood];
  const chromeInk = mood === 'night' ? '#e8ecf5' : '#3a2a33'; // 深夜纸时顶栏文字换浅色

  const todayMe = diaryOn(store.entries, today, 'me');
  const todayHer = diaryOn(store.entries, today, 'her');
  const mountChar = characters.find((c) => c.id === getMountConfig().charId) ?? null;

  // ── AI 动作 ──

  const ensureReady = (): boolean => {
    if (!mountChar) { addToast('先去「挂载设置」选要挂载的角色', 'info'); return false; }
    if (!userProfile?.name) { addToast('还没有用户资料', 'info'); return false; }
    if (!resolveDiaryApi(store.api, apiConfig)) { addToast('还没配置 API（日记设置或主 API）', 'info'); return false; }
    return true;
  };

  const handleGenerate = async (useLangs: string[]) => {
    if (!ensureReady()) return;
    setBusy('diary');
    try {
      const { text, summary, mood: m, anchors } = await generateNoxDiary({ char: mountChar!, user: userProfile!, mainApi: apiConfig, langs: useLangs });
      saveDiaryEntry({ owner: 'me', content: text, summary: summary || undefined, generated: true, mood: m, anchors });
      addToast('Nox 写好了今天的日记', 'success');
    } catch (e) {
      addToast(`生成失败：${e instanceof Error ? e.message : '网络错误'}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleAnnotate = async (useLangs: string[]) => {
    if (!ensureReady()) return;
    const herEntry = diaryOn(store.entries, today, 'her');
    if (!herEntry?.content.trim()) { addToast('先写今天的日记', 'info'); return; }
    setBusy('annotate');
    try {
      const { summary, anchors } = await generateNoxAnnotation({ char: mountChar!, user: userProfile!, herDiary: herEntry.content, mainApi: apiConfig, langs: useLangs });
      const content = flattenAnchors(anchors, diarySentences(herEntry.content));
      const now = new Date().toISOString();
      setDiaryReview(today, 'her', { content, anchors, summary: summary || undefined, createdAt: now, updatedAt: now });
      addToast('Nox 批注好了', 'success');
    } catch (e) {
      addToast(`批注失败：${e instanceof Error ? e.message : '网络错误'}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  // ── 转发 ──

  const doForward = async (c: CharacterProfile) => {
    try {
      if (forwardKind === 'review-his') {
        const rv = todayMe?.review;
        if (todayMe && rv) {
          await forwardDiaryCard(c, { kind: '日记·批阅', title: 'Angel 批阅了 Nox 的日记', subtitle: fmtDiaryDateStamp(today), date: today, original: todayMe.content, review: rv.content });
        }
      } else if (forwardKind === 'review-hers') {
        const rv = todayHer?.review;
        if (todayHer && rv) {
          await forwardDiaryCard(c, { kind: '日记·批注', title: 'Nox 批注了 Angel 的日记', subtitle: fmtDiaryDateStamp(today), date: today, original: todayHer.content, review: rv.content });
        }
      }
    } catch {
      // 转发失败静默关掉
    }
    setForwardKind(null);
  };

  // ── 交换状态 ──

  const steps = [
    { label: 'Nox 写了日记', done: !!todayMe?.content.trim() },
    { label: 'Angel 写了日记', done: !!todayHer?.content.trim() },
    { label: 'Angel 批阅了 Nox 的日记', done: !!todayMe?.review?.content.trim() },
    { label: 'Nox 批注了 Angel 的日记', done: !!todayHer?.review?.content.trim() },
  ];

  const jumpFromExchange = (to: 'his' | 'hers' | 'review-his' | 'annotate-hers') => {
    setExchangeOpen(false);
    setViewDate(today);
    if (to === 'his') { setOwner('me'); return; }
    if (to === 'hers') { setOwner('her'); setWriteOpen(true); return; }
    if (to === 'review-his') { setOwner('me'); setReviewOpen(true); return; }
    setOwner('her'); // annotate-hers：到她的日记页点「喊他来看」
  };

  const toggleLang = (l: string) => {
    setLangs((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : prev.length < 3 ? [...prev, l] : prev));
  };

  // ── 页面 ──

  const content = entry?.content ?? '';
  const his = owner === 'me' && content ? splitDiaryHead(content) : null;
  const herAnchors = owner === 'her' && entry?.review?.anchors?.length ? entry.review.anchors : undefined;
  const hisSelfAnchors = his && entry?.anchors?.length ? entry.anchors : undefined;
  const dateEntries = diaryDates(store.entries, owner).map((d) => ({
    date: d,
    snippet: (diaryOn(store.entries, d, owner)?.content ?? '').slice(0, 40),
  }));

  return (
    <div
      className="absolute inset-0 flex flex-col overflow-y-auto"
      style={{ background: paper.pageBg, paddingTop: 'calc(var(--chrome-top, 0px) + 14px)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 96px)' }}
    >
      {/* 顶栏：返回 / 标题 / Ta的日记 */}
      <div className="flex items-center px-5" style={{ gap: 10 }}>
        <button type="button" onClick={onBack} aria-label="返回" className="border-0 cursor-pointer rounded-full flex items-center justify-center" style={{ width: 34, height: 34, background: 'rgba(255,255,255,0.9)' }}>
          <ArrowLeft style={{ width: 16, height: 16, color: chromeInk }} />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: chromeInk }}>{owner === 'me' ? 'Nox 的日记' : 'Angel 的日记'}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setOwner(owner === 'me' ? 'her' : 'me')}
          className="border-0 cursor-pointer rounded-full"
          style={{ padding: '7px 12px', fontSize: 11, fontWeight: 600, color: ink, background: 'rgba(255,255,255,0.9)' }}
        >
          Ta的日记
        </button>
      </div>

      {/* 日期戳（点击看往期）+ 心情基调 */}
      <div className="flex items-center justify-center" style={{ marginTop: 12, gap: 8 }}>
        <button
          type="button"
          onClick={() => setDatesOpen(true)}
          className="border-0 cursor-pointer rounded-full flex items-center"
          style={{ gap: 6, padding: '7px 14px', background: 'rgba(255,255,255,0.9)', boxShadow: '0 2px 10px rgba(120,90,60,0.10)' }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: '#4a3a2e' }}>{fmtDiaryDateStamp(viewDate)}</span>
          <CaretDown style={{ width: 12, height: 12, color: '#9a8a76' }} />
        </button>
        {entry && (
          <span className="flex items-center" style={{ gap: 4, fontSize: 10, color: paper.metaInk, background: 'rgba(255,255,255,0.7)', borderRadius: 999, padding: '3px 9px' }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: MOOD_DOT[mood] }} />
            {MOOD_LABELS[mood]}
          </span>
        )}
        {!isToday && <span style={{ fontSize: 10, color: chromeInk === '#e8ecf5' ? '#aab4cc' : '#8a7a64', background: 'rgba(255,255,255,0.35)', borderRadius: 999, padding: '3px 9px' }}>往期 · 只读</span>}
      </div>

      {/* 笔记纸 */}
      <div className="px-4" style={{ marginTop: 14 }}>
        <PaperSheet mood={mood} minHeight={280}>
          {!content ? (
            <div className="flex flex-col items-center" style={{ padding: '30px 0 14px', gap: 8 }}>
              <span style={{ fontSize: 30, opacity: 0.7 }}>🖋️</span>
              <p style={{ margin: 0, fontFamily: fontStack, fontSize: 13, color: paper.metaInk, lineHeight: 1.8, textAlign: 'center' }}>
                这一页还是空白的。
                <br />
                {owner === 'me' ? '写点什么，或者喊 Nox 写一篇。' : '把今天留下来。'}
              </p>
            </div>
          ) : his ? (
            <div style={{ fontFamily: fontStack, color: paper.ink }}>
              {his.title && <p style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: paper.titleInk, lineHeight: 1.5 }}>{his.title}</p>}
              {his.meta && <p style={{ margin: '0 0 14px', fontSize: 12, color: paper.metaInk }}>{his.meta}</p>}
              <div style={{ fontSize: 14, lineHeight: 2 }}>
                <DiaryBody content={his.body} anchors={hisSelfAnchors} />
              </div>
            </div>
          ) : (
            <div style={{ fontFamily: fontStack, color: paper.ink, fontSize: 14 }}>
              <DiaryBody content={content} anchors={herAnchors} />
            </div>
          )}
        </PaperSheet>

        {/* 今日操作行 */}
        {isToday && content && (
          <div className="flex items-center justify-center" style={{ marginTop: 12, gap: 8 }}>
            <Pill onClick={() => setWriteOpen(true)} ink={ink} ghost><PencilSimple style={{ width: 13, height: 13 }} /> 编辑</Pill>
            {owner === 'me' && entry?.generated && (
              <Pill onClick={() => setRerollConfirm(true)} ink={ink} disabled={busy === 'diary'}>
                {busy === 'diary' ? <SpinnerGap className="animate-spin" style={{ width: 13, height: 13 }} /> : <Sparkle style={{ width: 13, height: 13 }} />}
                重roll
              </Pill>
            )}
            {owner === 'me' && entry && (
              <Pill onClick={() => setReviewOpen(true)} ink={REVIEW_INK} ghost>
                <PencilSimple style={{ width: 13, height: 13 }} /> {entry.review?.content ? '改批阅' : '写批阅'}
              </Pill>
            )}
            <Pill onClick={() => setDelConfirm('entry')} ink="#c26b6b" ghost><Trash style={{ width: 13, height: 13 }} /> 删除</Pill>
          </div>
        )}

        {/* 空态操作行 */}
        {isToday && !content && (
          <div className="flex items-center justify-center" style={{ marginTop: 12, gap: 8 }}>
            <Pill onClick={() => setWriteOpen(true)} ink={ink}><PencilSimple style={{ width: 13, height: 13 }} /> {owner === 'me' ? '手动写' : '写日记'}</Pill>
            {owner === 'me' && (
              <Pill onClick={() => setGenFor('diary')} ink={ink} disabled={busy === 'diary'}>
                {busy === 'diary' ? <SpinnerGap className="animate-spin" style={{ width: 13, height: 13 }} /> : <Sparkle style={{ width: 13, height: 13 }} />}
                喊他写
              </Pill>
            )}
          </div>
        )}
      </div>

      {/* 他的日记下面：她的批阅卡（棕墨便签，可删） */}
      {owner === 'me' && entry?.review?.content && (
        <div className="px-4" style={{ marginTop: 14 }}>
          <div className="relative rounded-2xl" style={{ background: '#fffaf0', border: '1px solid #eadfca', boxShadow: '0 6px 18px rgba(120,90,60,0.10)', padding: '14px 16px', transform: 'rotate(-0.6deg)' }}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: REVIEW_INK }}>ANGEL 的批阅</span>
              {isToday && (
                <button type="button" onClick={() => setDelConfirm('review')} aria-label="删除批阅" className="border-0 cursor-pointer p-1 rounded-full" style={{ background: 'transparent' }}>
                  <Trash style={{ width: 13, height: 13, color: '#c9b09a' }} />
                </button>
              )}
            </div>
            <p style={{ margin: '8px 0 0', fontFamily: fontStack, fontSize: 13, color: '#5a4a38', lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>{entry.review.content}</p>
          </div>
          {isToday && (
            <div className="flex items-center justify-center" style={{ marginTop: 10, gap: 8 }}>
              <Pill onClick={() => setReviewOpen(true)} ink={REVIEW_INK} ghost><PencilSimple style={{ width: 13, height: 13 }} /> 改批阅</Pill>
              <Pill onClick={() => setForwardKind('review-his')} ink={REVIEW_INK}><PaperPlaneTilt style={{ width: 13, height: 13 }} /> 转发给他</Pill>
            </div>
          )}
        </div>
      )}

      {/* 她的日记下面：他的批注动作行（标记渲染在纸面句子上了） */}
      {owner === 'her' && content && (
        <div className="px-4" style={{ marginTop: 14 }}>
          {entry?.review?.anchors?.length ? (
            <div className="rounded-2xl" style={{ background: '#f2f7fd', border: '1px solid #dde9f7', padding: '12px 16px' }}>
              <span className="flex items-center" style={{ gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: NOTE_INK }}>
                NOX 的批注 · {fmtDiaryMeta(viewDate, new Date())}
                {entry.review.summary && <span style={{ fontWeight: 400, letterSpacing: 0, color: '#7a93b8' }}>· {entry.review.summary}</span>}
              </span>
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#7a93b8', lineHeight: 1.7 }}>划线、圈点和蓝墨小批已经写在日记纸上了。</p>
            </div>
          ) : (
            isToday && (
              <button
                type="button"
                onClick={() => setGenFor('annotate')}
                disabled={busy === 'annotate'}
                className="border-0 cursor-pointer rounded-full flex items-center justify-center mx-auto"
                style={{ gap: 6, padding: '11px 22px', fontSize: 13, fontWeight: 700, color: '#fff', background: busy === 'annotate' ? '#9db4d6' : NOTE_INK }}
              >
                {busy === 'annotate' ? <SpinnerGap className="animate-spin" style={{ width: 14, height: 14 }} /> : <Sparkle style={{ width: 14, height: 14 }} />}
                {busy === 'annotate' ? 'Nox 正在批注…' : '喊他来看'}
              </button>
            )
          )}
          {entry?.review?.anchors?.length && isToday && (
            <div className="flex items-center justify-center" style={{ marginTop: 10, gap: 8 }}>
              <Pill onClick={() => setGenFor('annotate')} ink={NOTE_INK} disabled={busy === 'annotate'}>
                {busy === 'annotate' ? <SpinnerGap className="animate-spin" style={{ width: 13, height: 13 }} /> : <Sparkle style={{ width: 13, height: 13 }} />}
                重roll
              </Pill>
              <Pill onClick={() => setForwardKind('review-hers')} ink={NOTE_INK}><PaperPlaneTilt style={{ width: 13, height: 13 }} /> 转发给他</Pill>
            </div>
          )}
        </div>
      )}

      {/* 交换日记卡（只属于今天） */}
      {isToday && (
        <div className="px-4" style={{ marginTop: 16 }}>
          <div className="rounded-3xl" style={{ background: 'rgba(255,255,255,0.92)', boxShadow: '0 8px 24px rgba(120,90,60,0.10)', padding: 14, border: '1px solid #eee3cf' }}>
            <div className="flex items-center justify-between">
              <span className="flex items-center" style={{ gap: 6, fontSize: 13, fontWeight: 700, color: '#3a2a33' }}>
                <ArrowsLeftRight style={{ width: 15, height: 15, color: HER_INK }} /> 交换日记
              </span>
              <span style={{ fontSize: 10, color: '#9a8a76' }}>{steps.filter((s) => s.done).length}/4</span>
            </div>
            <div className="flex items-center flex-wrap" style={{ gap: 6, marginTop: 8 }}>
              {steps.map((s) => (
                <span key={s.label} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 999, background: s.done ? '#eef6f0' : '#f6f0e4', color: s.done ? '#4a7a56' : '#a5937c' }}>
                  {s.done ? '✓ ' : ''}{s.label}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setExchangeOpen(true)}
              className="border-0 cursor-pointer rounded-full flex items-center justify-center w-full"
              style={{ gap: 6, marginTop: 10, padding: '10px 0', fontSize: 12, fontWeight: 700, color: '#fff', background: ink }}
            >
              {steps.every((s) => s.done) ? '交换完成 · 去转发卡片' : '交换日记'}
            </button>
          </div>
        </div>
      )}

      {/* 弹层 */}
      {writeOpen && (
        <WriteModal
          owner={owner}
          initial={content}
          initialMood={mood}
          onSave={(text, m) => saveDiaryEntry({ owner, content: text, mood: m, generated: owner === 'me' ? false : undefined })}
          onClose={() => setWriteOpen(false)}
        />
      )}
      {reviewOpen && todayMe?.content && (
        <ReviewWriteModal
          initial={todayMe.review?.content ?? ''}
          onSave={(text) => {
            const now = new Date().toISOString();
            setDiaryReview(today, 'me', { content: text, createdAt: now, updatedAt: now });
          }}
          onClose={() => setReviewOpen(false)}
        />
      )}
      {datesOpen && <DatesSheet owner={owner} entries={dateEntries} onPick={setViewDate} onClose={() => setDatesOpen(false)} />}
      {genFor && (
        <GenModal
          title={genFor === 'diary' ? '喊 Nox 写今天的日记' : '喊 Nox 来批注'}
          note={genFor === 'diary' ? '选一下这篇日记用什么语言写。他会结合最近聊天记录写今天的一天，并给自己留几处旁批。' : '选一下旁批用什么语言写。他会用你的句子编号在你的日记上划线、圈点、留小批。'}
          langs={langs}
          onToggle={toggleLang}
          busy={busy !== null}
          onStart={() => {
            const useLangs = [...langs];
            setGenFor(null);
            if (genFor === 'diary') handleGenerate(useLangs);
            else handleAnnotate(useLangs);
          }}
          onClose={() => setGenFor(null)}
        />
      )}
      {exchangeOpen && (
        <ExchangeModal steps={steps} onJump={jumpFromExchange} onForward={(k) => { setExchangeOpen(false); setForwardKind(k); }} onClose={() => setExchangeOpen(false)} />
      )}
      {forwardKind && (
        <ForwardPicker
          onClose={() => setForwardKind(null)}
          onPick={async (c) => { await doForward(c); }}
        />
      )}
      <ConfirmDialog
        isOpen={rerollConfirm}
        title="重新生成今天的日记"
        message="Nox 会重新写一篇今天的日记，原来这篇会被替换（她的批阅保留）。"
        confirmText="重新生成"
        onConfirm={() => { setRerollConfirm(false); setGenFor('diary'); }}
        onCancel={() => setRerollConfirm(false)}
      />
      <ConfirmDialog
        isOpen={delConfirm === 'entry'}
        title="删除今天的日记"
        message={owner === 'me' ? '今天的日记会删掉，Angel 的批阅也会一起删掉。往期日记不受影响。' : '今天的日记会删掉。往期日记不受影响。'}
        confirmText="删除"
        variant="danger"
        onConfirm={() => { deleteDiaryEntry(viewDate, owner); setDelConfirm(null); addToast('已删除', 'success'); }}
        onCancel={() => setDelConfirm(null)}
      />
      <ConfirmDialog
        isOpen={delConfirm === 'review'}
        title="删除批阅"
        message="你对 Nox 日记的批阅会删掉。"
        confirmText="删除"
        variant="danger"
        onConfirm={() => { deleteDiaryReview(today, 'me'); setDelConfirm(null); addToast('批阅已删除', 'success'); }}
        onCancel={() => setDelConfirm(null)}
      />
    </div>
  );
};

export default CoupleDiary;

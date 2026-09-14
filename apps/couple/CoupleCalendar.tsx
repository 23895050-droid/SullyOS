// c1 日历多功能页（2026-08-20 起）——四模式：日常 / 活动 / 月经 / 纪念日
// 月经模式 = CouplePeriod 真内容；日常页 = 轻量月视图红标 + 待办（日历下面）+ 当天记录 + 转发（当天日常/待办二选一）
// 活动页 = 月经记录同步时间轴（她的粉 · 我的蓝，分条转发）；纪念日 = 卡片 + 添加 + 长按编辑/删除（删除确认框）+ 单条转发
// 入口：首屏纪念日倒计时卡、日历卡（默认日常）；组合卡经期区 → 月经模式（initialMode）
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, PaperPlaneTilt, PencilSimple, Plus, Trash, X } from '@phosphor-icons/react';
import { loadCoupleBeauty, buildTheme } from './CoupleBeauty';
import CouplePeriod, { CycleMonthView, derive, EVENT_STYLE, ForwardPicker, hhmm, MedCard } from './CouplePeriod';
import CoupleTimeline, { TimelineItem } from './CoupleTimeline';
import { forwardCoupleCard } from './coupleForward';
import { deletePeriodEvent, usePeriodStore } from './periodStore';
import { addTodo, deleteTodo, fixedTodos, shortTodosOn, toggleTodo, useTodoStore, type CoupleTodo, type TodoKind } from './todoStore';
import { daysUntilAnniv, deleteAnniv, saveAnniv, useAnnivStore, type Anniversary } from './annivStore';
import { ACTIVITY_KIND_LABELS, ACTIVITY_OWNER_COLORS, deleteActivity, useActivityStore } from './activityStore';
import DateStrip from './DateStrip';
import BoardPanel from './BoardPanel';
import ConfirmDialog from '../../components/os/ConfirmDialog';
import { getLocalDateKey } from '../../utils/localDate';
import { FLOW_LABELS, SYMPTOM_LABELS } from '../../utils/periodMath';

const MODES = [
  { key: 'daily', label: '日常' },
  { key: 'feed', label: '活动' },
  { key: 'period', label: '月经' },
  { key: 'anniv', label: '纪念日' },
] as const;
type ModeKey = (typeof MODES)[number]['key'];

const CARD: React.CSSProperties = { background: '#fff', borderRadius: 24, boxShadow: 'var(--cs-shadow-soft, 0 10px 30px rgba(233,160,190,0.16), 0 2px 8px rgba(60,30,50,0.05))' };
const TITLE: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#9a7a8a', letterSpacing: '0.1em' };
const NOTE: React.CSSProperties = { fontSize: 11, color: '#b0909c', lineHeight: 1.7 };

// ── 长按 hook（纪念日卡片：编辑/删除菜单；触屏 500ms + PC 右键） ──
const useLongPress = (onLong: () => void) => {
  const timer = useRef<number | null>(null);
  return {
    onTouchStart: () => {
      timer.current = window.setTimeout(onLong, 500);
    },
    onTouchEnd: () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    onTouchMove: () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onLong();
    },
  };
};

// ── 活动模式（月经记录同步：她的粉 · 我的蓝，分条转发） ──
const FeedMode: React.FC = () => {
  const store = usePeriodStore();
  const actStore = useActivityStore();
  const [selected, setSelected] = useState(getLocalDateKey());
  const [fwd, setFwd] = useState<{ title: string; body: string } | null>(null);

  // 双源合并：当天月经记录（periodStore 派生，她的粉）+ 当天活动日志（待办/纪念日/记账/饮食），新的在前
  const items: TimelineItem[] = useMemo(() => {
    const out: Array<{ createdAt: string; item: TimelineItem }> = [];

    for (const e of store.events.filter((x) => x.date === selected)) {
      const s = EVENT_STYLE[e.type];
      const detail: string[] = [];
      if (e.type === 'period' && e.flow) detail.push(FLOW_LABELS[e.flow]);
      if (e.pain) detail.push(`痛经${e.pain}级`);
      const bodyText = [s.label, ...detail, e.symptoms.map((k) => SYMPTOM_LABELS[k]).join('/'), e.note]
        .filter(Boolean).join('，');
      out.push({
        createdAt: e.createdAt,
        item: {
          id: e.id,
          time: hhmm(e.createdAt),
          color: e.owner === 'me' ? '#5b9cf0' : '#f0a8c0',
          body: (
            <div
              className="flex items-start justify-between"
              style={{ background: '#fff', border: `1px solid ${e.owner === 'me' ? '#cfe0f7' : '#f8dbe5'}`, borderRadius: 16, padding: '10px 12px', gap: 8 }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 13, fontWeight: 700, color: s.color === '#383639' ? '#383639' : s.color }}>{s.label}</span>
                  {detail.length > 0 && <span style={{ fontSize: 11, color: '#6a5a63' }}>{detail.join(' · ')}</span>}
                </div>
                {e.symptoms.length > 0 && (
                  <div className="flex flex-wrap" style={{ gap: 4, marginTop: 6 }}>
                    {e.symptoms.map((k) => (
                      <span key={k} className="rounded-full" style={{ fontSize: 10, color: '#6a5a63', background: '#f6f1f4', padding: '2px 8px' }}>{SYMPTOM_LABELS[k]}</span>
                    ))}
                  </div>
                )}
                {e.note && <div style={{ fontSize: 11, color: '#6a5a63', marginTop: 6, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{e.note}</div>}
              </div>
              <span className="flex flex-col items-center shrink-0" style={{ gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setFwd({ title: `${s.label} · ${e.date}`, body: bodyText })}
                  aria-label="转发这条"
                  className="border-0 cursor-pointer rounded-full p-1.5"
                  style={{ background: 'var(--cs-soft, #fce8f1)' }}
                >
                  <PaperPlaneTilt style={{ width: 12, height: 12, color: '#8a5a6e' }} />
                </button>
                <button
                  type="button"
                  onClick={() => deletePeriodEvent(e.id)}
                  aria-label="删除这条"
                  className="border-0 cursor-pointer rounded-full p-1.5"
                  style={{ background: '#fdeef0' }}
                >
                  <Trash style={{ width: 12, height: 12, color: '#c98b95' }} />
                </button>
              </span>
            </div>
          ),
        },
      });
    }

    for (const a of actStore.events.filter((x) => x.date === selected)) {
      const color = ACTIVITY_OWNER_COLORS[a.owner];
      out.push({
        createdAt: a.createdAt,
        item: {
          id: a.id,
          time: hhmm(a.createdAt),
          color,
          body: (
            <div
              className="flex items-start justify-between"
              style={{ background: '#fff', border: '1px solid rgba(160,140,150,0.18)', borderRadius: 16, padding: '10px 12px', gap: 8 }}
            >
              <div className="flex-1 min-w-0">
                <span className="rounded-full" style={{ fontSize: 10, fontWeight: 700, color, background: `${color}1f`, padding: '2px 8px' }}>
                  {ACTIVITY_KIND_LABELS[a.kind]}
                </span>
                <div style={{ fontSize: 12, color: '#3a2a33', marginTop: 6, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{a.text}</div>
              </div>
              <span className="flex flex-col items-center shrink-0" style={{ gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setFwd({ title: `${ACTIVITY_KIND_LABELS[a.kind]} · ${a.date}`, body: a.text })}
                  aria-label="转发这条"
                  className="border-0 cursor-pointer rounded-full p-1.5"
                  style={{ background: 'var(--cs-soft, #fce8f1)' }}
                >
                  <PaperPlaneTilt style={{ width: 12, height: 12, color: '#8a5a6e' }} />
                </button>
                <button
                  type="button"
                  onClick={() => deleteActivity(a.id)}
                  aria-label="删除这条"
                  className="border-0 cursor-pointer rounded-full p-1.5"
                  style={{ background: '#fdeef0' }}
                >
                  <Trash style={{ width: 12, height: 12, color: '#c98b95' }} />
                </button>
              </span>
            </div>
          ),
        },
      });
    }

    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((x) => x.item);
  }, [store.events, actStore.events, selected]);

  // 全库最近一条记录的日期：导入的数据都是过去的日子，今天为空时给个「去看看」跳过去（防「导入丢了」错觉）
  const latestDate = useMemo(() => {
    const dates = [...store.events.map((e) => e.date), ...actStore.events.map((a) => a.date)];
    return dates.length > 0 ? dates.sort().reverse()[0] : null;
  }, [store.events, actStore.events]);

  return (
    <>
      <div className="rounded-3xl p-4 flex flex-col" style={CARD}>
        <div style={TITLE}>活动 · 时间轴</div>
        <div style={{ marginTop: 8 }}>
          <DateStrip selected={selected} onSelect={setSelected} />
        </div>
        {items.length === 0 && latestDate && latestDate !== selected && (
          <div className="flex items-center justify-between rounded-2xl" style={{ marginTop: 10, padding: '8px 12px', background: '#fff5f9' }}>
            <span style={{ fontSize: 11, color: '#9a7a8a' }}>这一天没有记录；最近一条在 {latestDate}</span>
            <button
              type="button"
              onClick={() => setSelected(latestDate)}
              className="border-0 cursor-pointer rounded-full"
              style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600, color: '#fff', background: 'var(--cs-accent, #f0a8c0)' }}
            >
              去看看
            </button>
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <CoupleTimeline
            items={items}
            empty="这一天还没有记录。待办、纪念日、记账、月经都会自动同步到这里。"
          />
        </div>
      </div>
      {fwd && (
        <ForwardPicker
          onClose={() => setFwd(null)}
          onPick={async (c) => {
            try {
              await forwardCoupleCard(c, { kind: '活动', title: fwd.title, body: fwd.body });
            } catch {
              // 静默
            }
            setFwd(null);
          }}
        />
      )}
    </>
  );
};

// ── 待办（日历下面：固定每日 + 短期；样式同首页带复选框卡片） ──
const TodoBoard: React.FC<{ today: string }> = ({ today }) => {
  const store = useTodoStore();
  const [addOpen, setAddOpen] = useState(false);
  const fixed = fixedTodos(store.todos);
  const shorts = shortTodosOn(store.todos, today);

  const renderRow = (t: CoupleTodo) => {
    const checked = t.kind === 'fixed' ? t.doneDates.includes(today) : t.done;
    return (
      <div key={t.id} className="flex items-center" style={{ gap: 10, padding: '8px 2px', borderBottom: '1px solid #f7e8ef' }}>
        <button
          type="button"
          onClick={() => toggleTodo(t.id, today)}
          aria-label="勾选"
          className="border-0 cursor-pointer rounded-full flex items-center justify-center shrink-0"
          style={{ width: 22, height: 22, background: checked ? 'var(--cs-accent, #f0a8c0)' : '#fff', border: `1.5px solid ${checked ? 'var(--cs-accent, #f0a8c0)' : '#e0d1d4'}`, boxSizing: 'border-box' }}
        >
          {checked && <Check style={{ width: 13, height: 13, color: '#fff' }} weight="bold" />}
        </button>
        <span className="flex-1 min-w-0" style={{ fontSize: 13, color: checked ? '#b0909c' : '#3a2a33', textDecoration: checked ? 'line-through' : 'none', wordBreak: 'break-word' }}>
          {t.text}
        </span>
        {t.kind === 'fixed' && <span className="rounded-full shrink-0" style={{ fontSize: 9, color: '#b0909c', background: '#f6f1f4', padding: '1px 6px' }}>每天</span>}
        <button type="button" onClick={() => deleteTodo(t.id)} aria-label="删除" className="border-0 cursor-pointer shrink-0" style={{ background: 'transparent' }}>
          <Trash style={{ width: 13, height: 13, color: '#c9b4c0' }} />
        </button>
      </div>
    );
  };

  return (
    <div className="rounded-3xl p-4 flex flex-col" style={CARD}>
      <div className="flex items-center justify-between">
        <span style={TITLE}>TO DO</span>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          aria-label="添加待办"
          className="border-0 cursor-pointer rounded-full flex items-center justify-center"
          style={{ width: 26, height: 26, background: 'var(--cs-accent, #f0a8c0)' }}
        >
          <Plus style={{ width: 14, height: 14, color: '#fff' }} weight="bold" />
        </button>
      </div>
      <div style={{ marginTop: 6 }}>
        {fixed.map(renderRow)}
        {shorts.map(renderRow)}
        {fixed.length === 0 && shorts.length === 0 && (
          <p style={{ ...NOTE, marginTop: 4 }}>点右上角 + 添加待办：固定（每天出现）/ 短期（只在某天出现）</p>
        )}
      </div>
      {addOpen && <TodoModal onClose={() => setAddOpen(false)} today={today} />}
    </div>
  );
};

const TodoModal: React.FC<{ onClose: () => void; today: string }> = ({ onClose, today }) => {
  const [kind, setKind] = useState<TodoKind>('fixed');
  const [text, setText] = useState('');
  const [date, setDate] = useState(today);
  const save = () => {
    if (!text.trim()) return;
    addTodo({ text: text.trim(), kind, date: kind === 'short' ? date : undefined });
    onClose();
  };
  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 120, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 16, gap: 12 }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 15, fontWeight: 700, color: '#3a2a33' }}>添加待办</span>
          <button type="button" onClick={onClose} aria-label="关闭" className="border-0 cursor-pointer rounded-full p-2" style={{ background: 'var(--cs-soft, #fce8f1)' }}>
            <X style={{ width: 15, height: 15, color: '#8a5a6e' }} />
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button" onClick={() => setKind('fixed')}
            className="flex-1 border-0 cursor-pointer rounded-full"
            style={{ padding: '8px 0', fontSize: 12, fontWeight: 600, background: kind === 'fixed' ? 'var(--cs-accent, #f0a8c0)' : '#f6f1f4', color: kind === 'fixed' ? '#fff' : '#6a5a63' }}
          >
            固定 · 每天
          </button>
          <button
            type="button" onClick={() => setKind('short')}
            className="flex-1 border-0 cursor-pointer rounded-full"
            style={{ padding: '8px 0', fontSize: 12, fontWeight: 600, background: kind === 'short' ? 'var(--cs-accent, #f0a8c0)' : '#f6f1f4', color: kind === 'short' ? '#fff' : '#6a5a63' }}
          >
            短期 · 一天
          </button>
        </div>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={kind === 'fixed' ? '每天都想做的事，比如「吃药」' : '这天要做的事'}
          style={{ fontSize: 13, color: '#3a2a33', border: '1px solid #e8d5de', borderRadius: 14, padding: '10px 12px', background: '#fdf8fa', outline: 'none' }}
        />
        {kind === 'short' && (
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            style={{ fontSize: 13, color: '#3a2a33', border: '1px solid #e8d5de', borderRadius: 14, padding: '10px 12px', background: '#fdf8fa', outline: 'none' }}
          />
        )}
        <button
          type="button" onClick={save} disabled={!text.trim()}
          className="border-0 cursor-pointer rounded-full"
          style={{ padding: '11px 0', fontSize: 14, fontWeight: 700, color: '#fff', background: text.trim() ? 'var(--cs-accent, #f0a8c0)' : '#e8dce2' }}
        >
          保存
        </button>
      </div>
    </div>
  );
};

// ── 纪念日模式（一个纪念日一张卡；长按编辑/删除；删除弹确认框；单条转发） ──

const AnnivCard: React.FC<{ a: Anniversary; onMenu: (a: Anniversary) => void; onFwd: (p: { title: string; body: string }) => void }> = ({ a, onMenu, onFwd }) => {
  const now = new Date();
  const d = daysUntilAnniv(a.date, now);
  const lp = useLongPress(() => onMenu(a));
  const cardBody = `${a.title}（${a.date}）${a.note ? ` · ${a.note}` : ''}${d === 0 ? ' · 就是今天！' : ` · 还有 ${d} 天`}`;
  return (
    <button
      type="button"
      {...lp}
      className="rounded-3xl p-4 flex items-center gap-3 border-0 cursor-pointer text-left"
      style={CARD}
    >
      <span className="flex items-center justify-center rounded-2xl shrink-0" style={{ width: 44, height: 44, background: 'var(--cs-soft, #fce8f1)', fontSize: 22 }}>
        {a.emoji}
      </span>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 14, fontWeight: 700, color: '#3a2a33' }}>{a.title}</div>
        <div style={{ fontSize: 11, color: '#b0909c', marginTop: 3 }}>
          {a.date.slice(0, 2)}月{a.date.slice(3)}日 · {d === 0 ? '就是今天！' : `还有 ${d} 天`}
        </div>
        {a.note && <div style={{ fontSize: 11, color: '#9a7a8a', marginTop: 3 }}>{a.note}</div>}
      </div>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onFwd({ title: a.title, body: cardBody });
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onFwd({ title: a.title, body: cardBody }); } }}
        aria-label="转发"
        className="rounded-full flex items-center justify-center shrink-0"
        style={{ width: 30, height: 30, background: 'var(--cs-soft, #fce8f1)' }}
      >
        <PaperPlaneTilt style={{ width: 13, height: 13, color: '#8a5a6e' }} />
      </span>
    </button>
  );
};

const AnnivMode: React.FC = () => {
  const store = useAnnivStore();
  const now = new Date();
  const [modal, setModal] = useState<null | { editing?: Anniversary }>(null);
  const [menu, setMenu] = useState<Anniversary | null>(null);
  const [del, setDel] = useState<Anniversary | null>(null);
  const [fwd, setFwd] = useState<{ title: string; body: string } | null>(null);
  const sorted = [...store.items].sort((a, b) => daysUntilAnniv(a.date, now) - daysUntilAnniv(b.date, now));

  return (
    <>
      <div className="flex flex-col gap-3">
        {sorted.map((a) => (
          <AnnivCard key={a.id} a={a} onMenu={setMenu} onFwd={setFwd} />
        ))}
        {/* 添加纪念日 */}
        <button
          type="button"
          onClick={() => setModal({})}
          className="rounded-3xl p-4 flex items-center justify-center gap-2 border-0 cursor-pointer"
          style={{ border: '1.5px dashed #e0c6d2', background: 'transparent' }}
        >
          <Plus style={{ width: 15, height: 15, color: '#9a7a8a' }} />
          <span style={{ fontSize: 13, color: '#9a7a8a', fontWeight: 600 }}>添加纪念日</span>
        </button>
      </div>

      {/* 长按菜单 */}
      {menu && (
        <div
          className="fixed inset-0 flex items-end justify-center"
          style={{ zIndex: 120, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setMenu(null); }}
        >
          <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 10, gap: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#3a2a33', textAlign: 'center', padding: '6px 0' }}>{menu.title}</div>
            <button
              type="button" onClick={() => { setModal({ editing: menu }); setMenu(null); }}
              className="border-0 cursor-pointer rounded-2xl flex items-center justify-center gap-2"
              style={{ padding: '11px 0', fontSize: 13, fontWeight: 600, color: '#3a2a33', background: '#f6f1f4' }}
            >
              <PencilSimple style={{ width: 14, height: 14 }} />编辑
            </button>
            <button
              type="button" onClick={() => { setDel(menu); setMenu(null); }}
              className="border-0 cursor-pointer rounded-2xl flex items-center justify-center gap-2"
              style={{ padding: '11px 0', fontSize: 13, fontWeight: 600, color: '#e35d6a', background: '#fdeef0' }}
            >
              <Trash style={{ width: 14, height: 14 }} />删除
            </button>
            <button
              type="button" onClick={() => setMenu(null)}
              className="border-0 cursor-pointer"
              style={{ padding: '9px 0', fontSize: 12, color: '#9a7a8a', background: 'transparent' }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 添加/编辑弹卡 */}
      {modal && <AnnivModal initial={modal.editing} onClose={() => setModal(null)} />}

      {/* 删除确认框 */}
      <ConfirmDialog
        isOpen={!!del}
        title={`删除「${del?.title ?? ''}」吗？`}
        message="删除后不可恢复。"
        variant="danger"
        confirmText="删除"
        onConfirm={() => { if (del) deleteAnniv(del.id); setDel(null); }}
        onCancel={() => setDel(null)}
      />

      {/* 单条转发 */}
      {fwd && (
        <ForwardPicker
          onClose={() => setFwd(null)}
          onPick={async (c) => {
            try {
              await forwardCoupleCard(c, { kind: '纪念日', title: fwd.title, body: fwd.body });
            } catch {
              // 静默
            }
            setFwd(null);
          }}
        />
      )}
    </>
  );
};

const AnnivModal: React.FC<{ initial?: Anniversary; onClose: () => void }> = ({ initial, onClose }) => {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(initial ? `2026-${initial.date}` : '2026-01-01');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '💙');
  const [note, setNote] = useState(initial?.note ?? '');
  const save = () => {
    if (!title.trim() || date.length < 10) return;
    saveAnniv({ id: initial?.id, title: title.trim(), date: date.slice(5), emoji: emoji.trim() || '💙', note: note.trim() });
    onClose();
  };
  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 120, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 16, gap: 12 }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 15, fontWeight: 700, color: '#3a2a33' }}>{initial ? '编辑纪念日' : '添加纪念日'}</span>
          <button type="button" onClick={onClose} aria-label="关闭" className="border-0 cursor-pointer rounded-full p-2" style={{ background: 'var(--cs-soft, #fce8f1)' }}>
            <X style={{ width: 15, height: 15, color: '#8a5a6e' }} />
          </button>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="纪念日名字，如「第一次旅行」" style={{ fontSize: 13, color: '#3a2a33', border: '1px solid #e8d5de', borderRadius: 14, padding: '10px 12px', background: '#fdf8fa', outline: 'none' }} />
        <div className="flex items-center" style={{ gap: 8 }}>
          <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} style={{ width: 52, fontSize: 16, textAlign: 'center', color: '#3a2a33', border: '1px solid #e8d5de', borderRadius: 14, padding: '10px 0', background: '#fdf8fa', outline: 'none' }} />
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ flex: 1, fontSize: 13, color: '#3a2a33', border: '1px solid #e8d5de', borderRadius: 14, padding: '10px 12px', background: '#fdf8fa', outline: 'none' }} />
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注（可选），如「2024-01-01 在一起」" style={{ fontSize: 13, color: '#3a2a33', border: '1px solid #e8d5de', borderRadius: 14, padding: '10px 12px', background: '#fdf8fa', outline: 'none' }} />
        <button
          type="button" onClick={save} disabled={!title.trim()}
          className="border-0 cursor-pointer rounded-full"
          style={{ padding: '11px 0', fontSize: 14, fontWeight: 700, color: '#fff', background: title.trim() ? 'var(--cs-accent, #f0a8c0)' : '#e8dce2' }}
        >
          保存
        </button>
      </div>
    </div>
  );
};

// ── 主组件 ──

const CoupleCalendar: React.FC<{ initialMode: ModeKey; onBack: () => void }> = ({ initialMode, onBack }) => {
  const [mode, setMode] = useState<ModeKey>(initialMode);
  // 页面常驻（CoupleSpace 2026-09-14 聚焦转场）：本组件不再每次进都重挂载，
  // initialMode 变化时手动跟一次——「经期区直进月经模式」/「日历卡回日常」两个门才能每次生效。
  useEffect(() => { setMode(initialMode); }, [initialMode]);
  const [beauty] = useState(loadCoupleBeauty);
  const theme = buildTheme(beauty.accent);
  const themeVars = {
    ['--cs-accent' as string]: theme.accent,
    ['--cs-soft' as string]: theme.soft,
    ['--cs-border' as string]: theme.border,
    ['--cs-deep' as string]: theme.deep,
    ['--cs-scroll' as string]: theme.scroll,
    ['--cs-shadow-soft' as string]: theme.shadowSoft,
    ['--cs-shadow-strong' as string]: theme.shadowStrong,
  } as React.CSSProperties;

  // ── 生理期数据（日常页轻量展示用） ──
  const periodStore = usePeriodStore();
  const today = getLocalDateKey();
  const pdata = useMemo(() => derive(periodStore, today), [periodStore, today]);
  const [dailySelected, setDailySelected] = useState(today);
  const todayEvents = periodStore.events.filter((e) => e.date === today);
  const todayMeds = periodStore.medReminders.filter((r) => r.date === today);

  // ── 日常页转发（先选内容：当天日常 / 待办含完成，再选角色） ──
  const todoStore = useTodoStore();
  const [fwdChoice, setFwdChoice] = useState(false);
  const [fwdKind, setFwdKind] = useState<null | 'day' | 'todos'>(null);
  const buildDailyText = () => {
    const lines: string[] = [`今天 · 日常（${today}）`];
    for (const e of todayEvents) {
      const s = EVENT_STYLE[e.type];
      const parts = [s.label];
      if (e.type === 'period' && e.flow) parts.push(FLOW_LABELS[e.flow]);
      if (e.pain) parts.push(`痛经${e.pain}级`);
      if (e.symptoms.length) parts.push(e.symptoms.map((k) => SYMPTOM_LABELS[k]).join('/'));
      if (e.note) parts.push(e.note);
      lines.push(parts.join('，'));
    }
    for (const r of todayMeds) lines.push(`吃药提醒：${r.text}（${r.done ? '已吃' : '还没吃'}）`);
    if (todayEvents.length === 0 && todayMeds.length === 0) lines.push('（没有生理期相关记录）');
    return lines.join('\n');
  };
  const buildTodoText = () => {
    const lines: string[] = ['待办清单'];
    const fixed = fixedTodos(todoStore.todos);
    const shorts = shortTodosOn(todoStore.todos, today);
    for (const t of fixed) lines.push(`[${t.doneDates.includes(today) ? '✓' : ' '}] ${t.text}（每天）`);
    for (const t of shorts) lines.push(`[${t.done ? '✓' : ' '}] ${t.text}（${today}）`);
    if (fixed.length === 0 && shorts.length === 0) lines.push('（还没有待办）');
    return lines.join('\n');
  };

  return (
    <div className="absolute inset-0 overflow-y-auto" style={{ paddingTop: 'calc(var(--chrome-top, 0px) + 12px)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 96px)', ...themeVars }}>
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-5 py-3">
        <button type="button" onClick={onBack} aria-label="返回" className="rounded-full p-2 border-0 cursor-pointer" style={{ background: 'rgba(255,255,255,0.9)', boxShadow: '0 2px 8px rgba(233,160,190,0.2)' }}>
          <ArrowLeft style={{ width: 20, height: 20, color: '#8a5a6e' }} />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: '#3a2a33' }}>日历</span>
      </div>
      {/* 四模式切换胶囊 */}
      <div className="mx-5 flex" style={{ background: 'rgba(255,255,255,0.9)', borderRadius: 999, padding: 4, boxShadow: '0 2px 10px rgba(233,160,190,0.12)' }}>
        {MODES.map((m) => {
          const active = mode === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className="flex-1 border-0 cursor-pointer rounded-full transition-colors duration-200"
              style={{ padding: '8px 0', fontSize: 13, fontWeight: 600, background: active ? 'var(--cs-accent, #f0a8c0)' : 'transparent', color: active ? '#fff' : '#9a7a8a' }}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      {/* 模式内容 */}
      <div className="flex flex-col gap-3 px-5 mt-4">
        {mode === 'daily' && (
          <>
            {/* 日历红标（轻量，只选不看时间轴） */}
            <CycleMonthView selected={dailySelected} onSelect={setDailySelected} quickMark={false} data={pdata} />
            {/* 待办：日历下面（固定每日 + 短期） */}
            <TodoBoard today={today} />
            {/* 当天记录 + 转发（当天日常 / 待办含完成 二选一） */}
            <div className="rounded-3xl p-4 flex flex-col gap-1" style={CARD}>
              <div className="flex items-center justify-between">
                <div style={TITLE}>今天 · 生理期</div>
                <button
                  type="button"
                  onClick={() => setFwdChoice(true)}
                  aria-label="转发"
                  className="border-0 cursor-pointer rounded-full p-1.5 flex items-center gap-1"
                  style={{ background: 'var(--cs-soft, #fce8f1)' }}
                >
                  <PaperPlaneTilt style={{ width: 13, height: 13, color: '#8a5a6e' }} />
                  <span style={{ fontSize: 10, color: '#8a5a6e' }}>转发</span>
                </button>
              </div>
              {todayEvents.length === 0 && todayMeds.length === 0 && (
                <p style={{ ...NOTE, marginTop: 6 }}>今天没有相关记录。切到「月经」tab 可以记一笔。</p>
              )}
              <div className="flex flex-col gap-2 mt-2">
                {todayEvents.map((e) => {
                  const s = EVENT_STYLE[e.type];
                  const detail: string[] = [];
                  if (e.type === 'period') {
                    if (e.flow) detail.push(FLOW_LABELS[e.flow]);
                    if (e.pain) detail.push(`痛经 ${e.pain} 级`);
                  }
                  return (
                    <div key={e.id} className="flex items-center gap-2.5" style={{ background: s.soft, borderRadius: 14, padding: '8px 12px' }}>
                      <span style={{ width: 4, borderRadius: 999, background: s.color, height: 26, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: s.color === '#383639' ? '#383639' : s.color }}>{s.label}</span>
                      {detail.length > 0 && <span style={{ fontSize: 11, color: '#6a5a63' }}>{detail.join(' · ')}</span>}
                      {e.symptoms.length > 0 && <span className="flex flex-1 flex-wrap justify-end" style={{ gap: 3 }}>
                        {e.symptoms.slice(0, 4).map((k) => (
                          <span key={k} className="rounded-full" style={{ fontSize: 9.5, color: '#6a5a63', background: 'rgba(255,255,255,0.75)', padding: '1px 6px' }}>{SYMPTOM_LABELS[k]}</span>
                        ))}
                      </span>}
                    </div>
                  );
                })}
                {todayMeds.map((r) => <MedCard key={r.id} r={r} />)}
              </div>
            </div>
            {/* 留言板：批阅今天（读日常页全量信息写留言，可贴照片 + 留档进相册） */}
            <BoardPanel />
          </>
        )}
        {mode === 'feed' && <FeedMode />}
        {mode === 'period' && <CouplePeriod />}
        {mode === 'anniv' && <AnnivMode />}
      </div>

      {/* 日常页转发：先选内容（当天日常 / 待办含完成） */}
      {fwdChoice && (
        <div
          className="fixed inset-0 flex items-end justify-center"
          style={{ zIndex: 120, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setFwdChoice(false); }}
        >
          <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 10, gap: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#3a2a33', textAlign: 'center', padding: '6px 0' }}>转发什么？</div>
            <button
              type="button"
              onClick={() => { setFwdChoice(false); setFwdKind('day'); }}
              className="border-0 cursor-pointer rounded-2xl"
              style={{ padding: '11px 0', fontSize: 13, fontWeight: 600, color: '#3a2a33', background: '#f6f1f4' }}
            >
              当天所有日常
            </button>
            <button
              type="button"
              onClick={() => { setFwdChoice(false); setFwdKind('todos'); }}
              className="border-0 cursor-pointer rounded-2xl"
              style={{ padding: '11px 0', fontSize: 13, fontWeight: 600, color: '#3a2a33', background: '#f6f1f4' }}
            >
              待办事项（含完成情况）
            </button>
            <button
              type="button" onClick={() => setFwdChoice(false)}
              className="border-0 cursor-pointer"
              style={{ padding: '9px 0', fontSize: 12, color: '#9a7a8a', background: 'transparent' }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 转发选择角色（日常页二选一内容） */}
      {fwdKind !== null && (
        <ForwardPicker
          onClose={() => setFwdKind(null)}
          onPick={async (c) => {
            const isDay = fwdKind === 'day';
            try {
              await forwardCoupleCard(c, {
                kind: isDay ? '日常' : '待办',
                title: isDay ? '今天的日常' : '待办清单',
                body: isDay ? buildDailyText() : buildTodoText(),
              });
            } catch {
              // 静默
            }
            setFwdKind(null);
          }}
        />
      )}
    </div>
  );
};

export default CoupleCalendar;

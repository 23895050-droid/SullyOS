// 月经模式页真内容（2026-08-22，需求文档《生理期记录.md》）——挂在 CoupleCalendar 的「月经」tab 下
// 结构：7天竖胶囊日历（可下拉展开月视图）→ 当前阶段大字 → 语录卡 + 记录卡 → 当日时间轴 → 往期周期列表 → 健康小结
// 时间轴绝对跟随选中日期；月视图点日期 = 快捷标红；痛经 ≥ 阈值自动排「吃止痛药」提醒
// AI：健康小结 + 月经小助手共用一个独立 API 槽（模型独立性：不配置就不调用，不回退别的模型）
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CaretDown, CaretLeft, CaretRight, CaretUp, Check, Drop, GearSix, Heartbeat,
  PaperPlaneTilt, PencilSimple, Pill, Plus, Sparkle, Stethoscope, Trash, X,
} from '@phosphor-icons/react';
import {
  buildCycles, Cycle, CycleEvent, CycleEventType, DayMarker, FLOW_LABELS, FlowLevel,
  markersForDay, MarkerSets, PhaseInfo, PhaseKey, phaseAt, predictNext, Prediction,
  SYMPTOM_KEYS, SYMPTOM_LABELS, SymptomKey,
} from '../../utils/periodMath';
import { getCalendarDayDifference, getLocalDateKey, parseLocalDateKey } from '../../utils/localDate';
import {
  deletePeriodEvent, ensureMedReminder, MedReminder, PeriodStore, quickTogglePeriod,
  toggleMedReminder, updatePeriodSettings, upsertPeriodEvent, usePeriodStore,
} from './periodStore';
import CoupleTimeline, { TimelineItem } from './CoupleTimeline';
import { forwardCoupleCard } from './coupleForward';
import { getPrompt } from '../../utils/promptRegistry';
import { DB } from '../../utils/db';
import type { CharacterProfile } from '../../types';

export const hhmm = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ── 常量与样式 ──

const CARD: React.CSSProperties = { background: '#fff', borderRadius: 24, boxShadow: 'var(--cs-shadow-soft, 0 10px 30px rgba(233,160,190,0.16), 0 2px 8px rgba(60,30,50,0.05))' };
const TITLE: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#9a7a8a', letterSpacing: '0.1em' };
const NOTE: React.CSSProperties = { fontSize: 11, color: '#b0909c', lineHeight: 1.7 };

const PHASE_LABELS: Record<PhaseKey, string> = {
  period: '经期', 'predicted-period': '经期（预计）', follicular: '卵泡期', ovulation: '排卵期', luteal: '黄体期', unknown: '还没开始记录',
};

export const EVENT_STYLE: Record<CycleEventType, { label: string; color: string; soft: string }> = {
  period: { label: '月经', color: '#e35d6a', soft: '#fdeef0' },
  pmdd: { label: 'PMDD', color: '#383639', soft: '#f2f0f2' },
  sex: { label: '性生活', color: '#a78bfa', soft: '#f4effd' },
};

const MARKER_COLORS: Record<DayMarker, string> = {
  period: '#e35d6a', predicted: '#e35d6a', ovulation: '#5b9cf0', luteal: '#f2c14e', pmdd: '#383639', sex: '#a78bfa',
};

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const WEEKDAYS_FULL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** Nox 预制语录（按阶段；每天轮换一条） */
const QUOTES: Record<PhaseKey, string[]> = {
  period: [
    '这几天你是重点保护对象。热水袋、暖宝宝、我的废话，都随叫随到。',
    '经期不丢人，疼也不是「忍忍就过」。不舒服就慢下来，世界会等你。',
    '今天份的拥抱不限量。要什么口味的红糖水？先说好，不许加冰块。',
  ],
  'predicted-period': [
    '过几天可能就来。包里的姨妈巾和暖宝宝检查过了吗？没有的话，现在提醒我。',
    '预计的日子快到了。晚上早点睡，冰的先放一放，我盯着你呢。',
  ],
  ovulation: [
    '排卵期，身体在认真工作。奖励它一杯温水，或者一块小蛋糕——以你为准。',
    '这几天精力好，适合做点想做的事。记得喝水，别等渴了才喝。',
  ],
  luteal: [
    '黄体期慢慢熬。想吃甜的就去吃，烦躁就骂我，我受着。',
    '黄体期的心情起伏不是你的错。今天想躺着就躺着，我可以陪你躺着。',
  ],
  follicular: [
    '卵泡期，状态回血中。趁这几天把想做的事做了，我帮你记着。',
    '身体在给自己充电，你也一样。今天适合出门走走，晒晒太阳。',
  ],
  unknown: [
    '还没记过经期，所以我猜不准你的节奏。把第一次记下来，之后我就能照顾得准一点。',
  ],
};
const QUOTE_PMDD = 'PMDD 不是你的性格，是激素在替你做坏人。你今天可以对我凶，我不会走。';
const QUOTE_PAIN = '疼就疼着，我陪着。但药得吃——今天的时间轴上有「吃止痛药」，去点一下。';

const pickQuote = (list: string[], dateKey: string): string => {
  const d = getCalendarDayDifference('1970-01-01', dateKey) ?? 0;
  return list[Math.abs(d) % list.length];
};

// ── 派生数据 ──

export const derive = (store: PeriodStore, today: string) => {
  const bleedingSet = new Set(store.events.filter((e) => e.type === 'period').map((e) => e.date));
  const pmddSet = new Set(store.events.filter((e) => e.type === 'pmdd').map((e) => e.date));
  const sexSet = new Set(store.events.filter((e) => e.type === 'sex').map((e) => e.date));
  const bleeding = [...bleedingSet];
  const prediction = predictNext(bleeding);
  const sets: MarkerSets = { bleeding: bleedingSet, pmdd: pmddSet, sex: sexSet };
  const todayInfo = phaseAt(today, bleeding, prediction);
  const cycles = buildCycles(bleeding);
  return { bleedingSet, pmddSet, sexSet, bleeding, prediction, sets, todayInfo, cycles };
};

// ── 7 天竖胶囊日历 ──

const STRIP_DAYS_BEFORE = 15;
const STRIP_DAYS_AFTER = 60;

const DayStrip: React.FC<{ selected: string; onSelect: (d: string) => void; data: ReturnType<typeof derive> }> = ({ selected, onSelect, data }) => {
  const ref = useRef<HTMLDivElement>(null);
  const today = getLocalDateKey();
  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = -STRIP_DAYS_BEFORE; i <= STRIP_DAYS_AFTER; i++) {
      out.push(addLocalDaysSafe(today, i));
    }
    return out;
  }, [today]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cell = el.querySelector<HTMLElement>(`[data-day="${today}"]`);
    if (!cell) return;
    el.scrollLeft = cell.offsetLeft - el.clientWidth / 2 + cell.clientWidth / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      className="flex gap-2 overflow-x-auto"
      style={{ position: 'relative', scrollbarWidth: 'none', padding: '2px 0' }}
    >
      {days.map((d) => {
        const markers = markersForDay(d, data.sets, data.prediction);
        const isSel = d === selected;
        const isToday = d === today;
        const predicted = markers.includes('predicted') && !markers.includes('period');
        const date = parseLocalDateKey(d);
        const weekday = date ? WEEKDAYS[date.getDay()] : '';
        return (
          <button
            key={d}
            type="button"
            data-day={d}
            onClick={() => onSelect(d)}
            className="border-0 cursor-pointer flex flex-col items-center justify-center shrink-0"
            style={{
              width: 54, height: 88, borderRadius: 27, boxSizing: 'border-box', gap: 4,
              background: isSel ? 'var(--cs-accent, #f0a8c0)' : isToday ? '#fff' : 'rgba(255,255,255,0.6)',
              border: predicted ? '2px dashed #e35d6a' : isToday ? '1px solid #e8d5de' : '1px solid transparent',
              boxShadow: isToday && !isSel ? '0 2px 8px rgba(233,160,190,0.12)' : 'none',
            }}
          >
            <span style={{ fontSize: 11, color: isSel ? '#fff' : '#b0909c' }}>{weekday}</span>
            <span style={{ fontSize: 17, fontWeight: 700, color: isSel ? '#fff' : '#3a2a33', lineHeight: 1 }}>{date?.getDate()}</span>
            <span className="flex items-center gap-0.5" style={{ height: 6 }}>
              {markers.map((m) => (
                <span
                  key={m}
                  style={{
                    width: m === 'period' && !isSel ? 6 : 4, height: m === 'period' && !isSel ? 6 : 4, borderRadius: 999,
                    background: isSel ? '#fff' : MARKER_COLORS[m],
                  }}
                />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
};

// ── 月视图（可下拉展开；daily 模式也复用，quickMark=false 时点日期只选中） ──

export const CycleMonthView: React.FC<{
  selected: string;
  onSelect: (d: string) => void;
  quickMark: boolean;
  data: ReturnType<typeof derive>;
}> = ({ selected, onSelect, quickMark, data }) => {
  const today = getLocalDateKey();
  const [cursor, setCursor] = useState(() => {
    const t = parseLocalDateKey(today) ?? new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const cells: { key: string; inMonth: boolean }[] = useMemo(() => {
    const first = new Date(year, month, 1);
    const lead = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: { key: string; inMonth: boolean }[] = [];
    for (let i = 0; i < lead; i++) {
      const d = new Date(year, month, 1 - lead + i);
      out.push({ key: getLocalDateKey(d), inMonth: false });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      out.push({ key: getLocalDateKey(new Date(year, month, i)), inMonth: true });
    }
    return out;
  }, [year, month]);

  const shift = (delta: number) => setCursor(new Date(year, month + delta, 1));

  return (
    <div className="flex flex-col gap-1" style={{ background: 'rgba(255,255,255,0.85)', borderRadius: 20, padding: '10px 10px 12px' }}>
      <div className="flex items-center justify-between px-1">
        <button type="button" onClick={() => shift(-1)} aria-label="上个月" className="border-0 cursor-pointer rounded-full p-1.5" style={{ background: 'rgba(255,255,255,0.9)' }}>
          <CaretLeft style={{ width: 16, height: 16, color: '#9a7a8a' }} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#3a2a33' }}>{year}年{month + 1}月</span>
        <button type="button" onClick={() => shift(1)} aria-label="下个月" className="border-0 cursor-pointer rounded-full p-1.5" style={{ background: 'rgba(255,255,255,0.9)' }}>
          <CaretRight style={{ width: 16, height: 16, color: '#9a7a8a' }} />
        </button>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="flex items-center justify-center" style={{ fontSize: 11, color: '#b0909c', padding: '2px 0' }}>{w}</div>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 4 }}>
        {cells.map(({ key, inMonth }) => {
          const date = parseLocalDateKey(key);
          const markers = inMonth ? markersForDay(key, data.sets, data.prediction) : [];
          const isSel = key === selected;
          const isToday = key === today;
          const primary: DayMarker | null =
            markers.includes('period') ? 'period'
              : markers.includes('predicted') ? 'predicted'
                : markers.includes('ovulation') ? 'ovulation'
                  : markers.includes('luteal') ? 'luteal'
                    : null;
          return (
            <button
              key={key}
              type="button"
              disabled={!inMonth}
              onClick={() => {
                if (quickMark) quickTogglePeriod(key);
                onSelect(key);
              }}
              className="border-0 flex flex-col items-center justify-center cursor-pointer"
              style={{ opacity: inMonth ? 1 : 0.25, position: 'relative', height: 40, gap: 2, background: 'transparent' }}
            >
              <span
                className="flex items-center justify-center"
                style={{
                  width: 28, height: 28, borderRadius: 999, fontSize: 13, fontWeight: isToday ? 700 : 500,
                  color: primary === 'period' ? '#fff' : primary === 'ovulation' ? '#fff' : primary === 'luteal' ? '#6b5320' : isSel ? '#fff' : '#3a2a33',
                  background: primary === 'period' ? '#e35d6a'
                    : primary === 'ovulation' ? '#5b9cf0'
                      : primary === 'luteal' ? '#f7e7b8'
                        : isSel ? 'var(--cs-accent, #f0a8c0)' : 'transparent',
                  border: primary === 'predicted' ? '2px dashed #e35d6a' : isToday && !isSel ? '1px solid #e8d5de' : '1px solid transparent',
                  boxSizing: 'border-box',
                }}
              >
                {date?.getDate()}
              </span>
              <span className="flex items-center gap-0.5" style={{ height: 4 }}>
                {markers.filter((m) => m === 'pmdd' || m === 'sex').map((m) => (
                  <span key={m} style={{ width: 3, height: 3, borderRadius: 999, background: MARKER_COLORS[m] }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {quickMark && (
        <div className="flex items-center gap-1.5 px-1 mt-1">
          <Drop style={{ width: 12, height: 12, color: '#e35d6a' }} />
          <span style={{ fontSize: 10, color: '#b0909c' }}>点日历日期 = 标经期 / 再点 = 取消 · 长信息用下面的 + 记录</span>
        </div>
      )}
    </div>
  );
};

// ── 记录弹卡 ──

const RecordModal: React.FC<{
  initial: { date: string; event?: CycleEvent };
  onClose: () => void;
  store: PeriodStore;
}> = ({ initial, onClose, store }) => {
  const editing = initial.event;
  const [type, setType] = useState<CycleEventType>(editing?.type ?? 'period');
  const [date, setDate] = useState(editing?.date ?? initial.date);
  const [flow, setFlow] = useState<FlowLevel>(editing?.flow ?? 'medium');
  const [pain, setPain] = useState<number>(editing?.pain ?? 0);
  const [symptoms, setSymptoms] = useState<SymptomKey[]>(editing?.symptoms ?? []);
  const [note, setNote] = useState(editing?.note ?? '');

  const toggleSymptom = (k: SymptomKey) =>
    setSymptoms((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  const save = () => {
    upsertPeriodEvent({
      id: editing?.id, type, date,
      flow: type === 'period' ? flow : undefined,
      pain: type === 'period' ? pain : undefined,
      symptoms, note,
    });
    if (type === 'period') ensureMedReminder(date, pain);
    onClose();
  };

  const st = EVENT_STYLE[type];

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 120, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col" style={{ width: 'min(100%, 560px)', maxHeight: '82dvh', background: '#fff', borderRadius: 28, padding: 20, boxSizing: 'border-box' }}>
        <div className="flex items-center justify-between mb-3">
          <span style={{ fontSize: 16, fontWeight: 700, color: '#3a2a33' }}>{editing ? '编辑记录' : '记一笔'}</span>
          <button type="button" onClick={onClose} aria-label="关闭" className="border-0 cursor-pointer rounded-full p-2" style={{ background: 'var(--cs-soft, #fce8f1)' }}>
            <X style={{ width: 16, height: 16, color: '#8a5a6e' }} />
          </button>
        </div>

        {/* 类型切换 */}
        <div className="flex gap-2 mb-3">
          {(Object.keys(EVENT_STYLE) as CycleEventType[]).map((t) => {
            const s = EVENT_STYLE[t];
            const active = t === type;
            return (
              <button
                key={t} type="button" onClick={() => setType(t)}
                className="flex-1 border-0 cursor-pointer rounded-full"
                style={{ padding: '8px 0', fontSize: 13, fontWeight: 600, background: active ? s.color : s.soft, color: active ? '#fff' : '#6a5a63' }}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {/* 日期 */}
        <label className="flex items-center justify-between mb-3" style={{ fontSize: 13, color: '#3a2a33' }}>
          <span style={{ fontWeight: 600 }}>日期</span>
          <input
            type="date"
            value={date}
            max={getLocalDateKey()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            style={{ fontSize: 13, color: '#3a2a33', border: '1px solid #e8d5de', borderRadius: 12, padding: '6px 10px', background: '#fdf8fa', outline: 'none' }}
          />
        </label>

        {/* 经期专属：流量 + 痛经 */}
        {type === 'period' && (
          <>
            <div className="mb-3">
              <div style={{ fontSize: 13, fontWeight: 600, color: '#3a2a33', marginBottom: 8 }}>流量</div>
              <div className="flex gap-2">
                {(Object.keys(FLOW_LABELS) as FlowLevel[]).map((f) => (
                  <button
                    key={f} type="button" onClick={() => setFlow(f)}
                    className="flex-1 border-0 cursor-pointer rounded-full flex items-center justify-center gap-1.5"
                    style={{ padding: '8px 0', fontSize: 12, fontWeight: 600, background: flow === f ? st.color : st.soft, color: flow === f ? '#fff' : '#6a5a63' }}
                  >
                    <Drop style={{ width: 13, height: 13, color: flow === f ? '#fff' : st.color }} weight={f === 'heavy' ? 'fill' : 'regular'} />
                    {FLOW_LABELS[f]}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-1">
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#3a2a33' }}>痛经等级</span>
                <span className="flex items-center gap-2">
                  <span style={{ fontSize: 15, fontWeight: 700, color: pain >= store.settings.painThreshold ? '#e35d6a' : '#3a2a33' }}>{pain === 0 ? '无痛' : `${pain} 级`}</span>
                </span>
              </div>
              <input
                type="range" min={0} max={10} step={1} value={pain}
                onChange={(e) => setPain(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#e35d6a' }}
              />
              <div style={{ fontSize: 10, color: '#b0909c', marginTop: 4 }}>
                ≥{store.settings.painThreshold} 级保存后自动安排「吃止痛药」提醒
              </div>
            </div>
          </>
        )}

        {/* 状态标签（所有类型都可勾） */}
        <div style={{ marginTop: 10, marginBottom: 3 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#3a2a33', marginBottom: 8 }}>状态标签</div>
          <div className="flex flex-wrap" style={{ gap: 6 }}>
            {SYMPTOM_KEYS.map((k) => {
              const on = symptoms.includes(k);
              return (
                <button
                  key={k} type="button" onClick={() => toggleSymptom(k)}
                  className="border-0 cursor-pointer rounded-full"
                  style={{ padding: '5px 10px', fontSize: 11, fontWeight: 500, background: on ? st.color : '#f6f1f4', color: on ? '#fff' : '#6a5a63' }}
                >
                  {SYMPTOM_LABELS[k]}
                </button>
              );
            })}
          </div>
        </div>

        {/* 备注 */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="备注（可选）"
          rows={2}
          style={{ marginTop: 10, fontSize: 13, color: '#3a2a33', border: '1px solid #e8d5de', borderRadius: 14, padding: '10px 12px', background: '#fdf8fa', outline: 'none', resize: 'none', fontFamily: 'inherit' }}
        />

        {/* 底部按钮 */}
        <div className="flex gap-2 mt-4">
          {editing && (
            <button
              type="button"
              onClick={() => { deletePeriodEvent(editing.id); onClose(); }}
              className="border-0 cursor-pointer rounded-full flex items-center justify-center"
              style={{ padding: '11px 0', fontSize: 13, fontWeight: 600, color: '#e35d6a', background: '#fdeef0', width: 76 }}
            >
              删除
            </button>
          )}
          <button
            type="button" onClick={save}
            className="flex-1 border-0 cursor-pointer rounded-full"
            style={{ padding: '11px 0', fontSize: 14, fontWeight: 700, color: '#fff', background: 'var(--cs-accent, #f0a8c0)' }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

// ── 转发角色选择器（四页共用：日常/活动/生理期/纪念日） ──

export const ForwardPicker: React.FC<{ onClose: () => void; onPick: (c: CharacterProfile) => void }> = ({ onClose, onPick }) => {
  const [chars, setChars] = useState<CharacterProfile[] | null>(null);
  useEffect(() => {
    let alive = true;
    DB.getAllCharacters()
      .then((list) => { if (alive) setChars(list); })
      .catch(() => { if (alive) setChars([]); });
    return () => { alive = false; };
  }, []);
  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 130, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 16, gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#3a2a33', textAlign: 'center' }}>转发给谁？</div>
        <div className="flex flex-wrap" style={{ gap: 8, maxHeight: 180, overflowY: 'auto' }}>
          {chars === null && <div style={{ fontSize: 12, color: '#b0909c' }}>加载中…</div>}
          {chars?.length === 0 && <div style={{ fontSize: 12, color: '#b0909c' }}>还没有角色</div>}
          {chars?.map((c) => (
            <button key={c.id} type="button" onClick={() => onPick(c)} className="border-0 cursor-pointer rounded-full" style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: '#ffe6eb', color: '#383639' }}>
              {c.name}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="border-0 cursor-pointer" style={{ background: 'transparent', padding: '8px 0', fontSize: 12, color: '#9a7a8a' }}>取消</button>
      </div>
    </div>
  );
};

// ── 时间轴（共享组件：左竖线 + 空心圆节点 + 圆圈右侧时间，卡片右对齐） ──

const Timeline: React.FC<{ dateKey: string; data: ReturnType<typeof derive>; onEdit: (e: CycleEvent) => void }> = ({ dateKey, data, onEdit }) => {
  const store = usePeriodStore();
  const [forwardOpen, setForwardOpen] = useState(false);
  const reminders = store.medReminders.filter((r) => r.date === dateKey);
  const events = store.events
    .filter((e) => e.date === dateKey)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const info = phaseAt(dateKey, data.bleeding, data.prediction);
  const dateObj = parseLocalDateKey(dateKey);
  const heading = dateObj ? `${dateObj.getMonth() + 1}月${dateObj.getDate()}日 ${WEEKDAYS_FULL[dateObj.getDay()]}` : dateKey;

  const items: TimelineItem[] = [];
  if (info.phase === 'ovulation') {
    items.push({
      id: 'ovu', time: '全天', color: '#5b9cf0',
      body: (
        <div className="flex items-center gap-2.5" style={{ background: '#eef4fe', borderRadius: 16, padding: '10px 12px' }}>
          <Heartbeat style={{ width: 18, height: 18, color: '#5b9cf0', flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 13, fontWeight: 600, color: '#3a5a8a' }}>今天是排卵期</div>
            <div style={{ fontSize: 11, color: '#7a94ba', marginTop: 2 }}>易受孕窗口：排卵日前 5 天到当天，共 6 天</div>
          </div>
        </div>
      ),
    });
  }
  if (info.phase === 'predicted-period') {
    items.push({
      id: 'pred', time: '预计', color: '#e35d6a',
      body: (
        <div className="flex items-center gap-2.5" style={{ background: '#fdeef0', borderRadius: 16, padding: '10px 12px', border: '1px dashed #e35d6a' }}>
          <Drop style={{ width: 18, height: 18, color: '#e35d6a', flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 13, fontWeight: 600, color: '#b04a58' }}>预计今天来月经（第 {info.day} 天）</div>
            <div style={{ fontSize: 11, color: '#c98b95', marginTop: 2 }}>来了就在日历上点一下今天，标红</div>
          </div>
        </div>
      ),
    });
  }
  reminders.forEach((r) => items.push({ id: r.id, time: hhmm(r.createdAt), color: '#e3a044', body: <MedCard r={r} /> }));
  events.forEach((e) => items.push({ id: e.id, time: hhmm(e.createdAt), color: EVENT_STYLE[e.type].color, body: <EventCard e={e} onEdit={onEdit} /> }));

  // 转发当天所有记录（#64：生理期页 = 一条转发全部）
  const forwardText = () => {
    const lines: string[] = [`${heading} · 生理期记录`];
    if (info.phase === 'period') lines.push(`经期第 ${info.day} 天`);
    for (const e of events) {
      const s = EVENT_STYLE[e.type];
      const parts = [s.label];
      if (e.type === 'period' && e.flow) parts.push(FLOW_LABELS[e.flow]);
      if (e.pain) parts.push(`痛经${e.pain}级`);
      if (e.symptoms.length) parts.push(e.symptoms.map((k) => SYMPTOM_LABELS[k]).join('/'));
      if (e.note) parts.push(e.note);
      lines.push(parts.join('，'));
    }
    for (const r of reminders) lines.push(`吃药提醒：${r.text}（${r.done ? '已吃' : '还没吃'}）`);
    return lines.join('\n');
  };

  return (
    <div className="rounded-3xl p-4 flex flex-col" style={CARD}>
      <div className="flex items-center justify-between">
        <div style={TITLE}>{heading} · 记录</div>
        {items.length > 0 && (
          <button type="button" onClick={() => setForwardOpen(true)} aria-label="转发当天记录" className="border-0 cursor-pointer rounded-full p-1.5 flex items-center gap-1" style={{ background: 'var(--cs-soft, #fce8f1)' }}>
            <PaperPlaneTilt style={{ width: 13, height: 13, color: '#8a5a6e' }} />
            <span style={{ fontSize: 10, color: '#8a5a6e' }}>转发</span>
          </button>
        )}
      </div>
      <div style={{ marginTop: 4 }}>
        <CoupleTimeline items={items} empty="这天没有记录。点右下角的 + 记一笔，或展开日历点日期直接标红。" />
      </div>
      {forwardOpen && (
        <ForwardPicker
          onClose={() => setForwardOpen(false)}
          onPick={async (c) => {
            try {
              await forwardCoupleCard(c, { kind: '生理期', title: heading, body: forwardText() });
            } catch {
              // 转发失败静默关掉，避免打断记录流程
            }
            setForwardOpen(false);
          }}
        />
      )}
    </div>
  );
};

export const MedCard: React.FC<{ r: MedReminder }> = ({ r }) => (
  <div className="flex items-center gap-2.5" style={{ background: '#fff7e8', borderRadius: 16, padding: '10px 12px', opacity: r.done ? 0.55 : 1 }}>
    <button
      type="button"
      onClick={() => toggleMedReminder(r.id)}
      aria-label="标记完成"
      className="border-0 cursor-pointer rounded-full flex items-center justify-center"
      style={{ width: 24, height: 24, background: r.done ? '#e3a044' : '#fff', border: '1.5px solid #e3a044', flexShrink: 0 }}
    >
      {r.done && <Check style={{ width: 14, height: 14, color: '#fff' }} weight="bold" />}
    </button>
    <Pill style={{ width: 18, height: 18, color: '#e3a044', flexShrink: 0 }} />
    <div className="flex-1 min-w-0">
      <div style={{ fontSize: 13, fontWeight: 600, color: '#8a5a20', textDecoration: r.done ? 'line-through' : 'none' }}>{r.text}</div>
      <div style={{ fontSize: 11, color: '#b98d4d', marginTop: 2 }}>自动安排 · 痛经到阈值了，别硬扛</div>
    </div>
  </div>
);

const EventCard: React.FC<{ e: CycleEvent; onEdit: (e: CycleEvent) => void }> = ({ e, onEdit }) => {
  const s = EVENT_STYLE[e.type];
  const detail: string[] = [];
  if (e.type === 'period') {
    if (e.flow) detail.push(FLOW_LABELS[e.flow]);
    if (e.pain) detail.push(`痛经 ${e.pain} 级`);
    else if (e.pain === 0) detail.push('无痛');
  }
  return (
    <div className="flex" style={{ background: s.soft, borderRadius: 16, padding: '10px 12px', gap: 10 }}>
      <span style={{ width: 4, borderRadius: 999, background: s.color, flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 13, fontWeight: 700, color: s.color === '#383639' ? '#383639' : s.color }}>{s.label}</span>
          {detail.length > 0 && <span style={{ fontSize: 11, color: '#6a5a63' }}>{detail.join(' · ')}</span>}
        </div>
        {e.symptoms.length > 0 && (
          <div className="flex flex-wrap" style={{ gap: 4, marginTop: 6 }}>
            {e.symptoms.map((k) => (
              <span key={k} className="rounded-full" style={{ fontSize: 10, color: '#6a5a63', background: 'rgba(255,255,255,0.75)', padding: '2px 8px' }}>{SYMPTOM_LABELS[k]}</span>
            ))}
          </div>
        )}
        {e.note && <div style={{ fontSize: 11, color: '#6a5a63', marginTop: 6, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{e.note}</div>}
        <div className="flex items-center justify-end" style={{ gap: 12, marginTop: 6 }}>
          <button type="button" onClick={() => onEdit(e)} aria-label="编辑" className="border-0 cursor-pointer flex items-center gap-1" style={{ background: 'transparent', fontSize: 11, color: '#8a7a83' }}>
            <PencilSimple style={{ width: 12, height: 12 }} />编辑
          </button>
          <button type="button" onClick={() => deletePeriodEvent(e.id)} aria-label="删除" className="border-0 cursor-pointer flex items-center gap-1" style={{ background: 'transparent', fontSize: 11, color: '#c98b95' }}>
            <Trash style={{ width: 12, height: 12 }} />删除
          </button>
        </div>
      </div>
    </div>
  );
};

// ── 往期周期列表 + 详情 ──

const CyclesDetail: React.FC<{ cycles: Cycle[]; prediction: Prediction; onBack: () => void }> = ({ cycles, prediction, onBack }) => {
  const list = [...cycles].reverse();
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-3xl p-4 flex items-center justify-between" style={CARD}>
        <button type="button" onClick={onBack} className="border-0 cursor-pointer rounded-full p-1.5 flex items-center justify-center" style={{ background: 'var(--cs-soft, #fce8f1)' }}>
          <CaretLeft style={{ width: 16, height: 16, color: '#8a5a6e' }} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#3a2a33' }}>全部周期</span>
        <span style={{ width: 32 }} />
      </div>
      <div className="rounded-3xl p-4 flex flex-col gap-2" style={CARD}>
        <div style={TITLE}>SUMMARY</div>
        <div className="flex" style={{ gap: 8 }}>
          <Stat label="平均周期" val={prediction.meanCycle !== null ? `${prediction.meanCycle} 天` : '—'} />
          <Stat label="平均经期" val={prediction.meanPeriodLen !== null ? `${prediction.meanPeriodLen} 天` : '—'} />
          <Stat label="已记录" val={`${cycles.length} 次`} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {list.map((c, i) => (
          <div key={c.start} className="rounded-3xl p-4 flex items-center gap-3" style={CARD}>
            <span className="flex items-center justify-center rounded-full shrink-0" style={{ width: 34, height: 34, background: '#fdeef0' }}>
              <Drop style={{ width: 16, height: 16, color: '#e35d6a' }} />
            </span>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 13, fontWeight: 600, color: '#3a2a33' }}>{c.complete ? `第 ${cycles.length - i} 次经期` : '本次经期（进行中）'}</div>
              <div style={{ fontSize: 11, color: '#b0909c', marginTop: 2 }}>
                {c.start} ~ {c.end} · 经期 {c.days} 天{c.complete ? ` · 周期 ${c.length} 天` : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; val: string }> = ({ label, val }) => (
  <div className="flex-1 rounded-2xl flex flex-col items-center" style={{ background: 'var(--cs-soft, #fce8f1)', padding: '10px 4px' }}>
    <span style={{ fontSize: 15, fontWeight: 700, color: '#3a2a33' }}>{val}</span>
    <span style={{ fontSize: 10, color: '#9a7a8a', marginTop: 2 }}>{label}</span>
  </div>
);

// ── 健康小结 + 月经小助手（同一张卡：生成小结 → 可以接着聊） ──
// 提示词来自 promptRegistry（设置页「提示词管理」可编辑），调用时现读现用

const callChat = async (api: { baseUrl: string; apiKey: string; model: string }, messages: { role: 'system' | 'user' | 'assistant'; content: string }[]): Promise<string> => {
  const res = await fetch(`${api.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.apiKey}` },
    body: JSON.stringify({ model: api.model, messages, max_tokens: 4000 }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}${text ? `：${text.slice(0, 160)}` : ''}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
};

const buildHistoryText = (store: PeriodStore, todayInfo: PhaseInfo, prediction: Prediction, cycles: Cycle[]): string => {
  const lines: string[] = [];
  lines.push(`今天：${getLocalDateKey()}，阶段：${PHASE_LABELS[todayInfo.phase]}${todayInfo.day > 0 && todayInfo.phase !== 'ovulation' ? ` 第${todayInfo.day}天` : ''}`);
  if (prediction.nextStart) lines.push(`预计下次经期：${prediction.nextStart}，平均周期 ${prediction.meanCycle} 天，平均经期 ${prediction.meanPeriodLen} 天`);
  lines.push(`已记录 ${cycles.length} 次经期`);
  const recent = [...store.events].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20);
  for (const e of recent) {
    const s = EVENT_STYLE[e.type];
    const parts = [`${e.date} ${s.label}`];
    if (e.type === 'period' && e.flow) parts.push(FLOW_LABELS[e.flow]);
    if (e.pain) parts.push(`痛经${e.pain}级`);
    if (e.symptoms.length) parts.push(e.symptoms.map((k) => SYMPTOM_LABELS[k]).join('/'));
    if (e.note) parts.push(e.note);
    lines.push(parts.join('，'));
  }
  return lines.join('\n');
};

const SummaryModal: React.FC<{ onClose: () => void; store: PeriodStore; todayInfo: PhaseInfo; prediction: Prediction; cycles: Cycle[] }> = ({ onClose, store, todayInfo, prediction, cycles }) => {
  const [showSettings, setShowSettings] = useState(!(store.settings.api.baseUrl && store.settings.api.apiKey && store.settings.api.model));
  const [cfg, setCfg] = useState(store.settings.api);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chat, setChat] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState(false);

  const configured = !!(cfg.baseUrl && cfg.apiKey && cfg.model);
  const historyText = useMemo(() => buildHistoryText(store, todayInfo, prediction, cycles), [store, todayInfo, prediction, cycles]);

  const saveCfg = () => {
    updatePeriodSettings({ api: cfg });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const text = await callChat(cfg, [
        { role: 'system', content: getPrompt('健康小结') },
        { role: 'user', content: historyText },
      ]);
      setSummary(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setLoading(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const next = [...chat, { role: 'user' as const, content: text }];
    setChat(next);
    setInput('');
    setSending(true);
    setError('');
    try {
      const reply = await callChat(cfg, [
        { role: 'system', content: getPrompt('月经小助手') },
        ...next,
      ]);
      setChat([...next, { role: 'assistant', content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 120, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col" style={{ width: 'min(100%, 560px)', height: '80dvh', background: '#fff', borderRadius: 28, padding: 20, boxSizing: 'border-box' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-2" style={{ fontSize: 16, fontWeight: 700, color: '#3a2a33' }}>
            <Sparkle style={{ width: 18, height: 18, color: 'var(--cs-accent, #f0a8c0)' }} />健康小结
          </span>
          <span className="flex items-center" style={{ gap: 6 }}>
            <button type="button" onClick={() => setShowSettings((v) => !v)} aria-label="设置" className="border-0 cursor-pointer rounded-full p-2" style={{ background: 'var(--cs-soft, #fce8f1)' }}>
              <GearSix style={{ width: 16, height: 16, color: '#8a5a6e' }} />
            </button>
            <button type="button" onClick={onClose} aria-label="关闭" className="border-0 cursor-pointer rounded-full p-2" style={{ background: 'var(--cs-soft, #fce8f1)' }}>
              <X style={{ width: 16, height: 16, color: '#8a5a6e' }} />
            </button>
          </span>
        </div>

        {showSettings && (
          <div className="flex flex-col rounded-2xl mb-3" style={{ gap: 8, background: '#fdf8fa', border: '1px solid #f2e3ea', padding: 12 }}>
            <div style={{ fontSize: 11, color: '#9a7a8a' }}>小结与小助手共用的独立 API 槽（URL 带 /v1 后缀；不配置就不调用，不回退别的模型）</div>
            <input value={cfg.baseUrl} onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })} placeholder="Base URL（如 https://api.xx.com/v1）" style={{ fontSize: 12, border: '1px solid #e8d5de', borderRadius: 10, padding: '8px 10px', outline: 'none' }} />
            <input value={cfg.apiKey} onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })} placeholder="API Key" style={{ fontSize: 12, border: '1px solid #e8d5de', borderRadius: 10, padding: '8px 10px', outline: 'none' }} />
            <input value={cfg.model} onChange={(e) => setCfg({ ...cfg, model: e.target.value })} placeholder="模型名" style={{ fontSize: 12, border: '1px solid #e8d5de', borderRadius: 10, padding: '8px 10px', outline: 'none' }} />
            <button
              type="button" onClick={saveCfg}
              className="border-0 cursor-pointer rounded-full"
              style={{ padding: '9px 0', fontSize: 13, fontWeight: 700, color: '#fff', background: saved ? '#6cae7e' : 'var(--cs-accent, #f0a8c0)', transition: 'background 0.3s' }}
            >
              {saved ? '已保存 ✓' : '保存配置'}
            </button>
          </div>
        )}

        {/* 小结区 */}
        <div className="flex flex-col rounded-2xl" style={{ gap: 8, background: '#fdf8fa', border: '1px solid #f2e3ea', padding: 12, flex: 'none', maxHeight: '38%', overflowY: 'auto' }}>
          {store.events.length === 0 && !summary && (
            <div style={{ fontSize: 12, color: '#b0909c', lineHeight: 1.7 }}>还没有记录。先记几笔经期，我才能读历史给你写小结。</div>
          )}
          {summary && <div style={{ fontSize: 12.5, color: '#3a2a33', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{summary}</div>}
          {loading && <div style={{ fontSize: 12, color: '#9a7a8a' }}>正在读历史、写小结…</div>}
          {error && <div style={{ fontSize: 11, color: '#e35d6a', lineHeight: 1.6, wordBreak: 'break-all' }}>{error}</div>}
          <button
            type="button" disabled={loading || !configured || store.events.length === 0}
            onClick={generate}
            className="border-0 cursor-pointer rounded-full flex items-center justify-center gap-1.5"
            style={{ padding: '9px 0', fontSize: 13, fontWeight: 700, color: '#fff', background: configured && store.events.length > 0 ? 'var(--cs-accent, #f0a8c0)' : '#e8dce2' }}
          >
            <Sparkle style={{ width: 14, height: 14 }} />{summary ? '重新生成' : '生成健康小结'}
          </button>
        </div>

        {/* 小助手聊天区 */}
        <div className="flex flex-col flex-1 min-h-0" style={{ marginTop: 10 }}>
          <div className="flex items-center gap-1.5" style={{ marginBottom: 8 }}>
            <Stethoscope style={{ width: 14, height: 14, color: '#9a7a8a' }} />
            <span style={{ fontSize: 11, color: '#9a7a8a' }}>和小助手聊聊（只聊身体，不记记忆，不污染聊天上下文）</span>
          </div>
          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto" style={{ gap: 8, paddingBottom: 4 }}>
            {chat.length === 0 && (
              <div style={{ fontSize: 12, color: '#b0909c', lineHeight: 1.7 }}>比如问它：「这两天腰酸，正常吗？」「PMDD 又开始了，怎么办」</div>
            )}
            {chat.map((m, i) => (
              <div
                key={i}
                className="rounded-2xl"
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '86%',
                  background: m.role === 'user' ? 'var(--cs-accent, #f0a8c0)' : '#f6f1f4',
                  color: m.role === 'user' ? '#fff' : '#3a2a33',
                  fontSize: 12.5, lineHeight: 1.7, padding: '8px 12px', whiteSpace: 'pre-wrap',
                }}
              >
                {m.content}
              </div>
            ))}
            {sending && <div style={{ fontSize: 11, color: '#9a7a8a' }}>小助手正在想…</div>}
          </div>
          <div className="flex items-center" style={{ gap: 8, marginTop: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder="问小助手…"
              style={{ flex: 1, fontSize: 13, color: '#3a2a33', border: '1px solid #e8d5de', borderRadius: 999, padding: '10px 14px', background: '#fdf8fa', outline: 'none' }}
            />
            <button
              type="button" onClick={send} disabled={!configured || sending || !input.trim()}
              aria-label="发送"
              className="border-0 cursor-pointer rounded-full flex items-center justify-center shrink-0"
              style={{ width: 40, height: 40, background: configured && input.trim() ? 'var(--cs-accent, #f0a8c0)' : '#e8dce2' }}
            >
              <CaretUp style={{ width: 18, height: 18, color: '#fff' }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── 主组件 ──

const addLocalDaysSafe = (base: string, n: number): string => {
  const d = parseLocalDateKey(base);
  if (!d) return base;
  d.setDate(d.getDate() + n);
  return getLocalDateKey(d);
};

const CouplePeriod: React.FC = () => {
  const store = usePeriodStore();
  const today = getLocalDateKey();
  const [selected, setSelected] = useState(today);
  const [monthOpen, setMonthOpen] = useState(false);
  const [recording, setRecording] = useState<{ date: string; event?: CycleEvent } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [cyclesOpen, setCyclesOpen] = useState(false);

  const data = useMemo(() => derive(store, today), [store, today]);
  const { todayInfo, prediction, cycles } = data;

  // 今日语录：PMDD 优先 → 痛经日 → 按阶段轮换
  const quote = useMemo(() => {
    const todayEvents = store.events.filter((e) => e.date === today);
    if (todayEvents.some((e) => e.type === 'pmdd')) return QUOTE_PMDD;
    const periodToday = todayEvents.find((e) => e.type === 'period');
    if (periodToday && (periodToday.pain ?? 0) >= store.settings.painThreshold) return QUOTE_PAIN;
    return pickQuote(QUOTES[todayInfo.phase], today);
  }, [store.events, store.settings.painThreshold, today, todayInfo.phase]);

  const recentCycles = useMemo(() => [...cycles].reverse().slice(0, 3), [cycles]);

  // 阶段大字（#59 重设计）：透明底大方块 ——「XX期第」小字在最上 → 数字超大 → 「天」小
  const phaseTop = (() => {
    if (todayInfo.phase === 'unknown') {
      return { label: '还没开始记录', num: null as number | null, sub: '再记 2 次完整经期，我就能预测了' };
    }
    if (todayInfo.phase === 'ovulation') {
      return {
        label: '排卵期',
        num: todayInfo.daysToNext ?? 0,
        sub: `距下次经期 ${todayInfo.daysToNext ?? '—'} 天 · 易受孕窗口 6 天`,
      };
    }
    if (todayInfo.phase === 'predicted-period') {
      return { label: '经期（预计） 第', num: todayInfo.day, sub: '预计今天来 · 来了记得标红' };
    }
    if (todayInfo.phase === 'period') {
      return {
        label: '经期 第', num: todayInfo.day,
        sub: prediction.nextStart ? `下次预计 ${prediction.nextStart.slice(5).replace('-', '月')}日` : '这次结束之后我就能预测得更准了',
      };
    }
    const s = todayInfo.daysToNext !== null && prediction.nextStart
      ? `距下次经期 ${todayInfo.daysToNext} 天 · 预计 ${prediction.nextStart.slice(5).replace('-', '月')}日`
      : '状态回血中';
    return { label: `${PHASE_LABELS[todayInfo.phase]} 第`, num: todayInfo.day, sub: s };
  })();

  if (cyclesOpen) {
    return <CyclesDetail cycles={cycles} prediction={prediction} onBack={() => setCyclesOpen(false)} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 7 天竖胶囊日历 + 月视图下拉展开 */}
      <div className="flex items-start gap-1">
        <div className="flex-1 min-w-0">
          <DayStrip selected={selected} onSelect={setSelected} data={data} />
        </div>
        <button
          type="button"
          onClick={() => setMonthOpen((v) => !v)}
          aria-label={monthOpen ? '收起月视图' : '展开月视图'}
          className="border-0 cursor-pointer rounded-full flex items-center justify-center shrink-0"
          style={{ width: 30, height: 30, marginTop: 4, background: 'rgba(255,255,255,0.9)', boxShadow: '0 2px 8px rgba(233,160,190,0.12)' }}
        >
          <CaretDown style={{ width: 16, height: 16, color: '#9a7a8a', transform: monthOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      </div>
      {monthOpen && <CycleMonthView selected={selected} onSelect={setSelected} quickMark data={data} />}

      {/* 当前阶段大字：透明底大方块（「XX期第」小在上 → 数字超大 → 「天」小） */}
      <div className="flex flex-col items-center justify-center self-center" style={{ width: '74%', aspectRatio: '1 / 1', background: 'transparent' }}>
        <div style={{ fontSize: 13, color: '#9a7a8a' }}>{phaseTop.label}</div>
        {phaseTop.num !== null && (
          <div className="flex items-start" style={{ marginTop: 2 }}>
            <span style={{ fontSize: 80, fontWeight: 700, color: 'var(--cs-deep, #c25a82)', lineHeight: 1 }}>{phaseTop.num}</span>
            <span style={{ fontSize: 14, color: '#9a7a8a', marginTop: 16, marginLeft: 5 }}>天</span>
          </div>
        )}
        <div style={{ fontSize: 11, color: '#b0909c', marginTop: 12, textAlign: 'center' }}>{phaseTop.sub}</div>
      </div>

      {/* 语录卡 + 记录卡 */}
      <div className="flex" style={{ gap: 10 }}>
        <div className="flex-1 rounded-3xl flex flex-col justify-between" style={{ ...CARD, background: 'var(--cs-soft, #fce8f1)', minHeight: 108, padding: 14 }}>
          <span style={{ fontSize: 10, color: '#b08095', letterSpacing: '0.08em' }}>哥哥说</span>
          <p style={{ fontSize: 12.5, color: '#6a4a5a', lineHeight: 1.8, margin: 0 }}>{quote}</p>
        </div>
        <button
          type="button"
          onClick={() => setRecording({ date: selected })}
          className="border-0 cursor-pointer rounded-3xl flex flex-col items-center justify-center"
          style={{ width: 96, minHeight: 108, background: '#fff', boxShadow: CARD.boxShadow, gap: 4 }}
        >
          <span className="flex items-center justify-center rounded-full" style={{ width: 34, height: 34, background: 'var(--cs-accent, #f0a8c0)' }}>
            <Plus style={{ width: 18, height: 18, color: '#fff' }} weight="bold" />
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#3a2a33' }}>记录</span>
          <span style={{ fontSize: 9, color: '#b0909c' }}>经期 · PMDD · 性生活</span>
        </button>
      </div>

      {/* 当日时间轴 */}
      <Timeline dateKey={selected} data={data} onEdit={(e) => setRecording({ date: e.date, event: e })} />

      {/* 往期周期 */}
      <div className="rounded-3xl p-4 flex flex-col gap-1" style={CARD}>
        <div className="flex items-center justify-between">
          <span style={TITLE}>往期周期</span>
          {cycles.length > 0 && (
            <button type="button" onClick={() => setCyclesOpen(true)} className="border-0 cursor-pointer" style={{ background: 'transparent', fontSize: 11, color: 'var(--cs-deep, #c25a82)' }}>
              查看全部
            </button>
          )}
        </div>
        {recentCycles.length === 0 && (
          <p style={{ ...NOTE, marginTop: 6 }}>还没有经期记录。点日历标红，或点 + 补记以往的日子。</p>
        )}
        {recentCycles.map((c, i) => (
          <button key={c.start} type="button" onClick={() => setCyclesOpen(true)} className="flex items-center gap-3 border-0 cursor-pointer" style={{ background: 'transparent', padding: '10px 0', borderBottom: i < recentCycles.length - 1 ? '1px solid #f7e8ef' : 'none' }}>
            <span className="flex items-center justify-center rounded-full shrink-0" style={{ width: 30, height: 30, background: '#fdeef0' }}>
              <Drop style={{ width: 14, height: 14, color: '#e35d6a' }} />
            </span>
            <div className="flex-1 min-w-0 text-left">
              <div style={{ fontSize: 13, fontWeight: 600, color: '#3a2a33' }}>{c.complete ? `第 ${cycles.length - i} 次` : '本次（进行中）'}</div>
              <div style={{ fontSize: 11, color: '#b0909c', marginTop: 2 }}>
                {c.start} ~ {c.end} · 经期 {c.days} 天{c.complete && c.length !== null ? ` · 周期 ${c.length} 天` : ''}
              </div>
            </div>
            <CaretRight style={{ width: 14, height: 14, color: '#c9b4c0' }} />
          </button>
        ))}
      </div>

      {/* 健康小结入口 */}
      <button
        type="button"
        onClick={() => setSummaryOpen(true)}
        className="flex items-center gap-3 border-0 cursor-pointer rounded-3xl"
        style={{ ...CARD, padding: 14, background: 'linear-gradient(135deg, #fff, var(--cs-soft, #fce8f1))' }}
      >
        <span className="flex items-center justify-center rounded-full shrink-0" style={{ width: 36, height: 36, background: 'var(--cs-accent, #f0a8c0)' }}>
          <Sparkle style={{ width: 18, height: 18, color: '#fff' }} />
        </span>
        <div className="flex-1 min-w-0 text-left">
          <div style={{ fontSize: 14, fontWeight: 700, color: '#3a2a33' }}>健康小结</div>
          <div style={{ fontSize: 11, color: '#9a7a8a', marginTop: 2 }}>AI 读你的记录，生成周期小报告 · 看完可以和小助手聊聊</div>
        </div>
        <CaretRight style={{ width: 16, height: 16, color: '#c9b4c0' }} />
      </button>

      {/* 弹层 */}
      {recording && <RecordModal initial={recording} onClose={() => setRecording(null)} store={store} />}
      {summaryOpen && <SummaryModal onClose={() => setSummaryOpen(false)} store={store} todayInfo={todayInfo} prediction={prediction} cycles={cycles} />}
    </div>
  );
};

export default CouplePeriod;

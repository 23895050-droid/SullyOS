// 顶部日期条（2026-08-23 抽取自生理期页 DayStrip）——饮食页（绿）/ 活动页复用，样式与生理期页一致
// 胶囊 54×88：星期 + 日期 + 可选小圆点；初始滚动到今天的单元格；选中底色可换主题色
import React, { useEffect, useMemo, useRef } from 'react';
import { addLocalDays, getLocalDateKey, parseLocalDateKey } from '../../utils/localDate';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export interface StripMarker {
  color: string;
  solid?: boolean; // 实心大点（如实际经期红点）
}

const DateStrip: React.FC<{
  selected: string;
  onSelect: (d: string) => void;
  accent?: string; // 选中底色（默认主题粉 var(--cs-accent)）
  markers?: (d: string) => StripMarker[];
  daysBefore?: number; // 默认 15
  daysAfter?: number;  // 默认 60
}> = ({ selected, onSelect, accent, markers, daysBefore = 15, daysAfter = 60 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const today = getLocalDateKey();
  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = -daysBefore; i <= daysAfter; i++) {
      const d = addLocalDays(today, i);
      if (d) out.push(d);
    }
    return out;
  }, [today, daysBefore, daysAfter]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cell = el.querySelector<HTMLElement>(`[data-day="${today}"]`);
    if (!cell) return;
    el.scrollLeft = cell.offsetLeft - el.clientWidth / 2 + cell.clientWidth / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selBg = accent ?? 'var(--cs-accent, #f0a8c0)';

  return (
    <div
      ref={ref}
      className="flex gap-2 overflow-x-auto"
      style={{ position: 'relative', scrollbarWidth: 'none', padding: '2px 0' }}
    >
      {days.map((d) => {
        const isSel = d === selected;
        const isToday = d === today;
        const date = parseLocalDateKey(d);
        const weekday = date ? WEEKDAYS[date.getDay()] : '';
        const dots = markers ? markers(d) : [];
        return (
          <button
            key={d}
            type="button"
            data-day={d}
            onClick={() => onSelect(d)}
            className="border-0 cursor-pointer flex flex-col items-center justify-center shrink-0"
            style={{
              width: 54, height: 88, borderRadius: 27, boxSizing: 'border-box', gap: 4,
              background: isSel ? selBg : isToday ? '#fff' : 'rgba(255,255,255,0.6)',
              border: isToday && !isSel ? '1px solid #e8d5de' : '1px solid transparent',
              boxShadow: isToday && !isSel ? '0 2px 8px rgba(233,160,190,0.12)' : 'none',
            }}
          >
            <span style={{ fontSize: 11, color: isSel ? '#fff' : '#b0909c' }}>{weekday}</span>
            <span style={{ fontSize: 17, fontWeight: 700, color: isSel ? '#fff' : '#3a2a33', lineHeight: 1 }}>{date?.getDate()}</span>
            <span className="flex items-center gap-0.5" style={{ height: 6 }}>
              {dots.map((m, i) => (
                <span
                  key={i}
                  style={{
                    width: m.solid && !isSel ? 6 : 4, height: m.solid && !isSel ? 6 : 4, borderRadius: 999,
                    background: isSel ? '#fff' : m.color,
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

export default DateStrip;

// 天气图标（2026-09-14 c6）——手绘 SVG，照 iOS 天气图标的彩色风（白云 / 黄太阳 / 月牙 / 蓝雨线）
import React, { useMemo } from 'react';
import type { WeatherIconKind } from '../../utils/weatherMath';

const YELLOW = '#ffd60a';
const RAIN_BLUE = '#5ac8fa';

/** 云朵（底部平线 y=16） */
const Cloud: React.FC<{ fill?: string }> = ({ fill = '#ffffff' }) => (
  <g fill={fill}>
    <circle cx="8.4" cy="11.8" r="4.2" />
    <circle cx="12.8" cy="9.4" r="5.2" />
    <circle cx="17" cy="12.2" r="3.8" />
    <rect x="8.4" y="11.4" width="8.6" height="4.6" rx="2.3" />
  </g>
);

/** 太阳（黄圆 + 8 条圆头光芒） */
const Sun: React.FC<{ cx: number; cy: number; r: number }> = ({ cx, cy, r }) => {
  const rays: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const r1 = r + 1.5;
    const r2 = r + 3.5;
    rays.push([
      cx + Math.cos(a) * r1, cy + Math.sin(a) * r1,
      cx + Math.cos(a) * r2, cy + Math.sin(a) * r2,
    ]);
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={YELLOW} />
      <g stroke={YELLOW} strokeWidth="1.7" strokeLinecap="round">
        {rays.map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />)}
      </g>
    </g>
  );
};

/** 月牙（白圆挖掉一个偏移圆；开口朝右下） */
const Moon: React.FC<{ cx?: number; cy?: number; r?: number }> = ({ cx = 12.4, cy = 12, r = 7.2 }) => {
  const id = useMemo(() => `wm-moon-${Math.random().toString(36).slice(2, 8)}`, []);
  const holeX = cx + r * 0.62;
  const holeY = cy + r * 0.2;
  const holeR = r * 0.86;
  return (
    <>
      <mask id={id}>
        <rect x="0" y="0" width="24" height="24" fill="#000" />
        <circle cx={cx} cy={cy} r={r} fill="#fff" />
        <circle cx={holeX} cy={holeY} r={holeR} fill="#000" />
      </mask>
      <rect x="0" y="0" width="24" height="24" fill="#ffffff" mask={`url(#${id})`} />
    </>
  );
};

/** 四角小星（夜空装饰） */
const Star: React.FC<{ cx: number; cy: number; r: number }> = ({ cx, cy, r }) => {
  const w = r * 0.32;
  return (
    <path
      d={`M${cx} ${cy - r} L${cx + w} ${cy - w} L${cx + r} ${cy} L${cx + w} ${cy + w} L${cx} ${cy + r} L${cx - w} ${cy + w} L${cx - r} ${cy} L${cx - w} ${cy - w} Z`}
      fill="#ffffff"
    />
  );
};

const WeatherIcon: React.FC<{ kind: WeatherIconKind; size: number; className?: string }> = ({ kind, size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    {kind === 'sun' && <Sun cx={12} cy={12} r={4.8} />}
    {kind === 'moon' && (
      <>
        <Moon />
        <Star cx={19} cy={5.6} r={1.7} />
        <Star cx={21} cy={12.6} r={1.1} />
      </>
    )}
    {kind === 'cloud' && <Cloud />}
    {kind === 'cloud-sun' && (
      <>
        <Sun cx={15.4} cy={8.4} r={3.4} />
        <Cloud />
      </>
    )}
    {kind === 'cloud-moon' && (
      <>
        <Moon cx={16.4} cy={7.4} r={4.6} />
        <Cloud />
      </>
    )}
    {kind === 'rain' && (
      <>
        <Cloud />
        <g stroke={RAIN_BLUE} strokeWidth="1.8" strokeLinecap="round">
          <line x1="9.4" y1="17.4" x2="8.4" y2="20.6" />
          <line x1="13" y1="17.4" x2="12" y2="20.6" />
          <line x1="16.6" y1="17.4" x2="15.6" y2="20.6" />
        </g>
      </>
    )}
    {kind === 'drizzle' && (
      <>
        <Cloud />
        <g stroke={RAIN_BLUE} strokeWidth="1.8" strokeLinecap="round">
          <line x1="9.8" y1="17.6" x2="9.2" y2="19.8" />
          <line x1="13.2" y1="17.6" x2="12.6" y2="19.8" />
        </g>
        <circle cx="16.4" cy="19.2" r="0.95" fill={RAIN_BLUE} />
      </>
    )}
    {kind === 'snow' && (
      <>
        <Cloud />
        <g fill="#ffffff">
          <circle cx="9.4" cy="18.2" r="1.05" />
          <circle cx="13" cy="20" r="1.05" />
          <circle cx="16.6" cy="18.2" r="1.05" />
        </g>
      </>
    )}
    {kind === 'thunder' && (
      <>
        <Cloud />
        <path d="M13.4 16.4 L10 20.9 h2.3 l-0.9 2.9 3.5 -4.4 h-2.4 Z" fill={YELLOW} />
      </>
    )}
    {kind === 'fog' && (
      <>
        <Cloud />
        <g stroke="#e9edf2" strokeWidth="1.6" strokeLinecap="round" opacity="0.92">
          <line x1="7.6" y1="18.2" x2="16.4" y2="18.2" />
          <line x1="9.4" y1="21" x2="14.6" y2="21" />
        </g>
      </>
    )}
  </svg>
);

export default React.memo(WeatherIcon);

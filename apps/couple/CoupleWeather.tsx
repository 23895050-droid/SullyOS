// 天气页 c6（2026-09-14 看图写 UI 练手批）——照 iOS 天气截图：
// 大字头（滚动收缩成紧凑标题吸顶）→ 空气质量卡 → 摘要+逐小时卡 → 10 天卡 → 底部工具栏。
// 数据 Open-Meteo（weatherApi）→ weatherStore 缓存：重进先用缓存秒开，超 30 分钟后台刷新；
// 从没拉到过数据时才显示错误页。白天/夜晚两套主题照图（背景：渐变+合成云/星，实景素材以后可换）。
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CalendarBlank, ListDashes, MapTrifold } from '@phosphor-icons/react';
import { fetchWeather } from './weatherApi';
import { getWeatherStore, saveWeatherData, useWeatherStore, WEATHER_FRESH_MS } from './weatherStore';
import type { WeatherData } from './weatherStore';
import WeatherIcon from './WeatherIcon';
import {
  aqiLevel, aqiPos, dayLabel, fmtTemp, hourLabel, rangeBar, summaryText, tempColor, wmoIcon, wmoText,
} from '../../utils/weatherMath';

// ── 主题 ──
const DAY_SKY = 'linear-gradient(180deg, #a7c2da 0%, #8db0d3 30%, #6f9cc9 62%, #5b8ec2 100%)';
const NIGHT_SKY = 'linear-gradient(180deg, #121a34 0%, #1a2340 40%, #222b4b 75%, #293256 100%)';
const DAY_CLOUDS = [
  'radial-gradient(78% 24% at 30% -1%, rgba(255,255,255,0.95), rgba(255,255,255,0) 100%)',
  'radial-gradient(88% 26% at 62% 2%, rgba(255,255,255,0.85), rgba(255,255,255,0) 100%)',
  'radial-gradient(56% 18% at 88% 10%, rgba(255,255,255,0.6), rgba(255,255,255,0) 100%)',
  'radial-gradient(52% 20% at 8% 13%, rgba(255,255,255,0.62), rgba(255,255,255,0) 100%)',
  'radial-gradient(46% 15% at 78% 20%, rgba(255,255,255,0.34), rgba(255,255,255,0) 100%)',
  'radial-gradient(40% 14% at 20% 24%, rgba(255,255,255,0.3), rgba(255,255,255,0) 100%)',
].join(', ');

/** 夜空星星 [left%, top%, 直径px, 亮度] */
const STARS: Array<[number, number, number, number]> = [
  [8, 4, 2.2, 0.95], [15, 9, 1.5, 0.7], [22, 3, 1.8, 0.85], [31, 7, 1.4, 0.6], [38, 12, 2.2, 0.95], [45, 4, 1.6, 0.75],
  [52, 9, 1.8, 0.85], [59, 2, 1.4, 0.6], [66, 11, 2.2, 0.95], [73, 6, 1.6, 0.75], [81, 9, 1.4, 0.6], [88, 3, 2, 0.9],
  [93, 13, 1.5, 0.7], [11, 17, 1.4, 0.6], [26, 21, 1.7, 0.8], [35, 16, 1.4, 0.6], [48, 19, 1.6, 0.75], [57, 24, 1.4, 0.6],
  [70, 18, 1.8, 0.85], [79, 23, 1.4, 0.6], [86, 17, 1.6, 0.75], [18, 29, 1.5, 0.65], [42, 31, 1.7, 0.8], [64, 33, 1.4, 0.6],
  [90, 28, 1.6, 0.75], [6, 24, 1.5, 0.65], [29, 36, 1.4, 0.6], [55, 39, 1.6, 0.7],
  [3, 11, 1.3, 0.55], [35, 26, 1.3, 0.55], [75, 13, 1.3, 0.55], [97, 21, 1.3, 0.55],
  [23, 14, 1.3, 0.55], [61, 16, 1.3, 0.55], [44, 24, 1.3, 0.55], [13, 33, 1.3, 0.55],
];

const cardStyle = (isDay: boolean): React.CSSProperties => ({
  borderRadius: 22,
  padding: '14px 16px',
  background: isDay ? 'rgba(255,255,255,0.36)' : 'rgba(26,34,58,0.42)',
  backdropFilter: 'blur(24px) saturate(150%)',
  WebkitBackdropFilter: 'blur(24px) saturate(150%)',
  border: isDay ? '0.5px solid rgba(255,255,255,0.35)' : '0.5px solid rgba(255,255,255,0.14)',
});

// ── 背景：渐变天幕 + 云/星 ──
const Backdrop = React.memo(({ isDay }: { isDay: boolean }) => (
  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
    <div style={{ position: 'absolute', inset: 0, background: isDay ? DAY_SKY : NIGHT_SKY }} />
    {isDay ? (
      <div style={{ position: 'absolute', inset: 0, background: DAY_CLOUDS }} />
    ) : (
      STARS.map(([x, y, s, o], i) => (
        <span
          key={i}
          style={{
            position: 'absolute', left: `${x}%`, top: `${y}%`, width: s, height: s,
            borderRadius: '50%', background: `rgba(255,255,255,${o})`,
            boxShadow: s >= 1.8 ? '0 0 6px 1.5px rgba(255,255,255,0.45)' : undefined,
          }}
        />
      ))
    )}
  </div>
));

// ── 大字头：滚动收缩成紧凑标题（sticky 吸顶，两态交叉淡化） ──
const Head = React.memo(({ t, city, now, todayMin, todayMax }: {
  t: number;
  city: string;
  now: { temp: number; code: number };
  todayMin: number;
  todayMax: number;
}) => {
  const lerp = (a: number, b: number) => a + (b - a) * t;
  const bigOp = Math.max(1 - t / 0.55, 0);
  const smallOp = Math.min(Math.max((t - 0.45) / 0.5, 0), 1);
  return (
    <div
      style={{
        position: 'sticky', top: 0, zIndex: 6, pointerEvents: 'none',
        height: `calc(var(--chrome-top, 0px) + ${lerp(218, 52)}px)`,
        paddingTop: 'var(--chrome-top, 0px)',
      }}
    >
      {/* 吸顶模糊背板：滚动后卡片从标题下穿过时被糊住（iOS 同款） */}
      <div
        style={{
          position: 'absolute', inset: 0, opacity: smallOp, pointerEvents: 'none',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          background: 'linear-gradient(180deg, rgba(150,178,206,0.30), rgba(150,178,206,0.10))',
          maskImage: 'linear-gradient(180deg, #000 58%, transparent)',
          WebkitMaskImage: 'linear-gradient(180deg, #000 58%, transparent)',
        }}
      />
      {/* 大字态 */}
      <div
        style={{
          position: 'absolute', left: 0, right: 0, top: 'var(--chrome-top, 0px)',
          textAlign: 'center', color: '#fff', opacity: bigOp,
          transform: `translateY(${-t * 34}px) scale(${1 - t * 0.06})`, transformOrigin: 'top center',
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 500, lineHeight: '36px', letterSpacing: 0.2 }}>{city}</div>
        <div style={{ fontSize: 96, fontWeight: 200, lineHeight: '101px', letterSpacing: -2 }}>{fmtTemp(now.temp)}</div>
        <div style={{ fontSize: 16, fontWeight: 600, lineHeight: '21px', marginTop: 12 }}>{wmoText(now.code)}</div>
        <div style={{ fontSize: 15, fontWeight: 600, lineHeight: '20px', marginTop: 2, color: 'rgba(255,255,255,0.78)' }}>
          H:{fmtTemp(todayMax)} L:{fmtTemp(todayMin)}
        </div>
      </div>
      {/* 紧凑态（滚上去之后的吸顶标题） */}
      <div
        style={{
          position: 'absolute', left: 0, right: 0, top: 'calc(var(--chrome-top, 0px) + 2px)',
          textAlign: 'center', color: '#fff', opacity: smallOp,
        }}
      >
        <div style={{ fontSize: 21, fontWeight: 600, lineHeight: '25px', letterSpacing: 0.2 }}>{city}</div>
        <div style={{ fontSize: 21, fontWeight: 600, lineHeight: '25px', marginTop: 2, display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 7 }}>
          <span>{fmtTemp(now.temp)}</span>
          <span style={{ opacity: 0.5 }}>|</span>
          <span>{wmoText(now.code)}</span>
        </div>
      </div>
    </div>
  );
});

// ── 空气质量卡 ──
const AqiCard = React.memo(({ aqi, isDay }: { aqi: number; isDay: boolean }) => {
  const lv = aqiLevel(aqi);
  return (
    <div style={cardStyle(isDay)}>
      <div style={{ fontSize: 21, fontWeight: 700, color: '#fff' }}>{aqi} - {lv.text}</div>
      <div
        style={{
          position: 'relative', height: 4, borderRadius: 2, marginTop: 14,
          background: 'linear-gradient(90deg, #4cd964, #ffd60a 30%, #ff9f0a 55%, #ff453a 75%, #bf5af2 90%, #a2845e)',
        }}
      >
        <span
          style={{
            position: 'absolute', left: `${aqiPos(aqi)}%`, top: '50%', transform: 'translate(-50%, -50%)',
            width: 9, height: 9, borderRadius: '50%', background: '#fff',
          }}
        />
      </div>
      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.88)', marginTop: 12 }}>Current AQI is {aqi}.</div>
    </div>
  );
});

// ── 摘要 + 逐小时卡 ──
const HourlyCard = React.memo(({ data, isDay }: { data: WeatherData; isDay: boolean }) => (
  <div style={cardStyle(isDay)}>
    <div style={{ fontSize: 14.5, lineHeight: 1.45, color: '#fff', fontWeight: 500 }}>
      {summaryText(data.now.code, data.now.gust)}
    </div>
    <div style={{ height: 1, background: 'rgba(255,255,255,0.22)', margin: '13px 0 12px' }} />
    <div className="[&::-webkit-scrollbar]:hidden" style={{ display: 'flex', overflowX: 'auto', scrollbarWidth: 'none' }}>
      {data.hours.map((h, i) => (
        <div key={h.time} style={{ flex: '0 0 58px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>{hourLabel(h.time, i === 0)}</span>
          <WeatherIcon kind={wmoIcon(h.code, h.isDay)} size={26} />
          <span style={{ fontSize: 16.5, fontWeight: 600, color: '#fff' }}>{fmtTemp(i === 0 ? data.now.temp : h.temp)}</span>
        </div>
      ))}
    </div>
  </div>
));

// ── 10 天卡 ──
const TenDayCard = React.memo(({ data, isDay }: { data: WeatherData; isDay: boolean }) => {
  const today = data.days[0]?.date ?? '';
  const gMin = Math.min(...data.days.map((d) => d.min));
  const gMax = Math.max(...data.days.map((d) => d.max));
  const span = Math.max(gMax - gMin, 1);
  const nowPos = Math.min(Math.max(((data.now.temp - gMin) / span) * 100, 0), 100);
  return (
    <div style={cardStyle(isDay)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0 4px' }}>
        <CalendarBlank size={14} color="rgba(255,255,255,0.75)" />
        <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: 0.3, color: 'rgba(255,255,255,0.78)' }}>10-DAY FORECAST</span>
      </div>
      {data.days.map((d, i) => {
        const bar = rangeBar(d.min, d.max, gMin, gMax);
        return (
          <div
            key={d.date}
            style={{
              display: 'flex', alignItems: 'center', height: 46,
              borderTop: i > 0 ? '0.5px solid rgba(255,255,255,0.16)' : 'none',
            }}
          >
            <span style={{ width: 78, fontSize: 17, fontWeight: 600, color: '#fff' }}>{dayLabel(d.date, today)}</span>
            <div style={{ width: 46, display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
              <WeatherIcon kind={wmoIcon(d.code, i === 0 ? data.now.isDay : true)} size={26} />
              {d.pop > 0 && <span style={{ fontSize: 10.5, fontWeight: 600, color: '#8fd3ff', marginTop: 1 }}>{d.pop}%</span>}
            </div>
            <span style={{ width: 40, textAlign: 'right', fontSize: 17, fontWeight: 600, color: 'rgba(255,255,255,0.62)' }}>
              {fmtTemp(d.min)}
            </span>
            <div style={{ flex: 1, height: 4, margin: '0 9px', position: 'relative' }}>
              <div
                style={{
                  position: 'absolute', left: `${bar.left}%`, width: `${bar.width}%`, top: 0, bottom: 0, borderRadius: 2,
                  background: `linear-gradient(90deg, ${tempColor(d.min)}, ${tempColor(d.max)})`,
                }}
              />
              {i === 0 && (
                <span
                  style={{
                    position: 'absolute', left: `${nowPos}%`, top: '50%', transform: 'translate(-50%, -50%)',
                    width: 8, height: 8, borderRadius: '50%', background: '#fff',
                  }}
                />
              )}
            </div>
            <span style={{ width: 40, textAlign: 'right', fontSize: 17, fontWeight: 600, color: '#fff' }}>{fmtTemp(d.max)}</span>
          </div>
        );
      })}
    </div>
  );
});

// ── 页面 ──
const CoupleWeather: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const store = useWeatherStore();
  const data = store.data;
  const isDay = data?.now.isDay ?? true;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [t, setT] = useState(0);
  const tRef = useRef(0);

  const refresh = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      saveWeatherData(await fetchWeather(getWeatherStore().city));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const d = getWeatherStore().data;
    const stale = !d || Date.now() - new Date(d.fetchedAt).getTime() > WEATHER_FRESH_MS;
    if (stale) void refresh();
  }, [refresh]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const next = Math.min(e.currentTarget.scrollTop / 150, 1);
    if (Math.abs(next - tRef.current) < 0.02) return;
    tRef.current = next;
    setT(next);
  };

  const backBtn = (
    <button
      onClick={onBack}
      aria-label="返回"
      style={{
        position: 'absolute', top: 'calc(var(--chrome-top, 0px) + 6px)', left: 12, zIndex: 30,
        width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        border: '0.5px solid rgba(255,255,255,0.3)',
      }}
    >
      <ArrowLeft size={20} color="#fff" />
    </button>
  );

  // 从没拉到过数据：转圈 / 失败重试
  if (!data) {
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <Backdrop isDay />
        {backBtn}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
          {failed ? (
            <div style={{ textAlign: 'center', color: '#fff', padding: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>天气没拉下来</div>
              <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 16 }}>检查一下网络，再试一次</div>
              <button
                onClick={() => void refresh()}
                style={{
                  fontSize: 14, fontWeight: 700, color: '#1c2340', background: '#fff',
                  borderRadius: 999, padding: '9px 22px', border: 'none',
                }}
              >
                重试
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div className="animate-spin" style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff' }} />
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>正在获取天气…</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const todayMin = data.days[0]?.min ?? data.now.temp;
  const todayMax = data.days[0]?.max ?? data.now.temp;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Backdrop isDay={isDay} />
      {/* 内容滚动层 */}
      <div
        className="[&::-webkit-scrollbar]:hidden"
        onScroll={handleScroll}
        style={{ position: 'absolute', inset: 0, overflowY: 'auto', scrollbarWidth: 'none', zIndex: 5 }}
      >
        <Head t={t} city={store.city.name} now={data.now} todayMin={todayMin} todayMax={todayMax} />
        <div style={{ position: 'relative', zIndex: 3, padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.aqi && <AqiCard aqi={data.aqi.aqi} isDay={isDay} />}
          <HourlyCard data={data} isDay={isDay} />
          <TenDayCard data={data} isDay={isDay} />
        </div>
        <div style={{ height: 'calc(var(--safe-bottom, 0px) + 170px)' }} />
      </div>
      {backBtn}
      {/* 底部工具栏（浮在底部胶囊导航上方） */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(var(--safe-bottom, 0px) + 92px)', zIndex: 30, padding: '0 14px', pointerEvents: 'none' }}>
        <div
          style={{
            height: 50, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px',
            background: isDay ? 'rgba(255,255,255,0.26)' : 'rgba(26,34,58,0.4)',
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            border: isDay ? '0.5px solid rgba(255,255,255,0.35)' : '0.5px solid rgba(255,255,255,0.14)',
          }}
        >
          <MapTrifold size={22} color="rgba(255,255,255,0.95)" />
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />
          <ListDashes size={22} color="rgba(255,255,255,0.95)" />
        </div>
      </div>
    </div>
  );
};

export default CoupleWeather;

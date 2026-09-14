// 天气页 c6（2026-09-14 看图写 UI 练手批；2026-09-15 城市列表批升级多城市）——照 iOS 天气截图：
// 大字头（滚动收缩成紧凑标题吸顶）→ 空气质量卡 → 摘要+逐小时卡 → 10 天卡 → 底部工具栏。
// 多城市：左右横滑切城市（跟手阻尼 + 松手判定，纯函数 swipeStep），工具栏圆点显示在第几座；
// 工具栏右侧列表图标 → 城市列表页（CoupleCityList，本页内视图切换，沉浸保持）。
// 数据 Open-Meteo（weatherApi）→ weatherStore 缓存：重进先用缓存秒开，超 30 分钟后台刷新；
// 从没拉到过数据时才显示错误页。白天/夜晚两套主题照图（背景见 WeatherSky，与列表卡共用）。
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CalendarBlank, ListDashes, MapTrifold } from '@phosphor-icons/react';
import { ensureFreshWeather } from './weatherApi';
import { cityKey, currentCity, getWeatherStore, setCurrentCity, useWeatherStore, WEATHER_FRESH_MS } from './weatherStore';
import type { WeatherData } from './weatherStore';
import WeatherIcon from './WeatherIcon';
import Sky, { DAY_CLOUDS, DAY_SKY, NIGHT_SKY } from './WeatherSky';
import CoupleCityList from './CoupleCityList';
import {
  aqiLevel, aqiPos, dayLabel, fmtTemp, hourLabel, rangeBar, summaryText, swipeStep, tempColor, wmoIcon, wmoText,
} from '../../utils/weatherMath';

// 文字阴影（2026-09-15 她指出白天可读性低）——照例图：iOS 白字全带柔和暗晕，压在任何云上都清楚。
// 白天给足，夜晚几乎不需要（深底白字对比本来就够，加了反而糊）。
const TEXT_SHADOW_DAY = '0 1px 5px rgba(0,0,0,0.35), 0 0 2px rgba(0,0,0,0.18)';

const cardStyle = (isDay: boolean): React.CSSProperties => ({
  borderRadius: 22,
  padding: '14px 16px',
  // 白天卡 = 蓝玻璃（照例图；以前是白玻璃，白字压白卡糊）；夜晚 = 深蓝玻璃
  background: isDay ? 'rgba(56,104,170,0.45)' : 'rgba(26,34,58,0.42)',
  backdropFilter: 'blur(24px) saturate(150%)',
  WebkitBackdropFilter: 'blur(24px) saturate(150%)',
  border: isDay ? '0.5px solid rgba(255,255,255,0.28)' : '0.5px solid rgba(255,255,255,0.14)',
});

// ── 大字头：滚动收缩成紧凑标题（sticky 吸顶，两态交叉淡化） ──
const Head = React.memo(({ t, city, now, todayMin, todayMax, isDay }: {
  t: number;
  city: string;
  now: { temp: number; code: number };
  todayMin: number;
  todayMax: number;
  isDay: boolean;
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
      {/* 吸顶背板 = 背景顶部的实色副本（不用 backdrop-filter：手机上 mask+模糊会失效，文字会露出来）
          穿行过来的卡片文字被它整块盖住；底边一小段渐隐收尾 */}
      <div
        style={{
          position: 'absolute', left: 0, right: 0, top: 0,
          height: `calc(var(--chrome-top, 0px) + ${lerp(218, 52) + 36}px)`,
          opacity: smallOp, overflow: 'hidden', pointerEvents: 'none',
          maskImage: 'linear-gradient(180deg, #000 84%, transparent)',
          WebkitMaskImage: 'linear-gradient(180deg, #000 84%, transparent)',
        }}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100vh', background: isDay ? DAY_SKY : NIGHT_SKY }} />
        {isDay && <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100vh', background: DAY_CLOUDS }} />}
      </div>
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
  const cities = store.cities;
  const curCity = currentCity(store);
  const curKey = cityKey(curCity);
  const data = store.datas[curKey] ?? null;
  const idx = Math.max(cities.findIndex((c) => cityKey(c) === curKey), 0);
  const isDay = data?.now.isDay ?? true;

  const [view, setView] = useState<'detail' | 'list'>('detail');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  // 横滑：drag = 跟手位移；enter = 切城市后内容从哪侧轻轻滑入（±1）
  const [drag, setDrag] = useState(0);
  const [enter, setEnter] = useState(0);
  const dragRef = useRef({ x: 0, y: 0, dx: 0, t: 0, axis: null as null | 'x' | 'y', active: false });
  const width = typeof window !== 'undefined' ? window.innerWidth : 430;

  const refresh = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      await ensureFreshWeather(currentCity(), 0); // 手动重试 / 过期刷新 = 强制拉，现读当前城市
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (view !== 'detail') return;
    const d = getWeatherStore().datas[curKey];
    if (!d || Date.now() - new Date(d.fetchedAt).getTime() > WEATHER_FRESH_MS) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curKey, view, refresh]);

  // 换城市：滚动容器重挂载回顶部，大字头状态也归零
  useEffect(() => {
    tRef.current = 0;
    setT(0);
  }, [curKey]);

  const goCity = (next: number, dir: number) => {
    if (next < 0 || next >= cities.length) return;
    setEnter(dir); // 新内容先带偏移，下一帧归位 → 轻轻滑入
    setCurrentCity(cityKey(cities[next]));
    requestAnimationFrame(() => requestAnimationFrame(() => setEnter(0)));
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const p = e.touches[0];
    dragRef.current = { x: p.clientX, y: p.clientY, dx: 0, t: Date.now(), axis: null, active: true };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const st = dragRef.current;
    if (!st.active) return;
    const p = e.touches[0];
    const dx = p.clientX - st.x;
    const dy = p.clientY - st.y;
    if (st.axis === null) {
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
      st.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (st.axis !== 'x') return;
    st.dx = dx;
    const edge = (dx > 0 && idx === 0) || (dx < 0 && idx === cities.length - 1); // 到头了阻尼更重
    setDrag(edge ? dx * 0.16 : dx * 0.55);
  };
  const onTouchEnd = () => {
    const st = dragRef.current;
    st.active = false;
    if (st.axis !== 'x') {
      setDrag(0);
      return;
    }
    const step = swipeStep(st.dx, Date.now() - st.t, width);
    setDrag(0);
    if (step !== 0) goCity(idx + step, step > 0 ? 1 : -1);
  };

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

  // 城市列表视图（本页内切换，沉浸保持）
  if (view === 'list') {
    return (
      <CoupleCityList
        onBack={() => setView('detail')}
        onPick={(k) => {
          setCurrentCity(k);
          setView('detail');
        }}
      />
    );
  }

  // 从没拉到过数据：转圈 / 失败重试
  if (!data) {
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <Sky isDay />
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
  const enterStyle: React.CSSProperties = enter !== 0
    ? { transform: `translateX(${enter * 26}px)`, opacity: 0.35, transition: 'none' }
    : { transform: 'translateX(0px)', opacity: 1, transition: 'transform 0.22s ease, opacity 0.22s ease' };

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* 横滑层（touch-action: pan-y → 纵向还给滚动，横向归我们）；白天文字整层继承柔阴影 */}
      <div
        style={{
          position: 'absolute', inset: 0, touchAction: 'pan-y',
          transform: drag ? `translateX(${drag}px)` : undefined,
          textShadow: isDay ? TEXT_SHADOW_DAY : undefined,
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div style={{ position: 'absolute', inset: 0, ...enterStyle }}>
          <Sky isDay={isDay} />
          {/* 内容滚动层（key=城市：换城市回到顶部 + 重置大字头状态） */}
          <div
            key={curKey}
            className="[&::-webkit-scrollbar]:hidden"
            onScroll={handleScroll}
            style={{ position: 'absolute', inset: 0, overflowY: 'auto', scrollbarWidth: 'none', zIndex: 5 }}
          >
            <Head t={t} city={curCity.name} now={data.now} todayMin={todayMin} todayMax={todayMax} isDay={isDay} />
            <div style={{ position: 'relative', zIndex: 3, padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.aqi && <AqiCard aqi={data.aqi.aqi} isDay={isDay} />}
              <HourlyCard data={data} isDay={isDay} />
              <TenDayCard data={data} isDay={isDay} />
            </div>
            <div style={{ height: 'calc(var(--safe-bottom, 0px) + 74px)' }} />
          </div>
          {backBtn}
        </div>
      </div>
      {/* 底部工具栏（原版样式：通栏贴底；此页全局胶囊导航已隐藏） */}
      <div
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 30,
          height: 'calc(var(--safe-bottom, 0px) + 54px)', paddingBottom: 'var(--safe-bottom, 0px)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingLeft: 22, paddingRight: 22,
          background: isDay ? 'rgba(255,255,255,0.08)' : 'rgba(14,20,38,0.25)',
          backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        }}
      >
        <MapTrifold size={22} color="rgba(255,255,255,0.95)" />
        {/* 城市圆点：当前那座亮着（原版底部分页点） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {cities.map((c, i) => (
            <span
              key={cityKey(c)}
              style={{
                width: i === idx ? 7 : 5, height: i === idx ? 7 : 5, borderRadius: '50%',
                background: i === idx ? '#fff' : 'rgba(255,255,255,0.42)',
                transition: 'background 0.2s, width 0.2s, height 0.2s',
              }}
            />
          ))}
        </div>
        <button
          onClick={() => setView('list')}
          aria-label="城市列表"
          style={{ background: 'none', border: 'none', padding: 4, display: 'flex', alignItems: 'center' }}
        >
          <ListDashes size={22} color="rgba(255,255,255,0.95)" />
        </button>
      </div>
    </div>
  );
};

export default CoupleWeather;

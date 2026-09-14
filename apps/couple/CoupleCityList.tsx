// 城市列表页（2026-09-15 城市列表批，照她 iOS 截图第 4 张）——Weather 大标题 + 右上 ••• + 搜索胶囊 + 城市卡列表。
// 卡背景按该城市当地昼夜画天空（WeatherSky，与天气页共用；夜=星空每城不同、白天=蓝天白云）；
// 点卡 → 切城市回天气页；长按 520ms → 确认删除；搜索（Open-Meteo geocoding，防抖 300ms）点结果 → 加进列表并打开。
// ••• 是原版菜单入口（编辑列表/单位/通知），本轮做视觉、点了不动作。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, DotsThree, House, MagnifyingGlass, Microphone } from '@phosphor-icons/react';
import ConfirmDialog from '../../components/os/ConfirmDialog';
import Sky from './WeatherSky';
import {
  addWeatherCity, cityKey, currentCity, removeWeatherCity, useWeatherStore,
} from './weatherStore';
import type { WeatherCity, WeatherData } from './weatherStore';
import { ensureCitiesWeather, ensureFreshWeather, searchCity } from './weatherApi';
import type { CityHit } from './weatherApi';
import { fmtCityTime, fmtTemp, starField, wmoText } from '../../utils/weatherMath';

// ── 城市卡（照图：左上城市名 + 小字时间/My Location，右上大温度，左下描述，右下 H/L） ──
const CityCard = React.memo(({ city, data, onTap, onPressStart, onPressEnd }: {
  city: WeatherCity;
  data: WeatherData | null;
  onTap: () => void;
  onPressStart: () => void;
  onPressEnd: () => void;
}) => {
  const isDay = data?.now.isDay ?? false;
  const stars = useMemo(() => starField(cityKey(city), 16), [city]);
  const t = data?.now;
  const today = data?.days?.[0];
  return (
    <button
      onClick={onTap}
      onTouchStart={onPressStart}
      onTouchEnd={onPressEnd}
      onTouchMove={onPressEnd}
      onTouchCancel={onPressEnd}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'relative', display: 'block', width: '100%', height: 104,
        borderRadius: 20, overflow: 'hidden', border: 'none', padding: 0, marginBottom: 17,
        textAlign: 'left', color: '#fff', WebkitTapHighlightColor: 'transparent',
        textShadow: '0 1px 6px rgba(0,0,0,0.35)',
      }}
    >
      <Sky isDay={isDay} stars={stars} />
      {/* 压色层：白天卡顶部的云很白、白字压不住 → 盖一层饱和蓝（原版白天城市卡就是蓝天）；
          夜晚卡盖一层浅暗化，更贴原图 */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: isDay
            ? 'linear-gradient(180deg, rgba(56,110,182,0.5) 0%, rgba(34,80,150,0.62) 100%)'
            : 'rgba(8,14,32,0.1)',
        }}
      />
      <div style={{ position: 'absolute', left: 18, top: 15 }}>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: 0.2, lineHeight: '24px' }}>{city.name}</div>
        <div style={{ marginTop: 3, fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.88)', display: 'flex', alignItems: 'center', gap: 4, lineHeight: '16px' }}>
          {city.home ? (
            <>
              <span>My Location</span>
              <span style={{ opacity: 0.55 }}>·</span>
              <House size={12} weight="fill" color="rgba(255,255,255,0.88)" />
              <span>Home</span>
            </>
          ) : (
            <span>{t ? fmtCityTime(t.time) : '——'}</span>
          )}
        </div>
      </div>
      <div style={{ position: 'absolute', right: 18, top: 9, fontSize: 42, fontWeight: 200, letterSpacing: -1, lineHeight: '50px' }}>
        {t ? fmtTemp(t.temp) : '--°'}
      </div>
      <div style={{ position: 'absolute', left: 18, bottom: 13, fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,0.96)' }}>
        {t ? wmoText(t.code) : ''}
      </div>
      <div style={{ position: 'absolute', right: 18, bottom: 14, fontSize: 13, fontWeight: 600 }}>
        {today ? (
          <>
            <span style={{ opacity: 0.62 }}>H:</span>
            {fmtTemp(today.max)}
            <span style={{ opacity: 0.62, marginLeft: 6 }}>L:</span>
            {fmtTemp(today.min)}
          </>
        ) : ''}
      </div>
    </button>
  );
});

// ── 页面 ──
const CoupleCityList: React.FC<{ onBack: () => void; onPick: (key: string) => void }> = ({ onBack, onPick }) => {
  const store = useWeatherStore();
  const cities = store.cities;
  const nowCity = currentCity(store);
  const isDay = store.datas[cityKey(nowCity)]?.now.isDay ?? false;

  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CityHit[] | null>(null);
  const [confirmDel, setConfirmDel] = useState<WeatherCity | null>(null);
  const pressRef = useRef<number | null>(null);
  const longFired = useRef(false);

  // 进页就把所有城市的天气补齐（各自走缓存/去重，某城失败不拖累别的）
  useEffect(() => {
    void ensureCitiesWeather(cities);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 搜索：防抖 300ms；清空恢复城市卡
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setHits(null);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      searchCity(query)
        .then((r) => { if (alive) setHits(r); })
        .catch(() => { if (alive) setHits([]); });
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [q]);

  const pressStart = (c: WeatherCity) => {
    longFired.current = false;
    if (pressRef.current) window.clearTimeout(pressRef.current);
    pressRef.current = window.setTimeout(() => {
      pressRef.current = null;
      longFired.current = true;
      setConfirmDel(c);
    }, 520);
  };
  const pressEnd = () => {
    if (pressRef.current) {
      window.clearTimeout(pressRef.current);
      pressRef.current = null;
    }
  };
  const tapCity = (c: WeatherCity) => {
    if (longFired.current) {
      longFired.current = false;
      return; // 长按弹删除后抑制这次点击
    }
    onPick(cityKey(c));
  };
  const pickHit = (h: CityHit) => {
    const city: WeatherCity = { name: h.name, lat: h.lat, lon: h.lon, region: h.region };
    const key = addWeatherCity(city);
    void ensureFreshWeather(city).catch(() => {});
    onPick(key);
  };

  const fg = isDay ? '#111111' : '#ffffff';
  const ringStyle: React.CSSProperties = {
    position: 'absolute', top: 'calc(var(--chrome-top, 0px) + 6px)', zIndex: 10,
    width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: isDay ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.14)',
    border: isDay ? '0.5px solid rgba(0,0,0,0.12)' : '0.5px solid rgba(255,255,255,0.28)',
    WebkitTapHighlightColor: 'transparent',
  };

  return (
    <div
      className="page-focus-once"
      style={{ position: 'absolute', inset: 0, zIndex: 40, background: isDay ? '#eef0f4' : '#05070d', color: fg, overflow: 'hidden' }}
    >
      <button onClick={onBack} aria-label="返回" style={{ ...ringStyle, left: 12 }}>
        <ArrowLeft size={20} color={fg} />
      </button>
      {/* ••• 原版菜单入口（本轮视觉） */}
      <div style={{ ...ringStyle, right: 12 }} aria-hidden>
        <DotsThree size={24} weight="bold" color={fg} />
      </div>

      <div
        className="[&::-webkit-scrollbar]:hidden"
        style={{
          position: 'absolute', inset: 0, overflowY: 'auto', scrollbarWidth: 'none',
          paddingTop: 'calc(var(--chrome-top, 0px) + 58px)',
          paddingBottom: 'calc(var(--safe-bottom, 0px) + 28px)',
          paddingLeft: 18, paddingRight: 18,
        }}
      >
        <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: 0.2, lineHeight: '39px', margin: '0 0 16px' }}>Weather</div>

        {/* 搜索胶囊 */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 7, height: 38, borderRadius: 12, padding: '0 12px',
            background: isDay ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.13)', marginBottom: 20,
          }}
        >
          <MagnifyingGlass size={17} color={isDay ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.6)'} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search for a city or airport"
            aria-label="搜索城市"
            style={{
              flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
              fontSize: 17, color: fg, fontFamily: 'inherit',
            }}
          />
          <Microphone size={17} color={isDay ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.6)'} />
        </div>

        {hits ? (
          hits.length === 0 ? (
            <div style={{ fontSize: 14, opacity: 0.6, padding: '14px 4px' }}>没搜到这座城市，换个名字试试</div>
          ) : (
            hits.map((h) => (
              <button
                key={`${h.name}-${h.lat}-${h.lon}`}
                onClick={() => pickHit(h)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', border: 'none', padding: '12px 4px',
                  background: 'transparent', color: fg, borderBottom: `0.5px solid ${isDay ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)'}`,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 600 }}>{h.name}</div>
                {h.region && <div style={{ fontSize: 12.5, opacity: 0.6, marginTop: 2 }}>{h.region}</div>}
              </button>
            ))
          )
        ) : (
          cities.map((c) => (
            <CityCard
              key={cityKey(c)}
              city={c}
              data={store.datas[cityKey(c)] ?? null}
              onTap={() => tapCity(c)}
              onPressStart={() => pressStart(c)}
              onPressEnd={pressEnd}
            />
          ))
        )}
      </div>

      <ConfirmDialog
        isOpen={!!confirmDel}
        title={confirmDel ? `从列表里删掉「${confirmDel.name}」吗？` : ''}
        message="只是从天气列表里移除，以后还能搜回来。"
        variant="danger"
        confirmText="删除"
        onConfirm={() => {
          if (confirmDel) removeWeatherCity(cityKey(confirmDel));
          setConfirmDel(null);
        }}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
};

export default CoupleCityList;

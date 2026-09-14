// 天气数据拉取（2026-09-14 c6；2026-09-15 多城市）——Open-Meteo 免费接口，无需 key：
// 主数据（实时/逐小时/10 天）与空气质量并行拉；空气质量失败不影响主数据（aqi 记 null）。
// 超时 12 秒；返回结构直接映射成 weatherStore 的 WeatherData。城市搜索用 geocoding 接口。
import type { WeatherAqi, WeatherCity, WeatherData, WeatherDay, WeatherHour } from './weatherStore';
import { cityKey, getWeatherStore, saveWeatherData, WEATHER_FRESH_MS } from './weatherStore';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';

async function getJson(url: string, timeoutMs = 12000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// 每座城市各自去重（天气页 / 首屏卡 / 列表页可能同时挂载）
const inflight = new Map<string, Promise<void>>();

/**
 * 需要才拉：该城市缓存新鲜就直接返回；并发调用共享同一个请求。
 * 失败会抛出，交给调用方决定展示（inflight 由 finally 清掉，不影响下次重试）。
 */
export function ensureFreshWeather(city: WeatherCity, maxAgeMs: number = WEATHER_FRESH_MS): Promise<void> {
  const k = cityKey(city);
  const cur = getWeatherStore().datas[k];
  if (cur && Date.now() - new Date(cur.fetchedAt).getTime() <= maxAgeMs) return Promise.resolve();
  const running = inflight.get(k);
  if (running) return running;
  const p = fetchWeather(city)
    .then((d) => {
      saveWeatherData(city, d);
    })
    .finally(() => {
      inflight.delete(k);
    });
  inflight.set(k, p);
  return p;
}

/** 列表页：并发补齐多座城市（各自走缓存/去重；单城失败不拖累别的） */
export function ensureCitiesWeather(cities: WeatherCity[]): Promise<void> {
  return Promise.all(cities.map((c) => ensureFreshWeather(c).catch(() => {}))).then(() => undefined);
}

/** 拉一个城市的天气：实时 + 未来 24 小时 + 10 天 + 空气质量 */
export async function fetchWeather(city: WeatherCity): Promise<WeatherData> {
  const base = `latitude=${city.lat}&longitude=${city.lon}&timezone=auto`;
  const fxUrl = `${FORECAST_URL}?${base}&forecast_days=10`
    + '&current=temperature_2m,apparent_temperature,is_day,weather_code,wind_gusts_10m'
    + '&hourly=temperature_2m,weather_code,precipitation_probability,is_day'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max';
  const aqUrl = `${AIR_URL}?${base}&current=us_aqi,pm2_5`;

  const [fx, aq] = await Promise.all([
    getJson(fxUrl),
    getJson(aqUrl).catch(() => null),
  ]);

  const c = fx?.current;
  if (!c || typeof c.temperature_2m !== 'number') throw new Error('天气数据格式不对');

  // 逐小时：从当前整点起取 24 条
  const hTimes: string[] = fx.hourly?.time ?? [];
  const start = Math.max(hTimes.indexOf(c.time), 0);
  const hours: WeatherHour[] = [];
  for (let i = start; i < Math.min(start + 24, hTimes.length); i++) {
    hours.push({
      time: hTimes[i],
      temp: fx.hourly.temperature_2m[i],
      code: fx.hourly.weather_code[i],
      pop: fx.hourly.precipitation_probability?.[i] ?? 0,
      isDay: fx.hourly.is_day[i] === 1,
    });
  }

  const days: WeatherDay[] = ((fx.daily?.time ?? []) as string[]).slice(0, 10).map((date, i) => ({
    date,
    code: fx.daily.weather_code[i],
    min: fx.daily.temperature_2m_min[i],
    max: fx.daily.temperature_2m_max[i],
    pop: fx.daily.precipitation_probability_max?.[i] ?? 0,
  }));

  const aqi: WeatherAqi | null = typeof aq?.current?.us_aqi === 'number'
    ? { aqi: aq.current.us_aqi, pm25: aq.current.pm2_5 ?? 0 }
    : null;

  return {
    fetchedAt: new Date().toISOString(),
    now: {
      time: typeof c.time === 'string' ? c.time : (hours[0]?.time ?? ''),
      temp: c.temperature_2m,
      feels: typeof c.apparent_temperature === 'number' ? c.apparent_temperature : c.temperature_2m,
      isDay: c.is_day === 1,
      code: c.weather_code,
      gust: c.wind_gusts_10m ?? 0,
    },
    hours,
    days,
    aqi,
  };
}

// ── 城市搜索（列表页） ──

export interface CityHit { name: string; region: string; lat: number; lon: number }

/** 搜城市：中文名 + 省/国家一行小字；没结果给空数组 */
export async function searchCity(query: string, count = 8): Promise<CityHit[]> {
  const url = `${GEO_URL}?name=${encodeURIComponent(query)}&count=${count}&language=zh&format=json`;
  const j = await getJson(url, 10000);
  const results: any[] = Array.isArray(j?.results) ? j.results : [];
  return results
    .map((r) => ({
      name: String(r?.name ?? '').trim(),
      region: [r?.admin1, r?.country].filter((x) => typeof x === 'string' && x).join(' · '),
      lat: Number(r?.latitude),
      lon: Number(r?.longitude),
    }))
    .filter((r) => r.name && Number.isFinite(r.lat) && Number.isFinite(r.lon));
}

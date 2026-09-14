// 天气数据拉取（2026-09-14 c6）——Open-Meteo 免费接口，无需 key：
// 主数据（实时/逐小时/10 天）与空气质量并行拉；空气质量失败不影响主数据（aqi 记 null）。
// 超时 12 秒；返回结构直接映射成 weatherStore 的 WeatherData。
import type { WeatherAqi, WeatherCity, WeatherData, WeatherDay, WeatherHour } from './weatherStore';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

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

// 天气缓存 store（2026-09-14 c6 / 2026-09-15 城市列表批升级多城市）。
// cities = 显示顺序（[0] 是 My Location，home 字段标记）；datas 按城市坐标存档；current 指当前在看哪座。
// 页面重进先用缓存秒开，超 30 分钟才后台刷新；拉取失败时旧数据照常显示（错误页只在从没拉到过时出现）。
// v1（单城市）→ v2 结构换了，旧缓存作废重拉即可（天气是缓存不是数据，不入备份范围）。
import { createCoupleStore, isoNow } from './coupleStoreBase';

export interface WeatherCity { name: string; lat: number; lon: number; home?: boolean; region?: string }
export interface WeatherNow { time: string; temp: number; feels: number; isDay: boolean; code: number; gust: number }
export interface WeatherHour { time: string; temp: number; code: number; pop: number; isDay: boolean }
export interface WeatherDay { date: string; code: number; min: number; max: number; pop: number }
export interface WeatherAqi { aqi: number; pm25: number }
export interface WeatherData {
  fetchedAt: string;
  now: WeatherNow;
  hours: WeatherHour[];
  days: WeatherDay[];
  aqi: WeatherAqi | null;
}
export interface WeatherState {
  version: number;
  updatedAt: string;
  cities: WeatherCity[];
  datas: Record<string, WeatherData>;
  current: string; // cityKey
}

/** 城市身份 = 坐标（geocoding 同名城市不会撞） */
export function cityKey(c: { lat: number; lon: number }): string {
  return `${c.lat.toFixed(4)},${c.lon.toFixed(4)}`;
}

// 种子城市照她截图第 4 张：上海（第一张 · My Location）+ 大连 / 延吉 / 沈阳 / 北京东城区。
export const DEFAULT_CITIES: WeatherCity[] = [
  { name: '上海', lat: 31.2304, lon: 121.4737, home: true },
  { name: '大连市', lat: 38.914, lon: 121.6147 },
  { name: '延吉市', lat: 42.9075, lon: 129.5097 },
  { name: '沈阳市', lat: 41.8057, lon: 123.4315 },
  { name: '东城区', lat: 39.9288, lon: 116.4161 },
];
/** 默认城市（首屏天气卡等旧调用点沿用） */
export const DEFAULT_CITY: WeatherCity = DEFAULT_CITIES[0];

/** 缓存新鲜期：超过就后台刷新 */
export const WEATHER_FRESH_MS = 30 * 60 * 1000;

const store = createCoupleStore<WeatherState>('couple_weather_v1', 2, {
  version: 2,
  updatedAt: isoNow(),
  cities: DEFAULT_CITIES,
  datas: {},
  current: cityKey(DEFAULT_CITIES[0]),
});

export const useWeatherStore = store.use;
export const getWeatherStore = store.get;
export const weatherStoreApi = store;

/** 当前在看的城市（s 可传组件里的 hook 值；不传读 store） */
export function currentCity(s: WeatherState = store.get()): WeatherCity {
  return s.cities.find((c) => cityKey(c) === s.current) ?? s.cities[0] ?? DEFAULT_CITY;
}

export function saveWeatherData(city: WeatherCity, data: WeatherData): void {
  const k = cityKey(city);
  store.set((s) => ({ ...s, datas: { ...s.datas, [k]: data }, updatedAt: isoNow() }));
}

export function setCurrentCity(key: string): void {
  store.set((s) => (s.cities.some((c) => cityKey(c) === key) ? { ...s, current: key, updatedAt: isoNow() } : s));
}

/** 加城市（已存在就只切过去）；返回它的 key */
export function addWeatherCity(city: WeatherCity): string {
  const k = cityKey(city);
  store.set((s) => (
    s.cities.some((c) => cityKey(c) === k)
      ? { ...s, current: k, updatedAt: isoNow() }
      : { ...s, cities: [...s.cities, city], current: k, updatedAt: isoNow() }
  ));
  return k;
}

/** 把某座城市设为 My Location（移到列表第一位，home 标记跟着转移——原版的第一张就是当前位置） */
export function setHomeCity(key: string): void {
  store.set((s) => {
    const target = s.cities.find((c) => cityKey(c) === key);
    if (!target || target.home) return s;
    const rest = s.cities
      .filter((c) => cityKey(c) !== key)
      .map((c) => (c.home ? { ...c, home: undefined } : c));
    return { ...s, cities: [{ ...target, home: true }, ...rest], updatedAt: isoNow() };
  });
}

/** 删城市（至少留一座；删的是当前城市就切回第一座） */
export function removeWeatherCity(key: string): void {
  store.set((s) => {
    if (s.cities.length <= 1) return s;
    const cities = s.cities.filter((c) => cityKey(c) !== key);
    const datas = { ...s.datas };
    delete datas[key];
    return { ...s, cities, datas, current: s.current === key ? cityKey(cities[0]) : s.current, updatedAt: isoNow() };
  });
}

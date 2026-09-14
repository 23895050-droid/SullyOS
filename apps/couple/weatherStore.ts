// 天气缓存 store（2026-09-14 c6）——当前城市 + 最近一次拉取结果。
// 页面重进先用缓存秒开，超 30 分钟才后台刷新；拉取失败时旧数据照常显示（错误页只在从没拉到过时出现）。
import { createCoupleStore, isoNow } from './coupleStoreBase';

export interface WeatherCity { name: string; lat: number; lon: number }
export interface WeatherNow { temp: number; feels: number; isDay: boolean; code: number; gust: number }
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
  city: WeatherCity;
  data: WeatherData | null;
}

// 默认城市：上海（与 CoupleBelow 天气卡现状一致）。城市列表页下一轮做，先把坐标固定在这。
export const DEFAULT_CITY: WeatherCity = { name: '上海', lat: 31.2304, lon: 121.4737 };

/** 缓存新鲜期：超过就后台刷新 */
export const WEATHER_FRESH_MS = 30 * 60 * 1000;

const store = createCoupleStore<WeatherState>('couple_weather_v1', 1, {
  version: 1,
  updatedAt: isoNow(),
  city: DEFAULT_CITY,
  data: null,
});

export const useWeatherStore = store.use;
export const getWeatherStore = store.get;
export const weatherStoreApi = store;

export function saveWeatherData(data: WeatherData): void {
  store.set((s) => ({ ...s, data, updatedAt: isoNow() }));
}

export function saveWeatherCity(city: WeatherCity): void {
  store.set((s) => ({ ...s, city, updatedAt: isoNow() }));
}

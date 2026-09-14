// 天气卡片注入偏好（2026-09-15）——转发天气卡片时，角色能读到的详细数据逐项开关（卡片表面的四样固定）。
// 与「常驻挂载」是两套：常驻（聊天时的天气信息）走挂载设置页的 weather 块参数；这里是转发那一刻的取舍。
import { createCoupleStore, isoNow } from './coupleStoreBase';

export interface WeatherCardPrefs {
  feels: boolean;   // 体感温度
  aqi: boolean;     // 空气质量
  hourly: boolean;  // 接下来几小时
  daily: boolean;   // 未来几天
}

export interface WeatherPrefsState {
  version: number;
  updatedAt: string;
  cardInject: WeatherCardPrefs;
}

const store = createCoupleStore<WeatherPrefsState>('couple_weather_prefs_v1', 1, {
  version: 1,
  updatedAt: isoNow(),
  cardInject: { feels: true, aqi: true, hourly: true, daily: true },
});

export const useWeatherPrefs = store.use;
export const getWeatherPrefs = store.get;
export const weatherPrefsStoreApi = store;

export const CARD_INJECT_ITEMS: Array<{ key: keyof WeatherCardPrefs; label: string; hint: string }> = [
  { key: 'feels', label: '体感温度', hint: '「我这边体感多少」' },
  { key: 'aqi', label: '空气质量', hint: 'AQI 数字和等级' },
  { key: 'hourly', label: '接下来几小时', hint: '往后 6 小时温度/天气' },
  { key: 'daily', label: '未来几天', hint: '往后 3 天高低温 + 降水概率' },
];

export function setCardInject(key: keyof WeatherCardPrefs, on: boolean): void {
  store.set((s) => ({ ...s, cardInject: { ...s.cardInject, [key]: on }, updatedAt: isoNow() }));
}

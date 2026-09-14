// 天气页纯函数（2026-09-14 c6 看图写 UI 练手批）——WMO 天气码映射 / 温度色带与 10 天区间条 /
// 时间与星期标签 / AQI 分级。英文文案与 12 小时制照 iOS 天气截图。

export type WeatherIconKind =
  | 'sun' | 'moon' | 'cloud-sun' | 'cloud-moon' | 'cloud'
  | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunder';

/** WMO 天气码 → 英文描述（照截图词表） */
export function wmoText(code: number): string {
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly Clear';
  if (code === 2) return 'Partly Cloudy';
  if (code === 3) return 'Mostly Cloudy';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code === 56 || code === 57) return 'Freezing Drizzle';
  if (code === 61) return 'Light Rain';
  if (code === 63) return 'Rain';
  if (code === 65) return 'Heavy Rain';
  if (code === 66 || code === 67) return 'Freezing Rain';
  if (code === 71) return 'Light Snow';
  if (code === 73) return 'Snow';
  if (code === 75) return 'Heavy Snow';
  if (code === 77) return 'Snow Grains';
  if (code === 80 || code === 81) return 'Rain Showers';
  if (code === 82) return 'Heavy Showers';
  if (code === 85 || code === 86) return 'Snow Showers';
  if (code >= 95 && code <= 99) return 'Thunderstorm';
  return 'Clear';
}

/** WMO 天气码 → 图标种类（昼夜两套变体） */
export function wmoIcon(code: number, isDay: boolean): WeatherIconKind {
  if (code === 0 || code === 1) return isDay ? 'sun' : 'moon';
  if (code === 2) return isDay ? 'cloud-sun' : 'cloud-moon';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99) return 'thunder';
  return isDay ? 'sun' : 'moon';
}

// ── 温度色带（iOS 温标近似：-20 紫蓝 → 0 蓝 → 10 青绿 → 18 黄绿 → 24 黄 → 30 橙 → 38 红）──
const TEMP_STOPS: Array<[number, [number, number, number]]> = [
  [-20, [96, 78, 168]],
  [-10, [78, 122, 214]],
  [0, [90, 176, 226]],
  [10, [102, 204, 172]],
  [18, [176, 214, 104]],
  [24, [250, 210, 74]],
  [30, [250, 158, 62]],
  [38, [240, 90, 66]],
];

const h2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
const rgb = ([r, g, b]: [number, number, number]) => `#${h2(r)}${h2(g)}${h2(b)}`;

/** 温度 → 色带颜色（分区间线性插值） */
export function tempColor(t: number): string {
  const first = TEMP_STOPS[0];
  const last = TEMP_STOPS[TEMP_STOPS.length - 1];
  if (t <= first[0]) return rgb(first[1]);
  if (t >= last[0]) return rgb(last[1]);
  for (let i = 0; i < TEMP_STOPS.length - 1; i++) {
    const [t0, c0] = TEMP_STOPS[i];
    const [t1, c1] = TEMP_STOPS[i + 1];
    if (t >= t0 && t <= t1) {
      const k = (t - t0) / (t1 - t0 || 1);
      return rgb([
        c0[0] + (c1[0] - c0[0]) * k,
        c0[1] + (c1[1] - c0[1]) * k,
        c0[2] + (c1[2] - c0[2]) * k,
      ]);
    }
  }
  return rgb(last[1]);
}

/** 10 天区间条：该日 min~max 在十天总区间里的相对位置与长度（百分比；clamp + 最小可见宽保护） */
export function rangeBar(dayMin: number, dayMax: number, gMin: number, gMax: number): { left: number; width: number } {
  const span = Math.max(gMax - gMin, 1);
  const width = Math.min(Math.max(((dayMax - dayMin) / span) * 100, 6), 100);
  let left = Math.min(Math.max(((dayMin - gMin) / span) * 100, 0), 100);
  // 贴右边界时把条向左推，保住最小可见宽（不越出条区）
  if (left + width > 100) left = Math.max(100 - width, 0);
  return { left, width };
}

/** 小时标签：Now / 1PM / 12AM（12 小时制照截图） */
export function hourLabel(iso: string, isNow: boolean): string {
  if (isNow) return 'Now';
  const h = parseInt(iso.slice(11, 13), 10);
  if (!Number.isFinite(h)) return '';
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${ap}`;
}

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 10 天行标签：今天 = Today，其余英文缩写（用中午锚定避开时区跨日） */
export function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : WEEK[d.getDay()];
}

/** 取整温度「26°」 */
export function fmtTemp(t: number): string {
  return `${Math.round(t)}°`;
}

/** US AQI 分级（词 + 主色） */
export function aqiLevel(aqi: number): { text: string; color: string } {
  if (aqi <= 50) return { text: 'Good', color: '#4cd964' };
  if (aqi <= 100) return { text: 'Moderate', color: '#ffd60a' };
  if (aqi <= 150) return { text: 'Unhealthy for Sensitive Groups', color: '#ff9f0a' };
  if (aqi <= 200) return { text: 'Unhealthy', color: '#ff453a' };
  if (aqi <= 300) return { text: 'Very Unhealthy', color: '#bf5af2' };
  return { text: 'Hazardous', color: '#a2845e' };
}

/** AQI 在彩条上的位置（0-300 映射 0-100%） */
export function aqiPos(aqi: number): number {
  return Math.min(Math.max(aqi / 300, 0), 1) * 100;
}

/** 摘要句（照截图句式，模板拼） */
export function summaryText(code: number, gust: number): string {
  return `${wmoText(code)} conditions will continue for the rest of the day. Wind gusts are up to ${Math.round(gust)} km/h.`;
}

/** 城市当地时间「7:05 PM」（Open-Meteo 的 time 是当地时间的无时区字符串，直接切字符串，别过 Date） */
export function fmtCityTime(iso: string): string {
  const h = parseInt(iso.slice(11, 13), 10);
  const m = parseInt(iso.slice(14, 16), 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
  const ap = h < 12 ? 'AM' : 'PM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}`;
}

/** 列表卡缩略天空的星星场 [left%, top%, 直径px, 亮度]：同一种子每次长一样（城市坐标当种子） */
export function starField(seed: string, count = 12): Array<[number, number, number, number]> {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: Array<[number, number, number, number]> = [];
  for (let i = 0; i < count; i++) {
    const big = rnd() < 0.22;
    out.push([
      Math.round(3 + rnd() * 94),
      Math.round(6 + rnd() * 84),
      big ? 2 : 1.4,
      Number((big ? 0.85 + rnd() * 0.15 : 0.45 + rnd() * 0.35).toFixed(2)),
    ]);
  }
  return out;
}

/** 横滑切城市判定（松手时调用）：位移够远或甩得够快就翻页；dx>0（右滑）= 看上一座 */
export function swipeStep(dx: number, ms: number, width: number): -1 | 0 | 1 {
  const far = Math.abs(dx) >= Math.max(width * 0.18, 36);
  const flick = Math.abs(dx) >= Math.max(width * 0.07, 20) && ms < 280;
  if (!far && !flick) return 0;
  return dx > 0 ? -1 : 1;
}

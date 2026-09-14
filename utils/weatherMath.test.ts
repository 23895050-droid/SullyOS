import { describe, it, expect } from 'vitest';
import {
  wmoText, wmoIcon, tempColor, rangeBar, hourLabel, dayLabel,
  fmtTemp, aqiLevel, aqiPos, summaryText, fmtCityTime, starField, swipeStep,
} from './weatherMath';

describe('weatherMath · wmoText', () => {
  it('常见码映射照截图词表', () => {
    expect(wmoText(0)).toBe('Clear');
    expect(wmoText(2)).toBe('Partly Cloudy');
    expect(wmoText(3)).toBe('Mostly Cloudy');
    expect(wmoText(61)).toBe('Light Rain');
    expect(wmoText(65)).toBe('Heavy Rain');
    expect(wmoText(75)).toBe('Heavy Snow');
    expect(wmoText(95)).toBe('Thunderstorm');
  });

  it('未知码兜底 Clear', () => {
    expect(wmoText(999)).toBe('Clear');
  });
});

describe('weatherMath · wmoIcon', () => {
  it('晴天按昼夜给太阳/月亮', () => {
    expect(wmoIcon(0, true)).toBe('sun');
    expect(wmoIcon(0, false)).toBe('moon');
  });

  it('多云昼夜变体、阴天共用云', () => {
    expect(wmoIcon(2, true)).toBe('cloud-sun');
    expect(wmoIcon(2, false)).toBe('cloud-moon');
    expect(wmoIcon(3, true)).toBe('cloud');
    expect(wmoIcon(3, false)).toBe('cloud');
  });

  it('雨雪雷雾各自的图标', () => {
    expect(wmoIcon(61, true)).toBe('rain');
    expect(wmoIcon(80, true)).toBe('rain');
    expect(wmoIcon(71, false)).toBe('snow');
    expect(wmoIcon(95, true)).toBe('thunder');
    expect(wmoIcon(45, true)).toBe('fog');
    expect(wmoIcon(53, true)).toBe('drizzle');
  });
});

describe('weatherMath · tempColor', () => {
  it('两端 clamp 到端点色', () => {
    expect(tempColor(-30)).toBe('#604ea8');
    expect(tempColor(50)).toBe('#f05a42');
  });

  it('输出合法 hex，中间值落在两站之间', () => {
    expect(tempColor(0)).toMatch(/^#[0-9a-f]{6}$/);
    // 18→24 站之间：B 分量随温度下降（黄绿偏绿 → 黄偏红? 用 G 分量单调变化验证插值发生）
    const a = tempColor(18);
    const mid = tempColor(21);
    const b = tempColor(24);
    expect(mid).not.toBe(a);
    expect(mid).not.toBe(b);
    expect(a).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('weatherMath · rangeBar', () => {
  it('整天区间覆盖满宽', () => {
    const { left, width } = rangeBar(10, 30, 10, 30);
    expect(left).toBeCloseTo(0, 5);
    expect(width).toBeCloseTo(100, 5);
  });

  it('子区间按比例定位', () => {
    const { left, width } = rangeBar(20, 30, 10, 30);
    expect(left).toBeCloseTo(50, 5);
    expect(width).toBeCloseTo(50, 5);
  });

  it('温差过小时有最小可见宽', () => {
    const { width } = rangeBar(20, 20, 10, 30);
    expect(width).toBeGreaterThanOrEqual(6);
  });

  it('左侧贴边时宽度不越界', () => {
    const { left, width } = rangeBar(30, 30, 10, 30);
    expect(left + width).toBeLessThanOrEqual(100.001);
  });
});

describe('weatherMath · hourLabel', () => {
  it('Now / 12 小时制', () => {
    expect(hourLabel('2026-09-14T19:00', true)).toBe('Now');
    expect(hourLabel('2026-09-14T13:00', false)).toBe('1PM');
    expect(hourLabel('2026-09-14T00:00', false)).toBe('12AM');
    expect(hourLabel('2026-09-14T12:00', false)).toBe('12PM');
    expect(hourLabel('2026-09-14T23:00', false)).toBe('11PM');
  });

  it('非法输入返回空串', () => {
    expect(hourLabel('', false)).toBe('');
  });
});

describe('weatherMath · dayLabel', () => {
  it('今天 = Today，其余星期缩写', () => {
    expect(dayLabel('2026-09-14', '2026-09-14')).toBe('Today');
    // 2026-09-15 是周二
    expect(dayLabel('2026-09-15', '2026-09-14')).toBe('Tue');
  });

  it('非法日期返回空串', () => {
    expect(dayLabel('oops', '2026-09-14')).toBe('');
  });
});

describe('weatherMath · 其它', () => {
  it('fmtTemp 取整带度号', () => {
    expect(fmtTemp(25.7)).toBe('26°');
    expect(fmtTemp(-3.2)).toBe('-3°');
  });

  it('aqiLevel 分档', () => {
    expect(aqiLevel(25).text).toBe('Good');
    expect(aqiLevel(80).text).toBe('Moderate');
    expect(aqiLevel(120).text).toBe('Unhealthy for Sensitive Groups');
    expect(aqiLevel(180).text).toBe('Unhealthy');
    expect(aqiLevel(250).text).toBe('Very Unhealthy');
    expect(aqiLevel(400).text).toBe('Hazardous');
  });

  it('aqiPos 0-300 映射并 clamp', () => {
    expect(aqiPos(0)).toBe(0);
    expect(aqiPos(150)).toBeCloseTo(50, 5);
    expect(aqiPos(500)).toBe(100);
  });

  it('summaryText 拼接句式', () => {
    expect(summaryText(0, 6.4)).toBe('Clear conditions will continue for the rest of the day. Wind gusts are up to 6 km/h.');
  });
});

describe('weatherMath · 城市列表（2026-09-15）', () => {
  it('fmtCityTime 当地 12 小时制', () => {
    expect(fmtCityTime('2026-09-14T19:05')).toBe('7:05 PM');
    expect(fmtCityTime('2026-09-14T00:00')).toBe('12:00 AM');
    expect(fmtCityTime('2026-09-14T12:30')).toBe('12:30 PM');
    expect(fmtCityTime('2026-09-14T09:07')).toBe('9:07 AM');
    expect(fmtCityTime('bad')).toBe('');
  });

  it('starField 同种子稳定、异种子不同、坐标在卡内', () => {
    const a = starField('31.2304,121.4737');
    expect(a).toHaveLength(12);
    expect(starField('31.2304,121.4737')).toEqual(a);
    expect(starField('38.9140,121.6147')).not.toEqual(a);
    for (const [x, y, s, o] of a) {
      expect(x).toBeGreaterThanOrEqual(3);
      expect(x).toBeLessThanOrEqual(98);
      expect(y).toBeGreaterThanOrEqual(6);
      expect(y).toBeLessThanOrEqual(91);
      expect(s).toBeGreaterThan(0);
      expect(o).toBeGreaterThan(0.4);
      expect(o).toBeLessThanOrEqual(1);
    }
  });

  it('swipeStep 位移/甩动阈值与方向', () => {
    const W = 430;
    expect(swipeStep(10, 600, W)).toBe(0);            // 太短太慢 → 不动
    expect(swipeStep(100, 500, W)).toBe(-1);          // 右滑够远 → 上一座
    expect(swipeStep(-100, 500, W)).toBe(1);          // 左滑够远 → 下一座
    expect(swipeStep(-40, 140, W)).toBe(1);           // 快速甩动（左）→ 下一座
    expect(swipeStep(40, 140, W)).toBe(-1);
    expect(swipeStep(40, 600, W)).toBe(0);            // 小位移慢速 → 回弹
  });
});

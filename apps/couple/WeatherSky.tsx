// 天气天空组件（2026-09-15 城市列表批从 CoupleWeather 抽出）——天气页整屏背景与列表页城市卡缩略共用：
// 白天 = 渐变天幕 + 合成云；夜晚 = 深蓝渐变 + 星星（列表卡传种子生成的星场，每座城市长得不一样）。
import React from 'react';

export const DAY_SKY = 'linear-gradient(180deg, #a7c2da 0%, #8db0d3 30%, #6f9cc9 62%, #5b8ec2 100%)';
export const NIGHT_SKY = 'linear-gradient(180deg, #121a34 0%, #1a2340 40%, #222b4b 75%, #293256 100%)';
export const DAY_CLOUDS = [
  'radial-gradient(78% 24% at 30% -1%, rgba(255,255,255,0.95), rgba(255,255,255,0) 100%)',
  'radial-gradient(88% 26% at 62% 2%, rgba(255,255,255,0.85), rgba(255,255,255,0) 100%)',
  'radial-gradient(56% 18% at 88% 10%, rgba(255,255,255,0.6), rgba(255,255,255,0) 100%)',
  'radial-gradient(52% 20% at 8% 13%, rgba(255,255,255,0.62), rgba(255,255,255,0) 100%)',
  'radial-gradient(46% 15% at 78% 20%, rgba(255,255,255,0.34), rgba(255,255,255,0) 100%)',
  'radial-gradient(40% 14% at 20% 24%, rgba(255,255,255,0.3), rgba(255,255,255,0) 100%)',
].join(', ');

/** 天气页整屏夜空星星 [left%, top%, 直径px, 亮度] */
export const STARS: Array<[number, number, number, number]> = [
  [8, 4, 2.2, 0.95], [15, 9, 1.5, 0.7], [22, 3, 1.8, 0.85], [31, 7, 1.4, 0.6], [38, 12, 2.2, 0.95], [45, 4, 1.6, 0.75],
  [52, 9, 1.8, 0.85], [59, 2, 1.4, 0.6], [66, 11, 2.2, 0.95], [73, 6, 1.6, 0.75], [81, 9, 1.4, 0.6], [88, 3, 2, 0.9],
  [93, 13, 1.5, 0.7], [11, 17, 1.4, 0.6], [26, 21, 1.7, 0.8], [35, 16, 1.4, 0.6], [48, 19, 1.6, 0.75], [57, 24, 1.4, 0.6],
  [70, 18, 1.8, 0.85], [79, 23, 1.4, 0.6], [86, 17, 1.6, 0.75], [18, 29, 1.5, 0.65], [42, 31, 1.7, 0.8], [64, 33, 1.4, 0.6],
  [90, 28, 1.6, 0.75], [6, 24, 1.5, 0.65], [29, 36, 1.4, 0.6], [55, 39, 1.6, 0.7],
  [3, 11, 1.3, 0.55], [35, 26, 1.3, 0.55], [75, 13, 1.3, 0.55], [97, 21, 1.3, 0.55],
  [23, 14, 1.3, 0.55], [61, 16, 1.3, 0.55], [44, 24, 1.3, 0.55], [13, 33, 1.3, 0.55],
];

/** 天空：铺满所在容器（父级要 position:relative + overflow:hidden） */
const Sky: React.FC<{ isDay: boolean; stars?: Array<[number, number, number, number]> }> = React.memo(({ isDay, stars }) => (
  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
    <div style={{ position: 'absolute', inset: 0, background: isDay ? DAY_SKY : NIGHT_SKY }} />
    {isDay ? (
      <div style={{ position: 'absolute', inset: 0, background: DAY_CLOUDS }} />
    ) : (
      (stars ?? STARS).map(([x, y, s, o], i) => (
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

export default Sky;

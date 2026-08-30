// 情侣空间 · 首屏以下（2026-08-20 三改：天气/阅读文字下移、组合卡+记账卡按 doc《2修改2》重建、事件卡文字与图片中心对齐）——桌面文档《情侣空间首屏以下的ui.md》
// 二屏（1290×2220）：四行——天气 / 阅读 / 饮食+经期 / 记账+日记（日记两条同属一行），行距 80，卡高对标一屏（400-560）
// 三屏（1290×900）：事件记录两行（图文镜像），行距 80
// 画布与首屏同源模式（首屏验证过）：width 100% + maxWidth calc(100dvh*(1290/2796)) + aspectRatio + containerType
// 风格：白卡 r36 + 轻投影 + 主题色变量；天气卡与阅读右侧为深色信息卡（刻意对比）
// 路由：c6 天气 / c71 阅读详情 / c7 本地书架 / c72 书摘 / c2 饮食 / c1-period 经期(日历页月经模式) / c3 记账(复用 Sully Bank) / c4 日记 / c9 和 Ta
// mock 数据：天气(上海) / 书《小王子》 / 饮食 860+1240 kcal / 黄体期 / 预算 ¥1000 / 事件记录，后续接真数据
import React, { useEffect, useState } from 'react';
import { MapPin, Sun, Cloud, CloudSun, Moon, MoonStars, Books, BookmarkSimple, Drop, CalendarCheck, Hourglass } from '@phosphor-icons/react';
import { loadCoupleBeauty, buildTheme } from './CoupleBeauty';
import { usePeriodStore } from './periodStore';
import { getLocalDateKey } from '../../utils/localDate';
import { buildCycles, phaseAt, predictNext } from '../../utils/periodMath';
import { DB } from '../../utils/db';
import { useDietStore } from './dietStore';
import { latestDiary, useDiaryStore } from './diaryStore';
import { latestMemory, latestOpenPromise, useTogetherStore } from './togetherStore';
import { fmtDiaryMeta } from '../../utils/diaryMath';
import { dayTotals, remainingKcal, type MealKey } from '../../utils/dietMath';
import { useBlobRefUrl } from '../../utils/blobRef';

const DESIGN_W = 1290;
const wPct = (n: number) => `${((n / DESIGN_W) * 100).toFixed(3)}%`;
const cqw = (designPx: number, minPx = 8) => `max(${minPx}px, ${((designPx / DESIGN_W) * 100).toFixed(3)}cqw)`;
// 每个画布自己的宽度卡帽：与首屏同宽（桌面 letterbox，手机满宽）
const CAP: React.CSSProperties = { width: '100%', maxWidth: 'calc(100dvh * (1290 / 2796))', margin: '0 auto' };

type Pct = (n: number) => string;

const CARD_SHADOW = 'var(--cs-shadow-soft, 0 10px 30px rgba(233,160,190,0.16), 0 2px 8px rgba(60,30,50,0.05))';
// 深色信息卡（天气 / 阅读右侧）：灰蓝渐变，低饱和
const DARK_WEATHER = 'linear-gradient(160deg, #46536f 0%, #323c52 60%, #293247 100%)';
const DARK_READING = 'linear-gradient(160deg, #4a4f66 0%, #34394d 60%, #2a2e40 100%)';

// ── 定位文字（hp = 当前画布的高度百分比函数） ──
const Text: React.FC<{
  hp: Pct; x: number; y: number; w: number; h: number; size: number; min?: number; color: string;
  weight?: number; align?: 'left' | 'center'; spacing?: string; lineHeight?: number;
  style?: React.CSSProperties; z?: number; children: React.ReactNode;
}> = ({ hp, x, y, w, h, size, min, color, weight, align = 'left', spacing, lineHeight, style, z, children }) => (
  <div
    className="absolute pointer-events-none"
    style={{
      left: wPct(x), top: hp(y), width: wPct(w), height: hp(h),
      display: 'flex', alignItems: 'center', justifyContent: align === 'center' ? 'center' : 'flex-start',
      color, fontWeight: weight ?? 400, letterSpacing: spacing,
      fontSize: cqw(size, min ?? 8), lineHeight: lineHeight ?? 1.2, zIndex: z ?? 11,
      ...style,
    }}
  >
    {children}
  </div>
);

// ── 整卡热区 ──
const Hotspot: React.FC<{ hp: Pct; x: number; y: number; w: number; h: number; z: number; onTap: () => void }> = ({ hp, x, y, w, h, z, onTap }) => (
  <button
    type="button"
    aria-label="进入"
    onClick={onTap}
    className="absolute bg-transparent border-0 outline-none cursor-pointer"
    style={{ left: wPct(x), top: hp(y), width: wPct(w), height: hp(h), zIndex: z }}
  />
);

// ── 进度条（track 默认主题浅色，fill 默认主题主色；营养条传入独立颜色区分三大营养素） ──
// z 必须高于卡片底（z10），否则会被白卡盖住（2026-08-20 三改后实测修复：宏量条全部隐身就是它）
const Bar: React.FC<{ hp: Pct; x: number; y: number; w: number; pct: number; h?: number; color?: string; track?: string }> = ({ hp, x, y, w, pct, h = 10, color, track }) => (
  <div className="absolute pointer-events-none" style={{ left: wPct(x), top: hp(y), width: wPct(w), height: cqw(h, 5), background: track ?? 'var(--cs-soft, #fce8f1)', borderRadius: 999, zIndex: 11 }}>
    <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color ?? 'var(--cs-accent, #f0a8c0)', borderRadius: 999 }} />
  </div>
);

// ══════════════════════ 二屏（1290×2220）：四行 ══════════════════════

// ── 天气卡（深色） ──
const HOUR_ITEMS = (() => {
  const now = new Date();
  const list: { label: string; Icon: React.ElementType; temp: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getTime() + i * 3600000);
    const h = d.getHours();
    const Icon = i === 5 ? Cloud : h >= 6 && h < 18 ? Sun : h >= 18 && h < 20 ? CloudSun : Moon;
    const temp = 26 + Math.round(Math.sin((i + 1) / 1.5) * 2);
    list.push({ label: i === 0 ? 'Now' : `${h}时`, Icon, temp });
  }
  return list;
})();

const WeatherCard: React.FC<{ hp: Pct; onOpen: () => void }> = ({ hp, onOpen }) => (
  <>
    <div className="absolute" style={{ left: wPct(100), top: hp(20), width: wPct(1090), height: hp(400), zIndex: 10, background: DARK_WEATHER, borderRadius: cqw(36, 12), boxShadow: CARD_SHADOW }} />
    <MapPin weight="fill" className="absolute pointer-events-none" style={{ left: wPct(136), top: hp(52), width: cqw(20, 12), height: cqw(20, 12), color: '#ffffff', zIndex: 11 }} />
    {/* 文字整体下移（定位图标与逐小时条不动） */}
    <Text hp={hp} x={168} y={54} w={200} h={36} size={20} min={12} color="#ffffff" weight={600}>上海</Text>
    <Text hp={hp} x={136} y={122} w={280} h={120} size={64} min={24} color="#ffffff" weight={700}>26°</Text>
    <Text hp={hp} x={136} y={262} w={300} h={28} size={16} min={10} color="rgba(255,255,255,0.82)">Mostly Cloudy</Text>
    <Text hp={hp} x={136} y={302} w={300} h={26} size={13} min={9} color="rgba(255,255,255,0.55)">H:29°  L:19°</Text>
    {/* 逐小时预报条 */}
    <div className="absolute pointer-events-none flex items-stretch" style={{ left: wPct(560), top: hp(80), width: wPct(570), height: hp(240), zIndex: 11 }}>
      {HOUR_ITEMS.map(({ label, Icon, temp }) => (
        <div key={label} className="flex-1 flex flex-col items-center justify-center" style={{ gap: cqw(12, 4) }}>
          <span style={{ fontSize: cqw(12, 8), color: 'rgba(255,255,255,0.6)' }}>{label}</span>
          <Icon style={{ width: cqw(24, 14), height: cqw(24, 14), color: '#ffffff' }} weight="regular" />
          <span style={{ fontSize: cqw(14, 9), color: '#ffffff', fontWeight: 600 }}>{temp}°</span>
        </div>
      ))}
    </div>
    <Hotspot hp={hp} x={100} y={20} w={1090} h={400} z={12} onTap={onOpen} />
  </>
);

// ── 阅读区：左书卡 + 右侧深色双入口 ──
const ReadingRow: React.FC<{ hp: Pct; onOpen: (r: string) => void }> = ({ hp, onOpen }) => (
  <>
    {/* 左：正在读的书 */}
    <div className="absolute" style={{ left: wPct(100), top: hp(500), width: wPct(560), height: hp(440), zIndex: 10, background: 'var(--cp-card, #fff)', borderRadius: cqw(36, 12), boxShadow: CARD_SHADOW }} />
    {/* 左栏：封面（固定尺寸，垂直居中） */}
    <div className="absolute overflow-hidden flex items-center justify-center pointer-events-none" style={{ left: wPct(136), top: hp(578), width: wPct(150), height: hp(220), zIndex: 11, background: 'linear-gradient(165deg, #b9c7e8 0%, #7e93c9 100%)', borderRadius: cqw(14, 7) }}>
      <MoonStars weight="fill" style={{ width: '58%', height: '58%', color: 'rgba(255,255,255,0.9)' }} />
    </div>
    {/* 右栏：书名 / 作者 / 简介（与封面垂直居中对齐，字号递减；简介限制范围，手机端不溢出到进度行） */}
    <Text hp={hp} x={320} y={600} w={304} h={48} size={22} min={12} color="var(--cp-text, #3a2a33)" weight={700}>《小王子》</Text>
    <Text hp={hp} x={320} y={660} w={304} h={28} size={13} min={9} color="var(--cp-muted, #9a7a8a)">[法] 圣-埃克苏佩里</Text>
    <Text hp={hp} x={320} y={698} w={304} h={96} size={12} min={8} color="var(--cp-muted, #8a6a7a)" lineHeight={1.6} style={{ alignItems: 'flex-start', overflow: 'hidden' }}>离开 B-612 星球去旅行，遇见狐狸的故事。</Text>
    {/* 底部全宽进度行：阅读进度 | 进度条 | 百分比 */}
    <Text hp={hp} x={136} y={848} w={96} h={24} size={12} min={8} color="var(--cp-muted, #9a7a8a)">阅读进度</Text>
    <Bar hp={hp} x={244} y={856} w={256} pct={62} h={8} />
    <Text hp={hp} x={520} y={848} w={104} h={24} size={12} min={8} color="var(--cp-muted, #9a7a8a)" style={{ justifyContent: 'flex-end' }}>62%</Text>
    <Hotspot hp={hp} x={100} y={500} w={560} h={440} z={12} onTap={() => onOpen('c71')} />
    {/* 右：深色双入口卡（一张卡上下分区，下区略深形成堆叠感） */}
    <div className="absolute overflow-hidden" style={{ left: wPct(690), top: hp(500), width: wPct(500), height: hp(440), zIndex: 10, background: DARK_READING, borderRadius: cqw(36, 12), boxShadow: CARD_SHADOW }} />
    {/* 图标 min 地板 30→16：手机端 30px 地板会让图标膨胀近 2 倍、压到下方文字 */}
    <div className="absolute rounded-full flex items-center justify-center pointer-events-none" style={{ left: wPct(734), top: hp(536), width: cqw(56, 16), aspectRatio: '1 / 1', zIndex: 11, background: 'rgba(255,255,255,0.12)' }}>
      <Books style={{ width: cqw(24, 9), height: cqw(24, 9), color: '#ffffff' }} weight="regular" />
    </div>
    <Text hp={hp} x={736} y={614} w={360} h={36} size={20} min={12} color="#ffffff" weight={700}>Reading</Text>
    <Text hp={hp} x={736} y={660} w={380} h={26} size={12} min={9} color="rgba(255,255,255,0.6)">本地书架 · 正在读的书</Text>
    <div className="absolute pointer-events-none" style={{ left: wPct(742), top: hp(720), width: wPct(396), height: 1, zIndex: 11, background: 'rgba(255,255,255,0.08)' }} />
    {/* 下区加深一层 → 堆叠感 */}
    <div className="absolute pointer-events-none" style={{ left: wPct(690), top: hp(720), width: wPct(500), height: hp(220), zIndex: 10, background: 'rgba(0,0,0,0.10)' }} />
    <div className="absolute rounded-full flex items-center justify-center pointer-events-none" style={{ left: wPct(734), top: hp(756), width: cqw(56, 16), aspectRatio: '1 / 1', zIndex: 11, background: 'rgba(255,255,255,0.12)' }}>
      <BookmarkSimple style={{ width: cqw(24, 9), height: cqw(24, 9), color: '#ffffff' }} weight="regular" />
    </div>
    <Text hp={hp} x={736} y={832} w={400} h={36} size={20} min={12} color="#ffffff" weight={700}>Finish Reading</Text>
    <Text hp={hp} x={736} y={878} w={380} h={26} size={12} min={9} color="rgba(255,255,255,0.6)">书摘记录 · 支持导入数据</Text>
    <Hotspot hp={hp} x={690} y={500} w={500} h={220} z={13} onTap={() => onOpen('c7')} />
    <Hotspot hp={hp} x={690} y={720} w={500} h={220} z={13} onTap={() => onOpen('c72')} />
  </>
);

// ── 饮食 + 经期组合卡（一张卡左右 2:1，细分隔线不割裂） ──
// 2026-08-23 接真数据：摄入/还可以吃/三大宏量/四餐小计全部从 diet store 当天数据算，替换原 mock
const MEAL_FOOTER: { label: string; meal: MealKey; color: string }[] = [
  { label: '早', meal: 'breakfast', color: '#f0a8c0' },
  { label: '午', meal: 'lunch', color: '#f5c98a' },
  { label: '晚', meal: 'dinner', color: '#a0c4e8' },
  { label: '加', meal: 'snack', color: '#d8c8cf' },
];

// ── 经期区真数据（2026-08-22）：阶段/天数/预计日期/温馨提示全部按当天计算，替换原 mock ──
const PERIOD_PHASE_SHORT: Record<string, string> = {
  period: '经期', 'predicted-period': '预计经期', follicular: '卵泡期', ovulation: '排卵期', luteal: '黄体期', unknown: '还没记录',
};
const PERIOD_TIPS: Record<string, string> = {
  period: '这几天别喝冰的哦', 'predicted-period': '快来了，检查姨妈巾', follicular: '状态回血，适合晒太阳',
  ovulation: '记得喝水，奖励自己', luteal: '黄体期慢慢熬，抱抱你', unknown: '点这里记下第一次经期',
};

const DietPeriodCard: React.FC<{ hp: Pct; onOpen: (r: string) => void }> = ({ hp, onOpen }) => {
  // 真数据：从生理期 store 读当天阶段；饮食区从 diet store 读当天摄入
  const store = usePeriodStore();
  const dietStore = useDietStore();
  const today = getLocalDateKey();
  const dietItems = dietStore.records.filter((r) => r.date === today).flatMap((r) => r.items.map((i) => ({ ...i, meal: r.meal })));
  const totals = dayTotals(dietItems);
  const budget = dietStore.targets.calorieBudget;
  const remaining = remainingKcal(totals, budget);
  const gaugePct = budget > 0 ? Math.min(100, Math.round((remaining / budget) * 100)) : 84;
  const macroRows = [
    { label: '蛋白', val: Math.round(totals.protein), goal: dietStore.targets.proteinGoal, labelColor: '#7d97cf', barColor: '#a9c2e8' },
    { label: '碳水', val: Math.round(totals.carbs), goal: dietStore.targets.carbGoal, labelColor: '#a088c8', barColor: '#cbb6ec' },
    { label: '脂肪', val: Math.round(totals.fat), goal: dietStore.targets.fatGoal, labelColor: '#d07090', barColor: '#f0a8c0' },
  ];
  const mealKcal: Record<MealKey, number> = { breakfast: 0, lunch: 0, dinner: 0, snack: 0, exercise: 0 };
  for (const i of dietItems) mealKcal[i.meal] += i.kcal;
  const bleeding = [...new Set(store.events.filter((e) => e.type === 'period').map((e) => e.date))];
  const prediction = predictNext(bleeding);
  const info = phaseAt(today, bleeding, prediction);
  const currentCycle = info.phase === 'period' ? buildCycles(bleeding).find((c) => c.start <= today && c.end >= today) : null;
  const phaseLabel = PERIOD_PHASE_SHORT[info.phase] ?? '—';
  const subLabel = info.phase === 'period' ? '本次经期' : info.phase === 'predicted-period' ? '预计今天来' : info.phase === 'unknown' ? '记录后开启预测' : '距下次经期';
  const num = info.phase === 'unknown' ? '—' : info.phase === 'period' || info.phase === 'predicted-period' ? info.day : (info.daysToNext ?? '—');
  const dateLine = currentCycle
    ? `这次从 ${currentCycle.start.slice(5).replace('-', '月')}日 开始`
    : info.phase === 'predicted-period' ? '来了记得点日历标红'
      : info.phase === 'unknown' ? '记 2 次完整经期就能预测'
        : prediction.nextStart ? `预计 ${prediction.nextStart.slice(5).replace('-', '月')}日` : '';
  const tip = PERIOD_TIPS[info.phase] ?? '';

  return (
  <>
    <div className="absolute" style={{ left: wPct(100), top: hp(1020), width: wPct(1090), height: hp(560), zIndex: 10, background: 'var(--cp-card, #fff)', borderRadius: cqw(36, 12), boxShadow: CARD_SHADOW }} />
    {/* 左 2/3：今日饮食摘要（doc《2修改2》：Header 横排+分割线 / Body 左右两列虚线分隔 / Footer 四餐） */}
    {/* Header：8/20 · 今日小记 | 摄入 320 kcal */}
    <div className="absolute flex items-center pointer-events-none" style={{ left: wPct(136), top: hp(1084), width: wPct(320), height: hp(44), zIndex: 11 }}>
      <span style={{ fontSize: cqw(13, 9), color: 'var(--cp-faint, #b0909c)' }}>{today.slice(5).replace('-', '/')}</span>
      <span style={{ fontSize: cqw(13, 9), color: 'var(--cp-faint, #cbb5c0)', margin: '0 10px' }}>·</span>
      <span style={{ fontSize: cqw(18, 11), fontWeight: 700, color: 'var(--cp-text, #3a2a33)' }}>今日小记</span>
    </div>
    <div className="absolute flex items-end justify-end pointer-events-none" style={{ left: wPct(556), top: hp(1084), width: wPct(254), height: hp(44), zIndex: 11 }}>
      <span style={{ fontSize: cqw(12, 8), color: 'var(--cp-muted, #9a7a8a)', paddingBottom: cqw(4, 2) }}>摄入</span>
      {/* 只抬数字：320 加 paddingBottom 让它相对 摄入/kcal 标签上浮，组位置回到「今日小记」同高 */}
      <span style={{ fontSize: cqw(28, 12), fontWeight: 700, color: 'var(--cp-text, #3a2a33)', lineHeight: 1, margin: '0 6px', paddingBottom: cqw(10, 5) }}>{Math.round(totals.kcal)}</span>
      <span style={{ fontSize: cqw(11, 8), color: 'var(--cp-muted, #9a7a8a)', paddingBottom: cqw(3, 2) }}>kcal</span>
    </div>
    {/* Header 底部浅色分割线 */}
    <div className="absolute pointer-events-none" style={{ left: wPct(136), top: hp(1140), width: wPct(674), height: 1, zIndex: 11, background: 'var(--cp-border, #f5e9ee)' }} />
    {/* 左列（约40%）：还可以吃（绿色系）+ 刻度尺 */}
    <div className="absolute rounded-full pointer-events-none" style={{ left: wPct(162), top: hp(1176), width: cqw(12, 7), aspectRatio: '1 / 1', zIndex: 11, background: '#6cae7e' }} />
    <Text hp={hp} x={190} y={1170} w={170} h={26} size={13} min={9} color="#5f9e72" weight={600}>还可以吃</Text>
    <div className="absolute flex items-end pointer-events-none" style={{ left: wPct(136), top: hp(1196), width: wPct(270), height: hp(64), zIndex: 11 }}>
      <span style={{ fontSize: cqw(44, 16), fontWeight: 700, color: '#5f9e72', lineHeight: 1 }}>{remaining}</span>
      <span style={{ fontSize: cqw(13, 8), color: 'var(--cp-muted, #9a7a8a)', marginLeft: cqw(6, 3), paddingBottom: cqw(5, 2) }}>kcal</span>
    </div>
    {/* 刻度尺进度条：轨道 + 竖向刻度线 + 绿色游标 */}
    <div className="absolute pointer-events-none" style={{ left: wPct(136), top: hp(1282), width: wPct(270), height: cqw(22, 10), zIndex: 11 }}>
      <div className="absolute" style={{ inset: 0, background: 'var(--cp-border, #efe4ea)', borderRadius: 999 }} />
      {[0, 20, 40, 60, 80, 100].map((t) => (
        <div key={t} className="absolute" style={{ left: `${t}%`, top: 0, width: 1, height: '100%', background: 'rgba(0,0,0,0.07)' }} />
      ))}
      <div className="absolute" style={{ left: `calc(${gaugePct}% - 8px)`, top: -4, width: 16, height: 'calc(100% + 8px)', background: '#6cae7e', borderRadius: 5, boxShadow: '0 2px 6px rgba(108,174,126,0.45)' }} />
    </div>
    {/* 左右两列垂直虚线分割线 */}
    <div className="absolute pointer-events-none" style={{ left: wPct(418), top: hp(1154), width: 0, height: hp(170), zIndex: 11, borderRight: '1px dashed var(--cs-border, #f2d3e0)' }} />
    {/* 右列（约60%）：三大营养素（彩色标签 + 粗体数值 + 灰轨彩条 + 灰色百分比） */}
    {macroRows.map((m, i) => {
      const pct = m.goal > 0 ? Math.min(100, Math.round((m.val / m.goal) * 100)) : 0;
      return (
        <React.Fragment key={m.label}>
          <Text hp={hp} x={434} y={1160 + i * 66} w={64} h={28} size={13} min={9} color={m.labelColor} weight={600}>{m.label}</Text>
          <Text hp={hp} x={502} y={1160 + i * 66} w={64} h={28} size={14} min={9} color="var(--cp-text, #3a2a33)" weight={700}>{m.val}g</Text>
          <Bar hp={hp} x={576} y={1168 + i * 66} w={150} pct={pct} h={12} color={m.barColor} track="var(--cp-border, #ede3e8)" />
          <Text hp={hp} x={738} y={1160 + i * 66} w={72} h={28} size={12} min={8} color="var(--cp-muted, #9a7a8a)" align="center">{pct}%</Text>
        </React.Fragment>
      );
    })}
    {/* Footer：四餐（彩色圆点 + 名称 + 小计，space-around） */}
    <div className="absolute flex pointer-events-none" style={{ left: wPct(136), top: hp(1408), width: wPct(674), height: hp(60), zIndex: 11, justifyContent: 'space-around', alignItems: 'center' }}>
      {MEAL_FOOTER.map((m) => {
        const kcal = Math.round(mealKcal[m.meal]);
        const empty = kcal === 0;
        return (
          <div key={m.label} className="flex items-center" style={{ gap: cqw(8, 4) }}>
            <div className="rounded-full" style={{ width: cqw(12, 7), aspectRatio: '1 / 1', background: empty ? 'transparent' : m.color, border: empty ? '2px solid #d8c8cf' : 'none', boxSizing: 'border-box' }} />
            <span style={{ fontSize: cqw(12, 8), color: 'var(--cp-muted, #9a7a8a)' }}>{m.label}</span>
            <span style={{ fontSize: cqw(15, 9), fontWeight: 600, color: 'var(--cp-text, #3a2a33)' }}>{empty ? '—' : kcal}</span>
          </div>
        );
      })}
    </div>
    {/* 细分隔线 + 右 1/3：经期摘要（整体下调 + 底部温馨提示框） */}
    <div className="absolute pointer-events-none" style={{ left: wPct(846), top: hp(1130), width: 1, height: hp(320), zIndex: 11, background: 'var(--cs-border, #f2d3e0)', opacity: 0.7 }} />
    <div className="absolute rounded-full flex items-center justify-center pointer-events-none" style={{ left: wPct(907), top: hp(1110), width: cqw(60, 32), aspectRatio: '1 / 1', zIndex: 11, background: 'var(--cs-soft, #fce8f1)' }}>
      <Drop style={{ width: cqw(28, 16), height: cqw(28, 16), color: 'var(--cs-deep, #d98ba9)' }} weight="regular" />
    </div>
    <Text hp={hp} x={880} y={1200} w={260} h={46} size={24} min={12} color="var(--cp-text, #3a2a33)" weight={700} align="center">{phaseLabel}</Text>
    <Text hp={hp} x={880} y={1264} w={260} h={22} size={12} min={8} color="var(--cp-muted, #9a7a8a)" align="center">{subLabel}</Text>
    <div className="absolute flex items-end justify-center pointer-events-none" style={{ left: wPct(880), top: hp(1288), width: wPct(260), height: hp(58), zIndex: 11 }}>
      <span style={{ fontSize: cqw(40, 16), fontWeight: 700, color: 'var(--cs-deep, #c25a82)', lineHeight: 1 }}>{num}</span>
      <span style={{ fontSize: cqw(13, 8), color: 'var(--cp-muted, #9a7a8a)', marginLeft: cqw(6, 3), paddingBottom: cqw(4, 2) }}>天</span>
    </div>
    <Text hp={hp} x={880} y={1356} w={260} h={26} size={12} min={8} color="var(--cp-faint, #b0909c)" align="center">{dateLine}</Text>
    {/* 底部留言 / 温馨提示（按当天阶段） */}
    <div className="absolute flex items-center justify-center pointer-events-none" style={{ left: wPct(876), top: hp(1424), width: wPct(260), height: hp(64), zIndex: 11, background: 'var(--cs-soft, #fce8f1)', borderRadius: cqw(16, 8) }}>
      <span style={{ fontSize: cqw(11, 8), color: 'var(--cp-muted, #8a6a7a)', lineHeight: 1.6, textAlign: 'center', padding: '0 12px' }}>温馨提示 · {tip}</span>
    </div>
    <Hotspot hp={hp} x={100} y={1020} w={746} h={560} z={12} onTap={() => onOpen('c2')} />
    <Hotspot hp={hp} x={846} y={1020} w={344} h={560} z={12} onTap={() => onOpen('c1-period')} />
  </>
  );
};

// ── 记账卡 + 日记 A/B（同属一行：左记账，右日记竖排两条） ──
// 记账卡（2026-08-23 接真数据）：今天 | 百分比 → 右对齐 剩余 ¥ → 深色填充+白色分割块进度条 → 预算/支出明细
// 数据源：Sully 银行（DB.getAllTransactions 当天合计 + BankFullState.dailyBudget），监听 couple-bank-changed 记账后实时刷新
const MoneyCard: React.FC<{ hp: Pct; onOpen: () => void }> = ({ hp, onOpen }) => {
  const [data, setData] = useState<{ budget: number; spent: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [txs, state] = await Promise.all([DB.getAllTransactions(), DB.getBankState()]);
        if (!alive) return;
        const today = getLocalDateKey();
        const budget = state?.config?.dailyBudget ?? 100;
        const spent = txs.filter((t) => t.dateStr === today).reduce((s, t) => s + (t.amount || 0), 0);
        setData({ budget, spent });
      } catch {
        if (alive) setData({ budget: 100, spent: 0 });
      }
    };
    load();
    window.addEventListener('couple-bank-changed', load);
    return () => {
      alive = false;
      window.removeEventListener('couple-bank-changed', load);
    };
  }, []);
  const budget = data?.budget ?? 0;
  const spent = data?.spent ?? 0;
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const remain = Math.max(0, budget - spent);
  return (
    <>
      <div className="absolute" style={{ left: wPct(100), top: hp(1660), width: wPct(520), height: hp(460), zIndex: 10, background: 'var(--cp-card, #fff)', borderRadius: cqw(36, 12), boxShadow: CARD_SHADOW }} />
      {/* Header：今天 | 百分比（space-between） */}
      <Text hp={hp} x={136} y={1718} w={140} h={40} size={20} min={11} color="var(--cp-text, #3a2a33)" weight={700}>今天</Text>
      <Text hp={hp} x={470} y={1722} w={114} h={36} size={14} min={9} color="var(--cp-muted, #9a7a8a)" style={{ justifyContent: 'flex-end' }}>{data ? `${pct}%` : '—'}</Text>
      {/* 金额区（右对齐）：剩余 / ¥ */}
      <Text hp={hp} x={376} y={1784} w={208} h={22} size={12} min={8} color="var(--cp-muted, #9a7a8a)" style={{ justifyContent: 'flex-end' }}>剩余</Text>
      <div className="absolute flex items-end justify-end pointer-events-none" style={{ left: wPct(226), top: hp(1810), width: wPct(358), height: hp(64), zIndex: 11 }}>
        <span style={{ fontSize: cqw(44, 16), fontWeight: 700, color: 'var(--cp-text, #3a2a33)', lineHeight: 1 }}>{data ? `¥${remain.toFixed(2)}` : '—'}</span>
      </div>
      {/* 进度条：深色填充 + 浅灰轨道 + 白色分割块（Thumb） */}
      <div className="absolute pointer-events-none" style={{ left: wPct(136), top: hp(1908), width: wPct(448), height: cqw(16, 7), zIndex: 11 }}>
        <div className="absolute" style={{ inset: 0, background: 'var(--cp-border, #efe4ea)', borderRadius: 999 }} />
        <div className="absolute" style={{ left: 0, top: 0, width: `${pct}%`, height: '100%', background: 'var(--cp-text, #3a2a33)', borderRadius: pct > 0 ? '999px 0 0 999px' : 999, transition: 'width 0.3s' }} />
        <div className="absolute" style={{ left: `calc(${pct}% - 5px)`, top: -3, width: 10, height: 'calc(100% + 6px)', background: '#ffffff', borderRadius: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
      </div>
      {/* 底部明细（距进度条大 margin-top，左对齐） */}
      <Text hp={hp} x={136} y={1962} w={300} h={26} size={13} min={9} color="var(--cp-muted, #9a7a8a)">预算 ¥{data ? budget.toFixed(2) : '—'}</Text>
      <Text hp={hp} x={136} y={1996} w={300} h={26} size={13} min={9} color="var(--cp-muted, #9a7a8a)">支出 ¥{data ? spent.toFixed(2) : '—'}</Text>
      <Hotspot hp={hp} x={100} y={1660} w={520} h={460} z={12} onTap={onOpen} />
    </>
  );
};

const DiaryCard: React.FC<{ hp: Pct; i: number; title: string; meta: string; text: string; onOpen: () => void }> = ({ hp, i, title, meta, text, onOpen }) => {
  const mirror = i === 1; // A = Nox（图右），B = Angel（图左）
  const y = 1660 + i * 250;
  const imgX = mirror ? 684 : 1030;
  const textX = mirror ? 826 : 684;
  return (
    <>
      <div className="absolute" style={{ left: wPct(650), top: hp(y), width: wPct(540), height: hp(210), zIndex: 10, background: 'var(--cp-card, #fff)', borderRadius: cqw(28, 12), boxShadow: CARD_SHADOW }} />
      <div className="absolute overflow-hidden pointer-events-none" style={{ left: wPct(imgX), top: hp(y + 45), width: wPct(120), height: hp(120), zIndex: 11, borderRadius: cqw(16, 8) }}>
        <img src="/Couple/留白图.jpg" alt="" draggable={false} decoding="async" className="w-full h-full object-cover select-none" />
      </div>
      <Text hp={hp} x={textX} y={y + 34} w={320} h={18} size={9} min={8} color="var(--cp-faint, #b0909c)">{meta}</Text>
      <Text hp={hp} x={textX} y={y + 60} w={320} h={30} size={16} min={10} color="var(--cp-text, #3a2a33)" weight={700}>{title}</Text>
      {/* h=88 放得下两行（手机端 2 行 ≈ 26px ≈ 设计稿 86）：之前 h=62 只装得下 1.5 行，第二行被拦腰截断 */}
      <Text hp={hp} x={textX} y={y + 96} w={mirror ? 320 : 300} h={88} size={12} min={8} color="var(--cp-muted, #8a6a7a)" lineHeight={1.6} style={{ alignItems: 'flex-start', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{text}</Text>
      <Hotspot hp={hp} x={650} y={y} w={540} h={210} z={12} onTap={onOpen} />
    </>
  );
};

// ══════════════════════ 三屏（1290×900）：事件两行（真数据：最近回忆 / 最近未完成约定） ══════════════════════

const EventPhoto: React.FC<{ blobRef?: string }> = ({ blobRef }) => {
  const url = useBlobRefUrl(blobRef);
  if (url) return <img src={url} alt="" draggable={false} decoding="async" className="w-full h-full object-cover select-none" />;
  return <img src="/Couple/留白图.jpg" alt="" draggable={false} decoding="async" className="w-full h-full object-cover select-none" />;
};

const EventCard: React.FC<{ hp: Pct; mirror: boolean; onOpen: () => void; data: { title: string; quote: string; ts: string; photoRef?: string } }> = ({ hp, mirror, onOpen, data }) => {
  const Icon = mirror ? Hourglass : CalendarCheck;
  const y = mirror ? 480 : 40;
  const imgX = mirror ? 170 : 870;
  const textX = mirror ? 490 : 136;
  return (
    <>
      <div className="absolute" style={{ left: wPct(100), top: hp(y), width: wPct(1090), height: hp(360), zIndex: 10, background: 'var(--cp-card, #fff)', borderRadius: cqw(36, 12), boxShadow: CARD_SHADOW }} />
      {/* 图标不动；标题/引语/时间戳整体下移，文字块中心对齐图片中心（y+180） */}
      <Icon className="absolute pointer-events-none" style={{ left: wPct(textX), top: hp(y + 48), width: cqw(20, 13), height: cqw(20, 13), color: 'var(--cs-deep, #d98ba9)', zIndex: 11 }} weight="regular" />
      <Text hp={hp} x={textX + 48} y={y + 50} w={430} h={28} size={13} min={9} color="var(--cp-text, #6b4a58)" weight={600}>{data.title}</Text>
      <Text hp={hp} x={textX} y={y + 128} w={620} h={100} size={18} min={11} color="var(--cp-text, #3a2a33)" weight={600} lineHeight={1.6} style={{ alignItems: 'flex-start', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{data.quote}</Text>
      {/* 时间戳下移：底边与图片底边（y+300）对齐 */}
      <Text hp={hp} x={textX} y={y + 276} w={400} h={24} size={11} min={8} color="var(--cp-faint, #b0909c)">{data.ts}</Text>
      <div className="absolute overflow-hidden pointer-events-none" style={{ left: wPct(imgX), top: hp(y + 60), width: wPct(240), height: hp(240), zIndex: 11, borderRadius: cqw(20, 10) }}>
        <EventPhoto blobRef={data.photoRef} />
      </div>
      <Hotspot hp={hp} x={100} y={y} w={1090} h={360} z={12} onTap={onOpen} />
    </>
  );
};

// ── 二屏 + 三屏总出口 ──
const CoupleBelow: React.FC<{ onOpen: (route: string) => void }> = ({ onOpen }) => {
  const [beauty] = React.useState(loadCoupleBeauty);
  const diaryStore = useDiaryStore();
  const togetherStore = useTogetherStore();
  const theme = buildTheme(beauty.accent);
  const themeVars = {
    ['--cs-accent' as string]: theme.accent,
    ['--cs-soft' as string]: theme.soft,
    ['--cs-border' as string]: theme.border,
    ['--cs-deep' as string]: theme.deep,
    ['--cs-scroll' as string]: theme.scroll,
    ['--cs-shadow-soft' as string]: theme.shadowSoft,
    ['--cs-shadow-strong' as string]: theme.shadowStrong,
  } as React.CSSProperties;

  const hp2: Pct = (n) => `${((n / 2220) * 100).toFixed(3)}%`;
  const hp3: Pct = (n) => `${((n / 900) * 100).toFixed(3)}%`;

  // 日记卡真数据（2026-08-24）：表面 = 最近一篇的日期 + 正文开头；没写过显示空态
  const now = new Date();
  const diaryCard = (owner: 'me' | 'her', title: string) => {
    const latest = latestDiary(diaryStore.entries, owner);
    if (!latest) {
      return { title, meta: '还没写', text: '今天的日记还是空白的。' };
    }
    const snippet = latest.content.length > 40 ? `${latest.content.slice(0, 40)}…` : latest.content;
    return { title, meta: `${fmtDiaryMeta(latest.date, now)} · ${latest.date.slice(5).replace('-', '/')}`, text: snippet };
  };
  const hisCard = diaryCard('me', 'Nox 的日记');
  const herCard = diaryCard('her', 'Angel 的日记');

  // 事件卡真数据（2026-08-25）：A = 最近回忆，B = 最近未完成约定；空态引导去记录
  const memoryCard = (() => {
    const m = latestMemory(togetherStore.memories);
    if (!m) return { title: '最近一起做过的事', quote: '还没有一起做过的事的记录。', ts: '点这里记下第一件吧', photoRef: undefined };
    const snippet = m.context.trim().length > 60 ? `${m.context.trim().slice(0, 60)}…` : m.context.trim();
    return {
      title: '最近一起做过的事',
      quote: `「${m.title}」${snippet ? ` · ${snippet}` : ''}`,
      ts: m.date,
      photoRef: m.photos[0]?.blobRef,
    };
  })();
  const promiseCard = (() => {
    const p = latestOpenPromise(togetherStore.promises);
    if (!p) return { title: '约好但还没做的事', quote: '还没有约好的事。', ts: '点这里记下第一件吧', photoRef: undefined };
    const snippet = p.content.trim().length > 60 ? `${p.content.trim().slice(0, 60)}…` : p.content.trim();
    return {
      title: '约好但还没做的事',
      quote: `「${p.title}」${snippet ? ` · ${snippet}` : ''}`,
      ts: p.deadline ? `${p.deadline} 前` : p.createdAt.slice(0, 10),
      photoRef: p.photos[0]?.blobRef,
    };
  })();

  return (
    <>
      {/* 二屏：四行功能卡 */}
      <div className="relative" style={{ containerType: 'inline-size', aspectRatio: '1290 / 2220', ...CAP, ...themeVars }}>
        <WeatherCard hp={hp2} onOpen={() => onOpen('c6')} />
        <ReadingRow hp={hp2} onOpen={onOpen} />
        <DietPeriodCard hp={hp2} onOpen={onOpen} />
        <MoneyCard hp={hp2} onOpen={() => onOpen('c3')} />
        <DiaryCard hp={hp2} i={0} {...hisCard} onOpen={() => onOpen('c4')} />
        <DiaryCard hp={hp2} i={1} {...herCard} onOpen={() => onOpen('c4her')} />
      </div>
      {/* 三屏：事件记录两行 */}
      <div className="relative" style={{ containerType: 'inline-size', aspectRatio: '1290 / 900', ...CAP, ...themeVars }}>
        <EventCard hp={hp3} mirror={false} onOpen={() => onOpen('c9')} data={memoryCard} />
        <EventCard hp={hp3} mirror={true} onOpen={() => onOpen('c9')} data={promiseCard} />
      </div>
    </>
  );
};

export default CoupleBelow;

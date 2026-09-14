// 饮食页 c2（2026-08-23）——绿色主题，顶部日期条与月经页同款（粉改绿）
// 结构：热量环卡（左饮食摄入/中环剩余热量/右运动消耗 + 碳水蛋白脂肪三行）→ 饮食推荐卡 → 记饮食+食物库入口 → 早中晚加餐运动五张记录卡
// 热量环中间：还可以吃（千卡）小字 / 剩余热量黑色大字 / 推荐预算可改；宏量目标三数可改
import React, { useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Camera, CaretRight, PaperPlaneTilt, PencilSimple, Sparkle, UserCircle } from '@phosphor-icons/react';
import DateStrip from './DateStrip';
import CoupleFoodLibrary from './CoupleFoodLibrary';
import { DietRecordModal, ExerciseModal, MealDetailModal, ProfileModal, RecommendModal, TargetsModal } from './DietModals';
import { getDietStore, useDietStore } from './dietStore';
import { dayTotals, MEAL_LABELS, MEAL_ORDER, mealSuggestRange, remainingKcal, type MealKey } from '../../utils/dietMath';
import { getLocalDateKey } from '../../utils/localDate';
import { useBlobRefUrl } from '../../utils/blobRef';
import { ForwardPicker } from './CouplePeriod';
import { forwardCoupleCard } from './coupleForward';

const GREEN = '#7ac79c';
const GREEN_DEEP = '#3e8f68';
const GREEN_SOFT = '#e9f7f0';

const MACRO_ROWS = [
  { key: 'carbs', label: '碳水化合物', color: '#f0b46a' },
  { key: 'protein', label: '蛋白质', color: '#7ba7e8' },
  { key: 'fat', label: '脂肪', color: '#e8a0b8' },
] as const;

// 记录行缩略图（hook 组件不能进 map）
const ItemThumb: React.FC<{ item: { foodId?: string; photoRef?: string } }> = ({ item }) => {
  const food = item.foodId ? getDietStore().foods.find((f) => f.id === item.foodId) : undefined;
  const libUrl = useBlobRefUrl(food?.thumbRef);
  const photoUrl = useBlobRefUrl(item.photoRef);
  const url = libUrl ?? photoUrl;
  return (
    <span className="flex items-center justify-center shrink-0 overflow-hidden" style={{ width: 40, height: 40, borderRadius: 10, background: '#eef5f1' }}>
      {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 17 }}>🍽</span>}
    </span>
  );
};

const CoupleDiet: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const store = useDietStore();
  const [selected, setSelected] = useState(getLocalDateKey());
  const [view, setView] = useState<'home' | 'library'>('home');
  const [record, setRecord] = useState<{ open: boolean; meal?: MealKey }>({ open: false });
  const [detailMeal, setDetailMeal] = useState<MealKey | null>(null);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [exerciseOpen, setExerciseOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const p = store.profile;
  const profileSummary = [p.height, p.weight, p.preferences && p.preferences.slice(0, 14)].filter(Boolean).join(' · ');

  // 选中日期的全部饮食（转发给角色用）
  const forwardText = useMemo(() => {
    const recs = store.records.filter((r) => r.date === selected);
    if (recs.length === 0) return '';
    const lines = [`${selected} 的饮食记录`];
    for (const m of MEAL_ORDER) {
      const items = recs.filter((r) => r.meal === m).flatMap((r) => r.items);
      if (items.length === 0) continue;
      const kcal = items.reduce((s, i) => s + i.kcal, 0);
      lines.push(`${MEAL_LABELS[m]}：${items.map((i) => `${i.name} ${i.grams}g ${i.kcal}千卡`).join('、')}（小计 ${Math.round(kcal)} 千卡）`);
    }
    return lines.join('\n');
  }, [store.records, selected]);

  const dayItems = useMemo(
    () =>
      store.records
        .filter((r) => r.date === selected)
        .flatMap((r) => r.items.map((i) => ({ ...i, meal: r.meal }))),
    [store.records, selected],
  );
  const totals = dayTotals(dayItems);
  const budget = store.targets.calorieBudget;
  const remaining = remainingKcal(totals, budget);
  const ratio = budget > 0 ? Math.min(1, remaining / budget) : 0;
  const R = 56;
  const C = 2 * Math.PI * R;

  if (view === 'library') {
    return <CoupleFoodLibrary onBack={() => setView('home')} />;
  }

  return (
    <div
      className="absolute inset-0 flex flex-col overflow-y-auto"
      style={{ background: '#eef8f2', paddingTop: 'calc(var(--chrome-top, 0px) + 14px)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 96px)' }}
    >
      {/* 顶栏：返回 + 标题 + 转发 */}
      <div className="flex items-center px-5" style={{ gap: 10 }}>
        <button type="button" onClick={onBack} aria-label="返回" className="border-0 cursor-pointer rounded-full flex items-center justify-center" style={{ width: 34, height: 34, background: '#fff' }}>
          <ArrowLeft style={{ width: 16, height: 16, color: '#3a2a33' }} />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: '#3a2a33' }}>饮食</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setForwardOpen(true)}
          disabled={!forwardText}
          aria-label="转发当天饮食"
          className="border-0 cursor-pointer rounded-full p-1.5 flex items-center gap-1"
          style={{ background: forwardText ? '#fff' : '#e2ece6', opacity: forwardText ? 1 : 0.55 }}
        >
          <PaperPlaneTilt style={{ width: 13, height: 13, color: '#8a5a6e' }} />
          <span style={{ fontSize: 10, color: '#8a5a6e' }}>转发</span>
        </button>
      </div>
      {/* 日期条（与月经页同款，绿） */}
      <div style={{ padding: '10px 20px 6px' }}>
        <DateStrip selected={selected} onSelect={setSelected} accent={GREEN} />
      </div>

      <div className="flex flex-col px-5" style={{ gap: 10 }}>
        {/* ── 热量环卡 ── */}
        <div className="rounded-3xl p-4 flex flex-col" style={{ background: '#fff', boxShadow: '0 8px 24px rgba(90,160,120,0.12)', gap: 12 }}>
          <div className="flex items-center" style={{ gap: 10 }}>
            {/* 左：饮食摄入 */}
            <div className="flex flex-col shrink-0" style={{ gap: 2, minWidth: 72 }}>
              <span style={{ fontSize: 11, color: '#8aa397' }}>饮食摄入</span>
              <span style={{ fontSize: 26, fontWeight: 800, color: '#3a2a33', lineHeight: 1 }}>{Math.round(totals.kcal)}</span>
              <span style={{ fontSize: 9, color: '#b0c5b9' }}>千卡</span>
            </div>
            {/* 中：绿色圆环进度条（还能吃的热量占比） */}
            <div className="relative flex items-center justify-center" style={{ flex: 1 }}>
              <svg width={132} height={132} viewBox="0 0 132 132" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={66} cy={66} r={R} fill="none" stroke="#e5f0ea" strokeWidth={12} />
                <circle
                  cx={66} cy={66} r={R} fill="none" stroke={GREEN} strokeWidth={12} strokeLinecap="round"
                  strokeDasharray={C} strokeDashoffset={C * (1 - ratio)} style={{ transition: 'stroke-dashoffset 0.4s' }}
                />
              </svg>
              <div className="absolute flex flex-col items-center" style={{ pointerEvents: 'none' }}>
                <span style={{ fontSize: 10, color: '#8aa397' }}>还可以吃（千卡）</span>
                <span style={{ fontSize: 30, fontWeight: 800, color: '#2f3a33', lineHeight: 1.15 }}>{remaining}</span>
                <button
                  type="button"
                  onClick={() => setTargetsOpen(true)}
                  className="border-0 bg-transparent cursor-pointer flex items-center"
                  style={{ fontSize: 9, color: '#8aa397', gap: 2, pointerEvents: 'auto' }}
                >
                  推荐预算 {budget} <PencilSimple size={9} />
                </button>
              </div>
            </div>
            {/* 右：运动消耗（与左对称） */}
            <div className="flex flex-col items-end shrink-0" style={{ gap: 2, minWidth: 72 }}>
              <span style={{ fontSize: 11, color: '#8aa397' }}>运动消耗</span>
              <span style={{ fontSize: 26, fontWeight: 800, color: '#3a2a33', lineHeight: 1 }}>{Math.round(totals.exerciseKcal)}</span>
              <span style={{ fontSize: 9, color: '#b0c5b9' }}>千卡</span>
            </div>
          </div>
          {/* 碳水 / 蛋白 / 脂肪三行（数值可改 → 目标弹卡） */}
          <div className="flex" style={{ gap: 10 }}>
            {MACRO_ROWS.map((m) => {
              const val = Math.round((totals as unknown as Record<string, number>)[m.key] * 10) / 10;
              const goal = (store.targets as unknown as Record<string, number>)[`${m.key === 'protein' ? 'proteinGoal' : m.key === 'carbs' ? 'carbGoal' : 'fatGoal'}`];
              const pct = goal > 0 ? Math.min(100, Math.round((val / goal) * 100)) : 0;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setTargetsOpen(true)}
                  className="flex-1 border-0 cursor-pointer rounded-2xl flex flex-col"
                  style={{ gap: 5, padding: '8px 10px', background: '#f7fcf9', border: '1px solid #e4f0e9', alignItems: 'flex-start' }}
                >
                  <span style={{ fontSize: 10, color: '#7a9487' }}>{m.label}</span>
                  <span style={{ width: '100%', height: 6, background: '#eef4f0', borderRadius: 999, overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: m.color, borderRadius: 999 }} />
                  </span>
                  <span style={{ fontSize: 10, color: '#8aa397' }}>{val}/{goal}g</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 饮食推荐卡 ── */}
        <button
          type="button"
          onClick={() => setRecommendOpen(true)}
          className="flex items-center border-0 cursor-pointer rounded-3xl"
          style={{ gap: 10, padding: 14, background: 'linear-gradient(135deg, #e4f6ec, #f2fbf6)', border: '1px solid #d7eee2' }}
        >
          <Sparkle style={{ width: 18, height: 18, color: GREEN_DEEP, flexShrink: 0 }} />
          <span className="flex-1 min-w-0 text-left">
            <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: GREEN_DEEP }}>饮食推荐</span>
            <span style={{ display: 'block', fontSize: 10, color: '#7a9487', marginTop: 2 }}>根据今天吃的和食物库，让 AI 推荐下一餐吃什么</span>
          </span>
          <CaretRight style={{ width: 14, height: 14, color: '#7a9487', flexShrink: 0 }} />
        </button>

        {/* ── 记饮食 + 食物库入口 ── */}
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button
            type="button"
            onClick={() => setRecord({ open: true })}
            className="flex flex-col items-center border-0 cursor-pointer rounded-3xl"
            style={{ gap: 6, padding: 14, background: '#fff', boxShadow: '0 8px 24px rgba(90,160,120,0.10)' }}
          >
            <Camera style={{ width: 20, height: 20, color: GREEN_DEEP }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#3a2a33' }}>记饮食</span>
            <span style={{ fontSize: 9, color: '#8aa397', lineHeight: 1.5 }}>拍照识别 / 食物库选 / 手动加</span>
          </button>
          <button
            type="button"
            onClick={() => setView('library')}
            className="flex flex-col items-center border-0 cursor-pointer rounded-3xl"
            style={{ gap: 6, padding: 14, background: '#fff', boxShadow: '0 8px 24px rgba(90,160,120,0.10)' }}
          >
            <BookOpen style={{ width: 20, height: 20, color: GREEN_DEEP }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#3a2a33' }}>食物库</span>
            <span style={{ fontSize: 9, color: '#8aa397', lineHeight: 1.5 }}>{store.foods.length} 种食物 · 吃过次数累计</span>
          </button>
        </div>

        {/* ── 个人档案入口（推荐下一餐时小助手会参考身高/体重/偏好/目标） ── */}
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="flex items-center border-0 cursor-pointer rounded-3xl"
          style={{ gap: 10, padding: 12, background: '#fff', boxShadow: '0 8px 24px rgba(90,160,120,0.10)' }}
        >
          <UserCircle style={{ width: 18, height: 18, color: GREEN_DEEP, flexShrink: 0 }} />
          <span className="flex-1 min-w-0 text-left">
            <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#3a2a33' }}>个人档案</span>
            <span style={{ display: 'block', fontSize: 10, color: '#8aa397', marginTop: 2 }}>
              {profileSummary || '还没写：身高/体重/饮食偏好/目标——推荐下一餐时小助手会参考'}
            </span>
          </span>
          <PencilSimple style={{ width: 13, height: 13, color: '#8aa397', flexShrink: 0 }} />
        </button>

        {/* ── 早 / 中 / 晚 / 加餐 / 运动 记录卡 ── */}
        {MEAL_ORDER.map((m) => {
          const recItems = dayItems.filter((i) => i.meal === m);
          const kcal = m === 'exercise' ? totals.exerciseKcal : recItems.reduce((s, i) => s + i.kcal, 0);
          const [a, b] = mealSuggestRange(m, budget);
          return (
            <button
              key={m}
              type="button"
              onClick={() => (m === 'exercise' ? setExerciseOpen(true) : setDetailMeal(m))}
              className="rounded-3xl p-4 flex flex-col border-0 cursor-pointer"
              style={{ gap: 10, background: '#fff', boxShadow: '0 8px 24px rgba(90,160,120,0.10)', textAlign: 'left' }}
            >
              {/* 标题栏：左侧大标题 + 建议区间；右侧总热量 + 右箭头 */}
              <div className="flex items-center justify-between">
                <div className="flex items-baseline" style={{ gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#3a2a33' }}>{MEAL_LABELS[m]}</span>
                  {m !== 'exercise' && b > 0 && <span style={{ fontSize: 10, color: '#a3b8ac' }}>建议{a}-{b} 千卡</span>}
                </div>
                <span className="flex items-center" style={{ gap: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: m === 'exercise' ? GREEN_DEEP : '#3a2a33' }}>{Math.round(kcal)}千卡</span>
                  <CaretRight style={{ width: 13, height: 13, color: '#b0c5b9' }} />
                </span>
              </div>
              {recItems.length === 0 ? (
                <div style={{ fontSize: 11, color: '#b0c5b9' }}>还没有记录，点这里添加</div>
              ) : (
                recItems.map((i) => (
                  <span key={i.id} className="flex items-center" style={{ gap: 10 }}>
                    <ItemThumb item={i} />
                    <span className="flex-1 min-w-0">
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#3a2a33' }}>{i.name}</span>
                      <span style={{ display: 'block', fontSize: 10, color: '#8aa397', marginTop: 1 }}>
                        {m === 'exercise' ? `${i.grams} 分钟` : `${i.grams}g`}
                      </span>
                    </span>
                    <span className="flex items-center" style={{ gap: 2 }}>
                      <span style={{ fontSize: 12, color: '#8aa397' }}>{i.kcal} 千卡</span>
                      <CaretRight style={{ width: 11, height: 11, color: '#c2d4ca' }} />
                    </span>
                  </span>
                ))
              )}
            </button>
          );
        })}
      </div>

      {/* 弹层 */}
      {record.open && <DietRecordModal meal={record.meal} onClose={() => setRecord({ open: false })} />}
      {detailMeal && <MealDetailModal date={selected} meal={detailMeal} onClose={() => setDetailMeal(null)} />}
      {exerciseOpen && <ExerciseModal date={selected} onClose={() => setExerciseOpen(false)} />}
      {recommendOpen && <RecommendModal onClose={() => setRecommendOpen(false)} />}
      {targetsOpen && <TargetsModal onClose={() => setTargetsOpen(false)} />}
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
      {forwardOpen && (
        <ForwardPicker
          onClose={() => setForwardOpen(false)}
          onPick={async (c) => {
            try {
              await forwardCoupleCard(c, { kind: '饮食', title: selected, body: forwardText });
            } catch {
              // 转发失败静默关掉
            }
            setForwardOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default CoupleDiet;

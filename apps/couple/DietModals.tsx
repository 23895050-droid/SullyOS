// 饮食弹层四件套（2026-08-23）：
// DietRecordModal 记饮食（拍照 AI 识别 / 食物库选 / 手动；拍照图只存一天；记过的自动进食物库）
// MealDetailModal 餐食详情（每项宏量 + 小助手评价 + 删除 + 加项）
// RecommendModal AI 推荐下一餐（含 API 配置，识别+推荐共用；模型独立性：不配置不调用）
// TargetsModal 预算/宏量目标编辑
import React, { useMemo, useRef, useState } from 'react';
import { Camera, Check, ForkKnife, PencilSimple, SpinnerGap, Star, Trash, X } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { putImageBlob, useBlobRefUrl, blobToDataUrl, getBlobForRef } from '../../utils/blobRef';
import { getLocalDateKey } from '../../utils/localDate';
import { MEAL_LABELS, MEAL_ORDER, scaleMacros, type MealKey } from '../../utils/dietMath';
import { addDietRecord, addTempPhoto, getDietStore, removeDietItem, recordsOn, updateDietApi, updateDietProfile, updateDietTargets, upsertFood, type DietFoodItem, type FoodLibItem } from './dietStore';
import { getPrompt } from '../../utils/promptRegistry';

// ── 通用小件 ──

const SHEET: React.CSSProperties = { width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 16, gap: 12 };

const Backdrop: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => (
  <div
    className="fixed inset-0 flex items-end justify-center"
    style={{ zIndex: 120, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  >
    {children}
  </div>
);

const SheetHeader: React.FC<{ title: string; onClose: () => void }> = ({ title, onClose }) => (
  <div className="flex items-center justify-between">
    <span style={{ fontSize: 15, fontWeight: 700, color: '#3a2a33' }}>{title}</span>
    <button type="button" onClick={onClose} aria-label="关闭" className="border-0 cursor-pointer rounded-full p-2" style={{ background: '#eef7f1' }}>
      <X style={{ width: 15, height: 15, color: '#3e8f68' }} />
    </button>
  </div>
);

const inputCss: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 13, color: '#3a2a33', border: '1px solid #d7eee2', borderRadius: 12, padding: '8px 10px', background: '#f7fcf9', outline: 'none' };

const labelCss: React.CSSProperties = { fontSize: 11, color: '#7a9487', marginBottom: 4 };

const GREEN = '#7ac79c';
const GREEN_DEEP = '#3e8f68';
const GREEN_SOFT = '#e9f7f0';

// 图片压缩（识图临时图 900px / 食物库缩略图 400px）
const shrinkTo = (file: File, maxW: number): Promise<Blob> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.naturalWidth <= maxW) { resolve(file); return; }
      const c = document.createElement('canvas');
      c.width = maxW;
      c.height = Math.max(1, Math.round((img.naturalHeight * maxW) / img.naturalWidth));
      const ctx = c.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });

// AI 返回的 JSON 容错解析：取第一个 { 到最后一个 } 之间
const extractJson = (text: string): Record<string, unknown> | null => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

// ── 记饮食弹卡 ──

/** 食物缩略图（独立组件才能用 hook；无图回退餐盘 emoji） */
const FoodThumb: React.FC<{ blobRef?: string; size?: number }> = ({ blobRef, size = 40 }) => {
  const url = useBlobRefUrl(blobRef);
  return url ? (
    <img src={url} alt="" style={{ width: size, height: size, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
  ) : (
    <span className="flex items-center justify-center shrink-0" style={{ width: size, height: size, borderRadius: 10, background: '#eef5f1', fontSize: size > 40 ? 20 : 18 }}>🍽</span>
  );
};

/** 五星打分（点第 N 颗星 = N 分；再点同一颗 = 清 0） */
export const StarRow: React.FC<{ value: number; onChange: (v: number) => void; size?: number }> = ({ value, onChange, size = 18 }) => (
  <span className="inline-flex" style={{ gap: 2 }}>
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        key={n}
        type="button"
        onClick={() => onChange(value === n ? 0 : n)}
        aria-label={`${n} 星`}
        className="border-0 cursor-pointer"
        style={{ background: 'transparent', padding: 0, lineHeight: 0 }}
      >
        <Star
          style={{ width: size, height: size, color: n <= value ? '#f5b942' : '#dfe8e3', transition: 'transform 0.1s' }}
          weight={n <= value ? 'fill' : 'regular'}
        />
      </button>
    ))}
  </span>
);

/** AI 识图（记饮食拍照 / 食物库建卡共用）：返回结构化结果；解析不出 JSON 时 review 放原始文本、name 为空 */
export interface RecognizedFood {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  review: string;
}
export const recognizeFoodImage = async (
  dataUrl: string,
  api: { baseUrl: string; apiKey: string; model: string },
): Promise<RecognizedFood> => {
  // 提示词走注册表（设置页「提示词管理」可视化编辑）；小模型推理 token 要给足，防截断
  const res = await fetch(`${api.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.apiKey}` },
    body: JSON.stringify({
      model: api.model,
      messages: [{ role: 'user', content: [{ type: 'text', text: getPrompt('识图识别') }, { type: 'image_url', image_url: { url: dataUrl } }] }],
      max_tokens: 4096,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const text = str(json?.choices?.[0]?.message?.content);
  const parsed = extractJson(text);
  if (parsed) {
    return {
      name: str(parsed.name, '食物'), grams: num(parsed.grams, 100), kcal: num(parsed.kcal),
      protein: num(parsed.protein), carbs: num(parsed.carbs), fat: num(parsed.fat), review: str(parsed.review),
    };
  }
  return { name: '', grams: 100, kcal: 0, protein: 0, carbs: 0, fat: 0, review: text.slice(0, 200) };
};

export const DietRecordModal: React.FC<{ meal?: MealKey; onClose: () => void }> = ({ meal, onClose }) => {
  const { addToast } = useOS();
  const hour = new Date().getHours();
  const [selMeal, setSelMeal] = useState<MealKey>(meal ?? (hour < 10 ? 'breakfast' : hour < 15 ? 'lunch' : hour < 21 ? 'dinner' : 'snack'));
  const [tab, setTab] = useState<'photo' | 'lib' | 'manual'>('photo');
  const [form, setForm] = useState({ name: '', grams: 100, kcal: 0, protein: 0, carbs: 0, fat: 0, review: '', rating: 0, glycemic: '', foodId: undefined as string | undefined, photoRef: undefined as string | undefined });
  const [busy, setBusy] = useState(false);
  const [libPick, setLibPick] = useState<FoodLibItem | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const photoUrl = useBlobRefUrl(form.photoRef);
  const libPickUrl = useBlobRefUrl(libPick?.thumbRef);

  const api = getDietStore().api;
  const hasApi = !!(api.baseUrl && api.apiKey && api.model);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const recognize = async () => {
    if (!form.photoRef) return;
    if (!hasApi) { addToast('先在「推荐下一餐」卡片里配置饮食 API（识别和推荐共用）', 'info'); return; }
    setBusy(true);
    try {
      const blob = await getBlobForRef(form.photoRef);
      if (!blob) throw new Error('图片读取失败');
      const r = await recognizeFoodImage(await blobToDataUrl(blob), api);
      set({
        name: r.name,
        grams: r.grams,
        kcal: r.kcal,
        protein: r.protein,
        carbs: r.carbs,
        fat: r.fat,
        review: r.review,
      });
      addToast(r.name ? '识别完成，确认无误后保存' : '没解析出 JSON，已粘贴原始文本，请手动核对', r.name ? 'success' : 'info');
    } catch (e) {
      addToast(`识别失败：${e instanceof Error ? e.message : '网络错误'}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f: File) => {
    try {
      const blob = await shrinkTo(f, 900);
      const ref = await putImageBlob(blob);
      addTempPhoto(ref);
      set({ photoRef: ref });
    } catch {
      addToast('图片保存失败', 'error');
    }
  };

  const rating = form.rating;
  const glycemic = form.glycemic.trim() ? Number(form.glycemic) : undefined;

  const save = () => {
    let item: { foodId?: string; name: string; grams: number; kcal: number; protein: number; carbs: number; fat: number; review?: string; rating?: number; glycemic?: number; photoRef?: string };
    if (tab === 'lib' && libPick) {
      const sc = scaleMacros(libPick, libPick.defaultGrams);
      item = { foodId: libPick.id, name: libPick.name, grams: libPick.defaultGrams, kcal: sc.kcal, protein: sc.protein, carbs: sc.carbs, fat: sc.fat };
      // 在记饮食卡片里打的分/升糖写回食物库本身
      if (rating > 0 || glycemic !== undefined) upsertFood({ id: libPick.id, name: libPick.name, kcal: libPick.kcal, protein: libPick.protein, carbs: libPick.carbs, fat: libPick.fat, rating: rating > 0 ? rating : undefined, glycemic });
    } else if (form.name.trim() && form.kcal > 0) {
      item = {
        foodId: form.foodId, name: form.name.trim(), grams: form.grams, kcal: form.kcal, protein: form.protein, carbs: form.carbs, fat: form.fat,
        review: form.review || undefined, rating: rating > 0 ? rating : undefined, glycemic, photoRef: form.photoRef,
      };
    } else {
      addToast('至少填食物名和热量', 'info');
      return;
    }
    addDietRecord({ meal: selMeal, items: [item] });
    addToast(`已记入${MEAL_LABELS[selMeal]}`, 'success');
    onClose();
  };

  return (
    <Backdrop onClose={onClose}>
      <div className="flex flex-col" style={SHEET}>
        <SheetHeader title="记饮食" onClose={onClose} />
        {/* 餐次选择 */}
        <div className="flex" style={{ gap: 6, flexWrap: 'wrap' }}>
          {MEAL_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSelMeal(m)}
              className="border-0 cursor-pointer rounded-full"
              style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', background: selMeal === m ? GREEN : '#eef5f1', color: selMeal === m ? '#fff' : '#6a8a7a' }}
            >
              {MEAL_LABELS[m]}
            </button>
          ))}
        </div>
        {/* 三个 tab */}
        <div className="flex rounded-full p-1" style={{ background: '#eef5f1', gap: 4 }}>
          {([['photo', '拍照'], ['lib', '食物库'], ['manual', '手动']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className="flex-1 border-0 cursor-pointer rounded-full"
              style={{ fontSize: 12, fontWeight: 600, padding: '7px 0', background: tab === k ? '#fff' : 'transparent', color: tab === k ? GREEN_DEEP : '#8aa397', boxShadow: tab === k ? '0 2px 6px rgba(60,120,90,0.12)' : 'none' }}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'photo' && (
          <div className="flex flex-col" style={{ gap: 10 }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }}
            />
            <input
              ref={albumRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center border-0 cursor-pointer"
              style={{ height: 120, background: '#f7fcf9', border: '1px dashed #bfe0cd', borderRadius: 16, gap: 6 }}
            >
              {photoUrl ? (
                <img src={photoUrl} alt="食物照片" style={{ height: '100%', width: '100%', objectFit: 'cover', borderRadius: 16 }} />
              ) : (
                <>
                  <Camera style={{ width: 26, height: 26, color: GREEN }} />
                  <span style={{ fontSize: 11, color: '#8aa397' }}>拍照（识图照片只保留一天）</span>
                </>
              )}
            </button>
            {/* 拍照 / 从相册选 双入口 */}
            <div className="flex" style={{ gap: 8 }}>
              <button
                type="button" onClick={() => fileRef.current?.click()}
                className="flex-1 border-0 cursor-pointer rounded-full"
                style={{ padding: '8px 0', fontSize: 12, fontWeight: 600, color: GREEN_DEEP, background: GREEN_SOFT }}
              >
                📷 拍照
              </button>
              <button
                type="button" onClick={() => albumRef.current?.click()}
                className="flex-1 border-0 cursor-pointer rounded-full"
                style={{ padding: '8px 0', fontSize: 12, fontWeight: 600, color: GREEN_DEEP, background: GREEN_SOFT }}
              >
                🖼 从相册选
              </button>
            </div>
            {photoUrl && (
              <button
                type="button" onClick={recognize} disabled={busy}
                className="border-0 cursor-pointer rounded-full flex items-center justify-center"
                style={{ padding: '10px 0', fontSize: 13, fontWeight: 700, color: '#fff', background: busy ? '#b9d8c6' : GREEN, gap: 6 }}
              >
                {busy ? <SpinnerGap className="animate-spin" style={{ width: 14, height: 14 }} /> : null}
                {busy ? '识别中…' : '识别热量和营养'}
              </button>
            )}
          </div>
        )}
        {tab === 'lib' && (
          <div className="flex flex-col" style={{ gap: 8, maxHeight: 220, overflowY: 'auto' }}>
            {getDietStore().foods.slice().sort((a, b) => b.eatenCount - a.eatenCount).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setLibPick(f)}
                className="flex items-center border-0 cursor-pointer rounded-2xl"
                style={{ gap: 10, padding: 8, background: libPick?.id === f.id ? GREEN_SOFT : '#f7fcf9', border: `1px solid ${libPick?.id === f.id ? GREEN : '#e4f0e9'}` }}
              >
                <FoodThumb blobRef={f.thumbRef} />
                <span className="flex-1 min-w-0 text-left">
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#3a2a33' }}>{f.name}</span>
                  <span style={{ display: 'block', fontSize: 10, color: '#8aa397' }}>每100g {f.kcal} 千卡 · 吃过 {f.eatenCount} 次</span>
                </span>
                {libPick?.id === f.id && <Check style={{ width: 16, height: 16, color: GREEN_DEEP }} weight="bold" />}
              </button>
            ))}
            {getDietStore().foods.length === 0 && <span style={{ fontSize: 11, color: '#8aa397', padding: 8 }}>食物库还是空的，去食物库添加，或先手动记一笔（会自动进库）</span>}
          </div>
        )}
        {tab === 'manual' && (
          <div style={{ fontSize: 11, color: '#8aa397' }}>手动记的食物会自动按每 100g 换算存进食物库，下次直接选。</div>
        )}
        {/* 确认表单（拍照后即出现：识别失败也能手动填；食物库选中后显示换算摘要；每个数值都有标签和单位） */}
        {((tab === 'photo' && form.photoRef) || tab === 'manual' || (tab === 'lib' && libPick)) && (
          <div className="flex flex-col" style={{ gap: 8 }}>
            {tab === 'lib' && libPick ? (
              <div className="flex flex-col rounded-xl p-2.5" style={{ gap: 6, background: '#eef7f1', border: '1px solid #d7eee2' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#3a2a33' }}>{libPick.name}</div>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span style={{ ...labelCss, margin: 0 }}>份量</span>
                  <input
                    type="number"
                    value={libPick.defaultGrams}
                    onChange={(e) => setLibPick({ ...libPick, defaultGrams: Math.max(1, Number(e.target.value) || 1) })}
                    style={{ ...inputCss, width: 76, padding: '5px 8px' }}
                  />
                  <span style={{ fontSize: 11, color: '#8aa397' }}>g</span>
                </div>
                <div style={{ fontSize: 11, color: '#5c846e', lineHeight: 1.6 }}>
                  {(() => { const sc = scaleMacros(libPick, libPick.defaultGrams); return `将记录：${sc.kcal} 千卡 · 蛋白 ${sc.protein}g · 碳水 ${sc.carbs}g · 脂肪 ${sc.fat}g`; })()}
                </div>
              </div>
            ) : (
              <>
                <div><div style={labelCss}>食物名</div><input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="如 番茄炒蛋" style={inputCss} /></div>
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><div style={labelCss}>克数（g）</div><input type="number" value={form.grams} onChange={(e) => set({ grams: Math.max(1, Number(e.target.value) || 1) })} style={inputCss} /></div>
                  <div><div style={labelCss}>热量（千卡）</div><input type="number" value={form.kcal} onChange={(e) => set({ kcal: Math.max(0, Number(e.target.value) || 0) })} style={inputCss} /></div>
                  <div><div style={labelCss}>蛋白质（g）</div><input type="number" value={form.protein} onChange={(e) => set({ protein: Math.max(0, Number(e.target.value) || 0) })} style={inputCss} /></div>
                  <div><div style={labelCss}>碳水（g）</div><input type="number" value={form.carbs} onChange={(e) => set({ carbs: Math.max(0, Number(e.target.value) || 0) })} style={inputCss} /></div>
                  <div><div style={labelCss}>脂肪（g）</div><input type="number" value={form.fat} onChange={(e) => set({ fat: Math.max(0, Number(e.target.value) || 0) })} style={inputCss} /></div>
                </div>
                <div><div style={labelCss}>小助手点评（可选）</div><input value={form.review} onChange={(e) => set({ review: e.target.value })} placeholder="识别时自动带出" style={inputCss} /></div>
              </>
            )}
            {/* 打分 + 升糖（可选：评分进食物库；升糖给妈妈做饭记录用） */}
            <div className="flex items-center justify-between rounded-xl" style={{ padding: '8px 10px', background: '#f7fcf9', border: '1px solid #e4f0e9' }}>
              <div>
                <div style={labelCss}>打分（记到食物库）</div>
                <StarRow value={rating} onChange={(v) => set({ rating: v })} />
              </div>
              <div style={{ width: 116 }}>
                <div style={labelCss}>升糖值 mmol/L（可选）</div>
                <input type="number" step="0.1" value={form.glycemic} onChange={(e) => set({ glycemic: e.target.value })} placeholder="如 2.3" style={inputCss} />
              </div>
            </div>
            <button
              type="button" onClick={save}
              disabled={!((tab === 'lib' && libPick) || form.name.trim())}
              className="border-0 cursor-pointer rounded-full"
              style={{ padding: '11px 0', fontSize: 14, fontWeight: 700, color: '#fff', background: (tab === 'lib' && libPick) || form.name.trim() ? GREEN : '#d5e8dc' }}
            >
              记下这一笔
            </button>
          </div>
        )}
      </div>
    </Backdrop>
  );
};

// ── 餐食详情（每项宏量 + 小助手评价） ──

export const MealDetailModal: React.FC<{ date: string; meal: MealKey; onClose: () => void }> = ({ date, meal, onClose }) => {
  const [addOpen, setAddOpen] = useState(false);
  const records = recordsOn(date, meal);
  const foods = getDietStore().foods;
  const items = records.flatMap((r) => r.items);

  return (
    <Backdrop onClose={onClose}>
      <div className="flex flex-col" style={SHEET}>
        <SheetHeader title={MEAL_LABELS[meal]} onClose={onClose} />
        {items.length === 0 && (
          <div className="rounded-2xl p-4" style={{ background: '#f7fcf9', fontSize: 11, color: '#8aa397', lineHeight: 1.6 }}>
            这一餐还没记录。点下面的「添加食物」记一笔——可以拍照识别、从食物库选或手动输入。
          </div>
        )}
        <div className="flex flex-col" style={{ gap: 10, maxHeight: 320, overflowY: 'auto' }}>
          {items.map((it) => (
            <FoodItemRow
              key={it.id}
              item={it}
              foods={foods}
              onDelete={() => {
                const rec = records.find((r) => r.items.some((i) => i.id === it.id));
                if (rec) removeDietItem(rec.id, it.id);
              }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="border-0 cursor-pointer rounded-full flex items-center justify-center"
          style={{ padding: '10px 0', fontSize: 13, fontWeight: 700, color: GREEN_DEEP, background: GREEN_SOFT, gap: 6 }}
        >
          <ForkKnife style={{ width: 14, height: 14 }} /> 添加食物
        </button>
      </div>
      {addOpen && <DietRecordModal meal={meal} onClose={() => setAddOpen(false)} />}
    </Backdrop>
  );
};

const FoodItemRow: React.FC<{ item: DietFoodItem; foods: FoodLibItem[]; onDelete: () => void }> = ({ item, foods, onDelete }) => {
  const food = item.foodId ? foods.find((f) => f.id === item.foodId) : undefined;
  const thumb = useBlobRefUrl(food?.thumbRef);
  const photo = useBlobRefUrl(item.photoRef);
  const url = thumb ?? photo;
  return (
    <div className="flex" style={{ gap: 10, padding: 10, background: '#fdfefe', border: '1px solid #e4f0e9', borderRadius: 16 }}>
      <span className="flex items-center justify-center shrink-0 overflow-hidden" style={{ width: 48, height: 48, borderRadius: 12, background: '#eef5f1' }}>
        {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 20 }}>🍽</span>}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 13, fontWeight: 700, color: '#3a2a33' }}>{item.name}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#3a2a33' }}>{item.kcal} 千卡</span>
        </div>
        <div style={{ fontSize: 11, color: '#8aa397', marginTop: 2 }}>{item.grams}g · 蛋白 {item.protein}g · 碳水 {item.carbs}g · 脂肪 {item.fat}g</div>
        {item.review && (
          <div className="rounded-lg" style={{ fontSize: 10, color: '#5c846e', background: '#eef7f1', padding: '6px 8px', marginTop: 6, lineHeight: 1.5 }}>
            ✦ {item.review}
          </div>
        )}
      </div>
      <button type="button" onClick={onDelete} aria-label="删除这项" className="border-0 cursor-pointer shrink-0 self-start p-1" style={{ background: 'transparent' }}>
        <Trash style={{ width: 13, height: 13, color: '#c9b4c0' }} />
      </button>
    </div>
  );
};

// ── AI 推荐下一餐（含 API 配置） ──

const buildRecommendPrompt = (useFridge: boolean): string => {
  const s = getDietStore();
  const today = s.records.filter((r) => r.date === getLocalDateKey());
  const intake = today.reduce((sum, r) => sum + r.items.reduce((x, i) => x + i.kcal, 0), 0);
  const top = s.foods.slice().sort((a, b) => b.eatenCount - a.eatenCount).slice(0, 15).map((f) => f.name).join('、');
  const p = s.profile;
  const profileBits = [
    p.height && `身高 ${p.height}`,
    p.weight && `体重 ${p.weight}`,
    p.preferences && `饮食偏好/忌口：${p.preferences}`,
    p.goals && `目标：${p.goals}`,
  ].filter(Boolean);
  const fridgeBits = s.fridge.map((f) => `${f.name}${f.amount ? `（${f.amount}）` : ''}`);
  // 今天每一餐吃了什么（全明细，避免 AI 总推荐一样的东西）
  const todayLines = MEAL_ORDER.map((m) => {
    const items = today.filter((r) => r.meal === m).flatMap((r) => r.items);
    if (items.length === 0) return null;
    const kcal = items.reduce((x, i) => x + i.kcal, 0);
    return `  ${MEAL_LABELS[m]}：${items.map((i) => `${i.name} ${i.grams}g ${i.kcal}千卡`).join('、')}（小计 ${Math.round(kcal)} 千卡）`;
  }).filter((x): x is string => x !== null);
  const lines = [
    getPrompt('推荐下一餐'),
    `- 今天已摄入：${Math.round(intake)} 千卡（预算 ${s.targets.calorieBudget}）`,
    `- 推荐目标：碳水 ${s.targets.carbGoal}g / 蛋白 ${s.targets.proteinGoal}g / 脂肪 ${s.targets.fatGoal}g`,
  ];
  if (todayLines.length) lines.push(`- 今天已经吃了：\n${todayLines.join('\n')}`);
  if (profileBits.length) lines.push(`- 她的个人档案：${profileBits.join('；')}`);
  if (useFridge && fridgeBits.length) lines.push(`- 冰箱里现在有：${fridgeBits.join('、')}（优先用这些食材）`);
  if (top) lines.push(`- 她常吃的食物：${top}`);
  return lines.join('\n');
};

export const RecommendModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { addToast } = useOS();
  const [api, setApi] = useState(getDietStore().api);
  const [showCfg, setShowCfg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [useFridge, setUseFridge] = useState(true);
  const hasApi = !!(api.baseUrl && api.apiKey && api.model);

  const generate = async () => {
    if (!hasApi) { addToast('先配置饮食 API', 'info'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${api.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.apiKey}` },
        body: JSON.stringify({ model: api.model, messages: [{ role: 'user', content: buildRecommendPrompt(useFridge) }], max_tokens: 4096 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setResult(str(json?.choices?.[0]?.message?.content, '没有收到回复'));
    } catch (e) {
      addToast(`推荐失败：${e instanceof Error ? e.message : '网络错误'}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Backdrop onClose={onClose}>
      <div className="flex flex-col" style={SHEET}>
        <SheetHeader title="推荐下一餐" onClose={onClose} />
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 11, color: '#8aa397' }}>带上今天吃了什么/个人档案/食物库来推荐（识别照片也用它，共用同一个 API；提示词在设置·提示词管理里可改）</span>
          <button type="button" onClick={() => setShowCfg((v) => !v)} className="border-0 cursor-pointer flex items-center" style={{ background: 'transparent', fontSize: 11, color: GREEN_DEEP, gap: 3 }}>
            <PencilSimple style={{ width: 11, height: 11 }} /> 配置
          </button>
        </div>
        <label className="flex items-center" style={{ gap: 6, fontSize: 11, color: '#5c846e', cursor: 'pointer' }}>
          <input type="checkbox" checked={useFridge} onChange={(e) => setUseFridge(e.target.checked)} />
          参考冰箱里的食材（不勾选就不参考）
        </label>
        {showCfg && (
          <div className="flex flex-col" style={{ gap: 6 }}>
            <input value={api.baseUrl} onChange={(e) => setApi({ ...api, baseUrl: e.target.value })} placeholder="API Base URL（带 /v1）" style={inputCss} />
            <input value={api.apiKey} onChange={(e) => setApi({ ...api, apiKey: e.target.value })} placeholder="API Key" style={inputCss} />
            <input value={api.model} onChange={(e) => setApi({ ...api, model: e.target.value })} placeholder="多模态模型名" style={inputCss} />
            <button
              type="button" onClick={() => { updateDietApi(api); addToast('已保存饮食 API 配置', 'success'); setShowCfg(false); }}
              className="border-0 cursor-pointer rounded-full"
              style={{ padding: '8px 0', fontSize: 12, fontWeight: 700, color: '#fff', background: GREEN }}
            >
              保存配置
            </button>
          </div>
        )}
        <button
          type="button" onClick={generate} disabled={busy}
          className="border-0 cursor-pointer rounded-full flex items-center justify-center"
          style={{ padding: '10px 0', fontSize: 13, fontWeight: 700, color: '#fff', background: busy ? '#b9d8c6' : GREEN, gap: 6 }}
        >
          {busy ? <SpinnerGap className="animate-spin" style={{ width: 14, height: 14 }} /> : null}
          {busy ? '推荐中…' : result ? '再推荐一次' : '开始推荐'}
        </button>
        {result && (
          <div className="rounded-2xl" style={{ background: '#f7fcf9', border: '1px solid #e4f0e9', padding: 12, fontSize: 12, color: '#3a4a40', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 240, overflowY: 'auto' }}>
            {result}
          </div>
        )}
      </div>
    </Backdrop>
  );
};

// ── 预算/宏量目标编辑 ──

export const TargetsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { addToast } = useOS();
  const [t, setT] = useState(getDietStore().targets);
  const save = () => {
    updateDietTargets({ calorieBudget: Math.max(500, t.calorieBudget), carbGoal: Math.max(0, t.carbGoal), proteinGoal: Math.max(0, t.proteinGoal), fatGoal: Math.max(0, t.fatGoal) });
    addToast('已保存目标', 'success');
    onClose();
  };
  return (
    <Backdrop onClose={onClose}>
      <div className="flex flex-col" style={SHEET}>
        <SheetHeader title="推荐目标" onClose={onClose} />
        <div className="flex flex-col" style={{ gap: 8 }}>
          <div><div style={labelCss}>推荐预算（千卡/天）</div><input type="number" value={t.calorieBudget} onChange={(e) => setT({ ...t, calorieBudget: Number(e.target.value) || 0 })} style={inputCss} /></div>
          <div className="flex" style={{ gap: 8 }}>
            <div className="flex-1"><div style={labelCss}>碳水 g</div><input type="number" value={t.carbGoal} onChange={(e) => setT({ ...t, carbGoal: Number(e.target.value) || 0 })} style={inputCss} /></div>
            <div className="flex-1"><div style={labelCss}>蛋白 g</div><input type="number" value={t.proteinGoal} onChange={(e) => setT({ ...t, proteinGoal: Number(e.target.value) || 0 })} style={inputCss} /></div>
            <div className="flex-1"><div style={labelCss}>脂肪 g</div><input type="number" value={t.fatGoal} onChange={(e) => setT({ ...t, fatGoal: Number(e.target.value) || 0 })} style={inputCss} /></div>
          </div>
          <button type="button" onClick={save} className="border-0 cursor-pointer rounded-full" style={{ padding: '11px 0', fontSize: 14, fontWeight: 700, color: '#fff', background: GREEN }}>
            保存
          </button>
        </div>
      </div>
    </Backdrop>
  );
};

// ── 个人档案（推荐下一餐时给 AI 参考：身高体重算代谢，偏好忌口避雷） ──

export const ProfileModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { addToast } = useOS();
  const [p, setP] = useState(getDietStore().profile);
  const save = () => {
    updateDietProfile(p);
    addToast('已保存个人档案', 'success');
    onClose();
  };
  return (
    <Backdrop onClose={onClose}>
      <div className="flex flex-col" style={SHEET}>
        <SheetHeader title="个人档案" onClose={onClose} />
        <div style={{ fontSize: 11, color: '#8aa397', lineHeight: 1.6 }}>小助手推荐下一餐时会参考这些：身高体重算代谢，偏好忌口避雷，目标定方向。</div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div><div style={labelCss}>身高</div><input value={p.height} onChange={(e) => setP({ ...p, height: e.target.value })} placeholder="165cm" style={inputCss} /></div>
          <div><div style={labelCss}>体重</div><input value={p.weight} onChange={(e) => setP({ ...p, weight: e.target.value })} placeholder="50kg" style={inputCss} /></div>
        </div>
        <div><div style={labelCss}>饮食偏好 / 忌口</div><textarea value={p.preferences} rows={2} onChange={(e) => setP({ ...p, preferences: e.target.value })} placeholder="爱吃辣；不吃香菜" style={{ ...inputCss, resize: 'vertical' }} /></div>
        <div><div style={labelCss}>目标</div><textarea value={p.goals} rows={2} onChange={(e) => setP({ ...p, goals: e.target.value })} placeholder="减脂 / 增肌 / 保持体重" style={{ ...inputCss, resize: 'vertical' }} /></div>
        <button type="button" onClick={save} className="border-0 cursor-pointer rounded-full" style={{ padding: '11px 0', fontSize: 14, fontWeight: 700, color: '#fff', background: GREEN }}>
          保存
        </button>
      </div>
    </Backdrop>
  );
};

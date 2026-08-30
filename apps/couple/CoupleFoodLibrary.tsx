// 食物库（2026-08-23 二改）——记过的食物自动进库；缩略图在食物详情里手动上传（blobRef 持久保存）
// 卡片表面：名字 + 上次吃 + 吃过次数 + 千卡 + 家常/外卖 + 评分；搜索 + 按热量/次数/升糖排序
// 详情（FoodFormModal）：评分/升糖 + 家常勾选→做法123 + 外卖勾选→购买记录123 + 转发单食物详情卡；冰箱 = 独立页
import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, CaretRight, MagnifyingGlass, PaperPlaneTilt, Plus, Trash, X } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { deleteBlobRef, putImageBlob, useBlobRefUrl, blobToDataUrl } from '../../utils/blobRef';
import { deleteFood, getDietStore, upsertFood, useDietStore, type CookMethod, type FoodLibItem, type TakeoutRecord } from './dietStore';
import ConfirmDialog from '../../components/os/ConfirmDialog';
import { recognizeFoodImage, StarRow } from './DietModals';
import { toPer100 } from '../../utils/dietMath';
import { ForwardPicker } from './CouplePeriod';
import { forwardCoupleCard, forwardFoodDetail } from './coupleForward';
import CoupleFridge from './CoupleFridge';

const GREEN = '#7ac79c';
const GREEN_DEEP = '#3e8f68';
const GREEN_SOFT = '#e9f7f0';
const inputCss: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 13, color: '#3a2a33', border: '1px solid #d7eee2', borderRadius: 12, padding: '8px 10px', background: '#f7fcf9', outline: 'none' };
const labelCss: React.CSSProperties = { fontSize: 11, color: '#7a9487', marginBottom: 4 };

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

const Thumb: React.FC<{ blobRef?: string; size?: number }> = ({ blobRef, size = 46 }) => {
  const url = useBlobRefUrl(blobRef);
  return url ? (
    <img src={url} alt="" style={{ width: size, height: size, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
  ) : (
    <span className="flex items-center justify-center shrink-0" style={{ width: size, height: size, borderRadius: 12, background: '#eef5f1', fontSize: 20 }}>🍽</span>
  );
};

// ── 添加/编辑弹卡（编辑即详情：缩略图/评分/升糖/家常做法/外卖记录/转发/删除） ──

const uidLocal = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const FoodFormModal: React.FC<{ food?: FoodLibItem; onClose: () => void }> = ({ food, onClose }) => {
  const { addToast } = useOS();
  const [f, setF] = useState({
    name: food?.name ?? '',
    kcal: food?.kcal ?? 0,
    protein: food?.protein ?? 0,
    carbs: food?.carbs ?? 0,
    fat: food?.fat ?? 0,
    unit: food?.unit ?? 'g',
    defaultGrams: food?.defaultGrams ?? 100,
    price: food?.price ?? '',
    platform: food?.platform ?? '',
    thumbRef: food?.thumbRef,
    rating: food?.rating ?? 0,
    glycemic: food?.glycemic !== undefined ? String(food.glycemic) : '',
    isHomeCooked: food?.isHomeCooked ?? false,
    isTakeout: food?.isTakeout ?? false,
    cookMethods: food?.cookMethods ?? [],
    takeoutRecords: food?.takeoutRecords ?? [],
  });
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const albRef = useRef<HTMLInputElement>(null);

  const patchMethod = (id: string, patch: Partial<CookMethod>) =>
    setF({ ...f, cookMethods: f.cookMethods.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  const deleteMethod = (id: string) => setF({ ...f, cookMethods: f.cookMethods.filter((m) => m.id !== id) });
  const patchTakeout = (id: string, patch: Partial<TakeoutRecord>) =>
    setF({ ...f, takeoutRecords: f.takeoutRecords.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const deleteTakeout = (id: string) => setF({ ...f, takeoutRecords: f.takeoutRecords.filter((t) => t.id !== id) });

  // 拍照/相册 → 存为缩略图（持久）→ AI 识别自动填名称和每 100g 营养（默认份量 = 识别出的克数）
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const blob = await shrinkTo(file, 600);
      const ref = await putImageBlob(blob);
      setF((prev) => ({ ...prev, thumbRef: ref }));
      const api = getDietStore().api;
      if (!(api.baseUrl && api.apiKey && api.model)) {
        addToast('图片已存为缩略图；配好饮食 API 后可以拍照识别', 'info');
        return;
      }
      setBusy(true);
      try {
        const r = await recognizeFoodImage(await blobToDataUrl(blob), api);
        if (r.name) {
          const per100 = toPer100(r, r.grams);
          setF((prev) => ({ ...prev, name: r.name, kcal: per100.kcal, protein: per100.protein, carbs: per100.carbs, fat: per100.fat, defaultGrams: r.grams }));
          addToast('识别完成，确认后保存', 'success');
        } else {
          addToast('没解析出数值，请手动填写', 'info');
        }
      } catch (err) {
        addToast(`识别失败：${err instanceof Error ? err.message : '网络错误'}`, 'error');
      } finally {
        setBusy(false);
      }
    } catch {
      addToast('图片保存失败', 'error');
    }
  };

  const save = () => {
    if (!f.name.trim()) { addToast('填一下食物名', 'info'); return; }
    upsertFood({
      id: food?.id,
      name: f.name.trim(),
      kcal: Math.max(0, f.kcal),
      protein: Math.max(0, f.protein),
      carbs: Math.max(0, f.carbs),
      fat: Math.max(0, f.fat),
      unit: f.unit || 'g',
      defaultGrams: Math.max(1, f.defaultGrams),
      price: f.price || undefined,
      platform: f.platform || undefined,
      thumbRef: f.thumbRef,
      rating: f.rating > 0 ? f.rating : undefined,
      glycemic: f.glycemic.trim() ? Number(f.glycemic) : undefined,
      isHomeCooked: f.isHomeCooked,
      isTakeout: f.isTakeout,
      cookMethods: f.cookMethods.filter((m) => m.description.trim()),
      takeoutRecords: f.takeoutRecords.filter((t) => t.shop.trim()),
    });
    addToast('已保存', 'success');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 120, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 16, gap: 12, maxHeight: 'calc(100dvh - 120px)', overflowY: 'auto' }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 15, fontWeight: 700, color: '#3a2a33' }}>{food ? food.name : '添加食物'}</span>
          <button type="button" onClick={onClose} aria-label="关闭" className="border-0 cursor-pointer rounded-full p-2" style={{ background: GREEN_SOFT }}>
            <X style={{ width: 15, height: 15, color: GREEN_DEEP }} />
          </button>
        </div>
        <div className="flex items-center" style={{ gap: 12 }}>
          <Thumb blobRef={f.thumbRef} size={64} />
          <div className="flex flex-col" style={{ gap: 6 }}>
            <div style={{ fontSize: 11, color: '#8aa397' }}>拍照识别会自动填好名称和每 100g 营养，图片存为缩略图（一直保存）</div>
            <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => camRef.current?.click()} className="border-0 cursor-pointer rounded-full" style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', background: GREEN_SOFT, color: GREEN_DEEP }}>
                📷 拍照识别
              </button>
              <button type="button" onClick={() => albRef.current?.click()} className="border-0 cursor-pointer rounded-full" style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', background: GREEN_SOFT, color: GREEN_DEEP }}>
                🖼 从相册识别
              </button>
              {f.thumbRef && (
                <button
                  type="button"
                  onClick={() => { deleteBlobRef(f.thumbRef); setF({ ...f, thumbRef: undefined }); }}
                  className="border-0 cursor-pointer rounded-full"
                  style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', background: '#f6f1f4', color: '#8a6a7a' }}
                >
                  移除图片
                </button>
              )}
            </div>
            {busy && <span style={{ fontSize: 10, color: '#8aa397' }}>识别中…</span>}
          </div>
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
          <input ref={albRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        </div>
        {food && <div style={{ fontSize: 11, color: '#8aa397' }}>吃过 {food.eatenCount} 次{food.lastEatenAt ? ` · 上次吃 ${food.lastEatenAt.slice(5, 10).replace('-', '月')}日` : ''} · 每 100g 营养（记饮食时按份量自动换算）</div>}
        <div><div style={labelCss}>名称</div><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={inputCss} /></div>
        <div className="flex" style={{ gap: 8 }}>
          <div className="flex-1"><div style={labelCss}>热量 千卡/100g</div><input type="number" value={f.kcal} onChange={(e) => setF({ ...f, kcal: Number(e.target.value) || 0 })} style={inputCss} /></div>
          <div className="flex-1"><div style={labelCss}>默认份量 g</div><input type="number" value={f.defaultGrams} onChange={(e) => setF({ ...f, defaultGrams: Number(e.target.value) || 0 })} style={inputCss} /></div>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          <div className="flex-1"><div style={labelCss}>蛋白 g</div><input type="number" value={f.protein} onChange={(e) => setF({ ...f, protein: Number(e.target.value) || 0 })} style={inputCss} /></div>
          <div className="flex-1"><div style={labelCss}>碳水 g</div><input type="number" value={f.carbs} onChange={(e) => setF({ ...f, carbs: Number(e.target.value) || 0 })} style={inputCss} /></div>
          <div className="flex-1"><div style={labelCss}>脂肪 g</div><input type="number" value={f.fat} onChange={(e) => setF({ ...f, fat: Number(e.target.value) || 0 })} style={inputCss} /></div>
        </div>
        {/* 评分 + 升糖 */}
        <div className="flex items-center justify-between rounded-xl" style={{ padding: '8px 10px', background: '#f7fcf9', border: '1px solid #e4f0e9' }}>
          <div>
            <div style={labelCss}>评分</div>
            <StarRow value={f.rating} onChange={(v) => setF({ ...f, rating: v })} />
          </div>
          <div style={{ width: 116 }}>
            <div style={labelCss}>升糖值 mmol/L（可选）</div>
            <input type="number" step="0.1" value={f.glycemic} onChange={(e) => setF({ ...f, glycemic: e.target.value })} placeholder="如 2.3" style={inputCss} />
          </div>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          <div className="flex-1"><div style={labelCss}>价格（可选）</div><input value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="如 ¥12" style={inputCss} /></div>
          <div className="flex-1"><div style={labelCss}>购买平台（可选）</div><input value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })} placeholder="如 食堂 / 外卖" style={inputCss} /></div>
        </div>

        {/* 家常：勾选后才出现做法输入 */}
        <div className="rounded-xl" style={{ padding: '8px 10px', background: '#f7fcf9', border: '1px solid #e4f0e9' }}>
          <label className="flex items-center justify-between" style={{ cursor: 'pointer' }}>
            <span className="flex items-center" style={{ gap: 6 }}>
              <input type="checkbox" checked={f.isHomeCooked} onChange={(e) => setF({ ...f, isHomeCooked: e.target.checked })} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#3a4a40' }}>家常（有做法）</span>
              {!f.isHomeCooked && <span style={{ fontSize: 10, color: '#8aa397' }}>不勾选就不显示做法输入</span>}
            </span>
            {f.isHomeCooked && (
              <button
                type="button"
                onClick={() => setF({ ...f, cookMethods: [...f.cookMethods, { id: uidLocal(), description: '', rating: 0, review: '' }] })}
                className="border-0 cursor-pointer rounded-full"
                style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', background: GREEN_SOFT, color: GREEN_DEEP }}
              >
                + 做法
              </button>
            )}
          </label>
        </div>
        {f.isHomeCooked && f.cookMethods.map((m, idx) => (
          <div key={m.id} className="flex flex-col rounded-xl" style={{ gap: 6, padding: 8, background: '#f7fcf9', border: '1px solid #e4f0e9' }}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 11, fontWeight: 700, color: '#5c846e' }}>做法 {idx + 1}</span>
              <div className="flex items-center" style={{ gap: 6 }}>
                <StarRow value={m.rating ?? 0} size={13} onChange={(v) => patchMethod(m.id, { rating: v })} />
                <button type="button" onClick={() => deleteMethod(m.id)} aria-label="删除这个做法" className="border-0 cursor-pointer p-0.5" style={{ background: 'transparent' }}>
                  <X style={{ width: 13, height: 13, color: '#c9b4c0' }} />
                </button>
              </div>
            </div>
            <input value={m.description} onChange={(e) => patchMethod(m.id, { description: e.target.value })} placeholder="具体做法，如 麻辣烫：先炒底料…" style={inputCss} />
            <input value={m.review ?? ''} onChange={(e) => patchMethod(m.id, { review: e.target.value })} placeholder="评价，如 适合多放辣椒油" style={inputCss} />
          </div>
        ))}

        {/* 外卖：勾选后才出现购买记录输入 */}
        <div className="rounded-xl" style={{ padding: '8px 10px', background: '#f7fcf9', border: '1px solid #e4f0e9' }}>
          <label className="flex items-center justify-between" style={{ cursor: 'pointer' }}>
            <span className="flex items-center" style={{ gap: 6 }}>
              <input type="checkbox" checked={f.isTakeout} onChange={(e) => setF({ ...f, isTakeout: e.target.checked })} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#3a4a40' }}>外卖（有购买记录）</span>
              {!f.isTakeout && <span style={{ fontSize: 10, color: '#8aa397' }}>不勾选就不显示外卖输入</span>}
            </span>
            {f.isTakeout && (
              <button
                type="button"
                onClick={() => setF({ ...f, takeoutRecords: [...f.takeoutRecords, { id: uidLocal(), shop: '', price: '', rating: 0, eatenTimes: undefined, review: '' }] })}
                className="border-0 cursor-pointer rounded-full"
                style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', background: GREEN_SOFT, color: GREEN_DEEP }}
              >
                + 购买记录
              </button>
            )}
          </label>
        </div>
        {f.isTakeout && f.takeoutRecords.map((t, idx) => (
          <div key={t.id} className="flex flex-col rounded-xl" style={{ gap: 6, padding: 8, background: '#f7fcf9', border: '1px solid #e4f0e9' }}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 11, fontWeight: 700, color: '#5c846e' }}>购买记录 {idx + 1}</span>
              <div className="flex items-center" style={{ gap: 6 }}>
                <StarRow value={t.rating ?? 0} size={13} onChange={(v) => patchTakeout(t.id, { rating: v })} />
                <button type="button" onClick={() => deleteTakeout(t.id)} aria-label="删除这条记录" className="border-0 cursor-pointer p-0.5" style={{ background: 'transparent' }}>
                  <X style={{ width: 13, height: 13, color: '#c9b4c0' }} />
                </button>
              </div>
            </div>
            <input value={t.shop} onChange={(e) => patchTakeout(t.id, { shop: e.target.value })} placeholder="哪家买的，如 杨国福麻辣烫" style={inputCss} />
            <div className="flex" style={{ gap: 8 }}>
              <div className="flex-1"><input value={t.price ?? ''} onChange={(e) => patchTakeout(t.id, { price: e.target.value })} placeholder="价格，如 ¥12" style={inputCss} /></div>
              <div className="flex-1"><input type="number" value={t.eatenTimes ?? ''} onChange={(e) => patchTakeout(t.id, { eatenTimes: Number(e.target.value) || 0 })} placeholder="吃过几次" style={inputCss} /></div>
            </div>
            <input value={t.review ?? ''} onChange={(e) => patchTakeout(t.id, { review: e.target.value })} placeholder="评价，如 很好吃 / 有蟑螂" style={inputCss} />
          </div>
        ))}

        <button type="button" onClick={save} className="border-0 cursor-pointer rounded-full" style={{ padding: '11px 0', fontSize: 14, fontWeight: 700, color: '#fff', background: GREEN }}>
          保存
        </button>
        <button
          type="button"
          onClick={() => setForwardOpen(true)}
          className="border-0 cursor-pointer rounded-full flex items-center justify-center"
          style={{ padding: '10px 0', fontSize: 12, fontWeight: 600, color: '#5c846e', background: '#f1f9f5', gap: 6 }}
        >
          <PaperPlaneTilt style={{ width: 13, height: 13 }} /> 转发给角色（单张详情卡）
        </button>
        {food && (
          <button
            type="button"
            onClick={() => setConfirmDel(true)}
            className="border-0 cursor-pointer rounded-full flex items-center justify-center"
            style={{ padding: '10px 0', fontSize: 12, fontWeight: 600, color: '#c26b6b', background: '#fdf1f1', gap: 6 }}
          >
            <Trash style={{ width: 13, height: 13 }} /> 删除这个食物
          </button>
        )}
        <ConfirmDialog
          isOpen={confirmDel}
          title="删除食物"
          message={`确定把「${food?.name ?? ''}」从食物库删掉吗？已记录过的饮食不受影响。`}
          confirmText="删除"
          variant="danger"
          onConfirm={() => { if (food) deleteFood(food.id); onClose(); }}
          onCancel={() => setConfirmDel(false)}
        />
        {forwardOpen && (
          <ForwardPicker
            onClose={() => setForwardOpen(false)}
            onPick={async (c) => {
              try {
                await forwardFoodDetail(c, {
                  name: f.name.trim(),
                  kcal: Math.max(0, f.kcal), protein: Math.max(0, f.protein), carbs: Math.max(0, f.carbs), fat: Math.max(0, f.fat),
                  rating: f.rating > 0 ? f.rating : undefined,
                  glycemic: f.glycemic.trim() ? Number(f.glycemic) : undefined,
                  isHomeCooked: f.isHomeCooked, isTakeout: f.isTakeout,
                  cookMethods: f.cookMethods.filter((m) => m.description.trim()),
                  takeoutRecords: f.takeoutRecords.filter((t) => t.shop.trim()),
                  price: f.price || undefined, platform: f.platform || undefined,
                  eatenCount: food?.eatenCount ?? 0, lastEatenAt: food?.lastEatenAt,
                });
              } catch {
                // 转发失败静默关掉
              }
              setForwardOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
};

// ── 食物库页 ──

type SortKey = 'count' | 'kcal' | 'glycemic';

/** 上次吃 → 8月23日；没有则 — */
const fmtLastEaten = (iso?: string): string => {
  if (!iso) return '—';
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${Number(m[1])}月${Number(m[2])}日`;
  return iso.slice(0, 10);
};

const CoupleFoodLibrary: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const store = useDietStore();
  const [editing, setEditing] = useState<FoodLibItem | 'new' | null>(null);
  const [view, setView] = useState<'home' | 'fridge'>('home');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('count');
  const [forwardOpen, setForwardOpen] = useState(false);

  const foods = useMemo(() => {
    let list = store.foods.filter((f) => !search.trim() || f.name.includes(search.trim()));
    list = list.slice().sort((a, b) => {
      if (sort === 'kcal') return b.kcal - a.kcal;
      if (sort === 'glycemic') return (b.glycemic ?? -1) - (a.glycemic ?? -1);
      return b.eatenCount - a.eatenCount;
    });
    return list;
  }, [store.foods, search, sort]);

  // 食物库概况（转发整卡：与挂载给角色的全量概况同形状）
  const libraryText = () => {
    const sorted = store.foods.slice().sort((a, b) => b.eatenCount - a.eatenCount);
    const lines = [`食物库（共 ${sorted.length} 种，按吃过次数）：`];
    for (const f of sorted) {
      const bits = [
        `吃过 ${f.eatenCount} 次`,
        `最近一次 ${fmtLastEaten(f.lastEatenAt)}`,
        f.isHomeCooked ? '家常' : '',
        f.isTakeout ? '外卖' : '',
        f.rating ? `${f.rating}星` : '',
      ].filter(Boolean);
      lines.push(`${f.name}（每100g ${f.kcal} 千卡）：${bits.join('，')}`);
    }
    return lines.join('\n');
  };

  if (view === 'fridge') {
    return <CoupleFridge onBack={() => setView('home')} />;
  }

  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto" style={{ background: '#eef8f2', paddingTop: 'calc(var(--chrome-top, 0px) + 14px)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 96px)' }}>
      <div className="flex items-center px-5" style={{ gap: 10 }}>
        <button type="button" onClick={onBack} aria-label="返回" className="border-0 cursor-pointer rounded-full flex items-center justify-center" style={{ width: 34, height: 34, background: '#fff' }}>
          <ArrowLeft style={{ width: 16, height: 16, color: '#3a2a33' }} />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: '#3a2a33' }}>食物库</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setForwardOpen(true)}
          disabled={store.foods.length === 0}
          aria-label="转发食物库概况"
          className="border-0 cursor-pointer rounded-full p-1.5 flex items-center gap-1"
          style={{ background: '#fff', opacity: store.foods.length === 0 ? 0.55 : 1 }}
        >
          <PaperPlaneTilt style={{ width: 13, height: 13, color: '#8a5a6e' }} />
          <span style={{ fontSize: 10, color: '#8a5a6e' }}>转发</span>
        </button>
        <span className="rounded-full" style={{ fontSize: 10, fontWeight: 600, color: GREEN_DEEP, background: GREEN_SOFT, padding: '3px 10px' }}>{store.foods.length} 种</span>
      </div>
      {/* 搜索 + 排序 */}
      <div className="flex items-center px-5" style={{ gap: 8, marginTop: 10 }}>
        <div className="flex items-center flex-1 rounded-full" style={{ gap: 6, padding: '7px 12px', background: '#fff', boxShadow: '0 4px 14px rgba(90,160,120,0.08)' }}>
          <MagnifyingGlass style={{ width: 13, height: 13, color: '#8aa397', flexShrink: 0 }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索食物" className="flex-1 border-0" style={{ fontSize: 12, color: '#3a2a33', background: 'transparent', outline: 'none' }} />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-full border-0" style={{ fontSize: 11, fontWeight: 600, color: GREEN_DEEP, background: '#fff', padding: '8px 10px', boxShadow: '0 4px 14px rgba(90,160,120,0.08)', outline: 'none' }}>
          <option value="count">按吃过次数</option>
          <option value="kcal">按热量</option>
          <option value="glycemic">按升糖值</option>
        </select>
      </div>
      <div style={{ fontSize: 11, color: '#8aa397', padding: '8px 24px 4px', lineHeight: 1.6 }}>
        记过的东西都在这里。吃过次数从记录里算：删掉那次记录，次数会回落。缩略图在食物详情里上传。
      </div>
      <div className="flex flex-col px-5" style={{ gap: 10, marginTop: 8 }}>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="flex items-center justify-center border-0 cursor-pointer rounded-3xl"
          style={{ gap: 6, padding: 14, background: '#fff', border: '1.5px dashed #bfe0cd', fontSize: 13, fontWeight: 600, color: GREEN_DEEP }}
        >
          <Plus style={{ width: 14, height: 14 }} /> 添加食物
        </button>
        {/* 冰箱：独立页（食材小卡片 + 购买记录） */}
        <button
          type="button"
          onClick={() => setView('fridge')}
          className="flex items-center border-0 cursor-pointer rounded-3xl"
          style={{ gap: 12, padding: 12, background: '#fff', boxShadow: '0 8px 24px rgba(90,160,120,0.10)', textAlign: 'left' }}
        >
          <span className="flex items-center justify-center shrink-0" style={{ width: 46, height: 46, borderRadius: 12, background: '#e6f4fb', fontSize: 20 }}>🧊</span>
          <span className="flex-1 min-w-0">
            <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#3a2a33' }}>冰箱</span>
            <span style={{ display: 'block', fontSize: 10, color: '#8aa397', marginTop: 2 }}>
              {store.fridge.length
                ? `${store.fridge.length} 种食材 · 购买记录攒够 10 条可 AI 总结`
                : '记录冰箱里的食材和购买记录，推荐下一餐可以参考'}
            </span>
          </span>
          <CaretRight style={{ width: 14, height: 14, color: '#b0c5b9', flexShrink: 0 }} />
        </button>
        {foods.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setEditing(f)}
            className="flex items-center border-0 cursor-pointer rounded-3xl"
            style={{ gap: 12, padding: 12, background: '#fff', boxShadow: '0 8px 24px rgba(90,160,120,0.10)', textAlign: 'left' }}
          >
            <Thumb blobRef={f.thumbRef} />
            <span className="flex-1 min-w-0">
              <span className="flex items-center" style={{ gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#3a2a33' }}>{f.name}</span>
                {f.isHomeCooked && <span className="rounded-full" style={{ fontSize: 9, fontWeight: 600, padding: '1px 7px', background: '#eef7f1', color: '#3e8f68' }}>家常</span>}
                {f.isTakeout && <span className="rounded-full" style={{ fontSize: 9, fontWeight: 600, padding: '1px 7px', background: '#fdf3e7', color: '#c98a3e' }}>外卖</span>}
              </span>
              <span style={{ display: 'block', fontSize: 10, color: '#8aa397', marginTop: 2 }}>
                上次吃 {fmtLastEaten(f.lastEatenAt)} · 吃过 {f.eatenCount} 次 · 每100g {f.kcal} 千卡
              </span>
            </span>
            <span className="flex flex-col items-end shrink-0" style={{ gap: 3 }}>
              <StarRow value={f.rating ?? 0} size={11} onChange={() => {}} />
              <CaretRight style={{ width: 14, height: 14, color: '#b0c5b9' }} />
            </span>
          </button>
        ))}
        {foods.length === 0 && (
          <div className="rounded-3xl p-6 flex flex-col items-center" style={{ background: '#fff', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#8aa397', lineHeight: 1.7, textAlign: 'center' }}>
              {store.foods.length === 0 ? (
                <>
                  食物库还是空的。
                  <br />
                  记饮食时手动加的食物会自动进库，也可以点上面的「添加食物」自己建。
                </>
              ) : (
                '没有匹配「' + search + '」的食物，换个词试试。'
              )}
            </span>
          </div>
        )}
      </div>
      {editing && <FoodFormModal food={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {forwardOpen && (
        <ForwardPicker
          onClose={() => setForwardOpen(false)}
          onPick={async (c) => {
            try {
              await forwardCoupleCard(c, { kind: '饮食·食物库', title: '食物库概况', body: libraryText() });
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

export default CoupleFoodLibrary;

// 冰箱独立页（2026-08-23 二改）——不再是食物库里的同级卡片，而是单独一页
// 食材小卡片表面：目前余量 + 上次购入时间；点开详情：余量编辑 + 购买记录列表（在哪买的/什么时候/季节/多少钱/品质）
// 购买记录攒够 10 条可以调 AI 总结（用饮食 API + 注册表提示词「冰箱总结」），看涨跌、看谁家货好
import React, { useState } from 'react';
import { ArrowLeft, CaretRight, PaperPlaneTilt, Plus, Sparkle, SpinnerGap, Trash, X } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { getLocalDateKey } from '../../utils/localDate';
import { getPrompt } from '../../utils/promptRegistry';
import ConfirmDialog from '../../components/os/ConfirmDialog';
import {
  addFridgeItem, addFridgePurchase, deleteFridgeItem, deleteFridgePurchase, fridgePurchaseTotal,
  getDietStore, updateFridgeItem, useDietStore, type FridgeItem,
} from './dietStore';
import { ForwardPicker } from './CouplePeriod';
import { forwardCoupleCard } from './coupleForward';
import { dietBgStore, dietBgStoreApi, setFridgeSummary } from './dietBgStore';
import GenStatusPill from './GenStatusPill';
import { isBgTaskStale, startBgTaskForResult } from '../../utils/bgTask';

const GREEN = '#7ac79c';
const GREEN_DEEP = '#3e8f68';
const GREEN_SOFT = '#e9f7f0';
const inputCss: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 13, color: '#3a2a33', border: '1px solid #d7eee2', borderRadius: 12, padding: '8px 10px', background: '#f7fcf9', outline: 'none' };
const labelCss: React.CSSProperties = { fontSize: 11, color: '#7a9487', marginBottom: 4 };

/** 上次购入时间 → 8月23日；没有则 — */
const fmtLastBuy = (item: FridgeItem): string => {
  const last = item.purchases[0];
  if (!last) return '—';
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(last.date);
  return m ? `${Number(m[1])}月${Number(m[2])}日` : last.date;
};

/** 冰箱全部信息文本（AI 总结 / 转发共用） */
const fridgeFullText = (): string => {
  const s = getDietStore();
  const lines: string[] = [];
  for (const f of s.fridge) {
    const buys = f.purchases.map(
      (p) => `${p.date}${p.season ? `（${p.season}）` : ''} ${p.place ?? '未记地点'} ${p.price ?? '未记价格'} 品质${p.quality ?? '未记'}`,
    );
    lines.push(`- ${f.name}：余量 ${f.amount ?? '未记'}${buys.length ? `；购买记录：${buys.join('；')}` : '；还没有购买记录'}`);
  }
  return lines.join('\n');
};

const SEASONS = ['春', '夏', '秋', '冬'] as const;

// ── 食材详情弹卡（余量 + 购买记录列表 + 添加购买记录） ──

const FridgeDetailModal: React.FC<{ item: FridgeItem; onClose: () => void }> = ({ item, onClose }) => {
  const { addToast } = useOS();
  const [amount, setAmount] = useState(item.amount ?? '');
  const [purchase, setPurchase] = useState({ date: getLocalDateKey(), season: '', place: '', price: '', quality: '', note: '' });
  const [confirmDel, setConfirmDel] = useState(false);

  const saveAmount = () => {
    updateFridgeItem(item.id, { amount });
    addToast('余量已更新', 'success');
  };

  const addPurchase = () => {
    if (!purchase.place.trim() && !purchase.price.trim()) { addToast('至少填购入地点或价格', 'info'); return; }
    addFridgePurchase(item.id, {
      date: purchase.date || getLocalDateKey(),
      season: purchase.season,
      place: purchase.place,
      price: purchase.price,
      quality: purchase.quality,
      note: purchase.note,
    });
    setPurchase({ date: getLocalDateKey(), season: '', place: '', price: '', quality: '', note: '' });
    addToast('购买记录已添加', 'success');
  };

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 120, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 16, gap: 12, maxHeight: 'calc(100dvh - 120px)', overflowY: 'auto' }}>
        <div className="flex items-center justify-between">
          <span className="flex items-center" style={{ gap: 6, fontSize: 15, fontWeight: 700, color: '#3a2a33' }}>
            🧊 {item.name}
          </span>
          <button type="button" onClick={onClose} aria-label="关闭" className="border-0 cursor-pointer rounded-full p-2" style={{ background: '#eef7f1' }}>
            <X style={{ width: 15, height: 15, color: GREEN_DEEP }} />
          </button>
        </div>
        {/* 余量 */}
        <div className="flex items-center" style={{ gap: 8 }}>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="目前余量，如 2个 / 半盒" style={inputCss} />
          <button
            type="button" onClick={saveAmount}
            className="border-0 cursor-pointer rounded-full shrink-0"
            style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, color: '#fff', background: GREEN }}
          >
            保存
          </button>
        </div>
        {/* 购买记录列表 */}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#5c846e' }}>购买记录（看涨跌、看谁家货好）</div>
        <div className="flex flex-col" style={{ gap: 6 }}>
          {item.purchases.map((p) => (
            <div key={p.id} className="flex items-start rounded-xl" style={{ gap: 8, padding: '8px 10px', background: '#f7fcf9', border: '1px solid #e4f0e9' }}>
              <span className="flex-1 min-w-0">
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#3a4a40' }}>
                  {p.date}{p.season ? ` · ${p.season}` : ''}{p.place ? ` · ${p.place}` : ''}
                </span>
                <span style={{ display: 'block', fontSize: 10, color: '#8aa397', marginTop: 2 }}>
                  {[p.price && `${p.price}`, p.quality && `品质：${p.quality}`, p.note].filter(Boolean).join(' · ') || '—'}
                </span>
              </span>
              <button type="button" onClick={() => deleteFridgePurchase(item.id, p.id)} aria-label="删除这条记录" className="border-0 cursor-pointer p-1 shrink-0" style={{ background: 'transparent' }}>
                <Trash style={{ width: 13, height: 13, color: '#c9b4c0' }} />
              </button>
            </div>
          ))}
          {item.purchases.length === 0 && <span style={{ fontSize: 11, color: '#8aa397', padding: 4 }}>还没有购买记录，在下面记一条。</span>}
        </div>
        {/* 添加购买记录 */}
        <div className="rounded-xl p-2.5 flex flex-col" style={{ gap: 6, background: '#f7fcf9', border: '1px solid #d7eee2' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#5c846e' }}>+ 记一条购买</div>
          <div className="flex" style={{ gap: 8 }}>
            <div className="flex-1"><div style={labelCss}>购入日期</div><input type="date" value={purchase.date} max={getLocalDateKey()} onChange={(e) => setPurchase({ ...purchase, date: e.target.value })} style={inputCss} /></div>
            <div style={{ width: 88 }}>
              <div style={labelCss}>季节</div>
              <select value={purchase.season} onChange={(e) => setPurchase({ ...purchase, season: e.target.value })} style={{ ...inputCss, padding: '8px 6px' }}>
                <option value="">—</option>
                {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex" style={{ gap: 8 }}>
            <div className="flex-1"><div style={labelCss}>在哪买的</div><input value={purchase.place} onChange={(e) => setPurchase({ ...purchase, place: e.target.value })} placeholder="如 杨家菜市" style={inputCss} /></div>
            <div className="flex-1"><div style={labelCss}>价格（任意单位）</div><input value={purchase.price} onChange={(e) => setPurchase({ ...purchase, price: e.target.value })} placeholder="如 2元/斤" style={inputCss} /></div>
          </div>
          <div className="flex" style={{ gap: 8 }}>
            <div className="flex-1"><div style={labelCss}>品质</div><input value={purchase.quality} onChange={(e) => setPurchase({ ...purchase, quality: e.target.value })} placeholder="如 很好 / 一般 / 很差" style={inputCss} /></div>
            <div className="flex-1"><div style={labelCss}>备注（可选）</div><input value={purchase.note} onChange={(e) => setPurchase({ ...purchase, note: e.target.value })} placeholder="如 砍到 1.8" style={inputCss} /></div>
          </div>
          <button type="button" onClick={addPurchase} className="border-0 cursor-pointer rounded-full" style={{ padding: '9px 0', fontSize: 12, fontWeight: 700, color: '#fff', background: GREEN }}>
            添加购买记录
          </button>
        </div>
        <button
          type="button"
          onClick={() => setConfirmDel(true)}
          className="border-0 cursor-pointer rounded-full flex items-center justify-center"
          style={{ padding: '10px 0', fontSize: 12, fontWeight: 600, color: '#c26b6b', background: '#fdf1f1', gap: 6 }}
        >
          <Trash style={{ width: 13, height: 13 }} /> 把「{item.name}」拿出冰箱
        </button>
        <ConfirmDialog
          isOpen={confirmDel}
          title="拿出冰箱"
          message={`确定把「${item.name}」从冰箱删掉吗？购买记录也会一起删掉。`}
          confirmText="删除"
          variant="danger"
          onConfirm={() => { deleteFridgeItem(item.id); onClose(); }}
          onCancel={() => setConfirmDel(false)}
        />
      </div>
    </div>
  );
};

// ── AI 总结弹卡 ──

const FridgeSummaryModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { addToast } = useOS();
  const bg = dietBgStore.use();
  const api = getDietStore().api;
  const hasApi = !!(api.baseUrl && api.apiKey && api.model);

  const pending = bg.pendingFridgeSummary;
  const running = !!pending && pending.status === 'running' && !isBgTaskStale(pending);
  const interrupted = !!pending && (pending.status === 'failed' || isBgTaskStale(pending));
  const result = bg.fridgeSummary?.text ?? '';

  // 后台跑：生成中可离页，回来照常显示「生成中」；完成落 store，页面重载过则判中断给重试
  const generate = () => {
    if (!hasApi) { addToast('先在「推荐下一餐」卡片里配置饮食 API', 'info'); return; }
    void startBgTaskForResult(dietBgStoreApi, 'pendingFridgeSummary', 'fridge', async () => {
      const res = await fetch(`${api.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.apiKey}` },
        body: JSON.stringify({ model: api.model, messages: [{ role: 'user', content: `${getPrompt('冰箱总结')}\n\n${fridgeFullText()}` }], max_tokens: 4096 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const text = typeof json?.choices?.[0]?.message?.content === 'string' ? json.choices[0].message.content : '';
      setFridgeSummary(text || '没有收到回复');
      return text;
    }).then(({ started }) => { if (!started) addToast('上一次总结还在生成中', 'info'); });
  };

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 120, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 16, gap: 12, maxHeight: 'calc(100dvh - 120px)', overflowY: 'auto' }}>
        <div className="flex items-center justify-between">
          <span className="flex items-center" style={{ gap: 6, fontSize: 15, fontWeight: 700, color: '#3a2a33' }}>
            <Sparkle style={{ width: 16, height: 16, color: GREEN_DEEP }} /> 购买记录总结
          </span>
          <button type="button" onClick={onClose} aria-label="关闭" className="border-0 cursor-pointer rounded-full p-2" style={{ background: '#eef7f1' }}>
            <X style={{ width: 15, height: 15, color: GREEN_DEEP }} />
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#8aa397', lineHeight: 1.6 }}>AI 会把所有购买记录读一遍：哪些涨价降价、哪家品质好、什么时候买什么划算。生成中可以离开这页，回来接着看。</div>
        {interrupted && (
          <div className="rounded-xl" style={{ background: '#fdf6f0', border: '1px solid #f0ddc9', padding: '8px 10px', fontSize: 11, color: '#a07850', lineHeight: 1.6 }}>
            {pending?.status === 'failed' ? `上次总结失败：${pending.error ?? '未知原因'}` : '上次总结中断了（页面刷新过）'}，点下面重新开始。
          </div>
        )}
        {running && <GenStatusPill text="正在总结购买记录…" />}
        {!result && (
          <button
            type="button" onClick={generate} disabled={running}
            className="border-0 cursor-pointer rounded-full flex items-center justify-center"
            style={{ padding: '10px 0', fontSize: 13, fontWeight: 700, color: '#fff', background: running ? '#b9d8c6' : GREEN, gap: 6 }}
          >
            {running ? <SpinnerGap className="animate-spin" style={{ width: 14, height: 14 }} /> : null}
            {running ? '总结中…（可离开此页）' : interrupted ? '重新总结' : '开始总结'}
          </button>
        )}
        {result && (
          <>
            <div className="rounded-2xl" style={{ background: '#f7fcf9', border: '1px solid #e4f0e9', padding: 12, fontSize: 12, color: '#3a4a40', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 260, overflowY: 'auto' }}>
              {result}
            </div>
            <button
              type="button" onClick={generate} disabled={running}
              className="border-0 cursor-pointer rounded-full"
              style={{ padding: '9px 0', fontSize: 12, fontWeight: 600, color: GREEN_DEEP, background: GREEN_SOFT }}
            >
              {running ? '总结中…（可离开此页）' : '再总结一次'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ── 冰箱页 ──

const CoupleFridge: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const store = useDietStore();
  const { addToast } = useOS();
  const [addOpen, setAddOpen] = useState(false);
  const [detail, setDetail] = useState<FridgeItem | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', amount: '' });
  const purchaseTotal = fridgePurchaseTotal();
  // detail 里改数据后，用 store 里的最新版（detail 只存 id，从 store 取）
  const detailItem = detail ? store.fridge.find((f) => f.id === detail.id) ?? null : null;

  const addItem = () => {
    if (!newItem.name.trim()) { addToast('填一下食材名', 'info'); return; }
    addFridgeItem({ name: newItem.name, amount: newItem.amount || undefined });
    setNewItem({ name: '', amount: '' });
    setAddOpen(false);
    addToast('放进冰箱了', 'success');
  };

  const forwardText = () => `冰箱（${store.fridge.length} 种食材）\n${fridgeFullText()}`;

  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto" style={{ background: '#eef8f2', paddingTop: 'calc(var(--chrome-top, 0px) + 14px)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 96px)' }}>
      <div className="flex items-center px-5" style={{ gap: 10 }}>
        <button type="button" onClick={onBack} aria-label="返回" className="border-0 cursor-pointer rounded-full flex items-center justify-center" style={{ width: 34, height: 34, background: '#fff' }}>
          <ArrowLeft style={{ width: 16, height: 16, color: '#3a2a33' }} />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: '#3a2a33' }}>冰箱</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => {
            if (store.fridge.length === 0) { addToast('冰箱还是空的', 'info'); return; }
            setForwardOpen(true);
          }}
          aria-label="转发冰箱"
          className="border-0 cursor-pointer rounded-full p-1.5 flex items-center gap-1"
          style={{ background: '#fff' }}
        >
          <PaperPlaneTilt style={{ width: 13, height: 13, color: '#8a5a6e' }} />
          <span style={{ fontSize: 10, color: '#8a5a6e' }}>转发</span>
        </button>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="border-0 cursor-pointer rounded-full flex items-center"
          style={{ gap: 3, padding: '5px 10px', fontSize: 11, fontWeight: 700, color: '#fff', background: GREEN }}
        >
          <Plus style={{ width: 12, height: 12 }} /> 食材
        </button>
      </div>

      {/* AI 总结卡：攒够 10 条可调用 */}
      <div className="mx-5 rounded-3xl flex items-center" style={{ gap: 10, padding: 12, background: '#fff', boxShadow: '0 8px 24px rgba(90,160,120,0.10)', marginTop: 12 }}>
        <span className="flex items-center justify-center shrink-0" style={{ width: 40, height: 40, borderRadius: 12, background: '#eef7f1', fontSize: 18 }}>📊</span>
        <span className="flex-1 min-w-0">
          <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#3a2a33' }}>购买记录 {purchaseTotal} 条</span>
          <span style={{ display: 'block', fontSize: 10, color: '#8aa397', marginTop: 2 }}>
            {purchaseTotal >= 10 ? '攒够 10 条了，让 AI 看看涨跌和谁家货好' : `再记 ${10 - purchaseTotal} 条，AI 可以帮你总结`}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setSummaryOpen(true)}
          disabled={purchaseTotal < 10}
          className="border-0 cursor-pointer rounded-full shrink-0"
          style={{ padding: '7px 12px', fontSize: 11, fontWeight: 700, color: '#fff', background: purchaseTotal >= 10 ? GREEN : '#c9dcd1', opacity: purchaseTotal >= 10 ? 1 : 0.7 }}
        >
          AI 总结
        </button>
      </div>

      {/* 食材小卡片（2 列网格）：表面 = 余量 + 上次购入时间 */}
      <div className="grid px-5" style={{ gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
        {store.fridge.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setDetail(f)}
            className="flex flex-col border-0 cursor-pointer rounded-3xl"
            style={{ gap: 6, padding: 14, background: '#fff', boxShadow: '0 8px 24px rgba(90,160,120,0.10)', textAlign: 'left', minHeight: 96 }}
          >
            <span style={{ fontSize: 18 }}>🧊</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#3a2a33' }}>{f.name}</span>
            <span style={{ fontSize: 10, color: '#8aa397', lineHeight: 1.5 }}>
              余量 {f.amount ?? '未记'}
              <br />
              上次购入 {fmtLastBuy(f)}
            </span>
          </button>
        ))}
      </div>
      {store.fridge.length === 0 && (
        <div className="mx-5 rounded-3xl p-6 flex flex-col items-center" style={{ background: '#fff', gap: 6, marginTop: 12 }}>
          <span style={{ fontSize: 11, color: '#8aa397', lineHeight: 1.7, textAlign: 'center' }}>
            冰箱还是空的。点右上角「+ 食材」把冰箱里的东西记下来——推荐下一餐可以勾选参考它们。
          </span>
        </div>
      )}

      {/* 添加食材 */}
      {addOpen && (
        <div
          className="fixed inset-0 flex items-end justify-center"
          style={{ zIndex: 120, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setAddOpen(false); }}
        >
          <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 16, gap: 12 }}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 15, fontWeight: 700, color: '#3a2a33' }}>添加食材</span>
              <button type="button" onClick={() => setAddOpen(false)} aria-label="关闭" className="border-0 cursor-pointer rounded-full p-2" style={{ background: '#eef7f1' }}>
                <X style={{ width: 15, height: 15, color: GREEN_DEEP }} />
              </button>
            </div>
            <div><div style={labelCss}>食材名</div><input value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="如 鸡蛋 / 辣椒" style={inputCss} /></div>
            <div><div style={labelCss}>目前余量（可选）</div><input value={newItem.amount} onChange={(e) => setNewItem({ ...newItem, amount: e.target.value })} placeholder="如 2个 / 半盒" style={inputCss} /></div>
            <button type="button" onClick={addItem} className="border-0 cursor-pointer rounded-full" style={{ padding: '11px 0', fontSize: 14, fontWeight: 700, color: '#fff', background: GREEN }}>
              放进冰箱
            </button>
          </div>
        </div>
      )}

      {detailItem && <FridgeDetailModal item={detailItem} onClose={() => setDetail(null)} />}
      {summaryOpen && <FridgeSummaryModal onClose={() => setSummaryOpen(false)} />}
      {forwardOpen && (
        <ForwardPicker
          onClose={() => setForwardOpen(false)}
          onPick={async (c) => {
            try {
              await forwardCoupleCard(c, { kind: '饮食·冰箱', title: '冰箱', body: forwardText() });
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

export default CoupleFridge;

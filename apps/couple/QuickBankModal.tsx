// 快捷记账弹卡（2026-08-23）——快捷记录点「记账」弹出，不跳 BankApp
// 数据写 Sully 银行：DB.saveTransaction + todaySpent 同步；同时写活动记录；派发 couple-bank-changed 让组合卡实时刷新
import React, { useState } from 'react';
import { X } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { DB } from '../../utils/db';
import type { BankTransaction } from '../../types';
import { getLocalDateKey } from '../../utils/localDate';
import { addActivity } from './activityStore';

const CATEGORIES = ['餐饮', '交通', '购物', '日用', '娱乐', '其他'];

const QuickBankModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { addToast } = useOS();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('餐饮');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setSaving(true);
    try {
      const today = getLocalDateKey();
      const tx: BankTransaction = {
        id: `tx-${Date.now()}`,
        amount: Math.round(amt * 100) / 100,
        category,
        note: note.trim(),
        timestamp: Date.now(),
        dateStr: today,
      };
      await DB.saveTransaction(tx);
      // todaySpent 同步（BankApp 打开时会读最新 state，这里顺手加上，避免旧值覆盖）
      try {
        const bankState = await DB.getBankState();
        if (bankState) {
          await DB.saveBankState({ ...bankState, todaySpent: (bankState.todaySpent ?? 0) + tx.amount });
        }
      } catch {
        // 银行状态更新失败不阻塞记账本身
      }
      addActivity({
        kind: 'bank',
        date: today,
        text: `记了笔账 ¥${tx.amount.toFixed(2)}（${category}）${tx.note ? `：${tx.note}` : ''}`,
        owner: 'together',
      });
      window.dispatchEvent(new Event('couple-bank-changed'));
      addToast('已记入存钱罐', 'success');
      onClose();
    } catch {
      addToast('保存失败，请重试', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 120, background: 'rgba(58,32,50,0.35)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 92px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col" style={{ width: 'min(100%, 560px)', background: '#fff', borderRadius: 24, padding: 16, gap: 12 }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 15, fontWeight: 700, color: '#3a2a33' }}>记账</span>
          <button type="button" onClick={onClose} aria-label="关闭" className="border-0 cursor-pointer rounded-full p-2" style={{ background: 'var(--cs-soft, #fce8f1)' }}>
            <X style={{ width: 15, height: 15, color: '#8a5a6e' }} />
          </button>
        </div>
        {/* 金额 */}
        <div className="flex items-end" style={{ gap: 8 }}>
          <span style={{ fontSize: 24, fontWeight: 700, color: '#3a2a33', paddingBottom: 10 }}>¥</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            inputMode="decimal"
            autoFocus
            placeholder="0.00"
            style={{ flex: 1, fontSize: 30, fontWeight: 700, color: '#3a2a33', border: 'none', outline: 'none', background: 'transparent' }}
          />
        </div>
        {/* 分类 */}
        <div className="flex flex-wrap" style={{ gap: 8 }}>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className="border-0 cursor-pointer rounded-full"
              style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', background: category === c ? 'var(--cs-accent, #f0a8c0)' : '#f6f1f4', color: category === c ? '#fff' : '#6a5a63' }}
            >
              {c}
            </button>
          ))}
        </div>
        {/* 备注 */}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="备注（可选）"
          style={{ fontSize: 13, color: '#3a2a33', border: '1px solid #e8d5de', borderRadius: 14, padding: '10px 12px', background: '#fdf8fa', outline: 'none' }}
        />
        <div style={{ fontSize: 10, color: '#b0909c' }}>记到存钱罐里，当天支出会同步到下面的记账卡和活动时间轴。</div>
        <button
          type="button"
          onClick={save}
          disabled={!amount || saving}
          className="border-0 cursor-pointer rounded-full"
          style={{ padding: '11px 0', fontSize: 14, fontWeight: 700, color: '#fff', background: amount && !saving ? 'var(--cs-accent, #f0a8c0)' : '#e8dce2' }}
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  );
};

export default QuickBankModal;

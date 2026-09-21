// 提示词管理（2026-08-22，全透明 prompt 第一次尝试）——设置里分类折叠，统一可视化编辑
// 数据源：utils/promptRegistry（默认值 + noxhome_prompts_v1 用户覆盖）；以后所有 AI 提示词都往注册表里加，这里自动出现
import React, { useState } from 'react';
import { CaretDown, CheckCircle } from '@phosphor-icons/react';
import { getPromptEntries, getPrompt, resetPrompt, savePrompt, isPromptOverridden, type PromptEntry } from '../../utils/promptRegistry';

const Item: React.FC<{ entry: PromptEntry }> = ({ entry }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(getPrompt(entry.label));
  const [saved, setSaved] = useState(false);
  const overridden = isPromptOverridden(entry.label);

  const flash = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 cursor-pointer border-0 bg-transparent text-left"
      >
        <CaretDown size={14} className="text-slate-400 shrink-0" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-700">{entry.label}</span>
            {overridden && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: '#fdeef0', color: '#e35d6a' }}>已改过</span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">{entry.description}</div>
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            // 手机上键盘一起来就把光标那行顶到能看见的地方（她 09-21 报的输入框被挡）
            onFocus={(e) => {
              const el = e.currentTarget;
              window.setTimeout(() => el.scrollIntoView({ block: 'center' }), 300);
            }}
            rows={7}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 text-[11px] leading-relaxed text-slate-700 resize-y outline-none focus:border-pink-300"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { savePrompt(entry.label, text); flash(); }}
              className="px-3 py-1.5 rounded-full text-[11px] font-semibold text-white cursor-pointer border-0"
              style={{ background: saved ? '#6cae7e' : '#f0a8c0', transition: 'background 0.3s' }}
            >
              {saved ? '已保存 ✓' : '保存'}
            </button>
            <button
              type="button"
              onClick={() => { resetPrompt(entry.label); setText(entry.defaultValue); flash(); }}
              disabled={!overridden && text === entry.defaultValue}
              className="px-3 py-1.5 rounded-full text-[11px] font-medium text-slate-500 cursor-pointer border-0 bg-slate-100 disabled:opacity-40"
            >
              恢复默认
            </button>
            {saved && <CheckCircle size={14} className="text-[#6cae7e]" />}
          </div>
        </div>
      )}
    </div>
  );
};

const PromptSettings: React.FC = () => {
  const entries = getPromptEntries();
  // 「美化助手」分类挪去小助手 App 自己的设置页（2026-08-30 她定：不放在 noxhome）
  const categories = [...new Set(entries.map((e) => e.category))].filter((c) => c !== '美化助手');
  return (
    <div className="space-y-3">
      {categories.map((cat) => (
        <div key={cat} className="rounded-2xl border border-slate-200/70 bg-white/60 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">{cat} · 提示词</span>
            <span className="text-[9px] text-slate-400">改了立刻生效 · 不用重载</span>
          </div>
          {entries.filter((e) => e.category === cat).map((e) => (
            <Item key={e.label} entry={e} />
          ))}
        </div>
      ))}
    </div>
  );
};

export default PromptSettings;

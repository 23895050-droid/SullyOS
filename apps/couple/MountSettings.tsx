// 挂载到角色（2026-08-23）——noxhome 数据（当日经期/纪念日/日常）以世界书条目形式挂载到选中角色的聊天上下文
// 对照原版世界书机制逐项可调：开关 / 注入位置 0-6 / 关键词触发 / 辅助关键词 / 概率 / 扫描条数 / 深度与角色
// 透明化：每条当前会生成的内容直接可视化预览 + 关键词命中测试（不烧 token，纯函数本地算）
// 数据更新即同步：条目在每次上下文构建时现读现生成，store 一改下一轮聊天就是新的
import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { CaretDown, Eye, Lightning } from '@phosphor-icons/react';
import type { CharacterProfile, MountedWorldbook } from '../../types';
import { DB } from '../../utils/db';
import {
  expandWorldbookMacros,
  isWorldbookEntryActive,
  splitWorldbookKeywords,
  WORLDBOOK_POSITION_LABELS,
  WORLDBOOK_ROLE_LABELS,
} from '../../utils/worldbook';
import {
  MOUNT_BLOCK_IDS,
  MOUNT_BLOCK_LABELS,
  buildBlockEntry,
  getMountConfig,
  setMountBlock,
  setMountCharId,
  subscribeMountConfig,
  type MountBlockConfig,
  type MountBlockId,
} from '../../utils/noxhomeMount';
import { usePeriodStore } from './periodStore';
import { useTodoStore } from './todoStore';
import { useAnnivStore } from './annivStore';
import { useDietStore } from './dietStore';
import { useDiaryStore } from './diaryStore';
import { useTogetherStore } from './togetherStore';
import { useMusicStore } from './musicStore';

const SELECTIVE_LOGIC_LABELS: Record<number, string> = {
  0: '任一命中',
  1: '并非全部命中',
  2: '全部未命中',
  3: '全部命中',
};

const BLOCK_DESCS: Record<MountBlockId, string> = {
  period: '当天周期阶段 + 经期/PMDD/性生活记录 + 吃药提醒 + 下次预测',
  anniv: '今天的纪念日 + 最近三个倒计时',
  daily: '今日待办清单（固定每日 + 今天到期的短期，含完成情况）',
  dietToday: '今天记下的全部饮食（按餐次、克数、热量、小计）',
  dietLibrary: '食物库概况：每种吃过几次 / 最近一次吃 / 家常 / 外卖 / 评分',
  dietFridge: '冰箱全部信息：余量 + 每次购买的时间/地点/价格/品质',
  diary: '今天两人写没写日记；Nox 写了带全文（她的内容不进——他只能通过她转发的批阅卡片读到）',
  promises: '约好还没做的事（谁提议/地点/时限）；提到「约好了/你答应我的」时触发，只挂未完成的',
  music: '我的歌单概况 + 最近常听 + 首条印象 + 一起听会话；歌单里的歌名直接是触发词（提到就命中）',
};

// ── 小组件 ──

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label?: string }> = ({ on, onChange, label }) => (
  <button
    type="button"
    onClick={() => onChange(!on)}
    aria-label={label}
    className="relative rounded-full border-0 cursor-pointer shrink-0 transition-colors"
    style={{ width: 36, height: 21, background: on ? 'var(--cs-accent, #f0a8c0)' : '#e8dde2' }}
  >
    <span
      className="absolute rounded-full bg-white transition-all"
      style={{ width: 15, height: 15, top: 3, left: on ? 18 : 3, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
    />
  </button>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-2 py-1.5">
    <span style={{ fontSize: 11, color: '#9a7a8a' }}>{label}</span>
    <div className="flex items-center gap-1.5 shrink-0">{children}</div>
  </div>
);

const inputStyle: React.CSSProperties = {
  width: 64, background: '#faf7f8', border: '1px solid #f2d3e0', borderRadius: 8,
  padding: '4px 8px', fontSize: 11, color: '#3a2a33', outline: 'none', textAlign: 'center',
};

const selectStyle: React.CSSProperties = {
  background: '#faf7f8', border: '1px solid #f2d3e0', borderRadius: 8,
  padding: '4px 6px', fontSize: 11, color: '#3a2a33', outline: 'none', maxWidth: 150,
};

const textareaStyle: React.CSSProperties = {
  width: '100%', background: '#faf7f8', border: '1px solid #f2d3e0', borderRadius: 8,
  padding: '6px 8px', fontSize: 11, color: '#3a2a33', outline: 'none', resize: 'vertical', minHeight: 34,
};

// ── 单块卡片 ──

const BlockCard: React.FC<{
  id: MountBlockId;
  block: MountBlockConfig;
  preview: { entry: MountedWorldbook | null; expanded: string };
}> = ({ id, block, preview }) => {
  const [open, setOpen] = useState(false);
  const [testText, setTestText] = useState('');
  const [hit, setHit] = useState<boolean | null>(null);

  const runTest = () => {
    if (!preview.entry) return;
    setHit(isWorldbookEntryActive(preview.entry, [{ role: 'user', content: testText }]));
  };

  return (
    <div className="rounded-2xl p-3.5 flex flex-col gap-2" style={{ background: '#fff', boxShadow: '0 6px 18px rgba(233,160,190,0.14)' }}>
      {/* 头行：开关 + 标题 + 描述 */}
      <div className="flex items-center gap-2">
        <Toggle on={block.enabled} onChange={(v) => setMountBlock(id, { enabled: v })} label={`${MOUNT_BLOCK_LABELS[id]}开关`} />
        <span style={{ fontSize: 14, fontWeight: 600, color: '#3a2a33' }}>{MOUNT_BLOCK_LABELS[id]}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="border-0 bg-transparent cursor-pointer p-1"
          aria-label="展开设置"
          style={{ color: '#b0909c' }}
        >
          <CaretDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      </div>
      <div style={{ fontSize: 11, color: '#9a7a8a', paddingLeft: 2 }}>{BLOCK_DESCS[id]}</div>

      {/* 预览：当前会生成的内容（透明化核心） */}
      <div className="rounded-xl p-2.5" style={{ background: block.enabled ? '#fdf6f9' : '#f7f4f5', border: '1px solid #f2dde6' }}>
        <div className="flex items-center gap-1 mb-1">
          <Eye size={11} style={{ color: '#c090a6' }} />
          <span style={{ fontSize: 10, fontWeight: 600, color: '#b0909c', letterSpacing: '0.05em' }}>
            {block.enabled ? '当前会注入的内容' : '预览（未开启，不会注入）'}
          </span>
        </div>
        <div className="whitespace-pre-wrap" style={{ fontSize: 11, lineHeight: 1.6, color: '#5c4650' }}>
          {preview.expanded || '（今天没有相关数据，不会注入）'}
        </div>
      </div>

      {/* 命中测试：把要发的话贴进来，纯函数本地判断（不烧 token） */}
      {!block.constant && (
        <div className="flex items-center gap-1.5">
          <Lightning size={12} style={{ color: '#c090a6', flexShrink: 0 }} />
          <input
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder="测试：把聊天里可能出现的话贴进来"
            style={{ ...textareaStyle, minHeight: 0, flex: 1, padding: '5px 8px' }}
          />
          <button
            type="button"
            onClick={runTest}
            className="border-0 cursor-pointer rounded-full shrink-0"
            style={{ background: 'var(--cs-soft, #fce8f1)', color: 'var(--cs-deep, #c25a82)', fontSize: 11, padding: '4px 10px', fontWeight: 600 }}
          >
            测
          </button>
          {hit !== null && (
            <span className="shrink-0 rounded-full px-2 py-0.5" style={{ fontSize: 10, fontWeight: 700, background: hit ? '#e5f5ec' : '#f5ecec', color: hit ? '#4f9e6d' : '#c26b6b' }}>
              {hit ? '命中 ✓' : '未命中'}
            </span>
          )}
        </div>
      )}
      {block.constant && <div style={{ fontSize: 10, color: '#b0909c' }}>⚡ 常量条目：每轮都注入，不需要关键词</div>}

      {/* 展开的世界书参数 */}
      {open && (
        <div className="flex flex-col rounded-xl p-2.5" style={{ background: '#fdf9fb', border: '1px solid #f2dde6' }}>
          <Row label="注入位置">
            <select
              value={block.position}
              onChange={(e) => setMountBlock(id, { position: Number(e.target.value) as MountBlockConfig['position'] })}
              style={selectStyle}
            >
              {Object.entries(WORLDBOOK_POSITION_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </Row>
          <Row label="触发方式">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMountBlock(id, { constant: false })}
                className="border-0 cursor-pointer rounded-full"
                style={{ fontSize: 10, padding: '3px 9px', fontWeight: 600, background: !block.constant ? 'var(--cs-accent, #f0a8c0)' : '#f0e6ea', color: !block.constant ? '#fff' : '#9a7a8a' }}
              >
                关键词触发
              </button>
              <button
                type="button"
                onClick={() => setMountBlock(id, { constant: true })}
                className="border-0 cursor-pointer rounded-full"
                style={{ fontSize: 10, padding: '3px 9px', fontWeight: 600, background: block.constant ? 'var(--cs-accent, #f0a8c0)' : '#f0e6ea', color: block.constant ? '#fff' : '#9a7a8a' }}
              >
                常量注入
              </button>
            </div>
          </Row>
          {!block.constant && (
            <>
              <Row label="主关键词（逗号分隔）">
                <textarea
                  value={block.key.join(', ')}
                  onChange={(e) => setMountBlock(id, { key: splitWorldbookKeywords(e.target.value) })}
                  rows={2}
                  style={textareaStyle}
                />
              </Row>
              <Row label="辅助关键词（逗号分隔）">
                <textarea
                  value={block.keysecondary.join(', ')}
                  onChange={(e) => setMountBlock(id, { keysecondary: splitWorldbookKeywords(e.target.value), selective: true })}
                  rows={2}
                  placeholder="留空 = 不用辅助关键词限制"
                  style={textareaStyle}
                />
              </Row>
              {block.keysecondary.length > 0 && (
                <Row label="辅助关键词逻辑">
                  <select
                    value={block.selectiveLogic}
                    onChange={(e) => setMountBlock(id, { selectiveLogic: Number(e.target.value) as MountBlockConfig['selectiveLogic'] })}
                    style={selectStyle}
                  >
                    {Object.entries(SELECTIVE_LOGIC_LABELS).map(([v, label]) => (
                      <option key={v} value={v}>{label}</option>
                    ))}
                  </select>
                </Row>
              )}
              <Row label="扫描最近 N 条消息">
                <input
                  type="number" min={1} max={99} step={1}
                  value={block.scanDepth}
                  onChange={(e) => setMountBlock(id, { scanDepth: Math.max(1, Math.min(99, Number(e.target.value) || 8)) })}
                  style={inputStyle}
                />
              </Row>
            </>
          )}
          <Row label="概率触发">
            <div className="flex items-center gap-1.5">
              <Toggle on={block.useProbability} onChange={(v) => setMountBlock(id, { useProbability: v })} label="概率开关" />
              {block.useProbability && (
                <input
                  type="number" min={0} max={100} step={5}
                  value={block.probability}
                  onChange={(e) => setMountBlock(id, { probability: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                  style={{ ...inputStyle, width: 48 }}
                />
              )}
              {block.useProbability && <span style={{ fontSize: 10, color: '#9a7a8a' }}>%</span>}
            </div>
          </Row>
          {block.position === 4 && (
            <>
              <Row label="插入深度（距最新消息 N 条）">
                <input
                  type="number" min={0} max={99} step={1}
                  value={block.depth}
                  onChange={(e) => setMountBlock(id, { depth: Math.max(0, Math.min(99, Number(e.target.value) || 0)) })}
                  style={inputStyle}
                />
              </Row>
              <Row label="插入角色">
                <select
                  value={block.role}
                  onChange={(e) => setMountBlock(id, { role: Number(e.target.value) as MountBlockConfig['role'] })}
                  style={selectStyle}
                >
                  {Object.entries(WORLDBOOK_ROLE_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
              </Row>
            </>
          )}
          <Row label="排序（order，越小越靠前）">
            <input
              type="number" min={0} max={999} step={1}
              value={block.order}
              onChange={(e) => setMountBlock(id, { order: Math.max(0, Math.min(999, Number(e.target.value) || 0)) })}
              style={inputStyle}
            />
          </Row>
        </div>
      )}
    </div>
  );
};

// ── 主组件 ──

const MountSettings: React.FC = () => {
  const mount = useSyncExternalStore(subscribeMountConfig, getMountConfig);
  const [chars, setChars] = useState<CharacterProfile[]>([]);
  const [userName, setUserName] = useState('用户');
  const periodStore = usePeriodStore();
  const todoStore = useTodoStore();
  const annivStore = useAnnivStore();
  const dietStore = useDietStore();
  const diaryStore = useDiaryStore();
  const togetherStore = useTogetherStore();
  const musicStore = useMusicStore();

  useEffect(() => {
    let alive = true;
    DB.getAllCharacters().then((list) => { if (alive) setChars(list); }).catch(() => {});
    DB.getUserProfile().then((u) => { if (alive && u?.name) setUserName(u.name); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const charName = chars.find((c) => c.id === mount.charId)?.name ?? '角色';

  const previews = useMemo(() => {
    const out: Partial<Record<MountBlockId, { entry: MountedWorldbook | null; expanded: string }>> = {};
    for (const id of MOUNT_BLOCK_IDS) {
      const entry = buildBlockEntry(id, { ignoreEnabled: true });
      out[id] = entry
        ? { entry, expanded: expandWorldbookMacros(entry.content, charName, userName) }
        : { entry: null, expanded: '' };
    }
    return out;
  }, [mount, periodStore, todoStore, annivStore, dietStore, diaryStore, togetherStore, musicStore, charName, userName]);

  return (
    <div className="flex flex-col gap-3">
      {/* 挂载角色选择 */}
      <div className="rounded-2xl p-4 flex flex-col gap-2" style={{ background: '#fff', boxShadow: '0 6px 18px rgba(233,160,190,0.14)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#3a2a33' }}>挂载到哪个角色</div>
        <div style={{ fontSize: 11, color: '#9a7a8a', lineHeight: 1.6 }}>
          世界书条目会跟随选中角色的每一次聊天：命中关键词（或常量注入）时按位置拼进上下文。数据每次现读现生成——情侣空间里改了，下一轮聊天就是新的。
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-1">
          {chars.map((c) => {
            const selected = mount.charId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setMountCharId(selected ? null : c.id)}
                className="rounded-full border-0 cursor-pointer transition-transform active:scale-95"
                style={{
                  fontSize: 12, fontWeight: 600, padding: '6px 14px',
                  background: selected ? '#383639' : 'var(--cs-soft, #fce8f1)',
                  color: selected ? '#fff' : 'var(--cs-deep, #c25a82)',
                }}
              >
                {selected ? `${c.name} ✓` : c.name}
              </button>
            );
          })}
          {chars.length === 0 && <span style={{ fontSize: 11, color: '#9a7a8a' }}>还没有角色，去捏一个再来挂载</span>}
        </div>
        {!mount.charId && <div style={{ fontSize: 10, color: '#b0909c' }}>未选择角色：下面每块都不会注入（开启开关也没用）</div>}
      </div>

      {/* 三块数据 */}
      {MOUNT_BLOCK_IDS.map((id) => (
        <BlockCard
          key={id}
          id={id}
          block={mount.blocks[id]}
          preview={previews[id] ?? { entry: null, expanded: '' }}
        />
      ))}
    </div>
  );
};

export default MountSettings;

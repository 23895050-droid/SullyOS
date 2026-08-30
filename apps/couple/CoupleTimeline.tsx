// 共享时间轴组件（2026-08-22，Angelica 需求）——月经页 / 活动页 / 日常页复用
// 结构：左侧完整垂直竖线 + 每条空心圆圈节点（白色底彩色描边），时间放在圆圈右边，内容卡片全在右侧与圆圈一一对齐
import React from 'react';

export interface TimelineItem {
  id: string;
  time: string;            // 节点时间（HH:mm 或「全天」等）
  color: string;           // 节点描边色
  body: React.ReactNode;   // 右侧卡片内容（与节点水平对齐）
}

const CoupleTimeline: React.FC<{ items: TimelineItem[]; empty?: string }> = ({ items, empty }) => {
  if (items.length === 0) {
    return (
      <div style={{ fontSize: 12, color: '#b0909c', lineHeight: 1.7, padding: '6px 2px' }}>
        {empty ?? '还没有记录。'}
      </div>
    );
  }
  return (
    <div className="relative flex flex-col">
      {/* 完整垂直时间竖线（压在节点后面，节点白底遮住线） */}
      <div className="absolute" style={{ left: 9, top: 20, bottom: 8, width: 2, background: '#f2d3e0' }} />
      {items.map((it, i) => (
        <div key={it.id} className="flex" style={{ gap: 12 }}>
          {/* 左列：空心圆圈节点 */}
          <div className="flex shrink-0" style={{ width: 20, justifyContent: 'center' }}>
            <span
              className="relative rounded-full shrink-0"
              style={{ width: 12, height: 12, background: '#fff', border: `3px solid ${it.color}`, marginTop: 14, boxSizing: 'border-box', zIndex: 1 }}
            />
          </div>
          {/* 右列：时间 + 卡片（与节点对齐） */}
          <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 6, paddingBottom: i < items.length - 1 ? 12 : 0 }}>
            <span style={{ fontSize: 11, color: '#b0909c', marginTop: 8 }}>{it.time}</span>
            {it.body}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CoupleTimeline;

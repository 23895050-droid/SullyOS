// 后台生成状态胶囊（2026-09-13）——样式对齐原版聊天「{char} 在给你写消息…」的 pending 气泡：
// 白底圆角气泡 + 转圈 + 一句状态文案。日记/留言板/冰箱总结等后台生成场景共用。
import React from 'react';

const GenStatusPill: React.FC<{ text: string; tone?: string }> = ({ text, tone = '#6a5a4a' }) => (
  <div className="flex justify-center animate-fade-in" style={{ marginTop: 12 }}>
    <span
      className="flex items-center"
      style={{ gap: 8, padding: '10px 18px', borderRadius: 18, background: '#fff', boxShadow: '0 4px 16px rgba(120,90,60,0.14)', fontSize: 12, fontWeight: 500, color: tone }}
    >
      <svg className="animate-spin" style={{ width: 13, height: 13 }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      {text}
    </span>
  </div>
);

export default GenStatusPill;

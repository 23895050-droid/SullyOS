// 聊歌回复的语音块解析（2026-08-30）——参考主聊天渲染语音消息：
// <语音>…</语音>（可带紧邻 <字幕> 块）整体是原子单元，渲染成语音条而不是漏出原始标签。
// 与 chatParser.chunkText 的 ATOM 保护一致：语音块不会被换行切碎，chunk 里要么整个块、要么没有。

export interface MusicVoiceSegment {
  type: 'voice';
  /** 口播原文（洗过演出标记后的轻量版） */
  text: string;
  /** 中文对照（<字幕> 块；前后紧邻位置都认） */
  subtitle?: string;
}

export interface MusicTextSegment {
  type: 'text';
  content: string;
}

export type MusicChatSegment = MusicVoiceSegment | MusicTextSegment;

// 语音块 + 紧邻字幕是一个原子单元（开闭标签容许空格 / 简繁互换）
const VOICE_BLOCK_RE =
  /(?:<字幕>([\s\S]*?)<\/字幕>\s*)?<[语語]音[^>]*>([\s\S]*?)<\/\s*[语語]音\s*>(?:\s*<字幕>([\s\S]*?)<\/字幕>)?/g;

// 演出标记不出现在语音条里（轻量版：<#秒#> 停顿、[cue] 鱼声情绪、常见英文语气词）
const cleanSpoken = (t: string): string =>
  t
    .replace(/<#\s*[\d.]+\s*#>/g, '')
    .replace(/\[[a-zA-Z][a-zA-Z0-9_ ,|]{0,40}\]/g, '')
    .replace(/\([a-zA-Z][a-zA-Z0-9 _'-]{0,20}\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** 把一段内容切成 语音段/文本段（文本段交给 chunkText 继续切气泡） */
export const splitMusicChatSegments = (text: string): MusicChatSegment[] => {
  const segs: MusicChatSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  VOICE_BLOCK_RE.lastIndex = 0;
  while ((m = VOICE_BLOCK_RE.exec(text)) !== null) {
    if (m.index > last) {
      const t = text.slice(last, m.index).trim();
      if (t) segs.push({ type: 'text', content: t });
    }
    const spoken = (m[2] || '').trim();
    const subtitle = (m[1] || m[3] || '').trim();
    if (spoken || subtitle) {
      segs.push({ type: 'voice', text: cleanSpoken(spoken), subtitle: subtitle || undefined });
    }
    last = VOICE_BLOCK_RE.lastIndex;
  }
  if (last < text.length) {
    const t = text.slice(last).trim();
    if (t) segs.push({ type: 'text', content: t });
  }
  return segs;
};

/** 这段文本是不是纯语音（整段就是一条语音，没有别的正文） */
export const isVoiceOnlySegment = (text: string): boolean => {
  const segs = splitMusicChatSegments(text);
  return segs.length === 1 && segs[0].type === 'voice';
};

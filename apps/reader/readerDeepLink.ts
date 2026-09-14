// 读书模块 · 跨 App 深链（2026-09-14）
//
// 单独一个小模块：别处（情侣空间三卡 / NoxHome 阅读页）只 import 这里，
// 不要把整个 ReaderApp 拖进它们的 chunk。用法照音乐线的 sully_music_open_player：
// 写一个 sessionStorage 标记 → openApp(AppID.Reading) → 书房挂载时消费并清掉。

export const READER_DEEPLINK_KEY = 'sully_reader_open';

/** 深链目标：某个 tab / 继续读上次那本 / 直接翻开某本书。 */
export type ReaderDeepLink = 'shelf' | 'notes' | 'library' | 'stats' | 'settings' | 'continue' | `book:${string}`;

export function openReaderAt(target: ReaderDeepLink): void {
    try { sessionStorage.setItem(READER_DEEPLINK_KEY, target); } catch { /* 无痕模式 */ }
}

/** 取一次并清掉（ReaderApp 挂载时调）。 */
export function consumeReaderDeepLink(): ReaderDeepLink | null {
    try {
        const v = sessionStorage.getItem(READER_DEEPLINK_KEY);
        if (v) sessionStorage.removeItem(READER_DEEPLINK_KEY);
        return (v as ReaderDeepLink) ?? null;
    } catch {
        return null;
    }
}

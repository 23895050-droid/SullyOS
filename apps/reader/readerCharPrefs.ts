// 读书模块 · **每个角色自己的读书设置**（2026-09-20）
//
// 她 09-20 钉死：共读「确认设置」里定下的东西**直接存到角色的个人设置**，
// 下次只要共读就启用，除非在确认设置页改了。所以这里一份设置管七件事：
// 读书开关 / 提示词预设 / 他自己的 api / 每次读几页 / 每次笔记上限 / 回复模式 / 笔色。
//
// 读书开关原来在 reader_prefs_v1.readingChars（一个数组）——那其实是「每个角色一个布尔」，
// 搬家到这里，一个角色一份设置放一个地方（下面有一次性迁移，老数据不会丢）。
//
// api 走主预设池（设置页那套）：这里存的是选中的那一组值，不另起炉灶。

import { useSyncExternalStore } from 'react';
import { createCoupleStore } from '../couple/coupleStoreBase';
import type { CoReadApiConfig } from './coreadStore';

export interface CharReadPrefs {
    /** 读书开关（书库页那个）。关着的角色不出现在共读邀请名单里 */
    readEnabled: boolean;
    /** 他自己的 api。不配就走大设置那条链（共读 → 单独读书 → 主 api） */
    api?: CoReadApiConfig;
    /** 用哪套提示词：'' = 默认套（不提角色扮演）；'rp' = 角色扮演套 */
    promptPreset: string;
    /** 每次读几页 [a, b]（默认 1-1，就是「读这一页」） */
    pages: [number, number];
    /** 一次最多留几条批注 */
    noteLimit: number;
    /** 回复模式：开了就不必手动 ⚡，他自己决定回不回、要不要往下读 */
    replyMode: boolean;
    /** 他的笔色（划线、段落色条用）。没设就退回 reader_prefs 里的默认 */
    penColor?: string;
}

export interface ReaderCharPrefsStore {
    version: number;
    updatedAt: string;
    /** charId → 他自己的设置 */
    chars: Record<string, CharReadPrefs>;
}

export const CHAR_PREF_DEFAULTS: CharReadPrefs = {
    readEnabled: false,
    promptPreset: '',
    pages: [1, 1],
    // 默认跟以前一样是一次最多 6 条（原来写死在 cleanMarks 里的上限），不悄悄改行为
    noteLimit: 6,
    replyMode: false,
};

const KEY = 'reader_char_prefs_v1';

function seedFromLegacy(): ReaderCharPrefsStore {
    const chars: Record<string, CharReadPrefs> = {};
    const put = (id: string, patch: Partial<CharReadPrefs>) => {
        if (typeof id !== 'string' || !id) return;
        chars[id] = { ...CHAR_PREF_DEFAULTS, ...(chars[id] ?? {}), ...patch };
    };
    try {
        // 老数据 ①：reader_prefs_v1.readingChars = 开着读书开关的角色 id 列表
        const raw = localStorage.getItem('reader_prefs_v1');
        const legacy = raw ? (JSON.parse(raw) as { readingChars?: string[] }) : null;
        for (const id of legacy?.readingChars ?? []) put(id, { readEnabled: true });

        // 老数据 ②：reader_coread_v1.charApis = 每个角色各自的共读模型槽。
        // 那是「这个角色自己的 api」，跟读书开关一样跟着角色走 → 一起搬过来。
        const raw2 = localStorage.getItem('reader_coread_v1');
        const coread = raw2 ? (JSON.parse(raw2) as { charApis?: Record<string, Partial<CharReadPrefs['api']>> }) : null;
        for (const [id, api] of Object.entries(coread?.charApis ?? {})) {
            if (api && (api.apiKey || api.baseUrl || api.model)) {
                put(id, { api: { baseUrl: api.baseUrl ?? '', apiKey: api.apiKey ?? '', model: api.model ?? '' } });
            }
        }
    } catch {
        // 老数据读不出来就算了，开关重开一次的成本很低
    }
    return { version: 1, updatedAt: new Date().toISOString(), chars };
}

const hadStored = typeof localStorage !== 'undefined' && !!localStorage.getItem(KEY);
const store = createCoupleStore<ReaderCharPrefsStore>(KEY, 1, seedFromLegacy());
if (!hadStored) store.set((s) => s);   // 首启把种下来的一份写进盘，后面就按它走

/** 这个角色的设置（没建过就返回一份默认的，不落盘）。 */
export const charPrefsOf = (s: ReaderCharPrefsStore, charId: string): CharReadPrefs =>
    ({ ...CHAR_PREF_DEFAULTS, ...(s.chars[charId] ?? {}) });

/** 非 React 代码读用（AI 管线、归档那些地方）。 */
export const getCharReadPrefs = (charId: string): CharReadPrefs => charPrefsOf(store.get(), charId);

/** 开了读书开关的角色 id（书库页只列这些；共读邀请名单也用它）。 */
export const readingCharIds = (s: ReaderCharPrefsStore = store.get()): string[] =>
    Object.keys(s.chars).filter((id) => s.chars[id]?.readEnabled);

export function setCharReadPrefs(charId: string, patch: Partial<CharReadPrefs>): void {
    store.set((s) => ({
        ...s,
        updatedAt: new Date().toISOString(),
        chars: { ...s.chars, [charId]: { ...charPrefsOf(s, charId), ...patch } },
    }));
}

/** 书库页那个开关（原来的 setReadingChar）。 */
export const setReadEnabled = (charId: string, on: boolean): void =>
    setCharReadPrefs(charId, { readEnabled: on });

/** 每次读几页：a-b 收进合法范围（至少 1 页，最多 30 页——她定的单次上限）。 */
export const clampPages = (a: number, b: number): [number, number] => {
    const lo = Math.max(1, Math.min(30, Math.round(a) || 1));
    const hi = Math.max(lo, Math.min(30, Math.round(b) || lo));
    return [lo, hi];
};

export const useReaderCharPrefs = (): ReaderCharPrefsStore => store.use();
export const getReaderCharPrefsStore = (): ReaderCharPrefsStore => store.get();

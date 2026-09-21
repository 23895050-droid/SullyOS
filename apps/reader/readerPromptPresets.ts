// 读书模块 · 提示词「套」（2026-09-21，T6）
//
// 她 09-21 给设置页定的第二条：提示词页要能「看现在用的是哪一套、每个提示词配置给了
// 哪几个角色、可加新预设、可为角色切预设」。
//
// 所以提示词从「两套写死的」变成**一套一张名字**：
//   · 内置两套（默认套 `''` / rp 套 `'rp'`）的正文还住在 utils/promptRegistry（老地方，没搬）——
//     老数据（noxhome_prompts_v1 里的改动）原样有效。
//   · 她自己新建的套，正文住这个 store（presetId → 提示词名 → 正文）。
//   · 角色用哪一套 = `reader_char_prefs_v1.promptPreset`（本来就是字符串字段，天然支持多套）。
//
// 取正文的统一入口是 `promptForPreset(preset, label)`：新套里没写这条就**回落默认套**，
// 不会出现「切了套之后某条提示词变空」——空提示词比旧提示词危险得多（模型会收到一段没有指令的话）。

import { createCoupleStore } from '../couple/coupleStoreBase';
import {
    getPrompt, getPromptEntries, isPromptOverridden, resetPrompt, savePrompt,
} from '../../utils/promptRegistry';

export interface PromptPreset {
    id: string;
    name: string;
}

export interface PromptPresetStore {
    version: number;
    updatedAt: string;
    /** 她自己新建的套（内置两套不在这里） */
    presets: PromptPreset[];
    /** presetId → 提示词名 → 正文 */
    values: Record<string, Record<string, string>>;
}

/** 内置两套（永远排在最前）。id 就是 promptRegistry 的 preset 参数 */
export const BUILTIN_PRESETS: ReadonlyArray<PromptPreset & { builtin: true }> = [
    { id: '', name: '默认套', builtin: true },
    { id: 'rp', name: 'rp 套', builtin: true },
];

const KEY = 'reader_prompt_presets_v1';
const store = createCoupleStore<PromptPresetStore>(KEY, 1, {
    version: 1, updatedAt: new Date().toISOString(), presets: [], values: {},
});

/** 这个模块管的那批提示词（读书分类） */
export const readerPromptLabels = (): string[] =>
    getPromptEntries().filter((e) => e.category === '读书').map((e) => e.label);

/** 全部套（内置两套 + 自己加的），顺序就是界面上胶囊的顺序 */
export const listPromptPresets = (s: PromptPresetStore = store.get()): Array<PromptPreset & { builtin?: boolean }> =>
    [...BUILTIN_PRESETS, ...s.presets];

export const isBuiltinPreset = (id: string): boolean => id === '' || id === 'rp';

export const presetNameOf = (id: string, s: PromptPresetStore = store.get()): string =>
    listPromptPresets(s).find((p) => p.id === id)?.name ?? id;

/** 取这个套里这条提示词的正文（这就是调用处唯一该用的入口） */
export function promptForPreset(preset: string, label: string): string {
    if (isBuiltinPreset(preset)) return getPrompt(label, preset);
    const own = store.get().values[preset]?.[label];
    return typeof own === 'string' && own.trim() ? own : getPrompt(label);
}

export const isPresetPromptOverridden = (preset: string, label: string): boolean =>
    isBuiltinPreset(preset) ? isPromptOverridden(label, preset) : typeof store.get().values[preset]?.[label] === 'string';

/** 这条提示词在这个套里被改过吗（用来显示「已改过」小标） */
export function savePresetPrompt(preset: string, label: string, text: string): void {
    if (isBuiltinPreset(preset)) {
        // 内置两套走 promptRegistry 的老路（改了立刻生效，不用重载）
        savePrompt(label, text, preset);
        return;
    }
    store.set((s) => ({
        ...s,
        updatedAt: new Date().toISOString(),
        values: { ...s.values, [preset]: { ...(s.values[preset] ?? {}), [label]: text } },
    }));
}

export function resetPresetPrompt(preset: string, label: string): void {
    if (isBuiltinPreset(preset)) {
        // 内置套的 rp 版本存在 `名▸rp` 上；默认套就是名字本身
        resetPrompt(preset ? `${label}▸${preset}` : label);
        return;
    }
    store.set((s) => {
        const own = { ...(s.values[preset] ?? {}) };
        delete own[label];
        return { ...s, updatedAt: new Date().toISOString(), values: { ...s.values, [preset]: own } };
    });
}

/** 新建一套：从 copyFrom 那套把**当前生效的正文**抄一份过来（她再逐条改，起点就是能跑的） */
export function addPromptPreset(name: string, copyFrom = ''): PromptPreset {
    const preset: PromptPreset = { id: `pp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.trim() || '新的一套' };
    const values: Record<string, string> = {};
    for (const label of readerPromptLabels()) values[label] = promptForPreset(copyFrom, label);
    store.set((s) => ({
        ...s,
        updatedAt: new Date().toISOString(),
        presets: [...s.presets, preset],
        values: { ...s.values, [preset.id]: values },
    }));
    return preset;
}

export function renamePromptPreset(id: string, name: string): void {
    if (isBuiltinPreset(id)) return;
    store.set((s) => ({
        ...s,
        updatedAt: new Date().toISOString(),
        presets: s.presets.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)),
    }));
}

/** 删一套（用它的人要由调用方改回默认套，见设置页） */
export function removePromptPreset(id: string): void {
    if (isBuiltinPreset(id)) return;
    store.set((s) => {
        const values = { ...s.values };
        delete values[id];
        return {
            ...s,
            updatedAt: new Date().toISOString(),
            presets: s.presets.filter((p) => p.id !== id),
            values,
        };
    });
}

/** 导入备份用：按 id 合并（带进来的套覆盖同 id 的） */
export function mergePromptPresetStore(src: Partial<PromptPresetStore> | null | undefined): void {
    if (!src || typeof src !== 'object') return;
    store.set((s) => {
        const byId = new Map(s.presets.map((p) => [p.id, p]));
        for (const p of src.presets ?? []) if (p && p.id && !byId.has(p.id)) byId.set(p.id, p);
        return {
            ...s,
            updatedAt: new Date().toISOString(),
            presets: [...byId.values()],
            values: { ...s.values, ...(src.values ?? {}) },
        };
    });
}

export const usePromptPresets = (): PromptPresetStore => store.use();
export const getPromptPresetStore = (): PromptPresetStore => store.get();

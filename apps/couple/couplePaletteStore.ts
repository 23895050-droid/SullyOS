// 情侣页调色台存储（2026-08-30）：couple_palette_v1——调色数据 + 命名预设（存当前配色/载入/删除）。
// 规范三件套：version + ISO 时间戳；owner 不适用（设备级 UI 皮肤）。
import { createCoupleStore, isoNow } from './coupleStoreBase';
import type { CouplePalette, CouplePalettePreset } from './couplePalette';

export interface CouplePaletteV1 {
  version: 1;
  updatedAt: string;
  palette?: CouplePalette;
  presets: CouplePalettePreset[];
}

const store = createCoupleStore<CouplePaletteV1>('couple_palette_v1', 1, {
  version: 1,
  updatedAt: '1970-01-01T00:00:00.000Z',
  presets: [],
});

export const useCouplePaletteStore = store.use;
export const getCouplePaletteStore = store.get;

export const setCouplePalette = (patch: CouplePalette) =>
  store.set((s) => ({ ...s, palette: { ...s.palette, ...patch }, updatedAt: isoNow() }));

export const resetCouplePalette = () =>
  store.set((s) => ({ ...s, palette: undefined, updatedAt: isoNow() }));

/** 当前调色存成命名预设（同名覆盖，上限 20 套） */
export const saveCouplePreset = (name: string): boolean => {
  const n = name.trim();
  const cur = store.get();
  if (!n || !cur.palette) return false;
  const preset: CouplePalettePreset = { name: n, palette: { ...cur.palette }, savedAt: isoNow() };
  store.set((s) => ({
    ...s,
    presets: [...s.presets.filter((p) => p.name !== n), preset].slice(-20),
    updatedAt: isoNow(),
  }));
  return true;
};

export const loadCouplePreset = (name: string) =>
  store.set((s) => {
    const preset = s.presets.find((p) => p.name === name);
    return preset ? { ...s, palette: { ...preset.palette }, updatedAt: isoNow() } : s;
  });

export const deleteCouplePreset = (name: string) =>
  store.set((s) => ({ ...s, presets: s.presets.filter((p) => p.name !== name), updatedAt: isoNow() }));

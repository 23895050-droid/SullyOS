import type { ImageGenerationSettings, ImageGenPreset } from '../types';

const STORAGE_KEY = 'os_image_gen_settings';

export const DEFAULT_IMAGE_GEN_SETTINGS: ImageGenerationSettings = {
  enabled: false,
  requestMode: 'direct',
  apiKey: '',
  baseUrl: '',
  model: '',
  size: 'auto',
  quality: 'auto',
  landscapeSize: '',
  selfieSize: '',
  presets: [],
  defaultPresetId: null,
  defaultSelfiePresetId: null,
  syncCameraToChat: true,
  promptGenApiKey: '',
  promptGenBaseUrl: '',
  promptGenModel: '',
};

export function loadImageGenSettings(): ImageGenerationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_IMAGE_GEN_SETTINGS, presets: [] };
    const parsed = JSON.parse(raw) as Partial<ImageGenerationSettings>;
    return {
      ...DEFAULT_IMAGE_GEN_SETTINGS,
      ...parsed,
      presets: Array.isArray(parsed.presets) ? parsed.presets : [],
    };
  } catch {
    return { ...DEFAULT_IMAGE_GEN_SETTINGS, presets: [] };
  }
}

export function saveImageGenSettings(settings: ImageGenerationSettings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* quota exceeded */ }
}

// ── Preset helpers ──

export function addImageGenPreset(name: string, prompt: string): ImageGenPreset[] {
  const settings = loadImageGenSettings();
  const preset: ImageGenPreset = { id: `${Date.now()}`, name: name.trim(), prompt: prompt.trim() };
  settings.presets.push(preset);
  saveImageGenSettings(settings);
  return settings.presets;
}

export function updateImageGenPreset(id: string, patch: Partial<Pick<ImageGenPreset, 'name' | 'prompt'>>): ImageGenPreset[] {
  const settings = loadImageGenSettings();
  settings.presets = settings.presets.map(p => p.id === id ? { ...p, ...patch } : p);
  saveImageGenSettings(settings);
  return settings.presets;
}

export function deleteImageGenPreset(id: string): ImageGenPreset[] {
  const settings = loadImageGenSettings();
  settings.presets = settings.presets.filter(p => p.id !== id);
  if (settings.defaultPresetId === id) settings.defaultPresetId = null;
  saveImageGenSettings(settings);
  return settings.presets;
}

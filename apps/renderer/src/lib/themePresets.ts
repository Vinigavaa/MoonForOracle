import { type EditorThemeConfig, normalizeThemeConfig } from "./editorTheme";

const SAVED_THEME_PRESETS_KEY = "gavadb:theme-presets";
const USER_DEFAULT_THEME_ID_KEY = "gavadb:user-default-theme-id";

export interface SavedThemePreset {
  id: string;
  name: string;
  theme: EditorThemeConfig;
  createdAt: string;
  updatedAt: string;
}

export interface ThemePresetStore {
  savedThemes: SavedThemePreset[];
  userDefaultThemeId: string | null;
}

export function loadThemePresetStore(): ThemePresetStore {
  const savedThemes = loadSavedThemePresets();
  const userDefaultThemeId = loadUserDefaultThemeId();
  const validDefaultId = userDefaultThemeId && savedThemes.some((theme) => theme.id === userDefaultThemeId)
    ? userDefaultThemeId
    : null;

  if (userDefaultThemeId && !validDefaultId) {
    clearUserDefaultThemeId();
  }

  return { savedThemes, userDefaultThemeId: validDefaultId };
}

export function loadSavedThemePresets(): SavedThemePreset[] {
  try {
    const raw = localStorage.getItem(SAVED_THEME_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedThemePreset[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry) => entry && typeof entry.id === "string" && typeof entry.name === "string" && entry.theme)
      .map((entry) => ({
        ...entry,
        theme: normalizeThemeConfig(entry.theme),
      }));
  } catch {
    return [];
  }
}

export function saveSavedThemePresets(savedThemes: SavedThemePreset[]): void {
  localStorage.setItem(SAVED_THEME_PRESETS_KEY, JSON.stringify(savedThemes));
}

export function loadUserDefaultThemeId(): string | null {
  try {
    return localStorage.getItem(USER_DEFAULT_THEME_ID_KEY);
  } catch {
    return null;
  }
}

export function saveUserDefaultThemeId(themeId: string | null): void {
  if (!themeId) {
    clearUserDefaultThemeId();
    return;
  }
  localStorage.setItem(USER_DEFAULT_THEME_ID_KEY, themeId);
}

export function clearUserDefaultThemeId(): void {
  localStorage.removeItem(USER_DEFAULT_THEME_ID_KEY);
}

export function createThemePresetId(): string {
  return `theme-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

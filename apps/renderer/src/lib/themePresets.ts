import { type EditorThemeConfig, normalizeThemeConfig } from "./editorTheme";
import type { ThemeListResponse } from "@gavadb/types";

const LEGACY_SAVED_THEMES_KEY = "gavadb:theme-presets";
const LEGACY_DEFAULT_THEME_ID_KEY = "gavadb:user-default-theme-id";

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
  folderPath: string;
}

interface LegacySavedThemePreset {
  id: string;
  name: string;
  theme: Partial<EditorThemeConfig>;
  createdAt: string;
  updatedAt: string;
}

function toStore(data: ThemeListResponse): ThemePresetStore {
  return {
    savedThemes: data.themes.map((entry) => ({
      id: entry.fileName,
      name: entry.name,
      theme: normalizeThemeConfig(entry.theme as Partial<EditorThemeConfig>),
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    })),
    userDefaultThemeId: data.defaultThemeFileName,
    folderPath: data.folderPath,
  };
}

function loadLegacyPresets(): LegacySavedThemePreset[] {
  try {
    const raw = localStorage.getItem(LEGACY_SAVED_THEMES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LegacySavedThemePreset[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && typeof entry.id === "string" && typeof entry.name === "string" && entry.theme);
  } catch {
    return [];
  }
}

/** One-time migration: copies presets that used to live in localStorage into
 * the on-disk themes folder, then clears the legacy keys. Only runs when the
 * themes folder is still empty, so it never duplicates or overwrites disk
 * themes a user already created. */
async function migrateLegacyLocalStorageThemesIfNeeded(): Promise<void> {
  const legacyPresets = loadLegacyPresets();
  if (legacyPresets.length === 0) return;

  const legacyDefaultId = localStorage.getItem(LEGACY_DEFAULT_THEME_ID_KEY);
  let newDefaultFileName: string | null = null;

  for (const preset of legacyPresets) {
    const result = await window.gavadb.themeCreate({ name: preset.name, theme: preset.theme as unknown as Record<string, unknown> });
    if (result.success && legacyDefaultId === preset.id) {
      const created = result.data.themes.find((entry) => entry.name === preset.name);
      newDefaultFileName = created?.fileName ?? newDefaultFileName;
    }
  }

  if (newDefaultFileName) {
    await window.gavadb.themeSetDefault({ fileName: newDefaultFileName });
  }

  localStorage.removeItem(LEGACY_SAVED_THEMES_KEY);
  localStorage.removeItem(LEGACY_DEFAULT_THEME_ID_KEY);
}

export async function loadThemePresetStore(): Promise<ThemePresetStore> {
  const initial = await window.gavadb.themeList();
  if (!initial.success) return { savedThemes: [], userDefaultThemeId: null, folderPath: "" };

  if (initial.data.themes.length === 0) {
    await migrateLegacyLocalStorageThemesIfNeeded();
    const afterMigration = await window.gavadb.themeList();
    if (afterMigration.success) return toStore(afterMigration.data);
  }

  return toStore(initial.data);
}

export async function createThemePreset(name: string, theme: EditorThemeConfig): Promise<ThemePresetStore | null> {
  const result = await window.gavadb.themeCreate({ name, theme: theme as unknown as Record<string, unknown> });
  return result.success ? toStore(result.data) : null;
}

export async function renameThemePreset(fileName: string, newName: string): Promise<ThemePresetStore | null> {
  const result = await window.gavadb.themeRename({ fileName, newName });
  return result.success ? toStore(result.data) : null;
}

export async function deleteThemePreset(fileName: string): Promise<ThemePresetStore | null> {
  const result = await window.gavadb.themeDelete({ fileName });
  return result.success ? toStore(result.data) : null;
}

export async function duplicateThemePreset(fileName: string, name?: string): Promise<ThemePresetStore | null> {
  const result = await window.gavadb.themeDuplicate({ fileName, name });
  return result.success ? toStore(result.data) : null;
}

export async function setDefaultThemePreset(fileName: string | null): Promise<ThemePresetStore | null> {
  const result = await window.gavadb.themeSetDefault({ fileName });
  return result.success ? toStore(result.data) : null;
}

export async function openThemesFolder(): Promise<boolean> {
  const result = await window.gavadb.themeOpenFolder();
  return result.success;
}

export async function importThemeFile(): Promise<ThemePresetStore | null> {
  const result = await window.gavadb.themeImportFile();
  return result.success && result.data ? toStore(result.data) : null;
}

export async function exportThemeFile(fileName: string): Promise<string | null> {
  const result = await window.gavadb.themeExportFile({ fileName });
  return result.success ? result.data : null;
}

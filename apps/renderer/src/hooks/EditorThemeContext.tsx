import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import {
  type EditorThemeConfig,
  DEFAULT_THEME,
  applyThemeToDocument,
  areThemesEqual,
  loadTheme,
  normalizeThemeConfig,
  saveTheme,
  resetTheme as resetThemeStorage,
} from "../lib/editorTheme";
import {
  createThemePresetId,
  loadThemePresetStore,
  saveSavedThemePresets,
  saveUserDefaultThemeId,
  type SavedThemePreset,
} from "../lib/themePresets";

interface EditorThemeContextValue {
  theme: EditorThemeConfig;
  appDefaultTheme: EditorThemeConfig;
  savedThemes: SavedThemePreset[];
  userDefaultThemeId: string | null;
  activeSavedThemeId: string | null;
  updateTheme: (patch: Partial<EditorThemeConfig>) => void;
  resetTheme: () => void;
  saveCurrentThemeAsPreset: (name: string) => SavedThemePreset | null;
  applySavedTheme: (id: string) => boolean;
  renameSavedTheme: (id: string, name: string) => boolean;
  deleteSavedTheme: (id: string) => boolean;
  duplicateSavedTheme: (id: string, name?: string) => SavedThemePreset | null;
  setUserDefaultTheme: (id: string | null) => boolean;
}

const presetStore = loadThemePresetStore();

const Ctx = createContext<EditorThemeContextValue>({
  theme: DEFAULT_THEME,
  appDefaultTheme: DEFAULT_THEME,
  savedThemes: [],
  userDefaultThemeId: null,
  activeSavedThemeId: null,
  updateTheme: () => {},
  resetTheme: () => {},
  saveCurrentThemeAsPreset: () => null,
  applySavedTheme: () => false,
  renameSavedTheme: () => false,
  deleteSavedTheme: () => false,
  duplicateSavedTheme: () => null,
  setUserDefaultTheme: () => false,
});

export function EditorThemeProvider({ children }: { children: ReactNode }) {
  const [savedThemes, setSavedThemes] = useState<SavedThemePreset[]>(presetStore.savedThemes);
  const [userDefaultThemeId, setUserDefaultThemeId] = useState<string | null>(presetStore.userDefaultThemeId);
  const [theme, setTheme] = useState<EditorThemeConfig>(() => {
    const storedTheme = loadTheme();
    const defaultPreset = presetStore.userDefaultThemeId
      ? presetStore.savedThemes.find((item) => item.id === presetStore.userDefaultThemeId)
      : null;
    const shouldUseUserDefault = areThemesEqual(storedTheme, DEFAULT_THEME) && defaultPreset;
    return shouldUseUserDefault ? normalizeThemeConfig(defaultPreset.theme) : normalizeThemeConfig(storedTheme);
  });

  useLayoutEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    const normalized = normalizeThemeConfig(theme);
    const isCorrupted = !normalized || typeof normalized.appBg !== "string" || typeof normalized.fontSize !== "number";
    if (!isCorrupted) return;

    const fallback = normalizeThemeConfig(DEFAULT_THEME);
    setTheme(fallback);
    saveTheme(fallback);
  }, [theme]);

  const persistSavedThemes = useCallback((nextThemes: SavedThemePreset[]) => {
    setSavedThemes(nextThemes);
    saveSavedThemePresets(nextThemes);
  }, []);

  const updateTheme = useCallback((patch: Partial<EditorThemeConfig>) => {
    setTheme((prev) => {
      const next = { ...prev, ...patch };
      const normalized = normalizeThemeConfig(next);
      saveTheme(normalized);
      return normalized;
    });
  }, []);

  const reset = useCallback(() => {
    const def = resetThemeStorage();
    setTheme(def);
  }, []);

  const activeSavedThemeId = useMemo(() => (
    savedThemes.find((item) => areThemesEqual(normalizeThemeConfig(item.theme), theme))?.id ?? null
  ), [savedThemes, theme]);

  const saveCurrentThemeAsPreset = useCallback((name: string) => {
    const normalizedName = name.trim();
    if (!normalizedName) return null;

    const timestamp = new Date().toISOString();
    const preset: SavedThemePreset = {
      id: createThemePresetId(),
      name: normalizedName,
      theme: normalizeThemeConfig(theme),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    persistSavedThemes([preset, ...savedThemes]);
    return preset;
  }, [persistSavedThemes, savedThemes, theme]);

  const applySavedTheme = useCallback((id: string) => {
    const preset = savedThemes.find((item) => item.id === id);
    if (!preset) return false;
    const nextTheme = normalizeThemeConfig(preset.theme);
    setTheme(nextTheme);
    saveTheme(nextTheme);
    return true;
  }, [savedThemes]);

  const renameSavedTheme = useCallback((id: string, name: string) => {
    const normalizedName = name.trim();
    if (!normalizedName) return false;
    let found = false;
    const nextThemes = savedThemes.map((item) => {
      if (item.id !== id) return item;
      found = true;
      return { ...item, name: normalizedName, updatedAt: new Date().toISOString() };
    });
    if (!found) return false;
    persistSavedThemes(nextThemes);
    return true;
  }, [persistSavedThemes, savedThemes]);

  const deleteSavedTheme = useCallback((id: string) => {
    const preset = savedThemes.find((item) => item.id === id);
    if (!preset) return false;
    const isActiveTheme = id === activeSavedThemeId
      || areThemesEqual(normalizeThemeConfig(preset.theme), theme);
    if (isActiveTheme) return false;

    const nextThemes = savedThemes.filter((item) => item.id !== id);
    persistSavedThemes(nextThemes);
    if (userDefaultThemeId === id) {
      setUserDefaultThemeId(null);
      saveUserDefaultThemeId(null);
    }
    return true;
  }, [activeSavedThemeId, persistSavedThemes, savedThemes, theme, userDefaultThemeId]);

  const duplicateSavedTheme = useCallback((id: string, name?: string) => {
    const preset = savedThemes.find((item) => item.id === id);
    if (!preset) return null;
    const normalizedName = (name?.trim() || `${preset.name} Copy`).trim();
    const timestamp = new Date().toISOString();
    const duplicate: SavedThemePreset = {
      id: createThemePresetId(),
      name: normalizedName,
      theme: normalizeThemeConfig(preset.theme),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    persistSavedThemes([duplicate, ...savedThemes]);
    return duplicate;
  }, [persistSavedThemes, savedThemes]);

  const setUserDefaultTheme = useCallback((id: string | null) => {
    if (id && !savedThemes.some((item) => item.id === id)) return false;
    setUserDefaultThemeId(id);
    saveUserDefaultThemeId(id);
    return true;
  }, [savedThemes]);

  return (
    <Ctx.Provider
      value={{
        theme,
        appDefaultTheme: DEFAULT_THEME,
        savedThemes,
        userDefaultThemeId,
        activeSavedThemeId,
        updateTheme,
        resetTheme: reset,
        saveCurrentThemeAsPreset,
        applySavedTheme,
        renameSavedTheme,
        deleteSavedTheme,
        duplicateSavedTheme,
        setUserDefaultTheme,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useEditorTheme(): EditorThemeContextValue {
  return useContext(Ctx);
}

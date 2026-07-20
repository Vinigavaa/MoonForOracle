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
  createThemePreset as createThemePresetFile,
  renameThemePreset as renameThemePresetFile,
  deleteThemePreset as deleteThemePresetFile,
  duplicateThemePreset as duplicateThemePresetFile,
  setDefaultThemePreset as setDefaultThemePresetFile,
  openThemesFolder as openThemesFolderIpc,
  importThemeFile as importThemeFileIpc,
  exportThemeFile as exportThemeFileIpc,
  loadThemePresetStore,
  type SavedThemePreset,
  type ThemePresetStore,
} from "../lib/themePresets";

interface EditorThemeContextValue {
  theme: EditorThemeConfig;
  appDefaultTheme: EditorThemeConfig;
  savedThemes: SavedThemePreset[];
  savedThemesLoading: boolean;
  userDefaultThemeId: string | null;
  activeSavedThemeId: string | null;
  themesFolderPath: string;
  updateTheme: (patch: Partial<EditorThemeConfig>) => void;
  resetTheme: () => void;
  saveCurrentThemeAsPreset: (name: string) => Promise<SavedThemePreset | null>;
  applySavedTheme: (id: string) => Promise<boolean>;
  renameSavedTheme: (id: string, name: string) => Promise<boolean>;
  deleteSavedTheme: (id: string) => Promise<boolean>;
  duplicateSavedTheme: (id: string, name?: string) => Promise<SavedThemePreset | null>;
  setUserDefaultTheme: (id: string | null) => Promise<boolean>;
  openThemesFolder: () => Promise<boolean>;
  importThemeFile: () => Promise<SavedThemePreset | null>;
  exportThemeFile: (id: string) => Promise<string | null>;
}

const Ctx = createContext<EditorThemeContextValue>({
  theme: DEFAULT_THEME,
  appDefaultTheme: DEFAULT_THEME,
  savedThemes: [],
  savedThemesLoading: true,
  userDefaultThemeId: null,
  activeSavedThemeId: null,
  themesFolderPath: "",
  updateTheme: () => {},
  resetTheme: () => {},
  saveCurrentThemeAsPreset: async () => null,
  applySavedTheme: async () => false,
  renameSavedTheme: async () => false,
  deleteSavedTheme: async () => false,
  duplicateSavedTheme: async () => null,
  setUserDefaultTheme: async () => false,
  openThemesFolder: async () => false,
  importThemeFile: async () => null,
  exportThemeFile: async () => null,
});

export function EditorThemeProvider({ children }: { children: ReactNode }) {
  const [savedThemes, setSavedThemes] = useState<SavedThemePreset[]>([]);
  const [savedThemesLoading, setSavedThemesLoading] = useState(true);
  const [userDefaultThemeId, setUserDefaultThemeId] = useState<string | null>(null);
  const [themesFolderPath, setThemesFolderPath] = useState("");
  const [theme, setTheme] = useState<EditorThemeConfig>(() => normalizeThemeConfig(loadTheme()));

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

  useEffect(() => {
    let cancelled = false;

    void loadThemePresetStore().then((store) => {
      if (cancelled) return;
      setSavedThemes(store.savedThemes);
      setUserDefaultThemeId(store.userDefaultThemeId);
      setThemesFolderPath(store.folderPath);
      setSavedThemesLoading(false);

      setTheme((current) => {
        if (!areThemesEqual(current, DEFAULT_THEME)) return current;
        const defaultPreset = store.userDefaultThemeId
          ? store.savedThemes.find((item) => item.id === store.userDefaultThemeId)
          : null;
        if (!defaultPreset) return current;
        const next = normalizeThemeConfig(defaultPreset.theme);
        saveTheme(next);
        return next;
      });
    });

    return () => { cancelled = true; };
  }, []);

  const applyStoreUpdate = useCallback((store: ThemePresetStore | null): boolean => {
    if (!store) return false;
    setSavedThemes(store.savedThemes);
    setUserDefaultThemeId(store.userDefaultThemeId);
    return true;
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

  const saveCurrentThemeAsPreset = useCallback(async (name: string) => {
    const normalizedName = name.trim();
    if (!normalizedName) return null;

    const previousIds = new Set(savedThemes.map((item) => item.id));
    const store = await createThemePresetFile(normalizedName, normalizeThemeConfig(theme));
    if (!applyStoreUpdate(store) || !store) return null;
    return store.savedThemes.find((item) => !previousIds.has(item.id)) ?? null;
  }, [applyStoreUpdate, savedThemes, theme]);

  const applySavedTheme = useCallback(async (id: string) => {
    const preset = savedThemes.find((item) => item.id === id);
    if (!preset) return false;
    const nextTheme = normalizeThemeConfig(preset.theme);
    setTheme(nextTheme);
    saveTheme(nextTheme);
    return true;
  }, [savedThemes]);

  const renameSavedTheme = useCallback(async (id: string, name: string) => {
    const normalizedName = name.trim();
    if (!normalizedName) return false;
    const store = await renameThemePresetFile(id, normalizedName);
    return applyStoreUpdate(store);
  }, [applyStoreUpdate]);

  const deleteSavedTheme = useCallback(async (id: string) => {
    const preset = savedThemes.find((item) => item.id === id);
    if (!preset) return false;
    const isActiveTheme = id === activeSavedThemeId
      || areThemesEqual(normalizeThemeConfig(preset.theme), theme);
    if (isActiveTheme) return false;

    const store = await deleteThemePresetFile(id);
    return applyStoreUpdate(store);
  }, [activeSavedThemeId, applyStoreUpdate, savedThemes, theme]);

  const duplicateSavedTheme = useCallback(async (id: string, name?: string) => {
    const previousIds = new Set(savedThemes.map((item) => item.id));
    const store = await duplicateThemePresetFile(id, name);
    if (!applyStoreUpdate(store) || !store) return null;
    return store.savedThemes.find((item) => !previousIds.has(item.id)) ?? null;
  }, [applyStoreUpdate, savedThemes]);

  const setUserDefaultTheme = useCallback(async (id: string | null) => {
    if (id && !savedThemes.some((item) => item.id === id)) return false;
    const store = await setDefaultThemePresetFile(id);
    return applyStoreUpdate(store);
  }, [applyStoreUpdate, savedThemes]);

  const openThemesFolder = useCallback(async () => openThemesFolderIpc(), []);

  const importThemeFile = useCallback(async () => {
    const previousIds = new Set(savedThemes.map((item) => item.id));
    const store = await importThemeFileIpc();
    if (!applyStoreUpdate(store) || !store) return null;
    return store.savedThemes.find((item) => !previousIds.has(item.id)) ?? null;
  }, [applyStoreUpdate, savedThemes]);

  const exportThemeFile = useCallback(async (id: string) => exportThemeFileIpc(id), []);

  return (
    <Ctx.Provider
      value={{
        theme,
        appDefaultTheme: DEFAULT_THEME,
        savedThemes,
        savedThemesLoading,
        userDefaultThemeId,
        activeSavedThemeId,
        themesFolderPath,
        updateTheme,
        resetTheme: reset,
        saveCurrentThemeAsPreset,
        applySavedTheme,
        renameSavedTheme,
        deleteSavedTheme,
        duplicateSavedTheme,
        setUserDefaultTheme,
        openThemesFolder,
        importThemeFile,
        exportThemeFile,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useEditorTheme(): EditorThemeContextValue {
  return useContext(Ctx);
}

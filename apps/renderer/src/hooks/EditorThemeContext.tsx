import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import {
  type EditorThemeConfig,
  DEFAULT_THEME,
  applyThemeToDocument,
  loadTheme,
  saveTheme,
  resetTheme as resetThemeStorage,
} from "../lib/editorTheme";

interface EditorThemeContextValue {
  theme: EditorThemeConfig;
  updateTheme: (patch: Partial<EditorThemeConfig>) => void;
  resetTheme: () => void;
}

const Ctx = createContext<EditorThemeContextValue>({
  theme: DEFAULT_THEME,
  updateTheme: () => {},
  resetTheme: () => {},
});

export function EditorThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<EditorThemeConfig>(loadTheme);

  useLayoutEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const updateTheme = useCallback((patch: Partial<EditorThemeConfig>) => {
    setTheme((prev) => {
      const next = { ...prev, ...patch };
      saveTheme(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const def = resetThemeStorage();
    setTheme(def);
  }, []);

  return (
    <Ctx.Provider value={{ theme, updateTheme, resetTheme: reset }}>
      {children}
    </Ctx.Provider>
  );
}

export function useEditorTheme(): EditorThemeContextValue {
  return useContext(Ctx);
}

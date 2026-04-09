/**
 * Editor theme preferences — persisted to localStorage.
 * Controls CodeMirror appearance across the entire application.
 */

export interface EditorThemeConfig {
  // Colors
  bgEditor: string;
  bgGutter: string;
  textDefault: string;
  textKeyword: string;
  textString: string;
  textNumber: string;
  textComment: string;
  textIdentifier: string;
  activeLine: string;
  selection: string;
  cursor: string;
  // Font
  fontSize: number;
  fontFamily: string;
  // Base
  baseTheme: "dark" | "light";
}

const STORAGE_KEY = "gavadb:editor-theme";

export const DEFAULT_THEME: EditorThemeConfig = {
  bgEditor: "#1e1e2e",
  bgGutter: "#181825",
  textDefault: "#cdd6f4",
  textKeyword: "#7dd3fc",
  textString: "#a6e3a1",
  textNumber: "#fab387",
  textComment: "#6c7086",
  textIdentifier: "#cdd6f4",
  activeLine: "rgba(255,255,255,0.03)",
  selection: "rgba(137, 180, 250, 0.15)",
  cursor: "#89b4fa",
  fontSize: 13,
  fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", monospace',
  baseTheme: "dark",
};

export function loadTheme(): EditorThemeConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_THEME };
    const parsed = JSON.parse(raw) as Partial<EditorThemeConfig>;
    return { ...DEFAULT_THEME, ...parsed };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

export function saveTheme(config: EditorThemeConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resetTheme(): EditorThemeConfig {
  localStorage.removeItem(STORAGE_KEY);
  return { ...DEFAULT_THEME };
}

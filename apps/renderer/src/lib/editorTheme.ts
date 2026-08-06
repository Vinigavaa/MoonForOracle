/**
 * Editor theme preferences — current draft persisted to localStorage.
 * Named presets live on disk as JSON (see themePresets.ts).
 * Controls CodeMirror appearance across the entire application.
 */

import type { EditorThemeConfig } from "@gavadb/types";

export type { EditorThemeConfig };

const STORAGE_KEY = "gavadb:editor-theme";
export const FIXED_FONT_FAMILY = '"Cascadia Code", "Consolas", monospace';
export const UI_FONT_FAMILY = 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const DEFAULT_THEME: EditorThemeConfig = {
  appBg: "#1e1e2e",
  sidebarBg: "#181825",
  topbarBg: "#181825",
  tabBarBg: "#181825",
  tabActiveBg: "#10141a", // oklch(0.19 0.014 260) — especificação de design
  panelBg: "#1e1e2e",
  surfaceBg: "#252536",
  resultViewerBg: "#1e1e2e",
  gridBg: "#1e1e2e",
  gridHeaderBg: "#252536",
  gridAltRowBg: "#252536",
  modalBg: "#181825",
  popupBg: "#181825",
  hoverBg: "#2e2e42",
  selectedBg: "rgba(137, 180, 250, 0.12)",
  activeBg: "#3b3b54",
  focusColor: "#89b4fa",
  textPrimary: "#cdd6f4",
  textSecondary: "#a6adc8",
  textTitle: "#cdd6f4",
  textPlaceholder: "#6c7086",
  textMuted: "#6c7086",
  borderColor: "#313244",
  dividerColor: "#2a2a3c",
  buttonPrimaryBg: "#89b4fa",
  buttonPrimaryText: "#11111b",
  buttonSecondaryBg: "#252536",
  buttonSecondaryText: "#cdd6f4",
  buttonDisabledBg: "#252536",
  buttonDisabledText: "#6c7086",
  info: "#89b4fa",
  success: "#a6e3a1",
  warning: "#fab387",
  danger: "#f38ba8",
  statusConnected: "#a6e3a1",
  statusDisconnected: "#6c7086",
  statusPending: "#fab387",
  cellSelectedBg: "rgba(137, 180, 250, 0.12)",
  cellEditingBg: "rgba(137, 180, 250, 0.18)",
  cellModifiedBg: "rgba(125, 211, 252, 0.14)",
  rowPendingBg: "rgba(125, 211, 252, 0.06)",
  scrollbarTrack: "#181825",
  scrollbarThumb: "#3b3b54",
  scrollbarThumbHover: "#6c7086",
  codeViewerBg: "#1e1e2e",
  // Paleta do editor conforme a especificação de design (oklch convertido para
  // hex porque o seletor de cores das preferências usa <input type="color">).
  bgEditor: "#080a0f", // oklch(0.145 0.011 260)
  bgGutter: "#080a0f", // igual ao fundo do código: gutter sem divisória
  textDefault: "#cdd6f4",
  textKeyword: "#ef6dc9", // oklch(0.72 0.19 340)
  textString: "#a6e3a1",
  textNumber: "#fab387",
  textComment: "#6c7086",
  textIdentifier: "#ccced1", // oklch(0.85 0.005 260)
  textOperator: "#7d8086", // oklch(0.6 0.01 260)
  textPunctuation: "#bac2de",
  activeLine: "rgba(18, 22, 28, 0.5)", // oklch(0.2 0.014 260 / 0.5)
  selection: "rgba(137, 180, 250, 0.18)",
  cursor: "#89b4fa",
  scopeLineColor: "#6c7086",
  scopeLineOpacity: 0.34,
  fontSize: 13,
  fontFamily: FIXED_FONT_FAMILY,
  baseTheme: "dark",
};

export const THEME_CSS_VARS: Record<keyof EditorThemeConfig, string | null> = {
  appBg: "--app-bg",
  sidebarBg: "--sidebar-bg",
  topbarBg: "--topbar-bg",
  tabBarBg: "--tab-bar-bg",
  tabActiveBg: "--tab-active-bg",
  panelBg: "--panel-bg",
  surfaceBg: "--surface-bg",
  resultViewerBg: "--result-viewer-bg",
  gridBg: "--grid-bg",
  gridHeaderBg: "--grid-header-bg",
  gridAltRowBg: "--grid-alt-row-bg",
  modalBg: "--modal-bg",
  popupBg: "--popup-bg",
  hoverBg: "--hover-bg",
  selectedBg: "--selected-bg",
  activeBg: "--active-bg",
  focusColor: "--focus-color",
  textPrimary: "--text-primary",
  textSecondary: "--text-secondary",
  textTitle: "--text-title",
  textPlaceholder: "--text-placeholder",
  textMuted: "--text-muted",
  borderColor: "--border-color",
  dividerColor: "--divider-color",
  buttonPrimaryBg: "--button-primary-bg",
  buttonPrimaryText: "--button-primary-text",
  buttonSecondaryBg: "--button-secondary-bg",
  buttonSecondaryText: "--button-secondary-text",
  buttonDisabledBg: "--button-disabled-bg",
  buttonDisabledText: "--button-disabled-text",
  info: "--info",
  success: "--success",
  warning: "--warning",
  danger: "--danger",
  statusConnected: "--status-connected",
  statusDisconnected: "--status-disconnected",
  statusPending: "--status-pending",
  cellSelectedBg: "--cell-selected-bg",
  cellEditingBg: "--cell-editing-bg",
  cellModifiedBg: "--cell-modified-bg",
  rowPendingBg: "--row-pending-bg",
  scrollbarTrack: "--scrollbar-track",
  scrollbarThumb: "--scrollbar-thumb",
  scrollbarThumbHover: "--scrollbar-thumb-hover",
  codeViewerBg: "--code-viewer-bg",
  bgEditor: "--editor-bg",
  bgGutter: "--editor-gutter-bg",
  textDefault: "--editor-text",
  textKeyword: "--syntax-keyword",
  textString: "--syntax-string",
  textNumber: "--syntax-number",
  textComment: "--syntax-comment",
  textIdentifier: "--syntax-identifier",
  textOperator: "--syntax-operator",
  textPunctuation: "--syntax-punctuation",
  activeLine: "--editor-active-line",
  selection: "--text-selection-bg",
  cursor: "--editor-cursor",
  scopeLineColor: "--editor-scope-line-color",
  scopeLineOpacity: "--editor-scope-line-opacity",
  fontSize: null,
  fontFamily: null,
  baseTheme: null,
};

export function loadTheme(): EditorThemeConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizeThemeConfig(DEFAULT_THEME);
    const parsed = JSON.parse(raw) as Partial<EditorThemeConfig>;
    return normalizeThemeConfig({ ...DEFAULT_THEME, ...parsed });
  } catch {
    return normalizeThemeConfig(DEFAULT_THEME);
  }
}

export function saveTheme(config: EditorThemeConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeThemeConfig(config)));
}

export function resetTheme(): EditorThemeConfig {
  localStorage.removeItem(STORAGE_KEY);
  return normalizeThemeConfig(DEFAULT_THEME);
}

export function applyThemeToDocument(config: EditorThemeConfig, root: HTMLElement = document.documentElement): void {
  const normalized = normalizeThemeConfig(config);
  for (const key of Object.keys(THEME_CSS_VARS) as Array<keyof EditorThemeConfig>) {
    const cssVar = THEME_CSS_VARS[key];
    if (cssVar && (typeof normalized[key] === "string" || typeof normalized[key] === "number")) {
      root.style.setProperty(cssVar, String(normalized[key]));
    }
  }

  root.style.setProperty("--bg-primary", normalized.appBg);
  root.style.setProperty("--bg-secondary", normalized.sidebarBg);
  root.style.setProperty("--bg-surface", normalized.surfaceBg);
  root.style.setProperty("--bg-hover", normalized.hoverBg);
  root.style.setProperty("--bg-active", normalized.activeBg);
  root.style.setProperty("--border-subtle", normalized.dividerColor);
  root.style.setProperty("--accent", normalized.focusColor);
  root.style.setProperty("--accent-hover", normalized.focusColor);
  root.style.setProperty("--text-selection-color", normalized.textPrimary);
  root.style.setProperty("--font-ui", UI_FONT_FAMILY);
  root.style.setProperty("--font-mono", normalized.fontFamily);
}

export function isThemeDefault(config: EditorThemeConfig): boolean {
  return areThemesEqual(config, DEFAULT_THEME);
}

export function areThemesEqual(a: EditorThemeConfig, b: EditorThemeConfig): boolean {
  return (Object.keys(DEFAULT_THEME) as Array<keyof EditorThemeConfig>).every(
    (key) => a[key] === b[key],
  );
}

export function getContrastWarning(theme: EditorThemeConfig): string | null {
  if (contrastRatio(theme.appBg, theme.textPrimary) < 4.5) {
    return "Main text may be hard to read on the app background.";
  }
  if (contrastRatio(theme.sidebarBg, theme.textSecondary) < 3) {
    return "Sidebar text contrast is low.";
  }
  if (contrastRatio(theme.bgEditor, theme.textDefault) < 4.5) {
    return "Editor text may be hard to read on the SQL editor background.";
  }
  return null;
}

export function normalizeThemeConfig(config: Partial<EditorThemeConfig>): EditorThemeConfig {
  return {
    ...DEFAULT_THEME,
    ...config,
    fontFamily: FIXED_FONT_FAMILY,
  };
}

function contrastRatio(a: string, b: string): number {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return 21;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseColor(value: string): [number, number, number] | null {
  const trimmed = value.trim();
  const hex = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1];
    const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }

  const rgb = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linear = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

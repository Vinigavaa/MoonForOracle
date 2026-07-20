export interface EditorThemeConfig {
  appBg: string;
  sidebarBg: string;
  topbarBg: string;
  tabBarBg: string;
  tabActiveBg: string;
  panelBg: string;
  surfaceBg: string;
  resultViewerBg: string;
  gridBg: string;
  gridHeaderBg: string;
  gridAltRowBg: string;
  modalBg: string;
  popupBg: string;
  hoverBg: string;
  selectedBg: string;
  activeBg: string;
  focusColor: string;
  textPrimary: string;
  textSecondary: string;
  textTitle: string;
  textPlaceholder: string;
  textMuted: string;
  borderColor: string;
  dividerColor: string;
  buttonPrimaryBg: string;
  buttonPrimaryText: string;
  buttonSecondaryBg: string;
  buttonSecondaryText: string;
  buttonDisabledBg: string;
  buttonDisabledText: string;
  info: string;
  success: string;
  warning: string;
  danger: string;
  statusConnected: string;
  statusDisconnected: string;
  statusPending: string;
  cellSelectedBg: string;
  cellEditingBg: string;
  cellModifiedBg: string;
  rowPendingBg: string;
  scrollbarTrack: string;
  scrollbarThumb: string;
  scrollbarThumbHover: string;
  codeViewerBg: string;
  bgEditor: string;
  bgGutter: string;
  textDefault: string;
  textKeyword: string;
  textString: string;
  textNumber: string;
  textComment: string;
  textIdentifier: string;
  textOperator: string;
  textPunctuation: string;
  activeLine: string;
  selection: string;
  cursor: string;
  scopeLineColor: string;
  scopeLineOpacity: number;
  fontSize: number;
  fontFamily: string;
  baseTheme: "dark" | "light";
}

/** Um tema salvo em disco — `theme` fica solto (não validado) pois o main
 * process não sabe quais chaves são válidas; o renderer normaliza via
 * `normalizeThemeConfig`, o que também permite importar JSONs "crus"
 * (parciais) compartilhados por outros usuários. */
export interface ThemeFileEntry {
  fileName: string;
  name: string;
  theme: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ThemeListResponse {
  themes: ThemeFileEntry[];
  folderPath: string;
  defaultThemeFileName: string | null;
}

export interface ThemeSaveRequest {
  name: string;
  theme: Record<string, unknown>;
}

export interface ThemeRenameRequest {
  fileName: string;
  newName: string;
}

export interface ThemeDeleteRequest {
  fileName: string;
}

export interface ThemeDuplicateRequest {
  fileName: string;
  name?: string;
}

export interface ThemeSetDefaultRequest {
  fileName: string | null;
}

export interface ThemeExportRequest {
  fileName: string;
}

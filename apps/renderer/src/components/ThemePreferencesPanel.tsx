import { useCallback, useMemo } from "react";
import { useEditorTheme } from "../hooks/EditorThemeContext";
import type { EditorThemeConfig } from "../lib/editorTheme";
import { DEFAULT_THEME, getContrastWarning, isThemeDefault } from "../lib/editorTheme";
import { SqlCodeEditor } from "./SqlCodeEditor";

const PREVIEW_SQL = `SELECT employee_id,
       first_name || ' ' || last_name AS full_name,
       salary * 12 AS annual_salary
  FROM employees
 WHERE salary > 5000
   AND hire_date >= DATE '2020-01-01'
 ORDER BY salary DESC;`;

interface ThemeField {
  key: keyof EditorThemeConfig;
  label: string;
  description?: string;
}

interface ThemeGroup {
  title: string;
  fields: ThemeField[];
}

const GROUPS: ThemeGroup[] = [
  {
    title: "General App Colors",
    fields: [
      { key: "appBg", label: "App background" },
      { key: "panelBg", label: "Panel background" },
      { key: "surfaceBg", label: "Raised surface" },
      { key: "hoverBg", label: "Hover background" },
      { key: "selectedBg", label: "Selected item" },
      { key: "activeBg", label: "Active item" },
      { key: "focusColor", label: "Focus / accent" },
    ],
  },
  {
    title: "Text and Borders",
    fields: [
      { key: "textPrimary", label: "Primary text" },
      { key: "textSecondary", label: "Secondary text" },
      { key: "textTitle", label: "Titles" },
      { key: "textPlaceholder", label: "Placeholders" },
      { key: "textMuted", label: "Muted text" },
      { key: "borderColor", label: "Borders" },
      { key: "dividerColor", label: "Dividers" },
    ],
  },
  {
    title: "Sidebar",
    fields: [
      { key: "sidebarBg", label: "Sidebar background" },
      { key: "popupBg", label: "Popovers" },
    ],
  },
  {
    title: "Header / Topbar",
    fields: [
      { key: "topbarBg", label: "Topbar background" },
      { key: "statusConnected", label: "Connected status" },
      { key: "statusDisconnected", label: "Disconnected status" },
      { key: "statusPending", label: "Pending transaction" },
    ],
  },
  {
    title: "Panels and Tabs",
    fields: [
      { key: "tabBarBg", label: "Tab bar" },
      { key: "tabActiveBg", label: "Active tab" },
      { key: "modalBg", label: "Modals" },
    ],
  },
  {
    title: "SQL Editor",
    fields: [
      { key: "bgEditor", label: "Editor background" },
      { key: "bgGutter", label: "Line counter background" },
      { key: "textDefault", label: "Editor text" },
      { key: "activeLine", label: "Current line" },
      { key: "selection", label: "Text selection" },
      { key: "cursor", label: "Cursor" },
      { key: "textKeyword", label: "Reserved words" },
      { key: "textString", label: "Strings" },
      { key: "textNumber", label: "Numbers" },
      { key: "textComment", label: "Comments" },
      { key: "textIdentifier", label: "Identifiers" },
      { key: "textOperator", label: "Operators" },
      { key: "textPunctuation", label: "Punctuation" },
    ],
  },
  {
    title: "Result Viewer / Data Grid",
    fields: [
      { key: "resultViewerBg", label: "Result viewer" },
      { key: "gridBg", label: "Grid background" },
      { key: "gridHeaderBg", label: "Grid header" },
      { key: "gridAltRowBg", label: "Alternating row" },
      { key: "cellSelectedBg", label: "Selected cell" },
      { key: "cellEditingBg", label: "Editing cell" },
      { key: "cellModifiedBg", label: "Modified cell" },
      { key: "rowPendingBg", label: "Pending row" },
    ],
  },
  {
    title: "Buttons and States",
    fields: [
      { key: "buttonPrimaryBg", label: "Primary button" },
      { key: "buttonPrimaryText", label: "Primary button text" },
      { key: "buttonSecondaryBg", label: "Secondary button" },
      { key: "buttonSecondaryText", label: "Secondary button text" },
      { key: "buttonDisabledBg", label: "Disabled button" },
      { key: "buttonDisabledText", label: "Disabled button text" },
      { key: "info", label: "Info" },
      { key: "success", label: "Success" },
      { key: "warning", label: "Warning" },
      { key: "danger", label: "Error" },
    ],
  },
  {
    title: "Code Viewer and Scroll",
    fields: [
      { key: "codeViewerBg", label: "Code viewer" },
      { key: "scrollbarTrack", label: "Scroll track" },
      { key: "scrollbarThumb", label: "Scroll thumb" },
      { key: "scrollbarThumbHover", label: "Scroll thumb hover" },
    ],
  },
];

export function ThemePreferencesPanel() {
  const { theme, updateTheme, resetTheme } = useEditorTheme();
  const contrastWarning = useMemo(() => getContrastWarning(theme), [theme]);
  const defaultTheme = useMemo(() => isThemeDefault(theme), [theme]);

  const updateColor = useCallback((key: keyof EditorThemeConfig, value: string) => {
    updateTheme({ [key]: value });
  }, [updateTheme]);

  const updateFontSize = useCallback((value: number) => {
    updateTheme({ fontSize: Math.max(9, Math.min(24, value)) });
  }, [updateTheme]);

  return (
    <div style={layoutStyle}>
      <div style={settingsPaneStyle}>
        <header style={headerStyle}>
          <div>
            <div style={titleStyle}>Theme Preferences</div>
            <div style={subtitleStyle}>Saved automatically and applied immediately.</div>
          </div>
          <button onClick={resetTheme} disabled={defaultTheme} style={resetButtonStyle}>
            Reset all
          </button>
        </header>

        {contrastWarning && (
          <div style={warningStyle}>{contrastWarning}</div>
        )}

        <section style={fontSectionStyle}>
          <div style={sectionTitleStyle}>Editor Font</div>
          <div style={fontControlStyle}>
            <label style={fieldLabelStyle}>Size ({theme.fontSize}px)</label>
            <input
              type="range"
              min={9}
              max={24}
              value={theme.fontSize}
              onChange={(event) => updateFontSize(Number(event.target.value))}
              style={{ accentColor: "var(--focus-color)", flex: 1 }}
            />
          </div>
          <div style={fontControlStyle}>
            <label style={fieldLabelStyle}>Family</label>
            <select
              value={theme.fontFamily}
              onChange={(event) => updateTheme({ fontFamily: event.target.value })}
              style={selectStyle}
            >
              <option value={'"Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", monospace'}>Cascadia Code</option>
              <option value={'"Fira Code", "Cascadia Code", "JetBrains Mono", "Consolas", monospace'}>Fira Code</option>
              <option value={'"JetBrains Mono", "Cascadia Code", "Fira Code", "Consolas", monospace'}>JetBrains Mono</option>
              <option value={'"Consolas", "Cascadia Code", monospace'}>Consolas</option>
              <option value="monospace">System monospace</option>
            </select>
          </div>
        </section>

        {GROUPS.map((group) => (
          <section key={group.title} style={sectionStyle}>
            <div style={sectionTitleStyle}>{group.title}</div>
            <div style={fieldsGridStyle}>
              {group.fields.map((field) => (
                <ColorField
                  key={field.key}
                  field={field}
                  value={String(theme[field.key])}
                  defaultValue={String(DEFAULT_THEME[field.key])}
                  onChange={(value) => updateColor(field.key, value)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div style={previewPaneStyle}>
        <div style={previewStickyStyle}>
          <div style={previewTitleStyle}>Live Preview</div>
          <ThemePreview />
          <div style={editorPreviewStyle}>
            <SqlCodeEditor value={PREVIEW_SQL} readOnly />
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorField({
  field,
  value,
  defaultValue,
  onChange,
}: {
  field: ThemeField;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
}) {
  const colorValue = value.startsWith("#") ? value : "#ffffff";
  const modified = value !== defaultValue;

  return (
    <div style={colorFieldStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <label style={fieldLabelStyle}>{field.label}</label>
        {modified && (
          <button onClick={() => onChange(defaultValue)} title="Reset color" style={tinyButtonStyle}>
            Reset
          </button>
        )}
      </div>
      <div style={colorInputRowStyle}>
        <input
          type="color"
          value={colorValue}
          onChange={(event) => onChange(event.target.value)}
          style={colorPickerStyle}
        />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          style={hexInputStyle}
        />
      </div>
    </div>
  );
}

function ThemePreview() {
  return (
    <div style={previewCardStyle}>
      <div style={previewTopbarStyle}>
        <strong>Moon For Oracle</strong>
        <span style={statusPillStyle}>Connected</span>
        <button style={previewPrimaryButtonStyle}>Execute</button>
        <button>Connect</button>
      </div>
      <div style={previewBodyStyle}>
        <aside style={previewSidebarStyle}>
          <div style={previewSidebarTitleStyle}>Connections</div>
          <div style={previewSidebarItemActiveStyle}>HR@ORCL</div>
          <div style={previewSidebarItemStyle}>Tables</div>
          <div style={previewSidebarItemStyle}>Packages</div>
        </aside>
        <main style={previewMainStyle}>
          <div style={previewTabsStyle}>
            <span style={previewTabActiveStyle}>SQL Editor</span>
            <span style={previewTabStyle}>EMPLOYEES</span>
          </div>
          <div style={previewPanelStyle}>
            <div style={previewGridHeaderStyle}>ID</div>
            <div style={previewGridHeaderStyle}>NAME</div>
            <div style={previewGridHeaderStyle}>STATUS</div>
            <div style={previewCellSelectedStyle}>101</div>
            <div style={previewCellStyle}>Ada Lovelace</div>
            <div style={previewCellModifiedStyle}>Modified</div>
            <div style={previewCellAltStyle}>102</div>
            <div style={previewCellAltStyle}>Grace Hopper</div>
            <div style={previewCellEditingStyle}>Editing</div>
          </div>
          <div style={feedbackRowStyle}>
            <span style={{ color: "var(--info)" }}>Info</span>
            <span style={{ color: "var(--success)" }}>Success</span>
            <span style={{ color: "var(--warning)" }}>Warning</span>
            <span style={{ color: "var(--danger)" }}>Error</span>
          </div>
        </main>
      </div>
    </div>
  );
}

const layoutStyle: React.CSSProperties = { display: "flex", height: "100%", minWidth: 0, background: "var(--app-bg)" };
const settingsPaneStyle: React.CSSProperties = { width: 460, overflow: "auto", borderRight: "1px solid var(--border-color)", background: "var(--panel-bg)" };
const previewPaneStyle: React.CSSProperties = { flex: 1, overflow: "auto", minWidth: 0, background: "var(--app-bg)" };
const previewStickyStyle: React.CSSProperties = { padding: 16, display: "flex", flexDirection: "column", gap: 14 };
const headerStyle: React.CSSProperties = { position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 16, background: "var(--panel-bg)", borderBottom: "1px solid var(--border-color)" };
const titleStyle: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: "var(--text-title)" };
const subtitleStyle: React.CSSProperties = { marginTop: 3, fontSize: 11, color: "var(--text-muted)" };
const resetButtonStyle: React.CSSProperties = { padding: "5px 10px", fontWeight: 600 };
const warningStyle: React.CSSProperties = { margin: 12, padding: 10, border: "1px solid var(--warning)", background: "var(--selected-bg)", color: "var(--warning)", borderRadius: "var(--radius)", fontSize: 12 };
const sectionStyle: React.CSSProperties = { padding: "14px 16px", borderBottom: "1px solid var(--divider-color)" };
const fontSectionStyle: React.CSSProperties = { ...sectionStyle, display: "flex", flexDirection: "column", gap: 10 };
const sectionTitleStyle: React.CSSProperties = { marginBottom: 10, fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--focus-color)" };
const fieldsGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
const colorFieldStyle: React.CSSProperties = { minWidth: 0, display: "flex", flexDirection: "column", gap: 5 };
const fieldLabelStyle: React.CSSProperties = { fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const colorInputRowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6 };
const colorPickerStyle: React.CSSProperties = { width: 28, height: 24, padding: 0, border: "1px solid var(--border-color)", borderRadius: "var(--radius)", background: "transparent", flexShrink: 0 };
const hexInputStyle: React.CSSProperties = { width: "100%", minWidth: 0, padding: "4px 6px", border: "1px solid var(--border-color)", borderRadius: "var(--radius)", background: "var(--app-bg)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 11 };
const tinyButtonStyle: React.CSSProperties = { padding: "0 4px", fontSize: 10, border: "none", background: "transparent", color: "var(--text-muted)" };
const fontControlStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10 };
const selectStyle: React.CSSProperties = { flex: 1, minWidth: 0, padding: "4px 6px", background: "var(--app-bg)", color: "var(--text-primary)", border: "1px solid var(--border-color)", borderRadius: "var(--radius)", fontSize: 12 };
const previewTitleStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--text-title)", textTransform: "uppercase", letterSpacing: "0.04em" };
const previewCardStyle: React.CSSProperties = { border: "1px solid var(--border-color)", borderRadius: "var(--radius)", overflow: "hidden", background: "var(--panel-bg)" };
const previewTopbarStyle: React.CSSProperties = { height: 38, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", borderBottom: "1px solid var(--border-color)", background: "var(--topbar-bg)", color: "var(--text-title)" };
const statusPillStyle: React.CSSProperties = { marginLeft: "auto", padding: "2px 7px", border: "1px solid var(--status-connected)", color: "var(--status-connected)", borderRadius: "var(--radius)", fontSize: 11 };
const previewPrimaryButtonStyle: React.CSSProperties = { background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none" };
const previewBodyStyle: React.CSSProperties = { display: "flex", minHeight: 260 };
const previewSidebarStyle: React.CSSProperties = { width: 150, padding: 10, borderRight: "1px solid var(--border-color)", background: "var(--sidebar-bg)" };
const previewSidebarTitleStyle: React.CSSProperties = { marginBottom: 8, fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" };
const previewSidebarItemStyle: React.CSSProperties = { padding: "6px 8px", borderRadius: "var(--radius)", color: "var(--text-secondary)", fontSize: 12 };
const previewSidebarItemActiveStyle: React.CSSProperties = { ...previewSidebarItemStyle, background: "var(--selected-bg)", color: "var(--status-connected)", borderLeft: "2px solid var(--status-connected)" };
const previewMainStyle: React.CSSProperties = { flex: 1, minWidth: 0, background: "var(--result-viewer-bg)" };
const previewTabsStyle: React.CSSProperties = { display: "flex", height: 32, background: "var(--tab-bar-bg)", borderBottom: "1px solid var(--border-color)" };
const previewTabStyle: React.CSSProperties = { padding: "8px 12px", color: "var(--text-muted)", fontSize: 12 };
const previewTabActiveStyle: React.CSSProperties = { ...previewTabStyle, background: "var(--tab-active-bg)", color: "var(--text-primary)", borderBottom: "2px solid var(--focus-color)" };
const previewPanelStyle: React.CSSProperties = { margin: 12, display: "grid", gridTemplateColumns: "70px 1fr 110px", border: "1px solid var(--border-color)", background: "var(--grid-bg)", fontFamily: "var(--font-mono)", fontSize: 12 };
const previewGridHeaderStyle: React.CSSProperties = { padding: 8, background: "var(--grid-header-bg)", color: "var(--focus-color)", borderBottom: "1px solid var(--border-color)", fontWeight: 700 };
const previewCellStyle: React.CSSProperties = { padding: 8, color: "var(--text-secondary)", borderBottom: "1px solid var(--divider-color)" };
const previewCellAltStyle: React.CSSProperties = { ...previewCellStyle, background: "var(--grid-alt-row-bg)" };
const previewCellSelectedStyle: React.CSSProperties = { ...previewCellStyle, background: "var(--cell-selected-bg)", outline: "2px solid var(--focus-color)", outlineOffset: -2 };
const previewCellModifiedStyle: React.CSSProperties = { ...previewCellStyle, background: "var(--cell-modified-bg)", color: "var(--text-primary)" };
const previewCellEditingStyle: React.CSSProperties = { ...previewCellAltStyle, background: "var(--cell-editing-bg)", outline: "2px solid var(--focus-color)", outlineOffset: -2 };
const feedbackRowStyle: React.CSSProperties = { display: "flex", gap: 14, padding: "0 12px 12px", fontSize: 12, fontWeight: 700 };
const editorPreviewStyle: React.CSSProperties = { height: 230, border: "1px solid var(--border-color)", borderRadius: "var(--radius)", overflow: "hidden", background: "var(--editor-bg)" };

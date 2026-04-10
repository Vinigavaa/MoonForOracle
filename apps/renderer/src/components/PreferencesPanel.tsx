import { useCallback } from "react";
import { useEditorTheme } from "../hooks/EditorThemeContext";
import type { EditorThemeConfig } from "../lib/editorTheme";
import { DEFAULT_THEME } from "../lib/editorTheme";
import { SqlCodeEditor } from "./SqlCodeEditor";

const PREVIEW_SQL = `-- Preview: your theme applied in real-time
SELECT e.employee_id,
       e.first_name || ' ' || e.last_name AS full_name,
       d.department_name,
       e.salary * 12 AS annual_salary
  FROM employees e
  LEFT JOIN departments d
    ON d.department_id = e.department_id
 WHERE e.salary > 5000
   AND e.hire_date >= DATE '2020-01-01'
 ORDER BY e.salary DESC
 FETCH FIRST 100 ROWS ONLY;

/* Multi-line comment example */
BEGIN
  DBMS_OUTPUT.PUT_LINE('Hello, Moon For Oracle!');
  NULL; -- do nothing
END;`;

interface ColorFieldDef {
  key: keyof EditorThemeConfig;
  label: string;
}

const COLOR_FIELDS: ColorFieldDef[] = [
  { key: "bgEditor", label: "Editor background" },
  { key: "bgGutter", label: "Gutter background" },
  { key: "textDefault", label: "Default text" },
  { key: "textKeyword", label: "SQL keywords" },
  { key: "textString", label: "Strings" },
  { key: "textNumber", label: "Numbers" },
  { key: "textComment", label: "Comments" },
  { key: "textIdentifier", label: "Identifiers" },
  { key: "cursor", label: "Cursor / accent" },
  { key: "activeLine", label: "Active line" },
  { key: "selection", label: "Selection" },
];

export function PreferencesPanel() {
  const { theme, updateTheme, resetTheme } = useEditorTheme();

  const handleColorChange = useCallback((key: keyof EditorThemeConfig, value: string) => {
    updateTheme({ [key]: value });
  }, [updateTheme]);

  const handleFontSizeChange = useCallback((value: number) => {
    updateTheme({ fontSize: Math.max(9, Math.min(24, value)) });
  }, [updateTheme]);

  const handleFontFamilyChange = useCallback((value: string) => {
    updateTheme({ fontFamily: value });
  }, [updateTheme]);

  const isDefault = COLOR_FIELDS.every(
    (f) => theme[f.key] === DEFAULT_THEME[f.key],
  ) && theme.fontSize === DEFAULT_THEME.fontSize && theme.fontFamily === DEFAULT_THEME.fontFamily;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{
        padding: "8px 16px",
        fontSize: 12,
        fontWeight: 600,
        color: "var(--text-secondary)",
        background: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <span>Editor Preferences</span>
        <button
          onClick={resetTheme}
          disabled={isDefault}
          style={{
            padding: "3px 10px",
            fontSize: 11,
            background: isDefault ? "transparent" : "rgba(243, 139, 168, 0.1)",
            border: `1px solid ${isDefault ? "var(--border-color)" : "rgba(243, 139, 168, 0.3)"}`,
            borderRadius: "var(--radius)",
            color: isDefault ? "var(--text-muted)" : "var(--danger)",
            fontWeight: 500,
          }}
        >
          Reset to default
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", display: "flex" }}>
        {/* Settings column */}
        <div style={{
          width: 320,
          flexShrink: 0,
          padding: 16,
          borderRight: "1px solid var(--border-subtle)",
          overflow: "auto",
        }}>
          {/* Colors */}
          <SectionLabel>Colors</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {COLOR_FIELDS.map((field) => (
              <ColorPicker
                key={field.key}
                label={field.label}
                value={theme[field.key] as string}
                defaultValue={DEFAULT_THEME[field.key] as string}
                onChange={(v) => handleColorChange(field.key, v)}
              />
            ))}
          </div>

          {/* Font */}
          <SectionLabel>Font</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <FieldLabel>Size ({theme.fontSize}px)</FieldLabel>
              <input
                type="range"
                min={9}
                max={24}
                step={1}
                value={theme.fontSize}
                onChange={(e) => handleFontSizeChange(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--accent)" }}
              />
            </div>
            <div>
              <FieldLabel>Family</FieldLabel>
              <select
                value={theme.fontFamily}
                onChange={(e) => handleFontFamilyChange(e.target.value)}
                style={{
                  width: "100%",
                  padding: "4px 6px",
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius)",
                  fontSize: 12,
                }}
              >
                <option value={'"Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", monospace'}>
                  Cascadia Code
                </option>
                <option value={'"Fira Code", "Cascadia Code", "JetBrains Mono", "Consolas", monospace'}>
                  Fira Code
                </option>
                <option value={'"JetBrains Mono", "Cascadia Code", "Fira Code", "Consolas", monospace'}>
                  JetBrains Mono
                </option>
                <option value={'"Consolas", "Cascadia Code", monospace'}>
                  Consolas
                </option>
                <option value={'"Source Code Pro", "Cascadia Code", monospace'}>
                  Source Code Pro
                </option>
                <option value="monospace">
                  System monospace
                </option>
              </select>
            </div>
          </div>

          {/* Keyboard shortcuts reference */}
          <SectionLabel style={{ marginTop: 24 }}>Keyboard Shortcuts</SectionLabel>
          <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 4 }}>
            <ShortcutRow keys="Ctrl+F" action="Search in editor" />
            <ShortcutRow keys="Ctrl+G" action="Go to line" />
            <ShortcutRow keys="Ctrl+Enter" action="Execute current statement" />
            <ShortcutRow keys="Shift+Ctrl+Enter" action="Execute all statements" />
            <ShortcutRow keys="Ctrl+Click" action="Open object definition" />
            <ShortcutRow keys="Escape" action="Close search / dialog" />
          </div>
        </div>

        {/* Preview column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{
            padding: "6px 16px",
            fontSize: 11,
            color: "var(--text-muted)",
            background: "var(--bg-secondary)",
            borderBottom: "1px solid var(--border-subtle)",
            fontWeight: 600,
            flexShrink: 0,
          }}>
            Live Preview
          </div>
          <div style={{ flex: 1 }}>
            <SqlCodeEditor value={PREVIEW_SQL} readOnly />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 700,
      color: "var(--accent)",
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
      marginBottom: 10,
      ...style,
    }}>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
      {children}
    </div>
  );
}

function ColorPicker({
  label,
  value,
  defaultValue,
  onChange,
}: {
  label: string;
  value: string;
  defaultValue: string;
  onChange: (v: string) => void;
}) {
  // For rgba values, convert to hex for the color input
  const isRgba = value.startsWith("rgba") || value.startsWith("rgb");
  const isModified = value !== defaultValue;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input
        type="color"
        value={isRgba ? "#ffffff" : value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: 28,
          height: 22,
          padding: 0,
          border: "1px solid var(--border-color)",
          borderRadius: 3,
          background: "transparent",
          cursor: "pointer",
        }}
      />
      <div style={{
        width: 16,
        height: 16,
        borderRadius: 3,
        background: value,
        border: "1px solid rgba(255,255,255,0.1)",
        flexShrink: 0,
      }} />
      <span style={{
        flex: 1,
        fontSize: 11,
        color: isModified ? "var(--text-primary)" : "var(--text-muted)",
      }}>
        {label}
      </span>
      {isModified && (
        <button
          onClick={() => onChange(defaultValue)}
          title="Reset to default"
          style={{
            padding: "0 4px",
            fontSize: 10,
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          ↺
        </button>
      )}
    </div>
  );
}

function ShortcutRow({ keys, action }: { keys: string; action: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <kbd style={{
        padding: "1px 5px",
        background: "var(--bg-surface)",
        borderRadius: 3,
        border: "1px solid var(--border-color)",
        fontSize: 10,
        fontFamily: "var(--font-ui)",
        color: "var(--text-secondary)",
      }}>
        {keys}
      </kbd>
      <span>{action}</span>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BindDataType, BindMetadata, BindParameterValue } from "@gavadb/types";

export interface BindParametersModalProps {
  open: boolean;
  statementPreview: string;
  metadata: BindMetadata[];
  /** Last values keyed by bind name (per-session cache) */
  initialValues: Record<string, { raw: string; isNull: boolean }>;
  onCancel: () => void;
  onExecute: (binds: Record<string, BindParameterValue>, rawForCache: Record<string, { raw: string; isNull: boolean }>) => void;
}

interface FieldState {
  raw: string;
  isNull: boolean;
  error?: string;
}

export function BindParametersModal({
  open,
  statementPreview,
  metadata,
  initialValues,
  onCancel,
  onExecute,
}: BindParametersModalProps) {
  const [fields, setFields] = useState<Record<string, FieldState>>({});
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const initial: Record<string, FieldState> = {};
    for (const meta of metadata) {
      const prev = initialValues[meta.name];
      initial[meta.name] = { raw: prev?.raw ?? "", isNull: prev?.isNull ?? false };
    }
    setFields(initial);
    setTimeout(() => firstInputRef.current?.focus(), 50);
  }, [open, metadata, initialValues]);

  const validate = useCallback((meta: BindMetadata, state: FieldState): string | undefined => {
    if (state.isNull) {
      if (!meta.nullable && meta.inferred) return "Column is NOT NULL";
      return undefined;
    }
    const raw = state.raw.trim();
    if (!raw) {
      if (!meta.nullable && meta.inferred) return "Value is required";
      return undefined;
    }
    switch (meta.dataType) {
      case "NUMBER": {
        if (!/^-?\d+(\.\d+)?$/.test(raw)) return "Must be a valid number";
        if (meta.precision != null) {
          const [intPart, decPart = ""] = raw.replace("-", "").split(".");
          const scale = meta.scale ?? 0;
          const maxInt = meta.precision - scale;
          if (intPart!.length > maxInt) return `Max ${maxInt} digits before decimal`;
          if (decPart.length > scale) return `Max ${scale} decimal digits`;
        }
        break;
      }
      case "DATE":
      case "TIMESTAMP": {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return "Invalid date";
        break;
      }
      case "VARCHAR": {
        if (meta.length && raw.length > meta.length) return `Max ${meta.length} characters`;
        break;
      }
    }
    return undefined;
  }, []);

  const handleChange = (name: string, patch: Partial<FieldState>) => {
    setFields((prev) => ({ ...prev, [name]: { ...prev[name]!, ...patch, error: undefined } }));
  };

  const handleSubmit = useCallback(() => {
    const next: Record<string, FieldState> = {};
    const binds: Record<string, BindParameterValue> = {};
    const cache: Record<string, { raw: string; isNull: boolean }> = {};
    let hasError = false;

    for (const meta of metadata) {
      const state = fields[meta.name] ?? { raw: "", isNull: false };
      const error = validate(meta, state);
      next[meta.name] = { ...state, error };
      if (error) hasError = true;
      cache[meta.name] = { raw: state.raw, isNull: state.isNull };

      if (state.isNull || state.raw.trim() === "") {
        binds[meta.name] = { value: null, isNull: true, type: meta.dataType };
      } else {
        binds[meta.name] = { value: state.raw, type: meta.dataType };
      }
    }

    setFields(next);
    if (hasError) return;
    onExecute(binds, cache);
  }, [fields, metadata, onExecute, validate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey || (e.target as HTMLElement).tagName !== "TEXTAREA")) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") onCancel();
  };

  const previewText = useMemo(
    () => (statementPreview.length > 300 ? `${statementPreview.slice(0, 300)}…` : statementPreview),
    [statementPreview],
  );

  if (!open) return null;

  return (
    <div
      style={overlayStyle}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      onKeyDown={handleKeyDown}
    >
      <div style={dialogStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: "var(--text-primary)" }}>
          Bind parameters
        </h2>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 10 }}>
          Fill in the values for the bind variables in the current statement.
        </div>

        <pre style={previewStyle}>{previewText}</pre>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
          {metadata.map((meta, idx) => {
            const state = fields[meta.name] ?? { raw: "", isNull: false };
            const typeLabel = formatTypeLabel(meta);
            const required = meta.inferred && !meta.nullable;
            const disabled = state.isNull;
            return (
              <div key={meta.name}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                  <label style={labelStyle}>
                    <span style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>:{meta.name}</span>
                    {required && <span style={{ color: "var(--danger)", marginLeft: 4 }}>*</span>}
                  </label>
                  <span style={typeBadgeStyle}>{typeLabel}</span>
                  {!meta.inferred && meta.reason && (
                    <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>({meta.reason})</span>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    ref={idx === 0 ? firstInputRef : undefined}
                    type={inputTypeFor(meta.dataType)}
                    value={state.raw}
                    disabled={disabled}
                    placeholder={placeholderFor(meta)}
                    onChange={(e) => handleChange(meta.name, { raw: e.target.value })}
                    style={inputStyle(state.error, disabled)}
                  />
                  <label style={nullLabelStyle}>
                    <input
                      type="checkbox"
                      checked={state.isNull}
                      onChange={(e) => handleChange(meta.name, { isNull: e.target.checked, raw: "" })}
                    />
                    NULL
                  </label>
                </div>
                {state.error && <div style={fieldErrorStyle}>{state.error}</div>}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button onClick={onCancel}>Cancel</button>
          <button onClick={handleSubmit} style={executeBtnStyle}>Execute</button>
        </div>
      </div>
    </div>
  );
}

function inputTypeFor(type: BindDataType): string {
  switch (type) {
    case "NUMBER": return "number";
    case "DATE": return "date";
    case "TIMESTAMP": return "datetime-local";
    default: return "text";
  }
}

function placeholderFor(meta: BindMetadata): string {
  switch (meta.dataType) {
    case "NUMBER":
      return meta.precision ? `NUMBER(${meta.precision}${meta.scale ? `,${meta.scale}` : ""})` : "number";
    case "DATE": return "YYYY-MM-DD";
    case "TIMESTAMP": return "YYYY-MM-DDTHH:MM:SS";
    case "VARCHAR": return meta.length ? `text (max ${meta.length})` : "text";
    default: return "value";
  }
}

function formatTypeLabel(meta: BindMetadata): string {
  if (!meta.inferred) return "UNKNOWN";
  switch (meta.dataType) {
    case "NUMBER":
      if (meta.precision != null && meta.scale) return `NUMBER(${meta.precision},${meta.scale})`;
      if (meta.precision != null) return `NUMBER(${meta.precision})`;
      return "NUMBER";
    case "VARCHAR": return meta.length ? `VARCHAR2(${meta.length})` : "VARCHAR2";
    case "DATE": return "DATE";
    case "TIMESTAMP": return "TIMESTAMP";
    default: return "UNKNOWN";
  }
}

// ─── Styles ─────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(0, 0, 0, 0.6)", zIndex: 1100,
};

const dialogStyle: React.CSSProperties = {
  background: "var(--modal-bg)",
  border: "1px solid var(--border-color)",
  borderRadius: 8, width: 520, maxWidth: "92vw",
  padding: 22, boxShadow: "0 16px 48px rgba(0, 0, 0, 0.4)",
  maxHeight: "90vh", overflowY: "auto",
};

const previewStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 11,
  background: "var(--bg-primary)", color: "var(--text-primary)",
  border: "1px solid var(--border-color)", borderRadius: "var(--radius)",
  padding: "8px 10px", margin: 0, whiteSpace: "pre-wrap",
  maxHeight: 120, overflow: "auto",
};

const labelStyle: React.CSSProperties = {
  fontSize: "var(--font-size-sm)", color: "var(--text-secondary)",
};

const typeBadgeStyle: React.CSSProperties = {
  fontSize: 10, fontFamily: "var(--font-mono)",
  padding: "1px 6px", borderRadius: 3,
  background: "var(--selected-bg)", color: "var(--text-secondary)",
};

const inputStyle = (error?: string, disabled?: boolean): React.CSSProperties => ({
  flex: 1, padding: "6px 10px",
  fontSize: "var(--font-size-base)", fontFamily: "var(--font-ui)",
  background: disabled ? "var(--selected-bg)" : "var(--bg-primary)",
  color: "var(--text-primary)",
  border: `1px solid ${error ? "var(--danger)" : "var(--border-color)"}`,
  borderRadius: "var(--radius)", outline: "none",
});

const nullLabelStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 4,
  fontSize: 11, color: "var(--text-secondary)", userSelect: "none",
};

const fieldErrorStyle: React.CSSProperties = {
  fontSize: 11, color: "var(--danger)", marginTop: 2,
};

const executeBtnStyle: React.CSSProperties = {
  background: "var(--button-primary-bg)", color: "var(--button-primary-text)",
  border: "none", fontWeight: 600, padding: "6px 20px",
};

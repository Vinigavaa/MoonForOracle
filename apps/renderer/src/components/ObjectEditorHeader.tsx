import { PackagePartToggleButton } from "./PackagePartToggleButton";

type PackagePart = "spec" | "body";

interface ObjectEditorHeaderProps {
  isPackageEditor: boolean;
  activeLabel: string;
  activePart: PackagePart | null;
  isDirty: boolean;
  compiling: boolean;
  onTogglePackagePart?: () => void;
  onCompile: () => void;
}

export function ObjectEditorHeader({
  isPackageEditor,
  activeLabel,
  activePart,
  isDirty,
  compiling,
  onTogglePackagePart,
  onCompile,
}: ObjectEditorHeaderProps) {
  return (
    <div style={toolbarStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        {isPackageEditor && activePart && onTogglePackagePart ? (
          <PackagePartToggleButton activePart={activePart} isDirty={isDirty} onToggle={onTogglePackagePart} />
        ) : (
          <div style={activeLabelStyle}>
            <span>{activeLabel}</span>
            {isDirty && <span style={dirtyMarkerStyle}>*</span>}
          </div>
        )}

        <span style={{ color: isDirty ? "var(--warning)" : "var(--text-muted)", fontSize: 11 }}>
          {isDirty ? "Modified" : "Saved"}
        </span>
      </div>

      <button
        onClick={onCompile}
        disabled={compiling}
        title="Compile (F9)"
        style={compileButtonStyle}
      >
        {compiling ? "Compiling..." : "Compile"}
      </button>
    </div>
  );
}

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  minHeight: 36,
  padding: "0 12px",
  borderBottom: "1px solid var(--border-subtle)",
  background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0))",
};

const activeLabelStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 28,
  padding: "0 10px",
  color: "var(--text-primary)",
  border: "1px solid var(--border-color)",
  background: "transparent",
  fontSize: "var(--font-size-sm)",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const dirtyMarkerStyle: React.CSSProperties = {
  color: "var(--warning)",
  fontSize: 12,
  lineHeight: 1,
};

const compileButtonStyle: React.CSSProperties = {
  padding: "4px 12px",
  minWidth: 88,
  background: "transparent",
  color: "var(--text-primary)",
  border: "1px solid var(--border-color)",
  borderRadius: 0,
  fontWeight: 600,
};

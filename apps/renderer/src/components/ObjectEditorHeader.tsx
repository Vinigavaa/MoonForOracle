import { PackagePartToggleButton } from "./PackagePartToggleButton";

type PackagePart = "spec" | "body";

interface ObjectEditorHeaderProps {
  isPackageEditor: boolean;
  activePart: PackagePart | null;
  isDirty: boolean;
  compiling: boolean;
  onTogglePackagePart?: () => void;
  onCompile: () => void;
}

export function ObjectEditorHeader({
  isPackageEditor,
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
          <span style={statusPillStyle}>{isDirty ? "Modified" : "Saved"}</span>
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

const statusPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 28,
  padding: "0 10px",
  color: "var(--text-primary)",
  border: "1px solid var(--border-color)",
  background: "transparent",
  fontSize: "var(--font-size-sm)",
  fontWeight: 600,
  whiteSpace: "nowrap",
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

import { Package } from "lucide-react";

type PackagePart = "spec" | "body";

interface PackagePartToggleButtonProps {
  activePart: PackagePart;
  isDirty: boolean;
  onToggle: () => void;
}

export function PackagePartToggleButton({ activePart, isDirty, onToggle }: PackagePartToggleButtonProps) {
  const viewingLabel = activePart === "body" ? "Package Body" : "Package Spec";
  const nextLabel = activePart === "body" ? "Spec" : "Body";

  return (
    <button
      onClick={onToggle}
      title={`Visualizando ${activePart === "body" ? "Body" : "Spec"} - clique para abrir ${nextLabel}`}
      aria-label={`Alternar para ${nextLabel}`}
      style={toggleButtonStyle}
    >
      <Package size={14} strokeWidth={1.9} aria-hidden="true" />
      <span>{viewingLabel}</span>
      {isDirty && <span style={dirtyMarkerStyle}>*</span>}
    </button>
  );
}

const toggleButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  minHeight: 28,
  padding: "0 10px",
  background: "transparent",
  color: "var(--text-primary)",
  border: "1px solid var(--border-color)",
  borderRadius: 0,
  fontSize: "var(--font-size-sm)",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const dirtyMarkerStyle: React.CSSProperties = {
  color: "var(--warning)",
  fontSize: 12,
  lineHeight: 1,
};

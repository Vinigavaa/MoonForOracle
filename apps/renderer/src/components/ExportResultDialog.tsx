import { useEffect, useState } from "react";
import type { QueryExportFormat, QueryExportProgress } from "@gavadb/types";

interface ExportResultDialogProps {
  open: boolean;
  inProgress: boolean;
  progress: QueryExportProgress | null;
  onClose: () => void;
  onConfirm: (options: { format: QueryExportFormat; delimiter: string; autoFitColumns: boolean }) => void | Promise<void>;
}

export function ExportResultDialog({
  open,
  inProgress,
  progress,
  onClose,
  onConfirm,
}: ExportResultDialogProps) {
  const [format, setFormat] = useState<QueryExportFormat>("csv");
  const [delimiter, setDelimiter] = useState(";");
  const [autoFitColumns, setAutoFitColumns] = useState(true);

  useEffect(() => {
    if (!open || inProgress) return;
    setDelimiter(";");
    setAutoFitColumns(true);
  }, [open, inProgress]);

  if (!open) return null;

  return (
    <div style={backdropStyle}>
      <div style={dialogStyle}>
        <div style={headerStyle}>
          <div>
            <div style={titleStyle}>Export Results</div>
            <div style={subtitleStyle}>Choose the file format and export options.</div>
          </div>
        </div>

        <div style={contentStyle}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Format</span>
            <select value={format} onChange={(event) => setFormat(event.target.value as QueryExportFormat)} disabled={inProgress} style={inputStyle}>
              <option value="csv">CSV</option>
              <option value="xlsx">Excel (.xlsx)</option>
            </select>
          </label>

          {format === "csv" && (
            <label style={fieldStyle}>
              <span style={labelStyle}>Delimiter</span>
              <input
                value={delimiter}
                maxLength={1}
                onChange={(event) => setDelimiter(event.target.value || ";")}
                disabled={inProgress}
                style={inputStyle}
              />
            </label>
          )}

          {format === "xlsx" && (
            <label style={checkboxRowStyle}>
              <input
                type="checkbox"
                checked={autoFitColumns}
                onChange={(event) => setAutoFitColumns(event.target.checked)}
                disabled={inProgress}
              />
              <span style={labelStyle}>Auto-fit column widths</span>
            </label>
          )}

          <div style={hintStyle}>
            The export runs in the desktop process and fetches the full result in chunks, not only the rows currently loaded in the grid.
          </div>

          {(inProgress || progress) && (
            <div style={progressBoxStyle}>
              <div style={progressTitleStyle}>
                {inProgress ? "Exporting..." : progress?.stage === "completed" ? "Export finished" : "Export status"}
              </div>
              <div style={progressMessageStyle}>{progress?.message ?? "Waiting..."}</div>
              <div style={progressMetaStyle}>
                {progress ? `${progress.rowsProcessed.toLocaleString()} row(s) processed across ${progress.chunksProcessed.toLocaleString()} chunk(s)` : ""}
              </div>
            </div>
          )}
        </div>

        <div style={actionsStyle}>
          <button onClick={onClose} style={secondaryButtonStyle}>
            {inProgress ? "Hide" : "Cancel"}
          </button>
          <button
            onClick={() => onConfirm({ format, delimiter, autoFitColumns })}
            disabled={inProgress || (format === "csv" && !delimiter)}
            style={primaryButtonStyle}
          >
            {inProgress ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.48)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 40,
};

const dialogStyle: React.CSSProperties = {
  width: 420,
  maxWidth: "calc(100vw - 32px)",
  background: "var(--modal-bg)",
  border: "1px solid var(--border-color)",
  borderRadius: "var(--radius)",
  boxShadow: "0 18px 60px rgba(0, 0, 0, 0.35)",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderBottom: "1px solid var(--divider-color)",
  background: "var(--panel-bg)",
};

const titleStyle: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: "var(--text-title)" };
const subtitleStyle: React.CSSProperties = { marginTop: 4, fontSize: 12, color: "var(--text-muted)" };
const contentStyle: React.CSSProperties = { padding: 16, display: "flex", flexDirection: "column", gap: 12 };
const fieldStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--text-secondary)" };
const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--border-color)",
  borderRadius: "var(--radius)",
  background: "var(--surface-bg)",
  color: "var(--text-primary)",
  fontSize: 12,
};
const checkboxRowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const hintStyle: React.CSSProperties = { fontSize: 11, lineHeight: 1.5, color: "var(--text-muted)" };
const progressBoxStyle: React.CSSProperties = {
  padding: 12,
  border: "1px solid var(--border-color)",
  borderRadius: "var(--radius)",
  background: "var(--panel-bg)",
};
const progressTitleStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--text-title)" };
const progressMessageStyle: React.CSSProperties = { marginTop: 6, fontSize: 12, color: "var(--text-primary)" };
const progressMetaStyle: React.CSSProperties = { marginTop: 6, fontSize: 11, color: "var(--text-muted)" };
const actionsStyle: React.CSSProperties = {
  padding: 16,
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  borderTop: "1px solid var(--divider-color)",
  background: "var(--panel-bg)",
};
const primaryButtonStyle: React.CSSProperties = {
  padding: "7px 12px",
  background: "var(--button-primary-bg)",
  color: "var(--button-primary-text)",
  border: "none",
  borderRadius: "var(--radius)",
  fontWeight: 600,
};
const secondaryButtonStyle: React.CSSProperties = {
  padding: "7px 12px",
  background: "var(--button-secondary-bg)",
  color: "var(--button-secondary-text)",
  border: "1px solid var(--border-color)",
  borderRadius: "var(--radius)",
};

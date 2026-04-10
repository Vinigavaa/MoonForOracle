import type { DatabaseObjectType, ObjectDetailResponse, ColumnInfo } from "@gavadb/types";
import { useObjectDetail } from "../hooks/useObjectDetail";
import { SqlCodeEditor } from "./SqlCodeEditor";

interface ObjectViewerProps {
  objectType: DatabaseObjectType;
  objectName: string;
}

const TYPE_LABELS: Record<DatabaseObjectType, string> = {
  tables: "Table",
  views: "View",
  triggers: "Trigger",
  packages: "Package",
  procedures: "Procedure",
  functions: "Function",
};

const TYPE_COLORS: Record<DatabaseObjectType, string> = {
  tables: "var(--focus-color)",
  views: "var(--success)",
  triggers: "var(--warning)",
  packages: "var(--info)",
  procedures: "var(--text-secondary)",
  functions: "var(--danger)",
};

export function ObjectViewer({ objectType, objectName }: ObjectViewerProps) {
  const { detail, error, loading, reload } = useObjectDetail(objectType, objectName);

  // Determine display label based on actual source content
  const sourceKindLabel = detail?.kind === "source" && detail.source
    ? detectSourceKind(detail.source, objectType)
    : TYPE_LABELS[objectType];
  const displayLabel = detail?.kind === "source" ? sourceKindLabel : TYPE_LABELS[objectType];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{
        padding: "6px 14px",
        fontSize: 12,
        color: "var(--text-secondary)",
        background: "var(--panel-bg)",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            padding: "1px 7px",
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            borderRadius: 3,
            background: "var(--selected-bg)",
            color: TYPE_COLORS[objectType],
            border: `1px solid ${TYPE_COLORS[objectType]}`,
            whiteSpace: "nowrap",
          }}>
            {displayLabel}
          </span>
          <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)" }}>
            {objectName}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!loading && (
            <button onClick={reload} style={reloadBtnStyle}>Reload</button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", background: "var(--code-viewer-bg)" }}>
        {loading && (
          <div style={centeredStyle}>
            <span style={{ animation: "pulse 1s infinite" }}>Loading...</span>
          </div>
        )}

        {error && (
          <div style={{ padding: 16 }}>
            <div style={errorBoxStyle}>{error}</div>
          </div>
        )}

        {detail && !loading && (
          <>
            {detail.kind === "table" && <TableView detail={detail} />}
            {detail.kind === "view" && <ViewView detail={detail} />}
            {detail.kind === "source" && <SourceView source={detail.source} />}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Detect specific source kind ────────────────────────────────────

function detectSourceKind(source: string, objectType: DatabaseObjectType): string {
  const upper = source.slice(0, 300).toUpperCase();
  if (objectType === "packages") {
    if (upper.includes("PACKAGE BODY")) return "Package Body";
    return "Package Spec";
  }
  return TYPE_LABELS[objectType];
}

// ─── Table view ─────────────────────────────────────────────────────

function TableView({ detail }: { detail: Extract<ObjectDetailResponse, { kind: "table" }> }) {
  if (detail.columns.length === 0) {
    return <div style={centeredStyle}><span style={{ fontStyle: "italic" }}>No columns found</span></div>;
  }

  return (
    <div style={{ padding: 14 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
        {detail.columns.length} column(s)
      </div>
      <ColumnTable columns={detail.columns} />
    </div>
  );
}

// ─── View view ──────────────────────────────────────────────────────

function ViewView({ detail }: { detail: Extract<ObjectDetailResponse, { kind: "view" }> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "100%" }}>
      {detail.columns.length > 0 && (
        <div style={{ padding: 14, borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
            {detail.columns.length} column(s)
          </div>
          <ColumnTable columns={detail.columns} />
        </div>
      )}

      {detail.text ? (
        <div style={{ flex: 1, overflow: "auto" }}>
          <div style={{
            padding: "6px 14px",
            fontSize: 11,
            color: "var(--text-muted)",
            background: "var(--panel-bg)",
            borderBottom: "1px solid var(--border-subtle)",
            fontWeight: 600,
          }}>
            Definition
          </div>
          <SourceView source={detail.text} />
        </div>
      ) : (
        <div style={centeredStyle}>
          <span style={{ fontStyle: "italic" }}>No view definition available</span>
        </div>
      )}
    </div>
  );
}

// ─── Shared column table ────────────────────────────────────────────

function ColumnTable({ columns }: { columns: ColumnInfo[] }) {
  return (
    <table style={{
      width: "100%",
      borderCollapse: "collapse",
      fontFamily: "var(--font-mono)",
      fontSize: "var(--font-size-sm)",
    }}>
      <thead>
        <tr>
          {["#", "Column", "Data Type", "Nullable"].map((h) => (
            <th key={h} style={thStyle}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {columns.map((col, i) => (
          <tr key={col.name} style={{ background: i % 2 === 0 ? "transparent" : "var(--grid-alt-row-bg)" }}>
            <td style={{ ...tdStyle, color: "var(--text-muted)", width: 40, textAlign: "right" }}>
              {col.position}
            </td>
            <td style={{ ...tdStyle, color: "var(--text-primary)", fontWeight: 500 }}>
              {col.name}
            </td>
            <td style={{ ...tdStyle, color: "var(--accent)" }}>
              {col.dataType}
            </td>
            <td style={{ ...tdStyle, width: 70, textAlign: "center" }}>
              {col.nullable ? (
                <span style={{ color: "var(--text-muted)" }}>Yes</span>
              ) : (
                <span style={{ color: "var(--warning)", fontWeight: 500 }}>No</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Source code view ───────────────────────────────────────────────

function SourceView({ source }: { source: string }) {
  if (!source.trim()) {
    return (
      <div style={centeredStyle}>
        <span style={{ fontStyle: "italic" }}>No source code available</span>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", minHeight: 220 }}>
      <SqlCodeEditor
        value={source}
        readOnly
      />
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────

const centeredStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  height: "100%", color: "var(--text-muted)", fontSize: "var(--font-size-sm)",
};

const errorBoxStyle: React.CSSProperties = {
  padding: 12,
  background: "var(--selected-bg)",
  border: "1px solid var(--danger)",
  borderRadius: "var(--radius)",
  fontSize: "var(--font-size-sm)",
  fontFamily: "var(--font-mono)",
  color: "var(--danger)",
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

const reloadBtnStyle: React.CSSProperties = {
  padding: "2px 8px", fontSize: 11, background: "transparent",
  border: "1px solid var(--border-color)", borderRadius: "var(--radius)",
  color: "var(--text-muted)",
};

const thStyle: React.CSSProperties = {
  padding: "6px 10px", textAlign: "left", fontSize: 11, fontWeight: 600,
  color: "var(--text-muted)", borderBottom: "1px solid var(--border-color)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "5px 10px", borderBottom: "1px solid var(--border-subtle)",
  whiteSpace: "nowrap",
};

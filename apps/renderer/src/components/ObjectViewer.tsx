import type {
  DatabaseObjectType,
  ObjectDetailResponse,
  ColumnInfo,
  PrimaryKeyDetail,
} from "@gavadb/types";
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
  ckts: "CKT",
  ckcs: "CKC",
};

const TYPE_COLORS: Record<DatabaseObjectType, string> = {
  tables: "var(--focus-color)",
  views: "var(--success)",
  triggers: "var(--warning)",
  packages: "var(--info)",
  procedures: "var(--text-secondary)",
  functions: "var(--danger)",
  ckts: "var(--warning)",
  ckcs: "var(--info)",
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
          <span style={{ fontWeight: 600, fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--text-primary)" }}>
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
            {detail.kind === "constraint" && <ConstraintView detail={detail} />}
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
  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 16 }}>
      <section>
        <SectionHeader
          title="Columns"
          subtitle={detail.columns.length > 0 ? `${detail.columns.length} column(s)` : "No columns found"}
        />
        {detail.columns.length > 0 ? (
          <ColumnTable columns={detail.columns} />
        ) : (
          <EmptySection message="No columns found" />
        )}
      </section>

      <section>
        <SectionHeader title="Primary Key" />
        <PrimaryKeySection primaryKey={detail.primaryKey} />
      </section>
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
      fontFamily: "var(--font-ui)",
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

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-secondary)" }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ marginTop: 2, fontSize: 11, color: "var(--text-muted)" }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

function PrimaryKeySection({ primaryKey }: { primaryKey: PrimaryKeyDetail | null }) {
  if (!primaryKey) {
    return <EmptySection message="No primary key defined" />;
  }

  return (
    <div style={sectionCardStyle}>
      <MetadataLine label="Constraint" value={primaryKey.constraintName} />
      <MetadataLine
        label="Columns"
        value={primaryKey.columns.map((column) => `${column.position}. ${column.name}`).join(", ")}
      />
    </div>
  );
}

function ConstraintView({ detail }: { detail: Extract<ObjectDetailResponse, { kind: "constraint" }> }) {
  const columnsLabel = detail.columns.length > 0
    ? detail.columns.map((column: { position: number; name: string }) => `${column.position}. ${column.name}`).join(", ")
    : "No column mapping available";

  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 16 }}>
      <section>
        <SectionHeader title="Constraint Details" subtitle={TYPE_LABELS[detail.objectType]} />
        <div style={sectionCardStyle}>
          <MetadataLine label="Constraint" value={detail.objectName} />
          <MetadataLine label="Table" value={detail.tableName} />
          <MetadataLine label="Status" value={detail.status} />
          <MetadataLine label="Validated" value={detail.validated} />
          <MetadataLine label="Columns" value={columnsLabel} />
        </div>
      </section>

      <section>
        <SectionHeader title="Check Condition" />
        <pre style={constraintConditionStyle}>{detail.searchCondition}</pre>
      </section>
    </div>
  );
}

function MetadataLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "110px minmax(0, 1fr)", gap: 10, alignItems: "start" }}>
      <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{label}</span>
      <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-ui)", fontSize: 12, lineHeight: 1.5, wordBreak: "break-word" }}>
        {value}
      </span>
    </div>
  );
}

function EmptySection({ message }: { message: string }) {
  return (
    <div style={{
      padding: "10px 12px",
      border: "1px solid var(--border-subtle)",
      background: "var(--panel-bg)",
      color: "var(--text-muted)",
      fontSize: 12,
      fontStyle: "italic",
    }}>
      {message}
    </div>
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

const sectionCardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "10px 12px",
  border: "1px solid var(--border-subtle)",
  background: "var(--panel-bg)",
};

const constraintConditionStyle: React.CSSProperties = {
  margin: 0,
  padding: "10px 12px",
  border: "1px solid var(--border-subtle)",
  background: "var(--panel-bg)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

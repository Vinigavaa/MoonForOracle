import { useCallback, useMemo, useState } from "react";
import type {
  DatabaseObjectType,
  ObjectDetailResponse,
  ColumnInfo,
  PrimaryKeyDetail,
} from "@gavadb/types";
import { useObjectDetail } from "../hooks/useObjectDetail";
import { ObjectEditorContainer } from "./ObjectEditorContainer";
import { TableTriggersModal } from "./TableTriggersModal";
import type { ObjectNavigationTarget } from "./query-workspace/queryWorkspaceTypes";

interface ObjectViewerProps {
  objectType: DatabaseObjectType;
  objectName: string;
  activeConnectionId?: string | null;
  isConnected?: boolean;
  navTarget?: ObjectNavigationTarget | null;
  onViewSql?: (type: DatabaseObjectType, name: string) => void;
  onOpenObject?: (type: DatabaseObjectType, name: string, target?: { line: number; part?: "spec" | "body" }) => void;
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

export function ObjectViewer({ objectType, objectName, activeConnectionId = null, isConnected = false, navTarget = null, onViewSql, onOpenObject }: ObjectViewerProps) {
  const { detail, error, loading, reload } = useObjectDetail(objectType, objectName);
  // Tabela tem cabeçalho próprio (seção COLUMNS) — sem badge de tipo nem Reload.
  const showToolbar = detail?.kind !== "source" && detail?.kind !== "table";
  const isSourceDetail = detail?.kind === "source";

  return (
    <div style={viewerRootStyle}>
      {showToolbar && (
        <div style={objectToolbarStyle}>
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
            {TYPE_LABELS[objectType]}
          </span>
          {!loading && (
            <button onClick={reload} style={reloadBtnStyle}>Reload</button>
          )}
        </div>
      )}

      <div
        style={{
          ...viewerContentStyle,
          overflow: isSourceDetail ? "hidden" : "auto",
        }}
      >
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
            {detail.kind === "table" && <TableView detail={detail} onViewSql={onViewSql} onOpenObject={onOpenObject} />}
            {detail.kind === "view" && <ViewView detail={detail} onViewSql={onViewSql} />}
            {detail.kind === "constraint" && <ConstraintView detail={detail} />}
            {detail.kind === "source" && (
              <ObjectEditorContainer
                detail={detail}
                connectionId={activeConnectionId}
                isConnected={isConnected}
                navTarget={navTarget}
                onOpenObject={onOpenObject}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Detect specific source kind ────────────────────────────────────

// ─── Table view ─────────────────────────────────────────────────────

function TableView({
  detail,
  onViewSql,
  onOpenObject,
}: {
  detail: Extract<ObjectDetailResponse, { kind: "table" }>;
  onViewSql?: (type: DatabaseObjectType, name: string) => void;
  onOpenObject?: (type: DatabaseObjectType, name: string) => void;
}) {
  const handleViewSql = useCallback(() => {
    onViewSql?.("tables", detail.objectName);
  }, [detail.objectName, onViewSql]);

  const [triggersOpen, setTriggersOpen] = useState(false);
  const triggers = detail.triggers ?? [];

  const handleSelectTrigger = useCallback((triggerName: string) => {
    setTriggersOpen(false);
    onOpenObject?.("triggers", triggerName);
  }, [onOpenObject]);

  return (
    <div style={tableRootStyle}>
      <section>
        <div style={tableSectionHeaderStyle}>
          <div>
            <div style={tableSectionLabelStyle}>COLUMNS</div>
            <div style={tableSectionCountStyle}>
              {detail.columns.length > 0 ? `${detail.columns.length} column(s)` : "No columns found"}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
            <button type="button" onClick={handleViewSql} style={outlineButtonStyle}>
              VIEW SQL
            </button>
            <button type="button" onClick={() => setTriggersOpen(true)} style={outlineButtonStyle}>
              TRIGGERS
              <span style={triggerCountPillStyle}>{triggers.length}</span>
            </button>
          </div>
        </div>

        {detail.columns.length > 0 ? (
          <div style={{ padding: "0 20px 18px" }}>
            <ModernColumnTable columns={detail.columns} />
          </div>
        ) : (
          <div style={{ padding: "0 20px 18px" }}>
            <EmptySection message="No columns found" />
          </div>
        )}
      </section>

      <section style={{ padding: "0 20px 20px" }}>
        <SectionHeader title="Primary Key" />
        <PrimaryKeySection primaryKey={detail.primaryKey} />
      </section>

      {triggersOpen && (
        <TableTriggersModal
          tableName={detail.objectName}
          triggers={triggers}
          onSelect={handleSelectTrigger}
          onClose={() => setTriggersOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Columns table (table detail screen) ────────────────────────────

function ModernColumnTable({ columns }: { columns: ColumnInfo[] }) {
  return (
    <div style={modernTableStyle}>
      <div style={modernHeaderRowStyle}>
        <div style={modernHeaderCellStyle}>#</div>
        <div style={modernHeaderCellStyle}>COLUMN</div>
        <div style={modernHeaderCellStyle}>DATA TYPE</div>
        <div style={modernHeaderCellStyle}>NULLABLE</div>
      </div>
      {columns.map((col, i) => (
        <div
          key={col.name}
          style={{
            ...modernDataRowStyle,
            background: i % 2 === 0 ? "transparent" : "var(--grid-alt-row-bg)",
          }}
        >
          <div style={modernIndexCellStyle}>{col.position}</div>
          <div style={modernNameCellStyle}>{col.name}</div>
          <div style={modernTypeCellStyle}>{col.dataType}</div>
          <div style={modernNullableCellStyle}>{col.nullable ? "Yes" : "No"}</div>
        </div>
      ))}
    </div>
  );
}

// ─── View view ──────────────────────────────────────────────────────

function ViewView({
  detail,
  onViewSql,
}: {
  detail: Extract<ObjectDetailResponse, { kind: "view" }>;
  onViewSql?: (type: DatabaseObjectType, name: string) => void;
}) {
  const handleViewSql = useCallback(() => {
    onViewSql?.("views", detail.objectName);
  }, [detail.objectName, onViewSql]);

  return (
    <div style={viewRootStyle}>
      <div style={scrollSectionStyle}>
        <SectionHeader
          title="Columns"
          subtitle={detail.columns.length > 0 ? `${detail.columns.length} column(s)` : "No columns found"}
          actions={(
            <button onClick={handleViewSql} style={secondaryActionButtonStyle}>
              View SQL
            </button>
          )}
        />
        {detail.columns.length > 0 ? (
          <ColumnTable columns={detail.columns} />
        ) : (
          <EmptySection message="No columns found" />
        )}
      </div>
    </div>
  );
}

// ─── Shared column table ────────────────────────────────────────────

type ColumnSortDirection = "asc" | "desc" | null;

function ColumnTable({ columns }: { columns: ColumnInfo[] }) {
  const [sortDirection, setSortDirection] = useState<ColumnSortDirection>(null);
  const originalColumns = columns;
  const displayColumns = useMemo(() => {
    if (!sortDirection) return originalColumns;

    return [...originalColumns].sort((a, b) => {
      const comparison = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [originalColumns, sortDirection]);

  const toggleColumnSort = useCallback(() => {
    setSortDirection((current) => {
      if (current === null) return "asc";
      if (current === "asc") return "desc";
      return null;
    });
  }, []);

  const sortArrow = sortDirection === "asc" ? " \u25B2" : sortDirection === "desc" ? " \u25BC" : "";

  return (
    <div style={tableScrollHostStyle}>
      <table style={columnTableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>#</th>
            <th style={sortableColumnHeaderStyle} onClick={toggleColumnSort} title="Sort by column name">
              Column
              {sortArrow && <span style={sortArrowStyle}>{sortArrow}</span>}
            </th>
            <th style={thStyle}>Data Type</th>
            <th style={thStyle}>Nullable</th>
          </tr>
        </thead>
        <tbody>
          {displayColumns.map((col, i) => (
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
    </div>
  );
}

function SectionHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-secondary)" }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ marginTop: 2, fontSize: 11, color: "var(--text-muted)" }}>
            {subtitle}
          </div>
        )}
      </div>
      {actions}
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

// ─── Styles ─────────────────────────────────────────────────────────

const centeredStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  height: "100%", color: "var(--text-muted)", fontSize: "var(--font-size-sm)",
};

const viewerRootStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
};

const viewerContentStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  width: "100%",
  minWidth: 0,
  minHeight: 0,
  background: "var(--code-viewer-bg)",
};

const tableRootStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
};

const tableSectionHeaderStyle: React.CSSProperties = {
  padding: "18px 20px 12px",
  display: "flex",
  flexDirection: "row",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const tableSectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  color: "var(--text-secondary)",
};

const tableSectionCountStyle: React.CSSProperties = {
  marginTop: 2,
  fontSize: 12,
  color: "var(--text-muted)",
};

const outlineButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 10px",
  borderRadius: 8,
  border: "1.5px solid var(--border-color)",
  background: "var(--button-secondary-bg)",
  color: "var(--text-primary)",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};

const triggerCountPillStyle: React.CSSProperties = {
  background: "var(--selected-bg)",
  color: "var(--accent)",
  borderRadius: 5,
  padding: "1px 6px",
  fontSize: 10.5,
  fontWeight: 700,
};

const modernTableStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--border-color)",
  overflow: "hidden",
};

const modernGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "44px 1fr 160px 90px",
  alignItems: "center",
};

const modernHeaderRowStyle: React.CSSProperties = {
  ...modernGridStyle,
  background: "var(--grid-header-bg)",
};

const modernHeaderCellStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: "0.04em",
  color: "var(--text-muted)",
  whiteSpace: "nowrap",
};

const modernDataRowStyle: React.CSSProperties = {
  ...modernGridStyle,
  borderTop: "1px solid var(--border-subtle)",
};

const modernCellStyle: React.CSSProperties = {
  padding: "7px 12px",
  fontSize: 12,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const modernIndexCellStyle: React.CSSProperties = {
  ...modernCellStyle,
  color: "var(--text-muted)",
};

const modernNameCellStyle: React.CSSProperties = {
  ...modernCellStyle,
  fontWeight: 700,
  color: "var(--text-primary)",
};

const modernTypeCellStyle: React.CSSProperties = {
  ...modernCellStyle,
  fontFamily: "var(--font-mono)",
  color: "var(--accent)",
};

const modernNullableCellStyle: React.CSSProperties = {
  ...modernCellStyle,
  color: "var(--warning)",
};

const scrollSectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  width: "100%",
  minWidth: 0,
  padding: 14,
  boxSizing: "border-box",
};

const viewRootStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  minWidth: 0,
  minHeight: 0,
};

const tableScrollHostStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  overflow: "auto",
};

const columnTableStyle: React.CSSProperties = {
  width: "max-content",
  minWidth: "100%",
  borderCollapse: "collapse",
  fontFamily: "var(--font-ui)",
  fontSize: "var(--font-size-sm)",
};

const objectToolbarStyle: React.CSSProperties = {
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

const secondaryActionButtonStyle: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 11,
  fontWeight: 600,
  background: "transparent",
  border: "1px solid var(--border-color)",
  borderRadius: "var(--radius)",
  color: "var(--text-secondary)",
  whiteSpace: "nowrap",
};

const thStyle: React.CSSProperties = {
  padding: "6px 10px", textAlign: "left", fontSize: 11, fontWeight: 600,
  color: "var(--text-muted)", borderBottom: "1px solid var(--border-color)",
  whiteSpace: "nowrap",
};

const sortableColumnHeaderStyle: React.CSSProperties = {
  ...thStyle,
  color: "var(--accent)",
  cursor: "pointer",
  userSelect: "none",
};

const sortArrowStyle: React.CSSProperties = { fontSize: 10, marginLeft: 2 };

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

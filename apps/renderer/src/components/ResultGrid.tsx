import { memo, useRef, useState, useEffect, useCallback, useMemo } from "react";
import type { QueryResultColumn, QueryResultRow, SqlExecutionResponse, UpdateRowRequest } from "@gavadb/types";
import { formatDuration } from "@gavadb/utils";
import { countRender } from "../lib/perfLog";

export type SortDirection = "asc" | "desc";
export interface SortState {
  column: string;
  direction: SortDirection;
}

interface ResultGridProps {
  result: SqlExecutionResponse;
  mutating?: boolean;
  loadingMore?: boolean;
  sorting?: boolean;
  activeSort?: SortState | null;
  onLoadMore?: () => void;
  onRefresh?: () => Promise<void>;
  onSaveChanges?: (request: UpdateRowRequest[]) => Promise<{ error?: string }>;
  onSort?: (sort: SortState | null) => void;
}

interface PendingRowChange {
  originalRow: QueryResultRow;
  changes: QueryResultRow;
}

const ROW_HEIGHT = 28;
const OVERSCAN = 10;
const INPUT_HEIGHT = 20;

// ─── Date formatting (Brazilian dd/mm/yyyy) ────────────────────────

function formatDateForDisplay(value: unknown): string | null {
  if (!(value instanceof Date)) return null;
  const d = value.getDate().toString().padStart(2, "0");
  const m = (value.getMonth() + 1).toString().padStart(2, "0");
  const y = value.getFullYear();
  const h = value.getHours();
  const min = value.getMinutes();
  const s = value.getSeconds();
  if (h === 0 && min === 0 && s === 0) return `${d}/${m}/${y}`;
  return `${d}/${m}/${y} ${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function isDateType(dataType: string): boolean {
  const u = dataType.toUpperCase();
  return u === "DATE" || u.startsWith("TIMESTAMP");
}

function formatCellDisplay(value: unknown, column: QueryResultColumn): string {
  if (value == null) return "";
  const dateStr = formatDateForDisplay(value);
  if (dateStr) return dateStr;
  if (isDateType(column.dataType) && typeof value === "string") {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      const formatted = formatDateForDisplay(parsed);
      if (formatted) return formatted;
    }
  }
  return String(value);
}

// ─── Component ─────────────────────────────────────────────────────

export const ResultGrid = memo(function ResultGrid({
  result,
  mutating,
  loadingMore,
  sorting,
  activeSort,
  onLoadMore,
  onRefresh,
  onSaveChanges,
  onSort,
}: ResultGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewHeight, setViewHeight] = useState(400);
  const [pendingChanges, setPendingChanges] = useState<Record<number, PendingRowChange>>({});
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; columnName: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setViewHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setPendingChanges({});
    setEditingCell(null);
    setEditValue("");
  }, [result]);

  const onScroll = useCallback(() => {
    if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
  }, []);

  countRender("ResultGrid");

  const { rows, columns } = result;
  const totalRows = rows.length;
  const editableInfo = result.editable;
  const canEditRows = !!editableInfo?.enabled && !!editableInfo.tableName && !!editableInfo.primaryKeyColumns?.length;
  const pendingRowIndexes = useMemo(() => Object.keys(pendingChanges).map(Number), [pendingChanges]);

  // Toggle sort: asc → desc → asc
  const toggleSort = useCallback((columnName: string) => {
    if (!onSort || sorting) return; // prevent concurrent sort requests or no handler
    if (Object.keys(pendingChanges).length > 0) {
      window.alert("Save or cancel the current inline changes before sorting.");
      return;
    }
    if (activeSort?.column === columnName) {
      if (activeSort.direction === "asc") {
        onSort({ column: columnName, direction: "desc" });
      } else {
        onSort({ column: columnName, direction: "asc" });
      }
    } else {
      onSort({ column: columnName, direction: "asc" });
    }
  }, [sorting, activeSort, onSort, pendingChanges]);

  // Virtual window
  const headerHeight = ROW_HEIGHT + 2;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(viewHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const endIdx = Math.min(totalRows, startIdx + visibleCount);

  const visibleDisplayRows = useMemo(() => {
    const slice: Array<{ row: QueryResultRow; rowIdx: number }> = [];
    for (let i = startIdx; i < endIdx; i++) {
      const row = rows[i];
      const changes = pendingChanges[i]?.changes;
      slice.push({
        row: changes ? { ...row, ...changes } : row,
        rowIdx: i,
      });
    }
    return slice;
  }, [rows, pendingChanges, startIdx, endIdx]);

  const beginEdit = useCallback((rowIndex: number, column: QueryResultColumn) => {
    const baseRow = rows[rowIndex];
    if (!baseRow) return;
    const changes = pendingChanges[rowIndex]?.changes;
    const currentValue = changes && column.name in changes ? changes[column.name] : baseRow[column.name];
    if (!canEditRows || !isEditableCellValue(currentValue) || mutating) return;
    setEditingCell({ rowIndex, columnName: column.name });
    setEditValue(formatEditableCellValue(currentValue));
  }, [canEditRows, rows, pendingChanges, mutating]);

  const cancelEditing = useCallback(() => {
    setEditingCell(null);
    setEditValue("");
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const { rowIndex, columnName } = editingCell;
    const originalRow = rows[rowIndex];
    const originalValue = originalRow?.[columnName];
    const column = columns.find((item) => item.name === columnName);
    if (!column || !originalRow) { cancelEditing(); return; }

    const parsedValue = parseEditedValue(editValue, originalValue, column);
    const sameValue = areCellValuesEqual(parsedValue, originalValue);

    setPendingChanges((prev) => {
      const current = prev[rowIndex] ?? { originalRow, changes: {} };
      const nextChanges = { ...current.changes };
      if (sameValue) delete nextChanges[columnName];
      else nextChanges[columnName] = parsedValue;

      if (Object.keys(nextChanges).length === 0) {
        const next = { ...prev };
        delete next[rowIndex];
        return next;
      }
      return { ...prev, [rowIndex]: { originalRow, changes: nextChanges } };
    });
    cancelEditing();
  }, [cancelEditing, columns, editValue, editingCell, rows]);

  const cancelPendingChanges = useCallback(() => {
    setPendingChanges({});
    cancelEditing();
  }, [cancelEditing]);

  const handleSaveChanges = useCallback(async () => {
    if (!canEditRows || !editableInfo?.tableName || !editableInfo.primaryKeyColumns?.length || !onSaveChanges) return;
    const tableName = editableInfo.tableName;
    const request: UpdateRowRequest[] = pendingRowIndexes.map((rowIndex) => {
      const pending = pendingChanges[rowIndex];
      const primaryKey = Object.fromEntries(
        editableInfo.primaryKeyColumns!.map((col) => [col, pending.originalRow[col]]),
      );
      return { tableName, primaryKey, originalValues: pending.originalRow, changes: pending.changes };
    });
    if (request.length === 0) return;
    try {
      const response = await onSaveChanges(request);
      if (!response.error) {
        setPendingChanges({});
        await onRefresh?.();
      }
    } catch (error) {
      console.error("[ResultGrid] Save changes flow failed", error);
    }
  }, [canEditRows, editableInfo, onRefresh, onSaveChanges, pendingChanges, pendingRowIndexes]);

  if (result.columns.length === 0) {
    return <div style={emptyStateStyle}>No columns returned</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={toolbarStyle}>
        <button onClick={handleSaveChanges} disabled={!canEditRows || pendingRowIndexes.length === 0 || !!mutating} style={primaryButtonStyle}>
          Save Changes
        </button>
        <button onClick={cancelPendingChanges} disabled={pendingRowIndexes.length === 0 || !!mutating} style={secondaryButtonStyle}>
          Cancel Changes
        </button>
        <span style={toolbarInfoStyle}>
          {canEditRows ? `${pendingRowIndexes.length} changed` : editableInfo?.reason ?? "This result is read-only"}
        </span>
        {(mutating || sorting) && <span style={loadingStyle}>{sorting ? "Sorting..." : "Applying changes..."}</span>}
      </div>

      <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflow: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr style={{ height: headerHeight }}>
              <th style={rowNumHeaderStyle}>#</th>
              {columns.map((col) => {
                const colSorted = activeSort?.column === col.name;
                const arrow = colSorted ? (activeSort.direction === "asc" ? " \u25B2" : " \u25BC") : "";
                return (
                  <th key={col.name} style={sortableColHeaderStyle} onClick={() => toggleSort(col.name)} title={`Sort by ${col.name}`}>
                    {col.name}
                    {arrow && <span style={sortArrowStyle}>{arrow}</span>}
                    <span style={columnTypeStyle}>{col.dataType}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {startIdx > 0 && (
              <tr style={{ height: startIdx * ROW_HEIGHT }}><td colSpan={columns.length + 1} /></tr>
            )}
            {visibleDisplayRows.map(({ row, rowIdx }) => (
              <tr key={rowIdx} style={{ height: ROW_HEIGHT, background: rowIdx % 2 === 0 ? "transparent" : "var(--bg-surface)" }}>
                <td style={rowNumCellStyle}>{rowIdx + 1}</td>
                {columns.map((col) => {
                  const cellValue = row[col.name];
                  const isEditing = editingCell?.rowIndex === rowIdx && editingCell.columnName === col.name;
                  const isChanged = !!pendingChanges[rowIdx]?.changes && col.name in pendingChanges[rowIdx]!.changes;
                  return (
                    <td
                      key={col.name}
                      style={{ ...dataCellStyle, ...(isChanged ? changedCellStyle : {}) }}
                      onClick={() => {
                        if (!isEditing) beginEdit(rowIdx, col);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !isEditing) { e.preventDefault(); beginEdit(rowIdx, col); }
                        if (e.key === "Escape" && isEditing) { e.preventDefault(); cancelEditing(); }
                      }}
                      tabIndex={canEditRows ? 0 : -1}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                            if (e.key === "Escape") { e.preventDefault(); cancelEditing(); }
                          }}
                          style={inputStyle}
                        />
                      ) : row[col.name] == null ? (
                        <span style={nullCellStyle}>NULL</span>
                      ) : (
                        formatCellDisplay(cellValue, col)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {endIdx < totalRows && (
              <tr style={{ height: (totalRows - endIdx) * ROW_HEIGHT }}><td colSpan={columns.length + 1} /></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={statusBarStyle}>
        <span>Showing {result.rowCount} row{result.rowCount !== 1 ? "s" : ""} in {formatDuration(result.executionTimeMs)}</span>
        {result.hasMore && (loadingMore
          ? <span style={loadingStyle}>Loading more...</span>
          : <button onClick={onLoadMore} style={loadMoreButtonStyle}>Load more rows</button>
        )}
        {result.hasMore && <span style={mutedItalicStyle}>Result limited for performance. Load more to continue.</span>}
        {!result.hasMore && result.rowCount > 0 && <span style={mutedItalicStyle}>All rows loaded</span>}
      </div>
    </div>
  );
});

// ─── Helpers ────────────────────────────────────────────────────────

function formatEditableCellValue(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function parseEditedValue(value: string, originalValue: unknown, column: QueryResultColumn): unknown {
  if (value.trim().toUpperCase() === "NULL") return null;
  if (value === "" && originalValue == null) return null;
  const type = column.dataType.toUpperCase();
  if (typeof originalValue === "number" || /\bNUMBER\b|\bFLOAT\b|\bBINARY_FLOAT\b|\bBINARY_DOUBLE\b|\bINTEGER\b|\bDECIMAL\b/.test(type)) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }
  if (typeof originalValue === "boolean") {
    if (value.trim().toLowerCase() === "true") return true;
    if (value.trim().toLowerCase() === "false") return false;
  }
  return value;
}

function areCellValuesEqual(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  return a === b;
}

function isEditableCellValue(value: unknown): boolean {
  return value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

// ─── Styles ─────────────────────────────────────────────────────────

const emptyStateStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: "var(--font-size-sm)" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-sm)", fontFamily: "var(--font-mono)", tableLayout: "auto" };
const toolbarStyle: React.CSSProperties = { padding: "6px 12px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--border-color)", background: "var(--bg-secondary)", flexShrink: 0 };
const toolbarInfoStyle: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)" };
const loadingStyle: React.CSSProperties = { fontSize: 11, color: "var(--accent)", animation: "pulse 1s infinite", marginLeft: "auto" };
const statusBarStyle: React.CSSProperties = { padding: "4px 12px", fontSize: 11, color: "var(--text-muted)", borderTop: "1px solid var(--border-color)", background: "var(--bg-secondary)", flexShrink: 0, display: "flex", alignItems: "center", gap: 12 };
const mutedItalicStyle: React.CSSProperties = { color: "var(--text-muted)", fontStyle: "italic" };
const primaryButtonStyle: React.CSSProperties = { padding: "3px 10px", fontSize: 11, background: "var(--accent)", color: "var(--bg-primary)", border: "none", borderRadius: "var(--radius)", fontWeight: 600 };
const secondaryButtonStyle: React.CSSProperties = { padding: "3px 10px", fontSize: 11, background: "transparent", border: "1px solid var(--border-color)", borderRadius: "var(--radius)", color: "var(--text-secondary)" };
const loadMoreButtonStyle: React.CSSProperties = { padding: "1px 10px", fontSize: 11, background: "transparent", border: "1px solid var(--accent)", borderRadius: "var(--radius)", color: "var(--accent)", cursor: "pointer" };
const rowNumHeaderStyle: React.CSSProperties = { position: "sticky", top: 0, padding: "6px 10px", textAlign: "right", background: "var(--bg-surface)", borderBottom: "1px solid var(--border-color)", borderRight: "1px solid var(--border-subtle)", color: "var(--text-muted)", fontWeight: 400, fontSize: 11, width: 1, whiteSpace: "nowrap", zIndex: 1 };
const sortableColHeaderStyle: React.CSSProperties = { position: "sticky", top: 0, padding: "6px 12px", textAlign: "left", background: "var(--bg-surface)", borderBottom: "1px solid var(--border-color)", color: "var(--accent)", fontWeight: 600, whiteSpace: "nowrap", zIndex: 1, cursor: "pointer", userSelect: "none" };
const sortArrowStyle: React.CSSProperties = { fontSize: 10, marginLeft: 2 };
const columnTypeStyle: React.CSSProperties = { color: "var(--text-muted)", fontWeight: 400, marginLeft: 6, fontSize: 11 };
const rowNumCellStyle: React.CSSProperties = { padding: "4px 10px", textAlign: "right", borderBottom: "1px solid var(--border-subtle)", borderRight: "1px solid var(--border-subtle)", color: "var(--text-muted)", fontSize: 11, userSelect: "none" };
const dataCellStyle: React.CSSProperties = { padding: "4px 12px", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-secondary)", whiteSpace: "nowrap", maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis" };
const changedCellStyle: React.CSSProperties = { background: "rgba(125, 211, 252, 0.12)", boxShadow: "inset 0 0 0 1px rgba(125, 211, 252, 0.28)", color: "var(--text-primary)" };
const inputStyle: React.CSSProperties = { width: "100%", height: INPUT_HEIGHT, padding: "0 6px", background: "var(--bg-primary)", border: "1px solid var(--accent)", borderRadius: 4, color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "var(--font-size-sm)", outline: "none" };
const nullCellStyle: React.CSSProperties = { color: "var(--text-muted)", fontStyle: "italic" };

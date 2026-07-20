import { memo, useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Check, X } from "lucide-react";
import type { BindParameterValue, QueryExportColumn, QueryResultColumn, QueryResultRow, SqlExecutionResponse, UpdateRowRequest } from "@gavadb/types";
import { formatDuration } from "@gavadb/utils";
import { countRender } from "../lib/perfLog";
import { ExportResultDialog } from "./ExportResultDialog";
import { useResultExport } from "../hooks/useResultExport";
import { useToastContext } from "../hooks/ToastContext";

export type SortDirection = "asc" | "desc";
export interface SortState {
  column: string;
  direction: SortDirection;
}

interface ResultGridProps {
  result: SqlExecutionResponse;
  exportQuery?: {
    sql: string;
    binds?: Record<string, BindParameterValue>;
    orderBy?: SortState | null;
    columns: QueryExportColumn[];
    suggestedFileName?: string;
  } | null;
  mutating?: boolean;
  loadingMore?: boolean;
  sorting?: boolean;
  activeSort?: SortState | null;
  onLoadMore?: () => void;
  onRefresh?: () => Promise<void>;
  onSaveChanges?: (request: UpdateRowRequest[]) => Promise<{ error?: string }>;
  onSort?: (sort: SortState | null) => void;
  onCountRows?: () => Promise<{ totalRows?: number; error?: string }>;
  onHide?: () => void;
}

interface PendingRowChange {
  originalRow: QueryResultRow;
  changes: QueryResultRow;
}

/** Which cell is currently focused (selected) */
interface CellPosition {
  rowIndex: number;
  colIndex: number;
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
  exportQuery,
  mutating,
  loadingMore,
  sorting,
  activeSort,
  onLoadMore,
  onRefresh,
  onSaveChanges,
  onSort,
  onCountRows,
  onHide,
}: ResultGridProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewHeight, setViewHeight] = useState(400);
  const [pendingChanges, setPendingChanges] = useState<Record<number, PendingRowChange>>({});
  const [selectedCell, setSelectedCell] = useState<CellPosition | null>(null);
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null);
  const [editValue, setEditValue] = useState("");
  const [countingRows, setCountingRows] = useState(false);
  const [totalRowCount, setTotalRowCount] = useState<number | null>(null);
  const [countError, setCountError] = useState<string | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [gridContextMenu, setGridContextMenu] = useState<{ x: number; y: number } | null>(null);
  const { exportResult, exportInProgress, exportProgress, clearExportProgress } = useResultExport();
  const toast = useToastContext();
  const lastExportStageRef = useRef<string | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setViewHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setPendingChanges({});
    setSelectedCell(null);
    setEditingCell(null);
    setEditValue("");
    setTotalRowCount(null);
    setCountError(null);
  }, [result]);

  useEffect(() => {
    if (!exportProgress || exportProgress.stage === lastExportStageRef.current) return;
    lastExportStageRef.current = exportProgress.stage;

    if (exportProgress.stage === "completed") {
      toast.success(exportProgress.message);
      return;
    }

    if (exportProgress.stage === "error") {
      toast.error(exportProgress.message);
    }
  }, [exportProgress, toast]);

  const onScroll = useCallback(() => {
    if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
  }, []);

  useEffect(() => {
    if (!gridContextMenu) return undefined;
    const close = () => setGridContextMenu(null);
    document.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
    };
  }, [gridContextMenu]);

  const handleGridContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setGridContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  countRender("ResultGrid");

  const { rows, columns } = result;
  const totalRows = rows.length;
  const editableInfo = result.editable;
  const canEditRows = !!editableInfo?.enabled && !!editableInfo.tableName && !!editableInfo.primaryKeyColumns?.length;
  const pendingRowIndexes = useMemo(() => Object.keys(pendingChanges).map(Number), [pendingChanges]);

  // Toggle sort: asc → desc → asc
  const toggleSort = useCallback((columnName: string) => {
    if (!onSort || sorting) return;
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

  // ─── Editing logic ───────────────────────────────────────────────

  const beginEdit = useCallback((rowIndex: number, colIndex: number) => {
    const column = columns[colIndex];
    if (!column) return;
    const baseRow = rows[rowIndex];
    if (!baseRow) return;
    const changes = pendingChanges[rowIndex]?.changes;
    const currentValue = changes && column.name in changes ? changes[column.name] : baseRow[column.name];
    if (!canEditRows || !isEditableCellValue(currentValue) || mutating) return;
    setEditingCell({ rowIndex, colIndex });
    setEditValue(formatEditableCellValue(currentValue));
  }, [canEditRows, rows, columns, pendingChanges, mutating]);

  const cancelEditing = useCallback(() => {
    setEditingCell(null);
    setEditValue("");
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const { rowIndex, colIndex } = editingCell;
    const column = columns[colIndex];
    const originalRow = rows[rowIndex];
    if (!column || !originalRow) { cancelEditing(); return; }
    const originalValue = originalRow[column.name];

    const parsedValue = parseEditedValue(editValue, originalValue, column);
    const sameValue = areCellValuesEqual(parsedValue, originalValue);

    setPendingChanges((prev) => {
      const current = prev[rowIndex] ?? { originalRow, changes: {} };
      const nextChanges = { ...current.changes };
      if (sameValue) delete nextChanges[column.name];
      else nextChanges[column.name] = parsedValue;

      if (Object.keys(nextChanges).length === 0) {
        const next = { ...prev };
        delete next[rowIndex];
        return next;
      }
      return { ...prev, [rowIndex]: { originalRow, changes: nextChanges } };
    });
    setEditingCell(null);
    setEditValue("");
    // Keep selection on the same cell after commit
    setSelectedCell({ rowIndex, colIndex });
  }, [cancelEditing, columns, editValue, editingCell, rows]);

  const cancelPendingChanges = useCallback(() => {
    setPendingChanges({});
    setEditingCell(null);
    setEditValue("");
  }, []);

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

  const handleCountRows = useCallback(async () => {
    if (!onCountRows || countingRows) return;
    setCountingRows(true);
    setCountError(null);
    try {
      const res = await onCountRows();
      if (res.error) {
        setCountError(res.error);
      } else if (res.totalRows != null) {
        setTotalRowCount(res.totalRows);
      }
    } catch {
      setCountError("Failed to count rows");
    } finally {
      setCountingRows(false);
    }
  }, [onCountRows, countingRows]);

  const handleExport = useCallback(async (options: { format: "csv" | "xlsx"; delimiter: string; autoFitColumns: boolean }) => {
    if (!exportQuery?.sql.trim()) return;

    lastExportStageRef.current = null;
    const response = await exportResult({
      sql: exportQuery.sql,
      binds: exportQuery.binds,
      orderBy: exportQuery.orderBy ?? undefined,
      columns: exportQuery.columns,
      format: options.format,
      delimiter: options.format === "csv" ? options.delimiter : undefined,
      suggestedFileName: exportQuery.suggestedFileName,
      autoFitColumns: options.format === "xlsx" ? options.autoFitColumns : undefined,
    });

    if (response.data?.canceled) {
      clearExportProgress();
      setExportDialogOpen(false);
      return;
    }

    if (response.data && !response.data.canceled) {
      setExportDialogOpen(false);
    }
  }, [clearExportProgress, exportQuery, exportResult]);

  const handleCopyForAi = useCallback(async () => {
    if (columns.length === 0 || rows.length === 0) return;
    const text = formatRowsForAi(columns, rows);
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${rows.length} linha(s) copiada(s) para a área de transferência.`);
    } catch {
      toast.error("Não foi possível copiar para a área de transferência.");
    }
  }, [columns, rows, toast]);

  // ─── Keyboard navigation ─────────────────────────────────────────

  const focusGrid = useCallback(() => {
    rootRef.current?.focus();
  }, []);

  const scrollCellIntoView = useCallback((rowIndex: number, colIndex: number) => {
    const el = scrollRef.current;
    if (!el) return;

    const rowTop = rowIndex * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    const viewTop = el.scrollTop + headerHeight;
    const viewBottom = el.scrollTop + el.clientHeight;
    if (rowTop < viewTop) {
      el.scrollTop = rowTop - headerHeight;
    } else if (rowBottom > viewBottom) {
      el.scrollTop = rowBottom - el.clientHeight;
    }

    window.requestAnimationFrame(() => {
      const activeCell = tableRef.current?.querySelector<HTMLElement>(`[data-cell-key="${rowIndex}:${colIndex}"]`);
      activeCell?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }, [headerHeight]);

  useEffect(() => {
    if (!selectedCell) return;
    scrollCellIntoView(selectedCell.rowIndex, selectedCell.colIndex);
  }, [selectedCell, scrollCellIntoView]);

  const moveSelection = useCallback((nextRowIndex: number, nextColIndex: number) => {
    const boundedRowIndex = Math.max(0, Math.min(nextRowIndex, totalRows - 1));
    const boundedColIndex = Math.max(0, Math.min(nextColIndex, columns.length - 1));
    setSelectedCell({ rowIndex: boundedRowIndex, colIndex: boundedColIndex });
  }, [columns.length, totalRows]);

  const handleGridKeyDown = useCallback((e: React.KeyboardEvent) => {
    // If we're in editing mode, let the input handle keys
    if (editingCell) return;
    if (totalRows === 0 || columns.length === 0) return;

    const sel = selectedCell;
    if (!sel) {
      // If no cell selected, select first cell on any arrow key
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        moveSelection(0, 0);
      }
      return;
    }

    const { rowIndex, colIndex } = sel;

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        if (rowIndex > 0) {
          moveSelection(rowIndex - 1, colIndex);
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (rowIndex < totalRows - 1) {
          moveSelection(rowIndex + 1, colIndex);
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (colIndex > 0) {
          moveSelection(rowIndex, colIndex - 1);
        }
        break;
      case "ArrowRight":
        e.preventDefault();
        if (colIndex < columns.length - 1) {
          moveSelection(rowIndex, colIndex + 1);
        }
        break;
      case "Tab":
        e.preventDefault();
        if (e.shiftKey) {
          if (colIndex > 0) moveSelection(rowIndex, colIndex - 1);
          else if (rowIndex > 0) moveSelection(rowIndex - 1, columns.length - 1);
        } else {
          if (colIndex < columns.length - 1) moveSelection(rowIndex, colIndex + 1);
          else if (rowIndex < totalRows - 1) moveSelection(rowIndex + 1, 0);
        }
        break;
      case "Enter":
        e.preventDefault();
        if (canEditRows) {
          beginEdit(rowIndex, colIndex);
        }
        break;
      case "Escape":
        e.preventDefault();
        setSelectedCell(null);
        break;
      case "c":
        if (e.ctrlKey || e.metaKey) {
          // Copy cell value to clipboard
          const col = columns[colIndex];
          if (col) {
            const row = rows[rowIndex];
            const changes = pendingChanges[rowIndex]?.changes;
            const value = changes && col.name in changes ? changes[col.name] : row?.[col.name];
            const text = value == null ? "" : formatCellDisplay(value, col);
            void navigator.clipboard.writeText(text);
          }
        }
        break;
    }
  }, [editingCell, selectedCell, totalRows, columns, canEditRows, beginEdit, rows, pendingChanges, moveSelection]);

  const handleCellClick = useCallback((rowIndex: number, colIndex: number) => {
    focusGrid();
    // Single click = select only
    if (editingCell) {
      // If clicking a different cell while editing, commit current edit first
      if (editingCell.rowIndex !== rowIndex || editingCell.colIndex !== colIndex) {
        commitEdit();
      }
    }
    setSelectedCell({ rowIndex, colIndex });
  }, [editingCell, commitEdit, focusGrid]);

  const handleCellDoubleClick = useCallback((rowIndex: number, colIndex: number) => {
    focusGrid();
    if (canEditRows) {
      setSelectedCell({ rowIndex, colIndex });
      beginEdit(rowIndex, colIndex);
    }
  }, [canEditRows, beginEdit, focusGrid]);

  if (result.columns.length === 0) {
    return <div style={emptyStateStyle}>No columns returned</div>;
  }

  return (
    <div
      ref={rootRef}
      style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--result-viewer-bg)" }}
      onKeyDown={handleGridKeyDown}
      tabIndex={0}
    >
      <div style={toolbarStyle}>
        <button
          onClick={handleSaveChanges}
          disabled={!canEditRows || pendingRowIndexes.length === 0 || !!mutating}
          style={{ ...iconButtonStyle, background: "transparent", border: "none", color: pendingRowIndexes.length > 0 ? "var(--success)" : undefined }}
          title="Apply Changes"
          aria-label="Apply Changes"
        >
          <Check size={14} strokeWidth={1.8} />
        </button>
        <button
          onClick={cancelPendingChanges}
          disabled={pendingRowIndexes.length === 0 || !!mutating}
          style={{ ...iconButtonStyle, background: "transparent", border: "none", color: pendingRowIndexes.length > 0 ? "var(--danger)" : undefined }}
          title="Discard Changes"
          aria-label="Discard Changes"
        >
          <X size={14} strokeWidth={1.8} />
        </button>
        {totalRowCount != null && (
          <span style={toolbarInfoStyle}>Total: {totalRowCount.toLocaleString()} rows</span>
        )}
        {countError && <span style={countErrorStyle}>{countError}</span>}
        <span style={toolbarInfoStyle}>
          {canEditRows
            ? pendingRowIndexes.length > 0
              ? `${pendingRowIndexes.length} row(s) modified`
              : " "
            : editableInfo?.reason ?? "Read-only result"
          }
        </span>
        {(mutating || sorting) && <span style={loadingStyle}>{sorting ? "Sorting..." : "Applying changes..."}</span>}
      </div>

      <div ref={scrollRef} onScroll={onScroll} onContextMenu={handleGridContextMenu} style={{ flex: 1, overflow: "auto", background: "var(--grid-bg)" }}>
        <table ref={tableRef} style={tableStyle}>
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
            {visibleDisplayRows.map(({ row, rowIdx }) => {
              const hasRowChanges = !!pendingChanges[rowIdx];
              return (
                <tr
                  key={rowIdx}
                  style={{
                    height: ROW_HEIGHT,
                    background: hasRowChanges
                      ? "var(--row-pending-bg)"
                      : rowIdx % 2 === 0 ? "transparent" : "var(--grid-alt-row-bg)",
                  }}
                >
                  <td style={{
                    ...rowNumCellStyle,
                    ...(hasRowChanges ? { color: "var(--accent)", fontWeight: 600 } : {}),
                  }}>
                    {hasRowChanges ? "\u2022" : ""} {rowIdx + 1}
                  </td>
                  {columns.map((col, colIdx) => {
                    const isSelected = selectedCell?.rowIndex === rowIdx && selectedCell?.colIndex === colIdx;
                    const isEditing = editingCell?.rowIndex === rowIdx && editingCell?.colIndex === colIdx;
                    const isChanged = !!pendingChanges[rowIdx]?.changes && col.name in pendingChanges[rowIdx]!.changes;
                    const cellValue = row[col.name];

                    return (
                      <td
                        key={col.name}
                        data-cell-key={`${rowIdx}:${colIdx}`}
                        onClick={() => handleCellClick(rowIdx, colIdx)}
                        onDoubleClick={() => handleCellDoubleClick(rowIdx, colIdx)}
                        style={{
                          ...dataCellStyle,
                          ...(isChanged ? changedCellStyle : {}),
                          ...(isSelected && !isEditing ? selectedCellStyle : {}),
                          ...(isEditing ? editingCellStyle : {}),
                        }}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitEdit();
                                focusGrid();
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                cancelEditing();
                                setSelectedCell({ rowIndex: rowIdx, colIndex: colIdx });
                                focusGrid();
                              }
                              if (e.key === "Tab") {
                                e.preventDefault();
                                commitEdit();
                                focusGrid();
                                // Move selection after commit
                                if (e.shiftKey) {
                                  if (colIdx > 0) setSelectedCell({ rowIndex: rowIdx, colIndex: colIdx - 1 });
                                  else if (rowIdx > 0) setSelectedCell({ rowIndex: rowIdx - 1, colIndex: columns.length - 1 });
                                } else {
                                  if (colIdx < columns.length - 1) setSelectedCell({ rowIndex: rowIdx, colIndex: colIdx + 1 });
                                  else if (rowIdx < totalRows - 1) setSelectedCell({ rowIndex: rowIdx + 1, colIndex: 0 });
                                }
                              }
                              // Stop propagation so grid handler doesn't also fire
                              e.stopPropagation();
                            }}
                            style={inputStyle}
                          />
                        ) : cellValue == null ? (
                          <span style={nullCellStyle}>NULL</span>
                        ) : (
                          formatCellDisplay(cellValue, col)
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
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

      {gridContextMenu && (
        <div
          style={{ ...gridContextMenuStyle, left: gridContextMenu.x, top: gridContextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {onCountRows && result.statementType === "select" && result.rowCount > 0 && (
            <GridContextMenuButton
              label={countingRows ? "Counting..." : "Count Rows"}
              disabled={countingRows}
              onClick={() => {
                setGridContextMenu(null);
                void handleCountRows();
              }}
            />
          )}
          <GridContextMenuButton
            label={exportInProgress ? "Exporting..." : "Export..."}
            disabled={!exportQuery?.sql || exportInProgress}
            onClick={() => {
              setGridContextMenu(null);
              setExportDialogOpen(true);
            }}
          />
          <GridContextMenuButton
            label="Copy for AI"
            disabled={rows.length === 0}
            onClick={() => {
              setGridContextMenu(null);
              void handleCopyForAi();
            }}
          />
          {onHide && (
            <GridContextMenuButton
              label="Hide Results"
              onClick={() => {
                setGridContextMenu(null);
                onHide();
              }}
            />
          )}
        </div>
      )}

      <ExportResultDialog
        open={exportDialogOpen}
        inProgress={exportInProgress}
        progress={exportProgress}
        onClose={() => {
          if (!exportInProgress) {
            lastExportStageRef.current = null;
            clearExportProgress();
          }
          setExportDialogOpen(false);
        }}
        onConfirm={handleExport}
      />
    </div>
  );
});

// ─── Helpers ────────────────────────────────────────────────────────

/** Markdown table with a column/type header — compact and easy for an LLM to parse. */
function formatRowsForAi(columns: QueryResultColumn[], rows: QueryResultRow[]): string {
  const columnsLine = `Columns: ${columns.map((col) => `${col.name} (${col.dataType})`).join(", ")}`;
  const header = `| ${columns.map((col) => col.name).join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => {
    const cells = columns.map((col) => {
      const value = row[col.name];
      const display = value == null ? "NULL" : formatCellDisplay(value, col);
      return escapeMarkdownCell(display);
    });
    return `| ${cells.join(" | ")} |`;
  });

  return [columnsLine, "", header, separator, ...body].join("\n");
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

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

function GridContextMenuButton({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={gridContextButtonStyle}>
      {label}
    </button>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────

const emptyStateStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: "var(--font-size-sm)" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-sm)", fontFamily: "var(--font-mono)", tableLayout: "auto" };
const toolbarStyle: React.CSSProperties = { padding: "6px 12px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--border-color)", background: "var(--panel-bg)", flexShrink: 0 };
const toolbarInfoStyle: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)" };
const loadingStyle: React.CSSProperties = { fontSize: 11, color: "var(--accent)", animation: "pulse 1s infinite", marginLeft: "auto" };
const statusBarStyle: React.CSSProperties = { padding: "4px 12px", fontSize: 11, color: "var(--text-muted)", borderTop: "1px solid var(--border-color)", background: "var(--panel-bg)", flexShrink: 0, display: "flex", alignItems: "center", gap: 12 };
const mutedItalicStyle: React.CSSProperties = { color: "var(--text-muted)", fontStyle: "italic" };
const iconButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 24,
  padding: 0,
  background: "var(--button-secondary-bg)",
  border: "1px solid var(--border-color)",
  borderRadius: "var(--radius)",
  color: "var(--button-secondary-text)",
  cursor: "pointer",
  flexShrink: 0,
};
const loadMoreButtonStyle: React.CSSProperties = { padding: "1px 10px", fontSize: 11, background: "transparent", border: "1px solid var(--accent)", borderRadius: "var(--radius)", color: "var(--accent)", cursor: "pointer" };
const rowNumHeaderStyle: React.CSSProperties = { position: "sticky", top: 0, padding: "6px 10px", textAlign: "right", background: "var(--grid-header-bg)", borderBottom: "1px solid var(--border-color)", borderRight: "1px solid var(--border-subtle)", color: "var(--text-muted)", fontWeight: 400, fontSize: 11, width: 1, whiteSpace: "nowrap", zIndex: 1 };
const sortableColHeaderStyle: React.CSSProperties = { position: "sticky", top: 0, padding: "6px 12px", textAlign: "left", background: "var(--grid-header-bg)", borderBottom: "1px solid var(--border-color)", color: "var(--accent)", fontWeight: 600, whiteSpace: "nowrap", zIndex: 1, cursor: "pointer", userSelect: "none" };
const sortArrowStyle: React.CSSProperties = { fontSize: 10, marginLeft: 2 };
const columnTypeStyle: React.CSSProperties = { color: "var(--text-muted)", fontWeight: 400, marginLeft: 6, fontSize: 11 };
const rowNumCellStyle: React.CSSProperties = { padding: "4px 10px", textAlign: "right", borderBottom: "1px solid var(--border-subtle)", borderRight: "1px solid var(--border-subtle)", color: "var(--text-muted)", fontSize: 11, userSelect: "none", whiteSpace: "nowrap" };
const dataCellStyle: React.CSSProperties = { padding: "4px 12px", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-secondary)", whiteSpace: "nowrap", maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", cursor: "default" };
const changedCellStyle: React.CSSProperties = { background: "var(--cell-modified-bg)", boxShadow: "inset 0 0 0 1px var(--focus-color)", color: "var(--text-primary)" };
const selectedCellStyle: React.CSSProperties = { outline: "2px solid var(--focus-color)", outlineOffset: -2, background: "var(--cell-selected-bg)" };
const editingCellStyle: React.CSSProperties = { outline: "2px solid var(--focus-color)", outlineOffset: -2, background: "var(--cell-editing-bg)", padding: 2 };
const inputStyle: React.CSSProperties = { width: "100%", height: INPUT_HEIGHT, padding: "0 6px", background: "var(--grid-bg)", border: "1px solid var(--focus-color)", borderRadius: 4, color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "var(--font-size-sm)", outline: "none" };
const nullCellStyle: React.CSSProperties = { color: "var(--text-muted)", fontStyle: "italic" };
const countErrorStyle: React.CSSProperties = { color: "var(--danger)", fontSize: 11 };
const gridContextMenuStyle: React.CSSProperties = {
  position: "fixed",
  zIndex: 200,
  minWidth: 168,
  padding: "4px 0",
  background: "var(--popup-bg)",
  border: "1px solid var(--border-color)",
  boxShadow: "0 8px 24px rgba(0,0,0,0.32)",
};
const gridContextButtonStyle: React.CSSProperties = {
  width: "100%",
  display: "block",
  padding: "6px 12px",
  background: "transparent",
  border: "none",
  borderRadius: 0,
  textAlign: "left",
  fontSize: 12,
};

import { useCallback, useEffect, useRef, useState } from "react";
import type { SqlExecutionResponse, QueryResultRow, UpdateRowRequest, BindMetadata, BindParameterValue } from "@gavadb/types";
import type { DatabaseObjectType } from "@gavadb/types";
import { generateId, extractBindParameters } from "@gavadb/utils";
import { BindParametersModal } from "./BindParametersModal";
import { useSqlExecution } from "../hooks/useSqlExecution";
import { useToastContext } from "../hooks/ToastContext";
import { useObjectResolver } from "../hooks/useObjectResolver";
import type { BatchStatementExecution } from "../lib/sqlBatchExecution";
import type { SqlEditorExecutionSnapshot } from "../lib/sqlExecutionTarget";
import { resolveAllExecutionTargets, resolveSingleExecutionTarget } from "../lib/sqlExecutionTarget";
import { ResultPanel } from "./ResultPanel";
import { SqlCodeEditor, type SqlCodeEditorHandle } from "./SqlCodeEditor";
import { perfLog } from "../lib/perfLog";

// ─── Maximum rows kept in memory per tab ─────────────────────────────
const MAX_ACCUMULATED_ROWS = 5_000;

// ─── Editor state (lightweight, changes on every keystroke) ──────────
interface TabEditorState {
  id: string;
  title: string;
  sql: string;
  currentExecutionSnapshot: SqlEditorExecutionSnapshot | null;
}

// ─── Result state (heavy, changes only on query execution) ───────────
interface SortState {
  column: string;
  direction: "asc" | "desc";
}

interface TabResultState {
  result: SqlExecutionResponse | null;
  batchResults: BatchStatementExecution[] | null;
  allRows: QueryResultRow[];
  executedSql: string | null;
  /** Binds used in the last execution — reused by sort/loadMore/refresh */
  executedBinds: Record<string, BindParameterValue> | null;
  error: string | null;
  executing: boolean;
  loadingMore: boolean;
  mutating: boolean;
  sorting: boolean;
  activeSort: SortState | null;
}

/** Combined view for external consumers / backward compat */
export interface SqlTab extends TabEditorState, TabResultState {}

function createEditorState(index: number): TabEditorState {
  const id = generateId();
  return { id, title: `Query ${index}`, sql: "", currentExecutionSnapshot: null };
}

function createResultState(): TabResultState {
  return {
    result: null,
    batchResults: null,
    allRows: [],
    executedSql: null,
    executedBinds: null,
    error: null,
    executing: false,
    loadingMore: false,
    mutating: false,
    sorting: false,
    activeSort: null,
  };
}

interface SqlEditorProps {
  isConnected: boolean;
  executeTriggerRef: React.MutableRefObject<(() => void) | null>;
  executeAllTriggerRef: React.MutableRefObject<(() => void) | null>;
  onOpenObject: (type: DatabaseObjectType, name: string) => void;
}

const MIN_EDITOR_HEIGHT = 80;
const MIN_RESULT_HEIGHT = 60;

export function SqlEditor({ isConnected, executeTriggerRef, executeAllTriggerRef, onOpenObject }: SqlEditorProps) {
  // ─── Separate editor state from result state ─────────────────────
  const [editorTabs, setEditorTabs] = useState<TabEditorState[]>(() => {
    const first = createEditorState(1);
    return [first];
  });
  const [resultTabs, setResultTabs] = useState<Record<string, TabResultState>>(() => {
    const firstId = editorTabs[0].id;
    return { [firstId]: createResultState() };
  });
  const [activeTabId, setActiveTabId] = useState(() => editorTabs[0].id);
  const [tabCounter, setTabCounter] = useState(2);
  const [splitRatio, setSplitRatio] = useState(0.4);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const { execute: executeSql, updateRows, countRows, inferBinds } = useSqlExecution();

  // ─── Bind parameter modal state ─────────────────────────────────
  const [bindModal, setBindModal] = useState<{
    open: boolean;
    sql: string;
    metadata: BindMetadata[];
  }>({ open: false, sql: "", metadata: [] });
  const bindCacheRef = useRef<Record<string, { raw: string; isNull: boolean }>>({});
  const { resolveObject } = useObjectResolver(isConnected);
  const toast = useToastContext();
  const editorRef = useRef<SqlCodeEditorHandle | null>(null);
  const requestSequenceRef = useRef(0);

  const activeEditorTab = editorTabs.find((t) => t.id === activeTabId) ?? editorTabs[0];
  const activeResultTab = resultTabs[activeTabId] ?? createResultState();

  // ─── Targeted updaters (only touch the state slice that changed) ──
  const updateEditorTab = useCallback((id: string, patch: Partial<TabEditorState>) => {
    setEditorTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const updateResultTab = useCallback((id: string, patch: Partial<TabResultState>) => {
    setResultTabs((prev) => ({ ...prev, [id]: { ...(prev[id] ?? createResultState()), ...patch } }));
  }, []);

  const focusEditor = useCallback(() => {
    window.requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
  }, []);

  const recoverUiState = useCallback((tabId: string, reason: string, restoreFocus = false) => {
    console.debug("[SqlEditor] Recovering UI state", { tabId, reason });
    setResultTabs((prev) => {
      const current = prev[tabId] ?? createResultState();
      if (!current.executing && !current.loadingMore && !current.mutating && !current.sorting) return prev;
      return {
        ...prev,
        [tabId]: {
          ...current,
          executing: false,
          loadingMore: false,
          mutating: false,
          sorting: false,
        },
      };
    });

    if (restoreFocus) {
      focusEditor();
    }
  }, [focusEditor]);

  const runSqlWithBinds = useCallback(async (sql: string, binds?: Record<string, BindParameterValue>) => {
    const tabId = activeTabId;
    updateResultTab(tabId, {
      executing: true,
      error: null,
      allRows: [],
      result: null,
      batchResults: null,
      executedSql: sql,
      executedBinds: binds ?? null,
      activeSort: null,
      sorting: false,
    });

    let shouldRestoreFocus = false;
    try {
      const start = performance.now();
      const result = await executeSql(sql, { binds });
      perfLog("query_execute", performance.now() - start, { sql: sql.slice(0, 80) });

      if (result.data) {
        perfLog("result_size", result.data.rows.length, { hasMore: result.data.hasMore });
        updateResultTab(tabId, {
          result: result.data,
          allRows: result.data.rows,
          executedSql: sql,
          error: null,
        });
        return;
      }

      shouldRestoreFocus = true;
      updateResultTab(tabId, {
        error: result.error ?? "Unknown error",
        result: null,
        allRows: [],
      });
    } catch (error) {
      shouldRestoreFocus = true;
      updateResultTab(tabId, {
        error: error instanceof Error ? error.message : String(error),
        result: null,
        allRows: [],
      });
    } finally {
      recoverUiState(tabId, "runSqlWithBinds", shouldRestoreFocus);
    }
  }, [activeTabId, executeSql, recoverUiState, updateResultTab]);

  const executeActive = useCallback(async () => {
    if (!isConnected) {
      toast.warning("Connect to a database first");
      return;
    }
    const snapshot = editorRef.current?.getExecutionSnapshot();
    const target = snapshot ? resolveSingleExecutionTarget(snapshot) : null;
    if (!target?.sql.trim()) {
      toast.info("Place the cursor on a statement or select a SQL fragment to execute");
      return;
    }

    // Detect bind parameters in the target statement — if any, open the
    // parameters modal and defer execution until the user fills them in.
    const binds = extractBindParameters(target.sql);
    if (binds.length > 0) {
      const inference = await inferBinds(target.sql);
      const metadata: BindMetadata[] = binds.map((b) => {
        const found = inference.data?.find((m) => m.name.toLowerCase() === b.name.toLowerCase());
        return (
          found ?? {
            name: b.name,
            dataType: "UNKNOWN",
            inferred: false,
            nullable: true,
            reason: inference.error ?? "Not inferred",
          }
        );
      });
      setBindModal({ open: true, sql: target.sql, metadata });
      return;
    }

    const tabId = activeTabId;
    updateResultTab(tabId, {
      executing: true,
      error: null,
      allRows: [],
      result: null,
      batchResults: null,
      executedSql: target.sql,
      executedBinds: null,
      activeSort: null,
      sorting: false,
    });

    let shouldRestoreFocus = false;
    try {
      const start = performance.now();
      const result = await executeSql(target.sql);
      perfLog("query_execute", performance.now() - start, { sql: target.sql.slice(0, 80) });

      if (result.data) {
        perfLog("result_size", result.data.rows.length, { hasMore: result.data.hasMore });
        updateResultTab(tabId, {
          result: result.data,
          allRows: result.data.rows,
          executedSql: target.sql,
          error: null,
        });
        return;
      }

      shouldRestoreFocus = true;
      console.warn("[SqlEditor] Query execution failed", { tabId, sql: target.sql });
      updateResultTab(tabId, {
        error: result.error ?? "Unknown error",
        result: null,
        allRows: [],
      });
    } catch (error) {
      shouldRestoreFocus = true;
      console.error("[SqlEditor] Unexpected executeActive failure", error);
      updateResultTab(tabId, {
        error: error instanceof Error ? error.message : String(error),
        result: null,
        allRows: [],
      });
    } finally {
      recoverUiState(tabId, "executeActive", shouldRestoreFocus);
    }
  }, [isConnected, activeTabId, updateResultTab, executeSql, toast, recoverUiState]);

  const executeAll = useCallback(async () => {
    if (!isConnected) {
      toast.warning("Connect to a database first");
      return;
    }

    const snapshot = editorRef.current?.getExecutionSnapshot();
    const targets = snapshot ? resolveAllExecutionTargets(snapshot.document) : [];
    if (targets.length === 0) {
      toast.info("Enter one or more SQL statements to execute");
      return;
    }

    // Execute-all does not support bind parameters — the modal flow only
    // handles single-statement execution. Warn the user up front.
    const withBinds = targets.find((t) => extractBindParameters(t.sql).length > 0);
    if (withBinds) {
      toast.warning("Execute All does not support :bind parameters — run that statement individually (Ctrl+Enter).");
      return;
    }

    const tabId = activeTabId;
    updateResultTab(tabId, {
      executing: true,
      error: null,
      result: null,
      allRows: [],
      batchResults: [],
      executedSql: null,
      activeSort: null,
      sorting: false,
    });

    let shouldRestoreFocus = false;
    const batchResults: BatchStatementExecution[] = [];

    try {
      for (const target of targets) {
        try {
          const result = await executeSql(target.sql);
          if (result.error) {
            shouldRestoreFocus = true;
          }
          batchResults.push({
            id: generateId(),
            target,
            result: result.data ?? null,
            error: result.error ?? null,
          });
          updateResultTab(tabId, { batchResults: [...batchResults] });
        } catch (error) {
          shouldRestoreFocus = true;
          console.error("[SqlEditor] Batch statement failed unexpectedly", error);
          batchResults.push({
            id: generateId(),
            target,
            result: null,
            error: error instanceof Error ? error.message : String(error),
          });
          updateResultTab(tabId, { batchResults: [...batchResults] });
        }
      }
    } finally {
      updateResultTab(tabId, { batchResults });
      recoverUiState(tabId, "executeAll", shouldRestoreFocus);
    }
  }, [activeTabId, executeSql, isConnected, toast, updateResultTab, recoverUiState]);

  const refreshActive = useCallback(async () => {
    const sql = activeResultTab.executedSql?.trim();
    if (!sql) return;

    const tabId = activeTabId;
    const previousResult = activeResultTab.result;
    const previousRows = activeResultTab.allRows;
    updateResultTab(tabId, { executing: true, error: null, batchResults: null });

    let shouldRestoreFocus = false;
    try {
      const sort = activeResultTab.activeSort;
      const result = await executeSql(sql, {
        orderBy: sort ?? undefined,
        binds: activeResultTab.executedBinds ?? undefined,
      });
      if (result.data) {
        updateResultTab(tabId, {
          result: result.data,
          allRows: result.data.rows,
          executedSql: sql,
          error: null,
        });
        return;
      }

      shouldRestoreFocus = true;
      console.warn("[SqlEditor] Refresh failed", { tabId, sql });
      updateResultTab(tabId, {
        result: previousResult,
        allRows: previousRows,
        error: null,
      });
      toast.error(result.error ?? "Failed to refresh results");
    } catch (error) {
      shouldRestoreFocus = true;
      console.error("[SqlEditor] Unexpected refresh failure", error);
      updateResultTab(tabId, {
        result: previousResult,
        allRows: previousRows,
        error: null,
      });
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      recoverUiState(tabId, "refreshActive", shouldRestoreFocus);
    }
  }, [activeResultTab.allRows, activeResultTab.executedSql, activeResultTab.result, activeResultTab.activeSort, activeTabId, executeSql, updateResultTab, toast, recoverUiState]);

  const handleSaveChanges = useCallback(async (request: UpdateRowRequest[]) => {
    const tabId = activeTabId;
    updateResultTab(tabId, { mutating: true });

    try {
      const result = await updateRows(request);
      if (result.error) {
        console.warn("[SqlEditor] Row update failed", { tabId, requestCount: request.length });
        toast.error(result.error);
        return { error: result.error };
      }

      toast.success(`${result.data?.rowsAffected ?? request.length} row(s) applied to pending transaction — Commit to persist`);
      return {};
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[SqlEditor] Unexpected updateRows failure", error);
      toast.error(message);
      return { error: message };
    } finally {
      recoverUiState(tabId, "handleSaveChanges", true);
    }
  }, [activeTabId, toast, updateRows, recoverUiState, updateResultTab]);

  // ─── Sort handler: re-executes the query with ORDER BY on the backend ─
  const handleSort = useCallback(async (sort: SortState | null) => {
    if (!sort) return;

    const tabId = activeTabId;
    const currentTab = resultTabs[tabId] ?? createResultState();
    const sql = currentTab.executedSql?.trim() ?? null;
    const currentResult = currentTab.result;

    if (!sql || !currentResult) return;
    if (currentTab.executing || currentTab.loadingMore || currentTab.mutating || currentTab.sorting) return;

    const sortableColumn = currentResult.columns.find((column) => column.name === sort.column);
    if (!sortableColumn) {
      toast.error(`Unable to sort by column "${sort.column}" because it is not present in the result set.`);
      return;
    }

    const previousSort = currentTab.activeSort;
    const requestId = ++requestSequenceRef.current;
    updateResultTab(tabId, {
      sorting: true,
      error: null,
      activeSort: sort,
    });

    try {
      const result = await executeSql(sql, {
        orderBy: sort,
        binds: currentTab.executedBinds ?? undefined,
      });
      if (requestSequenceRef.current !== requestId) return;

      if (result.data) {
        updateResultTab(tabId, {
          result: result.data,
          allRows: result.data.rows,
          error: null,
          activeSort: sort,
          sorting: false,
        });
        return;
      }

      toast.error(normalizeSortError(sort.column, result.error));
      updateResultTab(tabId, {
        error: null,
        activeSort: previousSort,
        sorting: false,
      });
    } catch (error) {
      if (requestSequenceRef.current !== requestId) return;

      console.error("[SqlEditor] Sort failed", error);
      toast.error(normalizeSortError(sort.column, error instanceof Error ? error.message : String(error)));
      updateResultTab(tabId, {
        error: null,
        activeSort: previousSort,
        sorting: false,
      });
    }
  }, [activeTabId, executeSql, resultTabs, updateResultTab, toast]);
  const loadMore = useCallback(async () => {
    const rt = resultTabs[activeTabId];
    if (!rt?.result || !rt.result.hasMore || rt.loadingMore || rt.executing || rt.sorting || rt.mutating) return;

    const tabId = activeTabId;
    updateResultTab(tabId, { loadingMore: true });

    const executedSql = rt.executedSql?.trim();
    if (!executedSql) {
      recoverUiState(tabId, "loadMore:no-sql");
      return;
    }

    try {
      const result = await executeSql(executedSql, {
        offset: rt.allRows.length,
        orderBy: rt.activeSort ?? undefined,
        binds: rt.executedBinds ?? undefined,
      });

      if (result.data) {
        setResultTabs((prev) => {
          const current = prev[tabId] ?? createResultState();
          let newAllRows = [...current.allRows, ...result.data!.rows];

          // Cap accumulated rows to prevent memory bloat
          const capped = newAllRows.length > MAX_ACCUMULATED_ROWS;
          if (capped) {
            newAllRows = newAllRows.slice(0, MAX_ACCUMULATED_ROWS);
          }

          return {
            ...prev,
            [tabId]: {
              ...current,
              result: {
                ...result.data!,
                rows: newAllRows,
                rowCount: newAllRows.length,
                totalFetched: newAllRows.length,
                hasMore: capped ? false : result.data!.hasMore,
              },
              allRows: newAllRows,
              loadingMore: false,
            },
          };
        });
        return;
      }

      console.warn("[SqlEditor] Load more failed", { tabId, offset: rt.allRows.length });
      toast.error(result.error ?? "Failed to load more rows");
    } catch (error) {
      console.error("[SqlEditor] Unexpected loadMore failure", error);
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      recoverUiState(tabId, "loadMore");
    }
  }, [resultTabs, activeTabId, updateResultTab, executeSql, toast, recoverUiState]);

  const handleCountRows = useCallback(async (): Promise<{ totalRows?: number; error?: string }> => {
    const sql = activeResultTab.executedSql?.trim();
    if (!sql) return { error: "No query to count" };
    const binds = activeResultTab.executedBinds ?? undefined;
    console.debug("[SqlEditor] countRows", {
      tabId: activeTabId,
      sql: sql.slice(0, 120),
      bindNames: binds ? Object.keys(binds) : [],
      bindValues: binds,
    });
    const result = await countRows(sql, binds);
    if (result.data) {
      console.debug("[SqlEditor] countRows result", { total: result.data.totalRows });
      return { totalRows: result.data.totalRows };
    }
    return { error: result.error ?? "Failed to count rows" };
  }, [activeResultTab.executedSql, activeResultTab.executedBinds, activeTabId, countRows]);

  executeTriggerRef.current = executeActive;
  executeAllTriggerRef.current = executeAll;

  const handleOpenObject = useCallback(async (name: string) => {
    if (!isConnected) return;

    try {
      const resolved = await resolveObject(name);
      if (!resolved) return;
      onOpenObject(resolved.type, resolved.name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [isConnected, onOpenObject, resolveObject, toast]);

  const addTab = useCallback(() => {
    const t = createEditorState(tabCounter);
    setTabCounter((c) => c + 1);
    setEditorTabs((prev) => [...prev, t]);
    setResultTabs((prev) => ({ ...prev, [t.id]: createResultState() }));
    setActiveTabId(t.id);
  }, [tabCounter]);

  const closeTab = useCallback((id: string) => {
    setEditorTabs((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((t) => t.id !== id);
      if (activeTabId === id) {
        const closedIdx = prev.findIndex((t) => t.id === id);
        const newActive = next[Math.min(closedIdx, next.length - 1)];
        setActiveTabId(newActive.id);
      }
      return next;
    });
    // Clean up result state for closed tab (free memory)
    setResultTabs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, [activeTabId]);

  const onMouseDown = useCallback(() => { dragging.current = true; }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const totalHeight = rect.height;
      const editorHeight = e.clientY - rect.top;
      const ratio = Math.max(
        MIN_EDITOR_HEIGHT / totalHeight,
        Math.min(editorHeight / totalHeight, 1 - MIN_RESULT_HEIGHT / totalHeight),
      );
      setSplitRatio(ratio);
    };
    const onMouseUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Query tabs */}
      <div style={{
        display: "flex",
        alignItems: "stretch",
        background: "var(--tab-bar-bg)",
        borderBottom: "1px solid var(--border-subtle)",
        flexShrink: 0,
        height: 30,
        overflow: "hidden",
      }}>
        {editorTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const rt = resultTabs[tab.id];
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "0 10px",
                background: isActive ? "var(--tab-active-bg)" : "transparent",
                border: "none",
                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                borderRadius: 0,
                color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                fontSize: 11,
                fontWeight: isActive ? 500 : 400,
                whiteSpace: "nowrap",
              }}
            >
              {tab.title}
              {(rt?.executing || rt?.loadingMore) && <span style={{ color: "var(--warning)" }}>...</span>}
              {editorTabs.length > 1 && (
                <span
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  style={{ marginLeft: 2, fontSize: 13, color: "var(--text-muted)", cursor: "pointer", lineHeight: 1 }}
                >
                  {"\u00D7"}
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={addTab}
          title="New query tab"
          style={{
            padding: "0 8px",
            background: "transparent",
            border: "none",
            borderRadius: 0,
            color: "var(--text-muted)",
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          +
        </button>
      </div>

      {/* Editor area */}
      <div style={{
        flex: `0 0 ${splitRatio * 100}%`,
        display: "flex",
        flexDirection: "column",
        minHeight: MIN_EDITOR_HEIGHT,
        position: "relative",
      }}>
        <div style={{
          padding: "3px 12px",
          fontSize: 11,
          color: "var(--text-muted)",
          background: "var(--panel-bg)",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <span>SQL Editor</span>
          <span>
            {isConnected
              ? `${navigator.platform.includes("Mac") ? "\u2318" : "Ctrl"}+Enter to execute, Shift+${navigator.platform.includes("Mac") ? "\u2318" : "Ctrl"}+Enter to execute all`
              : "Not connected"
            }
          </span>
        </div>
        <div style={{
          padding: "3px 12px",
          fontSize: 11,
          color: "var(--text-muted)",
          background: "var(--panel-bg)",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
          minHeight: 24,
        }}>
          {renderExecutionHint(activeEditorTab.currentExecutionSnapshot)}
        </div>
        <SqlCodeEditor
          ref={editorRef}
          value={activeEditorTab.sql}
          onChange={(value) => updateEditorTab(activeEditorTab.id, { sql: value })}
          onExecute={executeActive}
          onExecuteAll={executeAll}
          onExecutionContextChange={(snapshot) => updateEditorTab(activeEditorTab.id, { currentExecutionSnapshot: snapshot })}
          onOpenObject={handleOpenObject}
          placeholder={isConnected
            ? "Type your SQL query here..."
            : "Connect to a database to start writing queries..."
          }
          disabled={!isConnected}
        />
      </div>

      {/* Splitter */}
      <div
        onMouseDown={onMouseDown}
        style={{
          height: 5,
          cursor: "row-resize",
          background: "var(--border-color)",
          flexShrink: 0,
          position: "relative",
        }}
      >
        <div style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 30,
          height: 3,
          borderRadius: 2,
          background: "var(--text-muted)",
          opacity: 0.4,
        }} />
      </div>

      <BindParametersModal
        open={bindModal.open}
        statementPreview={bindModal.sql}
        metadata={bindModal.metadata}
        initialValues={bindCacheRef.current}
        onCancel={() => setBindModal((m) => ({ ...m, open: false }))}
        onExecute={(binds, cache) => {
          bindCacheRef.current = { ...bindCacheRef.current, ...cache };
          setBindModal((m) => ({ ...m, open: false }));
          void runSqlWithBinds(bindModal.sql, binds);
        }}
      />

      {/* Results area */}
      <div style={{ flex: 1, overflow: "hidden", minHeight: MIN_RESULT_HEIGHT }}>
        <ResultPanel
          result={activeResultTab.result}
          batchResults={activeResultTab.batchResults}
          error={activeResultTab.error}
          executing={activeResultTab.executing}
          isConnected={isConnected}
          mutating={activeResultTab.mutating}
          loadingMore={activeResultTab.loadingMore}
          sorting={activeResultTab.sorting}
          activeSort={activeResultTab.activeSort}
          onLoadMore={loadMore}
          onRefresh={refreshActive}
          onSaveChanges={handleSaveChanges}
          onSort={handleSort}
          onCountRows={handleCountRows}
        />
      </div>
    </div>
  );
}

function renderExecutionHint(snapshot: SqlEditorExecutionSnapshot | null): string {
  if (!snapshot) return "No statement selected";

  const target = resolveSingleExecutionTarget(snapshot);
  if (target?.source === "selection") {
    return `Selection ready to execute (${target.range.end - target.range.start} chars)`;
  }

  if (!snapshot.activeStatement) {
    return snapshot.statements.length > 0
      ? `${snapshot.statements.length} statement(s) detected`
      : "No executable statement detected";
  }

  return `Current statement ${snapshot.activeStatement.index + 1} of ${snapshot.statements.length}`;
}
function normalizeSortError(column: string, message?: string): string {
  const fallback = `Unable to sort by column "${column}".`;
  if (!message) return fallback;
  if (/ORA-00904|invalid identifier/i.test(message)) {
    return `${fallback} The selected column or alias is not sortable in this query result.`;
  }
  return `${fallback} ${message}`;
}


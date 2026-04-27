import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type {
  BindMetadata,
  BindParameterValue,
  DatabaseObjectType,
  QueryExportColumn,
  SearchColumnsRequest,
  UpdateRowRequest,
} from "@gavadb/types";
import { extractBindParameters, generateId } from "@gavadb/utils";
import { useObjectResolver } from "../../hooks/useObjectResolver";
import { useSqlExecution } from "../../hooks/useSqlExecution";
import { useToastContext } from "../../hooks/ToastContext";
import type { BatchStatementExecution } from "../../lib/sqlBatchExecution";
import { perfLog } from "../../lib/perfLog";
import { resolveAllExecutionTargets, resolveSingleExecutionTarget } from "../../lib/sqlExecutionTarget";
import { BindParametersModal } from "../BindParametersModal";
import { ResultPanel } from "../ResultPanel";
import { SqlCodeEditor, type SqlCodeEditorHandle } from "../SqlCodeEditor";
import { SplitResizeHandle } from "./SplitResizeHandle";
import type { BindInputCacheEntry, QueryTabState } from "./queryWorkspaceTypes";

const MAX_ACCUMULATED_ROWS = 5_000;
const MIN_EDITOR_HEIGHT = 96;
const MIN_RESULT_HEIGHT = 88;

interface QueryEditorPaneProps {
  activeTab: QueryTabState | null;
  isConnected: boolean;
  activeConnectionId: string | null;
  resultSplitRatio: number;
  onResultSplitRatioChange: (ratio: number) => void;
  onUpdateTab: (tabId: string, patch: Partial<QueryTabState>) => void;
  onActivateGroup: () => void;
  onOpenObject: (type: DatabaseObjectType, name: string) => void;
  onCloseActiveTab: () => void;
}

interface BindModalState {
  open: boolean;
  tabId: string | null;
  sql: string;
  metadata: BindMetadata[];
}

export interface QueryEditorPaneHandle {
  focus: () => void;
  executeActive: () => void;
  executeAll: () => void;
}

export const QueryEditorPane = forwardRef<QueryEditorPaneHandle, QueryEditorPaneProps>(function QueryEditorPane(
  {
    activeTab,
    isConnected,
    activeConnectionId,
    resultSplitRatio,
    onResultSplitRatioChange,
    onUpdateTab,
    onActivateGroup,
    onOpenObject,
    onCloseActiveTab,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<SqlCodeEditorHandle | null>(null);
  const requestSequenceRef = useRef(0);
  const toast = useToastContext();
  const { execute: executeSql, updateRows, countRows, inferBinds } = useSqlExecution();
  const { resolveObject } = useObjectResolver(isConnected);
  const [bindModal, setBindModal] = useState<BindModalState>({
    open: false,
    tabId: null,
    sql: "",
    metadata: [],
  });

  useEffect(() => {
    if (!activeTab || bindModal.tabId === activeTab.id) return;
    setBindModal({ open: false, tabId: null, sql: "", metadata: [] });
  }, [activeTab, bindModal.tabId]);

  const focusEditor = useCallback(() => {
    window.requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
  }, []);

  const updateTabState = useCallback((tabId: string, patch: Partial<QueryTabState>) => {
    onUpdateTab(tabId, patch);
  }, [onUpdateTab]);

  const recoverUiState = useCallback((tabId: string, restoreFocus = false) => {
    updateTabState(tabId, {
      executing: false,
      loadingMore: false,
      mutating: false,
      sorting: false,
    });

    if (restoreFocus) {
      focusEditor();
    }
  }, [focusEditor, updateTabState]);

  const stampConnection = useCallback((tab: QueryTabState) => (
    activeConnectionId ?? tab.connectionId ?? null
  ), [activeConnectionId]);

  const runSqlWithBinds = useCallback(async (tab: QueryTabState, sql: string, binds?: Record<string, BindParameterValue>) => {
    const tabId = tab.id;
    updateTabState(tabId, {
      executing: true,
      error: null,
      allRows: [],
      result: null,
      batchResults: null,
      executedSql: sql,
      executedBinds: binds ?? null,
      activeSort: null,
      sorting: false,
      connectionId: stampConnection(tab),
    });

    let shouldRestoreFocus = false;
    try {
      const start = performance.now();
      const result = await executeSql(sql, { binds });
      perfLog("query_execute", performance.now() - start, { sql: sql.slice(0, 80) });

      if (result.data) {
        perfLog("result_size", result.data.rows.length, { hasMore: result.data.hasMore });
        updateTabState(tabId, {
          result: result.data,
          allRows: result.data.rows,
          executedSql: sql,
          error: null,
          hasPendingTransaction: isMutationResult(result.data) ? true : tab.hasPendingTransaction,
        });
        return;
      }

      shouldRestoreFocus = true;
      updateTabState(tabId, {
        error: result.error ?? "Unknown error",
        result: null,
        allRows: [],
      });
    } catch (error) {
      shouldRestoreFocus = true;
      updateTabState(tabId, {
        error: error instanceof Error ? error.message : String(error),
        result: null,
        allRows: [],
      });
    } finally {
      recoverUiState(tabId, shouldRestoreFocus);
    }
  }, [executeSql, recoverUiState, stampConnection, updateTabState]);

  const executeActive = useCallback(async () => {
    const tab = activeTab;
    if (!tab) return;

    onActivateGroup();

    if (!isConnected) {
      toast.warning("Connect to a database first");
      return;
    }

    const snapshot = editorRef.current?.getExecutionSnapshot() ?? tab.currentExecutionSnapshot;
    if (snapshot) {
      updateTabState(tab.id, { currentExecutionSnapshot: snapshot });
    }

    const target = snapshot ? resolveSingleExecutionTarget(snapshot) : null;
    if (!target?.sql.trim()) {
      toast.info("Place the cursor on a statement or select a SQL fragment to execute");
      return;
    }

    const binds = extractBindParameters(target.sql);
    if (binds.length > 0) {
      const inference = await inferBinds(target.sql);
      const metadata: BindMetadata[] = binds.map((bind) => {
        const found = inference.data?.find((item) => item.name.toLowerCase() === bind.name.toLowerCase());
        return (
          found ?? {
            name: bind.name,
            dataType: "UNKNOWN",
            inferred: false,
            nullable: true,
            reason: inference.error ?? "Not inferred",
          }
        );
      });

      updateTabState(tab.id, { detectedBinds: metadata });
      setBindModal({ open: true, tabId: tab.id, sql: target.sql, metadata });
      return;
    }

    await runSqlWithBinds(tab, target.sql);
  }, [activeTab, inferBinds, isConnected, onActivateGroup, runSqlWithBinds, toast, updateTabState]);

  const executeAll = useCallback(async () => {
    const tab = activeTab;
    if (!tab) return;

    onActivateGroup();

    if (!isConnected) {
      toast.warning("Connect to a database first");
      return;
    }

    const snapshot = editorRef.current?.getExecutionSnapshot();
    if (snapshot) {
      updateTabState(tab.id, { currentExecutionSnapshot: snapshot });
    }

    const targets = snapshot ? resolveAllExecutionTargets(snapshot.document) : [];
    if (targets.length === 0) {
      toast.info("Enter one or more SQL statements to execute");
      return;
    }

    const withBinds = targets.find((target) => extractBindParameters(target.sql).length > 0);
    if (withBinds) {
      toast.warning("Execute All does not support :bind parameters - run that statement individually (Ctrl+Enter).");
      return;
    }

    updateTabState(tab.id, {
      executing: true,
      error: null,
      result: null,
      allRows: [],
      batchResults: [],
      executedSql: null,
      activeSort: null,
      sorting: false,
      connectionId: stampConnection(tab),
    });

    let shouldRestoreFocus = false;
    const batchResults: BatchStatementExecution[] = [];
    let hasPendingTransaction = tab.hasPendingTransaction;

    try {
      for (const target of targets) {
        try {
          const result = await executeSql(target.sql);
          if (result.error) {
            shouldRestoreFocus = true;
          }

          if (result.data && isMutationResult(result.data)) {
            hasPendingTransaction = true;
          }

          batchResults.push({
            id: generateId(),
            target,
            result: result.data ?? null,
            error: result.error ?? null,
          });
          updateTabState(tab.id, { batchResults: [...batchResults], hasPendingTransaction });
        } catch (error) {
          shouldRestoreFocus = true;
          console.error("[QueryEditorPane] Batch statement failed unexpectedly", error);
          batchResults.push({
            id: generateId(),
            target,
            result: null,
            error: error instanceof Error ? error.message : String(error),
          });
          updateTabState(tab.id, { batchResults: [...batchResults], hasPendingTransaction });
        }
      }
    } finally {
      updateTabState(tab.id, { batchResults, hasPendingTransaction });
      recoverUiState(tab.id, shouldRestoreFocus);
    }
  }, [activeTab, executeSql, isConnected, onActivateGroup, recoverUiState, stampConnection, toast, updateTabState]);

  const refreshActive = useCallback(async () => {
    const tab = activeTab;
    const sql = tab?.executedSql?.trim();
    if (!tab || !sql) return;

    const previousResult = tab.result;
    const previousRows = tab.allRows;
    updateTabState(tab.id, { executing: true, error: null, batchResults: null });

    let shouldRestoreFocus = false;
    try {
      const result = await executeSql(sql, {
        orderBy: tab.activeSort ?? undefined,
        binds: tab.executedBinds ?? undefined,
      });
      if (result.data) {
        updateTabState(tab.id, {
          result: result.data,
          allRows: result.data.rows,
          executedSql: sql,
          error: null,
        });
        return;
      }

      shouldRestoreFocus = true;
      updateTabState(tab.id, {
        result: previousResult,
        allRows: previousRows,
        error: null,
      });
      toast.error(result.error ?? "Failed to refresh results");
    } catch (error) {
      shouldRestoreFocus = true;
      updateTabState(tab.id, {
        result: previousResult,
        allRows: previousRows,
        error: null,
      });
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      recoverUiState(tab.id, shouldRestoreFocus);
    }
  }, [activeTab, executeSql, recoverUiState, toast, updateTabState]);

  const handleSaveChanges = useCallback(async (request: UpdateRowRequest[]) => {
    const tab = activeTab;
    if (!tab) return { error: "No active tab" };

    updateTabState(tab.id, { mutating: true });

    try {
      const result = await updateRows(request);
      if (result.error) {
        toast.error(result.error);
        return { error: result.error };
      }

      updateTabState(tab.id, { hasPendingTransaction: true });
      toast.success(`${result.data?.rowsAffected ?? request.length} row(s) applied to pending transaction - Commit to persist`);
      return {};
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
      return { error: message };
    } finally {
      recoverUiState(tab.id, true);
    }
  }, [activeTab, recoverUiState, toast, updateRows, updateTabState]);

  const handleSort = useCallback(async (sort: QueryTabState["activeSort"]) => {
    const tab = activeTab;
    if (!tab || !sort || !tab.executedSql?.trim() || !tab.result) return;
    if (tab.executing || tab.loadingMore || tab.mutating || tab.sorting) return;

    const sortableColumn = tab.result.columns.find((column) => column.name === sort.column);
    if (!sortableColumn) {
      toast.error(`Unable to sort by column "${sort.column}" because it is not present in the result set.`);
      return;
    }

    const previousSort = tab.activeSort;
    const requestId = ++requestSequenceRef.current;
    updateTabState(tab.id, {
      sorting: true,
      error: null,
      activeSort: sort,
    });

    try {
      const result = await executeSql(tab.executedSql, {
        orderBy: sort,
        binds: tab.executedBinds ?? undefined,
      });
      if (requestSequenceRef.current !== requestId) return;

      if (result.data) {
        updateTabState(tab.id, {
          result: result.data,
          allRows: result.data.rows,
          error: null,
          activeSort: sort,
          sorting: false,
        });
        return;
      }

      toast.error(normalizeSortError(sort.column, result.error));
      updateTabState(tab.id, {
        error: null,
        activeSort: previousSort,
        sorting: false,
      });
    } catch (error) {
      if (requestSequenceRef.current !== requestId) return;
      toast.error(normalizeSortError(sort.column, error instanceof Error ? error.message : String(error)));
      updateTabState(tab.id, {
        error: null,
        activeSort: previousSort,
        sorting: false,
      });
    }
  }, [activeTab, executeSql, toast, updateTabState]);

  const loadMore = useCallback(async () => {
    const tab = activeTab;
    if (!tab?.result || !tab.result.hasMore || tab.loadingMore || tab.executing || tab.sorting || tab.mutating) {
      return;
    }

    const executedSql = tab.executedSql?.trim();
    if (!executedSql) {
      recoverUiState(tab.id);
      return;
    }

    updateTabState(tab.id, { loadingMore: true });

    try {
      const result = await executeSql(executedSql, {
        offset: tab.allRows.length,
        orderBy: tab.activeSort ?? undefined,
        binds: tab.executedBinds ?? undefined,
      });

      if (result.data) {
        let newAllRows = [...tab.allRows, ...result.data.rows];
        const capped = newAllRows.length > MAX_ACCUMULATED_ROWS;
        if (capped) {
          newAllRows = newAllRows.slice(0, MAX_ACCUMULATED_ROWS);
        }

        updateTabState(tab.id, {
          result: {
            ...result.data,
            rows: newAllRows,
            rowCount: newAllRows.length,
            totalFetched: newAllRows.length,
            hasMore: capped ? false : result.data.hasMore,
          },
          allRows: newAllRows,
          loadingMore: false,
        });
        return;
      }

      toast.error(result.error ?? "Failed to load more rows");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      recoverUiState(tab.id);
    }
  }, [activeTab, executeSql, recoverUiState, toast, updateTabState]);

  const handleCountRows = useCallback(async (): Promise<{ totalRows?: number; error?: string }> => {
    const tab = activeTab;
    const sql = tab?.executedSql?.trim();
    if (!tab || !sql) return { error: "No query to count" };

    const result = await countRows(sql, tab.executedBinds ?? undefined);
    if (result.data) {
      return { totalRows: result.data.totalRows };
    }
    return { error: result.error ?? "Failed to count rows" };
  }, [activeTab, countRows]);

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

  const handleSearchObjectsByPrefix = useCallback(async (prefix: string, limit?: number) => {
    if (!isConnected) return [];

    const result = await window.gavadb.dbSearchObjects(prefix, limit);
    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }, [isConnected]);

  const handleSearchColumns = useCallback(async (request: SearchColumnsRequest) => {
    if (!isConnected) return [];

    const result = await window.gavadb.dbSearchColumns(request);
    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }, [isConnected]);

  const saveActiveFile = useCallback(async (saveAs = false) => {
    const tab = activeTab;
    if (!tab) return;

    try {
      const result = await window.gavadb.saveFile(tab.sql, saveAs ? undefined : tab.filePath ?? undefined);
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      if (!result.data) return;

      updateTabState(tab.id, { filePath: result.data });
      toast.success("SQL file saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      focusEditor();
    }
  }, [activeTab, focusEditor, toast, updateTabState]);

  const exportColumns = useMemo<QueryExportColumn[]>(
    () => (activeTab?.result?.columns ?? []).map((column) => ({
      key: column.name,
      label: column.name,
      dataType: column.dataType,
      visible: true,
    })),
    [activeTab?.result?.columns],
  );

  const exportQuery = useMemo(() => {
    const sql = activeTab?.executedSql?.trim();
    if (!sql || !activeTab?.result || activeTab.result.statementType !== "select") return null;

    return {
      sql,
      binds: activeTab.executedBinds ?? undefined,
      orderBy: activeTab.activeSort,
      columns: exportColumns,
      suggestedFileName: `query-results-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`,
    };
  }, [activeTab, exportColumns]);

  useImperativeHandle(ref, () => ({
    focus: focusEditor,
    executeActive: () => {
      void executeActive();
    },
    executeAll: () => {
      void executeAll();
    },
  }), [executeActive, executeAll, focusEditor]);

  if (!activeTab) {
    return <div style={{ flex: 1, background: "var(--panel-bg)" }} />;
  }

  return (
    <div
      ref={containerRef}
      onFocusCapture={onActivateGroup}
      onMouseDownCapture={onActivateGroup}
      style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}
    >
      <div style={{
        flex: `0 0 ${resultSplitRatio * 100}%`,
        display: "flex",
        flexDirection: "column",
        minHeight: MIN_EDITOR_HEIGHT,
        position: "relative",
        background: "var(--panel-bg)",
      }}>
        <div style={{
          padding: "4px 12px",
          fontSize: 11,
          color: "var(--text-muted)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0))",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
          minHeight: 24,
        }}>
          {renderExecutionHint(activeTab.currentExecutionSnapshot)}
        </div>

        <SqlCodeEditor
          ref={editorRef}
          value={activeTab.sql}
          onChange={(value) => updateTabState(activeTab.id, { sql: value })}
          onExecute={() => void executeActive()}
          onExecuteAll={() => void executeAll()}
          onSave={() => void saveActiveFile(false)}
          onSaveAs={() => void saveActiveFile(true)}
          onCloseTab={onCloseActiveTab}
          onExecutionContextChange={(snapshot) => updateTabState(activeTab.id, { currentExecutionSnapshot: snapshot })}
          onOpenObject={handleOpenObject}
          onSearchObjectsByPrefix={handleSearchObjectsByPrefix}
          onSearchColumns={handleSearchColumns}
          placeholder={isConnected
            ? "Type your SQL query here..."
            : "Connect to a database to start writing queries..."
          }
          disabled={false}
        />
      </div>

      <SplitResizeHandle
        axis="vertical"
        containerRef={containerRef}
        minPrimarySize={MIN_EDITOR_HEIGHT}
        minSecondarySize={MIN_RESULT_HEIGHT}
        onChange={onResultSplitRatioChange}
      />

      <BindParametersModal
        open={bindModal.open}
        statementPreview={bindModal.sql}
        metadata={bindModal.metadata}
        initialValues={activeTab.bindInputCache as Record<string, BindInputCacheEntry>}
        onCancel={() => setBindModal({ open: false, tabId: null, sql: "", metadata: [] })}
        onExecute={(binds, cache) => {
          const current = activeTab;
          if (!current) return;

          updateTabState(current.id, {
            bindInputCache: { ...current.bindInputCache, ...cache },
          });
          setBindModal({ open: false, tabId: null, sql: "", metadata: [] });
          void runSqlWithBinds(current, bindModal.sql, binds);
        }}
      />

      <div style={{ flex: 1, overflow: "hidden", minHeight: MIN_RESULT_HEIGHT, background: "var(--result-viewer-bg)" }}>
        <ResultPanel
          result={activeTab.result}
          exportQuery={exportQuery}
          batchResults={activeTab.batchResults}
          error={activeTab.error}
          executing={activeTab.executing}
          isConnected={isConnected}
          mutating={activeTab.mutating}
          loadingMore={activeTab.loadingMore}
          sorting={activeTab.sorting}
          activeSort={activeTab.activeSort}
          onLoadMore={loadMore}
          onRefresh={refreshActive}
          onSaveChanges={handleSaveChanges}
          onSort={handleSort}
          onCountRows={handleCountRows}
        />
      </div>
    </div>
  );
});

function renderExecutionHint(snapshot: QueryTabState["currentExecutionSnapshot"]): string {
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

function isMutationResult(result: { statementType: string; rowsAffected: number }) {
  return result.statementType === "dml" && result.rowsAffected > 0;
}

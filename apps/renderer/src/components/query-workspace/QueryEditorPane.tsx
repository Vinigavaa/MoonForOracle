import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from "react";
import type {
  BindMetadata,
  BindParameterValue,
  DatabaseObjectType,
  QueryExportColumn,
  SearchColumnsRequest,
  SqlColumnSuggestion,
  DatabaseObjectSuggestion,
  UpdateRowRequest,
} from "@gavadb/types";
import { extractBindParameters } from "@gavadb/utils";
import { useSqlExecution } from "../../hooks/useSqlExecution";
import { useToastContext } from "../../hooks/ToastContext";
import { useObjectResolver } from "../../hooks/useObjectResolver";
import { resolveAllExecutionTargets, resolveSingleExecutionTarget } from "../../lib/sqlExecutionTarget";
import { BindParametersModal } from "../BindParametersModal";
import { ResultPanel } from "../ResultPanel";
import { SqlCodeEditor, type SqlCodeEditorHandle } from "../SqlCodeEditor";
import { SplitResizeHandle } from "./SplitResizeHandle";
import type { BindInputCacheEntry, QueryTabState } from "./queryWorkspaceTypes";

interface QueryEditorPaneProps {
  activeTab: QueryTabState;
  isConnected: boolean;
  activeConnectionId: string | null;
  resultSplitRatio: number;
  onResultSplitRatioChange: (ratio: number) => void;
  onUpdateTab: (tabId: string, patch: Partial<QueryTabState>) => void;
  onActivateGroup: () => void;
  onOpenObject: (type: DatabaseObjectType, name: string) => void;
  onCloseActiveTab: () => void;
}

export interface QueryEditorPaneHandle {
  focus: () => void;
  executeActive: () => void;
  executeAll: () => void;
}

const MIN_EDITOR_HEIGHT = 80;
const MIN_RESULT_HEIGHT = 60;
const MAX_ACCUMULATED_ROWS = 5_000;

export const QueryEditorPane = forwardRef<QueryEditorPaneHandle, QueryEditorPaneProps>(function QueryEditorPane(
  {
    activeTab,
    isConnected,
    resultSplitRatio,
    onResultSplitRatioChange,
    onUpdateTab,
    onActivateGroup,
    onOpenObject,
    onCloseActiveTab,
  },
  ref,
) {
  const toast = useToastContext();
  const { execute, updateRows, countRows, inferBinds } = useSqlExecution();
  const { resolveObject } = useObjectResolver(isConnected);
  const editorRef = useRef<SqlCodeEditorHandle | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const exportColumns = useMemo<QueryExportColumn[]>(
    () => (activeTab.result?.columns ?? []).map((column) => ({
      key: column.name,
      label: column.name,
      dataType: column.dataType,
      visible: true,
    })),
    [activeTab.result?.columns],
  );

  const exportQuery = useMemo(() => {
    const sql = activeTab.executedSql?.trim();
    if (!sql || !activeTab.result || activeTab.result.statementType !== "select") return null;
    return {
      sql,
      binds: activeTab.executedBinds ?? undefined,
      orderBy: activeTab.activeSort,
      columns: exportColumns,
      suggestedFileName: `query-results-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`,
    };
  }, [activeTab.activeSort, activeTab.executedBinds, activeTab.executedSql, activeTab.result, exportColumns]);

  const bindStatementPreview = useMemo(() => {
    const snapshot = activeTab.currentExecutionSnapshot;
    if (!snapshot) return activeTab.executedSql ?? activeTab.sql;
    return resolveSingleExecutionTarget(snapshot)?.sql ?? activeTab.executedSql ?? activeTab.sql;
  }, [activeTab.currentExecutionSnapshot, activeTab.executedSql, activeTab.sql]);

  const focusEditor = useCallback(() => {
    window.requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
  }, []);

  const applyPatch = useCallback((patch: Partial<QueryTabState>) => {
    onUpdateTab(activeTab.id, patch);
  }, [activeTab.id, onUpdateTab]);

  const recoverUiState = useCallback((restoreFocus = false) => {
    applyPatch({
      executing: false,
      loadingMore: false,
      mutating: false,
      sorting: false,
    });

    if (restoreFocus) {
      focusEditor();
    }
  }, [applyPatch, focusEditor]);

  const runSqlWithBinds = useCallback(async (sql: string, binds?: Record<string, BindParameterValue>) => {
    applyPatch({
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
      const result = await execute(sql, { binds });
      if (result.data) {
        applyPatch({
          result: result.data,
          allRows: result.data.rows,
          executedSql: sql,
          error: null,
          hasPendingTransaction: result.data.statementType === "dml" ? true : activeTab.hasPendingTransaction,
        });
        return;
      }

      shouldRestoreFocus = true;
      applyPatch({
        error: result.error ?? "Unknown error",
        result: null,
        allRows: [],
      });
    } catch (error) {
      shouldRestoreFocus = true;
      applyPatch({
        error: error instanceof Error ? error.message : String(error),
        result: null,
        allRows: [],
      });
    } finally {
      recoverUiState(shouldRestoreFocus);
    }
  }, [activeTab.hasPendingTransaction, applyPatch, execute, recoverUiState]);

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

    const binds = extractBindParameters(target.sql);
    if (binds.length > 0) {
      const inference = await inferBinds(target.sql);
      const detectedBinds: BindMetadata[] = binds.map((bind) => {
        const found = inference.data?.find((meta) => meta.name.toLowerCase() === bind.name.toLowerCase());
        return found ?? {
          name: bind.name,
          dataType: "UNKNOWN",
          inferred: false,
          nullable: true,
          reason: inference.error ?? "Not inferred",
        };
      });

      applyPatch({
        detectedBinds,
      });
      return;
    }

    applyPatch({
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
      const result = await execute(target.sql);
      if (result.data) {
        applyPatch({
          result: result.data,
          allRows: result.data.rows,
          executedSql: target.sql,
          error: null,
          hasPendingTransaction: result.data.statementType === "dml" ? true : activeTab.hasPendingTransaction,
        });
        return;
      }

      shouldRestoreFocus = true;
      applyPatch({
        error: result.error ?? "Unknown error",
        result: null,
        allRows: [],
      });
    } catch (error) {
      shouldRestoreFocus = true;
      applyPatch({
        error: error instanceof Error ? error.message : String(error),
        result: null,
        allRows: [],
      });
    } finally {
      recoverUiState(shouldRestoreFocus);
    }
  }, [activeTab.hasPendingTransaction, applyPatch, execute, inferBinds, isConnected, recoverUiState, toast]);

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

    const withBinds = targets.find((target) => extractBindParameters(target.sql).length > 0);
    if (withBinds) {
      toast.warning("Execute All does not support :bind parameters — run that statement individually (Ctrl+Enter).");
      return;
    }

    applyPatch({
      executing: true,
      error: null,
      result: null,
      allRows: [],
      batchResults: [],
      executedSql: null,
      activeSort: null,
      sorting: false,
    });

    const batchResults = [];
    let hasPendingTransaction = activeTab.hasPendingTransaction;
    let shouldRestoreFocus = false;

    try {
      for (const target of targets) {
        try {
          const result = await execute(target.sql);
          if (result.error) {
            shouldRestoreFocus = true;
          }
          if (result.data?.statementType === "dml") {
            hasPendingTransaction = true;
          }
          batchResults.push({
            id: crypto.randomUUID(),
            target,
            result: result.data ?? null,
            error: result.error ?? null,
          });
          applyPatch({ batchResults: [...batchResults], hasPendingTransaction });
        } catch (error) {
          shouldRestoreFocus = true;
          batchResults.push({
            id: crypto.randomUUID(),
            target,
            result: null,
            error: error instanceof Error ? error.message : String(error),
          });
          applyPatch({ batchResults: [...batchResults], hasPendingTransaction });
        }
      }
    } finally {
      applyPatch({ batchResults: [...batchResults], hasPendingTransaction });
      recoverUiState(shouldRestoreFocus);
    }
  }, [activeTab.hasPendingTransaction, applyPatch, execute, isConnected, recoverUiState, toast]);

  const refreshActive = useCallback(async () => {
    const sql = activeTab.executedSql?.trim();
    if (!sql) return;

    const previousResult = activeTab.result;
    const previousRows = activeTab.allRows;
    applyPatch({ executing: true, error: null, batchResults: null });

    let shouldRestoreFocus = false;
    try {
      const result = await execute(sql, {
        orderBy: activeTab.activeSort ?? undefined,
        binds: activeTab.executedBinds ?? undefined,
      });

      if (result.data) {
        applyPatch({
          result: result.data,
          allRows: result.data.rows,
          executedSql: sql,
          error: null,
        });
        return;
      }

      shouldRestoreFocus = true;
      applyPatch({
        result: previousResult,
        allRows: previousRows,
        error: null,
      });
      toast.error(result.error ?? "Failed to refresh results");
    } catch (error) {
      shouldRestoreFocus = true;
      applyPatch({
        result: previousResult,
        allRows: previousRows,
        error: null,
      });
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      recoverUiState(shouldRestoreFocus);
    }
  }, [activeTab.activeSort, activeTab.allRows, activeTab.executedBinds, activeTab.executedSql, activeTab.result, applyPatch, execute, recoverUiState, toast]);

  const handleSaveChanges = useCallback(async (request: UpdateRowRequest[]) => {
    applyPatch({ mutating: true });

    try {
      const result = await updateRows(request);
      if (result.error) {
        toast.error(result.error);
        return { error: result.error };
      }

      applyPatch({ hasPendingTransaction: true });
      toast.success(`${result.data?.rowsAffected ?? request.length} row(s) applied to pending transaction — Commit to persist`);
      return {};
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
      return { error: message };
    } finally {
      recoverUiState(true);
    }
  }, [applyPatch, recoverUiState, toast, updateRows]);

  const handleSort = useCallback(async (sort: QueryTabState["activeSort"]) => {
    if (!sort) return;
    if (!activeTab.executedSql?.trim() || !activeTab.result) return;
    if (activeTab.executing || activeTab.loadingMore || activeTab.mutating || activeTab.sorting) return;

    const sortableColumn = activeTab.result.columns.find((column) => column.name === sort.column);
    if (!sortableColumn) {
      toast.error(`Unable to sort by column "${sort.column}" because it is not present in the result set.`);
      return;
    }

    const previousSort = activeTab.activeSort;
    applyPatch({
      sorting: true,
      error: null,
      activeSort: sort,
    });

    try {
      const result = await execute(activeTab.executedSql, {
        orderBy: sort,
        binds: activeTab.executedBinds ?? undefined,
      });

      if (result.data) {
        applyPatch({
          result: result.data,
          allRows: result.data.rows,
          error: null,
          activeSort: sort,
          sorting: false,
        });
        return;
      }

      toast.error(normalizeSortError(sort.column, result.error));
      applyPatch({
        error: null,
        activeSort: previousSort,
        sorting: false,
      });
    } catch (error) {
      toast.error(normalizeSortError(sort.column, error instanceof Error ? error.message : String(error)));
      applyPatch({
        error: null,
        activeSort: previousSort,
        sorting: false,
      });
    }
  }, [activeTab.activeSort, activeTab.executedBinds, activeTab.executedSql, activeTab.executing, activeTab.loadingMore, activeTab.mutating, activeTab.result, activeTab.sorting, applyPatch, execute, toast]);

  const loadMore = useCallback(async () => {
    if (!activeTab.result || !activeTab.result.hasMore || activeTab.loadingMore || activeTab.executing || activeTab.sorting || activeTab.mutating) {
      return;
    }

    applyPatch({ loadingMore: true });
    const executedSql = activeTab.executedSql?.trim();
    if (!executedSql) {
      recoverUiState();
      return;
    }

    try {
      const result = await execute(executedSql, {
        offset: activeTab.allRows.length,
        orderBy: activeTab.activeSort ?? undefined,
        binds: activeTab.executedBinds ?? undefined,
      });

      if (result.data) {
        let newAllRows = [...activeTab.allRows, ...result.data.rows];
        const capped = newAllRows.length > MAX_ACCUMULATED_ROWS;
        if (capped) {
          newAllRows = newAllRows.slice(0, MAX_ACCUMULATED_ROWS);
        }

        applyPatch({
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
      recoverUiState();
    }
  }, [activeTab.activeSort, activeTab.allRows, activeTab.executedBinds, activeTab.executedSql, activeTab.executing, activeTab.loadingMore, activeTab.mutating, activeTab.result, activeTab.sorting, applyPatch, execute, recoverUiState, toast]);

  const handleCountRows = useCallback(async (): Promise<{ totalRows?: number; error?: string }> => {
    const sql = activeTab.executedSql?.trim();
    if (!sql) return { error: "No query to count" };
    const binds = activeTab.executedBinds ?? undefined;
    const result = await countRows(sql, binds);
    if (result.data) {
      return { totalRows: result.data.totalRows };
    }
    return { error: result.error ?? "Failed to count rows" };
  }, [activeTab.executedBinds, activeTab.executedSql, countRows]);

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

  const handleSearchObjectsByPrefix = useCallback(async (prefix: string, limit?: number): Promise<DatabaseObjectSuggestion[]> => {
    if (!isConnected) return [];
    const result = await window.gavadb.dbSearchObjects(prefix, limit);
    if (!result.success) {
      throw new Error(result.error.message);
    }
    return result.data;
  }, [isConnected]);

  const handleSearchColumns = useCallback(async (request: SearchColumnsRequest): Promise<SqlColumnSuggestion[]> => {
    if (!isConnected) return [];
    const result = await window.gavadb.dbSearchColumns(request);
    if (!result.success) {
      throw new Error(result.error.message);
    }
    return result.data;
  }, [isConnected]);

  const saveActiveFile = useCallback(async (saveAs = false) => {
    try {
      const result = await window.gavadb.saveFile(activeTab.sql, saveAs ? undefined : activeTab.filePath ?? undefined);
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      if (!result.data) {
        return;
      }

      applyPatch({ filePath: result.data });
      toast.success("SQL file saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      focusEditor();
    }
  }, [activeTab.filePath, activeTab.sql, applyPatch, focusEditor, toast]);

  useImperativeHandle(ref, () => ({
    focus: focusEditor,
    executeActive: () => {
      void executeActive();
    },
    executeAll: () => {
      void executeAll();
    },
  }), [executeActive, executeAll, focusEditor]);

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{
        padding: "3px 12px",
        fontSize: 11,
        color: "var(--text-muted)",
        background: "var(--panel-bg)",
        borderBottom: "1px solid var(--border-subtle)",
        flexShrink: 0,
        minHeight: 24,
      }}>
        {renderExecutionHint(activeTab.currentExecutionSnapshot)}
      </div>

      <div style={{ flex: `0 0 ${resultSplitRatio * 100}%`, minHeight: MIN_EDITOR_HEIGHT, overflow: "hidden" }}>
        <SqlCodeEditor
          ref={editorRef}
          value={activeTab.sql}
          onChange={(value) => applyPatch({ sql: value })}
          onExecute={() => void executeActive()}
          onExecuteAll={() => void executeAll()}
          onSave={() => void saveActiveFile(false)}
          onSaveAs={() => void saveActiveFile(true)}
          onExecutionContextChange={(snapshot) => applyPatch({ currentExecutionSnapshot: snapshot })}
          onOpenObject={handleOpenObject}
          onSearchObjectsByPrefix={handleSearchObjectsByPrefix}
          onSearchColumns={handleSearchColumns}
          onCloseTab={onCloseActiveTab}
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
        open={activeTab.detectedBinds.length > 0}
        statementPreview={bindStatementPreview}
        metadata={activeTab.detectedBinds}
        initialValues={activeTab.bindInputCache}
        onCancel={() => applyPatch({ detectedBinds: [] })}
        onExecute={(binds, cache) => {
          applyPatch({
            detectedBinds: [],
            bindInputCache: {
              ...activeTab.bindInputCache,
              ...(cache as Record<string, BindInputCacheEntry>),
            },
          });
          void runSqlWithBinds(bindStatementPreview, binds);
        }}
      />

      <div style={{ flex: 1, overflow: "hidden", minHeight: MIN_RESULT_HEIGHT }}>
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

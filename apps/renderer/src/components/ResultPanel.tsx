import { memo } from "react";
import type { BindParameterValue, DbmsOutputLine, QueryExportColumn, SqlExecutionResponse, UpdateRowRequest } from "@gavadb/types";
import type { BatchStatementExecution } from "../lib/sqlBatchExecution";
import { BatchResultPanel } from "./BatchResultPanel";
import { DbmsOutputViewer } from "./DbmsOutputViewer";
import { QueryResultTabs } from "./QueryResultTabs";
import { ResultGrid, type SortState } from "./ResultGrid";
import { StatementFeedback } from "./StatementFeedback";

interface ResultPanelProps {
  result: SqlExecutionResponse | null;
  exportQuery?: {
    sql: string;
    binds?: Record<string, BindParameterValue>;
    orderBy?: SortState | null;
    columns: QueryExportColumn[];
    suggestedFileName?: string;
  } | null;
  batchResults?: BatchStatementExecution[] | null;
  dbmsOutput?: DbmsOutputLine[];
  error: string | null;
  executing: boolean;
  isConnected: boolean;
  loadingMore?: boolean;
  mutating?: boolean;
  sorting?: boolean;
  activeSort: SortState | null;
  onLoadMore?: () => void;
  onRefresh?: () => Promise<void>;
  onSaveChanges?: (request: UpdateRowRequest[]) => Promise<{ error?: string }>;
  onSort: (sort: SortState | null) => void;
  onCountRows?: () => Promise<{ totalRows?: number; error?: string }>;
  onHide?: () => void;
}

export const ResultPanel = memo(function ResultPanel({
  result,
  exportQuery,
  batchResults,
  dbmsOutput = [],
  error,
  executing,
  isConnected,
  loadingMore,
  mutating,
  sorting,
  activeSort,
  onLoadMore,
  onRefresh,
  onSaveChanges,
  onSort,
  onCountRows,
  onHide,
}: ResultPanelProps) {
  const hasDbmsOutput = dbmsOutput.length > 0;

  if (executing && !sorting) {
    if (batchResults) {
      return <BatchResultPanel items={batchResults} />;
    }
    return (
        <div style={centeredStyle}>
          <span style={{ animation: "pulse 1s infinite" }}>Executing query...</span>
        </div>
    );
  }

  if (error) {
    if (hasDbmsOutput) {
      return (
        <div style={stackedPanelStyle}>
          <div style={errorWrapStyle}>
            <div style={errorStyle}>{error}</div>
          </div>
          <div style={tabContentStyle}>
            <QueryResultTabs
              items={[
                {
                  id: "dbms-output",
                  label: `DBMS Output (${dbmsOutput.length})`,
                  content: <DbmsOutputViewer lines={dbmsOutput} />,
                },
              ]}
            />
          </div>
        </div>
      );
    }

    return (
      <div style={{ padding: 16, height: "100%", overflow: "auto" }}>
        <div style={errorStyle}>{error}</div>
      </div>
    );
  }

  if (!result) {
    if (batchResults) {
      return <BatchResultPanel items={batchResults} />;
    }
    return (
        <div style={centeredStyle}>
          {isConnected ? "Execute a query to see results" : "Connect to a database to get started"}
        </div>
    );
  }

  if (result.statementType === "select") {
    const grid = (
      <ResultGrid
        result={result}
        exportQuery={exportQuery}
        mutating={mutating}
        loadingMore={loadingMore}
        sorting={sorting}
        activeSort={activeSort}
        onLoadMore={onLoadMore}
        onRefresh={onRefresh}
        onSaveChanges={onSaveChanges}
        onSort={onSort}
        onCountRows={onCountRows}
        onHide={onHide}
      />
    );

    if (!hasDbmsOutput) {
      return grid;
    }

    return (
      <QueryResultTabs
        items={[
          { id: "result-grid", label: "Result Grid", content: grid },
          { id: "dbms-output", label: `DBMS Output (${dbmsOutput.length})`, content: <DbmsOutputViewer lines={dbmsOutput} /> },
        ]}
      />
    );
  }

  const feedback = <StatementFeedback result={result} />;
  if (!hasDbmsOutput) {
    return feedback;
  }

  return (
    <QueryResultTabs
      items={[
        { id: "result", label: "Result", content: feedback },
        { id: "dbms-output", label: `DBMS Output (${dbmsOutput.length})`, content: <DbmsOutputViewer lines={dbmsOutput} /> },
      ]}
    />
  );
});

const centeredStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: "var(--text-muted)",
  fontSize: "var(--font-size-sm)",
};

const stackedPanelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
};

const errorWrapStyle: React.CSSProperties = {
  padding: 16,
  borderBottom: "1px solid var(--border-color)",
  background: "var(--panel-bg)",
  flexShrink: 0,
};

const tabContentStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
};

const errorStyle: React.CSSProperties = {
  padding: 12,
  background: "var(--selected-bg)",
  border: "1px solid var(--danger)",
  borderRadius: "var(--radius)",
  fontSize: "var(--font-size-sm)",
  fontFamily: "var(--font-ui)",
  color: "var(--danger)",
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

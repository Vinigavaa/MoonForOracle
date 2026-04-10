import { memo } from "react";
import type { SqlExecutionResponse, UpdateRowRequest } from "@gavadb/types";
import type { BatchStatementExecution } from "../lib/sqlBatchExecution";
import { BatchResultPanel } from "./BatchResultPanel";
import { ResultGrid, type SortState } from "./ResultGrid";
import { StatementFeedback } from "./StatementFeedback";

interface ResultPanelProps {
  result: SqlExecutionResponse | null;
  batchResults?: BatchStatementExecution[] | null;
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
}

export const ResultPanel = memo(function ResultPanel({
  result,
  batchResults,
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
}: ResultPanelProps) {
  // When sorting, keep the grid visible (don't unmount) — show loading overlay via sorting prop
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
    return (
      <div style={{ padding: 16, height: "100%", overflow: "auto" }}>
        <div style={{
          padding: 12,
          background: "var(--selected-bg)",
          border: "1px solid var(--danger)",
          borderRadius: "var(--radius)",
          fontSize: "var(--font-size-sm)",
          fontFamily: "var(--font-mono)",
          color: "var(--danger)",
          whiteSpace: "pre-wrap",
          lineHeight: 1.6,
        }}>
          {error}
        </div>
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
    return (
      <ResultGrid
        result={result}
        mutating={mutating}
        loadingMore={loadingMore}
        sorting={sorting}
        activeSort={activeSort}
        onLoadMore={onLoadMore}
        onRefresh={onRefresh}
        onSaveChanges={onSaveChanges}
        onSort={onSort}
        onCountRows={onCountRows}
      />
    );
  }

  return <StatementFeedback result={result} />;
});

const centeredStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: "var(--text-muted)",
  fontSize: "var(--font-size-sm)",
};

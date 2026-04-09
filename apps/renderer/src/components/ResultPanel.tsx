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
          background: "rgba(243, 139, 168, 0.08)",
          border: "1px solid rgba(243, 139, 168, 0.2)",
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

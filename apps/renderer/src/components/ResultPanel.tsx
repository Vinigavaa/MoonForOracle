import { memo, useEffect, useState } from "react";
import { Square } from "lucide-react";
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
  /** A cancel request is in flight for the running execution */
  cancelling?: boolean;
  isConnected: boolean;
  loadingMore?: boolean;
  mutating?: boolean;
  sorting?: boolean;
  activeSort: SortState | null;
  onLoadMore?: () => void;
  onRefresh?: () => Promise<void>;
  onSaveChanges?: (request: UpdateRowRequest[]) => Promise<{ error?: string }>;
  onSort: (sort: SortState | null) => void;
  onCancel?: () => void;
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
  cancelling = false,
  isConnected,
  loadingMore,
  mutating,
  sorting,
  activeSort,
  onLoadMore,
  onRefresh,
  onSaveChanges,
  onSort,
  onCancel,
  onCountRows,
  onHide,
}: ResultPanelProps) {
  const hasDbmsOutput = dbmsOutput.length > 0;

  if (executing && !sorting) {
    if (batchResults) {
      return (
        <div style={stackedPanelStyle}>
          <ExecutionProgressBar label="Executing script..." cancelling={cancelling} onCancel={onCancel} />
          <div style={tabContentStyle}>
            <BatchResultPanel items={batchResults} />
          </div>
        </div>
      );
    }
    return (
      <div style={{ ...centeredStyle, flexDirection: "column", gap: 12 }}>
        <ExecutionProgressBar label="Executing query..." cancelling={cancelling} onCancel={onCancel} inline />
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

interface ExecutionProgressBarProps {
  label: string;
  cancelling: boolean;
  onCancel?: () => void;
  /** Renders without the bar chrome, for the centered empty state */
  inline?: boolean;
}

function ExecutionProgressBar({ label, cancelling, onCancel, inline = false }: ExecutionProgressBarProps) {
  const elapsedSeconds = useElapsedSeconds();

  return (
    <div style={inline ? progressInlineStyle : progressBarStyle}>
      <span style={{ animation: "pulse 1s infinite" }}>
        {cancelling ? "Cancelling and rolling back..." : label}
      </span>
      <span style={progressElapsedStyle}>{formatElapsed(elapsedSeconds)}</span>
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          title="Cancel execution and roll back its changes"
          style={{ ...cancelButtonStyle, opacity: cancelling ? 0.6 : 1, cursor: cancelling ? "default" : "pointer" }}
        >
          <Square size={11} strokeWidth={2.4} aria-hidden="true" />
          {cancelling ? "Cancelling..." : "Cancel"}
        </button>
      ) : null}
    </div>
  );
}

function useElapsedSeconds(): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return elapsed;
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const progressInlineStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const progressBarStyle: React.CSSProperties = {
  ...progressInlineStyle,
  padding: "8px 12px",
  borderBottom: "1px solid var(--border-color)",
  background: "var(--panel-bg)",
  color: "var(--text-muted)",
  fontSize: "var(--font-size-sm)",
  flexShrink: 0,
};

const progressElapsedStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
};

const cancelButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 10px",
  border: "1px solid var(--danger)",
  borderRadius: "var(--radius)",
  background: "transparent",
  color: "var(--danger)",
  fontSize: 11,
  fontWeight: 600,
};

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

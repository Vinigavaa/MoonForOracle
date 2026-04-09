import type { SqlExecutionResponse, SqlStatementType } from "@gavadb/types";
import { formatDuration } from "@gavadb/utils";

interface StatementFeedbackProps {
  result: SqlExecutionResponse;
}

const TYPE_LABELS: Record<SqlStatementType, string> = {
  select: "Query",
  dml: "Statement",
  ddl: "DDL Statement",
  plsql: "PL/SQL Block",
  unknown: "Statement",
};

export function StatementFeedback({ result }: StatementFeedbackProps) {
  const typeLabel = TYPE_LABELS[result.statementType];
  const hasDmlCount = result.statementType === "dml" && result.rowsAffected > 0;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      gap: 8,
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: "var(--success)",
        fontSize: 14,
        fontWeight: 500,
      }}>
        <span style={{ fontSize: 18 }}>{"\u2713"}</span>
        {typeLabel} executed successfully
      </div>

      <div style={{
        display: "flex",
        gap: 16,
        fontSize: "var(--font-size-sm)",
        color: "var(--text-muted)",
        flexWrap: "wrap",
        justifyContent: "center",
      }}>
        {hasDmlCount && (
          <span>
            {result.rowsAffected} row{result.rowsAffected !== 1 ? "s" : ""} affected
          </span>
        )}
        <span>{formatDuration(result.executionTimeMs)}</span>
        {hasDmlCount && <span>Pending until Commit</span>}
      </div>
    </div>
  );
}

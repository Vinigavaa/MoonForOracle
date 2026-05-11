import { DbmsOutputViewer } from "./DbmsOutputViewer";
import { ResultGrid } from "./ResultGrid";
import { StatementFeedback } from "./StatementFeedback";
import type { BatchStatementExecution } from "../lib/sqlBatchExecution";

interface BatchResultPanelProps {
  items: BatchStatementExecution[];
}

export function BatchResultPanel({ items }: BatchResultPanelProps) {
  if (items.length === 0) {
    return (
      <div style={emptyStyle}>
        Executing statements...
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {items.map((item) => {
        const title = `Statement ${item.target.statementIndex + 1} of ${item.target.statementCount}`;
        return (
          <section key={item.id} style={cardStyle}>
            <div style={headerStyle}>
              <div>
                <div style={titleStyle}>{title}</div>
                <div style={subtitleStyle}>
                  {item.target.source === "selection" ? "Selection" : "Cursor statement"}
                </div>
              </div>
              <div style={item.error ? errorBadgeStyle : successBadgeStyle}>
                {item.error ? "Failed" : "Executed"}
              </div>
            </div>

            <pre style={sqlPreviewStyle}>{item.target.sql}</pre>

            {item.error ? (
              <div style={errorStyle}>{item.error}</div>
            ) : item.result?.statementType === "select" ? (
              <div style={gridWrapStyle}>
                <ResultGrid result={item.result} />
              </div>
            ) : item.result ? (
              <div style={feedbackWrapStyle}>
                <StatementFeedback result={item.result} />
              </div>
            ) : null}

            {item.dbmsOutput.length > 0 ? (
              <div style={outputSectionStyle}>
                <div style={outputHeaderStyle}>
                  DBMS Output ({item.dbmsOutput.length})
                </div>
                <div style={outputViewerWrapStyle}>
                  <DbmsOutputViewer lines={item.dbmsOutput} />
                </div>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  height: "100%",
  overflow: "auto",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--border-color)",
  borderRadius: "var(--radius)",
  background: "var(--panel-bg)",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 12px",
  borderBottom: "1px solid var(--border-subtle)",
  background: "var(--panel-bg)",
};

const titleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-primary)",
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
  marginTop: 2,
};

const successBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--success)",
};

const errorBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--danger)",
};

const sqlPreviewStyle: React.CSSProperties = {
  margin: 0,
  padding: 12,
  borderBottom: "1px solid var(--border-subtle)",
  background: "var(--surface-bg)",
  color: "var(--text-secondary)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const errorStyle: React.CSSProperties = {
  padding: 12,
  color: "var(--danger)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  whiteSpace: "pre-wrap",
};

const gridWrapStyle: React.CSSProperties = {
  height: 320,
};

const feedbackWrapStyle: React.CSSProperties = {
  height: 140,
};

const outputSectionStyle: React.CSSProperties = {
  borderTop: "1px solid var(--border-subtle)",
};

const outputHeaderStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-secondary)",
  background: "var(--panel-bg)",
  borderBottom: "1px solid var(--border-subtle)",
};

const outputViewerWrapStyle: React.CSSProperties = {
  height: 220,
};

const emptyStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: "var(--text-muted)",
  fontSize: "var(--font-size-sm)",
};

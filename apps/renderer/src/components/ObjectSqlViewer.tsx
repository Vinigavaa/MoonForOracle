import { useEffect, useState } from "react";
import type { DatabaseObjectType } from "@gavadb/types";
import { SqlCodeEditor } from "./SqlCodeEditor";

interface ObjectSqlViewerProps {
  objectType: DatabaseObjectType;
  objectName: string;
}

export function ObjectSqlViewer({ objectType, objectName }: ObjectSqlViewerProps) {
  const [sql, setSql] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;

    async function loadSql() {
      setLoading(true);
      setError(null);
      setSql("");

      try {
        const result = await window.gavadb.dbGetObjectSql(objectType, objectName);
        if (canceled) return;

        if (result.success) {
          setSql(result.data);
        } else {
          setError(result.error.message + (result.error.details ? `\n${result.error.details}` : ""));
        }
      } catch (err) {
        if (!canceled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    }

    void loadSql();

    return () => {
      canceled = true;
    };
  }, [objectName, objectType]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={badgeStyle}>{objectType === "tables" ? "Table SQL" : "View SQL"}</span>
          <span style={titleStyle}>{objectName}</span>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "hidden", background: "var(--code-viewer-bg)" }}>
        {loading && (
          <div style={centeredStyle}>
            <span style={{ animation: "pulse 1s infinite" }}>Loading SQL definition...</span>
          </div>
        )}
        {error && !loading && (
          <div style={{ padding: 16 }}>
            <div style={errorBoxStyle}>{error}</div>
          </div>
        )}
        {!loading && !error && (
          <SqlCodeEditor value={sql} readOnly />
        )}
      </div>
    </div>
  );
}

const headerStyle: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: 12,
  color: "var(--text-secondary)",
  background: "var(--panel-bg)",
  borderBottom: "1px solid var(--border-subtle)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexShrink: 0,
  gap: 10,
};

const badgeStyle: React.CSSProperties = {
  padding: "1px 7px",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderRadius: 3,
  background: "var(--selected-bg)",
  color: "var(--accent)",
  border: "1px solid var(--accent)",
  whiteSpace: "nowrap",
};

const titleStyle: React.CSSProperties = {
  fontWeight: 600,
  fontFamily: "var(--font-ui)",
  fontSize: 12,
  color: "var(--text-primary)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const centeredStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: "var(--text-muted)",
  fontSize: "var(--font-size-sm)",
};

const errorBoxStyle: React.CSSProperties = {
  padding: 12,
  background: "var(--selected-bg)",
  border: "1px solid var(--danger)",
  borderRadius: "var(--radius)",
  fontSize: "var(--font-size-sm)",
  fontFamily: "var(--font-mono)",
  color: "var(--danger)",
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

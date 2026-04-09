import type { ConnectionStatus } from "@gavadb/types";

interface ToolbarProps {
  status: ConnectionStatus;
  connectionLabel: string | null;
  hasPendingTransaction: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onCommit: () => void;
  onRollback: () => void;
  onExecuteSql: () => void;
  onExecuteAllSql: () => void;
  isConnected: boolean;
  transactionBusy?: boolean;
}

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  disconnected: "Disconnected",
  connecting: "Connecting...",
  connected: "Connected",
  error: "Connection Error",
};

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  disconnected: "var(--text-muted)",
  connecting: "var(--warning)",
  connected: "var(--success)",
  error: "var(--danger)",
};

export function Toolbar({
  status,
  connectionLabel,
  hasPendingTransaction,
  onConnect,
  onDisconnect,
  onCommit,
  onRollback,
  onExecuteSql,
  onExecuteAllSql,
  isConnected,
  transactionBusy,
}: ToolbarProps) {
  return (
    <div style={{
      height: "var(--toolbar-height)",
      background: "var(--bg-secondary)",
      borderBottom: "1px solid var(--border-color)",
      display: "flex",
      alignItems: "center",
      padding: "0 12px",
      gap: 8,
      flexShrink: 0,
    }}>
      <span style={{ fontWeight: 600, fontSize: 14, color: "var(--accent)", marginRight: 8 }}>
        GavaDB
      </span>

      <div style={{ width: 1, height: 18, background: "var(--border-color)", marginRight: 4 }} />

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: STATUS_COLORS[status],
          display: "inline-block",
          ...(status === "connecting" ? { animation: "pulse 1s infinite" } : {}),
        }} />
        <span style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)" }}>
          {STATUS_LABELS[status]}
        </span>
        {isConnected && connectionLabel && (
          <span style={{
            fontSize: "var(--font-size-sm)",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
          }}>
            — {connectionLabel}
          </span>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {isConnected && (
        <span style={{
          padding: "2px 8px",
          borderRadius: 999,
          border: `1px solid ${hasPendingTransaction ? "rgba(250, 179, 135, 0.45)" : "var(--border-color)"}`,
          color: hasPendingTransaction ? "var(--warning)" : "var(--text-muted)",
          fontSize: 11,
          fontWeight: 600,
          background: hasPendingTransaction ? "rgba(250, 179, 135, 0.08)" : "transparent",
        }}>
          {hasPendingTransaction ? "Pending transaction" : "No pending transaction"}
        </span>
      )}

      <button
        onClick={onCommit}
        disabled={!isConnected || !hasPendingTransaction || !!transactionBusy}
        style={{
          background: hasPendingTransaction ? "var(--success)" : "transparent",
          color: hasPendingTransaction ? "var(--bg-primary)" : undefined,
          border: hasPendingTransaction ? "none" : "1px solid var(--border-color)",
          fontWeight: 600,
        }}
      >
        Commit
      </button>
      <button
        onClick={onRollback}
        disabled={!isConnected || !hasPendingTransaction || !!transactionBusy}
        style={{
          background: "transparent",
          color: hasPendingTransaction ? "var(--danger)" : undefined,
          border: "1px solid var(--border-color)",
          fontWeight: 600,
        }}
      >
        Rollback
      </button>

      {isConnected ? (
        <button onClick={onDisconnect} disabled={!!transactionBusy}>Disconnect</button>
      ) : (
        <button onClick={onConnect}>Connect...</button>
      )}

      <div style={{ width: 1, height: 18, background: "var(--border-color)" }} />

      <button
        onClick={onExecuteSql}
        disabled={!isConnected}
        style={{
          background: isConnected ? "var(--accent)" : undefined,
          color: isConnected ? "var(--bg-primary)" : undefined,
          border: "none",
          fontWeight: 600,
        }}
      >
        ▶ Execute
      </button>
      <button
        onClick={onExecuteAllSql}
        disabled={!isConnected}
        style={{
          background: "transparent",
          color: isConnected ? "var(--text-primary)" : undefined,
          border: "1px solid var(--border-color)",
          fontWeight: 600,
        }}
      >
        Execute All
      </button>
    </div>
  );
}

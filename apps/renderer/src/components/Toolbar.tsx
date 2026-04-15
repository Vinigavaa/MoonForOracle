import { useEffect, useState, type CSSProperties } from "react";
import type { ConnectionStatus } from "@gavadb/types";
import { Bolt } from "lucide-react";
import moonForOracleLogo from "../assets/MoonForOracle.png";

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
  onOpenPreferences: () => void;
}

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  disconnected: "Disconnected",
  connecting: "Connecting...",
  connected: "Connected",
  error: "Connection Error",
};

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  disconnected: "var(--status-disconnected)",
  connecting: "var(--warning)",
  connected: "var(--status-connected)",
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
  onOpenPreferences,
}: ToolbarProps) {
  const [isMaximized, setIsMaximized] = useState(true);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    if (window.gavadb) {
      window.gavadb.windowIsMaximized().then((result) => {
        if (result.success) setIsMaximized(result.data);
      });
      cleanup = window.gavadb.onWindowMaximizedChanged(setIsMaximized);
    }

    return cleanup;
  }, []);

  const handleMinimize = () => {
    void window.gavadb?.windowMinimize();
  };

  const handleToggleMaximize = async () => {
    const result = await window.gavadb?.windowToggleMaximize();
    if (result?.success) setIsMaximized(result.data);
  };

  const handleClose = () => {
    void window.gavadb?.windowClose();
  };

  return (
    <div className="app-toolbar" style={{
      height: "var(--toolbar-height)",
      background: "var(--topbar-bg)",
      borderBottom: "1px solid var(--border-color)",
      display: "flex",
      alignItems: "center",
      padding: "0 12px",
      gap: 8,
      flexShrink: 0,
    }}>
      <img
        src={moonForOracleLogo}
        alt="Moon For Oracle"
        style={{ height: 20, width: "auto", marginRight: 8, objectFit: "contain" }}
      />

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
            fontFamily: "var(--font-ui)",
          }}>
            — {connectionLabel}
          </span>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {isConnected && (
        <span style={{
          padding: "2px 8px",
          border: `1px solid ${hasPendingTransaction ? "var(--status-pending)" : "var(--border-color)"}`,
          color: hasPendingTransaction ? "var(--status-pending)" : "var(--text-muted)",
          fontSize: 11,
          fontWeight: 600,
          background: hasPendingTransaction ? "var(--selected-bg)" : "transparent",
        }}>
          {hasPendingTransaction ? "Pending transaction" : "No pending transaction"}
        </span>
      )}

      <button
        className="app-no-drag"
        onClick={onCommit}
        disabled={!isConnected || !hasPendingTransaction || !!transactionBusy}
        style={{
          background: "transparent",
          color: hasPendingTransaction ? "var(--success)" : undefined,
          border: "1px solid var(--border-color)",
          fontWeight: 600,
        }}
      >
        Commit
      </button>
      <button
        className="app-no-drag"
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
        <button className="app-no-drag" onClick={onDisconnect} disabled={!!transactionBusy}>Disconnect</button>
      ) : (
        <button className="app-no-drag" onClick={onConnect}>Connect...</button>
      )}

      <div style={{ width: 1, height: 18, background: "var(--border-color)" }} />

      <button
        className="app-no-drag"
        onClick={onExecuteSql}
        disabled={!isConnected}
        style={{
          background: isConnected ? "var(--button-primary-bg)" : undefined,
          color: isConnected ? "var(--button-primary-text)" : undefined,
          border: "none",
          fontWeight: 600,
        }}
      >
        ▶ Execute
      </button>
      <button
        className="app-no-drag"
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

      <button
        className="app-no-drag"
        onClick={onOpenPreferences}
        aria-label="Preferências"
        title="Preferências"
        style={preferencesButtonStyle}
      >
        <Bolt size={14} strokeWidth={1.9} aria-hidden="true" />
      </button>

      <div className="app-window-controls app-no-drag" aria-label="Window controls">
        <button type="button" onClick={handleMinimize} aria-label="Minimize window" title="Minimize">
          _
        </button>
        <button
          type="button"
          onClick={handleToggleMaximize}
          aria-label={isMaximized ? "Restore window" : "Maximize window"}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? "▢" : "□"}
        </button>
        <button type="button" onClick={handleClose} aria-label="Close window" title="Close">
          ×
        </button>
      </div>
    </div>
  );
}

const preferencesButtonStyle: CSSProperties = {
  width: 30,
  minWidth: 30,
  height: 30,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid var(--border-color)",
  background: "transparent",
  color: "var(--text-secondary)",
};


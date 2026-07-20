import { useEffect, useState, type CSSProperties } from "react";
import type { ConnectionStatus } from "@gavadb/types";
import {
  Settings,
  Check,
  RotateCcw,
  Plug,
  Unplug,
  Play,
  CircleDot,
  CircleCheck,
} from "lucide-react";
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
        <span
          aria-label={hasPendingTransaction ? "Pending transaction" : "No pending transaction"}
          title={hasPendingTransaction ? "Pending transaction" : "No pending transaction"}
          style={{
            width: 30,
            height: 30,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: hasPendingTransaction ? "var(--status-pending)" : "var(--text-muted)",
            background: hasPendingTransaction ? "var(--selected-bg)" : "transparent",
          }}
        >
          {hasPendingTransaction ? (
            <CircleDot size={15} strokeWidth={1.9} aria-hidden="true" />
          ) : (
            <CircleCheck size={15} strokeWidth={1.9} aria-hidden="true" />
          )}
        </span>
      )}

      <button
        className="app-no-drag"
        onClick={onCommit}
        disabled={!isConnected || !hasPendingTransaction || !!transactionBusy}
        aria-label="Commit"
        title="Commit"
        style={{
          ...iconButtonStyle,
          color: hasPendingTransaction ? "var(--success)" : undefined,
        }}
      >
        <Check size={15} strokeWidth={1.9} aria-hidden="true" />
      </button>
      <button
        className="app-no-drag"
        onClick={onRollback}
        disabled={!isConnected || !hasPendingTransaction || !!transactionBusy}
        aria-label="Rollback"
        title="Rollback"
        style={{
          ...iconButtonStyle,
          color: hasPendingTransaction ? "var(--danger)" : undefined,
        }}
      >
        <RotateCcw size={15} strokeWidth={1.9} aria-hidden="true" />
      </button>

      {isConnected ? (
        <button
          className="app-no-drag"
          onClick={onDisconnect}
          disabled={!!transactionBusy}
          aria-label="Disconnect"
          title="Disconnect"
          style={iconButtonStyle}
        >
          <Unplug size={15} strokeWidth={1.9} aria-hidden="true" />
        </button>
      ) : (
        <button
          className="app-no-drag"
          onClick={onConnect}
          aria-label="Connect..."
          title="Connect..."
          style={iconButtonStyle}
        >
          <Plug size={15} strokeWidth={1.9} aria-hidden="true" />
        </button>
      )}

      <div style={{ width: 1, height: 18, background: "var(--border-color)" }} />

      <button
        className="app-no-drag"
        onClick={onExecuteSql}
        disabled={!isConnected}
        aria-label="Execute"
        title="Execute"
        style={{
          ...iconButtonStyle,
          background: isConnected ? "var(--button-primary-bg)" : undefined,
          color: isConnected ? "var(--button-primary-text)" : undefined,
        }}
      >
        <Play size={15} strokeWidth={1.9} aria-hidden="true" />
      </button>

      <button
        className="app-no-drag"
        onClick={onOpenPreferences}
        aria-label="Preferências"
        title="Preferências"
        style={preferencesButtonStyle}
      >
        <Settings size={15} strokeWidth={1.9} aria-hidden="true" />
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

const iconButtonStyle: CSSProperties = {
  width: 30,
  minWidth: 30,
  height: 30,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  background: "transparent",
};

const preferencesButtonStyle: CSSProperties = {
  width: 30,
  minWidth: 30,
  height: 30,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  background: "transparent",
  color: "var(--text-secondary)",
};


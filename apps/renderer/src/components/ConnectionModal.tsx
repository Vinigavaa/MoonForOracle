import { useState, useCallback, useEffect, useRef } from "react";
import type { ConnectionConfig, AppError, AppErrorCode } from "@gavadb/types";
import { generateId } from "@gavadb/utils";

interface ConnectionModalProps {
  open: boolean;
  onClose: () => void;
  onConnect: (config: ConnectionConfig) => Promise<void>;
  lastConfig: Omit<ConnectionConfig, "password"> | null;
  error: AppError | null;
  connecting: boolean;
}

type ConnMode = "basic" | "tns";

interface FormErrors {
  host?: string;
  port?: string;
  serviceName?: string;
  connectString?: string;
  username?: string;
  password?: string;
}

export function ConnectionModal({ open, onClose, onConnect, lastConfig, error, connecting }: ConnectionModalProps) {
  const [mode, setMode] = useState<ConnMode>("basic");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("1521");
  const [serviceName, setServiceName] = useState("");
  const [connectString, setConnectString] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const hostRef = useRef<HTMLInputElement>(null);
  const tnsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      if (lastConfig) {
        setMode(lastConfig.mode ?? "basic");
        setHost(lastConfig.host);
        setPort(String(lastConfig.port));
        setServiceName(lastConfig.serviceName);
        setConnectString(lastConfig.connectString ?? "");
        setUsername(lastConfig.username);
      }
      setPassword("");
      setFormErrors({});
      setTimeout(() => {
        if (lastConfig) {
          document.querySelector<HTMLInputElement>('input[type="password"]')?.focus();
        } else {
          (mode === "tns" ? tnsRef : hostRef).current?.focus();
        }
      }, 50);
    }
  }, [open, lastConfig]);

  const validate = useCallback((): FormErrors => {
    const errors: FormErrors = {};
    if (mode === "basic") {
      if (!host.trim()) errors.host = "Host is required";
      const p = Number(port);
      if (!port.trim() || isNaN(p) || p < 1 || p > 65535) errors.port = "Valid port (1-65535)";
      if (!serviceName.trim()) errors.serviceName = "Service name is required";
    } else {
      if (!connectString.trim()) errors.connectString = "Connect string is required";
    }
    if (!username.trim()) errors.username = "Username is required";
    if (!password) errors.password = "Password is required";
    return errors;
  }, [mode, host, port, serviceName, connectString, username, password]);

  const handleSubmit = useCallback(async () => {
    const errors = validate();
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const label = mode === "tns"
      ? `${username}@${connectString.trim().substring(0, 40)}`
      : `${username}@${host}:${port}/${serviceName}`;

    const config: ConnectionConfig = {
      id: generateId(),
      name: label,
      mode,
      host: host.trim(),
      port: Number(port) || 1521,
      serviceName: serviceName.trim(),
      connectString: connectString.trim(),
      username: username.trim(),
      password,
    };

    await onConnect(config);
  }, [mode, host, port, serviceName, connectString, username, password, onConnect, validate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !connecting) handleSubmit();
    if (e.key === "Escape") onClose();
  };

  if (!open) return null;

  return (
    <div
      style={overlayStyle}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKeyDown}
    >
      <div style={dialogStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "var(--text-primary)" }}>
          Connect to Oracle
        </h2>

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 0, marginBottom: 16 }}>
          {(["basic", "tns"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setFormErrors({}); }}
              style={{
                flex: 1,
                padding: "6px 0",
                fontSize: 12,
                fontWeight: mode === m ? 600 : 400,
                background: mode === m ? "var(--bg-primary)" : "transparent",
                color: mode === m ? "var(--accent)" : "var(--text-muted)",
                border: `1px solid ${mode === m ? "var(--accent)" : "var(--border-color)"}`,
                borderRadius: m === "basic" ? "var(--radius) 0 0 var(--radius)" : "0 var(--radius) var(--radius) 0",
                cursor: "pointer",
              }}
            >
              {m === "basic" ? "Host / Port / Service" : "TNS / Connect String"}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {mode === "basic" ? (
            <>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Host</label>
                  <input ref={hostRef} value={host} onChange={(e) => setHost(e.target.value)}
                    placeholder="localhost" style={inputStyle(formErrors.host)} />
                  {formErrors.host && <div style={fieldErrorStyle}>{formErrors.host}</div>}
                </div>
                <div style={{ width: 90 }}>
                  <label style={labelStyle}>Port</label>
                  <input value={port} onChange={(e) => setPort(e.target.value)}
                    placeholder="1521" style={inputStyle(formErrors.port)} />
                  {formErrors.port && <div style={fieldErrorStyle}>{formErrors.port}</div>}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Service Name</label>
                <input value={serviceName} onChange={(e) => setServiceName(e.target.value)}
                  placeholder="ORCL" style={inputStyle(formErrors.serviceName)} />
                {formErrors.serviceName && <div style={fieldErrorStyle}>{formErrors.serviceName}</div>}
              </div>
            </>
          ) : (
            <div>
              <label style={labelStyle}>Connect String</label>
              <input ref={tnsRef} value={connectString} onChange={(e) => setConnectString(e.target.value)}
                placeholder="TNS alias, Easy Connect (host:port/service), or full descriptor"
                style={inputStyle(formErrors.connectString)} />
              {formErrors.connectString && <div style={fieldErrorStyle}>{formErrors.connectString}</div>}
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                Examples: <code style={codeStyle}>MYDB</code>,{" "}
                <code style={codeStyle}>dbhost:1521/orcl</code>,{" "}
                <code style={codeStyle}>(DESCRIPTION=...)</code>
              </div>
            </div>
          )}

          <div>
            <label style={labelStyle}>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)}
              placeholder="E2GAVA" style={inputStyle(formErrors.username)} />
            {formErrors.username && <div style={fieldErrorStyle}>{formErrors.username}</div>}
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password" style={inputStyle(formErrors.password)} />
            {formErrors.password && <div style={fieldErrorStyle}>{formErrors.password}</div>}
          </div>
        </div>

        {error && (
          <div style={errorBoxStyle}>
            <div style={{ fontWeight: 600 }}>{error.message}</div>
            {error.details && (
              <div style={{ marginTop: 4, color: "var(--text-muted)", fontSize: 11, whiteSpace: "pre-wrap" }}>
                {error.details}
              </div>
            )}
            {error.code && (
              <div style={hintBoxStyle}>{getErrorHint(error.code)}</div>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button onClick={onClose} disabled={connecting}>Cancel</button>
          <button onClick={handleSubmit} disabled={connecting} style={connectBtnStyle}>
            {connecting ? "Connecting..." : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(0, 0, 0, 0.6)", zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
  background: "var(--modal-bg)",
  border: "1px solid var(--border-color)",
  borderRadius: 8, width: 440, maxWidth: "90vw",
  padding: 24, boxShadow: "0 16px 48px rgba(0, 0, 0, 0.4)",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "var(--font-size-sm)",
  color: "var(--text-secondary)", marginBottom: 4,
};

const fieldErrorStyle: React.CSSProperties = {
  fontSize: 11, color: "var(--danger)", marginTop: 2,
};

const inputStyle = (fieldError?: string): React.CSSProperties => ({
  width: "100%", padding: "6px 10px",
  fontSize: "var(--font-size-base)", fontFamily: "var(--font-ui)",
  background: "var(--bg-primary)", color: "var(--text-primary)",
  border: `1px solid ${fieldError ? "var(--danger)" : "var(--border-color)"}`,
  borderRadius: "var(--radius)", outline: "none",
});

const codeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 11,
  background: "var(--bg-primary)", padding: "1px 4px",
  borderRadius: 2,
};

const errorBoxStyle: React.CSSProperties = {
  marginTop: 14, padding: "8px 10px",
  background: "var(--selected-bg)",
  border: "1px solid var(--danger)",
  borderRadius: "var(--radius)",
  fontSize: "var(--font-size-sm)", color: "var(--danger)",
};

const hintBoxStyle: React.CSSProperties = {
  marginTop: 6, padding: "4px 8px",
  background: "var(--selected-bg)",
  borderRadius: "var(--radius)",
  fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5,
};

const connectBtnStyle: React.CSSProperties = {
  background: "var(--button-primary-bg)", color: "var(--button-primary-text)",
  border: "none", fontWeight: 600, padding: "6px 20px",
};

function getErrorHint(code: string): string {
  const hints: Record<string, string> = {
    CONNECTION_FAILED: "Check that the host, port, and service name (or TNS connect string) are correct and the database is accepting connections.",
    CONNECTION_LOST: "The connection to the database was interrupted. Try connecting again.",
    QUERY_TIMEOUT: "The connection timed out. The database may be unreachable or under heavy load.",
    PERMISSION_DENIED: "Check that the username and password are correct and the account is not locked.",
    OBJECT_NOT_FOUND: "The specified database object was not found.",
    QUERY_FAILED: "The operation failed. Check the error details above.",
    UNKNOWN: "An unexpected error occurred. Check the connection parameters and try again.",
  };
  return hints[code] ?? hints.UNKNOWN;
}

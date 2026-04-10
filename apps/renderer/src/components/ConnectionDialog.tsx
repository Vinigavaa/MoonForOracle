import { useState, useCallback, useEffect, useRef } from "react";
import type { ConnectionConfig, AppError, TnsAliasEntry, SavedConnection, SaveConnectionRequest } from "@gavadb/types";
import { generateId } from "@gavadb/utils";
import { defaultConnectionPreferences, loadConnectionPreferences, saveConnectionPreferences } from "../lib/connectionPreferences";

interface ConnectionDialogProps {
  open: boolean;
  onClose: () => void;
  onConnect: (config: ConnectionConfig, savedConnectionId?: string) => Promise<void>;
  onTestConnection: (config: ConnectionConfig) => Promise<{ error?: AppError }>;
  onLoadTnsAliases: (filePath: string) => Promise<{ data?: TnsAliasEntry[]; error?: AppError }>;
  onPickTnsFile: () => Promise<{ data?: string | null; error?: AppError }>;
  onSaveConnection?: (request: SaveConnectionRequest) => Promise<SavedConnection | null>;
  lastConfig: Omit<ConnectionConfig, "password"> | null;
  error: AppError | null;
  connecting: boolean;
  /** When editing a saved connection, pre-populate the form */
  editingConnection?: SavedConnection | null;
  editingPassword?: string;
}

type ConnMode = "basic" | "tns";

interface FormErrors {
  host?: string;
  port?: string;
  serviceName?: string;
  tnsFilePath?: string;
  tnsAlias?: string;
  username?: string;
  password?: string;
  friendlyName?: string;
}

export function ConnectionDialog({
  open,
  onClose,
  onConnect,
  onTestConnection,
  onLoadTnsAliases,
  onPickTnsFile,
  onSaveConnection,
  lastConfig,
  error,
  connecting,
  editingConnection,
  editingPassword,
}: ConnectionDialogProps) {
  const [mode, setMode] = useState<ConnMode>("basic");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("1521");
  const [serviceName, setServiceName] = useState("");
  const [tnsFilePath, setTnsFilePath] = useState("");
  const [tnsAlias, setTnsAlias] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [aliases, setAliases] = useState<TnsAliasEntry[]>([]);
  const [loadingAliases, setLoadingAliases] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [saveConnection, setSaveConnection] = useState(false);
  const [friendlyName, setFriendlyName] = useState("");
  const hostRef = useRef<HTMLInputElement>(null);
  const tnsFileRef = useRef<HTMLInputElement>(null);

  const isEditing = !!editingConnection;

  useEffect(() => {
    if (!open) return;

    // If editing a saved connection, use its values
    if (editingConnection) {
      setMode(editingConnection.mode);
      setHost(editingConnection.host ?? "");
      setPort(String(editingConnection.port || 1521));
      setServiceName(editingConnection.serviceName ?? "");
      setTnsFilePath(editingConnection.tnsFilePath ?? "");
      setTnsAlias(editingConnection.tnsAlias ?? "");
      setUsername(editingConnection.username ?? "");
      setPassword(editingPassword ?? "");
      setFriendlyName(editingConnection.friendlyName);
      setSaveConnection(true);
      setAliases([]);
      setFormErrors({});
      return;
    }

    const stored = loadConnectionPreferences() ?? defaultConnectionPreferences();
    const seed = lastConfig ?? {
      id: "",
      name: "",
      mode: stored.mode,
      host: stored.host,
      port: Number(stored.port) || 1521,
      serviceName: stored.serviceName,
      connectString: stored.connectString,
      tnsFilePath: stored.tnsFilePath,
      tnsAlias: stored.tnsAlias,
      username: stored.username,
    };

    setMode(seed.mode ?? "basic");
    setHost(seed.host ?? stored.host);
    setPort(String((seed.port ?? Number(stored.port)) || 1521));
    setServiceName(seed.serviceName ?? stored.serviceName);
    setTnsFilePath((seed as Partial<ConnectionConfig>).tnsFilePath ?? stored.tnsFilePath);
    setTnsAlias((seed as Partial<ConnectionConfig>).tnsAlias ?? seed.connectString ?? stored.tnsAlias ?? stored.connectString);
    setUsername(seed.username ?? stored.username);
    setPassword("");
    setFriendlyName("");
    setSaveConnection(false);
    setAliases([]);
    setFormErrors({});

    window.setTimeout(() => {
      if ((seed.mode ?? "basic") === "tns") tnsFileRef.current?.focus();
      else hostRef.current?.focus();
    }, 50);
  }, [open, lastConfig, editingConnection, editingPassword]);

  const persistPreferences = useCallback((nextMode: ConnMode = mode) => {
    saveConnectionPreferences({
      mode: nextMode,
      host: host.trim(),
      port: port.trim() || "1521",
      serviceName: serviceName.trim(),
      connectString: tnsAlias.trim(),
      tnsFilePath: tnsFilePath.trim(),
      tnsAlias: tnsAlias.trim(),
      username: username.trim(),
    });
  }, [host, mode, port, serviceName, tnsAlias, tnsFilePath, username]);

  const loadAliases = useCallback(async (preserveSelection = true) => {
    const filePath = tnsFilePath.trim();
    if (!filePath) {
      setFormErrors((prev) => ({ ...prev, tnsFilePath: "TNS file path is required" }));
      return;
    }

    setLoadingAliases(true);
    const result = await onLoadTnsAliases(filePath);
    setLoadingAliases(false);

    if (result.error) {
      setAliases([]);
      return;
    }

    const loadedAliases = result.data ?? [];
    setAliases(loadedAliases);
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.tnsFilePath;
      if (loadedAliases.length > 0) delete next.tnsAlias;
      return next;
    });

    if (!preserveSelection || !loadedAliases.some((entry) => entry.aliases.some((alias: string) => alias.toUpperCase() === tnsAlias.trim().toUpperCase()))) {
      setTnsAlias((current) => current.trim() || loadedAliases[0]?.name || "");
    }
  }, [onLoadTnsAliases, tnsAlias, tnsFilePath]);

  useEffect(() => {
    if (!open || mode !== "tns" || !tnsFilePath.trim() || aliases.length > 0) return;
    void loadAliases(true);
  }, [aliases.length, open, mode, tnsFilePath, loadAliases]);

  const validate = useCallback((): FormErrors => {
    const errors: FormErrors = {};
    if (mode === "basic") {
      if (!host.trim()) errors.host = "Host is required";
      const p = Number(port);
      if (!port.trim() || Number.isNaN(p) || p < 1 || p > 65535) errors.port = "Valid port (1-65535)";
      if (!serviceName.trim()) errors.serviceName = "Service name is required";
    } else {
      if (!tnsFilePath.trim()) errors.tnsFilePath = "TNS file path is required";
      if (!tnsAlias.trim()) errors.tnsAlias = "Select or type a TNS alias";
    }
    if (!username.trim()) errors.username = "Username is required";
    if (!password) errors.password = "Password is required";
    return errors;
  }, [host, mode, password, port, serviceName, tnsAlias, tnsFilePath, username]);

  const buildConfig = useCallback((): ConnectionConfig => {
    const resolvedAlias = tnsAlias.trim();
    const labelTarget = mode === "tns"
      ? resolvedAlias.substring(0, 60)
      : `${host.trim()}:${port.trim()}/${serviceName.trim()}`;

    return {
      id: generateId(),
      name: `${username.trim()}@${labelTarget}`,
      mode,
      host: host.trim(),
      port: Number(port) || 1521,
      serviceName: serviceName.trim(),
      connectString: mode === "tns" ? resolvedAlias : "",
      tnsFilePath: mode === "tns" ? tnsFilePath.trim() : undefined,
      tnsAlias: mode === "tns" ? resolvedAlias : undefined,
      username: username.trim(),
      password,
    };
  }, [host, mode, password, port, serviceName, tnsAlias, tnsFilePath, username]);

  const handleSubmit = useCallback(async () => {
    const errors = validate();
    if ((saveConnection || isEditing) && !friendlyName.trim()) {
      errors.friendlyName = "Connection name is required";
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    persistPreferences();

    const config = buildConfig();
    let savedId: string | undefined;

    // Save or update the connection if requested
    if ((saveConnection || isEditing) && onSaveConnection) {
      const now = new Date().toISOString();
      const savedConn: SavedConnection = {
        id: editingConnection?.id ?? generateId(),
        friendlyName: friendlyName.trim(),
        mode,
        host: host.trim(),
        port: Number(port) || 1521,
        serviceName: serviceName.trim(),
        tnsAlias: mode === "tns" ? tnsAlias.trim() : undefined,
        tnsFilePath: mode === "tns" ? tnsFilePath.trim() : undefined,
        username: username.trim(),
        isFavorite: editingConnection?.isFavorite ?? false,
        lastUsedAt: editingConnection?.lastUsedAt,
        createdAt: editingConnection?.createdAt ?? now,
        updatedAt: now,
      };
      const result = await onSaveConnection({ connection: savedConn, password: password || undefined });
      if (result) savedId = result.id;
    }

    if (isEditing && !connecting) {
      // If just editing (not connecting), close dialog
      onClose();
      return;
    }

    await onConnect(config, savedId);
  }, [buildConfig, onConnect, persistPreferences, validate, saveConnection, isEditing, friendlyName, onSaveConnection, editingConnection, mode, host, port, serviceName, tnsAlias, tnsFilePath, username, password, connecting, onClose]);

  const handleTestConnection = useCallback(async () => {
    const errors = validate();
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    persistPreferences();
    setTestingConnection(true);
    await onTestConnection(buildConfig());
    setTestingConnection(false);
  }, [buildConfig, onTestConnection, persistPreferences, validate]);

  const handlePickTnsFile = useCallback(async () => {
    const result = await onPickTnsFile();
    if (result.data) {
      setTnsFilePath(result.data);
      setAliases([]);
    }
  }, [onPickTnsFile]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && !connecting && !testingConnection) {
      void handleSubmit();
    }
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
          {isEditing ? "Edit Saved Connection" : "Connect to Oracle"}
        </h2>

        <div style={{ display: "flex", gap: 0, marginBottom: 16 }}>
          {(["basic", "tns"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setFormErrors({});
                persistPreferences(m);
              }}
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
              {m === "basic" ? "Manual" : "TNS"}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {mode === "basic" ? (
            <>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Host</label>
                  <input ref={hostRef} value={host} onChange={(e) => setHost(e.target.value)} placeholder="localhost" style={inputStyle(formErrors.host)} />
                  {formErrors.host && <div style={fieldErrorStyle}>{formErrors.host}</div>}
                </div>
                <div style={{ width: 90 }}>
                  <label style={labelStyle}>Port</label>
                  <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="1521" style={inputStyle(formErrors.port)} />
                  {formErrors.port && <div style={fieldErrorStyle}>{formErrors.port}</div>}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Service Name</label>
                <input value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="ORCL" style={inputStyle(formErrors.serviceName)} />
                {formErrors.serviceName && <div style={fieldErrorStyle}>{formErrors.serviceName}</div>}
              </div>
            </>
          ) : (
            <>
              <div>
                <label style={labelStyle}>TNS File Path</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    ref={tnsFileRef}
                    value={tnsFilePath}
                    onChange={(e) => {
                      setTnsFilePath(e.target.value);
                      setAliases([]);
                    }}
                    placeholder="C:\\oracle\\network\\admin\\tnsnames.ora"
                    style={inputStyle(formErrors.tnsFilePath)}
                  />
                  <button onClick={() => void handlePickTnsFile()} disabled={loadingAliases || connecting || testingConnection}>
                    Browse...
                  </button>
                  <button onClick={() => void loadAliases(false)} disabled={loadingAliases || connecting || testingConnection}>
                    {loadingAliases ? "Loading..." : "Reload Aliases"}
                  </button>
                </div>
                {formErrors.tnsFilePath && <div style={fieldErrorStyle}>{formErrors.tnsFilePath}</div>}
                <div style={helpTextStyle}>
                  Enter the full path to `tnsnames.ora`. The app will read aliases and configure `TNS_ADMIN` automatically.
                </div>
              </div>

              <div>
                <label style={labelStyle}>Available Aliases</label>
                <select
                  value={aliases.find((entry) => entry.aliases.some((alias: string) => alias.toUpperCase() === tnsAlias.trim().toUpperCase()))?.name ?? ""}
                  onChange={(e) => setTnsAlias(e.target.value)}
                  style={inputStyle()}
                  disabled={aliases.length === 0}
                >
                  <option value="">Select an alias</option>
                  {aliases.map((entry) => (
                    <option key={`${entry.name}:${entry.aliases.join(",")}`} value={entry.name}>
                      {entry.aliases.join(", ")}
                    </option>
                  ))}
                </select>
                <div style={helpTextStyle}>
                  {aliases.length > 0
                    ? `${aliases.length} alias(es) loaded from the selected file.`
                    : "Load aliases from the TNS file, or type an alias manually below."}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Alias</label>
                <input
                  value={tnsAlias}
                  onChange={(e) => setTnsAlias(e.target.value)}
                  placeholder="MYDB"
                  list="gavadb-tns-aliases"
                  style={inputStyle(formErrors.tnsAlias)}
                />
                <datalist id="gavadb-tns-aliases">
                  {aliases.flatMap((entry) => entry.aliases).map((alias) => (
                    <option key={alias} value={alias} />
                  ))}
                </datalist>
                {formErrors.tnsAlias && <div style={fieldErrorStyle}>{formErrors.tnsAlias}</div>}
              </div>
            </>
          )}

          <div>
            <label style={labelStyle}>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="scott" style={inputStyle(formErrors.username)} />
            {formErrors.username && <div style={fieldErrorStyle}>{formErrors.username}</div>}
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" style={inputStyle(formErrors.password)} />
            {formErrors.password && <div style={fieldErrorStyle}>{formErrors.password}</div>}
          </div>

          {onSaveConnection && (
            <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: 12 }}>
              {!isEditing && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-secondary)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={saveConnection}
                    onChange={(e) => setSaveConnection(e.target.checked)}
                  />
                  Save this connection for quick access
                </label>
              )}
              {(saveConnection || isEditing) && (
                <div style={{ marginTop: 8 }}>
                  <label style={labelStyle}>Connection Name</label>
                  <input
                    value={friendlyName}
                    onChange={(e) => setFriendlyName(e.target.value)}
                    placeholder="e.g. Production DB, Dev Oracle"
                    style={inputStyle(formErrors.friendlyName)}
                  />
                  {formErrors.friendlyName && <div style={fieldErrorStyle}>{formErrors.friendlyName}</div>}
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div style={errorBoxStyle}>
            <div style={{ fontWeight: 600 }}>{error.message}</div>
            {error.details && (
              <div style={{ marginTop: 4, color: "var(--text-muted)", fontSize: 11, whiteSpace: "pre-wrap" }}>
                {error.details}
              </div>
            )}
            <div style={hintBoxStyle}>{getErrorHint(error.code)}</div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button onClick={onClose} disabled={connecting || testingConnection}>Cancel</button>
          <button onClick={() => void handleTestConnection()} disabled={connecting || testingConnection} style={secondaryBtnStyle}>
            {testingConnection ? "Testing..." : "Test Connection"}
          </button>
          <button onClick={() => void handleSubmit()} disabled={connecting || testingConnection} style={connectBtnStyle}>
            {connecting ? "Connecting..." : isEditing ? "Save & Close" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(0, 0, 0, 0.6)", zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-color)",
  borderRadius: 8, width: 620, maxWidth: "94vw",
  padding: 24, boxShadow: "0 16px 48px rgba(0, 0, 0, 0.4)",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "var(--font-size-sm)",
  color: "var(--text-secondary)", marginBottom: 4,
};

const fieldErrorStyle: React.CSSProperties = {
  fontSize: 11, color: "var(--danger)", marginTop: 2,
};

const helpTextStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
  marginTop: 4,
  lineHeight: 1.5,
};

const inputStyle = (fieldError?: string): React.CSSProperties => ({
  width: "100%", padding: "6px 10px",
  fontSize: "var(--font-size-base)", fontFamily: "var(--font-ui)",
  background: "var(--bg-primary)", color: "var(--text-primary)",
  border: `1px solid ${fieldError ? "var(--danger)" : "var(--border-color)"}`,
  borderRadius: "var(--radius)", outline: "none",
});

const errorBoxStyle: React.CSSProperties = {
  marginTop: 14, padding: "8px 10px",
  background: "rgba(243, 139, 168, 0.1)",
  border: "1px solid rgba(243, 139, 168, 0.25)",
  borderRadius: "var(--radius)",
  fontSize: "var(--font-size-sm)", color: "var(--danger)",
};

const hintBoxStyle: React.CSSProperties = {
  marginTop: 6, padding: "4px 8px",
  background: "rgba(137, 180, 250, 0.06)",
  borderRadius: "var(--radius)",
  fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5,
};

const connectBtnStyle: React.CSSProperties = {
  background: "var(--accent)", color: "var(--bg-primary)",
  border: "none", fontWeight: 600, padding: "6px 20px",
};

const secondaryBtnStyle: React.CSSProperties = {
  background: "transparent",
  color: "var(--text-primary)",
  border: "1px solid var(--border-color)",
  fontWeight: 600,
  padding: "6px 16px",
};

function getErrorHint(code: string): string {
  const hints: Record<string, string> = {
    CONNECTION_FAILED: "Check the Oracle server availability, the selected alias, and whether the TNS file points to a reachable service.",
    CONNECTION_LOST: "The connection to the database was interrupted. Try again.",
    QUERY_TIMEOUT: "The connection timed out. The alias may point to an unreachable listener or a slow network.",
    PERMISSION_DENIED: "Check that the username and password are correct and the account is allowed to connect.",
    OBJECT_NOT_FOUND: "The TNS file or alias was not found. Confirm the file path and reload aliases.",
    QUERY_FAILED: "The TNS file could not be read or the connection parameters are invalid.",
    UNKNOWN: "An unexpected error occurred. Verify the file path, alias, and Oracle connection settings.",
  };
  return hints[code] ?? hints.UNKNOWN;
}

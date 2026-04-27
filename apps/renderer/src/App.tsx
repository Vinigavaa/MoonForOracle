import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type {
  ConnectionConfig,
  DatabaseObjectType,
  SavedConnection,
  WorkspaceReadFileResponse,
} from "@gavadb/types";
import type { UpdaterStatus } from "@gavadb/ipc-contract";
import { Toolbar } from "./components/Toolbar";
import { Sidebar } from "./components/Sidebar";
import { SqlEditor, type SqlEditorHandle } from "./components/SqlEditor";
import { TabPanel, type Tab } from "./components/TabPanel";
import { ObjectViewer } from "./components/ObjectViewer";
import { ObjectSqlViewer } from "./components/ObjectSqlViewer";
import { ThemePreferencesPanel } from "./components/ThemePreferencesPanel";
import { ConnectionDialog } from "./components/ConnectionDialog";
import { AutoUpdateDialog } from "./components/AutoUpdateDialog";
import { useConnection } from "./hooks/useConnection";
import { useSavedConnections } from "./hooks/useSavedConnections";
import { useToastContext } from "./hooks/ToastContext";
import { loadSidebarPreferences, saveSidebarPreferences } from "./lib/sidebarPreferences";

const SQL_TAB_ID = "sql-editor";

interface ObjectTab {
  id: string;
  type: DatabaseObjectType;
  name: string;
}

interface ObjectSqlTab {
  id: string;
  type: DatabaseObjectType;
  name: string;
}

export function App() {
  const {
    status,
    error,
    isConnected,
    isConnecting,
    connect,
    disconnect,
    clearError,
    lastConfig,
    connectionLabel,
    transactionState,
    commitTransaction,
    rollbackTransaction,
    loadTnsAliases,
    testConnection,
    pickTnsFile,
  } = useConnection();

  const savedConns = useSavedConnections();
  const toast = useToastContext();
  const [transactionBusy, setTransactionBusy] = useState(false);
  const [showConnModal, setShowConnModal] = useState(false);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [editingConnection, setEditingConnection] = useState<SavedConnection | null>(null);
  const [editingPassword, setEditingPassword] = useState<string>("");
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => loadSidebarPreferences().collapsed);
  const [updaterStatus, setUpdaterStatus] = useState<UpdaterStatus | null>(null);
  const [activeTab, setActiveTab] = useState(SQL_TAB_ID);
  const [objectTabs, setObjectTabs] = useState<ObjectTab[]>([]);
  const [objectSqlTabs, setObjectSqlTabs] = useState<ObjectSqlTab[]>([]);
  const dismissedUpdateVersionRef = useRef<string | null>(null);
  const executeTriggerRef = useRef<(() => void) | null>(null);
  const executeAllTriggerRef = useRef<(() => void) | null>(null);
  const sqlEditorRef = useRef<SqlEditorHandle | null>(null);

  useEffect(() => {
    const preferences = loadSidebarPreferences();
    saveSidebarPreferences({ ...preferences, collapsed: sidebarCollapsed });
  }, [sidebarCollapsed]);

  const restoreFocusAfterPreferences = useCallback(() => {
    window.setTimeout(() => {
      sqlEditorRef.current?.focus();
    }, 0);
  }, []);

  const openPreferences = useCallback(() => {
    setPreferencesOpen(true);
  }, []);

  const closePreferences = useCallback(() => {
    setPreferencesOpen(false);
    restoreFocusAfterPreferences();
  }, [restoreFocusAfterPreferences]);

  useEffect(() => {
    if (!window.gavadb) return;
    const cleanup = window.gavadb.onError((err) => {
      if (!showConnModal) {
        toast.error(err.message);
      }
    });
    return cleanup;
  }, [toast, showConnModal]);

  useEffect(() => {
    if (!window.gavadb) return;

    return window.gavadb.onUpdaterStatusChanged((status) => {
      if (status.kind === "checking") {
        console.info("[Updater] Checking for updates");
        return;
      }

      if (status.kind === "not-available") {
        console.info("[Updater] App is up to date", status.currentVersion);
        return;
      }

      if (status.kind === "available" && dismissedUpdateVersionRef.current === status.version) {
        return;
      }

      setUpdaterStatus(status);
    });
  }, []);

  const handleDismissUpdater = useCallback(() => {
    if (updaterStatus?.kind === "available" || updaterStatus?.kind === "downloaded") {
      dismissedUpdateVersionRef.current = updaterStatus.version;
    }
    setUpdaterStatus(null);
  }, [updaterStatus]);

  const handleDownloadUpdate = useCallback(async () => {
    const result = await window.gavadb.updaterDownload();
    if (!result.success) {
      toast.error(result.error.message);
      setUpdaterStatus({ kind: "error", message: result.error.message });
    }
  }, [toast]);

  const handleInstallUpdate = useCallback(async () => {
    const result = await window.gavadb.updaterQuitAndInstall();
    if (!result.success) {
      toast.error(result.error.message);
      setUpdaterStatus({ kind: "error", message: result.error.message });
    }
  }, [toast]);

  useEffect(() => {
    if (!preferencesOpen) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePreferences();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [preferencesOpen, closePreferences]);

  const handleOpenConnect = useCallback(() => {
    clearError();
    setEditingConnection(null);
    setEditingPassword("");
    setShowConnModal(true);
  }, [clearError]);

  const handleConnect = useCallback(async (config: ConnectionConfig, savedConnectionId?: string) => {
    await connect(config);
    if (savedConnectionId) {
      setActiveConnectionId(savedConnectionId);
      await savedConns.updateLastUsed(savedConnectionId);
    } else {
      setActiveConnectionId(null);
    }
  }, [connect, savedConns]);

  const handleQuickConnect = useCallback(async (id: string) => {
    if (isConnected) {
      toast.warning("There is already an active connection. Disconnect before connecting to another database.");
      return;
    }
    if (activeConnectionId === id && isConnected) {
      toast.info("This connection is already active.");
      return;
    }
    setConnectingId(id);
    const connData = await savedConns.getWithPassword(id);
    if (!connData) {
      toast.error("Failed to load saved connection.");
      setConnectingId(null);
      return;
    }
    const config: ConnectionConfig = {
      id: connData.id,
      name: `${connData.username}@${connData.mode === "tns" ? connData.tnsAlias : `${connData.host}:${connData.port}/${connData.serviceName}`}`,
      mode: connData.mode,
      host: connData.host,
      port: connData.port,
      serviceName: connData.serviceName,
      connectString: connData.mode === "tns" ? (connData.tnsAlias ?? "") : "",
      tnsFilePath: connData.tnsFilePath,
      tnsAlias: connData.tnsAlias,
      username: connData.username,
      password: connData.password,
    };
    await connect(config);
    setActiveConnectionId(id);
    await savedConns.updateLastUsed(id);
    setConnectingId(null);
  }, [isConnected, connect, savedConns, activeConnectionId, toast]);

  const handleEditSavedConnection = useCallback(async (conn: SavedConnection) => {
    const connData = await savedConns.getWithPassword(conn.id);
    setEditingConnection(conn);
    setEditingPassword(connData?.password ?? "");
    clearError();
    setShowConnModal(true);
  }, [savedConns, clearError]);

  const handleDeleteSavedConnection = useCallback(async (id: string, name: string) => {
    const removed = await savedConns.remove(id);
    if (removed) {
      toast.info(`Connection "${name}" deleted`);
      if (activeConnectionId === id) setActiveConnectionId(null);
    }
  }, [savedConns, toast, activeConnectionId]);

  const handleCloseModal = useCallback(() => {
    if (!isConnecting) {
      setShowConnModal(false);
      setEditingConnection(null);
      setEditingPassword("");
      clearError();
    }
  }, [isConnecting, clearError]);

  const prevConnectedRef = useRef(false);
  useEffect(() => {
    if (isConnected && !prevConnectedRef.current) {
      if (showConnModal) setShowConnModal(false);
      toast.success("Connected to database");
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected, showConnModal, toast]);

  const handleDisconnect = useCallback(async () => {
    if (transactionState.hasPendingChanges) {
      const commitFirst = window.confirm("There are uncommitted changes. Click OK to commit before disconnecting, or Cancel to choose rollback/cancel.");
      if (commitFirst) {
        setTransactionBusy(true);
        const result = await commitTransaction();
        setTransactionBusy(false);
        if ("error" in result && result.error) {
          toast.error(result.error.message);
          return;
        }
        toast.success("Transaction committed");
      } else {
        const rollbackChanges = window.confirm("Rollback all pending changes before disconnecting?");
        if (!rollbackChanges) return;
        setTransactionBusy(true);
        const result = await rollbackTransaction();
        setTransactionBusy(false);
        if (result.error) {
          toast.error(result.error.message);
          return;
        }
        toast.info("Pending transaction rolled back");
      }
    }

    await disconnect();
    setActiveConnectionId(null);
    toast.info("Disconnected from database");
  }, [commitTransaction, disconnect, rollbackTransaction, toast, transactionState.hasPendingChanges]);

  const handleCommit = useCallback(async () => {
    setTransactionBusy(true);
    const result = await commitTransaction();
    setTransactionBusy(false);
    if ("error" in result && result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Transaction committed");
  }, [commitTransaction, toast]);

  const handleRollback = useCallback(async () => {
    setTransactionBusy(true);
    const result = await rollbackTransaction();
    setTransactionBusy(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.info("Pending transaction rolled back");
  }, [rollbackTransaction, toast]);

  const handleExecuteSql = useCallback(() => {
    if (!isConnected) {
      toast.warning("Connect to a database first");
      return;
    }
    setActiveTab(SQL_TAB_ID);
    executeTriggerRef.current?.();
  }, [isConnected, toast]);

  const handleExecuteAllSql = useCallback(() => {
    if (!isConnected) {
      toast.warning("Connect to a database first");
      return;
    }
    setActiveTab(SQL_TAB_ID);
    executeAllTriggerRef.current?.();
  }, [isConnected, toast]);

  const handleObjectSelect = useCallback((type: DatabaseObjectType, name: string) => {
    const id = `obj:${type}:${name}`;
    setObjectTabs((prev) => prev.some((tab) => tab.id === id) ? prev : [...prev, { id, type, name }]);
    setActiveTab(id);
  }, []);

  const handleObjectSqlOpen = useCallback((type: DatabaseObjectType, name: string) => {
    const id = `obj-sql:${type}:${name}`;
    setObjectSqlTabs((prev) => prev.some((tab) => tab.id === id) ? prev : [...prev, { id, type, name }]);
    setActiveTab(id);
  }, []);

  const handleOpenWorkspaceFile = useCallback((file: WorkspaceReadFileResponse) => {
    setActiveTab(SQL_TAB_ID);
    sqlEditorRef.current?.openFile(file);
  }, []);

  const handleTabClose = useCallback((id: string) => {
    setObjectTabs((prev) => prev.filter((tab) => tab.id !== id));
    setObjectSqlTabs((prev) => prev.filter((tab) => tab.id !== id));
    setActiveTab((prev) => (prev === id ? SQL_TAB_ID : prev));
  }, []);

  const prevConnected2 = useRef(false);
  useEffect(() => {
    if (!isConnected && prevConnected2.current) {
      setObjectTabs([]);
      setObjectSqlTabs([]);
      setActiveTab(SQL_TAB_ID);
    }
    prevConnected2.current = isConnected;
  }, [isConnected]);

  const tabs: Tab[] = [{ id: SQL_TAB_ID, label: "SQL Editor" }];
  for (const tab of objectTabs) {
    tabs.push({
      id: tab.id,
      label: tab.name,
      closable: true,
    });
  }
  for (const tab of objectSqlTabs) {
    tabs.push({
      id: tab.id,
      label: `${tab.name} SQL`,
      closable: true,
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Toolbar
        status={status}
        connectionLabel={connectionLabel}
        hasPendingTransaction={transactionState.hasPendingChanges}
        isConnected={isConnected}
        transactionBusy={transactionBusy}
        onConnect={handleOpenConnect}
        onDisconnect={handleDisconnect}
        onCommit={handleCommit}
        onRollback={handleRollback}
        onExecuteSql={handleExecuteSql}
        onExecuteAllSql={handleExecuteAllSql}
        onOpenPreferences={openPreferences}
      />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar
          collapsed={sidebarCollapsed}
          isConnected={isConnected}
          onObjectSelect={handleObjectSelect}
          onOpenWorkspaceFile={handleOpenWorkspaceFile}
          savedConnections={savedConns.connections}
          activeConnectionId={activeConnectionId}
          connectingId={connectingId}
          onQuickConnect={handleQuickConnect}
          onEditConnection={handleEditSavedConnection}
          onDeleteConnection={handleDeleteSavedConnection}
          onToggleFavorite={savedConns.toggleFavorite}
          onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
        />

        <TabPanel tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} onTabClose={handleTabClose}>
          <div style={{ display: activeTab === SQL_TAB_ID ? "contents" : "none" }}>
            <SqlEditor
              ref={sqlEditorRef}
              isConnected={isConnected}
              activeConnectionId={activeConnectionId}
              hasPendingTransaction={transactionState.hasPendingChanges}
              executeTriggerRef={executeTriggerRef}
              executeAllTriggerRef={executeAllTriggerRef}
              onOpenObject={handleObjectSelect}
            />
          </div>

          {objectTabs.map((tab) => (
            <div key={tab.id} style={{ display: activeTab === tab.id ? "contents" : "none" }}>
              <ObjectViewer
                objectType={tab.type}
                objectName={tab.name}
                activeConnectionId={activeConnectionId}
                onViewSql={handleObjectSqlOpen}
              />
            </div>
          ))}

          {objectSqlTabs.map((tab) => (
            <div key={tab.id} style={{ display: activeTab === tab.id ? "contents" : "none" }}>
              <ObjectSqlViewer objectType={tab.type} objectName={tab.name} />
            </div>
          ))}
        </TabPanel>
      </div>

      {preferencesOpen && (
        <div style={preferencesOverlayStyle} onClick={closePreferences}>
          <div style={preferencesDrawerStyle} onClick={(event) => event.stopPropagation()}>
            <ThemePreferencesPanel onClose={closePreferences} />
          </div>
        </div>
      )}

      <ConnectionDialog
        open={showConnModal}
        onClose={handleCloseModal}
        onConnect={handleConnect}
        onTestConnection={testConnection}
        onLoadTnsAliases={loadTnsAliases}
        onPickTnsFile={pickTnsFile}
        onSaveConnection={savedConns.save}
        lastConfig={lastConfig}
        error={error}
        connecting={isConnecting}
        editingConnection={editingConnection}
        editingPassword={editingPassword}
      />

      <AutoUpdateDialog
        status={updaterStatus}
        onDownload={handleDownloadUpdate}
        onInstall={handleInstallUpdate}
        onDismiss={handleDismissUpdater}
      />
    </div>
  );
}

const preferencesOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.36)",
  display: "flex",
  justifyContent: "flex-end",
  zIndex: 40,
};

const preferencesDrawerStyle: CSSProperties = {
  width: "min(1240px, calc(100vw - 48px))",
  height: "100vh",
  background: "var(--panel-bg)",
  borderLeft: "1px solid var(--border-color)",
  boxShadow: "-16px 0 48px rgba(0, 0, 0, 0.28)",
  overflow: "hidden",
};

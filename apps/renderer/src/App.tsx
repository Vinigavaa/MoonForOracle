import { useCallback, useEffect, useRef, useState } from "react";
import type { DatabaseObjectType, ConnectionConfig, SavedConnection } from "@gavadb/types";
import { Toolbar } from "./components/Toolbar";
import { Sidebar } from "./components/Sidebar";
import { TabPanel, type Tab } from "./components/TabPanel";
import { SqlEditor } from "./components/SqlEditor";
import { ObjectViewer } from "./components/ObjectViewer";
import { ThemePreferencesPanel } from "./components/ThemePreferencesPanel";
import { ConnectionDialog } from "./components/ConnectionDialog";
import { useConnection } from "./hooks/useConnection";
import { useSavedConnections } from "./hooks/useSavedConnections";
import { useToastContext } from "./hooks/ToastContext";
import { loadSidebarPreferences, saveSidebarPreferences } from "./lib/sidebarPreferences";

const SQL_TAB_ID = "sql-editor";
const PREFS_TAB_ID = "preferences";

interface ObjectTab {
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
  const [activeTab, setActiveTab] = useState(SQL_TAB_ID);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [editingConnection, setEditingConnection] = useState<SavedConnection | null>(null);
  const [editingPassword, setEditingPassword] = useState<string>("");
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [objectTabs, setObjectTabs] = useState<ObjectTab[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => loadSidebarPreferences().collapsed);
  const executeTriggerRef = useRef<(() => void) | null>(null);
  const executeAllTriggerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    saveSidebarPreferences({ collapsed: sidebarCollapsed });
  }, [sidebarCollapsed]);

  // Listen for backend errors via IPC and surface as toasts
  useEffect(() => {
    if (!window.gavadb) return;
    const cleanup = window.gavadb.onError((err) => {
      // Only toast errors not already handled by the connection modal
      if (!showConnModal) {
        toast.error(err.message);
      }
    });
    return cleanup;
  }, [toast, showConnModal]);

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

  // Auto-close modal and show toast on successful connection
  const prevConnectedRef = useRef(false);
  if (isConnected && !prevConnectedRef.current) {
    if (showConnModal) setShowConnModal(false);
    toast.success("Connected to database");
  }
  prevConnectedRef.current = isConnected;

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
    const tabId = `obj:${type}:${name}`;
    setObjectTabs((prev) => {
      if (prev.some((t) => t.id === tabId)) return prev;
      return [...prev, { id: tabId, type, name }];
    });
    setActiveTab(tabId);
  }, []);

  const handleTabClose = useCallback((id: string) => {
    if (id === SQL_TAB_ID) return;
    setObjectTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      setActiveTab((current) => (current === id ? SQL_TAB_ID : current));
      return next;
    });
  }, []);

  // Clean up object tabs on disconnect
  const prevConnected2 = useRef(false);
  if (!isConnected && prevConnected2.current) {
    if (objectTabs.length > 0) {
      setObjectTabs([]);
      setActiveTab(SQL_TAB_ID);
    }
  }
  prevConnected2.current = isConnected;

  const tabs: Tab[] = [{ id: SQL_TAB_ID, label: "SQL Editor" }];
  for (const ot of objectTabs) {
    tabs.push({ id: ot.id, label: ot.name, closable: true });
  }
  tabs.push({ id: PREFS_TAB_ID, label: "⚙ Preferences", closable: false });

  const activeObjectTab = objectTabs.find((t) => t.id === activeTab);

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
      />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar
          collapsed={sidebarCollapsed}
          isConnected={isConnected}
          onObjectSelect={handleObjectSelect}
          savedConnections={savedConns.connections}
          activeConnectionId={activeConnectionId}
          connectingId={connectingId}
          onQuickConnect={handleQuickConnect}
          onEditConnection={handleEditSavedConnection}
          onDeleteConnection={handleDeleteSavedConnection}
          onToggleFavorite={savedConns.toggleFavorite}
          onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
        />

        <TabPanel
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onTabClose={handleTabClose}
        >
          <div style={{ display: activeTab === SQL_TAB_ID ? "contents" : "none" }}>
            <SqlEditor
              isConnected={isConnected}
              executeTriggerRef={executeTriggerRef}
              executeAllTriggerRef={executeAllTriggerRef}
              onOpenObject={handleObjectSelect}
            />
          </div>

          {activeObjectTab && (
            <ObjectViewer
              key={activeObjectTab.id}
              objectType={activeObjectTab.type}
              objectName={activeObjectTab.name}
            />
          )}

          {activeTab === PREFS_TAB_ID && <ThemePreferencesPanel />}
        </TabPanel>
      </div>

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
    </div>
  );
}

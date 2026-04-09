import { useCallback, useEffect, useState } from "react";
import type { ConnectionConfig, ConnectionStatus, AppError, TransactionState } from "@gavadb/types";

/** Config sem senha — mantida em memória para preencher o modal na próxima conexão */
type SavedConfig = Omit<ConnectionConfig, "password">;

export function useConnection() {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<AppError | null>(null);
  const [lastConfig, setLastConfig] = useState<SavedConfig | null>(null);
  const [connectionLabel, setConnectionLabel] = useState<string | null>(null);
  const [transactionState, setTransactionState] = useState<TransactionState>({ hasPendingChanges: false });

  useEffect(() => {
    if (!window.gavadb) return;
    const cleanupStatus = window.gavadb.onStatusChanged(setStatus);
    const cleanupTx = window.gavadb.onTransactionStateChanged(setTransactionState);
    const cleanupError = window.gavadb.onError(setError);
    return () => {
      cleanupStatus();
      cleanupTx();
      cleanupError();
    };
  }, []);

  const refreshTransactionState = useCallback(async () => {
    const result = await window.gavadb.dbGetTransactionState();
    if (result.success) {
      setTransactionState(result.data);
      return result.data;
    }
    setError(result.error);
    return null;
  }, []);

  const connect = useCallback(async (config: ConnectionConfig) => {
    setError(null);
    const result = await window.gavadb.dbConnect(config);
    if (result.success) {
      // Guarda config sem senha para reutilizar no modal
      const { password: _, ...saved } = config;
      setLastConfig(saved);
      const target = config.mode === "tns"
        ? config.connectString
        : `${config.host}:${config.port}/${config.serviceName}`;
      setConnectionLabel(`${config.username}@${target}`);
      setTransactionState({ hasPendingChanges: false });
    } else {
      setError(result.error);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setError(null);
    const result = await window.gavadb.dbDisconnect();
    if (result.success) {
      setConnectionLabel(null);
      setTransactionState({ hasPendingChanges: false });
    } else {
      setError(result.error);
    }
  }, []);

  const commitTransaction = useCallback(async () => {
    setError(null);
    const result = await window.gavadb.dbCommit();
    if (result.success) {
      setTransactionState({ hasPendingChanges: false });
      return { data: result.data };
    }
    setError(result.error);
    return { error: result.error };
  }, []);

  const rollbackTransaction = useCallback(async () => {
    setError(null);
    const result = await window.gavadb.dbRollback();
    if (result.success) {
      setTransactionState({ hasPendingChanges: false });
      return {};
    }
    setError(result.error);
    return { error: result.error };
  }, []);

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";

  return {
    status,
    error,
    isConnected,
    isConnecting,
    connect,
    disconnect,
    clearError: () => setError(null),
    lastConfig,
    connectionLabel,
    transactionState,
    refreshTransactionState,
    commitTransaction,
    rollbackTransaction,
  };
}

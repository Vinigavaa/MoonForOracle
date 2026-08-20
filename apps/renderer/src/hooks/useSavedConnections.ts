import { useCallback, useEffect, useState } from "react";
import type { ConnectionFolder, SavedConnection, SaveConnectionRequest, SavedConnectionWithPassword } from "@gavadb/types";

export function useSavedConnections() {
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [folders, setFolders] = useState<ConnectionFolder[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [connectionsResult, foldersResult] = await Promise.all([
        window.gavadb.connListSaved(),
        window.gavadb.connListFolders(),
      ]);
      if (connectionsResult.success) setConnections(connectionsResult.data);
      if (foldersResult.success) setFolders(foldersResult.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async (request: SaveConnectionRequest): Promise<SavedConnection | null> => {
    const result = await window.gavadb.connSave(request);
    if (result.success) {
      await refresh();
      return result.data;
    }
    return null;
  }, [refresh]);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    const result = await window.gavadb.connDelete(id);
    if (result.success) {
      await refresh();
      return true;
    }
    return false;
  }, [refresh]);

  const toggleFavorite = useCallback(async (id: string) => {
    const result = await window.gavadb.connToggleFavorite(id);
    if (result.success) {
      await refresh();
    }
  }, [refresh]);

  const getWithPassword = useCallback(async (id: string): Promise<SavedConnectionWithPassword | null> => {
    const result = await window.gavadb.connGetWithPassword(id);
    if (result.success) return result.data;
    return null;
  }, []);

  const updateLastUsed = useCallback(async (id: string) => {
    await window.gavadb.connUpdateLastUsed(id);
    await refresh();
  }, [refresh]);

  const createFolder = useCallback(async (name: string): Promise<boolean> => {
    const result = await window.gavadb.connCreateFolder({ name });
    if (!result.success) return false;
    await refresh();
    return true;
  }, [refresh]);

  const renameFolder = useCallback(async (id: string, name: string): Promise<boolean> => {
    const result = await window.gavadb.connRenameFolder({ id, name });
    if (!result.success) return false;
    await refresh();
    return true;
  }, [refresh]);

  const deleteFolder = useCallback(async (id: string): Promise<boolean> => {
    const result = await window.gavadb.connDeleteFolder(id);
    if (!result.success) return false;
    await refresh();
    return true;
  }, [refresh]);

  const moveConnection = useCallback(async (connectionId: string, folderId: string | null): Promise<boolean> => {
    const result = await window.gavadb.connMove({ connectionId, folderId });
    if (!result.success) return false;
    await refresh();
    return true;
  }, [refresh]);

  return {
    connections,
    folders,
    loading,
    refresh,
    save,
    remove,
    toggleFavorite,
    getWithPassword,
    updateLastUsed,
    createFolder,
    renameFolder,
    deleteFolder,
    moveConnection,
  };
}

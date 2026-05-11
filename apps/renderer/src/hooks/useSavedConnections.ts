import { useCallback, useEffect, useState } from "react";
import type { SavedConnection, SaveConnectionRequest, SavedConnectionWithPassword } from "@gavadb/types";

export function useSavedConnections() {
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await window.gavadb.connListSaved();
      if (result.success) {
        setConnections(result.data);
      }
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

  return {
    connections,
    loading,
    refresh,
    save,
    remove,
    toggleFavorite,
    getWithPassword,
    updateLastUsed,
  };
}

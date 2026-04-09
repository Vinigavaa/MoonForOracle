import { useState, useCallback, useEffect } from "react";
import type { DatabaseObjectType, DatabaseObjectSummary } from "@gavadb/types";

export interface SectionState {
  objects: DatabaseObjectSummary[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
}

const EMPTY_SECTION: SectionState = { objects: [], loading: false, error: null, loaded: false };

export function useObjectList(isConnected: boolean) {
  const [sections, setSections] = useState<Record<string, SectionState>>({});

  useEffect(() => {
    if (!isConnected) setSections({});
  }, [isConnected]);

  const loadSection = useCallback(async (type: DatabaseObjectType) => {
    setSections((prev) => ({
      ...prev,
      [type]: { ...EMPTY_SECTION, loading: true },
    }));
    try {
      const result = await window.gavadb.dbListObjects(type);
      if (result.success) {
        setSections((prev) => ({
          ...prev,
          [type]: { objects: result.data, loading: false, error: null, loaded: true },
        }));
      } else {
        setSections((prev) => ({
          ...prev,
          [type]: { objects: [], loading: false, error: result.error.message, loaded: true },
        }));
      }
    } catch (err) {
      setSections((prev) => ({
        ...prev,
        [type]: { objects: [], loading: false, error: String(err), loaded: true },
      }));
    }
  }, []);

  const getSection = useCallback((type: DatabaseObjectType): SectionState => {
    return sections[type] ?? EMPTY_SECTION;
  }, [sections]);

  return { getSection, loadSection };
}

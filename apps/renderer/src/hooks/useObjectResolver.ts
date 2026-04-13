import { useCallback, useEffect, useRef } from "react";
import type { DatabaseObjectType, DatabaseObjectSummary } from "@gavadb/types";

const OBJECT_TYPES: readonly DatabaseObjectType[] = [
  "tables",
  "views",
  "packages",
  "procedures",
  "functions",
  "triggers",
];

type ObjectIndex = Map<string, DatabaseObjectSummary>;

function normalizeObjectName(name: string): string {
  const trimmed = name.trim();
  const objectPart = trimmed.includes(".") ? (trimmed.split(".").pop() ?? trimmed) : trimmed;
  return objectPart.replace(/^"+|"+$/g, "").toUpperCase();
}

export function useObjectResolver(isConnected: boolean) {
  const cacheRef = useRef<Partial<Record<DatabaseObjectType, ObjectIndex>>>({});
  const pendingRef = useRef<Partial<Record<DatabaseObjectType, Promise<ObjectIndex>>>>({});

  useEffect(() => {
    if (!isConnected) {
      cacheRef.current = {};
      pendingRef.current = {};
    }
  }, [isConnected]);

  const loadType = useCallback(async (type: DatabaseObjectType): Promise<ObjectIndex> => {
    const cached = cacheRef.current[type];
    if (cached) return cached;

    const pending = pendingRef.current[type];
    if (pending) return pending;

    const request = window.gavadb.dbListObjects(type).then((result) => {
      if (!result.success) {
        throw new Error(result.error.message);
      }

      const index: ObjectIndex = new Map();
      for (const object of result.data) {
        index.set(normalizeObjectName(object.name), object);
      }

      cacheRef.current[type] = index;
      delete pendingRef.current[type];
      return index;
    }).catch((error) => {
      delete pendingRef.current[type];
      throw error;
    });

    pendingRef.current[type] = request;
    return request;
  }, []);

  const resolveObject = useCallback(async (name: string) => {
    const normalized = normalizeObjectName(name);
    if (!normalized) return null;

    const searchResult = await window.gavadb.dbSearchObjects(normalized, 20);
    if (searchResult.success) {
      const exactMatch = searchResult.data.find((item) => normalizeObjectName(item.name) === normalized);
      if (exactMatch) {
        return { type: exactMatch.type, name: exactMatch.name };
      }
    }

    for (const type of OBJECT_TYPES) {
      const index = await loadType(type);
      const match = index.get(normalized);
      if (match) {
        return { type, name: match.name };
      }
    }

    return null;
  }, [loadType]);

  return { resolveObject };
}

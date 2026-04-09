import type { ConnectionConfig } from "@gavadb/types";

const STORAGE_KEY = "gavadb.connection-preferences.v1";

export interface ConnectionPreferences {
  mode: ConnectionConfig["mode"];
  host: string;
  port: string;
  serviceName: string;
  connectString: string;
  tnsFilePath: string;
  tnsAlias: string;
  username: string;
}

export function loadConnectionPreferences(): ConnectionPreferences | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return { ...defaultConnectionPreferences(), ...JSON.parse(raw) } as ConnectionPreferences;
  } catch {
    return null;
  }
}

export function saveConnectionPreferences(preferences: ConnectionPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

export function defaultConnectionPreferences(): ConnectionPreferences {
  return {
    mode: "basic",
    host: "",
    port: "1521",
    serviceName: "",
    connectString: "",
    tnsFilePath: "",
    tnsAlias: "",
    username: "",
  };
}

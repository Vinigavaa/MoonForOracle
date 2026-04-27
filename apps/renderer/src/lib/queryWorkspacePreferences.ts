import {
  createDefaultQueryWorkspaceState,
  createEditorGroup,
  createQueryTab,
  type EditorGroup,
  type QueryWorkspaceMode,
  type QueryWorkspaceState,
} from "../components/query-workspace/queryWorkspaceTypes";

const STORAGE_KEY = "gavadb.query-workspace.v2";

interface PersistedQueryTab {
  id: string;
  sql: string;
  filePath: string | null;
  connectionId: string | null;
}

interface PersistedEditorGroup {
  id: string;
  activeTabId: string | null;
  resultSplitRatio: number;
  tabs: PersistedQueryTab[];
}

interface PersistedQueryWorkspaceState {
  mode: QueryWorkspaceMode;
  groups: PersistedEditorGroup[];
  activeGroupId: string | null;
  groupSplitRatio: number;
}

export function loadQueryWorkspacePreferences(connectionId: string | null = null): QueryWorkspaceState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizePersistedWorkspace(JSON.parse(raw), connectionId);
  } catch {
    return null;
  }
}

export function saveQueryWorkspacePreferences(state: QueryWorkspaceState): void {
  const payload: PersistedQueryWorkspaceState = {
    mode: state.mode,
    activeGroupId: state.activeGroupId,
    groupSplitRatio: state.groupSplitRatio,
    groups: state.groups.map((group) => ({
      id: group.id,
      activeTabId: group.activeTabId,
      resultSplitRatio: group.resultSplitRatio,
      tabs: group.tabs.map((tab) => ({
        id: tab.id,
        sql: tab.sql,
        filePath: tab.filePath,
        connectionId: tab.connectionId,
      })),
    })),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function normalizePersistedWorkspace(value: unknown, connectionId: string | null): QueryWorkspaceState | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Partial<PersistedQueryWorkspaceState>;
  const groups = Array.isArray(record.groups)
    ? record.groups.map((group) => normalizeGroup(group, connectionId)).filter((group): group is EditorGroup => group !== null).slice(0, 2)
    : [];

  if (groups.length === 0) {
    return createDefaultQueryWorkspaceState(connectionId);
  }

  const mode = groups.length < 2
    ? "single"
    : "side-by-side";

  const activeGroupId = groups.some((group) => group.id === record.activeGroupId)
    ? record.activeGroupId ?? groups[0].id
    : groups[0].id;

  return {
    mode,
    groups,
    activeGroupId,
    groupSplitRatio: clampRatio(record.groupSplitRatio),
  };
}

function normalizeGroup(value: unknown, connectionId: string | null): EditorGroup | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Partial<PersistedEditorGroup>;
  const tabs = Array.isArray(record.tabs)
    ? record.tabs.map((tab) => normalizeTab(tab, connectionId)).filter((tab) => tab !== null)
    : [];

  if (tabs.length === 0) {
    return createEditorGroup(connectionId);
  }

  const activeTabId = tabs.some((tab) => tab.id === record.activeTabId)
    ? record.activeTabId ?? tabs[0].id
    : tabs[0].id;

  return {
    id: typeof record.id === "string" && record.id ? record.id : createEditorGroup(connectionId).id,
    activeTabId,
    resultSplitRatio: clampRatio(record.resultSplitRatio, 0.2, 0.8, 0.46),
    tabs,
  };
}

function normalizeTab(value: unknown, connectionId: string | null) {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<PersistedQueryTab>;
  if (typeof record.id !== "string" || typeof record.sql !== "string") {
    return null;
  }

  return createQueryTab(connectionId, {
    id: record.id,
    sql: record.sql,
    filePath: typeof record.filePath === "string" ? record.filePath : null,
    connectionId: typeof record.connectionId === "string" ? record.connectionId : connectionId,
  });
}

function clampRatio(value: unknown, min = 0.2, max = 0.8, fallback = 0.5): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

import type {
  BindMetadata,
  BindParameterValue,
  QueryResultRow,
  SqlExecutionResponse,
} from "@gavadb/types";
import { generateId } from "@gavadb/utils";
import type { BatchStatementExecution } from "../../lib/sqlBatchExecution";
import type { SqlEditorExecutionSnapshot } from "../../lib/sqlExecutionTarget";
import type { SortState } from "../ResultGrid";

export type QueryWorkspaceMode = "single" | "side-by-side";

export interface BindInputCacheEntry {
  raw: string;
  isNull: boolean;
}

export interface QueryTabState {
  id: string;
  sql: string;
  filePath: string | null;
  currentExecutionSnapshot: SqlEditorExecutionSnapshot | null;
  connectionId: string | null;
  result: SqlExecutionResponse | null;
  batchResults: BatchStatementExecution[] | null;
  allRows: QueryResultRow[];
  executedSql: string | null;
  executedBinds: Record<string, BindParameterValue> | null;
  error: string | null;
  executing: boolean;
  loadingMore: boolean;
  mutating: boolean;
  sorting: boolean;
  activeSort: SortState | null;
  detectedBinds: BindMetadata[];
  bindInputCache: Record<string, BindInputCacheEntry>;
  hasPendingTransaction: boolean;
}

export interface EditorGroup {
  id: string;
  activeTabId: string | null;
  tabs: QueryTabState[];
  resultSplitRatio: number;
}

export interface QueryWorkspaceState {
  mode: QueryWorkspaceMode;
  groups: EditorGroup[];
  activeGroupId: string | null;
  groupSplitRatio: number;
}

export type QueryDropPosition = "center" | "right";

export interface QueryTabDragData {
  tabId: string;
  sourceGroupId: string;
}

export interface QueryWorkspaceTabSummary {
  id: string;
  label: string;
  groupId: string;
  closable: boolean;
}

export function createQueryTab(connectionId: string | null = null, partial?: Partial<QueryTabState>): QueryTabState {
  return {
    id: partial?.id ?? generateId(),
    sql: partial?.sql ?? "",
    filePath: partial?.filePath ?? null,
    currentExecutionSnapshot: partial?.currentExecutionSnapshot ?? null,
    connectionId: partial?.connectionId ?? connectionId,
    result: partial?.result ?? null,
    batchResults: partial?.batchResults ?? null,
    allRows: partial?.allRows ?? [],
    executedSql: partial?.executedSql ?? null,
    executedBinds: partial?.executedBinds ?? null,
    error: partial?.error ?? null,
    executing: partial?.executing ?? false,
    loadingMore: partial?.loadingMore ?? false,
    mutating: partial?.mutating ?? false,
    sorting: partial?.sorting ?? false,
    activeSort: partial?.activeSort ?? null,
    detectedBinds: partial?.detectedBinds ?? [],
    bindInputCache: partial?.bindInputCache ?? {},
    hasPendingTransaction: partial?.hasPendingTransaction ?? false,
  };
}

export function createEditorGroup(connectionId: string | null = null, initialTab?: QueryTabState): EditorGroup {
  const tab = initialTab ?? createQueryTab(connectionId);
  return {
    id: generateId(),
    activeTabId: tab.id,
    tabs: [tab],
    resultSplitRatio: 0.46,
  };
}

export function createDefaultQueryWorkspaceState(connectionId: string | null = null): QueryWorkspaceState {
  const group = createEditorGroup(connectionId);
  return {
    mode: "single",
    groups: [group],
    activeGroupId: group.id,
    groupSplitRatio: 0.5,
  };
}

export function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

export function getQueryTabLabel(filePath: string | null, queryIndex: number): string {
  return filePath ? getFileName(filePath) : `Query ${queryIndex}`;
}

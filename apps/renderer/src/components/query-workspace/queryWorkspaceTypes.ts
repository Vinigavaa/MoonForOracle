import type {
  BindMetadata,
  BindParameterValue,
  DbmsOutputLine,
  DatabaseObjectType,
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
  kind: "query";
  id: string;
  sql: string;
  filePath: string | null;
  currentExecutionSnapshot: SqlEditorExecutionSnapshot | null;
  connectionId: string | null;
  isResultVisible: boolean;
  result: SqlExecutionResponse | null;
  batchResults: BatchStatementExecution[] | null;
  dbmsOutput: DbmsOutputLine[];
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

/** Alvo de navegação dentro do editor de um objeto de código (ex.: pular para
 *  a declaração de um membro de package). `token` é um contador monotônico que
 *  garante o re-disparo do scroll mesmo ao clicar no mesmo membro de novo. */
export interface ObjectNavigationTarget {
  line: number;
  part: "spec" | "body";
  token: number;
}

export interface ObjectTabState {
  kind: "object";
  id: string;
  objectType: DatabaseObjectType;
  objectName: string;
  connectionId: string | null;
  navTarget: ObjectNavigationTarget | null;
}

export interface ObjectSqlTabState {
  kind: "object-sql";
  id: string;
  objectType: DatabaseObjectType;
  objectName: string;
  connectionId: string | null;
}

export type WorkspaceTabState = QueryTabState | ObjectTabState | ObjectSqlTabState;

export interface EditorGroup {
  id: string;
  activeTabId: string | null;
  tabs: WorkspaceTabState[];
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
  const initialSql = partial?.sql ?? "";

  return {
    kind: "query",
    id: partial?.id ?? generateId(),
    sql: initialSql,
    filePath: partial?.filePath ?? null,
    currentExecutionSnapshot: partial?.currentExecutionSnapshot ?? null,
    connectionId: partial?.connectionId ?? connectionId,
    isResultVisible: partial?.isResultVisible ?? initialSql.trim().length > 0,
    result: partial?.result ?? null,
    batchResults: partial?.batchResults ?? null,
    dbmsOutput: partial?.dbmsOutput ?? [],
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

export function createObjectTab(
  objectType: DatabaseObjectType,
  objectName: string,
  connectionId: string | null = null,
  partial?: Partial<ObjectTabState>,
): ObjectTabState {
  return {
    kind: "object",
    id: partial?.id ?? generateId(),
    objectType,
    objectName,
    connectionId: partial?.connectionId ?? connectionId,
    navTarget: partial?.navTarget ?? null,
  };
}

export function createObjectSqlTab(
  objectType: DatabaseObjectType,
  objectName: string,
  connectionId: string | null = null,
  partial?: Partial<ObjectSqlTabState>,
): ObjectSqlTabState {
  return {
    kind: "object-sql",
    id: partial?.id ?? generateId(),
    objectType,
    objectName,
    connectionId: partial?.connectionId ?? connectionId,
  };
}

export function createEditorGroup(connectionId: string | null = null, initialTab?: WorkspaceTabState): EditorGroup {
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

export function getWorkspaceTabLabel(tab: WorkspaceTabState, queryIndex: number): string {
  if (tab.kind === "query") {
    return tab.filePath ? getFileName(tab.filePath) : `Query ${queryIndex}`;
  }
  if (tab.kind === "object") {
    return tab.objectName;
  }
  return `${tab.objectName} SQL`;
}

export function isQueryTab(tab: WorkspaceTabState): tab is QueryTabState {
  return tab.kind === "query";
}

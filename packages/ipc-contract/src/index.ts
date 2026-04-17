// Contrato IPC — define os canais e payloads entre Electron main ↔ renderer.
// Ambos os lados importam daqui, garantindo type-safety ponta a ponta.

import type {
  ConnectionConfig,
  ConnectionStatus,
  TransactionState,
  TnsAliasEntry,
  TnsFileRequest,
  DatabaseObjectType,
  DatabaseObjectSummary,
  DatabaseObjectSuggestion,
  MutationResult,
  SqlExecutionRequest,
  SqlExecutionResponse,
  CountRowsRequest,
  CountRowsResponse,
  BindMetadata,
  InferBindsRequest,
  SearchColumnsRequest,
  SqlColumnSuggestion,
  QueryExportRequest,
  QueryExportResponse,
  QueryExportProgress,
  ObjectDetailResponse,
  UpdateRowRequest,
  AppError,
  IpcResult,
  SavedConnection,
  SaveConnectionRequest,
  SavedConnectionWithPassword,
} from "@gavadb/types";

/** Canais que o renderer pode invocar no main process (ipcRenderer.invoke) */
export interface IpcMainHandlers {
  "file:save": (request: { content: string; filePath?: string }) => Promise<IpcResult<string | null>>;
  "db:connect": (config: ConnectionConfig) => Promise<IpcResult<void>>;
  "db:disconnect": () => Promise<IpcResult<void>>;
  "db:execute-query": (request: SqlExecutionRequest) => Promise<IpcResult<SqlExecutionResponse>>;
  "db:infer-binds": (request: InferBindsRequest) => Promise<IpcResult<BindMetadata[]>>;
  "db:count-rows": (request: CountRowsRequest) => Promise<IpcResult<CountRowsResponse>>;
  "db:update-rows": (request: UpdateRowRequest[]) => Promise<IpcResult<MutationResult>>;
  "db:commit": () => Promise<IpcResult<MutationResult>>;
  "db:rollback": () => Promise<IpcResult<void>>;
  "db:get-transaction-state": () => Promise<IpcResult<TransactionState>>;
  "db:read-tns-aliases": (request: TnsFileRequest) => Promise<IpcResult<TnsAliasEntry[]>>;
  "db:pick-tns-file": () => Promise<IpcResult<string | null>>;
  "db:test-connection": (config: ConnectionConfig) => Promise<IpcResult<void>>;
  "db:list-objects": (type: DatabaseObjectType) => Promise<IpcResult<DatabaseObjectSummary[]>>;
  "db:get-source": (type: DatabaseObjectType, name: string) => Promise<IpcResult<ObjectDetailResponse>>;
  "db:get-object-sql": (type: DatabaseObjectType, name: string) => Promise<IpcResult<string>>;
  "db:search-objects": (prefix: string, limit?: number) => Promise<IpcResult<DatabaseObjectSuggestion[]>>;
  "db:search-columns": (request: SearchColumnsRequest) => Promise<IpcResult<SqlColumnSuggestion[]>>;
  "db:export-query-result": (request: QueryExportRequest) => Promise<IpcResult<QueryExportResponse>>;
  "conn:list-saved": () => Promise<IpcResult<SavedConnection[]>>;
  "conn:get-with-password": (id: string) => Promise<IpcResult<SavedConnectionWithPassword>>;
  "conn:save": (request: SaveConnectionRequest) => Promise<IpcResult<SavedConnection>>;
  "conn:delete": (id: string) => Promise<IpcResult<void>>;
  "conn:toggle-favorite": (id: string) => Promise<IpcResult<SavedConnection>>;
  "conn:update-last-used": (id: string) => Promise<IpcResult<void>>;
  "window:minimize": () => Promise<IpcResult<void>>;
  "window:toggle-maximize": () => Promise<IpcResult<boolean>>;
  "window:close": () => Promise<IpcResult<void>>;
  "window:is-maximized": () => Promise<IpcResult<boolean>>;
  "updater:check": () => Promise<IpcResult<UpdateCheckResult>>;
  "updater:download": () => Promise<IpcResult<void>>;
  "updater:quit-and-install": () => Promise<IpcResult<void>>;
  "updater:get-current-version": () => Promise<IpcResult<string>>;
}

/** Canais que o main process pode emitir para o renderer (win.webContents.send) */
export interface IpcRendererEvents {
  "db:status-changed": (status: ConnectionStatus) => void;
  "db:transaction-state-changed": (state: TransactionState) => void;
  "db:error": (error: AppError) => void;
  "db:export-progress": (progress: QueryExportProgress) => void;
  "window:maximized-changed": (isMaximized: boolean) => void;
  "updater:status-changed": (status: UpdaterStatus) => void;
}

/** Resultado da checagem manual de atualização */
export interface UpdateCheckResult {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  releaseDate?: string;
}

/** Estados do updater emitidos para o renderer */
export type UpdaterStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "not-available"; currentVersion: string }
  | { kind: "available"; version: string; releaseNotes?: string }
  | { kind: "downloading"; percent: number; bytesPerSecond: number; transferred: number; total: number }
  | { kind: "downloaded"; version: string }
  | { kind: "error"; message: string };

/** Nomes dos canais IPC — evita strings mágicas espalhadas pelo código */
export const IPC_CHANNELS = {
  FILE_SAVE: "file:save",
  DB_CONNECT: "db:connect",
  DB_DISCONNECT: "db:disconnect",
  DB_EXECUTE_QUERY: "db:execute-query",
  DB_INFER_BINDS: "db:infer-binds",
  DB_COUNT_ROWS: "db:count-rows",
  DB_UPDATE_ROWS: "db:update-rows",
  DB_COMMIT: "db:commit",
  DB_ROLLBACK: "db:rollback",
  DB_GET_TRANSACTION_STATE: "db:get-transaction-state",
  DB_READ_TNS_ALIASES: "db:read-tns-aliases",
  DB_PICK_TNS_FILE: "db:pick-tns-file",
  DB_TEST_CONNECTION: "db:test-connection",
  DB_LIST_OBJECTS: "db:list-objects",
  DB_GET_SOURCE: "db:get-source",
  DB_GET_OBJECT_SQL: "db:get-object-sql",
  DB_SEARCH_OBJECTS: "db:search-objects",
  DB_SEARCH_COLUMNS: "db:search-columns",
  DB_EXPORT_QUERY_RESULT: "db:export-query-result",
  DB_STATUS_CHANGED: "db:status-changed",
  DB_TRANSACTION_STATE_CHANGED: "db:transaction-state-changed",
  DB_ERROR: "db:error",
  DB_EXPORT_PROGRESS: "db:export-progress",
  CONN_LIST_SAVED: "conn:list-saved",
  CONN_GET_WITH_PASSWORD: "conn:get-with-password",
  CONN_SAVE: "conn:save",
  CONN_DELETE: "conn:delete",
  CONN_TOGGLE_FAVORITE: "conn:toggle-favorite",
  CONN_UPDATE_LAST_USED: "conn:update-last-used",
  WINDOW_MINIMIZE: "window:minimize",
  WINDOW_TOGGLE_MAXIMIZE: "window:toggle-maximize",
  WINDOW_CLOSE: "window:close",
  WINDOW_IS_MAXIMIZED: "window:is-maximized",
  WINDOW_MAXIMIZED_CHANGED: "window:maximized-changed",
  UPDATER_CHECK: "updater:check",
  UPDATER_DOWNLOAD: "updater:download",
  UPDATER_QUIT_AND_INSTALL: "updater:quit-and-install",
  UPDATER_GET_CURRENT_VERSION: "updater:get-current-version",
  UPDATER_STATUS_CHANGED: "updater:status-changed",
} as const;

/** API exposta ao renderer via contextBridge (window.gavadb) */
export interface GavaDbApi {
  saveFile: (content: string, filePath?: string) => Promise<IpcResult<string | null>>;
  dbConnect: (config: ConnectionConfig) => Promise<IpcResult<void>>;
  dbDisconnect: () => Promise<IpcResult<void>>;
  dbExecuteQuery: (request: SqlExecutionRequest) => Promise<IpcResult<SqlExecutionResponse>>;
  dbInferBinds: (request: InferBindsRequest) => Promise<IpcResult<BindMetadata[]>>;
  dbCountRows: (request: CountRowsRequest) => Promise<IpcResult<CountRowsResponse>>;
  dbUpdateRows: (request: UpdateRowRequest[]) => Promise<IpcResult<MutationResult>>;
  dbCommit: () => Promise<IpcResult<MutationResult>>;
  dbRollback: () => Promise<IpcResult<void>>;
  dbGetTransactionState: () => Promise<IpcResult<TransactionState>>;
  dbReadTnsAliases: (request: TnsFileRequest) => Promise<IpcResult<TnsAliasEntry[]>>;
  dbPickTnsFile: () => Promise<IpcResult<string | null>>;
  dbTestConnection: (config: ConnectionConfig) => Promise<IpcResult<void>>;
  dbListObjects: (type: DatabaseObjectType) => Promise<IpcResult<DatabaseObjectSummary[]>>;
  dbGetSource: (type: DatabaseObjectType, name: string) => Promise<IpcResult<ObjectDetailResponse>>;
  dbGetObjectSql: (type: DatabaseObjectType, name: string) => Promise<IpcResult<string>>;
  dbSearchObjects: (prefix: string, limit?: number) => Promise<IpcResult<DatabaseObjectSuggestion[]>>;
  dbSearchColumns: (request: SearchColumnsRequest) => Promise<IpcResult<SqlColumnSuggestion[]>>;
  dbExportQueryResult: (request: QueryExportRequest) => Promise<IpcResult<QueryExportResponse>>;
  connListSaved: () => Promise<IpcResult<SavedConnection[]>>;
  connGetWithPassword: (id: string) => Promise<IpcResult<SavedConnectionWithPassword>>;
  connSave: (request: SaveConnectionRequest) => Promise<IpcResult<SavedConnection>>;
  connDelete: (id: string) => Promise<IpcResult<void>>;
  connToggleFavorite: (id: string) => Promise<IpcResult<SavedConnection>>;
  connUpdateLastUsed: (id: string) => Promise<IpcResult<void>>;
  windowMinimize: () => Promise<IpcResult<void>>;
  windowToggleMaximize: () => Promise<IpcResult<boolean>>;
  windowClose: () => Promise<IpcResult<void>>;
  windowIsMaximized: () => Promise<IpcResult<boolean>>;
  onStatusChanged: (cb: (status: ConnectionStatus) => void) => () => void;
  onTransactionStateChanged: (cb: (state: TransactionState) => void) => () => void;
  onError: (cb: (error: AppError) => void) => () => void;
  onExportProgress: (cb: (progress: QueryExportProgress) => void) => () => void;
  onWindowMaximizedChanged: (cb: (isMaximized: boolean) => void) => () => void;
  updaterCheck: () => Promise<IpcResult<UpdateCheckResult>>;
  updaterDownload: () => Promise<IpcResult<void>>;
  updaterQuitAndInstall: () => Promise<IpcResult<void>>;
  updaterGetCurrentVersion: () => Promise<IpcResult<string>>;
  onUpdaterStatusChanged: (cb: (status: UpdaterStatus) => void) => () => void;
}

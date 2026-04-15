import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { IPC_CHANNELS } from "@gavadb/ipc-contract";
import type {
  AppError,
  ConnectionConfig,
  ConnectionStatus,
  TransactionState,
  TnsFileRequest,
  DatabaseObjectType,
  SqlExecutionRequest,
  InferBindsRequest,
  CountRowsRequest,
  UpdateRowRequest,
  SaveConnectionRequest,
  SearchColumnsRequest,
  QueryExportRequest,
  QueryExportProgress,
} from "@gavadb/types";

contextBridge.exposeInMainWorld("gavadb", {
  dbConnect: (config: ConnectionConfig) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_CONNECT, config),

  dbDisconnect: () =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_DISCONNECT),

  dbExecuteQuery: (request: SqlExecutionRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_EXECUTE_QUERY, request),

  dbInferBinds: (request: InferBindsRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_INFER_BINDS, request),

  dbCountRows: (request: CountRowsRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_COUNT_ROWS, request),

  dbUpdateRows: (request: UpdateRowRequest[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_UPDATE_ROWS, request),

  dbCommit: () =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_COMMIT),

  dbRollback: () =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_ROLLBACK),

  dbGetTransactionState: () =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_GET_TRANSACTION_STATE),

  dbReadTnsAliases: (request: TnsFileRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_READ_TNS_ALIASES, request),

  dbPickTnsFile: () =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_PICK_TNS_FILE),

  dbTestConnection: (config: ConnectionConfig) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_TEST_CONNECTION, config),

  dbListObjects: (type: DatabaseObjectType) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_LIST_OBJECTS, type),

  dbGetSource: (type: DatabaseObjectType, name: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_GET_SOURCE, type, name),

  dbGetObjectSql: (type: DatabaseObjectType, name: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_GET_OBJECT_SQL, type, name),

  dbSearchObjects: (prefix: string, limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_SEARCH_OBJECTS, prefix, limit),

  dbSearchColumns: (request: SearchColumnsRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_SEARCH_COLUMNS, request),

  dbExportQueryResult: (request: QueryExportRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_EXPORT_QUERY_RESULT, request),

  connListSaved: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CONN_LIST_SAVED),

  connGetWithPassword: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONN_GET_WITH_PASSWORD, id),

  connSave: (request: SaveConnectionRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONN_SAVE, request),

  connDelete: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONN_DELETE, id),

  connToggleFavorite: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONN_TOGGLE_FAVORITE, id),

  connUpdateLastUsed: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONN_UPDATE_LAST_USED, id),

  windowMinimize: () =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),

  windowToggleMaximize: () =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE),

  windowClose: () =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),

  windowIsMaximized: () =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),

  onStatusChanged: (cb: (status: ConnectionStatus) => void) => {
    const handler = (_e: IpcRendererEvent, status: ConnectionStatus) => cb(status);
    ipcRenderer.on(IPC_CHANNELS.DB_STATUS_CHANGED, handler);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.DB_STATUS_CHANGED, handler); };
  },

  onTransactionStateChanged: (cb: (state: TransactionState) => void) => {
    const handler = (_e: IpcRendererEvent, state: TransactionState) => cb(state);
    ipcRenderer.on(IPC_CHANNELS.DB_TRANSACTION_STATE_CHANGED, handler);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.DB_TRANSACTION_STATE_CHANGED, handler); };
  },

  onError: (cb: (error: AppError) => void) => {
    const handler = (_e: IpcRendererEvent, error: AppError) => cb(error);
    ipcRenderer.on(IPC_CHANNELS.DB_ERROR, handler);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.DB_ERROR, handler); };
  },

  onExportProgress: (cb: (progress: QueryExportProgress) => void) => {
    const handler = (_e: IpcRendererEvent, progress: QueryExportProgress) => cb(progress);
    ipcRenderer.on(IPC_CHANNELS.DB_EXPORT_PROGRESS, handler);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.DB_EXPORT_PROGRESS, handler); };
  },

  onWindowMaximizedChanged: (cb: (isMaximized: boolean) => void) => {
    const handler = (_e: IpcRendererEvent, isMaximized: boolean) => cb(isMaximized);
    ipcRenderer.on(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, handler);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, handler); };
  },
});

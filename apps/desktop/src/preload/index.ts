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
  UpdateRowRequest,
  SaveConnectionRequest,
} from "@gavadb/types";

contextBridge.exposeInMainWorld("gavadb", {
  dbConnect: (config: ConnectionConfig) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_CONNECT, config),

  dbDisconnect: () =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_DISCONNECT),

  dbExecuteQuery: (request: SqlExecutionRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_EXECUTE_QUERY, request),

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
});

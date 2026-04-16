import { ipcMain, app, dialog, type BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { IPC_CHANNELS } from "@gavadb/ipc-contract";
import { OracleRepository } from "@gavadb/oracle";
import type { DatabaseRepository } from "@gavadb/oracle";
import type {
  ConnectionConfig,
  SqlExecutionRequest,
  InferBindsRequest,
  CountRowsRequest,
  DatabaseObjectType,
  AppError,
  IpcResult,
  UpdateRowRequest,
  TransactionState,
  TnsFileRequest,
  SaveConnectionRequest,
  SearchColumnsRequest,
  QueryExportRequest,
} from "@gavadb/types";
import * as useCases from "../use-cases";
import { SavedConnectionsStore } from "../lib/saved-connections-store";
import { QueryExportService } from "../services/export/query-export-service";

const repo: DatabaseRepository = new OracleRepository({
  configDir: findTnsAdmin(),
});

const savedConnectionsStore = new SavedConnectionsStore();
const exportService = new QueryExportService(repo);

/** Discovers TNS_ADMIN from env, Oracle Client installs, or well-known locations */
function findTnsAdmin(): string | undefined {
  // 1. Explicit env vars
  if (process.env.TNS_ADMIN) return process.env.TNS_ADMIN;
  if (process.env.ORACLE_HOME) {
    const dir = path.join(process.env.ORACLE_HOME, "network", "admin");
    if (hasTnsnames(dir)) return dir;
  }

  // 2. Scan for Oracle Client installations (Windows: C:\app or D:\app patterns)
  const oracleClientDir = findOracleClientTnsAdmin();
  if (oracleClientDir) return oracleClientDir;

  // 3. App-local paths
  const candidates = [
    path.join(app.getPath("userData"), "tnsnames"),
    path.join(app.isPackaged ? path.dirname(process.execPath) : process.cwd(), "tnsnames"),
  ];
  for (const dir of candidates) {
    if (hasTnsnames(dir)) return dir;
  }
  return undefined;
}

function hasTnsnames(dir: string): boolean {
  return fs.existsSync(path.join(dir, "tnsnames.ora"));
}

/** Scans common Oracle Client install locations for tnsnames.ora */
function findOracleClientTnsAdmin(): string | undefined {
  const roots = ["C:\\app", "D:\\app", "C:\\oracle", "D:\\oracle", "C:\\oraclexe"];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    try {
      // Walk: root/<user>/product/<version>/<client>/network/admin
      const users = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
      for (const user of users) {
        const productDir = path.join(root, user.name, "product");
        if (!fs.existsSync(productDir)) continue;
        const versions = fs.readdirSync(productDir, { withFileTypes: true }).filter((d) => d.isDirectory());
        for (const ver of versions) {
          const clients = fs.readdirSync(path.join(productDir, ver.name), { withFileTypes: true }).filter((d) => d.isDirectory());
          for (const client of clients) {
            const adminDir = path.join(productDir, ver.name, client.name, "network", "admin");
            if (hasTnsnames(adminDir)) return adminDir;
          }
        }
      }
    } catch {
      // Permission denied or similar — skip
    }
  }
  return undefined;
}

function ok<T>(data: T): IpcResult<T> {
  return { success: true, data };
}

function fail(error: AppError): IpcResult<never> {
  return { success: false, error };
}

function toAppError(err: unknown): AppError {
  if (typeof err === "object" && err !== null && "code" in err && "message" in err) {
    return err as AppError;
  }
  return { code: "UNKNOWN", message: String(err) };
}

function logIpcError(channel: string, err: unknown): AppError {
  const appError = toAppError(err);
  console.error(`[IPC] ${channel} failed`, appError);
  return appError;
}

function emitTransactionState(win: BrowserWindow): void {
  const state: TransactionState = repo.getTransactionState();
  win.webContents.send(IPC_CHANNELS.DB_TRANSACTION_STATE_CHANGED, state);
}

function emitWindowMaximizedState(win: BrowserWindow): void {
  win.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, win.isMaximized());
}

export function registerIpcHandlers(win: BrowserWindow): void {
  win.on("maximize", () => emitWindowMaximizedState(win));
  win.on("unmaximize", () => emitWindowMaximizedState(win));
  win.on("restore", () => emitWindowMaximizedState(win));

  ipcMain.handle(IPC_CHANNELS.FILE_SAVE, async (_event, request: { content: string; filePath?: string }) => {
    try {
      const targetPath = request.filePath?.trim() || await pickSqlSavePath(win);
      if (!targetPath) {
        return ok(null);
      }

      await fs.promises.writeFile(targetPath, request.content, "utf8");
      return ok(targetPath);
    } catch (err) {
      return fail(logIpcError(IPC_CHANNELS.FILE_SAVE, err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, async () => {
    win.minimize();
    return ok(undefined);
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE, async () => {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    return ok(win.isMaximized());
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, async () => {
    win.close();
    return ok(undefined);
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, async () => {
    return ok(win.isMaximized());
  });

  ipcMain.handle(IPC_CHANNELS.DB_CONNECT, async (_event, config: ConnectionConfig) => {
    try {
      win.webContents.send(IPC_CHANNELS.DB_STATUS_CHANGED, "connecting");
      await useCases.connect(repo, config);
      win.webContents.send(IPC_CHANNELS.DB_STATUS_CHANGED, "connected");
      emitTransactionState(win);
      return ok(undefined);
    } catch (err) {
      const appError = logIpcError(IPC_CHANNELS.DB_CONNECT, err);
      win.webContents.send(IPC_CHANNELS.DB_STATUS_CHANGED, "error");
      win.webContents.send(IPC_CHANNELS.DB_ERROR, appError);
      return fail(appError);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DB_DISCONNECT, async () => {
    try {
      await useCases.disconnect(repo);
      win.webContents.send(IPC_CHANNELS.DB_STATUS_CHANGED, "disconnected");
      emitTransactionState(win);
      return ok(undefined);
    } catch (err) {
      const appError = logIpcError(IPC_CHANNELS.DB_DISCONNECT, err);
      win.webContents.send(IPC_CHANNELS.DB_ERROR, appError);
      return fail(appError);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DB_EXECUTE_QUERY, async (_event, request: SqlExecutionRequest) => {
    try {
      const result = await useCases.executeQuery(repo, request);
      emitTransactionState(win);
      return ok(result);
    } catch (err) {
      const appError = logIpcError(IPC_CHANNELS.DB_EXECUTE_QUERY, err);
      return fail(appError);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DB_INFER_BINDS, async (_event, request: InferBindsRequest) => {
    try {
      const meta = await repo.inferBinds(request.sql);
      return ok(meta);
    } catch (err) {
      return fail(logIpcError(IPC_CHANNELS.DB_INFER_BINDS, err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.DB_COUNT_ROWS, async (_event, request: CountRowsRequest) => {
    try {
      const result = await useCases.countRows(repo, request);
      return ok(result);
    } catch (err) {
      const appError = logIpcError(IPC_CHANNELS.DB_COUNT_ROWS, err);
      return fail(appError);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DB_UPDATE_ROWS, async (_event, request: UpdateRowRequest[]) => {
    try {
      const result = await useCases.updateRows(repo, request);
      emitTransactionState(win);
      return ok(result);
    } catch (err) {
      const appError = logIpcError(IPC_CHANNELS.DB_UPDATE_ROWS, err);
      return fail(appError);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DB_READ_TNS_ALIASES, async (_event, request: TnsFileRequest) => {
    try {
      const aliases = await useCases.loadTnsAliases(request);
      return ok(aliases);
    } catch (err) {
      return fail(logIpcError(IPC_CHANNELS.DB_READ_TNS_ALIASES, err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.DB_TEST_CONNECTION, async (_event, config: ConnectionConfig) => {
    try {
      await useCases.testConnection(config);
      return ok(undefined);
    } catch (err) {
      return fail(logIpcError(IPC_CHANNELS.DB_TEST_CONNECTION, err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.DB_PICK_TNS_FILE, async () => {
    try {
      const result = await dialog.showOpenDialog(win, {
        title: "Select tnsnames.ora",
        properties: ["openFile"],
        filters: [
          { name: "Oracle TNS", extensions: ["ora"] },
          { name: "All files", extensions: ["*"] },
        ],
      });
      return ok(result.canceled ? null : (result.filePaths[0] ?? null));
    } catch (err) {
      return fail(logIpcError(IPC_CHANNELS.DB_PICK_TNS_FILE, err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.DB_COMMIT, async () => {
    try {
      const result = await useCases.commitTransaction(repo);
      emitTransactionState(win);
      return ok(result);
    } catch (err) {
      const appError = logIpcError(IPC_CHANNELS.DB_COMMIT, err);
      return fail(appError);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DB_ROLLBACK, async () => {
    try {
      await useCases.rollbackTransaction(repo);
      emitTransactionState(win);
      return ok(undefined);
    } catch (err) {
      const appError = logIpcError(IPC_CHANNELS.DB_ROLLBACK, err);
      return fail(appError);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DB_GET_TRANSACTION_STATE, async () => {
    try {
      const state = await useCases.getTransactionState(repo);
      return ok(state);
    } catch (err) {
      const appError = logIpcError(IPC_CHANNELS.DB_GET_TRANSACTION_STATE, err);
      return fail(appError);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DB_LIST_OBJECTS, async (_event, type: DatabaseObjectType) => {
    try {
      const objects = await useCases.listObjects(repo, type);
      return ok(objects);
    } catch (err) {
      return fail(logIpcError(IPC_CHANNELS.DB_LIST_OBJECTS, err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.DB_GET_SOURCE, async (_event, type: DatabaseObjectType, name: string) => {
    try {
      const detail = await useCases.getObjectDetail(repo, type, name);
      return ok(detail);
    } catch (err) {
      return fail(logIpcError(IPC_CHANNELS.DB_GET_SOURCE, err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.DB_GET_OBJECT_SQL, async (_event, type: DatabaseObjectType, name: string) => {
    try {
      const sql = await useCases.getObjectSql(repo, type, name);
      return ok(sql);
    } catch (err) {
      return fail(logIpcError(IPC_CHANNELS.DB_GET_OBJECT_SQL, err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.DB_SEARCH_OBJECTS, async (_event, prefix: string, limit?: number) => {
    try {
      const objects = await useCases.searchObjects(repo, prefix, limit);
      return ok(objects);
    } catch (err) {
      return fail(logIpcError(IPC_CHANNELS.DB_SEARCH_OBJECTS, err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.DB_SEARCH_COLUMNS, async (_event, request: SearchColumnsRequest) => {
    try {
      const columns = await useCases.searchColumns(repo, request);
      return ok(columns);
    } catch (err) {
      return fail(logIpcError(IPC_CHANNELS.DB_SEARCH_COLUMNS, err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.DB_EXPORT_QUERY_RESULT, async (_event, request: QueryExportRequest) => {
    try {
      const filePath = await pickExportPath(win, request);
      if (!filePath) {
        return ok({
          exportId: request.exportId,
          canceled: true,
          filePath: null,
          format: request.format,
          rowsExported: 0,
        });
      }

      const result = await exportService.exportQueryResult(request, filePath, (progress) => {
        win.webContents.send(IPC_CHANNELS.DB_EXPORT_PROGRESS, progress);
      });
      return ok(result);
    } catch (err) {
      return fail(logIpcError(IPC_CHANNELS.DB_EXPORT_QUERY_RESULT, err));
    }
  });

  // --- Saved Connections handlers ---

  ipcMain.handle(IPC_CHANNELS.CONN_LIST_SAVED, async () => {
    try {
      return ok(savedConnectionsStore.listAll());
    } catch (err) {
      return fail(logIpcError(IPC_CHANNELS.CONN_LIST_SAVED, err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.CONN_GET_WITH_PASSWORD, async (_event, id: string) => {
    try {
      return ok(savedConnectionsStore.getWithPassword(id));
    } catch (err) {
      return fail(logIpcError(IPC_CHANNELS.CONN_GET_WITH_PASSWORD, err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.CONN_SAVE, async (_event, request: SaveConnectionRequest) => {
    try {
      return ok(savedConnectionsStore.save(request));
    } catch (err) {
      return fail(logIpcError(IPC_CHANNELS.CONN_SAVE, err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.CONN_DELETE, async (_event, id: string) => {
    try {
      savedConnectionsStore.delete(id);
      return ok(undefined);
    } catch (err) {
      return fail(logIpcError(IPC_CHANNELS.CONN_DELETE, err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.CONN_TOGGLE_FAVORITE, async (_event, id: string) => {
    try {
      return ok(savedConnectionsStore.toggleFavorite(id));
    } catch (err) {
      return fail(logIpcError(IPC_CHANNELS.CONN_TOGGLE_FAVORITE, err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.CONN_UPDATE_LAST_USED, async (_event, id: string) => {
    try {
      savedConnectionsStore.updateLastUsed(id);
      return ok(undefined);
    } catch (err) {
      return fail(logIpcError(IPC_CHANNELS.CONN_UPDATE_LAST_USED, err));
    }
  });
}

async function pickSqlSavePath(win: BrowserWindow): Promise<string | null> {
  const result = await dialog.showSaveDialog(win, {
    title: "Save SQL file",
    defaultPath: path.join(app.getPath("documents"), "query.sql"),
    filters: [
      { name: "SQL Files", extensions: ["sql"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  return result.filePath;
}

async function pickExportPath(win: BrowserWindow, request: QueryExportRequest): Promise<string | null> {
  const extension = request.format === "xlsx" ? "xlsx" : "csv";
  const defaultFileName = ensureFileExtension(
    sanitizeSuggestedFileName(request.suggestedFileName || `query-results-${timestampFileSegment()}`),
    extension,
  );

  const result = await dialog.showSaveDialog(win, {
    title: `Export query results as ${request.format.toUpperCase()}`,
    defaultPath: path.join(app.getPath("documents"), defaultFileName),
    filters: [
      request.format === "xlsx"
        ? { name: "Excel Workbook", extensions: ["xlsx"] }
        : { name: "CSV", extensions: ["csv"] },
      { name: "All files", extensions: ["*"] },
    ],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  return ensureFileExtension(result.filePath, extension);
}

function sanitizeSuggestedFileName(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "query-results";
}

function ensureFileExtension(filePath: string, extension: string): string {
  return filePath.toLowerCase().endsWith(`.${extension}`) ? filePath : `${filePath}.${extension}`;
}

function timestampFileSegment(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

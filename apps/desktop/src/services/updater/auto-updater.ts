import { BrowserWindow, app } from "electron";
import { autoUpdater, type UpdateInfo, type ProgressInfo } from "electron-updater";
import log from "electron-log";
import { IPC_CHANNELS, type UpdaterStatus, type UpdateCheckResult } from "@gavadb/ipc-contract";

autoUpdater.logger = log;
log.transports.file.level = "info";

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowPrerelease = false;

let mainWindow: BrowserWindow | null = null;
let downloadedVersion: string | null = null;

function emit(status: UpdaterStatus): void {
  mainWindow?.webContents.send(IPC_CHANNELS.UPDATER_STATUS_CHANGED, status);
}

export function registerAutoUpdater(win: BrowserWindow): void {
  mainWindow = win;

  autoUpdater.on("checking-for-update", () => emit({ kind: "checking" }));

  autoUpdater.on("update-available", (info: UpdateInfo) =>
    emit({
      kind: "available",
      version: info.version,
      releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : undefined,
    })
  );

  autoUpdater.on("update-not-available", () =>
    emit({ kind: "not-available", currentVersion: app.getVersion() })
  );

  autoUpdater.on("download-progress", (p: ProgressInfo) =>
    emit({
      kind: "downloading",
      percent: p.percent,
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total,
    })
  );

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    downloadedVersion = info.version;
    emit({ kind: "downloaded", version: info.version });
  });

  autoUpdater.on("error", (err: Error) =>
    emit({ kind: "error", message: err?.message ?? String(err) })
  );

  // Dispara checagem automática em background ao abrir (produção apenas)
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        log.error("Auto-update check failed:", err);
      });
    }, 5_000);
  }
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();
  if (!app.isPackaged) {
    return { available: false, currentVersion };
  }
  const result = await autoUpdater.checkForUpdates();
  const info = result?.updateInfo;
  if (!info || info.version === currentVersion) {
    return { available: false, currentVersion };
  }
  return {
    available: true,
    currentVersion,
    latestVersion: info.version,
    releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : undefined,
    releaseDate: info.releaseDate,
  };
}

export async function downloadUpdate(): Promise<void> {
  if (!app.isPackaged) return;
  await autoUpdater.downloadUpdate();
}

export function quitAndInstall(): void {
  if (!downloadedVersion) return;
  autoUpdater.quitAndInstall();
}

export function getCurrentVersion(): string {
  return app.getVersion();
}

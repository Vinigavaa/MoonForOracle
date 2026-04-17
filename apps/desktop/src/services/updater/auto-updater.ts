import { BrowserWindow, app } from "electron";
import { autoUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater";
import log from "electron-log";
import { IPC_CHANNELS, type UpdateCheckResult, type UpdaterStatus } from "@gavadb/ipc-contract";

autoUpdater.logger = log;
log.transports.file.level = "info";

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowPrerelease = false;

const AUTO_CHECK_DELAY_MS = 5_000;

let mainWindow: BrowserWindow | null = null;
let downloadedVersion: string | null = null;
let listenersRegistered = false;
let autoCheckScheduled = false;
let checkingPromise: Promise<UpdateCheckResult> | null = null;
let downloadingPromise: Promise<void> | null = null;

function emit(status: UpdaterStatus): void {
  console.info("[Updater]", status.kind, status);
  mainWindow?.webContents.send(IPC_CHANNELS.UPDATER_STATUS_CHANGED, status);
}

export function registerAutoUpdater(win: BrowserWindow): void {
  mainWindow = win;

  if (!listenersRegistered) {
    listenersRegistered = true;

    autoUpdater.on("checking-for-update", () => {
      log.info("[Updater] Checking for update");
      emit({ kind: "checking" });
    });

    autoUpdater.on("update-available", (info: UpdateInfo) => {
      log.info("[Updater] Update available", info.version);
      emit({
        kind: "available",
        version: info.version,
        releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : undefined,
      });
    });

    autoUpdater.on("update-not-available", () => {
      log.info("[Updater] No update available");
      emit({ kind: "not-available", currentVersion: app.getVersion() });
    });

    autoUpdater.on("download-progress", (progress: ProgressInfo) => {
      log.info("[Updater] Download progress", `${progress.percent.toFixed(1)}%`);
      emit({
        kind: "downloading",
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    });

    autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
      downloadedVersion = info.version;
      downloadingPromise = null;
      log.info("[Updater] Update downloaded", info.version);
      emit({ kind: "downloaded", version: info.version });
    });

    autoUpdater.on("error", (err: Error) => {
      checkingPromise = null;
      downloadingPromise = null;
      log.error("[Updater] Error", err);
      emit({ kind: "error", message: err?.message ?? String(err) });
    });
  }

  if (app.isPackaged && !autoCheckScheduled) {
    autoCheckScheduled = true;
    win.webContents.once("did-finish-load", () => {
      setTimeout(() => {
        checkForUpdates().catch((err) => {
          checkingPromise = null;
          log.error("[Updater] Auto check failed:", err);
          emit({ kind: "error", message: err?.message ?? String(err) });
        });
      }, AUTO_CHECK_DELAY_MS);
    });
  }
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();

  if (!app.isPackaged) {
    log.info("[Updater] Skipping update check in development");
    return { available: false, currentVersion };
  }

  if (checkingPromise) {
    log.info("[Updater] Reusing in-flight update check");
    return checkingPromise;
  }

  checkingPromise = autoUpdater.checkForUpdates()
    .then((result) => {
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
    })
    .finally(() => {
      checkingPromise = null;
    });

  return checkingPromise;
}

export async function downloadUpdate(): Promise<void> {
  if (!app.isPackaged) {
    log.info("[Updater] Skipping update download in development");
    return;
  }

  if (downloadingPromise) {
    log.info("[Updater] Reusing in-flight update download");
    return downloadingPromise;
  }

  downloadingPromise = autoUpdater.downloadUpdate()
    .then(() => undefined)
    .finally(() => {
      downloadingPromise = null;
    });

  return downloadingPromise;
}

export function quitAndInstall(): void {
  if (!downloadedVersion) {
    log.warn("[Updater] quitAndInstall ignored because no update is downloaded");
    return;
  }

  log.info("[Updater] Quitting and installing", downloadedVersion);
  autoUpdater.quitAndInstall(false, true);
}

export function getCurrentVersion(): string {
  return app.getVersion();
}

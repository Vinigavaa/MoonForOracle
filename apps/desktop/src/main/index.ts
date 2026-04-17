import { app, BrowserWindow, screen } from "electron";
import path from "node:path";
import { registerIpcHandlers } from "../ipc/handlers";
import { registerAutoUpdater } from "../services/updater/auto-updater";

const IS_DEV = !app.isPackaged;
const RENDERER_DEV_URL = "http://localhost:5173";
const APP_NAME = "Moon For Oracle";
const APP_ICON = path.join(app.getAppPath(), "assets", "icon.png");

function createWindow(): BrowserWindow {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const workArea = display.workArea;

  const win = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    minWidth: 800,
    minHeight: 600,
    show: false, // Mostra só quando pronto — evita flicker
    title: APP_NAME,
    icon: APP_ICON,
    frame: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Necessário para preload acessar Node APIs
    },
  });

  win.maximize();
  win.once("ready-to-show", () => win.show());

  registerIpcHandlers(win);
  registerAutoUpdater(win);

  if (IS_DEV) {
    win.loadURL(RENDERER_DEV_URL);
    win.webContents.openDevTools();

    // Retry se o Vite ainda não subiu quando o Electron abriu
    win.webContents.on("did-fail-load", () => {
      setTimeout(() => win.loadURL(RENDERER_DEV_URL), 1000);
    });
  } else {
    win.loadFile(path.join(__dirname, "renderer/index.html"));
  }

  // Log de crashes do renderer para diagnóstico
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("Renderer process gone:", details.reason);
  });

  return win;
}

app.whenReady().then(createWindow);

// macOS: recria janela ao clicar no ícone do dock sem janelas abertas
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

import { app, BrowserWindow, screen, session } from "electron";
import path from "node:path";
import { registerIpcHandlers } from "../ipc/handlers";
import { registerAutoUpdater } from "../services/updater/auto-updater";

const IS_DEV = !app.isPackaged;
const RENDERER_DEV_URL = "http://localhost:5173";
const APP_NAME = "Moon For Oracle";
const APP_ICON = path.join(app.getAppPath(), "assets", "icon.png");

/**
 * Content-Security-Policy aplicada a todas as respostas. Em produção o app é
 * carregado de arquivo local e só precisa de recursos próprios; no dev o HMR do
 * Vite exige eval e WebSocket, então a política é afrouxada apenas ali.
 * `style-src 'unsafe-inline'` é necessário para os estilos inline do React e as
 * tags <style> injetadas pelo CodeMirror.
 */
function contentSecurityPolicy(): string {
  const scriptSrc = IS_DEV ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'";
  const connectSrc = IS_DEV
    ? `connect-src 'self' ${RENDERER_DEV_URL} ws://localhost:5173`
    : "connect-src 'self'";
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    connectSrc,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-src 'none'",
  ].join("; ");
}

function applyContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [contentSecurityPolicy()],
      },
    });
  });
}

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

  // Trava navegação e abertura de janelas: o app é single-view e não abre
  // conteúdo externo. Bloquear evita que um link/redirect leve o app para
  // uma origem arbitrária (vetor clássico de escape em Electron).
  win.webContents.on("will-navigate", (event, url) => {
    if (!IS_DEV || !url.startsWith(RENDERER_DEV_URL)) {
      event.preventDefault();
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

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

app.whenReady().then(() => {
  applyContentSecurityPolicy();
  createWindow();
});

// macOS: recria janela ao clicar no ícone do dock sem janelas abertas
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

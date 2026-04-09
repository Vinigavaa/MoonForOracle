import { app, BrowserWindow } from "electron";
import path from "node:path";
import { registerIpcHandlers } from "../ipc/handlers";

const IS_DEV = !app.isPackaged;
const RENDERER_DEV_URL = "http://localhost:5173";

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false, // Mostra só quando pronto — evita flicker
    title: "GavaDB",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Necessário para preload acessar Node APIs
    },
  });

  win.once("ready-to-show", () => win.show());

  registerIpcHandlers(win);

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

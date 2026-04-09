import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/theme.css";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastProvider } from "./hooks/ToastContext";
import { EditorThemeProvider } from "./hooks/EditorThemeContext";

// Catch unhandled errors globally so they don't silently disappear
window.addEventListener("unhandledrejection", (e) => {
  console.error("[Unhandled Promise]", e.reason);
  e.preventDefault();
});

window.addEventListener("error", (e) => {
  console.error("[Uncaught Error]", e.error);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <EditorThemeProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </EditorThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);

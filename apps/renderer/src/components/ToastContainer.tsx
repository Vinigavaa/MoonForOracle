import type { Toast, ToastType } from "../hooks/useToast";

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

const ICON: Record<ToastType, string> = {
  success: "\u2713",
  error: "\u2717",
  info: "\u2139",
  warning: "\u26A0",
};

const COLORS: Record<ToastType, { border: string; icon: string }> = {
  success: { border: "var(--success)", icon: "var(--success)" },
  error: { border: "var(--danger)", icon: "var(--danger)" },
  info: { border: "var(--info)", icon: "var(--info)" },
  warning: { border: "var(--warning)", icon: "var(--warning)" },
};

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 16,
      right: 16,
      zIndex: 2000,
      display: "flex",
      flexDirection: "column-reverse",
      gap: 8,
      maxWidth: 400,
      pointerEvents: "none",
    }}>
      {toasts.map((toast) => {
        const color = COLORS[toast.type];
        return (
          <div
            key={toast.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "10px 14px",
              background: "var(--popup-bg)",
              border: `1px solid ${color.border}`,
              borderLeft: `3px solid ${color.border}`,
              borderRadius: "var(--radius)",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.3)",
              fontSize: "var(--font-size-sm)",
              color: "var(--text-primary)",
              pointerEvents: "auto",
              animation: toast.exiting ? "toast-exit 0.2s ease-in forwards" : "toast-enter 0.25s ease-out",
            }}
          >
            <span style={{ color: color.icon, fontWeight: 700, fontSize: 14, lineHeight: 1.3, flexShrink: 0 }}>
              {ICON[toast.type]}
            </span>
            <span style={{ flex: 1, lineHeight: 1.4, wordBreak: "break-word" }}>
              {toast.message}
            </span>
            <button
              onClick={() => onDismiss(toast.id)}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                color: "var(--text-muted)",
                fontSize: 14,
                lineHeight: 1,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              \u00D7
            </button>
          </div>
        );
      })}
    </div>
  );
}

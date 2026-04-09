import { useState, useCallback, useRef } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
  exiting?: boolean;
}

const DEFAULT_DURATION = 4000;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  }, []);

  const show = useCallback((type: ToastType, message: string, duration = DEFAULT_DURATION) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  return {
    toasts,
    show,
    dismiss,
    success: (msg: string) => show("success", msg),
    error: (msg: string) => show("error", msg, 6000),
    info: (msg: string) => show("info", msg),
    warning: (msg: string) => show("warning", msg, 5000),
  };
}

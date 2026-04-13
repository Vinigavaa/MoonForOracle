import { useState, useCallback, useEffect, useRef } from "react";

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
  const timersRef = useRef<number[]>([]);

  const scheduleTimer = useCallback((callback: () => void, delay: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((timerId) => timerId !== id);
      callback();
    }, delay);
    timersRef.current.push(id);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    scheduleTimer(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  }, [scheduleTimer]);

  const show = useCallback((type: ToastType, message: string, duration = DEFAULT_DURATION) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    if (duration > 0) {
      scheduleTimer(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss, scheduleTimer]);

  useEffect(() => () => {
    for (const timerId of timersRef.current) {
      window.clearTimeout(timerId);
    }
    timersRef.current = [];
  }, []);

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

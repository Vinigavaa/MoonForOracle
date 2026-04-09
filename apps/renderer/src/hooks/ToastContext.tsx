import { createContext, useContext, type ReactNode } from "react";
import { useToast } from "./useToast";
import { ToastContainer } from "../components/ToastContainer";

type ToastActions = ReturnType<typeof useToast>;

const ToastContext = createContext<ToastActions | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const toast = useToast();

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
    </ToastContext.Provider>
  );
}

export function useToastContext(): ToastActions {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToastContext must be used within ToastProvider");
  return ctx;
}

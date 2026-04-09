import type { AppError } from "./error";

/** Wrapper genérico para respostas IPC — garante padrão success/error em todo canal */
export type IpcResult<T> =
  | { success: true; data: T }
  | { success: false; error: AppError };

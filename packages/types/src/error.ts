/** Erro estruturado do app — trafega via IPC ao invés de strings soltas */
export interface AppError {
  code: AppErrorCode;
  message: string;
  /** Detalhes extras para debug (ex: ORA-xxxxx, stack trace) */
  details?: string;
}

export type AppErrorCode =
  | "CONNECTION_FAILED"
  | "CONNECTION_LOST"
  | "QUERY_FAILED"
  | "QUERY_TIMEOUT"
  | "OBJECT_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "INVALID_NAME"
  | "PATH_CONFLICT"
  | "INVALID_OPERATION"
  | "UNKNOWN";

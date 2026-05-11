import type { DbmsOutputLine } from "./query";

/** Structured app error transported through IPC */
export interface AppError {
  code: AppErrorCode;
  message: string;
  /** Extra debug details such as ORA-xxxxx text */
  details?: string;
  /** Partial DBMS_OUTPUT captured from the Oracle session when available */
  dbmsOutput?: DbmsOutputLine[];
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

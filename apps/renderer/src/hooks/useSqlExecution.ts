import { useCallback } from "react";
import type {
  AppError,
  MutationResult,
  SqlExecutionResponse,
  UpdateRowRequest,
} from "@gavadb/types";

interface ExecutionResult {
  data?: SqlExecutionResponse;
  error?: string;
}

interface MutationExecutionResult {
  data?: MutationResult;
  error?: string;
}

export function useSqlExecution() {
  const execute = useCallback(async (
    sql: string,
    options?: { pageSize?: number; offset?: number; orderBy?: { column: string; direction: "asc" | "desc" } },
  ): Promise<ExecutionResult> => {
    try {
      const res = await window.gavadb.dbExecuteQuery({
        sql: sql.trim(),
        pageSize: options?.pageSize,
        offset: options?.offset,
        orderBy: options?.orderBy,
      });
      if (res.success) {
        return { data: res.data };
      }
      return { error: formatError(res.error) };
    } catch (err) {
      console.error("[SQL Execution] execute failed", err);
      return { error: formatUnknownError(err) };
    }
  }, []);

  const updateRows = useCallback(async (request: UpdateRowRequest[]): Promise<MutationExecutionResult> => {
    try {
      const res = await window.gavadb.dbUpdateRows(request);
      if (res.success) {
        return { data: res.data };
      }
      return { error: formatError(res.error) };
    } catch (err) {
      console.error("[SQL Execution] updateRows failed", err);
      return { error: formatUnknownError(err) };
    }
  }, []);

  return { execute, updateRows };
}

function formatError(err: AppError): string {
  let msg = err.message;
  if (err.details) msg += "\n\n" + err.details;
  return msg;
}

function formatUnknownError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

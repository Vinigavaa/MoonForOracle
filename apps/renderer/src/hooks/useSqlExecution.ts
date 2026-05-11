import { useCallback } from "react";
import type {
  AppError,
  BindMetadata,
  BindParameterValue,
  CountRowsResponse,
  DbmsOutputLine,
  MutationResult,
  SqlExecutionResponse,
  UpdateRowRequest,
} from "@gavadb/types";

interface InferBindsResult {
  data?: BindMetadata[];
  error?: string;
}

interface ExecutionResult {
  data?: SqlExecutionResponse;
  error?: string;
  dbmsOutput?: DbmsOutputLine[];
}

interface MutationExecutionResult {
  data?: MutationResult;
  error?: string;
}

interface CountRowsResult {
  data?: CountRowsResponse;
  error?: string;
}

export function useSqlExecution() {
  const execute = useCallback(async (
    sql: string,
    options?: {
      pageSize?: number;
      offset?: number;
      orderBy?: { column: string; direction: "asc" | "desc" };
      binds?: Record<string, BindParameterValue>;
    },
  ): Promise<ExecutionResult> => {
    try {
      const res = await window.gavadb.dbExecuteQuery({
        sql: sql.trim(),
        pageSize: options?.pageSize,
        offset: options?.offset,
        orderBy: options?.orderBy,
        binds: options?.binds,
      });
      if (res.success) {
        return { data: res.data, dbmsOutput: res.data.dbmsOutput };
      }
      return { error: formatError(res.error), dbmsOutput: res.error.dbmsOutput };
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

  const countRows = useCallback(async (
    sql: string,
    binds?: Record<string, BindParameterValue>,
  ): Promise<CountRowsResult> => {
    try {
      const res = await window.gavadb.dbCountRows({ sql: sql.trim(), binds });
      if (res.success) {
        return { data: res.data };
      }
      return { error: formatError(res.error) };
    } catch (err) {
      console.error("[SQL Execution] countRows failed", err);
      return { error: formatUnknownError(err) };
    }
  }, []);

  const inferBinds = useCallback(async (sql: string): Promise<InferBindsResult> => {
    try {
      const res = await window.gavadb.dbInferBinds({ sql: sql.trim() });
      if (res.success) return { data: res.data };
      return { error: formatError(res.error) };
    } catch (err) {
      console.error("[SQL Execution] inferBinds failed", err);
      return { error: formatUnknownError(err) };
    }
  }, []);

  return { execute, updateRows, countRows, inferBinds };
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

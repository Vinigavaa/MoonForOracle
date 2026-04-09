import type { SqlExecutionResponse } from "@gavadb/types";
import type { EditorExecutionTarget } from "./sqlExecutionTarget";

export interface BatchStatementExecution {
  id: string;
  target: EditorExecutionTarget;
  result: SqlExecutionResponse | null;
  error: string | null;
}

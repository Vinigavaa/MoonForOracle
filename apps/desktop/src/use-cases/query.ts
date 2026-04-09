import type { DatabaseRepository } from "@gavadb/oracle";
import type {
  MutationResult,
  SqlExecutionRequest,
  SqlExecutionResponse,
  TransactionState,
  UpdateRowRequest,
} from "@gavadb/types";

export async function executeQuery(
  repo: DatabaseRepository,
  request: SqlExecutionRequest,
): Promise<SqlExecutionResponse> {
  return repo.executeQuery(request);
}

export async function updateRows(
  repo: DatabaseRepository,
  request: UpdateRowRequest[],
): Promise<MutationResult> {
  return repo.updateRows(request);
}

export async function commitTransaction(repo: DatabaseRepository): Promise<MutationResult> {
  return repo.commitTransaction();
}

export async function rollbackTransaction(repo: DatabaseRepository): Promise<void> {
  return repo.rollbackTransaction();
}

export async function getTransactionState(repo: DatabaseRepository): Promise<TransactionState> {
  return repo.getTransactionState();
}

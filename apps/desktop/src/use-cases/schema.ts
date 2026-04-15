import type { DatabaseRepository } from "@gavadb/oracle";
import type { DatabaseObjectType, DatabaseObjectSummary, DatabaseObjectSuggestion, ObjectDetailResponse, SearchColumnsRequest, SqlColumnSuggestion } from "@gavadb/types";

export async function listObjects(
  repo: DatabaseRepository,
  type: DatabaseObjectType,
): Promise<DatabaseObjectSummary[]> {
  return repo.listObjects(type);
}

export async function getObjectDetail(
  repo: DatabaseRepository,
  type: DatabaseObjectType,
  name: string,
): Promise<ObjectDetailResponse> {
  return repo.getObjectDetail(type, name);
}

export async function getObjectSql(
  repo: DatabaseRepository,
  type: DatabaseObjectType,
  name: string,
): Promise<string> {
  return repo.getObjectSql(type, name);
}

export async function searchObjects(
  repo: DatabaseRepository,
  prefix: string,
  limit?: number,
): Promise<DatabaseObjectSuggestion[]> {
  return repo.searchObjects(prefix, limit);
}

export async function searchColumns(
  repo: DatabaseRepository,
  request: SearchColumnsRequest,
): Promise<SqlColumnSuggestion[]> {
  return repo.searchColumns(request);
}

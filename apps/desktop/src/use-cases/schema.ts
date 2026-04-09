import type { DatabaseRepository } from "@gavadb/oracle";
import type { DatabaseObjectType, DatabaseObjectSummary, ObjectDetailResponse } from "@gavadb/types";

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

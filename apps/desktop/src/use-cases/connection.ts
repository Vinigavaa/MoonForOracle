import type { DatabaseRepository } from "@gavadb/oracle";
import type { ConnectionConfig } from "@gavadb/types";

export async function connect(repo: DatabaseRepository, config: ConnectionConfig): Promise<void> {
  await repo.connect(config);
}

export async function disconnect(repo: DatabaseRepository): Promise<void> {
  await repo.disconnect();
}

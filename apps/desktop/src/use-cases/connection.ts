import { OracleRepository, type DatabaseRepository } from "@gavadb/oracle";
import type { ConnectionConfig, TnsAliasEntry, TnsFileRequest } from "@gavadb/types";
import { readTnsAliases, resolveTnsAdmin } from "../lib/tns-parser";

export async function connect(repo: DatabaseRepository, config: ConnectionConfig): Promise<void> {
  validateTnsConfig(config);
  await repo.connect(config);
}

export async function disconnect(repo: DatabaseRepository): Promise<void> {
  await repo.disconnect();
}

export async function testConnection(config: ConnectionConfig): Promise<void> {
  validateTnsConfig(config);
  const tempRepo = new OracleRepository({
    configDir: config.mode === "tns" && config.tnsFilePath ? resolveTnsAdmin(config.tnsFilePath) : undefined,
  });

  try {
    await tempRepo.connect(config);
  } finally {
    await tempRepo.disconnect();
  }
}

export async function loadTnsAliases(request: TnsFileRequest): Promise<TnsAliasEntry[]> {
  return readTnsAliases(request.filePath);
}

function validateTnsConfig(config: ConnectionConfig): void {
  if (config.mode !== "tns" || !config.tnsFilePath || !config.tnsAlias) return;

  const aliases = readTnsAliases(config.tnsFilePath);
  const wanted = config.tnsAlias.trim().toUpperCase();
  const exists = aliases.some((entry) => entry.aliases.some((alias) => alias.toUpperCase() === wanted));
  if (!exists) {
    throw {
      code: "OBJECT_NOT_FOUND",
      message: `Alias "${config.tnsAlias}" was not found in the selected tnsnames.ora file.`,
    };
  }
}

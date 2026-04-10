/** Dados de configuração de uma conexão Oracle */
export interface ConnectionConfig {
  id: string;
  name: string;
  /** Modo de conexão: campos separados (basic) ou connect string livre (tns) */
  mode: "basic" | "tns";
  /** Usado no modo basic */
  host: string;
  port: number;
  serviceName: string;
  /** Usado no modo tns — aceita TNS alias, Easy Connect ou descriptor completo */
  connectString: string;
  tnsFilePath?: string;
  tnsAlias?: string;
  username: string;
  /** Senha nunca trafega via IPC após a conexão — usada apenas no momento do connect */
  password?: string;
}

/** Estados possíveis da conexão com o banco */
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

/** Estado da transaÃ§Ã£o atual da sessÃ£o */
export interface TransactionState {
  hasPendingChanges: boolean;
}

export interface TnsAliasEntry {
  name: string;
  aliases: string[];
  descriptor: string;
}

export interface TnsFileRequest {
  filePath: string;
}

/** A saved connection entry persisted to disk for quick reconnection */
export interface SavedConnection {
  /** Unique identifier (UUID) */
  id: string;
  /** User-friendly display name */
  friendlyName: string;
  /** Connection mode */
  mode: "basic" | "tns";
  /** Basic mode fields */
  host: string;
  port: number;
  serviceName: string;
  /** TNS mode fields */
  tnsAlias?: string;
  tnsFilePath?: string;
  /** Common fields */
  username: string;
  /** Whether this connection is marked as favorite */
  isFavorite: boolean;
  /** ISO timestamp of last successful connection */
  lastUsedAt?: string;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
}

/** Request to create or update a saved connection (password handled separately) */
export interface SaveConnectionRequest {
  connection: SavedConnection;
  /** Password to store securely — omit to keep existing password */
  password?: string;
}

/** Saved connection with password retrieved for quick connect */
export interface SavedConnectionWithPassword extends SavedConnection {
  password?: string;
}

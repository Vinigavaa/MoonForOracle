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

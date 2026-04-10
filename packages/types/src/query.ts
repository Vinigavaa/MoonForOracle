/** Metadados de uma coluna no resultado */
export interface QueryResultColumn {
  name: string;
  dataType: string;
}

/** Uma linha do resultado — chave é o nome da coluna */
export type QueryResultRow = Record<string, unknown>;

/** Informações sobre editabilidade de um resultado SELECT */
export interface EditableQueryInfo {
  enabled: boolean;
  reason?: string;
  tableName?: string;
  primaryKeyColumns?: string[];
}

/** Alteração pendente em uma linha retornada por um SELECT editável */
export interface UpdateRowRequest {
  tableName: string;
  primaryKey: QueryResultRow;
  originalValues: QueryResultRow;
  changes: QueryResultRow;
}

/** Exclusão pendente de uma ou mais linhas retornadas por um SELECT editável */
export interface DeleteRowsRequest {
  tableName: string;
  primaryKeys: QueryResultRow[];
}

/** Resultado de uma operação de mutação */
export interface MutationResult {
  rowsAffected: number;
}

/** Request para contagem total de linhas de uma query */
export interface CountRowsRequest {
  sql: string;
}

/** Response da contagem total de linhas */
export interface CountRowsResponse {
  totalRows: number;
  executionTimeMs: number;
}

/** Request para execução de SQL via IPC */
export interface SqlExecutionRequest {
  sql: string;
  /** Limite de linhas por página (default: 200) */
  pageSize?: number;
  /** Offset para paginação — quantas linhas pular */
  offset?: number;
  /** Ordenação aplicada pelo grid (coluna + direção) */
  orderBy?: { column: string; direction: "asc" | "desc" };
}

/** Tipo de statement SQL detectado */

export type SqlStatementType = "select" | "dml" | "ddl" | "plsql" | "unknown";

/** Response padronizada de execução de SQL */
export interface SqlExecutionResponse {
  columns: QueryResultColumn[];
  rows: QueryResultRow[];
  rowCount: number;
  executionTimeMs: number;
  /** true se existem mais linhas além desta página */
  hasMore: boolean;
  /** Offset usado nesta requisição */
  offset: number;
  /** Total de linhas retornadas até agora (soma acumulada no frontend) */
  totalFetched: number;
  /** Tipo de statement executado */
  statementType: SqlStatementType;
  /** Linhas afetadas por DML (INSERT, UPDATE, DELETE, MERGE) */
  rowsAffected: number;
  /** Metadados para edição inline segura, quando aplicável */
  editable?: EditableQueryInfo;
}

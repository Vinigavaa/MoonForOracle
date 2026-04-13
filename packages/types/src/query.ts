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
  /** Binds usados na query original (mesmo formato do SqlExecutionRequest) */
  binds?: Record<string, BindParameterValue>;
}

/** Response da contagem total de linhas */
export interface CountRowsResponse {
  totalRows: number;
  executionTimeMs: number;
}

/** Tipo lógico inferido para um bind parameter */
export type BindDataType = "NUMBER" | "VARCHAR" | "DATE" | "TIMESTAMP" | "UNKNOWN";

/** Valor de um bind parameter enviado pelo renderer */
export interface BindParameterValue {
  /** Valor cru digitado pelo usuário (string/number/boolean/null) */
  value: unknown;
  /** Tipo lógico escolhido/inferido (para conversão no lado Oracle) */
  type?: BindDataType;
  /** Quando true, envia NULL independentemente de value */
  isNull?: boolean;
}

/** Metadados inferidos para um bind — alimenta a UI de parâmetros */
export interface BindMetadata {
  name: string;
  dataType: BindDataType;
  /** true se a inferência veio do dicionário Oracle, false se é fallback genérico */
  inferred: boolean;
  nullable: boolean;
  /** Tamanho máximo para VARCHAR/CHAR */
  length?: number;
  precision?: number;
  scale?: number;
  /** Nome de coluna/tabela resolvidos, quando aplicável */
  column?: string;
  table?: string;
  /** Motivo pelo qual não foi possível inferir (debug/ui hint) */
  reason?: string;
}

/** Request enviado ao backend para inferir metadados dos binds de uma query */
export interface InferBindsRequest {
  sql: string;
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
  /** Bind parameters reais (node-oracledb), chaveados pelo nome do bind */
  binds?: Record<string, BindParameterValue>;
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

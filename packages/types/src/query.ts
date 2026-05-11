/** Metadata for a result-set column */
export interface QueryResultColumn {
  name: string;
  dataType: string;
}

/** One line emitted by DBMS_OUTPUT */
export interface DbmsOutputLine {
  line: string;
}

/** One row in a query result, keyed by column name */
export type QueryResultRow = Record<string, unknown>;

/** Inline editing metadata for a SELECT result */
export interface EditableQueryInfo {
  enabled: boolean;
  reason?: string;
  tableName?: string;
  primaryKeyColumns?: string[];
}

/** Pending update for an editable SELECT row */
export interface UpdateRowRequest {
  tableName: string;
  primaryKey: QueryResultRow;
  originalValues: QueryResultRow;
  changes: QueryResultRow;
}

/** Pending deletion of one or more SELECT rows */
export interface DeleteRowsRequest {
  tableName: string;
  primaryKeys: QueryResultRow[];
}

/** Result of a mutation operation */
export interface MutationResult {
  rowsAffected: number;
}

/** Request to count total rows for a query */
export interface CountRowsRequest {
  sql: string;
  /** Binds used in the original query */
  binds?: Record<string, BindParameterValue>;
}

/** Response for a row-count request */
export interface CountRowsResponse {
  totalRows: number;
  executionTimeMs: number;
}

/** Logical type inferred for a bind parameter */
export type BindDataType = "NUMBER" | "VARCHAR" | "DATE" | "TIMESTAMP" | "UNKNOWN";

/** Bind parameter value sent by the renderer */
export interface BindParameterValue {
  /** Raw value entered by the user */
  value: unknown;
  /** Selected or inferred logical type */
  type?: BindDataType;
  /** When true, sends NULL regardless of value */
  isNull?: boolean;
}

/** Inferred bind metadata used by the UI */
export interface BindMetadata {
  name: string;
  dataType: BindDataType;
  /** Whether the type came from Oracle metadata instead of a fallback */
  inferred: boolean;
  nullable: boolean;
  /** Maximum length for VARCHAR/CHAR */
  length?: number;
  precision?: number;
  scale?: number;
  /** Resolved column/table name when available */
  column?: string;
  table?: string;
  /** Hint explaining why inference was not precise */
  reason?: string;
}

/** Request sent to infer bind metadata for a query */
export interface InferBindsRequest {
  sql: string;
}

export interface SqlAutocompleteTableRef {
  schema?: string | null;
  table: string;
  alias?: string | null;
}

export interface SearchColumnsRequest {
  tables: SqlAutocompleteTableRef[];
  prefix?: string;
  limit?: number;
}

export interface SqlColumnSuggestion {
  name: string;
  table: string;
  schema: string;
  alias?: string | null;
  dataType: string;
}

/** Request for SQL execution via IPC */
export interface SqlExecutionRequest {
  sql: string;
  /** Row limit per page (default: 200) */
  pageSize?: number;
  /** Pagination offset */
  offset?: number;
  /** Grid sorting */
  orderBy?: { column: string; direction: "asc" | "desc" };
  /** Real bind parameters for node-oracledb */
  binds?: Record<string, BindParameterValue>;
}

/** Detected SQL statement kind */
export type SqlStatementType = "select" | "dml" | "ddl" | "plsql" | "unknown";

/** Standard SQL execution response */
export interface SqlExecutionResponse {
  columns: QueryResultColumn[];
  rows: QueryResultRow[];
  rowCount: number;
  executionTimeMs: number;
  /** True when more rows exist beyond this page */
  hasMore: boolean;
  /** Offset used for this request */
  offset: number;
  /** Total rows accumulated so far in the frontend */
  totalFetched: number;
  /** Executed statement kind */
  statementType: SqlStatementType;
  /** Rows affected by DML */
  rowsAffected: number;
  /** Lines emitted via DBMS_OUTPUT during execution */
  dbmsOutput?: DbmsOutputLine[];
  /** Inline editing metadata when applicable */
  editable?: EditableQueryInfo;
}

import fs from "node:fs";
import path from "node:path";
import oracledb from "oracledb";
import type { Connection } from "oracledb";
import type {
  ConnectionConfig,
  DeleteRowsRequest,
  EditableQueryInfo,
  MutationResult,
  SqlExecutionRequest,
  SqlExecutionResponse,
  SqlStatementType,
  QueryResultColumn,
  QueryResultRow,
  UpdateRowRequest,
  BindMetadata,
  DatabaseObjectType,
  DatabaseObjectSummary,
  DatabaseObjectSuggestion,
  ObjectDetailResponse,
  ColumnInfo,
  TransactionState,
  PrimaryKeyDetail,
  ForeignKeyDetail,
  IncomingReferenceDetail,
} from "@gavadb/types";
import { normalizeOracleError } from "./error-normalizer";
import { buildOracleBinds, inferBindMetadata } from "./bind-inference";
import {
  listObjectsSql,
  getSourceCodeSql,
  getTableColumnsSql,
  getViewColumnsSql,
  getViewTextSql,
  getPackageSourceSql,
  SEARCHABLE_OBJECT_KINDS,
  oracleObjectKindToDatabaseType,
} from "./queries";

// ─── Modo Thin vs Thick ──────────────────────────────────────────────
// O node-oracledb 6+ inicia em modo Thin por padrão (JS puro, sem Oracle Client).
// Thin mode requer Oracle Database 12.1+. Para bancos 11g ou anteriores,
// o Thick mode é necessário (usa Oracle Instant Client nativo).
// ──────────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 500;
const CONNECT_TIMEOUT_MS = 15_000;

/**
 * Interface do repositório de acesso ao banco de dados.
 * Permite substituir a implementação (ex: mock para testes).
 */
export interface DatabaseRepository {
  readonly isConnected: boolean;
  readonly hasPendingTransaction: boolean;
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<boolean>;
  executeQuery(request: SqlExecutionRequest): Promise<SqlExecutionResponse>;
  inferBinds(sql: string): Promise<BindMetadata[]>;
  countQueryRows(sql: string, binds?: Record<string, import("@gavadb/types").BindParameterValue>): Promise<{ totalRows: number; executionTimeMs: number }>;
  updateRows(request: UpdateRowRequest[]): Promise<MutationResult>;
  deleteRows(request: DeleteRowsRequest): Promise<MutationResult>;
  commitTransaction(): Promise<MutationResult>;
  rollbackTransaction(): Promise<void>;
  getTransactionState(): TransactionState;
  listObjects(type: DatabaseObjectType): Promise<DatabaseObjectSummary[]>;
  searchObjects(prefix: string, limit?: number): Promise<DatabaseObjectSuggestion[]>;
  getObjectDetail(type: DatabaseObjectType, name: string): Promise<ObjectDetailResponse>;
  getConnectionInfo(): ConnectionConfig | null;
}

/**
 * Implementação Oracle do repositório de banco de dados.
 *
 * MVP: mantém uma conexão única por sessão.
 * Evolução: trocar this.connection por um Pool (createPool/getConnection/close).
 */
export interface OracleRepositoryOptions {
  /** Path to directory containing tnsnames.ora (sets TNS_ADMIN for alias resolution) */
  configDir?: string;
  /** Path to Oracle Instant Client lib directory — enables Thick mode (required for Oracle 11g) */
  thickModeLibDir?: string;
}

export class OracleRepository implements DatabaseRepository {
  private connection: Connection | null = null;
  private currentConfig: ConnectionConfig | null = null;
  private pendingTransaction = false;

  constructor(options?: OracleRepositoryOptions) {
    if (options?.configDir) {
      process.env.TNS_ADMIN = options.configDir;
      console.log(`[Oracle] TNS_ADMIN set to ${options.configDir}`);
    }

    // Try to enable Thick mode if a lib directory is provided or auto-detected
    const libDir = options?.thickModeLibDir ?? findOracleClientLibDir();
    if (libDir) {
      try {
        oracledb.initOracleClient({ libDir });
        console.log(`[Oracle] Thick mode enabled with libDir: ${libDir}`);
      } catch (err) {
        // initOracleClient can only be called once; if already initialized, ignore
        const msg = (err as Error).message ?? "";
        if (msg.includes("already")) {
          console.log(`[Oracle] Thick mode already initialized`);
        } else {
          console.warn(`[Oracle] Could not enable Thick mode (${msg}). Using Thin mode.`);
        }
      }
    } else {
      console.log(`[Oracle] Using Thin mode (no Oracle Client found). Requires DB 12.1+.`);
    }
  }

  get isConnected(): boolean {
    return this.connection !== null;
  }

  get hasPendingTransaction(): boolean {
    return this.pendingTransaction;
  }

  async connect(config: ConnectionConfig): Promise<void> {
    await this.disconnect();

    if (config.mode === "tns" && config.tnsFilePath) {
      const configDir = path.dirname(path.resolve(config.tnsFilePath));
      process.env.TNS_ADMIN = configDir;
      console.log(`[Oracle] TNS_ADMIN set to ${configDir} from connection config`);
    }

    const connectString = config.mode === "tns"
      ? (config.tnsAlias?.trim() || config.connectString)
      : `${config.host}:${config.port}/${config.serviceName}`;
    console.log(`[Oracle] Connecting to ${config.username}@${connectString}`);

    try {
      const connectPromise = oracledb.getConnection({
        user: config.username,
        password: config.password,
        connectString,
      });

      // Apply a timeout so the UI doesn't hang indefinitely
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(
          `Connection timed out after ${CONNECT_TIMEOUT_MS / 1000}s. ` +
          `Check that ${connectString} is reachable and the database is running.`
        )), CONNECT_TIMEOUT_MS);
      });

      this.connection = await Promise.race([connectPromise, timeoutPromise]);

      this.currentConfig = { ...config, password: undefined };
      this.pendingTransaction = false;
      console.log(`[Oracle] Connected successfully to ${connectString} (thin=${oracledb.thin})`);
    } catch (err) {
      this.connection = null;
      this.currentConfig = null;
      throw normalizeOracleError(err);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connection) return;
    try {
      console.log("[Oracle] Disconnecting");
      if (this.pendingTransaction) {
        await this.connection.rollback();
      }
      await this.connection.close();
    } catch (err) {
      console.error("[Oracle] Error during disconnect:", (err as Error).message);
    } finally {
      this.connection = null;
      this.currentConfig = null;
      this.pendingTransaction = false;
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.connection) return false;
    try {
      await this.connection.execute("SELECT 1 FROM dual");
      return true;
    } catch {
      return false;
    }
  }

  async executeQuery(request: SqlExecutionRequest): Promise<SqlExecutionResponse> {
    const conn = this.requireConnection();
    const pageSize = clampPageSize(request.pageSize);
    const offset = request.offset ?? 0;
    const stmtType = detectStatementType(request.sql);
    const isSelect = stmtType === "select";
    const start = performance.now();

    try {
      const binds = buildOracleBinds(request.binds);

      if (isSelect) {
        return await this.executeSelect(conn, request.sql, pageSize, offset, start, request.orderBy, binds);
      }

      const result = await conn.execute(
        request.sql,
        binds,
        { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: false },
      );

      if (stmtType === "dml" && (result.rowsAffected ?? 0) > 0) {
        this.pendingTransaction = true;
      }

      return {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: Math.round(performance.now() - start),
        hasMore: false,
        offset: 0,
        totalFetched: 0,
        statementType: stmtType,
        rowsAffected: result.rowsAffected ?? 0,
      };
    } catch (err) {
      throw normalizeOracleError(err);
    }
  }

  async updateRows(request: UpdateRowRequest[]): Promise<MutationResult> {
    const conn = this.requireConnection();
    let rowsAffected = 0;

    try {
      await conn.execute("SAVEPOINT gavadb_inline_update");
      for (const change of request) {
        rowsAffected += await this.updateSingleRow(conn, change);
      }
      if (rowsAffected > 0) {
        this.pendingTransaction = true;
      }
      return { rowsAffected };
    } catch (err) {
      try {
        await conn.execute("ROLLBACK TO SAVEPOINT gavadb_inline_update");
      } catch {
        // Ignore savepoint rollback errors and surface the original failure.
      }
      throw normalizeOracleError(err);
    }
  }

  async deleteRows(request: DeleteRowsRequest): Promise<MutationResult> {
    const conn = this.requireConnection();

    try {
      const tableName = sanitizeIdentifier(request.tableName);
      const primaryKeyColumns = await this.getPrimaryKeyColumns(conn, tableName);
      if (primaryKeyColumns.length === 0) {
        throw new Error(`Table ${tableName} does not have a primary key`);
      }

      await conn.execute("SAVEPOINT gavadb_inline_delete");
      let rowsAffected = 0;
      for (const primaryKey of request.primaryKeys) {
        rowsAffected += await this.deleteSingleRow(conn, tableName, primaryKeyColumns, primaryKey);
      }
      if (rowsAffected > 0) {
        this.pendingTransaction = true;
      }
      return { rowsAffected };
    } catch (err) {
      try {
        await conn.execute("ROLLBACK TO SAVEPOINT gavadb_inline_delete");
      } catch {
        // Ignore savepoint rollback errors and surface the original failure.
      }
      throw normalizeOracleError(err);
    }
  }

  async commitTransaction(): Promise<MutationResult> {
    const conn = this.requireConnection();

    try {
      await conn.commit();
      this.pendingTransaction = false;
      return { rowsAffected: 0 };
    } catch (err) {
      throw normalizeOracleError(err);
    }
  }

  async rollbackTransaction(): Promise<void> {
    const conn = this.requireConnection();

    try {
      await conn.rollback();
      this.pendingTransaction = false;
    } catch (err) {
      throw normalizeOracleError(err);
    }
  }

  getTransactionState(): TransactionState {
    return { hasPendingChanges: this.pendingTransaction };
  }

  /**
   * Executes a SELECT using resultSet streaming — only fetches pageSize+1 rows
   * to check if more data exists, without loading everything into memory.
   */
  private async executeSelect(
    conn: Connection,
    sql: string,
    pageSize: number,
    offset: number,
    start: number,
    orderBy?: { column: string; direction: "asc" | "desc" },
    binds: Record<string, oracledb.BindParameter> = {},
  ): Promise<SqlExecutionResponse> {
    // Wrap the user query with ORDER BY + OFFSET/FETCH for pagination
    const paginatedSql = wrapWithPagination(sql, pageSize + 1, offset, orderBy);

    const result = await conn.execute(
      paginatedSql,
      binds,
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        resultSet: true,
        fetchArraySize: Math.min(pageSize + 1, MAX_PAGE_SIZE + 1),
      },
    );

    const rs = result.resultSet!;
    const columns: QueryResultColumn[] = (rs.metaData ?? []).map((meta) => ({
      name: meta.name,
      dataType: meta.dbTypeName ?? "UNKNOWN",
    }));

    // Stream only the rows we need (pageSize + 1 to detect hasMore)
    const fetchedRows = await rs.getRows(pageSize + 1) as QueryResultRow[];
    await rs.close();

    const hasMore = fetchedRows.length > pageSize;
    const rows = hasMore ? fetchedRows.slice(0, pageSize) : fetchedRows;
    const executionTimeMs = Math.round(performance.now() - start);
    const editable = await this.resolveEditableQueryInfo(conn, sql, columns);

    return {
      columns,
      rows,
      rowCount: rows.length,
      executionTimeMs,
      hasMore,
      offset,
      totalFetched: offset + rows.length,
      statementType: "select",
      rowsAffected: 0,
      editable,
    };
  }

  async inferBinds(sql: string): Promise<BindMetadata[]> {
    const conn = this.requireConnection();
    try {
      return await inferBindMetadata(conn, sql);
    } catch (err) {
      throw normalizeOracleError(err);
    }
  }

  async countQueryRows(
    sql: string,
    binds?: Record<string, import("@gavadb/types").BindParameterValue>,
  ): Promise<{ totalRows: number; executionTimeMs: number }> {
    const conn = this.requireConnection();
    const cleanSql = sql.replace(/;\s*$/, "").trim();
    const countSql = `SELECT COUNT(*) AS CNT FROM (${cleanSql})`;
    const start = performance.now();

    try {
      const result = await conn.execute(
        countSql,
        buildOracleBinds(binds),
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const rows = (result.rows ?? []) as Array<{ CNT: number }>;
      const totalRows = rows[0]?.CNT ?? 0;
      return { totalRows, executionTimeMs: Math.round(performance.now() - start) };
    } catch (err) {
      throw normalizeOracleError(err);
    }
  }

  async listObjects(type: DatabaseObjectType): Promise<DatabaseObjectSummary[]> {
    const conn = this.requireConnection();

    try {
      const sql = listObjectsSql(type);
      const result = await conn.execute(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const rows = (result.rows ?? []) as Array<{ NAME: string; SCHEMA: string; STATUS: string }>;

      return rows.map((row) => ({
        name: row.NAME,
        type,
        schema: row.SCHEMA,
        status: row.STATUS as "VALID" | "INVALID",
      }));
    } catch (err) {
      throw normalizeOracleError(err);
    }
  }

  async searchObjects(prefix: string, limit = 20): Promise<DatabaseObjectSuggestion[]> {
    const conn = this.requireConnection();
    const parsed = parseObjectSearchPrefix(prefix);
    if (!parsed.objectPrefix) {
      return [];
    }

    try {
      const result = await conn.execute(
        `
          SELECT
            owner AS schema,
            object_name AS name,
            object_type,
            status
          FROM all_objects
          WHERE object_type IN (${SEARCHABLE_OBJECT_KINDS.map((kind) => `'${kind}'`).join(", ")})
            AND object_name LIKE :namePrefix ESCAPE '\\'
            AND (:schemaName IS NULL OR owner = :schemaName)
            AND (:schemaName IS NOT NULL OR owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA'))
          ORDER BY
            CASE object_type
              WHEN 'TABLE' THEN 1
              WHEN 'VIEW' THEN 2
              WHEN 'PACKAGE' THEN 3
              WHEN 'PROCEDURE' THEN 4
              WHEN 'FUNCTION' THEN 5
              WHEN 'TRIGGER' THEN 6
              ELSE 99
            END,
            object_name
          FETCH FIRST ${clampObjectSearchLimit(limit)} ROWS ONLY
        `,
        {
          namePrefix: `${escapeLike(parsed.objectPrefix.toUpperCase())}%`,
          schemaName: parsed.schema?.toUpperCase() ?? null,
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      const rows = (result.rows ?? []) as Array<{
        SCHEMA: string;
        NAME: string;
        OBJECT_TYPE: "TABLE" | "VIEW" | "TRIGGER" | "PACKAGE" | "PROCEDURE" | "FUNCTION";
        STATUS: "VALID" | "INVALID";
      }>;

      return rows.map((row) => ({
        name: row.NAME,
        schema: row.SCHEMA,
        objectKind: row.OBJECT_TYPE,
        type: oracleObjectKindToDatabaseType(row.OBJECT_TYPE),
        status: row.STATUS,
      }));
    } catch (err) {
      throw normalizeOracleError(err);
    }
  }

  async getObjectDetail(type: DatabaseObjectType, name: string): Promise<ObjectDetailResponse> {
    const conn = this.requireConnection();

    try {
      if (type === "tables") return await this.fetchTableDetail(conn, name);
      if (type === "views") return await this.fetchViewDetail(conn, name);

      let source: string;
      if (type === "packages") {
        source = await this.fetchPackageSource(conn, name);
      } else {
        source = await this.fetchCodeSource(conn, type, name);
      }

      return { kind: "source", objectName: name, objectType: type, source };
    } catch (err) {
      throw normalizeOracleError(err);
    }
  }

  getConnectionInfo(): ConnectionConfig | null {
    return this.currentConfig;
  }

  // ─── Private helpers ──────────────────────────────────────────────

  private requireConnection(): Connection {
    if (!this.connection) {
      throw normalizeOracleError(new Error("Not connected to any database"));
    }
    return this.connection;
  }

  private async fetchTableDetail(conn: Connection, name: string): Promise<ObjectDetailResponse> {
    const [columnResult, primaryKey, foreignKeys, referencedBy] = await Promise.all([
      conn.execute(getTableColumnsSql(name), {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
      this.getTablePrimaryKey(conn, name),
      this.getOutgoingForeignKeys(conn, name),
      this.getIncomingForeignKeys(conn, name),
    ]);
    const rows = (columnResult.rows ?? []) as Array<{
      COLUMN_NAME: string; DATA_TYPE: string; DATA_LENGTH: number;
      DATA_PRECISION: number | null; DATA_SCALE: number | null;
      NULLABLE: string; COLUMN_ID: number;
    }>;

    const columns: ColumnInfo[] = rows.map((r) => ({
      name: r.COLUMN_NAME,
      dataType: formatColType(r),
      nullable: r.NULLABLE !== "N",
      position: r.COLUMN_ID,
    }));

    return { kind: "table", objectName: name, columns, primaryKey, foreignKeys, referencedBy };
  }

  private async fetchViewDetail(conn: Connection, name: string): Promise<ObjectDetailResponse> {
    const [textResult, colResult] = await Promise.all([
      conn.execute(getViewTextSql(name), {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
      conn.execute(getViewColumnsSql(name), {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
    ]);

    const textRows = (textResult.rows ?? []) as Array<{ TEXT: string }>;
    const text = textRows[0]?.TEXT
      ? `CREATE OR REPLACE VIEW ${name} AS\n${textRows[0].TEXT}`
      : "";

    const colRows = (colResult.rows ?? []) as Array<{
      COLUMN_NAME: string; DATA_TYPE: string; DATA_LENGTH: number;
      DATA_PRECISION: number | null; DATA_SCALE: number | null;
      NULLABLE: string; COLUMN_ID: number;
    }>;

    const columns: ColumnInfo[] = colRows.map((r) => ({
      name: r.COLUMN_NAME,
      dataType: formatColType(r),
      nullable: r.NULLABLE !== "N",
      position: r.COLUMN_ID,
    }));

    return { kind: "view", objectName: name, text, columns };
  }

  private async fetchPackageSource(conn: Connection, name: string): Promise<string> {
    const result = await conn.execute(
      getPackageSourceSql(name), {}, { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const rows = (result.rows ?? []) as Array<{ TYPE: string; LINE: number; TEXT: string }>;

    if (rows.length === 0) return `-- No source found for package ${name}`;

    const bodyLines = rows.filter((r) => r.TYPE === "PACKAGE BODY").map((r) => r.TEXT);
    if (bodyLines.length > 0) {
      return `CREATE OR REPLACE ${bodyLines.join("")}`;
    }

    const specLines = rows.filter((r) => r.TYPE === "PACKAGE").map((r) => r.TEXT);
    if (specLines.length > 0) {
      return `CREATE OR REPLACE ${specLines.join("")}`;
    }

    return `-- No source found for package ${name}`;
  }

  private async fetchCodeSource(conn: Connection, type: DatabaseObjectType, name: string): Promise<string> {
    const result = await conn.execute(
      getSourceCodeSql(type, name), {}, { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const rows = (result.rows ?? []) as Array<{ LINE: number; TEXT: string }>;

    if (rows.length === 0) return `-- No source found for ${type.slice(0, -1)} ${name}`;

    return `CREATE OR REPLACE ${rows.map((r) => r.TEXT).join("")}`;
  }

  private async resolveEditableQueryInfo(
    conn: Connection,
    sql: string,
    columns: QueryResultColumn[],
  ): Promise<EditableQueryInfo> {
    const parsed = detectEditableSelect(sql);
    if (!parsed.editable) {
      return { enabled: false, reason: parsed.reason };
    }

    const primaryKeyColumns = await this.getPrimaryKeyColumns(conn, parsed.tableName);
    if (primaryKeyColumns.length === 0) {
      return {
        enabled: false,
        tableName: parsed.tableName,
        reason: `Table ${parsed.tableName} does not have a primary key`,
      };
    }

    const resultColumnNames = new Set(columns.map((column) => column.name.toUpperCase()));
    const missingPrimaryKeyColumns = primaryKeyColumns.filter((column) => !resultColumnNames.has(column.toUpperCase()));
    if (missingPrimaryKeyColumns.length > 0) {
      return {
        enabled: false,
        tableName: parsed.tableName,
        primaryKeyColumns,
        reason: `Primary key column(s) missing from result: ${missingPrimaryKeyColumns.join(", ")}`,
      };
    }

    return {
      enabled: true,
      tableName: parsed.tableName,
      primaryKeyColumns,
    };
  }

  private async getPrimaryKeyColumns(conn: Connection, tableName: string): Promise<string[]> {
    const result = await conn.execute(
      `
        SELECT cols.column_name
        FROM user_constraints cons
        JOIN user_cons_columns cols
          ON cols.constraint_name = cons.constraint_name
        WHERE cons.constraint_type = 'P'
          AND cons.table_name = :tableName
        ORDER BY cols.position
      `,
      { tableName: tableName.toUpperCase() },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    const rows = (result.rows ?? []) as Array<{ COLUMN_NAME: string }>;
    return rows.map((row) => row.COLUMN_NAME);
  }

  private async getTablePrimaryKey(conn: Connection, tableName: string): Promise<PrimaryKeyDetail | null> {
    const result = await conn.execute(
      `
        SELECT
          cons.constraint_name,
          cols.column_name,
          cols.position
        FROM all_constraints cons
        JOIN all_cons_columns cols
          ON cols.owner = cons.owner
         AND cols.constraint_name = cons.constraint_name
        WHERE cons.constraint_type = 'P'
          AND cons.owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
          AND cons.table_name = :tableName
        ORDER BY cols.position
      `,
      { tableName: tableName.toUpperCase() },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    const rows = (result.rows ?? []) as Array<{
      CONSTRAINT_NAME: string;
      COLUMN_NAME: string;
      POSITION: number;
    }>;
    if (rows.length === 0) return null;

    return {
      constraintName: rows[0].CONSTRAINT_NAME,
      columns: rows.map((row) => ({
        name: row.COLUMN_NAME,
        position: row.POSITION,
      })),
    };
  }

  private async getOutgoingForeignKeys(conn: Connection, tableName: string): Promise<ForeignKeyDetail[]> {
    const result = await conn.execute(
      `
        SELECT
          child.constraint_name,
          child_cols.position,
          child_cols.column_name AS local_column,
          parent.owner AS referenced_schema,
          parent.table_name AS referenced_table,
          parent_cols.column_name AS referenced_column
        FROM all_constraints child
        JOIN all_cons_columns child_cols
          ON child_cols.owner = child.owner
         AND child_cols.constraint_name = child.constraint_name
        JOIN all_constraints parent
          ON parent.owner = child.r_owner
         AND parent.constraint_name = child.r_constraint_name
        JOIN all_cons_columns parent_cols
          ON parent_cols.owner = parent.owner
         AND parent_cols.constraint_name = parent.constraint_name
         AND parent_cols.position = child_cols.position
        WHERE child.constraint_type = 'R'
          AND child.owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
          AND child.table_name = :tableName
        ORDER BY child.constraint_name, child_cols.position
      `,
      { tableName: tableName.toUpperCase() },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    const rows = (result.rows ?? []) as Array<{
      CONSTRAINT_NAME: string;
      POSITION: number;
      LOCAL_COLUMN: string;
      REFERENCED_SCHEMA: string;
      REFERENCED_TABLE: string;
      REFERENCED_COLUMN: string;
    }>;

    return groupOutgoingForeignKeyRows(rows);
  }

  private async getIncomingForeignKeys(conn: Connection, tableName: string): Promise<IncomingReferenceDetail[]> {
    const result = await conn.execute(
      `
        SELECT
          child.constraint_name,
          child.owner AS source_schema,
          child.table_name AS source_table,
          child_cols.position,
          child_cols.column_name AS local_column,
          parent_cols.column_name AS referenced_column
        FROM all_constraints parent
        JOIN all_cons_columns parent_cols
          ON parent_cols.owner = parent.owner
         AND parent_cols.constraint_name = parent.constraint_name
        JOIN all_constraints child
          ON child.r_owner = parent.owner
         AND child.r_constraint_name = parent.constraint_name
         AND child.constraint_type = 'R'
        JOIN all_cons_columns child_cols
          ON child_cols.owner = child.owner
         AND child_cols.constraint_name = child.constraint_name
         AND child_cols.position = parent_cols.position
        WHERE parent.constraint_type IN ('P', 'U')
          AND parent.owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
          AND parent.table_name = :tableName
        ORDER BY child.table_name, child.constraint_name, child_cols.position
      `,
      { tableName: tableName.toUpperCase() },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    const rows = (result.rows ?? []) as Array<{
      CONSTRAINT_NAME: string;
      SOURCE_SCHEMA: string;
      SOURCE_TABLE: string;
      POSITION: number;
      LOCAL_COLUMN: string;
      REFERENCED_COLUMN: string;
    }>;

    return groupIncomingForeignKeyRows(rows);
  }

  private async updateSingleRow(conn: Connection, change: UpdateRowRequest): Promise<number> {
    const tableName = sanitizeIdentifier(change.tableName);
    const primaryKeyColumns = await this.getPrimaryKeyColumns(conn, tableName);
    if (primaryKeyColumns.length === 0) {
      throw new Error(`Table ${tableName} does not have a primary key`);
    }

    const setClauses: string[] = [];
    const whereClauses: string[] = [];
    const binds: Record<string, oracledb.BindParameter> = {};

    for (const [columnName, value] of Object.entries(change.changes)) {
      const safeColumnName = sanitizeIdentifier(columnName);
      if (!(safeColumnName in change.originalValues)) {
        throw new Error(`Missing original value for column ${safeColumnName}`);
      }
      const bindName = `set_${setClauses.length}`;
      setClauses.push(`${safeColumnName} = :${bindName}`);
      binds[bindName] = value as oracledb.BindParameter;
    }

    if (setClauses.length === 0) return 0;

    for (const columnName of primaryKeyColumns) {
      const safeColumnName = sanitizeIdentifier(columnName);
      if (!(safeColumnName in change.primaryKey)) {
        throw new Error(`Missing primary key value for column ${safeColumnName}`);
      }
      const bindName = `pk_${whereClauses.length}`;
      const value = change.primaryKey[safeColumnName];
      whereClauses.push(buildEqualityClause(safeColumnName, bindName, value));
      if (value != null) {
        binds[bindName] = value as oracledb.BindParameter;
      }
    }

    const result = await conn.execute(
      `UPDATE ${tableName} SET ${setClauses.join(", ")} WHERE ${whereClauses.join(" AND ")}`,
      binds,
      { autoCommit: false },
    );

    return result.rowsAffected ?? 0;
  }

  private async deleteSingleRow(
    conn: Connection,
    tableName: string,
    primaryKeyColumns: string[],
    primaryKey: QueryResultRow,
  ): Promise<number> {
    const whereClauses: string[] = [];
    const binds: Record<string, oracledb.BindParameter> = {};

    for (const columnName of primaryKeyColumns) {
      const safeColumnName = sanitizeIdentifier(columnName);
      if (!(safeColumnName in primaryKey)) {
        throw new Error(`Missing primary key value for column ${safeColumnName}`);
      }
      const bindName = `pk_${whereClauses.length}`;
      const value = primaryKey[safeColumnName];
      whereClauses.push(buildEqualityClause(safeColumnName, bindName, value));
      if (value != null) {
        binds[bindName] = value as oracledb.BindParameter;
      }
    }

    const result = await conn.execute(
      `DELETE FROM ${tableName} WHERE ${whereClauses.join(" AND ")}`,
      binds,
      { autoCommit: false },
    );

    return result.rowsAffected ?? 0;
  }
}

/** Formata o tipo de dado de uma coluna para exibição */
function formatColType(col: {
  DATA_TYPE: string; DATA_LENGTH: number;
  DATA_PRECISION: number | null; DATA_SCALE: number | null;
}): string {
  const t = col.DATA_TYPE;
  if (t === "NUMBER") {
    if (col.DATA_PRECISION != null && col.DATA_SCALE != null && col.DATA_SCALE > 0) {
      return `NUMBER(${col.DATA_PRECISION},${col.DATA_SCALE})`;
    }
    if (col.DATA_PRECISION != null) return `NUMBER(${col.DATA_PRECISION})`;
    return "NUMBER";
  }
  if (t === "VARCHAR2" || t === "CHAR" || t === "NVARCHAR2" || t === "NCHAR" || t === "RAW") {
    return `${t}(${col.DATA_LENGTH})`;
  }
  return t;
}

/**
 * Wraps a SELECT query with OFFSET/FETCH NEXT for pagination.
 * Uses a subquery approach to avoid breaking queries that already have ORDER BY.
 * Oracle 12c+ supports OFFSET/FETCH natively.
 */
function wrapWithPagination(
  sql: string,
  fetchRows: number,
  offset: number,
  orderBy?: { column: string; direction: "asc" | "desc" },
): string {
  // Strip trailing semicolons that would break the wrapping
  const cleanSql = sql.replace(/;\s*$/, "").trim();

  // When orderBy is provided, wrap with ORDER BY so Oracle sorts ALL rows before pagination.
  // Uses OFFSET/FETCH which requires ORDER BY for deterministic results.
  if (orderBy) {
    const safeCol = toSafeOrderByIdentifier(orderBy.column);
    const dir = orderBy.direction === "desc" ? "DESC" : "ASC";
    return `SELECT * FROM (${cleanSql}) t ORDER BY ${safeCol} ${dir} OFFSET ${offset} ROWS FETCH NEXT ${fetchRows} ROWS ONLY`;
  }

  if (offset === 0) {
    // First page: just use FETCH FIRST for simplicity
    return `SELECT * FROM (${cleanSql}) t WHERE ROWNUM <= ${fetchRows}`;
  }

  // Subsequent pages: use OFFSET/FETCH (Oracle 12c+)
  return `SELECT * FROM (${cleanSql}) t OFFSET ${offset} ROWS FETCH NEXT ${fetchRows} ROWS ONLY`;
}

/** Detecta o tipo de statement a partir do SQL */
function detectStatementType(sql: string): SqlStatementType {
  const cleaned = sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
  const firstWord = cleaned.split(/\s+/)[0]?.toUpperCase();

  if (firstWord === "SELECT" || firstWord === "WITH") return "select";
  if (["INSERT", "UPDATE", "DELETE", "MERGE"].includes(firstWord ?? "")) return "dml";
  if (["CREATE", "ALTER", "DROP", "TRUNCATE", "RENAME", "GRANT", "REVOKE", "COMMENT"].includes(firstWord ?? "")) return "ddl";
  if (["BEGIN", "DECLARE", "EXEC", "EXECUTE", "CALL"].includes(firstWord ?? "")) return "plsql";
  return "unknown";
}

function detectEditableSelect(sql: string): { editable: true; tableName: string } | { editable: false; reason: string } {
  const cleaned = normalizeSqlForAnalysis(sql);
  if (!cleaned) return { editable: false, reason: "Empty query" };
  if (!/^SELECT\b/i.test(cleaned)) {
    return { editable: false, reason: "Only simple SELECT statements are editable" };
  }

  const upper = cleaned.toUpperCase();
  if (/\bJOIN\b/.test(upper)) return { editable: false, reason: "JOIN queries are not editable" };
  if (/\bGROUP\s+BY\b/.test(upper)) return { editable: false, reason: "GROUP BY queries are not editable" };
  if (/\bDISTINCT\b/.test(upper)) return { editable: false, reason: "DISTINCT queries are not editable" };
  if (/\bUNION\b|\bINTERSECT\b|\bMINUS\b/.test(upper)) return { editable: false, reason: "Set operations are not editable" };
  if (/\bFROM\s*\(/.test(upper)) return { editable: false, reason: "Subqueries in FROM are not editable" };

  const fromMatch = cleaned.match(/\bFROM\s+((?:"[^"]+"|[A-Za-z][A-Za-z0-9_$#]*))(?:\s+(?:AS\s+)?(?:"[^"]+"|[A-Za-z][A-Za-z0-9_$#]*))?(?=\s+WHERE\b|\s+ORDER\s+BY\b|\s*$)/i);
  if (!fromMatch) {
    return { editable: false, reason: "Could not determine a single source table" };
  }

  const tail = cleaned.slice(fromMatch.index ?? 0);
  const fromSegment = tail.match(/\bFROM\s+([\s\S]*?)(?=\s+WHERE\b|\s+ORDER\s+BY\b|\s*$)/i)?.[1] ?? "";
  if (fromSegment.includes(",")) {
    return { editable: false, reason: "Queries with multiple tables are not editable" };
  }

  const tableName = fromMatch[1];
  if (!isSafeIdentifier(tableName)) {
    return { editable: false, reason: "Unsupported table name for inline editing" };
  }

  return { editable: true, tableName: sanitizeIdentifier(tableName) };
}

function normalizeSqlForAnalysis(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/;\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isSafeIdentifier(identifier: string): boolean {
  return /^(?:"[^"]+"|[A-Za-z][A-Za-z0-9_$#]*)$/.test(identifier);
}

function sanitizeIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  if (!isSafeIdentifier(trimmed)) {
    throw new Error(`Unsafe identifier: ${identifier}`);
  }
  return trimmed.startsWith("\"") ? trimmed : trimmed.toUpperCase();
}

function toSafeOrderByIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  if (!trimmed) {
    throw new Error("Missing ORDER BY column");
  }

  if (isSafeIdentifier(trimmed)) {
    return trimmed.startsWith("\"") ? trimmed : trimmed.toUpperCase();
  }

  return `"${trimmed.replace(/"/g, "\"\"")}"`;
}

function buildEqualityClause(columnName: string, bindName: string, value: unknown): string {
  return value == null ? `${columnName} IS NULL` : `${columnName} = :${bindName}`;
}

function clampPageSize(pageSize?: number): number {
  if (!pageSize || !Number.isFinite(pageSize)) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(Math.floor(pageSize), MAX_PAGE_SIZE));
}

function clampObjectSearchLimit(limit?: number): number {
  if (!limit || !Number.isFinite(limit)) return 20;
  return Math.max(1, Math.min(Math.floor(limit), 50));
}

function parseObjectSearchPrefix(prefix: string): { schema: string | null; objectPrefix: string } {
  const trimmed = prefix.trim().replace(/^"+|"+$/g, "");
  if (!trimmed) return { schema: null, objectPrefix: "" };

  const parts = trimmed.split(".");
  if (parts.length >= 2) {
    const schemaPart = parts[parts.length - 2] ?? "";
    const objectPart = parts[parts.length - 1] ?? "";
    return {
      schema: normalizeIdentifierPart(schemaPart),
      objectPrefix: normalizeIdentifierPart(objectPart),
    };
  }

  return {
    schema: null,
    objectPrefix: normalizeIdentifierPart(parts[0] ?? ""),
  };
}

function normalizeIdentifierPart(value: string): string {
  return value.trim().replace(/^"+|"+$/g, "");
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function groupOutgoingForeignKeyRows(rows: Array<{
  CONSTRAINT_NAME: string;
  POSITION: number;
  LOCAL_COLUMN: string;
  REFERENCED_SCHEMA: string;
  REFERENCED_TABLE: string;
  REFERENCED_COLUMN: string;
}>): ForeignKeyDetail[] {
  const grouped = new Map<string, ForeignKeyDetail>();

  for (const row of rows) {
    const current = grouped.get(row.CONSTRAINT_NAME);
    if (!current) {
      grouped.set(row.CONSTRAINT_NAME, {
        constraintName: row.CONSTRAINT_NAME,
        referencedSchema: row.REFERENCED_SCHEMA,
        referencedTable: row.REFERENCED_TABLE,
        columns: [{
          position: row.POSITION,
          localColumn: row.LOCAL_COLUMN,
          referencedColumn: row.REFERENCED_COLUMN,
        }],
      });
      continue;
    }

    current.columns.push({
      position: row.POSITION,
      localColumn: row.LOCAL_COLUMN,
      referencedColumn: row.REFERENCED_COLUMN,
    });
  }

  return Array.from(grouped.values()).map((entry) => ({
    ...entry,
    columns: [...entry.columns].sort((a, b) => a.position - b.position),
  }));
}

function groupIncomingForeignKeyRows(rows: Array<{
  CONSTRAINT_NAME: string;
  POSITION: number;
  LOCAL_COLUMN: string;
  SOURCE_SCHEMA: string;
  SOURCE_TABLE: string;
  REFERENCED_COLUMN: string;
}>): IncomingReferenceDetail[] {
  const grouped = new Map<string, IncomingReferenceDetail>();

  for (const row of rows) {
    const current = grouped.get(row.CONSTRAINT_NAME);
    if (!current) {
      grouped.set(row.CONSTRAINT_NAME, {
        constraintName: row.CONSTRAINT_NAME,
        sourceSchema: row.SOURCE_SCHEMA,
        sourceTable: row.SOURCE_TABLE,
        columns: [{
          position: row.POSITION,
          localColumn: row.LOCAL_COLUMN,
          referencedColumn: row.REFERENCED_COLUMN,
        }],
      });
      continue;
    }

    current.columns.push({
      position: row.POSITION,
      localColumn: row.LOCAL_COLUMN,
      referencedColumn: row.REFERENCED_COLUMN,
    });
  }

  return Array.from(grouped.values()).map((entry) => ({
    ...entry,
    columns: [...entry.columns].sort((a, b) => a.position - b.position),
  }));
}

/**
 * Auto-detect Oracle Client installation on Windows to enable Thick mode.
 * Scans common installation paths for the Oracle client DLL directory.
 */
function findOracleClientLibDir(): string | undefined {
  // Check ORACLE_HOME first
  if (process.env.ORACLE_HOME) {
    const binDir = path.join(process.env.ORACLE_HOME, "bin");
    if (hasOciDll(binDir)) return binDir;
    if (hasOciDll(process.env.ORACLE_HOME)) return process.env.ORACLE_HOME;
  }

  // Scan common Oracle Client paths (Windows)
  const roots = ["C:\\app", "D:\\app", "C:\\oracle", "D:\\oracle", "C:\\oraclexe"];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    try {
      const users = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
      for (const user of users) {
        const productDir = path.join(root, user.name, "product");
        if (!fs.existsSync(productDir)) continue;
        const versions = fs.readdirSync(productDir, { withFileTypes: true }).filter((d) => d.isDirectory());
        for (const ver of versions) {
          const clients = fs.readdirSync(path.join(productDir, ver.name), { withFileTypes: true }).filter((d) => d.isDirectory());
          for (const client of clients) {
            const binDir = path.join(productDir, ver.name, client.name, "bin");
            if (hasOciDll(binDir)) return binDir;
          }
        }
      }
    } catch {
      // Permission denied or similar — skip
    }
  }

  return undefined;
}

function hasOciDll(dir: string): boolean {
  try {
    return fs.existsSync(path.join(dir, "oci.dll"))
      || fs.existsSync(path.join(dir, "libclntsh.so"));
  } catch {
    return false;
  }
}

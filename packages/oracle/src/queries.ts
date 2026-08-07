import type { DatabaseObjectType, DbObjectType, OracleObjectKind } from "@gavadb/types";

/**
 * Escapa um valor para uso seguro dentro de um literal string SQL ('...').
 * Dobra aspas simples (padrão Oracle) para impedir que um nome de objeto
 * malicioso (ou legítimo com apóstrofo) quebre o literal e injete SQL.
 */
function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * SQL para listar objetos do schema atual, filtrado por tipo.
 * Usa ALL_OBJECTS para ver objetos acessíveis pelo usuário conectado.
 */
export function listObjectsSql(type: DatabaseObjectType): string {
  if (type === "ckts" || type === "ckcs") {
    const prefix = type === "ckts" ? "CKT" : "CKC";
    return `
      SELECT
        constraint_name AS name,
        owner AS schema,
        CASE status WHEN 'ENABLED' THEN 'VALID' ELSE 'INVALID' END AS status
      FROM all_constraints
      WHERE constraint_type = 'C'
        AND constraint_name LIKE '${prefix}%'
        AND owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
      ORDER BY constraint_name
    `;
  }

  const oracleType = DB_OBJECT_TYPE_MAP[type];
  return `
    SELECT object_name AS name, owner AS schema, status
    FROM all_objects
    WHERE object_type = '${oracleType}'
      AND owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
    ORDER BY object_name
  `;
}

/**
 * SQL para buscar código-fonte de objetos com código (procedures, functions, packages, triggers).
 * Retorna linhas ordenadas que devem ser concatenadas.
 */
export function getSourceCodeSql(type: DatabaseObjectType, name: string): string {
  if (type === "ckts" || type === "ckcs") {
    throw new Error(`Object type ${type} does not expose source code`);
  }
  const oracleType = DB_OBJECT_TYPE_MAP[type];
  return `
    SELECT line, text
    FROM all_source
    WHERE type = '${oracleType}'
      AND name = '${escapeSqlLiteral(name)}'
      AND owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
    ORDER BY line
  `;
}

/** SQL para buscar colunas de uma tabela */
export function getTableColumnsSql(name: string): string {
  return `
    SELECT
      column_name,
      data_type,
      data_length,
      data_precision,
      data_scale,
      nullable,
      data_default,
      column_id
    FROM all_tab_columns
    WHERE table_name = '${escapeSqlLiteral(name)}'
      AND owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
    ORDER BY column_id
  `;
}

/** SQL para buscar as triggers associadas a uma tabela (metadados, sem corpo) */
export function getTableTriggersSql(name: string): string {
  return `
    SELECT
      trigger_name,
      trigger_type,
      triggering_event,
      status
    FROM all_triggers
    WHERE table_name = '${escapeSqlLiteral(name)}'
      AND table_owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
    ORDER BY trigger_name
  `;
}

/** SQL para buscar colunas de uma view */
export function getViewColumnsSql(name: string): string {
  return `
    SELECT
      column_name,
      data_type,
      data_length,
      data_precision,
      data_scale,
      nullable,
      column_id
    FROM all_tab_columns
    WHERE table_name = '${escapeSqlLiteral(name)}'
      AND owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
    ORDER BY column_id
  `;
}

/** SQL para buscar tanto spec quanto body de um package */
export function getPackageSourceSql(name: string): string {
  return `
    SELECT type, line, text
    FROM all_source
    WHERE name = '${escapeSqlLiteral(name)}'
      AND owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
      AND type IN ('PACKAGE', 'PACKAGE BODY')
    ORDER BY DECODE(type, 'PACKAGE', 1, 'PACKAGE BODY', 2), line
  `;
}

export function getCompilerErrorsSql(objectName: string, objectType: DbObjectType): string {
  return `
    SELECT
      line,
      position,
      text
    FROM user_errors
    WHERE name = '${escapeSqlLiteral(objectName)}'
      AND type = '${dbObjectTypeToOracleSourceType(objectType)}'
    ORDER BY sequence
  `;
}

export function getCheckConstraintSql(name: string): string {
  return `
    SELECT
      cons.constraint_name,
      cons.table_name,
      cons.status,
      cons.validated,
      cons.search_condition_vc,
      cols.column_name,
      cols.position
    FROM all_constraints cons
    LEFT JOIN all_cons_columns cols
      ON cols.owner = cons.owner
     AND cols.constraint_name = cons.constraint_name
    WHERE cons.constraint_type = 'C'
      AND cons.constraint_name = '${escapeSqlLiteral(name)}'
      AND cons.owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
    ORDER BY cols.position NULLS LAST
  `;
}

export function getTableDdlSql(name: string): string {
  return `
    SELECT DBMS_METADATA.GET_DDL('TABLE', '${escapeSqlLiteral(name)}', SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')) AS DDL
    FROM dual
  `;
}

export function getViewDdlSql(name: string): string {
  return `
    SELECT DBMS_METADATA.GET_DDL('VIEW', '${escapeSqlLiteral(name)}', SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')) AS DDL
    FROM dual
  `;
}

export function dbObjectTypeToOracleSourceType(type: DbObjectType): string {
  switch (type) {
    case "package":
      return "PACKAGE";
    case "package_body":
      return "PACKAGE BODY";
    case "procedure":
      return "PROCEDURE";
    case "function":
      return "FUNCTION";
    case "trigger":
      return "TRIGGER";
  }
}

/** Mapeia DatabaseObjectType da app para OBJECT_TYPE do Oracle */
const DB_OBJECT_TYPE_MAP: Record<DatabaseObjectType, string> = {
  tables: "TABLE",
  views: "VIEW",
  triggers: "TRIGGER",
  packages: "PACKAGE",
  procedures: "PROCEDURE",
  functions: "FUNCTION",
  ckts: "CKT",
  ckcs: "CKC",
};

export const SEARCHABLE_OBJECT_KINDS: readonly OracleObjectKind[] = [
  "TABLE",
  "VIEW",
  "PACKAGE",
  "PROCEDURE",
  "FUNCTION",
  "TRIGGER",
  "CKT",
  "CKC",
];

export function oracleObjectKindToDatabaseType(kind: OracleObjectKind): DatabaseObjectType {
  switch (kind) {
    case "TABLE":
      return "tables";
    case "VIEW":
      return "views";
    case "TRIGGER":
      return "triggers";
    case "PACKAGE":
      return "packages";
    case "PROCEDURE":
      return "procedures";
    case "FUNCTION":
      return "functions";
    case "CKT":
      return "ckts";
    case "CKC":
      return "ckcs";
  }

  const unsupportedKind: never = kind;
  throw new Error(`Unsupported Oracle object kind: ${unsupportedKind}`);
}

import type { DatabaseObjectType, OracleObjectKind } from "@gavadb/types";

/**
 * SQL para listar objetos do schema atual, filtrado por tipo.
 * Usa ALL_OBJECTS para ver objetos acessíveis pelo usuário conectado.
 */
export function listObjectsSql(type: DatabaseObjectType): string {
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
  const oracleType = DB_OBJECT_TYPE_MAP[type];
  return `
    SELECT line, text
    FROM all_source
    WHERE type = '${oracleType}'
      AND name = '${name}'
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
    WHERE table_name = '${name}'
      AND owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
    ORDER BY column_id
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
    WHERE table_name = '${name}'
      AND owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
    ORDER BY column_id
  `;
}

/** SQL para buscar definição de uma view */
export function getViewTextSql(name: string): string {
  return `
    SELECT text
    FROM all_views
    WHERE view_name = '${name}'
      AND owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
  `;
}

/** SQL para buscar tanto spec quanto body de um package */
export function getPackageSourceSql(name: string): string {
  return `
    SELECT type, line, text
    FROM all_source
    WHERE name = '${name}'
      AND owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
      AND type IN ('PACKAGE', 'PACKAGE BODY')
    ORDER BY DECODE(type, 'PACKAGE', 1, 'PACKAGE BODY', 2), line
  `;
}

/** Mapeia DatabaseObjectType da app para OBJECT_TYPE do Oracle */
const DB_OBJECT_TYPE_MAP: Record<DatabaseObjectType, string> = {
  tables: "TABLE",
  views: "VIEW",
  triggers: "TRIGGER",
  packages: "PACKAGE",
  procedures: "PROCEDURE",
  functions: "FUNCTION",
};

export const SEARCHABLE_OBJECT_KINDS: readonly OracleObjectKind[] = [
  "TABLE",
  "VIEW",
  "PACKAGE",
  "PROCEDURE",
  "FUNCTION",
  "TRIGGER",
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
  }

  const unsupportedKind: never = kind;
  throw new Error(`Unsupported Oracle object kind: ${unsupportedKind}`);
}

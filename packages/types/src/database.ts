/** Categorias de objetos Oracle exibidas na sidebar */
export type DatabaseObjectType =
  | "tables"
  | "views"
  | "triggers"
  | "packages"
  | "procedures"
  | "functions";

export type OracleObjectKind =
  | "TABLE"
  | "VIEW"
  | "TRIGGER"
  | "PACKAGE"
  | "PROCEDURE"
  | "FUNCTION";

/** Resumo de um objeto do banco — listagem leve sem código-fonte */
export interface DatabaseObjectSummary {
  name: string;
  type: DatabaseObjectType;
  schema: string;
  status?: "VALID" | "INVALID";
}

export interface DatabaseObjectSuggestion {
  name: string;
  type: DatabaseObjectType;
  objectKind: OracleObjectKind;
  schema: string;
  status?: "VALID" | "INVALID";
}

// ─── Object detail (discriminated union) ────────────────────────────

/** Coluna de tabela ou view */
export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  position: number;
}

export interface ConstraintColumnInfo {
  name: string;
  position: number;
}

export interface ForeignKeyColumnMapping {
  position: number;
  localColumn: string;
  referencedColumn: string;
}

export interface PrimaryKeyDetail {
  constraintName: string;
  columns: ConstraintColumnInfo[];
}

export interface ForeignKeyDetail {
  constraintName: string;
  referencedSchema: string;
  referencedTable: string;
  columns: ForeignKeyColumnMapping[];
}

export interface IncomingReferenceDetail {
  constraintName: string;
  sourceSchema: string;
  sourceTable: string;
  columns: ForeignKeyColumnMapping[];
}

/** Detalhe estruturado de uma tabela */
export interface TableDetail {
  kind: "table";
  objectName: string;
  columns: ColumnInfo[];
  primaryKey: PrimaryKeyDetail | null;
  foreignKeys: ForeignKeyDetail[];
  referencedBy: IncomingReferenceDetail[];
}

/** Detalhe estruturado de uma view */
export interface ViewDetail {
  kind: "view";
  objectName: string;
  text: string;
  columns: ColumnInfo[];
}

/** Código-fonte de triggers, procedures, functions, packages */
export interface SourceDetail {
  kind: "source";
  objectName: string;
  objectType: DatabaseObjectType;
  source: string;
}

/** Resposta unificada de db:get-source */
export type ObjectDetailResponse = TableDetail | ViewDetail | SourceDetail;

/** Categorias de objetos Oracle exibidas na sidebar */
export type DatabaseObjectType =
  | "tables"
  | "views"
  | "triggers"
  | "packages"
  | "procedures"
  | "functions"
  | "ckts"
  | "ckcs";

export type OracleObjectKind =
  | "TABLE"
  | "VIEW"
  | "TRIGGER"
  | "PACKAGE"
  | "PROCEDURE"
  | "FUNCTION"
  | "CKT"
  | "CKC";

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

export interface PrimaryKeyDetail {
  constraintName: string;
  columns: ConstraintColumnInfo[];
}

/** Detalhe estruturado de uma tabela */
export interface TableDetail {
  kind: "table";
  objectName: string;
  columns: ColumnInfo[];
  primaryKey: PrimaryKeyDetail | null;
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

/** Detalhe estruturado de uma check constraint navegável */
export interface ConstraintDetail {
  kind: "constraint";
  objectName: string;
  objectType: "ckts" | "ckcs";
  tableName: string;
  searchCondition: string;
  columns: ConstraintColumnInfo[];
  status: "ENABLED" | "DISABLED";
  validated: "VALIDATED" | "NOT VALIDATED";
 }

/** Resposta unificada de db:get-source */
export type ObjectDetailResponse = TableDetail | ViewDetail | SourceDetail | ConstraintDetail;

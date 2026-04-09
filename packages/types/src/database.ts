/** Categorias de objetos Oracle exibidas na sidebar */
export type DatabaseObjectType =
  | "tables"
  | "views"
  | "triggers"
  | "packages"
  | "procedures"
  | "functions";

/** Resumo de um objeto do banco — listagem leve sem código-fonte */
export interface DatabaseObjectSummary {
  name: string;
  type: DatabaseObjectType;
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

/** Detalhe estruturado de uma tabela */
export interface TableDetail {
  kind: "table";
  objectName: string;
  columns: ColumnInfo[];
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

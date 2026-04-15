import type { BindParameterValue } from "./query";

export type QueryExportFormat = "csv" | "xlsx";

export interface QueryExportColumn {
  key: string;
  label: string;
  dataType: string;
  visible?: boolean;
}

export interface QueryExportRequest {
  exportId: string;
  sql: string;
  binds?: Record<string, BindParameterValue>;
  orderBy?: { column: string; direction: "asc" | "desc" };
  columns: QueryExportColumn[];
  format: QueryExportFormat;
  delimiter?: string;
  suggestedFileName?: string;
  autoFitColumns?: boolean;
}

export interface QueryExportResponse {
  exportId: string;
  canceled: boolean;
  filePath: string | null;
  format: QueryExportFormat;
  rowsExported: number;
}

export type QueryExportStage = "preparing" | "fetching" | "writing" | "finalizing" | "completed" | "error";

export interface QueryExportProgress {
  exportId: string;
  format: QueryExportFormat;
  stage: QueryExportStage;
  rowsProcessed: number;
  chunksProcessed: number;
  message: string;
  filePath?: string | null;
}

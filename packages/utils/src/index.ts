// Utilitários compartilhados — funções puras sem dependência de runtime específico

/** Gera um ID único simples (suficiente para uso local, não é UUID criptográfico) */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Formata milissegundos para exibição amigável */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export type { ParsedSqlStatement, SqlCursorTarget, SqlStatementRange } from "./sql-statements.js";
export { findStatementAtCursor, parseSqlStatements, resolveSqlSelection } from "./sql-statements.js";
export type { BindOccurrence, ExtractedBind } from "./sql-binds.js";
export { extractBindParameters } from "./sql-binds.js";

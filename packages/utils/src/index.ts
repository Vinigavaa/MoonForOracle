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
export { findStatementAtCursor, normalizeExecutableSql, parseSqlStatements, resolveSqlSelection } from "./sql-statements.js";
export type { SqlScopeBlock } from "./sql-scope.js";
export { findNearestSqlScope, findSqlScopeAtCursor, getSqlScopePath, parseSqlScopeBlocks } from "./sql-scope.js";
export type { BindOccurrence, ExtractedBind } from "./sql-binds.js";
export { extractBindParameters } from "./sql-binds.js";
export type { SqlIdentifierPart, SqlObjectReference } from "./sql-object-reference.js";
export { extractObjectReferenceAtCursor, isInsideSqlStringOrComment } from "./sql-object-reference.js";

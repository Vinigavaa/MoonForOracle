import type { ParsedSqlStatement } from "@gavadb/utils";
import { findStatementAtCursor, parseSqlStatements, resolveSqlSelection } from "@gavadb/utils";

export type EditorExecutionSource = "selection" | "statement";

export interface SqlEditorExecutionSnapshot {
  document: string;
  selectionStart: number;
  selectionEnd: number;
  cursorOffset: number;
  statements: ParsedSqlStatement[];
  activeStatement: ParsedSqlStatement | null;
}

export interface EditorExecutionTarget {
  sql: string;
  source: EditorExecutionSource;
  range: {
    start: number;
    end: number;
  };
  statementIndex: number;
  statementCount: number;
}

export function buildExecutionSnapshot(
  document: string,
  selectionStart: number,
  selectionEnd: number,
  cursorOffset: number,
  statements = parseSqlStatements(document),
): SqlEditorExecutionSnapshot {
  const activeTarget = findStatementAtCursor(document, cursorOffset, statements);

  return {
    document,
    selectionStart,
    selectionEnd,
    cursorOffset,
    statements,
    activeStatement: activeTarget?.statement ?? null,
  };
}

export function resolveSingleExecutionTarget(snapshot: SqlEditorExecutionSnapshot): EditorExecutionTarget | null {
  const selection = resolveSqlSelection(snapshot.document, snapshot.selectionStart, snapshot.selectionEnd);
  if (selection) {
    return {
      sql: selection.text,
      source: "selection",
      range: { start: selection.textStart, end: selection.textEnd },
      statementIndex: snapshot.activeStatement?.index ?? 0,
      statementCount: snapshot.statements.length,
    };
  }

  if (!snapshot.activeStatement) return null;

  return {
    sql: snapshot.activeStatement.text,
    source: "statement",
    range: { start: snapshot.activeStatement.textStart, end: snapshot.activeStatement.textEnd },
    statementIndex: snapshot.activeStatement.index,
    statementCount: snapshot.statements.length,
  };
}

export function resolveAllExecutionTargets(document: string): EditorExecutionTarget[] {
  const statements = parseSqlStatements(document);
  return statements.map((statement) => ({
    sql: statement.text,
    source: "statement",
    range: { start: statement.textStart, end: statement.textEnd },
    statementIndex: statement.index,
    statementCount: statements.length,
  }));
}

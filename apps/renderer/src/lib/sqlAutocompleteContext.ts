import type { SearchColumnsRequest } from "@gavadb/types";
import type { SqlAutocompleteTarget } from "./sqlAutocomplete";
import { buildExecutionSnapshot } from "./sqlExecutionTarget";

type AutocompleteContext =
  | { kind: "object"; query: string }
  | { kind: "column"; prefix: string; tables: SearchColumnsRequest["tables"] };

interface ResolvedTableRef {
  schema?: string | null;
  table: string;
  alias?: string | null;
}

const IDENT = "(?:\"[^\"]+\"|[A-Za-z][A-Za-z0-9_$#]*)";
const FROM_JOIN_RE = new RegExp(`(?:FROM|JOIN)\\s+(${IDENT}(?:\\.${IDENT})?)(?:\\s+(?:AS\\s+)?(${IDENT}))?`, "gi");
const UPDATE_RE = new RegExp(`\\bUPDATE\\s+(${IDENT}(?:\\.${IDENT})?)(?:\\s+(?:AS\\s+)?(${IDENT}))?`, "gi");
const INTO_RE = new RegExp(`\\b(?:INTO|MERGE\\s+INTO)\\s+(${IDENT}(?:\\.${IDENT})?)(?:\\s+(?:AS\\s+)?(${IDENT}))?`, "gi");
const DELETE_RE = new RegExp(`\\bDELETE\\s+FROM\\s+(${IDENT}(?:\\.${IDENT})?)(?:\\s+(?:AS\\s+)?(${IDENT}))?`, "gi");

export function detectSqlAutocompleteContext(
  document: string,
  cursor: number,
  target: SqlAutocompleteTarget,
): AutocompleteContext {
  const snapshot = buildExecutionSnapshot(document, cursor, cursor, cursor);
  const activeStatement = snapshot.activeStatement;
  if (!activeStatement) {
    return { kind: "object", query: target.query };
  }

  const statementText = activeStatement.text;
  const statementCursor = cursor - activeStatement.textStart;
  const beforeCursor = stripSql(statementText.slice(0, statementCursor));
  const tables = collectResolvedTables(statementText);

  if (target.qualifier) {
    const resolved = resolveTablesForQualifier(target.qualifier.text, tables);
    if (resolved.length > 0) {
      return { kind: "column", prefix: target.prefix.text, tables: resolved };
    }
    return { kind: "object", query: target.query };
  }

  if (isTableContext(beforeCursor)) {
    return { kind: "object", query: target.query };
  }

  if (isColumnContext(beforeCursor)) {
    const resolved = resolveTablesForColumnContext(tables);
    if (resolved.length > 0) {
      return { kind: "column", prefix: target.prefix.text, tables: resolved };
    }
  }

  return { kind: "object", query: target.query };
}

function isTableContext(beforeCursor: string): boolean {
  return /\b(?:FROM|JOIN|UPDATE|INTO)\s+(?:"[^"]+"|[A-Za-z][A-Za-z0-9_$#.]*)?$/i.test(beforeCursor.trimEnd());
}

function isColumnContext(beforeCursor: string): boolean {
  return /\b(?:SELECT|WHERE|AND|OR|HAVING|ON|SET|ORDER\s+BY|GROUP\s+BY)\s+(?:"[^"]+"|[A-Za-z][A-Za-z0-9_$#.]*)?$/i.test(beforeCursor.trimEnd())
    || /,\s*(?:"[^"]+"|[A-Za-z][A-Za-z0-9_$#.]*)?$/i.test(beforeCursor.trimEnd());
}

function collectResolvedTables(sql: string): ResolvedTableRef[] {
  const stripped = stripSql(sql);
  const tables = new Map<string, ResolvedTableRef>();

  for (const regex of [FROM_JOIN_RE, UPDATE_RE, INTO_RE, DELETE_RE]) {
    regex.lastIndex = 0;
    for (const match of stripped.matchAll(regex)) {
      const resolved = toResolvedTable(match[1] ?? "", match[2] ?? null);
      if (!resolved) continue;
      tables.set(tableKey(resolved), resolved);
    }
  }

  return Array.from(tables.values());
}

function resolveTablesForQualifier(qualifier: string, tables: ResolvedTableRef[]): SearchColumnsRequest["tables"] {
  const normalized = normalizeIdentifierPart(qualifier);
  return tables
    .filter((table) => {
      const tableName = normalizeIdentifierPart(table.table);
      const alias = table.alias ? normalizeIdentifierPart(table.alias) : null;
      return alias === normalized || tableName === normalized;
    })
    .map(toSearchTableRef);
}

function resolveTablesForColumnContext(tables: ResolvedTableRef[]): SearchColumnsRequest["tables"] {
  return dedupeTables(tables.map(toSearchTableRef)).slice(0, 6);
}

function toResolvedTable(rawTable: string, rawAlias: string | null): ResolvedTableRef | null {
  if (!rawTable) return null;
  const parts = rawTable.split(".");
  const table = normalizeIdentifierPart(parts[parts.length - 1] ?? "");
  if (!table) return null;

  return {
    schema: parts.length > 1 ? normalizeIdentifierPart(parts[parts.length - 2] ?? "") : null,
    table,
    alias: rawAlias ? normalizeIdentifierPart(rawAlias) : null,
  };
}

function toSearchTableRef(table: ResolvedTableRef): SearchColumnsRequest["tables"][number] {
  return {
    schema: table.schema ?? null,
    table: table.table,
    alias: table.alias ?? null,
  };
}

function dedupeTables(tables: SearchColumnsRequest["tables"]): SearchColumnsRequest["tables"] {
  const seen = new Set<string>();
  const unique: SearchColumnsRequest["tables"] = [];

  for (const table of tables) {
    const key = `${table.schema ?? ""}.${table.table}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(table);
  }

  return unique;
}

function normalizeIdentifierPart(value: string): string {
  return value.trim().replace(/^"+|"+$/g, "").toUpperCase();
}

function tableKey(table: ResolvedTableRef): string {
  return `${table.schema ?? ""}.${table.table}.${table.alias ?? ""}`;
}

function stripSql(sql: string): string {
  let output = "";
  let inLineComment = false;
  let inBlockComment = false;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        output += char;
      } else {
        output += " ";
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        output += "  ";
        i += 1;
      } else {
        output += char === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (inSingleQuote) {
      if (char === "'" && next === "'") {
        output += "  ";
        i += 1;
      } else if (char === "'") {
        inSingleQuote = false;
        output += " ";
      } else {
        output += " ";
      }
      continue;
    }

    if (inDoubleQuote) {
      if (char === "\"") {
        inDoubleQuote = false;
      }
      output += char;
      continue;
    }

    if (char === "-" && next === "-") {
      inLineComment = true;
      output += "  ";
      i += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      output += "  ";
      i += 1;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      output += " ";
      continue;
    }

    if (char === "\"") {
      inDoubleQuote = true;
      output += char;
      continue;
    }

    output += char;
  }

  return output;
}

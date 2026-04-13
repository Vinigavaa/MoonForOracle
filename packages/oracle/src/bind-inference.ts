import type { Connection } from "oracledb";
import oracledb from "oracledb";
import type { BindMetadata, BindDataType } from "@gavadb/types";
import { extractBindParameters } from "@gavadb/utils";

interface ResolvedTable {
  table: string;
  schema?: string;
}

interface BindColumnHint {
  bindName: string;
  /** Column reference as written: "col" or "alias.col" */
  columnRef: string;
}

/**
 * Strips strings, comments, and q-quotes from SQL so regexes can work on the
 * structural text without false positives. Same state machine as the bind parser.
 */
function stripLiterals(sql: string): string {
  const out: string[] = [];
  const length = sql.length;
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inLine = false;
  let inBlock = false;
  let qEnd: string | null = null;
  const Q: Record<string, string> = { "[": "]", "(": ")", "{": "}", "<": ">" };

  while (i < length) {
    const c = sql[i]!;
    const n = i + 1 < length ? sql[i + 1]! : "";
    if (inLine) {
      if (c === "\n") { inLine = false; out.push(c); }
      else out.push(" ");
      i++; continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") { inBlock = false; out.push("  "); i += 2; continue; }
      out.push(c === "\n" ? "\n" : " ");
      i++; continue;
    }
    if (qEnd) {
      if (c === qEnd && n === "'") { qEnd = null; out.push("  "); i += 2; continue; }
      out.push(" ");
      i++; continue;
    }
    if (inSingle) {
      if (c === "'" && n === "'") { out.push("  "); i += 2; continue; }
      if (c === "'") { inSingle = false; out.push(" "); i++; continue; }
      out.push(" "); i++; continue;
    }
    if (inDouble) {
      if (c === '"') { inDouble = false; out.push(" "); i++; continue; }
      out.push(" "); i++; continue;
    }
    if (c === "-" && n === "-") { inLine = true; out.push("  "); i += 2; continue; }
    if (c === "/" && n === "*") { inBlock = true; out.push("  "); i += 2; continue; }
    if ((c === "q" || c === "Q") && n === "'" && i + 2 < length) {
      const opener = sql[i + 2]!;
      qEnd = Q[opener] ?? opener;
      out.push("   "); i += 3; continue;
    }
    if (c === "'") { inSingle = true; out.push(" "); i++; continue; }
    if (c === '"') { inDouble = true; out.push(" "); i++; continue; }
    out.push(c);
    i++;
  }
  return out.join("");
}

const IDENT = "(?:\"[^\"]+\"|[A-Za-z][A-Za-z0-9_$#]*)";
// Matches "col = :bind", "alias.col >= :bind", "col like :bind", etc.
const COMPARISON_RE = new RegExp(
  `(${IDENT}(?:\\.${IDENT})?)\\s*(?:=|<>|!=|>=|<=|>|<|[Ll][Ii][Kk][Ee])\\s*:([A-Za-z_][A-Za-z0-9_$#]*)`,
  "g",
);
// BETWEEN :a AND :b — binds to the left column
const BETWEEN_RE = new RegExp(
  `(${IDENT}(?:\\.${IDENT})?)\\s+[Bb][Ee][Tt][Ww][Ee][Ee][Nn]\\s+:([A-Za-z_][A-Za-z0-9_$#]*)\\s+[Aa][Nn][Dd]\\s+:([A-Za-z_][A-Za-z0-9_$#]*)`,
  "g",
);
// FROM/JOIN clauses → table aliases
const FROM_RE = new RegExp(
  `(?:FROM|JOIN)\\s+(${IDENT}(?:\\.${IDENT})?)(?:\\s+(?:AS\\s+)?(${IDENT}))?`,
  "gi",
);

function collectBindColumnHints(strippedSql: string): BindColumnHint[] {
  const hints: BindColumnHint[] = [];
  for (const m of strippedSql.matchAll(COMPARISON_RE)) {
    hints.push({ columnRef: m[1]!, bindName: m[2]! });
  }
  for (const m of strippedSql.matchAll(BETWEEN_RE)) {
    hints.push({ columnRef: m[1]!, bindName: m[2]! });
    hints.push({ columnRef: m[1]!, bindName: m[3]! });
  }
  return hints;
}

function collectTableAliases(strippedSql: string): Map<string, ResolvedTable> {
  const aliases = new Map<string, ResolvedTable>();
  for (const m of strippedSql.matchAll(FROM_RE)) {
    const rawTable = m[1]!;
    const rawAlias = m[2];
    const [schema, table] = splitQualified(rawTable);
    const resolved: ResolvedTable = { table, schema };
    if (rawAlias) {
      aliases.set(unquote(rawAlias).toUpperCase(), resolved);
    }
    // Also map the table name itself as an "alias" so "tab.col" resolves
    aliases.set(table.toUpperCase(), resolved);
  }
  return aliases;
}

function splitQualified(ref: string): [string | undefined, string] {
  const parts = ref.split(".");
  if (parts.length === 2) return [unquote(parts[0]!), unquote(parts[1]!)];
  return [undefined, unquote(parts[0]!)];
}

function unquote(ident: string): string {
  if (ident.startsWith('"') && ident.endsWith('"')) return ident.slice(1, -1);
  return ident.toUpperCase();
}

function mapOracleTypeToBind(dataType: string): BindDataType {
  const t = dataType.toUpperCase();
  if (t === "NUMBER" || t === "FLOAT" || t === "BINARY_FLOAT" || t === "BINARY_DOUBLE" || t === "INTEGER") {
    return "NUMBER";
  }
  if (t === "DATE") return "DATE";
  if (t.startsWith("TIMESTAMP")) return "TIMESTAMP";
  if (t === "VARCHAR2" || t === "CHAR" || t === "NVARCHAR2" || t === "NCHAR" || t === "CLOB" || t === "NCLOB") {
    return "VARCHAR";
  }
  return "UNKNOWN";
}

interface ColumnMetaRow {
  OWNER: string;
  TABLE_NAME: string;
  COLUMN_NAME: string;
  DATA_TYPE: string;
  DATA_LENGTH: number | null;
  DATA_PRECISION: number | null;
  DATA_SCALE: number | null;
  NULLABLE: string;
}

async function fetchColumnMeta(
  conn: Connection,
  tables: ResolvedTable[],
): Promise<Map<string, ColumnMetaRow>> {
  const result = new Map<string, ColumnMetaRow>();
  if (tables.length === 0) return result;

  const ownerBinds: Record<string, string> = {};
  const tableBinds: Record<string, string> = {};
  const pairs: string[] = [];
  tables.forEach((t, i) => {
    const tKey = `t${i}`;
    tableBinds[tKey] = t.table.toUpperCase();
    if (t.schema) {
      const oKey = `o${i}`;
      ownerBinds[oKey] = t.schema.toUpperCase();
      pairs.push(`(OWNER = :${oKey} AND TABLE_NAME = :${tKey})`);
    } else {
      pairs.push(`(TABLE_NAME = :${tKey})`);
    }
  });

  const sql = `
    SELECT OWNER, TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH,
           DATA_PRECISION, DATA_SCALE, NULLABLE
    FROM ALL_TAB_COLUMNS
    WHERE ${pairs.join(" OR ")}
  `;

  const res = await conn.execute<ColumnMetaRow>(
    sql,
    { ...ownerBinds, ...tableBinds },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  for (const row of (res.rows ?? []) as ColumnMetaRow[]) {
    result.set(`${row.TABLE_NAME}.${row.COLUMN_NAME}`, row);
  }
  return result;
}

/**
 * Inspect `sql` and return metadata for each bind parameter.
 * Never throws — on failure, returns a generic UNKNOWN entry per bind.
 */
export async function inferBindMetadata(
  conn: Connection,
  sql: string,
): Promise<BindMetadata[]> {
  const binds = extractBindParameters(sql);
  if (binds.length === 0) return [];

  const fallback = (name: string, reason?: string): BindMetadata => ({
    name,
    dataType: "UNKNOWN",
    inferred: false,
    nullable: true,
    reason,
  });

  let stripped: string;
  try {
    stripped = stripLiterals(sql);
  } catch {
    return binds.map((b) => fallback(b.name, "Could not parse SQL"));
  }

  const hints = collectBindColumnHints(stripped);
  const aliases = collectTableAliases(stripped);

  // Collect all distinct tables referenced (candidate targets)
  const tableList: ResolvedTable[] = [];
  const seen = new Set<string>();
  for (const t of aliases.values()) {
    const key = `${t.schema ?? ""}.${t.table}`;
    if (!seen.has(key)) {
      seen.add(key);
      tableList.push(t);
    }
  }

  let columnMeta = new Map<string, ColumnMetaRow>();
  try {
    columnMeta = await fetchColumnMeta(conn, tableList);
  } catch (err) {
    const reason = (err as Error).message ?? "metadata lookup failed";
    return binds.map((b) => fallback(b.name, reason));
  }

  return binds.map(({ name }) => {
    const hint = hints.find((h) => h.bindName.toLowerCase() === name.toLowerCase());
    if (!hint) return fallback(name, "Could not map bind to a column");

    const [rawPrefix, rawCol] = hint.columnRef.includes(".")
      ? [hint.columnRef.split(".")[0]!, hint.columnRef.split(".")[1]!]
      : [undefined, hint.columnRef];
    const colName = unquote(rawCol);

    // Candidate tables: aliased prefix if present, otherwise all tables
    const candidates: ResolvedTable[] = rawPrefix
      ? (aliases.has(unquote(rawPrefix)) ? [aliases.get(unquote(rawPrefix))!] : [])
      : tableList;

    const matches: ColumnMetaRow[] = [];
    for (const t of candidates) {
      const row = columnMeta.get(`${t.table.toUpperCase()}.${colName}`);
      if (row) matches.push(row);
    }

    if (matches.length === 0) {
      return fallback(name, `Column ${colName} not found in schema`);
    }
    if (matches.length > 1) {
      return fallback(name, `Ambiguous column ${colName} across tables`);
    }
    const row = matches[0]!;
    return {
      name,
      dataType: mapOracleTypeToBind(row.DATA_TYPE),
      inferred: true,
      nullable: row.NULLABLE !== "N",
      length: row.DATA_LENGTH ?? undefined,
      precision: row.DATA_PRECISION ?? undefined,
      scale: row.DATA_SCALE ?? undefined,
      column: row.COLUMN_NAME,
      table: row.TABLE_NAME,
    };
  });
}

/**
 * Converts the renderer-side bind values into node-oracledb BindParameter
 * objects. Performs explicit type coercion so wire types are correct.
 */
export function buildOracleBinds(
  binds: Record<string, import("@gavadb/types").BindParameterValue> | undefined,
): Record<string, oracledb.BindParameter> {
  const out: Record<string, oracledb.BindParameter> = {};
  if (!binds) return out;

  for (const [name, b] of Object.entries(binds)) {
    if (b.isNull || b.value === null || b.value === undefined || b.value === "") {
      out[name] = { val: null, type: mapTypeToOracle(b.type) };
      continue;
    }
    switch (b.type) {
      case "NUMBER": {
        const n = typeof b.value === "number" ? b.value : Number(b.value);
        if (!Number.isFinite(n)) throw new Error(`Bind :${name} is not a valid number`);
        out[name] = { val: n, type: oracledb.NUMBER };
        break;
      }
      case "DATE":
      case "TIMESTAMP": {
        const d = parseLocalDate(b.value);
        if (!d || Number.isNaN(d.getTime())) throw new Error(`Bind :${name} is not a valid date`);
        out[name] = { val: d, type: oracledb.DATE };
        break;
      }
      case "VARCHAR":
        out[name] = { val: String(b.value), type: oracledb.STRING };
        break;
      default:
        // UNKNOWN / not provided — let driver decide from JS type
        out[name] = { val: b.value as oracledb.BindParameter["val"] };
    }
  }
  return out;
}

/**
 * Parses a date value preserving local wall-clock time. Avoids the JS pitfall
 * where `new Date("2025-01-01")` is parsed as UTC midnight, which shifts to
 * the previous day in negative-offset timezones (e.g. America/Sao_Paulo) and
 * causes `column = :param` to miss rows stored as midnight-local.
 */
function parseLocalDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;

  // "YYYY-MM-DD"
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  // "YYYY-MM-DDTHH:MM" or "YYYY-MM-DDTHH:MM:SS" (from datetime-local input)
  const dt = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (dt) {
    return new Date(
      Number(dt[1]), Number(dt[2]) - 1, Number(dt[3]),
      Number(dt[4]), Number(dt[5]), dt[6] ? Number(dt[6]) : 0,
    );
  }
  // Fallback: let JS parse (may be timezone-aware ISO like "...Z")
  return new Date(s);
}

function mapTypeToOracle(type?: BindDataType): oracledb.DbType | undefined {
  switch (type) {
    case "NUMBER": return oracledb.NUMBER;
    case "DATE":
    case "TIMESTAMP": return oracledb.DATE;
    case "VARCHAR": return oracledb.STRING;
    default: return undefined;
  }
}

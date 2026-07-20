export interface SqlStatementRange {
  start: number;
  end: number;
}

export interface ParsedSqlStatement extends SqlStatementRange {
  text: string;
  textStart: number;
  textEnd: number;
  index: number;
}

export interface SqlCursorTarget {
  statement: ParsedSqlStatement;
  reason: "cursor" | "nearest";
}

const WORD_CHAR = /[A-Za-z0-9_$#]/;
const IDENTIFIER_START = /[A-Za-z_]/;
const Q_QUOTE_CLOSE: Record<string, string> = {
  "[": "]",
  "(": ")",
  "{": "}",
  "<": ">",
};
const PLSQL_OBJECT_TYPES = new Set([
  "FUNCTION",
  "PROCEDURE",
  "PACKAGE",
  "TRIGGER",
  "TYPE",
]);
const PLSQL_BLOCK_OPENERS = new Set(["BEGIN", "CASE", "IF", "LOOP"]);

export function parseSqlStatements(sql: string): ParsedSqlStatement[] {
  const statements: ParsedSqlStatement[] = [];
  const length = sql.length;

  let statementStart = 0;
  let index = 0;
  let i = 0;
  let word = "";
  let significantTokens: string[] = [];
  let plsqlMode = false;
  let plsqlDepth = 0;
  let canTerminatePlsql = false;

  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let qQuoteEnd: string | null = null;

  const flushWord = () => {
    if (!word) return;

    const token = word.toUpperCase();
    significantTokens.push(token);

    if (!plsqlMode) {
      plsqlMode = isPlsqlStart(significantTokens);
    }

    if (plsqlMode) {
      if (PLSQL_BLOCK_OPENERS.has(token)) {
        plsqlDepth += 1;
        canTerminatePlsql = false;
      } else if (token === "END") {
        plsqlDepth = Math.max(plsqlDepth - 1, 0);
        canTerminatePlsql = plsqlDepth === 0;
      } else if (token !== "THEN" && token !== "ELSE" && token !== "ELSIF") {
        canTerminatePlsql = false;
      }
    }

    word = "";
  };

  const finalizeStatement = (rawEnd: number) => {
    flushWord();

    const bounds = trimStatementBounds(sql, statementStart, rawEnd);
    if (bounds) {
      statements.push({
        start: statementStart,
        end: rawEnd,
        textStart: bounds.start,
        textEnd: bounds.end,
        text: sql.slice(bounds.start, bounds.end),
        index,
      });
      index += 1;
    }

    statementStart = rawEnd;
    significantTokens = [];
    plsqlMode = false;
    plsqlDepth = 0;
    canTerminatePlsql = false;
  };

  while (i < length) {
    const char = sql[i];
    const next = i + 1 < length ? sql[i + 1] : "";

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      i += 1;
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    if (qQuoteEnd) {
      if (char === qQuoteEnd && next === "'") {
        qQuoteEnd = null;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    if (inSingleQuote) {
      if (char === "'" && next === "'") {
        i += 2;
        continue;
      }
      if (char === "'") {
        inSingleQuote = false;
      }
      i += 1;
      continue;
    }

    if (inDoubleQuote) {
      if (char === "\"") {
        inDoubleQuote = false;
      }
      i += 1;
      continue;
    }

    if (char === "-" && next === "-") {
      flushWord();
      inLineComment = true;
      i += 2;
      continue;
    }

    if (char === "/" && next === "*") {
      flushWord();
      inBlockComment = true;
      i += 2;
      continue;
    }

    if ((char === "q" || char === "Q") && next === "'" && i + 2 < length) {
      const opener = sql[i + 2];
      qQuoteEnd = Q_QUOTE_CLOSE[opener] ?? opener;
      i += 3;
      continue;
    }

    if (char === "'") {
      flushWord();
      inSingleQuote = true;
      i += 1;
      continue;
    }

    if (char === "\"") {
      flushWord();
      inDoubleQuote = true;
      i += 1;
      continue;
    }

    if (IDENTIFIER_START.test(char) || (word && WORD_CHAR.test(char))) {
      word += char;
      i += 1;
      continue;
    }

    flushWord();

    if (char === ";") {
      if (!plsqlMode || canTerminatePlsql) {
        finalizeStatement(plsqlMode ? i + 1 : i);
        statementStart = i + 1;
      }
      i += 1;
      continue;
    }

    if (char === "/" && isSlashDelimiter(sql, i, statementStart)) {
      finalizeStatement(i);
      statementStart = i + 1;
      i += 1;
      continue;
    }

    i += 1;
  }

  finalizeStatement(length);

  return statements;
}

export function findStatementAtCursor(sql: string, cursorOffset: number, parsed?: ParsedSqlStatement[]): SqlCursorTarget | null {
  const statements = parsed ?? parseSqlStatements(sql);
  if (statements.length === 0) return null;

  const clampedCursor = Math.max(0, Math.min(cursorOffset, sql.length));
  for (const statement of statements) {
    if (clampedCursor >= statement.start && clampedCursor <= statement.end) {
      if (clampedCursor < statement.textStart && isWhitespaceOnly(sql.slice(clampedCursor, statement.textStart))) {
        continue;
      }
      return { statement, reason: "cursor" };
    }
  }

  if (clampedCursor <= statements[0]!.textStart) {
    return { statement: statements[0]!, reason: "nearest" };
  }

  for (let i = 1; i < statements.length; i += 1) {
    const previous = statements[i - 1]!;
    const current = statements[i]!;
    if (clampedCursor > previous.end && clampedCursor < current.textStart) {
      return { statement: previous, reason: "nearest" };
    }
  }

  if (clampedCursor >= statements[statements.length - 1]!.end) {
    return { statement: statements[statements.length - 1]!, reason: "nearest" };
  }

  let nearest = statements[0];
  let nearestDistance = distanceToRange(clampedCursor, nearest.start, nearest.end);
  for (let i = 1; i < statements.length; i += 1) {
    const statement = statements[i];
    const distance = distanceToRange(clampedCursor, statement.start, statement.end);
    if (distance < nearestDistance) {
      nearest = statement;
      nearestDistance = distance;
    }
  }

  return { statement: nearest, reason: "nearest" };
}

export function resolveSqlSelection(sql: string, selectionStart: number, selectionEnd: number): ParsedSqlStatement | null {
  const start = Math.max(0, Math.min(selectionStart, selectionEnd));
  const end = Math.max(0, Math.max(selectionStart, selectionEnd));
  const bounds = trimStatementBounds(sql, start, end);
  if (!bounds) return null;

  return {
    start,
    end,
    textStart: bounds.start,
    textEnd: bounds.end,
    text: sql.slice(bounds.start, bounds.end),
    index: 0,
  };
}

export function normalizeExecutableSql(sql: string): string {
  const trimmed = sql.trim();
  if (!trimmed) {
    return "";
  }

  const statements = parseSqlStatements(trimmed);
  if (statements.length !== 1) {
    return trimmed;
  }

  return statements[0]!.text;
}

function trimStatementBounds(sql: string, start: number, end: number): SqlStatementRange | null {
  let left = start;
  let right = end;

  while (left < right && /\s/.test(sql[left] ?? "")) {
    left += 1;
  }

  while (right > left && /\s/.test(sql[right - 1] ?? "")) {
    right -= 1;
  }

  if (left >= right) return null;
  return { start: left, end: right };
}

function isPlsqlStart(tokens: string[]): boolean {
  const [first, second, third, fourth] = tokens;
  if (first === "BEGIN" || first === "DECLARE") return true;
  if (first === "CREATE") {
    if (second === "OR" && third === "REPLACE" && fourth && PLSQL_OBJECT_TYPES.has(fourth)) {
      return true;
    }
    if (second && PLSQL_OBJECT_TYPES.has(second)) {
      return true;
    }
  }
  return false;
}

function isSlashDelimiter(sql: string, position: number, statementStart: number): boolean {
  let lineStart = position;
  while (lineStart > statementStart && sql[lineStart - 1] !== "\n") {
    lineStart -= 1;
  }

  let lineEnd = position + 1;
  while (lineEnd < sql.length && sql[lineEnd] !== "\n") {
    lineEnd += 1;
  }

  const beforeSlash = sql.slice(lineStart, position).trim();
  const afterSlash = sql.slice(position + 1, lineEnd).trim();
  return beforeSlash.length === 0 && afterSlash.length === 0;
}

function distanceToRange(value: number, start: number, end: number): number {
  if (value < start) return start - value;
  if (value > end) return value - end;
  return 0;
}

function isWhitespaceOnly(value: string): boolean {
  return value.trim().length === 0;
}

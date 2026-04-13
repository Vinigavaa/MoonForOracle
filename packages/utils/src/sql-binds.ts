export interface BindOccurrence {
  name: string;
  start: number;
  end: number;
}

export interface ExtractedBind {
  name: string;
  occurrences: BindOccurrence[];
}

const WORD_CHAR = /[A-Za-z0-9_$#]/;
const IDENTIFIER_START = /[A-Za-z_]/;
const Q_QUOTE_CLOSE: Record<string, string> = {
  "[": "]",
  "(": ")",
  "{": "}",
  "<": ">",
};

/**
 * Scans a SQL statement and returns every `:name` bind placeholder that is
 * NOT inside a string, comment, q-quote or PL/SQL assignment (`:=`) / cast (`::`).
 * Order preserved by first occurrence; duplicates grouped.
 */
export function extractBindParameters(sql: string): ExtractedBind[] {
  const length = sql.length;
  const byName = new Map<string, ExtractedBind>();
  const order: string[] = [];

  let i = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let qQuoteEnd: string | null = null;

  while (i < length) {
    const char = sql[i]!;
    const next = i + 1 < length ? sql[i + 1]! : "";

    if (inLineComment) {
      if (char === "\n") inLineComment = false;
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
      if (char === "'") inSingleQuote = false;
      i += 1;
      continue;
    }
    if (inDoubleQuote) {
      if (char === '"') inDoubleQuote = false;
      i += 1;
      continue;
    }

    if (char === "-" && next === "-") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (char === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if ((char === "q" || char === "Q") && next === "'" && i + 2 < length) {
      const opener = sql[i + 2]!;
      qQuoteEnd = Q_QUOTE_CLOSE[opener] ?? opener;
      i += 3;
      continue;
    }
    if (char === "'") {
      inSingleQuote = true;
      i += 1;
      continue;
    }
    if (char === '"') {
      inDoubleQuote = true;
      i += 1;
      continue;
    }

    if (char === ":") {
      // Skip PL/SQL assignment ":="
      if (next === "=") {
        i += 2;
        continue;
      }
      // Skip Postgres-style "::" cast (not Oracle, but harmless to ignore)
      if (next === ":") {
        i += 2;
        continue;
      }
      // Must be followed by an identifier start
      if (!next || !IDENTIFIER_START.test(next)) {
        i += 1;
        continue;
      }
      // Previous char must not be part of an identifier (avoid `a:b` weirdness)
      const prev = i > 0 ? sql[i - 1]! : "";
      if (prev && WORD_CHAR.test(prev)) {
        i += 1;
        continue;
      }

      const start = i;
      let j = i + 1;
      let name = "";
      while (j < length && WORD_CHAR.test(sql[j]!)) {
        name += sql[j]!;
        j += 1;
      }

      const occurrence: BindOccurrence = { name, start, end: j };
      const key = name.toLowerCase();
      let entry = byName.get(key);
      if (!entry) {
        entry = { name, occurrences: [] };
        byName.set(key, entry);
        order.push(key);
      }
      entry.occurrences.push(occurrence);
      i = j;
      continue;
    }

    i += 1;
  }

  return order.map((key) => byName.get(key)!);
}

export interface SqlIdentifierPart {
  text: string;
  from: number;
  to: number;
}

export interface SqlObjectReference {
  text: string;
  from: number;
  to: number;
  qualifier: SqlIdentifierPart | null;
  object: SqlIdentifierPart;
}

const IDENTIFIER_CHAR = /[A-Za-z0-9_$#]/;

export function extractObjectReferenceAtCursor(sql: string, cursor: number): SqlObjectReference | null {
  if (!sql || cursor < 0 || cursor > sql.length) return null;
  if (isInsideSqlStringOrComment(sql, cursor)) return null;

  const object = findIdentifierAtCursor(sql, cursor);
  if (!object) return null;

  let qualifier: SqlIdentifierPart | null = null;
  let from = object.from;
  const beforeObject = object.from - 1;
  if (beforeObject >= 0 && sql[beforeObject] === ".") {
    const qualifierPart = findIdentifierEndingAt(sql, beforeObject);
    if (qualifierPart) {
      qualifier = qualifierPart;
      from = qualifier.from;
    }
  }

  return {
    text: sql.slice(from, object.to),
    from,
    to: object.to,
    qualifier,
    object,
  };
}

export function isInsideSqlStringOrComment(sql: string, cursor: number): boolean {
  let inLineComment = false;
  let inBlockComment = false;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < cursor; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (char === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inSingleQuote) {
      if (char === "'" && next === "'") {
        i += 1;
        continue;
      }
      if (char === "'") inSingleQuote = false;
      continue;
    }

    if (inDoubleQuote) {
      if (char === "\"" && next === "\"") {
        i += 1;
        continue;
      }
      if (char === "\"") inDoubleQuote = false;
      continue;
    }

    if (char === "-" && next === "-") {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      continue;
    }

    if (char === "\"") {
      inDoubleQuote = true;
    }
  }

  return inLineComment || inBlockComment || inSingleQuote || inDoubleQuote;
}

function findIdentifierAtCursor(sql: string, cursor: number): SqlIdentifierPart | null {
  const left = cursor > 0 ? cursor - 1 : cursor;
  if (left < sql.length && isIdentifierChar(sql[left])) {
    return expandIdentifier(sql, left);
  }

  if (cursor < sql.length && isIdentifierChar(sql[cursor])) {
    return expandIdentifier(sql, cursor);
  }

  return null;
}

function findIdentifierEndingAt(sql: string, dotIndex: number): SqlIdentifierPart | null {
  const end = dotIndex - 1;
  if (end < 0 || !isIdentifierChar(sql[end])) return null;
  return expandIdentifier(sql, end);
}

function expandIdentifier(sql: string, index: number): SqlIdentifierPart | null {
  if (!isIdentifierChar(sql[index])) return null;

  let from = index;
  while (from > 0 && isIdentifierChar(sql[from - 1])) {
    from -= 1;
  }

  let to = index + 1;
  while (to < sql.length && isIdentifierChar(sql[to])) {
    to += 1;
  }

  const text = sql.slice(from, to);
  if (!/^[A-Za-z_][A-Za-z0-9_$#]*$/.test(text)) return null;

  return { text, from, to };
}

function isIdentifierChar(char: string | undefined): boolean {
  return !!char && IDENTIFIER_CHAR.test(char);
}

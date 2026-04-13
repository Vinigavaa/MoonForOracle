import { parseSqlStatements } from "./sql-statements.js";

export interface SqlScopeBlock {
  id: number;
  type: "select";
  start: number;
  end: number;
  selectStart: number;
  selectEnd: number;
  anchor: number;
  endAnchor: number | null;
  parentId: number | null;
  depth: number;
}

interface SqlToken {
  type: "word" | "paren-open" | "paren-close";
  value: string;
  start: number;
  end: number;
  depth: number;
  match?: SqlToken;
}

const WORD_START = /[A-Za-z_]/;
const WORD_PART = /[A-Za-z0-9_$#]/;
const SET_OPERATORS = new Set(["UNION", "INTERSECT", "MINUS", "EXCEPT"]);
const Q_QUOTE_CLOSE: Record<string, string> = {
  "[": "]",
  "(": ")",
  "{": "}",
  "<": ">",
};

export function parseSqlScopeBlocks(sql: string): SqlScopeBlock[] {
  const statements = parseSqlStatements(sql);
  const blocks: SqlScopeBlock[] = [];
  let nextId = 1;

  for (const statement of statements) {
    const statementText = sql.slice(statement.start, statement.end);
    const tokens = tokenizeSqlFragment(statementText, statement.start);
    const parenTokens = tokens.filter((token) => token.type === "paren-open" && token.match);

    const statementSelects = tokens
      .filter((token) => token.type === "word" && token.value === "SELECT")
      .map((selectToken) => {
        const container = findContainer(selectToken, parenTokens);
        const containerStart = container?.start ?? statement.textStart;
        const containerEnd = container?.match?.end ?? statement.textEnd;
        const end = findSelectEnd(tokens, selectToken, containerEnd);
        const start = container ? container.start : selectToken.start;

        return {
          id: nextId++,
          type: "select" as const,
          start,
          end,
          selectStart: selectToken.start,
          selectEnd: selectToken.end,
          anchor: container?.start ?? selectToken.start,
          endAnchor: container?.match?.start ?? null,
          parentId: null,
          depth: 0,
        };
      })
      .sort((left, right) => left.start - right.start || left.end - right.end);

    assignParents(statementSelects);
    blocks.push(...statementSelects);
  }

  return blocks;
}

export function findSqlScopeAtCursor(blocks: SqlScopeBlock[], cursorOffset: number): SqlScopeBlock | null {
  let active: SqlScopeBlock | null = null;
  for (const block of blocks) {
    if (cursorOffset < block.start || cursorOffset > block.end) continue;
    if (!active || block.depth > active.depth || (block.depth === active.depth && block.start >= active.start)) {
      active = block;
    }
  }
  return active;
}

export function findNearestSqlScope(blocks: SqlScopeBlock[], cursorOffset: number): SqlScopeBlock | null {
  let nearest: SqlScopeBlock | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const block of blocks) {
    const distance = distanceToRange(cursorOffset, block.start, block.end);
    if (distance < nearestDistance) {
      nearest = block;
      nearestDistance = distance;
    } else if (distance === nearestDistance && nearest && block.depth > nearest.depth) {
      nearest = block;
    }
  }

  return nearest;
}

export function getSqlScopePath(blocks: SqlScopeBlock[], activeBlockId: number | null): SqlScopeBlock[] {
  if (activeBlockId == null) return [];
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const path: SqlScopeBlock[] = [];
  let current = byId.get(activeBlockId) ?? null;

  while (current) {
    path.push(current);
    current = current.parentId != null ? (byId.get(current.parentId) ?? null) : null;
  }

  return path.reverse();
}

function tokenizeSqlFragment(sql: string, offset = 0): SqlToken[] {
  const tokens: SqlToken[] = [];
  const openParens: SqlToken[] = [];

  let i = 0;
  let wordStart = -1;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let qQuoteEnd: string | null = null;

  const flushWord = (end: number) => {
    if (wordStart === -1) return;
    tokens.push({
      type: "word",
      value: sql.slice(wordStart, end).toUpperCase(),
      start: offset + wordStart,
      end: offset + end,
      depth: openParens.length,
    });
    wordStart = -1;
  };

  while (i < sql.length) {
    const char = sql[i] ?? "";
    const next = sql[i + 1] ?? "";

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
      if (char === "\"") inDoubleQuote = false;
      i += 1;
      continue;
    }

    if (char === "-" && next === "-") {
      flushWord(i);
      inLineComment = true;
      i += 2;
      continue;
    }

    if (char === "/" && next === "*") {
      flushWord(i);
      inBlockComment = true;
      i += 2;
      continue;
    }

    if ((char === "q" || char === "Q") && next === "'" && i + 2 < sql.length) {
      flushWord(i);
      const opener = sql[i + 2] ?? "";
      qQuoteEnd = Q_QUOTE_CLOSE[opener] ?? opener;
      i += 3;
      continue;
    }

    if (char === "'") {
      flushWord(i);
      inSingleQuote = true;
      i += 1;
      continue;
    }

    if (char === "\"") {
      flushWord(i);
      inDoubleQuote = true;
      i += 1;
      continue;
    }

    if (wordStart === -1 && WORD_START.test(char)) {
      wordStart = i;
      i += 1;
      continue;
    }

    if (wordStart !== -1 && WORD_PART.test(char)) {
      i += 1;
      continue;
    }

    flushWord(i);

    if (char === "(") {
      const token: SqlToken = {
        type: "paren-open",
        value: char,
        start: offset + i,
        end: offset + i + 1,
        depth: openParens.length,
      };
      tokens.push(token);
      openParens.push(token);
      i += 1;
      continue;
    }

    if (char === ")") {
      const opener = openParens.pop();
      const token: SqlToken = {
        type: "paren-close",
        value: char,
        start: offset + i,
        end: offset + i + 1,
        depth: openParens.length,
      };
      if (opener) {
        opener.match = token;
        token.match = opener;
      }
      tokens.push(token);
    }

    i += 1;
  }

  flushWord(sql.length);
  return tokens;
}

function findContainer(selectToken: SqlToken, parenTokens: SqlToken[]): SqlToken | null {
  let container: SqlToken | null = null;
  for (const token of parenTokens) {
    if (!token.match) continue;
    if (token.start <= selectToken.start && token.match.end >= selectToken.end) {
      if (!container || token.start >= container.start) {
        container = token;
      }
    }
  }
  return container;
}

function findSelectEnd(tokens: SqlToken[], selectToken: SqlToken, containerEnd: number): number {
  let end = containerEnd;
  for (const token of tokens) {
    if (token.start <= selectToken.start) continue;
    if (token.start >= containerEnd) break;
    if (token.type === "word" && SET_OPERATORS.has(token.value) && token.depth === selectToken.depth) {
      end = token.start;
      break;
    }
  }
  return end;
}

function assignParents(blocks: SqlScopeBlock[]): void {
  for (const block of blocks) {
    let parent: SqlScopeBlock | null = null;
    for (const candidate of blocks) {
      if (candidate.id === block.id) continue;
      if (candidate.start > block.start || candidate.end < block.end) continue;
      if (!parent || (candidate.end - candidate.start) < (parent.end - parent.start)) {
        parent = candidate;
      }
    }
    block.parentId = parent?.id ?? null;
    block.depth = parent ? parent.depth + 1 : 0;
  }
}

function distanceToRange(value: number, start: number, end: number): number {
  if (value < start) return start - value;
  if (value > end) return value - end;
  return 0;
}

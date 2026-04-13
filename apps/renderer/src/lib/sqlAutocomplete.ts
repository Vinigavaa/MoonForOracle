import { type EditorView } from "@codemirror/view";

export interface SqlAutocompleteWord {
  text: string;
  from: number;
  to: number;
}

export interface SqlAutocompleteTarget {
  word: SqlAutocompleteWord;
  prefix: SqlAutocompleteWord;
  qualifier: SqlAutocompleteWord | null;
  replaceFrom: number;
  replaceTo: number;
  query: string;
  anchor: number;
}

const IDENTIFIER_CHAR = /[A-Za-z0-9_]/;

export function detectCurrentWord(sql: string, cursor: number): SqlAutocompleteWord | null {
  if (!sql || cursor < 0 || cursor > sql.length) return null;

  let from = cursor;
  while (from > 0 && isIdentifierChar(sql[from - 1])) {
    from -= 1;
  }

  let to = cursor;
  while (to < sql.length && isIdentifierChar(sql[to])) {
    to += 1;
  }

  if (from === to) return null;
  return { text: sql.slice(from, to), from, to };
}

export function calculateAutocompleteTarget(sql: string, cursor: number): SqlAutocompleteTarget | null {
  const word = detectCurrentWord(sql, cursor);
  if (!word || cursor < word.from || cursor > word.to) return null;

  const prefix: SqlAutocompleteWord = {
    text: sql.slice(word.from, cursor),
    from: word.from,
    to: cursor,
  };

  if (!prefix.text) return null;

  const qualifier = findQualifier(sql, word.from);
  const query = qualifier ? `${qualifier.text}.${prefix.text}` : prefix.text;

  return {
    word,
    prefix,
    qualifier,
    replaceFrom: prefix.from,
    replaceTo: prefix.to,
    query,
    anchor: cursor,
  };
}

export function replaceAutocompleteRange(view: EditorView, target: SqlAutocompleteTarget, text: string): void {
  view.dispatch({
    changes: {
      from: target.replaceFrom,
      to: target.replaceTo,
      insert: text,
    },
    selection: { anchor: target.replaceFrom + text.length },
    scrollIntoView: true,
  });
}

export function resolveAutocompleteTarget(
  sql: string,
  cursor: number,
  fallbackTarget: SqlAutocompleteTarget | null,
): SqlAutocompleteTarget | null {
  const currentTarget = calculateAutocompleteTarget(sql, cursor);
  if (!fallbackTarget) {
    return currentTarget;
  }

  if (!currentTarget) {
    return fallbackTarget;
  }

  const sameQualifier = currentTarget.qualifier?.text === fallbackTarget.qualifier?.text;
  const currentInsideFallback = currentTarget.replaceFrom >= fallbackTarget.replaceFrom
    && currentTarget.replaceTo <= fallbackTarget.word.to;

  if (sameQualifier && currentInsideFallback) {
    return currentTarget;
  }

  return fallbackTarget;
}

function findQualifier(sql: string, wordFrom: number): SqlAutocompleteWord | null {
  const dotIndex = wordFrom - 1;
  if (dotIndex < 1 || sql[dotIndex] !== ".") return null;

  let end = dotIndex;
  let start = end;
  while (start > 0 && isIdentifierChar(sql[start - 1])) {
    start -= 1;
  }

  if (start === end) return null;
  return { text: sql.slice(start, end), from: start, to: end };
}

function isIdentifierChar(char: string | undefined): boolean {
  return !!char && IDENTIFIER_CHAR.test(char);
}

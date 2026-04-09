import fs from "node:fs";
import path from "node:path";
import type { AppError, TnsAliasEntry } from "@gavadb/types";

export function readTnsAliases(filePath: string): TnsAliasEntry[] {
  const normalizedPath = path.resolve(filePath.trim());
  if (!normalizedPath) {
    throw appError("QUERY_FAILED", "Select a valid tnsnames.ora file path.");
  }
  if (!fs.existsSync(normalizedPath)) {
    throw appError("OBJECT_NOT_FOUND", `TNS file not found: ${normalizedPath}`);
  }
  if (!fs.statSync(normalizedPath).isFile()) {
    throw appError("QUERY_FAILED", "The selected TNS path is not a file.");
  }

  const raw = fs.readFileSync(normalizedPath, "utf8");
  const entries = parseTnsnames(raw);
  if (entries.length === 0) {
    throw appError("QUERY_FAILED", "The selected tnsnames.ora does not contain any aliases.");
  }

  return entries;
}

export function parseTnsnames(raw: string): TnsAliasEntry[] {
  const source = stripComments(raw);
  const entries: TnsAliasEntry[] = [];
  let i = 0;

  while (i < source.length) {
    i = skipWhitespace(source, i);
    if (i >= source.length) break;

    const nameStart = i;
    while (i < source.length && source[i] !== "=" && source[i] !== "\n" && source[i] !== "\r") {
      i++;
    }
    if (i >= source.length || source[i] !== "=") {
      i++;
      continue;
    }

    const aliasChunk = source.slice(nameStart, i).trim();
    i++;
    i = skipWhitespace(source, i);

    if (source[i] !== "(") {
      continue;
    }

    const descriptorStart = i;
    let depth = 0;
    while (i < source.length) {
      const char = source[i];
      if (char === "(") depth++;
      if (char === ")") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
      i++;
    }

    const descriptor = source.slice(descriptorStart, i).trim();
    if (!descriptor || depth !== 0) {
      continue;
    }

    const aliases = aliasChunk
      .split(",")
      .map((alias) => alias.trim())
      .filter(Boolean)
      .map(stripWrappingQuotes);

    if (aliases.length === 0) {
      continue;
    }

    entries.push({
      name: aliases[0],
      aliases,
      descriptor,
    });
  }

  return entries;
}

export function resolveTnsAdmin(filePath: string): string {
  return path.dirname(path.resolve(filePath.trim()));
}

function stripComments(raw: string): string {
  return raw
    .replace(/^[ \t]*#.*$/gm, "")
    .replace(/^[ \t]*!.*$/gm, "")
    .replace(/^[ \t]*;.*$/gm, "");
}

function skipWhitespace(source: string, index: number): number {
  while (index < source.length && /\s/.test(source[index])) {
    index++;
  }
  return index;
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function appError(code: AppError["code"], message: string, details?: string): AppError {
  return { code, message, details };
}

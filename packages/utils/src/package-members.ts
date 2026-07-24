// Extração dos subprogramas (functions/procedures) declarados no corpo de um
// package PL/SQL, com o número da linha da declaração — usado para montar o
// outline navegável na sidebar. Função pura, sem dependência de runtime.

export interface PackageMember {
  name: string;
  kind: "function" | "procedure";
  /** Linha 1-based da declaração no corpo original passado a parsePackageMembers */
  line: number;
}

/**
 * Substitui comentários (`--` de linha e `/* *​/` de bloco) e literais string
 * (aspas simples) por espaços, preservando quebras de linha para que a
 * numeração de linhas do texto original seja mantida. Assim um `FUNCTION`
 * dentro de um comentário ou string não é confundido com uma declaração.
 * Identificadores entre aspas duplas do Oracle são preservados como código.
 */
function blankCommentsAndStrings(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;
  type State = "code" | "line" | "block" | "single";
  let state: State = "code";

  while (i < n) {
    const c = source[i];
    const c2 = i + 1 < n ? source[i + 1] : "";

    if (state === "code") {
      if (c === "-" && c2 === "-") {
        out += "  ";
        i += 2;
        state = "line";
        continue;
      }
      if (c === "/" && c2 === "*") {
        out += "  ";
        i += 2;
        state = "block";
        continue;
      }
      if (c === "'") {
        out += " ";
        i += 1;
        state = "single";
        continue;
      }
      out += c;
      i += 1;
      continue;
    }

    if (c === "\n") {
      out += "\n";
      i += 1;
      if (state === "line") state = "code";
      continue;
    }

    if (state === "line") {
      out += " ";
      i += 1;
      continue;
    }

    if (state === "block") {
      if (c === "*" && c2 === "/") {
        out += "  ";
        i += 2;
        state = "code";
        continue;
      }
      out += " ";
      i += 1;
      continue;
    }

    // state === "single"
    if (c === "'") {
      out += " ";
      i += 1;
      state = "code";
      continue;
    }
    out += " ";
    i += 1;
  }

  return out;
}

const MEMBER_DECL = /^\s*(function|procedure)\s+"?([a-z0-9_$#]+)"?/i;

/**
 * Extrai as functions e procedures declaradas no corpo de um package.
 * Conservador e baseado em linhas: reconhece uma declaração quando a linha
 * (já sem comentários/strings) começa com a palavra-chave FUNCTION ou
 * PROCEDURE seguida de um identificador. Subprogramas locais aninhados dentro
 * de outro subprograma também são capturados (limitação conhecida e aceita).
 */
export function parsePackageMembers(bodySource: string): PackageMember[] {
  if (!bodySource) return [];

  const sanitized = blankCommentsAndStrings(bodySource);
  const lines = sanitized.split(/\r?\n/);
  const members: PackageMember[] = [];

  for (let index = 0; index < lines.length; index++) {
    const match = MEMBER_DECL.exec(lines[index]);
    if (!match) continue;
    members.push({
      name: match[2],
      kind: match[1].toLowerCase() === "function" ? "function" : "procedure",
      line: index + 1,
    });
  }

  return members;
}

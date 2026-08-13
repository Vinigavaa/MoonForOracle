import { useCallback, useEffect, useRef } from "react";
import type { DatabaseObjectType, DatabaseObjectSummary } from "@gavadb/types";
import { parsePackageMembers, type PackageMember } from "@gavadb/utils";

const OBJECT_TYPES: readonly DatabaseObjectType[] = [
  "tables",
  "views",
  "packages",
  "procedures",
  "functions",
  "triggers",
];

type ObjectIndex = Map<string, DatabaseObjectSummary>;

/** Alvo de foco dentro do editor de código de um objeto (ex.: linha da
 *  declaração de um membro de package), retornado quando a referência
 *  resolvida aponta para um subprograma específico. */
export interface ResolvedObjectTarget {
  line: number;
  part: "spec" | "body";
}

export interface ResolvedObjectReference {
  type: DatabaseObjectType;
  name: string;
  target?: ResolvedObjectTarget;
}

function normalizeObjectName(name: string): string {
  const trimmed = name.trim();
  const objectPart = trimmed.includes(".") ? (trimmed.split(".").pop() ?? trimmed) : trimmed;
  return objectPart.replace(/^"+|"+$/g, "").toUpperCase();
}

export function useObjectResolver(isConnected: boolean) {
  const cacheRef = useRef<Partial<Record<DatabaseObjectType, ObjectIndex>>>({});
  const pendingRef = useRef<Partial<Record<DatabaseObjectType, Promise<ObjectIndex>>>>({});
  const packageMembersCacheRef = useRef<Map<string, PackageMember[]>>(new Map());
  const packageMembersPendingRef = useRef<Map<string, Promise<PackageMember[]>>>(new Map());

  useEffect(() => {
    if (!isConnected) {
      cacheRef.current = {};
      pendingRef.current = {};
      packageMembersCacheRef.current = new Map();
      packageMembersPendingRef.current = new Map();
    }
  }, [isConnected]);

  const loadType = useCallback(async (type: DatabaseObjectType): Promise<ObjectIndex> => {
    const cached = cacheRef.current[type];
    if (cached) return cached;

    const pending = pendingRef.current[type];
    if (pending) return pending;

    const request = window.gavadb.dbListObjects(type).then((result) => {
      if (!result.success) {
        throw new Error(result.error.message);
      }

      const index: ObjectIndex = new Map();
      for (const object of result.data) {
        index.set(normalizeObjectName(object.name), object);
      }

      cacheRef.current[type] = index;
      delete pendingRef.current[type];
      return index;
    }).catch((error) => {
      delete pendingRef.current[type];
      throw error;
    });

    pendingRef.current[type] = request;
    return request;
  }, []);

  // Subprogramas (functions/procedures) declarados no corpo de um package —
  // usado para localizar a linha exata de "PKG.MEMBRO" ao resolver a
  // referência clicada (navegação encadeada Ctrl+Click estilo Go to Definition).
  const loadPackageMembers = useCallback(async (packageName: string): Promise<PackageMember[]> => {
    const cached = packageMembersCacheRef.current.get(packageName);
    if (cached) return cached;

    const pending = packageMembersPendingRef.current.get(packageName);
    if (pending) return pending;

    const request = window.gavadb.dbGetSource("packages", packageName).then((result) => {
      const bodySource = result.success && result.data.kind === "source"
        ? result.data.tabs.find((tab) => tab.id === "body")?.source ?? ""
        : "";
      const members = parsePackageMembers(bodySource);
      packageMembersCacheRef.current.set(packageName, members);
      packageMembersPendingRef.current.delete(packageName);
      return members;
    }).catch(() => {
      packageMembersPendingRef.current.delete(packageName);
      return [];
    });

    packageMembersPendingRef.current.set(packageName, request);
    return request;
  }, []);

  const resolveObject = useCallback(async (name: string): Promise<ResolvedObjectReference | null> => {
    const trimmed = name.trim();
    if (!trimmed) return null;

    // Referência qualificada (ex.: PKG_ARRECADACAO.SP_FATURA): se o
    // qualificador for um package conhecido, localiza o membro no corpo dele
    // para focar diretamente na declaração, em vez de apenas abrir o package.
    const dotIndex = trimmed.lastIndexOf(".");
    if (dotIndex > 0) {
      const qualifierNormalized = normalizeObjectName(trimmed.slice(0, dotIndex));
      const memberNormalized = normalizeObjectName(trimmed.slice(dotIndex + 1));

      if (qualifierNormalized && memberNormalized) {
        const packagesIndex = await loadType("packages");
        const pkgMatch = packagesIndex.get(qualifierNormalized);
        if (pkgMatch) {
          const members = await loadPackageMembers(pkgMatch.name);
          const member = members.find((item) => normalizeObjectName(item.name) === memberNormalized);
          return {
            type: "packages",
            name: pkgMatch.name,
            target: member ? { line: member.line, part: "body" } : undefined,
          };
        }
      }
    }

    const normalized = normalizeObjectName(name);
    if (!normalized) return null;

    const searchResult = await window.gavadb.dbSearchObjects(normalized, 20);
    if (searchResult.success) {
      const exactMatch = searchResult.data.find((item) => normalizeObjectName(item.name) === normalized);
      if (exactMatch) {
        return { type: exactMatch.type, name: exactMatch.name };
      }
    }

    for (const type of OBJECT_TYPES) {
      const index = await loadType(type);
      const match = index.get(normalized);
      if (match) {
        return { type, name: match.name };
      }
    }

    return null;
  }, [loadPackageMembers, loadType]);

  return { resolveObject };
}

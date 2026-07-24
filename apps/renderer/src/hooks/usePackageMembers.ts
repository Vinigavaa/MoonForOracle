import { useCallback, useEffect, useState } from "react";
import { parsePackageMembers, type PackageMember } from "@gavadb/utils";

export interface PackageMembersState {
  members: PackageMember[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
}

const EMPTY_MEMBERS: PackageMembersState = { members: [], loading: false, error: null, loaded: false };

/**
 * Carrega e memoiza (por sessão) a lista de subprogramas de cada package.
 * A lista é derivada do corpo do package retornado por `dbGetSource`, então a
 * linha reportada de cada membro bate com o texto exibido no editor.
 */
export function usePackageMembers(isConnected: boolean) {
  const [byName, setByName] = useState<Record<string, PackageMembersState>>({});

  useEffect(() => {
    if (!isConnected) setByName({});
  }, [isConnected]);

  const load = useCallback(async (name: string) => {
    setByName((prev) => ({ ...prev, [name]: { ...EMPTY_MEMBERS, loading: true } }));
    try {
      const result = await window.gavadb.dbGetSource("packages", name);
      if (result.success) {
        const detail = result.data;
        const bodySource = detail.kind === "source"
          ? detail.tabs.find((tab) => tab.id === "body")?.source ?? ""
          : "";
        setByName((prev) => ({
          ...prev,
          [name]: { members: parsePackageMembers(bodySource), loading: false, error: null, loaded: true },
        }));
      } else {
        setByName((prev) => ({
          ...prev,
          [name]: { members: [], loading: false, error: result.error.message, loaded: true },
        }));
      }
    } catch (err) {
      setByName((prev) => ({
        ...prev,
        [name]: { members: [], loading: false, error: String(err), loaded: true },
      }));
    }
  }, []);

  const get = useCallback((name: string): PackageMembersState => byName[name] ?? EMPTY_MEMBERS, [byName]);

  return { get, load };
}

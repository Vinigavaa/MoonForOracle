import { useCallback, useEffect, useRef, useState } from "react";
import type { DatabaseObjectType, ObjectDetailResponse } from "@gavadb/types";

interface ObjectDetailState {
  detail: ObjectDetailResponse | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

export function useObjectDetail(objectType: DatabaseObjectType, objectName: string): ObjectDetailState {
  const [detail, setDetail] = useState<ObjectDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef(0);

  const fetch = useCallback(() => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    setDetail(null);

    void (async () => {
      try {
        const result = await window.gavadb.dbGetSource(objectType, objectName);
        if (requestRef.current !== requestId) return;

        if (result.success) {
          setDetail(result.data);
        } else {
          setError(result.error.message + (result.error.details ? "\n" + result.error.details : ""));
        }
      } catch (err) {
        if (requestRef.current !== requestId) return;
        setError(String(err));
      } finally {
        if (requestRef.current === requestId) {
          setLoading(false);
        }
      }
    })();
  }, [objectType, objectName]);

  useEffect(() => { fetch(); }, [fetch]);

  return { detail, error, loading, reload: fetch };
}

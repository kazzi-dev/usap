"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiRequestError } from "./api";

interface ApiState<T> {
  data: T | null;
  error: ApiRequestError | null;
  loading: boolean;
  reload: () => void;
}

/** GET an API path (or nothing, when `path` is null) and keep the result in state. */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    api<T>(path).then(
      (result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiRequestError ? err : new ApiRequestError(0, String(err)));
        setLoading(false);
      },
    );
    // Ignore a slow response that arrives after the path changed or we unmounted.
    return () => {
      cancelled = true;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, reload };
}

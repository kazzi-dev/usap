import type { ApiError } from "@usap/shared";
import { clearSession, getSession } from "./session";
import { getSignalUrl } from "./signal";

/** An API call that failed; `fields` holds per-field form errors. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

/**
 * Calls the backend API (the signal server's /api routes). Adds the session
 * token when logged in. A 401 means the session ended (expired or logged out
 * elsewhere), so the local session is cleared too.
 */
export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const session = getSession();
  let res: Response;
  try {
    res = await fetch(`${getSignalUrl()}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiRequestError(0, "Can't reach the server. Is it running?");
  }

  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as T & Partial<ApiError>;
  if (!res.ok) {
    if (res.status === 401 && session) clearSession();
    throw new ApiRequestError(res.status, body.error ?? `Request failed (${res.status})`, body.fields);
  }
  return body;
}

/**
 * Fetch wrapper that always sends the session cookie.
 *
 * On non-2xx responses, throws an `ApiError` carrying the parsed body so
 * callers can react to validation errors and friendly server messages.
 */

const BASE = "/api";

export class ApiError extends Error {
  constructor(status, body) {
    const message =
      (body && (body.detail || body.message || body.error)) ||
      `API error ${status}`;
    super(typeof message === "string" ? message : `API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

/**
 * Generic fetch wrapper.
 *
 * @param {string} path - Path under /api (e.g. "/auth/me").
 * @param {object} [opts]
 * @param {string} [opts.method="GET"]
 * @param {object|null} [opts.body] - JSON-serializable body.
 * @param {Record<string,string>} [opts.headers]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<any>} Parsed JSON body (or null for 204).
 */
export async function api(
  path,
  { method = "GET", body, headers = {}, signal } = {}
) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
    },
    body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
    signal,
  });

  if (res.status === 204) return null;

  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    throw new ApiError(res.status, parsed);
  }
  return parsed;
}

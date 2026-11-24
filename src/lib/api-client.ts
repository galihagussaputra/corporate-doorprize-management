export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({ ok: false, error: "Invalid server response" }));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? `Request failed (${response.status})`);
  }
  return payload.data as T;
}

export const post = <T>(url: string, body?: unknown) =>
  apiFetch<T>(url, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const patch = <T>(url: string, body: unknown) =>
  apiFetch<T>(url, { method: "PATCH", body: JSON.stringify(body) });

export const del = <T>(url: string) => apiFetch<T>(url, { method: "DELETE" });

/** Typed SWR fetchers — explicit generics keep useSWR<T> fully type-safe. */
export const swrFetcher = <T,>(url: string): Promise<T> => apiFetch<T>(url);
export const swrPostFetcher = <T,>(url: string): Promise<T> =>
  apiFetch<T>(url, { method: "POST", body: JSON.stringify({}) });

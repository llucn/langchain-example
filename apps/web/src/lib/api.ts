import { API_PREFIX } from '@app/shared';

export type TokenGetter = () => string | undefined;

let getToken: TokenGetter = () => undefined;

/** Registered by AuthProvider so API calls carry the current access token. */
export function setTokenGetter(fn: TokenGetter) {
  getToken = fn;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`/${API_PREFIX}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

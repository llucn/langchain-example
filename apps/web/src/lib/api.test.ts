import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, setTokenGetter } from './api';

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setTokenGetter(() => undefined);
  });

  it('prefixes /api and sends the bearer token', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal('fetch', fetchMock);
    setTokenGetter(() => 'tok');

    await expect(apiFetch('/health')).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/health');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('throws on non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response('', { status: 503, statusText: 'Unavailable' }),
    );
    await expect(apiFetch('/health')).rejects.toThrow('503');
  });
});

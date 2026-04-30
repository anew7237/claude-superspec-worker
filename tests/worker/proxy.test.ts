import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { getEnv } from './_helpers.ts';

describe('ALL /app-api/* reverse proxy (contracts/reverse-proxy.md §3 + §7)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('passes through 2xx body and status (happy path)', async () => {
    // Use mockImplementation (not mockResolvedValue) so the Response is
    // constructed when fetch() is called inside the worker handler — i.e.
    // bound to the handler's request scope, not the test fixture's scope.
    // Workers runtime forbids reading a Response body across request scopes.
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const res = await SELF.fetch('http://example.com/app-api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledOnce();
    const calledUrl = fetchMock.mock.calls[0]?.[0] as Request | string;
    const url = typeof calledUrl === 'string' ? calledUrl : calledUrl.url;
    expect(url).toBe('http://localhost:8000/app-api/health');
  });

  it('passes through 4xx body and status', async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: 'upstream_specific_error' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const res = await SELF.fetch('http://example.com/app-api/echo?k=missing');
    expect(res.status).toBe(404);
    // Distinct error code so a Hono notFound (which returns {error:"not_found"})
    // cannot accidentally satisfy this assertion. Confirms upstream body passthrough.
    expect(await res.json()).toEqual({ error: 'upstream_specific_error' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('returns 503 upstream_not_configured when UPSTREAM_URL is empty', async () => {
    // Override env binding for this test only; restore in finally.
    const e = getEnv();
    const original = e.UPSTREAM_URL;
    e.UPSTREAM_URL = '';

    try {
      const res = await SELF.fetch('http://example.com/app-api/anything');
      expect(res.status).toBe(503);
      const body = (await res.json()) as { error: string; hint?: string };
      expect(body.error).toBe('upstream_not_configured');
      expect(body.hint).toMatch(/UPSTREAM_URL/);
    } finally {
      e.UPSTREAM_URL = original;
    }
  });

  it('returns 504 upstream_timeout on AbortError', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'));

    const res = await SELF.fetch('http://example.com/app-api/health');
    expect(res.status).toBe(504);
    const body = (await res.json()) as { error: string; hint?: string };
    expect(body.error).toBe('upstream_timeout');
    expect(body.hint).toMatch(/10000ms/);
  });

  it('returns 502 upstream_unreachable on network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('connection refused'));

    const res = await SELF.fetch('http://example.com/app-api/health');
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('upstream_unreachable');
  });

  it('preserves path and query string in target URL (no prefix strip)', async () => {
    fetchMock.mockImplementation(async () => new Response('', { status: 200 }));

    await SELF.fetch('http://example.com/app-api/echo?k=foo&q=bar');

    expect(fetchMock).toHaveBeenCalledOnce();
    const calledUrl = fetchMock.mock.calls[0]?.[0] as Request | string;
    const url = typeof calledUrl === 'string' ? calledUrl : calledUrl.url;
    expect(url).toBe('http://localhost:8000/app-api/echo?k=foo&q=bar');
  });
});

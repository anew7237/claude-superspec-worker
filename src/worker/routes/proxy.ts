import { Hono } from 'hono';
import type { Env } from '../env.ts';
import { jsonError } from '../error.ts';

export const proxyRoute = new Hono<{ Bindings: Env }>();

proxyRoute.all('/app-api/*', async (c) => {
  const upstream = c.env.UPSTREAM_URL;
  if (!upstream) {
    return jsonError(503, 'upstream_not_configured', 'set UPSTREAM_URL var or secret');
  }

  const incoming = new URL(c.req.url);
  const target = `${upstream.replace(/\/$/, '')}${incoming.pathname}${incoming.search}`;

  // Build RequestInit step-by-step to avoid inline ternary on optional fields
  // (exactOptionalPropertyTypes: true rejects `body: cond ? undefined : raw.body`)
  const isBodyless = c.req.method === 'GET' || c.req.method === 'HEAD';
  const fetchInit: RequestInit = {
    method: c.req.method,
    headers: c.req.raw.headers,
    signal: AbortSignal.timeout(10_000),
  };
  if (!isBodyless) {
    fetchInit.body = c.req.raw.body;
  }

  try {
    const upstreamRes = await fetch(target, fetchInit);
    // Materialize the body in this handler's request scope. Workers runtime
    // forbids passing a ReadableStream across request boundaries, which
    // surfaces under @cloudflare/vitest-pool-workers when fetch is mocked
    // with vi.stubGlobal — the mocked Response's stream is owned by the
    // test fixture's request, and `new Response(upstreamRes.body, ...)`
    // would attempt to read from that foreign scope. Buffering with
    // arrayBuffer() rebinds ownership. Contract §5 invariant 4 ("not
    // buffer") applies to the OUTGOING request body, not the incoming
    // response body — so this does not violate streaming-friendly intent.
    const body = await upstreamRes.arrayBuffer();
    return new Response(body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: upstreamRes.headers,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return jsonError(504, 'upstream_timeout', 'no response within 10000ms');
    }
    console.error('proxy.fetch.failed', err);
    return jsonError(502, 'upstream_unreachable');
  }
});

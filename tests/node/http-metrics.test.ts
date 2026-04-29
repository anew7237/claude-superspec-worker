import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { app } from '../../src/node/app.ts';
import { register } from '../../src/node/metrics.ts';
import { logger } from '../../src/node/logger.ts';

describe('HTTP middleware metrics (US1)', () => {
  it('counter basics: http_requests_total increments per request', async () => {
    const N = 3;
    for (let i = 0; i < N; i++) {
      const res = await app.request('/');
      expect(res.status).toBe(200);
    }
    const metricsRes = await app.request('/metrics');
    expect(metricsRes.status).toBe(200);
    const body = await metricsRes.text();
    // Match an integer counter value >= N for route="/" GET 200
    const re =
      /^http_requests_total\{method="GET",route="\/",status_code="200"\}\s+(\d+)/m;
    const match = body.match(re);
    expect(match, `expected counter sample in body, got:\n${body}`).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(N);
  });

  it('histogram basics: _count, _sum, and buckets populated', async () => {
    const N = 2;
    for (let i = 0; i < N; i++) {
      const res = await app.request('/');
      expect(res.status).toBe(200);
    }
    const metricsRes = await app.request('/metrics');
    const body = await metricsRes.text();

    // _count line
    const countRe =
      /^http_request_duration_seconds_count\{method="GET",route="\/",status_code="200"\}\s+(\d+)/m;
    const countMatch = body.match(countRe);
    expect(countMatch, `expected _count sample, got:\n${body}`).not.toBeNull();
    expect(Number(countMatch![1])).toBeGreaterThanOrEqual(N);

    // _sum line > 0
    const sumRe =
      /^http_request_duration_seconds_sum\{method="GET",route="\/",status_code="200"\}\s+([\d.eE+-]+)/m;
    const sumMatch = body.match(sumRe);
    expect(sumMatch, `expected _sum sample, got:\n${body}`).not.toBeNull();
    expect(Number(sumMatch![1])).toBeGreaterThan(0);

    // At least one _bucket line with value >= N. prom-client serializes
    // labels in insertion order with `le` placed first for histogram buckets,
    // so match leniently on label presence rather than order.
    const bucketRe =
      /^http_request_duration_seconds_bucket\{[^}]*le="[^"]+"[^}]*method="GET"[^}]*route="\/"[^}]*status_code="200"[^}]*\}\s+(\d+)/gm;
    const bucketValues = [...body.matchAll(bucketRe)].map((m) => Number(m[1]));
    expect(bucketValues.length, 'expected at least one bucket line').toBeGreaterThan(0);
    const anyBucketCoversN = bucketValues.some((v) => v >= N);
    expect(
      anyBucketCoversN,
      `expected at least one bucket >= ${N}, got ${JSON.stringify(bucketValues)}`,
    ).toBe(true);
  });

  it('route label templating: /health is recorded as route="/health"', async () => {
    const res = await app.request('/health');
    // /health may return 200 or 503 depending on db/redis; we only care route label here.
    expect([200, 503]).toContain(res.status);

    const metricsRes = await app.request('/metrics');
    const body = await metricsRes.text();
    const re =
      /^http_requests_total\{method="GET",route="\/health",status_code="(200|503)"\}\s+\d+/m;
    expect(
      body.match(re),
      `expected /health sample with exact route label, got:\n${body}`,
    ).not.toBeNull();
  });

  it('not_found fallback: unmatched path records route="not_found" status_code="404"', async () => {
    const res = await app.request('/nonexistent-route-xyz');
    expect(res.status).toBe(404);

    const metricsRes = await app.request('/metrics');
    const body = await metricsRes.text();
    const re =
      /^http_requests_total\{method="GET",route="not_found",status_code="404"\}\s+\d+/m;
    expect(
      body.match(re),
      `expected not_found sample, got:\n${body}`,
    ).not.toBeNull();
  });

  it('R5: /metrics scrape is not recorded in http_* series', async () => {
    for (let i = 0; i < 3; i++) {
      await app.request('/metrics');
    }
    const metricsRes = await app.request('/metrics');
    const body = await metricsRes.text();
    const re = /^http_requests_total\{[^}]*route="\/metrics"[^}]*\}/m;
    expect(
      body.match(re),
      `route="/metrics" must not appear in http_requests_total (R5 / Edge Cases / contracts):\n${body}`,
    ).toBeNull();
  });

  it('factory idempotency: httpMetrics() can be invoked again without throwing', async () => {
    const { httpMetrics } = await import('../../src/node/http-metrics.ts');
    expect(() => httpMetrics()).not.toThrow();
    const mw = httpMetrics();
    expect(typeof mw).toBe('function');
  });

  it('FR-005(a): matched handler returning 404 records actual route template (not not_found)', async () => {
    const { httpMetrics } = await import('../../src/node/http-metrics.ts');
    const subApp = new Hono();
    subApp.use('/*', httpMetrics({ mountPattern: '/*' }));
    subApp.get('/items/:id', (c) => c.json({ error: 'not found' }, 404));

    const res = await subApp.request('/items/99');
    expect(res.status).toBe(404);

    const body = await register.metrics();
    const hit = body.match(
      /^http_requests_total\{method="GET",route="\/items\/:id",status_code="404"\}\s+\d+/m,
    );
    expect(
      hit,
      `REST 'item not found' pattern must label route as the matched template '/items/:id', ` +
        `not 'not_found' (FR-005 (a) distinguishes matched-with-404 from unmatched-404). body:\n${body}`,
    ).not.toBeNull();
  });

  it('FR-014: startup probe emits no warning when Hono routePath API is available', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    warnSpy.mockClear();
    const { httpMetrics } = await import('../../src/node/http-metrics.ts');
    httpMetrics({ mountPattern: '/*' });
    // Allow the fire-and-forget probe Promise to resolve before asserting.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(warnSpy, 'FR-014 warn must NOT fire on a healthy Hono installation').not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('FR-005(c): custom mount pattern still detects unmatched routes as not_found', async () => {
    const { httpMetrics } = await import('../../src/node/http-metrics.ts');
    const subApp = new Hono();
    subApp.use('/api/*', httpMetrics({ mountPattern: '/api/*' }));

    const countBefore = await (async () => {
      const m = (await register.metrics()).match(
        /^http_requests_total\{method="GET",route="not_found",status_code="404"\}\s+(\d+)/m,
      );
      return m ? Number(m[1]) : 0;
    })();

    const res = await subApp.request('/api/nonexistent');
    expect(res.status).toBe(404);

    const body = await register.metrics();
    const m = body.match(
      /^http_requests_total\{method="GET",route="not_found",status_code="404"\}\s+(\d+)/m,
    );
    expect(m, `expected not_found sample after hitting /api/nonexistent, got:\n${body}`).not.toBeNull();
    expect(
      Number(m![1]),
      'not_found counter should strictly increase after unmatched /api/* request',
    ).toBeGreaterThan(countBefore);
  });
});

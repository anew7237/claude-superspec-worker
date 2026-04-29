import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { register } from '../../src/node/metrics.ts';
import { httpMetrics } from '../../src/node/http-metrics.ts';

/**
 * Regression test locking in FR-006 + SC-004:
 *   "Any new HTTP route registered after `httpMetrics()` middleware is mounted
 *    must automatically appear in `/metrics` output with route=<template path>,
 *    method, status_code labels — no per-route opt-in required."
 *
 * This is the auto-inheritance contract that lets adopters fork the template,
 * add their own routes, and get observability for free.
 *
 * Strategy: stand up a fresh Hono app (NOT the one in src/app.ts), mount the
 * middleware, then register a route name (`/__regression__/:id`) that does not
 * exist anywhere else in the codebase. Hit it once, scrape /metrics, and
 * verify both the counter and histogram series carry the expected labels.
 *
 * If this test ever breaks, FR-006 / SC-004 has regressed in src/http-metrics.ts.
 */
describe('http-metrics regression — SC-004 / FR-006', () => {
  it('dynamically registered routes auto-inherit counter + histogram metrics', async () => {
    register.resetMetrics();

    // Fresh app instance — mounts middleware then a brand-new route that
    // didn't exist in src/app.ts. This simulates an adopter adding a route
    // after taking the template — should auto-inherit metrics.
    const app = new Hono();
    const MOUNT = '/*';
    app.use(MOUNT, httpMetrics({ mountPattern: MOUNT }));
    app.get('/__regression__/:id', (c) => c.json({ id: c.req.param('id') }, 200));

    // Hit the new route
    const res = await app.fetch(new Request('http://x/__regression__/42'));
    expect(res.status).toBe(200);

    // Scrape /metrics body
    const body = await register.metrics();

    // Must see http_requests_total + http_request_duration_seconds samples for /__regression__/:id
    expect(body).toMatch(/http_requests_total\{[^}]*method="GET"[^}]*\}/);
    expect(body).toMatch(/http_requests_total\{[^}]*route="\/__regression__\/:id"[^}]*\}/);
    expect(body).toMatch(/http_requests_total\{[^}]*status_code="200"[^}]*\}/);
    expect(body).toMatch(/http_request_duration_seconds_bucket\{[^}]*route="\/__regression__\/:id"[^}]*\}/);
  });
});

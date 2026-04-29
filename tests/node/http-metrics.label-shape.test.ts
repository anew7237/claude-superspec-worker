import { describe, it, expect } from 'vitest';
import { Counter, Histogram, register } from 'prom-client';
import { httpMetrics } from '../../src/node/http-metrics.ts';

/**
 * I-2 regression guard (review-20260425-wsl.md): the factory's idempotent
 * lookup-or-create pattern correctly reuses an existing metric on name match,
 * but must fail loudly — not silently reuse — when the existing metric has
 * incompatible labelNames. A silent reuse would defer the error to the first
 * `counter.inc(...)` call inside the middleware's `finally` block, where the
 * throw propagates past Hono with no clear adopter-facing diagnostic.
 *
 * This file uses an isolated Vitest worker (per-file default) so register
 * mutations don't leak into the primary suites.
 */
describe('httpMetrics factory — label shape validation (I-2)', () => {
  it('throws with a clear message when http_requests_total already registered with wrong labelNames', () => {
    register.clear();
    new Counter({
      name: 'http_requests_total',
      help: 'adopter-owned metric with different labelset',
      labelNames: ['foo', 'bar'],
      registers: [register],
    });

    expect(() => httpMetrics()).toThrow(
      /http_requests_total.*labelNames|labelNames.*http_requests_total/,
    );

    register.clear();
  });

  it('throws with a clear message when http_request_duration_seconds already registered with wrong labelNames', () => {
    register.clear();
    // Register the counter correctly so the histogram path is the one under test.
    new Counter({
      name: 'http_requests_total',
      help: 'correct counter',
      labelNames: ['method', 'route', 'status_code'],
      registers: [register],
    });
    new Histogram({
      name: 'http_request_duration_seconds',
      help: 'adopter-owned histogram with different labelset',
      labelNames: ['baz', 'qux'],
      registers: [register],
    });

    expect(() => httpMetrics()).toThrow(
      /http_request_duration_seconds.*labelNames|labelNames.*http_request_duration_seconds/,
    );

    register.clear();
  });
});

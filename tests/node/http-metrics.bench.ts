import { bench, describe } from 'vitest';
import { Hono } from 'hono';
import { register } from 'prom-client';
import { httpMetrics } from '../../src/node/http-metrics.ts';

/**
 * SC-007 bench: measure per-request overhead of `httpMetrics()` middleware
 * against a baseline Hono app with no middleware, using Vitest's `bench()`
 * (backed by tinybench). Both cases run an identical single handler
 * (`c.text('x')`) on the same Hono version, driven in-process via
 * `app.request('/')` — the only difference between cases is the middleware
 * registration.
 *
 * This file produces human-readable `pnpm bench` output. The automated
 * SC-007 hybrid-dual-threshold gate (absolute ≤100μs OR relative ≤20%)
 * lives in `tests/http-metrics.sc007.test.ts` — Vitest's bench mode does
 * not fire `afterAll` in a way that propagates expect() failures to
 * the process exit code, so the assertion cannot live here.
 *
 * Threshold (SC-007, amended 2026-04-24 dual): absolute p99(on) - p99(off) ≤ 100μs OR relative p99(on)/p99(off) - 1 ≤ 0.20.
 *
 * Notes:
 * - Vitest runs each test/bench file in its own worker by default, so the
 *   factory call here does not collide with `src/app.ts`'s factory call in
 *   `tests/http-metrics.test.ts`. As belt-and-suspenders we `register.clear()`
 *   before creating the middleware to avoid duplicate-registration errors if
 *   the isolation assumption ever fails (e.g. pool=threads mode).
 * - Baseline and enabled apps use fresh Hono instances — we deliberately do
 *   NOT reuse the main `src/app.ts` to isolate the middleware cost from
 *   db/redis module import side-effects.
 * - N=1000 iterations per case per spec SC-007. Vitest/tinybench also runs
 *   warmup iterations (default 5) and enforces a time budget (default 500ms).
 */
describe('httpMetrics overhead (SC-007)', () => {
  // Belt-and-suspenders: clear the prom-client default register before
  // instantiating middleware metric objects in this worker.
  register.clear();

  const appOff = new Hono();
  appOff.get('/', (c) => c.text('x'));

  const appOn = new Hono();
  appOn.use('/*', httpMetrics({ mountPattern: '/*' }));
  appOn.get('/', (c) => c.text('x'));

  bench(
    'baseline (middleware off)',
    async () => {
      await appOff.request('/');
    },
    { iterations: 1000 },
  );

  bench(
    'enabled (middleware on)',
    async () => {
      await appOn.request('/');
    },
    { iterations: 1000 },
  );
});

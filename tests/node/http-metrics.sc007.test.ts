import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { register } from 'prom-client';
import { httpMetrics } from '../../src/node/http-metrics.ts';

/**
 * SC-007 automated gate — hybrid dual threshold from spec 2026-04-24 amendment:
 *   absolute p99(on) − p99(off) ≤ 100μs   OR
 *   relative p99(on) / p99(off) − 1 ≤ 0.20
 *
 * Vitest's `bench()` API (see `http-metrics.bench.ts`) produces readable
 * stdout but does not surface assertion failures to the `pnpm bench` exit
 * code (afterAll doesn't propagate in bench mode). This file runs the same
 * measurement via a tiny in-file `measure()` helper inside a regular `it()`
 * so `pnpm test` catches SC-007 regressions automatically in CI.
 */

async function measure(fn: () => Promise<void>, iterations: number, warmup: number) {
  for (let i = 0; i < warmup; i++) await fn();
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const p99 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.99))];
  return { p99Ms: p99, samples };
}

describe('SC-007: httpMetrics overhead gate (hybrid dual threshold)', () => {
  it('p99 delta satisfies absolute ≤100μs OR relative ≤20%', async () => {
    register.clear();

    const appOff = new Hono();
    appOff.get('/', (c) => c.text('x'));

    const appOn = new Hono();
    appOn.use('/*', httpMetrics({ mountPattern: '/*' }));
    appOn.get('/', (c) => c.text('x'));

    const iterations = 1000;
    const warmup = 100;

    const off = await measure(
      async () => {
        await appOff.request('/');
      },
      iterations,
      warmup,
    );

    const on = await measure(
      async () => {
        await appOn.request('/');
      },
      iterations,
      warmup,
    );

    const absDeltaMs = on.p99Ms - off.p99Ms;
    const relDelta = on.p99Ms / off.p99Ms - 1;
    const pass = absDeltaMs <= 0.1 || relDelta <= 0.2;

    expect(
      pass,
      `SC-007 failed: p99(off)=${(off.p99Ms * 1000).toFixed(1)}μs ` +
        `p99(on)=${(on.p99Ms * 1000).toFixed(1)}μs ` +
        `abs Δ=${(absDeltaMs * 1000).toFixed(1)}μs ` +
        `rel Δ=${(relDelta * 100).toFixed(1)}% ` +
        `(need abs≤100μs OR rel≤20%)`,
    ).toBe(true);
  }, 30_000);
});

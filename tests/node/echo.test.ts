import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/node/app.ts';
import { register } from '../../src/node/metrics.ts';

describe('GET /echo - happy path (US1)', () => {
  it('returns 200 + {message:"hello"} for ?msg=hello', async () => {
    const res = await app.request('/echo?msg=hello');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ message: 'hello' });
  });

  it('decodes URL-encoded space (?msg=hello%20world)', async () => {
    const res = await app.request('/echo?msg=hello%20world');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello world' });
  });

  it('decodes URL-encoded UTF-8 (?msg=%E4%BD%A0%E5%A5%BD)', async () => {
    const res = await app.request('/echo?msg=%E4%BD%A0%E5%A5%BD');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: '你好' });
  });
});

describe('GET /echo - missing msg (US2)', () => {
  it('returns 400 + {error:"missing msg"} for /echo with no query', async () => {
    const res = await app.request('/echo');
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ error: 'missing msg' });
  });

  it('returns 400 + {error:"missing msg"} for empty value (?msg=)', async () => {
    const res = await app.request('/echo?msg=');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'missing msg' });
  });

  it('takes the first value when msg is repeated (?msg=a&msg=b)', async () => {
    const res = await app.request('/echo?msg=a&msg=b');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'a' });
  });
});

describe('GET /echo - metrics inheritance (US3)', () => {
  // The shared `register` is process-global. Other test files (and the prior
  // suites in this file) may have already populated `route="/echo"` samples.
  // We snapshot before/after this suite's request and assert the counter
  // increased — robust to any pre-existing samples without resetting state
  // that other suites depend on.
  let baseline: number;

  beforeEach(async () => {
    baseline = await readEchoSuccessCounter();
  });

  afterEach(() => {
    // No reset — keep registry intact for downstream suites.
  });

  it('inherits per-route counter for /echo automatically (no explicit wiring)', async () => {
    await app.request('/echo?msg=metrics-probe');
    const after = await readEchoSuccessCounter();
    expect(after).toBeGreaterThan(baseline);
  });
});

/**
 * Read the current value of `http_requests_total{method="GET", route="/echo",
 * status_code="200"}` from the shared prom-client register. Returns 0 when no
 * matching sample exists yet (e.g. fresh process before any /echo hit).
 *
 * Implemented via `register.metrics()` text scrape (rather than reaching into
 * the Counter instance) to mirror the public observability surface used by
 * Prometheus scrapers — what the production /metrics endpoint exposes is what
 * we assert on.
 */
async function readEchoSuccessCounter(): Promise<number> {
  const text = await register.metrics();
  const line = text
    .split('\n')
    .find(
      (l) =>
        l.startsWith('http_requests_total{') &&
        l.includes('method="GET"') &&
        l.includes('route="/echo"') &&
        l.includes('status_code="200"'),
    );
  if (!line) return 0;
  const match = line.match(/\}\s+([0-9.]+)/);
  return match ? Number(match[1]) : 0;
}

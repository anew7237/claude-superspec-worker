import { describe, it, expect, vi } from 'vitest';

// Skeleton mocks for db / redis: /app-api/health does not require either,
// but Phase 5 (T030) extends this file with /app-api/now (db) and
// /app-api/echo (redis) cases. Wiring the mocks here keeps the import
// surface stable so T030 only adds describe blocks, not imports.
vi.mock('../../src/node/db.ts', () => ({
  pool: { query: vi.fn() },
}));
vi.mock('../../src/node/redis.ts', () => ({
  redis: { get: vi.fn(), ping: vi.fn() },
}));

const { app } = await import('../../src/node/app.ts');

describe('Node /app-api routes', () => {
  it('GET /app-api/health → 200 with nodejs service', async () => {
    const res = await app.request('/app-api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok', service: 'nodejs' });
  });

  // Phase 5 (T030) added:
  //   - GET /app-api/now happy path (pool.query mock returns rows)
  //   - GET /app-api/now pg_empty_result (pool.query returns rows: [])
  //   - GET /app-api/echo happy / missing-param / miss
});

describe('GET /app-api/now', () => {
  it('returns 200 with postgres-sourced timestamp (happy)', async () => {
    const { pool } = await import('../../src/node/db.ts');
    vi.mocked(pool).query.mockResolvedValue({
      rows: [{ now: '2026-04-30T10:00:00.000Z' }],
    } as never);

    const res = await app.request('/app-api/now');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ source: 'postgres', now: '2026-04-30T10:00:00.000Z' });
  });

  it('returns 500 pg_empty_result when query yields no rows', async () => {
    const { pool } = await import('../../src/node/db.ts');
    vi.mocked(pool).query.mockResolvedValue({ rows: [] } as never);

    const res = await app.request('/app-api/now');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'pg_empty_result' });
  });
});

describe('GET /app-api/echo', () => {
  it('returns 400 missing_param when k is missing', async () => {
    const res = await app.request('/app-api/echo');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('missing_param');
    expect(body.hint).toMatch(/k query/);
  });

  it('returns 200 with redis value when key hits', async () => {
    const { redis } = await import('../../src/node/redis.ts');
    vi.mocked(redis).get.mockResolvedValue('hello-from-redis');

    const res = await app.request('/app-api/echo?k=foo');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      source: 'redis',
      key: 'foo',
      value: 'hello-from-redis',
    });
  });

  it('returns 404 not_found when key misses', async () => {
    const { redis } = await import('../../src/node/redis.ts');
    vi.mocked(redis).get.mockResolvedValue(null);

    const res = await app.request('/app-api/echo?k=missing');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });
});

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/node/db.ts', () => ({
  pool: { query: vi.fn() },
}));
vi.mock('../../src/node/redis.ts', () => ({
  redis: { ping: vi.fn(), get: vi.fn() },
}));

const { app } = await import('../../src/node/app.ts');

describe('GET /health', () => {
  it('returns 200 + { status: ok, db: true, redis: true } when both backends respond', async () => {
    const { pool } = await import('../../src/node/db.ts');
    const { redis } = await import('../../src/node/redis.ts');
    vi.mocked(pool).query.mockResolvedValue({ rows: [{ '?column?': 1 }] } as never);
    vi.mocked(redis).ping.mockResolvedValue('PONG');

    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', db: true, redis: true });
  });

  it('returns 503 + degraded shape when pool.query rejects (db down)', async () => {
    const { pool } = await import('../../src/node/db.ts');
    const { redis } = await import('../../src/node/redis.ts');
    vi.mocked(pool).query.mockRejectedValue(new Error('pg ECONNREFUSED'));
    vi.mocked(redis).ping.mockResolvedValue('PONG');

    const res = await app.request('/health');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'degraded', db: false, redis: true });
  });

  it('returns 503 + degraded shape when redis.ping rejects (redis down)', async () => {
    const { pool } = await import('../../src/node/db.ts');
    const { redis } = await import('../../src/node/redis.ts');
    vi.mocked(pool).query.mockResolvedValue({ rows: [{ '?column?': 1 }] } as never);
    vi.mocked(redis).ping.mockRejectedValue(new Error('redis ETIMEDOUT'));

    const res = await app.request('/health');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'degraded', db: true, redis: false });
  });

  it('returns 503 + both-false shape when both backends fail', async () => {
    const { pool } = await import('../../src/node/db.ts');
    const { redis } = await import('../../src/node/redis.ts');
    vi.mocked(pool).query.mockRejectedValue(new Error('pg down'));
    vi.mocked(redis).ping.mockRejectedValue(new Error('redis down'));

    const res = await app.request('/health');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'degraded', db: false, redis: false });
  });
});

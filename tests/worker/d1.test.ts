import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { getEnv } from './_helpers.ts';

describe('GET /d1/now (contracts/worker-routes.md §2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 with d1-sourced timestamp (happy path via miniflare)', async () => {
    const res = await SELF.fetch('http://example.com/d1/now');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string; now: string };
    expect(body.source).toBe('d1');
    expect(typeof body.now).toBe('string');
    expect(body.now.length).toBeGreaterThan(0);
  });

  it('returns 500 d1_query_failed when env.DB.prepare throws', async () => {
    // Stub env.DB.prepare to throw — exercises the d1 exception branch
    // per worker-routes.md §2 error model.
    const spy = vi.spyOn(getEnv().DB, 'prepare').mockImplementation(() => {
      throw new Error('synthetic d1 failure');
    });

    try {
      const res = await SELF.fetch('http://example.com/d1/now');
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('d1_query_failed');
    } finally {
      spy.mockRestore();
    }
  });
});

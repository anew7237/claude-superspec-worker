import { describe, it, expect, beforeEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { getEnv } from './_helpers.ts';

describe('GET /kv/echo (contracts/worker-routes.md §3)', () => {
  beforeEach(async () => {
    // Seed KV for hit case; miss/missing-param paths don't depend on this.
    await getEnv().KV.put('foo', 'bar');
  });

  it('returns 400 missing_param when k query is missing', async () => {
    const res = await SELF.fetch('http://example.com/kv/echo');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; hint?: string };
    expect(body.error).toBe('missing_param');
    expect(body.hint).toMatch(/k query parameter/i);
  });

  it('returns 200 with value when key hits', async () => {
    const res = await SELF.fetch('http://example.com/kv/echo?k=foo');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string; key: string; value: string };
    expect(body).toEqual({ source: 'kv', key: 'foo', value: 'bar' });
  });

  it('returns 404 not_found when key misses', async () => {
    const res = await SELF.fetch('http://example.com/kv/echo?k=missing');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('not_found');
  });
});

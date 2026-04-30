import { describe, it, expect } from 'vitest';
import { jsonError } from '../../src/worker/error.ts';

describe('jsonError helper (contracts/worker-routes.md §5.1)', () => {
  it('returns Response without hint when hint omitted', async () => {
    const res = jsonError(404, 'not_found');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    const body = (await res.json()) as { error: string; hint?: string };
    expect(body).toEqual({ error: 'not_found' });
    expect(body.hint).toBeUndefined();
  });

  it('includes hint when provided (400 missing_param)', async () => {
    const res = jsonError(400, 'missing_param', 'k query parameter required');
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    const body = (await res.json()) as { error: string; hint?: string };
    expect(body).toEqual({ error: 'missing_param', hint: 'k query parameter required' });
  });

  it('handles 5xx status with hint (503 upstream_not_configured)', async () => {
    const res = jsonError(503, 'upstream_not_configured', 'set UPSTREAM_URL var or secret');
    expect(res.status).toBe(503);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    const body = (await res.json()) as { error: string; hint?: string };
    expect(body).toEqual({
      error: 'upstream_not_configured',
      hint: 'set UPSTREAM_URL var or secret',
    });
  });

  it('serializes body as valid JSON (round-trip via text())', async () => {
    const res = jsonError(500, 'internal_error');
    expect(res.status).toBe(500);
    const text = await res.text();
    const parsed = JSON.parse(text) as { error: string; hint?: string };
    expect(parsed).toEqual({ error: 'internal_error' });
    expect('hint' in parsed).toBe(false);
  });
});

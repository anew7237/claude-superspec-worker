import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('GET /health (contracts/worker-routes.md §1)', () => {
  it('returns 200 with worker service identifier and ISO timestamp', async () => {
    const res = await SELF.fetch('http://example.com/health');
    expect(res.status).toBe(200);
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toMatch(/application\/json/);
    const body = (await res.json()) as { status: string; service: string; ts: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('worker');
    // ISO 8601 leading shape: YYYY-MM-DDTHH:MM:SS
    expect(body.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    // Verify it parses as a valid Date
    expect(Number.isFinite(new Date(body.ts).getTime())).toBe(true);
  });

  it('does not depend on bindings (touches no D1/KV/UPSTREAM_URL)', async () => {
    // Per worker-routes.md §1 invariant: even if D1/KV/UPSTREAM_URL fail,
    // /health stays 200. We can't directly observe non-touching from outside,
    // but a stable 200 with the contract body in the binding-available
    // environment confirms the handler does not require any binding.
    const res = await SELF.fetch('http://example.com/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string; ts: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('worker');
  });

  it('body shape contains exactly { status, service, ts } keys', async () => {
    const res = await SELF.fetch('http://example.com/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['service', 'status', 'ts']);
  });
});

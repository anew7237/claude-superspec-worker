import { describe, it, expect } from 'vitest';
import { app } from '../../src/node/app.ts';

describe('GET /metrics', () => {
  it('returns 200 with prometheus text format', async () => {
    const res = await app.request('/metrics');
    expect(res.status).toBe(200);
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toMatch(/text\/plain; version=0\.0\.4/);
    const body = await res.text();
    expect(body).toMatch(/^# HELP /m);
    expect(body).toMatch(/process_cpu_seconds_total/);
    expect(body).toMatch(/process_resident_memory_bytes/);
    expect(body).toMatch(/nodejs_heap_size_total_bytes/);
  });
});

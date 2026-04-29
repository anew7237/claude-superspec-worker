import { describe, it, expect } from 'vitest';
import { app } from '../../src/node/app.ts';

describe('GET /', () => {
  it('responds with hello message', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello from hono' });
  });
});

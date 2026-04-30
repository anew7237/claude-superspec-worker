import { Hono } from 'hono';
import type { Env } from '../env.ts';
import { jsonError } from '../error.ts';

export const kvRoute = new Hono<{ Bindings: Env }>();

kvRoute.get('/kv/echo', async (c) => {
  const key = c.req.query('k');
  if (!key) {
    return jsonError(400, 'missing_param', 'k query parameter required');
  }

  try {
    const value = await c.env.KV.get(key);
    if (value === null) {
      return jsonError(404, 'not_found');
    }
    return c.json({ source: 'kv', key, value });
  } catch (err) {
    console.error('kv.echo.failed', err);
    return jsonError(500, 'kv_get_failed');
  }
});

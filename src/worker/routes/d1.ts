import { Hono } from 'hono';
import type { Env } from '../env.ts';
import { jsonError } from '../error.ts';

export const d1Route = new Hono<{ Bindings: Env }>();

d1Route.get('/d1/now', async (c) => {
  try {
    const row = await c.env.DB.prepare('SELECT CURRENT_TIMESTAMP AS now').first<{
      now: string;
    }>();
    if (!row) {
      return jsonError(500, 'd1_empty_result');
    }
    return c.json({ source: 'd1', now: row.now });
  } catch (err) {
    console.error('d1.now.failed', err);
    return jsonError(500, 'd1_query_failed');
  }
});

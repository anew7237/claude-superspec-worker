import { Hono } from 'hono';
import type { Env } from '../env.ts';

export const healthRoute = new Hono<{ Bindings: Env }>();

healthRoute.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'worker',
    ts: new Date().toISOString(),
  }),
);

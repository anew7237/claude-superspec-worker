import { Hono } from 'hono';
import { pool } from './db.ts';
import { redis } from './redis.ts';
import { register } from './metrics.ts';
import { httpMetrics } from './http-metrics.ts';
import { logger } from './logger.ts';

export const app = new Hono();

// FR-007: opt-out gate. Read once at module load (Edge Cases note: changes
// do not hot-reload — restart required). Semantics:
//   undefined / ''                → enabled (fail-open observability)
//   'false' (case-insensitive, whitespace-trimmed) → disabled
//   any other value ('TRUE', '1') → enabled
// The `.trim()` defends against copy-pasted .env lines with trailing spaces
// or newlines (see review-20260425-wsl.md M-2 regression tests).
if (process.env.HTTP_METRICS_ENABLED?.trim().toLowerCase() !== 'false') {
  const METRICS_MOUNT = '/*';
  app.use(METRICS_MOUNT, httpMetrics({ mountPattern: METRICS_MOUNT }));
}

app.get('/', (c) => c.json({ message: 'hello from hono' }));

app.get('/echo', (c) => {
  // SC-007 walkthrough sample (specs/001-superspec-baseline-T009/).
  // Hono `c.req.query('msg')` returns the first value when repeated, and
  // `undefined` when the key is absent. Empty-string and absent are both
  // treated as missing, per spec.md Assumption 2.
  const msg = c.req.query('msg');
  if (!msg) return c.json({ error: 'missing msg' }, 400);
  return c.json({ message: msg });
});

app.get('/health', async (c) => {
  const dbOk = await pool
    .query('SELECT 1')
    .then(() => true)
    .catch((err: unknown) => {
      logger.warn({ err }, 'health.db.check.failed');
      return false;
    });
  const redisOk = await redis
    .ping()
    .then(() => true)
    .catch((err: unknown) => {
      logger.warn({ err }, 'health.redis.check.failed');
      return false;
    });
  const healthy = dbOk && redisOk;
  return c.json(
    { status: healthy ? 'ok' : 'degraded', db: dbOk, redis: redisOk },
    healthy ? 200 : 503,
  );
});

app.get('/metrics', async (c) => {
  c.header('Content-Type', register.contentType);
  return c.body(await register.metrics());
});

import { Hono } from 'hono';
import { pool } from './db.ts';
import { redis } from './redis.ts';
import { register } from './metrics.ts';
import { httpMetrics } from './http-metrics.ts';
import { logger } from './logger.ts';

export const app = new Hono();

// Opt-out gate (per contracts/observability.md §1.3 invariant 5). Read once
// at module load (changes do not hot-reload — restart required). Semantics:
//   undefined / ''                → enabled (fail-open observability)
//   'false' (case-insensitive, whitespace-trimmed) → disabled
//   any other value ('TRUE', '1') → enabled
// The `.trim()` defends against copy-pasted .env lines with trailing spaces
// or newlines.
if (process.env.HTTP_METRICS_ENABLED?.trim().toLowerCase() !== 'false') {
  const METRICS_MOUNT = '/*';
  app.use(METRICS_MOUNT, httpMetrics({ mountPattern: METRICS_MOUNT }));
}

app.get('/', (c) => c.json({ message: 'hello from hono' }));

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

app.get('/app-api/health', (c) => c.json({ status: 'ok', service: 'nodejs' }));

app.get('/app-api/now', async (c) => {
  try {
    const result = await pool.query<{ now: string }>('SELECT NOW() AS now');
    if (result.rows.length === 0) {
      return c.json({ error: 'pg_empty_result' }, 500);
    }
    return c.json({ source: 'postgres', now: result.rows[0].now });
  } catch (err) {
    logger.warn({ err }, 'app-api.now.failed');
    return c.json({ error: 'pg_query_failed' }, 500);
  }
});

app.get('/app-api/echo', async (c) => {
  const key = c.req.query('k');
  if (!key) {
    return c.json({ error: 'missing_param', hint: 'k query parameter required' }, 400);
  }
  try {
    const value = await redis.get(key);
    if (value === null) {
      return c.json({ error: 'not_found' }, 404);
    }
    return c.json({ source: 'redis', key, value });
  } catch (err) {
    logger.warn({ err }, 'app-api.echo.failed');
    return c.json({ error: 'redis_get_failed' }, 500);
  }
});

app.get('/metrics', async (c) => {
  c.header('Content-Type', register.contentType);
  return c.body(await register.metrics());
});

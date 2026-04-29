import { serve } from '@hono/node-server';
import { app } from './app.ts';
import { redis } from './redis.ts';
import { logger } from './logger.ts';

// Fail-fast on startup: if redis is unreachable, reject the promise so the
// process exits with an unhandled-rejection and the container restart policy
// (compose healthcheck + db depends_on service_healthy) surfaces the error
// to the operator. Happier than boot-then-serve-500s — if /health can't
// succeed, neither should the listener. See DEV-003 for the paired
// lazy-connect pattern in src/redis.ts.
await redis.connect();

const port = Number(process.env.PORT ?? 8000);
serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ port: info.port }, 'server started');
});

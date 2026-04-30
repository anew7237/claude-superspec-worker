import { Hono } from 'hono';
import type { Env } from './env.ts';
import { d1Route } from './routes/d1.ts';
import { healthRoute } from './routes/health.ts';
import { kvRoute } from './routes/kv.ts';
import { proxyRoute } from './routes/proxy.ts';
import { jsonError } from './error.ts';

const app = new Hono<{ Bindings: Env }>();

app.route('/', healthRoute);
app.route('/', d1Route);
app.route('/', kvRoute);
app.route('/', proxyRoute);

app.onError((err, _c) => {
  console.error('unhandled', err);
  return jsonError(500, 'internal');
});

app.notFound(() => jsonError(404, 'not_found'));

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;

import { Counter, Histogram } from 'prom-client';
import { Hono, type Context, type Next } from 'hono';
import { register } from './metrics.ts';
import { logger } from './logger.ts';

/**
 * Factory producing a Hono middleware that records two HTTP business metrics
 * (counter + duration histogram) against the shared prom-client `register`.
 *
 * Design notes (see specs/000-http-middleware-metrics/research.md):
 * - R6: metric objects are instantiated inside the factory body (NOT at module
 *   load) so that when `httpMetrics()` is never called (opt-out path in US2),
 *   no `http_*` metrics are registered and the `/metrics` scrape stays clean.
 * - R4: histogram buckets are left unspecified so prom-client's documented
 *   default `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]` applies.
 * - R5: requests to `/metrics` short-circuit — scrape traffic must not pollute
 *   business metrics.
 * - R7: no timers; updates are strictly request-driven.
 */

export interface HttpMetricsOptions {
  /**
   * The Hono mount pattern at which this middleware is attached (e.g. '/*',
   * '/api/*'). Used to distinguish "no terminal handler matched" from
   * "matched handler returned 404" for FR-005 (c). Caller must pass the SAME
   * literal they pass to `app.use(...)` — the middleware has no runtime
   * reflection into its own mount pattern. Defaults to '/*'.
   */
  mountPattern?: string;
}

// Module-local gate so the FR-014 degraded-label warning logs at most once
// per process lifetime. Set by either the startup probe (`probeRoutePathSupport`)
// or the per-request fallback inside the middleware — whichever detects the
// degraded state first.
let routePathUnavailableWarned = false;

/**
 * FR-014 startup probe. Fires a synthetic request through a fresh Hono instance
 * and inspects `c.req.routePath` to detect whether the installed Hono version
 * exposes the templated-route API. If absent (e.g. a future breaking change
 * removes the `@deprecated` getter without providing a drop-in replacement),
 * emit a single startup warning so adopters aren't silently degraded to
 * `route='unknown'` until the first real request arrives.
 *
 * The probe is async (Hono's `app.request()` returns a Promise); we fire it
 * without awaiting so the factory stays synchronous. In practice the probe
 * microtask resolves long before the first real request, so the warning lands
 * at startup. The per-request fallback inside the middleware remains as
 * belt-and-suspenders — if a future Hono change causes the probe to succeed
 * but real-traffic requests still see empty routePath, the fallback catches it.
 */
function probeRoutePathSupport(): void {
  if (routePathUnavailableWarned) return;
  const probe = new Hono();
  let detected = false;
  probe.use('/*', async (c, next) => {
    await next();
    try {
      // Read routePath AFTER await next() — this is when routeIndex has
      // advanced to the matched terminal handler. Reading before next()
      // would return only the mount pattern '/*' (routeIndex=0, the
      // middleware's own entry), which any Hono build exposing any
      // routePath getter would satisfy, defeating the probe's purpose.
      // The `rp !== '/*'` guard rejects the mount-pattern echo case —
      // we want the matched template, not the middleware's own pattern.
      const rp = c.req.routePath;
      if (typeof rp === 'string' && rp.length > 0 && rp !== '/*') detected = true;
    } catch {
      // getter throw → treat as unavailable
    }
  });
  probe.get('/__httpmetrics_probe__', (c) => c.text(''));
  // `app.request()` may return `Response | Promise<Response>` depending on
  // route handler sync-ness; wrap in Promise.resolve to normalize.
  Promise.resolve(probe.request('/__httpmetrics_probe__'))
    .then(() => {
      if (!detected && !routePathUnavailableWarned) {
        routePathUnavailableWarned = true;
        logger.warn(
          "HTTP middleware: routePath API unavailable at startup, route labels will degrade to 'unknown'",
        );
      }
    })
    .catch(() => {
      if (!routePathUnavailableWarned) {
        routePathUnavailableWarned = true;
        logger.warn(
          'HTTP middleware: routePath startup probe failed, route labels may degrade',
        );
      }
    });
}

const EXPECTED_LABELS = ['method', 'route', 'status_code'] as const;

/**
 * Validate that an already-registered metric's labelNames match what this
 * middleware will try to write. The idempotent lookup-or-create pattern is
 * safe only when the registered instance accepts the same label set —
 * otherwise `counter.inc({method, route, status_code})` throws deep inside
 * the middleware's finally block (post-response), where the error
 * propagates past Hono with no adopter-facing diagnostic. Fail fast at
 * factory invocation instead.
 */
function assertCompatibleLabels(
  metric: Counter<string> | Histogram<string>,
  metricName: string,
): void {
  const actual = (metric as { labelNames?: readonly string[] }).labelNames ?? [];
  const ok =
    actual.length === EXPECTED_LABELS.length &&
    EXPECTED_LABELS.every((l) => actual.includes(l));
  if (!ok) {
    throw new Error(
      `httpMetrics: '${metricName}' already registered with incompatible labelNames ` +
        `(got [${actual.join(',')}], expected [${EXPECTED_LABELS.join(',')}]). ` +
        'Reusing an adopter-registered metric with different labels will fail at request time.',
    );
  }
}

export const httpMetrics = (opts?: HttpMetricsOptions) => {
  const mountPattern = opts?.mountPattern ?? '/*';
  // Idempotent metric lookup: reuse an existing registered instance if present
  // (factory may be invoked more than once per process — e.g. adopter mounts
  // multiple sub-apps, or test reloads module). prom-client throws on duplicate
  // registration; lookup-or-create keeps the factory safe to call repeatedly.
  // Reuse is guarded by assertCompatibleLabels — reusing an adopter-registered
  // metric with a different labelset would be silently broken until first traffic.
  const existingCounter = register.getSingleMetric('http_requests_total') as
    | Counter<string>
    | undefined;
  if (existingCounter) assertCompatibleLabels(existingCounter, 'http_requests_total');
  const counter =
    existingCounter ??
    new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: [...EXPECTED_LABELS],
      registers: [register],
    });

  const existingHistogram = register.getSingleMetric('http_request_duration_seconds') as
    | Histogram<string>
    | undefined;
  if (existingHistogram)
    assertCompatibleLabels(existingHistogram, 'http_request_duration_seconds');
  const histogram =
    existingHistogram ??
    new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: [...EXPECTED_LABELS],
      registers: [register],
    });

  probeRoutePathSupport();

  return async (c: Context, next: Next): Promise<void> => {
    // R5: skip the scrape endpoint itself. Use `c.req.path` (request URL path,
    // set on entry) rather than `c.req.routePath` (matched-route template, not
    // yet resolved at middleware entry — still holds the mount pattern `/*`).
    if (c.req.path === '/metrics') {
      await next();
      return;
    }

    const start = performance.now();
    try {
      await next();
    } finally {
      const durationSec = (performance.now() - start) / 1000;

      const rawRoutePath = c.req.routePath;
      let route: string;
      if (rawRoutePath === '' || rawRoutePath == null) {
        // FR-005 (b) + FR-014: Hono API degraded; warn once, bucket as 'unknown'.
        if (!routePathUnavailableWarned) {
          routePathUnavailableWarned = true;
          logger.warn(
            "HTTP middleware: routePath API unavailable, route labels degraded to 'unknown'",
          );
        }
        route = 'unknown';
      } else if (rawRoutePath === mountPattern && c.res.status === 404) {
        // FR-005 (c): "未匹配任何 route(導致 404)". Both signals must align —
        // rawRoutePath falling back to the middleware's own mount pattern AND
        // status 404. This preserves FR-005 (a) for the legitimate case of a
        // matched handler returning 404 (e.g. REST "item not found" pattern
        // `app.get('/items/:id', c => c.json(..., 404))` — that request keeps
        // its templated route label, not 'not_found').
        route = 'not_found';
      } else {
        // FR-005 (a): templated route path (e.g. "/", "/health", "/users/:id").
        route = rawRoutePath;
      }

      const labels = {
        method: c.req.method,
        route,
        status_code: String(c.res.status),
      };
      counter.inc(labels);
      histogram.observe(labels, durationSec);
    }
  };
};

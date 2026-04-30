# claude-superspec-worker — Cloudflare Worker Variant — Working Doc

> **Purpose:** Consolidated context dump intended as input to `/speckit.specify`. Five sections, in production order:
>
> 1. **§1 Brainstorming Output** (2026-04-29) — design produced via `superpowers:brainstorming`
> 2. **§2 Implementation Plan** (2026-04-29) — task breakdown produced via `superpowers:writing-plans`
> 3. **§3 Cross-Repo Work — `claude-superspec-nodejs/002-app-api-endpoints`** — what T15 actually added
> 4. **§4 T16 Smoke Findings + Proxy Fix** — the design's `/app-api` prefix-strip semantics turned out wrong; corrected to passthrough (commit `bb29fb8` on the now-discarded standalone worker repo)
> 5. **§5 Updated Target — Unified Monorepo (Option 1)** — agreed 2026-04-30, supersedes §1 §3 of the design's "two sibling repos" assumption
>
> **§6 Confirmed Decisions Log** — identity, 001 source, etc.
>
> The original work landed in a standalone `claude-superspec-worker/` repo (16 commits). That repo is being torn down and rebuilt as a unified monorepo per §5. This doc is the bridging artifact: everything we learned from the standalone build, distilled for the new run via spec-kit.

---

## §1 Brainstorming Output (2026-04-29-cloudflare-starter-design.md)

**Created**: 2026-04-29
**Status**: Approved (brainstorming) — but **superseded** in §5 for repo layout
**Sibling baseline**: `claude-superspec-nodejs/` (unchanged in original plan; in §5 it gets folded into the monorepo as `src/node/`)
**Approach**: Idiomatic Workers + spec-kit mirrored (Approach 3)

### 1.1 Goal

Create a sibling project `claude-superspec-worker/` that:

- Deploys to Cloudflare Workers (TypeScript + Hono)
- Runs locally via `wrangler dev`
- Demonstrates two parallel data-access patterns the reader can compare side-by-side:
  - **Cloudflare-native**: D1 (SQL) and KV (cache) bound directly to the Worker
  - **Reverse proxy**: `/app-api/*` proxies to the existing nodejs app (in `claude-superspec-nodejs/` docker-compose), which talks to Postgres and Redis
- Targets the reader profile: someone who wants a clean, minimal-dependency Cloudflare Worker starter with a clear nodejs counterpart to learn from
- Leaves `claude-superspec-nodejs/` intact (own repo, own git history) — no breaking edits to existing files; only adds three new `/app-api/*` endpoints in `src/app.ts`

> **Note (per §5):** the "leave nodejs intact" decision was reversed. nodejs is folded into the monorepo as `src/node/` (sourced from `origin/001-superspec-baseline` per §6).

### 1.2 Architecture

```
                         Client (browser / curl)
                                   │
                                   ▼
         ┌─────────────────────────────────────────────┐
         │  Cloudflare Worker  (claude-superspec-worker) │
         │                                                │
         │   GET /health           → JSON                 │
         │   GET /d1/now           → D1.prepare(...).first()
         │   GET /kv/echo?k=foo    → KV.get(foo)          │
         │   ALL /app-api/*        → fetch(UPSTREAM_URL+path)
         └────────┬────────────────────────┬────────────┘
                  │                        │
                  ▼                        ▼
        ┌──────────────────┐    ┌──────────────────────┐
        │ Cloudflare D1+KV │    │  nodejs (Hono)       │
        │  (bindings)      │    │  in docker-compose   │
        └──────────────────┘    │  ├─ Postgres         │
                                │  └─ Redis            │
                                └──────────────────────┘
```

**Bridging Worker → nodejs**

- Local dev: `UPSTREAM_URL=http://localhost:8000` (the docker-compose nodejs app)
- Deployed: `UPSTREAM_URL` is whatever public URL the user provides; recommended setup uses `cloudflared tunnel` to expose the docker app at `https://*.trycloudflare.com` or a custom domain

### 1.3 Routes — Worker

| Method | Path               | Behavior                                                                                 |
| ------ | ------------------ | ---------------------------------------------------------------------------------------- |
| GET    | `/health`          | `{ status: "ok", service: "worker", ts }` — touches no binding                           |
| GET    | `/d1/now`          | `env.DB.prepare("SELECT CURRENT_TIMESTAMP AS now").first()` → `{ source: "d1", now }`    |
| GET    | `/kv/echo?k=<key>` | `env.KV.get(k)` → `{ source: "kv", key, value }`; missing → 404 `{ error: "not_found" }` |
| ALL    | `/app-api/*`       | reverse proxy to upstream + path/query — **see §4 for corrected semantics**              |

**Proxy error model**

| Condition                | Response                                   |
| ------------------------ | ------------------------------------------ |
| `UPSTREAM_URL` unset     | 503 `{ error: "upstream_not_configured" }` |
| upstream returns non-2xx | pass-through status + body                 |
| upstream timeout (>10s)  | 504 `{ error: "upstream_timeout" }`        |
| network error            | 502 `{ error: "upstream_unreachable" }`    |

Implemented with `fetch(target, { method, headers, body, signal: AbortSignal.timeout(10_000) })`.

### 1.4 Routes — nodejs side additions (in `claude-superspec-nodejs/src/app.ts`)

Only these are added; existing routes unchanged.

| Method | Path                  | Behavior                                                          |
| ------ | --------------------- | ----------------------------------------------------------------- |
| GET    | `/app-api/health`     | `{ status: "ok", service: "nodejs" }`                             |
| GET    | `/app-api/now`        | `SELECT NOW() AS now` via `pg` → `{ source: "postgres", now }`    |
| GET    | `/app-api/echo?k=<k>` | `redis.get(k)` → `{ source: "redis", key, value }`; missing → 404 |

**Comparison table (for README)**

| Demo   | Cloudflare-native    | Through nodejs (proxy)    |
| ------ | -------------------- | ------------------------- |
| health | `GET /health`        | `GET /app-api/health`     |
| now    | `GET /d1/now`        | `GET /app-api/now`        |
| echo   | `GET /kv/echo?k=foo` | `GET /app-api/echo?k=foo` |

### 1.5 Bindings & Configuration

**`wrangler.jsonc`**

```jsonc
{
  "name": "claude-superspec-worker",
  "main": "src/index.ts",
  "compatibility_date": "2025-09-01",
  "vars": {
    "UPSTREAM_URL": "http://localhost:8000",
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "claude-superspec-worker",
      "database_id": "<filled-after-wrangler-d1-create>",
    },
  ],
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": "<filled-after-wrangler-kv-namespace-create>",
    },
  ],
}
```

**`src/env.ts`**

```ts
export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  UPSTREAM_URL: string;
}
```

**Worker ↔ nodejs auth**

**Out of scope for starter.** README documents that production deployments should add a shared-secret header (`X-Worker-Token`) or place the upstream behind cloudflared tunnel + Cloudflare Access. The starter does not implement this to keep focus on the data-path comparison.

### 1.6 Error Handling

- `src/error.ts` exposes `jsonError(status, code, hint?)` returning `Response` with `{ error, hint? }` body.
- Hono `app.onError` catches uncaught exceptions → 500 `{ error: "internal" }`.
- D1 / KV exceptions: caught locally in their route handlers; client always receives a sanitized JSON payload. Full stack traces are emitted via `console.error` and visible through `wrangler tail` / Workers Logs.
- No retry, no circuit breaker, no rate limiting (out of scope for starter).

### 1.7 Testing

- Test runner: `vitest` + `@cloudflare/vitest-pool-workers` (so D1 / KV bindings work in test).
- Test files mirror routes:
  - `tests/health.test.ts` — direct `app.fetch(new Request(...))`
  - `tests/d1.test.ts` — uses miniflare-provided in-memory D1
  - `tests/kv.test.ts` — pre-seed in test setup, then `GET`
  - `tests/proxy.test.ts` — replaces `globalThis.fetch` with a stub; covers 200 / 404 / 503 / 504 / network error
- Command: `pnpm test` (alias to `vitest run`).

### 1.8 Tooling & Commands

| Action        | Command                                            |
| ------------- | -------------------------------------------------- |
| Local dev     | `pnpm dev` → `wrangler dev`                        |
| Tests         | `pnpm test`                                        |
| Type check    | `pnpm typecheck` → `tsc --noEmit`                  |
| Lint          | `pnpm lint` → `eslint .`                           |
| Format        | `pnpm format` → `prettier --write .`               |
| Deploy        | `pnpm deploy` → `wrangler deploy`                  |
| D1 migrations | `pnpm db:migrate` → `wrangler d1 migrations apply` |
| Tail logs     | `pnpm logs` → `wrangler tail`                      |

### 1.9 First-Time Deploy Sequence (README)

1. `pnpm install`
2. `wrangler login`
3. `wrangler d1 create claude-superspec-worker` → copy returned `database_id` into `wrangler.jsonc`
4. `wrangler kv namespace create KV` → copy returned `id` into `wrangler.jsonc`
5. `wrangler d1 migrations apply claude-superspec-worker --remote` (no-op if no migrations)
6. `wrangler kv key put --binding=KV foo "hello-from-kv" --remote` (seed for `/kv/echo?k=foo` demo)
7. (optional but recommended) Start docker-compose nodejs app, run `cloudflared tunnel --url http://localhost:8000`, copy the public URL, then:
   `wrangler secret put UPSTREAM_URL` (paste the tunnel URL) — overrides `vars.UPSTREAM_URL`
8. `pnpm deploy`

For local-only flow, steps 5–7 can be skipped (use `wrangler dev` against `vars.UPSTREAM_URL = http://localhost:8000`).

### 1.10 Dependencies (worker side, original "slim" plan)

**`package.json` — runtime**

- `hono ^4.x`

**`package.json` — dev**

- `wrangler ^3.x`
- `@cloudflare/workers-types`
- `@cloudflare/vitest-pool-workers`
- `vitest`
- `typescript ^5.7`
- `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-config-prettier`
- `prettier`

**Removed vs nodejs version (in original plan; reversed in §5)**

- `pg` (replaced by D1 binding)
- `redis` (replaced by KV binding)
- `pino`, `pino-pretty` (use `console.log`; Workers Logs / `wrangler tail` for tailing)
- `prom-client` (no `/metrics` endpoint in starter; observability via Workers built-ins is a future extension)
- `@hono/node-server` (replaced by `export default { fetch: app.fetch }`)

> **§5 update:** the unified monorepo restores all "removed" deps because it now houses the node runtime side too. They live in the same root `package.json`; wrangler only bundles what `src/worker/index.ts` imports.

### 1.11 KV Demo Seeding

Because the starter uses read-only routes, KV needs at least one key for `/kv/echo` to return non-404. README walks the reader through:

```bash
# Local (wrangler dev)
wrangler kv key put --binding=KV foo "hello-from-kv" --local

# Remote (deployed)
wrangler kv key put --binding=KV foo "hello-from-kv" --remote
```

Redis on the nodejs side similarly needs `SET foo "hello-from-redis"`. README documents `docker compose exec redis redis-cli SET foo "hello-from-redis"`.

### 1.12 Spec-Kit Family Identity

The new repo mirrors `claude-superspec-nodejs/.specify/` (constitution, templates, scripts) so that `/speckit.*` workflows function identically. The constitution receives a Variant Amendment:

> **Variant Amendment (worker):** This variant is deployed to Cloudflare Workers. Bindings (D1, KV) and reverse-proxy upstreams are first-class infrastructure dependencies. Containers (Docker, docker-compose) are explicitly out-of-scope for this variant.

> **§5 update:** this amendment text needs revision since the unified monorepo houses BOTH node and worker runtimes. New text TBD by /speckit.specify.

### 1.13 Out of Scope (starter)

- Authentication between Worker and nodejs upstream
- Rate limiting
- Observability stack (Workers Analytics Engine, Logpush, alerts)
- D1 schema / migrations beyond a placeholder
- KV write routes
- Custom domain configuration
- CI pipeline (left for the reader)
- Multi-environment (`staging` / `production`) wrangler envs — single environment for starter

### 1.14 Acceptance — "Done" definition

The starter is done when, on a fresh checkout:

1. `pnpm install && pnpm test` passes
2. `pnpm dev` starts wrangler dev; `curl http://localhost:8787/health` returns 200
3. With docker-compose nodejs app running on `localhost:8000`, `curl http://localhost:8787/app-api/health` returns 200 with `{ service: "nodejs" }`
4. `curl http://localhost:8787/d1/now` returns a valid timestamp from D1
5. After `wrangler kv key put --binding=KV foo bar --local`, `curl http://localhost:8787/kv/echo?k=foo` returns `{ value: "bar" }`
6. `pnpm deploy` succeeds and the deployed Worker passes `/health` and `/d1/now` smoke tests
7. README contains the comparison table + the deploy walkthrough

> **§5 update:** acceptance criteria adapt to the monorepo: `pnpm dev:node` boots the node side at :8000, `pnpm dev:worker` boots the worker at :8787; both must work side-by-side.

---

## §2 Implementation Plan (2026-04-29-cloudflare-starter-plan.md, T1-T16 summary)

> The full plan is 1600 lines with code-level detail per task. Below is the structural distillation; full code blocks are in the original plan file (now discarded with the standalone repo, but reproducible via re-walking these tasks).

**Goal:** Build `claude-superspec-worker/` — a sibling Cloudflare Workers starter that demonstrates D1 + KV direct access alongside a `/app-api/*` reverse proxy to the existing `claude-superspec-nodejs/` docker-compose app.

**Tech Stack:** TypeScript 5.7, Hono 4.x, Wrangler 3.x, vitest, @cloudflare/vitest-pool-workers, @cloudflare/workers-types, pnpm 9.

### 2.1 Tasks

| #   | Title                                                          | Files (worker repo unless prefixed)                                                                                       |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| T1  | Repo skeleton + base hygiene configs                           | `.gitignore`, `.gitattributes`, `.nvmrc`, `CLAUDE.md`, `package.json` (stub)                                              |
| T2  | Mirror `.specify/` from nodejs sibling + variant amendment     | full `.specify/` tree; `.specify/memory/constitution.md` amendment                                                        |
| T3  | Install Cloudflare deps                                        | `package.json` (deps), `pnpm-lock.yaml`                                                                                   |
| T4  | TypeScript / ESLint / Prettier configs                         | `tsconfig.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`                                                |
| T5  | `wrangler.jsonc` + `.dev.vars`                                 | `wrangler.jsonc`, `.dev.vars` (gitignored)                                                                                |
| T6  | vitest config with workers pool                                | `vitest.config.ts`                                                                                                        |
| T7  | Bindings type                                                  | `src/env.ts`                                                                                                              |
| T8  | `src/error.ts` (TDD `jsonError`)                               | `src/error.ts`, `tests/error.test.ts`                                                                                     |
| T9  | Hono app skeleton + GET `/health` (TDD)                        | `src/index.ts`, `src/routes/health.ts`, `tests/health.test.ts`                                                            |
| T10 | GET `/d1/now` (TDD)                                            | `src/routes/d1.ts`, `tests/d1.test.ts`, +modify `src/index.ts`                                                            |
| T11 | GET `/kv/echo` (TDD, 3 cases: hit / miss / missing-param)      | `src/routes/kv.ts`, `tests/kv.test.ts`, +modify `src/index.ts`                                                            |
| T12 | ALL `/app-api/*` reverse proxy (TDD, 6 cases)                  | `src/routes/proxy.ts`, `tests/proxy.test.ts`, +modify `src/index.ts`                                                      |
| T13 | `package.json` scripts (dev / test / typecheck / lint / etc)   | `package.json` (scripts block)                                                                                            |
| T14 | `README.md` (comparison table + first-time deploy walkthrough) | `README.md`                                                                                                               |
| T15 | nodejs sibling: add `/app-api/*` endpoints                     | `claude-superspec-nodejs/src/app.ts`, `claude-superspec-nodejs/tests/app-api.test.ts` (on branch `002-app-api-endpoints`) |
| T16 | Manual end-to-end smoke test                                   | (verification only, no code)                                                                                              |

### 2.2 Key Code Spec — Worker (T7-T12)

**`src/env.ts`**

```ts
export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  UPSTREAM_URL: string;
}
```

**`src/error.ts`**

```ts
export function jsonError(status: number, code: string, hint?: string): Response {
  const body: { error: string; hint?: string } = { error: code };
  if (hint !== undefined) body.hint = hint;
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
```

**`src/routes/health.ts`**

```ts
import { Hono } from 'hono';
import type { Env } from '../env';

export const healthRoute = new Hono<{ Bindings: Env }>();

healthRoute.get('/health', (c) =>
  c.json({ status: 'ok', service: 'worker', ts: new Date().toISOString() }),
);
```

**`src/routes/d1.ts`**

```ts
import { Hono } from 'hono';
import type { Env } from '../env';
import { jsonError } from '../error';

export const d1Route = new Hono<{ Bindings: Env }>();

d1Route.get('/d1/now', async (c) => {
  try {
    const row = await c.env.DB.prepare('SELECT CURRENT_TIMESTAMP AS now').first<{ now: string }>();
    if (!row) return jsonError(500, 'd1_empty_result');
    return c.json({ source: 'd1', now: row.now });
  } catch (err) {
    console.error('d1.now.failed', err);
    return jsonError(500, 'd1_query_failed');
  }
});
```

**`src/routes/kv.ts`**

```ts
import { Hono } from 'hono';
import type { Env } from '../env';
import { jsonError } from '../error';

export const kvRoute = new Hono<{ Bindings: Env }>();

kvRoute.get('/kv/echo', async (c) => {
  const key = c.req.query('k');
  if (!key) return jsonError(400, 'missing_param', 'k query parameter required');

  try {
    const value = await c.env.KV.get(key);
    if (value === null) return jsonError(404, 'not_found');
    return c.json({ source: 'kv', key, value });
  } catch (err) {
    console.error('kv.echo.failed', err);
    return jsonError(500, 'kv_get_failed');
  }
});
```

**`src/routes/proxy.ts`** — corrected per §4 below (passthrough, not strip):

```ts
import { Hono } from 'hono';
import type { Env } from '../env';
import { jsonError } from '../error';

const PROXY_PREFIX = '/app-api';
const TIMEOUT_MS = 10_000;

export const proxyRoute = new Hono<{ Bindings: Env }>();

proxyRoute.all(`${PROXY_PREFIX}/*`, async (c) => {
  const upstream = c.env.UPSTREAM_URL;
  if (!upstream) {
    return jsonError(503, 'upstream_not_configured', 'set UPSTREAM_URL var or secret');
  }

  const incoming = new URL(c.req.url);
  const target = `${upstream.replace(/\/$/, '')}${incoming.pathname}${incoming.search}`;

  const isBodyless = c.req.method === 'GET' || c.req.method === 'HEAD';
  const fetchInit: RequestInit = {
    method: c.req.method,
    headers: c.req.raw.headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };
  if (!isBodyless) {
    fetchInit.body = c.req.raw.body;
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(target, fetchInit);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return jsonError(504, 'upstream_timeout', `no response within ${TIMEOUT_MS}ms`);
    }
    console.error('proxy.fetch.failed', err);
    return jsonError(502, 'upstream_unreachable');
  }

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers: upstreamRes.headers,
  });
});
```

**`src/index.ts`**

```ts
import { Hono } from 'hono';
import type { Env } from './env';
import { healthRoute } from './routes/health';
import { d1Route } from './routes/d1';
import { kvRoute } from './routes/kv';
import { proxyRoute } from './routes/proxy';
import { jsonError } from './error';

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
```

### 2.3 Lessons Learned (encountered during T1-T16 execution)

These tripped up the original plan and should inform any re-execution:

1. **`@cloudflare/vitest-pool-workers@0.15.1` does NOT export `defineWorkersConfig` from `/config`.** The plan called for:

   ```ts
   import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
   ```

   That subpath doesn't exist (package's `exports` only has `.`, `./types`, `./codemods/vitest-v3-to-v4`). Use the v0.15-era plugin pattern instead:

   ```ts
   import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
   import { defineConfig } from 'vitest/config';

   export default defineConfig({
     plugins: [
       cloudflareTest({
         wrangler: { configPath: './wrangler.jsonc' },
         miniflare: {
           compatibilityDate: '2025-09-01',
           d1Databases: ['DB'],
           kvNamespaces: ['KV'],
           bindings: { UPSTREAM_URL: 'http://localhost:8000' },
         },
       }),
     ],
   });
   ```

2. **`tsconfig.json` `types` array must include `@cloudflare/vitest-pool-workers/types`** for `tsc` to resolve `import { env, createExecutionContext } from 'cloudflare:test'` in test files. Original plan had only `["@cloudflare/workers-types/2023-07-01"]`.

3. **`declare module 'cloudflare:test' { interface ProvidedEnv { ... } }` augmentation does NOT work in v0.15.1.** The `env` import is typed as `Cloudflare.Env` (an empty mergeable interface in `cloudflare-test.d.ts`). The augmentation has no effect. Workaround used in tests:

   ```ts
   import type { Env } from '../src/env';
   const baseEnv: Env = { ...(env as unknown as Env), UPSTREAM_URL: 'http://upstream.test' };
   ```

   The `declare module` block can stay (documentation parity) but doesn't actually narrow the type. Worth a follow-up: extract a typed-env helper to avoid repeating the cast across tests.

4. **`exactOptionalPropertyTypes: true` rejects inline ternaries assigning `undefined` to optional fields.** E.g.:

   ```ts
   // FAILS under exactOptionalPropertyTypes
   const init = { method, headers, body: isBodyless ? undefined : raw.body };
   ```

   Build the object incrementally instead:

   ```ts
   const init: RequestInit = { method, headers };
   if (!isBodyless) init.body = raw.body;
   ```

5. **ESLint 9 `@typescript-eslint/no-unused-vars` rule does NOT auto-ignore underscore-prefixed parameters without explicit config.** When renaming `c` → `_c` in `app.onError((err, _c) => ...)` to satisfy `noUnusedParameters: true` in tsconfig, ESLint still complained. Add to `eslint.config.js`:

   ```js
   {
     rules: {
       '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
     },
   },
   ```

6. **`.prettierignore` should include `.specify/`, `CLAUDE.md`, and `wrangler.jsonc`.** The `.specify/` tree is vendored from spec-kit and not authored content; CLAUDE.md and wrangler.jsonc have idiosyncratic formatting prettier wants to rewrite. Original plan's `.prettierignore` (just `node_modules`, `dist`, `.wrangler`, `pnpm-lock.yaml`, `coverage`) was insufficient.

7. **No `nodejs_compat` flag is needed.** The original plan included `"compatibility_flags": ["nodejs_compat"]` defensively in `wrangler.jsonc`. Hono + D1 + KV + global `fetch` are all pure Workers APIs; the flag adds runtime weight for nothing. Removed during self-review.

---

## §3 T15 Cross-Repo Work — `claude-superspec-nodejs` `002-app-api-endpoints` branch

> The 002 branch's `specs/002-app-api-endpoints/spec.md` is just an empty spec-kit template stub (created by `create-new-feature.sh` and never filled in). What actually got committed under `2faf575` is below.

### 3.1 Routes added (in `claude-superspec-nodejs/src/app.ts`)

Inserted between the existing `/health` and `/metrics` routes:

```ts
app.get('/app-api/health', (c) => c.json({ status: 'ok', service: 'nodejs' }));

app.get('/app-api/now', async (c) => {
  try {
    const result = await pool.query<{ now: string }>('SELECT NOW() AS now');
    const row = result.rows[0];
    if (!row) return c.json({ error: 'pg_empty_result' }, 500);
    return c.json({ source: 'postgres', now: row.now });
  } catch (err) {
    logger.warn({ err }, 'app-api.now.failed');
    return c.json({ error: 'pg_query_failed' }, 500);
  }
});

app.get('/app-api/echo', async (c) => {
  const key = c.req.query('k');
  if (!key) return c.json({ error: 'missing_param', hint: 'k query parameter required' }, 400);
  try {
    const value = await redis.get(key);
    if (value === null) return c.json({ error: 'not_found' }, 404);
    return c.json({ source: 'redis', key, value });
  } catch (err) {
    logger.warn({ err }, 'app-api.echo.failed');
    return c.json({ error: 'redis_get_failed' }, 500);
  }
});
```

### 3.2 Tests added (`claude-superspec-nodejs/tests/app-api.test.ts`)

5 cases with module-level mocks for `../src/db` and `../src/redis`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { app } from '../src/app';

vi.mock('../src/db', () => ({
  pool: {
    query: vi.fn(async () => ({ rows: [{ now: '2026-04-29T12:00:00.000Z' }] })),
  },
}));

vi.mock('../src/redis', () => ({
  redis: {
    get: vi.fn(async (key: string) => (key === 'foo' ? 'hello-from-redis' : null)),
    ping: vi.fn(async () => 'PONG'),
  },
}));

describe('/app-api/* endpoints', () => {
  it('GET /app-api/health returns ok', async () => {
    const res = await app.fetch(new Request('http://localhost/app-api/health'));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok', service: 'nodejs' });
  });

  it('GET /app-api/now returns postgres now()', async () => {
    const res = await app.fetch(new Request('http://localhost/app-api/now'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string; now: string };
    expect(body.source).toBe('postgres');
    expect(body.now).toBe('2026-04-29T12:00:00.000Z');
  });

  it('GET /app-api/echo?k=foo returns redis value', async () => {
    const res = await app.fetch(new Request('http://localhost/app-api/echo?k=foo'));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      source: 'redis',
      key: 'foo',
      value: 'hello-from-redis',
    });
  });

  it('GET /app-api/echo?k=missing returns 404', async () => {
    const res = await app.fetch(new Request('http://localhost/app-api/echo?k=missing'));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'not_found' });
  });

  it('GET /app-api/echo with no k returns 400', async () => {
    const res = await app.fetch(new Request('http://localhost/app-api/echo'));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: 'missing_param' });
  });
});
```

### 3.3 Notes

- The branch was created by `claude-superspec-nodejs/.specify/scripts/bash/create-new-feature.sh --short-name app-api-endpoints "Add /app-api endpoints for Worker reverse proxy demo"` — script auto-numbered to `002` (next after `001-superspec-baseline`).
- The 002 branch's `specs/002-app-api-endpoints/spec.md` was the empty stub from `spec-template.md`; never filled in.
- After §5 monorepo refactor, this branch can be deleted: `git -C claude-superspec-nodejs branch -D 002-app-api-endpoints` (reminder for user).

---

## §4 T16 End-to-End Smoke Findings + Proxy Fix

> Smoke test (run 2026-04-29 evening) caught a **design bug** in §1.3's `/app-api/*` proxy semantics.

### 4.1 What we did

1. `cd claude-superspec-nodejs && docker compose up -d --build` (3 services: app/db/redis all healthy)
2. Seeded Redis: `docker exec ... redis-cli SET foo "hello-from-redis"` → `OK`
3. Direct nodejs probes — all 200:
   ```
   GET /app-api/health     → {"status":"ok","service":"nodejs"}
   GET /app-api/now        → {"source":"postgres","now":"2026-04-29T15:38:22.044Z"}
   GET /app-api/echo?k=foo → {"source":"redis","key":"foo","value":"hello-from-redis"}
   ```
4. `cd claude-superspec-worker && pnpm dev` (wrangler dev, :8787)
5. Seeded local KV: `wrangler kv key put --binding=KV foo "hello-from-kv" --local` → OK
6. Worker probes — initially **3 of 6 wrong**:
   ```
   ✅ GET /health             → {"status":"ok","service":"worker",...}
   ✅ GET /d1/now             → {"source":"d1","now":"2026-04-29 15:39:04"}
   ✅ GET /kv/echo?k=foo      → {"source":"kv","value":"hello-from-kv"}
   ❌ GET /app-api/health     → {"status":"ok","db":true,"redis":true}    ← wrong! that's nodejs's existing /health body
   ❌ GET /app-api/now        → 404
   ❌ GET /app-api/echo?k=foo → 404
   ```

### 4.2 Root cause

The original `proxy.ts` STRIPPED the `/app-api` prefix before forwarding:

```ts
const targetPath = incoming.pathname.slice(PROXY_PREFIX.length) || '/';
const target = `${upstream}${targetPath}${incoming.search}`;
```

So worker `GET /app-api/now` became `GET http://localhost:8000/now` upstream. nodejs has no `/now` route → 404. And worker `GET /app-api/health` hit nodejs's existing `/health` (the rich db+redis liveness one) — accidentally returning 200 with the wrong body.

The §1.3 spec was internally inconsistent: the worker stripped the prefix but §1.4 declared the nodejs sibling exposes routes literally at `/app-api/*`. Once nodejs has those routes, the strip is wrong.

### 4.3 Fix

Don't strip — pass through:

```ts
const incoming = new URL(c.req.url);
const target = `${upstream.replace(/\/$/, '')}${incoming.pathname}${incoming.search}`;
```

Two test assertions in `tests/proxy.test.ts` also flipped:

```ts
// before
expect(url).toBe('http://upstream.test/health');
expect(calledUrl).toContain('http://upstream.test/echo?k=foo');

// after
expect(url).toBe('http://upstream.test/app-api/health');
expect(calledUrl).toContain('http://upstream.test/app-api/echo?k=foo');
```

### 4.4 Re-test result (post-fix, all green)

```
✅ GET /app-api/health     → {"status":"ok","service":"nodejs"}
✅ GET /app-api/now        → {"source":"postgres","now":"2026-04-29T15:41:20.594Z"}
✅ GET /app-api/echo?k=foo → {"source":"redis","key":"foo","value":"hello-from-redis"}
✅ GET /app-api/echo?k=missing → 404 {"error":"not_found"}  (transparent passthrough of nodejs's 404)
```

### 4.5 Implication for /speckit.specify

The proxy spec's behavior MUST say "passthrough — `${UPSTREAM_URL}${incoming.pathname}${incoming.search}`", NOT "strip the `/app-api` prefix". The original §1.3 wording is wrong.

Also: nodejs side route paths and worker side proxy URL paths must match 1:1 (worker `/app-api/X` → upstream `/app-api/X`).

---

## §5 Updated Target — Unified Monorepo (Option 1, agreed 2026-04-30)

> Supersedes §1's "two sibling repos" assumption. The user wants ONE repo housing both Node and Worker runtimes.

### 5.1 Why a monorepo (vs two siblings)

The original plan kept `claude-superspec-nodejs/` and `claude-superspec-worker/` as independent repos. Problems with that:

- Both repos had overlapping path names (`src/index.ts`, `tests/health.test.ts`, `package.json`) — couldn't be merged without conflict
- Reader has to clone/setup two repos to grok the comparison
- Maintaining two `.specify/` baselines, two CLAUDE.mds, two READMEs duplicates effort
- The "fork-as-starter" experience is awkward across two repos

Monorepo lets a reader `git clone <one-repo>` and immediately have both runtimes side-by-side with a single `pnpm install` and `pnpm test`.

### 5.2 Target file structure

```
claude-superspec-worker/                     ← single .git, single package.json, single .specify/
│
├── src/
│   ├── shared/                              ← types/constants both runtimes import (small)
│   │   ├── error-codes.ts
│   │   └── types.ts
│   │
│   ├── node/                                ← Node runtime (sourced from origin/001-superspec-baseline)
│   │   ├── app.ts                           Hono app — routes: /, /health, /metrics, /app-api/*
│   │   ├── index.ts                         entry: serve({ fetch: app.fetch, port: 8000 })
│   │   ├── db.ts                            pg Pool
│   │   ├── redis.ts                         redis client
│   │   ├── metrics.ts                       prom-client register
│   │   ├── http-metrics.ts                  middleware
│   │   └── logger.ts                        pino
│   │
│   └── worker/                              ← Workers runtime
│       ├── index.ts                         entry: export default { fetch: app.fetch }
│       ├── env.ts                           Bindings type (DB, KV, UPSTREAM_URL)
│       ├── error.ts                         jsonError helper
│       └── routes/
│           ├── health.ts                    GET /health
│           ├── d1.ts                        GET /d1/now
│           ├── kv.ts                        GET /kv/echo
│           └── proxy.ts                     ALL /app-api/*  (passthrough per §4)
│
├── tests/
│   ├── node/                                ← from claude-superspec-nodejs/tests/
│   │   ├── health.test.ts
│   │   ├── metrics.test.ts
│   │   ├── http-metrics.{test,bench,label-shape,opt-out,sc007,regression}.ts
│   │   └── app-api.test.ts                  (from T15)
│   │
│   └── worker/
│       ├── error.test.ts / health.test.ts / d1.test.ts / kv.test.ts / proxy.test.ts
│
├── Dockerfile                               ← Node runtime image (kept at root, 2026-04-30)
├── docker-compose.yml                       ← Node compose stack (kept at root, 2026-04-30)
├── scripts/
│   └── db-init/                             ← Postgres init scripts (kept at root)
├── Makefile
├── .env.example
├── .dockerignore
│
├── wrangler.jsonc                           main = src/worker/index.ts
├── .dev.vars                                (gitignored)
│
├── vitest.config.node.ts                    plain vitest, includes tests/node/**
├── vitest.config.worker.ts                  cloudflareTest plugin, includes tests/worker/**
│   (or single file using vitest 4 projects feature)
│
├── tsconfig.json                            base (strict, lib ES2022, paths)
├── tsconfig.node.json                       extends base; types ["node"]; include src/node, src/shared, tests/node
├── tsconfig.worker.json                     extends base; types ["@cloudflare/workers-types/2023-07-01", "@cloudflare/vitest-pool-workers/types"]; include src/worker, src/shared, tests/worker
├── eslint.config.js                         shared, with argsIgnorePattern: '^_'
├── .prettierrc.json
├── .prettierignore                          includes .specify, CLAUDE.md, wrangler.jsonc
├── .nvmrc                                   22
├── .gitignore
├── .gitattributes
├── package.json                             single — all deps from both runtimes
├── pnpm-lock.yaml
├── CLAUDE.md                                user's commit/push gating preferences
├── README.md                                root README — covers both runtimes
│
└── .specify/                                ONE spec-kit baseline
    ├── memory/constitution.md               with monorepo variant amendment
    ├── templates/, scripts/, integrations/, workflows/, extensions/
    ├── extensions.yml, init-options.json, integration.json, ...
    └── specs/
        ├── 001-superspec-baseline/          from origin/001-superspec-baseline (full spec-kit deliverable)
        └── 002-cloudflare-worker/           NEW — to be produced by /speckit.specify against THIS doc
            └── (spec.md, plan.md, tasks.md, ... per spec-kit conventions)
```

### 5.3 `package.json` (target shape)

```json
{
  "name": "claude-superspec-worker",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "dev:node": "node --watch --experimental-strip-types --disable-warning=ExperimentalWarning src/node/index.ts",
    "dev:worker": "wrangler dev",
    "build:node": "tsc -p tsconfig.node.json",
    "deploy:worker": "wrangler deploy",
    "test": "pnpm test:node && pnpm test:worker",
    "test:node": "vitest run --config vitest.config.node.ts",
    "test:worker": "vitest run --config vitest.config.worker.ts",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.worker.json",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "logs:worker": "wrangler tail",
    "db:migrate": "wrangler d1 migrations apply claude-superspec-worker --remote",
    "compose:up": "docker compose up -d",
    "compose:down": "docker compose down"
  },
  "dependencies": {
    "@hono/node-server": "^1.13",
    "hono": "^4",
    "pg": "^8.13",
    "pino": "^9.5",
    "prom-client": "^15.1",
    "redis": "^4.7"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.15",
    "@cloudflare/workers-types": "^4",
    "@eslint/js": "^10",
    "@types/node": "^22",
    "@types/pg": "^8.11",
    "eslint": "^9",
    "eslint-config-prettier": "^10",
    "pino-pretty": "^11",
    "prettier": "^3",
    "typescript": "^5.7",
    "typescript-eslint": "^8",
    "vitest": "^4",
    "wrangler": "^3"
  }
}
```

**Key insights:**

- All deps in same root `package.json`. wrangler bundles only what `src/worker/index.ts` imports → pg/redis/pino/prom-client don't bloat the deployed Worker.
- Single `pnpm install` covers both runtimes.
- `dev:node` and `dev:worker` listen on different ports (8000 / 8787) so they can run side-by-side. Worker proxy `UPSTREAM_URL=http://localhost:8000` reaches node directly without docker.

### 5.4 Two vitest configs (or one with projects)

`vitest.config.node.ts`:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['tests/node/**/*.test.ts'] },
});
```

`vitest.config.worker.ts`:

```ts
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        compatibilityDate: '2025-09-01',
        d1Databases: ['DB'],
        kvNamespaces: ['KV'],
        bindings: { UPSTREAM_URL: 'http://localhost:8000' },
      },
    }),
  ],
  test: { include: ['tests/worker/**/*.test.ts'] },
});
```

Or combine via vitest 4's `projects` feature into a single config.

### 5.5 Two tsconfigs

- `tsconfig.json` (base): shared `compilerOptions` only — no `include`. Strict flags, ES2022 target, `moduleResolution: "Bundler"`, `noEmit: true`.
- `tsconfig.node.json` extends base. `types: ["node"]`. `include: ["src/node/**/*", "src/shared/**/*", "tests/node/**/*"]`.
- `tsconfig.worker.json` extends base. `types: ["@cloudflare/workers-types/2023-07-01", "@cloudflare/vitest-pool-workers/types"]`. `include: ["src/worker/**/*", "src/shared/**/*", "tests/worker/**/*", "vitest.config.worker.ts"]`.

This way Worker tsc never sees Node globals (and vice versa) — neither runtime's globals leak into the other.

### 5.6 docker-compose.yml (kept at repo root)

**Decision reversed 2026-04-30 during execution**: Docker assets (`Dockerfile`, `docker-compose.yml`, `scripts/db-init/`) stay at repo root rather than being moved into `docker/`.

Rationale:

- `.devcontainer/devcontainer.json` references `Dockerfile` at root (`"build": { "dockerfile": "Dockerfile" }`); not moving avoids touching DevContainer config.
- `Makefile` uses bare `docker compose ...` from repo root; keeping compose at root means Makefile is untouched.
- compose's `context: .` and `${LOCAL_WORKSPACE_FOLDER:-.}/scripts/db-init` bind mount stay valid as-is — no path-prefix edits needed.
- DevContainer + compose + `pnpm dev` flows all keep working without any compose-side changes.

The only Node-side path edits that did land in the migration commit (`25cfebf`):

- `Dockerfile` runtime CMD: `dist/index.js` → `dist/node/index.js` (because `tsc -p tsconfig.json` with `rootDir: src` emits to `dist/node/index.js` once entry moves).
- `package.json` `dev` script: `src/index.ts` → `src/node/index.ts`.
- `package.json` `start` script: `dist/index.js` → `dist/node/index.js`.
- `tests/node/*.ts` static + dynamic imports: `'../src/X'` → `'../../src/node/X'`.

`tsconfig.json` / `tsconfig.lint.json` / `eslint.config.js` / `Makefile` / `.devcontainer/*` / `.dockerignore` were verified to need no edits (wildcards still match, no hardcoded subpaths affected).

### 5.7 Constitution Variant Amendment (revised text)

The original wording (§1.12) said the variant was Cloudflare-only and Docker-out-of-scope. That's wrong for the monorepo — Docker IS in scope (housing the node side). Revised wording, to be added to `.specify/memory/constitution.md`:

> **Variant Amendment — Cloudflare Worker Companion (2026-04-30)**
>
> This repo houses **two runtimes coexisting**:
>
> - **Node runtime** (`src/node/`): Hono on `@hono/node-server`, Postgres via `pg`, Redis, pino, prom-client. Deployed via Docker (`Dockerfile` + `docker-compose.yml` at repo root).
> - **Worker runtime** (`src/worker/`): Hono on Workers fetch handler, D1 + KV bindings, console.log, no Prometheus. Deployed via `wrangler deploy`.
>
> The two share a `.specify/` baseline, toolchain, and `package.json`. They have separate entries (`src/node/index.ts` vs `src/worker/index.ts`), separate vitest pools (plain vs `@cloudflare/vitest-pool-workers`), and separate tsconfigs. `src/shared/` holds the small set of runtime-agnostic types and constants both import.
>
> **Comparison demos** are first-class: every Worker-native data path (`/d1/now`, `/kv/echo`) has a counterpart on the Node side (`/app-api/now` via Postgres, `/app-api/echo` via Redis), and the Worker `/app-api/*` route reverse-proxies to whatever URL `UPSTREAM_URL` points at. README and routes are organized so a reader can `curl` both sides side-by-side.
>
> Principles inherited unchanged: TDD, frequent commits, no over-engineering.

### 5.8 New 002-cloudflare-worker spec scope

The spec-kit feature `002-cloudflare-worker/` (to be produced by `/speckit.specify`) covers:

- The Worker side (everything in §1 / §2 about the Worker runtime, with the §4 proxy fix applied)
- The Node side `/app-api/*` additions (§3)
- The monorepo refactor (everything in §5 — file moves, two tsconfigs, two vitest configs, etc)

i.e. it's one feature spec describing "introduce the Cloudflare Worker variant alongside the existing Node baseline", with the monorepo restructure being the unifying envelope.

---

## §6 Confirmed Decisions Log

These were settled in chat between 2026-04-29 and 2026-04-30:

| #   | Topic                                 | Decision                                                                                                                                                                         |
| --- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Goal of variant                       | Starter (clean, minimal-deps, readable, fork-friendly)                                                                                                                           |
| 2   | Worker data layer                     | Hybrid: D1+KV direct + reverse proxy `/app-api/*` to nodejs (Postgres+Redis)                                                                                                     |
| 3   | Worker → nodejs bridging              | `UPSTREAM_URL` env var (vars in dev, secret in prod) + cloudflared tunnel for prod                                                                                               |
| 4   | Demo surface                          | Read-only: /health on each side, /d1/now vs /app-api/now, /kv/echo vs /app-api/echo                                                                                              |
| 5   | Approach selection                    | "Idiomatic Workers + spec-kit mirrored" (Approach 3 in original brainstorm)                                                                                                      |
| 6   | Repo layout                           | **Unified monorepo (Option 1)** — single repo, `src/{node,worker,shared}` parallel                                                                                               |
| 7   | identity for new repo                 | `Andrew Hsieh <anew7237@gmail.com>` (worker's existing `.git/config`)                                                                                                            |
| 8   | 001 source                            | `origin/001-superspec-baseline` of nodejs repo (NOT `main` — 001 has full spec-kit deliverable + http-metrics fix that main is missing)                                          |
| 9   | History preservation                  | None — fresh `git init`, clean commit chain                                                                                                                                      |
| 10  | Existing standalone worker repo       | Tear down (16 commits discarded after this doc captures the lessons)                                                                                                             |
| 11  | nodejs `002-app-api-endpoints` branch | Delete after monorepo lands (`git -C claude-superspec-nodejs branch -D 002-app-api-endpoints`)                                                                                   |
| 12  | nodejs `main`                         | Untouched; remains the source of truth for the "node-only" world if anyone wants it                                                                                              |
| 13  | Push policy                           | No push without user command. CLAUDE.md rule preserved in monorepo                                                                                                               |
| 14  | Auto-commit during subagent execution | Approved when explicitly running subagent-driven-development workflow                                                                                                            |
| 15  | Proxy semantics                       | **Passthrough** (forward `/app-api/*` verbatim to upstream; do NOT strip prefix). Per §4 fix                                                                                     |
| 16  | Sibling claude-superspec-nodejs/      | Stays as historical reference repo; not touched by monorepo work                                                                                                                 |
| 17  | Docker asset location                 | **Kept at repo root** (`Dockerfile`, `docker-compose.yml`, `scripts/db-init/`). Reversed 2026-04-30 during T-migration execution to avoid DevContainer/Makefile rework. See §5.6 |

---

## §7 Suggested input to /speckit.specify

Feed this whole doc to `/speckit.specify` with a prompt along the lines of:

> Generate the formal feature spec for `002-cloudflare-worker/` in the unified monorepo. Source of truth is `.docs/20260430a-cloudflare-worker.md` — incorporate §5's monorepo structure, §1–§3's Worker + Node-side functionality, and §4's corrected proxy semantics. Apply the lessons from §2.3. Place output at `.specify/specs/002-cloudflare-worker/spec.md` per spec-kit conventions.

The resulting `spec.md` should be technology-agnostic (User Stories + FR-XXX + SC-XXX + Acceptance) per the spec-template.md format, while `plan.md` (subsequent step) covers the technology choices and task breakdown.

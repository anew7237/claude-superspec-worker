# Phase 1 Data Model: Cloudflare Worker Runtime + Monorepo Dual-Runtime Refactor

**Date**: 2026-04-30
**Spec**: [spec.md](./spec.md) — see "Key Entities" section
**Plan**: [plan.md](./plan.md)

> **Note**:本 feature 含兩類 entity:(A) Worker runtime / Bindings / Wrangler config 等
> **infrastructure entities**(屬 process / governance);(B) D1 表結構為 placeholder
> 不引入 application-domain schema。請求 / 回應為**暫態結構**(per HTTP request lifetime),
> 不持久化。

## 1. Worker Runtime Entry

`src/worker/index.ts` — Hono app 實例 + `export default { fetch: app.fetch } satisfies ExportedHandler<Env>`。

**Attributes**:

- `routes`:4 sub-router(health / d1 / kv / proxy)透過 `app.route('/', xxxRoute)` 掛載
- `onError`:catch uncaught exception → `jsonError(500, 'internal')` + `console.error('unhandled', err)`
- `notFound`:`jsonError(404, 'not_found')`

**Invariants**:

- Worker entry 只導 4 sub-router + jsonError helper,不 import Node-only modules(per FR-009 + 001 baseline FR-022)
- 所有 catchable exception 統一走 jsonError + console.error(per FR-010 + 觀測 contract)

## 2. Bindings (Env) — Worker side

`src/worker/env.ts` — TypeScript interface:

```ts
export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  UPSTREAM_URL: string;
}
```

**Attributes**:

- `DB`:D1 database binding,於 `wrangler.jsonc` `d1_databases` 宣告(`binding: "DB"`),deploy 時對應實體 D1 namespace
- `KV`:KV namespace binding,於 `wrangler.jsonc` `kv_namespaces` 宣告(`binding: "KV"`)
- `UPSTREAM_URL`:string env var,於 `wrangler.jsonc` `vars` 宣告預設值;production 走 `wrangler secret put` override

**Lifecycle**:

- 由 Cloudflare runtime 於 fetch handler 注入;Worker 不持有 Env 實例,只透過 Hono `c.env` access
- 本機 dev 經 miniflare(via `cloudflareTest` plugin 或 `wrangler dev`)模擬注入

## 3. Wrangler Configuration

`wrangler.jsonc`(repo root)。

**Attributes**:

```jsonc
{
  "name": "claude-superspec-worker",
  "main": "src/worker/index.ts",
  "compatibility_date": "2025-09-01",
  "vars": { "UPSTREAM_URL": "http://localhost:8000" },
  "d1_databases": [
    { "binding": "DB", "database_name": "claude-superspec-worker", "database_id": "<填於 wrangler d1 create 後>" },
  ],
  "kv_namespaces": [{ "binding": "KV", "id": "<填於 wrangler kv namespace create 後>" }],
}
```

**Invariants**:

- **不啟** `compatibility_flags: ["nodejs_compat"]`(per 設計源 §2.3 lesson 7)
- **不寫 secret 進此檔**;secret 走 `wrangler secret put` 或 `.dev.vars`(gitignored)
- `database_id` / `id` 之 placeholder 須在 first-time deploy walkthrough 由 adopter 填入

## 4. Reverse Proxy Pair(Worker side + Node side 對照)

**Worker side proxy** — `src/worker/routes/proxy.ts`:

- Path:`ALL /app-api/*`(全 method)
- 行為:passthrough — `${UPSTREAM_URL}${incoming.pathname}${incoming.search}`(不剝 prefix,per §4 fix)
- Timeout:10s 經 `AbortSignal.timeout(10_000)`
- Error model:503 / 502 / 504(per FR-007)

**Node side counterpart** — 新增於 `src/node/app.ts`:

- `GET /app-api/health` → `{status:"ok", service:"nodejs"}`(touches no binding)
- `GET /app-api/now` → `pool.query('SELECT NOW() AS now')` → `{source:"postgres", now}`;失敗 500 + `{error:"pg_query_failed"}`;empty result 500 + `{error:"pg_empty_result"}`
- `GET /app-api/echo?k=<key>` → `redis.get(key)` → `{source:"redis", key, value}`;空 query 400 + `{error:"missing_param"}`;miss 404 + `{error:"not_found"}`;失敗 500 + `{error:"redis_get_failed"}`

**Invariants**:

- Worker side `/app-api/X` 與 Node side `/app-api/X` 之 path **完全 1:1 對應**;Worker passthrough 不改寫 query / headers / body
- Node 端 `/app-api/*` 與 Worker `/app-api/*` 同 path 但不同 origin(讀者可分別 curl host:8000 vs host:8787 比對結果)
- Node side 之 3 條 route 自動繼承既有 http-metrics middleware(`/*` mount,per 001 observability.md §1.4 invariant 1)

## 5. Worker Routes(4 個 sub-router)

每個皆為 `Hono<{ Bindings: Env }>` 實例,於 `src/worker/index.ts` 透過 `app.route('/', xxxRoute)` 掛載。

| Route | File | Method | Path | Body 處理 |
| --- | --- | --- | --- | --- |
| Health | `routes/health.ts` | GET | `/health` | `{status:"ok", service:"worker", ts:<ISO>}`,touches no binding |
| D1 | `routes/d1.ts` | GET | `/d1/now` | `env.DB.prepare("SELECT CURRENT_TIMESTAMP AS now").first()` |
| KV | `routes/kv.ts` | GET | `/kv/echo` | `env.KV.get(c.req.query('k'))`;3 分支(missing param / hit / miss) |
| Proxy | `routes/proxy.ts` | ALL | `/app-api/*` | passthrough fetch(`AbortSignal.timeout(10_000)`) |

**Lifecycle**:

- Worker 於每次 fetch 由 runtime invoke;sub-router 之 handler 為 stateless 函式,無 module-level state
- D1 / KV exception 內部 catch,以 `jsonError` 統一輸出

## 6. Dual TypeScript Configuration

3 個檔案共構雙 runtime type isolation(per FR-002):

| File | Role | Key fields |
| --- | --- | --- |
| `tsconfig.json` | Base | `strict: true`、`target: "ES2022"`、`moduleResolution: "Bundler"`、`exactOptionalPropertyTypes: true`、`noEmit: true`、無 `include` |
| `tsconfig.node.json` | Node side | `extends: "./tsconfig.json"`、`types: ["node"]`、`include: ["src/node/**/*", "src/shared/**/*", "tests/node/**/*"]` |
| `tsconfig.worker.json` | Worker side | `extends: "./tsconfig.json"`、`types: ["@cloudflare/workers-types/2023-07-01", "@cloudflare/vitest-pool-workers/types"]`、`include: ["src/worker/**/*", "src/shared/**/*", "tests/worker/**/*", "vitest.config.worker.ts"]` |

**Invariants**:

- 兩 tsconfig `include` 不重疊(除 `src/shared/**`);Node 端 import workers-types 之 `D1Database` 等 fail at typecheck(因 Node tsconfig types 不含),反之亦然
- `pnpm typecheck` 串接執行兩 tsconfig 後 exit 0 才視為通過(per FR-002 + spec SC-001)

## 7. Dual Vitest Pools

2 個 config 檔(per plan key decision 8):

| File | Role | Test target |
| --- | --- | --- |
| `vitest.config.node.ts` | Node pool | `tests/node/**/*.test.ts` via plain vitest |
| `vitest.config.worker.ts` | Worker pool | `tests/worker/**/*.test.ts` via `cloudflareTest` plugin → miniflare |

**Invariants**:

- Worker pool **不打真 Cloudflare API**(per FR + SC-004);所有 D1/KV 經 miniflare in-memory 模擬
- `pnpm test` script 串接 `pnpm test:node` && `pnpm test:worker`,任一 fail 即整體 fail

## 8. Constitution Variant Amendment

`.specify/memory/constitution.md` 內新增 "Variant Amendment — Cloudflare Worker Companion (2026-04-30)" 段(per 設計源 §5.7 revised text)。

**State transitions**:

- v1.0.0(本 feature 落地前) → v1.1.0(MINOR;新增 amendment 段;sync_impact_report block 紀錄此版本變動 + follow-up TODOs 之變化)
- 後續憲法升版(MAJOR / MINOR / PATCH)依 §Governance 流程,本 amendment 為 minor 段落新增

**Sync impact**:

- spec / plan / contracts 皆 cite v1.0.0;升版 v1.1.0 後本 feature 之 spec / plan 之 Constitution Check anchor 仍寫 v1.0.0(因 amendment 與 spec 同 commit 套入,Check 段為 amendment 套入前驗證)
- 既有 001-superspec-baseline 之 spec / plan / contracts 不需 retro-update(已 merge 主線),但 traceability matrix 之「constitution 版本」可考慮 polish

## 9. README Comparison Surface

新增於 `README.md`(本 feature 主目錄),含:

- 002 介紹段(dual-runtime 並存)
- 對照表(3 row × 2 col):health / now / echo × Cloudflare-native / through Node proxy
- Mode A walkthrough(`pnpm dev:node + dev:worker` quick demo)
- Mode B walkthrough(`make up + dev:worker` 完整 demo,含 host.docker.internal 註)
- First-time deploy walkthrough(per FR-012 / SC-005)

## 10. Process Entities(per 001 baseline data-model.md §6 / §7 之 Worker placeholder 兌現)

001 baseline data-model.md §6 Application Stack (Worker, Reserved) 之 forward-declared
attributes 自本 feature 起全 active:

- `entry_point`:`src/worker/index.ts` ✅
- `routes`:`/health`、`/d1/now`、`/kv/echo`、`ALL /app-api/*` ✅(passthrough,per §4)
- `bindings`:`DB`(D1)、`KV`、`UPSTREAM_URL` ✅
- `tests_directory`:`tests/worker/` ✅(via `@cloudflare/vitest-pool-workers`)
- `deploy_target`:Cloudflare edge via `wrangler deploy` ✅(無 image)

001 baseline data-model.md 在本 feature merge 後**可 polish 加註「自 002 起 active」**,但本 feature
不修 baseline 既有檔案(屬未來 polish PR)。

## Relationships(高階)

```
Adopter ──uses──▶ DevContainer(共用)
Adopter ──選 mode A/B──▶ Node Stack ⨉ Worker Runtime 並存
Worker Runtime ──reads──▶ Bindings(D1/KV/UPSTREAM_URL)
Worker Routes(/d1, /kv, /health) ──direct──▶ Bindings
Worker Routes(/app-api/*) ──passthrough──▶ UPSTREAM_URL → Node /app-api/*
Node Routes(/app-api/*) ──read──▶ pg / redis(既有 baseline)
Dual TypeScript Configuration ──gates──▶ pnpm typecheck(per FR-002)
Dual Vitest Pools ──gates──▶ pnpm test(per FR-003)
Constitution v1.1.0 ──supersedes──▶ v1.0.0 + Variant Amendment 段
```

每條關係之不變量寫於對應實體 attributes / lifecycle 段。

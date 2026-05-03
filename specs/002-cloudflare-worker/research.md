# Phase 0 Research: Cloudflare Worker Runtime + Monorepo Dual-Runtime Refactor

**Date**: 2026-04-30
**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)

## Section 1 — Clarifications(已固化)

### 1.1 Side-by-side 並存運行的 canonical 模式 + UPSTREAM_URL 連通性(Q1)

**Decision**:**雙 mode 並行支援**:

- **Mode A**(quick demo):`pnpm dev:node` + `pnpm dev:worker` 純 host process 並起;UPSTREAM_URL=`http://localhost:8000`;適用 `/app-api/health` 透傳 demo;**不**支援 `/app-api/now` `/app-api/echo`(無 Postgres/Redis backing)。
- **Mode B**(完整 demo):`make up`(docker compose 帶 Postgres + Redis + healthcheck)+ `pnpm dev:worker`;UPSTREAM_URL=`http://host.docker.internal:8000`(dev container 內)或 `http://localhost:8000`(host 內 wrangler dev);6 個對照 endpoint 全可 demo。

**Rationale**:

- Mode A 入門極快(`pnpm install` 後一條命令 + 一條),但 demo 表面有限(僅 health 透傳)。
- Mode B 為完整 comparison demo(D1 vs Postgres、KV vs Redis、proxy 透傳),但需多一層 docker stack 啟動。
- README 兩段並列,讀者依需求選 — 先用 A 驗 setup,再升 B 看完整對照。

**Alternatives Considered**:

- 只支援 Mode A:rejected — `/app-api/now` `/app-api/echo` 為核心 demo value,缺則 §1.4 對照表崩盤。
- 只支援 Mode B:rejected — 入門 friction 大,新讀者放棄機率高。
- Delegate to plan / docs:rejected — Q1 直接影響 spec 之 acceptance scenario + FR-015 + SC,屬 spec-level。

**Spec impact**:`## Clarifications` Session 2026-04-30 + US1 acceptance 改寫雙 mode + FR-015 改寫 + SC-011 雙 mode 計時。**Plan-level decision(2026-05-04 cross-spec review 修正)**:Mode B UPSTREAM_URL 採 location-aware default,**取決於 wrangler dev 運行位置**:

- wrangler dev 跑於 host(WSL2 / Mac / Windows native)→ `http://localhost:8000`(T036 SC-011 acceptance 即此情境)
- wrangler dev 跑於 dev container 內 → `http://host.docker.internal:8000`

`.dev.vars.example` 已採此規則。原舊版「canonical = `host.docker.internal`」之 plan/research 描述為 dev-container-only assumption,與實際 T036 acceptance(WSL2 host wrangler → `localhost:8000`)矛盾,以本段為準。

## Section 2 — 設計源 §6 Decisions Log(已固化,本 feature 直接 cite 不重 derive)

| #   | Topic                          | Decision                                                                                  |
| --- | ------------------------------ | ----------------------------------------------------------------------------------------- |
| 1   | Goal of variant                | Starter(clean / minimal-deps / readable / fork-friendly)                                  |
| 2   | Worker data layer              | Hybrid:D1+KV direct + reverse proxy `/app-api/*` to Node(Postgres+Redis)                  |
| 3   | Worker → Node bridging         | `UPSTREAM_URL` env var(vars in dev,secret in prod)+ cloudflared tunnel for prod          |
| 4   | Demo surface                   | Read-only:/health × 2 / /d1/now vs /app-api/now / /kv/echo vs /app-api/echo               |
| 5   | Approach                       | Idiomatic Workers + spec-kit mirrored                                                     |
| 6   | Repo layout                    | **Unified monorepo** — `src/{node,worker,shared}` parallel,單一 `.specify/`              |
| 9   | History preservation           | None — fresh `git init`(已落地於 `claude-superspec-worker`,本 feature 不繼承 standalone) |
| 15  | Proxy semantics                | **Passthrough** — worker `/app-api/X` → upstream `/app-api/X`(per §4 修正)               |
| 17  | Docker asset location          | **Repo root**(`Dockerfile` `docker-compose.yml` `scripts/db-init/`),已落地於 001        |

## Section 3 — Lessons from standalone repo's 16-commit run(設計源 §2.3)

每條皆於本 feature plan 階段被 mandatory 應用。

### 3.1 `@cloudflare/vitest-pool-workers` `defineWorkersConfig` 不存在(lesson 1)

**Symptom**:`import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';` fail at compile time(`/config` subpath export 不在 v0.15.1 之 `exports` 內)。

**Fix**:用 `cloudflareTest` plugin pattern:

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

### 3.2 `tsconfig.worker.json` `types` 須含 `@cloudflare/vitest-pool-workers/types`(lesson 2)

**Symptom**:`import { env, createExecutionContext } from 'cloudflare:test'` 解析失敗(僅 `@cloudflare/workers-types/2023-07-01` 不夠)。

**Fix**:`tsconfig.worker.json` 之 `types: ["@cloudflare/workers-types/2023-07-01", "@cloudflare/vitest-pool-workers/types"]`(per §5.5)。

### 3.3 `declare module 'cloudflare:test' { interface ProvidedEnv }` augmentation 失效(lesson 3)

**Symptom**:`env` import 為 `Cloudflare.Env`(空 mergeable interface),augmentation 不生效。

**Workaround**:tests 內 cast:

```ts
import type { Env } from '../src/env';
const baseEnv: Env = { ...(env as unknown as Env), UPSTREAM_URL: 'http://upstream.test' };
```

(可保留 `declare module` block 為文件 parity,但實際 type narrowing 仍靠 cast。後續可抽 typed-env helper,屬 polish。)

### 3.4 `exactOptionalPropertyTypes: true` 拒 inline ternary undefined(lesson 4)

**Symptom**:`const init = { method, headers, body: isBodyless ? undefined : raw.body };` fail(因 `body` 為 optional;不可 inline 賦 undefined)。

**Fix**:逐步建構物件:

```ts
const init: RequestInit = { method, headers };
if (!isBodyless) init.body = raw.body;
```

(影響 `src/worker/routes/proxy.ts` 寫法。)

### 3.5 ESLint 9 `no-unused-vars` `argsIgnorePattern` 須顯式設(lesson 5)

**Symptom**:`app.onError((err, _c) => ...)` 內的 `_c` 仍被 ESLint 報 unused。

**Fix**:`eslint.config.js` 加:

```js
{
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
},
```

### 3.6 `.prettierignore` 須含 `.specify/` + `CLAUDE.md` + `wrangler.jsonc`(lesson 6)

**已落地於 001 baseline T002.preq commit `fcd54b4`**,本 feature 沿用無需動。

### 3.7 不需 `nodejs_compat` flag(lesson 7)

**Reason**:Hono + D1 + KV + global `fetch` 為純 Workers APIs。**不**加 `compatibility_flags: ["nodejs_compat"]`。

## Section 4 — 替代方案(已評估後 reject)

| 替代方案 | 為何 reject |
| --- | --- |
| Vitest 4 `projects` 單 config 檔 | 兩 config 檔之 debug + CI matrix 拆分更乾淨;`projects` 屬 polish 階段合併選項 |
| Worker 直連 Postgres / Redis(走 Hyperdrive 等) | 超出 starter scope;設計源 §6 #2 已固化「D1+KV direct + proxy」混合模式 |
| Drop `tsconfig.lint.json`,合進雙 tsconfig | 本 feature 不重構既有 ESLint 結構;沿用 baseline |
| 用 `wrangler types` 自動生成 Env interface | 僅 0.15+ 後支援;本 feature 鎖 0.15.x,且手寫 Env 三欄不繁瑣 |
| Worker 端引 logger 抽象(統一兩 runtime API) | 設計源明確:Worker 走 console、Node 走 pino;不引共用 abstraction(YAGNI) |
| `compatibility_date` 用 `latest` | reject — 設計源 §1.5 / §2 / §5.4 全 cite `2025-09-01`;鎖死版本利於 reproducibility |

## Section 5 — Out-of-Scope / Deferred(本 feature 刻意不做)

- **Worker → Node auth**(設計源 §1.5):starter 不實作 shared-secret header 或 Cloudflare Access;production 由 adopter 自加。
- **D1 schema migration runtime**:`/d1/now` 用 `SELECT CURRENT_TIMESTAMP`,無 schema。實質 schema 屬 adopter 自家 feature。
- **KV write routes**:starter 只 demo 讀;`wrangler kv key put` 為 seed 工具,不暴露 HTTP write endpoint。
- **Rate limiting / circuit breaker / retry**(設計源 §1.6):starter 不引;production 由 Cloudflare WAF 或 adopter 上層加。
- **Multi-environment wrangler envs**(staging / production):單一環境 starter;envs 屬 future feature。
- **Custom domain configuration**:wrangler 自動分配 `<worker-name>.<account>.workers.dev`;custom domain 由 adopter 自設。
- **`/metrics` endpoint on Worker**(per 001 baseline observability.md §2.1):**out of scope**;Workers 走 Cloudflare 內建 analytics,prom-client 不引。
- **CI workflow for dual-runtime**(001 baseline FR-017 known gap):本 feature 不建 `.github/workflows/`;屬未來 feature 範疇。
- **README rewrite for v1.1.0 constitution**(設計源 §1.12 / §5.7 amendment):本 feature 寫 amendment 段 + README 加 002 介紹,但不大改既有 README 結構。

## Section 6 — 結論

- 本 feature 之所有 unknown 已被 spec.md `## Clarifications` Q1 + 設計源 §6 Decisions Log + §2.3 Lessons 解決;0 條 NEEDS CLARIFICATION 待 plan 處理。
- Phase 0 結束。Phase 1 進入 design artifacts(data-model / 4 contracts / quickstart)。
- Plan 之 Project Structure section 8 條 key decisions 為 Phase 1 contracts 之 anchor。

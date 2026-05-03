# Implementation Plan: Cloudflare Worker Runtime + Monorepo Dual-Runtime Refactor

**Branch**: `002-cloudflare-worker` | **Date**: 2026-04-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-cloudflare-worker/spec.md`

## Summary

把 Cloudflare Worker runtime 落地到 unified monorepo,兌現 001-superspec-baseline 對 Worker 端的
4 條 forward-declarations(FR-018 reference application / FR-021 結構 / FR-022 mechanical cross-runtime
import ban / SC-011 violation count active)。範圍含 4 個 Worker route(`/health`、`/d1/now`、
`/kv/echo`、`/app-api/*`)+ Node 端 3 個對照 route(`/app-api/{health,now,echo}`)+ 雙 tsconfig +
雙 vitest pool + wrangler 配置 + 憲法 v1.0.0 → v1.1.0 Variant Amendment + README 兩 mode walkthrough。

**技術取徑**:Hono 4.x 跨兩 runtime 共用(Node 走 `@hono/node-server`、Worker 走 `export default
{fetch}`);D1 + KV bindings 經 `wrangler.jsonc` 宣告,test 階段由 `@cloudflare/vitest-pool-workers`
驅動 miniflare 提供 in-memory 等價物;反向代理 `/app-api/*` 純 passthrough(per §4 修正,不剝
prefix);`tsconfig.{node,worker}.json` 各帶獨立 `types` array,共用 `tsconfig.json` base,
`tsconfig.lint.json` 已存,本 feature 沿用。Mode A(`pnpm dev:node` + `dev:worker` 純 host)+
Mode B(`make up` + `dev:worker`)雙 entry,UPSTREAM_URL 文件化兩值(per Q1 Clarification)。

## Technical Context

**Language/Version**:TypeScript 5.7+(strict)— 沿用 baseline,雙 tsconfig 各自啟 `types`。

**Primary Dependencies**:

- 共用:`hono ^4`(已存於 baseline `package.json`)
- Worker 新增:`wrangler ^4`(初版 `^3`,2026-05-03 升 `^4` 解 transitive dedupe drift)、`@cloudflare/workers-types ^4`、`@cloudflare/vitest-pool-workers ^0.15`(devDependencies)
- Node 不新增 deps(`/app-api/*` 三 route 用既有 `pg` `redis`)

**Storage**:Worker side — D1(SQL,`SELECT CURRENT_TIMESTAMP` placeholder)+ KV(read-only echo);
Node side — Postgres + Redis(既有)。本 feature 不引入持久化 schema 變動(D1 為 placeholder)。

**Testing**:vitest 4.x 雙 pool。Node pool 用 plain `vitest/config`;Worker pool 用
`@cloudflare/vitest-pool-workers` 之 `cloudflareTest` plugin pattern(per 設計源 §2.3 lesson 1
驗證之版本,**避免** `defineWorkersConfig` 因 `/config` subpath 不存在而 fail)。Vitest 4 之
`projects` 特性在本 feature 採「兩 config 檔」路線,理由:可獨立執行 `pnpm test:node` /
`pnpm test:worker`,debug 與 CI matrix 拆分更乾淨;單檔 `projects` 路線屬未來合併簡化選項。

**Target Platform**:

- Worker 部署:Cloudflare edge `wrangler deploy`,compatibility date `2025-09-01`(per 設計源)
- Node 部署:既有 multi-stage Dockerfile + docker-compose(無變動)
- 本機 dev:macOS Apple Silicon + WSL2 Ubuntu 雙平台,於 dev container 或 host 運行

**Project Type**:既有 monorepo + Worker runtime + 結構性重構(雙 tsconfig / 雙 vitest)。屬
「擴充既有 Node 應用為 dual-runtime monorepo」性質,**不**重寫既有 Node 應用程式碼;只新增
`src/node/app.ts` 內 3 條 `/app-api/*` route。

**Performance Goals**(per spec SC-010):

- Worker `/health` p50 ≤ 50ms(Cloudflare edge,無 binding)
- Worker `/d1/now` p50 ≤ 200ms(D1 query)
- Worker `/app-api/*` 之 worker overhead ≤ 50ms(扣 upstream 處理)
- Worker bundle 大小 < 1 MB(per starter scope,僅 Hono + workers types)

**Constraints**:

- **不可** 在 Worker bundle 引入 `pg` / `redis` / `pino` / `prom-client` / `@hono/node-server` / `fs` / `child_process`(per spec FR-009 + 001 baseline FR-022)
- **不可** 啟用 `nodejs_compat` flag(per 設計源 §2.3 lesson 7;增加 runtime 體積無收益)
- **不可** 把 secret 寫進 `wrangler.jsonc`(per spec FR-011);secret 走 `wrangler secret put` 或 `.dev.vars`(`.gitignore` 已含,by 001 baseline T001)
- **MUST** 維持既有 mandatory gates 全綠(per spec SC-009);`pnpm typecheck` 串接雙 tsconfig 後 exit 0,`pnpm test` 整合雙 pool 後綠
- **MUST** 跨 Mac M1 + WSL2 100% test 等價(per spec SC-002 + Q2 Clarification of 001 baseline 自本 feature 起對 Worker pool 啟動)
- **`/app-api/*` 必 passthrough** 不剝 prefix(per spec FR-007 + §4 修正);worker `/app-api/X` → `${UPSTREAM_URL}/app-api/X`
- **Mode B dev container → host docker compose 連通性**(per Q1 Clarification + Edge Cases):dev container 內 wrangler dev 透過 `localhost:8000` 不一定能達 host published port;plan 階段選擇 `host.docker.internal`(Mac/Win Docker Desktop 原生支援;Linux Docker Desktop 4.0+ 亦支援)為 mode B 之預設 UPSTREAM_URL,於 README 註明若 host 自架 Docker Engine(無 Docker Desktop)可能需 `--add-host=host.docker.internal:host-gateway` runArg

**Scale/Scope**:

- 新檔案:約 25-30 個(`src/worker/{index,env,error}.ts` + 4 routes + `tests/worker/` 5 test 檔 + 雙 tsconfig + 雙 vitest config + `wrangler.jsonc` + `.dev.vars.example`)
- Node side 變更:`src/node/app.ts` +3 routes + `tests/node/app-api.test.ts`(來自設計源 §3 reference)
- 配置變更:`package.json` scripts 重編(`dev:node`、`dev:worker`、`test:node`、`test:worker`、`typecheck` 串接雙 tsconfig 等)+ 新 deps 入 `devDependencies`、`tsconfig.json` 改為 base、新增 `tsconfig.{node,worker}.json`
- 憲法:v1.0.0 → v1.1.0(MINOR,新增 Variant Amendment 段)
- README:本 feature 之主目錄 README 須含對照表 + mode A/B walkthrough(可 batch 進入 polish phase)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

依憲法 v1.0.0 五原則對照本 plan:

| Principle | 對齊狀態 | 證據 / 對應 |
| --- | --- | --- |
| **I. Test-First Development (NON-NEGOTIABLE)** | ✅ 對齊 | Worker 端 4 routes 各先寫 `tests/worker/{health,d1,kv,proxy}.test.ts`(RED)再寫 implementation(GREEN);Node side 3 個 `/app-api/*` route 同模式於 `tests/node/app-api.test.ts`(per 設計源 §3.2 reference)。雙 vitest pool 對應雙 RED→GREEN 循環。 |
| **II. Observability by Default** | ✅ 對齊 | Worker 端走 `console.log` / `console.error`(Workers Logs + `wrangler tail`);**不引** `pino` / `prom-client` 進 Worker bundle(per spec FR-010 + 001 baseline observability.md §2)。Node side 既有 pino + prom-client + http-metrics middleware 不變;`/app-api/*` 三 route 自動繼承 per-route metrics(observability.md §1.4 invariant 1)。 |
| **III. Container-First Development, Per-Runtime Deployment** | ✅ 對齊 | Node 端持續走 Dockerfile + docker-compose;Worker 端走 `wrangler deploy`(無 image),per 憲法 §III「per-runtime deployment is intentionally diverges」。本 feature 無需於 dev container 加 wrangler feature(`pnpm install` 帶入)。Mode B dev container → host docker compose 連通透過 `host.docker.internal`(plan 決定)。 |
| **IV. Type Safety End-to-End** | ✅ 對齊 + **強化** | 雙 tsconfig 結構落地,**Node 端 import D1Database / Worker 端 import pg 等違規於 typecheck 階段機械擋下** — 本 feature 即「001 baseline FR-022 aspirational → mechanical active」之啟動點(per spec FR-002 + SC-001)。`tsconfig.lint.json` 沿用,擴大 ESLint 涵蓋至雙 runtime。 |
| **V. Spec-Driven Development** | ✅ 對齊 | 本 plan 即 SDD pipeline 產物;feature branch `002-cloudflare-worker` 由 `before_specify` hook 建立(`GIT_BRANCH_NAME` 顯式覆蓋以對齊 baseline 21 處 cite);spec 已通過 16/16 quality checklist;1 條 Q1 Clarification 已記錄於 `## Clarifications`;本 plan 含 Constitution Check 對照憲法 v1.0.0(post-amendment 將升 v1.1.0,本 plan 之 Constitution Check anchor 仍為 v1.0.0,因 amendment 由本 feature 落地時同 commit 套入)。 |

**結論**:無 violations,Phase 0 可放行。本 feature 不引入任何 deviation,因此 Complexity Tracking
留空。**注意**:憲法升 v1.1.0 之 Variant Amendment 屬本 feature 之必要 deliverable(per spec
FR-016 + Assumption 7),amendment commit 與 spec/plan/contracts 為同 PR 範圍。

## Project Structure

### Documentation (this feature)

```text
specs/002-cloudflare-worker/
├── plan.md                  # 本檔(/speckit-plan 輸出)
├── spec.md                  # /speckit-specify + /speckit-clarify 輸出
├── research.md              # Phase 0 輸出 — 設計源 §1-§7 之決策固化 + 7 條 lessons + Q1 mode B networking
├── data-model.md            # Phase 1 輸出 — Worker entities(Env / RouteHandlers / ProxyTarget)+ Node side 對照 entity
├── quickstart.md            # Phase 1 輸出 — adopter mode A/B walkthrough + first-time deploy(SC-005)
├── contracts/               # Phase 1 輸出 — Worker 對外契約面
│   ├── worker-routes.md     #   4 個 Worker routes 之 request/response/error contract
│   ├── reverse-proxy.md     #   /app-api/* passthrough contract(error model + headers/body 透傳)
│   ├── bindings.md          #   D1 / KV / UPSTREAM_URL 之 Env interface contract
│   └── dual-tsconfig.md     #   雙 tsconfig 結構 + cross-runtime import ban mechanical contract
├── checklists/
│   └── requirements.md      # spec quality checklist(已通過 16/16)
└── tasks.md                 # Phase 2 輸出 — 由 /speckit-tasks 產生(本指令不建)
```

### Source Code (repository root)

```text
.
├── src/
│   ├── node/                            # 既有,本 feature 內 app.ts +3 routes
│   │   └── app.ts                       # +/app-api/{health,now,echo} insertion
│   │
│   ├── worker/                          # 【本 feature 新建】Worker runtime
│   │   ├── index.ts                     # entry: Hono app + routes + onError + notFound;export default { fetch }
│   │   ├── env.ts                       # interface Env { DB, KV, UPSTREAM_URL }
│   │   ├── error.ts                     # jsonError(status, code, hint?) helper
│   │   └── routes/
│   │       ├── health.ts                # GET /health
│   │       ├── d1.ts                    # GET /d1/now
│   │       ├── kv.ts                    # GET /kv/echo
│   │       └── proxy.ts                 # ALL /app-api/*(passthrough,§4 corrected)
│   │
│   └── shared/                          # 【本 feature 新建】runtime-agnostic
│       └── types.ts                     # 共用型別(starter 為空 placeholder;adopter 自家 entity 加進來)
│
├── tests/
│   ├── node/                            # 既有 + 1 新檔
│   │   └── app-api.test.ts              # 【本 feature 新增】per 設計源 §3.2 reference,5 cases for /app-api/*
│   │
│   └── worker/                          # 【本 feature 新建】
│       ├── error.test.ts                # jsonError unit tests
│       ├── health.test.ts               # GET /health(無 binding)
│       ├── d1.test.ts                   # GET /d1/now(miniflare D1)
│       ├── kv.test.ts                   # GET /kv/echo(seed + hit + miss + missing-param)
│       └── proxy.test.ts                # ALL /app-api/*(6 cases:200/404/missing/503/504/502)
│
├── wrangler.jsonc                       # 【本 feature 新建】Worker 配置
├── .dev.vars.example                    # 【本 feature 新建】local secrets template
│
├── tsconfig.json                        # 改為 base(strict / ES2022 / moduleResolution Bundler / noEmit)
├── tsconfig.node.json                   # 【本 feature 新建】extends base + types ["node"]
├── tsconfig.worker.json                 # 【本 feature 新建】extends base + types Workers
├── tsconfig.lint.json                   # 既有,擴大 include 至 src/worker + tests/worker
│
├── vitest.config.node.ts                # 【本 feature 新建】plain vitest config
├── vitest.config.worker.ts              # 【本 feature 新建】cloudflareTest plugin
│
├── package.json                         # scripts 重編 + 3 新 devDeps
├── pnpm-lock.yaml                       # 由 pnpm install 重生(屬本 feature 一次性)
├── eslint.config.js                     # 加 argsIgnorePattern: '^_' rule(per §2.3 lesson 5)
├── .prettierignore                      # 既有(已含 .specify/ + CLAUDE.md + wrangler.jsonc by 001 T002.preq);本 feature 無變
│
├── .specify/memory/constitution.md      # v1.0.0 → v1.1.0(MINOR;Variant Amendment 段新增,per §5.7 revised text)
├── .specify/feature.json                # 已指向 specs/002-cloudflare-worker/(已 set)
├── CLAUDE.md                            # SPECKIT marker 改指向 002 plan(本 plan step 3 處理)
└── README.md                            # 加段:002 dual-runtime 介紹 + 對照表 + mode A/B walkthrough + first-time deploy
```

**Structure Decision**:三層落地(Worker source / Worker tests / 雙 config 檔)。`src/worker/` 採
**routes/ 子資料夾結構**(per 設計源 §2.1 / §5.2)— 4 個 route 各自一檔便於 grep + test 對應;
`src/shared/` 為 starter 空 placeholder(僅型別 export),adopter 自家 feature 再填。`tests/worker/`
鏡像 routes/ 結構,加 1 個 `error.test.ts`(unit test for jsonError helper)。

**重要決策**(per 設計源 §2.3 lessons + Q1 Clarification):

1. **`@cloudflare/vitest-pool-workers` 鎖 `^0.15.x`**(lesson 1):用 `cloudflareTest` plugin pattern,**不** import `defineWorkersConfig`(該 subpath export 不存在)
2. **`tsconfig.worker.json` `types` 必含 `@cloudflare/vitest-pool-workers/types`**(lesson 2):否則 `cloudflare:test` 模組解析失敗
3. **不依賴 `declare module 'cloudflare:test' { interface ProvidedEnv }` augmentation**(lesson 3):tests 內 `cast` env 至 typed Env;後續可抽 helper(屬 polish)
4. **`exactOptionalPropertyTypes: true`** 仍開(沿用 baseline);(lesson 4)避免 inline ternary 對 optional field 賦 undefined,改逐步建構 RequestInit object(影響 `proxy.ts` 寫法)
5. **`eslint.config.js` 加 `argsIgnorePattern: '^_', varsIgnorePattern: '^_'`**(lesson 5):配合 `app.onError((err, _c) => ...)` 樣式
6. **不啟 `nodejs_compat`**(lesson 7):純 Workers APIs 即足夠
7. **Mode B UPSTREAM_URL 採 `host.docker.internal`**(Q1 Clarification + plan-level decision):README 註明 Linux 自架 Docker Engine(無 Docker Desktop)需 runArg `--add-host=host.docker.internal:host-gateway`,Mac/Windows Docker Desktop 4.0+ 預設支援
8. **Vitest 4 採兩 config 檔**(非 `projects` 單檔):便於獨立 `pnpm test:node` `pnpm test:worker` debug;polish 階段可考慮合併

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

(無 violation;本 feature 與五原則完全對齊)

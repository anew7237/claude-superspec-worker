---
description: "Tasks: 002-cloudflare-worker — Cloudflare Worker runtime + monorepo dual-runtime refactor"
---

# Tasks: Cloudflare Worker Runtime + Monorepo Dual-Runtime Refactor

**Input**: Design documents from `/specs/002-cloudflare-worker/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/(4 個:worker-routes / reverse-proxy / bindings / dual-tsconfig), quickstart.md

**Tests**: 本 feature **明示要求 TDD**(constitution v1.0.0 §I NON-NEGOTIABLE + spec acceptance criteria);所有 implementation 任務都先有對應 RED test;此檔列為 mandatory tests。

**Organization**: 依 spec.md 5 個 user stories 分相 phase。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: 不同檔、無未完成依賴,可平行
- **[Story]**: 對應 spec.md user story(US1 dual-runtime side-by-side / US2 typecheck cross-runtime ban / US3 reverse proxy demo / US4 miniflare test isolation / US5 first-time deploy)
- 跨 story / setup / polish 任務不帶 [Story]
- 描述含絕對檔案路徑(repo-relative)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**:引入 Worker 工具鏈 + 雙 tsconfig + 雙 vitest config + wrangler 配置 + scripts。**屬「孤立 commit per FR-019」候選**(本 phase 全部變動建議集中至 1-2 個 commits)。

- [ ] T001 [P] 於 `package.json` `devDependencies` 新增 `wrangler ^3` + `@cloudflare/workers-types ^4` + `@cloudflare/vitest-pool-workers ^0.15`;跑 `pnpm install`(無 `--frozen-lockfile`,允許 lockfile 漂移)重生 `pnpm-lock.yaml`。**注意**:此為 toolchain 升級候選,per 001 baseline FR-019 / `.docs/toolchain-upgrade-playbook.md` 屬孤立 commit 範疇。**對應 plan.md Technical Context + 設計源 §1.10/§5.3**
- [ ] T002 [P] 建立 `wrangler.jsonc`(repo root):依 contracts/bindings.md §2 結構,含 `name=claude-superspec-worker`、`main=src/worker/index.ts`、`compatibility_date=2025-09-01`、`vars.UPSTREAM_URL=http://localhost:8000`、`d1_databases[0].binding=DB`(database_id 留 placeholder)、`kv_namespaces[0].binding=KV`(id 留 placeholder)。**不**含 `compatibility_flags: ["nodejs_compat"]`(per 設計源 §2.3 lesson 7)。
- [ ] T003 [P] 建立 `.dev.vars.example`(repo root):依 contracts/bindings.md §5 之模板,含 mode A / mode B 兩條 UPSTREAM_URL 範例 + 註解(host.docker.internal + Linux runArg 提示)。
- [ ] T004 把既有 `tsconfig.json` 改為 base(per contracts/dual-tsconfig.md §1.1):移除 `include`,保留 strict / ES2022 / Bundler / noEmit 等 compilerOptions;**不**含 `types`(留給子 config)。
- [ ] T005 [P] 建立 `tsconfig.node.json`(per contracts/dual-tsconfig.md §1.2):extends base、`types: ["node"]`、`include: ["src/node/**/*", "src/shared/**/*", "tests/node/**/*"]`。
- [ ] T006 [P] 建立 `tsconfig.worker.json`(per contracts/dual-tsconfig.md §1.3):extends base、`types: ["@cloudflare/workers-types/2023-07-01", "@cloudflare/vitest-pool-workers/types"]`、`include: ["src/worker/**/*", "src/shared/**/*", "tests/worker/**/*", "vitest.config.worker.ts"]`。
- [ ] T007 修補 `tsconfig.lint.json`(per contracts/dual-tsconfig.md §1.4):types array 加 `"@cloudflare/workers-types/2023-07-01"`(讓 ESLint 全 repo lint 看得到 Worker side)。`include` 視需要擴大涵蓋 `src/worker/**` `tests/worker/**`(若原本只含 `src/**`/`tests/**` 萬用字 已涵蓋則無需動)。
- [ ] T008 [P] 修補 `eslint.config.js`(per 設計源 §2.3 lesson 5):於 `@typescript-eslint/no-unused-vars` rule config 加 `argsIgnorePattern: '^_', varsIgnorePattern: '^_'`。
- [ ] T009 [P] 建立 `vitest.config.node.ts`:`defineConfig` from `vitest/config`,`test.include: ['tests/node/**/*.test.ts']`(per plan key decision 8 + research.md §3.1)。
- [ ] T010 [P] 建立 `vitest.config.worker.ts`:用 `cloudflareTest` plugin from `@cloudflare/vitest-pool-workers`(**不** import `defineWorkersConfig`,per 設計源 §2.3 lesson 1),配置 `wrangler.configPath` + `miniflare.compatibilityDate=2025-09-01` + `d1Databases:['DB']` + `kvNamespaces:['KV']` + `bindings.UPSTREAM_URL='http://localhost:8000'`(per contracts/bindings.md §6 + research.md §3.1 完整代碼)。
- [ ] T011 修改 `package.json` `scripts`:加入 `dev:node`(`node --watch --experimental-strip-types --disable-warning=ExperimentalWarning src/node/index.ts`)、`dev:worker`(`wrangler dev`)、`test:node`(`vitest run --config vitest.config.node.ts`)、`test:worker`(`vitest run --config vitest.config.worker.ts`)、`test`(`pnpm test:node && pnpm test:worker`)、`typecheck`(`tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.worker.json`)、`logs:worker`(`wrangler tail`)、`db:migrate`(`wrangler d1 migrations apply claude-superspec-worker --remote`)、`deploy:worker`(`wrangler deploy`);保留既有 `dev` `start` 等。**對應 plan.md scripts 規劃 + 設計源 §5.3**

**Checkpoint**:Tooling 全套就位 — 雙 tsconfig + 雙 vitest config + wrangler 配置 + scripts 重編完成。下一 phase 始進入 Worker side runtime 程式碼。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**:Worker side 的 base 結構 + Constitution Variant Amendment。**⚠️ CRITICAL**:此 phase 完成前 user story 不可進入 RED 階段(因 Worker source 結構未定)。

- [ ] T012 [P] 建立 `src/worker/env.ts`(per contracts/bindings.md §1):export `interface Env { DB: D1Database; KV: KVNamespace; UPSTREAM_URL: string }`。
- [ ] T013 [P] 建立 `src/shared/types.ts`(per data-model.md §10):空 placeholder + 1 個 explanatory header comment 解釋此檔為 runtime-agnostic types/constants 目錄,starter 階段為空。
- [ ] T014 [P] [先 RED]建立 `tests/worker/error.test.ts`(per contracts/worker-routes.md §5.1):至少 3 cases 測 `jsonError` helper(不含 hint / 含 hint / 不同 status)。**RED**:`pnpm test:worker` 失敗(因 error.ts 尚未實作)。
- [ ] T015 [GREEN]建立 `src/worker/error.ts`(per contracts/worker-routes.md §5.1):export `jsonError(status, code, hint?)` 回 `Response`;Content-Type `application/json; charset=utf-8`。**GREEN**:T014 tests pass。
- [ ] T016 升級 Constitution:`.specify/memory/constitution.md` 加新段 "Variant Amendment — Cloudflare Worker Companion (2026-04-30)"(per 設計源 §5.7 revised text + plan.md FR-016);版本字串改 `**Version**: 1.1.0` + `**Last Amended**: 2026-04-30`;sync_impact_report HTML comment block 紀錄 1.0.0 → 1.1.0 變動 + 移除已落地之 follow-up TODOs(README v1.2.2 reference 已修)。**對應 spec FR-016 + plan Constitution Check 註記**

**Checkpoint**:Worker source 結構就緒 + Env + jsonError + Constitution v1.1.0 + Variant Amendment 落地。可進 user story implementation phase。

---

## Phase 3: User Story 1 - Dual-runtime side-by-side(Priority: P1)🎯 MVP

**Goal**:讀者於同 monorepo 同時起 Node + Worker 兩 runtime,六條 curl 對照(Worker `/health` `/d1/now` `/kv/echo` + Node `/app-api/{health,now,echo}`,經 Worker proxy 透傳)。MVP 至少含 mode A demo(`/health` + `/app-api/health` 透傳)。

**Independent Test**:乾淨 monorepo + `pnpm install` + 並起 Node stack + `pnpm dev:worker`,六條 `curl` 均回對應 200 + 預期 JSON 結構(per spec US1 acceptance scenarios)。

### Tests for User Story 1 (TDD mandatory) ⚠️

- [ ] T017 [P] [US1] [先 RED]建立 `tests/worker/health.test.ts`(per contracts/worker-routes.md §1):至少 2 cases — happy path 200 + body shape 比對 + ts 為 ISO 字串;touches no binding(D1/KV 不需 mock)。**RED**:Worker entry 未建,test fail。
- [ ] T018 [P] [US1] [先 RED]建立 `tests/node/app-api.test.ts`(per 設計源 §3.2 reference):Phase 3 階段含 `/app-api/health` 1 case(以 mock 模組 `../src/node/db` `../src/node/redis` 但 health 不需 db/redis;先寫 health case + skeleton import,後續 Phase 5 擴 now/echo cases)。**RED**:Node side `/app-api/health` 未實作,test fail。

### Implementation for User Story 1

- [ ] T019 [US1] [GREEN]建立 `src/worker/routes/health.ts`(per contracts/worker-routes.md §1):export `healthRoute = new Hono<{Bindings:Env}>()`,`healthRoute.get('/health', c => c.json({status:'ok',service:'worker',ts:new Date().toISOString()}))`。
- [ ] T020 [US1] [GREEN]建立 `src/worker/index.ts`(per data-model.md §1):import Hono + Env type + healthRoute + jsonError;`new Hono<{Bindings:Env}>()`、`app.route('/', healthRoute)`、`app.onError((err, _c) => { console.error('unhandled', err); return jsonError(500, 'internal'); })`、`app.notFound(() => jsonError(404, 'not_found'))`、`export default { fetch: app.fetch } satisfies ExportedHandler<Env>`。**GREEN**:T017 tests pass。
- [ ] T021 [US1] [GREEN]修改 `src/node/app.ts`(per contracts/reverse-proxy.md §4):於既有 `/health` 之後、`/metrics` 之前(或末段)新增 `app.get('/app-api/health', c => c.json({status:'ok', service:'nodejs'}))`。**GREEN**:T018 tests `/app-api/health` case pass。
- [ ] T022 [US1] verify Mode A side-by-side:`pnpm dev:node` + `pnpm dev:worker` 並起,curl 4 條(Worker `/health`、Node `/app-api/health`、Worker `/app-api/health` 透傳[但 mode A 需注意 UPSTREAM_URL=`http://localhost:8000`]、Mode A 註記 `/app-api/now` `/app-api/echo` 預期 fail 因無 db/redis)。記錄結果於 quickstart.md Step 8 acceptance。對應 spec **SC-011 mode A budget ≤ 5 min**

**Checkpoint**:US1 MVP 兌現 — Worker `/health` 自包含、Node `/app-api/health` 透傳可達、mode A demo 走通。

---

## Phase 4: User Story 2 - Typecheck cross-runtime import ban(Priority: P1)

**Goal**:Node 端誤 import Worker 型別 / Worker 端誤 import Node 模組,`pnpm typecheck` 機械失敗。**直接兌現 001 baseline FR-022 + SC-011 從 aspirational → mechanical active**。

**Independent Test**:模擬違規 PR,`pnpm typecheck` exit ≠ 0;還原後綠。詳見 contracts/dual-tsconfig.md §3。

### Tests for User Story 2 (TDD mandatory) ⚠️

- [ ] T023 [P] [US2] verify 雙 tsconfig 對 happy path 綠:暫時保留 src/worker/{env,error}.ts + 既有 src/node/** 已寫狀態,跑 `pnpm typecheck`,確認雙 tsconfig 串接 exit 0(positive baseline)。

### Implementation / Verification for User Story 2

- [ ] T024 [US2] [Negative test — 暫時違規然後還原]:於 `src/node/app.ts` 暫時加 `import type { D1Database } from '@cloudflare/workers-types';` + `let _x: D1Database | undefined;`,跑 `pnpm typecheck`,確認 exit ≠ 0 + stderr 指出 `Cannot find name 'D1Database'.` 或 `Cannot find module`。**還原** import,`pnpm typecheck` 重綠。記錄此手動驗證於 spec/contracts(per contracts/dual-tsconfig.md §3.1 兩面擋第一面)。
- [ ] T025 [US2] [Negative test — 同上,反向]:於 `src/worker/index.ts` 暫時加 `import { pool } from 'pg';`,跑 `pnpm typecheck`,確認 exit ≠ 0 + stderr 指出 `Cannot find module 'pg'`。**還原** import,`pnpm typecheck` 重綠。記錄(per contracts/dual-tsconfig.md §3.1 兩面擋第二面)。
- [ ] T026 [US2] verify `src/shared/**` 之 cross-tsconfig 涵蓋:於 `src/shared/types.ts` 暫時加 `import type { D1Database } from '@cloudflare/workers-types';` 確認**兩** tsconfig 都 fail(workers-types 在 node tsconfig 不存在;在 worker tsconfig 雖在但 shared 應為 runtime-agnostic 不該 import workers-types)。**還原**。

**Checkpoint**:US2 兌現 — typecheck 機械擋下 cross-runtime import,**001 baseline SC-011 啟動點**。

---

## Phase 5: User Story 3 - Reverse proxy demo(Priority: P2)

**Goal**:Worker side `/d1/now` `/kv/echo` `/app-api/*` + Node side `/app-api/now` `/app-api/echo` 全落地;Worker proxy 完整 passthrough(per §4 修正)。Mode B 完整 demo 6 條對照可達。

**Independent Test**:Mode B `make up` + `pnpm dev:worker`,六條 curl 全 200(per spec US3 acceptance)。

### Tests for User Story 3 (TDD mandatory) ⚠️

- [ ] T027 [P] [US3] [先 RED]建立 `tests/worker/d1.test.ts`(per contracts/worker-routes.md §2):2 cases — happy(miniflare D1 預設可跑 SELECT CURRENT_TIMESTAMP)+ d1 exception 路徑(用 `vi.spyOn` 攔 `env.DB.prepare` throw)。**RED**:`src/worker/routes/d1.ts` 未實作。
- [ ] T028 [P] [US3] [先 RED]建立 `tests/worker/kv.test.ts`(per contracts/worker-routes.md §3):3 cases — missing param 400 / hit 200(預先 seed `KV.put('foo','bar')` 於 test setup 或用 `env.KV.put()` 直接 inject)/ miss 404。**RED**:`src/worker/routes/kv.ts` 未實作。
- [ ] T029 [P] [US3] [先 RED]建立 `tests/worker/proxy.test.ts`(per contracts/reverse-proxy.md §7):6 cases — happy passthrough / upstream 4xx 透傳 / missing UPSTREAM_URL 503 / timeout 504 / network error 502 / query+path passthrough。用 `vi.stubGlobal('fetch', vi.fn())` mock 全 fetch。**RED**:`src/worker/routes/proxy.ts` 未實作。
- [ ] T030 [US3] [先 RED — 擴 T018 既有檔]於 `tests/node/app-api.test.ts` 加 4 cases:`/app-api/now` happy + pg_empty_result + `/app-api/echo?k=foo` happy + `/app-api/echo` missing-param 400 + `/app-api/echo?k=missing` 404。沿用設計源 §3.2 mock pattern(`vi.mock('../src/node/db')` `vi.mock('../src/node/redis')`)。**RED**:Node side handlers 未實作。

### Implementation for User Story 3

- [ ] T031 [P] [US3] [GREEN]建立 `src/worker/routes/d1.ts`(per contracts/worker-routes.md §2 + 設計源 §2.2):export `d1Route`;handler 於 try 內 `env.DB.prepare(...).first()`,empty → 500 d1_empty_result,catch → 500 d1_query_failed + console.error。
- [ ] T032 [P] [US3] [GREEN]建立 `src/worker/routes/kv.ts`(per contracts/worker-routes.md §3 + 設計源 §2.2):missing param 400 missing_param + hint;hit 200 source/key/value;miss 404 not_found;catch 500 kv_get_failed。
- [ ] T033 [US3] [GREEN]建立 `src/worker/routes/proxy.ts`(per contracts/reverse-proxy.md §1-§3 + 設計源 §2.2 corrected version):passthrough URL 構造 `${upstream.replace(/\/$/,'')}${incoming.pathname}${incoming.search}`、isBodyless 邏輯逐步建構 `RequestInit`(per §2.3 lesson 4)、AbortSignal.timeout(10_000)、catch DOMException AbortError → 504、其他 → 502 + console.error。
- [ ] T034 [US3] 修補 `src/worker/index.ts`:加 `app.route('/', d1Route)` `app.route('/', kvRoute)` `app.route('/', proxyRoute)`(置於 healthRoute 之後)。**GREEN**:T027/T028/T029 tests pass。
- [ ] T035 [US3] [GREEN]擴 `src/node/app.ts`(per contracts/reverse-proxy.md §4 + 設計源 §3.1):加 `/app-api/now`(`pool.query('SELECT NOW() AS now')` + 5xx 處理)+ `/app-api/echo`(`redis.get(query.k)` + 4xx/5xx 處理);log via `logger.warn` 不可 console.*。**GREEN**:T030 tests pass。
- [ ] T036 [US3] verify Mode B full demo:`make up`(壓 Postgres + Redis + healthy)、Redis seed `SET foo "hello-from-redis"`、`pnpm dev:worker` 起、`wrangler kv key put --binding=KV foo "hello-from-kv" --local`、跑全 6 條 curl(per quickstart.md Mode B Step 7),記錄於 quickstart.md acceptance。對應 spec **SC-011 mode B budget ≤ 10 min**

**Checkpoint**:US3 完整對照 demo 全綠 — Worker D1/KV/proxy + Node /app-api/* 三 routes;mode B 走通。

---

## Phase 6: User Story 4 - Miniflare test isolation(Priority: P2)

**Goal**:`pnpm test:worker` 全綠不需網路,miniflare 提供 in-memory D1 + KV bindings。已大致由 Phase 5 之 vitest.config.worker.ts(T010)+ Worker tests 兌現,本 phase 為**驗證**。

**Independent Test**:於乾淨 dev container 內(`unset $WRANGLER_AUTH_TOKEN`,**無** wrangler login)`pnpm test:worker` exit 0;若可,額外 instrument 確認 0 outbound HTTP 至 Cloudflare API。

### Tests for User Story 4 (verification only) ⚠️

- [ ] T037 [US4] verify miniflare 自包含:`pnpm test:worker` 跑於斷網或 dev container(無 outbound network egress 至 *.cloudflare.com 之路由)— 仍全綠 exit 0;若 dev container 不易斷網,改記錄「`pnpm test:worker` runtime tcpdump 顯示 0 packet to *.cloudflare.com」之手動驗證,於 quickstart.md US4 段。對應 spec **SC-004**
- [ ] T038 [US4] verify cross-platform parity:Mac M1 + WSL2 各跑同一 commit 之 `pnpm test:worker`,stdout 比對 pass/fail count + 訊息一致。記錄於 `.docs/parity-validation.md` 或新增 `specs/002-cloudflare-worker/parity-result.md`。對應 spec **SC-002 + 001 baseline SC-002 Q2 Clarification 自本 feature 起對 Worker pool 啟動**

**Checkpoint**:US4 兌現 — miniflare 隔離 + 跨平台 parity 文件化;baseline SC-002 worker pool 自此 active。

---

## Phase 7: User Story 5 - First-time deploy walkthrough(Priority: P3)

**Goal**:adopter 從零部署 Worker 至 Cloudflare,≤ 30 min(per spec SC-005)。涵蓋 quickstart.md Mode C。

**Independent Test**:依 quickstart.md Mode C step 1-9 走完,部署 URL `/health` 200。

### Implementation for User Story 5

- [ ] T039 [US5] 修補 `README.md`(per data-model.md §9):新增 002 dual-runtime 介紹段、3 row × 2 col 對照表(health / now / echo × Cloudflare-native / Through Node proxy)、Mode A walkthrough、Mode B walkthrough(含 host.docker.internal 註)、first-time deploy walkthrough(Mode C)。對應 spec **FR-012 + SC-006**
- [ ] T040 [US5] [optional,需 Cloudflare account]實際走完 Mode C:`wrangler login` → `d1 create` → `kv namespace create` → 編輯 wrangler.jsonc → seed → `wrangler deploy` → curl deployed `/health` `/d1/now` `/kv/echo?k=foo`;計時填 quickstart.md acceptance。**若 user 無 Cloudflare account 或 defer 部署**:此 task 標 deferred,SC-005 之 in-repo 證據缺口,屬 adopter-side 驗收。

**Checkpoint**:US5 文件化(必)+ 可選實機驗收。

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**:跨 user story 之 polish、最終 mandatory gates 驗證、兌現 001 baseline forward-declarations 之 trace。

- [ ] T041 [P] 執行完整 mandatory gates:`pnpm install --frozen-lockfile` → `pnpm test`(雙 pool 全綠)→ `pnpm typecheck`(雙 tsconfig 串接 exit 0)→ `pnpm lint`(exit 0)→ `pnpm exec prettier --check .`(exit 0)。任一失敗 STOP 修補。對應 spec **SC-009**
- [ ] T042 [P] 升 `.docs/baseline-traceability-matrix.md`:把 001 baseline 之 FR-018 / FR-021 / FR-022 / SC-011 4 條 anchor 由 📅 / aspirational 改為 ✅ / mechanical;cite 002 之 contracts(worker-routes / dual-tsconfig)為新 anchor 來源。對應 spec **SC-008 + FR-017**
- [ ] T043 [P] 升 `specs/001-superspec-baseline/research.md` §2 gap analysis 對應 4 條 row 由 📅 / aspirational 改為 ✅;sync_impact_report 之憲法 follow-up TODO 中之「Worker runtime lands」項標 done。**注意**:本 task 跨 feature 修改 baseline spec 檔,屬 polish;commit 訊息明示「002 落地後對 baseline 之 forward-declaration trace 更新」。
- [ ] T044 [P] [optional polish]抽 typed env helper for tests(per 設計源 §2.3 lesson 3 + research.md §3.3):於 `tests/worker/_helpers.ts`(或同 path)抽 `getEnv(): Env` 包 cast,讓各 test 不重複 cast pattern。
- [ ] T045 [P] [optional polish]考慮 vitest 4 `projects` 單檔合併:於 polish PR 或單獨 feature 合併兩 vitest.config 為單 `vitest.config.ts` 用 `projects` 特性(per plan key decision 8 之 future option)— 本 feature 不做,留 follow-up。
- [ ] T046 manual quickstart.md Step 6 全套執行(於 dev container):`pnpm test/typecheck/lint/prettier --check .` 全綠 + `pnpm install --frozen-lockfile` 無漂移 + Mode B `make up` 起 stack + Worker dev → 6 endpoint curl;記錄結果。**對應 spec FR-013 人類 review gate**
- [ ] T047 [P] verify Worker bundle 不含 Node-only modules(對應 spec **SC-003 + FR-009**;補 `/speckit-analyze` 之 C1 finding):跑 `pnpm exec wrangler deploy --dry-run --outdir tmp/worker-bundle 2>&1`(本機 dry-run,不需 Cloudflare account),然後 `grep -rE '\b(pg\|redis\|pino\|prom-client\|@hono/node-server)\b' tmp/worker-bundle/`,**期望 0 命中**(若有命中即表示 Worker bundle 被 Node-only module 污染,屬 critical 缺陷,STOP 並回頭檢查 import graph)。完成後 `rm -rf tmp/worker-bundle`。本 task 為 typecheck-stage 雙 tsconfig 機械擋(T024/T025/T026)之 wrangler bundle 階段補強(per contracts/dual-tsconfig.md §5 註)— typecheck 為**必要**條件、bundle inspection 為**充分**條件,雙重保險

**Checkpoint**:002-cloudflare-worker 整輪交付完成 — Worker runtime 與 Node runtime 真正並存,baseline 4 條 forward-declaration 全 mechanical active,跨平台 parity / mandatory gates / quickstart / Worker bundle inspection 全綠。

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**:無依賴;但 T001 需先執行(其他 setup task 之多數依賴 deps 已 install)
- **Foundational (Phase 2)**:依賴 Phase 1 完整完成;T012/T013/T015 阻塞所有 Worker 端 user story
- **US1 (Phase 3)**:依賴 Phase 2;為 MVP
- **US2 (Phase 4)**:依賴 Phase 2(雙 tsconfig 已就位)+ Phase 3 部分(因驗證 negative case 需有 src/worker/** 真實 import 才驗得出 ban);可與 US3 並行
- **US3 (Phase 5)**:依賴 Phase 2 + Phase 3(US3 之 Worker proxy 路由與 US1 之 Worker entry 同檔)
- **US4 (Phase 6)**:依賴 Phase 5(US4 為驗證 phase 5 已建之 vitest.config.worker.ts 與 worker tests 之 isolation 性質)
- **US5 (Phase 7)**:依賴 Phase 5(README walkthrough 引 mode B 命令);Mode C 部分屬 optional
- **Polish (Phase 8)**:依賴所有 US 完成

### Within-Phase Dependencies

- **T001 → T010**(deps install 完才能解析 `@cloudflare/vitest-pool-workers`)
- **T002 → T010**(wrangler.jsonc 為 cloudflareTest plugin 之 configPath)
- **T004 → T005, T006, T007**(base tsconfig 必先到位)
- **T011 scripts**:依賴 T009/T010 雙 vitest.config 完成 + T005/T006 雙 tsconfig 完成
- **T014 → T015**(error.test RED → GREEN)
- **T017, T018 → T019, T021**(US1 RED → GREEN)
- **T023 必先於 T024/T025**(positive baseline 必先綠)
- **T027/T028/T029/T030 → T031/T032/T033/T035**(US3 RED → GREEN;同檔 src/worker/index.ts 之 imports 需 T031-T034 串行)
- **T034 依賴 T031/T032/T033**(index 需引入三 routes 才能 register)
- **T037/T038 依賴 T036**(完整 Mode B 已驗才能跑 isolation + parity 驗證)
- **T041 為最終 mandatory gate**;依賴所有先前 task 完成

### Parallel Opportunities

- **Phase 1 setup**:T002 ∥ T003 ∥ T005 ∥ T006 ∥ T008 ∥ T009 ∥ T010(不同檔)— **但** T001 須先(deps 解析)、T004 須早(base tsconfig 影響 T005/T006/T007)、T011 最後(scripts 引整堆)
- **Phase 2 foundational**:T012 ∥ T013 ∥ T014 ∥ T016(T015 緊跟 T014;T011 已於 phase 1 完成不再列)
- **Phase 3 US1**:T017 ∥ T018(不同檔);T019/T020/T021 各自不同檔,可不嚴格 sequential
- **Phase 4 US2**:T024 ∥ T025 ∥ T026(各自獨立 negative test);T023 須先驗 positive baseline
- **Phase 5 US3**:T027 ∥ T028 ∥ T029 ∥ T030(都不同檔);T031 ∥ T032 ∥ T033 ∥ T035(都不同檔但 T034 需序列在三者之後)
- **Phase 8 polish**:T041 ∥ T042 ∥ T043 ∥ T044 ∥ T045(各自不同檔);T046 sequential 因為 manual walkthrough

### MVP Scope

完成 Phase 1 + Phase 2 + Phase 3(US1)即達 MVP:

- 雙 tsconfig + 雙 vitest config + wrangler 配置 + scripts 就位
- Worker `/health` 自包含 + Node `/app-api/health` 對照 + Worker proxy 透傳 health
- Mode A quick demo 可走

US2-US5 為快速漸進交付。Phase 8 polish 收尾在所有 US 完成後一次性走。

---

## Implementation Strategy

### MVP First (US1)

1. **Phase 1 Setup** — T001 → T002-T010 並行 → T011 scripts(預期 30 min,含 `pnpm install` 重生 lockfile)
2. **Phase 2 Foundational** — T012-T015 + T016 Constitution amendment(預期 30 min)
3. **Phase 3 US1** — T017-T022(預期 30 min)
4. **Stop & Validate**:Mode A 走通,curl 4 條 endpoint,確認 SC-011 mode A budget ≤ 5 min

### Incremental Delivery

1. MVP(US1)→ baseline forward-declaration FR-018 reference application + FR-021 結構 兌現
2. US2(T023-T026)→ baseline FR-022 + SC-011 mechanical active 兌現
3. US3(T027-T036)→ 完整 6 對照 demo + Mode B walkthrough
4. US4(T037-T038)→ miniflare 自包含 + 跨平台 parity 驗證
5. US5(T039-T040)→ README + 可選實機 deploy
6. Polish(T041-T046)→ mandatory gates 重驗 + baseline trace 更新 + manual walkthrough

### 預期時間配置

- Phase 1:30 min
- Phase 2:30 min
- US1(MVP):30 min
- US2:30 min(含 negative test 操作)
- US3:90 min(本 feature 主體;7 個 RED→GREEN 對 + manual Mode B verify)
- US4:30 min(verification + parity)
- US5:60 min(README writeup + optional deploy)
- Polish:60 min

合計 ≈ 6 小時(若不含 Mode C 實機部署)。可分 2-3 個工作 session。

---

## Notes

- **TDD mandatory** per constitution v1.0.0 §I NON-NEGOTIABLE;每 implementation 任務都先有對應 RED test。
- **同檔 task 須序列**:標 [P] 為「可獨立思考」非「可並行 commit」;同檔之多 task 實際 commit 須序列(如 `src/worker/index.ts` 由 T020/T034 兩階段擴)。
- **Constitution v1.0.0 → v1.1.0**(T016)為**必要 deliverable**;與 spec/plan/contracts 同 PR 範圍。
- **Toolchain isolation per FR-019**:T001 之 deps install + lockfile 重生**建議獨立 commit**(subject `chore(deps): add wrangler / workers-types / vitest-pool-workers for 002`),避免本 feature 主 commit 夾雜 lockfile 變動;見 `.docs/toolchain-upgrade-playbook.md`。
- **Mandatory gates 全綠**為 spec SC-009 + 001 baseline quality-gates contract 之底線;每 phase checkpoint 後可選擇局部跑 `pnpm test:worker` 等 sub-gate,但 phase 8 之 T041 必跑全套。
- **Commit / push 由 user 明確指示後執行**(專案 CLAUDE.md);本 plan 不自動 commit。
- **本 feature merge 後**,baseline traceability matrix(T042)+ baseline research.md(T043)之更新會跨 feature 修改 baseline 既有檔;commit 訊息明示「002 落地後 trace 更新」。
- **adopter 端 Cloudflare account 為 optional**:T040 Mode C 部署需 account,但 SC-005 主由 README walkthrough 文件化(T039)兌現;實機部署為 adopter 自家驗收。

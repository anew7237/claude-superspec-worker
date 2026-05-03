# Feature Specification: Cloudflare Worker Runtime + Monorepo Dual-Runtime Refactor

**Feature Branch**: `002-cloudflare-worker`
**Created**: 2026-04-30
**Status**: Draft
**Input**: User description: "落地 002-cloudflare-worker — 兌現 001-superspec-baseline 對 Worker 端的所有 forward-declarations。範圍依 .docs/20260430a-cloudflare-worker.md §5 (Unified Monorepo) + §6 (Decisions Log) 的最終 target,並嚴格遵守 001 baseline 的 FR-018/FR-021/FR-022 + SC-011 規範。"

> **設計來源**:`.docs/20260430a-cloudflare-worker.md`(986 行,§1 brainstorming + §2 implementation plan + §3 cross-repo work + §4 proxy 修正 + §5 monorepo 結構 + §6 決策 log + §7 input 提示)。本 spec 為該設計稿經 spec-kit 流程的規格化產物;原稿為 working doc,本 spec 為 contract。
>
> **Baseline anchor**:001-superspec-baseline FR-018 / FR-021 / FR-022 / SC-011 全部對 Worker 端 forward-declared;本 feature 落地後上述 4 條從 📅 / aspirational 升為 mechanical active。

## Clarifications

### Session 2026-04-30

- Q: Side-by-side 並存運行的 canonical 模式 + UPSTREAM_URL 連通性? → A: **C — 同時支援兩 mode**:(A) `pnpm dev:node` + `pnpm dev:worker` 純 host process 並起,UPSTREAM_URL=`http://localhost:8000`,適用 `/app-api/health` quick demo;(B) `make up`(docker compose 帶 Postgres + Redis)+ `pnpm dev:worker`(於 dev container 或 host 內),UPSTREAM_URL 指向 docker 路徑(host:`http://localhost:8000`,容器內可能需 `host.docker.internal` 或 DooD 等價路徑),適用完整 `/app-api/{health,now,echo}` comparison demo。README 分兩段;FR-015 + US1 acceptance 涵蓋兩 mode。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 讀者於同 monorepo 同時起 Node + Worker 兩 runtime 比對 (Priority: P1) 🎯 MVP

一位想學 Cloudflare Workers 的開發者 clone 此 monorepo,於 dev container 內單一 `pnpm install`
完成後,可以**同時**啟動 Node 端 stack(`pnpm dev:node` 或 `make up`,於 :8000)與 Worker 端
(`pnpm dev:worker`,於 :8787)。兩端各自暴露對照 endpoint,讀者可 `curl` 兩邊,觀察「同樣的
demo,Cloudflare-native 與 Node origin 各自如何寫」。

**Why this priority**:此為本 feature 之核心 demo 價值。失去並存運行,monorepo 變成兩個各自為政的
runtime,反而比 sibling repos 還難讀;兌現 baseline FR-018 derivative 契約之 Worker reference
application 部分。

**Independent Test**:乾淨 monorepo clone + `pnpm install` + 並起 Node stack + `pnpm dev:worker`,
六條 `curl`(三 Node、三 Worker)均回對應 200 + 預期 JSON 結構。

**Acceptance Scenarios**:

1. **Given** mode A(`pnpm dev:node` + `pnpm dev:worker` 並起),**When** `curl http://localhost:8787/health`,**Then** 200 + body 含 `"service":"worker"` + ISO timestamp(touches no binding)。
2. **Given** mode A 同上 + Worker 已 seed local KV(`wrangler kv key put --binding=KV foo "hello-from-kv" --local`)+ D1 已 migrate,**When** `curl http://localhost:8787/d1/now` + `curl http://localhost:8787/kv/echo?k=foo`,**Then** 兩條皆 200 + 對應 `source:"d1"` / `source:"kv"` body。
3. **Given** mode B(`make up` 帶 Postgres + Redis healthcheck 全綠 + `pnpm dev:worker`),Redis seeded `SET foo "hello-from-redis"`,**When** `curl http://localhost:8000/app-api/echo?k=foo`,**Then** 200 + `"source":"redis"` + `"value":"hello-from-redis"`(Node 端原生路由)。
4. **Given** mode B 同上,**When** `curl http://localhost:8787/app-api/echo?k=foo`(Worker 端),**Then** 200 + body 與 acceptance 3 byte-equivalent(passthrough 透傳,per US3 + FR-007)。
5. **Given** mode A + B 之 README 文件,**When** 讀者比對表格,**Then** 可定位 6 個對照 endpoint(3 row × 2 col)且每條皆有可複製 `curl` 命令。

---

### User Story 2 - 跨 runtime import 違規由 typecheck 機械擋下 (Priority: P1)

開發者於 PR 中於 Node 端誤 `import { D1Database } from '@cloudflare/workers-types'`,或於 Worker
端誤 `import { pool } from 'pg'`,本 monorepo 的 `pnpm typecheck` 必須**機械失敗**並指出違規 import,
而非 reviewer 人工抓。

**Why this priority**:兌現 baseline FR-022 + SC-011 機械強制承諾 — 此承諾自 001 ratification 起
為 aspirational,本 feature 落地後正式啟動。失去此檢查,monorepo 雙 runtime 共存將退化為「便宜
寫對哪邊都能編」的隱性危險。

**Independent Test**:模擬一個 PR,於 `src/node/foo.ts` 寫 `import type { D1Database } from
'@cloudflare/workers-types'`(或反向),`pnpm typecheck` 必失敗、exit ≠ 0、stderr 指出
namespace 不可達或 type 不存在。還原後 typecheck 重綠。

**Acceptance Scenarios**:

1. **Given** 雙 tsconfig(`tsconfig.node.json` + `tsconfig.worker.json`)已落地,**When** Node 端任一檔案 `import` Worker 專屬型別(`D1Database` / `KVNamespace` / `Cloudflare.Env`),**Then** `tsc -p tsconfig.node.json --noEmit` exit ≠ 0,訊息指出該 type 不存在(因 Node tsconfig `types` 不含 workers-types)。
2. **Given** 同上,**When** Worker 端任一檔案 `import` Node 專屬模組(`pg` / `redis` / `pino` / `prom-client` / `@hono/node-server` / `fs` / `child_process`),**Then** `tsc -p tsconfig.worker.json --noEmit` exit ≠ 0,訊息指出該 module 不可解析或 globals 未宣告。
3. **Given** 上述違規 PR 嘗試 push,**When** `pnpm typecheck`(雙 tsconfig 串接),**Then** 整段 exit ≠ 0,baseline mandatory gate 阻擋 merge。
4. **Given** 合法 import(Node 端用 `pg`、Worker 端用 `D1Database`),**When** 同樣 typecheck,**Then** 兩 tsconfig 皆 exit 0。

---

### User Story 3 - 反向代理 demo 對照 (Priority: P2)

讀者透過 Worker 的 `/app-api/*` 路徑訪問既有 Node 應用,Worker 端**完整 passthrough** 路徑(不剝
`/app-api` 前綴)。`UPSTREAM_URL` 指向本機(mode A:`http://localhost:8000`;mode B:對應 docker
路徑)或部署後的隧道 URL;讀者可同 endpoint 兩個入口(`localhost:8787/app-api/health` vs
`localhost:8000/app-api/health`)觀察結果一致。

**Why this priority**:此為 §4 設計修正後的核心對照模式 — 證明 Workers 可以「在 edge 與既有
app 之間架透明 proxy」,demo 跨 stack 整合。但相較於 P1 並存運行,此情境屬「進階對照」,P2。

**Independent Test**:Worker dev + Node stack 並起(mode A 或 B),`curl localhost:8787/app-api/echo?k=foo`
回應與 `curl localhost:8000/app-api/echo?k=foo` 同 JSON body + 同 status,證明 passthrough。

**Acceptance Scenarios**:

1. **Given** Node 端 `/app-api/health` 回 `{"status":"ok","service":"nodejs"}`,**When** Worker `/app-api/health`,**Then** 同 body 同 status(透傳)。
2. **Given** Node `/app-api/echo?k=missing` 回 404 + `{"error":"not_found"}`,**When** Worker `/app-api/echo?k=missing`,**Then** 同 404 + body(透傳 non-2xx)。
3. **Given** `UPSTREAM_URL` 未設,**When** Worker `/app-api/X`,**Then** 503 + `{"error":"upstream_not_configured"}`(per §1.3 proxy error model)。
4. **Given** `UPSTREAM_URL` 配置但 upstream 不可達,**When** Worker `/app-api/X`,**Then** 502 + `{"error":"upstream_unreachable"}`。
5. **Given** upstream > 10s 無回應,**When** Worker `/app-api/X`,**Then** 504 + `{"error":"upstream_timeout"}`。

---

### User Story 4 - Worker 端測試於 miniflare 跑 D1 + KV 不需真 Cloudflare 帳號 (Priority: P2)

開發者於 dev container 內跑 `pnpm test:worker`,測試 suite 透過 `@cloudflare/vitest-pool-workers`
驅動 miniflare,提供 in-memory D1 + KV bindings,不需 `wrangler login`、不需真 Cloudflare 帳號、
不需網路。pre-seed KV / migrate D1 schema 於 test setup 內處理。

**Why this priority**:支撐 baseline FR-005 TDD 紀律於 Worker 端落地;失去 miniflare 即必須打真
Cloudflare API 才能跑 binding tests,違反 dev container 自足原則(FR-002 / 憲法 §I)。

**Independent Test**:在乾淨 dev container 內(無 wrangler login)跑 `pnpm test:worker`,全綠
exit 0,不嘗試任何網路呼叫(可由 monitoring tool 確認)。

**Acceptance Scenarios**:

1. **Given** dev container 已就位 + `pnpm install` 完成,**When** `pnpm test:worker`,**Then** vitest 跑完全綠,涵蓋 health / d1 / kv / proxy 4 套 routes 至少 10 個 test case。
2. **Given** 同上,**When** test 內呼叫 `env.DB.prepare('SELECT 1').first()`,**Then** miniflare 提供 in-memory D1 回應,不打真 Cloudflare API。
3. **Given** 同上,**When** test pre-seed KV 後 `env.KV.get('foo')`,**Then** 取回對應 value(seed 在 test setup 內 inject)。
4. **Given** Mac M1 + WSL2 各跑同一 commit 之 `pnpm test:worker`,**When** 收集 stdout,**Then** test pass/fail count 100% 等價(per Q2 Clarification of 001 baseline)。

---

### User Story 5 - 從零部署 Worker 至 Cloudflare 一次完成 (Priority: P3)

Adopter 拿到本 monorepo 後,依 README 走完一次完整部署:`wrangler login` → `wrangler d1 create` →
`wrangler kv namespace create` → 把回傳 ID 填回 `wrangler.jsonc` → seed → `wrangler deploy`,於
≤ 30 min 內把 Worker 部署到 Cloudflare edge,且首次 `curl <deployed-url>/health` 成功。

**Why this priority**:本 monorepo 的 fork-friendly starter 承諾;但相較 P1-P2 之核心開發體驗,
首次部署只在 adopter 採用初期觸發一次,P3。

**Independent Test**:乾淨機 + Cloudflare account(已 sign up free tier),依 README 操作至 deploy
成功;計時 ≤ 30 min。

**Acceptance Scenarios**:

1. **Given** Cloudflare free tier account 已建,**When** 依 README first-time deploy 走完,**Then** Worker 部署成功 + `curl https://<worker-name>.<account>.workers.dev/health` 回 200。
2. **Given** 同上 + D1 已 `wrangler d1 migrations apply --remote`,**When** `curl /d1/now`,**Then** 200 + 來自部署 D1 之 timestamp。
3. **Given** 同上 + `wrangler secret put UPSTREAM_URL`(或 cloudflared tunnel URL),**When** `curl /app-api/health`,**Then** 200 + 來自部署的 Node 應用 body(若 Node 已部署);否則合理 502 / 504。

---

### Edge Cases

- **`@cloudflare/vitest-pool-workers@0.15.x` 沒 export `defineWorkersConfig` from `/config` subpath**(設計源 §2.3 lesson 1):vitest config 須改用 `cloudflareTest` plugin pattern + `defineConfig` from `vitest/config`。
- **tsconfig.worker.json 必須將 `@cloudflare/vitest-pool-workers/types` 加入 `types` array**,否則 `import { env, createExecutionContext } from 'cloudflare:test'` 解析失敗(lesson 2)。
- **`declare module 'cloudflare:test' { interface ProvidedEnv { ... } }` augmentation 在 v0.15.1 不 work**(lesson 3):tests 內須 `cast` env 至 typed Env。後續可抽 helper 減重複。
- **`exactOptionalPropertyTypes: true` 拒 inline ternary 對 optional field 賦 undefined**(lesson 4):需逐步建構 object,避免 `{...x, body: cond ? undefined : raw.body}` 樣式。
- **ESLint 9 `@typescript-eslint/no-unused-vars` 不自動 ignore 底線前綴**(lesson 5):config 須加 `argsIgnorePattern: '^_', varsIgnorePattern: '^_'`。
- **`.prettierignore` 必 include `.specify/`、`CLAUDE.md`、`wrangler.jsonc`**(lesson 6):上游 vendored / IDE-specific 格式不應被 prettier 改寫。**(已於 001 baseline T002.preq 處理 + 本 feature 須維持。)**
- **不要加 `nodejs_compat` flag**(lesson 7):Hono + D1 + KV + global `fetch` 為純 Workers APIs,加 flag 增加 runtime 體積無收益。
- **`/app-api/*` proxy 必 passthrough,不剝前綴**(§4 修正):worker `/app-api/X` → upstream `/app-api/X`;若剝前綴,Node 端的 `/app-api/health` route 永遠對不到,且會誤打到既有 `/health`。
- **Worker bundle 不可含 Node-only modules**:`pg` / `redis` / `pino` / `prom-client` / `@hono/node-server` / `fs` / `child_process` 等於 wrangler bundle 階段 fail。雙 tsconfig 機制讓此違規於 typecheck 階段提前擋下(FR-022 mechanical)。
- **Worker secrets 不可寫進 `wrangler.jsonc`**:必走 `wrangler secret put` 或 `.dev.vars`(gitignored);違反者 PR review 駁回。
- **D1 / KV 寫路徑超出 starter 範圍**:本 feature 只 demo 讀。寫路徑(KV put route、D1 migration runtime、auth)屬未來 feature。
- **Worker → Node auth 不在 starter 範圍**:`UPSTREAM_URL` 為純 URL var;production 需加 shared-secret header 或 cloudflared tunnel + Cloudflare Access(README 註明)。
- **Mode B 之 dev container → host docker compose 連通性**:dev container 內 `pnpm dev:worker` 透過 `localhost:8000` **不一定**能達 host 端 docker compose published port(視 dev container 配置)。Plan 階段須決定具體 networking(host.docker.internal / DooD bridge / `--add-host` 等),並於 README mode B 段明示。
- **Standalone worker repo 之 16 commits 已捨棄**(§6 #10):本 feature 不繼承其 git history,但繼承其 lessons(§2.3)。
- **D1 schema 為 placeholder**:`/d1/now` 僅跑 `SELECT CURRENT_TIMESTAMP`,不需 migration。實質 schema 屬 adopter 自家 feature。

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**:Monorepo MUST 提供 `src/worker/`(Worker runtime entry + routes)、`src/shared/`(runtime-agnostic types/constants)、`tests/worker/`(Worker tests)三個結構;與既有 `src/node/` `tests/node/` 並存。**對應 001 baseline FR-021,自本 feature 起從 reserved 升為實質落地。**
- **FR-002**:Monorepo MUST 提供雙 tsconfig 結構(`tsconfig.json` 為共用 base、`tsconfig.node.json` extends base + `types: ["node"]` + include `src/node/**` `src/shared/**` `tests/node/**`、`tsconfig.worker.json` extends base + `types: ["@cloudflare/workers-types/...", "@cloudflare/vitest-pool-workers/types"]` + include `src/worker/**` `src/shared/**` `tests/worker/**`);`pnpm typecheck` 串接執行兩 tsconfig 後 exit 0 才視為通過。**對應 001 baseline FR-022 mechanical enforcement 啟動點。**
- **FR-003**:Monorepo MUST 提供雙 vitest 配置 — Node pool 用 plain vitest config(include `tests/node/**`),Worker pool 用 `@cloudflare/vitest-pool-workers` plugin pattern(include `tests/worker/**`,driving miniflare with D1 + KV bindings);`pnpm test` 整合執行兩 pool 後綠才視為通過。Vitest 4 `projects` 特性可選擇單 config 串接或保留兩 config 檔。
- **FR-004**:Worker 端 MUST 提供 `GET /health` route 回 JSON `{status:"ok", service:"worker", ts:<ISO>}`,**touches no binding**(D1/KV/UPSTREAM_URL 失效時仍 200)。
- **FR-005**:Worker 端 MUST 提供 `GET /d1/now` route,執行 `env.DB.prepare("SELECT CURRENT_TIMESTAMP AS now").first()` 並回 `{source:"d1", now}`;查詢失敗回 500 + `{error:"d1_query_failed"}`(或 `d1_empty_result`)。
- **FR-006**:Worker 端 MUST 提供 `GET /kv/echo?k=<key>` route,執行 `env.KV.get(key)`;命中回 `{source:"kv", key, value}`,缺 key 參數回 400 + `{error:"missing_param"}`,KV miss 回 404 + `{error:"not_found"}`,KV 例外回 500 + `{error:"kv_get_failed"}`。
- **FR-007**:Worker 端 MUST 提供 `ALL /app-api/*` reverse proxy route,**完整 passthrough path**(`worker /app-api/X` → `${UPSTREAM_URL}/app-api/X`,不剝 `/app-api` 前綴);timeout 10s;`UPSTREAM_URL` 未配 → 503 / 不可達 → 502 / timeout → 504,upstream 2xx/non-2xx 一律 透傳 status + body。**§4 修正後語意**。
- **FR-008**:Node 端 MUST 新增 `/app-api/health` `/app-api/now` `/app-api/echo` 三 route 為 Worker proxy 之對照(分別走 Postgres pool 與 Redis client);與既有 Node `/health` `/metrics` 並存,不衝突。
- **FR-009**:Worker bundle 透過 wrangler 部署時 MUST NOT 含 Node-only modules(`pg` / `redis` / `pino` / `prom-client` / `@hono/node-server` / `fs` / `child_process`);違反於 wrangler bundle 階段 fail,但**雙 tsconfig 應於 typecheck 階段提前擋下**(per FR-002 + 001 baseline FR-022 / SC-011 mechanical)。
- **FR-010**:Worker 端 observability MUST 走 `console.log` / `console.error`(Workers Logs + `wrangler tail`),**不引** `pino` / `prom-client`;Worker 端不暴露 Prometheus `/metrics` endpoint(per 001 baseline observability.md §2 + 憲法 §II)。
- **FR-011**:Wrangler 配置 MUST 落於 `wrangler.jsonc`(repo root),含 `name`、`main: src/worker/index.ts`、`compatibility_date`、`vars.UPSTREAM_URL`、`d1_databases.binding=DB`、`kv_namespaces.binding=KV`;**不啟用 `nodejs_compat`** flag。Local secrets MUST 落於 `.dev.vars`(`.gitignore` 已含,by 001 baseline T001 預先);production secrets 經 `wrangler secret put`,不可寫進 `wrangler.jsonc`。
- **FR-012**:首次部署 walkthrough MUST 涵蓋 `wrangler login` → `wrangler d1 create` 取 database_id → `wrangler kv namespace create` 取 namespace_id → 編輯 `wrangler.jsonc` 填 ID → optional seed(`wrangler kv key put`)→ `wrangler deploy` 全步驟,於 README 中以可複製命令列出。
- **FR-013**:Worker 端 mandatory gate `pnpm test:worker` MUST 跨 macOS Apple Silicon + WSL2 Ubuntu 100% 等價(pass/fail count + 訊息一致),**對應 001 baseline SC-002 + Q2 Clarification 自本 feature 起對 Worker pool 啟動**;測試級別「同一 test 一邊 pass / 另一邊 fail」即計入 SC-008 配額。
- **FR-014**:Monorepo MUST 維持單一 `pnpm install` 啟動雙 runtime(`package.json` 為單一 manifest;wrangler 僅 bundle Worker entry 觸及之 deps,Node-side deps 不污染 Worker bundle)。
- **FR-015**:`package.json` scripts MUST 提供 `dev:node`(:8000)+ `dev:worker`(:8787);**並存運行支援雙 mode**(per Q1 Clarification):mode A `pnpm dev:node` + `pnpm dev:worker` 純 host process(quick demo,UPSTREAM_URL=`http://localhost:8000`,涵蓋 `/app-api/health` 透傳但 `/app-api/now` `/app-api/echo` 缺 db/redis backing);mode B `make up` + `pnpm dev:worker`(完整 demo,UPSTREAM_URL 視 dev container 與 host 之 networking 設定 — plan 階段決定具體值與必要 networking 配置)。README 必含兩 mode 啟動步驟與對應 UPSTREAM_URL 值。
- **FR-016**:Constitution `.specify/memory/constitution.md` MUST 增 "Variant Amendment — Cloudflare Worker Companion (2026-04-30)" 段(per 設計源 §5.7 revised text),明示雙 runtime 並存規範,並把先前 `claude-superspec-nodejs/` "Docker out-of-scope" 描述更新為「Docker IS in scope for the Node runtime;wrangler IS in scope for the Worker runtime」。憲法版本至少升 MINOR(1.0.0 → 1.1.0)。
- **FR-017**:本 feature 落地後,001 baseline 之以下 forward-declarations MUST 全部兌現:(a) FR-018 Worker reference application 完整;(b) FR-021 `src/worker/` `src/shared/` `tests/worker/` 結構就位;(c) FR-022 雙 tsconfig 啟動 cross-runtime import ban;(d) SC-011 violation count 自本 feature 落地起正式 mechanical 計算(Layer 1 雙 tsconfig 擋 ambient + `node:*`,Layer 2 ESLint `no-restricted-imports` 擋 explicit named imports;per `.specify/memory/constitution.md` §Variant Amendment v1.1.3)。

### Key Entities

- **Worker Runtime Entry**:`src/worker/index.ts` — Hono app 實例 + `export default { fetch: app.fetch } satisfies ExportedHandler<Env>`。屬性含 `routes` (4 sets:health/d1/kv/proxy)、`onError` handler、`notFound` handler。
- **Bindings (Env)**:`src/worker/env.ts` 暴露 interface `Env { DB: D1Database; KV: KVNamespace; UPSTREAM_URL: string }`;由 wrangler 於 fetch handler 注入,deploy 時於 Cloudflare Dashboard 對應實體 D1/KV namespace。
- **Wrangler Configuration**:`wrangler.jsonc`(repo root)— 宣告 main entry / compatibility date / vars / D1 / KV bindings;`.dev.vars` 為 local secrets(gitignored);`wrangler secret` 為 production secrets channel。
- **Reverse Proxy Pair**:`/app-api/{health,now,echo}` 兩端對照 — Worker side 為 passthrough proxy;Node side 為新增原生 route(走 Postgres / Redis)。3 對 endpoint 構成 demo comparison table。
- **Dual TypeScript Configuration**:`tsconfig.json`(base)+ `tsconfig.node.json`(Node-side)+ `tsconfig.worker.json`(Worker-side)— 各自 `types` array 隔離 globals,`include` 範圍互斥。
- **Dual Vitest Pools**:Node pool(plain vitest config)+ Worker pool(`@cloudflare/vitest-pool-workers` cloudflareTest plugin)— 共享 vitest 4.x 但 driver 不同;test 命名互斥(`tests/node/**` vs `tests/worker/**`)。
- **Constitution Variant Amendment**:`.specify/memory/constitution.md` 內新增段落,記錄雙 runtime 並存原則 + 比較 demo first-class 約定。版本至少 MINOR 升。
- **Comparison Demo Surface**:README 對照表(3 row × 2 col:Cloudflare-native / through Node proxy)+ 對應 6 個可 `curl` 的 endpoint + 兩 mode 之啟動命令對照。

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**:雙 tsconfig 落地後,「跨 runtime import 違規」之 PR `pnpm typecheck` 失敗率 = 100%(Node 端 import workers-types / Worker 端 import pg/redis/pino/prom-client 等)。**直接兌現 001 baseline SC-011 從 aspirational → mechanical active**。
- **SC-002**:`pnpm test`(整合 node + worker pool)在 macOS Apple Silicon + WSL2 Ubuntu 雙平台跑同 commit 之結果**100% 等價**(pass/fail count + 訊息一致);測試級別「同一 test 一邊 pass / 另一邊 fail」即視為 parity 缺陷,計入 001 baseline SC-008 季度配額。
- **SC-003**:Worker bundle(`wrangler deploy --dry-run` 或部署後 inspection)**不含** `pg` / `redis` / `pino` / `prom-client` / `@hono/node-server` 任一字串(grep / ast 確認);違反為 critical 缺陷。
- **SC-004**:於 dev container 內 `pnpm test:worker` 全綠**不需網路**(可由 sandbox 工具確認 0 outbound HTTP request 至 Cloudflare API)— miniflare 提供 in-memory D1 + KV。
- **SC-005**:Adopter 從乾淨機(僅 Docker / IDE / Git / Cloudflare free-tier account)走完 first-time deploy walkthrough(per FR-012)≤ 30 min;首次 `curl <deployed-url>/health` 200。
- **SC-006**:Comparison demo surface — README **MUST 含 3 row × 2 col 對照表**(health / now / echo × Cloudflare-native / through Node proxy),全 6 endpoint 同 query 在兩端有可比結果(mode B 下);讀者於 1 分鐘內能定位「想看 D1 demo 走 `/d1/now`,想看 Postgres demo 走 `/app-api/now`」。
- **SC-007**:`/app-api/*` proxy 對 1000 個隨機 path + query 之輸入,upstream 收到的 path / query / method / headers / body **與 worker 端輸入逐 byte 一致**(passthrough 完整性,無 prefix 剝離 / header 改寫 / query 重編碼)。除非 upstream 不可達/timeout/未配,否則無 5xx 是由 worker 自己生成。
- **SC-008**:本 feature 落地後,001 baseline forward-declared 之 4 條(FR-018 Worker reference / FR-021 結構 / FR-022 mechanical / SC-011 active)**全部 ≤ 100% 兌現**(由 baseline traceability matrix 對應行更新驗證,從 📅 / aspirational 改為 ✅ / mechanical)。
- **SC-009**:Mandatory gates 於本 feature 落地後仍 100% 綠 — `pnpm install --frozen-lockfile` / `pnpm test`(雙 pool 全綠)/ `pnpm typecheck`(雙 tsconfig 全綠)/ `pnpm lint` / `pnpm exec prettier --check .` 全部 exit 0。
- **SC-010**:Worker 端 `/health` p50 response time ≤ 50ms(於 Cloudflare edge,binding 不觸碰);`/d1/now` p50 ≤ 200ms;`/app-api/*` proxy 之 worker 端 overhead ≤ 50ms(扣除 upstream 處理時間)。
- **SC-011**:Mode A(quick demo)從乾淨 monorepo 起,`pnpm install + pnpm dev:node + pnpm dev:worker` ≤ 5 min 全綠 + `curl /app-api/health` 透傳成功;mode B(完整 demo)從乾淨 monorepo + Cloudflare-account-free dev,`make up + pnpm dev:worker` 全綠 + 6 個對照 endpoint 全 200 ≤ 10 min(per Q1 Clarification 雙 mode 兌現)。

## Assumptions

1. **Cloudflare account 為 free tier 即可**:本 feature 不要求 Workers Paid plan。D1 / KV 在 free tier 有限額,demo 用量遠低於限額。
2. **`wrangler` CLI 由 `pnpm install` 帶入**:不於 dev container 加額外 feature 安裝;wrangler 為 devDependencies,執行透過 `pnpm exec wrangler` 或 `pnpm dev:worker` script。
3. **Mode A vs mode B 並存運行模式**(per Q1 Clarification):mode A 純 host process 適 quick health demo;mode B 帶 docker compose 適完整 db/redis-backed comparison。Plan 階段須決定 mode B 之 dev container → host networking 具體機制(host.docker.internal、DooD、`--add-host` 等)及對應 UPSTREAM_URL 預設值。
4. **D1 + KV 之 schema/seed 為 placeholder 規模**:本 feature 不規範實際 production schema migration 流程或 KV 寫路徑,由 adopter 自家 feature 規劃。
5. **既有 001-baseline 之 Node 應用程式碼維持不動**:本 feature 僅新增 `/app-api/*` 三 route 至 `src/node/app.ts`,不變更 `/health` `/metrics` `/` 等既有 route 行為。
6. **`@cloudflare/vitest-pool-workers` 版本鎖 `^0.15`**:per 設計源 §2.3 lesson 1 已驗證之版本範圍;升上 0.16 / 1.0 屬未來 toolchain bump 走孤立 commit(per 001 baseline FR-019)。
7. **Constitution 版本至少升 MINOR**(1.0.0 → 1.1.0):per 憲法 amendment procedure,新增 Variant Amendment 段為 MINOR 級變動;本 feature 之 spec / plan 須 cite v1.1.0 為其 Constitution Check anchor。
8. **`tsconfig.lint.json` 仍存在**:既有 ESLint 用 tsconfig 不需移除;若需擴大 ESLint 涵蓋至雙 runtime,屬本 feature 範圍內小調整。
9. **既有 `tests/node/` 不變更**:雙 vitest pool 設定後,既有 `tests/node/**.test.ts` 與其新對應 tsconfig include 仍互通;本 feature 不重命名既有檔。
10. **Cloudflare workers-types 版本鎖 `^4`**:配合 Workers runtime 2024-09-01 compatibility date;升版屬未來 toolchain bump。

## Dependencies

- **001-superspec-baseline**(已 merge 至 `main`)— 本 feature 對其 FR-018 / FR-021 / FR-022 / SC-011 forward-declarations 兌現;baseline 之憲法 + 5 個 contracts(cli-pipeline / devcontainer / observability / quality-gates / sensitive-material)為本 feature 的 Constitution Check anchor。
- **設計源** `.docs/20260430a-cloudflare-worker.md` — §1 brainstorming + §2 implementation plan + §3 Node-side T15 work + §4 proxy fix + §5 unified monorepo target + §6 decisions log + §7 input prompt。本 spec 為其規格化產物;設計源在本 feature merge 後建議標 historical reference。
- **新引入 npm 依賴**(per 設計源 §1.10 + §5.3):`wrangler ^3`、`@cloudflare/workers-types ^4`、`@cloudflare/vitest-pool-workers ^0.15` 至 `devDependencies`;runtime 端 `hono ^4` 已存在於既有 `package.json`(共用)。
- **新引入配置檔**:`wrangler.jsonc`(repo root)、`tsconfig.node.json`、`tsconfig.worker.json`、`vitest.config.node.ts`、`vitest.config.worker.ts`(或 vitest 4 projects 單檔)、`.dev.vars.example`(可選)。
- **Cloudflare account**(adopter 端,部署時必需):free tier 即足以 demo;不在 monorepo 提供範圍。
- **已落地之 baseline mechanical gates**:本 feature 不可破壞 `pnpm test` / `typecheck` / `lint` / `prettier --check .` 全綠的 baseline 狀態(per 001 baseline 之 quality-gates contract)。

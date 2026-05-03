# Contract: Observability Surface

**Audience**: Adopter 應用層 + Prometheus / log collector / alerting + Cloudflare Workers Logs
**Surface owner**: Node 端 — `src/node/{app,http-metrics,logger,metrics}.ts`;Worker 端(reserved) — `src/worker/routes/health.ts`(由 002 引入)
**Related FR / SC**: FR-006, FR-020(部分), SC-004, SC-009, SC-010

> 觀測契約於兩 runtime 採不同實作但共享精神:**新增 route 不需手工接線、structured logs 為單一通道、降級不阻塞觀測暴露**。本契約分節說明 per-runtime 不變量。

## 1. Node runtime 觀測面

### 1.1 對外介面

#### `GET /health`

- **回應**:`200 OK` 或 `503 Service Unavailable`(degraded);body 為 JSON:
  ```json
  {"status": "ok|degraded", "db": true|false, "redis": true|false}
  ```
- **語意**:檢查 db (`SELECT 1`) 與 redis (`PING`);任一 false → degraded。
- **被誰用**:Docker `HEALTHCHECK`(Dockerfile 與 docker-compose service);Kubernetes liveness/readiness probe;adopter 自家 alerting。

#### `GET /metrics`

- **Content-Type**:`register.contentType`(prom-client 標準 `text/plain; version=0.0.4`)。
- **Body**:Prometheus exposition format,內容含:
  - **Default runtime metrics**(永遠暴露):`process_*`、`nodejs_*`(prom-client `register` 預設)。
  - **HTTP 業務指標**(預設啟用,可 opt-out):
    - `http_requests_total` — counter,labels:`method`、`route`、`status_code`
    - `http_request_duration_seconds` — histogram,labels 同上,使用 prom-client 預設 buckets
- **Scrape 自身行為**:`/metrics` 的 scrape request **不**會被計入(避免污染指標)。

#### Structured logs(stdout)

- **Logger**:`pino`(canonical channel)。
- **格式**:單行 JSON,含 `level`、`time`、`msg` + 業務 context 欄位。
- **Banned**:Node 端應用碼**不可**用 `console.log` / `console.warn` / `console.error` 等(SC-009 = 0 hits;由 `eslint.config.js` `no-console: error` 對 `src/**/*.ts` 機械強制);診斷輸出須走 `pino`。
- **發送目標**:容器 stdout;由 docker-compose / Kubernetes 的 log driver 收集到 adopter 自選的 collector。

### 1.2 配置

| Env Var | 值 | 預設行為 |
|---|---|---|
| `HTTP_METRICS_ENABLED` | 任意值(含未設) | 啟用(fail-open)— `http_requests_total` / `_duration_seconds` 暴露 |
| `HTTP_METRICS_ENABLED` | `'false'`(case-insensitive,trim 後) | 停用 — middleware 不掛、`/metrics` 仍含 default runtime 指標 |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error`(pino 預設) | docker-compose 預設 `debug` |

`HTTP_METRICS_ENABLED` 讀取於 module load 時(`src/node/app.ts:17`),改值需重啟。

### 1.3 不變量(Node 端,must)

1. **新加 HTTP route 自動繼承指標**:當 middleware 啟用,任何在 `app.use(...)` mount path 下的 route 都會被記入(FR-006、SC-004)。
2. **Cardinality 防護**:`route` label 必為 router 模板路徑(如 `/users/:id`),**不**為實際值(`/users/42`)。實作見 `src/node/http-metrics.ts` 的 routePath 擷取邏輯。
3. **未匹配 route 標準化**:完全沒匹配到任何 route 時 label = 字面 `not_found`;routePath API 失效時 label = 字面 `unknown`(會於啟動 `logger.warn` 一次)。
4. **Matched 404 與 unmatched 404 分流**:`app.get('/items/:id', c => c.json({...}, 404))` 此情境 label = `route="/items/:id"` + `status_code="404"`(matched);只有沒任何 route 匹配的請求才用 `not_found`。
5. **`/health` 與 `/` 對 opt-out 完全 byte-equivalent**:設 `HTTP_METRICS_ENABLED=false` 後,該兩個 endpoint 的 response body / headers 不應有任何增刪。
6. **健康端點 503 不阻塞 metrics 暴露**:即使 `/health` 回 503,`/metrics` 仍須能正確 200 並 expose 指標 — observability 不能因 application 自身 degrade 而失效。

### 1.4 實作對照

對應 contract 內每條不變量到 `src/node/` 實際實作 symbol(以 `export` / `function` / `const` 名稱錨定,drift-resistant;若 `src/node/` 後續 rename 須同步更新此映射或重跑 contract amendment):

| Contract 不變量 | 實作 symbol | 簡述 |
|---|---|---|
| 1. 新加 HTTP route 自動繼承指標 | `src/node/http-metrics.ts` `httpMetrics()` factory → returned middleware closure | 任何在 `src/node/app.ts` `app.use(mountPattern, httpMetrics())` 之下的 route,於 finally 區塊一律記錄 `http_requests_total` counter + `http_request_duration_seconds` histogram |
| 2. Cardinality 防護 | `src/node/http-metrics.ts` middleware closure(`c.req.routePath` 擷取分支) | 直接以 routePath 為 label;模板路徑而非實際 URL |
| 3. 未匹配 → `not_found`;routePath API 失效 → `unknown` | `src/node/http-metrics.ts` `probeRoutePathSupport()` + middleware closure per-request fallback | `probeRoutePathSupport()` 開機合成請求探測;每次請求 finally 內若 `routePath` 空再 fallback,`logger.warn` 由 module-level gate 守至多一次 |
| 4. Matched 404 vs unmatched 404 分流 | `src/node/http-metrics.ts` middleware closure mountPattern 比較分支 | `rawRoutePath === mountPattern && status === 404` → `'not_found'`;其餘 404 保留模板路徑 |
| 5. `/health` `/` byte-equivalent on opt-out | `src/node/app.ts` 模組載入時 short-circuit | `HTTP_METRICS_ENABLED.trim().toLowerCase() === 'false'` 直接 short-circuit,middleware 完全不掛 |
| 6. `/metrics` 在 `/health` 503 時仍可 serve | `src/node/app.ts` `/metrics` handler | 只 `await register.metrics()`,不依賴 `pool.query` / `redis.ping`;`/health` handler 為獨立 route |

## 2. Worker runtime 觀測面(forward-declared,由 002 落地)

### 2.1 對外介面

#### `GET /health`

- **回應**:`200 OK`;body 為 JSON `{"status":"ok","service":"worker","ts":<ISO>}`
- **語意**:不依賴任何 binding(D1、KV);純 sentinel。
- **被誰用**:Cloudflare Healthcheck features、adopter alerting。

#### `GET /metrics`

- **不暴露**。Worker 端不引入 `prom-client`(會破壞 bundle 並製造 V8-incompatible 結構)。
- 觀測由 Cloudflare 內建 analytics 處理(per-request, no opt-in);若 adopter 需要 Prometheus 相容指標,屬 derivative 的觀測層級擴充,本 baseline 不規範。

#### Structured logs(stdout via `console`)

- **Logger**:`console.log` / `console.warn` / `console.error` — Workers 平台的標準輸出通道。
- **格式**:建議單行 JSON,含 `level`、`msg` + 業務 context;但 Workers Logs 對非結構化也能處理。
- **發送目標**:Cloudflare Workers Logs;`wrangler tail` 可即時查閱。

### 2.2 不變量(Worker 端,must — 由 002 落地時兌現)

1. **`/health` 必須 touches no binding**:確保 binding 故障不會讓 health probe 失敗。
2. **不引入 `pino` / `prom-client`**:Worker bundle 體積與 V8 isolate 限制決定,且 Cloudflare 已提供等價觀測(by FR-022 隔離規則)。
3. **`console.*` 不受 SC-009 約束**:per spec.md SC-009 明示「Worker 端因 console 為 Workers 上的標準輸出通道,不受此限」。
4. **comparison demo**:`/d1/now` 對應 Node `/app-api/now` (Postgres);`/kv/echo` 對應 Node `/app-api/echo` (Redis);`/app-api/*` 反向代理保留 path 完整(passthrough,不剝離 `/app-api` prefix,per `.docs/20260430a-cloudflare-worker.md` §4)。

### 2.3 實作對照(forward-declared)

由 002-cloudflare-worker 落地時,本 contract 末段須增「實作對照」表(類比 §1.4),映射 Worker 不變量到 `src/worker/` 行號。**v1.0.0 ratification 時不存在;此段為 reservation。**

## 3. 對 derivative 的 advisory

替換 web framework 後(per FR-018 derivative 契約),adopter 須:

- 仍維持各 runtime 的 `/health` 端點(advisory,但若保留 observability 規範就必須維持)。
- 新加 route 仍須繼承 metrics(Node 端 advisory)。
- log channel 仍為單一(無 console 散文 in Node;Workers logs 結構化 in Worker)— advisory。

> 「降為 advisory」意指 baseline 不再強制這些規範,但若 derivative 主張遵守觀測規範,實作必須與本契約等價。

## 4. 失敗模式(摘錄)

| 場景 | 期望行為 |
|---|---|
| Node 啟動時 routePath probe 失敗 | `/metrics` 仍可 serve;受影響 route 的 label = `unknown`;啟動時 `logger.warn` 一次,不重複洗版 |
| Node `/metrics` scrape 失敗 | Prometheus / VictoriaMetrics 自身機制處理(retry / alerting);baseline 不負責 |
| Pino logger fail-open 不可能(寫 stdout 失敗 = 容器層級問題) | 由 orchestrator healthcheck 接手 |
| Worker `/health` 在 binding 故障時 | 仍回 200(per 不變量 1);binding 健康由各 D1/KV API call 自己 surface error |
| Worker bundle 引入 `pg` / `pino` / `prom-client` | wrangler bundle 階段失敗;FR-022 typecheck 階段(由 002 雙 tsconfig 落地後)更早擋下 |

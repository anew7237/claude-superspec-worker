# Contract: Reverse Proxy `/app-api/*`

**Audience**: Adopter / Worker-side test author / Node-side `/app-api/*` 維護者
**Surface owner**: `src/worker/routes/proxy.ts`(Worker side passthrough)+ `src/node/app.ts`(Node side `/app-api/{health,now,echo}` 對應 routes)
**Related FR / SC**: FR-007, FR-008, FR-013, SC-006, SC-007

## 1. Worker side passthrough behavior

| 屬性 | 值 |
| --- | --- |
| Method | `ALL`(GET / POST / PUT / DELETE / PATCH / HEAD / OPTIONS) |
| Path | `/app-api/*`(Hono wildcard) |
| Bindings touched | `env.UPSTREAM_URL` only(讀 string env var) |
| Timeout | 10 秒(`AbortSignal.timeout(10_000)`) |

**目標 URL 構造**(per §4 修正):

```ts
const incoming = new URL(c.req.url);
const target = `${upstream.replace(/\/$/, '')}${incoming.pathname}${incoming.search}`;
```

**完整 passthrough 不變量**:

1. **Path 完整保留** — worker `/app-api/X` → upstream `/app-api/X`(**不**剝 `/app-api` 前綴)
2. **Query string 完整保留** — `?k=foo&q=bar` 逐字傳給 upstream
3. **Method 完整保留** — GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS 等同 upstream
4. **Headers 透傳** — `c.req.raw.headers` 整份送 upstream;不刪不加(adopter 後續若要加 X-Worker-Token 須於本 contract 之外擴充)
5. **Body 透傳**(non-bodyless methods 才送 body;GET / HEAD 不送)
6. **Status 透傳** — upstream 2xx / 3xx / 4xx / 5xx 一律照 status 回 client
7. **Response headers + body 透傳** — 直接以 upstream `Response` 之 body / status / statusText / headers 重組 new Response

## 2. RequestInit 構造規則(per 設計源 §2.3 lesson 4)

**避免 inline ternary 對 optional field 賦 undefined**(`exactOptionalPropertyTypes: true` 禁止):

```ts
// ✅ 正確 — 逐步建構
const isBodyless = c.req.method === 'GET' || c.req.method === 'HEAD';
const fetchInit: RequestInit = {
  method: c.req.method,
  headers: c.req.raw.headers,
  signal: AbortSignal.timeout(10_000),
};
if (!isBodyless) {
  fetchInit.body = c.req.raw.body;
}
```

```ts
// ❌ 錯誤 — TS 拒,exactOptionalPropertyTypes
const fetchInit = { method, headers, body: isBodyless ? undefined : raw.body };
```

## 3. Error model

| 場景 | Worker 端產 Status | Body |
| --- | --- | --- |
| `env.UPSTREAM_URL` 為空 string 或 undefined | 503 | `{"error":"upstream_not_configured", "hint":"set UPSTREAM_URL var or secret"}` |
| `fetch(target)` throw `DOMException AbortError`(timeout > 10s) | 504 | `{"error":"upstream_timeout", "hint":"no response within 10000ms"}` |
| `fetch(target)` throw 其他 network error(connection refused 等) | 502 | `{"error":"upstream_unreachable"}` + `console.error('proxy.fetch.failed', err)` |
| upstream 回 2xx | 透傳 status + body | (upstream 之 body) |
| upstream 回 non-2xx(404 / 500 等) | 透傳 status + body | (upstream 之 body) |

**重要**:`upstream_timeout` `upstream_unreachable` `upstream_not_configured` 三條為**worker 自身產**之 error,僅當 upstream 無法到達或 worker 自身 misconfigured 時觸發;upstream 自身的 4xx/5xx **不**被改寫成這三條。

## 4. Node side counterpart(`/app-api/{health,now,echo}`)

新增於既有 `src/node/app.ts`,**夾於既有 `/health` 之後、`/metrics` 之前**(避免污染 metrics middleware mount 順序)。

| Path | Method | Handler 行為 |
| --- | --- | --- |
| `/app-api/health` | GET | `c.json({ status: 'ok', service: 'nodejs' })` |
| `/app-api/now` | GET | `pool.query<{now: string}>('SELECT NOW() AS now')` → `{source:"postgres", now:row.now}`;empty rows → 500 `{error:"pg_empty_result"}`;exception → 500 `{error:"pg_query_failed"}` + `logger.warn({err}, 'app-api.now.failed')` |
| `/app-api/echo` | GET | `c.req.query('k')` 缺 → 400 `{error:"missing_param", hint:"k query parameter required"}`;`redis.get(key)` null → 404 `{error:"not_found"}`;hit → `{source:"redis", key, value}`;exception → 500 `{error:"redis_get_failed"}` + `logger.warn({err}, 'app-api.echo.failed')` |

**自動繼承**:

- 既有 http-metrics middleware 掛 `/*`,3 條 `/app-api/*` route 之 metrics 樣本之 `route` label 為 `/app-api/health` `/app-api/now` `/app-api/echo`(per 001 baseline observability.md §1.4 invariant 1)
- 既有 pino logger 為唯一 stdout 通道;`logger.warn / logger.error` 為錯誤紀錄管道(per 001 baseline FR-006 + SC-009 之 no-console rule)

## 5. 不變量(must)

1. **路徑 1:1 對應**:Worker `/app-api/X` 之 X 與 Node `/app-api/X` 之 X 必完全相同(byte-for-byte)
2. **錯誤 model 之 worker 自產 vs upstream 透傳分流清楚**:client 可從 `error` code 字面看出來源(`upstream_*` 三條為 worker;`pg_*`/`redis_*`/`not_found`/`missing_param` 為 Node 端產)
3. **Headers 不主動改**:Worker passthrough 不改 `Authorization` / `Cookie` / `User-Agent` 等;adopter 若要加 worker token 須擴充本 contract
4. **Streaming-friendly**:non-bodyless method 之 body 用 `c.req.raw.body`(`ReadableStream`),不 `await text()` 也不 buffer
5. **Worker 端 timeout 為 10s固定**:不可調(per 設計源 §1.5 / §2);adopter 若需動態 timeout 屬擴充

## 6. 失敗模式

| 場景 | 期望行為 |
| --- | --- |
| Mode A(無 docker compose),`/app-api/now` `/app-api/echo` | upstream `localhost:8000` 上沒 Postgres / Redis,Node 端 route 雖存在但 `pool.query` `redis.get` fail → 500 `pg_query_failed` `redis_get_failed`(透傳)|
| Mode B(docker compose 起),Worker dev 在 dev container 內 | UPSTREAM_URL=`http://host.docker.internal:8000` 經 Docker Desktop 預設 host loopback;Linux 自架 Engine 需 `--add-host=host.docker.internal:host-gateway` runArg(per plan key decision 7)|
| upstream 回 408 / 503 / 等 5xx | 透傳;不改成 worker 端 5xx |
| upstream chunked transfer-encoding 回應 | 透傳(`new Response(upstream.body, ...)` 之 body 為 `ReadableStream`)|
| 同 PR 內改變 worker passthrough 行為(剝 prefix / 改 timeout / 加 header) | reviewer 駁回為 contract 違反;走 spec amendment 流程 |

## 7. Test 驗證點(對應 `tests/worker/proxy.test.ts`,6 cases)

| Case | 行為 |
| --- | --- |
| 1 happy path | mock fetch 回 200 + body;assert worker 透傳 status + body;assert called URL = `${upstream}/app-api/X` |
| 2 upstream 4xx | mock fetch 回 404;assert worker 透傳 404 + body |
| 3 missing UPSTREAM_URL | env override 為空;assert worker 回 503 + `upstream_not_configured` |
| 4 upstream timeout | mock fetch 回 promise > 10s 不 resolve(或 throw AbortError);assert worker 回 504 + `upstream_timeout` |
| 5 network error | mock fetch throw TypeError(connection refused 等);assert worker 回 502 + `upstream_unreachable` |
| 6 query string + path passthrough | request `/app-api/echo?k=foo&q=bar`;assert called URL 完整保留 `/app-api/echo?k=foo&q=bar`(不剝 prefix,不改 query) |

## 8. 對 derivative 的 advisory

- 替換 reverse proxy 行為(改 prefix / 加 auth header)後,本 contract 之「passthrough 不變量」降為 advisory;但 Worker / Node side 之 path 1:1 對應仍為**強烈建議**(否則 demo comparison 失去意義)
- 移除 Node side `/app-api/*` 對應 routes(僅保留 Worker side proxy 不指向特定 endpoint)→ adopter 自家 fork,合法但失去本 monorepo 之比對價值

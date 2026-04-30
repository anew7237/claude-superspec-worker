# Contract: Worker Routes

**Audience**: Adopter / API consumer / future Worker-side test author
**Surface owner**: `src/worker/routes/{health,d1,kv}.ts` + `src/worker/index.ts`(mount + onError + notFound)+ `src/worker/error.ts`(jsonError helper)
**Related FR / SC**: FR-004, FR-005, FR-006, FR-010, SC-003, SC-010

## 1. `GET /health`

| 屬性 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/health` |
| Headers in | 無要求 |
| Bindings touched | **無**(touches no binding) |
| Status | `200 OK` |
| Content-Type | `application/json` |
| Body | `{ "status": "ok", "service": "worker", "ts": "<ISO 8601 string>" }` |

**不變量**:即使 D1/KV/UPSTREAM_URL 失效或 misconfigured,`/health` 仍 200(因 handler 不 touch binding)。讀 `Date()` 即生 ts 字串。

**錯誤路徑**:無(handler 內無 throw 來源,uncaught exception 走 `app.onError` → 500 `internal`)。

## 2. `GET /d1/now`

| 屬性 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/d1/now` |
| Bindings touched | `env.DB`(D1) |
| Success status | `200 OK` |
| Body (success) | `{ "source": "d1", "now": "<timestamp string>" }` |

**SQL**:`SELECT CURRENT_TIMESTAMP AS now`(D1 placeholder schema,無 migration)。

**錯誤路徑**:

| 條件 | Status | Body |
| --- | --- | --- |
| `.first()` 回 null(unexpected) | 500 | `{ "error": "d1_empty_result" }` |
| D1 binding 例外(query / network) | 500 | `{ "error": "d1_query_failed" }` + `console.error('d1.now.failed', err)` |

## 3. `GET /kv/echo?k=<key>`

| 屬性 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/kv/echo` |
| Query | `k`(required, non-empty) |
| Bindings touched | `env.KV` |
| Success status | `200 OK` |
| Body (success) | `{ "source": "kv", "key": "<input>", "value": "<KV value>" }` |

**錯誤路徑**:

| 條件 | Status | Body |
| --- | --- | --- |
| `k` 缺或空 | 400 | `{ "error": "missing_param", "hint": "k query parameter required" }` |
| `env.KV.get(k)` 回 null(miss) | 404 | `{ "error": "not_found" }` |
| KV binding 例外 | 500 | `{ "error": "kv_get_failed" }` + `console.error('kv.echo.failed', err)` |

## 4. `ALL /app-api/*` — see [reverse-proxy.md](./reverse-proxy.md)

(見 sibling contract)

## 5. Cross-cutting

### 5.1 Error helper(`src/worker/error.ts`)

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

**不變量**:

- 所有 4xx / 5xx response body 統一為 `{ error: <code>, hint?: <string> }` 形式
- `error` value 為小寫底線格式之 stable code(client 可 string-equality match)
- `hint` 為人類可讀補充,僅當有助 debug 時提供

### 5.2 `app.onError` + `app.notFound`

```ts
app.onError((err, _c) => {
  console.error('unhandled', err);
  return jsonError(500, 'internal');
});

app.notFound(() => jsonError(404, 'not_found'));
```

任何非預期 throw 走此 catch-all,**不暴露 stack trace 給 client**,但走 `console.error` 可被
Workers Logs / `wrangler tail` 收。

## 6. 不變量(must,跨所有 routes)

1. **Content-Type 始終 `application/json`**:無論 success / error。
2. **Stateless**:同 query 多次呼叫必同 response(對 D1/KV 而言,輸出依 binding state 變;但 handler 內無 module-level state)。
3. **不污染 stdout 為非結構**:Worker 端走 `console.log` / `console.error` 為標準輸出通道(per 001 baseline observability.md §2 + 憲法 §II);**不**引 `pino`(per FR-010)。
4. **不暴露 binding 失敗細節給 client**:exception 內部 catch + 統一 jsonError;`console.error` 帶完整 stack 給 Workers Logs。
5. **路徑 case-sensitive 同 Hono 預設**:不主動 normalize。
6. **不引 `nodejs_compat`**:純 Workers APIs 即足。

## 7. 失敗模式

| 場景 | 期望行為 |
| --- | --- |
| D1 namespace 未 migrate(空 schema)| `SELECT CURRENT_TIMESTAMP` 仍可跑(SQLite 內建);若 adopter 改 SQL 至需 schema,自身負責 migration |
| KV namespace 沒任何 key | `env.KV.get('foo')` 回 null → 404 not_found(per §3 錯誤路徑) |
| Worker 部署但 D1 binding 沒設 | wrangler deploy 階段 fail(missing binding);`/d1/now` 不可達 |
| 多個 Worker route 同 path 衝突 | Hono 路由 first-match;不應發生因 4 routes 路徑互斥 |
| 未匹配 path(如 `/foo/bar`)| `app.notFound` → 404 + `{error:"not_found"}` |

## 8. Test 驗證點(對應 `tests/worker/` 5 個 test 檔)

| Test file | 對應 contract |
| --- | --- |
| `health.test.ts` | §1 全部 |
| `d1.test.ts` | §2 success + d1_query_failed(透過 mock D1 throw)|
| `kv.test.ts` | §3 三 case(hit / miss / missing-param)|
| `proxy.test.ts` | reverse-proxy.md(sibling contract)|
| `error.test.ts` | §5.1 jsonError unit test(各 status / 含 hint vs 不含)|

## 9. 對 derivative 的 advisory

替換 framework 後(per 001 baseline FR-018 derivative 契約),adopter 須:

- 仍提供 `/health` 等價 endpoint(touches no binding 不變量繼續 advisory)
- D1 / KV demo 屬 starter 可選;adopter 可移除(不違反 baseline 規範)
- jsonError 結構為**強烈建議**(client 可預期 `{error, hint?}` shape);若改變需於 README 明示

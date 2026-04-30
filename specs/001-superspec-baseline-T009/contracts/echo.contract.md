# Contract: `GET /echo` Endpoint

**Audience**: API consumer / integration tests / 後續 derivative
**Surface owner**: `src/node/app.ts`(handler)+ `tests/node/echo.test.ts`(verification)
**Related FR / SC**: spec.md FR-001 ~ FR-006 / SC-001 ~ SC-005

## Request

| 屬性 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/echo` |
| Query parameters | `msg`(string,**required**;空字串等同 missing) |
| Headers | 不要求特定 header(非 auth、非 Content-Type 限制) |
| Body | 無(GET 慣例) |

## Response — Success(200)

| 屬性 | 值 |
| --- | --- |
| Status | `200 OK` |
| Content-Type | `application/json`(由 Hono `c.json()` 自動設定) |
| Body | `{ "message": "<msg 解碼後值>" }`(單一 key,字串 value) |

範例:

- Request: `GET /echo?msg=hello` → `{"message":"hello"}`
- Request: `GET /echo?msg=hello%20world` → `{"message":"hello world"}`
- Request: `GET /echo?msg=%E4%BD%A0%E5%A5%BD` → `{"message":"你好"}`

## Response — Error(400)

| 屬性 | 值 |
| --- | --- |
| Status | `400 Bad Request` |
| Content-Type | `application/json` |
| Body | `{ "error": "missing msg" }`(字面英文小寫) |

觸發條件:

- `msg` query parameter 缺失(`GET /echo`)
- `msg` 為空字串(`GET /echo?msg=`)

## 不變量(must)

1. **route label = `"/echo"`**:metrics middleware 對此 route 之樣本 `route` label 必為字面 `/echo`,非 `not_found` 亦非 `unknown`(per 001 baseline observability.md §1.3 不變量 1-2)。
2. **status_code label 隨實際 response status**:200 / 400 各自對應 metrics counter / histogram 之 `status_code` label。
3. **Content-Type 始終 application/json**:無論 200 或 400,皆為 JSON;不可回 plain text 或 HTML。
4. **Stateless**:多次相同 request 必回相同 response(冪等);不持久化任何狀態。
5. **不污染 stdout**:handler 內若需 log,用 `pino` logger;絕不 `console.*`(per SC-009)。

## 失敗模式

| 場景 | 期望行為 |
| --- | --- |
| `?msg=` 空字串 | 400 + `{"error":"missing msg"}`(不因 query 存在但 value 為空而誤判合法) |
| `?msg=a&msg=b`(多重) | 200 + `{"message":"a"}`(取第一,per Hono 預設) |
| `POST /echo` 等非 GET | Hono 預設 405 / 404(不顯式註冊其他 method) |
| 大量 msg(超 reverse proxy URI 上限) | 414 URI Too Long(由上游基礎建設處理,非本 contract 範疇) |
| `HTTP_METRICS_ENABLED=false` 啟用 | `/echo` 仍 200 / 400 行為不變;只是 `/metrics` 不再有 `route="/echo"` 樣本 |

## Test 驗證點(對應 `tests/node/echo.test.ts`)

| Test case | 對照 contract |
| --- | --- |
| `GET /echo?msg=hello` → 200 + body 比對 | success path、Content-Type、body shape |
| `GET /echo` → 400 + body 比對 | error path、Content-Type、`error` 字面值 |
| `GET /echo?msg=` → 400 + body 比對 | empty-string 等同 missing |
| `GET /echo?msg=hello` 後 `GET /metrics` 含 `route="/echo"` | 不變量 1(route label inheritance) |
| 無 `console.*` 出現於 src/node/app.ts 對應 echo handler | 不變量 5(由 ESLint `no-console` 機械擋,本 test 為人類 review) |

## 對 derivative 的 advisory

替換 framework 後(per 001 baseline FR-018 derivative 契約),adopter 須:

- 仍提供 `/echo` 等價 endpoint;若 framework 變動使 `c.req.query()` 等 API 名變,本 contract 之
  「行為定義」(input → output mapping)依然 binding。
- 若刪除 `/echo` 屬本 sample feature 接受(per spec.md preamble),不違反任何 baseline 規範。

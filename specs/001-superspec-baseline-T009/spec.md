# Feature Specification: GET /echo Endpoint (SC-007 walkthrough sample)

**Feature Branch**: `001-superspec-baseline-T009`
**Created**: 2026-04-30
**Status**: Draft
**Input**: User description: "在 Node 應用加一個 GET /echo endpoint,接受 query string ?msg=xxx,回傳 JSON {\"message\":\"xxx\"};若沒帶 msg 則回 400 + JSON {\"error\":\"missing msg\"}。屬於 SC-007 walkthrough 範例 feature,可在驗收後刪除。"

> **本 feature 僅作為 001-superspec-baseline 之 SC-007 walkthrough 範例**(Task T009)。整段
> SDD pipeline 跑完即視為 SC-007「第一個自家 feature ≤ 1 hour」量化證據;feature 本身可在驗收
> 後保留為實證 anchor 或刪除。**對 Node baseline 應用程式之變更僅 +1 route + 對應測試**,
> 不引入新依賴、不變更既有契約。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 開發者送 msg 參數收到 echo 結果 (Priority: P1)

API 消費者(同一 monorepo 內的開發者或外部 client)送出 `GET /echo?msg=hello`,期望即刻收到
`{"message":"hello"}` 之 JSON 回應(HTTP 200)。`msg` 內容為任意 URL-safe 文字,長度由
框架預設與 reverse proxy 上限決定,本 feature 不另設限。

**Why this priority**:此為 endpoint 之主要用途;失去此 happy path,feature 失去意義。

**Independent Test**:任何 HTTP client(curl / fetch / browser)發送 `GET /echo?msg=<value>`
即可獨立驗證 — 不需 db / redis / 任何 stateful component。

**Acceptance Scenarios**:

1. **Given** Node 應用 stack 已啟動(`make up` 全綠),**When** `curl -sS 'http://localhost:8000/echo?msg=hello'`,**Then** HTTP 200 + body `{"message":"hello"}`(欄位順序可不嚴格,但 key 名與 value 內容須完全相符)。
2. **Given** 同上,**When** msg 含 URL-encoded 中文(`?msg=%E4%BD%A0%E5%A5%BD`),**Then** 200 + body `{"message":"你好"}`(框架負責解碼)。
3. **Given** 同上,**When** msg 含空白(`?msg=hello%20world`),**Then** 200 + body `{"message":"hello world"}`。

---

### User Story 2 - 缺少 msg 參數收到 400 錯誤 (Priority: P1)

API 消費者誤送 `GET /echo`(無 `msg` query string)時,期望立刻收到 HTTP 400 + 結構化
JSON 錯誤訊息,而非 200 + 空字串或 5xx。提供一致、可被 client 自動化處理的錯誤格式。

**Why this priority**:輸入驗證為 API 健壯性的最低限承諾;缺此分支即任何空 msg 都被當合法,
退化為「default to empty string」之 silent footgun。

**Independent Test**:`curl -sS -w '%{http_code}' 'http://localhost:8000/echo'` 即可驗證
HTTP code = 400 + body 為預期 JSON,不需額外 setup。

**Acceptance Scenarios**:

1. **Given** Node 應用 stack 已啟動,**When** `curl -sS -w '%{http_code}' 'http://localhost:8000/echo'`,**Then** HTTP 400 + body `{"error":"missing msg"}`。
2. **Given** 同上,**When** `curl -sS 'http://localhost:8000/echo?msg='`(空字串值),**Then** HTTP 400 + body `{"error":"missing msg"}`(empty 視為等同 missing,per Assumption 2)。
3. **Given** 同上,**When** 多個 msg(`?msg=a&msg=b`),**Then** HTTP 200 + body 取第一個值(per Assumption 3)。

---

### User Story 3 - 新增 route 自動繼承 observability(Priority: P2)

開發者新增 `/echo` 之後,**不需做任何 metrics 接線**,於 `/metrics` 1 分鐘內可見此 route 的
counter 與 histogram 樣本(`route="/echo"`)。stdout 結構化 log 含此 request。

**Why this priority**:此 feature 同時兌現 001 baseline 之 FR-006 / SC-004 承諾(observability
default 自動繼承);若失敗即代表 baseline 規範本身崩盤,影響超過本 sample feature 範圍。
但相對於 P1 之核心功能驗收,此項屬「順帶確認」性質,P2。

**Independent Test**:對 `/echo?msg=test` 發 ≥ 1 次 request 後 `curl /metrics | grep '/echo'`,
應見 `http_requests_total{...,route="/echo",...}` 與 `http_request_duration_seconds_bucket{...,route="/echo",...}`。

**Acceptance Scenarios**:

1. **Given** 應用啟動且 `/echo` 已被 hit 至少一次,**When** `curl /metrics | grep '"/echo"'`,**Then** 輸出含 `http_requests_total` counter 與 `http_request_duration_seconds_*` histogram(對應 route="/echo")。
2. **Given** 設 `HTTP_METRICS_ENABLED=false` 並重啟,**When** 同上 grep,**Then** 0 hits(middleware 整段 short-circuit,per 001 baseline observability.md §1.2)。

---

### Edge Cases

- **空 `msg` 值** 視為 missing(per Assumption 2);若 client 真需傳空字串,屬不在此 feature scope 之變更請求。
- **重複 msg 參數**(`?msg=a&msg=b`)取第一個值,per Hono 預設 query parser(Assumption 3)。
- **Non-UTF-8 byte sequence in msg**(非常見,通常被 client 端 encoding 攔下):由框架 / Node http parser 自然處理,本 feature 不顯式檢測。
- **msg 過長** 超 reverse proxy 預設 URL 長度上限(典型 8 KB)時 414 URI Too Long,屬上層基礎建設行為,本 feature 不額外處理。
- **non-GET method**(POST /echo 等)落在 Hono 預設 405 / 404 行為;本 feature 不顯式註冊其他 method handler。

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**:應用 MUST 暴露 path `/echo` 之 `GET` route,於 Node 應用主 router 註冊(同 `/health` `/metrics` 同層)。
- **FR-002**:當 query string `msg` 存在且非空字串時,response MUST 為 HTTP 200 + JSON `{"message": "<msg 值>"}`,`message` 之值忠實反映 query string 解碼後內容,Content-Type `application/json`。
- **FR-003**:當 query string `msg` 缺失或為空字串時,response MUST 為 HTTP 400 + JSON `{"error": "missing msg"}`,Content-Type `application/json`。`error` value 字面為 `missing msg`(英文小寫)以利自動化 client 比對。
- **FR-004**:`/echo` route MUST 自動被 `http-metrics` middleware 涵蓋(per 001 baseline FR-006);不需於 `app.ts` 新加任何 metrics 樣板。
- **FR-005**:`/echo` 之 metrics 樣本 `route` label MUST 為字面 `"/echo"`(模板路徑);非 `not_found` 亦非 `unknown`。
- **FR-006**:`/echo` request / response 之 stdout log MUST 為 pino 預設結構化 JSON 一行(per 001 baseline FR-006);不可使用 `console.*`(per 001 baseline SC-009)。

### Key Entities

(本 feature 為純 stateless endpoint,**無 entity** — 不引入 db / redis schema、不操作 KV、不持久化任何狀態。)

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**:對 `GET /echo?msg=<任意非空字串>` 之請求,**100%** 回 HTTP 200 + 正確 JSON 結構;任何「200 + 錯誤 body」或「非 200」即視為失敗。
- **SC-002**:對 `GET /echo`(無 msg)或 `GET /echo?msg=`(空 msg),**100%** 回 HTTP 400 + 正確 JSON 結構;任何「200 但空 message」或「500」即視為失敗。
- **SC-003**:對 `/echo` 之首次成功請求落地後,**60 秒內** `/metrics` 必可見其 counter 與 histogram 樣本(per 001 baseline SC-004 之 1-minute budget)。
- **SC-004**:`/echo` 自首次部署後 30 天內 ad-hoc `console.*` 出現次數 = 0(由 ESLint `no-console` rule 機械保證,per 001 baseline SC-009)。
- **SC-005**:整輪 SDD pipeline(specify → clarify → plan → tasks → implement,本 feature 即 T009)在 ≤ 1 hour 內完成,**兌現 001 baseline SC-007**。

## Assumptions

1. **Hono 4.x 為應用 web framework**(per 001 baseline plan / Hono 為憲法 CORE),`app.get('/echo', handler)` 之註冊樣式不變;handler 內存取 `c.req.query('msg')` 取得 msg 值。
2. **空字串等同 missing**:`?msg=` 視為「缺少」而非「以空字串作為合法 msg」。理由:HTTP 慣例上空字串難與 absence 區分(尤其經中介 proxy / cache 後),客戶端若刻意發空字串通常為錯誤。
3. **多重 msg 取第一**:`?msg=a&msg=b` 取 `a`,per Hono 預設 query parser(`c.req.query('msg')` 回傳第一個值;若需全部需 `c.req.queries('msg')`)。
4. **不引入 rate limiting / auth**:`/echo` 比照 `/health` `/metrics` 之 public endpoint 模式,無 auth、無 rate limit。derivative adopter 若需保護,自行於上游 reverse proxy 加。
5. **prom-client metrics 對 `/echo` 自動生效**:基於 001 baseline observability.md §1.4 invariant 1(`/*` mount + middleware closure 自動覆蓋);不需在 plan 階段重新 derive。
6. **Tests 使用 vitest 4 + Hono `app.request()`** 模式,如同既有 `tests/node/http-metrics.*.test.ts`;不引入新測試框架。

## Dependencies

- 上游依賴(已在 001 baseline 兌現):Hono 4.x、`@hono/node-server`、`prom-client`(per `package.json`)。
- 規範依賴:001 baseline FR-006 / SC-004 / SC-009、constitution v1.0.0 §II Observability by Default、§I Test-First Development、§IV Type Safety End-to-End。
- 無新外部 service / 新 npm 依賴。

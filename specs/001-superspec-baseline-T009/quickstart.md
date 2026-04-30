# Quickstart: GET /echo Endpoint(SC-007 walkthrough)

**Audience**: Adopter / 後續 walkthrough 計時人
**Goal**: 從本 feature 已 implement 完成的狀態,手動驗證 6 個 acceptance scenario,確認與
contracts/echo.contract.md 一致。

> 預期 elapsed:**< 5 分鐘**(不含等待 stack 啟動)。本 quickstart 僅驗 functional 行為,不
> 涉 SDD pipeline 計時(後者由 `.docs/onboarding-stopwatch.md` 「第一個 SDD feature」段紀錄)。

## Step 0 — 前置

- 本 feature 已 implement 完成(`/speckit-implement` 已跑完,所有 quality gates 綠)。
- Node 應用 stack 啟動:`make up`(在 dev container 內或 host 直接跑)。
- 三個 service 全綠 healthcheck(`docker compose ps` 看 healthy)。

## Step 1 — Happy path

```bash
curl -sS 'http://localhost:8000/echo?msg=hello'
```

期望:

```json
{"message":"hello"}
```

HTTP status 200(可加 `-w '%{http_code}'` 顯式驗證)。

## Step 2 — URL-encoded msg

```bash
curl -sS 'http://localhost:8000/echo?msg=hello%20world'
```

期望:`{"message":"hello world"}`(空白被 framework decode)。

```bash
curl -sS 'http://localhost:8000/echo?msg=%E4%BD%A0%E5%A5%BD'
```

期望:`{"message":"你好"}`(中文 UTF-8 decode)。

## Step 3 — 缺少 msg → 400

```bash
curl -sS -w ' HTTP %{http_code}\n' 'http://localhost:8000/echo'
```

期望:`{"error":"missing msg"} HTTP 400`。

```bash
curl -sS -w ' HTTP %{http_code}\n' 'http://localhost:8000/echo?msg='
```

期望同上(空字串等同 missing)。

## Step 4 — 多重 msg 取第一

```bash
curl -sS 'http://localhost:8000/echo?msg=a&msg=b'
```

期望:`{"message":"a"}`(per spec.md Assumption 3)。

## Step 5 — Metrics 自動繼承

對 `/echo` 至少 hit 過一次後:

```bash
curl -sS http://localhost:8000/metrics | grep '"/echo"'
```

期望(節錄):

```
http_requests_total{method="GET",route="/echo",status_code="200"} 1
http_requests_total{method="GET",route="/echo",status_code="400"} 2
http_request_duration_seconds_bucket{...,route="/echo",...} <bucket count>
http_request_duration_seconds_count{method="GET",route="/echo",status_code="200"} 1
http_request_duration_seconds_sum{method="GET",route="/echo",status_code="200"} <total seconds>
```

關鍵觀察點:

- `route` label 必為字面 `"/echo"`,非 `unknown` 亦非 `not_found`。
- counter 與 histogram 都有對應 `/echo` 樣本(US3 + FR-005)。

## Step 6 — Opt-out 行為

```bash
HTTP_METRICS_ENABLED=false make up   # 重啟 stack 帶這個 env(或編輯 .env 後 make up)
curl -sS http://localhost:8000/echo?msg=hello   # 仍 200 + 正確 body
curl -sS http://localhost:8000/metrics | grep '"/echo"' || echo "no /echo metric"
```

期望:`/echo` 行為不變(仍 200 + body),但 `/metrics` 不再有 `route="/echo"` 樣本(per
contract 失敗模式表最後一列)。

## Step 7 — Stack 收場

```bash
make down
```

容器停掉,volumes 保留(若你想下次繼續用既有 db / redis state)。

## Acceptance — 你完成了嗎?

- [ ] Step 1 happy path 200 + 正確 body
- [ ] Step 2 URL-encoded 解碼正確
- [ ] Step 3 缺 msg → 400 + 正確 body
- [ ] Step 4 多重 msg 取第一
- [ ] Step 5 metrics 含 `route="/echo"`
- [ ] Step 6 opt-out 行為符合預期

✅ 全部勾選 → 本 sample feature 兌現 spec.md 全 5 SC,並驗證 001 baseline observability invariant
仍 holding(SC-004 跨 feature 仍綠)。

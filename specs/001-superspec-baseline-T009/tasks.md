---
description: "Tasks: GET /echo endpoint (SC-007 walkthrough sample of 001-superspec-baseline)"
---

# Tasks: GET /echo Endpoint (SC-007 walkthrough)

**Input**: Design documents from `/specs/001-superspec-baseline-T009/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/echo.contract.md, quickstart.md
**Tests**: 本 feature **明示要求 TDD** — 對應 spec FR-005 / SC-001~SC-005、constitution v1.0.0 §I 不可協商。所有 implementation 任務都先有對應 RED test;此檔列為 mandatory tests。

**Organization**: Tasks 依 spec.md 的 3 個 user stories 分相 phase。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: 可平行(不同檔、無未完成依賴)
- **[Story]**: 對應 spec.md user story(US1 happy / US2 400 / US3 metrics inheritance);跨 story / setup / polish 任務不帶 story label
- 描述含絕對檔案路徑(repo-relative)

## Path Conventions

本 feature 為 monorepo 內 Node 應用單檔修補:`src/node/app.ts`(handler 註冊)+ `tests/node/echo.test.ts`(新增測試)。

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**:無新依賴 / 無新模組,本 phase 僅作 sanity 確認。

- [X] T001 確認當前 branch 為 `001-superspec-baseline-T009`(`git branch --show-current`);確認 working tree 含 `specs/001-superspec-baseline-T009/{spec,plan,research,data-model,quickstart}.md` + `contracts/echo.contract.md`(已由 `/speckit-plan` 產出)。**對應 plan.md Project Structure**

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**:確認 baseline mandatory gates 在 implement 前已綠,作為 RED→GREEN 的起點(避免把先前 broken state 誤算成 feature regression)。

**⚠️ CRITICAL**:完成此 phase 後 user story 才能進入 RED 階段

- [X] T002 跑一次完整 mandatory gates 確認綠地起點:`pnpm install --frozen-lockfile` → `pnpm test`(預期 7 file / 20 tests pass)→ `pnpm typecheck`(exit 0)→ `pnpm lint`(exit 0)→ `pnpm exec prettier --check .`(exit 0)。任一失敗 STOP 調查(可能 main 後續 commit 引入 regression)。**對應 001 baseline FR-005 / FR-008 / FR-009 / FR-010**

**Checkpoint**:基線綠地確認 — RED→GREEN 起點明確

---

## Phase 3: User Story 1 - Happy path GET /echo?msg=xxx (Priority: P1) 🎯 MVP

**Goal**:`GET /echo?msg=hello` 回 200 + `{"message":"hello"}`,涵蓋 URL-encoded、中文、空白等 happy path 子情境。

**Independent Test**:`curl -sS 'http://localhost:8000/echo?msg=hello'` 應 200 + body `{"message":"hello"}`。

### Tests for User Story 1 (TDD mandatory) ⚠️

> **NOTE**:Test 必須先寫 + RED 失敗 + 才寫 implementation

- [X] T003 [P] [US1] 在 `tests/node/echo.test.ts` 新增 describe block "GET /echo - happy path",含至少 3 個 it case:(a) `?msg=hello` → 200 + `{"message":"hello"}`;(b) URL-encoded 空白 `?msg=hello%20world` → `{"message":"hello world"}`;(c) URL-encoded 中文 `?msg=%E4%BD%A0%E5%A5%BD` → `{"message":"你好"}`。使用 Hono `app.request()` mode(同 `tests/node/http-metrics.test.ts` 慣例)。**RED:tests fail (`pnpm test`),因 handler 未實作**

### Implementation for User Story 1

- [X] T004 [US1] 在 `src/node/app.ts` 註冊 `app.get('/echo', handler)`;handler 內 `const msg = c.req.query('msg'); if (!msg) return c.json({error:'missing msg'}, 400); return c.json({message: msg});`(只實作 happy 分支,error 分支保留給 US2 但同檔不可避免一起寫;US2 RED test 將驗證 error 分支)。在現有 `app.get('/metrics', ...)` 之上、`app.get('/health', ...)` 之下任何位置即可,但**不可放在 `app.use(METRICS_MOUNT, ...)` 之前**(避免被 metrics middleware 跳過)。**GREEN:T003 tests pass**

**Checkpoint**:US1 happy path 兌現,SC-001 (100% 200 + 正確 JSON) 機械驗證

---

## Phase 4: User Story 2 - Missing msg → 400 (Priority: P1)

**Goal**:`GET /echo`(無 msg)或 `GET /echo?msg=`(空值)回 400 + `{"error":"missing msg"}`。

**Independent Test**:`curl -sS -w '%{http_code}' 'http://localhost:8000/echo'` 應 HTTP 400 + body `{"error":"missing msg"}`。

### Tests for User Story 2 (TDD mandatory) ⚠️

- [X] T005 [P] [US2] 在 `tests/node/echo.test.ts` 新增 describe block "GET /echo - missing msg",含至少 3 個 it case:(a) `GET /echo` (無 query) → 400 + `{"error":"missing msg"}`;(b) `GET /echo?msg=` (空字串) → 400 + 同 body;(c) `GET /echo?msg=a&msg=b` → 200 + `{"message":"a"}`(per spec.md Assumption 3)。**注意**:T004 implementation 已包含 `if (!msg)` 邏輯,故 T005 可能直接 GREEN 而非 RED;若 GREEN 須在 PR description 顯式 declare「US2 與 US1 共享 implementation 檔,T005 RED 視同 T003 RED 階段」(無迴避 TDD 紀律,只是 same-file invariant)。**對應 spec FR-003 + Assumption 2 + 3**

### Implementation for User Story 2

- [X] T006 [US2] 確認 T004 之 handler 已涵蓋 missing / empty msg 分支(`if (!msg)` 涵蓋 undefined + 空字串,因 JS truthy);若 T005 RED 觸發發現邏輯不足,於 `src/node/app.ts` echo handler 微調。**GREEN:T005 tests pass**

**Checkpoint**:US2 兌現,SC-002 (100% 400 + 正確 JSON) 機械驗證

---

## Phase 5: User Story 3 - Metrics 自動繼承 (Priority: P2)

**Goal**:`/echo` 自動被 http-metrics middleware 涵蓋,`/metrics` 1 分鐘內可見 `route="/echo"` counter + histogram。

**Independent Test**:對 `/echo?msg=test` hit ≥ 1 次後 `curl /metrics | grep '"/echo"'` 應有 `http_requests_total{...,route="/echo",...}` + `http_request_duration_seconds_bucket{...,route="/echo",...}`。

### Tests for User Story 3 (TDD mandatory) ⚠️

- [X] T007 [P] [US3] 在 `tests/node/echo.test.ts` 新增 describe block "GET /echo - metrics inheritance",至少 1 個 it case:對 `/echo?msg=foo` 發 request 後,呼叫 register.metrics() 取得 prom-client 序列化文字,grep 應出現 `http_requests_total{...,route="/echo",...,status_code="200"}` 樣本。可參考 `tests/node/http-metrics.regression.test.ts` 的 register reset / metric snapshot 樣式。**對應 spec FR-004 / FR-005 / SC-003**

### Implementation for User Story 3

- [X] T008 [US3] **無需新 implementation** — 因 baseline `httpMetrics()` middleware 掛在 `/*`(per `src/node/app.ts:19`),只要 T004 的 handler 出現在 `app.use` 之後,自動繼承。本 task 為「驗證確認」性質:跑 T007 確保 GREEN;若 fail,代表 baseline observability invariant 1 已破(屬 `001-superspec-baseline` regression),須回頭修補 baseline 而非本 feature。

**Checkpoint**:US3 兌現,SC-003 / SC-004 機械驗證

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**:跨 story 的最終一致性檢查 + manual quickstart 走查 + 計時收尾。

- [X] T009 [P] 跑 `pnpm test` 全套(預期 7 file + 1 new file = 8 file / 20 + N tests pass,N ≥ 7 from new echo.test.ts)。**對應 quality-gates mandatory gate Tests**
- [X] T010 [P] 跑 `pnpm typecheck`(exit 0)、`pnpm lint`(exit 0,no-console rule 確認 echo handler 無 `console.*`)、`pnpm exec prettier --check .`(exit 0)。**對應 quality-gates mandatory gates Types / Lint / Style**
- [X] T011 跑一次 `make up`,手動走 quickstart.md Step 1-7(6 個 acceptance scenario + opt-out + 收場)。記錄 elapsed time 至 `.docs/onboarding-stopwatch.md`「第一個 SDD feature 量測(T009 補充)」段。**對應 spec SC-005 + 001 baseline SC-007 + T009 verification**
- [X] T012 計算整輪 SDD pipeline elapsed:`date +%s` 終點 - `/tmp/t009-start.txt` 起點 / 60 = 分鐘數,記錄至 `.docs/onboarding-stopwatch.md`「第一個 SDD feature 量測」段(欄位:specify / clarify / plan / tasks / implement(T001-T010) / quickstart(T011) / 總計);若 ≤ 60 min 即達成 SC-007。**對應 spec SC-005 + 001 baseline SC-007**

**Checkpoint**:001-superspec-baseline-T009 整輪交付完成,SC-007 ≤ 1 hour 量化證據就位。**Sample feature 之後可由 maintainer 決定 merge 至 main 作永久實證 anchor 或 `git branch -D` 刪除(per spec.md preamble)**

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**:無依賴
- **Foundational (Phase 2)**:依賴 Phase 1;阻塞所有 user story
- **US1 (Phase 3)**:依賴 Phase 2;為 MVP
- **US2 (Phase 4)**:依賴 Phase 2 + 與 US1 共享 `src/node/app.ts` 檔(non-parallel against US1)
- **US3 (Phase 5)**:依賴 Phase 2 + US1 已落地(因 metrics 觀察需 happy path 已可被觸發);與 US2 可並行寫測但驗證需序列
- **Polish (Phase 6)**:依賴所有 US 完成

### Within-Phase Dependencies

- **T003 → T004**(RED → GREEN of US1)
- **T005 → T006**(RED → GREEN of US2;T005 同檔覆蓋 T004 implementation)
- **T007 → T008**(US3 只是驗證,GREEN 不需新 implementation)
- **T009 / T010 → T011 → T012**(Polish 序列:gates → quickstart manual → 計時)

### Parallel Opportunities

- T003 ∥ T005 ∥ T007:不同 describe block 寫測試,可同時起手草稿(但都改同檔 `tests/node/echo.test.ts`,實際 commit 須序列;標 [P] 為「可獨立思考」非「可並行 commit」)。
- T009 ∥ T010:都是 read-only gate run,可同時跑(實務上一個 terminal 連跑即可)。
- T011、T012 必序列(quickstart 完才能算總時間)。

### MVP Scope

完成 Phase 1 + Phase 2 + Phase 3(US1)即達 MVP:

- `/echo?msg=X` 回 200 + 正確 body
- 基本 happy path 兌現,可 demo

US2-US3 為快速漸進交付。Phase 6 收尾兌現 SC-005 + 001 baseline SC-007 計時。

---

## Parallel Example: User Story 1

```bash
# US1 RED phase:
Task: "Add 'GET /echo - happy path' describe block to tests/node/echo.test.ts (T003)"

# 確認 RED:
pnpm test  # 預期 echo.test.ts 失敗,其他 7 file 仍 pass

# US1 GREEN phase:
Task: "Add app.get('/echo', handler) to src/node/app.ts (T004)"

# 確認 GREEN:
pnpm test  # 預期 echo happy tests pass,total tests = 20 + N
```

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1 Setup(T001)
2. Phase 2 Foundational(T002)
3. Phase 3 US1(T003 → T004)
4. **Stop & Validate**:`make up` + `curl /echo?msg=hello`,確認 200 + 正確 body

### Incremental Delivery

1. MVP(US1)→ baseline echo 可用
2. US2(T005 → T006)→ 400 error 兌現
3. US3(T007 → T008)→ metrics 繼承確認
4. Polish(T009-T012)→ gates 再驗 + quickstart manual + 計時

### 預期時間配置(SC-007 ≤ 1 hour)

- Phase 1 + 2:5 min
- US1(T003 + T004):15 min
- US2(T005 + T006):10 min
- US3(T007 + T008):10 min
- Polish(T009-T012):15 min,含 quickstart manual walk-through

合計 ≈ 55 min,在 SC-007 budget 內。

---

## Notes

- [P] = 不同 logical task,可獨立思考(實際同檔 commit 仍須序列)
- [Story] = 對應 spec.md user story(US1 / US2 / US3)
- 每個 user story 完成後,quickstart.md 對應 step 應仍可跑通
- 所有改動須通過容器內 / host 內 mandatory gates(test / typecheck / lint / prettier)
- Commit / push 由 user 明確指示後執行(專案 CLAUDE.md 規範);本 plan 不自動 commit
- T004 與 T006 共享同檔(`src/node/app.ts`)同函式,實作時請於 T004 一次寫完 happy + error 邏輯;T006 為「驗證 + 微調」性質而非「新增程式碼」
- Sample feature 之後可丟可留:per spec.md preamble,SC-007 量化證據已落地於 `.docs/onboarding-stopwatch.md` 即達成 T009,feature 本身存廢屬 maintainer 決定

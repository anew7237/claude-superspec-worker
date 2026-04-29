---

description: "SuperSpec Worker Monorepo Baseline — task list to verify regulatory state and close residual companion-doc gaps"
---

# Tasks: SuperSpec Worker Monorepo Baseline

**Input**: Design documents from `/specs/001-superspec-baseline/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/(5 個), quickstart.md
**Tests**: 本 baseline 為 meta-project,不引入新 application code;tests OPTIONAL 且本 plan 不要求新 test。既有 `tests/node/**`(20 tests on vitest 4)為 SC-004 / SC-009 / SC-011(Node 端) regression anchor,於 T002 mandatory gates 中驗證。

**Organization**: Tasks 依 spec.md 的 5 個 user stories 分相 phase,組合「audit verification」+「companion-doc gap closure」+「polish」三類產出。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行(不同檔、無未完成依賴)
- **[Story]**: 對應 spec.md user story(US1 onboarding / US2 SDD pipeline / US3 跨平台 parity / US4 observability / US5 toolchain 孤立升級)
- 描述含絕對檔案路徑(repo-relative)

## Path Conventions

本 baseline 為 meta-project,paths 多在 monorepo surface(`.docs/`、`.gitignore`、`README.md`、`.specify/`),非 `src/`。新建文件統一放 `.docs/`。

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 微小調整修補 sensitive-material 契約已揭露但未閉合的 gap

- [ ] T001 [P] 在 `.gitignore` build artifact 段(`.vitest-cache/` 之後)加入 `.wrangler/` 一行;sensitive-material.md §Build artifacts 已宣告為應 ignore(對應 002 wrangler dev 產生的 local cache)。**對應 sensitive-material.md follow-up;pre-emptive,因 v1.0.0 時 wrangler 尚未引入,無立即洩漏風險,但避免 002 落地時忘記**

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 證明現狀真的滿足 17 條 ✅ FR(research.md gap analysis 的審計憑證)

**⚠️ CRITICAL**: 完成此 phase 後 user story 才能驗收

- [ ] T002 在 dev container(或本機 host with deps installed)執行 mandatory quality gates 全套:`pnpm install --frozen-lockfile` → `pnpm test`(預期 7 file / 20 tests pass)→ `pnpm typecheck`(預期 exit 0、無 output)→ `pnpm lint`(預期 exit 0、無 output)→ `pnpm exec prettier --check .`(預期 exit 0、無 style issues — `.prettierignore` 已含 `.specify/` `CLAUDE.md` `wrangler.jsonc`)。任一失敗即停下調查。**對應 quality-gates.md mandatory gates + FR-005 / FR-008 / FR-009 / FR-010**
- [ ] T003 [P] 執行 `pnpm config get engine-strict` 驗證回應 `true`(FR-008 mechanical enforcement 確認)。若非 true 則檢查 `.npmrc` 是否被誤覆蓋
- [ ] T004 [P] 執行 `make up`(等價 `docker compose up -d`)拉起 Node stack;等所有 healthcheck 綠後 `curl http://localhost:8000/health`(預期 `{"status":"ok","db":true,"redis":true}`)+ `curl http://localhost:8000/metrics | head`(預期含 `process_*` `nodejs_*` `http_requests_total` `http_request_duration_seconds`);完成後 `make down`。**對應 FR-002 / FR-006 / SC-001 / SC-004**

**Checkpoint**: Foundation 就位 — 17 條 ✅ FR 至少在 HEAD(commit `455b6d6` + 本 phase 後續 commit)實際被驗證 mechanically

---

## Phase 3: User Story 1 - 新成員從零到第一次跑起 Node 應用 stack (Priority: P1) 🎯 MVP

**Goal**: 讓新成員在 ≤ 15 min(首次)/ ≤ 3 min(reopen)內完成 onboarding,容器內 `claude` 不要求重新登入,`make up` 全綠 healthcheck

**Independent Test**: 一台乾淨機(只裝 Docker / VS Code / Git + Claude OAuth)依 quickstart.md Step 0–3 走完,計時 + 紀錄 banner 內容,Node 端 `/health` 回 200

### Implementation for User Story 1

- [ ] T005 [P] [US1] 建立 `.docs/onboarding-stopwatch.md`,以表格結構記錄(欄位:`場景` / `Mac M1 時間` / `WSL2 Ubuntu 時間` / `符合 SC-001?` / `備註`),涵蓋:首次 build、reopen container、`make up` 到全綠 healthcheck。初版可以全 `TODO(待 adopter 實測)` 但結構必備
- [ ] T006 [US1] 在自己的 dev 環境(Mac M1 或 WSL2,擇一)實際跑 quickstart.md Step 0-3 一輪;把測得時間填回 `.docs/onboarding-stopwatch.md` 對應欄位;若 banner 出現 `WARN:` 或 `NOT FOUND`,記錄到 `.docs/onboarding-stopwatch.md` 的「備註」欄並開 follow-up issue(若有 GitHub remote)。對應 SC-001 第一次量化

**Checkpoint**: US1 onboarding 流程在至少一個平台被實測過,SC-001 量化資料(部分)就位;另一個平台的測量為 derivative-compliance 的 user-side responsibility(per spec.md SC-007 「由 adopter 自家流程的可重現性驗證」精神)

---

## Phase 4: User Story 2 - 跑完一輪完整 SDD pipeline (Priority: P1)

**Goal**: 第一個 adopter feature 從 `/speckit-specify` → `/speckit-implement` 全程在 1 小時內走完,中間不繞過 quality gate;`/speckit-implement` 前的人類 review gate 與上游 outage degraded mode 行為明確

**Independent Test**: 從 main 分支起手,對一個 trivial endpoint 跑完整 pipeline,quality gates 全綠;另對 spec-kit upstream outage 模擬(斷網)觀察錯誤訊息是否清楚

### Implementation for User Story 2

- [ ] T007 [P] [US2] 建立 `.docs/upstream-outage-runbook.md`:列 5 條主要上游(Anthropic API、ghcr.io、GitHub、npm registry、Cloudflare API)各自 outage 時 — 哪些操作仍可做(本機已 install 的 spec-kit / 已 cache 的 OAuth / 已 build 的 image / 已下載的 deps)、哪些被阻擋(新 install / 新 image build / 重新 OAuth / `wrangler deploy`)、recover 後如何 verify。**對應 FR-020 + post-create.sh:80, :99 已 reference 此檔但檔案缺**;此 task 閉合該 dangling reference
- [ ] T008 [US2] 在 README.md §8(常見問題)新增 link 引用 `.docs/upstream-outage-runbook.md`(目前 README L222 已有相關註記但尚未指向實際檔案);依賴 T007 完成
- [ ] T009 [US2] 在 dev 環境跑一次完整 walkthrough(quickstart.md Step 4):於本 baseline 之外建一個 sample feature 走 `/speckit-specify → /speckit-clarify → /speckit-plan → /speckit-tasks → /speckit-implement`,計時並紀錄於 `.docs/onboarding-stopwatch.md` 的「第一個 SDD feature」段;與 SC-007 目標(≤ 1 hour)對照。**注意:此驗證必須在 sample feature 自己的 branch 進行(由 `before_specify` hook 自動建立),不要污染本 baseline branch**

**Checkpoint**: SDD pipeline 端到端跑通,review gate 文件化,outage 行為明確,SC-007 量化就位

---

## Phase 5: User Story 3 - 跨平台 PR 的 parity (Priority: P2)

**Goal**: 同一 commit 在 macOS Apple Silicon + Linux WSL2 兩個主機上跑 mandatory gates 的結果 100% 等價(Q2 Clarification 涵蓋 Node + Worker)。CI 自動化屬未來 feature(see research.md Critical Follow-up #1),不在 001 範圍

**Independent Test**: 同一 commit hash 在兩種主機上跑 `pnpm test/typecheck/lint`,diff stdout/stderr,差異應僅限於非語意性的時間戳或路徑前綴;測試級別「同一 test 一邊 pass / 另一邊 fail」即視為 parity 缺陷,計入 SC-008

### Implementation for User Story 3

- [ ] T010 [P] [US3] 建立 `.docs/parity-validation.md` 描述 SC-002 + SC-008 的本機驗證流程:(1) 兩台機器 checkout 同一 commit、(2) 兩邊都進 dev container 跑 `pnpm test/typecheck/lint`、(3) 把 stdout 寫成檔比對 `diff a.log b.log`、(4) 結果差異分類(預期非語意性 vs parity 缺陷);包含 SC-008 季度配額(≤1)的記錄欄位。**對應 SC-002 + SC-008**

**Checkpoint**: 跨平台 parity 驗證程序文件化(實際跑兩平台屬 derivative-side responsibility)

---

## Phase 6: User Story 4 - Observability 對新加入的 HTTP route 自動覆蓋 (Priority: P2)

**Goal**: 凍結現行 Node 端 observability 行為以防 regression;Worker 端 forward-declared(由 002 落地)

**Independent Test**: 加一個 `GET /probe-test/:id` route(僅 handler),對其發 request,grep `/metrics` 應見 `route="/probe-test/:id"` 的 sample(此測試已存在於 `tests/node/http-metrics.regression.test.ts`,T002 mandatory gates 已 mechanical 驗證)

### Implementation for User Story 4

- [ ] T011 [P] [US4] 在 `specs/001-superspec-baseline/contracts/observability.md` §1.4 「實作對照」表內,把 行號 placeholder 替換為 `src/node/http-metrics.ts` 與 `src/node/app.ts` 的實際當前行號(grep 該檔取得 `httpMetrics(`、`probeRoutePathSupport(`、`HTTP_METRICS_ENABLED` 等 anchor 的行號,寫入表格)。**對應 contracts/observability.md §1.4 implementation-mapping accuracy**

**Checkpoint**: Node 端 observability 不變量與 src 行號雙向 traceable;regression test(T002 已涵蓋)凍結未來變動

---

## Phase 7: User Story 5 - 工具鏈升級為孤立、可單獨 revert 的變更 (Priority: P3)

**Goal**: Toolchain bump 規範文件化;以 vitest 2→4 commit `ec6781a` 為實證 anchor

**Independent Test**: 對「升 spec-kit / wrangler / vitest 至下一版」的 hypothetical PR,參照 playbook 即可走完 isolated commit + revert 演練

### Implementation for User Story 5

- [ ] T012 [P] [US5] 建立 `.docs/toolchain-upgrade-playbook.md`:列出每個 CORE 工具的 version_declaration_site(spec-kit 釘於 `.devcontainer/post-create.sh` `SPEC_KIT_VERSION`、`Node` 釘於 `.nvmrc` + `package.json engines.node`、`pnpm` 釘於 `package.json packageManager`、`vitest` 釘於 `package.json devDependencies.vitest`、`wrangler` 釘於 `package.json devDependencies.wrangler`(future,by 002));每筆附「升級流程」(改版本字串 → `pnpm install` 重生 lockfile → 跑 mandatory gates → 單獨 commit subject `chore(deps): bump X Y → Z`)+ 「revert 演練」(`git revert <commit>` 應一次回退無交錯衝突)。**附實證**:引用 commit `ec6781a chore(deps): bump vitest 2 -> 4` 為 reference exemplar。對應 FR-019 + SC-005

**Checkpoint**: Toolchain 升級規範與實證 anchor 文件化

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 跨 story 的最終一致性檢查與交付

- [ ] T013 [P] 修補 `README.md` L33 stale reference:將「對齊憲法 v1.2.2」改為「對齊憲法 v1.0.0」;將先前指向 `specs/001-superspec-baseline/{spec,plan,research,data-model,quickstart,tasks}.md` 與 `specs/001-superspec-baseline/contracts/` 的 link 列表確認,如項目齊備則保留(本 feature 已產出全部);若任一 link target 不存在則修正路徑。同時確認 `README.md` Baseline Spec 段「FR / SC 數字」(原 nodejs `19 FR / 10 SC`)應更新為本 spec 的 `22 FR / 11 SC / 5 user stories`(若有提及)。**對應 B-narrow follow-up `.docs/20260430b-...design.md` Risks #2 衍生**
- [ ] T014 [P] 執行 `/speckit-analyze`(skill,需於 Claude Code prompt 觸發)跨 artifact 一致性掃描;將輸出報告寫入 `.docs/baseline-analyze-report.md`;若有 CRITICAL / HIGH findings,於本 phase 內回頭修補 spec / plan / contracts 後重跑(分開 commit)。LOW / MEDIUM 紀錄即可,不一定修。**對應 spec-kit 流程的 sanity gate**
- [ ] T015 [P] 建立 `.docs/baseline-traceability-matrix.md`:三欄 markdown 表(`FR or SC ID` / `主要 contract / 段落 anchor` / `依賴 user story`)逐行對照 22 FR + 11 SC;確保每筆都有至少一個 contract 或 research 段落 cite。產出後校對:任何「無 anchor」項即視為文件 gap,於本 task 內修補 spec/contracts。**對應 sentence「derivative compliance audit 可定位 baseline 規則出處」**
- [ ] T016 [US1][US2] 跑一次完整 quickstart.md Step 0–4 在乾淨環境(VM 或同事機器)再驗收一次,記錄差異於 `.docs/onboarding-stopwatch.md` 的「fresh-eyes 二次驗證」段;依賴 T006(已建立 stopwatch.md)、T009(SDD pipeline 演練)— **此 task 為「fresh-eyes」二次驗證,可由 maintainer 邀請新人做或自己換主機**;若兩次數據顯著不一致,差異列入 SC-008 配額考慮

**Checkpoint**: 001-superspec-baseline 規格化完成 — 所有 ✅ / ⚠ / 📅 狀態經 mechanical 驗證或文件化記錄,跨 artifact 一致,traceability matrix 提供 derivative compliance audit 起點

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**:無依賴,可立即開始
- **Foundational (Phase 2)**:依賴 Setup;阻塞所有 user story 的 mechanical 驗收(因 T002 一次性驗 17 條 ✅ FR)
- **US1 (Phase 3)**:依賴 Foundational(尤其 T002 證明 Node stack 可 run + T004 確認 healthcheck);T006 寫回 T005 建立的 stopwatch
- **US2 (Phase 4)**:依賴 Foundational + T005(stopwatch.md);T008 依賴 T007(runbook.md);T009 寫回 stopwatch 對應段
- **US3 (Phase 5)**:依賴 Foundational(無 T002 確認 mechanical gate,parity 比對沒有意義)
- **US4 (Phase 6)**:依賴 Foundational(T002 已 mechanical 驗 SC-009 + SC-004)
- **US5 (Phase 7)**:無 phase 內依賴,但 T012 cite ec6781a 需 git history 完整
- **Polish (Phase 8)**:依賴所有 US 完成;T014 (`/speckit-analyze`) 為流程 sanity gate

### Within-Phase Dependencies

- **T002 → T003 / T004**:T003 / T004 雖跑不同指令,但與 T002 共享「容器 / 本機已 install deps」前提;若 T002 fail 則 T003/T004 結果無意義
- **T005 → T006**:T006 寫資料進 T005 建立的 stopwatch.md
- **T007 → T008**:T008 link target 為 T007 產出檔
- **T013 → T014**:T013 修 README 後,T014 跑 analyze 才不會把 README stale reference 抓出來當 finding
- **T014 → T015**:T015 traceability matrix 若 analyze 已找到不一致,先修再寫 matrix

### Parallel Opportunities

- T001 標 [P] — 不同檔,獨立
- T003 ∥ T004(都依賴 T002 但彼此獨立)
- T005 ∥ T007 ∥ T010 ∥ T011 ∥ T012 ∥ T013 ∥ T015 — 跨 phase / 不同檔,可並行(但 T013 與 T014 的順序依賴照舊)
- T006 / T009 / T016 為 sequential 體力活(實際跑 quickstart),不能 parallel(同一台機器)
- T014 (/speckit-analyze) 不能 parallel 因為它是 review gate

### MVP Scope

完成 Phase 1 + Phase 2 + Phase 3(US1)即達 MVP:

- 17 條 ✅ FR 經 mechanical 驗證
- Onboarding 流程實測 + stopwatch.md 結構就位
- Node stack `make up` 全綠 healthcheck 確認

US2-US5 為後續高優漸進交付。Phase 8 收尾在所有 US 完成後一次性走。

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1 Setup(T001)
2. Phase 2 Foundational(T002 → T003 / T004)
3. Phase 3 US1(T005 → T006)
4. **Stop & Validate**:在 Mac 或 WSL2 跑 quickstart Step 0–3,確認 mandatory gates 全綠 + onboarding 計時 ≤ 15 min。

### Incremental Delivery

每完成一個 user story,可視為一個獨立 PR / merge 點:

1. MVP(US1)→ baseline 對 onboarding 的承諾兌現
2. US2(T007 → T008 → T009)→ outage runbook + SDD pipeline 端到端文件化
3. US3(T010)→ parity 驗證程序文件化
4. US4(T011)→ observability contract implementation-mapping 行號對齊
5. US5(T012)→ toolchain upgrade playbook + 實證 anchor
6. Polish(T013-T016)→ README + analyze + traceability + fresh-eyes 二次驗證

### Parallel Team Strategy

- Setup + Foundational 由一人完成
- Foundational 完成後可分工:
  - Developer A:US1 + Polish 中的 T016(都是「實際跑」性質)
  - Developer B:US2 + US5(都是「寫 .docs/ 文件」性質)
  - Developer C:US3 + US4 + Polish 中的 T013-T015(`.docs/` 與 contracts/ 與 README 工作)

---

## Notes

- [P] = 不同檔、無依賴
- [Story] = 對應 spec.md user story(US1–US5)
- 每個 user story 完成後,quickstart.md 對應 step 應仍可跑通(獨立可測)
- 所有改動須通過容器內 `pnpm test` `pnpm typecheck` `pnpm lint`(Quality Gates contract mandatory gates),不因本 baseline 是 meta-project 而豁免
- Commit / push 由 user 明確指示後執行(專案 CLAUDE.md 規範);本 plan 不自動 commit
- 與 application code 無關的 task(配置 / 文件)不需 unit test;本 baseline 也沒有應用層 regression test 任務(既有 `tests/node/http-metrics.regression.test.ts` 已涵蓋 SC-004)
- 若 task 過程發現需要修改本 baseline 的 spec / plan / contracts,應停下來走 spec amendment 流程(更新 spec → re-clarify if needed → 更新 plan),而非直接動 surface 檔案 — 違反 SDD pipeline
- **本 plan 16 task 中,絕大多數是「audit」+「companion-doc 補齊」+「polish」性質;真正會動 monorepo source 檔的只有 T001(`.gitignore`)+ T013(`README.md`)+ T011(`contracts/observability.md` 行號修補)— 反映 baseline meta-project 的本質**

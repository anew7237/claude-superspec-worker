---
description: "Task list for 003-ci-workflow implementation"
---

# Tasks: CI Workflow + Dependabot — Ubuntu Mechanization of Baseline Gates

**Input**: Design documents from `specs/003-ci-workflow/`
**Prerequisites**: `plan.md`、`spec.md`、`research.md`、`data-model.md`、`contracts/ci-gates.md`、`contracts/dependabot-policy.md`、`quickstart.md`
**Branch**: `003-ci-workflow`
**Date**: 2026-05-03

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps task to user story (US1 / US2 / US3 / US4)
- 每個 task 含 file:line 落地 + spec FR/SC anchor + contract anchor

## Path Conventions

- 主要 artifact:`.github/workflows/ci.yml`、`.github/dependabot.yml`、`README.md`、`.gitleaks.toml`(optional)
- 不動既有 `src/`、`tests/`、`package.json`、`tsconfig*.json`、`eslint.config.js`、`wrangler.jsonc`(per plan.md §Project Structure)
- Negative test 之臨時 PR branch:`negative-test/scenario-N-...`(per quickstart.md §5)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 建立 `.github/` 目錄結構 + ci.yml skeleton(jobs 為空,後續 phase 加入)

- [ ] T001 Create `.github/workflows/` directory + ci.yml skeleton with workflow `name`, `on:` triggers (pull_request to main + push to main + workflow_dispatch) + `concurrency` group (per `contracts/ci-gates.md` §1.1-1.2 + `research.md` §7) + empty `jobs:` map. File: `.github/workflows/ci.yml` (NEW)
  - Anchors: spec.md FR-001 / FR-002, ci-gates.md §1.1-1.2

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 確認既有 `.devcontainer/` 與 `wrangler.jsonc` 配置適合在 CI 中以 `devcontainers/ci@v0.3` 跑;若有阻擋條件需先解。

**⚠️ CRITICAL**: 5 個 job 之 implementation 不可在本 phase 完成前開始

- [ ] T002 Verify `.devcontainer/devcontainer.json` 與 `Dockerfile` 不依賴 host-only mount(eg. `${localEnv:SSH_AUTH_SOCK}` 已於 PR #4 移除,per `.specify/memory/constitution.md` §Reference Implementation Notes)。確認 dev container build 在乾淨 GHCR 環境可成功完成。本 task 為 read-only verification + 留 PR comment 確認;無 file 變更
  - Anchors: spec.md FR-004 + plan.md §Constitution Check III + research.md §1
- [ ] T003 Verify `wrangler.jsonc` 可在 dev container 內成功 `wrangler deploy --dry-run`(per session memory PR #20 sanity 驗過 ✓)。本 task 為 read-only verification;無 file 變更
  - Anchors: spec.md FR-003 第 2 條 + ci-gates.md §3.1 + research.md §4

**Checkpoint**: Foundation 已就緒(.devcontainer + wrangler.jsonc 不需動);可開始 user story implementation

---

## Phase 3: User Story 1 - 新進開發者第一次開 PR 即看見自動 gate 跑綠 (Priority: P1) 🎯 MVP

**Goal**: 落地 3 個 mandatory job(gates / wrangler-bundle-check / secret-scan)使 fork 後第一個 PR 自動跑出綠/紅結果

**Independent Test**: 本 003-ci-workflow PR 自身 push 後,GitHub Actions tab 出現 3 個 mandatory check 跑;5-15 分內出綠/紅(per SC-001)。Negative scenario 2/3/4 驗 mandatory check 確實 fail on violation。

### Implementation for User Story 1 — gates job(mandatory)

- [ ] T004 [US1] Add `gates` job 至 `.github/workflows/ci.yml`(per `contracts/ci-gates.md` §2 + `data-model.md` §2.1):runs-on ubuntu-latest;steps 為 actions/checkout@v4 → actions/cache@v4 (pnpm store) → actions/cache@v4 (node_modules) → devcontainers/ci@v0.3 with runCmd 跑 `set -euo pipefail; pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test:node && pnpm test:worker`。File: `.github/workflows/ci.yml` (EDIT)
  - Anchors: spec.md FR-003 第 1 條 + FR-004 + FR-005 + SC-002 + SC-003 + ci-gates.md §2 + research.md §1, §3

### Implementation for User Story 1 — wrangler-bundle-check job(mandatory)

- [ ] T005 [US1] Add `wrangler-bundle-check` job 至 `.github/workflows/ci.yml`(per `contracts/ci-gates.md` §3 + `data-model.md` §2.2 + `research.md` §4):runs-on ubuntu-latest;steps 為 checkout → pnpm store cache(同 T004 key)→ node_modules cache(同 T004 key)→ devcontainers/ci@v0.3 with runCmd 跑 `pnpm install --frozen-lockfile && pnpm exec wrangler deploy --dry-run` 後執行 grep + size assertion script(7 個 forbidden module + 100 KiB budget)。File: `.github/workflows/ci.yml` (EDIT)
  - Anchors: spec.md FR-003 第 2 條 + SC-004 + SC-005 + ci-gates.md §3 + research.md §4

### Implementation for User Story 1 — secret-scan job(mandatory)

- [ ] T006 [P] [US1] Add `secret-scan` job 至 `.github/workflows/ci.yml`(per `contracts/ci-gates.md` §4 + `data-model.md` §2.3 + `research.md` §2):runs-on ubuntu-latest;steps 為 actions/checkout@v4 with `fetch-depth: 0` + gitleaks/gitleaks-action@v2 with redacted output。本 job 與 T004 / T005 在不同 job entry,理論上 [P] 可並行(但因同檔 ci.yml 編輯,實際 commit 序列化)。File: `.github/workflows/ci.yml` (EDIT)
  - Anchors: spec.md FR-003 第 3 條 + SC-006 + SC-010 + ci-gates.md §4 + research.md §2

### Negative test for User Story 1

- [ ] T007 [US1] Negative test scenario 2(per `quickstart.md` §5.2):開 branch `negative-test/scenario-2-cross-runtime-import` from 003-ci-workflow,加 `import { Pool } from 'pg';` 至 `src/worker/index.ts`,push + open PR;**驗 gates job lint step fail**(訊息含 `'pg' import is restricted`);截圖 / link Actions log 入 `.docs/003-acceptance-evidence.md`(NEW);close PR 不 merge
  - Anchors: spec.md US1 acceptance #2 + ci-gates.md §2.1 failure mode 「ESLint error / no-restricted-imports 觸發」
- [ ] T008 [P] [US1] Negative test scenario 3(per `quickstart.md` §5.3):開 branch `negative-test/scenario-3-bundle-bloat` from 003-ci-workflow,加 lodash dep + `import _ from "lodash"` 撐破 100 KiB,push + open PR;**驗 wrangler-bundle-check job fail**(訊息含 `BUNDLE SIZE N bytes exceeds budget`);截圖 / link 入 evidence 檔;close PR + revert
  - Anchors: spec.md US1 acceptance #3 + ci-gates.md §3.1 failure mode 「Bundle size > 100 KiB」
- [ ] T009 [P] [US1] Negative test scenario 4(per `quickstart.md` §5.4):開 branch `negative-test/scenario-4-fake-secret` from 003-ci-workflow,加 gitleaks 自身 testdata fixture pattern(per `https://github.com/gitleaks/gitleaks/tree/master/testdata`,implementation 階段選一可被 gitleaks 預設規則 catch、屬 documentation/test fixture 之示範字串)至新檔 `src/node/temp.ts`,push + open PR;**驗 secret-scan job fail** + PR diff line 出現 gitleaks bot annotation;截圖 / link 入 evidence;close PR。**字串 inline 於 negative-test PR,不寫進 spec doc**(避免 GitHub Push Protection 也擋)
  - Anchors: spec.md US1 acceptance #4 + #5 + ci-gates.md §4.1 failure mode

**Checkpoint**: US1 完成 — 3 個 mandatory job 已落地且 6 條 acceptance scenario(includes negative)皆驗;新進開發者開 PR 即看見自動 gate 跑綠

---

## Phase 4: User Story 2 - Maintainer 自動收到 Dependabot 升版 PR 並由 CI 驗證 (Priority: P2)

**Goal**: 落地 `.github/dependabot.yml` 配置 + 確認 Dependabot 開的 PR 會觸發 US1 之 mandatory check

**Independent Test**: merge 003 PR 後,等下週一觀察 Dependabot 是否開 PR(若 deps 都 latest 可能無;此驗證在「Dependabot 已啟用」層次)。任一 Dependabot PR 開後看 Actions tab 跑 5 job(per spec US2 acceptance #2)

### Implementation for User Story 2

- [ ] T010 [P] [US2] Create `.github/dependabot.yml`(per `contracts/dependabot-policy.md` §2-3 + `data-model.md` §1.2 + `research.md` §5):兩條 ecosystem entry(npm + github-actions),npm 含 4 grouping rule(cloudflare-ecosystem / typescript-eslint / vitest / node-deps-minor-patch),github-actions 含 1 grouping rule;commit-message prefix `chore(deps)` + scope。File: `.github/dependabot.yml` (NEW)
  - Anchors: spec.md FR-006 + FR-007 + SC-007 + dependabot-policy.md §2-3 + research.md §5
- [ ] T011 [US2] Verify Dependabot 配置 syntax 正確 — 用 GitHub Dependabot validator(`https://github.com/dependabot/cli`)或手動 push 至 003-ci-workflow branch 後在 GitHub UI 之 Insights → Dependency graph → Dependabot tab 確認無 parse error。本 task 為驗證行為;若有 parse error 修正 T010
  - Anchors: spec.md US2 acceptance #1 + dependabot-policy.md §2.1

**Checkpoint**: US2 完成 — Dependabot 配置就位;首次掃描將於下個週一(2026-05-04)發生

---

## Phase 5: User Story 3 - Adopter fork 後 CI 自帶不需 reconfigure (Priority: P2)

**Goal**: README 加 §「CI status」段含 GitHub Actions badge + 行為簡述 + branch protection 設定指引,使 adopter fork 後從 README 即知 CI 設置狀態

**Independent Test**: 把 monorepo fork 至獨立 GitHub account,推任一 commit,確認 Actions tab 出現 3 mandatory check(per spec US3 acceptance #1);無需在 fork 端編輯 workflow YAML

### Implementation for User Story 3

- [ ] T012 [P] [US3] Append §「CI status」section 至 `README.md`(per `data-model.md` §1.4 + `quickstart.md` §1):含 (a) GitHub Actions badge URL `https://github.com/<org>/<repo>/actions/workflows/ci.yml/badge.svg`(用 `anew7237/claude-superspec-worker` 或 placeholder + adopter fork 後改),(b) 5 jobs 行為簡述表,(c) branch protection 設定 walkthrough(連結至 `specs/003-ci-workflow/quickstart.md` §1 Step 4),(d) 連 specs/003-ci-workflow/。File: `README.md` (EDIT, append section)
  - Anchors: spec.md FR-012 + SC-008 + US3 acceptance #1-2 + research.md §10

**Checkpoint**: US3 完成 — README 補入 CI status section;adopter fork 後可從 README 直接看出 CI 設置狀態

---

## Phase 6: User Story 4 - Reviewer 看 PR 自動偵測規範違規與 advisory 提示 (Priority: P3)

**Goal**: 落地 2 個 advisory job(spec-coverage-advisory / toolchain-isolation-advisory)使 reviewer 看 PR 自動收到「動 src 但無 spec」與「同時動 deps + src」之 comment 提示

**Independent Test**:
- 在 PR 內動 `src/node/app.ts` 但不動 `specs/`,確認 `spec-coverage-advisory` comment 提示
- 另開 PR 同時動 `package.json` + `src/`,確認 `toolchain-isolation-advisory` comment 提示

### Implementation for User Story 4 — spec-coverage-advisory job

- [ ] T013 [US4] Add `spec-coverage-advisory` job 至 `.github/workflows/ci.yml`(per `contracts/ci-gates.md` §5 + `data-model.md` §2.4 + `research.md` §6, §11):runs-on ubuntu-latest;steps 為 actions/checkout@v4 → actions/github-script@v7 with inline JS 之兩段:(a) check is-doc-only 從 PR file list 判斷;若 doc-only set output `doc_only=true` 並 skip 後續 step。(b) if not doc-only AND PR touches `src/**` AND PR does NOT touch `specs/**`:post advisory comment via `github.rest.issues.createComment`,內文如 `contracts/ci-gates.md` §5.1 step 3。File: `.github/workflows/ci.yml` (EDIT)
  - Anchors: spec.md FR-008 第 1 條 + FR-009 + ci-gates.md §5 + research.md §6, §11
- [ ] T014 [P] [US4] Negative test scenario 5(per `quickstart.md` §5.5):開 branch `negative-test/scenario-5-src-no-spec` from 003-ci-workflow,動 `src/node/app.ts` 加 trivial change,push + open PR;**驗 advisory comment 出現** 在 PR 內(內含「未偵測到對應 specs/ 目錄」),mandatory 仍綠;截圖 / link 入 evidence;close PR
  - Anchors: spec.md US4 acceptance #1 + ci-gates.md §5.1 observable behavior

### Implementation for User Story 4 — toolchain-isolation-advisory job

- [ ] T015 [US4] Add `toolchain-isolation-advisory` job 至 `.github/workflows/ci.yml`(per `contracts/ci-gates.md` §6 + `data-model.md` §2.5 + `research.md` §6, §11):runs-on ubuntu-latest;steps 為 actions/checkout@v4 → actions/github-script@v7 with inline JS:(a) doc-only check 同 T013(可抽 composite action 或 reusable script,本 task 初版用 inline 重複);(b) if not doc-only AND PR touches (`package.json` OR `pnpm-lock.yaml`) AND PR touches (`src/**` OR `tests/**`):post advisory comment 內文如 `contracts/ci-gates.md` §6.1 step 3。File: `.github/workflows/ci.yml` (EDIT)
  - Anchors: spec.md FR-008 第 2 條 + FR-009 + ci-gates.md §6 + research.md §6, §11
- [ ] T016 [P] [US4] Negative test scenario 6(per `quickstart.md` §5.6):開 branch `negative-test/scenario-6-deps-and-src` from 003-ci-workflow,跑 `pnpm add @types/node@latest` + 動 `src/node/app.ts` trivial change,push + open PR;**驗 advisory comment 出現** 在 PR 內(內含「toolchain 變更建議獨立 PR」),mandatory 仍綠;截圖 / link 入 evidence;close PR
  - Anchors: spec.md US4 acceptance #2 + ci-gates.md §6.1 observable behavior

### Negative test for User Story 4 — doc-only PR no-noise

- [ ] T017 [US4] Negative test scenario(implicit per spec US4 acceptance #3):用本 003-ci-workflow PR 自身(屬 spec-only / .github-only,動 `src/` = 否)即驗證 advisory job **不觸發** noise;若 advisory comment 在本 PR 出現,即為 false-positive bug;**修正 T013 / T015 inline JS 之 file path filter** 至綠
  - Anchors: spec.md FR-009 + US4 acceptance #3 + ci-gates.md §5.1 / §6.1

**Checkpoint**: US4 完成 — 5 個 job(3 mandatory + 2 advisory)全落地;reviewer 看 PR 自動收到規範違規與 advisory 提示;6 acceptance scenarios 皆驗

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 收尾本 feature 之 documentation、traceability、constitution alignment

- [ ] T018 [P] Create `.docs/003-acceptance-evidence.md`(NEW)— 收 6 個 negative test scenario(T007 / T008 / T009 / T014 / T016 / T017)之 GitHub Actions log 截圖 / link + 對應 expected behavior 表。File: `.docs/003-acceptance-evidence.md`
  - Anchors: spec.md §「必須涵蓋的 acceptance scenarios」+ quickstart.md §5
- [ ] T019 [P] Update `.docs/baseline-traceability-matrix.md` — 把 001 FR-017 / SC-005 / SC-006 / SC-008 + 002 FR-009 / SC-003 row 之狀態升為「mechanized via 003-ci-workflow」,cite 003 PR + ci.yml 對應 job;001 SC-003 + FR-019 row 加註「advisory mechanized」。File: `.docs/baseline-traceability-matrix.md` (EDIT)
  - Anchors: spec.md FR-013 + SC-011 + research.md §14
- [ ] T020 [P] Update `specs/001-superspec-baseline/contracts/quality-gates.md` §「CI 對應(known gap)」— 從「known gap」升為「✅ Ubuntu side mechanized via 003-ci-workflow PR #<NN>」,cite 003 contract + plan;附歷史脈絡(reviewer audit I-1 PARTIAL)。File: `specs/001-superspec-baseline/contracts/quality-gates.md` (EDIT)
  - Anchors: spec.md FR-013 + research.md §14 + reviewer audit I-1
- [ ] T021 [P] Run quickstart.md walkthrough validation — 照 quickstart.md §1 Step 1-5 在 maintainer's own terminal 跑一遍(不必真 fork,但 verify README 之 badge URL + branch protection 指引內容無 typo / dead link);記紀錄於 evidence 檔
  - Anchors: spec.md SC-008 + quickstart.md §1
- [ ] T022 Final pre-merge sanity:於 003-ci-workflow branch local dev container 跑 `pnpm typecheck && pnpm lint && pnpm test:node && pnpm test:worker`(雖然本 feature 不動 src,確認既有 4 gate 仍綠 + CI 配置不破壞 local 路徑);跑 `pnpm exec prettier --check .github/workflows/ci.yml .github/dependabot.yml .docs/003-acceptance-evidence.md README.md` 全綠
  - Anchors: spec.md SC-002 + plan.md §Constitution Check IV + 既有 mandatory gates

**Checkpoint**: 全 phase 完成;ready for human review of `spec.md` + `plan.md` + `tasks.md` per 憲法 V「A human reviewer MUST inspect ... BEFORE `/speckit-implement` runs」

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup, T001)**:無 dependency,先跑;產出 ci.yml skeleton
- **Phase 2 (Foundational, T002-T003)**:depends on T001(需先有 ci.yml file 才能 reference);read-only verification + 留下 confirmation comments
- **Phase 3 (US1, T004-T009)**:depends on Phase 2 完成;**MVP scope**(達成即達 spec.md US1 P1 兌現)
  - T004 / T005 序列(同檔 ci.yml 編輯,序列 commit 安全)
  - T006 [P] 邏輯上可平行於 T004/T005,實際 commit 序列化
  - T007 / T008 / T009 [P] 為 negative test PR,開 separate branch 故 [P] 並行可
- **Phase 4 (US2, T010-T011)**:depends on Phase 2 完成;與 Phase 3 邏輯獨立(T010 動 dependabot.yml,T011 為 verification)
- **Phase 5 (US3, T012)**:depends on Phase 3 完成(README badge URL 需 ci.yml 已 push 才有 actions URL)
- **Phase 6 (US4, T013-T017)**:depends on Phase 2 完成;與 Phase 3-5 邏輯獨立但同檔 ci.yml 編輯,序列 commit 安全
  - T013 / T015 同檔(serialize)
  - T014 / T016 / T017 [P] 為 negative test
- **Phase 7 (Polish, T018-T022)**:depends on 所有 user story phase 完成

### User Story Dependencies

- **US1 (P1) MVP**:可獨立完成 + 獨立測試(3 mandatory job 跑綠)
- **US2 (P2)**:獨立(動 dependabot.yml,不依賴 US1 之 ci.yml jobs)— 但 verify step T011 之 GitHub UI 需 003 PR 已 push
- **US3 (P2)**:依賴 US1(README badge URL 需 ci.yml 已存在)
- **US4 (P3)**:獨立(動 ci.yml 加 advisory job;與 US1/US2/US3 獨立完成)

### Parallel Opportunities

#### 同 phase 內可 [P]

- Phase 3 negative test:T007 / T008 / T009 並行(各自 separate negative test branch)
- Phase 4 + Phase 5 + Phase 6 之 implementation tasks(T010、T012、T013-T017)邏輯上獨立(動不同檔或不同 job entry),但同 ci.yml 之 edit 須序列化
- Phase 7:T018 / T019 / T020 / T021 [P] 動不同檔,可並行

#### 跨 phase parallel

- Phase 4 (US2) 與 Phase 6 (US4):動不同檔(dependabot.yml vs ci.yml 內 advisory job),可並行
- Phase 5 (US3) 不能與 Phase 3 並行(需先有 ci.yml badge URL)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → T001 ci.yml skeleton
2. Phase 2 Foundational → T002-T003 read-only verify
3. Phase 3 US1 → T004-T009(3 mandatory job + 3 negative test)
4. **STOP and VALIDATE**: 推 003-ci-workflow PR,看 GitHub Actions 跑 3 mandatory check 綠;negative scenario 2/3/4 確認可機械擋下
5. Decision point:**MVP** 已達成(spec.md US1 P1 兌現);可選擇:
   - 暫停在此(deliver MVP 為單獨 PR;後續 phase 各自開 PR)
   - 或繼續往 US2-US4 推進

### Incremental Delivery(建議路徑)

1. **MVP (US1)**:落地 3 mandatory job → merge 後 adopter 已可獲 80% 價值
2. **+US2**:加 Dependabot(weekly automation)→ 升版維運自動化
3. **+US3**:加 README §「CI status」→ adopter fork 體驗完整
4. **+US4**:加 2 advisory job → reviewer 體驗增強
5. **Polish (Phase 7)**:traceability matrix + acceptance evidence + quality-gates 升級紀錄

### Parallel Team Strategy

若多開發者:

- Dev A(P1 主導):T001 → T002-T003 → T004 → T005 → T006 → T007/T008/T009 並行
- Dev B(US2):T010-T011 並行 T004-T006(動 dependabot.yml,不衝突)
- Dev C(US3):待 T006 完(ci.yml badge URL 需有 ci.yml 存在)→ T012
- Dev D(US4):T013-T017,與 Dev A 之 ci.yml edit serialize(透過 PR rebase 解)

---

## Parallel Example: User Story 1 negative tests

```bash
# 在 T004-T006 完成後,T007/T008/T009 可並行開 3 個 negative test PR
git checkout -b negative-test/scenario-2-cross-runtime-import 003-ci-workflow
# ... add pg import ...
git push -u origin negative-test/scenario-2-cross-runtime-import
gh pr create --title "[negative test] cross-runtime import" --base 003-ci-workflow

# 同時(不同 branch / file)
git checkout -b negative-test/scenario-3-bundle-bloat 003-ci-workflow
# ...
gh pr create --title "[negative test] bundle bloat" --base 003-ci-workflow

# 同時
git checkout -b negative-test/scenario-4-fake-secret 003-ci-workflow
# ...
gh pr create --title "[negative test] fake secret" --base 003-ci-workflow
```

3 個 negative PR 並行跑 GitHub Actions,可在 ~5 分內看到 3 個 mandatory check 各自 fail。

---

## Format Validation

**Confirm ALL tasks follow checklist format `- [ ] [TaskID] [P?] [Story?] Description with file path`**:

- ✅ 22 個 task ID(T001-T022)依序編號
- ✅ Setup phase tasks(T001):無 [Story] label ✓
- ✅ Foundational phase tasks(T002-T003):無 [Story] label ✓
- ✅ User story tasks(T004-T017):皆有 [US1] / [US2] / [US3] / [US4] label ✓
- ✅ Polish phase tasks(T018-T022):無 [Story] label ✓
- ✅ [P] 標於可並行任務(T006 / T008 / T009 / T010 / T012 / T014 / T016 / T018-T021)
- ✅ 所有任務含 file path 落地處 + spec FR/SC anchor + contract anchor

---

## Notes

- 本 feature 為 CI configuration-only(per plan.md §Project Type),**不引入 application code / test**;故無 vitest test task / model task / service task
- TDD 紀律之 RED→GREEN 對應「commit ci.yml 變更 → 看 GitHub Actions 結果」(per plan.md §Constitution Check I);negative test 為 GREEN 之反向驗證(機械化能 catch 違規)
- Bundle budget(100 KiB)寫於 T005 inline shell;升降走 isolated commit + reviewer 認可(per spec.md assumption #8)
- `.gitleaks.toml`(optional, per data-model.md §1.3)**初版不建立**;僅當 false positive 出現時於 isolated PR 加入,不在本 tasks.md 範圍
- 6 個 negative test PR 皆 close 不 merge(僅作為 acceptance evidence)
- Phase 7 完成後,**human review gate**(per 憲法 V)— 人類 review `spec.md` + `plan.md` + `tasks.md` 才執行 `/speckit-implement`

# Feature Specification: CI Workflow + Dependabot — Ubuntu Mechanization of Baseline Gates

**Feature Branch**: `003-ci-workflow`
**Created**: 2026-05-03
**Status**: Draft
**Input**: User description: "003-ci-workflow — Ubuntu-only CI workflow + dependabot,機械化現有 baseline 之 FR-017 (CI ↔ dev container same base image) + SC-005 (toolchain revert success rate) + SC-006 (zero OAuth credentials in git history) + 002 FR-009 / SC-003 (Worker bundle 不含 Node-only modules)"

> **設計來源**:reviewer audit(PR #16 / #19 留下的 I-1 PARTIAL)— 001 FR-017 CI gap 為 audit 唯一未閉合項;`specs/001-superspec-baseline/contracts/quality-gates.md` §「CI 對應(known gap)」+ `research.md` Critical Follow-up #1。
>
> **Baseline anchor**:002-cloudflare-worker 已落地之 4 mandatory gates(`pnpm test:node` / `pnpm test:worker` / `pnpm typecheck` / `pnpm lint`)當前由人類於本機 dev container 執行;本 feature 把同樣 4 gates 升至 CI 自動執行,並新增 wrangler bundle 純度檢查 + secret scan + dependency 升版自動化 + 兩條 advisory 提示。
>
> **Single-platform 限制**:本 feature 僅機械化 Ubuntu side(per adopter 偏好 + macOS Actions minutes 成本考量);跨 Mac/WSL2 parity(SC-002)仍走 `.docs/parity-validation.md` 人工流程。

## Clarifications

### Session 2026-05-03

- Q: CI 內跑 4 gates 之執行環境? → A: **dev container in CI**(per FR-017 spec-strict 解讀;不是「Node 22 + pnpm 9 host install」近似)。CI 必須以 `.devcontainer/` 內定義之 image 跑 gates,確保 CI 行為與本機 dev container 100% 對齊。
- Q: Worker bundle size budget threshold? → A: **100 KiB**(當前 ~64 KiB,留 ~50% headroom;超出即 mandatory fail。Adopter 隨自家 feature 加大 bundle 後,可在 isolated commit 內升 budget,須經 reviewer 認可)。
- Q: Secret-scan tool 選擇? → A: **gitleaks**(open-source,GitHub Actions 維護良好;PR 觸發掃 PR diff,push to main 觸發掃全 git history)。
- Q: SC-003 spec coverage advisory job 是否落地? → A: **Yes**(advisory 提示,不阻擋 merge;reviewer 可 PR comment 內豁免)。
- Q: FR-019 toolchain isolation advisory job 是否落地? → A: **Yes**(advisory 提示,不阻擋 merge)。
- Q: CI 是否含 macOS runner? → A: **No**(adopter 偏好 + Actions minutes 成本;SC-002 跨平台 parity 仍走人工 `.docs/parity-validation.md` 流程)。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 新進開發者第一次開 PR 即看見自動 gate 跑綠 (Priority: P1) 🎯 MVP

一位剛 onboard 的開發者在自家 feature branch 上推第一個 commit、開 PR 至 main。他無需手動進 dev container 跑 4 gates,GitHub PR 頁面在 5-10 分鐘內出現 3 個 mandatory check 結果(gates / wrangler-bundle-check / secret-scan)。若全綠,reviewer 可放心 review code 不必擔心「在我機器上會綠」;若紅,error 訊息直指違規(typecheck error / test fail / bundle 含 Node-only module / git 內含 secret 等)。

**Why this priority**:此為本 feature 之核心兌現價值。失去自動 gate,新人 PR 仍須靠口耳相傳「請先進 dev container 跑 4 gate」,baseline FR-017 仍為 known gap,reviewer 仍須人工 attest 各 SC 滿足度。MVP 只需 gates + wrangler-bundle-check + secret-scan 3 個 mandatory 即達成 P1 兌現。

**Independent Test**:乾淨 fork 後開 trivial PR(eg. typo fix),PR 頁面出現 3 mandatory check 自動跑,5-10 分內看到綠/紅結果;reviewer 不需問開發者「有沒有跑過 4 gate」即可判定 mergeability。

**Acceptance Scenarios**:

1. **Given** 一個乾淨 fork + clone,**When** adopter 開第一個 PR 至 main,**Then** GitHub PR 頁面出現 3 mandatory check(gates / wrangler-bundle-check / secret-scan)自動跑,在 ≤ 10 分內出結果。
2. **Given** PR 動到 `src/worker/index.ts` 加 `import { Pool } from 'pg'`,**When** CI 跑完,**Then** gates job 之 lint 步驟 fail(per 既有 `eslint.config.js` `no-restricted-imports` rule;FR-022 機械化),整 job exit 非 0,PR 標 mandatory check failure。
3. **Given** PR 引入 dep 把 wrangler bundle 撐到 > 100 KiB,**When** CI 跑完,**Then** wrangler-bundle-check job fail,error 訊息指出 bundle size 超出 threshold + 當前實際大小。
4. **Given** PR commit 內含 `password=secret123` 之文字 / 真實看似 OAuth token / `.env` 內容,**When** CI 跑完,**Then** secret-scan job fail,gitleaks 指出 finding 與位置。
5. **Given** PR merge 後 push to main,**When** CI 跑 push trigger,**Then** secret-scan 改掃**全 git history**(非僅 PR diff),確保歷史未洩漏。

---

### User Story 2 - Maintainer 自動收到 Dependabot 升版 PR 並由 CI 驗證 (Priority: P2)

一位 maintainer 不必每週手動 `pnpm outdated` 對照升版。Dependabot 每週一掃 npm 依賴,把可升的版本自動開 PR(per grouping rule);CI 跑完即知是否 break 既有 4 gate,無破即可 merge,有破即可在 PR 內 root-cause、決定 (a) 維持原版 (b) 部分升版 (c) 同 PR 修 break。grouping rule 確保 `@cloudflare/*` 等相關 deps 同 PR 升,避免「a 升 b 沒升」的中間狀態。

**Why this priority**:支撐 baseline FR-019(toolchain 升版為孤立 commit)從「人工提醒」升「自動週期 + 機械驗證」。失去 Dependabot,toolchain 升版易拖延,直到 security advisory 才被動處理。但相較 P1 之 PR-time gate,Dependabot 為「定期維運」型功能,P2。

**Independent Test**:在 main 上故意停留某 dep 之舊版,等下週一 Dependabot 觸發,確認對應 PR 開出且 CI 跑綠;merge 該 PR,確認 lockfile 升版且 4 gate 仍綠。

**Acceptance Scenarios**:

1. **Given** Dependabot 配置就位,**When** 每週一 09:00 UTC,**Then** Dependabot 掃 npm 依賴,把可升的 dep 按 grouping rule 開 PR(每組一條 PR;最多 5 個 open PR)。
2. **Given** Dependabot 開出之 PR(eg. 升 `@cloudflare/vitest-pool-workers` 0.15.2 → 0.16),**When** PR 開啟,**Then** 既有 3 mandatory check 自動跑(同 P1);全綠即可 merge。
3. **Given** Dependabot grouping rule 配置含 `@cloudflare/*`,**When** 某週 `wrangler` 與 `@cloudflare/workers-types` 同時有可升,**Then** 兩者同一 PR 內升版,而非分兩 PR。
4. **Given** Dependabot 開出之 commit message,**When** 看 git log,**Then** 訊息符合既有 `chore(deps): bump xxx` convention(per 001 FR-019)。

---

### User Story 3 - Adopter fork 後 CI 自帶不需 reconfigure (Priority: P2)

一位 adopter clone monorepo 後 fork 到自己的 GitHub org/repo,推第一個 commit 至自家 main(或開 PR)。GitHub Actions 自動偵測 `.github/workflows/ci.yml` 並啟用,無需 adopter 進 GitHub UI 配置。`.github/dependabot.yml` 同樣自動生效。Adopter 只需在 Settings → Branches 開 branch protection 把 3 mandatory check 設為必過(per spec PR description 之操作指引),即完成 derivative CI 設置。

**Why this priority**:此為 monorepo「fork-friendly starter」承諾在 CI 面之兌現。失去 self-contained CI,adopter 採用後須手寫 workflow 才能機械驗,降低 monorepo 之教學/示範價值。但相較 P1 之 PR-time gate,fork 操作只在採用初期觸發一次,P2。

**Independent Test**:把 monorepo 在獨立 GitHub account fork,推任意 commit,確認 Actions tab 出現 3 mandatory check 跑;不必在 fork 端做任何 workflow 編輯。

**Acceptance Scenarios**:

1. **Given** adopter 把 monorepo fork 到自家 GitHub account 並推 commit,**When** 任何 push 或 PR 發生,**Then** CI workflow 自動啟用(無需 adopter 編輯 `.github/workflows/ci.yml`)。
2. **Given** adopter 之 fork 含 `.github/dependabot.yml`,**When** GitHub Dependabot service 偵測到該檔,**Then** 下個排程週期觸發升版掃描(無需 adopter 在 GitHub UI 額外啟用 Dependabot)。
3. **Given** adopter 至 Settings → Branches 設 branch protection,**When** 把 3 mandatory check name 加入「Required status checks」,**Then** 後續 PR 未跑綠 3 check 即不能 merge(branch protection 為 GitHub repo settings,不在本 feature workflow 內)。

---

### User Story 4 - Reviewer 看 PR 自動偵測規範違規與 advisory 提示 (Priority: P3)

一位 reviewer review PR 時,不必逐項手動檢「PR 是否含 secret」「Worker bundle 是否含 Node-only」「是否有對應 spec/」「是否同時動 deps + src」。CI 結果與 advisory comment 直接列出。Mandatory 違規 PR 直接被 branch protection 擋住;advisory 違規(SC-003 spec coverage + FR-019 toolchain isolation)以 comment 形式提示,reviewer 一案一案決定豁免或要求修正。

**Why this priority**:此為 reviewer 工作量降低之長期價值。但相較 P1-P2,advisory 主要是 reviewer 體驗增強,新人 / Dependabot 場景可獨立成立,故 P3。

**Independent Test**:在 PR 內動 `src/node/app.ts` 但不動 `specs/`,確認 advisory comment 提示「No matching specs/NNN-*/ artifact for src changes」;另開 PR 同時動 `package.json` + `src/`,確認 advisory comment 提示「Toolchain change should be isolated commit per FR-019」。

**Acceptance Scenarios**:

1. **Given** PR 動到 `src/**` 但無對應新增/修改 `specs/NNN-*/` artifact,**When** CI 跑完,**Then** SC-003 advisory job 在 PR 內 comment 提示「未偵測到對應 specs/ 目錄;reviewer 請判定豁免或駁回」(不影響 mandatory check 結果)。
2. **Given** PR 同時動 `package.json` / `pnpm-lock.yaml` 與 `src/**` / `tests/**`,**When** CI 跑完,**Then** FR-019 advisory job comment 提示「toolchain 變更建議獨立 PR」(不阻擋 merge)。
3. **Given** PR 純 doc-only(動 `specs/**` 或 `.docs/**` 或 `*.md`),**When** CI 跑完,**Then** 兩個 advisory 皆不觸發提示(reviewer 不需處理 noise)。
4. **Given** reviewer 在 PR 內已留 comment「toolchain bump 與此 src 變更綁定有共同 root cause,豁免 advisory」,**When** advisory job 重跑(後續 commit 觸發),**Then** advisory comment 仍會出現(其性質為「提示」而非「強制」;豁免決定留在 PR comment 中即視為 accepted,不需停掉 advisory job)。

---

### Edge Cases

- **CI 首次跑 dev container build 慢**:adopter 第一次 push 後 CI 跑時,若 image 非 cached,`docker build` 階段可能需 ~10 分;後續因 GitHub Actions cache + dev container layer cache,降至 ~1 分。spec 預期 cache miss 路徑 ≤ 15 分,cache hit 路徑 ≤ 5 分。
- **Cache 失效 / 強制無 cache 跑(workflow_dispatch with no-cache flag)**:應仍跑得通(只是慢);若強制無 cache 跑後比 cached 跑結果不同,即為 cache poison 缺陷,須在配額內處理。
- **PR 動到 `.github/workflows/ci.yml` 自身**:CI 會用**新版 ci.yml** 跑(per GitHub Actions 預設行為);若新版 ci.yml 寫壞,PR 會 fail 自身檢查 → reviewer 看到即知不能 merge。
- **Dependabot 開 major bump PR**:預期會 break(major 通常有 breaking changes)。CI 跑完即知 break 點;maintainer 在 PR 內決定 (a) 修破壞處 (b) close PR 暫不升 (c) 部分升 minor 而非 major。
- **gitleaks 誤判合法字串為 secret**(false positive):支援 `.gitleaks.toml` 在 repo root 設 allowlist;誤判個案可加 entry。但每次加 allowlist 需 PR review 驗證確實非 secret(否則開 backdoor)。
- **Worker bundle 因 dep 升版意外撐破 100 KiB**:本 budget 為 isolated commit 升降(per FR-019);若 dep 升版必然撐破,maintainer 在同 PR 升 budget(eg. 100 → 150 KiB)並在 PR description 說明原因;reviewer 認可即可 merge。
- **secret-scan 在 push to main 觸發時掃全 history 太久**:gitleaks 對中型 repo(< 10k commits)通常 < 1 分;若超出 5 分屬效能 regression,reviewer 評估是否縮 scan 範圍(eg. 改掃近 N commit 而非全史,以 GitHub Actions outputs 報告 baseline)。
- **fork 之 PR 從外部來(non-collaborator)**:GitHub Actions 對外部 PR 預設不傳 secret;若 secret-scan 需要 secret(本 feature 不需),仍可跑(gitleaks 不需 secret)。本 spec 假設外部 PR 之 mandatory check 行為與內部 PR 一致。
- **Adopter fork 後初期還沒設 branch protection**:CI 仍跑(workflow 在,push 即觸發),但 reviewer 可手動 merge 跳過 mandatory check fail。本 spec 在 PR description 標明「branch protection 為 GitHub repo settings 必設項」之操作指引。
- **CI 跑時 GitHub Actions 服務本身 outage**:per 001 FR-020 degraded mode,本機 dev container 內跑 4 gate 仍可作為「本地證明」;但 PR 須等 GitHub Actions 恢復才能 merge。

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**:CI workflow MUST 落於 `.github/workflows/ci.yml`(repo root),由 GitHub Actions 自動偵測並執行。Adopter fork 後**不需**在 GitHub UI 額外啟用。
- **FR-002**:CI 觸發條件 MUST 涵蓋 `pull_request` 至 main、`push` 至 main、與 `workflow_dispatch`(手動觸發)三條 event。
- **FR-003**:CI 必須提供 **3 個 mandatory check**(以 GitHub Actions job 形式呈現,使其可在 branch protection 內被加入 Required status checks 清單):
  - **gates**:`pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm test:node` → `pnpm test:worker` 依序執行,任一步驟失敗即整 job 失敗。
  - **wrangler-bundle-check**:`pnpm exec wrangler deploy --dry-run` 產 bundle 後,(a) grep 確認**不含** `pg` / `redis` / `pino` / `prom-client` / `@hono/node-server` / `node:fs` / `node:child_process` 任一字串(機械化 002 FR-009 + SC-003);(b) 斷言 bundle size **≤ 100 KiB**(超出即 fail)。
  - **secret-scan**:gitleaks 掃,PR 觸發時掃 PR diff,push to main 觸發時掃全 git history(機械化 001 SC-006)。
- **FR-004**:CI 之 4 mandatory gates(於 gates job 內)MUST 於 **dev container 內執行**(per Q1 Clarification),具體技術實作(`devcontainers/ci` GitHub Action 或手動 docker build)由 plan 階段決定,但本 spec 鎖定「CI 必須以 `.devcontainer/` 內定義之 image 跑 gates」之契約,以兌現 001 FR-017 之「CI ↔ dev container same base image」承諾(Ubuntu side)。
- **FR-005**:CI 必須提供 cache 機制以加速重跑:pnpm store cache(keyed on `pnpm-lock.yaml` hash + Node version)+ node_modules cache(同 key);可選 TypeScript incremental cache(keyed on `src/**` + `tsconfig*.json` 內容 hash)。Cache miss 路徑單次跑 ≤ 15 分;cache hit 路徑 ≤ 5 分。
- **FR-006**:Dependabot 配置 MUST 落於 `.github/dependabot.yml`,schedule 為每週一(GitHub Actions 預設時區);target branch 為 main;升版 PR commit message 符合既有 `chore(deps): bump xxx` convention(per 001 FR-019)。
- **FR-007**:Dependabot grouping rules MUST 涵蓋:
  - `@cloudflare/*` 全部歸一組(workers-types / vitest-pool-workers / wrangler / 未來 miniflare 等)
  - `@typescript-eslint/*` 一組
  - `@vitest/*` + `vitest` 一組
  - 其他 minor + patch:小群組(eg. `node-deps-minor-patch`)
  - major:各自獨立 PR(避免 breaking change 被 grouping 隱藏)
  - open PR limit:5(避免 PR 噪音)
- **FR-008**:CI 必須提供 **2 個 advisory job**(失敗只 comment 提示,**不阻擋 merge**,不列入 branch protection mandatory check):
  - **SC-003 spec coverage advisory**:PR 動到 `src/**` 但無對應新增/修改 `specs/NNN-*/` artifact 時,comment 提示 reviewer 一案一案決定豁免;若 reviewer 已在 PR 內豁免,本 advisory 仍會 comment(其性質為提示而非強制 — per US4 acceptance #4)。
  - **FR-019 toolchain isolation advisory**:PR 同時動 `package.json` / `pnpm-lock.yaml` 與 `src/**` / `tests/**` 時,comment 提示「toolchain 變更與 application 變更應分開 PR」。
- **FR-009**:Advisory job 之 trigger 範圍 MUST 排除 doc-only PR(動到 `specs/**`、`.docs/**`、或 `*.md` 而未動 `src/**` `tests/**` `package.json` `pnpm-lock.yaml`)— 避免 reviewer 收到無意義 comment noise。
- **FR-010**:CI workflow MUST 不寫入 production credentials(無 `wrangler secret`、無 Cloudflare API token、無 Anthropic OAuth);所有 secret 由 GitHub Actions secrets 管理,本 feature 不引入 production secret 至 CI(secret-scan 與 dev container build 皆不需要)。
- **FR-011**:CI 失敗訊息 MUST 對 reviewer 直觀:gates job fail 時,GitHub Actions log 直接展示 vitest / tsc / eslint stderr 之最後 ~50 行;wrangler-bundle-check job fail 時展示 bundle 內容之 grep 命中行 + bundle size 數字;secret-scan job fail 時展示 gitleaks finding(redacted secret value;只列 file + line)。
- **FR-012**:本 feature 落地後 README MUST 加 §「CI status」段(含 GitHub Actions badge URL + 行為簡述 + branch protection 操作指引);Adopter fork 後可從 README 直接看出 CI 設置狀態。
- **FR-013**:001 baseline 之以下 SC / FR MUST 部分或全機械化:
  - **001 FR-017** Ubuntu side mechanized(CI 在 dev container 內跑 4 gates)— `partial mechanical, Ubuntu only`(macOS side 仍 manual per `.docs/parity-validation.md`)
  - **001 SC-005** mechanized(升版 commit 跑 4 gates 即證明 revert 可行)
  - **001 SC-006** mechanized(gitleaks job 每 PR + main push 跑)
  - **001 SC-008** **NOT mechanized by 003** — single-runner CI(只跑 ubuntu-latest)無法 mechanize 跨平台 parity quota,因 SC-008 之定義即「同 test 一邊 pass / 另一邊 fail」之 Mac vs WSL2 對照,需 ≥ 2 runners 才有意義。003 之 Ubuntu side gates job 僅作為 parity pair 之「一半」baseline,並未 reduce SC-008 manual reconciliation 之需要(per `.docs/parity-validation.md`)。SC-008 mechanization 屬 issue #34 (opt-in macOS runner) 之範圍,本 feature 範圍外。
  - **001 SC-003** advisory(per FR-008)
  - **001 FR-019** advisory(per FR-008)
  - **002 FR-009** fully mechanized(wrangler-bundle-check job 直接 grep)
  - **002 SC-003** fully mechanized(同上)

### Key Entities

- **CI Workflow**:`.github/workflows/ci.yml` — 含 3 mandatory job(gates / wrangler-bundle-check / secret-scan)+ 2 advisory job(spec-coverage-advisory / toolchain-isolation-advisory),trigger 涵蓋 PR / push to main / workflow_dispatch。
- **Dev Container Image**:CI 環境 image,定義於 `.devcontainer/`(複用既有);CI 透過 `devcontainers/ci` Action 或等價機制以此 image 跑 gates,確保 CI ↔ 本機 dev container 100% 對齊(per FR-017 spec-strict 解讀)。
- **Bundle Budget**:Worker bundle size 上限,當前定為 100 KiB;超出即 mandatory fail。Budget 升降為 isolated commit + reviewer 認可。
- **Secret Scan Configuration**:gitleaks 預設規則 + 可選 `.gitleaks.toml`(repo root)allowlist 用於誤判個案。
- **Dependabot Configuration**:`.github/dependabot.yml` — 含 schedule + target branch + grouping rules + PR commit convention。
- **Advisory Comment**:GitHub PR 上之 bot comment(由 advisory job 發出)— 性質為提示;reviewer 可在 PR 內豁免,但 advisory job 不會因此停掉(下次觸發仍會 comment)。
- **Branch Protection Mandatory Check List**:在 GitHub repo Settings → Branches 設定之 Required status checks(屬 GitHub repo settings,不在本 feature 之 workflow YAML 範圍);adopter fork 後須手動設,操作指引在 README + PR description。

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**:乾淨 fork 後第一個 PR 觸發後,3 mandatory check(gates / wrangler-bundle-check / secret-scan)在 ≤ 10 分內出綠/紅結果(cache hit 路徑 ≤ 5 分;cache miss 路徑 ≤ 15 分)。
- **SC-002**:CI 之 4 mandatory gates(於 dev container 內跑)結果與本機 dev container 跑同 commit 之結果 **100% 等價**(pass/fail count + 訊息一致);非語意性差異(時間戳 / wall time / GitHub Actions runner ID)允許,任何「同 test 一邊 pass / 另一邊 fail」即視為 parity 缺陷,計入 001 SC-008 季度配額。
- **SC-003**:跨 runtime import 違規 PR 之 lint 失敗率 = 100%(per 既有 002 FR-022 + ESLint `no-restricted-imports`;CI 機械驗證,無遺漏)。
- **SC-004**:Worker bundle 含 Node-only module 之 PR 之 wrangler-bundle-check 失敗率 = 100%(grep 機械驗證)。
- **SC-005**:Worker bundle size 超 100 KiB 之 PR 之 wrangler-bundle-check 失敗率 = 100%(size assertion 機械驗證)。
- **SC-006**:含 OAuth credentials / `.env` 內容 / 看似 secret 的 git diff 之 PR 之 secret-scan 失敗率 = 100%(gitleaks 預設規則覆蓋率;false negative 率僅受 gitleaks 規則完整度限制,本 spec 不另行 audit)。
- **SC-007**:Dependabot 升版 PR 自開啟至 CI 跑完(全綠或紅)之時間 ≤ 15 分(同 SC-001 cache-miss 上限),確保 maintainer 收到通知後可即時決定 (a) merge / (b) close / (c) 修破壞處。
- **SC-008**:Adopter fork 後 ≤ 5 分內(即 GitHub Actions 偵測 workflow 之延遲),首次 push 觸發 CI 之 3 mandatory check 自動跑(無需 adopter 編輯 workflow YAML)。
- **SC-009**:CI workflow 自身被 PR 動過(eg. 升 GitHub Actions version)且該 PR 不破壞既有 4 gate 行為時,PR 應 self-test 通過(用 PR 之新版 ci.yml 跑,per GitHub Actions 預設)。
- **SC-010**:每月 SC-006 之 0 false negative 維持率 ≥ 99%(即 git history 內 OAuth credentials 出現 0 次;若 false negative 發生則計入 SC-008 同季配額,並在 `.gitleaks.toml` allowlist + 補強規則內處理)。
- **SC-011**:本 feature 落地後,001 FR-017 從「known gap(reviewer audit I-1 PARTIAL)」升為「Ubuntu side mechanized」(per FR-013);001 SC-005 + SC-006 從「人工 attest」升為「mechanized」;002 FR-009 + SC-003 從「typecheck 隱性攔下」升為「fully mechanized(grep + size assertion)」。

## Assumptions

1. **GitHub Actions 為 adopter 採用之 CI provider**:本 feature workflow 寫死於 `.github/workflows/ci.yml`,假設 adopter 不換 CI provider(如 GitLab CI / CircleCI / Buildkite);換 CI provider 即需重寫等價 workflow,屬 derivative concern。
2. **GitHub-hosted runner(`ubuntu-latest`)足夠**:本 feature 不假設 self-hosted runner;adopter 若需 self-hosted(eg. enterprise 內部網絡),可在 `runs-on` 自行調整,屬 adopter customization。
3. **Adopter 自負 GitHub Actions minutes 成本**:public repo 之 ubuntu-latest minutes 通常免費(2000 min/month for free tier);private repo / enterprise 需 adopter 自評。本 spec 不打包成本估算,只承諾 cache 設計使單次跑 ≤ 15 min。
4. **gitleaks 規則為 monorepo 之 secret coverage 之事實標準**:不另行 fork / 維護 secret 規則庫;升 gitleaks action version 屬 toolchain bump(per FR-019)走孤立 commit。
5. **Dependabot 為 GitHub-native service**:不另行包 Renovate 等替代品;Renovate 為 adopter 替代選項屬 derivative customization。
6. **Branch protection rules 由 adopter 在 GitHub UI 手動設**:本 feature 不透過 API / Terraform 自動配置 branch protection(屬 GitHub repo settings,不在 workflow YAML 範圍);spec 在 README 與 PR description 留設定指引。
7. **CI 不打 production Cloudflare API**:wrangler-bundle-check job 用 `--dry-run`,不 deploy;test:worker 透過 miniflare in-memory bindings(per 002 SC-004)無需網路。本 feature 不引入任何 production credential 至 CI 環境。
8. **Worker bundle 100 KiB budget 為當前選擇**:per Q2 Clarification,當前 ~64 KiB,留 ~50% headroom;adopter 自家 feature 撐破 budget 即在 isolated commit 內升 budget,reviewer 認可後可 merge。Budget 不為硬性 spec invariant,而是「當前 baseline 之選擇」。
9. **Dev container in CI 之具體技術選擇於 plan 階段決定**:可能用 `devcontainers/ci@v0.3` GitHub Action(官方 marketplace),或手動 `docker build .devcontainer/` + `docker run`;本 spec 鎖定契約(CI 必須以 `.devcontainer/` image 跑 gates),不鎖技術細節。
10. **Advisory job 之 trigger 範圍規則為近似啟發式**:SC-003 spec coverage 之「動 src/ 但無 spec/」與 FR-019 toolchain isolation 之「同時動 deps + src」皆為近似偵測,**可能 false positive / negative**(eg. PR 改 spec 文字但未動 src,advisory 不會 fire 是預期);advisory 性質為「reviewer 提示」而非「強制執行」,故誤判可接受。

## Dependencies

- **001-superspec-baseline**(已 merge 至 `main`)— 本 feature 機械化 baseline 之 FR-017 / SC-005 / SC-006 / SC-008(部分);baseline 之 contracts(quality-gates / sensitive-material / cli-pipeline)為本 feature 之 Constitution Check anchor。
- **002-cloudflare-worker**(已 merge 至 `main`,且後續 PR #17/#18/#19/#20 已升 toolchain 並 verify)— 本 feature 機械化 002 之 FR-009 / SC-003 全項;wrangler-bundle-check job 仰賴 002 之 wrangler.jsonc + ExportedHandler<Env> 結構正確產生 bundle。
- **既有 dev container**(`.devcontainer/`)— 本 feature 之 gates job 直接用此 image 跑 4 gates;若未來 dev container 升版,CI 自動跟進(per FR-017 contract)。
- **既有 4 mandatory gates 命令**(`pnpm typecheck` / `pnpm lint` / `pnpm test:node` / `pnpm test:worker`)— 本 feature 不引入新 gate 命令,只把既有命令升至 CI 自動執行。
- **GitHub Actions service**(adopter 端,fork 必需)— 本 feature workflow 假設 GitHub Actions 為 CI provider;runner 用 ubuntu-latest(GitHub-hosted)。
- **gitleaks**(由 GitHub Actions Action 引入,如 `gitleaks/gitleaks-action`)— secret-scan job 之依賴;升版屬 toolchain bump(per FR-019)。
- **Dependabot service**(GitHub-native,免費)— Dependabot 升版掃描為 GitHub-managed service,本 feature 只配置 `.github/dependabot.yml`,不打包 Dependabot 自身。
- **本 feature 不引入新 npm 依賴**;workflow YAML 之 GitHub Actions(`actions/checkout`、`pnpm/action-setup`、`devcontainers/ci`、`gitleaks/gitleaks-action` 等)為 plan 階段選擇,屬 CI 配置而非 npm dep。

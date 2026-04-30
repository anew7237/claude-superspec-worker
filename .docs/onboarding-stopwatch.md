# Onboarding Stopwatch — SC-001 量測記錄

此檔追蹤 SC-001 在各主機平台上的實際量測結果。SC-001 定義見
[`specs/001-superspec-baseline/spec.md`](../specs/001-superspec-baseline/spec.md)（搜尋 `SC-001`）:
新成員從零(僅 Docker、IDE、Git)到 Node 應用 stack 全綠 healthcheck,首次 build 完成 ≤ 15 分鐘;
後續 reopen container ≤ 3 分鐘。

## 主要量測表

| 場景                                       | Mac M1 時間 | WSL2 Ubuntu 時間 | 符合 SC-001?                           | 備註                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | ----------- | ---------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 首次 build(devcontainer ready,banner 印出) | 30 s        | 45 s             | ✅(≪ 15 min)                           | Mac M1: T016 / 2026-04-30;~~需先 `export SSH_AUTH_SOCK=/run/host-services/ssh-auth.sock`~~ workaround **已不需要** — issue #1 fix(本檔同 commit 之鄰近 fix commit,subject `fix(devcontainer): drop explicit SSH_AUTH_SOCK mount`)移除顯式 SSH mount,改由 VS Code Dev Containers 內建 forwarding 處理,Mac M1 + WSL2 雙平台皆 clean 起。WSL2: T006 / 2026-04-30;`vsc-*` + worker app image 預先砍除,base image / features / `~/.claude` mount 仍 cached;banner 0 WARN / 0 NOT FOUND |
| Reopen container(已 build 過)              | 20 s        | 25 s             | ✅(≪ 3 min)                            | Mac M1: T016 / 2026-04-30。WSL2: T006 / 2026-04-30。皆只跑 `postStartCommand`                                                                                                                                                                                                                                                                                                                                                                                                     |
| `make up` 到全綠 healthcheck(三個 service) | 12 s        | 20 s             | ✅(SC-001 spec 未明列上限,典型 ≤ 30 s) | Mac M1: T016 / 2026-04-30。WSL2: T006 / 2026-04-30;app image 已 build。Mac 比 WSL 快 8 s,在 Apple Silicon native arm64 image 走 + Docker Desktop VM resource pre-allocated 範圍內合理                                                                                                                                                                                                                                                                                             |

## 量測方法

- **首次 build** — 依照 [`quickstart.md` Step 1](../specs/001-superspec-baseline/quickstart.md)
  （clone + `Reopen in Container`）。從點擊「Reopen in Container」開始計時,到 terminal 印出 banner
  (`Environment ready`) 為止。
- **Reopen container(已 build 過)** — 對已 build 完成的 devcontainer 執行 VS Code「Reopen in
  Container」。從點擊開始計時,到 banner 印出為止(只跑 `postStartCommand`,不重建映像)。
- **`make up` 到全綠 healthcheck** — 容器就緒後,於容器內 terminal 執行:
  ```bash
  time make up && docker compose ps
  ```
  計時區間:從 `make up` 啟動到三個 service(`app` / `db` / `redis`)狀態皆顯示 `healthy`。

## 第一個 SDD feature 量測(T009 補充)

**完成日期**:2026-04-30
**Sample feature**:`GET /echo` endpoint(`specs/001-superspec-baseline-T009/`)
**Branch**:`001-superspec-baseline-T009`(從 `001-superspec-baseline` HEAD `8b699c7` fork,以
`GIT_BRANCH_NAME` env 覆蓋預設 NNN-name 命名慣例)。
**平台**:WSL2 Ubuntu host(本 maintainer dev 環境;Mac M1 上未重跑此 walkthrough)。

### 整輪 SDD pipeline elapsed

| 階段                 | 動作                                                                                            | 內容                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `/speckit-specify`   | 產 `spec.md` + `checklists/requirements.md`                                                     | 5 user stories → 3 個 / 22 → 6 FRs / 11 → 5 SCs / 12 → 5 edge cases。0 個 [NEEDS CLARIFICATION] marker(以 Assumptions 段封閉所有歧義) |
| `/speckit-clarify`   | **跳過**                                                                                        | spec 0 ambiguity → 直接進 plan                                                                                                        |
| `/speckit-plan`      | 產 `plan.md` + `research.md` + `data-model.md` + `contracts/echo.contract.md` + `quickstart.md` | Constitution Check 5/5 ✅ no violations                                                                                               |
| `/speckit-tasks`     | 產 `tasks.md`                                                                                   | 12 tasks / 6 phases / TDD mandatory                                                                                                   |
| `/speckit-implement` | T001-T012                                                                                       | RED (T003) → GREEN (T004) → typecheck/lint/prettier 全綠 → manual quickstart 6 step → 收場                                            |
| **合計**             | **21 min 5 sec(1265 s)**                                                                        | **遠小於 SC-007 ≤ 1 hour budget** ✅                                                                                                  |

### 量測終點驗證

- **`pnpm test`**:8 file / 27 tests pass(原 7 file 20 tests + 新 `tests/node/echo.test.ts` 7 cases — 3 happy / 3 missing / 1 metrics inheritance)
- **`pnpm typecheck`**:exit 0
- **`pnpm lint`**:exit 0(no-console rule:`/echo` handler 未引入 `console.*`)
- **`pnpm exec prettier --check .`**:exit 0
- **Quickstart manual walkthrough**:6 acceptance scenario 全綠(happy / URL-encoded / 中文 / missing / empty / multi-take-first);`/metrics` 含 `route="/echo"` counter + histogram bucket(自動繼承 baseline httpMetrics middleware,**無需顯式接線** — 兌現 spec FR-004 + 001 baseline observability invariant 1)
- **`make down`** 收場乾淨

### Implementation 規模

- `src/node/app.ts` +9 lines(`app.get('/echo', handler)` + 註解)
- `tests/node/echo.test.ts` 新檔 +96 lines(3 describe block / 7 it case + helper for register snapshot)
- 對 baseline 既有檔案 / 契約 / 依賴 / 配置 **0 變更**

### 兌現 001-superspec-baseline 之 SC-007

> **SC-007**:Adopter 採用後的「第一個自家 feature」可在 1 小時內走完整 SDD pipeline
> (`/speckit-specify → /speckit-clarify → /speckit-plan → /speckit-tasks → /speckit-implement`)
> 且通過所有 quality gate;baseline 不預製範例 feature,SC-007 由 adopter 自家流程的可重現性驗證。

本量測為本 maintainer 自跑的 SC-007 in-repo 實證。adopter 端可重現性需各自驗證,baseline 不 promise
adopter 一定 ≤ 1 hour;但本 walkthrough 證明:**對 trivial 範圍 feature(1 endpoint,1 happy + 1 error
分支),SC-007 budget 含寬裕緩衝(本次 21m,budget 60m)**,即使 adopter 較不熟悉 spec-kit 流程,
仍有充足時間慢慢走。

## Fresh-eyes 二次驗證(T016 補充)

**完成日期**:2026-04-30
**驗證者**:同一 maintainer,於 Mac M1(Apple Silicon)host 上跑;repo 為從 origin 新 clone 至
`/Users/testc1aw/x_Project/TEST-claude/claude-superspec-worker`,checkout 至 `001-superspec-baseline`
HEAD `14b0824`(含 T006 measurement)。

### 跨平台量測對比(SC-001 兌現)

| 場景       | Mac M1 | WSL2 Ubuntu | 差異  | 備註                                                                                                    |
| ---------- | ------ | ----------- | ----- | ------------------------------------------------------------------------------------------------------- |
| 首次 build | 30 s   | 45 s        | -15 s | Mac M1 較快;ARM64 native + Docker Desktop VM 預配資源 / WSL2 走 Hyper-V VM 啟動有額外 fs cache 預熱成本 |
| Reopen     | 20 s   | 25 s        | -5 s  | 兩端皆只跑 `postStartCommand`,差異在 noise 範圍                                                         |
| `make up`  | 12 s   | 20 s        | -8 s  | Mac arm64 native image 啟動快;db/redis healthcheck 同樣 10 s interval                                   |

兩平台皆 ≪ SC-001 上限(15 min / 3 min),**SC-001 在 v1.0.0 跨 Mac M1 + WSL2 Ubuntu 雙平台兌現**。

### 本次驗證的發現與閉合過程(issue #1 從 surface 到 fix)

**Layer A — bind-mount hard-fail(原始 surface 點)**:Mac M1 首次 build 在 default
`SSH_AUTH_SOCK` 下會 bind-mount fail(`/var/run/com.apple.launchd.*/Listeners` 在 Docker
Desktop VM 內不存在),容器無法啟動。

**Layer B — 即便 Layer A 用 magic socket 繞過,SSH forwarding 仍 broken**:VS Code
Remote-Containers 自家 override `SSH_AUTH_SOCK` 為 `/tmp/vscode-ssh-auth-*.sock`、容器內
`ssh-add -L` 回 `communication with agent failed`。我們顯式 mount 的 `/ssh-agent` 形同裝飾,
owned by root 對 `vscode` user 也不可用。

**Path B 實驗 → option 5 證實**(同日完成,不另列 follow-up):於
[branch `experiment/mac-ssh-option5`](https://github.com/anew7237/claude-superspec-worker/tree/experiment/mac-ssh-option5)
試刪 SSH mount + `containerEnv.SSH_AUTH_SOCK`,改由 VS Code Dev Containers 內建 forwarding
獨自處理。Mac M1 與 WSL2 雙平台皆驗:容器 clean 起、`ssh-add -L` 印出 host 端 key、
`ssh -T git@github.com` 成功。Fix 已折回本 baseline(本檔同 commit 之鄰近 fix commit,subject `fix(devcontainer): drop explicit SSH_AUTH_SOCK mount`,issue #1 closed)。

**前提條件**(adopter 須知):host 端 `ssh-add ~/.ssh/<key>` 已載 identity。Mac 上若用
launchd 託管的 ssh-agent,確認 `ssh-add -L` 印出公鑰即可;若空,git push 自動 fall back
HTTPS(`post-create.sh` SSH sanity check 印 INFO 提示)。

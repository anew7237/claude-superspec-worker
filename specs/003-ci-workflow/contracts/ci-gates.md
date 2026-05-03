# Contract: CI Gates(3 mandatory + 2 advisory job)

**Feature**: `003-ci-workflow`
**File anchor**: `.github/workflows/ci.yml`
**Spec FR anchor**: FR-001~FR-005, FR-008~FR-011
**Date**: 2026-05-03

本契約定義 CI workflow 內 5 個 job 之 **input / output / failure mode / observable behavior**;以契約形式鎖定行為,使 Phase 2 tasks 與 Phase 3 implement 之 acceptance test 可逐項驗。

---

## §1 共通契約

### 1.1 Trigger 條件

| Event | 對 main branch | 行為 |
|---|---|---|
| `pull_request` | branches: [main] | 5 個 job 全跑(包含 advisory) |
| `push` | branches: [main] | 5 個 job 全跑(merge 後驗證) |
| `workflow_dispatch` | n/a | 手動觸發,5 個 job 全跑 |

不在上表 trigger 之 event(如 `schedule` / `release`)**不觸發**本 workflow。

### 1.2 Concurrency

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

- 同一 PR 連續 push:取消 in-progress 跑(只跑最新 commit)
- main push 與 PR run 各自獨立 group(不互相取消)

### 1.3 Runner

`runs-on: ubuntu-latest`(GitHub-hosted x86_64)— 全 5 個 job 一致。Adopter self-hosted runner 屬 customization,本契約不涵蓋。

### 1.4 Mandatory check 命名(用於 branch protection)

| Job ID | Branch protection check name(adopter 須加入 Required status checks) |
|---|---|
| `gates` | `gates` |
| `wrangler-bundle-check` | `wrangler-bundle-check` |
| `secret-scan` | `secret-scan` |

Job ID 與 check name 一致(GitHub Actions 預設行為),adopter 可在 Settings → Branches 直接加。

---

## §2 Mandatory Job:`gates`

### 2.1 契約

**目的**:在 dev container 內跑 4 mandatory gates(per 001 baseline workflow gates 1-3 + Worker pool)— typecheck / lint / test:node / test:worker。

**Input**:

- PR 之 commit SHA(由 `actions/checkout@v4` 取)
- 既有 `.devcontainer/`(複用 image 定義)
- 既有 `pnpm-lock.yaml`(install 鎖版)

**Steps**:

1. `actions/checkout@v4` — 取 PR diff(預設 fetch-depth: 1)
2. `actions/cache@v4` — restore pnpm store(key: `pnpm-store-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}`)
3. `actions/cache@v4` — restore node_modules(key: `node_modules-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}`)
4. `devcontainers/ci@v0.3` — build(or restore)dev container image,然後 `runCmd` 跑:
   ```bash
   set -euo pipefail
   pnpm install --frozen-lockfile
   pnpm typecheck
   pnpm lint
   pnpm test:node
   pnpm test:worker
   ```
5. (Optional)若 step 4 fail,`actions/upload-artifact@v4` 上傳 `*.log` / `.vitest-cache/` 供 reviewer download

**Output**:

- `success` exit:5 個 step 全綠 → job 標 ✅,branch protection 視為通過
- `failure` exit:任一 step fail → job 標 ❌,GitHub Actions log 展示完整 stderr;branch protection 阻擋 merge

**Failure mode**:

| Step | Trigger | Visible behavior |
|---|---|---|
| `pnpm install --frozen-lockfile` fail | lockfile 與 manifest 不一致(per 001 FR-009)| log 展示 pnpm error;exit 1 |
| `pnpm typecheck` fail | dual tsconfig 任一報 error(per 002 FR-022 Layer 1 + 既有 src/tests)| log 展示 tsc error 含 file:line |
| `pnpm lint` fail | ESLint flat config 報 error,含 `no-restricted-imports` 跨 runtime 違規(per 002 FR-022 Layer 2)| log 展示 ESLint error 含 file:line |
| `pnpm test:node` fail | vitest Node pool 任一 test 失敗 | log 展示 vitest output(失敗 test 名 + assertion diff) |
| `pnpm test:worker` fail | vitest Worker pool(miniflare)任一 test 失敗 / setup fail | log 展示 vitest output;若是 cloudflare-pool worker startup 失敗(per 已解 issue #15 race condition)應由 0.15.2 patch bump 預防 |

**性能契約**:

- Cache hit 路徑:job 完成 ≤ 5 min(per SC-001)
- Cache miss 路徑:job 完成 ≤ 15 min(per SC-001 + Edge Case)

**Observable behavior(reviewer 視角)**:

- ✅ 通過:GitHub PR 頁面 mandatory check `gates` 顯示綠勾;reviewer 不需手動跑 4 gate
- ❌ 失敗:mandatory check `gates` 顯示紅叉;PR 頁面可點 check 直接看 GitHub Actions log 之 stderr 末段(含失敗 file:line)

### 2.2 Spec impact

- **001 FR-017** Ubuntu side mechanized(CI 在 dev container 內跑 4 gates)
- **001 SC-002** partial mechanized(Ubuntu 內 4 gate 一致性自動驗;跨 Mac/WSL2 仍 manual)
- **001 SC-005** mechanized(升版 commit 跑 4 gate 即證明 revert 可行)
- **002 FR-022 + SC-011** 既有 mechanical guarantee 升為「每 PR 自動觸發」

---

## §3 Mandatory Job:`wrangler-bundle-check`

### 3.1 契約

**目的**:在 dev container 內跑 `wrangler deploy --dry-run` 產生 Worker bundle,然後 grep 確認不含 Node-only modules + 斷言 bundle size ≤ 100 KiB(per spec FR-003 第 2 條)。

**Input**:

- PR 之 commit SHA
- 既有 `.devcontainer/` + `wrangler.jsonc` + `src/worker/`
- Bundle budget threshold:100 KiB(per spec Q2 Clarification + research §4)

**Steps**:

1. `actions/checkout@v4`
2. `actions/cache@v4` — restore pnpm store(同 §2.1 step 2)
3. `actions/cache@v4` — restore node_modules(同 §2.1 step 3)
4. `devcontainers/ci@v0.3` — build / restore + `runCmd` 跑:

   ```bash
   set -euo pipefail
   pnpm install --frozen-lockfile
   pnpm exec wrangler deploy --dry-run
   BUNDLE=.wrangler/dryrun/index.js

   # 檢查 1:bundle 不含 Node-only modules
   FORBIDDEN=("pg" "redis" "pino" "prom-client" "@hono/node-server" "node:fs" "node:child_process")
   for mod in "${FORBIDDEN[@]}"; do
     if grep -q "$mod" "$BUNDLE"; then
       echo "❌ BUNDLE CONTAINS FORBIDDEN MODULE: $mod"
       grep -n "$mod" "$BUNDLE" | head -5
       exit 1
     fi
   done

   # 檢查 2:bundle size ≤ 100 KiB
   SIZE=$(wc -c < "$BUNDLE")
   BUDGET=$((100 * 1024))
   if [ "$SIZE" -gt "$BUDGET" ]; then
     echo "❌ BUNDLE SIZE $SIZE bytes (=$((SIZE / 1024)) KiB) exceeds budget $BUDGET bytes (=100 KiB)"
     exit 1
   fi
   echo "✅ bundle clean: $SIZE bytes ($((SIZE / 1024)) KiB), budget $((BUDGET / 1024)) KiB"
   ```

**Output**:

- `success`:bundle 不含 forbidden + size ≤ budget → job 標 ✅
- `failure`:任一檢查 fail → job 標 ❌,log 展示具體違規

**Failure mode**:

| Trigger | Visible behavior |
|---|---|
| Bundle 含 `pg` / `redis` / `pino` / `prom-client` / `@hono/node-server` / `node:fs` / `node:child_process` 之一 | log 展示 `❌ BUNDLE CONTAINS FORBIDDEN MODULE: <name>` + grep 命中行;exit 1 |
| Bundle size > 100 KiB | log 展示 `❌ BUNDLE SIZE N bytes (M KiB) exceeds budget 102400 bytes (100 KiB)`;exit 1 |
| `wrangler deploy --dry-run` 自身 fail(eg. wrangler.jsonc 配置錯)| log 展示 wrangler error;exit 非 0 |
| `pnpm install` fail | 同 §2.1 failure mode |

**性能契約**:

- Cache hit 路徑:job 完成 ≤ 3 min(install ~10s + wrangler dry-run ~30s + grep ~1s)
- Cache miss 路徑:同 §2.1 ≤ 15 min budget

**Observable behavior**:

- ✅ 通過:check 顯示綠勾;若 reviewer 想知 size 趨勢,可看 log 之 ✅ 行(`bundle clean: N bytes`)
- ❌ 失敗:check 顯示紅叉;log 直接列違規 module 或 size 超出量

### 3.2 Spec impact

- **002 FR-009** fully mechanized(從 typecheck 隱性攔下 → bundle-level 直接 grep)
- **002 SC-003** fully mechanized(同上)
- **新增約束**:Worker bundle size budget(spec.md SC-005)

---

## §4 Mandatory Job:`secret-scan`

### 4.1 契約

**目的**:用 gitleaks 掃 git diff(PR)或全 git history(push to main),確保無 OAuth credentials / `.env` 內容 / 看似 secret 的字串(per spec FR-003 第 3 條 + 001 SC-006)。

**Input**:

- PR diff(PR trigger)或全 git history(push to main trigger)
- 可選 `.gitleaks.toml`(repo root)— allowlist 用於誤判(per data-model §1.3)

**Steps**:

1. `actions/checkout@v4` with `fetch-depth: 0`(取全 history,gitleaks scan diff 或 log 都需要 base ref)
2. `gitleaks/gitleaks-action@v2` with:
   - **mode 由 event auto-detect**(per gitleaks-action README;與 ci.yml:211-220 之實作 comment 同步):`pull_request` event 走 diff scan(掃 PR diff,comment finding on PR diff line);`push` event 走 git log scan(掃全 history,需配合 step 1 之 `fetch-depth: 0`)。**無 mode-switching env**;`GITLEAKS_NOTIFY_USER_LIST` 為 notification 用 env,**與 mode 切換無關**。
   - 失敗時 redact secret value(只列 file + line),per FR-011

**Output**:

- `success`:0 finding → job 標 ✅
- `failure`:≥ 1 finding → job 標 ❌,GitHub Actions log + PR diff annotation 展示 finding(file + line + redacted)

**Failure mode**:

| Trigger | Visible behavior |
|---|---|
| Commit 內含 `password=secret123` / 看似 OAuth token / `.env` 完整內容 | gitleaks finding 出現於 PR diff line(如 PR mode);log 展示 file + line(value redacted)|
| 已有 `.gitleaks.toml` allowlist 但 finding 仍命中(allowlist 規則寫錯)| 同上;reviewer 須修 `.gitleaks.toml` |
| Git history(non-PR-diff)內含舊 secret(historical leak) | 在 push to main mode 才會偵測;PR mode 只看 diff 不會 fire |

**性能契約**:

- PR mode(掃 diff):≤ 30 sec(gitleaks 快;diff 通常小)
- push to main mode(掃全 history):≤ 1 min(中型 monorepo < 10k commits;per Edge Case 預期)

**Observable behavior**:

- ✅ 通過:check 顯示綠勾;PR diff 無 annotation
- ❌ 失敗:check 紅叉;PR diff line 上直接出現 gitleaks bot annotation 含 redacted finding

### 4.2 Spec impact

- **001 SC-006** mechanized(從人工 / 偶發 → 每 PR + main push 自動)
- **001 §Sensitive material policy** 全 ban list 機械化(`.claude/.credentials.json`、`.env`、`.dev.vars`、`*.pem`、`*.key`)

---

## §5 Advisory Job:`spec-coverage-advisory`

### 5.1 契約

**目的**:當 PR 動到 `src/**` 但無對應 `specs/NNN-*/` artifact,在 PR 內 comment 提示 reviewer 一案一案決定豁免(per spec FR-008 + 001 SC-003)。

**Input**:

- PR 之 file change list(從 GitHub API `pulls.listFiles`)

**Steps**:

1. `actions/checkout@v4`
2. `actions/github-script@v7` — query PR file list,判斷:
   - **Doc-only PR**(只動 `specs/**` / `.docs/**` / `*.md`):skip,不 comment(per FR-009)
   - **動到 `src/**` + 動到 `specs/NNN-*/`(任一)**:OK,不 comment
   - **動到 `src/**` 但無 `specs/NNN-*/` 變更**:**comment 提示**(本 advisory 之主要場景)

3. Comment 內容:
   ```text
   ⚠ Advisory: This PR modifies `src/**` but no `specs/NNN-*/` artifact was added or updated.
   Per 001 baseline FR-004 (spec-kit pipeline) + SC-003, non-trivial changes should
   correspond to a spec directory. Reviewer please decide:
   - (a) This is a trivial change exempt from spec coverage (per FR-004 trivial 豁免) — leave a comment explaining
   - (b) Open a spec PR first, then update this PR to reference it
   ```

**Output**:

- `success` exit code(無論是否 comment);**advisory 永不阻擋 merge**
- 若觸發 comment,GitHub PR 頁面出現 bot comment(無 marker,每次 push 重 comment;per research §6 idempotency strategy)

**Failure mode**:

- 此 job 無「失敗」概念;skip 條件成立即不 comment,觸發條件成立即 comment;exit 0

**Observable behavior**:

- 在 advisory 觸發之 PR:reviewer 看到 bot comment,在 PR 內 留 reply 表態(豁免 / 駁回 / 補 spec)
- 在 doc-only PR / 已有對應 spec/ 之 PR:reviewer 不會收到 noise

### 5.2 Spec impact

- **001 SC-003** advisory 化(從人工 attest → 自動提示;reviewer 仍保留豁免權)

---

## §6 Advisory Job:`toolchain-isolation-advisory`

### 6.1 契約

**目的**:當 PR 同時動 `package.json` / `pnpm-lock.yaml` 與 `src/**` / `tests/**`,comment 提示「toolchain 變更與 application 變更應分開 PR」(per spec FR-008 + 001 FR-019)。

**Input**:

- PR 之 file change list

**Steps**:

1. `actions/checkout@v4`
2. `actions/github-script@v7`:
   - **Doc-only PR**(只動 `specs/**` / `.docs/**` / `*.md`):skip
   - **同時動 `package.json` 或 `pnpm-lock.yaml` AND 動 `src/**` 或 `tests/**`**:**comment 提示**
   - 其他狀態:不 comment

3. Comment 內容:
   ```text
   ⚠ Advisory: This PR modifies BOTH toolchain (`package.json` / `pnpm-lock.yaml`) AND
   application code (`src/**` / `tests/**`). Per 001 baseline FR-019 + 002 spec assumption #6,
   toolchain bumps should be isolated commits / PRs to enable single-commit revert.
   Reviewer please decide:
   - (a) Split into two PRs (recommended)
   - (b) Leave a comment explaining why bundling is necessary (eg. dep upgrade requires src adaptation in same logical change)
   ```

**Output**:同 §5(advisory 永不阻擋 merge,exit 0)

**Failure mode**:同 §5(無失敗概念)

**Observable behavior**:

- 觸發場景:reviewer 看 bot comment,決定要求拆 PR 或留 comment 豁免
- 純 toolchain bump PR(eg. PR #17/#20)/ 純 app code PR:不會收到 noise

### 6.2 Spec impact

- **001 FR-019** advisory 化(從人工 attest → 自動提示;reviewer 仍保留豁免權)

---

## §7 不變量(must hold)

1. **3 mandatory + 2 advisory total = 5 job**;不增刪(per spec FR-003 + FR-008)
2. **Mandatory check failure 阻擋 merge**(via branch protection;adopter 設);**advisory failure 永不阻擋**
3. **CI 不寫入 production credentials**(per spec FR-010 + 002 SC-004)— wrangler-bundle-check 用 dry-run;test:worker 用 miniflare;secret-scan 不需 secret(gitleaks 為 standalone)
4. **Job 之間平行執行**(無 `needs:` chain),除非 follow-up implementation 發現 cache contention(本 plan 預設平行,Phase 3 implement 端驗證)
5. **CI 跑於 ubuntu-latest**;不引入 macOS / Windows runner(per spec assumption + Q6 Clarification)
6. **CI 工作於 dev container 內**(僅 gates + wrangler-bundle-check 兩 mandatory job;secret-scan + 兩 advisory 在 host 跑;per data-model §1.1)
7. **Bundle budget 100 KiB 為當前 anchor**;升降走 isolated commit + reviewer 認可(per spec assumption #8)

---

## §8 失敗模式表(summary)

| 場景 | 哪個 job fail | 阻擋 merge? | reviewer 行動 |
|---|---|---|---|
| typecheck error | gates | ✅ Yes | 修 src 或 spec amendment |
| ESLint error / no-restricted-imports 觸發 | gates | ✅ Yes | 修 import 或合理重構 |
| vitest test fail(Node or Worker pool) | gates | ✅ Yes | 修 test 或 implementation |
| Worker bundle 含 forbidden module | wrangler-bundle-check | ✅ Yes | 移除違規 dep / import |
| Worker bundle size > 100 KiB | wrangler-bundle-check | ✅ Yes | 縮 bundle 或 isolated commit 升 budget |
| Git diff 含 OAuth / `.env` / 看似 secret | secret-scan | ✅ Yes | 移除 secret 並 rotate;若誤判加 `.gitleaks.toml` allowlist |
| PR 動 src 但無 spec | spec-coverage-advisory | ❌ No | 看 comment 決定豁免 / 補 spec |
| PR 同時動 deps + src | toolchain-isolation-advisory | ❌ No | 看 comment 決定拆 PR / 豁免 |

---

## §9 驗證(per Phase 3 `/speckit-implement` 之 acceptance test)

對應 spec.md §「必須涵蓋的 acceptance scenarios」:

| Spec scenario | Implementation 階段如何驗 |
|---|---|
| 乾淨 fork 開首個 PR → 3 mandatory check 跑 | 把 003 PR 自身 push,看 GitHub Actions tab 出現 3 check |
| PR 加 `import { Pool } from 'pg'` 至 `src/worker/` → gates lint fail | 開 negative test PR(可 squash 後 close);看 gates job 之 lint 步驟 fail |
| PR 引入 dep 撐破 100 KiB bundle → wrangler-bundle-check fail | 開 negative test PR;看 wrangler-bundle-check fail with size message |
| PR commit 含 fake secret → secret-scan fail | 開 negative test PR(用 gitleaks 之 known fake pattern,不洩漏真實 secret);看 secret-scan fail |
| PR 動 src 無 spec → advisory comment | 開 trivial src-only PR,看 spec-coverage-advisory comment 出現 |
| PR 同時動 deps + src → advisory comment | 開 PR 同時 touch `package.json` + `src/`;看 toolchain-isolation-advisory comment 出現 |

證據存於 `quickstart.md` § Negative test walkthrough。

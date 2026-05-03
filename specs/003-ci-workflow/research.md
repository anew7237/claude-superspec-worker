# Research: 003-ci-workflow — 技術選擇與決策日誌

**Feature**: `003-ci-workflow`
**Phase**: 0 (Research, before Phase 1 contracts/data-model/quickstart)
**Date**: 2026-05-03
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

本檔記錄 plan.md Constitution Check 階段識別之技術選擇與「best practices」研究結論。Plan 階段所有 NEEDS CLARIFICATION 已於 spec.md §Clarifications 解決(6 個 Q/A 預先回答,無未解項);本檔聚焦 plan 階段引入之**技術 anchor 選擇**(Marketplace action 版本、cache 策略、grouping pattern、advisory comment 機制等)。

---

## §1 Dev container in CI:`devcontainers/ci@v0.3` action vs 手動 docker build

### Decision: `devcontainers/ci@v0.3`(GitHub Marketplace 官方 action)

### Rationale

對齊憲法 III「CI MUST execute on the same base image as the dev container」之 spec-strict 解讀(per spec.md Q1 Clarification),本 feature 必須以 `.devcontainer/` 內定義之 image 跑 4 gates。兩條技術路徑:

**Path A — `devcontainers/ci@v0.3` 官方 action**:

- ✅ 由 Microsoft / Dev Containers spec 維護(`https://github.com/devcontainers/ci`),GitHub Marketplace 主流選擇
- ✅ 自動讀 `.devcontainer/devcontainer.json` + `Dockerfile`,build + cache + run 全包
- ✅ 內建 GHCR(GitHub Container Registry)cache layer,後續跑直接命中 image cache
- ✅ Adopter fork 後自動跟進(若 fork 改 `.devcontainer/`,CI 自動 rebuild)
- ⚠ 額外 dependency on Marketplace action(屬 toolchain pin,per 憲法 §Toolchain pinning)
- 📦 拉新 image 之首次 build 預期 ~10 min;cached run ~1 min(per Edge Cases prediction)

**Path B — 手動 `docker build .devcontainer/` + `docker run`**:

- ⚠ 需自寫 build / cache / run 三段 step,維護成本高
- ⚠ Cache 策略需自己組(actions/cache + docker layer cache);失敗模式多
- ✅ 不依賴 Marketplace action(supply-chain 風險低 ~ε)
- ⚠ 與 dev container spec 之 `postCreateCommand` / `features` 解析不對齊(devcontainers/ci 自動處理;手動 docker run 需自行 replicate)

**選 A 之關鍵理由**:`devcontainers/ci` 是業界標準解,supply-chain 風險已由 Microsoft 維護;手動 docker run 重做已解問題,違反 SE 最小驚奇原則。Toolchain pinning 規範保證升版可單獨 revert(@v0.3 鎖 minor;升 v0.4 走 isolated commit)。

### Alternatives considered

- ❌ **`devcontainer-cli` + 手動 wrap**:屬 Path B 變體;同樣維護負擔,且 `devcontainer-cli` 為 npm tool 增加 install 步驟
- ❌ **不用 dev container,直接 `pnpm/action-setup` + Node 22**:違反 spec FR-004 + 憲法 III「same base image」契約,屬 spec-strict violation

---

## §2 Secret-scan tool 與版本:`gitleaks/gitleaks-action@v2`

### Decision: `gitleaks/gitleaks-action@v2`(Marketplace 官方 action)

### Rationale

per spec.md Q3 Clarification 已選 gitleaks(open-source、GitHub Actions 維護良好、預設規則覆蓋 OAuth tokens / API keys / `.env` 內容 / certificate 等)。版本選擇 @v2(當前 latest)。

**為何不選其他工具**:

- ❌ **truffleHog**:預設掃更廣(verified secrets 之 active validation),但 PR diff 模式有時誤判導致 noise;OSS starter 不需 enterprise-grade scanning
- ❌ **GitHub Secret Scanning(內建)**:免費版只掃 GitHub-recognized partner secrets(eg. AWS / Stripe);不掃 Anthropic OAuth / 自定義 secret pattern;且只在 push 後 detect,不在 PR diff 階段 block

**為何選 gitleaks @v2**:

- ✅ Marketplace 主流(`https://github.com/gitleaks/gitleaks-action`)
- ✅ 預設規則含 generic API key + `.env` style + private key file 等通用 pattern
- ✅ 支援 `.gitleaks.toml` 在 repo root 設 allowlist(per spec edge case)
- ✅ PR 模式自動掃 PR diff;push 模式可掃 N commits(本 feature 在 main push 設掃全 history,per spec.md US1 Acceptance #5)
- ✅ Action 版本 @v2 為當前 latest stable,無 breaking change in active maintenance

### Alternatives considered

- ❌ truffleHog v3:更深掃但更多 false positive;OSS 入門級不需要
- ❌ GitHub Advanced Security(secret scanning):enterprise paid 功能,違反 monorepo「fork-friendly free tier」承諾
- ❌ 自寫 grep-based scan:重做 gitleaks 已解,且 ad-hoc regex 易漏

### Configuration notes

- 預設掃描範圍:PR diff(PR trigger)/ 全 history(push to main trigger)
- License key:gitleaks-action v2 預設 OSS-friendly 模式可免費跑;不需 commercial license(per Action README)
- Output format:GitHub Actions annotations(直接在 PR diff line 標 finding)
- 失敗訊息:redacted secret value + 只列 file + line(per spec FR-011)

---

## §3 Cache 策略:pnpm store + node_modules 雙層 + 可選 TS incremental

### Decision: `actions/cache@v4` 雙層 cache,key 雙錨

### Rationale

`pnpm install --frozen-lockfile` 在 cold cache 下需拉 ~500 packages 含 wrangler/workerd binaries(per session memory:WSL2 host 跑 ~22s,WSL2 dev container cold ~8min),CI 需 cache 才能符合 SC-001(cache hit ≤ 5 min)。

**Cache 策略**:

```yaml
- name: Cache pnpm store
  uses: actions/cache@v4
  with:
    path: ~/.local/share/pnpm/store
    key: pnpm-store-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
    restore-keys: pnpm-store-${{ runner.os }}-

- name: Cache node_modules
  uses: actions/cache@v4
  with:
    path: node_modules
    key: node_modules-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
    restore-keys: node_modules-${{ runner.os }}-
```

雙層 cache 理由:

- pnpm store 是全域 package CAS;命中即跳過 npm registry HTTP roundtrip
- node_modules 是 project-local symlink tree;命中即跳過 pnpm install 之 link 階段
- 兩層分開的好處:lockfile 微改時 store 仍命中(只需 link 新版),整體更快

**Restore keys**:fall-back 到 `pnpm-store-${{ runner.os }}-`(無 hash suffix)即「同 OS 任 lockfile hash」之最近 cache;命中 partial 仍比 cold 快 ~3x。

**TS incremental cache(可選)**:

```yaml
- name: Cache TypeScript incremental build
  uses: actions/cache@v4
  with:
    path: |
      .tsbuildinfo
      tests/**/.tsbuildinfo
    key: tsbuildinfo-${{ runner.os }}-${{ hashFiles('tsconfig*.json', 'src/**', 'tests/**') }}
```

TS incremental 能讓 typecheck 從 ~30s 降到 ~5s,但 cache key invalidation 需含 src/tests 全 hash → cache 命中率低;**初版不啟用**,SC-001 cache hit 已能滿足 ≤ 5 min budget。若實際跑後 typecheck 為 bottleneck,follow-up PR 啟用。

### Alternatives considered

- ❌ 單層只 cache pnpm store:lockfile 改後 link 階段仍慢,影響 cache hit budget
- ❌ 完全不 cache:CI 每次跑 install 8+ min,違反 SC-001
- ❌ Docker layer cache(GHCR push):屬 Path A `devcontainers/ci@v0.3` 內建,本層 cache 是 dev container image 之 layer;與 npm-level cache 互補

---

## §4 Wrangler bundle check 機制:`wrangler deploy --dry-run` + grep + size assertion

### Decision: 用 `wrangler deploy --dry-run` 產生 bundle,然後在 shell 內 grep + `wc -c`

### Rationale

Wrangler v4(本 feature 已 land per PR #20)`deploy --dry-run` 產生 `.wrangler/dryrun/index.js` 含完整 bundle(post esbuild + minification before publish to Cloudflare)。本 feature 取此 file 直接驗:

```bash
# 1. Run dry-run
pnpm exec wrangler deploy --dry-run

# 2. Grep for forbidden Node-only modules
BUNDLE=.wrangler/dryrun/index.js
FORBIDDEN=("pg" "redis" "pino" "prom-client" "@hono/node-server" "node:fs" "node:child_process")
for mod in "${FORBIDDEN[@]}"; do
  if grep -q "$mod" "$BUNDLE"; then
    echo "❌ BUNDLE CONTAINS FORBIDDEN MODULE: $mod"
    grep -n "$mod" "$BUNDLE" | head -5
    exit 1
  fi
done

# 3. Size assertion
SIZE=$(wc -c < "$BUNDLE")
BUDGET=$((100 * 1024))  # 100 KiB
if [ "$SIZE" -gt "$BUDGET" ]; then
  echo "❌ BUNDLE SIZE $SIZE bytes exceeds budget $BUDGET bytes"
  exit 1
fi
echo "✅ bundle clean: $SIZE bytes (budget $BUDGET)"
```

**為何不用 wrangler-internal flag**:wrangler 沒提供「禁用某 dep」之內建 flag;esbuild 端可加 `external` rule,但已被 wrangler internal config 控制,不易 override。Grep 為**最小可行第二道防線**,不依賴 wrangler 內部行為。

**為何在 shell 而非 npm script**:CI job 之 step 直接寫 inline shell 較易 debug;若未來 promote 至 npm script(eg. `pnpm bundle:check`),屬 follow-up refactor。

### Alternatives considered

- ❌ AST-based parser:過度複雜;esbuild minified bundle 仍含可 grep 之 module specifier
- ❌ 用 `bundlephobia` API:外部 service 不該成為 CI 依賴
- ❌ 跑 `webpack-bundle-analyzer`:對 Cloudflare Workers bundle 不適配
- ❌ 比較 deploy 後 actual size from Cloudflare:打 production API,違反 FR-010

### Bundle size budget 起點:100 KiB

per spec.md Q2 Clarification + 當前實測 ~64 KiB(per session memory PR #17 sanity check:"bundle 64.70 KiB / gzip: 15.94 KiB")。100 KiB 留 ~50% headroom,允許 adopter 加少量 routes / utils 不撐破。Adopter 自家 feature 撐破 budget 在 isolated commit 內升 budget(per spec edge case + 憲法 §Toolchain pinning isolation 精神)。

---

## §5 Dependabot grouping pattern

### Decision: 按 ecosystem family 分組,major 各自獨立 PR

### Rationale

per spec.md FR-007 已鎖定 5 條 grouping rule:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 5
    target-branch: "main"
    commit-message:
      prefix: "chore(deps)"
      include: "scope"
    groups:
      cloudflare-ecosystem:
        patterns:
          - "@cloudflare/*"
          - "wrangler"
          - "miniflare"
        update-types: ["minor", "patch"]
      typescript-eslint:
        patterns:
          - "@typescript-eslint/*"
          - "typescript-eslint"
        update-types: ["minor", "patch"]
      vitest:
        patterns:
          - "@vitest/*"
          - "vitest"
        update-types: ["minor", "patch"]
      node-deps-minor-patch:
        patterns:
          - "*"
        exclude-patterns:
          - "@cloudflare/*"
          - "wrangler"
          - "miniflare"
          - "@typescript-eslint/*"
          - "typescript-eslint"
          - "@vitest/*"
          - "vitest"
        update-types: ["minor", "patch"]
      # major bumps: not grouped, 各自 PR (default Dependabot behavior)

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 3
    target-branch: "main"
    commit-message:
      prefix: "chore(deps)"
      include: "scope"
    groups:
      github-actions-minor-patch:
        patterns:
          - "*"
        update-types: ["minor", "patch"]
```

**理由**:

- `@cloudflare/*` 同組 — issue #15 root-cause 已驗:wrangler 與 vitest-pool-workers 之 transitive workerd 須對齊,分開升易 dedupe drift
- `@typescript-eslint/*` 同組 — eslint plugin 與 parser 須對齊
- `@vitest/*` 同組 — vitest core / runner / spy 須對齊
- 其他 minor + patch 一組 — 減少 PR 噪音
- **Major 各自獨立 PR**(Dependabot 預設不對 major 應用 grouping,自動分 PR)— 避免 breaking change 被 grouping 遮蔽
- `package-ecosystem: github-actions` 同步監控 GitHub Actions 升版(per Plan §Technology Stack「Toolchain pinning isolation」)

### Alternatives considered

- ❌ 不分組(每 dep 一 PR):每週 PR 數爆炸,maintainer noise 高
- ❌ 一組 catch-all:major 與 minor 混升,看不清 breaking change scope
- ❌ Renovate(替代 Dependabot):per spec assumption #5,不打包 Renovate;adopter customization 屬 derivative concern

---

## §6 Advisory job 之 GitHub PR comment 機制

### Decision: `actions/github-script@v7` + `gh issue comment`(via GH CLI)二擇一,初版用 `actions/github-script`

### Rationale

Advisory job 需在 PR 內 comment 提示 reviewer。兩條技術路徑:

**Path A — `actions/github-script@v7`**:

- ✅ 官方 action,內建 `octokit/rest.js` client + GitHub token 自動注入
- ✅ TypeScript-style snippet 易讀;能直接 query PR diff API + post comment
- ✅ 不需 install 額外 CLI

```yaml
- uses: actions/github-script@v7
  with:
    script: |
      const { data: files } = await github.rest.pulls.listFiles({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: context.issue.number,
      });
      const srcChanges = files.some(f => f.filename.startsWith('src/'));
      const specChanges = files.some(f => f.filename.startsWith('specs/'));
      if (srcChanges && !specChanges) {
        await github.rest.issues.createComment({
          ...
          body: '⚠ Advisory: src/ changed without matching specs/NNN-*/ ...',
        });
      }
```

**Path B — `gh issue comment` via GH CLI**:

- ⚠ 需 install gh CLI(可用 ubuntu-latest 內建)
- ⚠ Shell-only,query PR file list 需多步 jq parse
- ✅ 較不依賴 octokit 版本

**選 A 之理由**:本 feature 已用 Marketplace action 全套(actions/checkout、cache、devcontainers/ci、gitleaks),再加 actions/github-script 屬同類;snippet 可直接寫 inline,不需獨立 script file。Path B 維護成本高(JSON parse + 多步 shell)。

### Comment idempotency strategy

Advisory comment **不去重**(per spec.md US4 #4):每次 PR 觸發即重 comment。理由:

- Reviewer 看每次 push 即知狀態(無 stale comment 問題)
- `actions/github-script` 內如果要去重需 query 既有 comment + diff,複雜度上升
- PR 收尾時 reviewer 可手動 hide outdated comment

若未來 reviewer 反映 noise 過多,可用 `peter-evans/create-or-update-comment` action 加 marker(eg. `<!-- ADVISORY:spec-coverage -->`)實作 update-in-place,屬 follow-up。

### Alternatives considered

- ❌ 把 advisory 升為 mandatory(fail PR):違反 spec FR-008「不阻擋 merge」設計;reviewer 失去豁免權
- ❌ 用 GitHub Check API 而非 PR comment:check 不會 inline 顯示 reasoning,reviewer 易忽略
- ❌ 寫獨立 npm tool(eg. `pnpm spec-coverage-check`):過度工程化;CI 限定的 advisory 不需獨立 tool

---

## §7 Triggers 與 concurrency 控制

### Decision: 三條 trigger + concurrency group 自動取消舊跑

### Rationale

per spec.md FR-002,觸發條件涵蓋:

```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

**Concurrency rule 理由**:

- 同一 PR 連續 push 時,只跑最新 commit(取消 in-progress);省 GitHub Actions minutes
- 不影響 main push 與 PR 之間的隔離(group key 含 ref,PR 與 main 各自一組)
- adopter fork 後行為一致(無需額外配置)

### Alternatives considered

- ❌ 不設 concurrency:同 PR 多次 push 並行跑 4 個 instance,浪費 minutes
- ❌ 用 schedule trigger(eg. nightly):本 feature 之 mandatory check 性質為 PR-time,不需 nightly redundant 跑

---

## §8 失敗訊息設計(對齊 spec FR-011)

### Decision: 各 job 用 `set -euo pipefail` + 末段 stderr 顯式 echo

### Rationale

GitHub Actions 預設展示 step output,但長 stderr 可能淹沒關鍵訊息。本 feature 加 `tail -50` style summary at job end:

- **gates job**:vitest / tsc / eslint 自帶 colored output;CI 端設 `FORCE_COLOR=1` 保留色彩
- **wrangler-bundle-check job**:fail 時直接 `echo` grep 命中行 + bundle size 數字
- **secret-scan job**:gitleaks-action @v2 預設 redact secret value,只報 file + line(符合 FR-011)

**`set -euo pipefail`**:

- `-e` 任一 step fail 即整 step fail
- `-u` undefined var 即 fail(防 typo)
- `-o pipefail` pipe 內任一 segment fail 即整 pipe fail(否則 `tail` 會吃掉前面的 exit code)

### Alternatives considered

- ❌ 不設 `pipefail`:`pnpm test:worker | tee log` 失敗會 silent pass(tee 成功 → exit 0)
- ❌ 改用 `actions/upload-artifact` 收 log file:增加 step + 不解決「PR 頁面直接看 reasoning」需求

---

## §9 GitHub Actions runner OS pin

### Decision: `runs-on: ubuntu-latest`(GitHub-hosted)

### Rationale

per spec assumption #2 + Q6 Clarification(no macOS),adopter 用 GitHub-hosted runner 即可。`ubuntu-latest` 自動跟進 Ubuntu LTS(目前 24.04),與 dev container base image(Ubuntu 24.04)同源。

**為何不 pin 到 `ubuntu-24.04`**:

- 鎖死 minor 反而限制升級彈性;`-latest` 由 GitHub 維護升級節奏
- Adopter 若需 self-hosted runner(per assumption #2),可在 fork 端改 `runs-on: self-hosted`

**為何不額外 matrix(eg. Node 22 + Node 24)**:

- 本 feature gates job 在 dev container 內跑;Node 版本由 dev container `Dockerfile` / `devcontainer.json` 定義(Node 22),不由 host runner 控制
- Matrix 多版本屬 future feature(若 dev container 升 Node 24 / 26 時要驗 backward compat)

### Alternatives considered

- ❌ pin `ubuntu-22.04`:LTS 即將 EOL(預期 2027);無 future-proof 收益
- ❌ matrix on Node version:本 feature dev container in CI,Node 由 image 控制,matrix 無意義

---

## §10 Branch protection 設定指引(在 README + PR description)

### Decision: 不在本 feature workflow 內自動設;在 README + PR description 寫操作指引

### Rationale

per spec assumption #6 + Out-of-scope table:branch protection 屬 GitHub repo settings(非 workflow YAML),由 adopter 在 GitHub UI 手動設或用 Terraform/`gh api` 自動化。本 feature 不打包此自動化(否則需 admin token + 跨 repo 假設)。

**指引內容**(將寫入 README §「CI status」+ 本 feature PR description):

```text
本 feature merge 後請至 Settings → Branches → Add branch protection rule for `main`:
- ✅ Require a pull request before merging
- ✅ Require status checks to pass before merging
- 在 Required status checks list 加入:
    - gates
    - wrangler-bundle-check
    - secret-scan
- 不需要加:spec-coverage-advisory / toolchain-isolation-advisory(屬 advisory)
```

### Alternatives considered

- ❌ Terraform module / `gh api` script in CI:需 admin token 跨 repo 風險;OSS adopter 不一定有 admin
- ❌ Default ON via repo template:不存在此 GitHub feature
- ❌ workflow_dispatch + `gh api`:仍需 admin token,且 admin token 不會自動 forward 給 fork

---

## §11 Conditional advisory trigger(排除 doc-only PR)

### Decision: 在 advisory job 之 step 內用 `actions/github-script` 自行判斷,而非用 `paths`/`paths-ignore` filter

### Rationale

per spec FR-009,advisory job 須排除 doc-only PR(動 `specs/**`、`.docs/**`、`*.md` 而未動 `src/**` `tests/**` `package.json` `pnpm-lock.yaml`)。

**為何不用 `paths-ignore`**:

- workflow YAML 之 `paths-ignore` 是「整個 workflow trigger 之 filter」,會連 mandatory job 都不跑
- 本 feature mandatory check 須**所有 PR 都跑**(per spec FR-001),只 advisory 排除 doc-only

**改用 step-level 條件**:

```yaml
- name: Check if doc-only PR
  id: doc_check
  uses: actions/github-script@v7
  with:
    script: |
      const { data: files } = await github.rest.pulls.listFiles({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: context.issue.number,
      });
      const isDocOnly = files.every(f =>
        f.filename.startsWith('specs/') ||
        f.filename.startsWith('.docs/') ||
        f.filename.endsWith('.md')
      );
      core.setOutput('doc_only', isDocOnly);

- name: SC-003 spec coverage advisory
  if: steps.doc_check.outputs.doc_only != 'true'
  uses: actions/github-script@v7
  with:
    script: |
      // ... post comment if src/ touched but specs/ not
```

### Alternatives considered

- ❌ 用 `paths` filter at workflow level:會跳過 mandatory job
- ❌ 把 advisory 移到 separate workflow file:複雜度上升;不解決「mandatory 須跑」問題

---

## §12 GitHub Actions versions pinning policy

### Decision: 鎖 minor(`@v4` not `@v4.2.0`,but not `@v4.x`)

### Rationale

GitHub Actions Marketplace action 之 version tag 慣例:

- `@v4` = 鎖 major(內含 v4.0.0 ~ v4.99.x);Marketplace 維護者承諾 v4 內無 breaking
- `@v4.2.0` = 鎖 patch(supply-chain 最嚴);但每個 patch 升版需手動跟
- `@main` / `@master` = 不鎖(極不安全)

**選擇 `@v4` 鎖 major**:

- 平衡安全性與維護成本
- Dependabot 之 `package-ecosystem: github-actions` 自動掃 major 升版(eg. v4 → v5)並開 PR;maintainer 看 CI 跑綠即知是否 break
- 對齊 npm dep 之 `^4.0.0` 慣例(major 鎖,minor + patch 自動跟)

**例外**(若某 action 已知 minor 內有 regression):

- 鎖 `@v4.2.0`(patch);列入 `.specify/notes/`(future)或 PR description 說明

### Alternatives considered

- ❌ 鎖 SHA(`@a1b2c3d4`):supply-chain 最嚴但每次升版手動;不適合 OSS starter scale
- ❌ `@latest`:無此 GitHub-recognized tag;且無語義保證
- ❌ 不鎖:`@main` 風險高(maintainer 推 breaking 即 break adopter)

---

## §13 工具鏈版本 anchor 一覽(本 feature 引入)

| Tool / Action | Pin | Source |
|---|---|---|
| `actions/checkout` | `@v4` | GitHub official |
| `pnpm/action-setup` | `@v4` | pnpm official |
| `actions/cache` | `@v4` | GitHub official |
| `actions/github-script` | `@v7` | GitHub official |
| `devcontainers/ci` | `@v0.3` | Microsoft / Dev Containers spec |
| `gitleaks/gitleaks-action` | `@v2` | gitleaks official |

**升版規則**:per 憲法 §Toolchain pinning + spec FR-019,任一上表 action 升 major(eg. `@v4` → `@v5`)走 isolated commit;Dependabot 自動開 PR,CI 跑綠即可 merge。

---

## §14 與既有 baseline 之 anchor 對齊

本 feature 之每條 FR / SC 對應 baseline anchor:

| 003 FR / SC | 對應 anchor |
|---|---|
| FR-001 / FR-002 / FR-003 | 001 baseline FR-017 + quality-gates.md §「CI 對應(known gap)」 |
| FR-004 | 001 憲法 III「same base image」+ research.md Critical Follow-up #1 |
| FR-005 | 002 spec assumption #6(toolchain pin)+ session memory「workerd cold install ~8 min」 |
| FR-006 / FR-007 | 001 FR-019(toolchain isolated commit)+ 002 spec dependencies cite |
| FR-008(advisory)| 001 SC-003 + FR-019 之機械化前哨 |
| FR-009 | 001 quality-gates.md「人工豁免規則」 |
| FR-010 | 001 sensitive-material.md §「DevContainer mount 規範」 |
| FR-011 | 001 observability.md §1.4(failure 訊息設計精神) |
| FR-012 | 002 README §「Dual-Runtime」+ 既有 README structure |
| FR-013 | reviewer audit I-1 PARTIAL + .docs/baseline-traceability-matrix.md FR-017/SC-005/SC-006/SC-008 row |
| SC-001~011 | 對應 spec.md §「Spec impact」表;driver SC 為 baseline 規則之機械化升級 |

---

## 結論與下一步

Phase 0 research 完成,所有技術選擇 anchor 已記錄。**0 NEEDS CLARIFICATION 殘留**。

下一步 Phase 1:
- `data-model.md`:本 feature scope 屬 light(無 application data model);記錄 CI workflow 之 entity 結構 + 與 spec.md §Key Entities 對齊
- `contracts/ci-gates.md`:3 mandatory + 2 advisory job 之契約(input / output / failure mode / observable behavior)
- `contracts/dependabot-policy.md`:grouping rule + schedule + commit convention 之契約
- `quickstart.md`:adopter 看 CI build / 重跑 / cancel + branch protection 設定 walkthrough
- 更新 `CLAUDE.md` SPECKIT 區塊指向本 plan

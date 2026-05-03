# Quickstart: 003-ci-workflow — Adopter walkthrough

**Feature**: `003-ci-workflow`
**Phase**: 1 (Design output)
**Date**: 2026-05-03
**Audience**: Adopter who fork 此 monorepo,要 enable CI workflow + Dependabot;maintainer 要 trigger / cancel / re-run CI runs;reviewer 要看 CI build progress / read failure logs。

---

## §1 Adopter:fork 後 30 秒啟用 CI

### Step 1 — Fork & clone(若還沒)

```bash
gh repo fork anew7237/claude-superspec-worker --clone --remote
cd claude-superspec-worker
```

或在 GitHub UI 點 Fork。

### Step 2 — 確認 CI 自動啟用(無需配置)

Fork 完成後 **GitHub Actions 自動偵測 `.github/workflows/ci.yml`**。在 GitHub repo 頁面點 `Actions` tab,應看到 workflow `CI`(若無 push,顯示「No runs yet」)。

**不需**:
- ❌ 不需在 GitHub UI 額外 enable workflow
- ❌ 不需編輯 `.github/workflows/ci.yml`
- ❌ 不需設置 GitHub Actions secrets(本 workflow 無 secret 依賴)

### Step 3 — 推第一個 commit 觸發 CI

```bash
echo "" >> README.md
git add README.md
git commit -m "trivial: trigger CI for fork verification"
git push
```

回 GitHub `Actions` tab,應看到一個 workflow run 啟動;5-15 分鐘內(per SC-001)出綠/紅結果。

### Step 4 — 設 branch protection(必設,1 分鐘)

CI workflow 跑出來後,Required status checks 才可被加入 branch protection 清單。至 `Settings → Branches → Add branch protection rule`:

1. **Branch name pattern**: `main`
2. ✅ **Require a pull request before merging**(基本 merge gate)
3. ✅ **Require status checks to pass before merging**
4. 在 `Required status checks` 搜尋並加入 **3 個 mandatory checks**:
   - ✅ `gates`
   - ✅ `wrangler-bundle-check`
   - ✅ `secret-scan`
5. ❌ **不要加** advisory checks(`spec-coverage-advisory`、`toolchain-isolation-advisory`)— 它們是提示,加進來會誤擋 PR
6. (可選)✅ **Require branches to be up to date before merging**(避免 stale main merge)
7. Save

完成後任何 PR 須 3 mandatory check 全綠才可 merge。

### Step 5 — 確認 Dependabot 已啟用

至 GitHub repo `Settings → Code security and analysis`,應看到:
- **Dependabot security updates**: Enabled(自動,GitHub-managed)
- **Dependabot version updates**: 偵測到 `.github/dependabot.yml` 後自動 enable

若未自動 enable,點「Enable」啟用 Dependabot version updates。

下週一(GitHub UTC)即會看到 Dependabot 開 PR(若有 dep 可升)。

---

## §2 Maintainer:CI 操作日常

### 2.1 看 CI build 進度

| 操作 | 怎麼做 |
|---|---|
| 看正在跑之 build | GitHub repo → Actions tab → 點 workflow run |
| 看具體 job 之 step log | 進 workflow run 後點對應 job → 展開 step |
| 訂閱失敗通知 | GitHub Settings → Notifications → Actions → On for `Only failed workflows` |

### 2.2 重跑(re-run)

| 場景 | 操作 |
|---|---|
| 整 workflow 重跑(全 5 job) | workflow run 頁面右上 `Re-run all jobs` |
| 只重跑失敗的 job | workflow run 頁面右上 `Re-run failed jobs` |
| 手動觸發(workflow_dispatch) | Actions tab → CI workflow → `Run workflow` 按鈕 → 選 branch |

### 2.3 取消(cancel)

| 場景 | 操作 |
|---|---|
| 取消正在跑之 run | workflow run 頁面右上 `Cancel workflow` |
| 自動取消舊 run | 已內建(per concurrency rule);同 PR 後續 push 會自動取消 in-progress |

### 2.4 download log / artifact

| 操作 | 怎麼做 |
|---|---|
| Download 整 job log | workflow run 頁面右上 `⋮` → `Download log archive` |
| Download artifact(若 job 上傳)| 在 workflow run 頁面底部「Artifacts」段點下載 |

---

## §3 Reviewer:看 PR 之 CI 狀態

### 3.1 PR 頁面之 status check 區塊

每個 PR 底部有「Some checks haven't completed yet」/「All checks have passed」/「Some checks were not successful」之狀態區。展開可看 5 個 check:

| Check name | 性質 | 失敗即阻擋 merge? |
|---|---|---|
| `gates` | mandatory | ✅ Yes(branch protection 已設)|
| `wrangler-bundle-check` | mandatory | ✅ Yes |
| `secret-scan` | mandatory | ✅ Yes |
| `spec-coverage-advisory` | advisory | ❌ No(只 comment 提示) |
| `toolchain-isolation-advisory` | advisory | ❌ No |

### 3.2 看失敗訊息

點 `Details` 進入 GitHub Actions log:

| Job fail | 直接看哪段 log |
|---|---|
| `gates` typecheck error | step「inside container: pnpm typecheck」之 stderr 末段(file:line) |
| `gates` lint error | step 同上之 ESLint output(含 no-restricted-imports 違規) |
| `gates` test fail | step「pnpm test:node」/「pnpm test:worker」之 vitest output(失敗 test 名 + assertion diff) |
| `wrangler-bundle-check` 違規 | step「assert bundle clean」之 stderr;含「BUNDLE CONTAINS FORBIDDEN MODULE: <name>」+ grep 命中行 / 「BUNDLE SIZE N bytes」 |
| `secret-scan` finding | gitleaks-action 在 PR diff line 直接 inline annotation;額外 log 有 redacted finding 列表 |

### 3.3 看 advisory comment

Advisory 觸發即在 PR 內出現 bot comment(non-mandatory):

- **Spec coverage advisory**:當 PR 動 src/ 但無 spec/
- **Toolchain isolation advisory**:當 PR 同時動 deps + src

Reviewer 在 comment 下回 reply 表態(豁免 / 駁回 / 補 spec / 拆 PR)。Advisory 不會因此停掉,後續 push 仍會重 comment(per `contracts/ci-gates.md` §5.1 idempotency strategy)。

---

## §4 常見場景操作

### 4.1 我的 PR 跑 secret-scan fail,但其實是 false positive

```bash
# Step 1: 確認真不是 secret(看 finding 之 file + line)
# 若是合法字串(eg. test fixture 之 fake token),加 .gitleaks.toml allowlist
cat > .gitleaks.toml <<'EOF'
[allowlist]
description = "False positives reviewed in PR #N"
paths = [
  '''tests/fixtures/.*\.json''',
]
regexes = [
  '''sk_test_[a-zA-Z0-9]+''',
]
EOF

git add .gitleaks.toml
git commit -m "chore: add .gitleaks.toml allowlist for fixture fake tokens"
```

CI 會用新 allowlist 重跑 secret-scan;通過即可 merge。但每次加 entry 須在 PR description 說明確實非 secret(per spec edge case)。

### 4.2 我的 PR 跑 wrangler-bundle-check fail,bundle 撐破 100 KiB

兩條路:

#### Path A — 縮 bundle(優先)

```bash
# 查 bundle 內最大的 dep
pnpm exec wrangler deploy --dry-run
ls -lh .wrangler/dryrun/index.js
# 用 esbuild visualizer 之類工具找肥點
```

通常踩雷:
- 誤 import 大 lib(如 lodash whole module 而非 `lodash/fp/get`)
- 誤含 polyfill / shim

#### Path B — 升 budget(若確實需要)

修 `.github/workflows/ci.yml` 內 wrangler-bundle-check job 之 `BUDGET=$((100 * 1024))` → eg. `$((150 * 1024))`,並在 PR description 說明:

```text
本 PR 升 Worker bundle budget 100 KiB → 150 KiB:
- 原因:新增 hono/middleware/jwt(+ 28 KiB)用於 /api/auth route
- 已驗證:無多餘 dep;esbuild minified gzip 仍在 50 KiB 內
- 對 SC-005 影響:headroom 從 ~50% 降至 ~33%,仍夠 future feature 使用
```

走 isolated commit(per spec assumption #8 + 憲法 §Toolchain pinning isolation 精神)— 升 budget 不夾帶其他 src 變更。

### 4.3 Dependabot 開了個 major bump PR,CI fail

```bash
# 1. checkout PR 至本機
gh pr checkout <PR-number>

# 2. 進 dev container 跑 4 gate 看失敗 root cause
# (VS Code Reopen in Container)
pnpm install --frozen-lockfile
pnpm typecheck  # 若 tsc 報新版 dep 之 type 變更
pnpm test:worker  # 若 runtime API 變化

# 3. 兩條路:
#    (a) 同 PR 修 break:加 commit 修 src/ 配合新版 → push → CI 重跑
#    (b) close PR + open issue 追蹤:評估後決定何時升

# Path (a):
# 修 src/ 直到 4 gate 綠
git add src/
git commit -m "chore: adapt to <dep> v5 breaking changes"
git push
```

> ⚠️ Path (a) 會觸發 toolchain-isolation-advisory(因為同 PR 動 deps + src)。reviewer 看 advisory comment 留 reply 說明「dep upgrade 必然 require src adaptation」即接受。

### 4.4 我想跳過 CI 跑(eg. 純 markdown typo 修)

**不行**,且不該。CI 為 mandatory gate(per spec FR-001~003)。但 advisory 不會 noise:

- 純 doc-only PR(只動 `*.md` / `specs/**` / `.docs/**`)→ advisory job 自動 skip(per FR-009),只 mandatory 跑
- mandatory 仍跑,但因為沒動 src/,gates 之 4 個 step 跑得很快(typecheck / lint / test 快結束;cache hit 路徑 < 5 min)

### 4.5 我想知道 CI 跑得多快 / 多慢

GitHub repo → Actions tab → 對應 workflow run → 看右上 wall time。

Cache 健康度:
- `gates` job:cache hit 預期 ≤ 5 min;cache miss 預期 ≤ 15 min
- `wrangler-bundle-check`:cache hit ≤ 3 min(install + dry-run + grep)
- `secret-scan`:PR mode ≤ 30 sec;push to main full history scan ≤ 1 min

若顯著超出:
- 看是不是 cache miss(workflow run 頁面 step 內有「Cache miss」/「Cache hit」字樣)
- 看是不是 GitHub Actions 排隊(`ubuntu-latest` runner 高峰時可能要等 ~1 min 才開始跑)

---

## §5 Negative test walkthrough(`/speckit-implement` 階段驗證 spec.md 之 acceptance scenarios)

> 此段為 implementation phase 之 acceptance verification 紀錄;maintainer 在 implement 階段照此跑一遍,確認 6 個 spec scenario 皆驗證。

### 5.1 Scenario 1:乾淨 fork 開首個 PR

**操作**:本 003-ci-workflow PR 自身即驗證此 scenario。
**預期**:本 PR push 後 GitHub Actions 跑 5 job;mandatory 3 個全綠(本 feature 不引入 src 變更,只加 .github/);advisory 不觸發(本 PR 主要動 specs/ + .github/,屬 doc + config 而非 src)。
**證據**:此 PR 之 GitHub Actions 跑紀錄(merge 後留作 baseline)。

### 5.2 Scenario 2:`import { Pool } from 'pg'` 至 `src/worker/`

**操作**:在本 PR base 上開 negative test branch:

```bash
git checkout -b negative-test/scenario-2-cross-runtime-import 003-ci-workflow
echo "import { Pool } from 'pg';" >> src/worker/index.ts
git commit -am "negative test: add pg import to worker (should fail lint)"
git push -u origin negative-test/scenario-2-cross-runtime-import
gh pr create --title "[negative test] cross-runtime import → expect gates fail" --base 003-ci-workflow
```

**預期**:CI gates job 之 lint step fail,訊息含 `'pg' import is restricted`;mandatory check `gates` 紅叉。
**證據**:negative test PR 之 GitHub Actions log(截圖或 link 入 implement 階段之 evidence file)。
**清理**:close PR 不 merge。

### 5.3 Scenario 3:撐破 100 KiB bundle

**操作**:加重 dep:

```bash
git checkout -b negative-test/scenario-3-bundle-bloat 003-ci-workflow
# 加大 dep 至 src/worker/(eg. dynamic import 大模組)
# 範例:加 import "@cloudflare/workers-types/experimental"(若有)或加重複 logic
pnpm add lodash  # ~70 KiB,加上 worker 既有 ~64 KiB 可能撐破
echo 'import _ from "lodash"; _.noop();' >> src/worker/index.ts
git commit -am "negative test: bloat bundle to exceed 100 KiB"
git push -u origin negative-test/scenario-3-bundle-bloat
gh pr create --title "[negative test] bundle > 100 KiB → expect bundle-check fail" --base 003-ci-workflow
```

**預期**:CI wrangler-bundle-check job fail,訊息含 `BUNDLE SIZE N bytes (M KiB) exceeds budget 102400 bytes (100 KiB)`。
**證據**:同上。
**清理**:close PR + revert pnpm add。

### 5.4 Scenario 4:fake secret in commit

**操作**:加 known fake secret(用 gitleaks 自身範例 pattern,不洩漏真實 secret):

```bash
git checkout -b negative-test/scenario-4-fake-secret 003-ci-workflow
# 用 gitleaks 自身 testdata 內 known-fake fixture pattern (per
# https://github.com/gitleaks/gitleaks/tree/master/testdata)。
# Implementation 階段選一可被 gitleaks 預設規則 catch、但確認屬 documentation/test
# fixture 之示範字串(避免 GitHub Push Protection 也擋)。
# 例如 fake AWS access key pattern AKIAIOSFODNN7<placeholder> 等;
# 具體字串於 negative-test PR 內 inline,不寫進 spec doc。
# echo 'const FAKE_SECRET = "<gitleaks-fixture-pattern>";' >> src/node/temp.ts
git add src/node/temp.ts
git commit -m "negative test: add fake stripe key (should fail secret-scan)"
git push -u origin negative-test/scenario-4-fake-secret
gh pr create --title "[negative test] fake secret in commit → expect secret-scan fail" --base 003-ci-workflow
```

**預期**:CI secret-scan job fail,在 PR diff 之 src/node/temp.ts 行出現 gitleaks bot annotation(redacted)。
**證據**:同上。
**清理**:close PR。

### 5.5 Scenario 5:src 動但無 spec(advisory)

**操作**:小 src 變更不開 spec:

```bash
git checkout -b negative-test/scenario-5-src-no-spec 003-ci-workflow
# 動 src/node/app.ts 加 trivial change
echo "// trivial change" >> src/node/app.ts
git commit -am "negative test: src change without spec (should trigger advisory)"
git push -u origin negative-test/scenario-5-src-no-spec
gh pr create --title "[negative test] src without spec → expect advisory comment" --base 003-ci-workflow
```

**預期**:`spec-coverage-advisory` job 在 PR 內 comment 提示;mandatory 仍跑綠(unless 其他原因 fail);PR 可 merge(advisory 不阻擋)。
**證據**:同上。
**清理**:close PR。

### 5.6 Scenario 6:同時動 deps + src(advisory)

**操作**:模擬 dep bump 夾帶 src 變更:

```bash
git checkout -b negative-test/scenario-6-deps-and-src 003-ci-workflow
# 動 package.json + src/
pnpm add @types/node@latest  # 動 package.json + pnpm-lock.yaml
echo "// trivial change" >> src/node/app.ts  # 動 src/
git add package.json pnpm-lock.yaml src/node/app.ts
git commit -m "negative test: deps + src in same PR (should trigger advisory)"
git push -u origin negative-test/scenario-6-deps-and-src
gh pr create --title "[negative test] deps + src → expect advisory comment" --base 003-ci-workflow
```

**預期**:`toolchain-isolation-advisory` job comment 提示;mandatory 仍跑;PR 可 merge。
**證據**:同上。
**清理**:close PR。

---

## §6 故障排除

| 症狀 | 可能原因 | 解法 |
|---|---|---|
| Fork 後推 commit 但 Actions tab 無 run | GitHub Actions 在 fork 端預設 disabled(私有 fork)| Settings → Actions → General → 啟用 |
| `gates` job 跑得超慢(> 15 min) | Cache miss + dev container cold build | 第二次跑應快(image cache 入 GHCR);若一直 cache miss,看 `pnpm-lock.yaml` 是否頻繁變動 |
| `secret-scan` 在 push to main 跑超慢(> 5 min) | git history 太大(> 10k commits)| 評估改用 PR-only mode 或 partial history(per spec edge case) |
| `wrangler-bundle-check` 跑 dry-run 失敗 | wrangler.jsonc 配置錯 / Worker code typecheck error | 先在本機跑 `pnpm exec wrangler deploy --dry-run` 確認本機可 build |
| Dependabot 不開 PR | 本週無可升的 dep / open PR limit 已滿 / Dependabot service outage | 看 Insights → Dependency graph → Dependabot tab 之 alert 訊息 |
| Advisory comment 出現太多次 | 每次 push 都重 comment(per design,per research §6) | 接受此設計;若噪音真大,follow-up 改用 marker idempotent comment |

---

## §7 升級 / 維運

### 7.1 升級 GitHub Actions 版本

由 Dependabot `github-actions` ecosystem entry 自動掃週(per `contracts/dependabot-policy.md` §3)。Maintainer 看 PR 跑綠即 merge。

### 7.2 升級 dev container image

不在本 feature 範圍。修 `.devcontainer/Dockerfile` / `devcontainer.json` 即生效;CI 自動跟進(因為用 `devcontainers/ci@v0.3` 動態 build);對齊 plan §Constitution Check III。

### 7.3 升級 bundle budget

per §4.2 Path B,走 isolated commit + reviewer 認可。

### 7.4 加 / 改 Dependabot grouping rule

走 isolated commit(per `contracts/dependabot-policy.md` §5 不變量);PR description 說明為何加 / 改 group。

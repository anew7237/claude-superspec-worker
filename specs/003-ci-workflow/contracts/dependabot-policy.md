# Contract: Dependabot Policy

**Feature**: `003-ci-workflow`
**File anchor**: `.github/dependabot.yml`
**Spec FR anchor**: FR-006, FR-007
**Date**: 2026-05-03

本契約定義 `.github/dependabot.yml` 之 schedule + grouping rules + commit convention + target branch 之契約;以契約形式鎖定行為,使 Phase 2 tasks 與 Phase 3 implement 之 acceptance test 可逐項驗。

---

## §1 共通契約

### 1.1 Configuration version

`version: 2`(Dependabot v2 schema;v1 已 deprecate,本 feature 不支援)

### 1.2 Ecosystem 涵蓋

兩條 `updates` entry:

| Ecosystem | Directory | Purpose |
|---|---|---|
| `npm` | `/`(repo root,monorepo 單一 `package.json`)| 掃 `dependencies` + `devDependencies` 之升版 |
| `github-actions` | `/`(repo root,GitHub 約定路徑)| 掃 `.github/workflows/*.yml` 內之 action 版本(per research §12 + plan §Technology Stack) |

不涵蓋之 ecosystem(adopter 自行加,屬 customization):
- `docker`(本 monorepo 之 Docker base image 升版屬 dev container 維護,不在 Dependabot 自動掃範圍;可由 maintainer 手動或 follow-up feature 加)
- `pip` / `bundler` / 其他語言 ecosystem(本 monorepo 不引入)

---

## §2 npm entry 契約

### 2.1 結構

```yaml
- package-ecosystem: "npm"
  directory: "/"
  schedule:
    interval: "weekly"
    day: "monday"
    # time: "09:00"  # 預設 GitHub-managed timezone (UTC),不額外鎖
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
```

### 2.2 不變量

1. **Schedule**:每週一(Monday)觸發;頻率 `weekly`(per spec FR-006)。**不改頻率為 daily**(會增加 PR noise)
2. **Target branch**:`main`(per spec FR-006);Dependabot 開 PR target 即 main,自動觸發本 feature CI
3. **Open PR limit**:`5`(per spec FR-007);超出即 Dependabot 暫停開新 PR 直到 maintainer merge / close 既有 PR
4. **Commit message convention**:`chore(deps): bump xxx`(per 001 FR-019;`prefix: "chore(deps)"` + `include: "scope"` 自動產出此格式)
5. **Grouping rules**:4 條 minor+patch group(cloudflare-ecosystem / typescript-eslint / vitest / node-deps-minor-patch);**major 不 group**(Dependabot 預設行為,各自獨立 PR)

### 2.3 Grouping rules 詳細(per research §5)

| Group name | Patterns | Why |
|---|---|---|
| `cloudflare-ecosystem` | `@cloudflare/*`, `wrangler`, `miniflare` | issue #15 root-cause:transitive workerd / wrangler 版本 dedupe drift;同組升保證對齊 |
| `typescript-eslint` | `@typescript-eslint/*`, `typescript-eslint` | parser + plugins + rules 須同版本 |
| `vitest` | `@vitest/*`, `vitest` | core + runner + spy 須同版本 |
| `node-deps-minor-patch` | `*` exclude 上面三組 | 其他 minor + patch 一組,降低 PR noise |
| (no group) | major bumps | 各自獨立 PR;避免 breaking change 被遮蔽 |

### 2.4 Failure mode

| Trigger | Visible behavior |
|---|---|
| 某 dep 有 minor 升版 | Dependabot 在週一掃時加入該 dep 對應 group 的 PR;若該 group 無其他升版,單 dep 一 PR |
| 某 dep 有 major 升版 | Dependabot 開 separate PR(不入 group);CI 跑後 maintainer 看 break 程度 |
| 某 dep 有 security advisory | Dependabot 立即開 PR(不等週一);本 contract 不阻擋 security 升版 |
| Open PR 超過 5 | Dependabot 暫停開新 PR;maintainer 須 merge / close 部分 PR 才繼續 |
| Dep 從 npm 被 unpublish / 取消 | Dependabot PR 開不出,記錄在 GitHub repo 之 Dependabot insights tab |

### 2.5 Observable behavior(maintainer 視角)

- **Weekly Monday morning(GitHub UTC)**:Dependabot tab 出現新 PR(若有可升)
- **PR title 範例**:
  - `chore(deps): bump @cloudflare/vitest-pool-workers from 0.15.2 to 0.15.3`(單 dep)
  - `chore(deps): bump cloudflare-ecosystem group with 2 updates`(多 dep 同組)
- **PR 自動觸發 CI**(本 feature workflow);CI 跑綠 maintainer 即可 merge

---

## §3 github-actions entry 契約

### 3.1 結構

```yaml
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

### 3.2 不變量

1. **Schedule**:同 §2.2 #1
2. **Target branch**:`main`
3. **Open PR limit**:`3`(github-actions 升版頻率比 npm 低,limit 設小)
4. **Commit convention**:`chore(deps): bump xxx`(同 §2.2 #4)
5. **Grouping**:1 條 group 涵蓋所有 github-actions minor+patch;major 各自獨立 PR

### 3.3 涵蓋之 GitHub Actions(per plan §Technology Stack):

| Action | 當前 pin | 升版掃描 |
|---|---|---|
| `actions/checkout` | `@v4` | 監控 v5 / patch |
| `pnpm/action-setup` | `@v4` | 監控 v5 / patch |
| `actions/cache` | `@v4` | 監控 v5 / patch |
| `actions/github-script` | `@v7` | 監控 v8 / patch |
| `devcontainers/ci` | `@v0.3` | 監控 v0.4 / v1 / patch |
| `gitleaks/gitleaks-action` | `@v2` | 監控 v3 / patch |

### 3.4 Failure mode

| Trigger | Visible behavior |
|---|---|
| 某 action 有 minor 升版 | Dependabot 加入 `github-actions-minor-patch` group 之 PR(每週掃) |
| 某 action 有 major 升版 | Dependabot 開 separate PR;CI 跑後 maintainer 看 break 程度 |

### 3.5 Observable behavior

- 同 §2.5,但 PR 動 `.github/workflows/*.yml` 而非 `package.json`
- CI workflow 自身被 PR 動到時,**用 PR 之新版 ci.yml 跑**(per Edge Case + spec SC-009)— self-test 通過即可 merge

---

## §4 與其他 contracts 之關係

### 4.1 與 `ci-gates.md` 之關係

- Dependabot 開之 PR 自動觸發本 feature 之 CI workflow(per §1.1 trigger `pull_request`)
- 5 個 job 全跑(包含 advisory)
- **預期**:大多數 patch / minor bump → CI 跑綠 → maintainer 一鍵 merge
- **預期**:major bump → CI 可能 fail(breaking change)→ maintainer 手動 root-cause

### 4.2 與既有 PR 慣例之關係

- 本 contract 之 commit message convention `chore(deps): bump xxx` 對齊既有(per session memory PR #17 / PR #20 等已用此格式)
- 本 contract 不引入新 PR title rule;Dependabot 預設 title 即 `chore(deps): ...`

### 4.3 與 Constitution 之關係

- 對齊憲法 §Toolchain pinning「The same isolation rule applies to upgrading wrangler, vitest, and other CORE toolchain items」 — Dependabot 自動 isolate 升版至 separate PR
- 對齊 plan §Constitution Check III(toolchain bump 走 isolated commit)

---

## §5 不變量(must hold)

1. **2 ecosystems**(npm + github-actions);不增刪 ecosystems(per §1.2 + spec FR-006)
2. **每週一掃**;不改頻率(per §2.2 #1 + §3.2 #1)
3. **Target branch = main**;不改(per §2.2 #2 + §3.2 #2)
4. **Commit convention = `chore(deps): bump xxx`**;不改(per 001 FR-019 + 既有慣例)
5. **Open PR limit**:npm 5 / github-actions 3;升降走 isolated commit + reviewer 認可
6. **npm 之 4 grouping rules + github-actions 之 1 grouping rule** 為當前 anchor;升降走 isolated commit
7. **Major bump 不 group**(Dependabot 預設行為);本 contract 不 override 為「major 也 group」
8. **Security advisory 之 PR 不受 schedule 限制**(Dependabot 立即開);本 contract 不阻擋(per §2.4)

---

## §6 失敗模式表(summary)

| 場景 | 預期 Dependabot 行為 | maintainer 行動 |
|---|---|---|
| `@cloudflare/vitest-pool-workers` 0.15.2 → 0.15.3(patch) | 加入 cloudflare-ecosystem group PR | CI 跑綠即 merge |
| `wrangler` 4.87.0 → 5.0.0(major) | 開 separate PR,標 [`major`] label | CI 看 break;若 break 小可同 PR 修;若大 close PR 暫不升 |
| 多 dep 同週可升(eg. wrangler + workers-types + vitest-pool-workers 同有 patch) | 加入 cloudflare-ecosystem group 一 PR(對齊 transitive) | CI 跑綠即 merge,issue #15 之 dedupe drift 不會復現 |
| ESLint 9 → 10(major) | 開 separate PR | 看 break;ESLint major 通常需 config migration |
| `gitleaks/gitleaks-action` v2 → v3(major) | 開 separate PR | CI 跑綠即 merge(secret-scan job 仍能跑代表向後相容) |

---

## §7 驗證(per Phase 3 `/speckit-implement` 之 acceptance test)

對應 spec.md §「必須涵蓋的 acceptance scenarios」第 2~4 條:

| Spec scenario | Implementation 階段如何驗 |
|---|---|
| Dependabot 配置就位,週一觸發 | merge 003 PR 後等下週一(2026-05-04 為週一)觀察 GitHub PR tab 是否出現 Dependabot PR(若 deps 都 latest 可能無;此驗證在「Dependabot 已啟用」的層次,而非「PR 必開」) |
| Dependabot PR 觸發 CI | 任一 Dependabot PR 開後看 Actions tab 跑 5 job |
| Cloudflare ecosystem 同組升版 | 等 cloudflare-ecosystem 群組內任 ≥ 2 dep 同週可升時觀察(opportunistic;若一年內未發生屬正常) |
| Commit message convention | merge 一個 Dependabot PR 後 `git log -1 --format='%s'` 應為 `chore(deps): bump xxx` |

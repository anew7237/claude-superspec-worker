# Data Model: 003-ci-workflow

**Feature**: `003-ci-workflow`
**Phase**: 1 (Design)
**Date**: 2026-05-03
**Status**: Light scope — CI workflow 為 declarative configuration,無 application data model;本檔記錄 spec.md §Key Entities 之結構性 entity 與其關係。

> 本 feature 屬 CI/CD configuration-only(per plan.md §Project Type),不引入新 application entity / state machine / 持久化資料。本檔聚焦於「configuration entity 之結構與關係」,以便 Phase 2 tasks 能依 entity 拆分檔案落地。

---

## §1 Configuration Entities

### 1.1 CI Workflow

**檔案**: `.github/workflows/ci.yml`

**結構**:

| 欄位 | 型別 | 內容 |
|---|---|---|
| `name` | string | `CI`(或 `Quality Gates`,於 plan 階段不鎖,implement 階段決定) |
| `on` | object | trigger:`pull_request` to main + `push` to main + `workflow_dispatch` |
| `concurrency` | object | group + cancel-in-progress(per research §7) |
| `jobs` | object | 5 個 job(3 mandatory + 2 advisory) |

**Job 列表**:

| Job ID | 性質 | 在 branch protection 內? | failure 阻擋 merge? |
|---|---|---|---|
| `gates` | mandatory | ✅ | ✅ |
| `wrangler-bundle-check` | mandatory | ✅ | ✅ |
| `secret-scan` | mandatory | ✅ | ✅ |
| `spec-coverage-advisory` | advisory | ❌ | ❌(僅 PR comment) |
| `toolchain-isolation-advisory` | advisory | ❌ | ❌(僅 PR comment) |

**關係**:

- 所有 job 皆 `runs-on: ubuntu-latest`
- `gates` + `wrangler-bundle-check` 均**於 dev container 內執行**(per FR-004;研究 §1 選 `devcontainers/ci@v0.3`)
- `secret-scan` 不需 dev container(gitleaks 為 standalone Action;research §2)
- 兩條 advisory job 在 host 跑(GitHub-script;research §6)
- 各 job 平行執行(無 `needs:` chain),除非 reviewer 後續發現需序列化(eg. share `pnpm install` artifact 跨 job)— 本 plan 假設平行,initial implementation 即驗證

### 1.2 Dependabot Configuration

**檔案**: `.github/dependabot.yml`

**結構**:

| 欄位 | 型別 | 內容 |
|---|---|---|
| `version` | int | `2`(Dependabot v2 schema) |
| `updates` | array of object | 兩條 entry:`npm` + `github-actions` |

**npm entry**(per research §5):

| 欄位 | 值 |
|---|---|
| `package-ecosystem` | `npm` |
| `directory` | `/` |
| `schedule.interval` | `weekly` |
| `schedule.day` | `monday` |
| `open-pull-requests-limit` | `5` |
| `target-branch` | `main` |
| `commit-message.prefix` | `chore(deps)` |
| `commit-message.include` | `scope` |
| `groups` | 4 條(per research §5):cloudflare-ecosystem / typescript-eslint / vitest / node-deps-minor-patch |

**github-actions entry**:

| 欄位 | 值 |
|---|---|
| `package-ecosystem` | `github-actions` |
| `directory` | `/` |
| `schedule.interval` | `weekly` |
| `schedule.day` | `monday` |
| `open-pull-requests-limit` | `3` |
| `target-branch` | `main` |
| `commit-message.prefix` | `chore(deps)` |
| `commit-message.include` | `scope` |
| `groups` | 1 條:github-actions-minor-patch |

### 1.3 Optional gitleaks allowlist

**檔案**: `.gitleaks.toml`(repo root,**初版不建立**;僅當 false positive 出現時於 isolated PR 內加)

**結構**(when needed):

```toml
[allowlist]
description = "False positives reviewed in PR #N"
paths = [
  '''path/to/file\.md''',
]
regexes = [
  '''specific-pattern''',
]
```

每次加 entry 須 PR review 驗證確實非 secret(per spec edge case)。

### 1.4 README §「CI status」

**檔案**: `README.md`(append section)

**結構**:

| 子段 | 內容 |
|---|---|
| Badge URL | GitHub Actions badge:`https://github.com/<org>/<repo>/actions/workflows/ci.yml/badge.svg` |
| 行為簡述 | 3 mandatory(gates / wrangler-bundle-check / secret-scan)+ 2 advisory + Dependabot 摘要 |
| Branch protection 指引 | per research §10 之操作步驟 |
| Quickstart 連結 | `specs/003-ci-workflow/quickstart.md` |

---

## §2 Job 之 Step 拓樸(Phase 2 tasks 拆分依據)

### 2.1 `gates` job(mandatory)

```text
gates job
├── checkout (actions/checkout@v4)
├── setup pnpm cache (actions/cache@v4, key=pnpm-store-...)
├── setup node_modules cache (actions/cache@v4, key=node_modules-...)
├── run dev container + 4 gates (devcontainers/ci@v0.3)
│   └── inside container:
│       ├── pnpm install --frozen-lockfile
│       ├── pnpm typecheck
│       ├── pnpm lint
│       ├── pnpm test:node
│       └── pnpm test:worker
└── upload logs on failure (optional, actions/upload-artifact@v4)
```

### 2.2 `wrangler-bundle-check` job(mandatory)

```text
wrangler-bundle-check job
├── checkout (actions/checkout@v4)
├── setup pnpm cache (shared key with gates job)
├── setup node_modules cache (shared key with gates job)
├── run dev container (devcontainers/ci@v0.3)
│   └── inside container:
│       ├── pnpm install --frozen-lockfile
│       ├── pnpm exec wrangler deploy --dry-run
│       ├── grep bundle for forbidden modules (per research §4)
│       └── assert bundle size ≤ 100 KiB
```

### 2.3 `secret-scan` job(mandatory)

```text
secret-scan job
├── checkout (actions/checkout@v4 with fetch-depth: 0)
│   ├── on PR: fetch-depth: 0 (full history for diff base)
│   └── on push to main: fetch-depth: 0 (全 history)
└── gitleaks scan (gitleaks/gitleaks-action@v2)
    ├── on PR: GITLEAKS_ENABLE_COMMENTS=true (comment finding on PR)
    └── on push to main: scan all (掃 git log)
```

### 2.4 `spec-coverage-advisory` job(advisory)

```text
spec-coverage-advisory job
├── checkout (actions/checkout@v4)
├── check if doc-only PR (actions/github-script@v7, per research §11)
│   └── if doc-only: skip remaining steps
└── post advisory comment if src/ touched but specs/ not (actions/github-script@v7)
```

### 2.5 `toolchain-isolation-advisory` job(advisory)

```text
toolchain-isolation-advisory job
├── checkout (actions/checkout@v4)
├── check if doc-only PR (same as spec-coverage)
│   └── if doc-only: skip remaining steps
└── post advisory comment if package.json + src/ both touched
```

---

## §3 Entity 互動關係圖

```text
┌─────────────────────────────────────────────────────────────────┐
│  GitHub Repo Settings (out of scope, adopter manual)            │
│  └─ Branch Protection Rule for `main`                           │
│     └─ Required status checks:                                  │
│        ├─ gates                                                 │
│        ├─ wrangler-bundle-check                                 │
│        └─ secret-scan                                           │
└─────────────────────────────────────────────────────────────────┘
                                ▲
                                │ enforces (manual)
                                │
┌─────────────────────────────────────────────────────────────────┐
│  .github/workflows/ci.yml (FR-001~005, FR-008~011)              │
│  ├─ on: pull_request | push | workflow_dispatch                 │
│  ├─ concurrency: cancel-in-progress per ref                     │
│  └─ jobs:                                                       │
│     ├─ gates ────────────────────┐                              │
│     ├─ wrangler-bundle-check ────┼─ uses .devcontainer/ image  │
│     ├─ secret-scan ──────────────┼─ uses gitleaks-action@v2   │
│     ├─ spec-coverage-advisory ───┤                              │
│     └─ toolchain-isolation-advisory                             │
└──────────────┬──────────────────────────────────────────────────┘
               │
               │ posts PR comments
               ▼
┌─────────────────────────────────────────────────────────────────┐
│  GitHub PR (US1, US4)                                           │
│  ├─ Status checks: 3 mandatory ✓ / ✗                            │
│  ├─ PR comments (advisory):                                     │
│  │   ├─ ⚠ src changed without spec/                             │
│  │   └─ ⚠ deps + src in same PR                                 │
│  └─ Reviewer reads → merge or request change                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  .github/dependabot.yml (FR-006~007)                            │
│  ├─ npm entry: weekly Monday, 4 groups, 5 PR limit              │
│  └─ github-actions entry: weekly Monday, 1 group, 3 PR limit    │
└──────────────┬──────────────────────────────────────────────────┘
               │
               │ opens PRs
               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Dependabot upgrade PR (US2)                                    │
│  ├─ Title / commit message: chore(deps): bump xxx               │
│  ├─ Triggers same CI workflow above                             │
│  └─ Maintainer reviews CI result → merge / close / fix          │
└─────────────────────────────────────────────────────────────────┘
```

---

## §4 與 spec.md §Key Entities 對齊驗證

| spec.md Entity | 本檔 §section | 落地檔案 |
|---|---|---|
| CI Workflow | §1.1 | `.github/workflows/ci.yml` |
| Dev Container Image | §1.1 + §2.1/2.2 | 複用既有 `.devcontainer/`(本 feature 不修改) |
| Bundle Budget | §1.1(`wrangler-bundle-check` job)+ §2.2 | inline 於 ci.yml(初版),budget 升降走 isolated commit |
| Secret Scan Configuration | §1.3 | `.gitleaks.toml`(optional,需要時加) |
| Dependabot Configuration | §1.2 | `.github/dependabot.yml` |
| Advisory Comment | §1.1(2 個 advisory job)+ §2.4/2.5 | inline 於 ci.yml(actions/github-script) |
| Branch Protection Mandatory Check List | §3 圖頂部 | **不在本 feature 範圍**;adopter 手動設(per Out of scope + research §10) |

✅ 100% 對齊 spec.md §Key Entities 7 條,無遺漏。

---

## §5 結論與下一步

Data model 完成。本 feature 為 CI configuration scope,entity 集中於 4 檔案:

- `.github/workflows/ci.yml`(主要)
- `.github/dependabot.yml`
- `.gitleaks.toml`(optional)
- `README.md`(append §「CI status」)

無 application data model / state machine / persistent storage。下一步 Phase 1 contracts 將定義各 job 之 input / output / failure mode 之契約。

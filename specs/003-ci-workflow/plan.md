# Implementation Plan: CI Workflow + Dependabot — Ubuntu Mechanization of Baseline Gates

**Branch**: `003-ci-workflow` | **Date**: 2026-05-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/003-ci-workflow/spec.md`

## Summary

機械化既有 4 mandatory gates(`pnpm typecheck` / `pnpm lint` / `pnpm test:node` / `pnpm test:worker`)+ 新增 wrangler bundle 純度檢查 + secret scan + Dependabot 自動升版 + 兩條 advisory 提示,**全部於 GitHub Actions ubuntu-latest runner 內以 dev container image 執行**。本 feature 不引入新 application code,只配置 CI workflow YAML(`.github/workflows/ci.yml`)+ Dependabot 配置(`.github/dependabot.yml`)+ optional `.gitleaks.toml` allowlist + README §「CI status」。

## Technical Context

**Language/Version**:

- 主要 artifact 為 GitHub Actions Workflow YAML(YAML 1.2)+ Dependabot 配置 YAML
- Advisory job 內可能含少量 Bash(LF 行尾 + ShellCheck 友好)
- 不引入 application TS / JS code

**Primary Dependencies**:

- GitHub Actions service(adopter 端,fork 必需)
- GitHub Actions Marketplace actions:`actions/checkout@v4`、`pnpm/action-setup@v4`、`devcontainers/ci@v0.3`、`gitleaks/gitleaks-action@v2`、`actions/cache@v4`、`actions/github-script@v7`(advisory comment 用)
- 既有 `.devcontainer/`(複用,本 feature 不修改 devcontainer 定義)
- 既有 `pnpm-lock.yaml`(cache key 來源)

**Storage**: N/A(本 feature 為 CI 配置,無持久化資料)

**Testing**:

- 主要驗證:CI workflow 自身 push 後在 GitHub Actions UI 跑綠;negative test 用 PR 故意違規(eg. 加 `import 'pg'` 進 worker / 加大 bundle / commit fake secret)驗 mandatory check 確實 fail
- 不引入新 vitest / typecheck test;本 feature 之 acceptance 由「CI 跑綠/紅」直接驗證

**Target Platform**:

- CI runner:`ubuntu-latest`(GitHub-hosted x86_64)
- Dev container image:`.devcontainer/Dockerfile` 描述之 image(複用,基於 Debian/Ubuntu)
- Adopter:任何 GitHub repo(public free tier 或 private paid)

**Project Type**: CI/CD configuration(YAML-as-code)

**Performance Goals**:

- SC-001:cache hit ≤ 5 min;cache miss ≤ 15 min
- SC-007:Dependabot PR 跑完 ≤ 15 min(同上)
- SC-008:fork 後 ≤ 5 min 內 CI 自動偵測(GitHub Actions 之偵測延遲)

**Constraints**:

- 不寫入 production credentials(per FR-010)
- 不打真 Cloudflare API(wrangler-bundle-check 用 `--dry-run`;test:worker 用 miniflare)
- 不 fork / 維護 secret 規則庫(用 gitleaks 預設 + `.gitleaks.toml` allowlist;per Assumption #4)
- macOS runner 排除(per Q6 Clarification + Assumption #1)

**Scale/Scope**:

- Repo scale:中型 monorepo(< 10k commits / < 1000 files);gitleaks 全 history scan 預期 < 1 min
- CI 觸發頻率:預期 < 50 PR/月(典型 OSS starter 規模);GitHub Actions free tier minutes 充足

## Constitution Check

> Constitution v1.1.3 (2026-05-03)。本節對齊 5 Core Principles + Variant Amendment + Technology Stack + Workflow Quality Gates 各條,記錄合規性。

### I. Test-First Development (NON-NEGOTIABLE) — ✅ N/A with documented rationale

本 feature 不引入 application code;所有 artifact 為 declarative YAML 配置 + 可能少量 advisory job 之 Bash glue。**TDD 不直接適用** — workflow YAML 之「test」即「真實在 GitHub Actions 跑」,RED→GREEN 階段對應「commit workflow 至 PR」→「看 GitHub Actions 結果」。

豁免依據:憲法 V 原則之 trivial 豁免(「typos, single-line bugs, dependency bumps with no behavior change」)精神延伸 — CI 配置變更不引入 application behavior change,但本 feature 仍走完整 spec-kit pipeline(spec → plan → tasks → implement)以兌現 baseline FR-017 形式上的「機械化」門檻。

實際 acceptance 測試方式:

- **Positive**:本 PR 自身會被新 CI workflow 跑(per Edge Case「PR 動到 ci.yml 自身」),若新 ci.yml 寫壞,PR 即失敗
- **Negative**:`/speckit-implement` 階段會故意 push 違規 PR(eg. add `import 'pg'` to `src/worker/`)驗 gates job lint 確實 fail;故意加大 bundle 驗 wrangler-bundle-check 確實 fail;加 fake secret 驗 secret-scan 確實 fail。這些 negative 測試之證據存於 `quickstart.md`

### II. Observability by Default — ✅ N/A

本 feature 不引入新 application 進程,無新 observability surface。CI log 為 GitHub Actions 內建 surface,本 feature 不額外加 metrics / structured logging。FR-011 規範 CI 失敗訊息對 reviewer 直觀(直接展示 stderr 末段),屬 GitHub Actions 內建行為,無需額外實作。

### III. Container-First Development, Per-Runtime Deployment — ✅ COMPLIANT

**對齊核心**:憲法 III 寫「CI MUST execute on the same base image as the dev container (Node side)」— 本 feature **直接兌現**此承諾。FR-004 鎖定「CI 必須以 `.devcontainer/` 內定義之 image 跑 gates」之契約,具體技術選擇(`devcontainers/ci@v0.3` GitHub Action)於 Phase 0 research.md 比較後決定。

**ARM/x86 platform**:CI 跑於 ubuntu-latest(x86_64);dev container image 為多架構,於 Mac M1(arm64) + WSL2(x86_64)本機執行已驗 parity(per `.docs/parity-validation.md` 2026-05-03 strict-pair record)。CI 端只跑 x86_64,即與 WSL2 host 同架構;Mac arm64 parity 由本機驗證承擔(SC-002 不在本 feature 範圍)。

**Per-runtime deployment unaffected**:本 feature 不動 `Dockerfile`、`docker-compose.yml`、`wrangler.jsonc`,Node 與 Worker 之 production deployment 路徑不變。

### IV. Type Safety End-to-End — ✅ COMPLIANT

本 feature 之 artifact 主要為 YAML(strict 模式不適用),少量 Bash glue 須:

- LF 行尾(per `.gitattributes`)
- ShellCheck-friendly(advisory job 內若有 Bash)
- 不修改既有 `tsconfig*.json` / `eslint.config.js`(本 feature 把既有規則升至 CI 機械驗,不放鬆/收緊規則)

### V. Spec-Driven Development — ✅ COMPLIANT + ENHANCING

本 feature 自身走 spec-kit pipeline(`/speckit-specify` → `/speckit-clarify`(跳過,knobs 已預解)→ `/speckit-plan`(本檔)→ `/speckit-tasks` → `/speckit-implement`)。

**Enhancing**:本 feature FR-008 加 SC-003 spec coverage advisory job,自動偵測「動 src/ 但無 specs/」並 comment 提示;此為憲法 V「Spec coverage」gate 之機械化提示(reviewer 仍保留豁免權)。

**人類 review gate 保留**:本 plan 完成後,要求人類 review `spec.md` + `plan.md` 才執行 `/speckit-implement`(per 憲法 V「A human reviewer MUST inspect ... BEFORE `/speckit-implement` runs」)。

### Variant Amendment — Cloudflare Worker Companion — ✅ COMPLIANT

- **Per-runtime deployment**:本 feature 不變更 wrangler / Docker 之 deployment 路徑;wrangler-bundle-check job 用 `--dry-run` 不實際 deploy。✓
- **Type Safety End-to-End fully mechanical (v1.1.3)**:本 feature 之 gates job 跑 `pnpm lint` 即觸發既有 `eslint.config.js` `no-restricted-imports` rule(Layer 2);跑 `pnpm typecheck` 即觸發既有雙 tsconfig(Layer 1)。本 feature **不放鬆** v1.1.3 機械化保證,反而升級為「每 PR 自動觸發 → 違規 PR 直接被擋」。✓
- **Test-First continues — dual pool**:本 feature gates job 完整跑 `pnpm test:node` + `pnpm test:worker` 兩 pool;不跳過 worker pool。✓
- **Comparison demos are first-class**:本 feature 不影響既有 README 3×2 對照表(FR-012 加 §「CI status」段為新增,不取代既有段)。✓

### Technology Stack & Constraints — ✅ COMPLIANT

- **CORE toolchain**:本 feature 不變更 TypeScript / Hono / vitest / ESLint / Prettier / pnpm 任一 CORE 項目之版本;只把既有命令升至 CI。✓
- **Toolchain pinning isolation**:本 feature 引入之 GitHub Actions(`actions/checkout@v4` etc.)版本固定即屬 toolchain pinning 範圍;未來升版走 isolated commit(per 憲法 §Toolchain pinning + spec FR-019)。✓ 此外 Dependabot 配置之 `package-ecosystem: github-actions` 條目自動處理 GitHub Actions 升版掃描。
- **Worker bundle policy**:wrangler-bundle-check job 直接機械驗(grep + size assertion)— 同 `tsconfig.worker.json` 之 type-level isolation,本 feature 加上 bundle-level **第二道防線**。✓
- **Sensitive material policy**:secret-scan job 用 gitleaks 機械化憲法 §Sensitive material policy 之全部 ban list(`.claude/.credentials.json`、`.env`、`.dev.vars`、`*.pem`、`*.key` 等)。✓

### Development Workflow & Quality Gates — ✅ ENHANCING

本 feature 把以下 gate 從「人工 attest」升「機械化」:

- Tests pass (gate 1) → CI gates job 自動驗
- Types clean (gate 2) → CI gates job 自動驗
- Lint clean (gate 3) → CI gates job 自動驗
- Container parity (gate 4, Node side) → CI gates job 在 dev container 內跑(Ubuntu side mechanized)
- Spec coverage (gate 5) → advisory job 自動提示(reviewer 保留豁免權)
- Lockfiles committed (gate 6) → 既有 `pnpm install --frozen-lockfile` 即驗;本 feature 不另加

**唯一 partial**:Container parity 跨平台(Mac M1 ↔ Ubuntu)仍 manual,因本 feature 不含 macOS runner;此 partial 已於 spec.md FR-013 + SC-002 explicit disclose。

### Constitution Check 結論

**所有 5 Core Principles + Variant Amendment + Technology Stack + Workflow Quality Gates 全部 COMPLIANT 或 ENHANCING**。
**0 violation,0 deviation 需 record 至 Complexity Tracking**。

## Project Structure

### Documentation (this feature)

```text
specs/003-ci-workflow/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command) — light scope, see Phase 1
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   ├── ci-gates.md            # 3 mandatory + 2 advisory job 之契約
│   └── dependabot-policy.md   # grouping rule + schedule + commit convention 之契約
├── checklists/
│   └── requirements.md  # /speckit-specify 已產出 (13/13 全 pass)
├── spec.md              # /speckit-specify 已產出
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
.github/                        # 本 feature 主要落地處 (NEW)
├── workflows/
│   └── ci.yml                  # 主 workflow:gates + wrangler-bundle-check + secret-scan + 2 advisory job
└── dependabot.yml              # Dependabot 配置:schedule + grouping + target branch + commit convention

.gitleaks.toml                  # (optional, 視 false positive 出現頻率) gitleaks allowlist

README.md                       # +§「CI status」段 (NEW SECTION,本 feature 加)
                                #   - GitHub Actions badge URL
                                #   - 行為簡述 (3 mandatory + 2 advisory + Dependabot)
                                #   - branch protection 操作指引
                                #   - 連結至 specs/003-ci-workflow/quickstart.md

# 本 feature 不修改:
.devcontainer/                  # 複用既有 dev container 定義
src/                            # 不動
tests/                          # 不動
package.json                    # 不動 (本 feature 不引入 npm dep;workflow YAML 之 actions 版本獨立管理)
pnpm-lock.yaml                  # 不動
tsconfig*.json                  # 不動
eslint.config.js                # 不動
.devcontainer/devcontainer.json # 不動
wrangler.jsonc                  # 不動 (wrangler-bundle-check 用既有配置 dry-run)
```

**Structure Decision**: CI configuration-only feature。新增 artifact 集中於 `.github/`(GitHub Actions 標準位置)+ README §;**不動 application source / tests / toolchain config**(per 憲法 V「trivial-isolation」精神 + spec FR-019 toolchain bump 孤立 commit 紀律,本 feature 雖非 toolchain bump,但同樣保持「不混雜 application 變更」)。

`.gitleaks.toml` 為 optional artifact:預設不建立,僅當 gitleaks 跑出 false positive 需 allowlist 時於 isolated PR 內加入。

## Complexity Tracking

> No violations。Constitution Check 全 COMPLIANT 或 ENHANCING,本表保留為空(per template guidance「Fill ONLY if Constitution Check has violations」)。

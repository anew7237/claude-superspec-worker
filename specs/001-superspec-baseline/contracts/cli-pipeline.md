# Contract: SDD CLI Pipeline

**Audience**: Adopter / AI agent in container
**Surface owner**: spec-kit (pinned via `.devcontainer/post-create.sh` `SPEC_KIT_VERSION`)
**Related FR / SC**: FR-004, FR-013, FR-016, FR-019, SC-003, SC-007

## 提供的指令(by spec-kit + 此 monorepo 的擴充)

| 指令 | 角色 | 主要產物 / 副作用 | 必要前置 |
|---|---|---|---|
| `/speckit-constitution` | 寫 / 修訂 `.specify/memory/constitution.md` | constitution.md(含 SYNC IMPACT REPORT header) | git repo;若初次,先 `before_constitution=speckit-git-initialize` hook 跑 git init |
| `/speckit-specify <description>` | 建 feature branch + spec.md | `specs/<feature_id>-<short>/spec.md`、`specs/<feature_id>-<short>/checklists/requirements.md`、`.specify/feature.json` | 在 git repo 內;`before_specify=speckit-git-feature` hook 強制(mandatory)— 自動建 `<feature_id>-<short>` branch |
| `/speckit-clarify` | 對 spec 中 ambiguity 提 ≤5 題互動式問題,結果寫入 `## Clarifications` | spec.md 增量更新(整合 clarifications 後重寫整檔) | spec.md 存在 |
| `/speckit-plan` | 產 plan.md + Phase 0 (research) + Phase 1 (data-model / contracts / quickstart) | plan.md、research.md、data-model.md、contracts/、quickstart.md;更新 CLAUDE.md SPECKIT marker | spec.md 含 Clarifications(建議);constitution.md 存在 |
| `/speckit-tasks` | 產 tasks.md(dependency-ordered) | tasks.md | plan.md + design artifacts 存在 |
| `/speckit-implement` | 依 tasks.md 逐項執行,RED → GREEN | 實際程式碼 + 測試變更 | **人類 reviewer 已 review spec.md + plan.md(可作者本人)— FR-013** |
| `/speckit-analyze` | 跨 artifact 一致性掃描(non-destructive) | 報告(stdout / artifact) | spec + plan + tasks 全在(建議於 tasks 後) |
| `/speckit-checklist` | 為 feature 產生客製 checklist | `<feature_dir>/checklists/<name>.md` | feature dir 存在 |
| `/speckit-taskstoissues` | 把 tasks 同步成 GitHub issues | GitHub API 寫入 | tasks.md 存在;有 GitHub remote |

### Git extension hooks(spec-kit 擴充)

宣告於 `.specify/extensions.yml`,執行於 `.specify/extensions/git/scripts/`:

| Hook 點 | Command | Optional? | 行為 |
|---|---|---|---|
| `before_constitution` | `speckit.git.initialize` | ❌ Mandatory | 若無 git repo,執行 `git init` + initial commit。 |
| `before_specify` | `speckit.git.feature` | ❌ Mandatory | 建 + 切到 `<feature_id>-<short>` branch;輸出 JSON `{BRANCH_NAME, FEATURE_NUM}`。支援 `GIT_BRANCH_NAME` env override 強制使用使用者指定名稱。 |
| `before_clarify / plan / tasks / implement / checklist / analyze / taskstoissues` | `speckit.git.commit` | ✅ Optional | 預設 enabled;但本 monorepo 專案 CLAUDE.md 規定「commit 需明確使用者指示」,因此 hook 雖 surface prompt,實際 commit 仍由使用者觸發 `commit` 指令。 |
| `after_*` 同上 | `speckit.git.commit` | ✅ Optional | 同上。 |

> 此 monorepo 在 `extensions.yml` 並未額外 disable optional hooks;規範由 CLAUDE.md project override 約束 Claude 行為,而非 hook 配置。

## 不變量(must)

1. **Pipeline 順序**:`/speckit-implement` 須在 `/speckit-plan`(以及 spec/plan 的人類 review)之後 — 跳過則違反憲法 Principle V + FR-013。
2. **Branch 隔離**:每個 feature 必須在獨立 `<feature_id>-<short>` branch 上開發(FR-016);`/speckit-specify` 在錯誤 branch(如 `main`)上跑時,hook 必須建新 branch 而非重用當前。
3. **Mandatory hook 不可繞過**:`before_constitution=speckit-git-initialize` 與 `before_specify=speckit-git-feature` 為 `optional: false`;若 hook 失敗,核心指令必須中斷而非靜默繼續。
4. **Trivial 豁免不繞過 quality gates**:即使 PR reviewer 判定 trivial 豁免 SDD pipeline(per spec FR-004),`pnpm test` `pnpm typecheck` `pnpm lint` 仍須 pass(Quality Gate entity 規範,見 quality-gates.md)。

## 失敗模式(observable)

| 場景 | 期望行為 |
|---|---|
| 在 non-git directory 跑 `/speckit-specify` | `speckit-git-feature` hook 輸出 `[specify] Warning: Git repository not detected; skipped branch creation`,核心指令亦 abort |
| spec.md 不存在跑 `/speckit-clarify` | abort,提示「先跑 `/speckit-specify`」 |
| plan.md 不存在跑 `/speckit-tasks` | abort,提示「先跑 `/speckit-plan`」 |
| `/speckit-implement` 前未 review spec/plan | skill outline 須含 review prompt(FR-013)。本 monorepo 透過憲法 Principle V 加碼提示。 |
| 上游 `uv tool install` outage(spec-kit 升級時) | `post-create.sh` 訊息明確指出「上游不可達」(FR-020);本機已 install 的 spec-kit 仍可繼續使用 |

## 版本與相容

- 當前 spec-kit 版本:`v0.8.1`(由 `.devcontainer/post-create.sh` `SPEC_KIT_VERSION` 釘住,FR-019)。
- 升級規則:孤立 commit,僅動 `SPEC_KIT_VERSION` + lockfile / 內嵌 `.specify/templates/`(若新版重新 install)。
- Backward compat:本 contract 的指令名(`/speckit-*`)為 spec-kit 公開 API;若上游 rename,本 baseline 須走 MAJOR amendment(per Constitution Governance)。

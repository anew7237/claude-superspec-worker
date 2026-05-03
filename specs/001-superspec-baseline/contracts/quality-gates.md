# Contract: Quality Gates

**Audience**: Adopter / PR reviewer / CI workflow
**Surface owner**: `Makefile` + `package.json` `scripts` + `Dockerfile` + `.github/workflows/`(CI;**v1.0.0 known gap,2026-05-04 由 003-ci-workflow 機械化 Ubuntu side**)
**Related FR / SC**: FR-003, FR-005, FR-008, FR-009, FR-013, FR-017, SC-002, SC-003, SC-005, SC-008, SC-011

## Mandatory Gates(機械強制)

每個非 trivial PR(以及所有 trivial 豁免 PR)合併前必須通過。涵蓋 Node 端 + Worker 端兩 runtime;v1.0.0 ratification 時 Worker pool 尚未引入,Worker 端 gate 自 002 落地後生效。

| Gate | Verification command(in dev container) | Pass 條件 |
|---|---|---|
| **Tests (Node)** | `pnpm test`(等價 `vitest run`,目前涵蓋 `tests/node/**`) | vitest 全綠;0 failed |
| **Tests (Worker)** | `pnpm test:worker`(由 002 引入,使用 `@cloudflare/vitest-pool-workers`) | vitest + miniflare 全綠;0 failed。**v1.0.0 時不存在,自 002 起 active。** |
| **Types (Node)** | `pnpm typecheck`(目前等價 `tsc --noEmit`) | 0 errors |
| **Types (Worker)** | 由 002 落地時於 `pnpm typecheck` script 內擴充涵蓋 `tsconfig.worker.json`(雙 tsconfig 結構) | 0 errors;cross-runtime import 違規於此階段擋下(FR-022 mechanical enforcement,Q3 Clarification 之 002-onward 生效) |
| **Lint** | `pnpm lint` + `pnpm exec prettier --check .`(由 `Makefile lint` 串接 docker compose run) | eslint 0 errors / 0 warnings;prettier 0 failures。含 `no-console` 規則(SC-009 機械強制 — Node 應用碼 `src/node/**/*.ts` 內任處 `console.*` 即 fail) |
| **Lockfile committed** | `git status --porcelain pnpm-lock.yaml` 為空 + `Dockerfile` 用 `--frozen-lockfile` | 任何 `package.json` 變動 PR 必同 commit `pnpm-lock.yaml`;Dockerfile build 嚴格驗證一致性 |

> Mandatory gate 失敗 → PR 不可 merge,**無例外**(包含 trivial 豁免 PR)。

## Advisory Gates(human-attest / pr-review)

| Gate | 驗證方式 | 紀錄位置 |
|---|---|---|
| **Container parity (Node)** | PR 須揭露「測試於宿主端還是容器」;只在 host 跑的 PR 須補在容器跑一次 | PR description 或 reviewer comment |
| **Cross-platform parity (Mac M1 vs WSL2)** | SC-002 自 v1.0.0 起 covers Node + Worker 兩 runtime(Q2 Clarification);測試級別「同一 test 一邊 pass / 另一邊 fail」即視為 parity 缺陷,計入 SC-008 配額 | CI 兩 OS runner 結果對照(CI 為 future feature)+ reviewer 抽查 |
| **Spec coverage** | 非豁免 PR 必有 `specs/NNN-*/`(spec / plan / tasks 齊備);豁免 PR 須在 PR comment 由 reviewer 明示豁免理由 | PR comment + filesystem |
| **Toolchain isolation** | toolchain 升級 PR 的 diff 僅動 version_declaration_site + lockfile(FR-019) | PR diff 視察 / CI 規則(future) |
| **Human review of spec/plan** | 至少一位人類(可作者本人)review 過 spec.md + plan.md,於 `/speckit-implement` 前 | PR description / commit message / `/speckit-implement` skill 的 review prompt |
| **Cross-runtime import ban** | FR-022 / SC-011;由 typecheck 階段機械擋下 — **自 002 落地後 active**(Q3 Clarification);v1.0.0 時 Worker 端不存在,違規空間客觀為 0 | typecheck 失敗為 blocking;reviewer 不需人工抓(自 002 起) |

## 不變量

1. **Mandatory gate 在容器內跑**:CI 與本地 dev container 必須使用同一 base image(FR-017);**現況 CI 缺**(known gap,由未來 feature 補建)。
2. **Trivial 豁免不繞過 mandatory gates**:豁免只豁 spec coverage,其他 gate 一律照樣跑(per spec FR-004)。
3. **Lockfile = 一級 review object**:`pnpm-lock.yaml` 必須與 `package.json` 同 commit;不允許「先 merge package.json,後 merge lockfile」拆 PR。
4. **Reviewer 可作者本人**(per FR-013):review gate 的目的是阻擋全自動 prompt-to-merge,非交叉審查;後者由 GitHub PR review 流程(repo collaborator 設定)疊加。
5. **Cross-runtime import enforcement timing**(Q3 Clarification):FR-022 為 aspirational at v1.0.0,mechanical 自 002 起;在此之前 SC-011 = 0 因為 Worker 端缺席,違規空間為 0。

## 失敗模式

| 場景 | 期望行為 |
|---|---|
| `pnpm test` 在宿主端通過、容器內失敗 | 視為 container parity 缺陷,於 PR 揭露;baseline 季度目標 ≤ 1 件(SC-008)。 |
| 同一 test 在 Mac 通過、在 WSL2 失敗 | 視為 cross-platform parity 缺陷,計入 SC-008 配額(Q2 Clarification 擴充涵蓋至 Worker 端 vitest+miniflare 結果) |
| `package.json` 改動但 `pnpm-lock.yaml` 未更新 | Dockerfile build 階段 `pnpm install --frozen-lockfile` 失敗;README §8 FAQ 提供修法 |
| Toolchain bump PR 夾帶其他變更 | reviewer 駁回,要求拆 PR(現為人為,CI 規則化屬 future feature) |
| Trivial 豁免 PR 無 reviewer comment | PR 不可 merge;reviewer 須補豁免說明 |
| Node 端 `src/node/**/*.ts` 內出現 `console.*` | `pnpm lint` 失敗(`no-console: error` rule);PR 不可 merge |
| Node 端 import D1Database / KVNamespace(自 002 起) | `pnpm typecheck` 在 `tsconfig.node.json` 階段失敗(雙 tsconfig 隔離 globals);v1.0.0 時 Worker types 未安裝,此情境物理上無法觸發 |

## CI 對應(✅ Ubuntu side mechanized — 003-ci-workflow,2026-05-04)

> **歷史 (v1.0.0 ratification ~ 2026-05-03)**:此 section 原標 known gap;`reviewer audit I-1 PARTIAL` 列為 唯一未閉合 audit 項。**2026-05-04 起由 003-ci-workflow PR #21 機械化 Ubuntu side**;macOS runner 仍 manual `.docs/parity-validation.md` 流程(per spec assumption + 003 spec.md Q6 Clarification)。

baseline 要求(FR-017):

- ✅ CI workflow 以 **同一份 `.devcontainer/Dockerfile` image** 跑 Node + Worker mandatory gates(via `devcontainers/ci@v0.3` GitHub Action;per `specs/003-ci-workflow/contracts/ci-gates.md` §2)。實作於 `.github/workflows/ci.yml` `gates` job。
- ⚠ macOS runner: **NOT mechanized**(per 003 spec assumption + Q6 Clarification — adopter 偏好 + Actions minutes 成本);SC-002 跨平台 parity 仍走 `.docs/parity-validation.md` 人工流程(已 fully verified strict pair via Mac M1 + WSL2 dev container at vitest-pool-workers 0.15.2,2026-05-03)。
- ✅ 對 `pnpm-lock.yaml` 變動的 PR 在 gates job 內跑 `pnpm install --frozen-lockfile` 驗證一致性(per 003 ci.yml T004 step 4 inside dev container)。
- ⚠ Toolchain 升級 PR 之「diff 僅動 version_declaration_site + lockfile」FR-019 機械化:已由 003-ci-workflow 之 `toolchain-isolation-advisory` job 部分機械化(advisory comment,不阻擋 merge;reviewer 仍保留豁免權)。Strict mechanical block 屬 future feature。
- ✅ Git history 之 secret-scan SC-006 機械化:由 003-ci-workflow 之 `secret-scan` job(`gitleaks/gitleaks-action@v2`)實現,PR mode 掃 PR diff,push to main mode 掃全 git history。

當前 CI workflow 檔:`.github/workflows/ci.yml`(per `specs/003-ci-workflow/`);Dependabot 自動升版檔:`.github/dependabot.yml`。

> **WSL2 parity caveat**:GitHub Actions `ubuntu-latest` runner 是裸 Linux x86_64,與 baseline 目標的 WSL2 Ubuntu(Hyper-V VM)不完全等價。CI 通過僅是「合理近似」— fs case-sensitivity、metadata、systemd 等細節仍可能差異。**真正 WSL2 parity 仍須由開發者於本地 dev container 驗證**;CI 只能 catch 大多數 application-layer 衝突,不能取代本地 reopen-in-container 的 sanity check(SC-008 季度配額即反映此差距)。
>
> **003-ci-workflow 額外貢獻**:`wrangler-bundle-check` job 機械化 002 FR-009 / SC-003(Worker bundle 不含 Node-only modules + size ≤ 100 KiB);`spec-coverage-advisory` + `toolchain-isolation-advisory` 兩 advisory job 補強 SC-003 / FR-019 之 reviewer 提示(advisory only,不阻擋 merge)。詳見 `specs/003-ci-workflow/contracts/ci-gates.md` §3, §5, §6 + `specs/003-ci-workflow/contracts/dependabot-policy.md`。

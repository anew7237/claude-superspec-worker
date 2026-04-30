# Baseline Traceability Matrix

此 matrix 供 **derivative compliance auditors** 使用,對照 001-superspec-baseline 的 22 條
Functional Requirement(FR)與 11 條 Success Criteria(SC)到其在 contracts / research 中的
規範出處。目標對應 tasks.md Checkpoint:
_「derivative compliance audit 可定位 baseline 規則出處」_。

## 使用方式

Fork 此 monorepo 的 adopter 可依下列順序使用本 matrix:

1. 找出你關心的 derivative concern(例如:認證隔離、跨平台 parity、觀測面)。
2. 在下方表格中找到對應的 FR 或 SC 編號。
3. 跟著「主要 contract / 段落 anchor」欄位跳到最有權威性的條文。
4. 若需了解設計背景或 gap 分析,再讀「研究 anchor」(research.md §2 對應行)。
5. 「依賴 user story」欄說明此規範服務哪個 adopter 使用情境,有助優先排序。

---

## Functional Requirements 對照表

| FR 編號 | 主要 contract / 段落 anchor                                                                                                                                                                                           | 依賴 user story                  |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| FR-001  | `contracts/devcontainer.md` §「不變量」(不要求宿主端裝 Node/pnpm)+ `research.md` §2 row FR-001                                                                                                                        | US1 / US3                        |
| FR-002  | `contracts/devcontainer.md` §「Container 提供的能力」(post-create.sh banner)+ `quickstart.md` Step 0–2                                                                                                                | US1                              |
| FR-003  | `contracts/quality-gates.md` §「Mandatory Gates」+ `contracts/devcontainer.md` §「不變量」(daily work in container)                                                                                                   | US1 / US2                        |
| FR-004  | `contracts/cli-pipeline.md`(全文:指令表 + 不變量)+ `.specify/memory/constitution.md` §V Spec-Driven                                                                                                                   | US2                              |
| FR-005  | `contracts/quality-gates.md` Tests row(Node + Worker)+ `.specify/memory/constitution.md` §I Test-First                                                                                                                | US2 / US4                        |
| FR-006  | `contracts/observability.md` §1(Node 觀測面,`/health` `/metrics` + pino)+ §2(Worker forward-decl)                                                                                                                     | US4                              |
| FR-007  | `contracts/sensitive-material.md` §「Claude Code credentials」+ §「DevContainer mount 規範」(不烘焙 OAuth)                                                                                                            | US1                              |
| FR-008  | `contracts/quality-gates.md` Types row(engine-strict)+ `contracts/devcontainer.md` §「Container 提供的能力」`node 22 + pnpm` row                                                                                      | US1                              |
| FR-009  | `contracts/quality-gates.md` Lockfile committed row + §「不變量」第 3 條                                                                                                                                              | US2                              |
| FR-010  | `contracts/quality-gates.md` Lint row + `research.md` §2 row FR-010(`.gitattributes` LF 強制)                                                                                                                         | US2 / US3                        |
| FR-011  | `contracts/devcontainer.md` §「版本」(multi-stage image)+ `research.md` §2 row FR-011(production non-root)                                                                                                            | _production / cross_             |
| FR-012  | `contracts/sensitive-material.md` §「Build artifacts」(named volume + .gitignore)+ `research.md` §2 row FR-012                                                                                                        | US1 / US3                        |
| FR-013  | `contracts/cli-pipeline.md` §「不變量」第 1 條(人類 review gate)+ `.specify/memory/constitution.md` §V                                                                                                                | US2                              |
| FR-014  | `contracts/sensitive-material.md` §「DevContainer mount 規範」SSH agent row + `contracts/devcontainer.md` §「失敗模式」SSH sanity check row                                                                           | US1                              |
| FR-015  | `contracts/devcontainer.md` §「版本」+ `research.md` §2 row FR-015(multi-stage `base/deps/dev/build/prod-deps/runtime`)                                                                                               | _production_                     |
| FR-016  | `contracts/cli-pipeline.md` §「Git extension hooks」`before_specify` row(mandatory hook)+ §「不變量」第 2 條                                                                                                          | US2                              |
| FR-017  | `contracts/quality-gates.md` §「CI 對應(known gap)」+ §「不變量」第 1 條 + `research.md` §2 row FR-017                                                                                                                | US3                              |
| FR-018  | `specs/001-superspec-baseline/spec.md` FR-018 verbatim + `research.md` §1.1 Q1 Clarification + ✅ **mechanical(since 002-cloudflare-worker, 2026-04-30)**:`specs/002-cloudflare-worker/contracts/worker-routes.md` 提供 Worker reference application(`/health` `/d1/now` `/kv/echo` 4 routes)+ `tests/worker/**` 18 cases    | _cross-cutting_                  |
| FR-019  | `contracts/cli-pipeline.md` §「版本與相容」+ `.docs/toolchain-upgrade-playbook.md`(全文)+ `research.md` §2 row FR-019                                                                                                 | US5                              |
| FR-020  | `.docs/upstream-outage-runbook.md`(全文)+ `contracts/devcontainer.md` §「失敗模式」(spec-kit outage row)+ `research.md` §2 row FR-020                                                                                 | US1 / US2                        |
| FR-021  | `specs/001-superspec-baseline/spec.md` FR-021 verbatim + `specs/001-superspec-baseline/plan.md` §「Project Structure」+ ✅ **mechanical(since 002-cloudflare-worker, 2026-04-30)**:`src/worker/{index,env,error}.ts` + `src/worker/routes/{health,d1,kv,proxy}.ts` + `src/shared/types.ts` + `tests/worker/**` 5 個 test 檔皆已落地 | _cross-cutting_                  |
| FR-022  | `specs/001-superspec-baseline/spec.md` FR-022 verbatim + `research.md` §1.3 Q3 Clarification + `contracts/quality-gates.md` §「Advisory Gates」+ ⚠️ **partially mechanical(since 002-cloudflare-worker, 2026-04-30)**:`specs/002-cloudflare-worker/contracts/dual-tsconfig.md` §3 雙 tsconfig 對 ambient globals + `node:*` builtins 機械擋下;explicit named imports(`import { Pool } from 'pg'`)為 advisory(per T024-T026 finding,需 ESLint `no-restricted-imports` 補強為完全機械) | _cross-cutting, active from 002_ |

---

## Success Criteria 對照表

| SC 編號 | 主要 contract / 段落 anchor                                                                                                                       | 依賴 user story                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| SC-001  | `specs/001-superspec-baseline/quickstart.md` Step 0–3 + `.docs/onboarding-stopwatch.md`(首次 build / reopen 量測表)                               | US1                              |
| SC-002  | `.docs/parity-validation.md` §「本機驗證流程」+ `research.md` §1.2 Q2 Clarification(Worker 端 parity 標準等同 Node 端)                            | US3                              |
| SC-003  | `contracts/cli-pipeline.md` §「提供的指令」(spec coverage advisory)+ `contracts/quality-gates.md` §「Advisory Gates」Spec coverage row            | _process_                        |
| SC-004  | `contracts/observability.md` §1.3 不變量 1(新加 HTTP route 自動繼承指標)+ §1.4 實作對照 row 1                                                     | US4                              |
| SC-005  | `.docs/toolchain-upgrade-playbook.md` §「升級流程(canonical)」+ commit `ec6781a` exemplar(`chore(deps): bump vitest 2 -> 4`)                      | US5                              |
| SC-006  | `contracts/sensitive-material.md` §「不變量」第 1 條(OAuth credentials = 0 in git)+ §「監控 / Audit」(manual gitleaks;CI 自動化屬 future feature) | _cross / future CI_              |
| SC-007  | `specs/001-superspec-baseline/quickstart.md` Step 4(第一個 SDD feature)+ `.docs/onboarding-stopwatch.md` §「第一個 SDD feature 量測」段           | US2                              |
| SC-008  | `.docs/parity-validation.md` §「SC-008 季度配額記錄表」(季度 ≤ 1 件 parity 缺陷)                                                                  | US3                              |
| SC-009  | `eslint.config.js` `no-console: error`(Node `src/**/*.ts`)+ `contracts/observability.md` §1.1「Banned」(console.\* → pino)                        | US4                              |
| SC-010  | `contracts/observability.md` §1.1「Default runtime metrics + 業務指標」+ `.specify/memory/constitution.md` §II(observability first-class)         | US4                              |
| SC-011  | `specs/001-superspec-baseline/spec.md` SC-011 verbatim + `research.md` §1.3 Q3 Clarification + ⚠️ **active(since 002-cloudflare-worker, 2026-04-30)**:`pnpm typecheck` 串接雙 tsconfig 為 mandatory gate;違規 PR mechanically rejected(對 ambient globals 嚴密;對 explicit named imports 為 advisory — per `specs/002-cloudflare-worker/quickstart.md` T024–T026 evidence)。違規數**目標 0** | _cross-cutting, active from 002_ |

---

## 無 anchor 自我檢查

本 matrix 每筆皆有 ≥1 anchor。若於審閱時發現空白格,即為文件 gap,須回
spec / contracts / research 修補(此 task 已預檢 — 22 FR + 11 SC 全數有
contracts 或 research.md §2 對應行可 cite)。

---

## Aspirational rules 註記 — 002 落地後狀態(2026-04-30)

### 歷史脈絡(v1.0.0 ratification)

FR-022 與 SC-011 於 v1.0.0 ratification 時標記為 **aspirational**:規則已寫入 spec,但 enforcement mechanism(雙 tsconfig + `@cloudflare/workers-types`)由 002-cloudflare-worker 落地後方能啟動。v1.0.0 時 Worker 端程式碼與 types 皆不存在,違規空間客觀為 0,SC-011 不可量化。

### 當前狀態(自 002-cloudflare-worker 落地起)

四條 forward-declarations 升級狀態總表:

| Anchor | v1.0.0 狀態      | 002 落地後狀態          | 機械強度                                                              | 補強建議                       |
| ------ | ---------------- | ----------------------- | --------------------------------------------------------------------- | ------------------------------ |
| FR-018 | 📅 forward-decl  | ✅ active               | reference app 落地(4 routes + jsonError + Env)                       | -                              |
| FR-021 | 📅 reserved      | ✅ active               | 結構就位(`src/{node,worker,shared}` + `tests/{node,worker}`)         | -                              |
| FR-022 | 📅 aspirational  | ⚠️ partially mechanical | ambient globals + node:\* builtins ✅;explicit named imports ❌(advisory) | ESLint `no-restricted-imports` |
| SC-011 | 📅 aspirational  | ⚠️ partially active     | 配同 FR-022 機械強度;違規 PR mandatory-gate 阻擋                      | 同上                           |

### FR-022 / SC-011 機械強度詳細(per T024–T026 verify)

`specs/002-cloudflare-worker/quickstart.md` 之 T024 / T025 / T026 evidence sections 文件化:

- ✅ **ambient global 違規**(eg. `let x: D1Database;` 不 import 直接用):
  Node tsconfig `types: ["node"]` 不含 workers-types ambient → typecheck `Cannot find name 'D1Database'` → **機械擋下**。
- ✅ **`node:*` builtins**(eg. `import * as fs from 'node:fs'` 在 worker 端):
  Worker tsconfig `types` 不含 `@types/node` → typecheck `Cannot find module 'node:fs'` → **機械擋下**。
- ⚠️ **explicit named imports from devDeps**(eg. `import { Pool } from 'pg'` in worker):
  `pg` 在 devDependencies + `@types/pg` 為 transitive + `skipLibCheck: true` → typecheck **resolves**。**僅在 use-site 觸發 unused-vars / 拼錯 export name 等附帶錯誤時** typecheck 才 fail。**屬 advisory**(PR review 補強)。
- ⚠️ **`import type { D1Database } from '@cloudflare/workers-types'` in node 側 / shared 側**:
  workers-types 在 devDependencies → resolves。同上,僅 attendant 路徑(unused-vars 等)觸發 fail。**屬 advisory**。

### 補強路徑(後續 feature 可選)

要把 explicit named imports 也變成完全機械擋下,有兩條路:

1. **ESLint `no-restricted-imports` rule**:於 `eslint.config.js` 為 `src/node/**/*.ts` 添加 `paths: ['@cloudflare/workers-types', 'cloudflare:*']`,為 `src/worker/**/*.ts` 添加 `paths: ['pg', 'redis', 'pino', 'prom-client', '@hono/node-server', 'fs', 'child_process', 'node:*']`。`pnpm lint` 為 mandatory gate(per spec FR-005 + SC-009),違規 PR 不可 merge。
2. **`paths` mapping in tsconfig**:於各 tsconfig 加 `compilerOptions.paths` 映射禁忌 module 至 `never`(較少見;ESLint 路徑更標準)。

當前 baseline + 002 之共識:**advisory + 嚴格 PR review** 為驗收型強度;補強為 mechanical 屬 follow-up feature 範圍(若量化發現違規率 > 0 即啟動)。

### 量化(SC-011 配額)

自 2026-04-30 起記錄;當前違規數 = **0**(本 feature 之 PR 內所有跨 runtime 引用皆遵守不成文約定)。

---

## CI gap 註記

FR-017(CI workflow 須與 dev container 共用同一 base image)與 SC-006(gitleaks 自動掃
git history)目前均為 **known follow-up**:

- FR-017 的 `.github/workflows/ci.yml` 尚未建立;anchor 指
  `contracts/quality-gates.md` §「CI 對應(known gap)」+ `research.md` §2 row
  FR-017 Critical follow-up #1。
- SC-006 的 CI 自動化(PR pre-merge `gitleaks detect`)屬 future feature;anchor 指
  `contracts/sensitive-material.md` §「監控 / Audit」+ quality-gates.md §「CI 對應」。

兩者皆在本 baseline 文件化「現有 + reserved」狀態;後續 feature 補建後,auditor
應同時核對本 matrix 對應行與新 CI workflow 的 job 設定。

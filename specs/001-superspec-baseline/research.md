# Phase 0 Research: SuperSpec Worker Monorepo Baseline

**Date**: 2026-04-30
**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)

## Section 1 — Clarification Decisions (固化)

本節記錄 `/speckit-clarify` Session 2026-04-30 解決的三個關鍵 ambiguities,每條以「Decision / Rationale / Alternatives Considered」格式凍結。

### 1.1 Single-runtime fork derivative status

**Decision**: 兩種單一 runtime fork(僅保留 Node 端、或僅保留 Worker 端)皆視為合格 derivative,前提是 `.devcontainer/` 與 spec-kit pipeline(`/speckit-*` + `specs/NNN-*/`)兩條保留。

**Rationale**:
- `.docs/20260430a-cloudflare-worker.md` §6 #16 已將 `claude-superspec-nodejs` sibling 列為「node-only world 仍為合法歷史 reference」;若 derivative 契約鎖死「兩 runtime 必備」,反而讓 nodejs sibling 變成「不合格 derivative」,語意打架。
- 對稱:既然 node-only 合法,worker-only fork 應同等合法 — 否則需在 spec 中以「Node 為 production-ready 主軸 / Worker 為附屬」異步表述,違反憲法 v1.0.0「兩 runtime 共存」的對等地位。
- 此選擇強制 002 在設計上維持 Node ↔ Worker 層次的乾淨可分離,長期有利。

**Alternatives Considered**:
- B(兩 runtime 必備):rejected — 與 nodejs sibling 既有事實打架。
- C(只允許 Node-only):rejected — 對 Worker 端不對等;且 worker-only 在 Cloudflare-first scenario 下完全合理(如某 adopter 只需 edge function + D1)。
- D(由各 fork maintainer 自行宣告):rejected — 缺乏 baseline 明示,fork 之間無一致性語意。

**Spec impact**: FR-018 擴充,明列「單一 runtime fork 亦為合格 derivative」。

### 1.2 Worker-side cross-platform parity standard

**Decision**: Worker 端 vitest + miniflare 跨主機(macOS Apple Silicon vs WSL2 Ubuntu)的 parity 標準與 Node 端相同 — test/typecheck/lint 結果 100% 等價(pass/fail count + 訊息一致)。容器層級非語意性差異(時間戳、絕對路徑前綴)允許,測試級別「同一 test 一邊 pass / 另一邊 fail」即視為 parity 缺陷,計入 SC-008 季度配額。

**Rationale**:
- miniflare 設計上即為 platform-neutral V8 sandbox。
- Worker 測試實際在 dev container 的 Node runtime 內執行(調用 miniflare),而非真實 Cloudflare V8。既然 dev container 跨主機鏡像一致(FR-017),其結果亦應一致。
- 原 spec「忽略不計」為非可測語言,違反 SC 必須 measurable 的要求。

**Alternatives Considered**:
- B(best-effort,允許差異但同一 test 不可一邊 pass / 另一邊 fail):rejected — 弱於 Node 端,缺乏對等性;且難以審計。
- C(deferred 至 002 落地):rejected — 故意延遲 SC-002 完整性,讓 spec 在 v1.0.0 時不可量化是反 baseline。
- D(由 test 作者個別負責 determinism;spec-level 不規定):rejected — 規範下放,丟失 baseline 的規範意義。

**Spec impact**: SC-002 重寫,移除「忽略不計」,明列 Worker 端納入同 100% 等價標準 + parity 缺陷計入 SC-008 配額。

### 1.3 FR-022 cross-runtime import ban — enforcement timing

**Decision**: FR-022 為 aspirational rule;v1.0.0 ratification 時,雙 tsconfig 結構與 `@cloudflare/workers-types` 安裝尚未存在,enforcement 機制(typecheck-level 機械擋下)未啟動。SC-011 違規計數從 002-cloudflare-worker 落地、雙 tsconfig + Workers types 就位後正式開始;在此之前,Worker 端不存在 → 違規空間客觀為 0,SC-011 不可量化。

**Rationale**:
- Honest acknowledgement 優於虛構 enforcement:若聲稱 FR-022 自 v1.0.0 即有 enforcement,但實際 mechanism 不存在,會給 future audit 帶來假陽性。
- v1.0.0 時 Worker 端缺席使「違規空間」客觀為 0 — 規則 vacuously 滿足,不需強制執行任何機制。
- 未來 002 落地時,FR-022 自動取得 mechanical enforcement,無需在 v1.0.0 額外建 stub 機制(避免 over-engineering)。

**Alternatives Considered**:
- B(規則自 v1.0.0 即 active,以 PR review 為今日 enforcement):rejected by user — user 偏好把今日狀態誠實標為 aspirational,而非用 PR review「補位」。
- C(規則 effective date 推遲至 002 landing):rejected by user — 用戶選 A 而非 C 表示規則仍存在於 spec,只是 enforcement 暫不啟動,而非規則本身延後。A 與 C 的差異在於:A 把規則寫進 spec(供 future audit reference),C 不寫(在 002 才入 spec)。
- D(立即加 stub 機制):rejected by user — over-engineering,002 會替換掉。

**Spec impact**: FR-022 段尾增 aspirational rule 標註;SC-011 段尾增「生效時點」標註。

---

## Section 2 — 22 FR Gap Analysis(現狀 vs 規範)

對每條 FR 評估目前 monorepo 狀態,標 ✅(完全達成)/ ⚠(部分達成,有 gap)/ 📅(forward-declared,由 002 或後續 feature 落地)/ ❌(未達成且無 follow-up)。

| FR | 規範摘要 | 狀態 | 證據 / Gap / Follow-up |
|---|---|---|---|
| FR-001 | macOS Apple Silicon + WSL2 Ubuntu 雙平台支援 | ✅ | `.devcontainer/devcontainer.json` `containerEnv.LOCAL_WORKSPACE_FOLDER` 處理 DooD path forwarding;`post-create.sh` 內 Mac/credsStore 條件式偵測 |
| FR-002 | 乾淨機(只 Docker/IDE/Git)→ 跑起 Node stack | ✅ | `docker-compose.yml` 編排 app+db+redis,首次 `make up` 拉起 |
| FR-003 | 所有日常操作在容器內 | ✅ | `Makefile` 集中 `make up/test/lint/typecheck/format`,Worker 端透過 `wrangler dev` 由 002 落地 |
| FR-004 | spec-kit pipeline 內建 | ✅ | `.specify/` 完整 + `extensions.yml` hooks 全套 |
| FR-005 | TDD 紀律(RED→GREEN→REFACTOR) | ✅ | 範例 Node 應用 `tests/node/http-metrics.regression.test.ts` 等已 demonstrate;Worker 端測試由 002 套用同紀律 |
| FR-006 | Node 端 HTTP 觀測預設(/health、/metrics、自動 per-route);Worker 端 /health | ✅ Node ✅ / ✅ Worker(since 002) | `src/node/{app,http-metrics,metrics,logger}.ts` Node 端齊備;Worker 端 `/health` 由 002 落地(`src/worker/routes/health.ts` + `tests/worker/health.test.ts` 3 cases) |
| FR-007 | Claude OAuth credential 隔離 | ✅ | `.devcontainer/devcontainer.json` mount `~/.claude` from host,不烘焙 |
| FR-008 | 機器強制最低 runtime 版本 | ✅ | `engines.node: ">=22"` + `.npmrc` `engine-strict=true` |
| FR-009 | lockfile 同 commit | ✅ | `pnpm-lock.yaml` 已 committed;`Dockerfile` `pnpm install --frozen-lockfile` |
| FR-010 | LF 行尾 repo-enforced | ✅ | `.gitattributes` `* text=auto eol=lf` + `*.sh text eol=lf` |
| FR-011 | Node 端 production image 非 root | ✅ | `Dockerfile` runtime stage `USER app` 顯式 |
| FR-012 | build artifact 不跨主機 bind-mount | ✅ | `docker-compose.yml` `app-node_modules` named volume;`.dockerignore` / `.gitignore` 排除 |
| FR-013 | `/speckit-implement` 前人類 review gate(可作者本人) | ✅ | spec-kit `/speckit-implement` skill 內建 review prompt;憲法 Principle V 規範 |
| FR-014 | SCM credential 由 host 轉發 | ✅ | 由 VS Code Dev Containers 內建 SSH agent forwarding 處理(terminal attach 時 inject `/tmp/vscode-ssh-auth-*.sock` + 對應 `SSH_AUTH_SOCK` env;Mac M1 + WSL2 雙平台已驗 — `ssh -T git@github.com` 通);**先前顯式 `${localEnv:SSH_AUTH_SOCK}` mount 在 Mac launchd path 上 hard-fail,已於 issue #1 修補移除**(commit `8b699c7`)。`post-create.sh:209-230` SSH sanity check 提示 host 端 `ssh-add` 為前提條件 |
| FR-015 | dev / production image 層分離 | ✅ | `Dockerfile` multi-stage(`base` / `deps` / `dev` / `build` / `prod-deps` / `runtime`) |
| FR-016 | feature branch 隔離(`NNN-name`) | ✅ | spec-kit `before_specify=speckit-git-feature` mandatory hook 強制 |
| FR-017 | CI 與 dev container 同 base image | ⚠ | dev container 已就位;**CI workflow 尚未建立**(此 monorepo `.github/` 不存在,屬 known gap);follow-up:於後續 feature(可能為 003 或 002 結束後的維運 feature)補入 `.github/workflows/ci.yml` |
| FR-018 | reference application + derivative 契約(含單一 runtime fork) | ✅ Node ✅ / ✅ Worker(since 002) | Node 端 reference 齊備;Worker 端 reference 由 002 引入(`/health` `/d1/now` `/kv/echo` `/app-api/*` 4 routes,18 cases pass);單一 runtime fork derivative 規範由 spec.md FR-018 已條列(Q1 Clarification) |
| FR-019 | 工具鏈升級為孤立 commit | ✅ | 憲法 Principle V Governance 段規範;B-narrow `chore(deps): bump vitest 2 -> 4`(commit `ec6781a`)為實證 |
| FR-020 | 上游 outage degraded mode | ✅ | `post-create.sh` 對 spec-kit / superpowers 的 install 失敗有明確「上游不可達」訊息(L79-81、L98-101);build 完成的容器 + cache 認證可繼續本地工作 |
| FR-021 | monorepo 結構(`src/{node,worker,shared}` + `tests/{node,worker}`) | ✅ Node + Worker(since 002) | `src/node/` + `tests/node/` 已落地;`src/worker/` / `src/shared/` / `tests/worker/` 由 002 落地內容(全 5 個 worker test 檔 + 4 個 worker route 檔 + Env + jsonError + shared placeholder) |
| FR-022 | 跨 runtime import ban(typecheck-level) | ⚠️ partially mechanical(since 002) | 自 v1.0.0 為 aspirational;002 落地後啟動 mechanical enforcement(雙 tsconfig + `@cloudflare/workers-types`)。對 ambient globals + node:* builtins ✅ 機械擋下;對 explicit named imports(eg. `import { Pool } from 'pg'`)為 advisory(per `specs/002-cloudflare-worker/quickstart.md` T024-T026 evidence)。完全機械化需 ESLint `no-restricted-imports` 補強 — 屬 follow-up feature |

**Gaps 統計(v1.0.0 ratification 時點)**: ✅ 17 / ⚠ 4 / 📅 3 / ❌ 0(其中 ⚠ 與 📅 之間有重疊,因部分 FR 同時對 Node 端 ✅ 對 Worker 端 📅)

**Update 2026-04-30(002-cloudflare-worker 落地後)**:📅 Worker forward-decls 全數兌現(FR-006 / FR-018 / FR-021 → ✅);FR-022 升 ⚠️ partially mechanical(ambient + node:* 機械;explicit named imports 為 advisory)。當前 gaps:✅ 18 / ⚠ 2(FR-017 CI + FR-022 partial)/ 📅 0 / ❌ 0。

**Critical follow-ups**(出 baseline 之外的 gap):

1. **FR-017 CI workflow 不存在**:此 gap 不阻擋 baseline 規格化(spec / plan / contracts 仍可寫),但實際合規驗證需要 CI。建議於 002 結束後或單獨 feature 補建 `.github/workflows/ci.yml`(含雙 OS runner、雙 runtime 測試、secret-scan、lockfile drift)。**不在 001 範圍**(001 只規格化已存在的;CI 屬未來 feature)。
2. ~~**FR-018 / FR-021 / FR-022 對 Worker 端的 📅 部分**:全數依賴 002 落地。~~ ✅ **Resolved 2026-04-30**:002-cloudflare-worker 落地後 FR-018 / FR-021 完全兌現,FR-022 升至 partially mechanical;research.md §1.3 Q3 Clarification 之「自 002 落地後正式計算」已啟動。剩餘 gap 為 FR-022 explicit named imports advisory ↔ mechanical 補強(ESLint `no-restricted-imports`),屬 follow-up feature 範圍。

**Plan 不引入 task 來補這些 gap** — 它們屬於後續 feature 範圍。本 baseline 只規格化「現有 + reserved」狀態,並讓 follow-up 在後續 spec-kit 流程中正式排程。

---

## Section 3 — Out-of-Scope / Deferred Topics

以下話題在 spec / plan 中刻意不展開,避免 scope creep:

- **觀測背端部署**(Prometheus / VictoriaMetrics / Grafana 安裝):baseline 只規範「以標準介面暴露」,不打包 backend stack。Adopter 自行接入。
- **Cloudflare Account 設定 / Zero Trust 整合**:屬 002 與後續 deploy 階段。
- **CI / CD pipeline 細節**:`.github/workflows/` 不在 001 範圍(見 Critical follow-up #1)。
- **README rewrite for v1.0.0 constitution**:`.docs/20260430b-b-narrow-toolchain-cleanup-design.md` 已紀錄為 follow-up;非 001 必要。
- **`vite ^6.0.0` peer pin 拓寬**:B-narrow 已知 follow-up;非 001 spec 範疇。
- **Docker Compose 改 v2 vs 維持當前 schema**:現狀已 work,不引入 churn。

---

## Section 4 — 結論

- 22 FR 中有 17 條完全達成,4 條部分達成(Node ✅ / Worker 📅),1 條 aspirational(FR-022)。0 條未達成且無 follow-up。**Update 2026-04-30**:002 落地後 18 條完全達成,2 條部分達成(FR-017 CI gap + FR-022 partial mechanical)。0 條未達成。
- 3 個 Clarification Decisions 已固化,無遺留 [NEEDS CLARIFICATION]。
- Constitution Check(plan.md)五原則對齊,無 violation。

Phase 0 結束。Phase 1 進入 design artifacts(data-model / contracts / quickstart)。

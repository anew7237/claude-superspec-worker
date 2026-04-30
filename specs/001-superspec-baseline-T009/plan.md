# Implementation Plan: GET /echo Endpoint (SC-007 walkthrough)

**Branch**: `001-superspec-baseline-T009` | **Date**: 2026-04-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-superspec-baseline-T009/spec.md`

## Summary

新增單一無狀態 HTTP route `GET /echo` 於既有 Node 應用,讀取 query string `msg` 後回應 JSON。
缺少或空 msg → 400 + `{"error":"missing msg"}`。實作為 1 個 handler + 對應 vitest 4 測試,
**不引入新依賴**、**不變更既有契約**。本 feature 雙重身份兼具 SC-007 walkthrough 範例
(driving Task T009 of 001-superspec-baseline)。

**技術取徑**:Hono 4.x `app.get('/echo', handler)` 樣式;handler 內 `c.req.query('msg')`
取值;空 / undefined → 400;否則 200。route 自動繼承既有 http-metrics middleware(掛在 `/*`),
無需顯式接線。測試走 Hono `app.request()` mode(同 `tests/node/http-metrics.*.test.ts` 既有
慣例),不啟動真實 server。

## Technical Context

**Language/Version**: TypeScript 5.7+(strict),沿用 baseline。
**Primary Dependencies**: Hono 4.x(已存於 `package.json` `dependencies`)— 新 feature 不增不減。
**Storage**: N/A — `/echo` 為純 stateless echo,不觸 db / redis / KV。
**Testing**: vitest 4.x;新增 `tests/node/echo.test.ts` 走 `app.request()` 模式,涵蓋 happy / 400 / metrics inheritance / log 不污染 console。
**Target Platform**: Node.js ≥ 22,於 dev container 內透過 `pnpm dev` 或 `docker compose up app`;production 行為不變(同 multi-stage Dockerfile)。
**Project Type**: Monorepo 內的 Node application(`src/node/`)單檔修補 + 單檔測試新增。
**Performance Goals**: 100% 之 happy path < 5 ms server-side(Hono 處理 + 無 IO);完全位於 `/health` 同量級 budget 下。
**Constraints**:

- **不可** 在 Node 應用碼引入 `console.*`(per 001 baseline SC-009;ESLint `no-console: error` 已機械擋下)。
- **不可** 引入新 npm 依賴(per spec.md「不引入新依賴」)。
- **必須** 兌現 metrics 自動繼承(US3 / FR-005);若需顯式手寫 metrics 樣板,即代表 baseline observability invariant 1 已破。
- **必須** 通過 mandatory gates(`pnpm test/typecheck/lint/prettier --check`);RED→GREEN→REFACTOR 紀律。

**Scale/Scope**: 1 route,僅 happy + 1 error branch;測試覆蓋 ≥ 4 cases(HAPPY、400、metrics 繼承、無 console)。

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

依憲法 v1.0.0 五原則對照:

| Principle | 對齊狀態 | 證據 / 對應 |
| --- | --- | --- |
| **I. Test-First Development (NON-NEGOTIABLE)** | ✅ | Phase 1 contracts/ 將先列 echo.contract.md 描述 endpoint 行為;Phase 2 tasks 將要求先寫 `tests/node/echo.test.ts`(RED)再實作 `app.get('/echo', ...)`(GREEN)。 |
| **II. Observability by Default** | ✅ | 不顯式接 metrics — 完全依賴 baseline `httpMetrics()` middleware closure 自動覆蓋(observability.md §1.3 不變量 1)。pino logger 走預設管道。 |
| **III. Container-First Development, Per-Runtime Deployment** | ✅ | route 落在 `src/node/app.ts`,於既有 Node 應用 image 內;不影響 Worker(本 feature 屬 Node-only,Worker 端無 echo 對等;若 002 需要可單獨增)。 |
| **IV. Type Safety End-to-End** | ✅ | handler 簽名沿用 Hono `(c: Context) => Response` 慣例;`c.req.query('msg')` 回傳 `string \| undefined`,TypeScript 強制處理 undefined 分支;不需 cast 或 type assertion。 |
| **V. Spec-Driven Development** | ✅ | 本 plan 即 SDD pipeline 產物;feature branch `001-superspec-baseline-T009` 由 `before_specify` hook(GIT_BRANCH_NAME 覆蓋)建立;spec checklist 16/16 全綠;`/speckit-implement` 前的人類 review gate 由 user(本 maintainer)親自 review。 |

**結論**:無 violations,Phase 0 可放行。Plan 不引入任何 deviation,因此 Complexity Tracking 留空。

## Project Structure

### Documentation (this feature)

```text
specs/001-superspec-baseline-T009/
├── plan.md                  # 本檔
├── spec.md                  # /speckit-specify 輸出
├── research.md              # Phase 0 輸出 — 本 feature 因無 unknowns,research 主要 cite baseline 既有決策
├── data-model.md            # Phase 1 輸出 — N/A(stateless,無 entity);只放一份 minimal note
├── quickstart.md            # Phase 1 輸出 — adopter 如何手動驗證
├── contracts/
│   └── echo.contract.md     # Phase 1 輸出 — endpoint contract(input / output / error)
├── checklists/
│   └── requirements.md      # spec quality checklist
└── tasks.md                 # Phase 2 輸出 — 由 /speckit-tasks 產生(本指令不建)
```

### Source Code (repository root)

本 feature 僅修補既有 Node 應用內 1 檔 + 新增 1 測試:

```text
src/node/
├── app.ts            # 既有檔,本 feature 於此新增 app.get('/echo', handler) 一段
├── index.ts          # 不動
├── db.ts             # 不動
├── redis.ts          # 不動
├── logger.ts         # 不動
├── metrics.ts        # 不動
└── http-metrics.ts   # 不動(/echo 自動繼承)

tests/node/
├── echo.test.ts      # 【新增】4+ cases:happy / 400 / metrics inheritance / no console pollution
├── health.test.ts    # 不動
├── metrics.test.ts   # 不動
└── http-metrics.*.ts # 不動
```

**Structure Decision**:單檔修補(`src/node/app.ts`)+ 單測試新增(`tests/node/echo.test.ts`)。
不新增 module、不抽 helper、不變更現有 import graph;遵守 SC-007 walkthrough 之精簡精神。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

(無 violation;本 feature 與五原則完全對齊)

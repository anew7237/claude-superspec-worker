# Phase 0 Research: GET /echo Endpoint (SC-007 walkthrough)

**Date**: 2026-04-30
**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)

## Section 1 — Unknowns(無)

本 feature 為 trivial endpoint,所有歧義已於 spec.md `## Assumptions` 段以合理 default 補足:

1. Hono 4.x query string 解析語意 — `c.req.query('msg')` 回傳第一個值(若多個);
2. 空字串 `?msg=` 視為 missing — 對應 spec FR-003 / Assumption 2;
3. URL-encoded 字元由 framework 自動解碼 — Hono 內建。

無 `[NEEDS CLARIFICATION]` marker 待解。

## Section 2 — 既有 baseline 決策複用(cite,不重 derive)

| 決策 | 來源 | 對本 feature 之影響 |
| --- | --- | --- |
| Hono 4.x 為 web framework | `.specify/memory/constitution.md` §Technology Stack(Shared 段)+ 001 baseline plan §Technical Context | `app.get('/echo', handler)` 註冊樣式 |
| http-metrics middleware 掛 `/*` | `001-superspec-baseline/contracts/observability.md` §1.4 不變量 1(`src/node/app.ts:19`)+ `httpMetrics()` factory(`src/node/http-metrics.ts:120`) | `/echo` 自動繼承,不需顯式接線 |
| pino structured log 為唯一 stdout 通道 | constitution v1.0.0 §II Observability + 001 baseline FR-006 / SC-009 | handler 內若需 log → 用 `logger.info({...})`;絕不 `console.*` |
| `no-console: error` ESLint rule on `src/**/*.ts` | `eslint.config.js`(已 verify by 001 baseline T002) | 機械擋下 `console.*`,SC-009 自動兌現 |
| vitest 4 + Hono `app.request()` 測試 mode | 既有 `tests/node/http-metrics.test.ts` 等實證 | `tests/node/echo.test.ts` 採同模式,不啟真實 server |
| TypeScript strict mode + `c.req.query()` 回傳 `string \| undefined` | `tsconfig.json` strict + Hono types | handler 強制處理 undefined 分支(TS-level) |

## Section 3 — 替代方案(已評估後 reject)

| 替代方案 | 為何 reject |
| --- | --- |
| 用 `c.req.queries('msg')` 取所有 msg 值並返回 array | 違反 spec.md Assumption 3「取第一個值」;且超出 SC-007 trivial 邊界 |
| 用 zod / valibot 做 schema 驗證 | 引入新依賴;違反 spec.md「不引入新依賴」;`if (!msg) return 400` 已足夠 trivial 驗證 |
| 把 msg 長度上限明列為 spec 規則 | 上層 reverse proxy / Node http parser 已有預設(典型 8 KB URI / 8 MB body);Hono level 不需加;reject(per spec edge case 註) |
| 改用 POST /echo 接收 body | spec 明示 GET + query string;若需 POST 屬不同 feature scope |
| 把 `/echo` 直接放 dev `routes/` sub-folder 而非 `app.ts` 註冊 | 既有 baseline 沒有 sub-route 拆分慣例(`/`、`/health`、`/metrics` 都直接在 `app.ts`);拆分屬重構,超出 trivial scope |

## Section 4 — Out of Scope(刻意不做)

- **rate limiting / auth on /echo**:per spec.md Assumption 4,public endpoint mode,adopter 自行於 reverse proxy 加。
- **OpenAPI / Swagger 自動文件**:001 baseline 未引入 OpenAPI 工具鏈,本 feature 不破例;`echo.contract.md` 為人類可讀格式即可。
- **i18n 錯誤訊息**:`{"error":"missing msg"}` 字面英文;若 derivative 需 i18n 屬上層擴充。
- **request id / correlation 透過 echo response 回顯**:屬未來 observability 增強,非本 feature 範疇。

## Section 5 — 結論

無 unknowns 待解;本 plan 於 Phase 1 直接產出 contracts/ + quickstart.md + 最小 data-model 紀錄,
即可進入 `/speckit-tasks`。Phase 0 結束。

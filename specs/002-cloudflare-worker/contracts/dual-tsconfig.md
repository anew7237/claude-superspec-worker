# Contract: Dual TypeScript Configuration + Cross-Runtime Import Ban

**Audience**: Adopter / PR reviewer / typecheck pipeline / future tsconfig 維護者
**Surface owner**: `tsconfig.json`(base)+ `tsconfig.node.json` + `tsconfig.worker.json` + `package.json` `scripts.typecheck`
**Related FR / SC**: FR-002, FR-009, SC-001, SC-009;**兌現** 001 baseline FR-022 + SC-011 從 aspirational 升 mechanical

## 1. 三檔 tsconfig 結構

### 1.1 `tsconfig.json`(base)

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "allowImportingTsExtensions": true
  }
}
```

**不變量**:

- 無 `include` / `exclude`(由子 config 決定)
- 無 `types` / `lib`(由子 config 決定;避免 leak globals)

### 1.2 `tsconfig.node.json`

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src/node/**/*", "src/shared/**/*", "tests/node/**/*"]
}
```

**不變量**:

- `types: ["node"]` — 含 Node 標準庫 types;**不**含 Workers types
- `include` 三 path 互斥於 worker config 之 `include`(除 `src/shared/**`)
- 此 tsconfig 對 `import { D1Database } from '@cloudflare/workers-types'` typecheck **MUST fail**(因 workers-types 不在 types array)

### 1.3 `tsconfig.worker.json`

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": [
      "@cloudflare/workers-types/2023-07-01",
      "@cloudflare/vitest-pool-workers/types"
    ]
  },
  "include": [
    "src/worker/**/*",
    "src/shared/**/*",
    "tests/worker/**/*",
    "vitest.config.worker.ts"
  ]
}
```

**不變量**:

- `types` 含 workers-types **+** vitest-pool-workers/types(後者必含,per 設計源 §2.3 lesson 2)
- `include` 三 path + `vitest.config.worker.ts`(讓 plugin import 被 typecheck 看見)
- 此 tsconfig 對 `import { pool } from 'pg'` typecheck **MUST fail**(因 `@types/node` 不在,且 `pg` module 之 type 不解析)

> **Note(subpath vs compatibility_date 獨立性)**:`@cloudflare/workers-types ^4` 之 types 入口 subpath 為 `@cloudflare/workers-types/2023-07-01`(workers-types v4 ship 之唯一 subpath);此值與 `wrangler.jsonc` 之 `compatibility_date: 2025-09-01` **互為獨立**。Runtime compatibility date 由 wrangler 之 compat-date 機制決定,types subpath 僅為 npm package 內部 path convention,**不會**隨 `compatibility_date` 升版而改。reviewer 讀 spec FR alone 若 expect subpath 對應到 2025-09-01,實際應以本 contract 與 npm package 內部結構為準。

### 1.4 `tsconfig.lint.json`(既有,本 feature 沿用 + 擴 include)

ESLint flat config 用此檔做 type-aware linting。本 feature **擴 include** 至涵蓋 Worker side:

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["node", "@cloudflare/workers-types/2023-07-01"]  // ← 加 workers-types,讓 lint 看得到 Worker side
  },
  "include": ["src/**/*", "tests/**/*", "*.ts", "*.js", ".specify/**/*.ts"]
}
```

**不變量**:

- `tsconfig.lint.json` 因 ESLint 全 repo lint 需要全 types,故 types 集合**較寬**;**這不破壞** cross-runtime ban,因 ESLint **僅 lint**,真 typecheck 仍由 `tsconfig.{node,worker}.json` 各自獨立執行

## 2. `package.json` `scripts.typecheck`

```jsonc
{
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.worker.json"
  }
}
```

**不變量**:

- 串接執行兩 tsconfig;**任一 fail 即整體 fail**(per shell `&&` semantics)
- 順序為 node-first;非語意性,可調

## 3. Cross-runtime import ban — 機械強度

### 3.1 兩面擋(實際機械強度,per T024-T026 verify)

`tsconfig.{node,worker}.json` 的 `types` array 機制在 TypeScript 中**只控 ambient/global types 的自動載入**,不控制 explicit module imports 的解析。實際機械強度因此分兩層:

| 違規類型 | 擋下 mechanism | 訊息 / 範例 |
| --- | --- | --- |
| **(✅ 機械)** Node 端用 Worker ambient 名稱不 import(`let x: D1Database;`)| `tsc -p tsconfig.node.json --noEmit` exit ≠ 0 | `Cannot find name 'D1Database'` |
| **(✅ 機械)** Worker 端用 `node:*` builtins(`import * as fs from 'node:fs'`)| `tsc -p tsconfig.worker.json --noEmit` exit ≠ 0 | `Cannot find module 'node:fs'`(`@types/node` 不在 worker `types`)|
| **(✅ 機械)** Worker 端 ambient `process` / `Buffer` 等 Node global | 同上 | `Cannot find name 'process'` |
| **(✅ 機械, since v1.1.3)** Node 端 `import type { D1Database } from '@cloudflare/workers-types'` | ESLint `no-restricted-imports` rule(per `eslint.config.js` `src/node/**/*.ts` block,patterns `@cloudflare/workers-types` + `cloudflare:*`)→ `pnpm lint` 直接 error | `'@cloudflare/workers-types' import is restricted from being used by a pattern. Worker-only types in Node code (FR-022 violation; Node runtime cannot use D1/KV/Workers globals).` |
| **(✅ 機械, since v1.1.3)** Worker 端 `import { Pool } from 'pg'` | ESLint `no-restricted-imports` rule(per `eslint.config.js` `src/worker/**/*.ts` block,patterns `pg` / `redis` / `pino` / `prom-client` / `@hono/node-server` / `node:*`)→ `pnpm lint` 直接 error | `'pg' import is restricted from being used by a pattern. Node-only Postgres driver in Worker code (FR-022; Workers runtime has no TCP socket support for pg).` |

**結論**:
- 對 ambient + `node:*` 違規 → ✅ 完全機械擋下(Layer 1 雙 tsconfig)
- 對 explicit named imports → ✅ 完全機械擋下(Layer 2 ESLint `no-restricted-imports`,since v1.1.3)
- 兩層皆 mandatory gate(`pnpm typecheck` + `pnpm lint`)→ FR-022 全機械化,**advisory gap 已關閉**

### 3.2 `src/shared/**` 例外規則

`src/shared/**` 被**兩** tsconfig 之 `include` 同時涵蓋。其檔案 typecheck 必須:

- 僅 import 於兩 tsconfig 之 types array 都解析得到的 module(在 starter 階段為**無**外部 module,純 TS literal types / constants)
- **不** import `node:*` builtins 或 `@cloudflare/workers-types` API
- 違反強度同 §3.1:
  - 若違規路徑為 ambient 名稱 / `node:*` builtin → 兩 tsconfig 都 fail(✅ 雙重保險,Layer 1 機械)
  - 若違規路徑為 explicit named import(eg. `import type { D1Database }` / `import { Pool } from 'pg'`)→ ESLint `no-restricted-imports` `src/shared/**/*.ts` block 為 Layer 2 機械(per `eslint.config.js`,union ban list = node-side + worker-side 兩條黑名單合併)→ `pnpm lint` 直接 error

## 4. 不變量(must)

1. **`pnpm typecheck` exit 0** 為 mandatory gate(per 001 baseline quality-gates.md);本 feature 落地後**自動**保證 cross-runtime ban
2. **新增 Node-only 或 Worker-only module 至 deps 不破壞此契約**;若 adopter 加 deps,只要不 cross import 即無事
3. **修改 tsconfig types array 須 PR review**;隨意加 `@cloudflare/workers-types` 至 Node tsconfig 即破壞 ban,reviewer 駁回
4. **`src/shared/**` 原則上只放 types + constants**(無 runtime side effects);adopter 若放 runtime helper,須確保跨兩 runtime 行為相同(testable 於兩 pool)

## 5. 失敗模式

| 場景 | 期望行為 |
| --- | --- |
| Node 開發者誤 `import type { D1Database } from '@cloudflare/workers-types'` | ESLint `no-restricted-imports`(per `eslint.config.js` `src/node/**/*.ts` block)→ `pnpm lint` exit ≠ 0;PR 不可 merge(✅ 完全機械,Layer 2,since v1.1.3) |
| Node 端 ambient `let x: D1Database` 不 import 直接用 | `tsc -p tsconfig.node.json` fail with `Cannot find name 'D1Database'`;PR 不可 merge(✅ 完全機械,Layer 1) |
| Worker 開發者誤 `import { Pool } from 'pg'` | ESLint `no-restricted-imports`(per `eslint.config.js` `src/worker/**/*.ts` block,patterns `pg` / `redis` / `pino` / `prom-client` / `@hono/node-server` / `node:*`)→ `pnpm lint` exit ≠ 0;PR 不可 merge(✅ 完全機械,Layer 2,since v1.1.3) |
| Worker 端 `import * as fs from 'node:fs'` | `tsc -p tsconfig.worker.json` fail with `Cannot find module 'node:fs'`(`@types/node` 不在 worker `types`);PR 不可 merge(✅ 完全機械,Layer 1) |
| Worker 端 ambient `process.env.X` | 同上 fail with `Cannot find name 'process'`(✅ 完全機械,Layer 1) |
| `src/shared/error-codes.ts` import `node:fs` | 兩 tsconfig 都 fail(✅ 完全機械,Layer 1 雙重保險) |
| `src/shared/types.ts` `import type { D1Database }` | ESLint `no-restricted-imports` `src/shared/**/*.ts` block(union ban list)→ `pnpm lint` exit ≠ 0(✅ 完全機械,Layer 2,since v1.1.3) |
| 新增 `@cloudflare/workers-types` 至 `tsconfig.node.json` `types` | typecheck 仍綠但 cross-runtime ban 破功;reviewer 駁回(advisory gate;屬 config 層 meta-violation,不在 import-rule 涵蓋範圍) |
| `tsconfig.worker.json` `types` 漏掉 `@cloudflare/vitest-pool-workers/types` | `cloudflare:test` import fail at typecheck(per 設計源 §2.3 lesson 2);Worker pool tests 不可 typecheck |
| `tsconfig.json` base 改開 `noEmit: false` | 編出 `dist/` 進 git 風險;reviewer 駁回(屬 build pipeline 變更,需 spec amendment) |

## 6. SC-011 mechanical 計算啟動點

001 baseline SC-011:

> Node 端模組與 Worker 端模組之間的「跨 runtime import 違規」(Node 端 import D1/KV 型別、或 Worker 端 import `pg`/`redis`/`pino`/`prom-client`)在 PR merge 前 0 次發生 — 由 typecheck 機械擋下,而非 reviewer 人工抓。**生效時點**:此 SC 自 002-cloudflare-worker 落地(雙 tsconfig + Workers types 就位)後正式開始計算違規數。

**本 feature 落地即啟動點**:從本 commit 起 SC-011 計算 active。違規數**目標 0**:
- 對 **ambient + `node:*` 類違規**:每次 PR 過 mandatory gate `pnpm typecheck` 即機械擋下(Layer 1,zero false negative)
- 對 **explicit named imports 類違規**:每次 PR 過 mandatory gate `pnpm lint` 即機械擋下(Layer 2 ESLint `no-restricted-imports`,since v1.1.3)

**Honest disclosure**:本契約之初版描述把 SC-011 機械強度過度承諾為「完全 typecheck 機械擋下」;T024-T026 verify 已修正為「partial mechanical」(僅 Layer 1)。**Update (v1.1.3)**:P2 commit `193a35e` 落地 ESLint `no-restricted-imports` follow-up,把 explicit named imports 類違規從 advisory 升為 mechanical(Layer 2);兩層合計 SC-011 已**完全機械化**,advisory gap 全關閉。對應 baseline-traceability-matrix.md 之 FR-022/SC-011 row 已更新為 ✅ fully mechanical。

## 7. 對 derivative 的 advisory

替換 framework / 加新 runtime(如 Bun)後,adopter 須:

- 為新 runtime 加 `tsconfig.bun.json` 等同模式
- 擴 `pnpm typecheck` script 串接執行
- 維持 cross-runtime ban 精神(各 runtime types array 不重疊)
- `src/shared/**` 仍維持 runtime-agnostic 原則

## 8. 與 `pnpm lint`(ESLint)之關係

ESLint 用 `tsconfig.lint.json`(types 較寬);它的職責是**整 repo lint** 不是 type isolation。
type isolation **必由 `pnpm typecheck`(雙 tsconfig)落實**,ESLint 不接手該責任。

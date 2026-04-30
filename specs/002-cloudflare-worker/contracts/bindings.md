# Contract: Worker Bindings (D1 / KV / UPSTREAM_URL)

**Audience**: Adopter / Worker-side test author / wrangler 配置維護者
**Surface owner**: `src/worker/env.ts`(TypeScript interface)+ `wrangler.jsonc`(binding 宣告)+ `.dev.vars`(local secrets)+ `wrangler secret put`(production secrets)
**Related FR / SC**: FR-005, FR-006, FR-007, FR-009, FR-011, SC-003

## 1. `Env` interface

`src/worker/env.ts`:

```ts
export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  UPSTREAM_URL: string;
}
```

**不變量**:

- `Env` 為 Worker handler 收到的 binding 集合;由 Cloudflare runtime 注入,Worker 不持有實例
- 三欄全為 required(`?` 不允許);若新增 binding 為 starter 範圍外,屬 derivative 擴充

## 2. `wrangler.jsonc` 宣告(repo root)

```jsonc
{
  "name": "claude-superspec-worker",
  "main": "src/worker/index.ts",
  "compatibility_date": "2025-09-01",
  "vars": {
    "UPSTREAM_URL": "http://localhost:8000",
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "claude-superspec-worker",
      "database_id": "<填於 wrangler d1 create 後>",
    },
  ],
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": "<填於 wrangler kv namespace create 後>",
    },
  ],
}
```

**不變量**:

- `binding` field 名稱(`DB` / `KV`)必與 `env.ts` interface 之 key 完全相同
- `database_id` / `id` 為 Cloudflare-side 之 namespace id(36-char UUID-like 字串);**不**為 secret,可 commit
- **不啟** `compatibility_flags: ["nodejs_compat"]`(per 設計源 §2.3 lesson 7)
- **不寫 secret 進此檔**;secret 走 `wrangler secret put` 或 `.dev.vars`

## 3. `UPSTREAM_URL` 來源優先序

依 wrangler 之解析順序(高到低):

1. **`wrangler secret put UPSTREAM_URL`**(production override;經 Cloudflare Dashboard secret store)
2. **`.dev.vars`**(local dev override;gitignored,per 001 baseline `.gitignore` already includes)
3. **`wrangler.jsonc` `vars.UPSTREAM_URL`**(預設值,本 monorepo 為 `http://localhost:8000`)
4. **若以上皆無 / 為空**:Worker `/app-api/*` route 回 503 `upstream_not_configured`(per reverse-proxy.md §3)

## 4. `.dev.vars` 結構

`.dev.vars`(repo root,gitignored):

```ini
UPSTREAM_URL=http://host.docker.internal:8000
```

**不變量**:

- `.dev.vars` 為 KEY=VALUE 簡單格式(per wrangler 慣例),**不**支援 quote escaping 或 comment
- **永不**進 git(per 001 baseline `.gitignore` line 26 已含)
- adopter 自帶 `.dev.vars.example`(本 feature 新增)為 template,可進 git

## 5. `.dev.vars.example`(template,可 commit)

`.dev.vars.example`(repo root):

```ini
# Local secrets for `wrangler dev`. Copy to .dev.vars and edit:
#   cp .dev.vars.example .dev.vars
#
# Mode A (host-only): `pnpm dev:node + dev:worker`
#   UPSTREAM_URL=http://localhost:8000
#
# Mode B (docker compose): `make up + dev:worker`
#   UPSTREAM_URL=http://host.docker.internal:8000
#   (Linux 自架 Docker Engine 需 .devcontainer/devcontainer.json
#    runArgs 加 --add-host=host.docker.internal:host-gateway)

UPSTREAM_URL=http://localhost:8000
```

## 6. miniflare bindings(test-time)

`vitest.config.worker.ts` 之 `cloudflareTest` plugin 配置 miniflare:

```ts
miniflare: {
  compatibilityDate: '2025-09-01',
  d1Databases: ['DB'],
  kvNamespaces: ['KV'],
  bindings: { UPSTREAM_URL: 'http://localhost:8000' },
},
```

**不變量**:

- miniflare 提供 in-memory D1 + KV 等價物,test 不打真 Cloudflare API
- `compatibilityDate` 與 `wrangler.jsonc` 同(`2025-09-01`)— 確保 test runtime 與 deploy runtime 行為一致
- test bindings 之 UPSTREAM_URL 用 `http://localhost:8000`(test stub 之 fetch mock 不實打);若需 override 用 cast pattern(per 設計源 §2.3 lesson 3)

## 7. 不變量(must)

1. **wrangler.jsonc 不含 secret**:`UPSTREAM_URL` 在 `vars` 為 placeholder default 而非 secret;真 secret 走 `wrangler secret put`
2. **Env interface 三欄全 required**:`?` 不允許;adopter 加 binding 須同步擴 interface + wrangler.jsonc
3. **Binding name 大小寫嚴格**:`DB` / `KV` / `UPSTREAM_URL` 全大寫(per Workers 慣例)
4. **D1 placeholder schema**:starter 不 ship migrations 檔;adopter 自家 schema 走 `wrangler d1 migrations apply`
5. **KV 為 read-only demo**:starter 不暴露 write route;`wrangler kv key put` 僅 seed 工具

## 8. 失敗模式

| 場景 | 期望行為 |
| --- | --- |
| `database_id` 仍為 `<填於 wrangler d1 create 後>` placeholder | `wrangler dev` / `wrangler deploy` 階段警告或 fail;adopter 須執行 walkthrough Step 3 填入 |
| `database_id` 填錯(指向不存在 namespace)| `/d1/now` runtime error → 500 `d1_query_failed` |
| `.dev.vars` 不存在 | wrangler dev 用 `wrangler.jsonc` `vars` 之預設;不 fail |
| `.dev.vars` 與 `wrangler.jsonc` `vars` 對同 key 設不同值 | `.dev.vars` 勝出(per wrangler 解析順序) |
| Production deploy 後 `wrangler secret put` 漏設 | runtime 拿到 `vars.UPSTREAM_URL` 預設(`http://localhost:8000`)— 在 Cloudflare edge 上不可達 → 502 `upstream_unreachable` |

## 9. 對 derivative 的 advisory

替換 binding 集合(加 R2 / Durable Object / Queues)後:

- 必同步擴 `Env` interface
- 必同步擴 `wrangler.jsonc`
- `tsconfig.worker.json` `types` array 視需求加(若新 binding type 在 `@cloudflare/workers-types` 預設 export,通常不需動)
- test 端 `cloudflareTest` plugin 之 miniflare config 視需求加(R2 / Durable Object 等需明示 binding)
- 本 contract 之三欄 Env interface 為**最低限**;移除 D1 / KV / UPSTREAM_URL 任一條合法但破壞既有 routes(`/d1/now` `/kv/echo` `/app-api/*`)

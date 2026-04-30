# Quickstart: Cloudflare Worker Runtime + Monorepo Dual-Runtime

**Audience**: Adopter on macOS Apple Silicon or WSL2 Ubuntu
**Goal**: 從乾淨機器(Docker / IDE / Git / 可選 Cloudflare free-tier account)→ Node + Worker 並存
demo 全綠 → first-time deploy 至 Cloudflare,於 ≤ 30 min 內完成。

> 本 quickstart 涵蓋兩 mode(per Q1 Clarification):
>
> - **Mode A — quick demo**:`pnpm dev:node` + `pnpm dev:worker` 純 host process,**5 分鐘** 看到 Worker `/health` + `/d1/now` + `/kv/echo` + `/app-api/health` 透傳
> - **Mode B — full demo**:`make up` + `pnpm dev:worker`,**10 分鐘** 看到 6 個對照 endpoint 全 200(含 Postgres / Redis backed `/app-api/now` `/app-api/echo`)
> - **Mode C — first-time deploy**:從 Mode A/B 之上,完成 Cloudflare account 設定 + `wrangler deploy`,**30 分鐘**(per FR-012 + SC-005)

## Step 0 — 前置(一次性)

依 001 baseline quickstart 完成 Step 0(devcontainer / Claude Code OAuth / Docker Desktop)。**本 feature 額外不需新前置**(wrangler 由 `pnpm install` 帶入)。

若選 Mode C(first-time deploy),額外:

- 註冊 Cloudflare account(free tier 即足以 demo)
- 容器內 `pnpm exec wrangler login`(會跳 browser-based OAuth;若 dev container 無瀏覽器 forwarding,可在 host 跑 `wrangler login` 後 token 共享)

## Mode A — quick demo(~5 min)

於 dev container 內 terminal:

```bash
# 1. install(若尚未)
pnpm install --frozen-lockfile

# 2. 起 Node 端(背景)
pnpm dev:node &
NODE_PID=$!

# 3. 起 Worker dev(背景,於 :8787)
pnpm dev:worker &
WORKER_PID=$!

# 4. 等 5 秒
sleep 5

# 5. probe Worker side
curl -sS http://localhost:8787/health
# 期望: {"status":"ok","service":"worker","ts":"2026-04-30T..."}

curl -sS http://localhost:8787/d1/now
# 期望: {"source":"d1","now":"2026-04-30 ..."}(miniflare in-memory D1 自動 init)

# (KV demo 需 seed,Mode A 跳過,留給 Mode B 完整版)

# 6. probe Node side(/app-api/* 因無 docker compose,僅 health 不需 db/redis 可達)
curl -sS http://localhost:8000/app-api/health
# 期望: {"status":"ok","service":"nodejs"}

# 7. probe Worker proxy 透傳
curl -sS http://localhost:8787/app-api/health
# 期望: 同 step 6 之 body(透傳)

# 8. 收場
kill $NODE_PID $WORKER_PID
```

**Mode A 限制**:`/app-api/now` `/app-api/echo` 因無 Postgres / Redis backing 會回 500(`pg_query_failed` / `redis_get_failed`);這是預期行為。完整 demo 走 Mode B。

## Mode B — full demo(~10 min)

於 dev container 內 terminal:

```bash
# 1. install(若尚未)
pnpm install --frozen-lockfile

# 2. 確保 .dev.vars 設定為 mode B
cp .dev.vars.example .dev.vars
# 編輯 .dev.vars,把 UPSTREAM_URL 設為 http://host.docker.internal:8000
#
# (Linux 自架 Docker Engine 之 dev container 需 .devcontainer/devcontainer.json
#  runArgs 加 --add-host=host.docker.internal:host-gateway,per plan key decision 7)

# 3. 起 Node 端 docker compose stack(含 Postgres + Redis)
make up
# 期望: 三 service(app / db / redis)healthy

# 4. seed Redis(host shell;用 docker compose exec)
docker compose exec redis redis-cli SET foo "hello-from-redis"
# 期望: OK

# 5. 起 Worker dev
pnpm dev:worker &
WORKER_PID=$!
sleep 3

# 6. seed local KV
pnpm exec wrangler kv key put --binding=KV foo "hello-from-kv" --local
# 期望: OK

# 7. 跑全 6 對照 endpoint
echo "--- Cloudflare-native ---"
curl -sS http://localhost:8787/health
curl -sS http://localhost:8787/d1/now
curl -sS 'http://localhost:8787/kv/echo?k=foo'

echo "--- Through Node proxy(/app-api/*)---"
curl -sS http://localhost:8787/app-api/health
curl -sS http://localhost:8787/app-api/now
curl -sS 'http://localhost:8787/app-api/echo?k=foo'

# 期望(節錄)
# {"source":"d1","now":"..."}        ← Worker D1
# {"source":"kv","key":"foo","value":"hello-from-kv"}      ← Worker KV
# {"status":"ok","service":"nodejs"}                        ← Worker proxy → Node /app-api/health
# {"source":"postgres","now":"..."}                         ← Worker proxy → Node /app-api/now
# {"source":"redis","key":"foo","value":"hello-from-redis"} ← Worker proxy → Node /app-api/echo

# 8. 收場
kill $WORKER_PID
make down
```

## Mode C — first-time deploy(~30 min,per FR-012 / SC-005)

需 Cloudflare account。

```bash
# 1. wrangler login(host 端或 dev container,擇便;會開 browser)
pnpm exec wrangler login

# 2. 建 D1 namespace,記下 database_id
pnpm exec wrangler d1 create claude-superspec-worker
# 期望輸出: 含 "database_id": "<32-char hex>" 之 JSON
# → 把 database_id 填入 wrangler.jsonc d1_databases[0].database_id

# 3. 建 KV namespace,記下 id
pnpm exec wrangler kv namespace create KV
# 期望輸出: 含 "id": "<32-char hex>" 之 JSON
# → 把 id 填入 wrangler.jsonc kv_namespaces[0].id

# 4. (optional)apply D1 migrations(starter 無 migrations,跳過或 noop)
pnpm exec wrangler d1 migrations apply claude-superspec-worker --remote || echo "no migrations"

# 5. seed 部署 KV(讓 /kv/echo demo 不空)
pnpm exec wrangler kv key put --binding=KV foo "hello-from-kv" --remote

# 6. (optional)若想讓部署 Worker proxy 至 host docker 上的 Node 應用
#    a) host 開 cloudflared tunnel: cloudflared tunnel --url http://localhost:8000
#    b) 拿到 https://<random>.trycloudflare.com URL
#    c) 設 secret: pnpm exec wrangler secret put UPSTREAM_URL  (貼上 tunnel URL)

# 7. deploy
pnpm exec wrangler deploy
# 期望: "Uploaded claude-superspec-worker" + 部署 URL

# 8. probe deployed Worker
DEPLOYED=https://claude-superspec-worker.<your-account>.workers.dev
curl -sS $DEPLOYED/health
# 期望: {"status":"ok","service":"worker","ts":"..."}
curl -sS $DEPLOYED/d1/now
# 期望: {"source":"d1","now":"..."}
curl -sS "$DEPLOYED/kv/echo?k=foo"
# 期望: {"source":"kv","key":"foo","value":"hello-from-kv"}

# 9. (若步驟 6 完成)
curl -sS $DEPLOYED/app-api/health
# 期望: {"status":"ok","service":"nodejs"} (透傳自 host docker 上的 Node 端)
```

## Step 6 — Quality gates 驗證

於 dev container 內(任何 mode 都應綠):

```bash
pnpm test         # node + worker 雙 pool 全綠
pnpm typecheck    # 雙 tsconfig 串接 exit 0
pnpm lint         # exit 0
pnpm exec prettier --check .   # exit 0
```

任一 fail 即視為 baseline regression(per 001 baseline quality-gates.md mandatory gates + 本 feature SC-009)。

## Step 7 — 我卡住了

| 症狀 | 動作 |
| --- | --- |
| `pnpm test:worker` 報 `cloudflare:test` 模組找不到 | `tsconfig.worker.json` `types` array 含 `@cloudflare/vitest-pool-workers/types`?(per 設計源 §2.3 lesson 2) |
| `pnpm test:worker` 報 `defineWorkersConfig` 找不到 | 改用 `cloudflareTest` plugin pattern,**不** import `defineWorkersConfig`(per lesson 1) |
| Mode B 下 Worker 連不到 Node | `.dev.vars` `UPSTREAM_URL` 為 `http://host.docker.internal:8000`?Linux 自架 Engine 還需 runArg `--add-host=host.docker.internal:host-gateway` |
| `wrangler dev` 卡 OAuth login | `pnpm exec wrangler login` 在 host 端跑;dev container 無瀏覽器 forwarding 時無法 OAuth |
| `wrangler deploy` 報 binding fail | `wrangler.jsonc` 之 `database_id` / `id` 仍為 `<填於...>` placeholder;依 Mode C step 2-3 取真 ID 填入 |
| `pnpm typecheck` 報 Node 端 `D1Database` 不存在 | 違反 cross-runtime import ban(per dual-tsconfig.md);把 import 移到 `src/worker/**` |

## Step 8 — Acceptance — 你完成了嗎?

- [ ] **Mode A**:6 條 curl 全綠(其中 `/app-api/now` `/app-api/echo` 預期 500,屬 mode A 限制)
- [ ] **Mode B**:6 條 curl 全 200(含 Postgres + Redis backed)
- [ ] **Quality gates**:`pnpm test/typecheck/lint/prettier --check .` 全 exit 0
- [ ] **Mode C(若做)**:wrangler deploy 成功 + 部署 URL `/health` `/d1/now` `/kv/echo?k=foo` 全 200
- [ ] **跨平台**(若做):Mac M1 + WSL2 同一 commit 之 `pnpm test` 結果 byte-equivalent(per FR-013 / SC-002)

✅ 全部勾選 → 本 feature 完整兌現,Worker runtime 端與 Node runtime 端真正並存,001 baseline 之
FR-018 / FR-021 / FR-022 / SC-011 自此 mechanical active。

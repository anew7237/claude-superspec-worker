# Claude Code + Spec-Kit + Dev Containers - Template

> 跨平台(macOS Apple Silicon / Windows WSL2 Ubuntu)的 spec-driven
> development 工作環境,整合 GitHub Spec-Kit、Claude Code、與
> obra/superpowers,在 devcontainer 內透過 docker-outside-of-docker
> (DooD) 開發容器化的應用程式。

## 為什麼用這個 template

- **跨機器無痛切換** — Mac M1 跟 WSL Ubuntu 之間 clone 就能用,環境完全一致
- **新人 onboard 快** — VS Code 點 "Reopen in Container" 就有完整工具鏈
- **符合 Anthropic ToS** — 跑官方 `claude` CLI binary,認證資訊個人持有
- **Docker 工作流完整** — build / test / git push 全部在容器內完成
- **SDD 流程內建** — Spec-Kit 已預先 install 並初始化

---

## References

- [Anthropic Claude Code 官方 devcontainer feature](https://github.com/anthropics/devcontainer-features)
- [Claude Code Legal & Compliance](https://code.claude.com/docs/en/legal-and-compliance)
- [GitHub Spec-Kit](https://github.com/github/spec-kit) (SDD)
- [obra/superpowers](https://github.com/obra/superpowers) (TDD)

---

## CI status

[![CI](https://github.com/anew7237/claude-superspec-worker/actions/workflows/ci.yml/badge.svg)](https://github.com/anew7237/claude-superspec-worker/actions/workflows/ci.yml)

本 monorepo 內建 GitHub Actions CI workflow(`.github/workflows/ci.yml`)+ Dependabot 自動升版(`.github/dependabot.yml`)— **adopter fork 後自動啟用,不需在 GitHub UI 額外配置**(per `specs/003-ci-workflow/`)。

### Jobs

| Job                                | 性質         | 行為                                                                                                                                                                 |
| ---------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`gates`**                        | mandatory ✅ | 在 dev container 內跑 `pnpm typecheck` / `pnpm lint` / `pnpm test:node` / `pnpm test:worker` 4 mandatory gates                                                       |
| **`wrangler-bundle-check`**        | mandatory ✅ | `wrangler deploy --dry-run` + grep bundle 驗 0 個 Node-only module(pg/redis/pino/prom-client/@hono/node-server/node:fs/node:child_process)+ size assertion ≤ 100 KiB |
| **`secret-scan`**                  | mandatory ✅ | gitleaks 掃 PR diff(PR 觸發)/ 全 git history(push to main 觸發);0 OAuth credentials in commits                                                                       |
| **`spec-coverage-advisory`**       | advisory ⚠️  | PR 動 `src/**` 但無對應 `specs/NNN-*/` artifact → comment 提示(不阻擋 merge)                                                                                         |
| **`toolchain-isolation-advisory`** | advisory ⚠️  | PR 同時動 `package.json` / `pnpm-lock.yaml` 與 `src/**` / `tests/**` → comment 提示「toolchain 變更建議獨立 PR」(不阻擋 merge)                                       |

### 觸發條件

- `pull_request` to main(任何 PR)
- `push` to main(merge 後驗證)
- `workflow_dispatch`(手動觸發備用)

### Dependabot

每週一掃 npm + GitHub Actions 升版;按 grouping rule 開 PR(`@cloudflare/*` 同組;`@vitest/*` 同組;`@typescript-eslint/*` 同組;其他 minor + patch 一組;major 各自獨立 PR)。Open PR limit:npm 5 / github-actions 3。

### Branch protection 設定(adopter fork 後手動設,1 分鐘)

CI workflow 跑出來後,Required status checks 才可被加入 branch protection 清單。至 `Settings → Branches → Add branch protection rule for main`:

1. ✅ **Require a pull request before merging**
2. ✅ **Require status checks to pass before merging**
3. 在 `Required status checks` 搜尋並加入 **3 個 mandatory checks**:
   - ✅ `gates`
   - ✅ `wrangler-bundle-check`
   - ✅ `secret-scan`
4. ❌ **不要加** advisory checks(`spec-coverage-advisory`、`toolchain-isolation-advisory`)— 它們是提示,加進來會誤擋 PR
5. (可選)✅ **Require branches to be up to date before merging**

完成後任何 PR 須 3 mandatory check 全綠才可 merge。

### 詳細文件

- 完整 walkthrough(adopter / maintainer / reviewer × 7 sections + 6 negative test scenarios):[`specs/003-ci-workflow/quickstart.md`](specs/003-ci-workflow/quickstart.md)
- Spec(13 FRs / 11 SCs / 4 user stories):[`specs/003-ci-workflow/spec.md`](specs/003-ci-workflow/spec.md)
- 5 jobs 之契約(input / output / failure mode):[`specs/003-ci-workflow/contracts/ci-gates.md`](specs/003-ci-workflow/contracts/ci-gates.md)
- Dependabot policy 契約:[`specs/003-ci-workflow/contracts/dependabot-policy.md`](specs/003-ci-workflow/contracts/dependabot-policy.md)

---

## Baseline Spec & Contracts

本專案最新一版 baseline spec 位於 `specs/001-superspec-baseline/`,
描述此 template 對 adopter 的契約面與承諾。

- [`specs/001-superspec-baseline/spec.md`](specs/001-superspec-baseline/spec.md) — 5 user stories / 22 FR / 11 SC / 12 edge cases / 3 clarifications
- [`specs/001-superspec-baseline/plan.md`](specs/001-superspec-baseline/plan.md) — Technical Context、Constitution Check(對齊憲法 v1.0.0)、Project Structure
- [`specs/001-superspec-baseline/research.md`](specs/001-superspec-baseline/research.md) — 3 clarification decisions + 22 FR gap analysis
- [`specs/001-superspec-baseline/data-model.md`](specs/001-superspec-baseline/data-model.md) — 8 governance entities(Adopter / DevContainer Definition / Constitution / Feature Spec Artifact / Application Stack (Node) / Application Stack (Worker, Reserved) / Quality Gate / Toolchain Pin)
- [`specs/001-superspec-baseline/contracts/`](specs/001-superspec-baseline/contracts/) — 5 contracts(CLI pipeline / devcontainer / observability / quality gates / sensitive material)
- [`specs/001-superspec-baseline/quickstart.md`](specs/001-superspec-baseline/quickstart.md) — adopter walkthrough(乾淨機 → 跑通第一個 SDD pipeline)
- [`specs/001-superspec-baseline/tasks.md`](specs/001-superspec-baseline/tasks.md) — 16 tasks across 8 phases(audit + companion-doc 補齊 + polish)

> 後續 feature spec 將沿用此結構,於 `specs/<NNN-feature-name>/` 下產出。

`specs/002-cloudflare-worker/` 為 002 dual-runtime feature(本 README 下一段 "Dual-Runtime
(Node + Cloudflare Worker)" 介紹其 adopter-facing 面):

- [`specs/002-cloudflare-worker/spec.md`](specs/002-cloudflare-worker/spec.md) — 5 user stories / 17 FR / 11 SC / 15 edge cases / 1 clarification
- [`specs/002-cloudflare-worker/plan.md`](specs/002-cloudflare-worker/plan.md) — Worker runtime + monorepo dual-runtime refactor
- [`specs/002-cloudflare-worker/contracts/`](specs/002-cloudflare-worker/contracts/) — 4 contracts(worker-routes / reverse-proxy / bindings / dual-tsconfig)
- [`specs/002-cloudflare-worker/quickstart.md`](specs/002-cloudflare-worker/quickstart.md) — Mode A / B / C 完整 walkthrough(本 README 之 Mode 段為摘要版)

---

## Dual-Runtime(Node + Cloudflare Worker)

本 template 自 002 feature 起為 **dual-runtime monorepo** — 同一 repo 同時養 Node 端
(Hono on Node.js,Postgres + Redis backed,既有 001 baseline)與 Cloudflare Worker 端
(Hono on Workers runtime,D1 + KV bindings,002 新增)。兩 runtime 共用 `src/shared/**`
之純 type / pure-function utility,但**不互相 import**(per dual-tsconfig contract,
mechanical fence 由 `tsconfig.node.json` / `tsconfig.worker.json` `include` glob 提供)。

Worker 端額外承載 **reverse proxy**(`ALL /app-api/*`)— passthrough 至 `UPSTREAM_URL`
所指的 Node 端 origin,讓 adopter 可同一 entrypoint(Worker URL)同時 demo "Cloudflare-
native(D1 / KV)" 與 "edge-then-origin(Postgres / Redis via Node)" 兩種架構。

### 對照表 — 3 demo concept × 2 runtime

| Demo concept        | Cloudflare-native(Worker side)                                              | Through Node proxy(Worker → Node)                                                                                       |
| ------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **health**          | `GET /health` → 200 `{status:"ok",service:"worker",ts:<ISO>}`               | `GET /app-api/health` → 200 `{status:"ok",service:"nodejs"}`(Worker passthrough → Node)                                 |
| **now**(timestamp)  | `GET /d1/now` → 200 `{source:"d1",now:<ts>}`(D1 `SELECT CURRENT_TIMESTAMP`) | `GET /app-api/now` → 200 `{source:"postgres",now:<ts>}`(Worker passthrough → Node `pool.query`)                         |
| **echo**(key/value) | `GET /kv/echo?k=foo` → 200 `{source:"kv",key:"foo",value:<KV value>}`       | `GET /app-api/echo?k=foo` → 200 `{source:"redis",key:"foo",value:<redis value>}`(Worker passthrough → Node `redis.get`) |

> 6 條 endpoint 在 Mode B(完整 demo)應全 200,byte-equivalent 於上表 body shape。
> Mode A(quick demo)之 Through-Node-proxy 一行因無 Postgres/Redis backing 預期 5xx,
> 屬預期落差。詳細契約見
> [`specs/002-cloudflare-worker/contracts/worker-routes.md`](specs/002-cloudflare-worker/contracts/worker-routes.md)
> 與
> [`specs/002-cloudflare-worker/contracts/reverse-proxy.md`](specs/002-cloudflare-worker/contracts/reverse-proxy.md)。

### 三種跑法概覽

| Mode           | 場景                                           | 命令                                                  | 預算    | 備註                                                     |
| -------------- | ---------------------------------------------- | ----------------------------------------------------- | ------- | -------------------------------------------------------- |
| **A — quick**  | 本機 host process,只想看 Worker 邊本身         | `pnpm dev:node` + `pnpm dev:worker`                   | ~5 min  | `/app-api/now` `/app-api/echo` 預期 5xx(無 docker stack) |
| **B — full**   | docker compose 帶 Postgres + Redis,看完整 6 條 | `make up` + `pnpm dev:worker`                         | ~10 min | 推薦的 canonical 路徑(per SC-011 實測 67 秒)             |
| **C — deploy** | 首次部署上 Cloudflare edge                     | `wrangler login` → `d1/kv create` → `wrangler deploy` | ≤30 min | per FR-012 + SC-005                                      |

詳細逐步見下方 "Running locally(Mode A / B)" 與 "First-time deploy(Mode C)";
完整版逐行 curl + cleanup 見
[`specs/002-cloudflare-worker/quickstart.md`](specs/002-cloudflare-worker/quickstart.md)。

---

## Running locally(Mode A / B)

### Mode A — quick demo(~5 min,host process only)

於 dev container 內 terminal:

```bash
pnpm install --frozen-lockfile

# Mode A 注記:src/node/index.ts 在 serve() 之前先做 await redis.connect()
# (001 baseline DEV-003 fail-fast)。Mode A 跑 pnpm dev:node 需 host 端有 redis 才不會
# 啟動失敗。最簡單:起一個 ephemeral docker redis(完全不需 docker compose 整個 stack):
docker run --rm -d -p 127.0.0.1:6379:6379 --name modea-redis redis:7-alpine

pnpm dev:node &      # :8000
pnpm dev:worker &    # :8787
sleep 5

curl -sS http://localhost:8787/health                 # → {"status":"ok","service":"worker",...}
curl -sS http://localhost:8787/d1/now                 # → {"source":"d1","now":"..."}
curl -sS http://localhost:8000/app-api/health         # → {"status":"ok","service":"nodejs"}
curl -sS http://localhost:8787/app-api/health         # → 同上(Worker → Node 透傳)

# 收場
kill %1 %2
docker stop modea-redis
```

`UPSTREAM_URL` 在 Mode A **預設為 `http://localhost:8000`**(Worker dev 跑於 host,localhost
即 Node 端)。Mode A 不 seed Postgres / KV,故 `/app-api/now` `/app-api/echo` `/kv/echo` 之
完整 demo 留給 Mode B。**或者**完全跳過 `pnpm dev:node`,只跑 `pnpm dev:worker` — Worker
`/health` `/d1/now` `/kv/echo` 仍可獨立跑(`/app-api/*` 將回 502/504,Worker 端本身仍健康)。

### Mode B — full demo(~10 min,docker compose + Worker)

於 dev container 內 terminal:

```bash
pnpm install --frozen-lockfile

# 設定 .dev.vars(本檔 gitignored,複製自 .dev.vars.example template)
cp .dev.vars.example .dev.vars
# 編輯 .dev.vars,UPSTREAM_URL 視 Docker 環境設定(見下表)

make up                                                            # 三 service(app/db/redis)healthy
docker compose exec redis redis-cli SET foo "hello-from-redis"     # OK
pnpm dev:worker &                                                   # :8787
sleep 3
pnpm exec wrangler kv key put --binding=KV foo "hello-from-kv" --local   # OK

# 7 條 curl
curl -sS http://localhost:8787/health
curl -sS http://localhost:8787/d1/now
curl -sS 'http://localhost:8787/kv/echo?k=foo'
curl -sS http://localhost:8787/app-api/health
curl -sS http://localhost:8787/app-api/now
curl -sS 'http://localhost:8787/app-api/echo?k=foo'

# 收場
kill %1
make down
```

**`UPSTREAM_URL` 該設什麼**(於 `.dev.vars`):

| 你的環境                                           | 建議值                                                                                                                                  | 備註                                            |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Mac/Win Docker Desktop,wrangler 跑於 host          | `http://localhost:8000`                                                                                                                 | docker compose publish `:8000` 至 host loopback |
| Dev container 內 wrangler(Docker Desktop)          | `http://host.docker.internal:8000`                                                                                                      | Docker Desktop 自動提供此 alias                 |
| Linux 自架 Docker Engine,dev container 內 wrangler | `http://host.docker.internal:8000` + `.devcontainer/devcontainer.json` 加 `"runArgs": ["--add-host=host.docker.internal:host-gateway"]` | Linux Engine 不自動提供 alias                   |
| WSL2 host wrangler(無 Docker Desktop)              | `http://localhost:8000`                                                                                                                 | 已實測;見 quickstart §T036                      |

> Mode B 已實測 **67 秒** 完成完整 7 條 curl(per SC-011 預算 ≤ 10 min,實測耗用率 ~11%),
> 詳細時序見
> [`specs/002-cloudflare-worker/quickstart.md` §T036](specs/002-cloudflare-worker/quickstart.md)。

---

## First-time deploy(Mode C,~30 min)

需 Cloudflare account(free tier 即足夠 demo)。**`wrangler.jsonc` 之 `database_id` /
`id` 為 placeholder,首次部署前必須換成 `wrangler d1 create` / `wrangler kv namespace
create` 回傳的真 ID**。

```bash
# 1. 登入(host 或 dev container 皆可,會跳 browser-based OAuth)
pnpm exec wrangler login

# 2. 建 D1,記下 database_id 填入 wrangler.jsonc d1_databases[0].database_id
pnpm exec wrangler d1 create claude-superspec-worker

# 3. 建 KV,記下 id 填入 wrangler.jsonc kv_namespaces[0].id
pnpm exec wrangler kv namespace create KV

# 4. (可選)seed 部署 KV,讓 /kv/echo demo 不空
pnpm exec wrangler kv key put --binding=KV foo "hello-from-kv-prod" --remote

# 5. (可選)若想讓部署的 Worker 透傳到你 host docker 的 Node 端
#    a) host 端開 cloudflared tunnel: cloudflared tunnel --url http://localhost:8000
#    b) 拿到 https://<random>.trycloudflare.com URL
#    c) 把 URL 設為 secret:pnpm exec wrangler secret put UPSTREAM_URL  (貼上 tunnel URL)
#    secret 不入 wrangler.jsonc,確保不簽入 git

# 6. deploy
pnpm exec wrangler deploy

# 7. probe
DEPLOYED=https://claude-superspec-worker.<your-account>.workers.dev
curl -sS $DEPLOYED/health
curl -sS $DEPLOYED/d1/now
curl -sS "$DEPLOYED/kv/echo?k=foo"
```

**注意事項**:

- `wrangler.jsonc` `<填於 wrangler ... 後>` placeholder **必須**換成真 ID,否則 deploy
  fail。
- `UPSTREAM_URL` production 值經 `wrangler secret put`(NOT `wrangler.jsonc`)— secret
  留在 git 之外。
- Free-tier 額度(D1: 5GB / 100k reads/day;KV: 1GB / 100k reads/day)對 demo 綽綽有餘。
- per SC-005,首次走完應 ≤ 30 min;典型卡點是 Cloudflare account 註冊 + email 驗證
  (約 5–10 min)+ wrangler OAuth(若 dev container 無瀏覽器 forwarding 需於 host 端登入)。

完整版見
[`specs/002-cloudflare-worker/quickstart.md` Mode C](specs/002-cloudflare-worker/quickstart.md)。

---

## 1. 先決條件

### Mac (Apple Silicon)

- [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/)
  - Settings → General → 「Use Rosetta for x86_64/amd64 emulation」打開
  - Settings → Resources → 至少給 8GB RAM、4 CPU
- [VS Code](https://code.visualstudio.com/) + Extension: [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

### Windows + WSL2 Ubuntu

- WSL2 with Ubuntu 24.04
- [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)
  - Settings → Resources → WSL Integration → 勾選你的 Ubuntu distro
- [VS Code](https://code.visualstudio.com/) + Extension: [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

> **重要**:把專案 clone 在 WSL 檔案系統(`~/`),**不要**放在 `/mnt/c/` (跨檔案系統 IO 慢 5-10 倍)

### Mac & WSL 皆要做

- 登入 Claude Code 一次(Pro / Max / Team / Enterprise 訂閱)
  - 宿主端執行 `claude`,**先完成 OAuth login**
  - 之後 `~/.claude` 整個目錄都會 mount 進 container,**容器內不用再登入** (含 `.credentials.json` 與 `~/.claude.json` )

### 跨平台已知差異

| 議題           | Mac M1                                                       | WSL Ubuntu             |
| -------------- | ------------------------------------------------------------ | ---------------------- |
| `~/.claude`    | `/Users/xxx/.claude`                                         | `/home/xxx/.claude`    |
| 處理器架構     | arm64                                                        | amd64                  |
| 檔案系統效能   | `node_modules` 用 named volume(`app-node_modules`)避開 osxfs | 同左 named volume 機制 |
| Docker Desktop | Rosetta 開啟 emulate amd64                                   | WSL Integration 開啟   |
| 實際 mount     | VS Code Dev Containers 自動處理                              | 同左                   |

> 若某個 base image 只有 amd64 (Mac M1 上會用 Rosetta 跑,慢)
> 則在 docker-compose.yml 對應的 service 加: `platform: linux/amd64`

---

## 2. 第一次使用

- Clone 這個 template 執行: `git clone <this-repo> myapp && cd myapp`

- 複製環境變數 執行: `cp .env.example .env` # (視需要編輯 .env)

- 用 VS Code 開啟
  - VS Code 右下角會跳「Reopen in Container」,點下去
    - 第一次會 build devcontainer,需要幾分鐘
    - 完成後 terminal 會看到環境檢查結果
  - 在 devcontainer 的 terminal 內 `claude` 啟動

---

## 3. 日常開發指令

- devcontainer 內用 make 操作 docker compose (用 `make help` 看完整列表)

- devcontainer 內可 git push、PR、deploy:

```bash
git push                          # SSH agent 從 宿主端自動轉發
gh pr create --fill               # GitHub CLI 已預裝
docker compose -f docker-compose.prod.yml up -d   # 部署(自行擴充的檔案)
```

---

## 4. Claude Code + Spec-Kit (SDD) + Superpowers (TDD) 開發流程

- [Claude Code 環境下使用 Superpowers + Spec-Kit 整合開發流程](https://github.com/anew7237/claude-superspec/blob/main/.docs/superspec-workflow-SKv0.8.1.md)

---

## 5. 目錄結構

> 此 repo 是 unified monorepo(Node + Cloudflare Worker 兩個 runtime 共存)的 worker
> 變體。Node 端原本平鋪在 `src/`/`tests/`,2026-04-30 已搬至 `src/node/`/`tests/node/`;
> Worker 端與 `src/shared/**`(雙端共用之純 type / pure-function utility)由 002 feature
> 落地,結構為 `src/worker/` + `tests/worker/` + `src/shared/`。設計脈絡見
> [`.docs/20260430a-cloudflare-worker.md`](.docs/20260430a-cloudflare-worker.md);
> adopter-facing 介紹見上方 "Dual-Runtime(Node + Cloudflare Worker)" 段。

```
.
├── .claude/
│   ├── settings.json        # 團隊共用 Claude Code 設定(進 git)
│   └── skills/              # 共用 skills(進 git); (個人 skills 在宿主端 ~/.claude/skills)
├── .devcontainer/
│   ├── devcontainer.json    # VS Code devcontainer 設定
│   ├── Dockerfile           # dev 環境 image base(uv + 系統工具;node 與 claude code 由 features 提供)
│   ├── post-create.sh       # 容器建立後跑:裝 Spec-Kit + superpowers
│   └── init-firewall.sh     # 可選:網路 egress 白名單
├── .docs/                   # 設計文件 / runbook(non-spec 工作筆記、變體設計稿)
├── .specify/                # spec-kit 工具骨架(templates / scripts / integrations / workflows / extensions)
│   └── memory/
│       └── constitution.md  # 專案憲法
├── specs/                   # 各 feature 的 spec / plan / tasks(spec-kit 產物,於 repo root)
│   ├── 001-superspec-baseline/
│   └── 002-cloudflare-worker/
├── scripts/
│   └── db-init/             # postgres 第一次啟動會跑這裡的 .sql / .sh
├── src/                     # 應用程式碼(monorepo)
│   ├── node/                # Node 端
│   │   ├── app.ts           # Hono app + routes(含 /app-api/{health,now,echo})
│   │   ├── index.ts         # server entry
│   │   └── db.ts, redis.ts, logger.ts, metrics.ts, http-metrics.ts
│   ├── worker/              # Cloudflare Worker 端(由 002 落地)
│   │   ├── index.ts         # Hono app + ExportedHandler<Env>(4 route sets:health/d1/kv/proxy)
│   │   ├── env.ts           # interface Env { DB; KV; UPSTREAM_URL }
│   │   ├── error.ts         # 統一 error model
│   │   └── routes/          # health.ts / d1.ts / kv.ts / proxy.ts
│   └── shared/              # 雙端共用之純 type / pure-function utility(由 002 落地)
│       └── types.ts
├── tests/
│   ├── node/                # Node 端測試(vitest plain pool)
│   └── worker/              # Worker 端測試(vitest + miniflare;由 002 落地)
├── .dev.vars.example        # Worker local secrets 範例(複製成 .dev.vars,gitignored)
├── .dockerignore            # docker build context 排除清單(node_modules, dist, .git, .specify 等)
├── .env.example             # 環境變數範例(複製成 .env)
├── .gitattributes           # 跨平台行尾統一
├── .gitignore               # 包含 Claude credentials 等敏感檔案
├── .npmrc                   # pnpm engine-strict 等設定
├── .nvmrc                   # 釘 Node 版本(目前 22),供 nvm/fnm 自動切換
├── .prettierignore          # Prettier 跳過的路徑(dist, node_modules, lockfile, coverage)
├── .prettierrc.json         # Prettier 設定(semi, single-quote, printWidth 100, trailing-comma all)
├── CLAUDE.md                # Claude Code 的 runtime 指引(SpecKit context + Git workflow project override)
├── docker-compose.yml       # app + db + redis 編排(於 repo root)
├── Dockerfile               # 應用程式 image(multi-stage:dev + production;CMD = dist/node/index.js)
├── eslint.config.js         # ESLint 9 flat config(含 FR-022 cross-runtime no-restricted-imports)
├── Makefile                 # 常用指令
├── package.json             # 雙 runtime manifest(dev:node / dev:worker / test / typecheck 串接雙 tsconfig)
├── pnpm-lock.yaml           # pnpm 鎖版檔(必 commit,確保跨機器相依完全一致)
├── tsconfig.json            # base TS config(雙 runtime 共用)
├── tsconfig.node.json       # Node 端 tsconfig(types: ["node"];include src/node + src/shared + tests/node)
├── tsconfig.worker.json     # Worker 端 tsconfig(types: workers-types + vitest-pool-workers;include src/worker + src/shared + tests/worker)
├── tsconfig.build.json      # build 用(rootDir=src,輸出至 dist/node/;noEmit: false)
├── tsconfig.lint.json       # ESLint 用 tsconfig(extends tsconfig.json,額外含 tests/)
├── vitest.config.node.ts    # Node pool 設定(plain vitest)
├── vitest.config.worker.ts  # Worker pool 設定(@cloudflare/vitest-pool-workers + miniflare in-memory D1+KV)
├── wrangler.jsonc           # Wrangler 配置(main / compatibility_date / vars.UPSTREAM_URL / D1+KV bindings)
└── README.md                # 本文件

```

---

## 6. 團隊協作須知

> Git workflow 規範詳細見 [`CLAUDE.md`](CLAUDE.md) 中「Git Workflow (Project-Specific Override)」段落
> (commit / push gating 規則)。

### ✅ 進 git 的東西

- `.claude/settings.json`、`.claude/skills/`(共用 skills)
- `CLAUDE.md` (Claude Code 的 runtime 指引,屬團隊規範)
- `.specify/` 整個(constitution、specs、plans 都是團隊資產)
- `.devcontainer/` 整個(Dev Containers 跨平台共用環境)
- `Dockerfile`、`docker-compose.yml`、`.dockerignore`
- `Makefile`、`.env.example` (範例,不含實際 secrets)
- `README.md`、`.gitignore`、`.gitattributes`
- `package.json`、`pnpm-lock.yaml`、`tsconfig.json`、`tsconfig.lint.json`
- `.nvmrc`、`.prettierrc.json`、`.prettierignore`、`eslint.config.js`

### ❌ 不進 git

- `.claude/.credentials.json`、`.claude.json` — Anthropic credentials
- `.env` (實際 secrets)
- `docker-compose.override.yml` (個人本機調整)
- `*.pem`、`*.key` (任何 密鑰私鑰 **皆不可簽入**)

### Anthropic ToS 重點

- 每個成員用**自己的** Claude 訂閱帳號登入
- 不要把任何人的 `~/.claude/.credentials.json` 透過 git / chat / scp 傳給別人
- 不要在 devcontainer base image 內預先 bake 別人的 token
- 如果要做 always-on / CI / 自動化,改用 [API key](https://console.anthropic.com/)
  而非訂閱 OAuth token

---

## 7. 升級

### devcontainer 整個重 build

VS Code Command Palette → `Dev Containers: Rebuild Container`

### Claude Code 升級

宿主端跟容器內都會自動更新(npm package),強制更新:

```bash
npm install -g @anthropic-ai/claude-code@latest
```

### Spec-Kit 升級

編輯 `.devcontainer/post-create.sh` 中的 `SPEC_KIT_VERSION`,
然後在 devcontainer 內(升級時加 `--force` 強制重裝)
(首次安裝由 `post-create.sh` 自動處理,不需 `--force`):

```bash
uv tool install specify-cli --force --from "git+https://github.com/github/spec-kit.git@v0.8.1"
```

---

## 8. 常見問題

> 上游服務 outage(Anthropic API / ghcr.io / GitHub / npm registry / Cloudflare API)時的 degraded-mode 指南:見 [`.docs/upstream-outage-runbook.md`](./.docs/upstream-outage-runbook.md)(對應 FR-020)。

### Claude Code 在容器裡叫我重新登入

確認 宿主端真的登入過(`ls ~/.claude/.credentials.json`)。如果有,
檢查 `devcontainer.json` 的 mount 路徑跟你 宿主端的 `$HOME` 一致。
WSL 內 `$HOME` 是 `/home/xxx`,不是 Windows 的 `C:\Users\xxx`。

### docker compose up 在 container 內找不到 docker socket

確認 `docker-outside-of-docker`(DooD) feature 有正常裝起來:

```bash
docker version
ls -la /var/run/docker.sock
```

如果 socket 沒出現,檢查宿主端 Docker Desktop 是否在運行。

### Mac M1 build 某個 image 很慢

很可能在跑 amd64 emulation。檢查:

```bash
docker inspect <image> | grep Architecture
```

如果是 `amd64` 而你不需要,改用 arm64 tag 或多 platform image。

### Apple Silicon 上 pnpm install 卡住

通常是 native module(node-gyp、sharp、bcrypt 等)在 emulation 下
build。檢查 base image 是否拉了 arm64:

```bash
docker inspect node:22-slim --format '{{.Architecture}}'
```

應顯示 `arm64`(Mac M1)或 `amd64`(WSL)。若 image 被強制成錯誤架構,
檢查 Docker Desktop Rosetta 設定,或把問題套件改成 pure-JS 替代品
(如 `bcryptjs` 取代 `bcrypt`)。

### make up 失敗,顯示 `ERR_PNPM_OUTDATED_LOCKFILE`

`pnpm-lock.yaml` 跟 `package.json` 不一致(常見原因:有人改了
`package.json` 的版本但沒重新跑 `pnpm install`)。Dockerfile 用
`--frozen-lockfile` 嚴格驗證,不一致就直接失敗。

修法:在 devcontainer terminal 內重生 lockfile,然後 commit。

```bash
pnpm install                       # 重生 pnpm-lock.yaml
pnpm install --frozen-lockfile     # 驗證(應該成功)
git add pnpm-lock.yaml
git commit -m "chore: refresh pnpm-lock.yaml"
make up                            # 重新 build
```

---

## + HTTP 業務指標

> 完整契約規範見 [`specs/001-superspec-baseline/contracts/observability.md`](specs/001-superspec-baseline/contracts/observability.md);本段為 adopter-friendly 摘要。

`/metrics` endpoint 除 001 提供的 default runtime metrics(`process_*`、`nodejs_*`)外,
**預設**再暴露兩個 HTTP 層業務指標,供 Prometheus / VictoriaMetrics scrape、
Grafana 畫 per-route QPS 與 latency 分佈。

### 指標清單

| 名稱                            | 類型      | Labels                                                   |
| ------------------------------- | --------- | -------------------------------------------------------- |
| `http_requests_total`           | counter   | `{method, route, status_code}`                           |
| `http_request_duration_seconds` | histogram | `{method, route, status_code}`(prom-client 預設 buckets) |

### `route` label 規則

- **匹配到 route(含 handler 回 200、也含 handler 回 4xx/5xx)**:使用模板化路徑
  (例 `/`、`/health`、`/users/:id`),**不會**展成 `/users/42` 實際值 → 防
  cardinality 爆炸
- **完全未匹配(導致 404)**:字面字串 `not_found`
- **Hono 未暴露 routePath API**(未來 major bump 退化情境):字面字串 `unknown`,
  並於啟動時 `logger.warn` 一次

> ⚠️ **worked example — matched-404 vs unmatched-404**:
> `app.get('/items/:id', (c) => c.json({ error: 'not found' }, 404))` 這類「REST
> item-not-found」pattern 是**匹配到 route 但 handler 回 404**,label 會是
> `route="/items/:id"` 加 `status_code="404"`(不是 `not_found`)。這樣可用
> `rate(http_requests_total{status_code="404"})` 查看該 route 的 404 rate。
> 只有真正沒有任何 route 匹配(例:打 `/nonexistent`)才會用 `not_found` label。

`/metrics` 本身的 scrape request **不**會被記(避免污染指標)。

### 非 root 掛載:`mountPattern` option

預設 `app.use('/*', httpMetrics())` 將 middleware 掛於整個 app。若 adopter 要把
middleware 限定在子路徑(例如只量 API 層),必須**同時**修改 mount 與 opts:

```ts
app.use('/api/*', httpMetrics({ mountPattern: '/api/*' }));
```

`mountPattern` 必須與 `app.use(...)` 的 mount 字串**完全一致** — middleware
用這個值判斷「request 是否未匹配到任何 route」。若忘了傳 opts,未匹配的
`/api/foo` 會被標成 `route="/api/*"`(literal glob)而非 `not_found`,觀測品質
退化但 cardinality 仍安全。

### 啟動時的合成 probe

Middleware factory 會在啟動時發一個 in-process 的 synthetic request 到一個
throwaway Hono instance(path `/__httpmetrics_probe__`)來探測 Hono 的 routePath
API 是否正常。此 request **不**會出現在 adopter 的 app 上,也**不**會佔用
`/__httpmetrics_probe__` 這個路徑(adopter app 可以自己註冊這個 path,彼此獨立)。

### Opt-out

單一 env var,**大小寫不敏感**:

```bash
HTTP_METRICS_ENABLED=false  # 關閉 middleware
# 未設 / 空字串 / 其他值 → 啟用(fail-open observability)
```

關閉後 `/metrics` body 仍保留 001 default metrics;`/` 與 `/health` 回應 byte-for-byte
不變(無 header 增刪)。改值需重啟 app 才生效。

### 典型 Grafana 查詢

```promql
# 每 route 每 method 的 QPS
sum by(method, route) (rate(http_requests_total[1m]))

# 每 route p99 latency
histogram_quantile(0.99, sum by(le, route) (rate(http_request_duration_seconds_bucket[1m])))
```

更多細節:`specs/NNN-feature-name/`(spec / contracts / quickstart)。

---

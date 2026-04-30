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

> 此 repo 是 unified monorepo(Node + 計畫中的 Cloudflare Worker 兩個 runtime 共存)
> 的 worker 變體。Node 端原本平鋪在 `src/`/`tests/`,2026-04-30 已搬至 `src/node/`/
> `tests/node/`,為後續 `src/worker/` / `src/shared/` 騰出位置;設計脈絡見
> [`.docs/20260430a-cloudflare-worker.md`](.docs/20260430a-cloudflare-worker.md)。

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
│   └── 001-superspec-baseline/
├── scripts/
│   └── db-init/             # postgres 第一次啟動會跑這裡的 .sql / .sh
├── src/                     # 應用程式碼(monorepo)
│   └── node/                # Node 端
│       ├── app.ts           # Hono app + routes
│       ├── index.ts         # server entry
│       └── db.ts, redis.ts, logger.ts, metrics.ts, http-metrics.ts
├── tests/
│   └── node/                # Node 端測試(vitest)
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
├── eslint.config.js         # ESLint 9 flat config
├── Makefile                 # 常用指令
├── package.json             # Node 專案定義(dev → src/node/index.ts、start → dist/node/index.js)
├── pnpm-lock.yaml           # pnpm 鎖版檔(必 commit,確保跨機器相依完全一致)
├── tsconfig.json            # TypeScript 編譯設定(build 用,rootDir=src,輸出至 dist/node/)
├── tsconfig.lint.json       # ESLint 用 tsconfig(extends tsconfig.json,額外含 tests/)
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

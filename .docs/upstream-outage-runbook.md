# 上游服務 Outage Runbook

本檔對應 **FR-020** 及 spec edge case:上游服務 outage 時,已 build 完成的 devcontainer + 本機 image +
cache 認證下,無需新外部資源的本地操作**不應被阻擋**;需新拉資源的操作可阻塞,且失敗訊息須清楚指出阻塞原因。

各節以字母 A–E 標示,對應 `post-create.sh` 錯誤訊息中的引用鍵(如 `C. GitHub`、`D. npm registry`)。

---

## A. Anthropic API

Claude Code OAuth token 及 API 呼叫均透過 Anthropic 端點。Token 已 cache 在 `~/.claude/` 下,短期
outage 通常不影響已登入的 session。

| 仍可做                           | 被阻擋                               | Recovery 後 verify                                   |
| -------------------------------- | ------------------------------------ | ---------------------------------------------------- |
| 啟動 Claude Code(token 已 cache) | 重新 OAuth 登入(`claude auth login`) | `claude --version` 正常回應                          |
| 在已開啟的 session 中繼續提問    | 新申請 Anthropic API key             | 跑一個 trivial `/speckit-specify` 指令看是否收到回應 |
| 跑既有測試(`pnpm test`)          | `/speckit-*` 指令(呼叫 Claude API)   |                                                      |
| `git commit`、本機 branch 操作   |                                      |                                                      |

---

## B. ghcr.io

GitHub Container Registry 提供 devcontainer features 映像(如 `ghcr.io/anthropics/claude-code` 及
`ghcr.io/devcontainers/features/*`)。已 pull / 已 build 的映像存於本機 Docker image store。

| 仍可做                                                        | 被阻擋                                                           | Recovery 後 verify                                               |
| ------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| 已 build 過的 devcontainer 直接 reopen(`Reopen in Container`) | 首次 devcontainer build(features fetch 需拉 ghcr.io 映像)        | `docker pull ghcr.io/devcontainers/features/common-utils:2` 成功 |
| `make up`(已 pull 的 image 起 container)                      | `docker pull` 升級 features 映像                                 | `docker compose build` 成功完成                                  |
| 跑既有測試、`pnpm lint`、`pnpm typecheck`                     | `docker compose build --no-cache`(需從 registry 重拉 base layer) |                                                                  |

---

## C. GitHub

`git clone` / `git fetch` / `git push` 均需連線 GitHub.com(HTTPS 或 SSH)。spec-kit 及 superpowers
的安裝來源亦在 GitHub;已 clone / 已 install 的版本持續可用。

| 仍可做                                              | 被阻擋                                                    | Recovery 後 verify                          |
| --------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------- |
| 已 clone 的 repo:本機 commit、branch、merge、rebase | `git clone` / `git fetch` / `git push`(需連線 GitHub.com) | `git ls-remote origin` 正常回應             |
| 已 install 的 spec-kit(`specify` 指令可用)          | `uv tool install specify-cli`(source 在 GitHub)           | `curl -sI https://github.com` 回傳 HTTP 200 |
| 已 clone 的 superpowers skills 正常使用             | `git clone obra/superpowers`(post-create.sh:97 步驟)      |                                             |
| 跑既有測試、lint、typecheck                         |                                                           |                                             |

---

## D. npm registry

`pnpm install` 依賴 registry.npmjs.org 解析並下載套件。已 install 的 deps 存於 `node_modules/` 及
pnpm store;lockfile 未變動時本機操作完全不受影響。

| 仍可做                                                                                   | 被阻擋                                                     | Recovery 後 verify                                   |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| 已 install 的 deps:跑測試、lint、typecheck(`pnpm test` / `pnpm lint` / `pnpm typecheck`) | `pnpm install`(若 lockfile 有新條目需從 registry 下載)     | `curl -sI https://registry.npmjs.org/` 回傳 HTTP 200 |
| `pnpm install --frozen-lockfile`(若所有 entry 均已 cache 在 pnpm store)                  | `pnpm install --frozen-lockfile`(若有 missing cache entry) | `pnpm install --frozen-lockfile` 成功完成            |
| image build 若 Dockerfile cache 層命中(deps 層未更動)                                    | 新增依賴(`pnpm add <pkg>`)                                 |                                                      |
| `git commit`、本機 branch 操作                                                           | `docker compose build` 若 deps 層 cache miss               |                                                      |

---

## E. Cloudflare API

_此節為 forward-declared,**自 002-cloudflare-worker feature 起生效**;v1.0.0 baseline 尚無 wrangler
部署流程,本節內容不影響目前 001 運作。_

`wrangler deploy` / `wrangler tail` / D1、KV 線上 query 需連線 Cloudflare API。`wrangler dev` 本地走
miniflare,不依賴 Cloudflare API。

| 仍可做                                                        | 被阻擋                                                       | Recovery 後 verify                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| `wrangler dev`(miniflare 本地模式,不需 Cloudflare API)        | `wrangler deploy`(推 Worker bundle 至 Cloudflare edge)       | `wrangler whoami` 正常回應帳號資訊                      |
| 本機測試:`pnpm test:worker`(vitest-pool-workers 走 miniflare) | `wrangler tail`(stream 線上 Worker log)                      | `wrangler deploy --dry-run` 成功(dry-run 仍需 API 認證) |
| 本機 typecheck、lint                                          | Cloudflare Dashboard 操作、D1/KV 線上 query(deployed Worker) |                                                         |
| `git commit`、本機 branch 操作                                | `wrangler d1 migrations apply --remote`                      |                                                         |

---

## 通則

1. **能避免拉新資源就繼續工作** — 已 build 的 image、已 install 的 deps、已 cache 的 OAuth token、已
   clone 的 repo,在 outage 期間全部持續可用。
2. **Monorepo 不另提供 mirror** — 依照 spec edge case 明文規定,本 monorepo 不提供任何上游的本地
   mirror(npm、ghcr.io、GitHub、Cloudflare API 均無備援 registry)。需新拉資源的操作等上游恢復再執行。
3. **多上游同時 outage** — 各條的 degraded mode 可疊加(例如 GitHub + npm 同時 outage:已 clone + 已
   install 的本機狀態仍可跑完整測試與 commit);但 baseline 不制訂橫跨多上游的 fallback 協議,視個案判斷。

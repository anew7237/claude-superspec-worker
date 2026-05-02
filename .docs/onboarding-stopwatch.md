# Onboarding Stopwatch — SC-001 量測記錄

此檔追蹤 SC-001 在各主機平台上的實際量測結果。SC-001 定義見
[`specs/001-superspec-baseline/spec.md`](../specs/001-superspec-baseline/spec.md)（搜尋 `SC-001`）:
新成員從零(僅 Docker、IDE、Git)到 Node 應用 stack 全綠 healthcheck,首次 build 完成 ≤ 15 分鐘;
後續 reopen container ≤ 3 分鐘。

## 主要量測表

| 場景                                       | Mac M1 時間 | WSL2 Ubuntu 時間 | 符合 SC-001?                           | 備註                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | ----------- | ---------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 首次 build(devcontainer ready,banner 印出) | 30 s        | 45 s             | ✅(≪ 15 min)                           | Mac M1: T016 / 2026-04-30;~~需先 `export SSH_AUTH_SOCK=/run/host-services/ssh-auth.sock`~~ workaround **已不需要** — issue #1 fix(本檔同 commit 之鄰近 fix commit,subject `fix(devcontainer): drop explicit SSH_AUTH_SOCK mount`)移除顯式 SSH mount,改由 VS Code Dev Containers 內建 forwarding 處理,Mac M1 + WSL2 雙平台皆 clean 起。WSL2: T006 / 2026-04-30;`vsc-*` + worker app image 預先砍除,base image / features / `~/.claude` mount 仍 cached;banner 0 WARN / 0 NOT FOUND |
| Reopen container(已 build 過)              | 20 s        | 25 s             | ✅(≪ 3 min)                            | Mac M1: T016 / 2026-04-30。WSL2: T006 / 2026-04-30。皆只跑 `postStartCommand`                                                                                                                                                                                                                                                                                                                                                                                                     |
| `make up` 到全綠 healthcheck(三個 service) | 12 s        | 20 s             | ✅(SC-001 spec 未明列上限,典型 ≤ 30 s) | Mac M1: T016 / 2026-04-30。WSL2: T006 / 2026-04-30;app image 已 build。Mac 比 WSL 快 8 s,在 Apple Silicon native arm64 image 走 + Docker Desktop VM resource pre-allocated 範圍內合理                                                                                                                                                                                                                                                                                             |

## 量測方法

- **首次 build** — 依照 [`quickstart.md` Step 1](../specs/001-superspec-baseline/quickstart.md)
  （clone + `Reopen in Container`）。從點擊「Reopen in Container」開始計時,到 terminal 印出 banner
  (`Environment ready`) 為止。
- **Reopen container(已 build 過)** — 對已 build 完成的 devcontainer 執行 VS Code「Reopen in
  Container」。從點擊開始計時,到 banner 印出為止(只跑 `postStartCommand`,不重建映像)。
- **`make up` 到全綠 healthcheck** — 容器就緒後,於容器內 terminal 執行:
  ```bash
  time make up && docker compose ps
  ```
  計時區間:從 `make up` 啟動到三個 service(`app` / `db` / `redis`)狀態皆顯示 `healthy`。

## 第一個 SDD feature 量測(T009 補充)

> **⚠ Reverted-artifacts disclaimer**:本 T009 量測底下引用之 sample
> feature artifacts(`specs/001-superspec-baseline-T009/`、
> `tests/node/echo.test.ts`、`src/node/app.ts +9 lines`)於 main 上
> **已被 revert**(commit `4c23544`)。
>
> **Scope 決策理由**:T009 之目的為量測 SDD pipeline 整輪 elapsed,以
> in-repo 證據兌現 SC-007(adopter 第一個自家 feature 可於 ≤ 1 小時
> 走完 specify → clarify → plan → tasks → implement);`/echo` sample
> feature 為**量測載體**而非 baseline 出貨內容。將 sample feature 進
> main 會牴觸 baseline「不預製範例 feature(由 adopter 自行決定首
> feature)」之定位 → 故僅保留量測紀錄(本節)+ companion docs 進
> main,sample feature 本體 revert。
>
> 引用之檔案路徑於 branch `001-superspec-baseline-T009` HEAD `c77ff12`
> 上仍可驗證,作為 SC-007 之歷史 anchor;grep main 不會找到這些檔。

**完成日期**:2026-04-30
**Sample feature**:`GET /echo` endpoint(`specs/001-superspec-baseline-T009/`)
**Branch**:`001-superspec-baseline-T009`(從 `001-superspec-baseline` HEAD `8b699c7` fork,以
`GIT_BRANCH_NAME` env 覆蓋預設 NNN-name 命名慣例)。
**平台**:WSL2 Ubuntu host(本 maintainer dev 環境;Mac M1 上未重跑此 walkthrough)。

### 整輪 SDD pipeline elapsed

| 階段                 | 動作                                                                                            | 內容                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `/speckit-specify`   | 產 `spec.md` + `checklists/requirements.md`                                                     | 5 user stories → 3 個 / 22 → 6 FRs / 11 → 5 SCs / 12 → 5 edge cases。0 個 [NEEDS CLARIFICATION] marker(以 Assumptions 段封閉所有歧義) |
| `/speckit-clarify`   | **跳過**                                                                                        | spec 0 ambiguity → 直接進 plan                                                                                                        |
| `/speckit-plan`      | 產 `plan.md` + `research.md` + `data-model.md` + `contracts/echo.contract.md` + `quickstart.md` | Constitution Check 5/5 ✅ no violations                                                                                               |
| `/speckit-tasks`     | 產 `tasks.md`                                                                                   | 12 tasks / 6 phases / TDD mandatory                                                                                                   |
| `/speckit-implement` | T001-T012                                                                                       | RED (T003) → GREEN (T004) → typecheck/lint/prettier 全綠 → manual quickstart 6 step → 收場                                            |
| **合計**             | **21 min 5 sec(1265 s)**                                                                        | **遠小於 SC-007 ≤ 1 hour budget** ✅                                                                                                  |

### 量測終點驗證

- **`pnpm test`**:8 file / 27 tests pass(原 7 file 20 tests + 新 `tests/node/echo.test.ts` 7 cases — 3 happy / 3 missing / 1 metrics inheritance)
- **`pnpm typecheck`**:exit 0
- **`pnpm lint`**:exit 0(no-console rule:`/echo` handler 未引入 `console.*`)
- **`pnpm exec prettier --check .`**:exit 0
- **Quickstart manual walkthrough**:6 acceptance scenario 全綠(happy / URL-encoded / 中文 / missing / empty / multi-take-first);`/metrics` 含 `route="/echo"` counter + histogram bucket(自動繼承 baseline httpMetrics middleware,**無需顯式接線** — 兌現 spec FR-004 + 001 baseline observability invariant 1)
- **`make down`** 收場乾淨

### Implementation 規模

- `src/node/app.ts` +9 lines(`app.get('/echo', handler)` + 註解)
- `tests/node/echo.test.ts` 新檔 +96 lines(3 describe block / 7 it case + helper for register snapshot)
- 對 baseline 既有檔案 / 契約 / 依賴 / 配置 **0 變更**

### 兌現 001-superspec-baseline 之 SC-007

> **SC-007**:Adopter 採用後的「第一個自家 feature」可在 1 小時內走完整 SDD pipeline
> (`/speckit-specify → /speckit-clarify → /speckit-plan → /speckit-tasks → /speckit-implement`)
> 且通過所有 quality gate;baseline 不預製範例 feature,SC-007 由 adopter 自家流程的可重現性驗證。

本量測為本 maintainer 自跑的 SC-007 in-repo 實證。adopter 端可重現性需各自驗證,baseline 不 promise

---

## Mode C — first-time deploy(T040 補充,P3 partial)

**完成日期(部分):** 2026-05-03(build path 量測完成;live `wrangler deploy` 待 adopter run)

歷史脈絡:T040(Mode C real deploy)在 002 落地時 deferred(per `.docs/baseline-traceability-matrix.md` 與 PR #5 review note,SC-002 / SC-005 標記為 documentation-only)。P3 follow-up 在 WSL2 host 跑 `wrangler deploy --dry-run` 以兌現 build path 半邊證據;live deploy 端到端 ≤ 30 min 之 SC-005 量測仍需 adopter 持有 Cloudflare account 才能完成。

### Build path 量測(commit `4fca1fa`,WSL2)

**Command:** `pnpm exec wrangler deploy --dry-run --outdir=.tmp-build`(host shell;`.tmp-build/` 為一次性產出,量測後立即 `rm -rf` 清掉)

**Toolchain:** wrangler `3.114.17`(latest 為 4.87.0;升級為 separate follow-up,wrangler v4 入專案在 P3 範圍外)

| 量項                  | 結果                                             | 備註                                                                                         |
| --------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Build pack            | exit 0(`--dry-run: exiting now.`)                | 不上傳、不需 wrangler login                                                                  |
| Bundle 容量           | **63.90 KiB**(uncompressed)/ **15.82 KiB**(gzip) | Workers free-tier limit 1 MiB,使用率 ~6%                                                     |
| Output `index.js`     | 65,436 bytes                                     | clean ESM bundle                                                                             |
| Output `index.js.map` | 114,032 bytes                                    | source map                                                                                   |
| Bindings 檢測         | 3/3 條 wrangler.jsonc 條目皆解析 ✅              | KV (`KV`) + D1 (`DB`,`claude-superspec-worker`) + Var (`UPSTREAM_URL=http://localhost:8000`) |

**SC-003 forbidden-string scan**(grep against `.tmp-build/index.js`):

| Pattern                    | Hit count |
| -------------------------- | :-------: |
| `from "pg"`                |     0     |
| `from "redis"`             |     0     |
| `from "pino"`              |     0     |
| `from "prom-client"`       |     0     |
| `from "@hono/node-server"` |     0     |
| `require("pg")`            |     0     |
| `require("redis")`         |     0     |
| `require("pino")`          |     0     |

→ **002 SC-003 通過**:Worker bundle 不含任一 Node-only 套件之 import / require 字串(8 條 pattern × 0 hit)。

### Live deploy(pending — requires Cloudflare credentials)

**Status:** PENDING

要兌現 002 SC-005 之 ≤ 30 min 端到端證據,adopter / maintainer 需執行(本節 build path 量測已示範 wrangler.jsonc 結構正確,後續步驟需 credentials):

1. **Login**:`pnpm exec wrangler login`(OAuth in browser;若 dev container 無 X11 forwarding,可在 host 跑 `wrangler login` 後 token 共享)
2. **建 D1**:`pnpm exec wrangler d1 create claude-superspec-worker` → 取得 `database_id`,填回 `wrangler.jsonc:32`(覆寫 `<填於 wrangler d1 create 後>` placeholder)
3. **建 KV**:`pnpm exec wrangler kv namespace create KV` → 取得 namespace id,填回 `wrangler.jsonc:38`
4. **D1 schema**(若有 init SQL):`pnpm exec wrangler d1 execute claude-superspec-worker --remote --command="<DDL>"`
5. **Deploy**:`pnpm exec wrangler deploy` → 紀錄 deploy 端到端 wall time
6. **Smoke test**:`curl https://<worker-name>.<account-subdomain>.workers.dev/health` → 期望 `{"status":"ok","service":"worker","ts":"..."}`,HTTP 200
7. 把整輪 wall time(login → smoke test 200)填入下方表格,更新 status 為 ✓:

| 階段                | Wall time | 備註                     |
| ------------------- | --------- | ------------------------ |
| login               | TODO      | OAuth browser flow       |
| d1 create           | TODO      |                          |
| kv namespace create | TODO      |                          |
| (optional) DDL      | TODO      |                          |
| `wrangler deploy`   | TODO      | bundle upload + dispatch |
| smoke test 200      | TODO      | curl `/health`           |
| **合計**            | **TODO**  | SC-005 budget: ≤ 30 min  |

**Build path 量測限制:** 本量測證 wrangler.jsonc 結構 + bundle 產出 + 禁忌 dep scan 三項皆綠;但 SC-005 budget 涵蓋整個 adopter 端到端 onboarding deploy(login + binding 建立 + deploy + smoke test),非僅 build。Live deploy 條目補入前,本紀錄**不**等同 SC-005 通過,僅證明 build path 正確。
adopter 一定 ≤ 1 hour;但本 walkthrough 證明:**對 trivial 範圍 feature(1 endpoint,1 happy + 1 error
分支),SC-007 budget 含寬裕緩衝(本次 21m,budget 60m)**,即使 adopter 較不熟悉 spec-kit 流程,
仍有充足時間慢慢走。

---

## Docker prod-image E2E verification(P5,2026-05-03)

歷史脈絡:P4(commit `d15daff`)修了 `pnpm build` 之 noEmit 與 emit 結構,但只在 host 上跑 `pnpm build` 驗 dist/ 16 files;runtime image 端到端(build → run → curl)未實際跑過。P5 在本地 Docker 上完整跑一輪、補實證,並順帶修 P4 帶入的一個 latent bug。

### Latent bug 修復(本量測前置)

`Dockerfile` 之 `build` 與 `dev` stage 各只 `COPY tsconfig.json ./`;P4 新增 `tsconfig.build.json`(extends `tsconfig.node.json`)時未同步更新 Dockerfile,導致 `docker build --target=runtime` 失敗:

```
> [build 3/3] RUN pnpm build:
error TS5058: The specified path does not exist: 'tsconfig.build.json'.
```

**Fix:** 將兩 stage 的 `COPY tsconfig.json ./` 改為 `COPY tsconfig*.json ./`(glob 涵蓋 base + node + worker + lint + build)。compose mount source 之情境不受影響(bind mount 蓋過);裸 image 跑(本量測 + adopter Mac M1 平行驗 SC-002)現在自洽。

### E2E 量測(commit `d15daff` + 上述 Dockerfile fix,WSL2)

**Toolchain:** Docker `29.4.0`(Engine + buildx)on Linux `6.6.87.2-microsoft-standard-WSL2`

| 階段           | 命令                                                                                                                           | 結果                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Build          | `docker build --target=runtime -t superspec-runtime:e2e .`                                                                     | exit 0 / **6.083s real**(cache-warm)                                   |
| Redis sidecar  | `docker run -d --network superspec-e2e-net --name superspec-redis-e2e redis:7-alpine`                                          | 啟動 OK                                                                |
| App container  | `docker run -d --network superspec-e2e-net -e REDIS_URL=redis://superspec-redis-e2e:6379/0 -p 8001:8000 superspec-runtime:e2e` | 啟動 OK                                                                |
| Startup log    | `docker logs superspec-app-e2e`                                                                                                | `{"level":30,"msg":"server started","port":8000}` — pino structured    |
| `curl /`       | (no backing deps)                                                                                                              | **HTTP 200** / 5.5ms / `{"message":"hello from hono"}`                 |
| `curl /health` | (postgres 故意不接,redis 通)                                                                                                   | **HTTP 503** / 4.7ms / `{"status":"degraded","db":false,"redis":true}` |

**Stack trace 證實在跑 `dist/`(非 source `.ts`):**

```
at async file:///app/dist/node/app.js:21:18
at async file:///app/dist/node/http-metrics.js:125:13
```

→ 證明 `rewriteRelativeImportExtensions: true` 確實把 `from './app.ts'` 改寫為 `from "./app.js"`,runtime image 走的是 emitted JS 而非 source TS。

### 兌現的不變量

| 不變量                                           | 證據                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Dockerfile build stage 產出 dist/                | `COPY tsconfig*.json` + `pnpm build` exit 0                                                      |
| Runtime stage 收到 dist/(`COPY --from=build`)    | container 內 `dist/node/index.js` 路徑可載入                                                     |
| `node dist/node/index.js` 可啟動(無 module 錯誤) | startup log 印出 `server started`                                                                |
| Hono routes 在 prod image 內 reachable           | `curl /` 200 + `curl /health` 503                                                                |
| `await redis.connect()` startup gate             | 不指 redis 會 fail-fast 退出 — 本量測接 redis sidecar 故 pass                                    |
| `/health` 之 graceful db-down 行為               | pg ECONNREFUSED 觸發 `health.db.check.failed` warn + 503 degraded body(per `app.ts:28-31` catch) |

### Cleanup(zero residue)

```
docker rm -f superspec-app-e2e superspec-redis-e2e
docker network rm superspec-e2e-net
docker rmi superspec-runtime:e2e
```

### 補強的 SC

- **001 SC-002 + 002 SC-002**(Node prod-image 端):**WSL2 single-platform** 額外證 — runtime image 在 WSL2 上端到端 reachable + 行為符 contract。Mac M1 條目仍 pending;但 Linux 端的 image-runs-as-designed 已被本量測證。
- **001 FR-011 + FR-015**(non-root + multi-stage):runtime stage 之 `USER app`(uid/gid 1001)在 container 內生效(`docker exec id` 可確認;本量測未額外跑)。

### Live `wrangler deploy` 仍 pending

本節僅補 **Docker prod-image** 端;Cloudflare side 之 `wrangler deploy` 端到端 SC-005 量測仍待 adopter 持有 CF account 後跑(per 上節 placeholder)。

## Fresh-eyes 二次驗證(T016 補充)

**完成日期**:2026-04-30
**驗證者**:同一 maintainer,於 Mac M1(Apple Silicon)host 上跑;repo 為從 origin 新 clone 至
`/Users/testc1aw/x_Project/TEST-claude/claude-superspec-worker`,checkout 至 `001-superspec-baseline`
HEAD `14b0824`(含 T006 measurement)。

### 跨平台量測對比(SC-001 兌現)

| 場景       | Mac M1 | WSL2 Ubuntu | 差異  | 備註                                                                                                    |
| ---------- | ------ | ----------- | ----- | ------------------------------------------------------------------------------------------------------- |
| 首次 build | 30 s   | 45 s        | -15 s | Mac M1 較快;ARM64 native + Docker Desktop VM 預配資源 / WSL2 走 Hyper-V VM 啟動有額外 fs cache 預熱成本 |
| Reopen     | 20 s   | 25 s        | -5 s  | 兩端皆只跑 `postStartCommand`,差異在 noise 範圍                                                         |
| `make up`  | 12 s   | 20 s        | -8 s  | Mac arm64 native image 啟動快;db/redis healthcheck 同樣 10 s interval                                   |

兩平台皆 ≪ SC-001 上限(15 min / 3 min),**SC-001 在 v1.0.0 跨 Mac M1 + WSL2 Ubuntu 雙平台兌現**。

### 本次驗證的發現與閉合過程(issue #1 從 surface 到 fix)

**Layer A — bind-mount hard-fail(原始 surface 點)**:Mac M1 首次 build 在 default
`SSH_AUTH_SOCK` 下會 bind-mount fail(`/var/run/com.apple.launchd.*/Listeners` 在 Docker
Desktop VM 內不存在),容器無法啟動。

**Layer B — 即便 Layer A 用 magic socket 繞過,SSH forwarding 仍 broken**:VS Code
Remote-Containers 自家 override `SSH_AUTH_SOCK` 為 `/tmp/vscode-ssh-auth-*.sock`、容器內
`ssh-add -L` 回 `communication with agent failed`。我們顯式 mount 的 `/ssh-agent` 形同裝飾,
owned by root 對 `vscode` user 也不可用。

**Path B 實驗 → option 5 證實**(同日完成,不另列 follow-up):於
[branch `experiment/mac-ssh-option5`](https://github.com/anew7237/claude-superspec-worker/tree/experiment/mac-ssh-option5)
試刪 SSH mount + `containerEnv.SSH_AUTH_SOCK`,改由 VS Code Dev Containers 內建 forwarding
獨自處理。Mac M1 與 WSL2 雙平台皆驗:容器 clean 起、`ssh-add -L` 印出 host 端 key、
`ssh -T git@github.com` 成功。Fix 已折回本 baseline(本檔同 commit 之鄰近 fix commit,subject `fix(devcontainer): drop explicit SSH_AUTH_SOCK mount`,issue #1 closed)。

**前提條件**(adopter 須知):host 端 `ssh-add ~/.ssh/<key>` 已載 identity。Mac 上若用
launchd 託管的 ssh-agent,確認 `ssh-add -L` 印出公鑰即可;若空,git push 自動 fall back
HTTPS(`post-create.sh` SSH sanity check 印 INFO 提示)。

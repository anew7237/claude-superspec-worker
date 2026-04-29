# Quickstart: SuperSpec Worker Monorepo Baseline

**Audience**: Adopter on macOS Apple Silicon or WSL2 Ubuntu
**Goal**: 從乾淨機(僅 Docker / IDE / Git)→ Node 應用 stack 全綠 → 走第一個 SDD pipeline,於 1 hour 內完成(SC-001 + SC-007)。

> Worker 端體驗(`wrangler dev` / 002-cloudflare-worker reference)由 002 spec 落地後生效;**v1.0.0 quickstart 鎖在 Node baseline + 第一個自家 SDD feature**。

## Step 0 — 宿主端先決條件(一次性)

1. 安裝 [Docker Desktop](https://www.docker.com/products/docker-desktop/)。
   - **Mac M1**:Settings → General → 「Use Rosetta for x86_64/amd64 emulation」打開;Resources ≥ 8GB RAM、4 CPU。
   - **WSL2 Ubuntu**:Settings → Resources → WSL Integration → 勾選你的 Ubuntu distro。
2. 安裝 [VS Code](https://code.visualstudio.com/) + Extension [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)。
3. 一次性登入 Claude Code:
   - 宿主端 terminal 執行 `claude` → 完成 OAuth login。
   - `~/.claude/` 整個目錄會 mount 進 container(含 `.credentials.json` + `~/.claude.json`),容器內不需再登入。
4. **WSL 重要**:把 repo clone 在 WSL 檔案系統(`~/`),**不要**放在 `/mnt/c/`(跨檔案系統 IO 慢 5-10 倍)。

## Step 1 — Clone + Reopen in Container

```bash
git clone <this-repo-url> myapp
cd myapp
cp .env.example .env  # 視需要編輯;預設值對 dev 可用
code .                 # 用 VS Code 開啟
```

VS Code 右下角會跳「Reopen in Container」,點下去:

- 第一次會 build devcontainer,需要幾分鐘(FR-001 / SC-001:首次 build ≤ 15 min)。
- 完成後 terminal 會看到 `post-create.sh` 的 banner:
  ```
  ================================================================
    Environment ready
  ================================================================
    uv:         ...
    specify:    v0.8.1
    claude:     <version>
    node:       v22.x.x
    pnpm:       9.12.0
    engine-strict: true
    ...
  ```
- `WARN:` / `NOT FOUND` 行數應為 0;若出現:
  - `Claude OAuth credentials not detected` → 先回宿主端跑一次 `claude` 完成 login,然後 Rebuild Container。
  - `engine-strict not active` → 確認 `.npmrc` 含 `engine-strict=true`(本 baseline 已就位)。
  - `SSH agent not forwarded` → 宿主端跑 `ssh-add` 後 Rebuild Container;不阻擋啟動,但 git push 會 fall back HTTPS。

## Step 2 — 跑起 Node 應用 stack

於 dev container 內 terminal:

```bash
make up
```

預期 ≤ 30 秒(已 build 過 base image 的話更快)。三個 service 都會通過 healthcheck:

```bash
make logs            # 跟蹤 app log
curl http://localhost:8000/health
# 預期: {"status":"ok","db":true,"redis":true}

curl http://localhost:8000/metrics | head
# 預期: # HELP process_cpu_user_seconds_total ... 等 prom-client default + http_*
```

## Step 3 — 跑 quality gates 一次(sanity)

```bash
make test            # vitest 全綠 (20 tests pass on Node side)
make typecheck       # tsc --noEmit 0 errors
make lint            # eslint 0 errors + prettier --check pass
```

任一失敗:
- 多半是環境配置問題;檢查 `.npmrc` `engine-strict` 是否生效(`pnpm config get engine-strict` 應為 `true`)。
- 若是 `pnpm-lock.yaml outdated lockfile`,跑 `pnpm install` 重生並 commit(README §8 FAQ)。

✅ 抵達此步即達成 SC-001(onboarding ≤ 15 min,首次 build 計算 build + reopen + 此 sanity);後續 reopen 應 ≤ 3 min(只跑 `postStartCommand`)。

## Step 4 — 跑你的第一個 SDD feature(目標 ≤ 1 hour,SC-007)

於 dev container 內 terminal:

```bash
claude          # 啟動 Claude Code;不需登入(host credential 已 mount)
```

於 Claude Code prompt 中(以新增一個 `GET /echo` endpoint 為例):

```
/speckit-specify 在 Node 應用加一個 GET /echo endpoint,回傳 query string ?msg=foo 的內容
```

預期(透過 `before_specify=speckit-git-feature` mandatory hook):
- 自動建立 feature branch `002-echo-endpoint`(NNN 由 spec-kit 自動編號)
- 產出 `specs/002-echo-endpoint/spec.md` + `checklists/requirements.md`

> 注意:本範例編號 `002` 在當前 monorepo 已被 002-cloudflare-worker 規劃預留;adopter 自家的第一個 feature 應使用下一個可用編號(如 `003-echo-endpoint`)。實際數字由 `before_specify` hook 自動決定。

```
/speckit-clarify
```

回答 ≤ 5 題互動式問題(若 spec 無 ambiguity 會直接告知並建議 `/speckit-plan`)。

```
/speckit-plan
```

產出 `plan.md` + `research.md` + `data-model.md`(若有 entity)+ `contracts/`(若有外部介面)+ `quickstart.md`。內含 Constitution Check 對照憲法 v1.0.0 的五原則。

**人類 review gate(FR-013)**:此時你必須 review `spec.md` + `plan.md`。**可作者本人 review**,但 review 必須真的發生。確認後:

```
/speckit-tasks
```

產出 `tasks.md`(dependency-ordered)。

```
/speckit-implement
```

逐項執行 task,RED → GREEN → REFACTOR。預期 quality gates 全綠後完成。

✅ 整個流程 ≤ 1 hour 即達成 SC-007。

## Step 5 — Commit + Push(專案規範)

依本 monorepo `CLAUDE.md` 的 Git Workflow Project Override:

- **commit**:Claude 會草擬訊息 + 列待 stage 檔,**等你下 `commit` 才執行**。
- **push**:同樣,**等你下 `push` 才推到 origin**。
- 「commit + push」可一次說 `commit + push` 或 `commit and push it`。

理由:final approval over staging scope and remote pushes 由 user 持有。

```bash
# Claude 草擬完 message + staging 後,你下:
commit
# 或:
commit + push
```

容器內 `git push` 會透過 SSH agent forwarding(FR-014)使用宿主端 unlock 過的 SSH key。

## Step 6 — 進階(optional)

- 想看 Worker 端 demo:**等 002-cloudflare-worker 落地** — 屆時 Step 2 後可加 `pnpm dev:worker`(於 :8787 跑 wrangler dev),`curl localhost:8787/d1/now` 等。
- 想升級工具鏈(spec-kit / wrangler / vitest):編輯對應 version 宣告位置(`.devcontainer/post-create.sh` 或 `package.json`),跑 `pnpm install` 重生 lockfile,**單獨 commit**(FR-019)。Revert 應一次到位,不夾雜其他變更。
- 想跑 `/speckit-analyze`:在 feature dir 完整(spec + plan + tasks)後執行,跨 artifact 一致性掃描(non-destructive)。

## Step 7 — 我卡住了

| 症狀 | 動作 |
|---|---|
| 容器內 `claude --version` 失敗或要求登入 | 回宿主端 `claude` 完成 OAuth → Rebuild Container |
| `make up` 失敗 `ERR_PNPM_OUTDATED_LOCKFILE` | 容器內 `pnpm install` 重生 lockfile,然後 `commit pnpm-lock.yaml` |
| `make test` 失敗只在 Mac / WSL 一邊 | container parity 缺陷(SC-008 配額);先用 `git status` 確認本地無未 commit 變更,再 `make rebuild` 重 build app image |
| 想關 HTTP middleware metrics | `.env` 加 `HTTP_METRICS_ENABLED=false`,重啟 stack;`/metrics` 仍含 default runtime 指標 |
| 上游 outage(spec-kit / npm / GitHub / Anthropic / Cloudflare) | 已 build 的容器 + cache 認證下,本地寫程式 / 跑既有測試 / commit **不被阻擋**(FR-020);需新拉資源的操作等上游恢復;見 README §8(若 README 已加 outage runbook 連結)|

## Acceptance — 你完成了嗎?

- [ ] `make up` 全綠 healthcheck,`/health` 回 200
- [ ] `make test` / `typecheck` / `lint` 全綠
- [ ] `claude --version` 不要求重新登入
- [ ] 透過 `/speckit-*` pipeline 走完一個自家 trivial feature
- [ ] feature 對應 `specs/NNN-*/` 目錄 + git branch 隔離 + 通過所有 quality gate
- [ ] commit / push 由你明確指示後執行(專案 CLAUDE.md 規範)

✅ 全部勾選 → 你已驗證 baseline 的 SC-001 / SC-002(部分)/ SC-007 / SC-009 / FR-007 / FR-013 / FR-016 / FR-019。剩下的 SC(SC-005 toolchain revert / SC-006 secret-scan / SC-008 quarterly parity defects / SC-010 MTTD / SC-011 cross-runtime ban)屬於長期維運指標,持續驗證即可。

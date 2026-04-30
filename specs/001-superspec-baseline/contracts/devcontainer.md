# Contract: DevContainer (Reopen-to-Ready)

**Audience**: Adopter on macOS Apple Silicon or WSL2 Ubuntu
**Surface owner**: `.devcontainer/devcontainer.json` + `.devcontainer/Dockerfile` + `.devcontainer/post-create.sh`
**Related FR / SC**: FR-001, FR-002, FR-003, FR-014, FR-017, SC-001

## Adopter 約定

採用此 monorepo 後,在已具備 Docker Desktop / VS Code / Git / Claude Code OAuth 的乾淨機器上:

```
clone repo → open in VS Code → "Reopen in Container" → 等待 ≤ 15 min → 容器 ready
```

「容器 ready」定義:

- 容器內 `which claude && which specify && which node && which pnpm` 全部回傳路徑
- `claude --version` 不要求重新登入
- `post-create.sh` 的 banner 已輸出且 `WARN:` / `NOT FOUND` 行數為 0
- `make up` 可立即執行 Node 端 stack(不再等待背景安裝)
- Worker 端 `wrangler dev` 可立即執行(由 002 落地後,wrangler 由 pnpm install 帶入,無額外 host bootstrap)

二次 reopen(已 build 過):`≤ 3 min`(只跑 `postStartCommand`,不再 `postCreateCommand`)。

## Container 提供的能力

| 能力 | 來源 | 對 adopter 的承諾 |
|---|---|---|
| `claude` CLI | `ghcr.io/anthropics/devcontainer-features/claude-code:1` + host bind mount `~/.claude` `~/.claude.json` | 不要求二次登入;OAuth credentials 與宿主端一致(FR-007)。 |
| `specify` CLI | `post-create.sh` 內 `uv tool install specify-cli --from git+...spec-kit.git@v0.8.1` | 釘住 `v0.8.1`,升級走孤立 commit(FR-019)。 |
| `superpowers` skills | `post-create.sh` 內 `git clone --depth=1 https://github.com/obra/superpowers ~/.claude/skills/superpowers` | 跨容器持久(因 `~/.claude` 為 host bind mount)。 |
| `node` 22 + `pnpm` | `ghcr.io/devcontainers/features/node:1` + `corepack enable pnpm` | 機器強制 Node ≥ 22(FR-008,`engine-strict=true`)。 |
| `docker` CLI(DooD) | `ghcr.io/devcontainers/features/docker-outside-of-docker:1` | 容器內可開 sibling container,但路徑必須是 host 絕對路徑(由 `LOCAL_WORKSPACE_FOLDER` env 提供,Mac/WSL 兩平台共用)。 |
| `git` + `gh` | features:`git:1` + `github-cli:1` | SSH agent forwarding 由 VS Code Dev Containers 內建機制處理(terminal attach 時 inject `/tmp/vscode-ssh-auth-<uuid>.sock` 並設 `SSH_AUTH_SOCK` env);**v1.0.0 baseline 不顯式 bind mount 該 socket**(issue #1 修補後拿掉,因 Mac launchd path 在 Docker Desktop VM 內不可見會 hard-fail;Linux unix socket 也被 VS Code override 後變裝飾)。前提:host 端 `ssh-add` 已載 identity。FR-014。 |
| `bash history` 持久 | named volume `spec-kit-bash-history-${devcontainerId}` | 容器重建保留指令歷史。 |
| Mac credsStore 修補 | `post-create.sh` 條件式偵測(`/Users/*` 路徑) | Mac + DooD 組合下移除 broken credsStore;WSL / Linux 不觸碰。 |
| `init-firewall.sh` 復原 | `post-create.sh` 末段 `sudo install -m 0755 .devcontainer/init-firewall.sh /usr/local/bin/` | 防止 claude-code feature 上游版本覆蓋 project 版本(無 `ENABLE_FIREWALL` guard)。 |
| `wrangler` (Worker dev) | 由 002-cloudflare-worker 引入 `wrangler` 至 devDependencies;dev container 無額外 feature | 在 dev container 內透過 `pnpm dev:worker` (002 引入 script) 啟 miniflare。**v1.0.0 ratification 時尚未引入。** |

## 不變量(must)

1. **不要求宿主端裝 Node/pnpm/Postgres/Redis/wrangler**:除 Docker / IDE / Git / Claude OAuth 外,任何工具於 host 安裝皆視為偏離 baseline(憲法 Principle III)。
2. **跨平台 byte-equivalent 進入點**:同一份 `devcontainer.json` 無 OS-specific 分支;OS 特異邏輯只在 `post-create.sh` 內以 `LOCAL_WORKSPACE_FOLDER` pattern 守護。
3. **不在 image bake credentials**:`~/.claude/.credentials.json` 永遠 mount 自 host,不被 COPY 進 image(FR-007)。SSH agent 同理(FR-014)。
4. **不主動 forwardPorts**:application port 由 compose 直接 publish;`devcontainer.json` `forwardPorts: []` 避免 VS Code forwarder 與 compose port 衝突。
5. **`postCreateCommand` 須 idempotent**:重建容器(VS Code → Rebuild Container)後仍應正常完成 — `post-create.sh` 已有 `[ ! -d ".specify" ]`、`[ ! -d "$SUPERPOWERS_DIR" ]` 等 guard。

## 失敗模式

| 場景 | 期望行為 |
|---|---|
| 宿主端未登入 Claude | `claude` 進容器後提示「先在宿主端登入」(FR-007 + spec Edge Case) — 行為依賴 claude-code feature 與 host bind mount;若 mount 路徑與 host `$HOME` 不一致(WSL 常見誤裝),`claude` 看到空目錄,`post-create.sh` 的 OAuth credential health check(L165-174)會 warn。 |
| Docker daemon 未跑 | DooD 失效;`docker` CLI 在容器內錯誤訊息須清楚指出「上游不可達」(FR-020) |
| `corepack` interactive prompt 卡住 | `containerEnv.COREPACK_ENABLE_DOWNLOAD_PROMPT=0` + `post-create.sh` `export` belt-and-suspenders(已實作) |
| `post-create.sh` 失敗 | VS Code 顯示錯誤;banner 部分輸出可幫助定位(`uv` / `specify` / `claude` / `node` / `pnpm` 哪一個 NOT FOUND);spec-kit 上游 unreachable 時印明確訊息並 exit 1(`post-create.sh:79-84`) |
| `init-firewall.sh` 在 postStart 失敗 | `\|\| echo 'firewall skipped (not enabled)'` fallback;預設不啟用 firewall 屬正常情境 |
| SSH agent 未轉發(host 未載 identity / VS Code forwarder 不可用) | `post-create.sh:209-230` SSH sanity check 在 postCreateCommand 階段以 INFO 級別告知:VS Code 在 terminal attach 時才 inject SSH_AUTH_SOCK;若終端跑 `ssh-add -L` 仍空,host 端跑 `ssh-add ~/.ssh/<key>` 後重 attach 容器即可,否則 git push 自動 fall back HTTPS |
| Repo 放於 WSL `/mnt/c/...` | 不 hard fail,但 README + `post-create.sh` OAuth check 提示效能與路徑解析風險(spec Edge Case)|

## 版本

- `claude-code:1`、`docker-outside-of-docker:1`、`node:1`、`git:1`、`github-cli:1`(features 主版本)。
- spec-kit:`v0.8.1`(post-create.sh 釘住)。
- Node:`22`(features `node:1` 設 `version: "22"`)。
- pnpm:由 corepack 啟用,版本由 `package.json` `packageManager` field 釘住。
- 升級任一條目 = toolchain 升級 = 孤立 commit(FR-019)。

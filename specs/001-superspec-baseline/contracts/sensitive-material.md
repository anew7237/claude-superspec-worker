# Contract: Sensitive Material Hygiene

**Audience**: Adopter / PR reviewer / secret-scan tooling
**Surface owner**: `.gitignore` + `.devcontainer/devcontainer.json` mounts + `.env.example`
**Related FR / SC**: FR-007, FR-014, SC-006

## Deny List(`.gitignore`)

repo 層級必須拒絕以下檔案進入 git index。

### Claude Code credentials

- `.claude/.credentials.json`
- `.claude/credentials.json`
- `.claude/projects/`
- `.claude/todos/`
- `.claude/statsig/`
- `.claude/shell-snapshots/`
- `.claude/ide/`
- `.claude/settings.local.json`(個人 override)
- `.claude.json`
- `.claude.json.backup`
- `.credentials.json`(根)

### 環境機密

- `.env`、`.env.local`、`.env.*.local`
- **`.dev.vars`**(wrangler 本機 secrets 檔,於 002 落地時開始實際使用;v1.0.0 已預先列入 `.gitignore`)
- `*.pem`、`*.key`(任何私鑰)

### Docker 個人 override

- `docker-compose.override.yml`
- `.devcontainer/devcontainer.local.json`

### Build artifacts(避免污染 + 跨檔案系統 IO 問題)

- `node_modules/`、`dist/`、`coverage/`、`.vitest-cache/`、`.pnpm-store/`、`*.tsbuildinfo`
- `.wrangler/`(wrangler local cache,由 002 落地;**v1.0.0 預先列入有助於避免後續忘記**;若當前 `.gitignore` 尚未列入,屬 follow-up — 但實務上 `.wrangler/` 在 v1.0.0 不會被建立,故無實際洩漏風險)

### Logs / IDE / OS

- `*.log`、`logs/`、`.vscode/*`(except `extensions.json` / `settings.shared.json`)、`.idea/`、`.DS_Store`、`Thumbs.db`、`desktop.ini`

### Spec-Kit 擴充快取

- `.specify/extensions/.cache/`

## DevContainer mount 規範

`.devcontainer/devcontainer.json` 必須:

| Mount | 目的 | 不變量 |
|---|---|---|
| `${localEnv:HOME}/.claude → /home/vscode/.claude` (bind, cached) | 跨容器保留 OAuth 認證 | 不可改為 COPY into image |
| `${localEnv:HOME}/.claude.json → /home/vscode/.claude.json` (bind) | 同上 | 同上 |
| `spec-kit-bash-history-${devcontainerId} → /commandhistory` (volume) | 跨容器保留 shell history | 與 credential 隔離 — 不應含敏感資訊 |
| `${localEnv:SSH_AUTH_SOCK} → /ssh-agent` (bind) + `containerEnv.SSH_AUTH_SOCK=/ssh-agent` | source-control credential forwarding(FR-014) | 顯式宣告於 `mounts`,使行為與 IDE 解耦 |

## 不變量(must)

1. **OAuth credentials = 0 in git**(SC-006):`gitleaks` 或等價工具掃描全 history hits = 0。
2. **永不 COPY credentials 進 image**:Dockerfile 各 stage `COPY` 命令不可包含 `~/.claude*`、`.credentials*`、`.dev.vars` 等;一旦違反,該 image 屬「污染」必須重 build。
3. **`.env.example` ≠ `.env`**:範本可進 git,實際機密永不進 git。同樣的邏輯適用於未來 wrangler:`.dev.vars.example`(若引入)可進 git,`.dev.vars` 永不進。
4. **個人 override 隔離**:`.claude/settings.local.json` / `docker-compose.override.yml` / `.devcontainer/devcontainer.local.json` 只屬個人開發機,不對 team 可見。
5. **`init-firewall.sh` 提供可選 egress 白名單**:對企業 / 高敏感場景的 adopter 可啟用;預設關閉,以保開發體驗。
6. **SSH agent 不烘焙**(FR-014):`/ssh-agent` 為 host bind mount;若 host 端 mount 失敗,`post-create.sh` SSH sanity check 印 WARN 並讓 git push fall back HTTPS,**永不嘗試在 image 內 bake key 或啟 ssh-agent 並注入 key**。

## 失敗模式

| 場景 | 期望行為 |
|---|---|
| 開發者誤 `git add .credentials.json` | `.gitignore` 擋下;若 `git add -f` 強制加入須在 PR review 駁回 |
| 開發者誤 `git add .dev.vars`(自 002 起) | 同上 — `.gitignore` 擋下 |
| OAuth credentials 已洩漏到 git history | 立即 rotate(於 https://console.anthropic.com 撤銷);用 `git filter-repo` 清歷史;force-push;通知所有 collaborator 重 clone |
| 容器內 `claude` 看不到 host credentials | mount 路徑與 host `$HOME` 不一致(WSL 常見誤裝;不可把 repo 放 `/mnt/c/`);`post-create.sh:165-174` OAuth credential health check 印 WARN |
| SSH agent forwarding 在某些 IDE / OS 不工作 | `post-create.sh:222-232` 偵測 socket;失敗時 WARN 並讓 git push fall back HTTPS。Mac 用 Docker Desktop magic socket(`/run/host-services/ssh-auth.sock`)的情境由 adopter 自行調整 mount source(spec edge case 已標明) |
| Worker 端 `wrangler.jsonc` 內誤填 secret(自 002 起) | wrangler 慣例 secrets 走 `wrangler secret put` 不寫進 `wrangler.jsonc`;若違規,reviewer 駁回 — 屬 advisory gate(spec / 後續 feature 可加 mechanical 檢查) |

## 監控 / Audit

baseline 不規範定期 audit 頻率(視 adopter 安全成熟度而定),但建議:

- PR pre-merge:CI 跑 `gitleaks detect --redact`(整合進 CI workflow,屬 future feature;見 quality-gates.md「CI 對應」段)。
- 月度 / 季度:`gitleaks detect --since <date>` 對新增 history 全掃。
- 每次 toolchain 升級後:`/speckit-analyze` 輔助交叉檢查。
- Cloudflare Workers 端:wrangler 部署後檢查 Cloudflare Dashboard secrets,確保未誤把 secret 命名為非 secret。

#!/usr/bin/env bash
# ============================================================
# post-create.sh
#
# 容器第一次建立後執行(devcontainer.json 的 postCreateCommand)
# 主要做:
#   1. 安裝 spec-kit (specify CLI)
#   2. 安裝 obra/superpowers skills
#   3. 在當前目錄初始化 spec-kit(若尚未初始化)
#   4. 健康檢查
# ============================================================

set -euxo pipefail

# 確保 PATH 抓得到 uv 跟 spec-kit
export PATH="$HOME/.local/bin:$PATH"

# Corepack 在第一次 `pnpm --version` 時會印 interactive 下載 prompt
# (Y/n) 並讀取 /dev/tty,即使 stderr 被 redirect 也會卡住。
# 本腳本最後的 health-check banner 會呼叫 `pnpm --version`,若此時 corepack
# 還沒下載 pnpm binary,banner 就會掛在那不繼續(2026-04-26 實測發現)。
# 設成 0 讓 corepack 在後續呼叫時自動下載、不彈 prompt。
# 範圍:只在本腳本的子 process 生效,不影響使用者後續手動呼叫的行為。
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# ============================================================
# pnpm via corepack
# 必須放在 post-create.sh,不能放 Dockerfile —— node/corepack 是由
# devcontainer feature 在 image build 之後裝的,Dockerfile RUN 階段
# 沒有 corepack binary,會 exit 127。
# ============================================================
if command -v corepack >/dev/null 2>&1; then
    echo "==> Enabling pnpm via corepack..."
    # devcontainer node feature 用 nvm 把 node/corepack 裝在類似
    # /usr/local/share/nvm/versions/node/vXX/bin/ 的路徑,這個路徑不在
    # sudo 預設的 secure_path。兩個連環問題:
    #   1. `sudo corepack` 直接噴 command not found
    #   2. 即使指絕對路徑 `sudo /.../corepack`,corepack 內部 shebang
    #      `#!/usr/bin/env node` 在 sudo 子程序又找不到 node → env: 'node': ...
    # 正解:用 `sudo env PATH="$PATH"` 把 user 的 PATH 一路傳進 sudo 子程序。
    sudo env PATH="$PATH" corepack enable pnpm
else
    echo "WARN: corepack not found — Node devcontainer feature may have failed to install"
fi

# ============================================================
# Docker credential helper workaround(Mac + DooD 特有)
# VS Code Dev Containers 會注入 credsStore 指向
# docker-credential-dev-containers-* helper。在 Mac Docker Desktop +
# docker-outside-of-docker 組合下,這個 helper 回傳 exit 255,導致
# 任何 docker 指令(即使只拉 public image)都噴
# "error getting credentials - err: exit status 255"。
#
# 此 template 只用 public image,直接把 credsStore 拿掉即可。
# 條件限制在 Mac host —— 透過 LOCAL_WORKSPACE_FOLDER 是否
# 以 /Users/ 開頭判斷(Mac 慣例);WSL (/mnt/...) 與 Linux (/home/...)
# 完全不觸碰原本可能能用的 credsStore。
# ============================================================
if [[ "${LOCAL_WORKSPACE_FOLDER:-}" == /Users/* ]] \
   && [ -f "$HOME/.docker/config.json" ] \
   && grep -q '"credsStore"' "$HOME/.docker/config.json"; then
    echo "==> Mac host detected; stripping VS Code's broken credsStore from ~/.docker/config.json..."
    tmp=$(mktemp)
    jq 'del(.credsStore)' "$HOME/.docker/config.json" > "$tmp" \
        && mv "$tmp" "$HOME/.docker/config.json"
fi

# ============================================================
# spec-kit
# 釘版本而不是 main,避免上游 breaking change 害你
# 升級時手動把這個版號改掉
# ============================================================
SPEC_KIT_VERSION="v0.8.1"

if ! command -v specify >/dev/null 2>&1; then
    echo "==> Installing spec-kit ${SPEC_KIT_VERSION}..."
    if ! uv tool install specify-cli \
            --from "git+https://github.com/github/spec-kit.git@${SPEC_KIT_VERSION}"; then
        echo "ERROR: spec-kit install failed — 上游(GitHub / PyPI)可能不可達。"
        echo "       詳細處置見 .docs/upstream-outage-runbook.md(C. GitHub / D. npm registry)。"
        echo "       本次安裝跳過;若上游已恢復,可手動執行 \`uv tool install --force ...\` 重試。"
        # 仍 exit 1 讓 postCreateCommand 失敗醒目;adopter 會看到 VS Code 提示
        exit 1
    fi
fi

# ============================================================
# obra/superpowers — Claude Code skills 集合
# 安裝到 ~/.claude/skills/superpowers,跨專案共用
# 因為 ~/.claude 是從 host bind mount 進來的,所以這個會
# 持續存在,不需要每次重建容器都 clone
# ============================================================
SUPERPOWERS_DIR="$HOME/.claude/skills/superpowers"
if [ ! -d "$SUPERPOWERS_DIR" ]; then
    echo "==> Cloning obra/superpowers..."
    mkdir -p "$HOME/.claude/skills"
    git clone --depth=1 https://github.com/obra/superpowers "$SUPERPOWERS_DIR" || {
        echo "WARN: failed to clone superpowers — 上游(GitHub)可能不可達。"
        echo "      詳細處置見 .docs/upstream-outage-runbook.md(C. GitHub)。"
        echo "      容器將繼續啟動;superpowers 暫時不可用,等上游恢復後手動 git clone。"
    }
else
    echo "==> superpowers already present, skipping clone"
fi

# ============================================================
# 在當前 workspace 初始化 spec-kit(若尚未初始化)
# 已經有 .specify/ 就跳過
# ============================================================
if [ ! -d ".specify" ]; then
    echo "==> Initializing spec-kit in current workspace..."
    specify init . --ai claude --ai-skills --force --no-git
else
    echo "==> .specify/ already exists, skipping init"
fi

# ============================================================
# 健康檢查
# ============================================================
echo ""
echo "================================================================"
echo "  Environment ready"
echo "================================================================"
echo "  uv:         $(uv --version 2>/dev/null || echo 'NOT FOUND')"
# `specify version` prints an ASCII banner — parse uv tool list for a clean version string
echo "  specify:    $(uv tool list 2>/dev/null | awk '/^specify-cli/ {print $2; exit}' | grep . || echo 'NOT FOUND')"
echo "  claude:     $(claude --version 2>/dev/null || echo 'NOT FOUND')"
echo "  node:       $(node --version 2>/dev/null || echo 'NOT FOUND')"
echo "  pnpm:       $(pnpm --version 2>/dev/null || echo 'NOT FOUND')"
# engine-strict from .npmrc — value should be 'true' (T003 / FR-008).
# If 'false' or missing, machine-enforcement of engines.node is advisory only.
ENGINE_STRICT=$(pnpm config get engine-strict 2>/dev/null || echo 'unset')
echo "  engine-strict: ${ENGINE_STRICT}"
if [ "${ENGINE_STRICT}" != "true" ]; then
    echo "WARN: engine-strict not active — Node version enforcement may be advisory only. Verify .npmrc contains 'engine-strict=true' (FR-008)."
fi
# tsc / vitest are project devDependencies; only available after `pnpm install`
if [ -x node_modules/.bin/tsc ]; then
    echo "  tsc:        $(node_modules/.bin/tsc --version 2>/dev/null | awk '{print $NF}')"
else
    echo "  tsc:        (run 'pnpm install' to enable)"
fi
if [ -x node_modules/.bin/vitest ]; then
    echo "  vitest:     $(node_modules/.bin/vitest --version 2>/dev/null)"
else
    echo "  vitest:     (run 'pnpm install' to enable)"
fi
echo "  docker:     $(docker --version 2>/dev/null || echo 'NOT FOUND')"
echo "  docker compose: $(docker compose version 2>/dev/null | head -n1 || echo 'NOT FOUND')"
echo "  git:        $(git --version 2>/dev/null || echo 'NOT FOUND')"
echo "================================================================"
echo ""

# ============================================================
# Claude OAuth credential health check
#
# `claude --version` 只驗證 binary 在不在,不能保證使用者已經登入。
# 真正的 OAuth credential 是由 host 的 ~/.claude/.credentials.json
# bind-mount 進來;若檔案不存在,downstream 指令會在第一次呼叫
# Anthropic API 時才以 "not logged in" 失敗 —— 在 banner 階段就抓出來,
# 給使用者明確可動作的訊息。
#
# set -e 友善:純 if/then/fi,read-only 探測,沒有副作用。
# ============================================================
if [ ! -f "$HOME/.claude/.credentials.json" ]; then
    echo "WARN: Claude Code OAuth credentials not detected at ~/.claude/.credentials.json"
    echo "    請在「宿主端」(non-container) 執行:"
    echo "      claude"
    echo "    完成 OAuth login 後,重啟容器(VS Code → Rebuild Container)。"
    echo "    WSL2 用戶請確認 repo clone 在 WSL 檔案系統(~/),"
    echo "    不要放於 /mnt/c/(host bind mount 路徑會無法解析)。"
else
    echo "==> Claude OAuth credentials detected (host-mounted)"
fi
echo ""

echo "Next steps:"
echo "  1. Run 'claude' to start Claude Code (login if first time)"
echo "  2. Try /speckit-constitution to set project principles"
echo "  3. See README.md for the full SDD workflow"
echo ""

# ============================================================
# init-firewall.sh 安裝
#
# 此段原本在 Dockerfile 做(COPY + chmod)。但
# ghcr.io/anthropics/devcontainer-features/claude-code:1 這個 feature 在
# Dockerfile build 之後執行,會把它自己的 init-firewall.sh 寫到
# /usr/local/bin/init-firewall.sh,把我們的版本覆蓋掉(2026-04-26 WSL 實測)。
# 上游 feature 那份**沒有 ENABLE_FIREWALL guard**,postStartCommand 直接跑
# 會無條件嘗試設防火牆並在 verify 階段(curl example.com)失敗,觸發
# `|| echo 'firewall skipped (not enabled)'` fallback 訊息(看起來像 skip,
# 其實是失敗 fallback)。
#
# 解法:在 features 套用之後(post-create.sh 階段)再蓋一次。
# Dockerfile 那段 COPY 已移除(會被 feature 覆蓋,留著無意義);
# sudoers 改為對 vscode 全域 NOPASSWD(見 Dockerfile),不再需要
# per-script sudoers entry。
# ============================================================
echo "==> Restoring project init-firewall.sh over claude-code feature's version..."
sudo install -m 0755 .devcontainer/init-firewall.sh /usr/local/bin/init-firewall.sh

# 驗證:看 ENABLE_FIREWALL guard 在不在(辨認是否真的是 project 版本)
if ! grep -q 'ENABLE_FIREWALL' /usr/local/bin/init-firewall.sh; then
    echo "WARN: /usr/local/bin/init-firewall.sh 看起來不是 project 版本,restore 可能失敗"
fi

# ============================================================
# SSH agent forwarding sanity check (Gap G3 / FR-014)
#
# devcontainer.json 已顯式宣告 ${localEnv:SSH_AUTH_SOCK} → /ssh-agent
# 的 bind mount,並把容器內 SSH_AUTH_SOCK 指向 /ssh-agent。這段檢查
# 在容器啟動後驗證 socket 真的可用,並讓使用者清楚知道 `git push`
# 會走 SSH 還是 fallback HTTPS。
#
# 限制(set -e 友善):每個探測都包在 if ... then ... fi,失敗不終止
# post-create.sh,只是 warn。
# 冪等性:純讀取/列印,容器每次重建都跑無副作用。
# ============================================================
echo ""
echo "==> SSH agent forwarding sanity check..."
# postCreateCommand 跑在 container setup 階段,VS Code 的 SSH forwarder 在
# 此時尚未 attach(它於使用者開第一個 terminal 時才 inject SSH_AUTH_SOCK
# 與 socket file)。因此此處只能做「弱檢查」+ 提示。
if [ -n "${SSH_AUTH_SOCK:-}" ] && [ -S "${SSH_AUTH_SOCK}" ] \
        && ssh-add -l >/dev/null 2>&1; then
    echo "==> SSH agent forwarded (SSH_AUTH_SOCK=${SSH_AUTH_SOCK}); \`git push\` will use SSH keys"
else
    echo "INFO: SSH agent not yet visible at postCreateCommand time. VS Code Dev Containers will inject it when you open a terminal — verify with: \`ssh-add -L\` (預期印出 host 端載入的公鑰)。若空,在 host 端跑 \`ssh-add ~/.ssh/<key>\` 後重 attach 容器即可;否則 \`git push\` 會 fall back HTTPS。"
fi


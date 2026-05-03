#!/usr/bin/env bash
# ============================================================
# supabase-init.sh
# Bootstrap + 第一次產密鑰 / 重產密鑰 / 砍重來 — 三種明確模式
#
# 假設目錄佈局:
#   <workspace>/
#   ├── supabase-init.sh           ← 本腳本
#   ├── supabase-info              ← bootstrap 完寫的版本記錄(供查詢)
#   ├── supabase-clone/            ← clone 的 supabase repo(共用,可 cd 進去看 git log)
#   └── supabase-docker/           ← 預設 docker dir 名稱(可改:--docker-dir)
#       ├── .env
#       ├── docker-compose.yml
#       └── utils/                 ← supabase 官方 admin scripts(從 docker/utils/ 帶過來)
#           ├── generate-keys.sh        ★ 本腳本用 — 產 legacy HS256(JWT_SECRET / ANON_KEY / SERVICE_ROLE_KEY / ...)
#           ├── add-new-auth-keys.sh    ★ 本腳本用 — 產 ES256 非對稱(SUPABASE_PUBLISHABLE_KEY / JWT_KEYS / JWT_JWKS)
#           ├── db-passwd.sh            ☆ rotate 後可選 — 同步 db 內 12 個 supabase user 密碼(保資料,推薦做法)
#           ├── reassign-owner.sh       (未用)表 owner 改派
#           ├── rotate-new-api-keys.sh  (未用)帶 grace period 的 API key 漸進式 rotate
#           └── upgrade-pg17.sh         (未用)Postgres 15 → 17 升級
#
# 三種模式:
#
#   ./supabase-init.sh                       # 預設 init: 全自動
#                                            # - self-host 不存在 → bootstrap
#                                            # - .env 還是 example 預設值 → 產密鑰
#                                            # - .env 已產過密鑰 → 拒絕(要用 --rotate)
#
#   ./supabase-init.sh --bootstrap-only      # 只 bootstrap,不產密鑰
#                                            # 給「我想自己手動配 .env」的人
#
#   ./supabase-init.sh --rotate              # 重新產密鑰 (DANGER) + 自動 sync db
#                                            # 印詳盡警告,需要打字確認
#                                            # 預設用 utils/db-passwd.sh 自動同步 POSTGRES_PASSWORD 到 db
#                                            # 要求 db 容器是 Up 狀態
#
#   ./supabase-init.sh --rotate --no-sync-db # 重產密鑰但不 sync db
#                                            # 給離線 / 自己處理 db 同步的場景
#                                            # (跑完印 4 選 1 善後 hint)
#
#   ./supabase-init.sh --rotate --reset-db   # 重產密鑰 + docker compose down -v
#                                            # 完全重來、資料全清
#                                            # 適合「我要 fresh start」場景
#
# 共用 flag:
#   --yes / -y                 跳過 init / bootstrap-only 的 y/N 確認
#                              ⚠️  不會跳過 --rotate 跟 --reset-db 的安全確認
#                                  (那兩個一律要打字確認 yes I understand / DELETE)
#   --no-sync-db               (僅 --rotate)跳過自動 db-passwd.sh sync
#                              預設行為:--rotate 跑完會自動 sync POSTGRES_PASSWORD 到 db
#                              加這 flag → 只改 .env、不動 db,印 4 選 1 善後 hint
#   --docker-dir <name>        指定 docker 目錄名(相對於本腳本所在位置)
#   --docker-dir=<name>        預設值見 DOCKER_DIR(現為 supabase-docker)
#   --root /absolute/path      指定絕對路徑(會蓋掉 --docker-dir;少用)
#   --ref <commit|tag|br>      指定 supabase 版本(預設見 DEFAULT_REF)
#   --help / -h                這份說明
# ============================================================

set -euo pipefail

# ── 預設值(可改)──
# 鎖定的 supabase/supabase commit/tag/branch
# 2026-05-01 master HEAD 是 aeda6a88a88ca0963e92ff1d81b5924f59bd6736
DEFAULT_REF="aeda6a88a88ca0963e92ff1d81b5924f59bd6736"
SUPABASE_REPO="https://github.com/supabase/supabase.git"

# 預設的 docker 目錄名(相對於 SCRIPT_DIR);可被 --docker-dir 覆蓋
DOCKER_DIR="supabase-docker"

# clone 出的 supabase repo 目錄名(相對於 SCRIPT_DIR);跟 docker dir 平行
CLONE_DIR="supabase-clone"

# ── 推算路徑 ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR=""            # 留空;parse 完再 resolve(--root 直接指定 / --docker-dir 計算 / 都沒給用 default)

# ── 預設 flag ──
MODE="init"            # init | bootstrap-only | rotate
ASSUME_YES=0
RESET_DB=0
NO_SYNC_DB=0
REF="$DEFAULT_REF"

# ── 解析參數 ──
while [ "$#" -gt 0 ]; do
    case "$1" in
        -y|--yes)            ASSUME_YES=1 ;;
        --root)              shift; ROOT_DIR="$(cd "$1" 2>/dev/null && pwd || echo "$1")" ;;
        --root=*)            ROOT_DIR="${1#--root=}"; ROOT_DIR="$(cd "$ROOT_DIR" 2>/dev/null && pwd || echo "$ROOT_DIR")" ;;
        --docker-dir)        shift; DOCKER_DIR="$1" ;;
        --docker-dir=*)      DOCKER_DIR="${1#--docker-dir=}" ;;
        --ref)               shift; REF="$1" ;;
        --ref=*)             REF="${1#--ref=}" ;;
        --bootstrap-only)    MODE="bootstrap-only" ;;
        --rotate)            MODE="rotate" ;;
        --reset-db)          RESET_DB=1 ;;
        --no-sync-db)        NO_SYNC_DB=1 ;;
        -h|--help)
            awk '
                /^# =/ {
                    ++n
                    sub(/^# ?/, "")
                    print
                    if (n == 2) exit
                    next
                }
                n >= 1 { sub(/^# ?/, ""); print }
            ' "$0"
            exit 0 ;;
        *) printf "unknown arg: %s\n" "$1" >&2; exit 2 ;;
    esac
    shift
done

# ── resolve ROOT_DIR + CLONE_PATH ──
# 優先序:--root(絕對路徑) > --docker-dir(相對 SCRIPT_DIR) > 預設 DOCKER_DIR
[ -z "$ROOT_DIR" ] && ROOT_DIR="$SCRIPT_DIR/$DOCKER_DIR"
CLONE_PATH="$SCRIPT_DIR/$CLONE_DIR"

# ── 顏色(用 ANSI-C 字面引號讓 \033 立刻變 ESC,heredoc 跟 %s 都能正確顯色)──
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; CYAN=$'\033[0;36m'; BOLD=$'\033[1m'; NC=$'\033[0m'
info()  { printf "%s[i]%s %s\n" "$CYAN" "$NC" "$*"; }
ok()    { printf "%s[✓]%s %s\n" "$GREEN" "$NC" "$*"; }
warn()  { printf "%s[!]%s %s\n" "$YELLOW" "$NC" "$*"; }
err()   { printf "%s[✗]%s %s\n" "$RED" "$NC" "$*" >&2; }

# ── flag 合理性檢查 ──
[ "$RESET_DB" -eq 1 ] && [ "$MODE" != "rotate" ] && {
    err "--reset-db 必須跟 --rotate 一起用"
    exit 2
}
[ "$NO_SYNC_DB" -eq 1 ] && [ "$MODE" != "rotate" ] && {
    err "--no-sync-db 必須跟 --rotate 一起用"
    exit 2
}

info "self-host root: $ROOT_DIR"
info "mode: $MODE  (yes=$ASSUME_YES, reset-db=$RESET_DB, no-sync-db=$NO_SYNC_DB, ref=$REF)"

# ============================================================
# helper: is_env_fresh — .env 還是 example 預設值嗎?
# ============================================================
is_env_fresh() {
    [ -f "$ROOT_DIR/.env" ] && \
        grep -qE '^JWT_SECRET=your-super-secret-jwt-token' "$ROOT_DIR/.env"
}

# ============================================================
# helper: bootstrap_supabase — 抓 docker/ 過來
# ============================================================
bootstrap_supabase() {
    info "── bootstrap ──"
    info "從 GitHub clone $SUPABASE_REPO  (ref=$REF)"
    case "$REF" in main|master) warn "ref 是分支會 drift。建議鎖 commit SHA 或 tag。" ;; esac

    command -v git >/dev/null || { err "git not found"; exit 1; }

    if [ "$ASSUME_YES" -ne 1 ]; then
        printf "Bootstrap into %s ?(y/N) " "$ROOT_DIR"
        read -r REPLY
        case "$REPLY" in [Yy]) ;; *) err "取消"; exit 1 ;; esac
    fi

    mkdir -p "$ROOT_DIR"

    if [ -d "$CLONE_PATH/.git" ]; then
        info "$CLONE_PATH 已存在 → fetch + checkout(增量更新)..."
        git -C "$CLONE_PATH" fetch --quiet --all --tags
    else
        rm -rf "$CLONE_PATH"
        info "git clone 至 $CLONE_PATH(可能 1-2 分鐘)..."
        git clone --quiet "$SUPABASE_REPO" "$CLONE_PATH"
    fi

    info "checkout $REF ..."
    git -C "$CLONE_PATH" checkout --quiet "$REF" 2>/dev/null \
        || { err "checkout $REF 失敗 — ref 不存在或拼錯"; exit 1; }

    local resolved_sha
    resolved_sha="$(git -C "$CLONE_PATH" rev-parse HEAD)"
    ok "checkout 成功:$resolved_sha"
    ok "clone 保留:$CLONE_PATH(可 cd 進去看 git log / git diff)"

    [ -d "$CLONE_PATH/docker" ] || { err "$CLONE_PATH/docker 不存在"; exit 1; }

    cp -rf "$CLONE_PATH/docker/." "$ROOT_DIR/"
    cp "$CLONE_PATH/docker/.env.example" "$ROOT_DIR/.env"
    ok "複製 docker/ 內容 → $ROOT_DIR"

    # 標記版本
    {
        echo "supabase_repo=$SUPABASE_REPO"
        echo "ref=$REF"
        echo "commit=$resolved_sha"
        echo "bootstrapped_at=$(date -Iseconds)"
    } > "$SCRIPT_DIR/supabase-info"
    ok "寫入版本標記 → $SCRIPT_DIR/supabase-info"

    # patch docker-compose.yml:Postgres data → named volume db-data
    info "patch docker-compose.yml:db data → named volume db-data ..."
    sed -i \
        -e 's|^\(\s*\)- ./volumes/db/data:/var/lib/postgresql/data:Z|\1# Switched to named volume to avoid NTFS pass-through IO penalty on /mnt/d (WSL)\n\1- db-data:/var/lib/postgresql/data:Z|' \
        "$ROOT_DIR/docker-compose.yml"

    if ! grep -qE '^\s+db-data:\s*$' "$ROOT_DIR/docker-compose.yml"; then
        awk '
            /^volumes:/ { in_v=1; print; next }
            in_v && /^[^[:space:]]/ { print "  db-data:"; in_v=0 }
            { print }
            END { if (in_v) print "  db-data:" }
        ' "$ROOT_DIR/docker-compose.yml" > "$ROOT_DIR/docker-compose.yml.tmp"
        mv "$ROOT_DIR/docker-compose.yml.tmp" "$ROOT_DIR/docker-compose.yml"
    fi
    ok "docker-compose.yml(db named volume)patch 完成"

    # ─── 多 stack 隔離:加 SCRIPT_DIR_NAME + 改 project name 跟 13 個 container_name ───
    local raw_dir_name sanitized_dir_name
    raw_dir_name="$(basename "$SCRIPT_DIR")"
    # 清除非合法字元(docker 容器名只允許 [a-zA-Z0-9_.-]),開頭去掉 -_
    sanitized_dir_name="$(printf '%s' "$raw_dir_name" | tr -c 'a-zA-Z0-9_.-' '_' | sed 's/^[-_]*//')"
    [ -n "$sanitized_dir_name" ] || sanitized_dir_name="default"
    info "SCRIPT_DIR_NAME = ${sanitized_dir_name}(由 basename '$raw_dir_name' 推算 + 清理)"

    # 寫進 .env(append 區段)
    {
        echo ""
        echo "############"
        echo "# Multi-stack isolation"
        echo "############"
        echo "# 由 supabase-init.sh 從 SCRIPT_DIR 的 basename 推算,套用在 docker-compose.yml:"
        echo "#   - top-level project name: supabase-name-\${SCRIPT_DIR_NAME:-test}"
        echo "#   - 12 個 container_name: supabase-XXX-\${SCRIPT_DIR_NAME:-test}"
        echo "#   - 1 個 realtime    : realtime-dev.supabase-realtime-\${SCRIPT_DIR_NAME:-test}"
        echo "# Volume / network 由 docker-compose 自動以 project name 加 prefix 隔離(不需手動改)"
        echo "SCRIPT_DIR_NAME=${sanitized_dir_name}"
    } >> "$ROOT_DIR/.env"
    ok "寫入 SCRIPT_DIR_NAME=${sanitized_dir_name} 到 .env"

    # patch docker-compose.yml:project name + 13 個 container_name 加後綴
    info "patch docker-compose.yml:project name + 13 個 container_name 加後綴 ..."
    sed -i \
        -e 's|^name: supabase$|name: supabase-name-${SCRIPT_DIR_NAME:-test}|' \
        -e 's|^\(\s*container_name:\s*supabase-[^[:space:]]*\)$|\1-${SCRIPT_DIR_NAME:-test}|' \
        -e 's|^\(\s*container_name:\s*realtime-dev\.supabase-realtime\)$|\1-${SCRIPT_DIR_NAME:-test}|' \
        "$ROOT_DIR/docker-compose.yml"
    ok "docker-compose.yml(multi-stack isolation)patch 完成"

    # .gitignore 補幾筆(clone 已搬出 ROOT_DIR,不再需要 .supabase-clone 條目)
    if [ -f "$ROOT_DIR/.gitignore" ]; then
        grep -qE '^\.env\.secrets\.\*' "$ROOT_DIR/.gitignore" || echo ".env.secrets.*" >> "$ROOT_DIR/.gitignore"
        grep -qE '^\.env\.old'          "$ROOT_DIR/.gitignore" || echo ".env.old"        >> "$ROOT_DIR/.gitignore"
    fi

    ok "bootstrap 完成"
    echo ""
}

# ============================================================
# helper: backup_env — 把現有 .env 備份成 .env.secrets.<ts>.bak
# ============================================================
backup_env() {
    local ts="$(date +%Y%m%d-%H%M%S)"
    local backup=".env.secrets.${ts}.bak"
    cp -p "$ROOT_DIR/.env" "$ROOT_DIR/$backup"
    chmod 600 "$ROOT_DIR/$backup" 2>/dev/null || true
    ok "備份現有 .env → $ROOT_DIR/$backup"
}

# ============================================================
# helper: generate_secrets — 跑 3 個 generate 步驟
# ============================================================
generate_secrets() {
    [ -f "$ROOT_DIR/utils/generate-keys.sh" ]    || { err "$ROOT_DIR/utils/generate-keys.sh 不存在"; exit 1; }
    [ -f "$ROOT_DIR/utils/add-new-auth-keys.sh" ] || { err "$ROOT_DIR/utils/add-new-auth-keys.sh 不存在"; exit 1; }
    command -v openssl >/dev/null || { err "openssl not found"; exit 1; }
    command -v node    >/dev/null || { err "node not found(add-new-auth-keys.sh 需要 node 16+)"; exit 1; }

    cd "$ROOT_DIR"
    info "Step 1/3 跑 utils/generate-keys.sh ..."
    sh ./utils/generate-keys.sh --update-env >/dev/null
    ok "legacy HS256 密鑰更新完成"

    info "Step 2/3 跑 utils/add-new-auth-keys.sh ..."
    sh ./utils/add-new-auth-keys.sh --update-env >/dev/null
    ok "asymmetric ES256 金鑰更新完成"

    info "Step 3/3 設定 POOLER_TENANT_ID ..."
    local tid; tid="$(openssl rand -hex 8)"
    sed -i "s|^POOLER_TENANT_ID=.*$|POOLER_TENANT_ID=${tid}|" .env
    ok "POOLER_TENANT_ID=${tid}"
}

# ============================================================
# helper: print_secrets_summary
# ============================================================
print_secrets_summary() {
    echo ""
    warn "新密鑰摘要(遮罩):"
    local mask_v get_v
    mask_v() { local v="$1"; local n=${#v}; if [ "$n" -le 12 ]; then echo "***"; else echo "${v:0:6}***${v: -4}"; fi; }
    get_v()  { grep "^$1=" "$ROOT_DIR/.env" | head -1 | cut -d= -f2- ; }
    printf "    %-32s %s\n" "POSTGRES_PASSWORD"        "$(mask_v "$(get_v POSTGRES_PASSWORD)")"
    printf "    %-32s %s\n" "JWT_SECRET"               "$(mask_v "$(get_v JWT_SECRET)")"
    printf "    %-32s %s\n" "ANON_KEY"                 "$(mask_v "$(get_v ANON_KEY)")"
    printf "    %-32s %s\n" "SERVICE_ROLE_KEY"         "$(mask_v "$(get_v SERVICE_ROLE_KEY)")"
    printf "    %-32s %s\n" "SUPABASE_PUBLISHABLE_KEY" "$(mask_v "$(get_v SUPABASE_PUBLISHABLE_KEY)")"
    printf "    %-32s %s\n" "SUPABASE_SECRET_KEY"      "$(mask_v "$(get_v SUPABASE_SECRET_KEY)")"
    printf "    %-32s %s\n" "DASHBOARD_PASSWORD"       "$(mask_v "$(get_v DASHBOARD_PASSWORD)")"
    printf "    %-32s %s\n" "VAULT_ENC_KEY"            "$(mask_v "$(get_v VAULT_ENC_KEY)")  ($(echo -n "$(get_v VAULT_ENC_KEY)" | wc -c) chars; 嚴格 32)"
    printf "    %-32s %s\n" "POOLER_TENANT_ID"         "$(get_v POOLER_TENANT_ID)"
    echo ""
}

# ============================================================
# helper: show_rotate_warning — 詳列風險
# ============================================================
show_rotate_warning() {
    cat <<WARN

${BOLD}${YELLOW}⚠️  ROTATE 模式 — 已運行的 stack 會被嚴重破壞${NC}

${YELLOW}🟡 POSTGRES_PASSWORD 變了 (預設自動同步)${NC}
   → 跑完會自動透過 utils/db-passwd.sh 把新密碼推進 db + .env
   → 既有 client 連線會中斷,要重連
   → 加 --no-sync-db 可跳過同步(自己後續處理)
   → 加 --reset-db 砍 volume 重建(資料全清)

${RED}🔴 JWT_SECRET 變了${NC}
   → 所有現有 session / OAuth / refresh token / 客戶端拿著的 ANON_KEY/SERVICE_ROLE_KEY 全失效
   → 已登入使用者被踢出
   → 第三方 app 拿著舊 key 一律 401
   → mobile / SPA 沒拿到新值前不能用

${RED}🔴 DASHBOARD_PASSWORD 變了${NC}
   → 你 Studio 進不去(用 .env 或備份找新密碼)

${YELLOW}🟡 _supavisor schema 會被 DROP + 重建 (db-passwd.sh 行為)${NC}
   → tenant metadata 會清,supavisor 重啟自動依 docker-compose env 重建
   → single-tenant 場景無傷;multi-tenant 要自己保留 tenants 資料

${YELLOW}🟡 VAULT_ENC_KEY 變了${NC}
   → 跟 _supavisor 重建配合,沒舊資料要解密所以無感

${YELLOW}🟡 PG_META_CRYPTO_KEY 變了${NC}
   → Studio 內已存的 DB 連線字串變亂碼(要重設)

${YELLOW}🟡 SECRET_KEY_BASE / LOGFLARE / S3 / MinIO password${NC}
   → 各對應 client 全要重新拿新值

${BOLD}建議:${NC}
   - 開發階段、還沒 client → 直接 rotate(預設自動 sync 最省事)
   - 已有第三方 client / production → 先停服務通知,再 rotate
   - 完全重來 → --reset-db
WARN
}

# ============================================================
# helper: show_reset_db_warning
# ============================================================
show_reset_db_warning() {
    cat <<WARN

${BOLD}${RED}🚨 --reset-db 同時開啟${NC}

下一步會跑:
    docker compose down -v
這會 ${BOLD}刪除 db-data 跟所有 docker volume${NC} 上的資料,包括:
  - Postgres 全部 schema / table / row
  - Storage 上傳的檔案
  - Realtime 設定
  - Supavisor metadata

${BOLD}完全無法救回。${NC}

WARN
}

# ============================================================
# helper: docker_reset_db
# ============================================================
docker_reset_db() {
    command -v docker >/dev/null || { err "docker not found"; exit 1; }
    cd "$ROOT_DIR"
    info "docker compose down -v ..."
    docker compose down -v
    ok "全 volume 清空"
    info "docker compose up -d ..."
    docker compose up -d
    ok "服務重新啟動,新 POSTGRES_PASSWORD 已套用(initdb 會用新值)"
}

# ============================================================
# helper: ensure_docker_db_up — 預檢 db 容器是 Up 狀態(--rotate 預設要求)
# ============================================================
ensure_docker_db_up() {
    command -v docker >/dev/null || { err "docker not found(--rotate 預設要 sync db,需要 docker)"; exit 1; }
    cd "$ROOT_DIR"
    local status
    status="$(docker compose ps --format '{{.Status}}' db 2>/dev/null | head -1)"
    case "$status" in
        Up*)
            ok "db 容器 Up:$status"
            ;;
        *)
            err "db 容器不是 Up 狀態(目前: ${status:-stopped/未建立})"
            err ""
            err "選一個解法:"
            err "  (1) 先把 stack 起來再 rotate(保資料):"
            err "      cd $ROOT_DIR && docker compose up -d"
            err "  (2) 砍 volume 重來(資料會清):"
            err "      ./supabase-init.sh --rotate --reset-db"
            err "  (3) 只改 .env、不 sync(中間態,自己後續同步):"
            err "      ./supabase-init.sh --rotate --no-sync-db"
            exit 1
            ;;
    esac
}

# ============================================================
# helper: sync_db_passwd_via_script — 用假 tty 包 utils/db-passwd.sh
#   - 解 db-passwd.sh 「stdin 必須是 tty」的限制
#   - 自動回 y 給互動 prompt
#   - 終態:db 內 12 個 user 密碼 + .env POSTGRES_PASSWORD 都同步成 db-passwd.sh 產的新值
# ============================================================
sync_db_passwd_via_script() {
    command -v script >/dev/null || { err "script command 找不到(util-linux 套件未裝)"; exit 1; }
    [ -f "$ROOT_DIR/utils/db-passwd.sh" ] || { err "$ROOT_DIR/utils/db-passwd.sh 不存在"; exit 1; }
    cd "$ROOT_DIR"
    info "用 script -qec 假 tty 跑 utils/db-passwd.sh ..."
    info "(會再產一個新隨機 POSTGRES_PASSWORD,蓋掉 generate-keys.sh 剛產的那個)"
    info "(會 DROP _supavisor schema 重建 — single-tenant 場景無傷)"

    # printf 'y\n' 透過 script 創出的 pty proxy 進去答 prompt
    if printf 'y\n' | script -qec 'sh ./utils/db-passwd.sh' /dev/null; then
        ok "db 內 12 個 user 密碼 + .env POSTGRES_PASSWORD 已同步"
    else
        err "db-passwd.sh 失敗(看上面輸出)"
        err "備援:用 --no-sync-db 重跑 + 自己處理"
        exit 1
    fi

    info "重啟容器套用新值(docker compose up -d --force-recreate)..."
    docker compose up -d --force-recreate >/dev/null
    ok "容器已重啟"
}

# ============================================================
# 主流程 — 依 MODE 分派
# ============================================================
case "$MODE" in

# ───────────────────────────────────────────────
init)
    if [ ! -d "$ROOT_DIR" ] || [ ! -f "$ROOT_DIR/.env" ]; then
        bootstrap_supabase
    else
        info "$ROOT_DIR 已存在,跳過 bootstrap"
    fi

    if ! is_env_fresh; then
        err "${BOLD}.env 已被產過密鑰(JWT_SECRET 不是 example 預設值)${NC}"
        err ""
        err "你可能想要的:"
        err "  1. 什麼都不做(已經 init 過了)"
        err "  2. 重產密鑰 → 用 --rotate(注意:會壞 running stack,看 --help)"
        err "  3. 砍重來   → 用 --rotate --reset-db(資料全清)"
        exit 1
    fi

    if [ "$ASSUME_YES" -ne 1 ]; then
        printf "在 fresh .env 上產密鑰嗎?(y/N) "
        read -r REPLY
        case "$REPLY" in [Yy]) ;; *) err "取消"; exit 1 ;; esac
    fi

    backup_env
    generate_secrets

    echo ""
    ok "Init 完成"
    echo ""
    warn "下一步:"
    echo "    cd $ROOT_DIR"
    echo "    docker compose pull           # 首次需要拉 image (~11 GB)"
    echo "    docker compose up -d"
    print_secrets_summary
    ;;

# ───────────────────────────────────────────────
bootstrap-only)
    if [ -d "$ROOT_DIR" ] && [ -f "$ROOT_DIR/.env" ]; then
        info "$ROOT_DIR 已 bootstrapped(.env 存在),跳過"
        info "若要產密鑰:./supabase-init.sh"
        info "若要重產:    ./supabase-init.sh --rotate"
        exit 0
    fi
    bootstrap_supabase
    echo ""
    ok "Bootstrap 完成,但密鑰還是 .env.example 的預設值"
    warn "${BOLD}絕不能直接用預設值上線${NC}。下一步:"
    echo "    ./supabase-init.sh             # 產密鑰(自動 init)"
    echo "    或自行修改 $ROOT_DIR/.env"
    ;;

# ───────────────────────────────────────────────
rotate)
    [ -d "$ROOT_DIR" ] && [ -f "$ROOT_DIR/.env" ] || {
        err "self-host 還沒 bootstrap。先跑:"
        err "  ./supabase-init.sh                  (init)"
        err "  ./supabase-init.sh --bootstrap-only (只 bootstrap)"
        exit 1
    }

    if is_env_fresh; then
        err ".env 還是 .env.example 預設值。這是「init」不是「rotate」。"
        err "請改用:./supabase-init.sh"
        exit 1
    fi

    # ── 預檢:預設要 sync,所以 db 必須 Up;有 --reset-db / --no-sync-db 才放行
    if [ "$RESET_DB" -ne 1 ] && [ "$NO_SYNC_DB" -ne 1 ]; then
        ensure_docker_db_up
    fi

    show_rotate_warning

    # ⚠️ rotate 的高風險確認 — --yes 不能跳
    echo ""
    printf '%s知道風險、繼續嗎?(輸入 "yes I understand" 確認):%s ' "$BOLD" "$NC"
    read -r REPLY
    [ "$REPLY" = "yes I understand" ] || { err "取消"; exit 1; }

    backup_env
    generate_secrets

    # ── 善後分派:reset-db / sync-db / no-sync-db ──
    if [ "$RESET_DB" -eq 1 ]; then
        show_reset_db_warning
        # ⚠️ reset-db 的 data-loss 確認 — --yes 不能跳
        printf '%s%s最後確認:輸入大寫 "DELETE" 砍 volume:%s ' "$BOLD" "$RED" "$NC"
        read -r REPLY
        [ "$REPLY" = "DELETE" ] || { err "取消 reset-db(密鑰已 rotate;但 volume 沒砍)"; exit 1; }
        docker_reset_db
    elif [ "$NO_SYNC_DB" -ne 1 ]; then
        sync_db_passwd_via_script
    fi

    echo ""
    ok "Rotate 完成"
    echo ""
    if [ "$RESET_DB" -eq 1 ]; then
        ok "(已執行 --reset-db,所有 volume 重建完成,新密鑰已生效)"
    elif [ "$NO_SYNC_DB" -eq 1 ]; then
        warn "${BOLD}--no-sync-db 啟用 — Postgres 內部密碼還是舊的。要恢復連線,4 選 1:${NC}"
        echo ""
        echo "    (a) 推薦 — 重跑本腳本(不加 --no-sync-db),自動 sync"
        echo "        ./supabase-init.sh --rotate"
        echo "        ⚠️  會再產一次 POSTGRES_PASSWORD(蓋掉這次的);其他密鑰不受影響"
        echo ""
        echo "    (b) 用 supabase 官方 utils/db-passwd.sh 同步(等同方案 a 內部行為)"
        echo "        cd $ROOT_DIR"
        echo "        docker compose up -d                     # 確認 db 容器是 Up"
        echo "        sh ./utils/db-passwd.sh                  # 互動,y → 同步 12 個 user"
        echo "        docker compose up -d --force-recreate"
        echo ""
        echo "    (c) 手動 ALTER 12 個 user(用 .env 內 --rotate 剛產的 POSTGRES_PASSWORD)"
        echo "        cd $ROOT_DIR"
        echo "        PWD=\$(grep ^POSTGRES_PASSWORD= .env | cut -d= -f2-)"
        echo "        docker compose exec -T db psql -U supabase_admin -d _supabase <<SQL"
        echo "          alter user postgres                    with password '\$PWD';"
        echo "          alter user supabase_admin              with password '\$PWD';"
        echo "          alter user supabase_auth_admin         with password '\$PWD';"
        echo "          alter user supabase_storage_admin      with password '\$PWD';"
        echo "          alter user supabase_functions_admin    with password '\$PWD';"
        echo "          alter user supabase_replication_admin  with password '\$PWD';"
        echo "          alter user authenticator               with password '\$PWD';"
        echo "          alter user authenticated               with password '\$PWD';"
        echo "          alter user anon                        with password '\$PWD';"
        echo "          alter user service_role                with password '\$PWD';"
        echo "          alter user dashboard_user              with password '\$PWD';"
        echo "          alter user pgbouncer                   with password '\$PWD';"
        echo "        SQL"
        echo "        docker compose up -d --force-recreate"
        echo ""
        echo "    (d) 砍 volume 重建(清資料)"
        echo "        cd $ROOT_DIR"
        echo "        docker compose down -v && docker compose up -d"
    else
        ok "(已自動 sync via utils/db-passwd.sh — db + .env 的 POSTGRES_PASSWORD 已一致)"
        ok "(_supavisor schema 已重建;單 tenant 場景無傷)"
    fi
    print_secrets_summary
    ;;

# ───────────────────────────────────────────────
*)
    err "未知 mode: $MODE"
    exit 2
    ;;
esac

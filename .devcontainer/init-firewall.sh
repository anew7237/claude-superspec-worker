#!/usr/bin/env bash
# ============================================================
# init-firewall.sh
#
# 可選的網路 egress 白名單,參考 Anthropic 官方 devcontainer。
# 預設「不啟用」(透過環境變數開關),因為一般開發會踩到很多
# 沒列在白名單的服務(各種 npm 鏡像、framework CDN、自家公司
# 內部服務等)。
#
# 啟用方式:
#   在 .env 或 devcontainer.json containerEnv 加入:
#     ENABLE_FIREWALL=1
#
# 適用情境:
#   - 跑不可信的程式碼(例如 code review 別人的 PR)
#   - 想嚴格限制 Claude Code 的 outbound 連線
#   - 公司資安政策要求
#
# 不適用情境:
#   - 開發初期,你還在裝套件、嘗試新工具
#   - 用很多公司內部服務或自架 registry
# ============================================================

set -euo pipefail

if [ "${ENABLE_FIREWALL:-0}" != "1" ]; then
    echo "init-firewall.sh: ENABLE_FIREWALL != 1, skipping"
    exit 0
fi

echo "==> Setting up firewall whitelist..."

# 清空舊規則
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X

# 預設政策:全部 DROP,只開白名單
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# 允許 loopback 跟 established connections
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# 允許 DNS(否則下面的域名解析會掛)
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

# 白名單域名
ALLOWED_DOMAINS=(
    # Anthropic
    "api.anthropic.com"
    "claude.ai"
    "console.anthropic.com"
    "statsig.anthropic.com"

    # GitHub
    "github.com"
    "api.github.com"
    "codeload.github.com"
    "objects.githubusercontent.com"
    "raw.githubusercontent.com"
    "ghcr.io"

    # npm
    "registry.npmjs.org"
    "registry.yarnpkg.com"

    # PyPI / uv
    "pypi.org"
    "files.pythonhosted.org"
    "astral.sh"

    # Rust(若你用 Rust)
    "crates.io"
    "static.crates.io"
    "index.crates.io"

    # Ubuntu / Debian apt
    "archive.ubuntu.com"
    "security.ubuntu.com"
    "deb.nodesource.com"
)

# 把每個域名解析成 IP 加進 ipset
ipset create allowed-domains hash:ip 2>/dev/null || ipset flush allowed-domains

for domain in "${ALLOWED_DOMAINS[@]}"; do
    ips=$(dig +short "$domain" | grep -E '^[0-9.]+$' || true)
    if [ -n "$ips" ]; then
        for ip in $ips; do
            ipset add allowed-domains "$ip" 2>/dev/null || true
        done
        echo "  + $domain ($ips)"
    else
        echo "  ! $domain (resolve failed, skipping)"
    fi
done

# 允許白名單 IP 的 HTTPS / HTTP
iptables -A OUTPUT -p tcp --dport 443 -m set --match-set allowed-domains dst -j ACCEPT
iptables -A OUTPUT -p tcp --dport 80 -m set --match-set allowed-domains dst -j ACCEPT

# 允許 docker daemon socket(本地)
iptables -A OUTPUT -p tcp --dport 2375 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 2376 -j ACCEPT

# 允許 host network(讓 docker compose 開出來的 service 可以互通)
# Docker bridge network 通常在 172.17.0.0/16 跟 172.18.0.0/16
iptables -A OUTPUT -d 172.16.0.0/12 -j ACCEPT
iptables -A INPUT -s 172.16.0.0/12 -j ACCEPT

echo "==> Firewall configured"
iptables -L OUTPUT -n -v | head -20

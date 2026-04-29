# syntax=docker/dockerfile:1.7

# ============================================================
# Dev Container base image
#
# 這個 image 只用來開發,不會 deploy 到 production。
# 應用程式本身的 image 在 repo 根目錄的 /Dockerfile。
#
# 用 Microsoft 官方 multi-arch base:
#   - Mac M1 自動拉 linux/arm64
#   - WSL Ubuntu (x86_64) 自動拉 linux/amd64
#   - 兩邊都有 vscode 使用者、sudo、locale 等 dev container
#     需要的基本設定
# ============================================================
FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

# ============================================================
# 系統套件
# ============================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    # 編譯工具(uv 偶爾需要 build wheel)
    build-essential \
    # 網路 / firewall 工具
    iptables \
    ipset \
    dnsutils \
    iputils-ping \
    # 一般用得到
    curl \
    wget \
    jq \
    less \
    vim \
    nano \
    tmux \
    htop \
    tree \
    ripgrep \
    fd-find \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# uv(Astral Python 套件管理器)— spec-kit 需要
# ============================================================
USER vscode
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
    && echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc \
    && echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc

# Note: pnpm via corepack is enabled by post-create.sh, NOT here.
# The Node devcontainer feature installs node/npm/corepack AFTER this image
# is built, so running `corepack enable` in a Dockerfile RUN fails with
# "command not found" (exit 127).

# ============================================================
# bash history 持久化 — 跟 devcontainer.json 的 volume mount 配合
# ============================================================
USER root
RUN mkdir -p /commandhistory \
    && touch /commandhistory/.bash_history /commandhistory/.zsh_history \
    && chown -R vscode:vscode /commandhistory \
    && echo 'export HISTFILE=/commandhistory/.zsh_history' >> /home/vscode/.zshrc \
    && echo 'export HISTFILE=/commandhistory/.bash_history' >> /home/vscode/.bashrc

# ============================================================
# 給 vscode 使用者全域 NOPASSWD sudo
#
# 原因:此 dev container template 在 post-create.sh / 平時操作會頻繁 sudo
# (init-firewall.sh restore、corepack enable 走 `sudo env PATH=`、
#  Mac credsStore workaround、之後可能加的 apt install 等)。
# 逐個檔案維護 per-binary NOPASSWD 條目成本高;dev container 是
# short-lived、單人用的開發環境,attack surface 本就小,
# 全 NOPASSWD 換維護便利是合理取捨。
# ============================================================
RUN echo 'vscode ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/vscode-nopasswd && chmod 0440 /etc/sudoers.d/vscode-nopasswd

USER vscode
WORKDIR /workspaces

CMD ["sleep", "infinity"]

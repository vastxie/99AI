# 99Agent 用户沙箱镜像
#
# 每个对话一个临时容器（生产用 gVisor runtime），/workspace 挂有硬上限的 tmpfs。
# 镜像只提供一台"干净的小机器"：shell、常用命令、Python / Node、文档与媒体工具、
# LaTeX（Tectonic）、OCR（tesseract）。业务能力由沙箱内的技能与 MCP 服务器提供。
#
# 构建：docker build -t 99agent/sandbox:latest sandbox/
# 宿主机准备见 sandbox/README.md

FROM debian:bookworm-slim

ARG TECTONIC_VERSION="0.16.9"
ARG TECTONIC_BASE_URL="https://github.com/tectonic-typesetting/tectonic/releases/download"

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    PIP_BREAK_SYSTEM_PACKAGES=1 \
    TECTONIC_CACHE_DIR=/usr/share/tectonic-cache

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash coreutils findutils procps ca-certificates curl wget git jq ripgrep \
        unzip zip xz-utils less file tree \
        python3 python3-pip python3-venv \
        nodejs npm \
        ffmpeg imagemagick poppler-utils pandoc \
        tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-eng \
        fonts-noto-cjk fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# 常用 Python 库：文档 / 表格 / 图片 / PDF / 数据
RUN pip3 install --no-cache-dir \
        python-docx openpyxl python-pptx pillow pypdf reportlab \
        requests beautifulsoup4 markdown pyyaml numpy pandas matplotlib

# Tectonic：自包含的 LaTeX 引擎，--untrusted 模式下禁 shell-escape
# 两种架构都用静态 musl 版：官方 gnu 版要求 glibc >= 2.38，bookworm 只有 2.36
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
        amd64) tectonic_arch="x86_64-unknown-linux-musl" ;; \
        arm64) tectonic_arch="aarch64-unknown-linux-musl" ;; \
        *) echo "unsupported arch: $arch" && exit 1 ;; \
    esac; \
    curl -fsSL "${TECTONIC_BASE_URL}/tectonic@${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-${tectonic_arch}.tar.gz" \
        -o /tmp/tectonic.tar.gz; \
    tar -xzf /tmp/tectonic.tar.gz -C /usr/local/bin tectonic; \
    chmod 0755 /usr/local/bin/tectonic; \
    rm -f /tmp/tectonic.tar.gz; \
    mkdir -p "$TECTONIC_CACHE_DIR" /tmp/tectonic-warmup; \
    printf '%s\n' '\documentclass{article}' '\usepackage{amsmath}' '\begin{document}' 'warmup $x^2$' '\end{document}' \
        > /tmp/tectonic-warmup/document.tex; \
    tectonic --untrusted --outdir /tmp/tectonic-warmup /tmp/tectonic-warmup/document.tex; \
    rm -rf /tmp/tectonic-warmup; \
    chmod -R a+rX "$TECTONIC_CACHE_DIR"

# 非 root 用户；HOME 指向工作区，pip --user / npm 用户级安装随卷临时化
RUN groupadd -g 1000 sandbox \
    && useradd -m -u 1000 -g 1000 -s /bin/bash sandbox \
    && mkdir -p /workspace \
    && chown sandbox:sandbox /workspace

ENV HOME=/workspace \
    PATH=/workspace/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    NPM_CONFIG_PREFIX=/workspace/.local

USER sandbox
WORKDIR /workspace

CMD ["sleep", "infinity"]

#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHAT_DIST="$ROOT_DIR/web/dist"
ADMIN_DIST="$ROOT_DIR/admin/dist"
CHAT_PUBLIC="$ROOT_DIR/server/public/chat"
ADMIN_PUBLIC="$ROOT_DIR/server/public/admin"

build_frontend() {
  local name="$1"
  local app_dir="$2"

  echo "开始构建${name}: $app_dir"
  (
    cd "$app_dir"
    # 之前用其它 pnpm 大版本装过依赖时，首次安装需要重建 node_modules；不交互确认，与 build.sh 一致
    pnpm install --config.confirmModulesPurge=false
    pnpm build
  )
}

sync_dist() {
  local name="$1"
  local dist_dir="$2"
  local public_dir="$3"

  rm -rf "$public_dir"
  mkdir -p "$public_dir"
  cp -a "$dist_dir"/. "$public_dir"/
  echo "${name} 已同步到: $public_dir"
}

build_frontend "用户端" "$ROOT_DIR/web"
build_frontend "管理端" "$ROOT_DIR/admin"

sync_dist "用户端" "$CHAT_DIST" "$CHAT_PUBLIC"
sync_dist "管理端" "$ADMIN_DIST" "$ADMIN_PUBLIC"

echo "前端构建与本地静态资源同步完成"

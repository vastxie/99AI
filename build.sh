#!/bin/bash
# 发版打包：构建三端，产出一个可直接部署到 Node.js 宿主机的目录与 ZIP。
#
# 用法：./build.sh            → 输出到 ./release-build/<version>-<time>/ 与同名 .zip
#       RELEASE_DIR=/path ./build.sh  → 自定义输出根目录
# 部署包内容：server/dist、public/{admin,chat}、data（运行期数据；本机的敏感词库默认不打包）、pm2.conf.json、
# package.json + pnpm-lock.yaml（部署机执行 pnpm install --prod）、.env.example。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_ROOT="${RELEASE_DIR:-$ROOT_DIR/release-build}"

pnpm_install() {
  pnpm install --frozen-lockfile --config.confirmModulesPurge=false
}

for app in admin web server; do
  echo "==> 构建 $app"
  (
    cd "$ROOT_DIR/$app"
    pnpm_install
    pnpm build
  )
done

RELEASE_VERSION=$(node -p "require('$ROOT_DIR/server/package.json').version || 'unknown'")
RELEASE_TIME=$(date +%Y%m%d%H%M%S)
RELEASE_NAME="99agent-$RELEASE_VERSION-$RELEASE_TIME"
RELEASE_STAGE="$RELEASE_ROOT/$RELEASE_NAME"
RELEASE_ZIP="$RELEASE_ROOT/$RELEASE_NAME.zip"

mkdir -p "$RELEASE_STAGE/dist" "$RELEASE_STAGE/public/admin" "$RELEASE_STAGE/public/chat"

cp "$ROOT_DIR/server/pm2.conf.json" "$RELEASE_STAGE/pm2.conf.json"
cp "$ROOT_DIR/server/package.json" "$RELEASE_STAGE/package.json"
cp "$ROOT_DIR/server/pnpm-lock.yaml" "$RELEASE_STAGE/pnpm-lock.yaml"
cp "$ROOT_DIR/server/pnpm-workspace.yaml" "$RELEASE_STAGE/pnpm-workspace.yaml"
cp "$ROOT_DIR/server/.env.example" "$RELEASE_STAGE/.env.example"
# 运行期数据不进 bundle，随发版目录一起分发，启动时从 server 工作目录读取
cp -a "$ROOT_DIR/server/data" "$RELEASE_STAGE/data"
rm -rf "$RELEASE_STAGE/data/sandboxes"
# 敏感词库由部署者自备（仓库不附带）：本机放着的词库默认不进发版包，避免随公开分发的压缩包流出；
# 给自己部署打包时用 INCLUDE_VOCABULARIES=1 ./build.sh 显式带上
if [ "${INCLUDE_VOCABULARIES:-0}" = "1" ]; then
  echo "==> 发版包包含本机敏感词库：$(find "$RELEASE_STAGE/data/vocabularies" -name '*.txt' | wc -l | tr -d ' ') 个"
else
  find "$RELEASE_STAGE/data/vocabularies" -name '*.txt' -delete 2>/dev/null || true
fi
cp -a "$ROOT_DIR/server/dist/." "$RELEASE_STAGE/dist/"
rm -f "$RELEASE_STAGE/dist/.build-metadata.json"
cp -a "$ROOT_DIR/admin/dist/." "$RELEASE_STAGE/public/admin/"
cp -a "$ROOT_DIR/web/dist/." "$RELEASE_STAGE/public/chat/"

if command -v zip >/dev/null 2>&1; then
  (
    cd "$RELEASE_STAGE"
    zip -qry "$RELEASE_ZIP" .
  )
  echo "发版 ZIP: $RELEASE_ZIP"
else
  echo "未找到 zip 命令，跳过压缩"
fi

echo "发版目录: $RELEASE_STAGE"

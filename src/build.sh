#!/bin/bash

set -e

# 1. 构建所有项目
echo "开始构建项目..."
pnpm install

# 构建管理端
cd admin/
pnpm build
cd ..

# 构建前端
cd chat/
pnpm build
cd ..

# 构建服务端
cd service/
pnpm build
cd ..

# 2. 清理并创建目标目录
echo "准备目标目录..."
rm -rf ../AIWebQuickDeploy/dist/* ../AIWebQuickDeploy/public/admin/* ../AIWebQuickDeploy/public/chat/*
mkdir -p ../AIWebQuickDeploy/dist ../AIWebQuickDeploy/public/admin ../AIWebQuickDeploy/public/chat

# 3. 复制服务端配置文件
echo "复制服务端配置..."
cp service/pm2.conf.json ../AIWebQuickDeploy/pm2.conf.json
cp service/package.json ../AIWebQuickDeploy/package.json

# 4. 复制配置文件
echo "复制配置文件..."
cp service/.env.example ../AIWebQuickDeploy/.env.example
cp service/.env.docker ../AIWebQuickDeploy/.env.docker
cp service/.dockerignore ../AIWebQuickDeploy/.dockerignore
cp service/Dockerfile ../AIWebQuickDeploy/Dockerfile
cp service/docker-compose.yml ../AIWebQuickDeploy/docker-compose.yml

# 5. 复制构建产物
echo "复制构建文件..."
cp -r service/dist/* ../AIWebQuickDeploy/dist
cp -r admin/dist/* ../AIWebQuickDeploy/public/admin
cp -r chat/dist/* ../AIWebQuickDeploy/public/chat

echo "打包完成"

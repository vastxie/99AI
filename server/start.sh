#!/bin/bash
# 99Agent 前台启动脚本：在 server/ 下直接运行构建产物；用 PM2 托管请执行 pnpm start（见 pm2.conf.json）
node ./dist/main.js

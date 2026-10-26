# 部署常见问题

## 修改 `.env` 后为什么没有生效？

`.env` 只在服务启动时读取。修改数据库、Redis、后台路径、沙箱或扩展包开关后，需要 `pm2 restart 99Agent`。

## 首次启动没有建表？

先确定扩展包开关，再在 `server/` 对全新空库运行 `node dist/main db:init`，并用 `node dist/main db:check` 核对。正常启动始终关闭自动改表；旧库、部分初始化或当前模块/结构不一致时会拒绝，不会自动修补或清空数据库。

## 创建沙箱容器报错，提示找不到 runsc？

宿主机没有安装 gVisor 或没有注册为 Docker runtime，按 `sandbox/README.md` 安装后重试。生产环境不会静默退回 runc；本机 macOS 开发没有 gVisor，把 `SANDBOX_DOCKER_RUNTIME` 留空即可。

## 升级后启动报错，提示需要设置 SANDBOX_USER_DISK_ROOT？

登录用户的沙箱现在默认使用每人一块的持久磁盘，生产环境必须先安装宿主磁盘助手并在 `.env` 设置 `SANDBOX_USER_DISK_ROOT`，步骤见 `sandbox/README.md`「用户磁盘」。暂时不能安装时，显式设 `SANDBOX_USER_STORAGE=tmpfs`，登录用户仍一人一台，但工作区是临时的。

## 沙箱提示「宿主存储空间不足」或「磁盘仍被占用」？

前者是宿主磁盘剩余低于 `SANDBOX_USER_DISK_HOST_MIN_FREE_MB`，所有用户磁盘暂停写入与执行，清理宿主空间后自动恢复。后者是用户磁盘镜像还关联着 loop 设备，处理方法见 `sandbox/README.md`「故障排查」。

## 管理端打不开或白屏？

确认 `./dev-build.sh` 已把产物同步到 `server/public/admin`，并且 `admin/.env.production` 里的 `VITE_BASE_PATH` 与 `.env` 里的 `ADMIN_SERVE_ROOT` 一致。

## 用户端提示跨域或 WebSocket 连不上？

后台「基础信息」的网站地址（或环境变量 `SITE_URL`）必须是用户实际访问的正式地址（带协议），生产环境只放行这一个来源，不再有多域名白名单；反向代理需要转发 Upgrade 头。

## 微信或支付回调收不到？

依次检查：网站地址是正式域名而不是内网地址、HTTPS 证书有效、反向代理把 `/api` 转发到了后端、第三方平台后台填写的回调地址与后台自动生成的一致。

## 关掉了某个扩展包，后台菜单还在？

前端页面由构建期变量控制，改完 `web/.env.production` 或 `admin/.env.production` 后需要重新执行 `./dev-build.sh`。对应关系见 [扩展包开关与裁剪](/deployment/packs)。

## 需要联网搜索或其他外部工具？

接一个 MCP 服务器，见 [外部接入](/deployment/integrations)。模型管理里的「原生搜索」只对 OpenAI Responses 模型有效。

## 为什么主应用不提供 Docker 部署？

当前设计只支持 Node.js 宿主机部署，便于长期升级与排查。沙箱容器是模型工具的执行边界，与主应用的部署方式无关。

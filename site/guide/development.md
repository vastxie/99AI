# 二次开发

本页汇总本地开发、验证命令与扩展点；下表列出仓库里能找到的入口。

## 文档索引

| 想了解 | 看哪里 |
| --- | --- |
| 环境、分层、代码约定、提交与验证规范 | 仓库根目录的 `CONTRIBUTING.md` |
| 扩展包的开关与裁剪 | [扩展包开关与裁剪](/deployment/packs) |
| 一个扩展包的全部代码 | 三端的 `src/packs/<包名>/`，后端包目录里的 `pack.json` 描述分级、开关、贡献与只归该包使用的依赖 |
| 扩展包评分规则 | `scripts/pack-scorecard.mjs` 文件头 |
| Agent 事件协议与共享类型 | `packages/contracts/src/` |
| 垂直业务清单格式 | `packages/contracts/src/vertical-manifest.ts`，示例 `packages/contracts/fixtures/vertical-manifest.example.json` |
| 沙箱镜像与宿主机要求 | `sandbox/README.md` |
| 更新日志 | [更新日志](/changelog) |

## 本地开发

三端各自安装依赖、各自启动，仓库根目录没有依赖。第一次先准备后端配置与数据库（在仓库根目录执行）：

```bash
(cd server && pnpm install && cp .env.example .env)
# 按下文把 server/.env 改成开发配置并指向一个全新的空库，然后初始化
(cd server && pnpm build && node dist/main db:init)
```

之后开三个终端，**各自从仓库根目录**启动：

```bash
(cd server && pnpm dev)                      # 终端 1：后端，9520
(cd web && pnpm install && pnpm dev)         # 终端 2：用户端，9002
(cd admin && pnpm install && pnpm dev)       # 终端 3：管理端，9000
```

`.env.example` 的默认值是生产配置（`NODE_ENV=production`、`ISDEV=false`）：会强制 gVisor（runsc）、拒绝 local 沙箱驱动，也不放行用户端开发服务器（9002）对后端的 localhost 跨域请求。本地开发先在 `server/.env` 里改成 `NODE_ENV=development`、`ISDEV=true`，再按需调整沙箱：本机没有 gVisor 时把 `SANDBOX_DOCKER_RUNTIME` 留空走 runc；没有构建出网代理镜像时设 `SANDBOX_NETWORK_MODE=none`；不想起 Docker 时用 `SANDBOX_DRIVER=local`（无隔离，仅开发）。

## 验证命令

以下命令都在仓库根目录执行，括号里的命令进入对应目录运行（子 shell，执行完仍在仓库根目录）：

```bash
# server
(cd server && pnpm build && pnpm check:boundaries)      # 构建 + 内核 / 扩展包边界
(cd server && node scripts/run-jest.js --runInBand)      # 单元测试（大仓建议按目录分批）

# web
(cd web && pnpm type-check && pnpm test && pnpm build-check)

# admin
(cd admin && pnpm lint && pnpm exec vite build && pnpm check:design)

# packages
(cd packages/contracts && pnpm check)
(cd packages/runtime-core && pnpm check)

# 仓库根（脚本只用 Node 内置模块；评分卡另用 server 依赖里的 TypeScript，先装好 server 依赖）
node scripts/pack-scorecard.mjs --min-grade A   # 扩展包评分，CI 同款
node scripts/check-pack-removal.mjs --all       # 逐包删除验证，慢；发布前或改内核边界后跑
```

格式化在各端子目录运行 `pnpm format`，仓库没有 git hook。

## 扩展点一览

- **新的登录渠道、模型协议、存储厂商、计费实现、内容过滤、渠道绑定**：写一个包，向内核注册表或端口登记，不改内核。
- **第三方工具**：配置 MCP 服务器即可，见 [外部接入](/deployment/integrations)。
- **沙箱内能力**：站点技能目录里的 `SKILL.md` 与沙箱镜像内的软件。
- **进程外渠道服务**：渠道网关的两个接口。
- **垂直业务**：一份清单文件导入站点配置、MCP 服务器、技能与套餐预设。

# 99Agent

> 0.1.0 测试版 · 可私有化部署的多用户 Agent 基座 · [Apache-2.0](LICENSE)

99Agent 是一个可私有化部署、可运营的多用户 Agent 基座。内核只做几件事：用户注册登录与基础管理、模型网关、Agent 循环，以及登录用户各自的持久沙箱与访客的临时隔离沙箱；积分、套餐与支付由可裁剪的商业扩展包提供。模型拿到的能力工具只有 `read / write / edit / bash / ls` 五个原语，通过受控代理访问公开 HTTP/HTTPS（可配置无网），另有选择成果文件、向用户提问两个会话控制工具；其余能力通过沙箱内的技能（skills）和 MCP 服务器扩展。

用户输入文字和多媒体，输出文字和多媒体，过程实时可见。没有工作台、没有内置应用市场、没有第二套运行时。

> [!NOTE]
> 99Agent 是 99AI 的新一代重写版本，数据库、配置与部署方式都与旧版 99AI 不兼容，不能在旧版上直接升级。当前是测试版，1.0 之前接口、配置项与数据库结构都可能调整；用于生产前请先在独立环境验证。

代码与后续维护统一在 [vastxie/99AI](https://github.com/vastxie/99AI)。本仓库已切换到新一代代码并重新建立提交历史，使用旧版 99AI 的开发者请重新克隆，保留原有部署与数据备份，按下方步骤全新部署；旧 Tag 与 Release 仅供历史版本查阅。

## 特性

- **Agent 对话**：多用户注册登录与会话管理，回复流式输出，工具调用过程实时可见；明暗主题与个人强调色，简体中文与 English。
- **模型网关**：内置 OpenAI Chat Completions 兼容接口；OpenAI Responses、Anthropic、Gemini、OpenCode Go 由各自的模型协议包接入。
- **隔离沙箱**：登录用户每人一台沙箱电脑，多个对话共用，工作区是带硬容量上限的持久磁盘；访客每个对话一个临时容器。生产环境使用 gVisor；CPU、内存、进程数、超时、输出与存储都有上限，产物自动回收为消息里的文件。
- **能力扩展**：在沙箱镜像里加软件、在 `skills/` 里加技能、在后台接入 MCP 服务器，或导入垂直业务清单。
- **可裁剪**：商业（积分、套餐、订单与支付）、内容安全、微信、邮箱 / 手机 / GitHub 登录、对象存储、富媒体渲染都是扩展包；删掉任意一个包，内核照常构建和运行（带数据表的包——商业、内容安全、微信——需要在初始化数据库之前决定）。

## 快速开始

需要 Node.js 24 LTS（最低 22.15）与 pnpm 11（`corepack enable` 后自动使用仓库固定的版本）、MySQL 8（utf8mb4）、Redis、PM2，以及用于用户沙箱的 Docker（生产环境另需 gVisor）。

```bash
git clone https://github.com/vastxie/99AI.git
cd 99AI

# 构建用户端与管理端，产物同步到 server/public
./dev-build.sh

# 构建沙箱镜像与出网代理镜像
docker build -t 99agent/sandbox:latest sandbox/
docker build -t 99agent/sandbox-egress:latest sandbox/egress/

# 配置并构建后端：编辑 .env，填好 MySQL、Redis 等连接
cd server
pnpm install
cp .env.example .env
pnpm build

# 初始化全新空库并启动
node dist/main db:init
pnpm start
```

`server/.env.example` 的默认值就是生产配置：沙箱用 gVisor（`runsc`）隔离，并经出网代理访问公开网络，登录用户的工作区是每人一块的持久磁盘。宿主机需要 Linux、Docker Engine 28+、gVisor 与用户磁盘助手，安装、硬限额与磁盘验收见 [sandbox/README.md](./sandbox/README.md)；每个联网沙箱另预留 128 MiB 代理内存。只想在本机试用时，在 `.env` 里改成 `NODE_ENV=development`、`ISDEV=true`，把 `SANDBOX_DOCKER_RUNTIME` 留空（用 runc）、设 `SANDBOX_NETWORK_MODE=none`（无网）和 `SANDBOX_USER_STORAGE=tmpfs`（临时工作区，不需要磁盘助手）；这样的沙箱没有 gVisor 隔离，不能用于生产。

启动后访问 `http://localhost:9520`（用户端）与 `http://localhost:9520/admin`（管理端）。首次启动会创建超级管理员 `super`，密码取 `.env` 里的 `ADMIN_INITIAL_PASSWORD`，未配置时随机生成并写入 `server/storage/initial-admin-password.txt`，登录后请立即修改。生产部署、反向代理、环境变量与扩展包开关见 [安装部署](./site/deployment/index.md)。

## 项目结构

```tree
99AI/
├── server/             # NestJS 后端：认证、用户、计费、模型网关、Agent 循环、沙箱、MCP
├── web/                # Vue 3 用户端：输入 / 输出 / 过程展示
├── admin/              # Vue 3 管理后台：模型、用户、套餐、全局配置
├── packages/
│   ├── contracts/      # Agent Event Wire 合同（前后端共享）
│   └── runtime-core/   # 零依赖的 Agent 循环内核
├── sandbox/            # 用户沙箱镜像（Docker + gVisor）
└── site/               # 产品文档站
```

## 运行模型

- **宿主机（server）**：鉴权、计费、模型调用、事件投影和会话持久化都在宿主机完成，不进入沙箱。
- **沙箱（登录用户每人一台，访客每对话一台）**：登录用户的 `/workspace` 是他独立的持久磁盘，多个对话共用、可同时执行，闲置只回收容器，文件与装过的依赖都保留；访客的 `/workspace` 是有界 tmpfs。`in/` 放本轮附件，`out/` 的新文件自动回收为消息里的文件产物（另存为文件资产），`skills/<name>/SKILL.md` 自动进入系统提示。生产环境使用 gVisor（`runsc`）运行时，CPU / 内存 / 进程数 / 超时 / 输出大小及存储都有上限。
- **扩展**：在沙箱镜像里加软件、在 `skills/` 里加技能、通过后台「AI 能力 → MCP 服务」或 `MCP_SERVERS_JSON` 接入外部工具；商业包（`COMMERCE_PACK_ENABLED`）负责积分、套餐、订单、支付与运营统计；内容安全包（`CONTENT_SAFETY_PACK_ENABLED`）提供内容审核；邮箱、手机、GitHub、微信分别由 `EMAIL_PACK_ENABLED` / `PHONE_PACK_ENABLED` / `GITHUB_PACK_ENABLED` / `WECHAT_PACK_ENABLED` 控制，其中微信包也提供公众号和 Bot 通道，关闭时内核经端口退化运行；OpenAI Responses、Anthropic、Gemini 与 OpenCode Go 由各自模型协议包接入；用户端富媒体渲染包由 `VITE_RICH_MEDIA_ENABLED` 在构建期裁剪。

沙箱镜像、gVisor 与用户磁盘助手的安装、硬限额和备份恢复见 [sandbox/README.md](./sandbox/README.md)；每个联网沙箱另预留 128 MiB 代理内存。

## 部署说明

主应用按 Node.js 宿主机部署，需要 MySQL、Redis、PM2 与 `.env`。用户沙箱是唯一需要 Docker 的组件：宿主机安装 Docker 与 gVisor 后，用 `sandbox/Dockerfile` 构建镜像，并通过 `SANDBOX_*` 环境变量配置资源上限。

沙箱只接受当前工作区版本与安全策略，复用时核对实际镜像 ID、运行时、网络、资源与挂载。服务重启后发现本站当前容器并纳入闲置管理；默认最多 4 个活跃沙箱，同时受总内存预算限制（每个 2 GiB、总共 4 GiB，默认同时 2 个），工作区软上限 1 GB / 10 万 inode，存储低水位或观测失败会拒绝写入。软检查不能约束单次命令的最大磁盘占用，生产硬配额须由宿主文件系统提供。

首次部署先确定扩展包开关，构建 server 后对全新空库执行 `node dist/main db:init`，再用 `node dist/main db:check` 核对。正常启动固定关闭自动改表，只接受当前实体与结构基线，不提供旧库兼容初始化。

## 文档

- 产品文档站（`site/`）：[功能介绍](./site/guide/index.md)、[安装部署](./site/deployment/index.md)、[后台配置](./site/configuration/index.md)、[更新日志](./site/changelog.md)
- 二次开发：[本地开发、验证命令与扩展点](./site/guide/development.md)
- 离线质量检查：在 `server/` 执行 `pnpm test:tasks`，验证表格、图像、Word 产物，以及 MCP 文本、媒体与错误退化；样例只使用合成数据和临时工作区，详细范围见 [任务样例说明](./server/task-fixtures/README.md)。

## 参与贡献

- 贡献流程、分层约定与提交前验证见 [CONTRIBUTING.md](./CONTRIBUTING.md)，参与讨论请遵守 [行为准则](./CODE_OF_CONDUCT.md)。
- 开发、问题与 PR 统一在本仓库进行；AI 编码工具遵守 [AGENTS.md](./AGENTS.md)。
- 问题与建议请提 [issue](https://github.com/vastxie/99AI/issues)；安全问题请按 [SECURITY.md](./SECURITY.md) 私密报告，不要发公开 issue。
- 发版打包用 `./build.sh`，产物在 `./release-build/`。

## 许可证

源码使用许可以根目录 [LICENSE](LICENSE)（Apache-2.0）为准。商业发行、部署维护和定制开发属于仓库外服务。

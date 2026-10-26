# 参与贡献

本页是参与贡献的最短路径：环境、分层、代码约定与提交前验证。本地开发、验证命令与扩展点的细节见 [二次开发](site/guide/development.md)。

## 仓库与版本

本项目仅维护 [vastxie/99AI](https://github.com/vastxie/99AI)，开发分支、issue、PR 与发布均在此进行。AI 编码工具同时遵守 [AGENTS.md](AGENTS.md)。

当前 0.1.0 是 99Agent 的首个公开测试版，与旧版 99AI 的数据库、配置与部署方式不兼容。仓库已用当前代码重新建立 Git 历史；旧版克隆请保留本地改动与数据备份后重新克隆，不把旧版历史合并到当前开发分支。旧 Tag 与 Release 保留供历史查阅，后续只维护当前 `main`。

## 环境

- Node.js ≥ 22.15（NestJS 12 构建所需，pnpm 11 本身要求 ≥ 22.13；推荐 24，见 `.nvmrc`；运行 server 测试需要 ≥ 24.9）、pnpm 11（各 `package.json` 的 `packageManager` 固定为同一版本，`corepack enable` 后自动使用）、MySQL 8（utf8mb4）、Redis；用户沙箱需要 Docker（生产另需 gVisor）。
- 依赖只在各端目录安装：`server/`、`web/`、`admin/`、`site/` 各自 `pnpm install`；仓库根没有依赖。web / admin 里带 `package.json` 的扩展包是 workspace 子包，同一次 `pnpm install` 会一并装好。
- 后端配置复制 `server/.env.example` 为 `server/.env`；全新空库先 `node dist/main db:init`。

## 分层

- 内核：`server/src/{modules,common}`、`web/src`（除 `packs/`）、`admin/src`（除 `packs/`）。
- 扩展包：三端的 `packs/<id>/`，只经端口 / 注册表 / 挂载点接入，包之间互不引用。
- 硬规则只有一条：删掉任意一个包的三端目录，内核必须原样通过类型检查、测试与构建。
- 内核不得引用扩展包；扩展包只经 `@/` 别名使用内核公开面，只有 `server/src/app.module.ts` 按开关装配包。新增平台能力先在内核声明端口与退化实现，再在包内注册实现。`pnpm check:boundaries` 与 CI 同款。
- 内核预算（`scripts/kernel-budget.json`：内核行数、表数、运行时依赖数）只能持平或下降；确需扩容时用 `node scripts/check-kernel-budget.mjs --write` 重设，并在 PR 里说明原因。

## 代码约定

- 以全新安装为基线：只维护当前的字段、消息合同、配置键和入口，不新增历史格式转换或旧库 / 旧容器迁移适配。
- 后端日志只用静态 `Logger.log / debug / warn / error('消息', 'ServiceName')`，错误写成 `Logger.error('描述', error?.stack, 'ServiceName')`；不用 `console.*`，不把密钥、token、用户数据写进日志。
- API 响应统一 `{ code, data, success, message }`；请求体用 class-validator 的 DTO 承接，不用 `any`。
- 数据库：正常启动不自动改表，全新空库由 `node dist/main db:init` 初始化。TypeORM 的 find / findOne / count 等查询条件与 update / delete 的普通对象条件里出现 `null` / `undefined` 会直接报错：可选筛选条件有值时才加入，匹配 NULL 用 `IsNull()`；`where: []` 不生成任何条件，调用前先判空；QueryBuilder 的 `where` / `andWhere` / `orWhere` 不做这项检查，拼接前自行判空。
- 沙箱：用户可控的路径必须经 `resolveWorkspacePath` 校验，命令只能经 `SandboxService.exec` 执行，产物只经 `PrimitiveToolProvider.captureArtifacts` 回收；不要在宿主机直接执行用户命令或读写用户文件。
- 用户端样式 Tailwind 优先，可复用的样式沉淀到 `web/tailwind.config.js` 或 `web/src/styles/components.css`，规则见 [web/DESIGN.md](web/DESIGN.md)；管理端改动后运行 `pnpm check:design`。
- 公开的 Agent 事件协议变更先改 `packages/contracts`；不为「看起来更架构化」新增公共抽象。
- 主应用按 Node.js 宿主机部署，不为它新增 Docker 部署步骤；Docker + gVisor 只用于用户沙箱。

## 提交前验证

各端命令在对应目录下执行（例如 server 一行在 `server/` 下运行），根目录一行在仓库根执行。

| 端       | 命令                                                                                                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| server   | `npx tsc -p tsconfig.json --noEmit`（含测试文件）、`pnpm test -- --runInBand`、`pnpm check:boundaries`                                                                                       |
| web      | `pnpm type-check`、`pnpm test`、`pnpm build-check`                                                                                                                                           |
| admin    | `pnpm test`、`pnpm check:design`、`pnpm lint`、`pnpm exec vite build`                                                                                                                        |
| packages | `packages/contracts` 与 `packages/runtime-core` 各自 `pnpm check`                                                                                                                            |
| 根目录   | `node scripts/pack-scorecard.mjs --min-grade A`、`node scripts/check-kernel-budget.mjs`、`node scripts/check-kernel-edges.mjs`；改内核边界后再跑 `node scripts/check-pack-removal.mjs --all` |

CI 有九个 workflow（server / web / admin / site / packs / sandbox / smoke / browser / source-secrets），除 smoke 与 browser 外本地命令与之一一对应。smoke 会真实启动服务：连上 MySQL 与 Redis 后先 `node dist/main db:init`，再启动 `node scripts/smoke/mock-openai.mjs`（模拟模型）和 `node dist/main`，最后运行 `node scripts/smoke/run-smoke.mjs`；环境变量以 `.github/workflows/smoke.yml` 为准，请使用一次性的测试库。

browser 用无头浏览器走一遍主流程（登录、对话与工具、文件下载、切换会话、停止、断线重连、后台改配置、后台新增 / 修改 / 删除模型、手机宽度下的表格），用例在 `web/e2e/`。它对着一套已经启动的环境跑，自己不启动服务：

1. 构建三端，并把 `web/dist`、`admin/dist` 分别放到 `server/public/chat`、`server/public/admin`（`./dev-build.sh` 会做这一步）。
2. 用一次性的测试库 `node dist/main db:init`，再启动模拟模型和 server。环境变量以 `.github/workflows/browser.yml` 为准；其中 `SANDBOX_MAX_ACTIVE` 要调大，每条用例一个新用户、每个用户一台沙箱。
3. 在 `web/` 下设置 `E2E_BASE_URL`、`E2E_MOCK_URL`、`ADMIN_INITIAL_PASSWORD` 后运行 `pnpm e2e`。浏览器默认用 `pnpm exec playwright install chromium` 装的 Chromium；也可以用 `E2E_BROWSER_CHANNEL=chrome` 指定系统里的 Chrome，或用 `E2E_CHROMIUM_PATH` 指定可执行文件。

用例按界面上的文字与可访问名称定位元素：改动界面文案时，同步改 `web/e2e/` 里对应的用例。密码注册按来源地址限流（每小时 20 次），同一套环境反复运行时会碰到，重启环境或清掉对应的计数即可。

## 提交与 PR

- 分支名 `<your-name>/<short-task-name>`；一项完整任务一个 PR；支付、权限、文件访问、Agent 协议、安全边界、构建脚本等高风险改动单独成 PR。
- 提交信息 `type(scope): English summary`，正文用中文列出主要变更、影响范围和验证结果。
- 用户可感知的变更同步 `site/changelog.md`；后台配置页变化同步 `site/configuration/`；启动 / 部署变化同步 `README.md` 与 `site/deployment/`。
- 提交前在对应子目录运行 `pnpm format`；代码、日志、测试 fixture 里不得出现密钥、token、密码或真实用户数据。
- 发布前从本仓库的最终候选提交完成验证，整理 `site/changelog.md` 的未发布条目与实际发布日期；构建打包使用 `./build.sh`。不将本地 `.env`、用户文件、构建产物或运维记录加入提交。

## 安全问题与行为准则

请勿在公开 issue 中披露漏洞细节，按 [SECURITY.md](SECURITY.md) 用 GitHub 私密漏洞报告提交。参与讨论与协作请遵守[行为准则](CODE_OF_CONDUCT.md)。

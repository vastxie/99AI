# AGENTS.md

本文件适用于本仓库内的 AI 编码工具。项目仅维护公开仓库 [vastxie/99AI](https://github.com/vastxie/99AI)，开发、问题跟踪与 PR 均在同一仓库进行。环境与贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)，架构与扩展方式见 [二次开发](site/guide/development.md)。

## 项目与边界

- `server/`：NestJS + TypeORM + Socket.IO 后端，默认端口 9520，依赖 MySQL 与 Redis。
- `web/`：Vue 3 用户端，开发端口 9002；`admin/`：Vue 3 管理后台，开发端口 9000。
- `packages/contracts` 是公开 Agent 事件合同的唯一来源；`packages/runtime-core` 是零生产依赖的运行内核。
- `sandbox/` 提供用户沙箱镜像、出网代理与磁盘助手。主应用在 Node.js 宿主机部署，Docker + gVisor 仅用于用户沙箱。
- 登录用户每人一台持久沙箱，多个对话共用；访客每对话一台临时沙箱。命令与用户文件只在沙箱中处理。

## 工作方式

- 总结使用中文，写明做了什么、关键文件、验证结果，以及未完成或需人工确认事项。
- 修改前明确目标、允许范围与验证；不修改或暂存其他任务的在途文件。
- 支付、权限、数据库、文件/URL、Agent/沙箱、公开合同、模块边界与构建部署属于高风险范围：先核对调用方、现有合同、默认值与回滚方法，完成后由未参与实现的独立上下文只读审查。
- 不恢复已移除功能，不为当前任务增加历史格式转换、旧库初始化或旧容器适配。
- 不为简单改动新增公共抽象或仅重复实现的测试。

## 启动与 Git

- 未经用户明确要求，不运行 `pnpm dev`、`pnpm start`、`pnpm all` 或其他开发服务器命令；验证只运行构建、类型检查与测试。
- 验证阶段不自行运行 `docker build` 或 `docker run`；真实 Docker/gVisor 行为需在具备环境的宿主机另行验收。
- 用户明确授权后才提交、推送、合并或部署；不因检查通过自动执行这些操作。不默认强推或重写历史。
- 日常开发使用任务分支与 PR，一项完整任务一个 PR；高风险变更与纯 UI、纯文档分开审查。
- 提交信息使用 `type(scope): English summary`，正文以 `中文说明：` 记录主要变更、影响范围与验证。
- 发布直接从本仓库经过验证的提交构建，不依赖其他仓库的工作目录或开发历史。

## 安全与实现

- 代码、日志、报告、测试数据和回复不得包含真实密钥、密码、令牌或用户隐私；`.env`、用户文件与运行数据不入库，只提交配置模板与合成样例。
- API 响应使用 `{ code, data, success, message }`；请求体使用 class-validator DTO，不用 `any` 承接关键输入。
- 后端日志使用静态 `Logger.log/debug/warn/error`；错误使用 `Logger.error('描述', error?.stack, 'ServiceName')`，不使用 `this.logger` 或 `console.*`，不记录敏感数据。
- 正常启动固定 `synchronize: false`；全新空库显式运行 `node dist/main db:init`，已有库只做 `db:check`，不通过环境变量自动改表。
- TypeORM 普通对象查询与写入条件中的 `null`/`undefined` 必须报错：有值才拼可选条件，匹配 NULL 使用 `IsNull()`，空 OR 数组先判空；QueryBuilder 条件自行校验。
- 权限来自认证上下文；资金处理必须校验金额、订单归属与回调签名，并在事务中保证幂等。不得以未配置密钥为由放行。
- 用户可控路径经 `resolveWorkspacePath` 校验；执行只经 `SandboxService.exec`；产物只经 `PrimitiveToolProvider.captureArtifacts` 回收，不在宿主机直接执行用户命令或读写用户文件。
- 用户 URL 校验协议并防 SSRF；前端 HTML 渲染必须经过可信来源判断或消毒；iframe 按需要限制 sandbox 权限。
- 能力工具只经沙箱原语与 MCP 注册；会话控制工具仅控制呈现与交互。事件合同变更先修改 `packages/contracts`，再验证消费者。
- 内核不能引用扩展包，扩展包之间不能互引，只经 `@/` 使用内核公开面；仅 `server/src/app.module.ts` 按开关装配后端包。遵守端口、注册表与内核预算门禁。

## 格式、文档与验证

- Node.js 最低 22.15，推荐 24 LTS；server 测试需要 24.9 以上。统一使用各 `package.json` 固定的 pnpm 11 版本，根目录不安装依赖。
- 依赖在各端及 workspace 中安装；已有可用依赖不重复安装。格式以各端 Prettier 配置为准，只格式化本任务改动文件。
- web 样式优先 Tailwind；web/admin 的 Vue 或样式修改后运行各自 `pnpm check:design`。
- 用户可感知变更同步 `site/changelog.md`，未发布内容放在最上方的 `## 未发布`，发布时记录版本与实际日期。版本以 `server/package.json` 为准，同步 web/admin 与 MCP 客户端声明。
- 安装、部署或能力变化同步 `README.md` 与 `site/`；后台配置页变化同步配置概述与具体文档。只写可公开的资料，不提交个人路径、生产运维记录或凭据。
- 纯文档改动可运行 `git diff --check` 与文档链接检查；代码改动按组件执行 [贡献指南中的验证命令](CONTRIBUTING.md#提交前验证)，如实区分代码失败与环境失败。
- server 涉及支付、权限、Agent、文件/URL、日志或 CI 测试治理时，运行完整 `pnpm test:cov -- --runInBand` 与 `pnpm build`；保留测试日志并运行输出敏感信息扫描。
- 沙箱驱动、策略或原语改动必须补跑 sandbox 与 agent/primitives 的 Jest；模拟 Docker 测试不能替代真实容器验收。
- 公开前运行全树密钥扫描 `node scripts/ai-guard/check-secrets.js --all`，以及合同、工具链、文档链接和相关 CI；不把尚未完成的真实支付、第三方登录或真机验收表述为已通过。

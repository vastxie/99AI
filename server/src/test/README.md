# Server 测试说明

本目录只放后端测试会复用的最小 helper。新增 helper 前先确认至少有一个 spec 会使用，避免把测试目录做成第二套业务框架。

## 测试分层

- 纯函数投影测试：优先覆盖前端安全投影、URL 清洗、artifact / preview 字段归一化等无副作用逻辑。
- Service 单元测试：使用 mock repository / provider / service，验证支付、权限、消息生命周期等核心分支。
- Controller 轻量出口测试：直接实例化 controller 和 mock service，确认对外响应前仍经过 sanitizer、权限参数和幂等入口。
- Gateway 轻量事件测试：使用 mock socket / emitter，验证事件出口和权限边界，不启动真实 Socket.IO 服务。

## Mock 和 Factory 约定

- `mocks/` 放基础 mock，例如 repository、payment provider、socket。
- `factories/` 放测试数据构造，例如订单、聊天记录、工具调用 payload。
- mock 只覆盖当前测试需要的方法；不要提前补齐完整 TypeORM、Redis、支付或 Socket.IO API。
- fixture 中可以使用 `SECRET_TOKEN`、`RAW_SECRET` 这类哨兵值，但测试必须证明它们不会进入前端出口或日志输出。

## 安全边界

涉及以下领域时，测试应优先覆盖失败路径和泄露边界：

- 支付：重复回调、金额不匹配、交易号不匹配、未知订单、未知 provider、解析失败都不能发货。
- 权限：用户不能读取、停止、订阅或恢复不属于自己的任务 / 消息 / 对话。
- Agent 事件：前端事件不能包含 raw arguments、stdout、stderr、stack、provider response。
- 文件和 URL：站内 `/file/...` 可保留；外部带 `token`、`api_key`、`signature`、`credential` 的 URL 不能作为可点击产物下发。
- 日志：不得输出 token、原始工具参数、raw output、stdout、provider response 或用户上传内容。

## 禁止项

- 不连接真实 MySQL、Redis 或支付渠道。
- 不依赖真实 `.env`、外部网络、支付沙箱或本地上传目录状态。
- 不启动开发服务器。
- 不为了单元测试引入完整 e2e 或真实 Nest HTTP adapter。
- 不设置全局高覆盖率门禁；P0 文件只使用保守 coverage floor 防止明显回退。

## 运行命令

在 `server` 目录运行：

```bash
pnpm test -- --runInBand
pnpm test:cov -- --runInBand
pnpm build
```

执行开发任务后的最终本地验证仍按项目规约运行：

```bash
pnpm build
```

## P0 覆盖率下限

当前 coverage 只收集 4 个 P0 文件，并为它们设置保守下限。这些阈值用于防止关键安全投影和 Agent 状态出口测试明显回退，不代表全 server 覆盖率，也不是追求高覆盖率的目标。

| 文件 | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| `modules/chatLog/tool-result-payload/` | 75% | 60% | 80% | 75% |
| `modules/chatLog/chat-log-frontend.ts` | 80% | 90% | 60% | 80% |
| `modules/chat/workflowManager.service.ts` | 45% | 45% | 40% | 45% |
| `modules/chat/chat.gateway.ts` | 60% | 45% | 65% | 60% |

如果 coverage 失败，先判断是否真的删除了 P0 安全测试或绕过了关键投影路径。不要为了让数字变好补无意义断言，也不要把阈值扩大到普通 CRUD。

## CI 覆盖率路径

后端测试 CI 使用：

```bash
pnpm test:cov -- --runInBand
pnpm build
```

`test:cov` 会执行 Jest 测试并触发 P0 coverage floor，因此 CI 不需要再跑一遍 `pnpm test`。本地执行任务时仍应分别跑 `test` 和 `test:cov`，便于区分普通测试失败和 coverage 门禁失败。

## 测试输出扫描

`server/scripts/check-test-output-secrets.js` 用于扫描测试输出日志中的固定哨兵值：

- `SECRET_TOKEN`
- `RAW_SECRET`
- `STDOUT_SECRET`
- `PROVIDER_SECRET`
- `SECRET_API_KEY`
- `SECRET_BEARER`

用法：

```bash
set -o pipefail
pnpm test -- --runInBand 2>&1 | tee /tmp/99agent-server-test.log
node scripts/check-test-output-secrets.js /tmp/99agent-server-test.log

pnpm test:cov -- --runInBand 2>&1 | tee /tmp/99agent-server-test-cov.log
node scripts/check-test-output-secrets.js /tmp/99agent-server-test-cov.log
```

脚本命中时只输出 pattern 和文件路径，不打印包含敏感值的整行。扫描失败时应优先排查日志泄露路径，不要直接放宽 pattern。

## 测试日志分级

测试输出治理按风险分级处理：

- P1 敏感数据泄露：例如 token、raw tool arguments、raw output、stdout、stderr、provider response、签名 URL 或用户上传内容进入 stdout / stderr。必须立即修复，并补测试或扫描验证。
- P2 debug 噪音：例如流程注册、内部状态快照等 `Logger.debug` 输出污染 CI。当前 Jest 环境已默认静默 `Logger.debug`；需要断言 debug 日志时，可在单个 spec 内局部 spy。
- P3 非敏感业务 log / warn：例如 `GlobalConfigService` 初始化、`ChatGateway` 状态 log、工作流状态 log。默认不作为阻塞项，不全局静默，后续如治理应逐类处理。

不要为了让 CI 输出更干净而隐藏 `Logger.error`、失败路径日志或 warn 级别的边界信号。日志治理优先级是先防泄露，再降 debug 噪音，最后再考虑非敏感业务日志。

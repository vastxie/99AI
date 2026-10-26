# @99agent/contracts

Server 与 Web 共享的纯 TypeScript 合同源码：

- `agent-events.ts` / `platform-events.ts` / `envelope.ts`：公开 Agent Event Wire（16 类事件）与信封。
- `fixtures/agent-events.*`：双端合同测试共用的事件样例。

该包不发布、不打包，Server 与 Web 通过 tsconfig / vite alias 直接消费 `src/`；
`node --test tests/*.test.mjs` 用 server 的 TypeScript 编译器就地校验。
不得引入 Nest、TypeORM、Vue、数据库或 Server 业务类型。

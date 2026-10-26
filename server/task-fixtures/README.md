# 离线任务样例

在 `server/` 运行 `pnpm test:tasks`。入口读取 [manifest.json](./manifest.json)，检查样例编号和测试路径后执行对应 Jest 测试；这些测试也属于常规 Server 测试集。

| 样例 | 自动验证 |
| --- | --- |
| 合成销售表格 | 原语 bash 生成 CSV，ExcelJS 读取字段、行和总额 |
| 数据柱状图 | Python 标准库生成 PNG，Sharp 解码并核对尺寸与数据对应的像素 |
| Word 报告 | 生成 DOCX，ZIP / XML 解析器检查包完整性、文档关系、正文和表格 |
| MCP 文本 | 模拟工具列举和调用，检查当前策略、撤销和文本投影 |
| MCP 媒体 | 实际 PNG 字节经过 FileAsset、权限读取与模型协议构造 |
| 错误退化 | 无视觉能力、损坏媒体、超限和跨用户访问均有拒绝或静态文本提示 |

产物样例使用真实 LocalSandboxDriver、SandboxService、PrimitiveToolProvider 和 FileAssetService；仅数据库与对象存储 I/O 使用内存实现。测试创建的宿主临时目录在结束时删除，生产仍要求 Docker + gVisor。样例生成器只用 Python 标准库；需要测试宿主已有 `/usr/bin/python3`。测试不会启动开发服务、Docker、MySQL、Redis，也不调用外部 MCP 或收费模型。

自动验证证明合成文件的结构、内容和权限链路；不代表真实模型能稳定完成同类任务，也不能代替浏览器、Word 应用中的排版和真实视觉验收。

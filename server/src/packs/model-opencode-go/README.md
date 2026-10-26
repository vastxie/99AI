# OpenCode Go 模型协议包

协议 `opencode_go_chat_completions` 的适配器与厂商预设。它复用 OpenAI Chat Completions 请求体，同时为对话、连接测试和模型列表请求补齐 OpenCode Go 要求的 `User-Agent` 与稳定会话请求头。

## 开关

- 服务端：`MODEL_OPENCODE_GO_PACK_ENABLED`

## 贡献

- 模型协议 `opencode_go_chat_completions`
- OpenCode Go 厂商预设、默认对话端点与远程模型列表端点；目录只展示当前官方确认可走 Chat Completions 的 16 个模型
- 目录综合 Pi 注册表、供应商资料与实网验证维护名称、上下文、图片输入与推理档位元数据；后台选中模型时直接回填，真实探针负责校验当前账号与端点的实际接受情况
- 对外只发送脱敏后的稳定会话标识，不直接传递内部会话或用户 ID

Messages 或 Responses 端点的模型应由对应的独立协议包接入，避免在本协议中选中后才发现端点不兼容。远程 `/v1/models` 可能返回历史或其他端点模型，本协议会按官方端点表过滤，不把它当作能力目录。

## 删除影响

删掉或关闭后，该协议不再出现在后台模型页的协议下拉中；已配置为该协议的模型无法调用，其他模型协议不受影响。

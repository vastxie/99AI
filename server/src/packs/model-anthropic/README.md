# Anthropic Messages 协议包

协议 `anthropic_messages` 的适配器、消息映射、厂商预设与模型目录；适配器在构造时向内核 ModelStreamRegistry 注册协议描述。

## 开关

- 服务端：`MODEL_ANTHROPIC_PACK_ENABLED`

## 贡献

- 模型协议 `anthropic_messages`（默认端点、多模态类型、厂商预设与目录随协议描述一起下发给管理端）

## 删除影响

删掉后该协议不再出现在后台模型页的协议下拉里，已配置为该协议的模型无法调用；内核始终自带 OpenAI Chat Completions 兼容协议。

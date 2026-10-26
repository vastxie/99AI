# 安全风控

::: info 扩展包
本组页面由内容安全扩展包提供（服务端 `CONTENT_SAFETY_PACK_ENABLED`，管理端 `VITE_CONTENT_SAFETY_ENABLED`）。关闭或删除该包后，菜单与接口一并消失，对话不再做内容审核。开关说明见 [扩展包开关与裁剪](/deployment/packs)。
:::

内容审核、白名单和违规记录都在安全风控里维护。开启内容安全过滤后，用户消息会在进入模型前先经过检测；命中后消息被拦截，并累计到该用户的违规次数。

<!-- 截图占位 CFG-SECURITY-INDEX-01：安全风控菜单总览。 -->

## 子菜单

| 页面 | 后台地址 | 用途 |
| --- | --- | --- |
| [内容审核](./sensitive-words) | `/security/sensitive` | 启用内容安全过滤，并配置自备的本地敏感词库或腾讯云文本审核 |
| [白名单](./whitelist) | `/security/whitelist` | 放行被本地敏感词库误判的词语 |
| [违规记录](./violation-records) | `/security/violation` | 查看违规内容、违规来源和用户累计违规次数 |

## 推荐配置顺序

1. 在 [内容审核](./sensitive-words) 中开启内容安全过滤，并选择检测方式。
2. 在 [白名单](./whitelist) 中提前放行容易误伤的业务词。
3. 通过 [违规记录](./violation-records) 定期查看拦截情况，并调整词库或白名单。

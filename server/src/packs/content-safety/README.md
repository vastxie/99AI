# 内容安全包（content-safety）

敏感词库、白名单、违规记录与腾讯云文本审核，实现内核内容过滤端口（CONTENT_FILTER_PORT）；后台提供安全风控菜单与用户详情的内容安全片段。

## 开关

- 服务端：`CONTENT_SAFETY_PACK_ENABLED`
- 管理端：`VITE_CONTENT_SAFETY_ENABLED`

## 贡献

- 服务端：配置段 `content-safety`、端口 `CONTENT_FILTER_PORT`（总开关 isSensitiveWordFilter 由本包解释）、用户画像片段 `contentSafety`；同一对话预检重试使用稳定摘要，把违规记录与正式用户累计次数原子收敛为一次
- 管理端：「安全风控」菜单、用户详情内容安全片段

## 删除影响

删掉后对话预检直通（PassthroughContentFilter），内核仍保留 users.violationCount 但不再增长；后台没有词库 / 违规记录页面，用户详情只剩内核的状态与命中次数。

# 微信包（wechat）

微信公众号（扫码 / 微信内授权登录、消息推送）、开放平台网站登录、微信 Bot 通道；实现内核渠道绑定端口（CHANNEL_BINDING_PORT）。

## 开关

- 服务端：`WECHAT_PACK_ENABLED`
- 用户端：`VITE_WECHAT_ENABLED`
- 管理端：`VITE_WECHAT_ENABLED`

## 贡献

- 服务端：配置段 `wechat`、登录方式 `oauth:wechat_official` / `oauth:wechat_open_web` / `qr:wechat_official`、端口 `CHANNEL_BINDING_PORT`、公众号 XML 报文中间件（只挂本包路由）
- 用户端：登录方式图标 / 内嵌扫码面板 / 回调路由、微信内静默登录、账号页 Bot 绑定行与面板、侧栏 Bot 按钮、渠道 `weixin` 的显示名
- 管理端：登录接入下的微信配置 / Bot 通道页、身份与渠道显示名

## 删除影响

删掉后没有任何微信登录方式与 Bot 通道，内核的渠道绑定端口退回 NoChannelBindings；已有的 `weixin` 渠道会话仍可在网页端只读查看。

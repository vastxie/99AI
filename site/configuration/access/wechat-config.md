# 微信配置

::: info 扩展包
本页功能由微信扩展包提供（服务端 `WECHAT_PACK_ENABLED`，用户端与管理端 `VITE_WECHAT_ENABLED`）。关闭或删除该包后，本页菜单与接口一并消失，登录方式里不再出现微信。开关说明见 [扩展包开关与裁剪](/deployment/packs)。
:::

微信相关能力集中在两个标签页：微信登录配置处理微信登录、账号绑定和公众号自动回复；微信公众号菜单维护公众号底部自定义菜单。

- 后台入口：登录接入 / 微信配置

<!-- 截图占位 CFG-CHANNEL-WECHAT-CONFIG-01：微信配置页面，标出“微信登录配置”和“微信公众号菜单”两个标签页。 -->

## 子页面

| 子页面 | 用途 |
| --- | --- |
| [微信登录配置](./wechat-login-config) | 配置微信开放平台网站应用、公众号 AppId、Token、AppSecret、扫码登录、静默登录和自动回复 |
| [微信公众号菜单](./wechat-menu-config) | 配置公众号一级菜单、子菜单、跳转网页、小程序、图文素材 |

## 微信配置前提

开始配置前，先确认：

- 如需 PC Web 微信登录，已有微信开放平台网站应用。
- 如需公众号扫码、静默登录、自动回复或菜单，已有已认证或可用的微信公众号。
- 站点已配置 HTTPS 域名。
- [基础信息](/configuration/platform/base-configuration) 中的网站地址填写正确。
- 服务器公网可访问 `https://你的域名/api/official/notify`。

官方入口：

- [微信公众平台](https://mp.weixin.qq.com/)
- [微信开放平台](https://open.weixin.qq.com/)
- [微信公众号接入概述](https://developers.weixin.qq.com/doc/offiaccount/Basic_Information/Access_Overview.html)

## 常见问题

### 只想用微信登录，需要配置公众号菜单吗？

不需要。先完成微信登录配置即可。

如果只使用 PC Web 微信开放平台网站登录，也不需要配置公众号菜单；但如果要让网站登录和公众号登录自动打通同一个账号，网站应用和公众号需要绑定到同一个微信开放平台账号下。

### 公众号菜单保存失败？

先确认微信登录配置里的 AppId、Token、AppSecret 已填写，并且微信公众号服务器配置验证通过。

## 相关文档

- [微信登录配置](./wechat-login-config)
- [微信公众号菜单](./wechat-menu-config)
- [Bot 通道](./bot-channel)

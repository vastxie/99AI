# GitHub 包（github）

GitHub OAuth 登录 / 绑定。

## 开关

- 服务端 / 客户端：`GITHUB_PACK_ENABLED / VITE_GITHUB_ENABLED`

## 贡献

- 登录方式 `oauth:github`；用户端登录按钮图标与显示名；管理端登录配置页的「GitHub 登录」页签

## 删除影响

删掉后该登录方式从 /auth/providers 消失，用户端登录框与账号页不再展示它；已绑定的身份记录保留，只能解绑。

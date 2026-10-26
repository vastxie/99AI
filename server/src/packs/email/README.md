# 邮箱包（email）

邮箱验证码登录 / 绑定 / 找回密码，SMTP 或腾讯云邮件发信。

## 开关

- 服务端 / 客户端：`EMAIL_PACK_ENABLED / VITE_EMAIL_ENABLED`

## 贡献

- 登录方式 `captcha:local_email`（带 contactField=email）；管理端登录配置页的「邮箱登录」页签与身份显示名

## 删除影响

删掉后该登录方式从 /auth/providers 消失，用户端登录框与账号页不再展示它；已绑定的身份记录保留，只能解绑。

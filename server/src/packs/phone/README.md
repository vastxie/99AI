# 手机号包（phone）

手机号验证码登录 / 绑定 / 找回密码，腾讯云短信发送。

## 开关

- 服务端 / 客户端：`PHONE_PACK_ENABLED / VITE_PHONE_ENABLED`

## 贡献

- 登录方式 `captcha:local_phone`（带 contactField=phone）；管理端登录配置页的「手机号登录」页签与身份显示名

## 删除影响

删掉后该登录方式从 /auth/providers 消失，用户端登录框与账号页不再展示它；已绑定的身份记录保留，只能解绑。

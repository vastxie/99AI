# 登录配置：手机号登录

::: info 扩展包
本页功能由手机号登录扩展包提供（服务端 `PHONE_PACK_ENABLED`，管理端 `VITE_PHONE_ENABLED`）。关闭或删除该包后，页签与手机号验证码入口一并消失，其余登录方式不受影响。开关说明见 [扩展包开关与裁剪](/deployment/packs)。
:::

手机号登录依赖短信验证码，短信参数统一在这里填写。

- 后台入口：登录接入 / 登录配置 / 手机号登录

<!-- 截图占位 CFG-CHANNEL-SMS-CONFIG-01：登录配置的手机号登录标签页，标出手机号登录开关、SecretId、SecretKey、地域、短信应用 SDKAppID、短信签名和模板 ID。 -->

## 配置项怎么填

| 配置项 | 用途 | 从哪里找 | 填写建议 |
| --- | --- | --- | --- |
| 开启手机号注册/登录 | 控制用户端是否展示手机号验证码入口 | 后台选择 | 短信签名、模板和腾讯云密钥测试通过后再开启 |
| SecretId | 腾讯云接口调用身份 | [腾讯云访问密钥](https://console.cloud.tencent.com/cam/capi) | 可复用系统里的腾讯云 SecretId，建议使用子账号并限制权限 |
| SecretKey | 腾讯云接口签名密钥 | 腾讯云访问密钥页面 | 创建后通常只完整显示一次，请妥善保存 |
| 地域 | 腾讯云短信接口地域 | 腾讯云短信服务所在地域 | 不填默认 `ap-guangzhou` |
| 短信应用 SDKAppID | 短信应用 ID | [腾讯云短信控制台](https://console.cloud.tencent.com/smsv2/app-manage) → 应用管理 | 填实际 SDKAppID，常见格式如 `1400006666` |
| 短信签名 | 短信里展示的签名名称 | 腾讯云短信控制台 → 国内短信 → 签名管理 | 填审核通过的签名内容，不要填写签名 ID |
| 短信模板 ID | 验证码短信模板 ID | 腾讯云短信控制台 → 国内短信 → 正文模板管理 | 填审核通过的模板 ID |

## 腾讯云准备工作

1. 开通腾讯云短信服务。
2. 在短信控制台创建或选择短信应用，记录 SDKAppID。
3. 创建或选择短信签名，并等待审核通过。
4. 创建验证码短信模板，并等待审核通过。
5. 在腾讯云访问密钥页面准备 SecretId 和 SecretKey，建议使用子账号。
6. 将 SecretId、SecretKey、地域、SDKAppID、签名和模板 ID 填入后台。

官方入口：

- [腾讯云短信控制台](https://console.cloud.tencent.com/smsv2)
- [腾讯云短信应用管理](https://console.cloud.tencent.com/smsv2/app-manage)
- [腾讯云短信文档](https://cloud.tencent.com/document/product/382)
- [腾讯云访问密钥管理](https://console.cloud.tencent.com/cam/capi)

## 模板注意事项

短信模板需要包含验证码变量。当前系统发送验证码时会传入一个模板参数，即验证码本身，所以腾讯云模板里的变量数量应保持为 1 个。模板审核通过后，再把模板 ID 填入后台。

## 验证方式

1. 开启手机号注册/登录。
2. 打开用户端登录页。
3. 输入一个可接收短信的手机号。
4. 发送验证码并确认手机能收到。
5. 使用验证码完成登录。

<!-- 截图占位 CFG-CHANNEL-SMS-CONFIG-USER-ENTRY-01：用户端登录弹窗中的手机号登录入口，标出手机号输入框、验证码按钮和登录按钮。 -->

## 常见问题

### 短信发送失败但后台配置都填了？

检查签名和模板是否审核通过，SecretId/SecretKey 是否有短信权限，短信应用 SDKAppID 是否正确，腾讯云账户是否欠费或被限流。

### 可以使用主账号密钥吗？

不建议。正式站点应使用腾讯云子账号，并只授予短信发送所需权限。

## 相关文档

- [登录配置](./login-config)
- [用户策略](/configuration/users/user-settings)

# 内核与扩展包

仓库分成「内核」和「扩展包」两层，类比操作系统里的系统软件与用户软件：内核只提供多用户 Agent 对话所需的最小能力，其余能力都是包。硬规则只有一条：删掉任意一个包的三端目录，内核必须原样通过类型检查、测试与构建，主流程不受影响。这是代码层面的规则；已经初始化数据库的站点，带数据表的包（商业、内容安全、微信）不能再删，见 [带数据表的包](/deployment/packs#pack-tables)。

## 内核提供什么

| 端              | 内核能力                                                                                                                                                                                                                                                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 后端 `server/` | 账号密码注册 / 登录与会话、用户与角色、站点配置、模型管理与模型网关（自带 OpenAI Chat Completions 兼容接口）、对话与会话记录、Agent 循环、登录用户每人一台（持久磁盘）、访客每个对话一台的沙箱（Docker + gVisor）与 `read / write / edit / bash / ls` 五个原语工具、MCP 客户端、文件资产（自带本地目录存储）、垂直包清单导入、进程外渠道网关，以及计费 / 内容过滤 / 渠道绑定三个端口的空实现 |
| 用户端 `web/`   | 登录框与账号页、会话列表、输入与附件、消息流与活动面板、设置（通用 / 个人 / 账号 / 数据 / 公告 / 协议）、明暗主题、简体中文与 English                                                                                                                                                                                                                      |
| 管理端 `admin/` | 平台设置、AI 能力、用户运营（用户管理 / 用户详情 / 对话记录 / 用户策略）、登录接入（登录配置的「账号密码」页签）、首页导航                                                                                                                                                                                                                                 |

内核模块注册的数据表共 12 张：`users`、`user_auth_identities`、`chat_group`、`chatlog`、`config`、`models`、`file_assets`、`agent_operation`、`agent_effect`、`agent_continuation_inbox`、`agent_context_checkpoint`、`schema_baseline`；扩展包各自维护自己的表。`server/src/modules/database/schema.current.json` 是结构核对清单，里面也包含扩展包的表。

## 分级

| 分级      | 含义                                     | 删掉之后                                   |
| --------- | ---------------------------------------- | ------------------------------------------ |
| `system`  | 内核已经抽象出来的某类能力的具体实现     | 只是少一种选择，内核自带的基线实现继续工作 |
| `feature` | 独立的功能域，有自己的表、页面和端口实现 | 没有这项功能，内核对应端口退回空实现       |

## 扩展包清单

| 包                                                                                  | 分级    | 提供的能力                                                                                                                                                                                                                                              | 服务端开关                                                                                                                              | 前端构建变量                                                                              |
| ----------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `commerce`                                                                          | feature | 积分、套餐、订单、支付（微信、支付宝、易支付、PayPal、Stripe）、签到、模型计费；管理端「支付财务」、用户列表的积分列与调整积分 / 赠送套餐、用户策略「额度与赠送」、用户详情「权益与消费」（含账户明细）；用户端「账户数据」页签与独立全屏套餐选购弹窗、每日签到、余额不足提示 | `COMMERCE_PACK_ENABLED`                                                                                                                 | web / admin `VITE_COMMERCE_ENABLED`                                                       |
| `content-safety`                                                                    | feature | 敏感词库、白名单、违规记录、腾讯云文本审核；管理端「安全风控」、用户详情违规摘要                                                                                                                                                                        | `CONTENT_SAFETY_PACK_ENABLED`                                                                                                           | admin `VITE_CONTENT_SAFETY_ENABLED`                                                       |
| `wechat`                                                                            | feature | 公众号扫码登录、微信内授权登录、公众号消息与自定义菜单、微信开放平台网站登录、微信 Bot 通道、用户渠道绑定；管理端「微信配置」「Bot 通道」；用户端微信登录面板与 Bot 绑定                                                                                | `WECHAT_PACK_ENABLED`                                                                                                                   | web / admin `VITE_WECHAT_ENABLED`                                                         |
| `email` / `phone` / `github`                                                        | system  | 邮箱验证码（SMTP / 腾讯云邮件）、手机号验证码（腾讯云短信）、GitHub OAuth；管理端「登录配置」的对应页签；用户端 GitHub 包只登记品牌图标                                                                                                                 | `EMAIL_PACK_ENABLED` / `PHONE_PACK_ENABLED` / `GITHUB_PACK_ENABLED`                                                                     | admin `VITE_EMAIL_ENABLED` / `VITE_PHONE_ENABLED` / `VITE_GITHUB_ENABLED`                 |
| `model-openai-responses` / `model-anthropic` / `model-gemini` / `model-opencode-go` | system  | OpenAI Responses、Anthropic Messages、Gemini Generate Content、OpenCode Go 四种调用协议的适配器与厂商预设                                                                                                                                               | `MODEL_OPENAI_RESPONSES_PACK_ENABLED` / `MODEL_ANTHROPIC_PACK_ENABLED` / `MODEL_GEMINI_PACK_ENABLED` / `MODEL_OPENCODE_GO_PACK_ENABLED` | 无，管理端按服务端返回的协议列表渲染                                                      |
| `storage-s3` / `storage-oss` / `storage-cos`                                        | system  | S3 兼容、阿里云 OSS、腾讯云 COS 的存储实现；管理端「文件存储」里的对应选项                                                                                                                                                                              | `STORAGE_S3_PACK_ENABLED` / `STORAGE_OSS_PACK_ENABLED` / `STORAGE_COS_PACK_ENABLED`                                                     | admin `VITE_STORAGE_S3_ENABLED` / `VITE_STORAGE_OSS_ENABLED` / `VITE_STORAGE_COS_ENABLED` |
| `rich-media`                                                                        | system  | 用户端富媒体渲染：思维导图与 Mermaid 消息、HTML / Mermaid / MarkMap 预览、CodeMirror 代码面板、PDF / Office 文件预览                                                                                                                                    | 无（仅用户端）                                                                                                                          | web `VITE_RICH_MEDIA_ENABLED`                                                             |

所有开关默认开启。关闭与删除的具体影响见 [扩展包开关与裁剪](/deployment/packs)。

## 包怎么接进内核

包只通过内核公开的注册表、端口和挂载点接入，内核不点名任何包：

- **后端**：包目录里的 `pack.json` 描述分级、开关与贡献，`pack.ts` 导出 Nest 模块，启动时按目录自动发现。配置段、登录方式、模型协议、存储厂商、垂直包段、用户画像片段各有注册表；计费、内容过滤、渠道绑定是端口，没有包时用空实现。
- **用户端**：包用 `definePack` 声明路由、语言包、挂载点（设置页签、账号卡片、侧栏、消息与预览渲染器等）、弹窗 hash 与错误分类钩子。
- **管理端**：包用 `defineAdminPack` 贡献菜单、登录配置页签、存储选项、用户列表列与操作、用户详情片段、用户策略卡片。

三端的 `src/packs/<包名>/` 就是一个包的全部代码，删掉目录即可裁剪（带数据表的包需要在初始化数据库之前裁剪）；评分规则与各入口见 [二次开发](/guide/development)。

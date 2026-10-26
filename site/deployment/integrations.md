# 外部接入

第三方能力不进后端代码库，只有四条接入路径：MCP 服务器、沙箱内技能、进程外渠道服务、垂直包清单导入。

## MCP 服务器

第三方工具通过 MCP 客户端接入。静态配置写在 `MCP_SERVERS_JSON`（单行 JSON）；管理后台的 [MCP 服务](/configuration/ai/mcp) 页可以新增、编辑和测试服务器，保存在全局配置 `mcpServers` 里，与环境变量同名时覆盖环境变量里的那一项。环境变量写法：

```bash
MCP_SERVERS_JSON={"servers":[{"name":"docs","url":"https://mcp.example.com/mcp","headers":{"Authorization":"Bearer xxx"},"tools":{"deny":["delete_*"]},"identitySecret":"<与服务端共享的签名密钥>"}]}
# stdio 传输默认关闭；开启后必须把命令列入放行清单（逗号分隔）
MCP_STDIO_ENABLED=false
MCP_STDIO_COMMAND_ALLOWLIST=
# 单次工具输出送入模型的最大字符数，超出截断
MCP_TOOL_RESULT_MAX_CHARS=48000
```

远端工具会以 `mcp__<server>__<tool>` 出现在模型的工具列表中，按服务器的 `tools.allow` / `tools.deny` 过滤。每次调用都会在 MCP 请求的 `_meta["99agent/caller"]` 里附带当前用户身份（用户 id、uid、角色，访客则为访客 id）；为服务器配置 `identitySecret` 后，身份带 HMAC-SHA256 签名与 5 分钟有效期，垂直业务的 MCP 服务用同一密钥校验后即可按用户隔离数据；不需要身份的服务器可设置 `"passIdentity": false`。字段定义见仓库 `server/src/modules/mcp/mcp-caller-identity.ts`。

联网搜索等外部能力也走这条路：接一个提供搜索工具的 MCP 服务器即可，不需要改代码。

## 沙箱内技能

技能是一个目录：`SKILL.md` 写用法说明，其余是脚本、模板等辅助文件，目录名就是技能名。技能依赖沙箱镜像里已有的软件，需要更多软件时改镜像。

```text
latex-exam/
├── SKILL.md
├── build.sh
└── templates/exam.tex
```

`SKILL.md` 开头的 frontmatter 里写一行 `description`，它会出现在给模型的技能清单里；没有 frontmatter 时取正文第一段非标题文字（最多 120 字）。

```markdown
---
description: 把题目整理成 LaTeX 试卷并编译为 PDF，成品写入 $AGENT_OUTPUT_DIR
---

# 出卷

1. 把题目填进 templates/exam.tex。
2. 运行 `bash build.sh`，检查编译日志后把 PDF 写入 `$AGENT_OUTPUT_DIR`（本轮的产物目录，绝对路径，在技能目录里运行也会被交付）。
```

部署时把技能目录放进 `SANDBOX_SITE_SKILLS_DIR` 指向的目录（垂直包导入会自动复制）。沙箱每次开机都会把工作区里还没有的技能复制到 `/workspace/skills/<name>/`，宿主在系统提示里列出技能名与描述，模型按需读取 `SKILL.md` 再执行。每个技能最多复制 200 个文件，超过 2 MB 的文件和以 `.` 开头的文件会跳过；沙箱里已有同名技能时不覆盖（用户可能改过）。登录用户的工作区是持久磁盘，所以更新站点技能后，新用户拿到新版本，已有用户磁盘里的同名技能保持原样；需要换成新版时让用户删除 `skills/<name>/`，下次开机会重新复制。访客的临时沙箱每次都拿到当前版本。

登录用户还可以让 Agent 把自己写的技能私有保存（最多 100 个文件、共 2 MB），作为磁盘之外的备份：磁盘上缺少该技能时（例如新磁盘）会恢复源码，已有的不覆盖，依赖需要按说明重新安装；访客只能在当前沙箱里临时使用。

## 进程外渠道服务

自建的渠道服务（例如部署在另一台机器上的消息网关）不进后端代码库，只用两个接口接入：

| 接口 | 作用 |
| --- | --- |
| `POST /api/channel-gateway/bindings/resolve` | 解析渠道用户对应的站内用户 |
| `POST /api/channel-gateway/inbound` | 以绑定用户身份发送消息并同步取回回复 |

两者都用环境变量 `CHANNEL_SERVICE_TOKEN` 鉴权（请求头 `x-channel-service-token`），未配置时接口返回 503。渠道绑定关系由微信包等实现，没有装载任何绑定实现时内核视为没有绑定。

## 垂直包导入

垂直业务以一份清单文件交付：站点配置、MCP 服务器、沙箱技能与镜像、套餐预设。在 `server/` 目录执行：

```bash
node dist/main vertical:import /path/to/vertical.manifest.json --dry-run
```

先用 `--dry-run` 查看计划，确认后去掉参数正式导入。命令会写入站点配置与 MCP 服务器、把技能复制到 `SANDBOX_SITE_SKILLS_DIR`，并把需要人工处理的项（如设置 `SANDBOX_IMAGE`、未装载扩展包的段）列在报告的 manual 里。导入的 MCP 服务器按名称合并进后台配置（现有后台配置里有无法解析的条目时，预演与正式导入都会报告失败、不写入；导入期间配置被改过也会失败而不覆盖），之后在 [MCP 服务](/configuration/ai/mcp) 页维护，运行中的服务在重启或下一次在该页保存后使用新配置；站点配置段不能包含 `mcpServers`，请写在清单的 MCP 服务器段里；导入套餐预设后，可在 [沙箱资源](/configuration/payment/sandbox-resources) 为这些方案设置沙箱档位。清单格式见仓库 `packages/contracts/src/vertical-manifest.ts`，完整示例在 `packages/contracts/fixtures/vertical-manifest.example.json`。

# 99 AI 稳定版

可商业化的 AI Web 应用，旨在提供一个易部署的集成化人工智能服务站点。已编译为整合包，支持多种方式快速部署。

## 版本说明

| 特性       | 稳定版                       | 开发版                       |
| :--------- | :--------------------------- | :--------------------------- |
| 项目功能   | 详见项目介绍                 | 有一定的保留功能             |
| 更新频率   | 月更                         | 周更                         |
| 商用许可   | 可直接商用                   | 可直接商用                   |
| 部署方式   | Node.js / Docker-compose     | Node.js / Docker-compose     |
| 编译状态   | 前端混淆编译，后端非混淆编译 | 前端混淆编译，后端非混淆编译 |
| 未编译源码 | 暂不开源                     | 暂不开源                     |
| 授权要求   | 无需授权                     | 无需授权                     |
| 获取方式   | 本项目即为稳定版             | 赞助获取                     |

## 项目介绍

### 基础对话

**AI 对话**

支持 OpenAI Chat 格式，后台可自定义模型名称、头像、介绍、代理、key、积分扣除方式、文件上传模式等参数。

<img width="1444" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/dd373bec-674e-4a6c-8304-f6abd1a65e1e">

**支持多模态**

使用`gpt-4o`、`claude-3`等视觉模型，或`gpt-4-all`等逆向模型，完成图像、文件的识别分析。

<img width="1443" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/e1f1ed62-97e5-4412-9b72-5916d2337fdc">

**应用广场**

![应用广场](https://github.com/vastxie/99AI/assets/24899308/2cbeab33-0b6b-4f56-81a6-1e15e097023f)

### 插件系统

对接[插件系统](https://github.com/vastxie/99AIPlugin)，拓展 AI 功能边界。

**联网搜索**

<img width="1444" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/6ad1bcbb-ac6b-4478-9d91-9ae8b71afa64">

**思维导图**

<img width="1444" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/d6eb861d-2e26-415a-acf6-e2d44fc29620">

<img width="1445" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/61f1b059-1eab-428a-91a7-3015ffdac970">

**AI 绘画**

对接 `midjourney` 、`dall-e`、`stable-diffusion` 等绘画模型。

<img width="1444" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/39728c39-ed98-4d77-bee8-f7548c5f4a28">

<img width="1444" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/4a70785d-bf66-49e2-a822-5c91a68bd667">

**AI 音乐**

对接 `suno-music` 完成音乐创作。

<img width="1445" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/a2e42201-fad7-4498-9fb0-c107fcc2f683">

**AI 视频**

对接 `luma-video` 文生视频。

<img width="1446" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/365cc93e-6fc0-4107-ac4c-6b25f31f0f12">

### 开发版已 / 将支持

**AI 音乐弹窗**

支持调整歌词，选择音乐类型及风格。

<img width="1446" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/62e466d0-7866-4efb-b28e-03f6b088d043">

**更丰富的 AI 视频选项**

支持图生视频，视频尺寸的选择。

<img width="1443" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/734013e1-273b-4655-b18e-a8f138165130">

**代码预览**

支持 `HTML` 代码的预览与编辑。

<img width="1444" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/d7860dbf-0897-4f26-9d70-d304a270c05a">

<img width="1444" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/13e558fa-62a8-4fff-9e2b-c4820acefbc4">

**全模型文件分析**

<img width="1444" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/eedfd9fd-f3f3-4a37-8a82-b73e135e8dfe">

更多功能持续开发中 ··· ···

### 不再维护的页面

**专业绘图**

![绘画页](https://github.com/vastxie/99AI/assets/24899308/148fb1fa-820c-4fe1-9dbe-e967ee41fd8b)

**绘画广场**

![绘画广场](https://github.com/vastxie/99AI/assets/24899308/4eb3954e-489d-48f6-9d9d-4de6d2fcce83)

**分销邀请**

![分销邀请](https://github.com/vastxie/99AI/assets/24899308/cc280beb-d0cb-43d1-984e-4a7b3a61b807)

## 更新日志

### 稳定版 v3.5.0

主要更新内容：

- 对话 UI 参考 ChatGPT 官网调整为左右布局。
- 全新的[插件系统](https://github.com/vastxie/99AIPlugin)
  - 普通插件：联网搜索、思维导图。
  - 内置插件：Midjourney 绘图、Dalle 绘图、Stable-Diffusion 绘图、Suno 音乐、Luma 视频。
- 统一后台 UI 样式，增加更详细的设置说明。
- 优化调整多处 UI 界面显示。
- 新增模型自定义图标及介绍。
- 提问输入框支持通过剪切板粘贴图片，文件。
- 对话显示公式渲染适配 `/[ /]`、`/( /)` 格式。
- 新增对话中使用 `@` 调用应用功能。
- 优化首页“九宫格”显示（使用内置对话预设、不再依赖后端配置）
- Midjourney 绘图支持 `图生图`、`人脸一致性`、`风格一致性`、`MJ版本`自定义参数等自定义选择。

<details>

<summary>历史日志</summary>

### 稳定版 v3.3.0

- 重构流式回复逻辑，加入错误反馈并优化用户端等待动画。
- 调整文档显示 UI，提升视觉体验。
- 新增 AI 回复 TTS 播报功能【后台模型管理-模型设置-添加特殊模型 `tts-1` 】。
- 对话页新增 Dalle 绘图风格选择与连续对话绘画选项，配置入口：后台模型管理-绘画设置-Dalle 绘图配置。
- 新增对话页 Midjourney 图片尺寸及风格选择功能。
- 重构应用广场 UI，注意：**本次升级可能会导致应用广场图片丢失，请务必提前备份**。
- 优化侧边栏显示，现支持应用收藏，允许同一应用开启多个对话窗口。
- 新增 `GPTs` 适配及应用固定模型功能，需先在后台添加 `GPTs` 模型后进行设置。
- 创意模型 【后台模型管理-模型设置-添加创意模型】现已针对以下模型特别优化：
  - 【dalle-e-3】（OpenAI 格式）
  - 【midjourney】（Mj-Plus 格式）
  - 【stable-diffusion】（[LightAI API](https://api.lightai.io) 中转格式）
  - 【suno】（[LightAI API](https://api.lightai.io) 中转格式）
- 邮箱 SMTP 配置已迁移至后台【用户管理-邮件登录配置】，同时【基础配置】新增网页链接选项，增强发信显示效果。
- 重构应用逻辑，翻译及导图特殊模型不再需配置，已整合至【模型管理-系统应用】。
- 新增模型配置选项，允许设置模型调用频率限制，确保用户体验。

### v3.0.0

**前端改进**

- 对话页 UI 重构，参考 ChatGPT 风格，增加美观度。
- 新增对话页 Midjourney 绘图功能，包括绘画进度反馈及点按操作。
- Dalle 绘图支持模型绘画比例选择（方形/宽屏/垂直）。
- 绘图页面新增区域重绘功能。
- 全局字体优先使用系统默认，优化阅读体验。
- 适配 ALL 模型及 GPTs 返回图片，修正显示过大的问题。
- 对话页根据模型自动展示 AI 头像，可手动替换文件。

**后台配置调整**

- 模型配置迁移到模型管理，分普通对话/绘画/特殊模型。
- 后台支持模型文件上传模块开关，区分 ALL/4V 格式。
- 后台新增 Midjourney 提示词优化开关及优化词配置。

**注意**

- 重要：旧版 Midjourney 配置不再生效，需在模型配置绘画模型中重新配置。
- 模型配置支持扣除积分类型选择。
- 后台管理菜单重新排版，精简非必要配置。

### v2.6.0

1. **新增 mj-proxy-plus 支持**：支持[第三方](https://api.lightai.io)中转，添加容错和重试机制。（可联系作者获得 mj-proxy-plus 支持）。
2. **简化模型配置流程**：精简了 Midjourney 模型的配置要求，现在用户仅需填写地址和 key 即可完成后台配置，简化了操作步骤。
3. **新增模型排序**：引入了新的模型排序功能，优化了模型排序逻辑，以提升用户的操作体验。
4. **DALL-E 绘图功能整合**：DALL-E 绘图功能现在可以在 Chat 组件内直接使用，DALL-E-3 模型可以在后台进行单独配置。
5. **注意事项**：本次升级 Midjourney 对历史数据不兼容，在升级前请做好数据备份，以防数据丢失。

### v2.5.0

1. **GPT-4V（gpt-4-1106-vision-preview）模型识图功能**：添加了 GPT-4V 的图像识别功能，增强了模型的多媒体处理能力。
2. **文件上传预览及显示美化**：对文件上传预览及显示进行了美化，目前仅支持 4V 和 ALL 模型。
3. **简化模型切换逻辑**：简化了模型切换逻辑，支持更多国内模型。该功能需搭配类 OneAPI 的中转管理使用。
4. **Chat 页面 UI 精简和美化**：对 Chat 页面进行了精简和美化。请注意，其他页面尚未进行同步优化，因此在多界面切换时可能会有一定的割裂感。后续将继续对其他页面进行优化。

### v2.4.5

1. 部分页面 UI 精简。
2. 管理端地址改为 `/admin`，默认密码均设为 `123456`。
3. 支持使用 GPT-4-All（第三方逆向）解析上传的文件、图片。
4. 增加模型关联 Token 计费（可选）。
5. MJ 版本默认调整为 v6.0。

</details>

## 安装部署

安装文档可能不是非常详细，但绝对够用。如果在安装或配置中遇到任何问题，可以询问 AI、通过 [issue](https://github.com/vastxie/99AI/issues) 反馈或交流群内提问题，以获得更多帮助和支持。

### Node.js 部署

**1. 安装 Node.js 环境**

推荐使用 `nvm` (Node Version Manager) 来安装 Node.js。

- 首先，安装 `nvm`，你可以从 [nvm GitHub 仓库](https://github.com/nvm-sh/nvm) 找到安装指南。

- 按照仓库中的安装说明进行操作，安装完成后，可能需要添加环境变量或重启终端。

- 安装 Node.js 版本 18 或更高版本:

  ```shell
  nvm install 18
  nvm use 18
  ```

- 验证 Node.js 是否安装成功:

  ```shell
  node -v
  ```

**2. 安装 PM2 / PNPM（YARN）**

- 使用 npm 安装 PM2：

  ```shell
  npm install pm2 -g
  ```

- 使用 npm 安装 pnpm：

  ```shell
  npm install -g pnpm
  ```

- 确认 `PM2` 和 `pnpm` 都已正确安装并且可以运行：

  ```
  pm2 -v
  pnpm -v
  ```

**3. 其他配置**

- 需配置 Redis 数据库以及新建一个 MySQL 数据库。
- 配置环境变量：
  - 复制 `.env.example` 文件为 `.env`。
  - 根据需要修改 `.env` 文件中的配置项。

**4. 安装启动**

- 安装依赖：(若安装缓慢可尝试使用国内源)

  ```shell
  pnpm install
  ```

- 启动进程：（默认使用 PM2 后台运行）

  ```
  pnpm start
  ```

- 查看运行日志：

  ```shell
  pnpm logs
  ```

- 项目默认在 `9520` 端口运行，也可在环境变量中自行修改。成功运行后可通过 `IP:端口` 访问，或者配置 Nginx 反向代理，通过域名访问。

### 脚本部署

**1. 部署方式及功能支持**

- **全新安装 99AI**
  - 自动安装环境
  - 拉取源码
  - 安装依赖
  - 使用 PM2 监控运行
- **更新与修改配置**
  - 自动拉取更新
  - 自动更新程序
  - 自定义修改配置
- **卸载 99AI**
- **使用 Docker 部署**
  - 自动安装环境
  - 自定义配置
- **添加快捷执行脚本**
  - 后续仅需在服务器执行 `99ai` 即可再次进入脚本

**2. Shell 执行脚本**

请在项目的根目录下执行以下命令：

```bash
./deploy.sh
```

或使用：

```bash
bash <(curl -sL https://js.kengro.cn/99ai/onekey-cn-99ai.sh)
```

### Docker 部署

**1. 安装 Docker 及 Docker-compose**

- 使用 [Docker 官网](https://www.docker.com/) 提供的一键安装链接安装 Docker 及 Docker-compose。

  ```bash
  curl -fsSL https://get.docker.com | bash -s docker
  ```

- 也可以使用其他方式自行安装 Docker 及 Docker-compose。

**2. 服务管理**

- **后台启动服务**

  ```shell
  docker-compose up -d
  ```

- **查看日志**

  ```shell
  docker-compose logs
  ```

- **停止服务**

  ```shell
  docker-compose down
  ```

- **重新构建并启动服务**

  ```shell
  docker-compose up -d --build
  ```

## 项目管理

普通管理员，可以预览后台非敏感信息，默认不激活。请使用超级管理员账号登入后台，并及时修改密码。

- **管理端地址**：`项目链接/admin`

- **普通管理员账号**：`admin`（默认不激活）

- **超级管理员账号**：`super`

- **密码**：`123456`

## 学习交流

扫码添加微信备注 `99`，拉交流群。（不接受私聊技术咨询，有问题优先群内交流）

<img src="https://github.com/vastxie/NineAIQuickDeploy/assets/24899308/ee20578f-063d-48d8-bff6-85ac3e38fe60" width="300">

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=vastxie/99AI&type=Date)](https://star-history.com/#vastxie/99AI&Date)

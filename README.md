# 99 AI 稳定版

99AI：基于 NineAI 2.4.2 二开的可商业化 AI Web 应用（免授权，无后门，非盗版，已整合前后端整合包，支持 Docker 快速部署）。

版本说明：未编译源码暂不开源，相比稳定版，开发版进度更快一些。稳定版月更，开发版周更。

## 页面预览

**应用广场**

![应用广场](https://github.com/vastxie/99AI/assets/24899308/2cbeab33-0b6b-4f56-81a6-1e15e097023f)

**AI 绘画**

![AI 绘画](https://github.com/vastxie/99AI/assets/24899308/1155d39a-aeed-481e-9f80-127500bf59e7)

**AI 音乐**

![screenshot-1713627618821](https://github.com/vastxie/99AI/assets/24899308/f6966ae8-8be6-4ba5-8d06-c89b4c864f88)

**文件分析**（开发版支持）

![文件分析](https://github.com/vastxie/99AI/assets/24899308/68e80920-6b54-4a50-8b76-2c8c946e8717)

**绘画广场**

![绘画广场](https://github.com/vastxie/99AI/assets/24899308/4eb3954e-489d-48f6-9d9d-4de6d2fcce83)

**专业绘图**

![绘画页](https://github.com/vastxie/99AI/assets/24899308/148fb1fa-820c-4fe1-9dbe-e967ee41fd8b)

**分销邀请**

![分销推荐](https://github.com/vastxie/99AI/assets/24899308/cc280beb-d0cb-43d1-984e-4a7b3a61b807)

## 更新日志

### 稳定版 v3.3.0

- 重构流式回复逻辑，加入错误反馈并优化用户端等待动画
- 调整文档显示 UI，提升视觉体验
- 新增 AI 回复 TTS 播报功能【后台模型管理-模型设置-添加特殊模型 `tts-1` 】
- 对话页新增 Dalle 绘图风格选择与连续对话绘画选项，配置入口：后台模型管理-绘画设置-Dalle 绘图配置
- 新增对话页 Midjourney 图片尺寸及风格选择功能
- 重构应用广场 UI，注意：**本次升级可能会导致应用广场图片丢失，请务必提前备份**
- 优化侧边栏显示，现支持应用收藏，允许同一应用开启多个对话窗口
- 新增 `GPTs` 适配及应用固定模型功能，需先在后台添加 `GPTs` 模型后进行设置
- 创意模型 【后台模型管理-模型设置-添加创意模型】现已针对以下模型特别优化：
  - 【dalle-e-3】（OpenAI 格式）
  - 【midjourney】（Mj-Plus 格式）
  - 【stable-diffusion】（[LightAI API](https://api.lightai.io) 中转格式）
  - 【suno】（[LightAI API](https://api.lightai.io) 中转格式）
- 邮箱 SMTP 配置已迁移至后台【用户管理-邮件登录配置】，同时【基础配置】新增网页链接选项，增强发信显示效果
- 重构应用逻辑，翻译及导图特殊模型不再需配置，已整合至【模型管理-系统应用】
- 新增模型配置选项，允许设置模型调用频率限制，确保用户体验

### 开发版已/将支持

- 对话页 Midjourney 绘图支持 `图生图` `人脸一致性` `风格一致性` 以及更多自定义参数选择
- 全模型文件分析功能（只支持带文字的 pdf，word，ppt，txt，md 等文件）
- 全新的插件系统——联网搜索、思维导图等 ··· ···
- `SD3` / `SD3 Turbo` 绘图模型，`Stable Video` 图生视频模型（`stability.ai` API 格式）
- Azure TTS 模型支持，语音播报更生动自然
- 临时文件支持本地存储并自动清空
- 更多功能持续开发中 ··· ···

<details>

<summary>历史日志</summary>

### v3.0.0

**前端改进**

  - 对话页UI重构，参考ChatGPT风格，增加美观度。
  - 新增对话页 Midjourney 绘图功能，包括绘画进度反馈及点按操作。
  - Dalle绘图支持模型绘画比例选择（方形/宽屏/垂直）。
  - 绘图页面新增区域重绘功能。
  - 全局字体优先使用系统默认，优化阅读体验。
  - 适配ALL模型及GPTs返回图片，修正显示过大的问题。
  - 对话页根据模型自动展示AI头像，可手动替换文件。

**后台配置调整**

  - 模型配置迁移到模型管理，分普通对话/绘画/特殊模型。
  - 后台支持模型文件上传模块开关，区分ALL/4V格式。
  - 后台新增 Midjourney 提示词优化开关及优化词配置

**注意**

  - 重要：旧版 Midjourney 配置不再生效，需在模型配置绘画模型中重新配置。
  - 模型配置支持扣除积分类型选择。
  - 后台管理菜单重新排版，精简非必要配置。

### v2.6.0

1. **新增 mj-proxy-plus 支持**：支持[第三方](https://api.lightai.io)中转，添加容错和重试机制。（可联系作者获得 mj-proxy-plus 支持）
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

推荐使用 Docker 环境来编译和部署镜像，或者直接在 Node.js 环境中进行安装。虽然安装文档可能不是非常详细，但绝对够用。如果在安装或配置过程中遇到任何问题，优先使用 AI助手  货交流群内提出问题，以获得更多帮助和支持。

## 一键部署（推荐）
1. **部署方式及功能支持**
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
    - **添加快捷执行脚本，后续仅需在服务器执行 `99ai` 即可再次进入脚本。**
2. **shell执行脚本**
     ```bash
     bash <(curl -sL https://js.kengro.cn/99ai/onekey-cn-99ai.sh)
     ```
## Docker 部署 （推荐）

1. **安装 Docker 及 Docker-compose**

   - 使用[Docker 官网](https://www.docker.com/)提供的一键安装链接安装Docker及Docker-compose。 
   
     ```shell
     curl -fsSL https://get.docker.com | bash -s docker
     ```
    
2. **服务管理**

   - 后台启动服务

     ```bash
     docker-compose up -d
     ```

   - 查看日志

     ```bash
     docker-compose logs
     ```
     
   - 停止服务

     ```bash
     docker-compose down
     ```
   - 重新构建并启动服务

     ```bash
     docker-compose up -d --build
     ```

3. **访问项目**
   - 在浏览器中访问 `http://localhost:9520`，如果配置了 nginx 反向代理，则通过配置的域名访问。

## Node.js + PM2 部署

### 环境准备

1. **安装 Node.js 环境**

   推荐使用 `nvm` (Node Version Manager) 来安装 Node.js。

   - 首先，安装 `nvm`，你可以从 `nvm` 的 GitHub 仓库找到安装指南:
     [nvm GitHub 仓库](https://github.com/nvm-sh/nvm)

   - 按照仓库中的安装说明进行操作，安装完成后，重启你的终端或命令行界面。

   - 安装 Node.js 版本 16.0 或更高版本:

     ```bash
     nvm install 16
     nvm use 16
     ```

   - 验证 Node.js 安装成功及版本:

     ```bash
     node -v
     ```

   使用这种方法安装 Node.js，可以确保你的开发环境中 Node.js 的版本管理更为灵活和方便。

2. **安装 PM2 / PNPM**

   - 使用 npm 安装 PM2：

     ```bash
     npm install pm2 -g
     ```

   - 使用 npm 安装 pnpm：

     ```bash
     npm install -g pnpm
     ```

   - 确认`PM2`, 和 `pnpm` 都已正确安装并且可以运行：

     ```bash
  
     pm2 -v
     pnpm -v
     ```

   - 这一步确保所有必需的工具和软件已正确安装，并且它们的版本符合项目需求。

### 配置项目

1. **配置环境变量**

   - 复制`.env.example`文件为`.env`。
   - 根据需要修改`.env`文件中的配置项。

2. **安装项目依赖**
   - 运行命令：`pnpm install`(若安装缓慢可尝试使用国内源)。
   - 这将根据`package.json`文件安装所有必需的依赖。

### 启动项目

1. **启动服务**

   - 使用命令：`pnpm start`
   - 这将启动项目，并默认在 9520 端口监听。

2. **访问项目**
   - 在浏览器中访问 `http://localhost:9520`，如果配置了 nginx 反向代理，则通过配置的域名访问。

### 项目升级

1. **拉取更新**

   - 拉取新的整合包：`git pull`

2. **删除旧进程**

   - 删除旧的 PM2 进程。

3. **安装依赖**

   - 运行命令：`pnpm install` 以安装 `package.json` 中定义的必需依赖。

4. **启动服务**

   - 使用命令：`pnpm start` 来启动项目，它将默认在 9520 端口监听。

## 管理平台

- **管理端地址**：`/admin`

- **普通管理员账号**：`admin`

- **超级管理员账号**：`super`

- **密码**：`123456`

普通管理员，可以预览后台非敏感信息，默认不激活。请使用超级管理员账号登入后台，并及时修改密码。

## 学习交流

扫码添加微信备注 `99`，拉交流群。（不接受私聊技术咨询，有问题优先群内交流）

<img src="https://github.com/vastxie/NineAIQuickDeploy/assets/24899308/ee20578f-063d-48d8-bff6-85ac3e38fe60" width="300">

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=vastxie/99AI&type=Date)](https://star-history.com/#vastxie/99AI&Date)

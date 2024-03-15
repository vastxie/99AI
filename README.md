# 99 AI 稳定版

99AI：基于 NineAI 2.4.2 二开的可商业化 AI Web 应用（免授权，无后门，非盗版，已整合前后端，支持快速部署）。

稳定版完全开源，开发版进度更快一些。

## 页面预览

<img width="1226" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/9b6f3e28-1cfa-4c76-8f43-d898c7f72a08">

<img width="1225" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/bea19b79-3c55-47fa-ad7f-e844c63bfd28">

<img width="1227" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/28c59e00-c2c1-49fe-b578-77ec06ed286a">

<img width="1226" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/9f145377-87a3-4164-a417-79fc071fd07c">

<img width="1222" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/8df83601-fb67-47c2-8764-1d01c1a5f76b">

<img width="1225" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/36731988-98f1-48ba-9516-2fd6ff5ede7d">

<img width="1220" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/bf71768a-f996-4512-9cc5-d6ef6e39a8c0">

## 更新日志

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

**开发版已支持**

- [x] 应用页支持GPTS及固定模型功能。
- [x] 对话使用TTS进行语音播报。
- [x] Dalle绘图支持添加风格参数，支持交互式连续绘画。
- [ ] ...


<details>

<summary>历史日志</summary>

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

## 环境准备

1. **安装 Node.js 环境**

   - 请根据您的操作系统下载并安装 Node.js。
   - 可以从[Node.js 官网](https://nodejs.org/)下载。

2. **安装 PM2**

   - 使用 npm 安装 PM2：`npm install pm2 -g`
   - PM2 是一个带有负载均衡功能的 Node 应用的进程管理器。

3. **安装 PNPM**
   - 使用 npm 安装 PNPM：`npm install -g pnpm`
   - PNPM 是一个快速、节省磁盘空间的包管理工具。

## 配置项目

1. **配置环境变量**

   - 复制`.env.example`文件为`.env`。
   - 根据需要修改`.env`文件中的配置项。

2. **安装项目依赖**
   - 运行命令：`pnpm install`(若安装失败可尝试使用国内源)
   - 这将根据`package.json`文件安装所有必需的依赖。

## 启动项目

1. **启动服务**

   - 使用命令：`pnpm start`
   - 这将启动项目，并默认在 9520 端口监听。

2. **访问项目**
   - 在浏览器中访问`http://localhost:9520`，或者如果配置了 nginx 反向代理，则通过配置的域名访问。

## 管理平台

- **管理端地址**：`/admin`
- **普通管理员账号**：`admin`
- **超级管理员账号**：`super`
- **密码**：`123456`

普通管理员，可以预览后台非敏感信息。登入后台后请及时修改管理员密码，或按需要禁用普通管理员。

请确保遵循上述步骤进行配置和启动，以保证系统的正确运行。

## 项目升级

1. **拉取更新**

   - 拉取新的整合包：`git pull`

2. **删除旧进程**

   - 删除旧的 PM2 进程。

3. **安装依赖**

   - 运行命令：`pnpm install` 以安装 `package.json` 中定义的必需依赖。

4. **启动服务**
   - 使用命令：`pnpm start` 来启动项目，它将默认在 9520 端口监听。

## 学习交流

扫码添加微信备注 99，拉交流群

<img src="https://github.com/vastxie/NineAIQuickDeploy/assets/24899308/ee20578f-063d-48d8-bff6-85ac3e38fe60" width="300">

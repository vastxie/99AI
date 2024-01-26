# NineAI 更新整合版

99AI整合版（基于 NineAI 二开），免授权，支持快速部署。

## 页面预览
<img width="1229" alt="image" src="https://github.com/vastxie/NineAIQuickDeploy/assets/24899308/7e9927a5-b0a7-42e0-8699-c9cd13a6d31a">

<img width="1229" alt="image" src="https://github.com/vastxie/NineAIQuickDeploy/assets/24899308/232ccf5d-90f6-45b5-8b9b-038959ac03af">

<img width="1229" alt="image" src="https://github.com/vastxie/NineAIQuickDeploy/assets/24899308/131b085c-54b9-455f-b62f-8b0baab11740">

<img width="1229" alt="image" src="https://github.com/vastxie/NineAIQuickDeploy/assets/24899308/5af15484-4762-42ae-b175-6b97638fb7d0">

<img width="1229" alt="image" src="https://github.com/vastxie/NineAIQuickDeploy/assets/24899308/8e872177-2afc-4cfb-b435-d17ead5dac36">

<img width="1229" alt="image" src="https://github.com/vastxie/NineAIQuickDeploy/assets/24899308/18f32097-1c4d-4b8f-8c2e-2c7c36a51be1">



## 更新日志

### v2.5.0

1. **GPT-4V（gpt-4-1106-vision-preview）模型识图功能**：添加了GPT-4V的图像识别功能，增强了模型的多媒体处理能力。
2. **文件上传预览及显示美化**：对文件上传预览及显示进行了美化，目前仅支持4V和ALL模型。
3. **简化模型切换逻辑**：简化了模型切换逻辑，支持更多国内模型。该功能需搭配类 OneAPI 的中转管理使用。
4. **Chat页面UI精简和美化**：对 Chat 页面进行了精简和美化。请注意，其他页面尚未进行同步优化，因此在多界面切换时可能会有一定的割裂感。后续将继续对其他页面进行优化。

### v2.4.5

1. 部分页面UI精简。
2. 管理端地址改为 `/admin`，默认密码均设为 `123456`。
3. 支持使用 GPT-4-All（第三方逆向）解析上传的文件、图片。
4. 增加模型关联 Token 计费（可选）。
5. MJ 版本默认调整为 v6.0。

## 环境准备

1. **安装Node.js环境**
   - 请根据您的操作系统下载并安装Node.js。
   - 可以从[Node.js官网](https://nodejs.org/)下载。

2. **安装PM2**
   - 使用npm安装PM2：`npm install pm2 -g`
   - PM2是一个带有负载均衡功能的Node应用的进程管理器。

3. **安装PNPM**
   - 使用npm安装PNPM：`npm install -g pnpm`
   - PNPM是一个快速、节省磁盘空间的包管理工具。

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
   - 这将启动项目，并默认在9520端口监听。

2. **访问项目**
   - 在浏览器中访问`http://localhost:9520`，或者如果配置了nginx反向代理，则通过配置的域名访问。

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

完整未编译源码暂未开源，欢迎进群交流

<img src="https://github.com/vastxie/NineAIQuickDeploy/assets/24899308/003c1060-dec0-46d0-8382-b6eef5d85298" width="300">




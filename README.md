# 99 AI 稳定版

可商业化的 AI Web 应用，旨在提供一个易部署、低门槛的集成化人工智能服务站点，支持多种部署方式。

源码可商用，支持二开及分发，但不要仅改名后割韭菜，尽量保留[出处](https://github.com/vastxie/99AI)，有兴趣的小伙伴可共同维护。

## 项目介绍

### 主要功能

- [x] **AI 对话**：支持 OpenAI Chat 格式，后台可自定义模型名称、头像、介绍、代理、key、积分扣除方式、文件上传模式等参数。

<img width="1444" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/dd373bec-674e-4a6c-8304-f6abd1a65e1e">

- [x]  **多模态模型**：使用`gpt-4o`、`claude-3`等视觉模型，或`gpt-4-all`等逆向模型，完成图像、文件的识别分析。

<img width="1443" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/e1f1ed62-97e5-4412-9b72-5916d2337fdc">

- [x] **全模型文件分析**

<img width="1444" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/eedfd9fd-f3f3-4a37-8a82-b73e135e8dfe">

- [x] **代码预览**： `HTML` 代码的预览与编辑。

<img width="1444" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/d7860dbf-0897-4f26-9d70-d304a270c05a">

<img width="1444" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/13e558fa-62a8-4fff-9e2b-c4820acefbc4">

- [x] **联网搜索**：对接[插件系统](https://github.com/vastxie/99AIPlugin)，拓展 AI 功能边界。

<img width="1444" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/6ad1bcbb-ac6b-4478-9d91-9ae8b71afa64">

- [x] **思维导图**

<img width="1444" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/d6eb861d-2e26-415a-acf6-e2d44fc29620">

<img width="1445" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/61f1b059-1eab-428a-91a7-3015ffdac970">

- [x] **AI 绘画**：对接 `midjourney` 、`dall-e`、`stable-diffusion` 等绘画模型。

<img width="1444" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/39728c39-ed98-4d77-bee8-f7548c5f4a28">

<img width="1444" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/4a70785d-bf66-49e2-a822-5c91a68bd667">

- [x] **AI 音乐**：对接 `suno-music` 完成音乐创作。

<img width="1445" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/a2e42201-fad7-4498-9fb0-c107fcc2f683">

<img width="1446" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/62e466d0-7866-4efb-b28e-03f6b088d043">

- [x] **AI 视频**：对接 `luma-video` 文生视频。

<img width="1446" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/365cc93e-6fc0-4107-ac4c-6b25f31f0f12">

<img width="1443" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/734013e1-273b-4655-b18e-a8f138165130">

- [x] **知识库预设**

<img width="1446" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/abe7fe07-535f-43cc-8bc5-5e49eb6271cf">

<img width="1442" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/330be2fc-db83-446c-8518-d97f85ef0ec4">

<img width="1443" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/a341dc07-cd83-4594-bff7-c5b784f41eb1">

- [x] 更多功能持续开发中 ··· ···

## 版本说明

| 特性         | 稳定版                                           | 开发版                                                       |
| :----------- | :--------------------------------------------- | :--------------------------------------------------------- |
| **商用许可** | 支持商用                                        | 支持商用                                                    |
| **源码状态** | 未编译，支持自由修改                             | 已编译，代码不可二次开发                                     |
| **获取方式** | 公开项目                             | 私有库，需赞助后获取                                         |
| **页面特性** | 单对话页面                                       | 包含更多功能页面（如独立的绘画页面、思维导图页面、分销页面等） |

## 安装部署

安装文档可能不是非常详细，但绝对够用。如果在安装或配置中遇到任何问题，可询问 AI、通过 [issue](https://github.com/vastxie/99AI/issues) 反馈或交流群内提问题。

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

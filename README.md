# 99 AI 稳定版

可商业化的 AI Web 应用，旨在提供一个易部署、低门槛的集成化人工智能服务站点，支持多种部署方式。

为了方便用户部署，项目已经 **打包完成**，可直接运行部署。源码支持商用、二次开发及分发，但请保留[出处](https://github.com/vastxie/99AI)，共同维护社区生态。

**二次开发源码** 存放于 `src` 目录下，开发者可以根据需要自由修改和扩展。

## 项目介绍

### 主要功能

- [x] **AI 对话**：支持 OpenAI Chat 格式，后台可自定义模型名称、头像、介绍、代理、key、积分扣除方式、文件上传模式等参数。

<img width="1444" alt="image" src="https://github.com/vastxie/99AI/assets/24899308/dd373bec-674e-4a6c-8304-f6abd1a65e1e">

- [x] **多模态模型**：使用`gpt-4o`、`claude-3`等视觉模型，或`gpt-4-all`等逆向模型，完成图像、文件的识别分析。

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

| 特性         | 稳定版               | 开发版                                                         |
| :----------- | :------------------- | :------------------------------------------------------------- |
| **商用许可** | 支持商用             | 支持商用                                                       |
| **源码状态** | 未编译，支持自由修改 | 已编译，代码不可二次开发                                       |
| **获取方式** | 公开项目             | 私有库，需赞助后获取                                           |
| **页面特性** | 单对话页面           | 包含更多功能页面（如独立的绘画页面、思维导图页面、分销页面等） |

## 部署指南

请参考完整的 [部署文档](./DEPLOYMENT.md) 了解详细信息。

部署文档可能不是非常详细，但绝对够用。如果在安装或配置中遇到任何问题，可询问 AI、通过 [issue](https://github.com/vastxie/99AI/issues) 反馈或交流群内提问题。

## 项目开发

请参考完整的 [开发文档](./src/DEVELOPMENT.md) 了解详细的开发流程和指引。

### 目录结构

```plaintext
99AI/
├── DEPLOYMENT.md          # 部署文档
├── Dockerfile             # Docker 配置文件
├── deploy.sh              # 一键部署脚本
├── docker-compose.yml     # Docker Compose 配置文件
├── dist/                  # 打包后的静态资源与后端代码
├── logs/                  # 日志存储目录
├── public/                # 前端公共静态资源
└── src/                   # 源码目录
    ├── admin/             # 管理端（基于 Fantastic Admin Basic 构建）
    ├── chat/              # 用户端（用户对话页面）
    ├── service/           # 后端服务（基于 NestJS 构建的核心 API 服务）
    └── build.sh           # 一键打包脚本
```

## 学习交流

扫码添加微信备注 `99`，拉交流群。（不接受私聊技术咨询，有问题优先群内交流）

<img src="https://github.com/vastxie/99AI/assets/24899308/ee20578f-063d-48d8-bff6-85ac3e38fe60"
     width="300" alt="WeChat QR code for joining the group">

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=vastxie/99AI&type=Date)](https://star-history.com/#vastxie/99AI&Date)

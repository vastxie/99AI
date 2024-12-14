# 99AI 项目开发指引

## 项目结构

```plaintext
src/
├── admin/                 # 管理端
├── chat/                  # 用户端（对话页）
├── service/               # 后端服务
└── build.sh               # 一键打包脚本
```

---

## 模块说明

### 1. 用户端（chat）

- **位置：** `src/chat`
- **功能：**
  - 使用 Vue.js 构建。
  - 支持 AI 对话、多模态分析、文件上传与解析等用户功能。

---

### 2. 管理端（admin）

- **位置：** `src/admin`
- **功能：**
  - 基于 [Fantastic Admin Basic](https://github.com/fantastic-admin/basic) 开源框架构建。
  - 超级管理员和普通管理员的后台管理页面。
  - 支持积分系统管理、模型配置、用户管理等功能。

---

### 3. 后端服务（service）

- **位置：** `src/service`
- **功能：**
  - 提供 API 接口，负责模型调用、业务逻辑处理与数据库交互。
  - 支持多模态模型、文件分析、用户积分系统等功能。
  - 使用 NestJS 构建，默认运行在 `http://localhost:9520`。

---

## 一键打包脚本

项目提供了 `build.sh` 脚本，用于快速打包整个项目：

```bash
bash build.sh
```

执行后，所有模块将自动构建，构建后的文件存放在项目根目录的文件夹中。

---

如有其他问题，请查看项目根目录的文档或通过 [issue](https://github.com/vastxie/99AI/issues) 提交反馈。

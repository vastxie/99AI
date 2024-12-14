# 部署指南

请参考完整的 [部署文档](./DEPLOYMENT.md) 了解详细信息。

部署文档可能不是非常详细，但绝对够用。如果在安装或配置中遇到任何问题，可询问 AI、通过 [issue](https://github.com/vastxie/99AI/issues) 反馈或交流群内提问题。

## Node.js 部署

### 1. 安装 Node.js 环境

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

### 2. 安装 PM2 / PNPM（YARN）

- 使用 npm 安装 PM2：

  ```shell
  npm install pm2 -g
  ```

- 使用 npm 安装 pnpm：

  ```shell
  npm install -g pnpm
  ```

- 确认 `PM2` 和 `pnpm` 都已正确安装并且可以运行：

  ```shell
  pm2 -v
  pnpm -v
  ```

### 3. 其他配置

- 需配置 Redis 数据库以及新建一个 MySQL 数据库。
- 配置环境变量：
  - 复制 `.env.example` 文件为 `.env`。
  - 根据需要修改 `.env` 文件中的配置项。

完成配置并启动后，项目会自动在指定的 MySQL 数据库中创建所需的表结构和初始数据，无需手动导入 SQL 文件。确保 `.env` 文件中的数据库连接信息正确即可。

### 4. 安装启动

- 安装依赖：(若安装缓慢可尝试使用国内源)

  ```shell
  pnpm install
  ```

- 启动进程：（默认使用 PM2 后台运行）

  ```shell
  pnpm start
  ```

- 查看运行日志：

  ```shell
  pnpm logs
  ```

- 项目默认在 `9520` 端口运行，也可在环境变量中自行修改。成功运行后可通过 `IP:端口` 访问，或者配置 Nginx 反向代理，通过域名访问。

## 脚本部署

### 功能支持

- **Node.js 全新部署**  
  自动安装环境、生成配置、安装依赖并启动服务。
- **Node.js 升级**  
  拉取最新代码，更新依赖并重启服务。
- **Docker-compose 部署**  
  创建 MySQL、Redis 容器及 99AI 服务，支持自定义端口。
- **Docker-compose 升级**  
  停止旧版本容器，重新构建镜像并启动。

请在项目的根目录下执行以下命令：

```bash
./deploy.sh
```

## Docker 部署

### 1. 安装 Docker 及 Docker-compose

- 使用 [Docker 官网](https://www.docker.com/) 提供的一键安装链接安装 Docker 及 Docker-compose。

```bash
curl -fsSL https://get.docker.com | bash -s docker
```

- 也可以使用其他方式自行安装 Docker 及 Docker-compose。

### 2. 服务管理

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

# 部署指南

主应用按普通 Node.js 项目部署在宿主机上，不需要授权码或商业启动器；用户沙箱是唯一需要 Docker 的组件。

## 架构一览

后端进程（默认端口 `9520`）同时提供接口（`/api`）、公开文件（`/file`）、用户端页面（`/`）和管理端页面（`/admin`，由 `ADMIN_SERVE_ROOT` 决定），用户端与管理端的构建产物放在 `server/public/chat` 与 `server/public/admin`。数据放在 MySQL 与 Redis。

模型只拥有 `read / write / edit / bash / ls` 五个原语工具，全部在隔离的 Docker 容器内执行：登录用户每人一台沙箱电脑、多个对话共用，工作区是他独立的持久磁盘；访客每个对话一台临时容器。生产环境用 gVisor（`runsc`）运行时隔离；默认经受控代理访问公开 HTTP/HTTPS，也可设为无网。主应用本身不支持放进 Docker 或 Kubernetes 部署。

## 部署前准备 {#before-start}

- **Node.js**：推荐 24 LTS，最低 22.15；包管理器用 pnpm 11，版本由各 `package.json` 的 `packageManager` 固定，执行一次 `corepack enable` 后自动使用。
- **数据库**：MySQL 8.0+（utf8mb4）。
- **缓存**：Redis 6.0+。
- **沙箱宿主**：Linux（x86_64 / arm64）、Docker Engine 28+（默认受控联网需要 API 1.48+）、gVisor `runsc` 并注册为 Docker runtime；安装步骤见仓库 `sandbox/README.md`。
- **域名与证书**：一个正式域名和有效的 HTTPS 证书。微信登录、支付回调、文件访问都依赖它。
- **磁盘**：预留数据库、上传文件（`server/public/file`、`server/storage`）与沙箱数据卷的空间。
- **访问端浏览器**：用户端与管理端按 Chrome / Edge 111+、Firefox 114+、Safari 16.4+（iOS 16.4+）构建，Mermaid 图表另需 Safari 17.4+ 或同期浏览器。在微信里打开时，安卓的微信内置浏览器随微信更新，请使用较新的微信版本；iOS 取决于系统版本。更早的浏览器不在支持范围内。

生产环境先确定数据库、`.env` 和上传文件的备份策略。数据库表结构同步默认关闭，升级不能依靠重启服务自动改表。

## 安装步骤 {#install}

### 1. 获取代码

把仓库放到服务器，例如 `/opt/99agent`。

下面每一步的命令都**在仓库根目录执行**；需要进入子目录的命令放在括号里（子 shell），执行完仍回到仓库根目录。

### 2. 构建用户端与管理端

```bash
./dev-build.sh
```

脚本会在 `web/` 与 `admin/` 各自安装依赖、执行生产构建，并把产物同步到 `server/public/chat` 和 `server/public/admin`。生产构建读取 `web/.env.production` 与 `admin/.env.production`：接口地址都是同源的 `/api`，不需要改；扩展包的前端开关见 [扩展包开关与裁剪](/deployment/packs)。管理端不放在 `/admin` 时，`admin/.env.production` 里的 `VITE_BASE_PATH` 要与后端的 `ADMIN_SERVE_ROOT` 保持一致。

### 3. 配置并构建后端

```bash
(cd server && pnpm install && cp .env.example .env)
# 编辑 server/.env（见下方「环境变量」），再构建
(cd server && pnpm build)
```

### 4. 构建沙箱镜像

```bash
docker build -t 99agent/sandbox:latest sandbox/
docker build -t 99agent/sandbox-egress:latest sandbox/egress/
```

第二个是沙箱的出网代理镜像，默认的受控联网（`SANDBOX_NETWORK_MODE=egress`）需要它；设为 `none`（无网）时可以不建。

后端进程需要能访问 Docker socket（加入 `docker` 组，或用 TCP + TLS）。

### 5. 首次启动 {#first-start}

先确定扩展包开关，并将 `.env` 指向全新空 MySQL 数据库。显式初始化只建立数据库连接，不启动应用、Redis 或后台任务；重复运行只核对已有的当前基线。已有业务表、部分初始化或基线不匹配都会拒绝，不会自动删除或迁移表。

```bash
(cd server && node dist/main db:init && node dist/main db:check)
(cd server && pnpm start)
```

`pnpm start` 用 PM2 启动，应用名 `99Agent`，日志写在 `server/logs/`；前台调试可以直接运行 `node dist/main`。需要把三端打成一个部署包时，在仓库根执行 `./build.sh`，产物在 `release-build/99agent-<版本>-<时间>/`（含同名 ZIP），复制到宿主机后 `pnpm install --prod` 即可。

首次启动会创建超级管理员，账号 `super`：密码优先取 `.env` 里的 `ADMIN_INITIAL_PASSWORD`（8 – 30 个字符：上限与登录密码一致，下限 8 比登录更严）；未配置时随机生成并写入 `server/storage/initial-admin-password.txt`（默认路径，可用 `ADMIN_INITIAL_PASSWORD_FILE` 指定；仅本机可读，不会出现在日志里）。用它打开 `https://你的域名/admin` 登录后，立即修改密码并删除该文件，再按 [后台配置](/configuration/) 完成站点信息、模型、存储等配置。

随机密码时，先把密码文件写好、落盘，再创建账号：创建失败时服务拒绝启动、文件保留，排除数据库问题后重启会沿用文件里的同一个密码。文件第一行是密码，第二行记录它属于哪个数据库；文件属于另一个数据库（例如换了库）、格式不对、不是仅本机可读（0600）的普通文件时，服务拒绝启动并提示人工处理——核对后删除该文件，或改用 `ADMIN_INITIAL_PASSWORD`。服务不会删除或覆盖这个文件。多个实例同时首次启动时只会有一个创建超级管理员。

登录接口自带防爆破：同一账号连续输错 5 次、或同一 IP 在 15 分钟内失败 50 次，都会临时锁定 15 分钟。

## 环境变量 {#env-config}

`server/.env.example` 列出了全部变量及默认值，常用项如下。

### 基础

```bash
PORT=9520

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASS=
DB_DATABASE=99agent
# 正常启动只核对结构，建表须显式执行 node dist/main db:init

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_USER=
REDIS_DB=0

# 生产环境：ISDEV=false 且显式 NODE_ENV=production（pm2.conf.json 已带）。未设置时安全默认值同样按生产处理。
# 开发模式要同时满足：NODE_ENV 不是 production、ISDEV 不是 false，并且 ISDEV=true 或 NODE_ENV=development / test；
# 只有开发模式才会放宽密码哈希强度、放行 localhost 跨域、允许 local 沙箱驱动与非 runsc 运行时
ISDEV=false
NODE_ENV=production
# JWT 签名密钥（至少 32 位）。留空时首次启动自动生成并存入 Redis；多实例共享 Redis 或需要轮换时显式配置
JWT_SECRET=
# 首次初始化超级管理员的密码（8 – 30 个字符）；留空则随机生成并写入 storage/initial-admin-password.txt
ADMIN_INITIAL_PASSWORD=
# 管理端访问路径
ADMIN_SERVE_ROOT=/admin
```

跨域来源只放行后台「网站地址（siteUrl）」或 `SITE_URL`；显式声明的开发 / 测试环境额外放行 `localhost`。

### 过期文件自动清理

```bash
# 服务启动约 5 分钟后第一次运行，之后每隔这么多小时运行一次；默认 24，0 关闭，有效值 1 – 168
FILE_ASSET_CLEANUP_INTERVAL_HOURS=24
```

清理条件与后台「私有文件」页的「执行过期清理」相同，说明见 [私有文件管理](/configuration/ai/private-file-management#auto-cleanup)。多实例部署只在一个实例上开启（其余设 `0`），且各实例必须共享同一份文件存储。

### 支付自动补单

```bash
# 每 2 分钟核对一次创建 24 小时内的待支付订单，查到已付款且订单号、金额、币种一致时入账；默认开启，false 关闭
PAYMENT_RECONCILE_ENABLED=true
```

只在服务开始监听后运行（数据库命令等不会启动它）。多实例部署只在一个实例上开启（其余设 `false`）。说明见 [支付参数](/configuration/payment/channel-config#reconcile)。

### 扩展包开关

`COMMERCE_PACK_ENABLED`、`CONTENT_SAFETY_PACK_ENABLED`、`WECHAT_PACK_ENABLED`、`EMAIL_PACK_ENABLED` / `PHONE_PACK_ENABLED` / `GITHUB_PACK_ENABLED`、`MODEL_*_PACK_ENABLED`、`STORAGE_*_PACK_ENABLED`，默认全部开启。取值与关闭后的影响见 [扩展包开关与裁剪](/deployment/packs)。

### 用户沙箱 {#sandbox}

```bash
SANDBOX_DRIVER=docker            # 生产固定 docker；local 只用于开发，生产默认拒绝
SANDBOX_DOCKER_SOCKET=/var/run/docker.sock
# 或用 TCP：SANDBOX_DOCKER_HOST=127.0.0.1 SANDBOX_DOCKER_PORT=2375
SANDBOX_DOCKER_RUNTIME=runsc     # 生产默认 runsc；未安装 gVisor 时创建容器会报错，不会静默退回 runc
SANDBOX_NAME_PREFIX=99agent-sbx- # 同一实例前缀只由一个 server 管理
SANDBOX_IMAGE=99agent/sandbox:latest
SANDBOX_USER_STORAGE=disk        # 登录用户每人一块持久磁盘；tmpfs 为临时工作区（须显式选择）
SANDBOX_USER_DISK_ROOT=/var/lib/99agent/sandbox-disks
SANDBOX_USER_DISK_COMMAND=/usr/local/sbin/99agent-sandbox-disk
SANDBOX_USER_DISK_MB=4096        # 每用户磁盘默认容量，套餐档位可覆盖
SANDBOX_USER_DISK_HOST_MIN_FREE_MB=10240  # 宿主剩余低于它时暂停所有用户磁盘的写入与执行
SANDBOX_MEMORY_MB=2048
SANDBOX_CPUS=1
SANDBOX_PIDS_LIMIT=256
SANDBOX_NETWORK_MODE=egress      # 公开 HTTP/HTTPS 代理；none 为无网
SANDBOX_EGRESS_IMAGE=99agent/sandbox-egress:latest
SANDBOX_EXEC_TIMEOUT_SEC=120
SANDBOX_EXEC_MAX_OUTPUT_KB=256
SANDBOX_IDLE_STOP_MINUTES=15
SANDBOX_WORKSPACE_MAX_MB=1024
SANDBOX_WORKSPACE_MAX_INODES=100000
SANDBOX_MIN_FREE_MB=16
SANDBOX_MIN_FREE_INODES=1000
SANDBOX_MAX_ACTIVE=4
SANDBOX_MAX_ACCOUNT_ACTIVE=2     # 只对访客生效：登录用户固定一台
SANDBOX_TOTAL_MEMORY_MB=4096
SANDBOX_VISITOR_ENABLED=true     # 访客是否可用沙箱工具；访客沙箱闲置即连同工作区删除，同一 IP 每小时最多签发 30 个访客会话
SANDBOX_DOCKER_INIT=true         # 用 docker-init 做容器 1 号进程回收僵尸进程；改动后已有容器需管理员删除重建
# 站点技能目录：每个含 SKILL.md 的子目录会在用户首次进入沙箱时复制到 /workspace/skills/<name>/
SANDBOX_SITE_SKILLS_DIR=
```

登录用户每人一台沙箱电脑，他的多个对话共用、可以同时执行；`/workspace` 是该用户独立的持久磁盘，写满即停（硬上限），闲置 15 分钟只回收容器，文件、装过的依赖和设置都保留，删除对话也不会删除它在电脑里的目录。访客每个对话一个临时容器，`/workspace` 为有界 tmpfs，闲置即删。默认每容器 2 GiB 内存、每用户磁盘 4 GiB；实例总容器内存额 4 GiB，因此默认最多同时接纳两台开机的环境。每个联网沙箱另外使用独立代理，宿主需各预留 128 MiB（两个共 256 MiB）。联网需要 Docker 28+、runsc 对 tmpfs 限制的支持和专用代理镜像；管理员另执行 `docker build -t 99agent/sandbox-egress:latest sandbox/egress/`，或明确设为无网。

用户磁盘由宿主助手 `sandbox/disk/99agent-sandbox-disk` 管理：每人一个稀疏 ext4 镜像，以 root 安装到 `/usr/local/sbin/`，并在 `/etc/99agent/sandbox-disk.conf` 写入与 `SANDBOX_USER_DISK_ROOT` 相同的 `DISK_ROOT`；server 以普通用户运行时用 sudoers 只放行 `ensure / release / usage / list-mounted` 四个子命令。生产环境没有配置磁盘又没有显式设 `SANDBOX_USER_STORAGE=tmpfs` 时拒绝启动。每天用 `99agent-sandbox-disk backup` 做本机备份，`restore` 按用户恢复。安装、sudoers、备份恢复、故障排查与真实隔离验收详见仓库 `sandbox/README.md`。

容器使用不可变镜像 ID，复用前核对当前版本、标签、用户、运行时、网络、内存 / CPU / PID、只读根目录及挂载。配置不一致或没有当前标签会拒绝使用，不自动迁移、替换或删除；请管理员核对原因并自行处理。生产禁止 local 驱动和非 runsc 运行时；标准 ISDEV=false、NODE_ENV=production 或未明确选择开发/测试时都会应用这项保护。

用户磁盘的容量就是文件系统大小，写满返回「磁盘已满」；满额或超出套餐容量时拒绝写文件和导入附件，命令仍可运行以便删除文件。宿主剩余空间低于 `SANDBOX_USER_DISK_HOST_MIN_FREE_MB` 时所有用户磁盘暂停写入与执行，请为宿主磁盘配置告警。临时工作区的字节 / inode 额度是写操作前后的软检查，硬上限由 tmpfs 保证；达到额度、水位不足或观测失败时拒绝写入，但保留读取、停止和显式账户清理。

### 外部接入

MCP 服务器（`MCP_*`）、进程外渠道服务令牌（`CHANNEL_SERVICE_TOKEN`）与垂直包导入见 [外部接入](/deployment/integrations)。

## 反向代理 {#reverse-proxy}

用 Nginx 把域名转发到后端进程即可，用户端、管理端、接口与文件都在同一个端口上。事件推送使用 WebSocket，需要转发 Upgrade 头；上传体积按需调整。

```nginx
server {
    listen 443 ssl http2;
    server_name agent.example.com;
    # ssl_certificate / ssl_certificate_key ...

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:9520;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 600s;
    }
}
```

代理生效后，到后台「基础信息」把网站地址填成 `https://agent.example.com`。

后端只信任来自本机的代理，并从 `X-Forwarded-For` 的右侧取 nginx 记录的真实地址，客户端自带的伪造值不会被采用。nginx 前面还有 CDN 或负载均衡时，在 `server/.env` 的 `TRUSTED_PROXY_CIDRS` 写上它们的回源地址段（逗号分隔，支持 IPv4 与 IPv6），否则所有用户都会被识别成 CDN 的地址。

用户端与管理端打包后的文件名带内容哈希，后端会给这些文件设一年的不可变缓存，入口页每次向服务器确认；反向代理原样透传后端的缓存头即可，不要在代理层另设缓存规则。

## 更新升级 {#upgrade}

1. 备份数据库、`server/.env`、`server/public/file`、`server/storage` 与自备的敏感词库 `server/data/vocabularies/*.txt`。
2. 更新代码，阅读 [更新日志](/changelog) 里的「升级须知」。
3. 重新执行 `./dev-build.sh`，再到 `server/` 执行 `pnpm install && pnpm build`。
4. 执行 `node dist/main db:check`。当前版本只提供全新项目基线；结构或启用模块集合不同会拒绝启动，不支持在旧库上直接升级，也不会自动增删表列。请先在独立空库验证当前安装，保留原库与备份。
5. `pm2 restart 99Agent`。

## 下一步

- [扩展包开关与裁剪](/deployment/packs)：决定装哪些包
- [外部接入](/deployment/integrations)：MCP、渠道服务、垂直包
- [常见问题](/deployment/faq)
- [后台配置](/configuration/)：服务跑起来后的后台配置顺序

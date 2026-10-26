# 用户沙箱与文件资产

登录用户每人一台沙箱电脑，他的多个对话共用、可以同时执行；`/workspace` 是该用户独立的持久磁盘（带硬容量上限，见[用户磁盘](#用户磁盘)），闲置时只回收容器，文件、装过的依赖和设置都保留。访客每个对话一个临时容器，`/workspace` 是有容量上限的 tmpfs，闲置即删。上传、成果和用户选择保留的技能另以私有文件资产保存。模型使用 `read / write / edit / bash / ls` 五个原语。

## 宿主机要求

- Linux x86_64 / arm64，Docker Engine **28.0.0 或更高**；建议使用仍受维护的补丁版本。
- 注册 gVisor `runsc`，并实测该版本接受 tmpfs 的 `size`、`nr_inodes` 和非 root uid/gid。配置不支持时修复运行环境，不能删掉限制继续运行。
- 一个 server 管理一个 `SANDBOX_NAME_PREFIX`。主应用仍在宿主机运行 Node.js，Docker 用于沙箱和出口代理。
- 登录用户的持久磁盘需要 server 与 Docker 在同一宿主（本机 Unix socket）、内核 loop 设备，以及 e2fsprogs（`mkfs.ext4` / `e2fsck` / `resize2fs` / `dumpe2fs`）和 util-linux（`mount` / `losetup` / `findmnt` / `mountpoint` / `flock`）。Docker 须为官方安装包（snap 版 Docker 看不到宿主挂载）。
- server 需要受保护的 Docker API 访问权限；推荐本机 Unix socket。这个权限属于平台控制面，不能传给沙箱或代理。

安装说明：[gVisor 安装](https://gvisor.dev/docs/user_guide/install/)、[Docker isolated 网关](https://docs.docker.com/engine/network/port-publishing/#gateway-modes)、[tmpfs 语义](https://docs.docker.com/engine/storage/tmpfs/)。

### gVisor 的 tmpfs inode 限制

官方 `release-20260921.0` 已实现 tmpfs inode 配额，但 OCI 挂载选项白名单没有传递 `nr_inodes`，仅看 Docker inspect 会误判限制已生效。该版本需要应用本目录 [最小补丁](./patches/runsc-tmpfs-inodes.patch)：只向 `runsc/boot/vfs.go` 的 `tmpfsAllowedData` 增加该选项，不改变执行隔离或字节限制。

在独立的官方 gVisor `release-20260921.0` 源码 checkout（上游提交 `26f3455a4cb9a377354c33aeac049080a077c79c`）中，先核对 `git rev-parse HEAD`，再执行 `git apply --check /absolute/path/runsc-tmpfs-inodes.patch` 和 `git apply /absolute/path/runsc-tmpfs-inodes.patch`；用 `git diff --check` 与 `git diff -- runsc/boot/vfs.go` 确认只有该白名单的一行修改，然后按[官方构建说明](https://github.com/google/gvisor/tree/release-20260921.0#installing-from-source)使用 Bazel 8.3.1 构建 `//debian:gvisor-release-tar-bz2`，或 `make release-tarball DESTINATION=bin/`。安装必须解压整个发行包，包含同一构建的 `runsc`、shim 和 `gvisor-bin/` sidecars；保留官方原版目录供回滚，并记录源码版本、补丁和完整产物 SHA256。不可只替换单个二进制或混用 sidecars。

本次固定工具链还需要单独的 [nogo 构建适配补丁](./patches/runsc-build-nogo.patch)：修正 Bazel File 到 Go SDK `go.mod` 的路径传递与多行版本解析，版本解析失败立即退出；仅排除 rules_go v0.57.0 已从 Go 1.26.3 源码清单移除的七个测试辅助包（补丁中逐项列出），其他归档缺源码继续报错。该补丁不进入 runsc 运行时代码，也不关闭静态分析。按同样方式先 `git apply --check` 再应用，用 `git diff -- tools/nogo/defs.bzl tools/nogo/check/build.go tools/nogo/cli/cli.go` 复核三处文件；构建 `//tools/nogo:stdlib` 和完整发行包，遇到其他缺包须停止排查，不扩大跳过范围。记录两份补丁的 SHA256。

注册到隔离的测试 runtime 后，以非 root/只读系统/去除 capabilities 的容器验证 2 MiB、64 inode 的小工作区：超过字节或文件数均须返回 `ENOSPC`，`statvfs` 和 `/proc/mounts` 应显示生效限额。通过后再将 `runsc` 指向完整产物目录并重复实际沙箱验收。其他版本也须执行同样的真机验证；不要删除 inode 限制或用内存 OOM 代替。

## 构建与配置

以下命令由管理员在部署宿主机上执行。

```bash
docker build -t 99agent/sandbox:latest sandbox/
docker build -t 99agent/sandbox-egress:latest sandbox/egress/
# 国内部署可按所在地选用可达的公网 DNS，仅影响代理镜像
# docker build --build-arg EGRESS_DNS_SERVERS=223.5.5.5,119.29.29.29 -t 99agent/sandbox-egress:latest sandbox/egress/
```

基础镜像包含 Python、Node、git、文档/图像/音视频工具与 Tectonic。普通会话默认采用非 root 用户、只读系统、去除全部 capabilities 和 `no-new-privileges`。`/workspace` 显式允许执行，用于 Python 虚拟环境、技能程序和本地扩展库；仍保留 `nosuid,nodev`，`/tmp` 保持 `noexec`。

```dotenv
SANDBOX_DRIVER=docker
SANDBOX_DOCKER_SOCKET=/var/run/docker.sock
SANDBOX_DOCKER_RUNTIME=runsc
SANDBOX_NAME_PREFIX=99agent-sbx-
SANDBOX_USER_STORAGE=disk
SANDBOX_USER_DISK_ROOT=/var/lib/99agent/sandbox-disks
SANDBOX_USER_DISK_COMMAND=/usr/local/sbin/99agent-sandbox-disk
SANDBOX_USER_DISK_MB=4096
SANDBOX_USER_DISK_HOST_MIN_FREE_MB=10240
SANDBOX_IMAGE=99agent/sandbox:latest
SANDBOX_EGRESS_IMAGE=99agent/sandbox-egress:latest
SANDBOX_NETWORK_MODE=egress
SANDBOX_EGRESS_ALLOW_HOSTS=
SANDBOX_EGRESS_DENY_HOSTS=
SANDBOX_MEMORY_MB=2048
SANDBOX_CPUS=1
SANDBOX_PIDS_LIMIT=256
SANDBOX_EXEC_TIMEOUT_SEC=120
SANDBOX_EXEC_MAX_OUTPUT_KB=256
SANDBOX_IDLE_STOP_MINUTES=15
SANDBOX_WORKSPACE_MAX_MB=1024
SANDBOX_WORKSPACE_MAX_INODES=100000
SANDBOX_MIN_FREE_MB=16
SANDBOX_MIN_FREE_INODES=1000
SANDBOX_MAX_ACTIVE=4
SANDBOX_MAX_ACCOUNT_ACTIVE=2
SANDBOX_TOTAL_MEMORY_MB=4096
SANDBOX_PENDING_RETENTION_HOURS=24
SANDBOX_VISITOR_ENABLED=true
SANDBOX_DOCKER_INIT=true
SANDBOX_SITE_SKILLS_DIR=
```

### 容量与生命周期

- 登录用户：一人一台，工作区是他的持久磁盘，默认 `SANDBOX_USER_DISK_MB`（4096 MiB），商业包套餐档位「磁盘（MB）」可按方案覆盖。磁盘不占内存，所以内存可以比磁盘小得多。多个对话共用这台机器的内存和 CPU，同一对话内的工具按序执行，不同对话并发；多个对话同时修改同一文件时，`write` / `edit` 串行，`bash` 里的并发改写与一台真实电脑一样由使用者自己协调。
- 访客与未启用持久磁盘的站点：`/workspace` 为 tmpfs，默认最大 1 GiB / 100000 inode，实际使用计入内存。
- `/tmp` 最大 128 MiB，`/dev/shm` 最大 16 MiB。容器内存和 swap 总额相同，不允许额外 swap 配额。宿主内存/交换行为仍需实测。
- 准入同时受实例活跃数、每账号活跃数和实例容器内存总额约束（登录用户固定一台，每账号活跃数只对访客有意义）。按默认值，2 个 2 GiB 沙箱就达到 4 GiB 总额。每个联网沙箱的独立代理额外限制 128 MiB（默认两个沙箱另需预留 256 MiB；四个则预留 512 MiB）；宿主还需留给 Node、数据库、Redis 和运行时的余量。
- 整轮租约覆盖模型思考间隙，读取流和执行也阻止普通 idle 回收。闲置 15 分钟后销毁容器和临时网络：登录用户的磁盘卸载后保留，下次开机秒级恢复；访客的临时工作区随之删除，下一次从私有资产恢复需要的文件。
- 访客的临时工作区满额时宿主拒绝继续导入/写入，底层保留清理和成果回收能力，实际写入由 tmpfs/cgroup 限制；若开轮时已满额，本轮仅开放 read/ls 与 `bash(recover_outputs: true)` 取回已登记成果，新建对话即换一台临时环境。登录用户（持久磁盘，或 `SANDBOX_USER_STORAGE=tmpfs` 的临时工作区）满额或超出套餐容量时不整轮只读：拒绝写文件与导入附件，命令仍可运行以便删除文件——新建对话用的是同一台机器，不能靠它恢复。容量观测失效或宿主低于低水位时拒绝执行和写入，文件读取仍可用。
- 临时工作区的 `out/pending` 有尚未保存的文件时延迟普通回收，恢复窗口最多延续至容器创建后的 24 小时。失败环境仍计入资源额度。超出窗口后临时内容会被回收；OOM、宿主崩溃或外部删容器也会丢失尚未成为 active 资产的内容。持久磁盘上的待交付文件随盘保留，容器换代后在 24 小时登记期内仍可重试交付，超期后留在 `pending/` 目录里。
- schema 3 不接管旧 schema 容器/网络，不删除旧持久卷。旧卷需要管理员另行列清单、备份并明确授权后处理。升级到「每用户一台」后，登录用户旧的每对话临时容器在 server 启动时回收（其中尚未保存的临时成果随之丢失），访客容器不受影响。

### 网络边界

`egress` 使用**每台沙箱独立**的 internal + isolated bridge（登录用户每人一套，访客每对话一套），仅连接该沙箱与它自己的代理。每个代理另接独立出口 bridge；两网在代理首次启动前配置齐全，避免 gVisor 热接网卡不可见的问题，无公开端口、Docker socket 或宿主文件挂载。沙箱 DNS 外发关闭，代理地址为会话网内 IP。

代理通过指定公网 DNS 解析 A 记录，避免 gVisor 无法访问 Docker 回环 DNS 的问题。镜像构建参数 `EGRESS_DNS_SERVERS` 默认 `1.1.1.1,8.8.8.8`，可配置最多三个公网 IPv4；非法配置拒绝启动，解析失败拒绝请求，不回退系统解析。所选 DNS 服务会看到被查询的域名。所有返回地址仍须通过公网与 deny list 校验，沙箱本身不能直接使用该 DNS。

代理支持公开 IPv4 的 HTTP 80 和 HTTPS CONNECT 443，拒绝私网、回环、link-local、metadata 和保留地址；DNS 在代理解析后固定到已验证 IP。直连、IPv6、SSH git 和任意端口不开放。不支持代理的程序无法联网。代理有连接、时长和流量上限，TLS 隧道不解密。

沙箱里的命令访问自己的回环地址（`localhost`、`127.0.0.1`、`::1`）不经代理：每条命令的环境带 `NO_PROXY` / `no_proxy` 回环例外，Agent 在沙箱里起的本地服务可以直接用 curl 等工具自测。回环只在沙箱自己的网络命名空间里，这个例外不放宽任何出口限制；容器创建时写入的 `NO_PROXY` 仍为空（创建参数参与容器指纹，不随升级改动）。

`SANDBOX_EGRESS_ALLOW_HOSTS` 为可选逗号分隔域名白名单，域名同时涵盖子域名；`SANDBOX_EGRESS_DENY_HOSTS` 用于阻止域名或公开 IPv4。部署时应加入本站、同宿主服务和内网经 NAT 暴露的公网地址。它们是部署相关地址，平台不能自动推断。联网模式缺镜像/缺 isolated 支持时失败关闭；管理员可明确设 `SANDBOX_NETWORK_MODE=none`。

**联网代码能发送当前已载入的任务文件。** 运行未知 skill 或依赖时，要根据资料敏感性选择无网或域名白名单；网络隔离不等于阻止公网数据外传。

## 用户磁盘

登录用户的 `/workspace` 是一块独立的 ext4 文件系统：每人一个稀疏镜像文件，由宿主助手 `sandbox/disk/99agent-sandbox-disk` 以 loop 方式挂载，容器只绑定其中的 `workspace/` 子目录。

- **隔离**：每个站点（`SANDBOX_NAME_PREFIX`）在磁盘根下有独立子目录，磁盘 key 由站点前缀与账号共同算出，同一宿主上的多个站点互不可见、互不清理。磁盘根、镜像和挂载点只有 root 可达；每个容器只挂自己的文件系统，并以 `nosuid,nodev` 挂载。容器用 Docker `Mounts` 绑定，源路径不存在时直接报错，不会在宿主上自动建一个没有配额的目录；复用前核对绑定源、目标、读写属性和传播方式，多一个或少一个挂载都拒绝使用。镜像内容只经宿主 ext4 驱动写入，用户接触不到原始块设备。
- **容量**：文件系统大小就是硬上限，写满返回 ENOSPC；执行与写入前读取文件系统统计（不逐个扫描文件）。磁盘满或超出套餐容量时拒绝写文件和导入附件，但命令仍可运行，便于删除文件；盘内删除的空间通过 `discard` 归还宿主。
- **宿主低水位**：镜像是稀疏的，所有用户的容量总和可以超过宿主剩余空间。宿主剩余低于 `SANDBOX_USER_DISK_HOST_MIN_FREE_MB`（默认 10 GiB）时，所有用户磁盘暂停写入与执行，只能读取；助手在剩余低于配置的 `HOST_MIN_FREE_MB` 时拒绝新建、扩容、备份与恢复。低水位之间仍有并发写满的风险：水位应不小于「最大套餐磁盘 × 同时写入的人数」，并对宿主磁盘配置告警。
- **扩容与降档**：套餐磁盘调大后，在该用户下次开机时离线扩容。调小不会缩小已分配的磁盘，只按新容量拒绝写文件和导入附件，命令仍能写到原有磁盘大小；需要真正收回空间时由管理员处理。
- **删除**：应用内任何自动流程（闲置回收、删除对话、策略不一致）都不会删除用户磁盘；删除对话时该对话在电脑里的目录保留。删除磁盘只能由管理员执行助手的 `remove`。

### 安装

以下命令由管理员在部署宿主机上执行。

```bash
sudo install -o root -g root -m 0755 sandbox/disk/99agent-sandbox-disk /usr/local/sbin/99agent-sandbox-disk
sudo install -d -o root -g root -m 0755 /etc/99agent
sudo tee /etc/99agent/sandbox-disk.conf > /dev/null <<'EOF'
DISK_ROOT=/var/lib/99agent/sandbox-disks
BACKUP_DIR=/var/backups/99agent-sandbox-disks
BACKUP_KEEP=3
BACKUP_MAX_AGE_HOURS=48
HOST_MIN_FREE_MB=10240
EOF
sudo chmod 0644 /etc/99agent/sandbox-disk.conf
```

配置文件必须属于 root 且他人不可写；`DISK_ROOT` 必须与 server 的 `SANDBOX_USER_DISK_ROOT` 相同，从根到它的每一级目录都必须属于 root、他人不可写。助手只接受白名单字符的站点名、32 位十六进制 key 和整数容量，不读取调用方环境变量。

server 以 root 运行时直接调用助手；以普通用户运行时经 `sudo -n` 调用，用 `visudo -f /etc/sudoers.d/99agent-sandbox-disk` 只放行运行期需要的四个子命令（把 `agent` 换成 server 的运行用户）：

```text
agent ALL=(root) NOPASSWD: /usr/local/sbin/99agent-sandbox-disk ensure *, /usr/local/sbin/99agent-sandbox-disk release *, /usr/local/sbin/99agent-sandbox-disk usage *, /usr/local/sbin/99agent-sandbox-disk list-mounted *
```

`remove`、`backup`、`restore` 不要放进 sudoers，只由管理员以 root 执行。server 与 PM2 不能运行在私有挂载命名空间里（例如 systemd 的 `PrivateMounts=`、`ProtectSystem=`、`PrivateTmp=`）：助手会核对自己与宿主 PID 1 在同一挂载命名空间，否则拒绝挂载。gVisor 不能配置覆盖绑定挂载的 overlay（例如 `--overlay2=all:*`），否则写入不会落到用户磁盘；按下方验收清单确认。

没有安装条件的开发机或测试站点设 `SANDBOX_USER_STORAGE=tmpfs`：登录用户仍一人一台，但工作区是临时 tmpfs。生产环境未设置 `SANDBOX_USER_DISK_ROOT` 又没有显式选择 tmpfs 时，server 拒绝启动。

### 备份与恢复

同盘本机备份：`backup` 对当前没有在使用、且自上次备份后有变化的镜像做稀疏整盘复制，写入 `BACKUP_DIR/<站点>/<key>/<UTC 时间>.img`，每个 key 保留 `BACKUP_KEEP` 份，新备份写完才轮换旧备份。正在使用的磁盘跳过，下次再备；最近一次备份超过 `BACKUP_MAX_AGE_HOURS` 或从未备份的磁盘会输出 `stale` 行并以退出码 3 结束，便于监控告警。

```bash
# /etc/cron.d/99agent-sandbox-disk：每天凌晨备份
17 3 * * * root /usr/local/sbin/99agent-sandbox-disk backup >> /var/log/99agent-sandbox-disk-backup.log 2>&1
```

同盘备份只防误删和文件系统损坏，不防整盘故障；需要时再把 `BACKUP_DIR` 同步到其他机器或对象存储。

恢复某个用户的磁盘：

```bash
key="$(/usr/local/sbin/99agent-sandbox-disk key 99agent-sbx- user-42)"   # 站点前缀 + 账号
sudo /usr/local/sbin/99agent-sandbox-disk list-backups 99agent-sbx- "$key"
# 确认该用户没有进行中的任务，删除他的容器并卸载磁盘
# 只选沙箱容器（label 99agent.sandbox=true），不含同一用户的出口代理容器
docker rm -f "$(docker ps -aq --filter label=99agent.sandbox=true --filter label=99agent.sandbox.owner=user-42)"
sudo /usr/local/sbin/99agent-sandbox-disk release 99agent-sbx- "$key"
sudo /usr/local/sbin/99agent-sandbox-disk restore 99agent-sbx- "$key" 20261001T031700Z.img
```

`restore` 先完整复制备份并做只读文件系统检查，再原子替换镜像，替换前的镜像保留为 `<key>.img.before-restore`（下次恢复时覆盖）。任何一步失败，原镜像保持不变。删除用户磁盘及其备份：`sudo 99agent-sandbox-disk remove <站点> <key>`，不可撤销。

### 故障排查

| 现象 | 处理 |
| --- | --- |
| 「磁盘仍被占用」 | 镜像仍关联 loop 设备（文件系统可能还在某个容器里使用）。`losetup -j <镜像>` 查看；确认没有容器使用后 `losetup -d <设备>` |
| 「需要管理员修复」 | 自动检查发现文件系统错误。先备份镜像，再 `e2fsck -f <镜像>` 人工修复 |
| 「存在多个硬链接」 | 上次恢复在替换前中断。核对 `<key>.img` 与 `<key>.img.before-restore` 后删除多余的链接 |
| 「宿主存储空间不足」 | 宿主剩余低于低水位，所有用户磁盘暂停写入与执行。清理宿主空间或扩容后自动恢复 |
| 「不在宿主挂载命名空间」 | server 运行在私有挂载命名空间里，按上文调整 systemd / PM2 配置 |

## 文件与技能

| 路径/引用 | 用途 |
| --- | --- |
| `in/<turnId>/` | 当前轮附件，自动载入 |
| `in/files/<文件 ID 的 SHA-256 前 16 位>/` | `read(fileRef)` 重新鉴权后按需载入历史文件（目录与文件名都不含文件资产 ID，模型拿到的路径可以直接再读） |
| `out/<turnId>/` | 要交付和长期保留的成果、可编辑源文件；bash 中可用 `$AGENT_OUTPUT_DIR`（绝对路径，命令里切换目录后照样可用） |
| `pending/<turnId>/` | 尚未完成保存或归档的成果 |
| `artifacts/<turnId>/<sha256>/` | 当前环境中的已保存副本；长期身份是 fileId |
| `skills/<name>/` | 站点或用户技能源码 |

历史文件只可从本对话受信任的 fileRef/附件目录恢复，再核对归属、下载权限、状态、有效期和大小；模型不能凭任意 fileId 遍历账号文件。单轮导入有 200 MiB 累计上限。成果单文件最多 100 MiB，每轮最多 20 个 / 200 MiB。失败后可以在同对话下一轮重试交付，保留原 owner/message/turn/source/hash 身份。

私有上传、成果和技能共用文件资产额度：默认用户 1024 MiB、访客 200 MiB，可在后台配置。processing 和待清理失败对象占用额度；数据库账号锁覆盖额度检查与对象保存。每个 server 的写入队列最多 4 项/200 MiB，繁忙时请求重试。已有文件保留期沿用后台配置；技能选择保留后不自动到期，但仍计入额度。

### 安装依赖与保存技能

```bash
python3 -m venv --system-site-packages /workspace/.venv
/workspace/.venv/bin/pip install requests
npm install --prefix /workspace/my-tool package-name
git clone https://github.com/example/skill.git /workspace/skills/my-skill
```

以上为使用示例，仓库/包名需要替换。登录用户的依赖、缓存和技能都在他的持久磁盘上保留（基础镜像升级后，基于旧系统 Python 建的虚拟环境可能需要重建）；访客的依赖、缓存和临时技能随环境回收。不开放 sudo/apt，需要系统库时更新基础镜像。

用户要求保留技能时，模型可调用 `bash({save_skill: "my-skill"})`；删除保存副本使用 `bash({delete_skill: "my-skill"})`。登录用户的技能本来就在持久磁盘上，保存副本相当于磁盘之外的备份：磁盘上缺少该技能目录时（例如新磁盘）才恢复，已有的不覆盖。每用户最多 20 个技能，每包 100 个普通源码文件/2 MiB，单文件 256 KiB；必须有 `SKILL.md`。不收链接、设备、隐藏目录、凭据路径、任务目录和依赖缓存。保存新版本成功后再清理旧版本，内容按 hash 校验；恢复只复制源码，不自动执行安装脚本。访客仅提供临时技能使用。

## 部署验收

CI 的 smoke 工作流（`.github/workflows/smoke.yml` 的 gvisor job）会在 GitHub 的 Linux runner 上安装 runsc 与用户磁盘助手、构建本镜像，以生产模式和 `SANDBOX_NETWORK_MODE=none` 跑一轮真实的 bash 调用、产物回收与下载，确认工具运行在 gVisor 内核里、登录用户的 `/workspace` 绑定在其持久磁盘上，并在删除容器、重新挂载后核对产物仍在盘上、备份可生成。它不覆盖硬容量、联网代理与多账号并发，这些仍须上线前在真实宿主机上按下面的清单逐项验收。使用隔离的测试账号和合成文件，不使用真实用户资料。

### 用户磁盘

1. 安装助手与配置文件，非 root 运行时配置 sudoers；`sudo -n 99agent-sandbox-disk list-mounted <站点>` 以 server 运行用户执行成功，`remove` / `backup` / `restore` 被 sudo 拒绝。
2. 两个测试账号各自开机：各自一块磁盘，互相看不到对方文件；`docker inspect` 只有自己磁盘的一个绑定挂载，传播方式为 `rprivate`；磁盘根与镜像在宿主上只有 root 可读。
3. 同一账号开两个对话并发执行命令：互不排队；两个对话同时 `edit` 同一文件，两处修改都保留。
4. 在沙箱里安装一个 pip 包、写一个文件，等闲置回收（或重启 server）后再开对话：文件和包仍在，`chats/<对话 id>/` 目录存在；删除一个对话后，它的目录仍在。
5. 用小容量档位写满磁盘：返回 ENOSPC；写文件工具提示磁盘已满，命令仍能运行，删文件后恢复写入；删除后宿主上镜像的实际占用下降（discard 生效）。写入大于容器内存的文件，观察容器内存不会因此 OOM。
6. 把宿主低水位临时调高到超过剩余空间：所有用户磁盘暂停写入与执行，调回后恢复。
7. 调大套餐磁盘：运行中的机器不变，闲置回收后下次开机容量变大；调小：已有磁盘不缩小，超出新容量后拒绝写文件。
8. 宿主重启（或强制删容器 + 停 server）后：server 启动回收停止的容器、卸载遗留挂载，磁盘内容完整；`e2fsck` 在下次开机时自动检查。
9. 执行 `backup` 生成备份；`restore` 到旧版本后内容回到备份时刻，`.before-restore` 保留替换前内容；在磁盘挂载中执行 `restore` 被拒绝。
10. 访客仍为每对话临时 tmpfs，闲置即删；`SANDBOX_USER_STORAGE=tmpfs` 时登录用户也是临时工作区；生产缺少磁盘配置时 server 拒绝启动。

### 环境和容量

1. 记录 Docker Engine/API 与 runsc 版本；构建 sandbox 和 egress 两镜像。确认 rootfs readonly、runsc、uid 1000、capdrop、no-new-privileges、memory=memoryswap、PID/CPU 上限。
2. inspect /workspace tmpfs 的 size/nr_inodes/uid/gid；写入超过小测试配额和创建过量小文件应返回 ENOSPC；宿主磁盘、容器 memory.stat 与 OOM 事件须一起观察。不要仅看 du 或 Mock 参数。
3. 临时工作区（访客）开轮时满额会进入只读；验证 read/ls 和 `bash(recover_outputs: true)` 仍可取回上一轮待交付文件。回收不移动临时文件；管理员释放容量或新建对话后再写入。持久磁盘满额时按「用户磁盘」第 5 项验收：命令可运行、删文件后恢复写入。用小测试配额验证，不在真实服务器填满磁盘。
4. 连续会话和多账号并发不能越过账号活跃数/实例总内存额；模型思考超过 idle 时间不能被清理。服务重启后容量计数和闲置回收仍正确。

### 网络和依赖

1. 同一登录用户的多个对话共用一台沙箱和一套 isolated 网络与代理；两个不同用户（以及同一访客的两个对话）各自创建独立的网络和代理，inspect 端点仅为该沙箱容器和它的代理。各代理客体内必须看见首次启动时的两张网卡，只额外连接自己的出口网络。新增或回收另一台沙箱不得重启本沙箱的代理；回收后确认其他沙箱仍能联网。除持久沙箱的那一个用户磁盘绑定外，无其他端点、挂载或 published port。
2. 记录镜像内 `node -v` / `npm -v` / Python 版本与目标包 engines。代理模式下 curl HTTPS、pip 在 venv 内安装选定固定版本公开包、npm 工作区安装、git HTTPS clone 应成功；none 模式应失败。基础镜像沿用系统 Node 包，不承诺所有最新依赖；需要更高 Node 或系统库的技能应先更新基础镜像并在 CI 验证。
3. 删除 HTTP(S)_PROXY/ALL_PROXY 后直连公网 IP、私网、metadata、host gateway、另一会话、IPv6 和直连 DNS 均应失败。代理停止后不得自动退回直接访问。
4. 通过代理访问 127.0.0.1、169.254.169.254、RFC1918、IPv4 特殊编码、IPv6、非 80/443、返回私网 DNS 的测试域名应失败（验证代理本身时用 `curl --proxy "$HTTP_PROXY" --noproxy ''` 绕过回环例外）。沙箱内先起一个本地服务（如 `python3 -m http.server 8765 &`），再 `curl http://127.0.0.1:8765` 与 `curl http://localhost:8765` 应直接成功。
5. 配置本站/同宿主服务的公网域名及 NAT 地址 deny list，验证无法回连管理 API；allow list 模式下非允许目标不能访问。CONNECT 只限制目标，不能声称阻止全部公网外传。

### 文件与恢复

1. 本轮上传后处理并交付；等待环境回收，继续同对话，以 fileRef 恢复原文件和源文件继续编辑。另一账号以及另一对话未引用的 fileId 必须拒绝。
2. 删除、过期、禁下载文件不能恢复；软链接、目录穿越和异常文件包不能交付到其他目录。
3. 让对象存储短暂失败，确认 pending 保留、没有成功文件卡；恢复存储，在下一轮重试，确认使用原交付 fileId、无重复额度。重启 server 后重复该步骤。
4. 临时环境（访客）中未成功保存的内容最多保留到容器创建后 24h；用小测试窗口验证最终清理。OOM/外部停止容器时只有已成为 active 文件资产的内容保证存在。持久磁盘上的待交付文件随盘保留，容器换代后 24h 登记期内仍可重试交付。
5. 多实例同时上传/生成/保存技能争抢最后额度，只允许额度内请求成功；断开 MySQL 锁连接和对象写失败后，检查 processing/failed 与对象清理状态。不得出现无记录对象或提前释放未清理空间。
6. 保存/更新/删除私有技能；新磁盘或临时环境恢复最新源码（持久磁盘上已有的技能目录不覆盖），不自动运行脚本；另一账号不可见。带 symlink/hardlink、凭据路径、缺失 SKILL.md、过量文件/字节或篡改 hash 的包拒绝。
7. 删除访客的测试会话后停止其临时环境；删除登录用户的对话后，他的沙箱继续运行、该对话目录保留，且该对话不能再调用工具。模拟一次 Docker 删除失败，确认后续回收重试；模拟一次用户磁盘卸载失败，确认闲置回收在该用户没有沙箱时重试卸载。分别注入 create/start/初始化失败，确认回滚受管会话容器/网络；模拟进程中断留下孤儿网络，重启发现只能清理标签、名称及端点均符合本站基线的资源。

记录每项结果、版本与有限截图/指标，避免记录 token、完整私有 URL 或真实文件内容。全部通过后才算完成实际部署验收。

本地文件资产存储应使用独立分区/卷并配置容量告警；对象存储应配置预算和生命周期。账号逻辑额度只限制分配量，不能替代存储系统的总容量边界。

### 本地文件资产容量

公开与私有本地文件存储写入前检查目标分区，默认预留 1024 MB / 1000 inode（`FILE_ASSET_LOCAL_MIN_FREE_MB` / `FILE_ASSET_LOCAL_MIN_FREE_INODES`）。观测失败拒绝写入；同目录临时文件完整写入并同步后才原子发布，清理也覆盖异常残留。此保护配合账号额度使用；多进程共享分区仍应配置独立数据分区、容量监控和文件系统硬配额。

### 满额或失败后的成果取回

让 Agent 调用 `bash(recover_outputs: true)` 可重试当前对话已登记的 out/pending 内容，使用原 message/turn/fileId，返回可下载资产与文件引用。此入口不执行模型命令、不在临时工作区新建或搬移文件，满额或容量观测降级时仍可用；存储失败保留控制记录与源内容。临时文件仍按既定恢复窗口回收。创建容器失败会回滚本次资源；启动发现会验证并清理没有对应会话容器的本站孤儿网络。

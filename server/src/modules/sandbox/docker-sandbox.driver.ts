import { SandboxOperationError } from './sandbox.port';
/**
 * DockerSandboxDriver — 沙箱容器实现（生产用 gVisor runtime）
 *
 * - 容器：镜像固定、非 root 用户、CapDrop ALL、no-new-privileges、默认无网、内存 / CPU / 进程数上限
 * - 工作区：配置了用户磁盘时，登录用户的 /workspace 绑定其独立持久磁盘（sandbox-disk.ts）；
 *   访客与未配置磁盘时为有界 tmpfs。文件资产独立持久化
 * - 执行：docker exec + 超时进程组封装（见 exec-support.ts），输出流式回调
 * - 文件：读写走 docker exec 的 stdin / stdout 流，二进制安全；目录列举走 find
 *
 * 文件内容不能走 Docker 归档接口：容器根文件系统只读（putArchive 被守护进程直接拒绝），
 * 工作区又是 tmpfs 挂载（getArchive 在容器镜像层里找不到这些路径）。
 */

import Docker = require('dockerode');
import { Logger } from '@nestjs/common';
import { Duplex, PassThrough, Readable, Writable } from 'node:stream';
import { FILE_TRANSFER_SCRIPT } from './file-transfer-script';
import {
  DEFAULT_EXEC_TIMEOUT_SEC,
  DEFAULT_MAX_OUTPUT_BYTES,
  EXEC_CANCELLED,
  killCommand,
  newExecId,
  OutputCollector,
  TIMEOUT_EXIT_CODE,
  wrapCommand,
} from './exec-support';
import {
  resolveWorkspacePath,
  SANDBOX_ARTIFACT_DIR,
  SANDBOX_INPUT_DIR,
  SANDBOX_OUTPUT_DIR,
  SANDBOX_SKILLS_DIR,
  SANDBOX_WORKSPACE,
  SANDBOX_WORKSPACE_SCHEMA,
  sandboxOwnerKey,
  shellQuote,
  type SandboxDriver,
  type SandboxExecOptions,
  type SandboxExecResult,
  type SandboxFileEntry,
  type SandboxHandle,
  type SandboxListOptions,
  type SandboxReadOptions,
  type SandboxResources,
  type SandboxSpec,
  type SandboxState,
  type SandboxWriteOptions,
  type SandboxResourceUsage,
} from './sandbox.port';
import {
  assertContainerPolicy,
  containerFingerprint,
  CONTAINER_LABEL,
  platformLabels,
  POLICY_MISMATCH,
} from './container-policy';
import { DockerEgress } from './docker-egress';
import type { SandboxDiskManager } from './sandbox-disk';
import { parseWorkspaceUsage, WORKSPACE_USAGE_SCRIPT } from './workspace-usage';

/** 持久磁盘容器的存储标签；临时容器不带，保持与旧容器配置一致 */
const STORAGE_LABEL = `${CONTAINER_LABEL}.storage`;

export interface DockerSandboxDriverOptions {
  egressImage?: string;
  egressAllowHosts?: string;
  egressDenyHosts?: string;
  socketPath?: string;
  host?: string;
  port?: number;
  /** 容器运行时；生产 runsc（gVisor），本机开发留空用默认 */
  runtime?: string;
  image: string;
  /** 容器与卷的名称前缀 */
  namePrefix: string;
  /** 容器内用户，镜像里必须存在 */
  user: string;
  /** 用 docker-init（tini）做 1 号进程回收僵尸进程；默认开启，SANDBOX_DOCKER_INIT=false 关闭 */
  init?: boolean;
  /** 实例标签，便于回收孤儿容器 */
  labels?: Record<string, string>;
  /** 用户磁盘管理；配置了磁盘根目录就提供，用于新建持久沙箱以及卸载已有的用户磁盘 */
  disk?: SandboxDiskManager;
  /** 新建的登录用户沙箱是否使用持久磁盘；默认有 disk 即使用。设为 false 时只保留卸载旧磁盘的能力 */
  persistentUsers?: boolean;
  /**
   * 输出流结束后等待 Docker 记下退出码（毫秒），默认 3000；供测试调小。
   * 文件传输以此为总时限；命令执行在这段时间内按 50 毫秒间隔查询，之后按 pollMs 间隔一直等到截止
   */
  exitSettleMs?: number;
  /**
   * 命令执行的宿主侧时间（毫秒），供测试调小：
   * graceMs 是命令自身超时之外的截止余量（默认 10000），pollMs 是查询主进程状态的间隔（默认 500，
   * 单次查询超过 4 倍间隔就撤回），drainMs 是主进程结束后等输出自然结束的收尾时间（默认 1000），
   * killSettleMs 是发出结束命令后再等终态的时间，取消时截止也提前到这么久之后（默认 2000），
   * killWindowMs 是一次结束命令创建与启动的时间窗口（默认 5000）
   */
  execTiming?: {
    graceMs?: number;
    pollMs?: number;
    drainMs?: number;
    killSettleMs?: number;
    killWindowMs?: number;
  };
  /** 供测试注入 */
  docker?: Docker;
}

const TRANSFER_CANCELLED = '沙箱文件传输已取消';
/** 命令访问沙箱自己的回环地址不经出口代理（代理会拒绝回环目标）；只影响容器到自身的连接 */
const LOOPBACK_HOSTS = 'localhost,127.0.0.1,::1';
/** 读取脚本约定的退出码：路径不存在或不是普通文件 */
const NOT_A_REGULAR_FILE_EXIT = 3;

async function readStreamToBuffer(stream: Readable, maxBytes?: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (maxBytes !== undefined && total > maxBytes) {
      stream.destroy();
      throw new SandboxOperationError(`文件超过读取上限 ${maxBytes} 字节`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export class DockerSandboxDriver implements SandboxDriver {
  readonly kind = 'docker';
  readonly persistentWorkspaces: boolean;
  private readonly docker: Docker;
  private readonly egress: DockerEgress;
  private orphanMountsChecked = false;
  /** 回滚或回收时没能卸载的用户磁盘归属，由服务在该归属的排队锁内重试 */
  private readonly pendingReleases = new Set<string>();

  constructor(private readonly options: DockerSandboxDriverOptions) {
    this.docker =
      options.docker ??
      new Docker(
        options.host
          ? { host: options.host, port: options.port ?? 2375 }
          : { socketPath: options.socketPath || '/var/run/docker.sock' },
      );
    this.egress = new DockerEgress(this.docker, {
      image: options.egressImage || '99agent/sandbox-egress:latest',
      prefix: options.namePrefix,
      runtime: options.runtime || 'runc',
      allowHosts: options.egressAllowHosts,
      denyHosts: options.egressDenyHosts,
    });
    this.persistentWorkspaces = Boolean(options.disk) && options.persistentUsers !== false;
  }

  /** 新建或校验持久沙箱时使用的磁盘管理；只在启用持久磁盘时可用 */
  private diskFor(spec: { persistent?: boolean }): SandboxDiskManager | undefined {
    if (!spec.persistent) return undefined;
    if (!this.persistentWorkspaces || !this.options.disk)
      throw new SandboxOperationError('未配置用户磁盘，不能创建持久沙箱');
    return this.options.disk;
  }

  /**
   * 容器删除后卸载用户磁盘；失败不抛错，记入待重试（服务在该归属没有沙箱时重试）。
   * 从持久磁盘切回 tmpfs 时只要仍配置磁盘根目录，旧磁盘也照常卸载。
   */
  private async releaseDisk(ownerId: string): Promise<void> {
    const disk = this.options.disk;
    if (!disk) {
      Logger.warn(
        '持久沙箱已删除，但未配置用户磁盘根目录，无法卸载其磁盘，请管理员处理。',
        'Sandbox',
      );
      return;
    }
    try {
      await disk.release(ownerId);
      this.pendingReleases.delete(ownerId);
    } catch {
      this.pendingReleases.add(ownerId);
      Logger.warn('用户磁盘卸载失败，已记入待重试。', 'Sandbox');
    }
  }

  pendingDiskReleases(): string[] {
    return [...this.pendingReleases];
  }

  async retryDiskRelease(ownerId: string): Promise<void> {
    if (this.pendingReleases.has(ownerId)) await this.releaseDisk(ownerId);
  }

  containerName(ownerId: string): string {
    return `${this.options.namePrefix}s${SANDBOX_WORKSPACE_SCHEMA}-${sandboxOwnerKey(ownerId)}`;
  }

  /** 创建容器时使用的完整配置；单独拆出便于测试断言安全参数 */
  buildCreateOptions(
    spec: SandboxSpec,
    imageId: string,
    imageEnv: string[] = [],
  ): Docker.ContainerCreateOptions {
    const inheritedEnv = Object.fromEntries(
      imageEnv.map(item => {
        const separator = item.indexOf('=');
        return [item.slice(0, separator), item.slice(separator + 1)];
      }),
    );
    const env = Object.entries({
      ...inheritedEnv,
      HOME: SANDBOX_WORKSPACE,
      XDG_CACHE_HOME: '/workspace/.cache',
      PIP_CACHE_DIR: '/workspace/.cache/pip',
      NPM_CONFIG_CACHE: '/workspace/.cache/npm',
      NPM_CONFIG_PREFIX: '/workspace/.local',
      TMPDIR: '/workspace/.tmp',
      LANG: 'C.UTF-8',
      PATH: `${SANDBOX_WORKSPACE}/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
      ...(spec.env || {}),
    }).map(([key, value]) => `${key}=${value}`);
    const disk = this.diskFor(spec);
    const workspaceTmpfs = `rw,nosuid,nodev,exec,size=${Math.floor(spec.workspaceMaxBytes ?? 1024 ** 3)},nr_inodes=${Math.floor(spec.workspaceMaxInodes ?? 100000)},uid=1000,gid=1000,mode=0700`;
    const options: Docker.ContainerCreateOptions = {
      name: this.containerName(spec.ownerId),
      Image: imageId,
      Entrypoint: [],
      Cmd: ['/bin/sleep', 'infinity'],
      User: this.options.user,
      WorkingDir: SANDBOX_WORKSPACE,
      Env: env,
      Labels: {
        ...(this.options.labels || {}),
        ...platformLabels(spec.ownerId, this.options.namePrefix),
        ...(disk ? { [STORAGE_LABEL]: 'disk' } : {}),
      },
      HostConfig: {
        Runtime: this.options.runtime || 'runc',
        NetworkMode: spec.networkMode || 'none',
        Dns: ['127.0.0.1'],
        Memory: Math.max(64, spec.memoryMb) * 1024 * 1024,
        MemorySwap: Math.max(64, spec.memoryMb) * 1024 * 1024,
        // Docker 要求整数纳核；取整对本来就是整数的值没有影响
        NanoCpus: Math.round(Math.max(0.1, spec.cpus) * 1e9),
        PidsLimit: Math.max(16, spec.pidsLimit),
        CapDrop: ['ALL'],
        ReadonlyRootfs: true,
        Privileged: false,
        // sleep 作为 1 号进程不回收僵尸；每次 exec 遗留的孤儿进程会逐渐耗尽 PidsLimit
        Init: this.options.init !== false,
        IpcMode: 'private',
        ShmSize: 16 * 1024 * 1024,
        SecurityOpt: ['no-new-privileges'],
        Binds: [],
        // 持久磁盘用 Mounts 绑定：源路径不存在时 Docker 直接报错，不会在宿主上自动建无配额目录
        ...(disk
          ? {
              Mounts: [
                {
                  Type: 'bind' as const,
                  Source: disk.workspacePath(spec.ownerId),
                  Target: SANDBOX_WORKSPACE,
                  ReadOnly: false,
                  BindOptions: { Propagation: 'rprivate' as const },
                },
              ],
            }
          : {}),
        Tmpfs: {
          ...(disk ? {} : { '/workspace': workspaceTmpfs }),
          '/tmp': 'rw,nosuid,nodev,noexec,size=128m,nr_inodes=16384,mode=1777',
        },
        RestartPolicy: { Name: 'no' },
        LogConfig: { Type: 'none', Config: {} },
        AutoRemove: false,
      },
    };
    options.Labels![`${CONTAINER_LABEL}.fingerprint`] = containerFingerprint(options);
    return options;
  }

  async ensure(spec: SandboxSpec): Promise<SandboxHandle> {
    const name = this.containerName(spec.ownerId);
    let container = await this.findContainer(name);
    let created = false;
    let networkPrepared = false;
    let diskPrepared = false;
    const disk = this.diskFor(spec);
    try {
      const expected = await this.expectedOptions(spec, true);
      networkPrepared = spec.networkMode === 'egress';
      // 创建或启动容器之前必须先挂好该用户的磁盘；助手返回的路径与绑定源一致才继续
      if (disk) {
        // 先记为已尝试：助手可能挂载成功后才报错（或返回路径核对失败），回滚时照样卸载（卸载幂等）
        diskPrepared = true;
        await disk.ensure(spec.ownerId, spec.workspaceMaxBytes ?? 0);
        // 重新挂上并交给容器使用：之前记下的待卸载不再适用
        this.pendingReleases.delete(spec.ownerId);
      }
      let adopted = expected;
      if (container) {
        const previous = await container.inspect();
        adopted = await this.expectedOptions(withCreatedResources(spec, previous));
        assertContainerPolicy(previous, adopted);
        if (!previous.State.Running) {
          await container.remove({ force: false, v: false });
          container = undefined;
        }
      }
      if (!container) {
        container = await this.docker.createContainer(expected);
        created = true;
      }
      const info = await container.inspect();
      assertContainerPolicy(info, created ? expected : adopted);
      if (spec.networkMode === 'egress') await this.egress.verify(spec.ownerId);
      if (!info.State?.Running) {
        await container.start();
      }
      const handle: SandboxHandle = {
        id: info.Id,
        ownerId: spec.ownerId,
        driver: this.kind,
        createdAt: Date.parse(info.Created) || Date.now(),
        resources: readCreatedResources(info),
        ...(disk ? { persistent: true } : {}),
      };
      const prepared = await this.exec(
        handle,
        `/bin/mkdir -p ${[
          SANDBOX_INPUT_DIR,
          SANDBOX_OUTPUT_DIR,
          SANDBOX_ARTIFACT_DIR,
          SANDBOX_SKILLS_DIR,
          '.local/bin',
          '.tmp',
        ]
          .map(dir => shellQuote(`${SANDBOX_WORKSPACE}/${dir}`))
          .join(' ')}`,
        { timeoutSec: 30 },
      );
      if (prepared.exitCode !== 0 || prepared.aborted || prepared.timedOut)
        throw new SandboxOperationError('沙箱工作区初始化失败');
      return handle;
    } catch (error) {
      try {
        if (created && container) {
          await container.remove({ force: true, v: false });
          container = undefined;
        }
      } catch {
        /* Discovery retries cleanup of precisely labelled resources. */
      }
      if (!container) {
        if (networkPrepared) await this.egress.destroy(spec.ownerId).catch(() => undefined);
        // 容器已不存在才卸载；失败记入待重试，不会因首次发现之后才出现而永远遗留
        if (diskPrepared) await this.releaseDisk(spec.ownerId);
      }
      throw error;
    }
  }

  async discover(): Promise<SandboxHandle[]> {
    const list = await this.docker.listContainers({
      all: true,
      filters: JSON.stringify({
        label: [
          `${CONTAINER_LABEL}=true`,
          `${CONTAINER_LABEL}.instance=${this.options.namePrefix}`,
          `${CONTAINER_LABEL}.schema=${SANDBOX_WORKSPACE_SCHEMA}`,
        ],
      }),
    });
    await this.egress.cleanupOrphans(
      new Set(list.map(item => item.Labels?.[`${CONTAINER_LABEL}.owner`]).filter(Boolean)),
    );
    await this.releaseOrphanMounts(list);
    return list.flatMap(item => {
      const ownerId = item.Labels?.[`${CONTAINER_LABEL}.owner`];
      if (
        !ownerId ||
        Object.entries(platformLabels(ownerId, this.options.namePrefix)).some(
          ([key, value]) => item.Labels?.[key] !== value,
        ) ||
        !item.Names?.includes(`/${this.containerName(ownerId)}`)
      )
        return [];
      return [
        {
          id: item.Id,
          ownerId,
          driver: this.kind,
          createdAt: item.Created * 1000,
          ...(item.Labels?.[STORAGE_LABEL] === 'disk' ? { persistent: true } : {}),
        },
      ];
    });
  }

  /** 启动时卸载没有对应容器的用户磁盘（进程或宿主异常后遗留）；只在首次发现时做，避免碰到正在开机的磁盘 */
  private async releaseOrphanMounts(list: Docker.ContainerInfo[]): Promise<void> {
    const disk = this.options.disk;
    if (!disk || this.orphanMountsChecked) return;
    const inUse = new Set(
      list
        .filter(item => item.Labels?.[STORAGE_LABEL] === 'disk')
        .map(item => item.Labels?.[`${CONTAINER_LABEL}.owner`])
        .filter((owner): owner is string => Boolean(owner))
        .map(owner => disk.key(owner)),
    );
    for (const key of await disk.listMounted()) {
      if (!inUse.has(key)) await disk.releaseKey(key);
    }
    this.orphanMountsChecked = true;
  }

  async verify(handle: SandboxHandle, spec: SandboxSpec): Promise<SandboxState> {
    if (handle.ownerId !== spec.ownerId || handle.driver !== this.kind)
      throw new SandboxOperationError(POLICY_MISMATCH);
    let info: Docker.ContainerInspectInfo;
    try {
      info = await this.docker.getContainer(handle.id).inspect();
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) return 'missing';
      throw error;
    }
    // Only a missing container is rebuildable; policy/network drift must still fail closed.
    const expected = await this.expectedOptions(withCreatedResources(spec, info));
    assertContainerPolicy(info, expected);
    return info.State.Running ? 'running' : 'stopped';
  }

  async inspectResources(handle: SandboxHandle, maxEntries: number): Promise<SandboxResourceUsage> {
    if (handle.persistent) {
      if (!this.options.disk) throw new SandboxOperationError('未配置用户磁盘');
      return this.options.disk.usage(handle.ownerId);
    }
    const result = await this.exec(
      handle,
      `/usr/bin/python3 -I -c ${shellQuote(WORKSPACE_USAGE_SCRIPT)} ${Math.max(1, Math.floor(maxEntries))}`,
      { timeoutSec: 15, maxOutputBytes: 1024 },
    );
    if (result.exitCode !== 0 || result.truncated || result.aborted)
      throw new SandboxOperationError('沙箱容量观测失败');
    return parseWorkspaceUsage(result.stdout);
  }

  private async expectedOptions(
    spec: SandboxSpec,
    prepareNetwork = false,
  ): Promise<Docker.ContainerCreateOptions> {
    const image = await this.docker.getImage(this.options.image).inspect();
    if (!/^sha256:[a-f0-9]{64}$/u.test(image.Id))
      throw new SandboxOperationError('沙箱镜像标识无效');
    if (!['none', 'egress'].includes(spec.networkMode))
      throw new SandboxOperationError('沙箱仅支持 none 或 egress 网络模式');
    if (spec.networkMode === 'egress') {
      const route = await (prepareNetwork
        ? this.egress.ensure(spec.ownerId)
        : this.egress.route(spec.ownerId));
      spec = {
        ...spec,
        networkMode: route.network,
        env: {
          ...spec.env,
          HTTP_PROXY: route.proxy,
          HTTPS_PROXY: route.proxy,
          http_proxy: route.proxy,
          https_proxy: route.proxy,
          ALL_PROXY: '',
          all_proxy: '',
          // 创建参数参与容器指纹，改动会让已有容器全部判为策略不符；回环例外只在每条命令的环境里加
          NO_PROXY: '',
          no_proxy: '',
        },
      };
    }

    if (!/^sha256:[a-f0-9]{64}$/u.test(image.Id))
      throw new SandboxOperationError('沙箱镜像标识无效');
    return this.buildCreateOptions(spec, image.Id, image.Config?.Env || []);
  }

  async status(handle: SandboxHandle): Promise<SandboxState> {
    try {
      const info = await this.docker.getContainer(handle.id).inspect();
      return info.State?.Running ? 'running' : 'stopped';
    } catch (error) {
      if ((error as { statusCode?: number })?.statusCode === 404) return 'missing';
      throw error;
    }
  }

  async exec(
    handle: SandboxHandle,
    command: string,
    options: SandboxExecOptions = {},
  ): Promise<SandboxExecResult> {
    if (options.signal?.aborted) throw new SandboxOperationError(EXEC_CANCELLED);
    const container = this.docker.getContainer(handle.id);
    const execId = newExecId();
    const timeoutSec = options.timeoutSec ?? DEFAULT_EXEC_TIMEOUT_SEC;
    const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const cwd = options.cwd ? resolveWorkspacePath(options.cwd) : '';
    const timing = this.options.execTiming || {};
    const pollMs = timing.pollMs ?? 500;
    const killSettleMs = timing.killSettleMs ?? 2_000;
    const startedAt = Date.now();
    const stdout = new OutputCollector(maxOutputBytes, options.outputTail);
    const stderr = new OutputCollector(maxOutputBytes, options.outputTail);
    const unknownOutcome = () => new SandboxOperationError('沙箱命令的退出状态未知');

    // 宿主侧绝对截止：命令自身超时之外再留余量，从第一次 RPC 前开始，覆盖创建、启动、收流与取得终态；
    // 派发后取消时提前到 killSettleMs 之后。这是驱动层的截止，原语之后还有产物处理，
    // 整个工具调用不一定在这个时间内返回
    const stop = new AbortController();
    let stopAt = startedAt + timeoutSec * 1000 + (timing.graceMs ?? 10_000);
    let stopTimer = setTimeout(() => stop.abort(), timerDelay(stopAt - startedAt));
    const stopBy = (at: number) => {
      if (stop.signal.aborted || at >= stopAt) return;
      stopAt = at;
      clearTimeout(stopTimer);
      stopTimer = setTimeout(() => stop.abort(), timerDelay(at - Date.now()));
    };
    const creating = new AbortController();
    let status: ExecStatusProbe | undefined;
    let dispatched = false;
    let attached = false;
    let aborted = false;
    // 按进程组结束命令（结束命令会等进程编号写下、核对进程身份）。取消与清理各阶段最多一次：
    // 拿到输出流之前一次、之后一次，一律启动；截止最多一次，创建期间等到主进程终态就不再启动，
    // 不误杀主命令留下的后台任务（其间取消照样有自己的一次）
    const cancelKills = { early: false, attached: false };
    let deadlineKill = false;
    const requestKill = (byDeadline: boolean) => {
      if (!dispatched) return;
      if (byDeadline) {
        if (deadlineKill) return;
        deadlineKill = true;
        this.sendKill(container, execId, () => Boolean(status?.terminal));
        return;
      }
      const slot = attached ? 'attached' : 'early';
      if (cancelKills[slot]) return;
      cancelKills[slot] = true;
      this.sendKill(container, execId, () => false);
    };
    const onAbort = () => {
      aborted = true;
      if (!dispatched) {
        creating.abort();
        return;
      }
      requestKill(false);
      stopBy(Date.now() + killSettleMs);
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      // 创建：截止或取消时撤回请求，命令没有启动，按普通失败返回
      const abandonCreate = () => creating.abort();
      stop.signal.addEventListener('abort', abandonCreate, { once: true });
      let exec: Docker.Exec | undefined;
      try {
        const request = container.exec({
          Cmd: ['/bin/bash', '-c', wrapCommand(execId, command, timeoutSec)],
          AttachStdout: true,
          AttachStderr: true,
          AttachStdin: false,
          Tty: false,
          User: this.options.user,
          WorkingDir: cwd ? `${SANDBOX_WORKSPACE}/${cwd}` : SANDBOX_WORKSPACE,
          Env: Object.entries({
            NO_PROXY: LOOPBACK_HOSTS,
            no_proxy: LOOPBACK_HOSTS,
            ...options.env,
            BASH_ENV: '/dev/null',
          }).map(([key, value]) => `${key}=${value}`),
          abortSignal: creating.signal,
        });
        // 撤回后迟到的创建结果不再启动
        exec = await untilAborted(request, creating.signal);
      } catch (error) {
        if (aborted) throw new SandboxOperationError(EXEC_CANCELLED);
        if (stop.signal.aborted) throw new SandboxOperationError('沙箱命令启动超时，未执行');
        throw error;
      } finally {
        stop.signal.removeEventListener('abort', abandonCreate);
      }
      if (aborted) throw new SandboxOperationError(EXEC_CANCELLED);
      if (!exec || stop.signal.aborted) throw new SandboxOperationError('沙箱命令启动超时，未执行');

      // 启动：从这里起命令可能已经在跑
      options.onDispatch?.();
      dispatched = true;
      const probe = new ExecStatusProbe(exec, pollMs * 4);
      status = probe;
      const withdrawStart = new AbortController();
      const starting = exec.start({
        hijack: true,
        stdin: false,
        abortSignal: withdrawStart.signal,
      }) as unknown as Promise<Readable>;
      let stream: Readable | undefined;
      try {
        stream = await untilAborted(starting, stop.signal);
      } catch (error) {
        // 启动请求出错（例如连接中断）：Docker 可能已经启动了命令，按进程组结束；结果按未知上报
        requestKill(false);
        throw error;
      }
      if (!stream) {
        // 到截止（或取消后）仍没拿到输出流：命令可能已经在跑，按进程组结束。启动请求再留一个结束命令的窗口：
        // 期间迟到的流释放并再结束一次（只针对本命令），过了就撤回请求，之后才到的流只释放。
        // 取消后提前到来的截止算作取消，不另发截止的那次
        requestKill(!aborted);
        const withdraw = setTimeout(() => withdrawStart.abort(), timing.killWindowMs ?? 5_000);
        starting.then(
          late => {
            clearTimeout(withdraw);
            late?.destroy();
            if (withdrawStart.signal.aborted) return;
            attached = true;
            requestKill(false);
          },
          () => clearTimeout(withdraw),
        );
        throw unknownOutcome();
      }
      attached = true;
      if (aborted) requestKill(false);

      let outcome: 'ended' | 'held' | 'stopped';
      try {
        outcome = await this.collectExecOutput(stream, stdout, stderr, probe, stop.signal, {
          pollMs,
          drainMs: timing.drainMs ?? 1_000,
        });
      } catch (error) {
        // 输出流出错时主进程还没有终态：再查一会儿（终态可能就在路上）。有了按停止捕获处理；
        // 仍没有就已经无法观察这条命令，按进程组结束、结果按未知上报，不留无人看管的命令
        if (!(await probe.waitTerminal(AbortSignal.timeout(killSettleMs), pollMs, killSettleMs))) {
          requestKill(false);
          throw error;
        }
        outcome = 'held';
      }
      // 输出自然结束后继续等终态直到截止：Docker 记下退出码通常只要几毫秒，也可能是命令关了输出还在跑
      let terminal = probe.terminal;
      if (!terminal && outcome === 'ended')
        terminal = await probe.waitTerminal(
          stop.signal,
          pollMs,
          this.options.exitSettleMs ?? 3_000,
        );
      if (!terminal) {
        // 截止仍没有终态：按进程组结束，再等一会儿；仍拿不到就是结果未知，不伪造超时
        requestKill(!aborted);
        terminal = await probe.waitTerminal(
          AbortSignal.timeout(killSettleMs),
          pollMs,
          killSettleMs,
        );
      }
      if (!terminal) throw unknownOutcome();
      const exitCode = typeof terminal.ExitCode === 'number' ? terminal.ExitCode : -1;
      return {
        exitCode,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        timedOut: !aborted && exitCode === TIMEOUT_EXIT_CODE,
        aborted,
        truncated: stdout.truncated || stderr.truncated,
        stdoutTruncated: stdout.truncated,
        stderrTruncated: stderr.truncated,
        // 输出没有自然结束、由驱动停止了捕获：输出可能不完整
        ...(outcome === 'ended' ? {} : { outputHeld: true }),
        durationMs: Date.now() - startedAt,
      };
    } finally {
      clearTimeout(stopTimer);
      options.signal?.removeEventListener('abort', onAbort);
      // 返回后不再有在途的状态查询
      status?.release();
    }
  }

  /**
   * 收命令输出，直到输出自然结束（ended）、主进程结束后收尾到期（held）、或截止（取消时截止提前）。
   * 输出流出错时抛出，由调用方核对终态。
   * 输出还开着时按间隔查询主进程状态（与之后等终态共用同一个在途查询）。截止时主进程已经结束：
   * 同样按 held 停止捕获，不结束进程组；还在运行：停止捕获（stopped），由调用方结束命令。
   * 主动停止的捕获可能不完整。结算只发生一次，之后不再查询、不再写入收集器或回调
   */
  private collectExecOutput(
    stream: Readable,
    stdout: OutputCollector,
    stderr: OutputCollector,
    status: ExecStatusProbe,
    stop: AbortSignal,
    timing: { pollMs: number; drainMs: number },
  ): Promise<'ended' | 'held' | 'stopped'> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let pollTimer: ReturnType<typeof setTimeout> | undefined;
      let drainTimer: ReturnType<typeof setTimeout> | undefined;
      const settle = (outcome: 'ended' | 'held' | 'stopped' | Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(pollTimer);
        clearTimeout(drainTimer);
        stop.removeEventListener('abort', onStop);
        status.onTerminal = undefined;
        if (outcome === 'held' || outcome === 'stopped') stream.destroy();
        if (outcome instanceof Error) reject(outcome);
        else resolve(outcome);
      };
      const onStop = () => settle(status.terminal ? 'held' : 'stopped');
      status.onTerminal = () => {
        if (!settled) drainTimer ??= setTimeout(() => settle('held'), timing.drainMs);
      };
      const poll = () => {
        void status.probe();
        pollTimer = setTimeout(poll, timing.pollMs);
      };
      const capture = (collector: OutputCollector) =>
        new Writable({
          write(chunk, _encoding, callback) {
            if (!settled) collector.push(chunk);
            callback();
          },
        });
      this.docker.modem.demuxStream(stream, capture(stdout), capture(stderr));
      stream.on('end', () => settle('ended'));
      stream.on('close', () => settle('ended'));
      stream.on('error', error => settle(error));
      if (stop.aborted) return onStop();
      stop.addEventListener('abort', onStop, { once: true });
      pollTimer = setTimeout(poll, timing.pollMs);
    });
  }

  /**
   * 按进程组结束一条命令。创建与启动共用一个时间窗口，过了就撤回请求，迟到的创建结果不再启动；
   * skip() 为真时（截止发出的结束命令在创建期间等到了主进程终态）也不启动。
   * 失败不阻塞调用方，也不能当作命令已经终止
   */
  private sendKill(container: Docker.Container, execId: string, skip: () => boolean): void {
    const window = new AbortController();
    const timer = setTimeout(() => window.abort(), this.options.execTiming?.killWindowMs ?? 5_000);
    timer.unref?.();
    void container
      .exec({
        Cmd: ['/bin/bash', '-c', killCommand(execId)],
        User: this.options.user,
        Env: ['BASH_ENV=/dev/null'],
        abortSignal: window.signal,
      })
      .then(killer =>
        window.signal.aborted || skip()
          ? undefined
          : killer.start({ Detach: true, abortSignal: window.signal }),
      )
      .catch((): undefined => undefined)
      .finally(() => clearTimeout(timer));
  }

  async readFile(
    handle: SandboxHandle,
    filePath: string,
    options: SandboxReadOptions = {},
  ): Promise<Buffer> {
    const stream = await this.openTransferStream(handle, filePath, options.signal);
    return readStreamToBuffer(stream, options.maxBytes);
  }

  /** 文件传输复用进程组硬超时；宿主看门狗也覆盖 Docker RPC 与连接异常。 */
  private async startTransfer(
    handle: SandboxHandle,
    relative: string,
    action: 'read' | 'write',
    options: SandboxWriteOptions = {},
  ): Promise<{ stream: Duplex; done: Promise<void>; cancel: () => void }> {
    if (options.signal?.aborted) throw new SandboxOperationError(TRANSFER_CANCELLED);
    const container = this.docker.getContainer(handle.id);
    const execId = newExecId();
    let stream: Duplex | undefined;
    let completed = false;
    // 第一次停止的原因：超时、用户取消或失败，启动阶段报错时按它给出文案
    let stopReason: string | undefined;
    let rejectDeadline!: (error: Error) => void;
    const deadline = new Promise<never>((_resolve, reject) => {
      rejectDeadline = reject;
    });
    void deadline.catch((): undefined => undefined);
    const stop = (message: string) => {
      if (completed || stopReason) return;
      stopReason = message;
      rejectDeadline(new SandboxOperationError(message));
      stream?.destroy();
      void container
        .exec({
          Cmd: ['/bin/bash', '-c', killCommand(execId)],
          User: this.options.user,
          Env: ['BASH_ENV=/dev/null'],
        })
        .then(killer => killer.start({ Detach: true }))
        .catch((): undefined => undefined);
    };
    const timer = setTimeout(() => stop('沙箱文件传输超时'), (DEFAULT_EXEC_TIMEOUT_SEC + 1) * 1000);
    // 用户停止或会话终止时不等硬超时：结束传输并杀掉容器里的进程组
    const onAbort = () => stop(TRANSFER_CANCELLED);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const release = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    };
    const bounded = <T>(operation: Promise<T>): Promise<T> => Promise.race([operation, deadline]);
    const argv = [
      '/usr/bin/python3',
      '-I',
      '-c',
      FILE_TRANSFER_SCRIPT,
      SANDBOX_WORKSPACE,
      relative,
      action,
      (options.mode ?? 0o644).toString(8),
    ];
    try {
      const exec = await bounded(
        container.exec({
          Cmd: [
            '/bin/bash',
            '-c',
            wrapCommand(execId, argv.map(shellQuote).join(' '), DEFAULT_EXEC_TIMEOUT_SEC),
          ],
          AttachStdin: action === 'write',
          AttachStdout: true,
          AttachStderr: true,
          Tty: false,
          User: this.options.user,
          WorkingDir: SANDBOX_WORKSPACE,
          Env: ['BASH_ENV=/dev/null'],
        }),
      );
      options.onDispatch?.();
      const transport = await bounded<Duplex>(
        exec.start({ hijack: true, stdin: action === 'write' }).then(value => {
          const opened = value as unknown as Duplex;
          if (stopReason) opened.destroy();
          return opened;
        }),
      );
      stream = transport;
      const ended = new Promise<void>((resolve, reject) => {
        transport.once('end', resolve);
        transport.once('close', () =>
          transport.readableEnded
            ? resolve()
            : reject(new SandboxOperationError('沙箱文件传输连接已中断')),
        );
        transport.once('error', () => reject(new SandboxOperationError('沙箱文件传输失败')));
      });
      const done = (async () => {
        try {
          await bounded(ended);
          const inspected = await bounded(settledExecInfo(exec, this.options.exitSettleMs));
          if (inspected?.ExitCode !== 0)
            throw new SandboxOperationError(
              action === 'read' && inspected?.ExitCode === NOT_A_REGULAR_FILE_EXIT
                ? `不是普通文件或路径不安全：${relative}`
                : `沙箱文件${action === 'read' ? '读取' : '写入'}失败：${relative}`,
            );
          completed = true;
        } catch (error) {
          stop('沙箱文件传输失败');
          throw error instanceof SandboxOperationError
            ? error
            : new SandboxOperationError('沙箱文件传输失败');
        } finally {
          release();
        }
      })();
      void done.catch((): undefined => undefined);
      return { stream: transport, done, cancel: () => stop(TRANSFER_CANCELLED) };
    } catch {
      const reason = stopReason;
      stop('沙箱文件传输启动失败');
      release();
      throw new SandboxOperationError(reason ?? '沙箱文件传输启动失败');
    }
  }

  async openReadStream(handle: SandboxHandle, filePath: string): Promise<Readable> {
    return this.openTransferStream(handle, filePath);
  }

  private async openTransferStream(
    handle: SandboxHandle,
    filePath: string,
    signal?: AbortSignal,
  ): Promise<Readable> {
    const relative = resolveWorkspacePath(filePath);
    if (!relative) throw new SandboxOperationError('不能把工作区根目录当文件读取');
    const transfer = await this.startTransfer(handle, relative, 'read', { signal });
    const content = new PassThrough();
    content.on('close', transfer.cancel);
    return new Promise<Readable>((resolve, reject) => {
      let opened = false;
      const open = () => {
        if (!opened) {
          opened = true;
          resolve(content);
        }
      };
      try {
        this.docker.modem.demuxStream(
          transfer.stream,
          new Writable({
            write(chunk, _encoding, callback) {
              open();
              content.write(chunk, () => callback());
            },
          }),
          new Writable({
            write(_chunk, _encoding, callback) {
              callback();
            },
          }),
        );
      } catch {
        transfer.cancel();
        content.destroy();
        reject(new SandboxOperationError('沙箱文件读取失败'));
        return;
      }
      void transfer.done.then(
        () => {
          content.end();
          open();
        },
        error => {
          if (opened) content.destroy(error);
          else {
            content.destroy();
            reject(error);
          }
        },
      );
    });
  }

  async writeFile(
    handle: SandboxHandle,
    filePath: string,
    content: Buffer | string,
    options: SandboxWriteOptions = {},
  ): Promise<void> {
    const relative = resolveWorkspacePath(filePath);
    if (!relative) throw new SandboxOperationError('不能把工作区根目录当文件写入');
    const transfer = await this.startTransfer(handle, relative, 'write', options);
    try {
      this.docker.modem.demuxStream(
        transfer.stream,
        new Writable({
          write(_chunk, _encoding, callback) {
            callback();
          },
        }),
        new Writable({
          write(_chunk, _encoding, callback) {
            callback();
          },
        }),
      );
      transfer.stream.end(typeof content === 'string' ? Buffer.from(content, 'utf8') : content);
      await transfer.done;
    } catch (error) {
      transfer.cancel();
      throw error instanceof SandboxOperationError
        ? error
        : new SandboxOperationError('沙箱文件写入失败');
    }
  }

  async listDir(
    handle: SandboxHandle,
    dirPath: string,
    options: SandboxListOptions = {},
  ): Promise<SandboxFileEntry[]> {
    const relative = resolveWorkspacePath(dirPath);
    const absolute = relative ? `${SANDBOX_WORKSPACE}/${relative}` : SANDBOX_WORKSPACE;
    const maxEntries = options.maxEntries ?? 500;
    const result = await this.exec(
      handle,
      listDirCommand(absolute, maxEntries, Boolean(options.recursive)),
      { timeoutSec: 30, maxOutputBytes: 4 * 1024 * 1024 },
    );
    if (result.exitCode !== 0 || result.timedOut || result.aborted || result.truncated)
      throw new SandboxOperationError('读取沙箱目录失败');
    return parseFindOutput(result.stdout, maxEntries);
  }

  async stop(handle: SandboxHandle): Promise<void> {
    try {
      await this.docker.getContainer(handle.id).stop({ t: 5 });
    } catch (error) {
      const status = (error as { statusCode?: number })?.statusCode;
      if (status !== 304 && status !== 404) throw error;
    }
    await this.egress.stop(handle.ownerId);
    if (handle.persistent) await this.releaseDisk(handle.ownerId);
  }

  async destroy(handle: SandboxHandle, options: { removeWorkspace?: boolean } = {}): Promise<void> {
    await this.egress.checkRemoval(handle.ownerId, handle.id);
    try {
      await this.docker.getContainer(handle.id).remove({ force: true, v: false });
    } catch (error) {
      if ((error as { statusCode?: number })?.statusCode !== 404) throw error;
    }
    await this.egress.destroy(handle.ownerId);
    // 持久磁盘只卸载、不删除：删除用户磁盘只由管理员经宿主助手执行
    if (handle.persistent) await this.releaseDisk(handle.ownerId);
  }

  private async findContainer(name: string): Promise<Docker.Container | undefined> {
    const list = await this.docker.listContainers({
      all: true,
      filters: JSON.stringify({ name: [name] }),
    });
    const match = list.find(item => item.Names?.some(n => n === `/${name}`));
    return match ? this.docker.getContainer(match.Id) : undefined;
  }
}

/**
 * 内存、CPU 与工作区 tmpfs 在创建容器时确定，已有容器按它自己的创建值校验：套餐或配置变化只作用于
 * 新建的容器，运行中的会话沙箱沿用原资源直到闲置回收（重建会清空 tmpfs 工作区）。
 * 这四项之外，镜像、运行时、只读根文件系统、网络、权限等字段仍须与期望配置逐项一致；创建后被改过
 * 资源的容器也因配置指纹不符被拒绝。指纹无密钥，只证明配置自洽、不证明由本服务创建：
 * 能调用 Docker API 的一方等同宿主机 root，不在沙箱防护范围内。
 */
export function withCreatedResources(
  spec: SandboxSpec,
  info: Docker.ContainerInspectInfo,
): SandboxSpec {
  const resources = readCreatedResources(info);
  return resources ? { ...spec, ...resources } : spec;
}

/**
 * 从容器配置读出内存、CPU 与工作区 tmpfs 上限；字段不全时返回 undefined（随后按当前策略校验并拒绝）。
 * 持久磁盘容器只有内存与 CPU：磁盘容量跟随策略，在下次开机时扩容。
 */
export function readCreatedResources(
  info: Docker.ContainerInspectInfo,
): SandboxResources | undefined {
  const host = info.HostConfig;
  if (
    host?.Memory &&
    host.NanoCpus &&
    !host.Tmpfs?.['/workspace'] &&
    host.Mounts?.some(mount => mount.Type === 'bind' && mount.Target === SANDBOX_WORKSPACE)
  )
    return { memoryMb: host.Memory / 1024 / 1024, cpus: host.NanoCpus / 1e9 };
  const workspace = host?.Tmpfs?.['/workspace'] ?? '';
  const size = /(?:^|,)size=(\d+)(?:,|$)/u.exec(workspace)?.[1];
  const inodes = /(?:^|,)nr_inodes=(\d+)(?:,|$)/u.exec(workspace)?.[1];
  if (!host?.Memory || !host.NanoCpus || !size || !inodes) return undefined;
  return {
    memoryMb: host.Memory / 1024 / 1024,
    cpus: host.NanoCpus / 1e9,
    workspaceMaxBytes: Number(size),
    workspaceMaxInodes: Number(inodes),
  };
}

/** setTimeout 的上限约 24.8 天，超过会立即触发 */
function timerDelay(ms: number): number {
  return Math.min(Math.max(0, ms), 2_147_483_647);
}

/** work 先完成就返回它的结果，signal 先触发就返回 undefined（不撤回 work，迟到的结果由调用方处理） */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T | undefined> {
  if (signal.aborted) return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const onAbort = () => resolve(undefined);
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      value => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      error => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/** 等 ms 毫秒，signal 触发时提前结束 */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

/**
 * 一条 exec 主进程的状态。同一时刻只有一个在途查询，单次查询超时就撤回底层请求，撤回或返回后才发下一次；
 * 终态（不在运行）只记一次，第一次出现时回调 onTerminal。收流时的轮询与之后等终态共用它
 */
export class ExecStatusProbe {
  terminal?: Docker.ExecInspectInfo;
  onTerminal?: () => void;
  private inFlight?: Promise<void>;
  private request?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private released = false;

  constructor(
    private readonly exec: Pick<Docker.Exec, 'inspect'>,
    private readonly requestMs: number,
  ) {}

  probe(): Promise<void> {
    if (this.terminal || this.released) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    const request = new AbortController();
    this.request = request;
    this.timer = setTimeout(() => request.abort(), this.requestMs);
    this.inFlight = Promise.resolve()
      .then(() => this.exec.inspect({ abortSignal: request.signal }))
      .then(
        info => {
          if (this.released || this.terminal || !info || info.Running) return;
          this.terminal = info;
          this.onTerminal?.();
        },
        (): undefined => undefined,
      )
      .finally(() => {
        clearTimeout(this.timer);
        this.inFlight = undefined;
        this.request = undefined;
      });
    return this.inFlight;
  }

  /** 不再查询：撤回在途的查询、清掉它的计时器，之后的 probe 直接返回，迟到的结果也不再记 */
  release(): void {
    this.released = true;
    this.onTerminal = undefined;
    clearTimeout(this.timer);
    this.request?.abort();
  }

  /** 等到终态或 stop 触发；查询之间前 fastMs 毫秒按 50 毫秒间隔，之后按 pollMs */
  async waitTerminal(
    stop: AbortSignal,
    pollMs: number,
    fastMs: number,
  ): Promise<Docker.ExecInspectInfo | undefined> {
    const fastUntil = Date.now() + fastMs;
    while (!this.terminal && !stop.aborted) {
      await untilAborted(this.probe(), stop);
      if (this.terminal || stop.aborted) break;
      await pause(Date.now() < fastUntil ? Math.min(50, pollMs) : pollMs, stop);
    }
    return this.terminal;
  }
}

/** 解析受控 find 的输出。 */
/**
 * 输出流结束时 Docker 可能还没记下退出码（gVisor 下更明显）：在总时限内（含 inspect 本身的耗时）轮询，
 * 拿到终态返回；到时仍在运行或 inspect 迟迟不返回，返回 undefined，由调用方按状态未知处理。
 */
export async function settledExecInfo(
  exec: Pick<Docker.Exec, 'inspect'>,
  budgetMs = 3000,
): Promise<Docker.ExecInspectInfo | undefined> {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const inspected = await Promise.race([
      exec.inspect(),
      new Promise<undefined>(resolve => {
        timer = setTimeout(() => resolve(undefined), remaining);
      }),
    ]).finally(() => clearTimeout(timer));
    if (!inspected) return undefined;
    if (!inspected.Running) return inspected;
    await new Promise(resolve =>
      setTimeout(resolve, Math.min(50, Math.max(0, deadline - Date.now()))),
    );
  }
}

/**
 * listDir 在沙箱里执行的命令。目录不存在输出为空、退出 0；查询本身失败（find / head 出错）退出非零，不能伪装成空目录。
 * 记录以 NUL 分隔（文件名可含换行），head 多取一条用于判断截断，取满后 find 收到 SIGPIPE（141）属正常截断；
 * 遍历中被删的文件不算出错；其他遍历错误（如子目录不可读）让整次列举失败，不把没遍历到的内容当成不存在。
 */
export function listDirCommand(absolute: string, maxEntries: number, recursive: boolean): string {
  const depth = recursive ? '' : '-maxdepth 1';
  return `if [ -d ${shellQuote(absolute)} ]; then /usr/bin/find ${shellQuote(absolute)} -ignore_readdir_race -mindepth 1 ${depth} -printf '%y\\t%s\\t%T@\\t%p\\0' 2>/dev/null | /usr/bin/head -z -n ${maxEntries + 1}; s=("\${PIPESTATUS[@]}"); [ "\${s[0]}" = 0 ] || [ "\${s[0]}" = 141 ] || exit 3; [ "\${s[1]}" = 0 ] || exit 3; fi`;
}

export function parseFindOutput(stdout: string, maxEntries: number): SandboxFileEntry[] {
  const entries: SandboxFileEntry[] = [];
  for (const line of stdout.split('\0')) {
    if (!line.trim()) continue;
    if (entries.length >= maxEntries) break;
    const [typeChar, size, mtime, ...rest] = line.split('\t');
    const absolute = rest.join('\t');
    if (!absolute) continue;
    const relative = absolute.startsWith(`${SANDBOX_WORKSPACE}/`)
      ? absolute.slice(SANDBOX_WORKSPACE.length + 1)
      : absolute;
    entries.push({
      path: relative,
      type:
        typeChar === 'f'
          ? 'file'
          : typeChar === 'd'
            ? 'dir'
            : typeChar === 'l'
              ? 'symlink'
              : 'other',
      size: Number(size) || 0,
      mtimeMs: Math.round((Number(mtime) || 0) * 1000),
    });
  }
  return entries;
}

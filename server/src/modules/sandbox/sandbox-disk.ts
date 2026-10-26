/**
 * 登录用户的持久磁盘：每人一个稀疏 ext4 镜像，由宿主助手 sandbox/disk/99agent-sandbox-disk 挂载，
 * 只把其中的 workspace/ 绑定进该用户的沙箱。宿主特权操作全部经助手完成（参数数组、无 shell），
 * server 只算出同一规则的路径并核对，助手返回的路径不一致即拒绝。
 * 每个站点（SANDBOX_NAME_PREFIX）在磁盘根下有独立子目录，同一宿主的多个站点互不可见、互不清理。
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { SandboxOperationError, type SandboxResourceUsage } from './sandbox.port';

const HELPER_TIMEOUT_MS = 120_000;
const DISK_KEY_PATTERN = /^[a-f0-9]{32}$/u;
const INSTANCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const FAILED = '沙箱磁盘操作失败，请管理员检查磁盘助手与宿主存储。';

export type DiskCommandRunner = (file: string, args: string[]) => Promise<string>;

export interface SandboxDiskOptions {
  /** 与助手配置 DISK_ROOT 相同的绝对路径 */
  root: string;
  /** 助手的绝对路径 */
  command: string;
  /** 实例前缀（SANDBOX_NAME_PREFIX）：站点子目录名，也参与磁盘 key */
  instance: string;
  /** 宿主磁盘低水位：低于它时暂停所有持久工作区的写入与执行 */
  hostMinFreeBytes: number;
  /** 非 root 进程经 sudo -n 调用助手；默认按当前进程是否为 root 判断 */
  useSudo?: boolean;
  run?: DiskCommandRunner;
}

const runHelper: DiskCommandRunner = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        timeout: HELPER_TIMEOUT_MS,
        maxBuffer: 64 * 1024,
        env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LC_ALL: 'C' },
      },
      (error, stdout) => (error ? reject(error) : resolve(String(stdout))),
    );
  });

function isPermissionError(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  return code === 'EACCES' || code === 'EPERM';
}

export class SandboxDiskManager {
  private readonly run: DiskCommandRunner;
  private readonly useSudo: boolean;

  constructor(private readonly options: SandboxDiskOptions) {
    if (!path.isAbsolute(options.root) || path.resolve(options.root) !== options.root)
      throw new Error('SANDBOX_USER_DISK_ROOT 必须是规范的绝对路径');
    if (!path.isAbsolute(options.command))
      throw new Error('SANDBOX_USER_DISK_COMMAND 必须是绝对路径');
    if (!INSTANCE_PATTERN.test(options.instance))
      throw new Error(
        'SANDBOX_NAME_PREFIX 只能包含字母、数字、点、下划线和连字符，且以字母或数字开头',
      );
    this.run = options.run ?? runHelper;
    this.useSudo = options.useSudo ?? process.getuid?.() !== 0;
  }

  key(ownerId: string): string {
    return createHash('sha256')
      .update(`${this.options.instance}\0${ownerId}`)
      .digest('hex')
      .slice(0, 32);
  }

  /** 容器绑定的宿主路径；只由 key 推出，不接受助手之外的来源 */
  workspacePath(ownerId: string): string {
    return path.join(this.siteRoot(), 'mnt', this.key(ownerId), 'workspace');
  }

  private siteRoot(): string {
    return path.join(this.options.root, this.options.instance);
  }

  /** 创建 / 扩容 / 检查并挂载，返回已核对的工作区路径 */
  async ensure(ownerId: string, sizeBytes: number): Promise<string> {
    const sizeMb = Math.max(64, Math.ceil(sizeBytes / 1024 / 1024));
    const output = await this.helper([
      'ensure',
      this.options.instance,
      this.key(ownerId),
      String(sizeMb),
    ]);
    const workspace = output.trim();
    if (workspace !== this.workspacePath(ownerId)) throw new SandboxOperationError(FAILED);
    return workspace;
  }

  async release(ownerId: string): Promise<void> {
    await this.releaseKey(this.key(ownerId));
  }

  /** 只用于启动时清理遗留挂载：key 来自助手的 list-mounted */
  async releaseKey(key: string): Promise<void> {
    if (!DISK_KEY_PATTERN.test(key)) throw new SandboxOperationError(FAILED);
    await this.helper(['release', this.options.instance, key]);
  }

  async listMounted(): Promise<string[]> {
    const output = await this.helper(['list-mounted', this.options.instance]);
    return output
      .split('\n')
      .map(line => line.trim())
      .filter(line => DISK_KEY_PATTERN.test(line));
  }

  /**
   * 文件系统统计即用量，不逐个文件扫描。宿主剩余空间低于低水位时标记 hostLow，调用方暂停写入与执行，
   * 防止稀疏镜像把宿主盘写满。进程读不到挂载点（非 root）时经助手读取；都失败时抛错，调用方按
   * 容量不可观测拒绝写入。
   */
  async usage(ownerId: string): Promise<SandboxResourceUsage> {
    let numbers: number[];
    try {
      const [workspace, host] = await Promise.all([
        fs.statfs(this.workspacePath(ownerId)),
        fs.statfs(this.siteRoot()),
      ]);
      numbers = [
        workspace.bsize,
        workspace.blocks,
        workspace.bfree,
        workspace.bavail,
        workspace.files,
        workspace.ffree,
        host.bsize,
        host.bavail,
        host.blocks,
      ];
    } catch (error) {
      if (!isPermissionError(error)) throw new SandboxOperationError(FAILED);
      numbers = (await this.helper(['usage', this.options.instance, this.key(ownerId)]))
        .trim()
        .split(/\s+/u)
        .map(Number);
      numbers.push(Number.NaN);
    }
    const [bsize, blocks, bfree, bavail, files, ffree, hostBsize, hostAvail, hostBlocks] = numbers;
    if (
      numbers.length !== 9 ||
      numbers.slice(0, 8).some(value => !Number.isFinite(value) || value < 0) ||
      !bsize ||
      !blocks ||
      // 工作区与磁盘根目录落在同一个文件系统，说明用户磁盘没有挂上
      (bsize === hostBsize && blocks === hostBlocks)
    )
      throw new SandboxOperationError(FAILED);
    return {
      workspaceBytes: (blocks - bfree) * bsize,
      workspaceInodes: Math.max(0, files - ffree),
      freeBytes: bavail * bsize,
      freeInodes: ffree,
      scanComplete: true,
      hostLow: hostAvail * hostBsize < this.options.hostMinFreeBytes,
    };
  }

  private async helper(args: string[]): Promise<string> {
    const [file, argv] = this.useSudo
      ? ['/usr/bin/sudo', ['-n', this.options.command, ...args]]
      : [this.options.command, args];
    try {
      return await this.run(file, argv);
    } catch {
      throw new SandboxOperationError(FAILED);
    }
  }
}

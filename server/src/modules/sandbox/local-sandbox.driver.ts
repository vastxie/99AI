import { SandboxOperationError } from './sandbox.port';
/**
 * LocalSandboxDriver — 无隔离的本机进程实现，只用于开发与自动化测试
 *
 * 每个归属一个目录（<root>/<ownerId>）当工作区，命令直接在宿主机 bash 里跑。登录用户的目录
 * 闲置回收时保留（模拟生产的持久磁盘，但没有容量硬上限）。
 * 它没有任何安全边界：生产环境禁止装载（sandbox.module 会拒绝）。
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { createReadStream } from 'node:fs';
import {
  DEFAULT_EXEC_TIMEOUT_SEC,
  DEFAULT_MAX_OUTPUT_BYTES,
  EXEC_CANCELLED,
  OutputCollector,
  TIMEOUT_EXIT_CODE,
} from './exec-support';
import {
  resolveWorkspacePath,
  SANDBOX_ARTIFACT_DIR,
  SANDBOX_INPUT_DIR,
  SANDBOX_OUTPUT_DIR,
  SANDBOX_SKILLS_DIR,
  SANDBOX_WORKSPACE,
  SandboxPathError,
  sandboxOwnerKey,
  type SandboxDriver,
  type SandboxExecOptions,
  type SandboxExecResult,
  type SandboxFileEntry,
  type SandboxHandle,
  type SandboxListOptions,
  type SandboxReadOptions,
  type SandboxSpec,
  type SandboxState,
  type SandboxWriteOptions,
  type SandboxResourceUsage,
} from './sandbox.port';

/** 本地读写进行中被中止时，Node 抛 AbortError；换成与 Docker 驱动相同的取消错误，其它错误原样抛出 */
function rethrowUnlessAborted(options: { signal?: AbortSignal }) {
  return (error: unknown): never => {
    if (options.signal?.aborted && (error as { name?: unknown })?.name === 'AbortError') {
      throw new SandboxOperationError('沙箱文件传输已取消');
    }
    throw error;
  };
}

/** 本机驱动没有 /workspace：环境变量里以 /workspace 开头的路径换成本机工作区目录（如 AGENT_OUTPUT_DIR） */
function hostWorkspaceEnv(root: string, env: Record<string, string> = {}): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [
      key,
      value === SANDBOX_WORKSPACE || value.startsWith(`${SANDBOX_WORKSPACE}/`)
        ? `${root}${value.slice(SANDBOX_WORKSPACE.length)}`
        : value,
    ]),
  );
}

export class LocalSandboxDriver implements SandboxDriver {
  readonly kind = 'local';
  readonly persistentWorkspaces = true;
  private readonly stopped = new Set<string>();

  constructor(
    private readonly root: string,
    /** 主进程结束后等输出自然结束的收尾时间（毫秒），供测试调小 */
    private readonly drainMs = 1_000,
  ) {}

  workspaceDir(ownerId: string): string {
    return path.resolve(this.root, sandboxOwnerKey(ownerId));
  }

  async discover(): Promise<SandboxHandle[]> {
    return []; // 仅本进程的测试驱动，不把任意宿主目录认领为生产沙箱。
  }

  async verify(handle: SandboxHandle, spec: SandboxSpec): Promise<SandboxState> {
    if (
      handle.ownerId !== spec.ownerId ||
      handle.id !== (await fs.realpath(this.workspaceDir(spec.ownerId)))
    ) {
      throw new SandboxOperationError('沙箱归属校验失败');
    }
    return this.status(handle);
  }

  async inspectResources(handle: SandboxHandle, maxEntries: number): Promise<SandboxResourceUsage> {
    const seen = new Set<string>();
    const stack = [handle.id];
    let workspaceBytes = 0;
    let scanComplete = true;
    while (stack.length) {
      const item = stack.pop()!;
      const stat = await fs.lstat(item);
      const key = `${stat.dev}:${stat.ino}`;
      if (seen.has(key)) continue;
      seen.add(key);
      workspaceBytes += Math.max(stat.size, stat.blocks * 512);
      if (seen.size > maxEntries) {
        scanComplete = false;
        break;
      }
      if (stat.isDirectory()) {
        const entries = await fs.opendir(item);
        for await (const entry of entries) {
          stack.push(path.join(item, entry.name));
          if (stack.length + seen.size > maxEntries + 1) {
            scanComplete = false;
            break;
          }
        }
        if (!scanComplete) break;
      }
    }
    const disk = await fs.statfs(handle.id);
    return {
      workspaceBytes,
      workspaceInodes: seen.size,
      freeBytes: disk.bavail * disk.bsize,
      freeInodes: disk.ffree,
      scanComplete,
    };
  }

  async ensure(spec: SandboxSpec): Promise<SandboxHandle> {
    const requested = this.workspaceDir(spec.ownerId);
    for (const sub of [
      '',
      SANDBOX_INPUT_DIR,
      SANDBOX_OUTPUT_DIR,
      SANDBOX_ARTIFACT_DIR,
      SANDBOX_SKILLS_DIR,
    ]) {
      await fs.mkdir(path.join(requested, sub), { recursive: true });
    }
    // handle.id 用真实路径，避免 macOS /var → /private/var 这类符号链接让相对路径计算出错
    const dir = await fs.realpath(requested);
    this.stopped.delete(dir);
    return {
      id: dir,
      ownerId: spec.ownerId,
      driver: this.kind,
      ...(spec.persistent ? { persistent: true } : {}),
    };
  }

  async status(handle: SandboxHandle): Promise<SandboxState> {
    try {
      await fs.access(handle.id);
    } catch {
      return 'missing';
    }
    return this.stopped.has(handle.id) ? 'stopped' : 'running';
  }

  async exec(
    handle: SandboxHandle,
    command: string,
    options: SandboxExecOptions = {},
  ): Promise<SandboxExecResult> {
    if (options.signal?.aborted) throw new SandboxOperationError(EXEC_CANCELLED);
    const timeoutSec = options.timeoutSec ?? DEFAULT_EXEC_TIMEOUT_SEC;
    const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const cwd = this.resolve(handle, options.cwd || '');
    const startedAt = Date.now();
    const stdout = new OutputCollector(maxOutputBytes, options.outputTail);
    const stderr = new OutputCollector(maxOutputBytes, options.outputTail);

    return new Promise<SandboxExecResult>((resolve, reject) => {
      options.onDispatch?.();
      const child = spawn('bash', ['-lc', command], {
        cwd,
        env: {
          ...process.env,
          HOME: handle.id,
          SANDBOX_WORKSPACE: handle.id,
          ...hostWorkspaceEnv(handle.id, options.env),
        },
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let timedOut = false;
      let aborted = false;
      let killed = false;
      let leaderExit: { code: number | null } | undefined;
      let settled = false;
      let drainTimer: ReturnType<typeof setTimeout> | undefined;
      // 只在主进程还在跑时按进程组结束（主进程在，组号就是它的 pid，不会被复用）：超时计时器在主进程
      // 退出时停掉，退出后的取消也不发信号。留下的后台进程不由这里处理，与 Docker 驱动的结束命令同一口径；
      // 本地没有容器边界，停机与销毁也不结束它们
      const killTree = () => {
        if (!child.pid) return;
        killed = true;
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      };
      const timer = setTimeout(() => {
        timedOut = true;
        killTree();
      }, timeoutSec * 1000);
      // 停止捕获：关掉管道读端，不再等输出（Docker 驱动同样释放输出流）
      const stopCapture = (code: number | null) => {
        child.stdout.destroy();
        child.stderr.destroy();
        settle(code, true);
      };
      const onAbort = () => {
        aborted = true;
        // 主进程已经结束、正在收尾：不发信号，直接停止捕获
        if (leaderExit) stopCapture(leaderExit.code);
        else killTree();
      };
      options.signal?.addEventListener('abort', onAbort, { once: true });
      // 只结算一次：输出自然结束（close）、主进程结束后收尾到期、出错，谁先到算谁
      const settle = (code: number | null, outputHeld: boolean, error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(drainTimer);
        options.signal?.removeEventListener('abort', onAbort);
        if (error) {
          reject(error);
          return;
        }
        resolve({
          exitCode: killed ? TIMEOUT_EXIT_CODE : (code ?? -1),
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          timedOut,
          aborted,
          truncated: stdout.truncated || stderr.truncated,
          stdoutTruncated: stdout.truncated,
          stderrTruncated: stderr.truncated,
          ...(outputHeld ? { outputHeld: true } : {}),
          durationMs: Date.now() - startedAt,
        });
      };

      child.stdout.on('data', chunk => {
        if (!settled) stdout.push(chunk);
      });
      child.stderr.on('data', chunk => {
        if (!settled) stderr.push(chunk);
      });
      child.on('error', error => settle(null, false, error));
      // 主进程结束：停掉执行超时（不再误杀留在进程组里的后台进程），改等输出收尾
      child.on('exit', code => {
        leaderExit = { code };
        clearTimeout(timer);
        if (settled) return;
        drainTimer = setTimeout(() => stopCapture(code), this.drainMs);
      });
      child.on('close', code => settle(code, false));
    });
  }

  async readFile(
    handle: SandboxHandle,
    filePath: string,
    options: SandboxReadOptions = {},
  ): Promise<Buffer> {
    if (options.signal?.aborted) throw new SandboxOperationError('沙箱文件传输已取消');
    const absolute = await this.resolveExisting(handle, filePath);
    const stat = await fs.stat(absolute);
    if (!stat.isFile()) throw new SandboxOperationError(`不是普通文件：${filePath}`);
    if (options.maxBytes !== undefined && stat.size > options.maxBytes) {
      throw new SandboxOperationError(`文件超过读取上限 ${options.maxBytes} 字节`);
    }
    return fs.readFile(absolute, { signal: options.signal }).catch(rethrowUnlessAborted(options));
  }

  async openReadStream(handle: SandboxHandle, filePath: string): Promise<Readable> {
    const absolute = await this.resolveExisting(handle, filePath);
    const stat = await fs.stat(absolute);
    if (!stat.isFile()) throw new SandboxOperationError(`不是普通文件：${filePath}`);
    return createReadStream(absolute);
  }

  async writeFile(
    handle: SandboxHandle,
    filePath: string,
    content: Buffer | string,
    options: SandboxWriteOptions = {},
  ): Promise<void> {
    if (options.signal?.aborted) throw new SandboxOperationError('沙箱文件传输已取消');
    const absolute = this.resolve(handle, filePath);
    if (absolute === handle.id) throw new SandboxOperationError('不能把工作区根目录当文件写入');
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    options.onDispatch?.();
    await fs
      .writeFile(absolute, content, { mode: options.mode ?? 0o644, signal: options.signal })
      .catch(rethrowUnlessAborted(options));
  }

  async listDir(
    handle: SandboxHandle,
    dirPath: string,
    options: SandboxListOptions = {},
  ): Promise<SandboxFileEntry[]> {
    let absolute: string;
    try {
      absolute = await this.resolveExisting(handle, dirPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const maxEntries = options.maxEntries ?? 500;
    const entries: SandboxFileEntry[] = [];
    const walk = async (dir: string) => {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        if (entries.length >= maxEntries) return;
        const full = path.join(dir, item.name);
        const stat = await fs.lstat(full);
        entries.push({
          path: path.relative(handle.id, full).split(path.sep).join('/'),
          type: item.isDirectory()
            ? 'dir'
            : item.isFile()
              ? 'file'
              : item.isSymbolicLink()
                ? 'symlink'
                : 'other',
          size: stat.size,
          mtimeMs: Math.round(stat.mtimeMs),
        });
        if (options.recursive && item.isDirectory()) await walk(full);
      }
    };
    await walk(absolute);
    return entries;
  }

  async stop(handle: SandboxHandle): Promise<void> {
    this.stopped.add(handle.id);
  }

  async destroy(handle: SandboxHandle, options: { removeWorkspace?: boolean } = {}): Promise<void> {
    this.stopped.delete(handle.id);
    if (options.removeWorkspace) await fs.rm(handle.id, { recursive: true, force: true });
  }

  /** 工作区内路径 → 宿主机绝对路径，越界一律拒绝 */
  private resolve(handle: SandboxHandle, input: string): string {
    const relative = resolveWorkspacePath(input);
    const absolute = path.resolve(handle.id, relative);
    if (absolute !== handle.id && !absolute.startsWith(`${handle.id}${path.sep}`)) {
      throw new SandboxPathError(input);
    }
    return absolute;
  }

  /** 已存在的路径还要检查真实路径（防符号链接逃逸） */
  private async resolveExisting(handle: SandboxHandle, input: string): Promise<string> {
    const absolute = this.resolve(handle, input);
    const real = await fs.realpath(absolute);
    const rootReal = await fs.realpath(handle.id);
    if (real !== rootReal && !real.startsWith(`${rootReal}${path.sep}`)) {
      throw new SandboxPathError(input);
    }
    return real;
  }
}

export { SANDBOX_WORKSPACE };

/**
 * SandboxPort — 宿主与用户沙箱之间的唯一接口
 *
 * 登录用户每人一台沙箱，多个对话共用；驱动支持时工作区 /workspace 是该用户独立的持久磁盘，
 * 否则是有界 tmpfs。访客每个对话一台临时沙箱。宿主只通过这个接口创建 / 恢复 / 执行命令 /
 * 读写文件 / 停止 / 销毁。生产实现是 Docker + gVisor（docker-sandbox.driver.ts），
 * 开发与测试可用无隔离的本机进程实现（local-sandbox.driver.ts）。
 *
 * 路径约定：所有文件接口的路径都相对于工作区根目录 /workspace，允许写成 "out/a.png" 或
 * "/workspace/out/a.png"；越出工作区的路径一律拒绝。bash 命令不受此限制，隔离由驱动保证。
 */

import type { Readable } from 'node:stream';
import { createHash } from 'node:crypto';

export const SANDBOX_DRIVER = 'SANDBOX_DRIVER';

export const SANDBOX_WORKSPACE = '/workspace';
export const SANDBOX_WORKSPACE_SCHEMA = '3';
/** 用户输入附件落盘目录 */
export const SANDBOX_INPUT_DIR = 'in';
/** 模型产物输出目录，宿主在每次工具调用后捕获 */
export const SANDBOX_OUTPUT_DIR = 'out';
/** 已捕获产物的归档目录 */
export const SANDBOX_ARTIFACT_DIR = 'artifacts';
/** 沙箱内技能目录 */
export const SANDBOX_SKILLS_DIR = 'skills';

export interface SandboxSpec {
  /** 沙箱归属：登录用户为 user-<id>，访客为「账号 + 对话」 */
  ownerId: string;
  /** 工作区为持久磁盘（仅登录用户且驱动支持时）；容量取 workspaceMaxBytes */
  persistent?: boolean;
  workspaceMaxBytes?: number;
  workspaceMaxInodes?: number;
  memoryMb: number;
  cpus: number;
  pidsLimit: number;
  /** egress = 受控公网代理（默认）；none = 无网 */
  networkMode: string;
  /** 注入沙箱进程的环境变量（例如按套餐下发的代理地址） */
  env?: Record<string, string>;
}

/** 容器创建时确定、之后不再变化的资源上限；持久磁盘的容量跟随策略，不在其中 */
export interface SandboxResources {
  memoryMb: number;
  cpus: number;
  workspaceMaxBytes?: number;
  workspaceMaxInodes?: number;
}

export interface SandboxHandle {
  createdAt?: number;
  /** 驱动内部 id（容器 id / 本机目录） */
  id: string;
  ownerId: string;
  driver: string;
  /** 容器实际生效的资源（驱动能读到时填写）；策略变化后运行中的容器仍按它记账 */
  resources?: SandboxResources;
  /** 工作区是持久磁盘：回收只释放容器，文件保留 */
  persistent?: boolean;
}

export type SandboxState = 'running' | 'stopped' | 'missing';

export interface SandboxExecOptions {
  /** 相对工作区的工作目录，默认工作区根 */
  cwd?: string;
  env?: Record<string, string>;
  /** 硬超时，超时后整棵进程树被 KILL */
  timeoutSec?: number;
  /**
   * 宿主侧取消（用户停止 / 会话终止）。派发前取消：命令不运行，抛出「已取消，未执行」。
   * 派发后取消：尝试按进程组结束仍在运行的命令（主进程已经结束时不再向留下的后台进程发终止信号），
   * 结果带 aborted；拿不到终态时按「退出状态未知」抛出
   */
  signal?: AbortSignal;
  /** 输出上限（字节），超出截断并在结果中标记 */
  maxOutputBytes?: number;
  /** 超出上限时保留开头与结尾、丢弃中间；默认只留开头（分页读取等依赖捕获到的是前缀） */
  outputTail?: boolean;
  /** 宿主内部边界钩子：驱动即将把命令交给沙箱执行时同步调用，不得持久化或下发。 */
  onDispatch?: () => void;
}

export interface SandboxExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
  /** 任一路输出超过上限被截断 */
  truncated: boolean;
  /** 逐路的截断状态（被截断的那一路带捕获器的说明：只留开头时在结尾，outputTail 时在中间）；驱动不报告时按 truncated 处理 */
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
  /**
   * 主进程已经结束，但输出没有自然结束（例如后台进程继承了输出），驱动收尾到期或到截止时主动停止了捕获：
   * 输出可能不完整；不代表一定还有后台进程在运行，驱动也不会因此结束它们
   */
  outputHeld?: boolean;
  durationMs: number;
}

export interface SandboxFileEntry {
  /** 相对工作区的路径 */
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'other';
  size: number;
  mtimeMs: number;
}

export interface SandboxReadOptions {
  /** 读取上限（字节），超出抛错而不是截断，避免静默丢内容 */
  maxBytes?: number;
  /** 宿主侧取消（用户停止 / 会话终止）：立即结束未完成的传输 */
  signal?: AbortSignal;
}

export interface SandboxWriteOptions {
  /** 八进制权限，默认 0o644 */
  mode?: number;
  /** 宿主内部边界钩子：驱动即将写入文件内容时同步调用，不得持久化或下发。 */
  onDispatch?: () => void;
  /** 宿主侧取消（用户停止 / 会话终止）：立即结束未完成的传输 */
  signal?: AbortSignal;
}

export interface SandboxListOptions {
  recursive?: boolean;
  maxEntries?: number;
}

export interface SandboxResourceUsage {
  workspaceBytes: number;
  workspaceInodes: number;
  freeBytes: number;
  freeInodes: number;
  scanComplete: boolean;
  /** 持久磁盘所在的宿主盘低于低水位：暂停写入与执行 */
  hostLow?: boolean;
}

export function sandboxOwnerKey(ownerId: string): string {
  if (typeof ownerId !== 'string' || !ownerId || ownerId.length > 256 || ownerId.includes('\0')) {
    throw new Error('沙箱归属 id 无效');
  }
  return createHash('sha256').update(ownerId).digest('hex').slice(0, 32);
}

export interface SandboxDriver {
  readonly kind: string;
  /** 是否能为登录用户提供持久工作区 */
  readonly persistentWorkspaces: boolean;

  /** 创建或恢复沙箱；幂等 */
  ensure(spec: SandboxSpec): Promise<SandboxHandle>;
  /** 只发现当前平台/实例/schema 的容器（含停止态）；不接管未知资源。 */
  discover(): Promise<SandboxHandle[]>;
  /** 在复用前校验归属、不可变镜像与实际安全策略。 */
  verify(handle: SandboxHandle, spec: SandboxSpec): Promise<SandboxState>;
  inspectResources(handle: SandboxHandle, maxEntries: number): Promise<SandboxResourceUsage>;
  status(handle: SandboxHandle): Promise<SandboxState>;
  exec(
    handle: SandboxHandle,
    command: string,
    options?: SandboxExecOptions,
  ): Promise<SandboxExecResult>;

  readFile(handle: SandboxHandle, path: string, options?: SandboxReadOptions): Promise<Buffer>;
  /** 大文件（产物）流式读取，调用方负责消费或销毁 */
  openReadStream(handle: SandboxHandle, path: string): Promise<Readable>;
  writeFile(
    handle: SandboxHandle,
    path: string,
    content: Buffer | string,
    options?: SandboxWriteOptions,
  ): Promise<void>;
  listDir(
    handle: SandboxHandle,
    path: string,
    options?: SandboxListOptions,
  ): Promise<SandboxFileEntry[]>;

  /** 回滚时没能卸载、等待重试的持久磁盘归属（仅支持持久磁盘的驱动实现） */
  pendingDiskReleases?(): string[];
  /** 重试卸载；调用方须确保该归属当前没有沙箱 */
  retryDiskRelease?(ownerId: string): Promise<void>;
  /** 停止容器；临时工作区内容随停止丢失，持久磁盘保留。 */
  stop(handle: SandboxHandle): Promise<void>;
  /** 销毁沙箱；removeWorkspace 为 true 时连工作区一起删除（持久磁盘只由管理员经宿主助手删除） */
  destroy(handle: SandboxHandle, options?: { removeWorkspace?: boolean }): Promise<void>;
}

/** 可公开的静态沙箱错误；未知 Docker/文件系统错误不得直接发给工具消费者。 */
export class SandboxOperationError extends Error {}

export class SandboxPathError extends SandboxOperationError {
  constructor(path: string) {
    super(`沙箱路径越出工作区：${path}`);
    this.name = 'SandboxPathError';
  }
}

/**
 * 把调用方给的路径归一化为工作区内的相对路径（不带前导斜杠，"" 表示根）。
 * 拒绝 ".." 越界、空字节与非工作区绝对路径。
 */
export function resolveWorkspacePath(input: string): string {
  if (typeof input !== 'string' || input.includes('\0')) throw new SandboxPathError(String(input));
  let raw = input.trim();
  if (raw === '' || raw === '.') return '';
  if (raw.startsWith(SANDBOX_WORKSPACE)) {
    const rest = raw.slice(SANDBOX_WORKSPACE.length);
    if (rest !== '' && !rest.startsWith('/')) throw new SandboxPathError(input);
    raw = rest;
  } else if (raw.startsWith('/')) {
    throw new SandboxPathError(input);
  }
  const segments: string[] = [];
  for (const part of raw.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      throw new SandboxPathError(input);
    }
    segments.push(part);
  }
  return segments.join('/');
}

/** 访客账号前缀；所有会话的临时工作区均按闲置策略回收。 */
export const SANDBOX_VISITOR_OWNER_PREFIX = 'visitor-';

/** SANDBOX_VISITOR_ENABLED=false 时访客不暴露沙箱工具（默认开放，由 SANDBOX_MAX_ACTIVE 与签发限流兜底） */
export function isVisitorSandboxEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    String(env.SANDBOX_VISITOR_ENABLED ?? 'true')
      .trim()
      .toLowerCase() !== 'false'
  );
}

/** 供 bash 使用的单引号转义 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/gu, `'\\''`)}'`;
}

/** 登录用户的整机归属；只由宿主鉴权后的用户 id 生成。 */
export function sandboxUserOwner(userId: number): string {
  if (!Number.isSafeInteger(userId) || userId <= 0)
    throw new SandboxOperationError('沙箱缺少已鉴权的用户身份');
  return `user-${userId}`;
}
export function isSandboxUserOwner(ownerId: string): boolean {
  return /^user-[1-9][0-9]{0,15}$/u.test(ownerId);
}

/** 只由宿主鉴权后的账号与会话生成，模型参数不得参与。 */
export function sandboxSessionOwner(accountId: string, conversationId: unknown): string {
  if (
    (!/^user-[1-9][0-9]*$/u.test(accountId) && !/^visitor-[^\0]{1,128}$/u.test(accountId)) ||
    accountId.includes(':conversation:') ||
    !/^[1-9][0-9]{0,15}$/u.test(String(conversationId ?? ''))
  ) {
    throw new SandboxOperationError('沙箱缺少已鉴权的对话身份');
  }
  return `${accountId}:conversation:${conversationId}`;
}
export function sandboxAccountOwner(ownerId: string): string {
  return ownerId.split(':conversation:')[0];
}

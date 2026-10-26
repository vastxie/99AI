/**
 * PrimitiveToolProvider — 内核唯一的内置工具集：read / write / edit / bash / ls
 *
 * 全部在用户沙箱（SandboxService）里执行：登录用户整机一台、多个对话共用（同一对话内的工具按序执行，
 * 不同对话并发），访客每个对话一台。每轮开始时把用户附件放进 in/<回合>/；
 * 每次会产生文件的调用后捕获 out/ 里的产物，上传为文件资产并随工具结果展示给用户，
 * 然后移到 artifacts/ 归档。能力扩展不在这里加工具，而是放进沙箱（技能 / CLI / MCP）。
 */

import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import * as mime from 'mime-types';
import * as path from 'node:path';
import { FileAssetService } from '../../fileAsset/fileAsset.service';
import { SandboxService } from '../../sandbox/sandbox.service';
import {
  resolveWorkspacePath,
  sandboxSessionOwner,
  sandboxUserOwner,
  SANDBOX_ARTIFACT_DIR,
  SANDBOX_INPUT_DIR,
  SANDBOX_OUTPUT_DIR,
  SANDBOX_WORKSPACE,
  SandboxOperationError,
  SandboxPathError,
  shellQuote,
  SANDBOX_VISITOR_OWNER_PREFIX,
  isVisitorSandboxEnabled,
  type SandboxFileEntry,
} from '../../sandbox/sandbox.port';
import { PrimitiveInputError, type OwnerRef } from './primitive-types';
import { SkillLibrary } from './skill-library';
import {
  createLayeredToolResult,
  sanitizeFaithfulText,
  sliceUtf16,
} from '../../chatLog/tool-result-payload';
import {
  codePointLength,
  fileRefLinesReserve,
  fitHeadTail,
  fitLinesFromStart,
  LISTED_FILES_MAX,
  primitiveBodyBudget,
  splitCaptureNote,
  splitLines,
} from './model-text-budget';
import { storeToolMedia, TOOL_MEDIA_MAX_BYTES } from '../tools/tool-media';
import {
  ToolOutcomeUnknownError,
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolProvider,
  type ToolReplayIntent,
  type ToolResult,
} from '../tools/tool-provider.interface';

const LOG_CONTEXT = 'PrimitiveTools';

export const PRIMITIVE_TOOL_NAMES = ['read', 'write', 'edit', 'bash', 'ls'] as const;
export type PrimitiveToolName = (typeof PRIMITIVE_TOOL_NAMES)[number];

const READ_MAX_BYTES = 200 * 1024;
/** 输出没有自然结束、驱动停止捕获时给模型的说明 */
const OUTPUT_HELD_NOTE =
  '[命令已结束，但输出没有自然结束（可能有后台进程仍占用输出），已停止等待，输出可能不完整；本次没有交付输出目录里的文件。需要后台运行时把输出完整重定向（nohup <命令> > 文件 2>&1 &），在对话目录里生产、完成后再移进 $AGENT_OUTPUT_DIR，之后的命令会交付；后台任务仍占用沙箱资源，需要自己检查与清理，可能在空闲回收时被终止]';
const LS_MAX_ENTRIES = 500;
/** read 结果头部说明（路径、行号、续读办法）预留的长度 */
const READ_HEADER_RESERVE = 600;

/**
 * 超长单行的分段查看办法：按字符（码点）切片，与显示的字数同一口径；
 * 显示的内容替换过平台私有信息时位置可能略有出入
 */
function longLineHint(target: string, line: number, from: number): string {
  const script = `import sys; l = open(sys.argv[1], encoding="utf-8", errors="replace", newline="").read().split("\\n")[int(sys.argv[2]) - 1]; print(l[int(sys.argv[3]):int(sys.argv[4])])`;
  return `python3 -c ${shellQuote(script)} ${shellQuote(target)} ${line} ${from} ${from + 4000}`;
}

/** 按行装入预算并写明读到哪一行、怎么继续读；首行就超长时只给该行开头一段 */
function renderLineWindow(
  target: string,
  lines: string[],
  start: number,
  budget: number,
  info: { total?: number; suffix?: string; endOfFile?: boolean; moreAfter?: boolean },
): string {
  const totalText = info.total === undefined ? '' : `，共 ${info.total} 行`;
  const suffix = info.suffix || '';
  if (lines.length === 0) return `[${target}${totalText}，从第 ${start} 行起没有内容${suffix}]`;
  const window = fitLinesFromStart(lines, budget);
  if (window.partial) {
    const shown = codePointLength(window.text);
    const total = codePointLength(lines[0]);
    const next =
      lines.length > 1 || info.moreAfter ? `；后面的行从 offset=${start + 1} 继续读` : '';
    return `[${target} 第 ${start} 行共 ${total} 个字符，只显示了前 ${shown} 个${suffix}；该行其余部分可用 bash 按字符分段查看，例如 ${longLineHint(target, start, shown)}${next}]\n${window.text}`;
  }
  const last = start + window.count - 1;
  const allShown = window.count === lines.length;
  const notes = [
    ...(!allShown ? [`未读完，继续读取用 offset=${last + 1}`] : []),
    ...(allShown && info.moreAfter ? [`继续读取用 offset=${last + 1}`] : []),
    ...(allShown && info.endOfFile ? ['已到文件末尾'] : []),
  ];
  return `[${target} 第 ${start}-${last} 行${totalText}${suffix}${notes.length ? `；${notes.join('；')}` : ''}]\n${window.text}`;
}

/**
 * 大文件按行分页（sed）：输出受捕获上限约束。被截断时驱动会在结尾追加说明，
 * 去掉说明后，最后一段没有换行的就是被截断的残片，不当作完整行。分页时不知道文件总行数，不写总行数。
 */
function renderLargeFilePage(
  target: string,
  size: number,
  offset: number,
  limit: number,
  stdout: string,
  truncated: boolean,
): string {
  const { text: captured, capturedBytes } = truncated ? splitCaptureNote(stdout) : { text: stdout };
  const complete = truncated ? captured.slice(0, captured.lastIndexOf('\n') + 1) : captured;
  const lines = complete ? splitLines(sanitizeFaithfulText(complete)) : [];
  const suffix = `（文件 ${formatBytes(size)}，大文件按行分页）`;
  const cap = capturedBytes
    ? `单次读取的捕获上限（${formatBytes(capturedBytes)}）`
    : '单次读取的捕获上限';
  const budget = primitiveBodyBudget(READ_HEADER_RESERVE);
  if (truncated && lines.length === 0) {
    return `[${target} 第 ${offset} 行超过${cap}，未完整读取${suffix}；可用 bash 按字符分段查看该行，例如 ${longLineHint(target, offset, 0)}]`;
  }
  const rendered = renderLineWindow(target, lines, offset, budget, {
    suffix,
    endOfFile: !truncated && lines.length < limit,
    moreAfter: !truncated && lines.length === limit,
  });
  // 已捕获的完整行全部装下、捕获却被截断：下一行本身超过了捕获上限
  if (truncated && fitLinesFromStart(lines, budget).count === lines.length) {
    const next = offset + lines.length;
    return `${rendered}\n[第 ${next} 行在本次读取中没有完整捕获（输出达到${cap}）；可以用 offset=${next} 单独读这一行，太长时可用 bash 按字符分段查看，例如 ${longLineHint(target, next, 0)}]`;
  }
  return rendered;
}

const ARTIFACT_MAX_BYTES = 100 * 1024 * 1024;
const ARTIFACT_MAX_COUNT = 20;
const ATTACHMENT_MAX_COUNT = 20;
const ATTACHMENT_MAX_MB = 50;
/** 持久磁盘的交付登记代次：容器换代后仍能在登记有效期内续交付盘上的待交付文件 */
const PERSISTENT_GENERATION = 'persistent';
/** 变更已发出后失败的阶段 */
type MutationStage = 'write' | 'exec' | 'capture';
const UNKNOWN_OUTCOME_MESSAGES: Record<MutationStage, string> = {
  write: '沙箱文件写入中断，工具结果不确定',
  exec: '沙箱命令被中止、超时或执行失败，工具结果不确定',
  capture: '沙箱产物回收失败，工具结果不确定',
};

const TEXT_MIME_PREFIXES = ['text/'];
const TEXT_MIME_EXACT = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
  'application/x-sh',
  'application/x-yaml',
  'application/yaml',
  'application/toml',
  'application/x-python',
  'image/svg+xml',
]);

export interface SandboxAttachmentInput {
  fileId?: string;
  name?: string;
  mime?: string;
  size?: number;
}

export interface CapturedArtifact {
  type: 'image' | 'video' | 'audio' | 'document' | 'file';
  name: string;
  fileId: string;
  /** 交付角色：final 才会出现在前端文件列表与公开事件 assets 里 */
  role: 'final';
  mime?: string;
  size?: number;
  url?: string;
  previewUrl?: string;
  downloadUrl?: string;
  /** 产物在沙箱里的归档路径 */
  sandboxPath?: string;
}

function resolveOwner(options: Record<string, unknown> | undefined): OwnerRef | undefined {
  const userId = Number(options?.userId);
  if (Number.isInteger(userId) && userId > 0)
    return {
      ownerId: sandboxUserOwner(userId),
      sessionId: sandboxSessionOwner(`user-${userId}`, options?.conversationId),
      conversationId: String(options?.conversationId),
      userId,
    };
  const visitorId = typeof options?.visitorId === 'string' ? options.visitorId.trim() : '';
  if (visitorId) {
    const sessionId = sandboxSessionOwner(
      `${SANDBOX_VISITOR_OWNER_PREFIX}${visitorId}`,
      options?.conversationId,
    );
    return {
      ownerId: sessionId,
      sessionId,
      conversationId: String(options?.conversationId),
      visitorId,
    };
  }
  return undefined;
}

/** 按原路径找归档副本时的枚举上限：达到上限视为列表不完整 */
const ARCHIVE_LOOKUP_MAX_ENTRIES = 5000;

/** 本轮交付记录的键：沙箱、轮次、相对路径 */
function deliveryKey(ownerId: string, turnKey: string, relative: string): string {
  return `${ownerId}\0${turnKey}\0${relative}`;
}

/** 交付登记按对话区分：本对话只续交付本对话的文件 */
function turnRegistry(owner: OwnerRef, generation: string) {
  return {
    ownerId: owner.sessionId,
    generation,
    userId: owner.userId,
    visitorId: owner.visitorId,
  };
}

/** 访客在 SANDBOX_VISITOR_ENABLED=false 时不暴露、不执行任何沙箱原语 */
function isSandboxClosedForOwner(owner: OwnerRef | undefined): boolean {
  return Boolean(owner?.visitorId) && !isVisitorSandboxEnabled();
}

function parseArgs(args: unknown): Record<string, unknown> | null {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
  const prototype = Object.getPrototypeOf(args);
  return prototype === Object.prototype || prototype === null
    ? (args as Record<string, unknown>)
    : null;
}

/**
 * 有的模型会把没用到的可选参数也填上空值，例如
 * {"command":"ls","recover_outputs":false,"save_skill":"","delete_skill":"","timeout":10}：
 * 这些按未传处理，否则会被当成重试交付、技能管理或 fileRef 读取而拒绝执行。
 * 只处理可选参数；write 的空内容、edit 的空替换是必填参数的合法值，保持原样。
 */
const OPTIONAL_ARGUMENTS = new Map<string, readonly string[]>([
  ['read', ['path', 'fileRef', 'offset', 'limit']],
  ['bash', ['command', 'recover_outputs', 'save_skill', 'delete_skill', 'timeout']],
  ['ls', ['path', 'recursive']],
]);

function withoutUnsetArguments(
  toolName: string,
  parsed: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const optional = OPTIONAL_ARGUMENTS.get(toolName);
  if (!parsed || !optional) return parsed;
  const result = { ...parsed };
  for (const key of optional) {
    if (result[key] === null || result[key] === '' || result[key] === false) delete result[key];
  }
  return result;
}

/** 必填的字符串参数：缺失或类型不对时报输入错误，不替模型补成空串或 "[object Object]" */
function requireStringArg(args: Record<string, any>, name: string, emptyHint?: string): string {
  const value = args[name];
  if (typeof value === 'string') return value;
  throw new PrimitiveInputError(
    `${name} 必须是字符串${value === undefined || value === null ? '，不能省略' : ''}${
      emptyHint ? `（${emptyHint}）` : ''
    }`,
  );
}

function isTextMime(mimeType: string): boolean {
  return (
    TEXT_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix)) || TEXT_MIME_EXACT.has(mimeType)
  );
}

function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return true;
    if (byte < 7 || (byte > 14 && byte < 32)) suspicious += 1;
  }
  return sample.length > 0 && suspicious / sample.length > 0.3;
}

function mediaTypeOf(mimeType: string | undefined): CapturedArtifact['type'] {
  if (!mimeType) return 'file';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (
    mimeType === 'application/pdf' ||
    mimeType.includes('word') ||
    mimeType.includes('presentation') ||
    mimeType.includes('spreadsheet') ||
    mimeType.startsWith('text/')
  ) {
    return 'document';
  }
  return 'file';
}

function safeFileName(name: string): string {
  const base = path.posix.basename(String(name || '').replace(/\\/gu, '/')).trim();
  const cleaned = base.replace(/[\0/]/gu, '_').replace(/^\.+$/u, '_');
  return cleaned || 'file';
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function turnKeyOf(options: Record<string, any> | undefined): string {
  const turnId = options?.turnId;
  if (typeof turnId !== 'string' || !/^[A-Za-z0-9_-]{1,96}$/.test(turnId) || !options?.messageId) {
    throw new PrimitiveInputError('沙箱缺少有效的宿主回合与消息身份');
  }
  return turnId;
}

class ArtifactDeliveryError extends Error {
  constructor(
    readonly files: CapturedArtifact[],
    cause?: unknown,
  ) {
    super('文件已生成，但交付未完成；文件保留在本轮 out/pending 目录，可重试回收。', { cause });
  }
}

/** 命令被强制终止后告诉模型的说明；held 是交付目录里的文件被移去的暂存目录（没有文件时为空） */
function killedCommandNote(durationMs: number, held: string): string {
  const files = held
    ? `本次写进交付目录的文件可能不完整，已移到 ${held}/ 暂不交付，确认完好后移到 $AGENT_OUTPUT_DIR 即可交付；`
    : '';
  return `[命令在 ${Math.round(durationMs / 1000)} 秒时被强制终止（超过时间上限或内存不足），改动可能只完成了一部分；${files}耗时任务请拆小，或在对话目录里用 nohup … > 日志 2>&1 & 放到后台，完成后再移进 $AGENT_OUTPUT_DIR]`;
}

/**
 * 交付失败的原因：本模块与沙箱的文案可以告诉模型；日志只记错误类型和文案里全角冒号前的固定部分，
 * 不带路径、命令与原始异常内容。
 */
function deliveryFailureReason(error: unknown): { model?: string; log: string } {
  const cause = error instanceof ArtifactDeliveryError && error.cause ? error.cause : error;
  const type = cause instanceof Error ? cause.constructor.name : typeof cause;
  const model =
    cause instanceof PrimitiveInputError ||
    (cause instanceof SandboxOperationError && !(cause instanceof SandboxPathError))
      ? cause.message
      : undefined;
  return { model, log: model ? `${type}：${model.split('：')[0]}` : type };
}

const MOVE_FILE_SCRIPT = `# agent_move_file
import hashlib, os, pathlib, sys
root = pathlib.Path.cwd().resolve()
source = root / sys.argv[1]
target = root / sys.argv[2]
for value in (source.resolve(), target.resolve()):
    value.relative_to(root)
if source.is_symlink() or not source.is_file():
    raise ValueError('Invalid artifact source')
target.parent.mkdir(parents=True, exist_ok=True)
target.parent.resolve().relative_to(root)
if target.exists():
    expected = sys.argv[3]
    if not expected or target.is_symlink(): raise ValueError('Artifact destination exists')
    for value in (source, target):
        if hashlib.sha256(value.read_bytes()).hexdigest() != expected: raise ValueError('Artifact content changed')
else:
    os.link(source, target, follow_symlinks=False)
source.unlink()
`;

@Injectable()
export class PrimitiveToolProvider implements ToolProvider {
  private readonly skills: SkillLibrary;
  private readonly generations = new Map<string, string>();
  private readonly turnLeases = new WeakMap<object, () => void>();
  /** 串行队列：`session:<对话>` 保证同一对话内工具按序；`file:<沙箱>\0<路径>` 让跨对话的 write/edit 不互相覆盖 */
  private readonly ownerOperations = new Map<string, Promise<void>>();
  /** 本轮交付记录：<沙箱>\0<轮次>\0<相对路径> → 最新一版的归档路径（按真实交付顺序；轮次结束时清理） */
  private readonly deliveredOutputs = new Map<string, string>();

  constructor(
    private readonly sandbox: SandboxService,
    private readonly fileAssets: FileAssetService,
  ) {
    this.skills = new SkillLibrary(sandbox, fileAssets);
  }

  async getToolDefinitions(context?: ToolExecutionContext): Promise<ToolDefinition[]> {
    if (context && context.input?.context?.options?.__sandboxTurnPrepared !== true) return [];
    if (isSandboxClosedForOwner(resolveOwner(context?.input?.context?.options))) return [];
    return [
      {
        type: 'function',
        function: {
          name: 'read',
          description:
            'Read workspace text with line-based pagination. PNG, JPEG, GIF, WebP images and WAV/MP3 audio (up to 10 MB per file) can be returned to models that support them. For other binary formats, use bash to extract or convert contents.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Workspace path. Specify path or fileRef.' },
              fileRef: {
                type: 'string',
                description:
                  'Restore a file available in this conversation, using a reference such as previous_file_1 or a known fileId. Returns a path to read or process.',
              },
              offset: {
                type: 'integer',
                description: 'First text line, starting at 1.',
                minimum: 1,
              },
              limit: { type: 'integer', description: 'Maximum text lines to return.', minimum: 1 },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'write',
          description:
            'Create or overwrite a workspace file, creating parent directories as needed. Use for new files or complete rewrites.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path relative to the workspace.' },
              content: { type: 'string', description: 'Complete file contents.' },
            },
            required: ['path', 'content'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'edit',
          description:
            'Make a targeted text replacement. oldText must match exactly once, including whitespace; otherwise the edit fails. Read the file first if its contents are unknown.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path relative to the workspace.' },
              oldText: {
                type: 'string',
                description: 'Exact text to replace, including indentation.',
              },
              newText: { type: 'string', description: 'Replacement text.' },
            },
            required: ['path', 'oldText', 'newText'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'bash',
          description:
            'Run bash commands in the workspace. Commands have a time limit and output may be truncated; redirect long output to a file and read it in parts. To keep a process running in the background, redirect all of its output (nohup <cmd> > file 2>&1 &). Save deliverables to $AGENT_OUTPUT_DIR. Run commands, recover outputs, save a skill, or delete a skill in separate calls.',
          parameters: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description:
                  'Command to execute. Omit when recovering outputs or managing a skill.',
              },
              recover_outputs: {
                type: 'boolean',
                description:
                  'Set true as the only argument to retry registered pending deliveries in this conversation. Works even when the workspace is read-only or full; runs no command.',
              },
              save_skill: {
                type: 'string',
                description:
                  'Skill name. Save the source in skills/<name> as a private skill only when the user requests long-term retention.',
              },
              delete_skill: {
                type: 'string',
                description:
                  'Name of a saved skill the user asks to delete. It will no longer be restored in future workspaces.',
              },
              timeout: {
                type: 'integer',
                description: 'Timeout in seconds, capped by policy.',
                minimum: 1,
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'ls',
          description: 'List workspace directory entries; one level by default.',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Workspace-relative directory; defaults to the root.',
              },
              recursive: { type: 'boolean', description: 'Include nested entries.' },
            },
          },
        },
      },
    ];
  }

  canHandle(toolName: string): boolean {
    return (PRIMITIVE_TOOL_NAMES as readonly string[]).includes(toolName);
  }

  getCategory(): string {
    return 'productivity';
  }

  getRuntime(): string {
    return 'sandbox';
  }

  getToolCost(): number {
    return 0;
  }

  getReplayIntent(toolName: string, args: unknown): ToolReplayIntent {
    if (toolName !== 'ls') return { policy: 'never' };
    const parsed = withoutUnsetArguments(toolName, parseArgs(args));
    if (!parsed || Object.keys(parsed).some(key => key !== 'path' && key !== 'recursive')) {
      return { policy: 'never' };
    }
    if (parsed.path !== undefined && typeof parsed.path !== 'string') return { policy: 'never' };
    if (parsed.recursive !== undefined && typeof parsed.recursive !== 'boolean') {
      return { policy: 'never' };
    }
    try {
      const normalizedPath = resolveWorkspacePath(String(parsed.path || ''));
      return {
        policy: 'safe',
        payload: {
          path: normalizedPath,
          recursive: Boolean(parsed.recursive),
        },
      };
    } catch {
      return { policy: 'never' };
    }
  }

  getDisplayName(toolName: string, args?: unknown): string | undefined {
    const parsed = parseArgs(args) || {};
    switch (toolName) {
      case 'bash': {
        const command = String(parsed.command || '')
          .trim()
          .replace(/\s+/gu, ' ');
        return command ? `bash · ${command.slice(0, 60)}${command.length > 60 ? '…' : ''}` : 'bash';
      }
      case 'read':
      case 'write':
      case 'edit':
      case 'ls': {
        const target = String(parsed.path || '').trim();
        return target ? `${toolName} · ${target}` : toolName;
      }
      default:
        return undefined;
    }
  }

  async finishTurn(context: ToolExecutionContext): Promise<void> {
    const options = context?.input?.context?.options;
    if (!options) return;
    try {
      const owner = resolveOwner(options);
      if (owner && options.sandboxGeneration) {
        for (const turn of await this.fileAssets.listSandboxTurns(
          turnRegistry(owner, String(options.sandboxGeneration)),
        )) {
          if (turn.turnId !== options.turnId) continue;
          const pending = await Promise.all(
            ['out', 'pending'].map(root =>
              this.sandbox.listDir(owner.ownerId, `${root}/${turn.turnId}`, {
                recursive: true,
                maxEntries: 1001,
              }),
            ),
          );
          if (
            pending.every(
              entries => entries.length < 1001 && !entries.some(file => file.type === 'file'),
            )
          )
            await this.fileAssets.completeSandboxTurn(turn.fileId);
        }
      }
    } finally {
      this.turnLeases.get(options)?.();
      this.turnLeases.delete(options);
      const owner = resolveOwner(options);
      const turnPrefix = owner ? deliveryKey(owner.ownerId, turnKeyOf(options), '') : '';
      for (const key of turnPrefix ? [...this.deliveredOutputs.keys()] : [])
        if (key.startsWith(turnPrefix)) this.deliveredOutputs.delete(key);
    }
  }

  /** 每轮开始：把本轮附件放进 in/<回合>/，并记录到 options.sandboxInputs */
  async prepareTurn(context: ToolExecutionContext): Promise<void> {
    const options = context?.input?.context?.options as Record<string, any> | undefined;
    if (!options || options.__sandboxTurnPrepared) return;

    const owner = resolveOwner(options);
    if (!owner) return;
    if (isSandboxClosedForOwner(owner)) {
      options.__sandboxTurnPrepared = true;
      options.sandboxInputs = [];
      return;
    }
    if (this.sandbox.isSessionRetired(owner.sessionId))
      throw new SandboxOperationError('会话已删除，沙箱不可再使用');
    const turnKey = turnKeyOf(options);
    for (const [id, generation] of this.generations) {
      if (!this.sandbox.isResident(id, generation)) {
        this.generations.delete(id);
        this.skills.forget(id);
      }
    }
    if (!this.turnLeases.has(options)) {
      const lease = await this.sandbox.beginTurn(owner.ownerId);
      this.turnLeases.set(options, lease.release);
      options.sandboxPersistent = lease.handle.persistent === true;
      options.sandboxGeneration = options.sandboxPersistent
        ? PERSISTENT_GENERATION
        : lease.handle.id;
      if (this.generations.get(owner.ownerId) !== lease.handle.id) {
        this.skills.forget(owner.ownerId);
        this.generations.set(owner.ownerId, lease.handle.id);
      }
    }
    const persistent = options.sandboxPersistent === true;
    await this.fileAssets.registerSandboxTurn({
      ...turnRegistry(owner, options.sandboxGeneration),
      turnId: turnKey,
      messageId: options.messageId,
    });
    const markReadOnly = (reason: string | undefined) => {
      options.__sandboxTurnPrepared = true;
      options.sandboxReadOnlyReason = reason;
      options.sandboxInputs = [];
    };
    const resources = await this.sandbox.resourceStatus(owner.ownerId);
    // 登录用户的机器满额（持久磁盘或 tmpfs）：新建对话也是同一台机器，所以不整轮只读，命令仍可运行以便
    // 删除文件，写入工具与附件导入被拒绝。访客满额时整轮只读，新建对话即换一台临时环境
    const cleanable = Boolean(owner.userId);
    if (resources.state === 'degraded' || (resources.state === 'limited' && !cleanable)) {
      markReadOnly(resources.reason);
      return;
    }
    let diskFull = resources.state === 'limited' ? resources.reason : undefined;
    options.sandboxDiskUsedBytes = resources.usage?.workspaceBytes;
    const directories = [
      `${SANDBOX_OUTPUT_DIR}/${turnKey}`,
      `pending/${turnKey}`,
      ...(persistent ? [`chats/${owner.conversationId}`] : []),
    ];
    let prepared;
    try {
      prepared = await this.sandbox.exec(
        owner.ownerId,
        `/bin/mkdir -p ${directories.map(directory => shellQuote(directory)).join(' ')}`,
        { signal: context.signal },
      );
    } catch (error) {
      const current = await this.sandbox.resourceStatus(owner.ownerId);
      if (current.state === 'writable') throw error;
      if (current.state === 'degraded' || !cleanable) {
        markReadOnly(current.reason);
        return;
      }
      diskFull = current.reason;
    }
    if (
      !diskFull &&
      (!prepared || prepared.exitCode !== 0 || prepared.aborted || prepared.timedOut)
    )
      throw new PrimitiveInputError('本轮沙箱目录准备失败');
    options.__sandboxTurnPrepared = true;
    options.sandboxDiskFull = diskFull;
    if (diskFull) {
      options.sandboxInputs = [];
      return;
    }
    await this.skills.prepare(owner);
    const attachments = Array.isArray(options.attachments)
      ? (options.attachments as SandboxAttachmentInput[])
      : [];
    const fileIds = attachments
      .map(item => (typeof item?.fileId === 'string' ? item.fileId.trim() : ''))
      .filter(Boolean)
      .slice(0, ATTACHMENT_MAX_COUNT);
    if (fileIds.length === 0) return;

    const inputs: string[] = [];
    try {
      const files = await this.fileAssets.readFilesForRuntime({
        userId: owner.userId,
        visitorId: owner.visitorId,
        fileIds,
        maxFiles: ATTACHMENT_MAX_COUNT,
        maxFileSizeMb: ATTACHMENT_MAX_MB,
      });
      const used = new Set<string>();
      for (const file of files) {
        let name = safeFileName(file.name || file.originalName || `${file.sourceRef}.${file.ext}`);
        if (used.has(name)) {
          const ext = path.posix.extname(name);
          name = `${name.slice(0, name.length - ext.length)}-${used.size + 1}${ext}`;
        }
        used.add(name);
        const target = `${SANDBOX_INPUT_DIR}/${turnKey}/${name}`;
        await this.sandbox.writeFile(owner.ownerId, target, file.buffer);
        options.sandboxImportedBytes =
          Number(options.sandboxImportedBytes || 0) + file.buffer.length;
        inputs.push(`${target}（${formatBytes(file.buffer.length)}）`);
      }
    } catch {
      Logger.warn('附件放入沙箱失败', LOG_CONTEXT);
    }
    options.sandboxInputs = inputs;
  }

  async describeForSystemPrompt(context: ToolExecutionContext): Promise<string | undefined> {
    const options = context?.input?.context?.options as Record<string, any> | undefined;
    const owner = resolveOwner(options);
    if (!owner) return undefined;
    if (isSandboxClosedForOwner(owner)) {
      return '## Files and execution\n- File and command tools require login. Mention this only when needed for the task.';
    }

    if (options?.__sandboxTurnPrepared !== true)
      return '## Files and execution\n- File and command tools are unavailable this turn. If needed for the task, briefly explain and suggest retrying.';
    const persistent = options.sandboxPersistent === true;
    const policy = await this.sandbox.resolvePolicy(owner.ownerId);
    const lines: string[] = persistent
      ? [
          '## Files and execution',
          "- /workspace is the user's persistent personal computer, shared by all of their conversations. Files, installed packages and settings stay between conversations. Paths are relative to /workspace.",
          `- Keep this conversation's working files in chats/${owner.conversationId}/. Other folders may belong to the user's other conversations; do not delete or overwrite them unless asked.`,
          `- Put final deliverables and source files worth keeping in out/${turnKeyOf(options)}/ ($AGENT_OUTPUT_DIR in bash). After each command, files there are delivered to the user and moved to artifacts/${turnKeyOf(options)}/; writing the same file again delivers a new version, so do drafts and test runs in chats/${owner.conversationId}/ first. The app shows delivered files to the user automatically; when some are only helper or intermediate files, call present_files to choose the deliverables. Do not add file links or image markup.`,
          '- Install dependencies in the workspace using Python venv or local npm packages; they persist. sudo/apt are unavailable. Restore files attached earlier in this conversation with read(fileRef).',
          `- Disk: ${Math.round(Number(options.sandboxDiskUsedBytes || 0) / 1024 / 1024)} MB used of ${Math.round(policy.workspaceMaxBytes / 1024 / 1024)} MB.`,
        ]
      : [
          '## Files and execution',
          '- Paths are relative to /workspace. Files are temporary; restore earlier conversation files with read(fileRef).',
          `- Put final deliverables and source files worth keeping in out/${turnKeyOf(options)}/ ($AGENT_OUTPUT_DIR in bash). After each command, files there are delivered to the user and moved to artifacts/${turnKeyOf(options)}/; writing the same file again delivers a new version, so keep drafts and intermediate files elsewhere. The app shows delivered files to the user automatically; when some are only helper or intermediate files, call present_files to choose the deliverables. Do not add file links or image markup.`,
          '- Install dependencies in the workspace using Python venv or local npm packages. sudo/apt are unavailable.',
        ];
    if (typeof options?.sandboxDiskFull === 'string') {
      lines.push(
        '- The workspace is full or over its quota: writing files and loading attachments are refused. Commands still run, so delete files the user no longer needs before continuing.',
      );
    }
    if (typeof options?.sandboxReadOnlyReason === 'string') {
      lines.push(
        '- The workspace is read-only: storage limits were reached or capacity could not be verified.',
        '- Attachments and skills were not loaded this turn. Read existing files or retry deliveries; writes require a successful storage capacity check.',
      );
    }
    lines.push(
      policy.networkMode === 'none'
        ? '- Network: unavailable.'
        : '- Network: public HTTP/HTTPS only; domain restrictions may apply.',
    );
    lines.push(
      `- Limits: ${policy.execTimeoutSec}s per command, ${policy.memoryMb} MB memory, ${Math.round(policy.maxOutputBytes / 1024)} KB command output.`,
    );

    const inputs = Array.isArray(options?.sandboxInputs)
      ? (options!.sandboxInputs as string[])
      : [];
    if (inputs.length > 0) {
      lines.push('- Files for this turn:');
      for (const input of inputs) lines.push(`  - ${input}`);
    }

    const skills = await this.skills.index(owner.ownerId);
    if (skills) {
      lines.push(
        '- Skills: when relevant, read and follow the matching SKILL.md. Resolve its relative paths from that skill directory.',
      );
      lines.push(skills);
    }
    return lines.join('\n');
  }

  async execute(
    toolName: string,
    args: unknown,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const owner = resolveOwner(context?.input?.context?.options);
    if (!owner) return this.executeInOwner(toolName, args, context);
    // 访客关闭沙箱时不必排队：直接返回固定文案的失败结果
    if (isSandboxClosedForOwner(owner)) return this.executeInOwner(toolName, args, context);
    return this.serialized(`session:${owner.sessionId}`, () =>
      this.executeInOwner(toolName, args, context),
    );
  }

  private async serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const task = (this.ownerOperations.get(key) || Promise.resolve()).then(operation);
    const settled = task.then(
      (): undefined => undefined,
      (): undefined => undefined,
    );
    this.ownerOperations.set(key, settled);
    try {
      return await task;
    } finally {
      if (this.ownerOperations.get(key) === settled) this.ownerOperations.delete(key);
    }
  }

  /** 同一台沙箱上同一路径的 write / edit 串行：多个对话并发改同一文件时不丢更新 */
  private withFileLock<T>(
    owner: OwnerRef,
    target: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.serialized(`file:${owner.ownerId}\0${target}`, operation);
  }

  private async executeInOwner(
    toolName: string,
    args: unknown,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const startedAt = Date.now();
    const toolId = context?.toolCallId || `${toolName}_${startedAt}`;
    const parsed = withoutUnsetArguments(toolName, parseArgs(args));
    const options = context?.input?.context?.options as Record<string, any> | undefined;
    const owner = resolveOwner(options);
    const displayName = this.getDisplayName(toolName, parsed) || toolName;

    const fail = (
      message: string,
      details?: Record<string, unknown>,
      files: CapturedArtifact[] = [],
    ): ToolResult =>
      createLayeredToolResult({
        id: toolId,
        type: 'tool',
        toolName,
        displayName,
        name: displayName,
        status: 'error',
        input: parsed,
        // 模型看到的文件引用用本对话共享的编号，与 read(fileRef) 查到的是同一个文件
        fileRefMappingStore: context.fileRefMappingStore,
        rawOutput: {
          error: message,
          ...(details ? { details } : {}),
          ...(files.length ? { files } : {}),
        },
        // 错误原文作为权威正文交给模型（多行说明保持原样，不转成 JSON）
        modelText: 'faithful',
        toolResult: {
          status: 'error',
          modelContent: message,
          assets: files.map(file => ({
            fileId: file.fileId,
            role: file.role,
            displayName: file.name,
            mimeType: file.mime,
            size: file.size,
          })),
        },
        time: Date.now(),
        duration: Date.now() - startedAt,
      });
    if (isSandboxClosedForOwner(owner)) {
      return fail('访客模式未开放沙箱工具，请登录后再试');
    }
    if (owner && this.sandbox.isSessionRetired(owner.sessionId)) {
      return fail('会话已删除，沙箱不可再使用');
    }
    const ok = (
      content: string,
      extra: {
        files?: CapturedArtifact[];
        details?: Record<string, unknown>;
        media?: Awaited<ReturnType<typeof storeToolMedia>>;
      } = {},
    ): ToolResult => {
      for (const file of extra.files || [])
        context.fileRefMappingStore?.registerFile(file.fileId, {
          name: file.name,
          mime: file.mime,
          size: file.size,
          origin: 'tool_output',
          refKind: 'output_file',
        });
      const result = createLayeredToolResult({
        id: toolId,
        type: 'tool',
        toolName,
        displayName,
        name: displayName,
        status: 'success',
        input: parsed,
        fileRefMappingStore: context.fileRefMappingStore,
        rawOutput: {
          content,
          ...(extra.files && extra.files.length > 0 ? { files: extra.files } : {}),
          ...(extra.details ? { details: extra.details } : {}),
        },
        time: Date.now(),
        duration: Date.now() - startedAt,
        // 文件内容与命令输出作为权威正文按原文交给模型（只替换平台私有信息）
        modelText: 'faithful',
        toolResult: {
          status: 'success' as const,
          modelContent: extra.media
            ? [{ type: 'text' as const, text: content }, extra.media.part]
            : content,
          // 产物同时作为权威 assets（只含 fileId 等公开身份）下发：默认前端投影会剥掉
          // display.files 里的私有文件句柄，前端靠 assets 才能在流式期间就渲染文件卡片
          ...(extra.media || (extra.files && extra.files.length > 0)
            ? {
                assets: [
                  ...(extra.media ? [extra.media.asset] : []),
                  ...(extra.files || [])
                    .filter(file => file.fileId)
                    .map(file => ({
                      fileId: file.fileId,
                      role: file.role,
                      displayName: file.name,
                      ...(file.mime ? { mimeType: file.mime } : {}),
                      ...(Number.isFinite(Number(file.size)) ? { size: Number(file.size) } : {}),
                    })),
                ],
              }
            : {}),
        },
      });
      if (extra.media)
        result.internal = { ...result.internal, fileRefs: context.fileRefMappingStore!.snapshot() };
      return result;
    };

    if (!parsed) return fail('工具参数必须是对象');
    if (!owner) return fail('沙箱需要登录用户或访客身份');

    let mutationDispatched = false;
    const markMutationDispatched = () => {
      mutationDispatched = true;
    };
    /** 结果不确定时记下失败在哪一步（固定文案，不含参数和原始异常），运维据此定位 */
    let stage: MutationStage = 'write';
    /**
     * 变更完成后交付本轮产物。交付失败不改变变更本身的结果：文件保留在本轮 out/pending 目录，
     * 之后的命令或 recover_outputs 会重试；只有取消才按结果不确定处理。
     */
    // 交付文件在本对话共享表里的引用编号：与 ok() 登记的是同一张表，重复登记返回同一个编号
    const fileRefOf = (file: CapturedArtifact): string | undefined => {
      if (!file.fileId || !context.fileRefMappingStore) return undefined;
      try {
        return context.fileRefMappingStore.registerFile(file.fileId, {
          name: file.name,
          mime: file.mime,
          size: file.size,
          origin: 'tool_output',
          refKind: 'output_file',
        }).fileRef;
      } catch {
        return undefined;
      }
    };
    const deliverAfter = async (
      status: string,
      output = '',
      captureNote = '',
    ): Promise<ToolResult> => {
      stage = 'capture';
      let files: CapturedArtifact[];
      let failure = '';
      try {
        files = await this.captureArtifactsInOwner(owner, options, context.signal);
      } catch (error) {
        if (context.signal?.aborted) throw error;
        const reason = deliveryFailureReason(error);
        Logger.warn(`沙箱产物交付失败（${reason.log}）`, LOG_CONTEXT);
        files = error instanceof ArtifactDeliveryError ? error.files : [];
        failure = ` [文件交付未完成${reason.model ? `：${reason.model}` : ''}；文件保留在本轮 out/pending 目录，之后的命令会自动重试交付，也可以单独调用 recover_outputs]`;
      }
      // 状态、交付结果放在最前：输出很长时模型只看到首尾摘录，末尾的说明会被截掉
      // 开头只给个概要（完整清单与路径在结尾）：名字过长时截短，免得挤掉命令输出的预算
      const delivered = files.length
        ? ` [已交付给用户 ${files.length} 个文件：${files
            .slice(0, 5)
            .map(file => (file.name.length > 40 ? `${sliceUtf16(file.name, 40)}…` : file.name))
            .join('、')}${files.length > 5 ? ' 等' : ''}]`
        : '';
      const head = `${status}${failure}${delivered}`;
      // 先算状态、捕获与交付说明，再把剩下的预算分给命令输出（只能截取已捕获的内容，头尾保留）
      const tail = captureNote ? `\n${captureNote}` : '';
      const frame = this.withArtifactNote(`${head}${tail}`, files, fileRefOf).length;
      // 清单里写出了引用编号的文件，结果后面不会再补文件引用行；没列进清单或没有编号的按完整名称预留
      const notInline = files.filter(
        (file, index) => index >= LISTED_FILES_MAX || !fileRefOf(file),
      );
      const body = output
        ? fitHeadTail(
            sanitizeFaithfulText(output),
            primitiveBodyBudget(frame, fileRefLinesReserve(notInline)),
          )
        : '';
      return ok(
        this.withArtifactNote(`${head}${body ? `\n${body}` : ''}${tail}`, files, fileRefOf),
        { files },
      );
    };
    try {
      if (context.signal?.aborted) return fail('工具调用已取消');
      const turnKey = turnKeyOf(options);
      if (options?.__sandboxTurnPrepared !== true)
        throw new PrimitiveInputError('沙箱交付登记未完成，请重试本轮');
      if (
        options.sandboxReadOnlyReason &&
        !(toolName === 'bash' && parsed.recover_outputs === true) &&
        toolName !== 'ls' &&
        (toolName !== 'read' || parsed.fileRef !== undefined)
      )
        throw new PrimitiveInputError('本轮工作区只读，请释放容量后重试');
      if (toolName === 'write' || toolName === 'edit') {
        const target = resolveWorkspacePath(String(parsed.path || ''));
        if (target.startsWith('out/') && !target.startsWith(`out/${turnKey}/`))
          throw new PrimitiveInputError(`本轮产物必须写入 out/${turnKey}/`);
      }
      switch (toolName as PrimitiveToolName) {
        case 'read': {
          if (parsed.fileRef !== undefined)
            return ok(await this.materializeFile(owner, parsed, context));
          const read = await this.readTool(owner, parsed, context);
          return typeof read === 'string' ? ok(read) : ok(read.text, { media: read.media });
        }
        case 'ls':
          return ok(await this.lsTool(owner, parsed));
        case 'write': {
          stage = 'write';
          const summary = await this.writeTool(
            owner,
            parsed,
            markMutationDispatched,
            context.signal,
          );
          return await deliverAfter(summary);
        }
        case 'edit': {
          stage = 'write';
          const summary = await this.editTool(
            owner,
            parsed,
            markMutationDispatched,
            context.signal,
          );
          return await deliverAfter(summary);
        }
        case 'bash': {
          if (parsed.recover_outputs !== undefined) {
            // timeout 对重试交付没有作用，有的模型总会带上；其他参数说明混入了别的操作
            if (
              parsed.recover_outputs !== true ||
              Object.keys(parsed).some(key => key !== 'recover_outputs' && key !== 'timeout')
            )
              throw new PrimitiveInputError('重试交付须单独传 recover_outputs: true');
            stage = 'capture';
            const files = await this.captureArtifactsInOwner(owner, options, context.signal, true);
            return ok(
              this.withArtifactNote(
                '已重试本会话登记的文件交付；临时文件保持原位。',
                files,
                fileRefOf,
              ),
              { files },
            );
          }
          if (parsed.save_skill !== undefined || parsed.delete_skill !== undefined) {
            if (
              parsed.command !== undefined ||
              (parsed.save_skill !== undefined && parsed.delete_skill !== undefined)
            )
              throw new PrimitiveInputError('保存、删除技能与执行命令须分开调用');
            return ok(await this.skills.manage(owner, parsed, options.sandboxPersistent === true));
          }
          stage = 'exec';
          const { status, output, captureNote, outputHeld, timedOut, aborted, durationMs } =
            await this.bashTool(owner, parsed, context, markMutationDispatched);
          if (aborted || context.signal?.aborted) throw new ToolOutcomeUnknownError();
          // 被强制终止（超过时间上限或内存不足）的结局是确定的：交给模型调整，不中止整轮。
          // 这次写进交付目录的文件可能写了一半：先整体挪开，不随同批后续命令、下一轮或重启后的补交交付；
          // 挪不开（沙箱不可用等）按结果不确定处理
          if (timedOut) {
            const held = await this.holdIncompleteOutputs(owner.ownerId, turnKey);
            const head = `${status} ${killedCommandNote(durationMs, held)}`;
            const tail = captureNote ? `\n${captureNote}` : '';
            const body = output
              ? fitHeadTail(
                  sanitizeFaithfulText(output),
                  primitiveBodyBudget(head.length + tail.length),
                )
              : '';
            return ok(`${head}${body ? `\n${body}` : ''}${tail}`);
          }
          // 主进程已结束但输出没有自然结束（多半是后台进程继承了输出）：后台可能还在写交付目录，
          // 本次不自动交付，文件留在原处，之后的命令或 recover_outputs 会交付
          if (outputHeld) {
            const tail = `${captureNote ? `\n${captureNote}` : ''}\n${OUTPUT_HELD_NOTE}`;
            const body = output
              ? fitHeadTail(
                  sanitizeFaithfulText(output),
                  primitiveBodyBudget(status.length + tail.length),
                )
              : '';
            return ok(`${status}${body ? `\n${body}` : ''}${tail}`);
          }
          // 退出码写在状态行（[exit N·耗时]），不再塞进 details：
          // details 是展示层保留给「可展开列表」（搜索结果等）的字段，塞对象会被当成搜索结果条目
          return await deliverAfter(status, output, captureNote);
        }
        default:
          return fail(`未知工具：${toolName}`);
      }
    } catch (error) {
      if (mutationDispatched) {
        Logger.warn(UNKNOWN_OUTCOME_MESSAGES[stage], LOG_CONTEXT);
        throw new ToolOutcomeUnknownError();
      }
      const message =
        error instanceof ArtifactDeliveryError ||
        error instanceof PrimitiveInputError ||
        error instanceof SandboxOperationError
          ? error.message
          : '沙箱工具执行或交付失败，请稍后重试。';
      Logger.warn('沙箱工具执行或交付失败', LOG_CONTEXT);
      if (error instanceof ArtifactDeliveryError)
        for (const file of error.files)
          context.fileRefMappingStore?.registerFile(file.fileId, {
            name: file.name,
            mime: file.mime,
            size: file.size,
            origin: 'tool_output',
            refKind: 'output_file',
          });
      return fail(message, undefined, error instanceof ArtifactDeliveryError ? error.files : []);
    }
  }

  private async readTool(
    owner: OwnerRef,
    args: Record<string, any>,
    context: ToolExecutionContext,
  ): Promise<string | { text: string; media: Awaited<ReturnType<typeof storeToolMedia>> }> {
    const requested = resolveWorkspacePath(String(args.path || ''));
    if (!requested) throw new PrimitiveInputError('path 不能为空');
    const [found] = await this.sandbox
      .listDir(owner.ownerId, path.posix.dirname(requested) || '', {
        maxEntries: 5000,
      })
      .then(entries => entries.filter(item => item.path === requested));
    if (found) return this.readEntry(owner, requested, found, args, context);
    // 本轮产物交付后已从 out/ 移到归档目录：按原路径读取时改读最新一版的归档副本
    const archived = await this.findArchivedOutput(owner, requested);
    if (archived?.missing)
      throw new PrimitiveInputError(
        `${requested} 最新交付的版本 ${archived.missing} 已不存在（可能被删除或移走）；需要旧版本请用 ls 查看 artifacts/ 后直接读取具体路径`,
      );
    if (archived?.candidates)
      throw new PrimitiveInputError(
        archived.incomplete
          ? `${requested} 的归档目录文件过多，无法确定最新版本，请用 ls 查看 artifacts/ 后直接读取具体路径${
              archived.candidates.length
                ? `；已找到：\n${archived.candidates
                    .slice(0, 10)
                    .map(candidate => `- ${candidate}`)
                    .join('\n')}`
                : ''
            }`
          : `${requested} 已交付过多个版本，请直接读取其中一个：\n${archived.candidates
              .slice(0, 10)
              .map(candidate => `- ${candidate}`)
              .join('\n')}`,
      );
    if (!archived?.entry) throw new PrimitiveInputError(`文件不存在：${requested}`);
    const target = resolveWorkspacePath(archived.entry.path);
    const note = `[${requested} 已交付给用户并移到 ${target}，以下是归档副本]\n`;
    const result = await this.readEntry(owner, target, archived.entry, args, context);
    return typeof result === 'string' ? note + result : { ...result, text: note + result.text };
  }

  /**
   * out/<轮次>/<路径> 交付后位于 artifacts/<轮次>/<内容哈希>/<路径>。
   * 优先用本轮交付记录定点定位最新一版，记录的那一版已不在时报错；没有记录（如服务重启或跨轮）时只有一版就用它，多版或枚举不完整时不猜，列出候选。
   */
  private async findArchivedOutput(
    owner: OwnerRef,
    target: string,
  ): Promise<
    | { entry?: SandboxFileEntry; candidates?: string[]; incomplete?: boolean; missing?: string }
    | undefined
  > {
    const prefix = `${SANDBOX_OUTPUT_DIR}/`;
    const slash = target.indexOf('/', prefix.length);
    if (!target.startsWith(prefix) || slash < 0) return undefined;
    const turnKey = target.slice(prefix.length, slash);
    const relative = target.slice(slash + 1);
    // 有本轮交付记录时定点查询那一版，不依赖可能被截断的整体枚举
    const latest = this.deliveredOutputs.get(deliveryKey(owner.ownerId, turnKey, relative));
    if (latest) {
      const [recorded] = (
        await this.sandbox.listDir(owner.ownerId, path.posix.dirname(latest), { maxEntries: 5000 })
      ).filter(entry => entry.path === latest && entry.type === 'file');
      if (recorded) return { entry: recorded };
      // 记录的最新一版已被删除或移走：不退回旧版冒充最新
      return { missing: latest };
    }
    const root = `${SANDBOX_ARTIFACT_DIR}/${turnKey}`;
    const entries = await this.sandbox.listDir(owner.ownerId, root, {
      recursive: true,
      maxEntries: ARCHIVE_LOOKUP_MAX_ENTRIES,
    });
    const candidates = entries
      .filter(entry => {
        const rest = resolveWorkspacePath(entry.path).slice(root.length + 1);
        return (
          entry.type === 'file' && /^[0-9a-f]{64}\//u.test(rest) && rest.slice(65) === relative
        );
      })
      .map(entry => ({ entry, path: resolveWorkspacePath(entry.path) }));
    // 枚举达到上限时列表可能不完整：不推断「只有一版」，交给模型按候选或 ls 指定
    if (entries.length >= ARCHIVE_LOOKUP_MAX_ENTRIES)
      return { candidates: candidates.map(item => item.path), incomplete: true };
    if (candidates.length === 1) return { entry: candidates[0].entry };
    if (candidates.length > 1) return { candidates: candidates.map(item => item.path) };
    return undefined;
  }

  private async readEntry(
    owner: OwnerRef,
    target: string,
    entry: SandboxFileEntry,
    args: Record<string, any>,
    context: ToolExecutionContext,
  ): Promise<string | { text: string; media: Awaited<ReturnType<typeof storeToolMedia>> }> {
    if (entry.type === 'dir') throw new PrimitiveInputError(`${target} 是目录，请用 ls`);

    const mimeType = mime.lookup(target) || 'application/octet-stream';
    if ((mimeType.startsWith('image/') || mimeType.startsWith('audio/')) && !isTextMime(mimeType)) {
      if (entry.size > TOOL_MEDIA_MAX_BYTES) return `[媒体文件超过 10 MB 模型读取上限] ${target}`;
      const buffer = await this.sandbox.readFile(owner.ownerId, target, {
        maxBytes: TOOL_MEDIA_MAX_BYTES,
        signal: context.signal,
      });
      const media = await storeToolMedia(this.fileAssets, {
        buffer,
        name: safeFileName(target),
        mime: mimeType,
        sourceKey: `read:${target}`,
        context,
      });
      return {
        text: `已读取媒体文件 ${target}（${formatBytes(buffer.length)}）；媒体来自工具输出。`,
        media,
      };
    }
    if (entry.size > READ_MAX_BYTES && !isTextMime(mimeType)) {
      return `[二进制文件] ${target}，${formatBytes(entry.size)}，类型 ${mimeType}。可用 bash 调用相应工具处理（例如 pdftotext、tesseract、ffprobe）。`;
    }
    if (entry.size > READ_MAX_BYTES) {
      const offset = Math.max(1, Math.floor(Number(args.offset)) || 1);
      const limit = Math.max(1, Math.min(2000, Math.floor(Number(args.limit)) || 200));
      const result = await this.sandbox.exec(
        owner.ownerId,
        `/usr/bin/sed -n '${offset},${offset + limit - 1}p' ${shellQuote(target)}`,
        { timeoutSec: 30, maxOutputBytes: READ_MAX_BYTES },
      );
      if (result.exitCode !== 0)
        throw new PrimitiveInputError(`${target} 读取失败（exit ${result.exitCode}）`);
      return renderLargeFilePage(
        target,
        entry.size,
        offset,
        limit,
        result.stdout,
        result.stdoutTruncated ?? result.truncated,
      );
    }

    const buffer = await this.sandbox.readFile(owner.ownerId, target, {
      maxBytes: READ_MAX_BYTES,
      signal: context.signal,
    });
    if (!isTextMime(mimeType) && looksBinary(buffer)) {
      return `[二进制文件] ${target}，${formatBytes(buffer.length)}，类型 ${mimeType}。可用 bash 调用相应工具处理。`;
    }
    // 先对完整内容做原文净化，再按行截断
    const text = sanitizeFaithfulText(buffer.toString('utf8'));
    const offset = Number(args.offset);
    const limit = Number(args.limit);
    const ranged =
      (Number.isInteger(offset) && offset > 1) || (Number.isInteger(limit) && limit > 0);
    const budget = primitiveBodyBudget(READ_HEADER_RESERVE);
    if (!ranged && text.length <= budget) return text;
    const lines = splitLines(text);
    const start = ranged ? Math.max(1, Number.isInteger(offset) ? offset : 1) : 1;
    const count = ranged && Number.isInteger(limit) && limit > 0 ? limit : lines.length;
    return renderLineWindow(target, lines.slice(start - 1, start - 1 + count), start, budget, {
      total: lines.length,
    });
  }

  private async lsTool(owner: OwnerRef, args: Record<string, any>): Promise<string> {
    const target = resolveWorkspacePath(String(args.path || ''));
    const entries = await this.sandbox.listDir(owner.ownerId, target, {
      recursive: Boolean(args.recursive),
      maxEntries: LS_MAX_ENTRIES,
    });
    if (entries.length === 0) return `${target || '/workspace'} 为空`;
    const lines = splitLines(
      sanitizeFaithfulText(
        entries
          .sort((a, b) => a.path.localeCompare(b.path))
          .map(entry =>
            entry.type === 'dir'
              ? `${entry.path}/`
              : `${entry.path}  ${formatBytes(entry.size)}${entry.type === 'symlink' ? '  (symlink)' : ''}`,
          )
          .join('\n'),
      ),
    );
    const window = fitLinesFromStart(lines, primitiveBodyBudget(READ_HEADER_RESERVE));
    const notes = [
      ...(window.count < lines.length
        ? [`只显示了前 ${window.count} 项，共 ${lines.length} 项；可以 ls 子目录分别查看`]
        : []),
      ...(entries.length >= LS_MAX_ENTRIES
        ? [`已达 ${LS_MAX_ENTRIES} 项上限，列表可能不完整`]
        : []),
    ];
    const listing = window.count > 0 ? lines.slice(0, window.count).join('\n') : window.text;
    return notes.length ? `${listing}\n[${notes.join('；')}]` : listing;
  }

  private async writeTool(
    owner: OwnerRef,
    args: Record<string, any>,
    onDispatch: () => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const target = resolveWorkspacePath(requireStringArg(args, 'path'));
    if (!target) throw new PrimitiveInputError('path 不能为空');
    // 缺参或类型不对不能当成空串写入：持久盘上会把原文件清空且无法恢复
    const content = requireStringArg(args, 'content', '写空文件请传空字符串');
    await this.withFileLock(owner, target, () =>
      this.sandbox.writeFile(owner.ownerId, target, content, { onDispatch, signal }),
    );
    return `已写入 ${target}（${formatBytes(Buffer.byteLength(content))}）`;
  }

  private async editTool(
    owner: OwnerRef,
    args: Record<string, any>,
    onDispatch: () => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const target = resolveWorkspacePath(requireStringArg(args, 'path'));
    if (!target) throw new PrimitiveInputError('path 不能为空');
    const oldText = requireStringArg(args, 'oldText');
    const newText = requireStringArg(args, 'newText', '删除这段文字请传空字符串');
    if (!oldText) throw new PrimitiveInputError('oldText 不能为空');
    // 读取与写回在同一把文件锁内：另一个对话的 write / edit 不会在两者之间插入而被覆盖
    await this.withFileLock(owner, target, async () => {
      const current = (
        await this.sandbox.readFile(owner.ownerId, target, { maxBytes: 4 * 1024 * 1024, signal })
      ).toString('utf8');
      const first = current.indexOf(oldText);
      if (first < 0) throw new PrimitiveInputError('oldText 在文件中不存在，请先 read 确认原文');
      if (current.indexOf(oldText, first + oldText.length) >= 0) {
        throw new PrimitiveInputError('oldText 在文件中出现多次，请提供更长的唯一片段');
      }
      const next = current.slice(0, first) + newText + current.slice(first + oldText.length);
      await this.sandbox.writeFile(owner.ownerId, target, next, { onDispatch, signal });
    });
    return `已编辑 ${target}`;
  }

  private async bashTool(
    owner: OwnerRef,
    args: Record<string, any>,
    context: ToolExecutionContext,
    onDispatch: () => void,
  ): Promise<{
    status: string;
    output: string;
    captureNote: string;
    outputHeld: boolean;
    exitCode: number;
    timedOut: boolean;
    aborted: boolean;
    durationMs: number;
  }> {
    const command = String(args.command || '').trim();
    if (!command) throw new PrimitiveInputError('command 不能为空');
    const timeout = Number(args.timeout);
    // 绝对路径：模型先 cd 到子目录再写 $AGENT_OUTPUT_DIR 时，产物仍落在本轮的产物目录里被回收
    const outputDirectory = `${SANDBOX_WORKSPACE}/${SANDBOX_OUTPUT_DIR}/${turnKeyOf(context.input.context.options)}`;
    const result = await this.sandbox.exec(owner.ownerId, command, {
      ...(Number.isFinite(timeout) && timeout > 0 ? { timeoutSec: Math.floor(timeout) } : {}),
      signal: context?.signal,
      env: {
        AGENT_OUTPUT_DIR: outputDirectory,
      },
      // 超出捕获上限时保留开头与结尾（报错与结果多在结尾），驱动在两段之间写明没保留多少
      outputTail: true,
      onDispatch,
    });
    const parts: string[] = [];
    if (result.stdout.trim()) parts.push(result.stdout.trimEnd());
    if (result.stderr.trim()) parts.push(`[stderr]\n${result.stderr.trimEnd()}`);
    return {
      captureNote: result.truncated
        ? '[输出超过捕获上限，只保留了开头和结尾，中间缺失；需要完整输出时把输出重定向到文件，再用 read 分段读取]'
        : '',
      status: `[exit ${result.exitCode}${result.truncated ? '，输出已截断' : ''}${result.outputHeld ? '，输出未结束、已停止捕获' : ''}，${result.durationMs} ms]`,
      outputHeld: Boolean(result.outputHeld),
      output: parts.join('\n'),
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      aborted: result.aborted,
      durationMs: result.durationMs,
    };
  }

  /** 只认领本轮文件；失败保留 pending，active 后才归档。 */
  async captureArtifacts(
    owner: OwnerRef,
    options: Record<string, any> | undefined,
    signal?: AbortSignal,
  ): Promise<CapturedArtifact[]> {
    return this.serialized(`session:${owner.sessionId}`, () =>
      this.captureArtifactsInOwner(owner, options, signal),
    );
  }

  private async captureArtifactsInOwner(
    owner: OwnerRef,
    options: Record<string, any> | undefined,
    signal?: AbortSignal,
    readOnly = false,
  ): Promise<CapturedArtifact[]> {
    const recovered: CapturedArtifact[] = [];
    try {
      const turns = options?.sandboxGeneration
        ? await this.fileAssets.listSandboxTurns(
            turnRegistry(owner, String(options.sandboxGeneration)),
          )
        : [];
      for (const previous of turns) {
        if (previous.turnId === options?.turnId) continue;
        recovered.push(
          ...(await this.captureTurnArtifacts(
            owner,
            { ...options, turnId: previous.turnId, messageId: previous.messageId },
            signal,
            readOnly,
            false,
          )),
        );
        await this.fileAssets.completeSandboxTurn(previous.fileId);
      }
      recovered.push(...(await this.captureTurnArtifacts(owner, options, signal, readOnly)));
      if (readOnly)
        for (const turn of turns)
          if (turn.turnId === options?.turnId)
            await this.fileAssets.completeSandboxTurn(turn.fileId);
      return recovered;
    } catch (error) {
      if (error instanceof ArtifactDeliveryError) recovered.push(...error.files);
      throw new ArtifactDeliveryError(
        recovered,
        error instanceof ArtifactDeliveryError ? error.cause : error,
      );
    }
  }

  private async captureTurnArtifacts(
    owner: OwnerRef,
    options: Record<string, any> | undefined,
    signal?: AbortSignal,
    readOnly = false,
    /** 只记录当前轮的交付（轮次结束时清理）；补交的旧轮次不记录 */
    recordDelivery = true,
  ): Promise<CapturedArtifact[]> {
    const turnKey = turnKeyOf(options);
    const outputRoot = `${SANDBOX_OUTPUT_DIR}/${turnKey}`;
    const pendingRoot = `pending/${turnKey}`;
    const captured: CapturedArtifact[] = (
      await this.fileAssets.listTurnOutputs({
        userId: owner.userId,
        visitorId: owner.visitorId,
        messageId: options!.messageId,
        turnId: turnKey,
      })
    ).map(file => ({ ...file, type: mediaTypeOf(file.mime), role: 'final' }));
    const processFile = async (pendingPath: string, relative: string) => {
      if (signal?.aborted) throw new PrimitiveInputError('文件交付已取消');
      const buffer = await this.sandbox.readFile(owner.ownerId, pendingPath, {
        maxBytes: ARTIFACT_MAX_BYTES,
        signal,
      });
      const hash = createHash('sha256').update(buffer).digest('hex');
      const archived = `${SANDBOX_ARTIFACT_DIR}/${turnKey}/${hash}/${relative}`;
      const name = safeFileName(relative);
      const mimeType = mime.lookup(name) || 'application/octet-stream';
      const projection = await this.fileAssets.createFromBuffer({
        buffer,
        name,
        mime: mimeType,
        userId: owner.userId,
        visitorId: owner.visitorId,
        messageId: options!.messageId,
        purpose: 'tool_output',
        category: 'generated',
        visibility: 'private',
        delivery: { turnId: turnKey, sourceKey: relative },
        signal,
      });
      if (signal?.aborted) throw new PrimitiveInputError('文件交付已取消');
      if (!readOnly) await this.moveInSandbox(owner.ownerId, pendingPath, archived, hash);
      if (!readOnly && recordDelivery) {
        const key = deliveryKey(owner.ownerId, turnKey, relative);
        this.deliveredOutputs.delete(key);
        this.deliveredOutputs.set(key, archived);
        if (this.deliveredOutputs.size > 5000)
          this.deliveredOutputs.delete(this.deliveredOutputs.keys().next().value!);
      }
      const artifact: CapturedArtifact = {
        type: mediaTypeOf(mimeType),
        name,
        fileId: projection.fileId,
        role: 'final',
        mime: projection.mime,
        size: projection.size,
        previewUrl: projection.previewUrl,
        downloadUrl: projection.downloadUrl,
        sandboxPath: readOnly ? pendingPath : archived,
      };
      const existingIndex = captured.findIndex(file => file.fileId === artifact.fileId);
      if (existingIndex >= 0) captured[existingIndex] = artifact;
      else captured.push(artifact);
    };
    try {
      for (const root of [pendingRoot, outputRoot]) {
        const entries = await this.sandbox.listDir(owner.ownerId, root, {
          recursive: true,
          maxEntries: 1000,
        });
        const files = entries.filter(entry => entry.type === 'file');
        if (entries.length >= 1000 || files.length > ARTIFACT_MAX_COUNT)
          throw new PrimitiveInputError('产物数量超过上限');
        for (const entry of files) {
          const source = resolveWorkspacePath(entry.path);
          if (!source.startsWith(`${root}/`)) throw new PrimitiveInputError('产物路径不属于本轮');
          const relative = source.slice(root.length + 1);
          if (entry.size > ARTIFACT_MAX_BYTES)
            throw new PrimitiveInputError('产物文件超过 100 MB 上限');
          const pendingPath = `${pendingRoot}/${relative}`;
          if (!readOnly && root === outputRoot)
            await this.moveInSandbox(owner.ownerId, source, pendingPath);
          await processFile(readOnly ? source : pendingPath, relative);
        }
      }
      if (signal?.aborted) throw new PrimitiveInputError('文件交付已取消');
      return captured;
    } catch (error) {
      throw new ArtifactDeliveryError(captured, error);
    }
  }

  private async materializeFile(
    owner: OwnerRef,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<string> {
    if (args.path !== undefined || typeof args.fileRef !== 'string')
      throw new PrimitiveInputError('read 请指定 path 或 fileRef');
    const ref = args.fileRef;
    const mapping = context.fileRefMappingStore;
    const entry = ref.startsWith('file_')
      ? mapping?.findByFileId(ref)
      : mapping?.findByFileRef(ref);
    const attachments = context.input.context?.options?.attachments;
    const attachment = Array.isArray(attachments)
      ? attachments.find(item => item?.fileId === ref)
      : undefined;
    const fileId = entry?.fileId || attachment?.fileId;
    if (!fileId) throw new PrimitiveInputError('该文件不在本对话的可用文件引用中');
    const options = context.input.context!.options!;
    const used = Number(options.sandboxImportedBytes || 0);
    if (used >= 200 * 1024 ** 2) throw new PrimitiveInputError('本轮文件载入达到 200 MB 上限');
    const [file] = await this.fileAssets.readFilesForRuntime({
      userId: owner.userId,
      visitorId: owner.visitorId,
      fileIds: [fileId],
      maxFiles: 1,
      maxFileSizeMb: Math.min(50, (200 * 1024 ** 2 - used) / 1024 ** 2),
    });
    // 目录与文件名都不放文件资产 ID：模型看到的文字会替换掉资产 ID，路径就不能再用
    const directory = createHash('sha256').update(fileId).digest('hex').slice(0, 16);
    const name = safeFileName(file.name).replace(/file_[0-9A-Za-z]{24}/g, 'file');
    const target = `in/files/${directory}/${name}`;
    await this.sandbox.writeFile(owner.ownerId, target, file.buffer);
    options.sandboxImportedBytes = used + file.buffer.length;
    return `文件已恢复到 /workspace/${target}（${formatBytes(file.buffer.length)}）。可用 read(path) 或 bash 继续处理。`;
  }

  private withArtifactNote(
    text: string,
    files: CapturedArtifact[],
    fileRefOf: (file: CapturedArtifact) => string | undefined = () => undefined,
  ): string {
    if (files.length === 0) return text;
    const listed = files.slice(0, LISTED_FILES_MAX);
    const more =
      files.length > LISTED_FILES_MAX ? `\n- 另有 ${files.length - LISTED_FILES_MAX} 个文件` : '';
    // 归档路径里已含文件名：只列路径；写上引用编号，结果后面就不用再补一遍文件引用行
    const list = listed
      .map(file => {
        const ref = fileRefOf(file);
        const size = formatBytes(file.size || 0);
        return file.sandboxPath
          ? `- ${file.sandboxPath}（${size}${ref ? `，fileRef=${ref}` : ''}）`
          : `- ${file.name}（${size}${ref ? `，fileRef=${ref}` : ''}；不在工作区，用 read(fileRef) 读取）`;
      })
      .join('\n');
    const pathNote = listed.some(file => file.sandboxPath)
      ? '已从输出目录移到上列路径，需要查看时读这些路径；'
      : '';
    return `${text}\n\n[已交付给用户的文件]\n${list}${more}\n（${pathNote}再次写入同名文件会再交付一个新版本，还要修改请先在对话目录里改好再放回）`;
  }

  /**
   * 把本轮交付目录整体改名为 out/<轮次>.held.<随机>，再建回空的交付目录（原本为空就删掉暂存目录）：同一目录内改名，
   * 不会被符号链接引到别处（交付目录本身被换成符号链接时按失败处理）；新名字不是任何轮次的交付目录，
   * 之后的命令、下一轮与重启后都不会自动交付。
   * 只用 POSIX 命令，本机驱动也可用；返回暂存目录，没有文件时为空。
   */
  private async holdIncompleteOutputs(ownerId: string, turnKey: string): Promise<string> {
    const source = `${SANDBOX_OUTPUT_DIR}/${turnKey}`;
    const target = `${source}.held.${randomBytes(6).toString('hex')}`;
    const result = await this.sandbox.exec(
      ownerId,
      [
        '# agent_hold_incomplete',
        // 交付目录的父目录进不去（含符号链接的中间目录无权限）时查不出本轮文件在不在，不能当作没有文件：
        // 只有既不存在也不是符号链接才算没有，否则必须能解析成可进入的目录
        `{ [ ! -e ${shellQuote(SANDBOX_OUTPUT_DIR)} ] && [ ! -L ${shellQuote(SANDBOX_OUTPUT_DIR)} ]; } || { [ -d ${shellQuote(SANDBOX_OUTPUT_DIR)} ] && [ -x ${shellQuote(SANDBOX_OUTPUT_DIR)} ]; } || exit 6`,
        `[ ! -L ${shellQuote(source)} ] || exit 4`,
        `if [ -d ${shellQuote(source)} ]; then`,
        `  /bin/mv -- ${shellQuote(source)} ${shellQuote(target)} && /bin/mkdir -p ${shellQuote(source)} || exit 5`,
        // 能删掉说明原本是空目录；删不掉就是有文件（不靠文件名文本判断空目录）
        `  /bin/rmdir -- ${shellQuote(target)} 2>/dev/null || echo held`,
        'fi',
      ].join('\n'),
      { timeoutSec: 30 },
    );
    if (result.exitCode !== 0 || result.timedOut || result.aborted)
      throw new PrimitiveInputError('未完成文件暂存失败');
    return result.stdout.includes('held') ? target : '';
  }

  private async moveInSandbox(
    ownerId: string,
    from: string,
    to: string,
    expectedHash = '',
  ): Promise<void> {
    const source = resolveWorkspacePath(from);
    const target = resolveWorkspacePath(to);
    const result = await this.sandbox.exec(
      ownerId,
      `/usr/bin/python3 -I -c ${shellQuote(MOVE_FILE_SCRIPT)} ${shellQuote(source)} ${shellQuote(target)} ${shellQuote(expectedHash)}`,
      { timeoutSec: 30 },
    );
    if (result.exitCode !== 0 || result.timedOut || result.aborted)
      throw new PrimitiveInputError('产物认领或归档失败');
  }
}

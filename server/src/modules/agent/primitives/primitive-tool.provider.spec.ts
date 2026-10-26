import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as nodePath from 'node:path';
import { Logger } from '@nestjs/common';
import { PRIMITIVE_TOOL_NAMES, PrimitiveToolProvider } from './primitive-tool.provider';
import {
  createLayeredToolResult,
  FAITHFUL_TEXT_TOOL_NAMES,
  getToolModelContent,
  toBackendToolCall,
  toFrontendToolCall,
} from '../../chatLog/tool-result-payload';
import { getHistoricalToolModelContent } from '../../chatLog/context-history-projection';
import { summarizeSkill } from './skill-library';
import type { FileAssetService } from '../../fileAsset/fileAsset.service';
import { FileRefMappingStore } from '../../fileAsset/file-refs';
import { OutputCollector } from '../../sandbox/exec-support';
import { SandboxOperationError, type SandboxFileEntry } from '../../sandbox/sandbox.port';
import {
  ToolOutcomeUnknownError,
  type ToolExecutionContext,
} from '../tools/tool-provider.interface';

/** 直接调用回收接口的夹具：沙箱归属与对话归属同为该对话目录 */
const OWNER = {
  ownerId: 'user-7:conversation:11',
  sessionId: 'user-7:conversation:11',
  conversationId: '11',
  userId: 7,
};

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;
declare const beforeEach: any;

/** 内存文件系统假沙箱：只实现 provider 用到的接口 */
function fakeSandbox() {
  const files = new Map<string, Buffer>();
  const execCalls: string[] = [];
  const api = {
    files,
    execCalls,
    isResident: () => true,
    isSessionRetired: jest.fn(() => false),
    beginTurn: jest.fn(async () => ({ handle: { id: 'generation-1' }, release: jest.fn() })),
    resourceStatus: jest.fn(async () => ({ state: 'writable' })),
    resolvePolicy: jest.fn(async () => ({
      memoryMb: 512,
      cpus: 1,
      pidsLimit: 256,
      networkMode: 'none',
      execTimeoutSec: 120,
      maxOutputBytes: 256 * 1024,
      idleStopMinutes: 15,
    })),
    writeFile: jest.fn(
      async (_owner: string, path: string, content: Buffer | string, options?: any) => {
        options?.onDispatch?.();
        files.set(path, Buffer.isBuffer(content) ? content : Buffer.from(content));
      },
    ),
    readFile: jest.fn(async (_owner: string, path: string, options?: { maxBytes?: number }) => {
      const content = files.get(path);
      if (!content) throw new Error(`文件不存在：${path}`);
      if (options?.maxBytes !== undefined && content.length > options.maxBytes) {
        throw new Error('文件超过读取上限');
      }
      return content;
    }),
    listDir: jest.fn(async (_owner: string, dir: string, options?: { recursive?: boolean }) => {
      const prefix = dir && dir !== '.' ? `${dir}/` : '';
      const entries: SandboxFileEntry[] = [];
      const dirs = new Set<string>();
      for (const [path, content] of files) {
        if (!path.startsWith(prefix)) continue;
        const rest = path.slice(prefix.length);
        const parts = rest.split('/');
        if (parts.length > 1) {
          const sub = `${prefix}${parts[0]}`;
          if (!dirs.has(sub)) {
            dirs.add(sub);
            entries.push({ path: sub, type: 'dir', size: 0, mtimeMs: 0 });
          }
          if (!options?.recursive) continue;
        }
        entries.push({ path, type: 'file', size: content.length, mtimeMs: 0 });
      }
      return entries;
    }),
    exec: jest.fn(async (_owner: string, command: string, options?: any) => {
      options?.onDispatch?.();
      execCalls.push(command);
      if (command.includes('# agent_move_file')) {
        const match = command.match(/ '([^']+)' '([^']+)' '([^']*)'$/u);
        if (match) {
          const from = match[1].replace('/workspace/', '');
          const to = match[2].replace('/workspace/', '');
          const content = files.get(from);
          if (content) {
            files.delete(from);
            files.set(to, content);
          }
        }
        return {
          exitCode: 0,
          stdout: '',
          stderr: '',
          timedOut: false,
          aborted: false,
          truncated: false,
          durationMs: 1,
        };
      }
      if (command === 'boom') {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'bad',
          timedOut: false,
          aborted: false,
          truncated: false,
          durationMs: 1,
        };
      }
      if (command.startsWith('# agent_hold_incomplete')) {
        const [, source, target] = command.match(/mv -- '([^']+)' '([^']+)'/u)!;
        let held = false;
        for (const [path, content] of [...files]) {
          if (!path.startsWith(`${source}/`)) continue;
          files.delete(path);
          files.set(`${target}/${path.slice(source.length + 1)}`, content);
          held = true;
        }
        return {
          exitCode: 0,
          stdout: held ? 'held\n' : '',
          stderr: '',
          timedOut: false,
          aborted: false,
          truncated: false,
          durationMs: 1,
        };
      }
      if (command === 'sleep') {
        return {
          exitCode: 137,
          stdout: 'partial\n',
          stderr: '',
          timedOut: true,
          aborted: false,
          truncated: false,
          durationMs: 120_000,
        };
      }
      if (command === 'aborted') {
        return {
          exitCode: 137,
          stdout: '',
          stderr: '',
          timedOut: false,
          aborted: true,
          truncated: false,
          durationMs: 1,
        };
      }
      if (command.startsWith('make ')) {
        // 与真实端口一致：文件路径可写成 /workspace/... 或相对工作区
        files.set(
          `${options.env.AGENT_OUTPUT_DIR}/report.pdf`.replace(/^\/workspace\//u, ''),
          Buffer.from(command.includes('v2') ? '%PDF-1.4 fake v2' : '%PDF-1.4 fake'),
        );
        return {
          exitCode: 0,
          stdout: 'made\n',
          stderr: '',
          timedOut: false,
          aborted: false,
          truncated: false,
          durationMs: 5,
        };
      }
      return {
        exitCode: 0,
        stdout: `ran: ${command}\n`,
        stderr: '',
        timedOut: false,
        aborted: false,
        truncated: false,
        durationMs: 3,
      };
    }),
  };
  return api;
}

function fakeFileAssets() {
  const outputs = new Map<string, any>();
  return {
    completeSandboxTurn: jest.fn(),
    registerSandboxTurn: jest.fn(),
    listSandboxTurns: jest.fn(async (): ReturnType<FileAssetService['listSandboxTurns']> => []),
    listSandboxSkills: jest.fn(async (): ReturnType<FileAssetService['listSandboxSkills']> => []),
    listTurnOutputs: jest.fn(async (input: Parameters<FileAssetService['listTurnOutputs']>[0]) =>
      [...outputs.values()].filter(
        file =>
          file.owner === (input.userId || input.visitorId) &&
          file.messageId === input.messageId &&
          file.turnId === input.turnId,
      ),
    ),
    readFilesForRuntime: jest.fn(async ({ fileIds }: { fileIds: string[] }) =>
      fileIds.map((fileId, index) => ({
        sourceKind: 'file',
        sourceRef: fileId,
        name: index === 0 ? 'report.pdf' : 'notes.txt',
        originalName: index === 0 ? 'report.pdf' : 'notes.txt',
        mime: 'application/octet-stream',
        ext: 'pdf',
        size: 3,
        buffer: Buffer.from('abc'),
        origin: null as string | null,
      })),
    ),
    createFromBuffer: jest.fn(async (input: any) => {
      const result = {
        fileId: `fa_${input.name}`,
        name: input.name,
        mime: input.mime,
        size: input.buffer.length,
        category: 'generated',
        purpose: input.purpose,
        visibility: 'private',
        previewUrl: `/files/fa_${input.name}/preview`,
        downloadUrl: `/files/fa_${input.name}/download`,
      };
      outputs.set(result.fileId, {
        ...result,
        owner: input.userId || input.visitorId,
        messageId: input.messageId,
        turnId: input.delivery.turnId,
      });
      return result;
    }),
  };
}

function contextFor(options: Record<string, any>, extra: Record<string, any> = {}) {
  // Direct primitive unit tests model a successfully prepared host turn.
  options.__sandboxTurnPrepared ??= true;
  return {
    input: { messages: [], config: {}, context: { options } },
    ...extra,
  } as any;
}

describe('PrimitiveToolProvider', () => {
  it('declares only strictly validated ls calls safe to replay', () => {
    const provider = new PrimitiveToolProvider(fakeSandbox() as any, fakeFileAssets() as any);
    expect(provider.getReplayIntent('ls', { path: './out', recursive: true })).toEqual({
      policy: 'safe',
      payload: { path: 'out', recursive: true },
    });
    expect(provider.getReplayIntent('ls', { path: 'out', extra: true })).toEqual({
      policy: 'never',
    });
    expect(provider.getReplayIntent('ls', { path: '../private' })).toEqual({ policy: 'never' });
    for (const name of ['read', 'write', 'edit', 'bash']) {
      expect(provider.getReplayIntent(name, {})).toEqual({ policy: 'never' });
    }
  });

  it.each(['{}', [], null])(
    'rejects non-object tool arguments before sandbox access',
    async (args: unknown) => {
      const sandbox = fakeSandbox();
      const provider = new PrimitiveToolProvider(sandbox as any, fakeFileAssets() as any);
      const context = contextFor({
        userId: 7,
        conversationId: 11,
        turnId: 'turn_1',
        messageId: 'message_1',
      });
      for (const toolName of ['ls', 'write']) {
        const result = await provider.execute(toolName, args, context);
        expect(result.status).toBe('error');
        expect(JSON.stringify(result)).toContain('工具参数必须是对象');
      }
      expect(sandbox.listDir).not.toHaveBeenCalled();
      expect(sandbox.writeFile).not.toHaveBeenCalled();
      expect(sandbox.exec).not.toHaveBeenCalled();
    },
  );

  it('preserves distinct authenticated visitor identities at the sandbox boundary', async () => {
    const listDir = jest.fn().mockResolvedValue([]);
    const provider = new PrimitiveToolProvider(
      { listDir, isSessionRetired: () => false } as any,
      {} as any,
    );
    for (const visitorId of ['fixture/a', 'fixture_a']) {
      const context: ToolExecutionContext = {
        input: {
          messages: [],
          config: {},
          context: {
            options: {
              __sandboxTurnPrepared: true,
              conversationId: 11,
              visitorId,
              turnId: 'turn_identity',
              messageId: 'message_identity',
            },
          },
        },
      };
      expect((await provider.execute('ls', { path: 'work' }, context)).status).toBe('success');
    }
    expect(listDir.mock.calls.map((call: [string]) => call[0])).toEqual([
      'visitor-fixture/a:conversation:11',
      'visitor-fixture_a:conversation:11',
    ]);
  });
  let sandbox: ReturnType<typeof fakeSandbox>;
  let fileAssets: ReturnType<typeof fakeFileAssets>;
  let provider: PrimitiveToolProvider;
  const user = {
    userId: 7,
    conversationId: 11,
    chatId: 'msg-cid-1',
    messageId: 'msg-cid-1',
    turnId: 'turn_1',
  };

  beforeEach(() => {
    sandbox = fakeSandbox();
    fileAssets = fakeFileAssets();
    provider = new PrimitiveToolProvider(sandbox as any, fileAssets as any);
  });

  it('exposes exactly the five primitives and claims only them', async () => {
    const defs = await provider.getToolDefinitions();
    expect(defs.map(def => def.function.name)).toEqual(['read', 'write', 'edit', 'bash', 'ls']);
    expect(provider.canHandle('bash')).toBe(true);
    expect(provider.canHandle('web_search')).toBe(false);
    expect(provider.getRuntime()).toBe('sandbox');
    expect(provider.getToolCost()).toBe(0);
    expect(provider.getDisplayName('bash', { command: '  ls   -la ' })).toBe('bash · ls -la');
    expect(provider.getDisplayName('read', { path: 'a.txt' })).toBe('read · a.txt');
  });

  it('refuses to run without a user or visitor identity', async () => {
    const result = await provider.execute('ls', {}, contextFor({}));
    expect(result.status).toBe('error');
    expect(JSON.stringify(result)).toContain('沙箱需要登录用户');
  });

  it.each(['none', 'egress'])(
    'keeps current file and execution capabilities in the concise %s prompt',
    async (networkMode: string) => {
      sandbox.resolvePolicy.mockResolvedValue({
        ...(await sandbox.resolvePolicy()),
        networkMode,
      });
      const context = contextFor({ ...user, turnId: 'turn_prompt' });
      const section = await provider.describeForSystemPrompt(context);
      expect(section).toContain('/workspace');
      expect(section).toContain('temporary');
      expect(section).toContain('out/turn_prompt/');
      expect(section).toContain('$AGENT_OUTPUT_DIR');
      expect(section).toContain('read(fileRef)');
      expect(section).toContain('venv');
      expect(section).toContain(
        networkMode === 'none' ? 'Network: unavailable' : 'public HTTP/HTTPS',
      );
      expect(section).not.toMatch(/sandbox|container|沙箱|容器|跨会话持久/iu);
      const defs = await provider.getToolDefinitions(context);
      const bash = defs.find(def => def.function.name === 'bash')!.function;
      expect(bash.parameters.properties).toHaveProperty('recover_outputs');
      expect(bash.parameters.properties).toHaveProperty('save_skill');
      expect(bash.parameters.properties).toHaveProperty('delete_skill');
      expect(sandbox.exec).not.toHaveBeenCalled();
    },
  );

  it('describes login-gated capabilities without offering unavailable tools', async () => {
    const previous = process.env.SANDBOX_VISITOR_ENABLED;
    process.env.SANDBOX_VISITOR_ENABLED = 'false';
    try {
      const context = contextFor({ visitorId: 'prompt_guest', conversationId: 11 });
      const section = await provider.describeForSystemPrompt(context);
      expect(section).toContain('login');
      expect(section).not.toMatch(/sandbox|container|沙箱|容器/iu);
      expect(await provider.getToolDefinitions(context)).toEqual([]);
      expect(sandbox.resolvePolicy).not.toHaveBeenCalled();
      expect(sandbox.exec).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.SANDBOX_VISITOR_ENABLED;
      else process.env.SANDBOX_VISITOR_ENABLED = previous;
    }
  });

  it('copies attachments into in/<turn>/ once per turn and lists them in the prompt', async () => {
    const options: Record<string, any> = {
      ...user,
      __sandboxTurnPrepared: false,
      attachments: [{ fileId: 'f1', name: 'report.pdf' }, { fileId: 'f2' }, { name: 'no-id' }],
    };
    await provider.prepareTurn(contextFor(options));
    await provider.prepareTurn(contextFor(options));

    expect(fileAssets.readFilesForRuntime).toHaveBeenCalledTimes(1);
    expect(fileAssets.readFilesForRuntime.mock.calls[0][0]).toMatchObject({
      userId: 7,
      fileIds: ['f1', 'f2'],
    });
    expect([...sandbox.files.keys()]).toEqual(['in/turn_1/report.pdf', 'in/turn_1/notes.txt']);
    expect(options.sandboxInputs).toHaveLength(2);

    const section = await provider.describeForSystemPrompt(contextFor(options));
    expect(section).toContain('Network: unavailable');
    expect(section).toContain('in/turn_1/report.pdf');
  });

  it('lists skills from skills/*/SKILL.md in the prompt section', async () => {
    sandbox.files.set(
      'skills/pdf/SKILL.md',
      Buffer.from('---\nname: pdf\ndescription: 把 Markdown 转成 PDF\n---\n# PDF\n'),
    );
    sandbox.files.set('skills/plain/SKILL.md', Buffer.from('# Plain\n\n第一段说明。\n'));
    sandbox.files.set('skills/broken/README.md', Buffer.from('not a skill'));
    // 常见公开技能的 SKILL.md 有几十 KB：超过旧的 4 KiB 读取上限也要进索引
    sandbox.files.set(
      'skills/big/SKILL.md',
      Buffer.from(
        `---\nname: big\ndescription: 处理大型报表\n---\n# Big\n\n${'详细步骤。\n'.repeat(1000)}`,
      ),
    );
    // 描述进系统提示，单个技能的超长描述要截断
    sandbox.files.set(
      'skills/wordy/SKILL.md',
      Buffer.from(`---\ndescription: ${'x'.repeat(1500)}\n---\n`),
    );

    const section = await provider.describeForSystemPrompt(contextFor(user));
    expect(section).toContain('pdf: 把 Markdown 转成 PDF (skills/pdf/SKILL.md)');
    expect(section).toContain('plain: 第一段说明。');
    expect(section).toContain('big: 处理大型报表 (skills/big/SKILL.md)');
    expect(section).toContain(`wordy: ${'x'.repeat(1024)}… (skills/wordy/SKILL.md)`);
    expect(section).not.toContain('broken');
    expect(summarizeSkill('')).toBe('No description');
  });

  it('write / read / edit / ls operate inside the workspace', async () => {
    const write = await provider.execute(
      'write',
      { path: 'notes/a.txt', content: 'hello\nworld\n' },
      contextFor(user),
    );
    expect(write.status).toBe('success');

    const read = await provider.execute('read', { path: 'notes/a.txt' }, contextFor(user));
    expect(read.status).toBe('success');
    expect(JSON.stringify(read)).toContain('hello');

    const paged = await provider.execute(
      'read',
      { path: 'notes/a.txt', offset: 2, limit: 1 },
      contextFor(user),
    );
    expect(JSON.stringify(paged)).toContain('world');
    expect(JSON.stringify(paged)).toContain('第 2-2 行');

    const edit = await provider.execute(
      'edit',
      { path: 'notes/a.txt', oldText: 'world', newText: 'there' },
      contextFor(user),
    );
    expect(edit.status).toBe('success');
    expect(sandbox.files.get('notes/a.txt')?.toString()).toBe('hello\nthere\n');

    const ambiguous = await provider.execute(
      'edit',
      { path: 'notes/a.txt', oldText: 'e', newText: 'x' },
      contextFor(user),
    );
    expect(ambiguous.status).toBe('error');
    expect(JSON.stringify(ambiguous)).toContain('出现多次');

    const missing = await provider.execute(
      'edit',
      { path: 'notes/a.txt', oldText: 'nope', newText: 'x' },
      contextFor(user),
    );
    expect(missing.status).toBe('error');

    const ls = await provider.execute('ls', { path: 'notes' }, contextFor(user));
    expect(JSON.stringify(ls)).toContain('notes/a.txt');

    // 显式传空串是合法的：写空文件、删掉一段文字
    const emptied = await provider.execute(
      'edit',
      { path: 'notes/a.txt', oldText: 'there\n', newText: '' },
      contextFor(user),
    );
    expect(emptied.status).toBe('success');
    expect(sandbox.files.get('notes/a.txt')?.toString()).toBe('hello\n');

    const escape = await provider.execute('read', { path: '../etc/passwd' }, contextFor(user));
    expect(escape.status).toBe('error');
    expect(JSON.stringify(escape)).toContain('越出工作区');
  });

  it('rejects write / edit with missing or non-string arguments without touching the file', async () => {
    sandbox.files.set('notes/keep.md', Buffer.from('keep me\n'));
    const writesBefore = sandbox.writeFile.mock.calls.length;
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['write', { path: 'notes/keep.md' }, 'content 必须是字符串，不能省略'],
      ['write', { path: 'notes/keep.md', content: null }, 'content 必须是字符串，不能省略'],
      ['write', { path: 'notes/keep.md', content: { text: 'x' } }, 'content 必须是字符串'],
      ['write', { path: { name: 'notes/keep.md' }, content: 'x' }, 'path 必须是字符串'],
      ['edit', { path: 'notes/keep.md', oldText: 'keep' }, 'newText 必须是字符串，不能省略'],
      ['edit', { path: 'notes/keep.md', oldText: 'keep', newText: 1 }, 'newText 必须是字符串'],
      ['edit', { path: 'notes/keep.md', newText: 'x' }, 'oldText 必须是字符串，不能省略'],
    ];
    for (const [toolName, args, message] of cases) {
      const result = await provider.execute(toolName, args, contextFor(user));
      expect(result.status).toBe('error');
      expect(JSON.stringify(result)).toContain(message);
    }
    expect(sandbox.writeFile.mock.calls.length).toBe(writesBefore);
    expect(sandbox.files.get('notes/keep.md')?.toString()).toBe('keep me\n');
    expect(sandbox.files.has('[object Object]')).toBe(false);
  });

  it('bash returns output with exit code and captures out/ artifacts', async () => {
    const plain = await provider.execute(
      'bash',
      { command: 'echo hi' },
      contextFor(user, { toolCallId: 'call_9' }),
    );
    expect(plain.id).toBe('call_9');
    expect(plain.status).toBe('success');
    expect(JSON.stringify(plain)).toContain('ran: echo hi');
    expect(JSON.stringify(plain)).toContain('[exit 0');

    const produced = await provider.execute('bash', { command: 'make report' }, contextFor(user));
    expect(produced.status).toBe('success');
    // 绝对路径：命令里先 cd 到别处也能写进本轮产物目录
    const makeCall = sandbox.exec.mock.calls.find((call: any[]) => call[1] === 'make report');
    expect(makeCall?.[2]?.env?.AGENT_OUTPUT_DIR).toBe('/workspace/out/turn_1');
    expect(fileAssets.createFromBuffer).toHaveBeenCalledTimes(1);
    expect(fileAssets.createFromBuffer.mock.calls[0][0]).toMatchObject({
      name: 'report.pdf',
      mime: 'application/pdf',
      userId: 7,
      purpose: 'tool_output',
      visibility: 'private',
    });
    const text = JSON.stringify(produced);
    expect(text).toContain('已交付给用户的文件');
    expect(text).toContain('fa_report.pdf');
    expect(sandbox.files.has('out/turn_1/report.pdf')).toBe(false);
    expect(
      [...sandbox.files.keys()].some(path =>
        /^artifacts\/turn_1\/[0-9a-f]{64}\/report.pdf$/.test(path),
      ),
    ).toBe(true);

    const failed = await provider.execute('bash', { command: 'boom' }, contextFor(user));
    expect(failed.status).toBe('success');
    expect(JSON.stringify(failed)).toContain('[stderr]');
    expect(JSON.stringify(failed)).toContain('[exit 1');

    const warn = jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
    await expect(
      provider.execute('bash', { command: 'aborted' }, contextFor(user)),
    ).rejects.toBeInstanceOf(ToolOutcomeUnknownError);
    // 只记失败阶段的固定文案，不带命令与原始异常
    expect(warn).toHaveBeenCalledWith(
      '沙箱命令被中止、超时或执行失败，工具结果不确定',
      expect.any(String),
    );
    warn.mockRestore();
  });

  it('reports a command killed at the time limit and holds its possibly partial outputs back', async () => {
    sandbox.files.set('out/turn_1/half.mp4', Buffer.from('partial video'));
    const killed = await provider.execute('bash', { command: 'sleep' }, contextFor(user));
    expect(killed.status).toBe('success');
    const text = JSON.stringify(killed);
    expect(text).toContain('partial');
    expect(text).toContain('命令在 120 秒时被强制终止');
    // 可能写了一半的文件移到本次新建的暂存目录，不交付，也不会被之后的命令或下一轮当成待交付文件
    const held = [...sandbox.files.keys()].find(path => path.endsWith('/half.mp4'))!;
    expect(held).toMatch(/^out\/turn_1\.held\.[0-9a-f]{12}\/half\.mp4$/u);
    expect(text).toContain(`已移到 ${held.slice(0, -'/half.mp4'.length)}/ 暂不交付`);
    expect(text).toContain('确认完好后移到 $AGENT_OUTPUT_DIR 即可交付');
    expect(sandbox.files.get(held)?.toString()).toBe('partial video');
    const next = await provider.execute('bash', { command: 'echo next' }, contextFor(user));
    expect(JSON.stringify(next)).not.toContain('half.mp4');
    expect(fileAssets.createFromBuffer).not.toHaveBeenCalled();

    // 模型确认完好后移到交付目录，下一条命令照常交付
    sandbox.files.set('out/turn_1/half.mp4', sandbox.files.get(held)!);
    sandbox.files.delete(held);
    const delivered = await provider.execute('bash', { command: 'echo back' }, contextFor(user));
    expect(JSON.stringify(delivered)).toContain('half.mp4');

    // 没有交付文件时不提文件；移不走时不冒险交付半成品，按结果不确定处理
    const plain = await provider.execute('bash', { command: 'sleep' }, contextFor(user));
    expect(JSON.stringify(plain)).not.toContain('暂不交付');
    sandbox.files.set('out/turn_1/other.bin', Buffer.from('x'));
    const originalExec = sandbox.exec.getMockImplementation();
    sandbox.exec.mockImplementation(async (owner: string, command: string, options?: any) =>
      command.startsWith('# agent_hold_incomplete')
        ? {
            exitCode: 1,
            stdout: '',
            stderr: '',
            timedOut: false,
            aborted: false,
            truncated: false,
            durationMs: 1,
          }
        : originalExec!(owner, command, options),
    );
    const warn = jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
    await expect(
      provider.execute('bash', { command: 'sleep' }, contextFor(user)),
    ).rejects.toBeInstanceOf(ToolOutcomeUnknownError);
    warn.mockRestore();
    sandbox.exec.mockImplementation(originalExec!);
    expect(sandbox.files.has('out/turn_1/other.bin')).toBe(true);
  });

  it('runs the real hold script: sets aside odd names, cleans up empty dirs, fails when it cannot move', async () => {
    const root = mkdtempSync(nodePath.join(tmpdir(), 'hold-'));
    // 工作区里可写的 PATH 目录放了同名的假命令（什么都不做、直接成功）：暂存脚本必须用绝对路径，不能被顶替
    const fakeBin = nodePath.join(root, 'fake-bin');
    mkdirSync(fakeBin);
    for (const name of ['mv', 'mkdir', 'rmdir']) {
      writeFileSync(nodePath.join(fakeBin, name), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    }
    const originalExec = sandbox.exec.getMockImplementation()!;
    sandbox.exec.mockImplementation(async (owner: string, command: string, options?: any) => {
      if (!command.startsWith('# agent_hold_incomplete'))
        return originalExec(owner, command, options);
      const run = spawnSync('/bin/bash', ['--noprofile', '--norc', '-c', command], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` },
      });
      return {
        exitCode: run.status ?? -1,
        stdout: run.stdout,
        stderr: run.stderr,
        timedOut: false,
        aborted: false,
        truncated: false,
        durationMs: 1,
      };
    });
    const out = nodePath.join(root, 'out');
    const warn = jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
    try {
      // 名称只有换行的子目录：文本判断会以为是空目录
      mkdirSync(nodePath.join(out, 'turn_1', '\n'), { recursive: true });
      writeFileSync(nodePath.join(out, 'turn_1', '\n', 'half.mp4'), 'partial');
      const killed = JSON.stringify(
        await provider.execute('bash', { command: 'sleep' }, contextFor(user)),
      );
      const held = readdirSync(out).find(name => name.startsWith('turn_1.held.'))!;
      expect(killed).toContain(`已移到 out/${held}/ 暂不交付`);
      expect(readdirSync(nodePath.join(out, held, '\n'))).toEqual(['half.mp4']);
      expect(readdirSync(nodePath.join(out, 'turn_1'))).toEqual([]);

      // 空的交付目录：不提暂存，也不留下空的暂存目录
      const plain = JSON.stringify(
        await provider.execute('bash', { command: 'sleep' }, contextFor(user)),
      );
      expect(plain).not.toContain('暂不交付');
      expect(readdirSync(out).filter(name => name.startsWith('turn_1.held.'))).toEqual([held]);

      // 挪不动（父目录只读）：按结果不确定处理
      writeFileSync(nodePath.join(out, 'turn_1', 'again.bin'), 'x');
      chmodSync(out, 0o555);
      await expect(
        provider.execute('bash', { command: 'sleep' }, contextFor(user)),
      ).rejects.toBeInstanceOf(ToolOutcomeUnknownError);
      // 父目录进不去：查不出文件在不在，也按结果不确定处理，不当作没有文件
      chmodSync(out, 0o600);
      await expect(
        provider.execute('bash', { command: 'sleep' }, contextFor(user)),
      ).rejects.toBeInstanceOf(ToolOutcomeUnknownError);
      // out 是符号链接、链上的中间目录进不去：同样不能当作没有交付目录
      chmodSync(out, 0o755);
      const box = nodePath.join(root, 'box');
      mkdirSync(nodePath.join(box, 'realout', 'turn_1'), { recursive: true });
      writeFileSync(nodePath.join(box, 'realout', 'turn_1', 'half.bin'), 'x');
      rmSync(out, { recursive: true, force: true });
      symlinkSync(nodePath.join('box', 'realout'), out);
      chmodSync(box, 0o000);
      try {
        await expect(
          provider.execute('bash', { command: 'sleep' }, contextFor(user)),
        ).rejects.toBeInstanceOf(ToolOutcomeUnknownError);
      } finally {
        chmodSync(box, 0o755);
      }
    } finally {
      warn.mockRestore();
      try {
        chmodSync(out, 0o755);
      } catch {
        // out 可能已换成符号链接
      }
      rmSync(root, { recursive: true, force: true });
      sandbox.exec.mockImplementation(originalExec);
    }
  });

  it('does not recover held-back partial outputs in a later turn or after a restart', async () => {
    const sandbox = fakeSandbox();
    const files = fakeFileAssets();
    files.listSandboxTurns.mockResolvedValue([
      { fileId: 'control_current', turnId: 'current', messageId: 'message_current' },
    ]);
    sandbox.files.set('out/current/half.mp4', Buffer.from('partial'));
    const turn = (turnId: string) =>
      contextFor({
        userId: 7,
        conversationId: 11,
        turnId,
        messageId: `message_${turnId}`,
        sandboxGeneration: 'generation-1',
      });
    const provider = new PrimitiveToolProvider(sandbox as any, files as any);
    const killed = await provider.execute('bash', { command: 'sleep' }, turn('current'));
    expect(JSON.stringify(killed)).toContain('暂不交付');
    // 服务重启后的下一轮补交旧轮次：挪开的半成品不在任何轮次的交付目录里，不会被交付
    const restarted = new PrimitiveToolProvider(sandbox as any, files as any);
    const next = await restarted.execute('bash', { command: 'echo next' }, turn('later'));
    expect(JSON.stringify(next)).not.toContain('half.mp4');
    expect(files.createFromBuffer).not.toHaveBeenCalled();
    expect(
      [...sandbox.files.keys()].some(path => /^out\/current\.held\.\w+\/half\.mp4$/u.test(path)),
    ).toBe(true);
  });

  it('logs only the fixed part of a delivery failure message', async () => {
    sandbox.files.set('out/turn_1/a.txt', Buffer.from('a'));
    sandbox.readFile.mockRejectedValueOnce(
      new SandboxOperationError('不是普通文件：private/name.txt'),
    );
    const warn = jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
    const ran = await provider.execute('bash', { command: 'echo one' }, contextFor(user));
    expect(warn).toHaveBeenCalledWith(
      '沙箱产物交付失败（SandboxOperationError：不是普通文件）',
      expect.any(String),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private/name.txt');
    warn.mockRestore();
    expect(JSON.stringify(ran)).toContain('文件交付未完成：不是普通文件：private/name.txt');
  });

  it('keeps the status and delivery result visible to the model when the output is long', async () => {
    const { getToolModelContent } = await import('../../chatLog/tool-result-payload');
    const long = Array.from({ length: 600 }, (_, i) => `progress ${i} ${'#'.repeat(40)}`).join(
      '\n',
    );
    const run = async (result: Record<string, unknown>) => {
      sandbox.exec.mockImplementationOnce(
        async (_owner: string, _command: string, options?: any) => {
          options?.onDispatch?.();
          return { stderr: '', aborted: false, truncated: false, ...result };
        },
      );
      const ran = await provider.execute('bash', { command: 'long' }, contextFor(user));
      return JSON.stringify(getToolModelContent(ran));
    };

    sandbox.files.set('out/turn_1/half.bin', Buffer.from('x'));
    const killed = await run({ exitCode: 137, stdout: long, timedOut: true, durationMs: 120_000 });
    expect(killed).toContain('[exit 137');
    expect(killed).toContain('命令在 120 秒时被强制终止');
    expect(killed).toMatch(/已移到 out\/turn_1\.held\.[0-9a-f]{12}\/ 暂不交付/u);

    sandbox.files.set('out/turn_1/report.pdf', Buffer.from('%PDF'));
    const delivered = await run({ exitCode: 0, stdout: long, timedOut: false, durationMs: 5 });
    expect(delivered).toContain('[exit 0');
    expect(delivered).toContain('已交付给用户 1 个文件：report.pdf');

    for (let i = 0; i < 21; i++) sandbox.files.set(`out/turn_1/p-${i}.txt`, Buffer.from(`${i}`));
    const warn = jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
    const failed = await run({ exitCode: 0, stdout: long, timedOut: false, durationMs: 5 });
    warn.mockRestore();
    expect(failed).toContain('文件交付未完成：产物数量超过上限');
  });

  it('keeps the run going when delivery fails after a command and says why', async () => {
    for (let i = 0; i < 21; i++)
      sandbox.files.set(`out/turn_1/page-${i}.txt`, Buffer.from(`p${i}`));
    const warn = jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
    const ran = await provider.execute('bash', { command: 'echo many' }, contextFor(user));
    expect(warn).toHaveBeenCalledWith(
      '沙箱产物交付失败（PrimitiveInputError：产物数量超过上限）',
      expect.any(String),
    );
    warn.mockRestore();
    expect(ran.status).toBe('success');
    const text = JSON.stringify(ran);
    expect(text).toContain('ran: echo many');
    expect(text).toContain('文件交付未完成：产物数量超过上限');
    expect(sandbox.files.has('out/turn_1/page-0.txt')).toBe(true);
  });

  it('shows the model file refs numbered by the shared store, matching read(fileRef)', async () => {
    const { FileRefMappingStore } = await import('../../fileAsset/file-refs');
    const { getToolModelContent } = await import('../../chatLog/tool-result-payload');
    const store = new FileRefMappingStore();
    fileAssets.createFromBuffer.mockImplementation(async (input: any) => ({
      fileId: `file_${createHash('sha256').update(input.name).digest('hex').slice(0, 24)}`,
      name: input.name,
      mime: input.mime,
      size: input.buffer.length,
      category: 'generated',
      purpose: input.purpose,
      visibility: 'private',
    }));
    const withStore = () => contextFor(user, { fileRefMappingStore: store });
    sandbox.files.set('out/turn_1/first.txt', Buffer.from('1'));
    await provider.execute('bash', { command: 'echo one' }, withStore());
    sandbox.files.set('out/turn_1/second.txt', Buffer.from('2'));
    const second = await provider.execute('bash', { command: 'echo two' }, withStore());

    const secondEntry = store.entries.find(entry => entry.name === 'second.txt');
    expect(secondEntry?.fileRef).toBe('output_file_2');
    // 每条结果不再各自从 1 编号：模型看到的引用就是共享表里的引用（写在交付清单的路径后面）
    expect(JSON.stringify(getToolModelContent(second))).toContain(
      '/second.txt（1 B，fileRef=output_file_2）',
    );
  });

  it('reads a delivered output through its archived copy when asked for the out/ path', async () => {
    const produced = await provider.execute('bash', { command: 'make report' }, contextFor(user));
    expect(JSON.stringify(produced)).toContain('需要查看时读这些路径');
    // 交付当下就提醒：再写同名文件会多交付一版，修改先在对话目录里完成
    expect(JSON.stringify(produced)).toContain('再次写入同名文件会再交付一个新版本');
    expect(sandbox.files.has('out/turn_1/report.pdf')).toBe(false);

    const read = await provider.execute(
      'read',
      { path: '/workspace/out/turn_1/report.pdf' },
      contextFor(user),
    );
    expect(read.status).toBe('success');
    expect(JSON.stringify(read)).toContain('以下是归档副本');
    expect(JSON.stringify(read)).toContain('artifacts/turn_1/');

    const missing = await provider.execute(
      'read',
      { path: 'out/turn_1/missing.pdf' },
      contextFor(user),
    );
    expect(missing.status).toBe('error');
    expect(JSON.stringify(missing)).toContain('文件不存在');
  });

  it('reads the version delivered last and lists versions once the turn record is gone', async () => {
    const hash = (text: string) => createHash('sha256').update(text).digest('hex');
    await provider.execute('bash', { command: 'make report' }, contextFor(user));
    await provider.execute('bash', { command: 'make report v2' }, contextFor(user));
    const latest = await provider.execute(
      'read',
      { path: 'out/turn_1/report.pdf' },
      contextFor(user),
    );
    expect(latest.status).toBe('success');
    expect(JSON.stringify(latest)).toContain(`artifacts/turn_1/${hash('%PDF-1.4 fake v2')}/`);

    // 没有本轮交付记录（重启、跨轮）时不按时间猜，列出候选让模型指定
    const restarted = new PrimitiveToolProvider(sandbox as any, fileAssets as any);
    const ambiguous = await restarted.execute(
      'read',
      { path: 'out/turn_1/report.pdf' },
      contextFor(user),
    );
    expect(ambiguous.status).toBe('error');
    const text = JSON.stringify(ambiguous);
    expect(text).toContain('已交付过多个版本');
    expect(text).toContain(hash('%PDF-1.4 fake v2'));
    expect(text).toContain(hash('%PDF-1.4 fake'));
  });

  it('finds the recorded version even when the archive listing is truncated', async () => {
    const hash = (text: string) => createHash('sha256').update(text).digest('hex');
    await provider.execute('bash', { command: 'make report' }, contextFor(user));
    await provider.execute('bash', { command: 'make report v2' }, contextFor(user));
    const listDir = sandbox.listDir.getMockImplementation();
    // 整体枚举恰好取满上限（驱动最多返回 maxEntries 条）且只列出旧版
    sandbox.listDir.mockImplementation(async (owner: string, dir: string, options?: any) => {
      if (dir !== 'artifacts/turn_1') return listDir(owner, dir, options);
      const filler = Array.from({ length: options.maxEntries - 1 }, (_, i) => ({
        path: `artifacts/turn_1/${'0'.repeat(64)}/filler-${i}.txt`,
        type: 'file',
        size: 1,
        mtimeMs: 0,
      }));
      const old = `artifacts/turn_1/${hash('%PDF-1.4 fake')}/report.pdf`;
      return [{ path: old, type: 'file', size: 13, mtimeMs: 0 }, ...filler];
    });
    const recorded = await provider.execute(
      'read',
      { path: 'out/turn_1/report.pdf' },
      contextFor(user),
    );
    expect(JSON.stringify(recorded)).toContain(`artifacts/turn_1/${hash('%PDF-1.4 fake v2')}/`);

    const restarted = new PrimitiveToolProvider(sandbox as any, fileAssets as any);
    const unsure = await restarted.execute(
      'read',
      { path: 'out/turn_1/report.pdf' },
      contextFor(user),
    );
    expect(unsure.status).toBe('error');
    expect(JSON.stringify(unsure)).toContain('无法确定最新版本');
  });

  it('does not fall back to an older version when the recorded one is gone', async () => {
    const hash = (text: string) => createHash('sha256').update(text).digest('hex');
    await provider.execute('bash', { command: 'make report' }, contextFor(user));
    await provider.execute('bash', { command: 'make report v2' }, contextFor(user));
    sandbox.files.delete(`artifacts/turn_1/${hash('%PDF-1.4 fake v2')}/report.pdf`);
    const gone = await provider.execute(
      'read',
      { path: 'out/turn_1/report.pdf' },
      contextFor(user),
    );
    expect(gone.status).toBe('error');
    expect(JSON.stringify(gone)).toContain('已不存在');
    expect(JSON.stringify(gone)).not.toContain('以下是归档副本');
  });

  it('keeps delivery records only for the running turn', async () => {
    await provider.execute('bash', { command: 'make report' }, contextFor(user));
    const records = (provider as any).deliveredOutputs as Map<string, string>;
    expect([...records.keys()].some(key => key.includes('\0turn_1\0'))).toBe(true);
    await provider.finishTurn(contextFor(user));
    expect(records.size).toBe(0);
  });

  it('reports archive lookup failures instead of a missing file', async () => {
    const listDir = sandbox.listDir.getMockImplementation();
    sandbox.listDir.mockImplementation(async (owner: string, dir: string, options?: any) => {
      if (dir.startsWith('artifacts/')) throw new Error('synthetic sandbox failure');
      return listDir(owner, dir, options);
    });
    const warn = jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
    const failed = await provider.execute(
      'read',
      { path: 'out/turn_1/report.pdf' },
      contextFor(user),
    );
    warn.mockRestore();
    expect(failed.status).toBe('error');
    expect(JSON.stringify(failed)).not.toContain('文件不存在');
  });

  it('treats optional arguments a model fills with empty values as unset', async () => {
    // 有的模型会把没用到的可选参数都填上空值，不能因此被当成重试交付或技能管理
    const filled = { recover_outputs: false, save_skill: '', delete_skill: '', timeout: 10 };
    const ran = await provider.execute('bash', { command: 'echo hi', ...filled }, contextFor(user));
    expect(ran.status).toBe('success');
    expect(JSON.stringify(ran)).toContain('ran: echo hi');

    await provider.execute('write', { path: 'notes/b.txt', content: 'filled\n' }, contextFor(user));
    const read = await provider.execute(
      'read',
      { path: 'notes/b.txt', fileRef: '', offset: null, limit: null },
      contextFor(user),
    );
    expect(read.status).toBe('success');
    expect(JSON.stringify(read)).toContain('filled');

    const execCalls = sandbox.exec.mock.calls.length;
    const recovered = await provider.execute(
      'bash',
      { ...filled, command: '', recover_outputs: true },
      contextFor(user),
    );
    expect(recovered.status).toBe('success');
    expect(JSON.stringify(recovered)).toContain('已重试本会话登记的文件交付');
    expect(sandbox.exec.mock.calls.length).toBe(execCalls);

    const mixed = await provider.execute(
      'bash',
      { ...filled, command: 'true', recover_outputs: true },
      contextFor(user),
    );
    expect(mixed.status).toBe('error');
    expect(JSON.stringify(mixed)).toContain('重试交付须单独传');
  });

  it('routes skill, fileRef and replay calls when every optional argument is filled', async () => {
    const deleteSandboxSkill = jest.fn(async (): Promise<void> => undefined);
    Object.assign(fileAssets, { deleteSandboxSkill });
    const args = {
      command: '',
      recover_outputs: false,
      save_skill: '',
      delete_skill: 'demo',
      timeout: 10,
    };
    const snapshot = { ...args };
    const deleted = await provider.execute('bash', args, contextFor(user));
    expect(deleted.status).toBe('success');
    expect(deleteSandboxSkill).toHaveBeenCalledWith(7, 'demo');
    // 归一化作用在副本上，模型原始参数保持不变
    expect(args).toEqual(snapshot);

    const restored = await provider.execute(
      'read',
      { path: '', fileRef: 'file_ref_1', offset: 0, limit: 0 },
      contextFor({ ...user, attachments: [{ fileId: 'file_ref_1' }] }),
    );
    expect(restored.status).toBe('success');
    // 恢复目录不放文件资产 ID：用 ID 的 SHA-256 前 16 位
    expect(sandbox.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      `in/files/${createHash('sha256').update('file_ref_1').digest('hex').slice(0, 16)}/report.pdf`,
      expect.any(Buffer),
    );

    expect(provider.getReplayIntent('ls', { path: null, recursive: null })).toMatchObject({
      policy: 'safe',
      payload: { recursive: false },
    });
  });

  it('keeps a completed write when delivery fails afterwards without exposing the raw error', async () => {
    const privateDetail = 'synthetic private artifact diagnostic';
    fileAssets.listTurnOutputs.mockRejectedValueOnce(new Error(privateDetail));
    const warn = jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);

    const written = await provider.execute(
      'write',
      { path: 'notes/kept.txt', content: 'kept' },
      contextFor(user),
    );

    // 写入已完成：交付失败不把整次调用变成结果不确定，只说明交付未完成，不带原始异常
    expect(sandbox.files.get('notes/kept.txt')?.toString()).toBe('kept');
    expect(written.status).toBe('success');
    expect(JSON.stringify(written)).toContain('文件交付未完成');
    expect(JSON.stringify(written)).not.toContain(privateDetail);
    expect(warn).toHaveBeenCalledWith('沙箱产物交付失败（Error）', expect.any(String));
    expect(JSON.stringify(warn.mock.calls)).not.toContain(privateDetail);
    warn.mockRestore();
  });
  it('isolates capture by turn even when the owner has two active conversations', async () => {
    sandbox.files.set('out/turn_1/a.txt', Buffer.from('first'));
    sandbox.files.set('out/turn_2/b.txt', Buffer.from('second'));
    const first = await provider.captureArtifacts(OWNER, user);
    expect(first.map(file => file.name)).toEqual(['a.txt']);
    expect(sandbox.files.has('out/turn_2/b.txt')).toBe(true);
    expect(fileAssets.createFromBuffer.mock.calls[0][0]).toMatchObject({
      messageId: 'msg-cid-1',
      delivery: { turnId: 'turn_1', sourceKey: 'a.txt' },
    });
  });

  it('retains pending bytes after upload failure and delivers once on retry', async () => {
    sandbox.files.set('out/turn_1/a.txt', Buffer.from('kept'));
    fileAssets.createFromBuffer.mockRejectedValueOnce(new Error('synthetic upload failure'));
    const warn = jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
    const failed = await provider.execute('bash', { command: 'echo retry' }, contextFor(user));
    warn.mockRestore();
    expect(JSON.stringify(failed)).toContain('文件交付未完成');
    expect(sandbox.files.get('pending/turn_1/a.txt')?.toString()).toBe('kept');
    const retried = await provider.captureArtifacts(OWNER, user);
    expect(retried).toHaveLength(1);
    expect(sandbox.files.has('pending/turn_1/a.txt')).toBe(false);
    expect((await provider.captureArtifacts(OWNER, user)).map(file => file.fileId)).toEqual(
      retried.map(file => file.fileId),
    );
  });

  it('serializes concurrent capture of the same turn', async () => {
    sandbox.files.set('out/turn_1/a.txt', Buffer.from('once'));
    const results = await Promise.all([
      provider.captureArtifacts(OWNER, user),
      provider.captureArtifacts(OWNER, user),
    ]);
    expect(results.map(files => files.map(file => file.fileId))).toEqual([
      ['fa_a.txt'],
      ['fa_a.txt'],
    ]);
    expect(fileAssets.createFromBuffer).toHaveBeenCalledTimes(1);
  });

  it('does not upload or archive artifacts after cancellation', async () => {
    sandbox.files.set('out/turn_1/a.txt', Buffer.from('keep'));
    const controller = new AbortController();
    controller.abort();
    const result = await provider.execute(
      'bash',
      { command: 'echo cancelled' },
      contextFor(user, { signal: controller.signal }),
    );
    expect(result.status).toBe('error');
    expect(fileAssets.createFromBuffer).not.toHaveBeenCalled();
    expect(sandbox.files.has('out/turn_1/a.txt')).toBe(true);
  });

  it('preserves separate archives when the same path produces new content', async () => {
    sandbox.files.set('out/turn_1/a.txt', Buffer.from('one'));
    await provider.captureArtifacts(OWNER, user);
    sandbox.files.set('out/turn_1/a.txt', Buffer.from('two'));
    await provider.captureArtifacts(OWNER, user);
    expect(
      [...sandbox.files.keys()].filter(path => path.startsWith('artifacts/turn_1/')),
    ).toHaveLength(2);
  });

  it('keeps pending data when archive fails after the asset becomes active', async () => {
    const originalExec = sandbox.exec.getMockImplementation();
    sandbox.exec.mockImplementation(async (owner: string, command: string, options?: unknown) =>
      command.includes('# agent_move_file') && command.includes(" 'artifacts/")
        ? {
            exitCode: 1,
            stdout: '',
            stderr: '',
            aborted: false,
            timedOut: false,
            truncated: false,
            durationMs: 1,
          }
        : originalExec(owner, command, options),
    );
    sandbox.files.set('out/turn_1/a.txt', Buffer.from('keep'));
    await expect(provider.captureArtifacts(OWNER, user)).rejects.toThrow('交付未完成');
    expect(sandbox.files.has('pending/turn_1/a.txt')).toBe(true);
    expect(fileAssets.createFromBuffer).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    'recovers active output after archive cancellation (move completed=%s)',
    async (moved: boolean) => {
      const controller = new AbortController();
      const originalExec = sandbox.exec.getMockImplementation();
      sandbox.exec.mockImplementation(async (owner: string, command: string, options?: unknown) => {
        if (command.includes('# agent_move_file') && command.includes(" 'artifacts/")) {
          controller.abort();
          if (!moved)
            return { exitCode: 137, stdout: '', stderr: '', aborted: true, timedOut: false };
        }
        return originalExec(owner, command, options);
      });
      sandbox.files.set('out/turn_1/a.txt', Buffer.from('recoverable'));
      await expect(
        provider.execute(
          'bash',
          { command: 'echo cancel' },
          contextFor(user, { signal: controller.signal }),
        ),
      ).rejects.toBeInstanceOf(ToolOutcomeUnknownError);
      sandbox.exec.mockImplementation(originalExec);
      const restarted = new PrimitiveToolProvider(sandbox as any, fileAssets as any);
      const recovered = await restarted.captureArtifacts(OWNER, user);
      expect(recovered.map(file => file.fileId)).toEqual(['fa_a.txt']);
      expect((await restarted.captureArtifacts(OWNER, user)).map(file => file.fileId)).toEqual([
        'fa_a.txt',
      ]);
      expect(await restarted.captureArtifacts(OWNER, { ...user, turnId: 'turn_2' })).toEqual([]);
    },
  );
});

describe('one persistent machine per signed-in user', () => {
  const base = { userId: 7, messageId: 'message_1', turnId: 'turn_1' };
  function persistentSandbox() {
    const sandbox = fakeSandbox();
    sandbox.beginTurn.mockResolvedValue({
      handle: { id: 'container-1', persistent: true },
      release: jest.fn(),
    } as any);
    sandbox.resourceStatus.mockResolvedValue({
      state: 'writable',
      usage: { workspaceBytes: 300 * 1024 ** 2 },
    } as any);
    sandbox.resolvePolicy.mockResolvedValue({
      ...await_policy(),
      workspaceMaxBytes: 4096 * 1024 ** 2,
    } as any);
    return sandbox;
  }
  function await_policy() {
    return {
      memoryMb: 512,
      cpus: 1,
      pidsLimit: 256,
      networkMode: 'none',
      execTimeoutSec: 120,
      maxOutputBytes: 256 * 1024,
      idleStopMinutes: 15,
    };
  }

  it('prepares the machine by user, registers deliveries by conversation and describes the computer', async () => {
    const sandbox = persistentSandbox();
    const files = fakeFileAssets();
    const provider = new PrimitiveToolProvider(sandbox as any, files as any);
    const options: any = { ...base, conversationId: 11 };
    const context = { input: { messages: [], config: {}, context: { options } } } as any;
    await provider.prepareTurn(context);
    expect(sandbox.beginTurn).toHaveBeenCalledWith('user-7');
    expect(files.registerSandboxTurn).toHaveBeenCalledWith({
      ownerId: 'user-7:conversation:11',
      generation: 'persistent',
      userId: 7,
      visitorId: undefined,
      turnId: 'turn_1',
      messageId: 'message_1',
    });
    expect(sandbox.execCalls[0]).toContain("'chats/11'");
    const prompt = await provider.describeForSystemPrompt(context);
    expect(prompt).toContain('persistent personal computer');
    expect(prompt).toContain('chats/11/');
    expect(prompt).toContain('Disk: 300 MB used of 4096 MB');
    expect(prompt).not.toContain('temporary');
  });

  it('runs tool calls from two conversations of the same user concurrently', async () => {
    const sandbox = persistentSandbox();
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const started: string[] = [];
    sandbox.exec.mockImplementation(async (_owner: string, command: string) => {
      started.push(command);
      if (command === 'slow') await gate;
      return { exitCode: 0, stdout: '', stderr: '', durationMs: 1 };
    });
    const provider = new PrimitiveToolProvider(sandbox as any, fakeFileAssets() as any);
    const first = provider.execute(
      'bash',
      { command: 'slow' },
      contextFor({ ...base, conversationId: 11 }),
    );
    await new Promise(resolve => setImmediate(resolve));
    const second = await provider.execute(
      'bash',
      { command: 'fast' },
      contextFor({ ...base, conversationId: 12, turnId: 'turn_2' }),
    );
    expect(second.status).toBe('success');
    expect(started).toEqual(['slow', 'fast']);
    expect(sandbox.exec.mock.calls.map(([owner]: [string]) => owner)).toEqual(['user-7', 'user-7']);
    release();
    expect((await first).status).toBe('success');
  });

  it('serializes edits of the same file across conversations', async () => {
    const sandbox = persistentSandbox();
    sandbox.files.set('shared.txt', Buffer.from('alpha beta'));
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const write = sandbox.writeFile.getMockImplementation();
    // 第一次编辑读完原文后卡在写回：没有文件锁时第二次编辑会基于旧内容写回，丢掉第一次的修改
    sandbox.writeFile.mockImplementationOnce(async (...args: any[]) => {
      await gate;
      return write(...args);
    });
    const provider = new PrimitiveToolProvider(sandbox as any, fakeFileAssets() as any);
    const first = provider.execute(
      'edit',
      { path: 'shared.txt', oldText: 'alpha', newText: 'ALPHA' },
      contextFor({ ...base, conversationId: 11 }),
    );
    await new Promise(resolve => setImmediate(resolve));
    const second = provider.execute(
      'edit',
      { path: 'shared.txt', oldText: 'beta', newText: 'BETA' },
      contextFor({ ...base, conversationId: 12, turnId: 'turn_2' }),
    );
    await new Promise(resolve => setImmediate(resolve));
    release();
    expect((await first).status).toBe('success');
    expect((await second).status).toBe('success');
    expect(sandbox.files.get('shared.txt')!.toString()).toBe('ALPHA BETA');
  });

  it('refuses a deleted conversation without touching the shared machine', async () => {
    const sandbox = persistentSandbox();
    sandbox.isSessionRetired.mockImplementation(
      (session: string) => session === 'user-7:conversation:11',
    );
    const provider = new PrimitiveToolProvider(sandbox as any, fakeFileAssets() as any);
    const options: any = { ...base, conversationId: 11 };
    await expect(
      provider.prepareTurn({ input: { messages: [], config: {}, context: { options } } } as any),
    ).rejects.toThrow('会话已删除');
    expect(sandbox.beginTurn).not.toHaveBeenCalled();
    const result = await provider.execute('ls', {}, contextFor({ ...base, conversationId: 11 }));
    expect(JSON.stringify(result)).toContain('会话已删除');
    expect(sandbox.listDir).not.toHaveBeenCalled();
    expect(
      (await provider.execute('ls', {}, contextFor({ ...base, conversationId: 12 }))).status,
    ).toBe('success');
  });
});

describe('sandbox turn preparation gate', () => {
  it('fails closed before generation exists and never reacquires via tools or prompt', async () => {
    const sandbox = fakeSandbox();
    sandbox.beginTurn.mockRejectedValueOnce(new Error('admission busy'));
    const provider = new PrimitiveToolProvider(sandbox as any, fakeFileAssets() as any);
    const options = {
      userId: 7,
      conversationId: 11,
      turnId: 'gate',
      messageId: 'message_gate',
      __sandboxTurnPrepared: false,
    };
    const context = contextFor(options);
    await expect(provider.prepareTurn(context)).rejects.toThrow('admission busy');
    for (const tool of ['ls', 'read', 'write', 'edit', 'bash']) {
      expect(
        (await provider.execute(tool, { path: 'work/a', command: 'true', content: 'x' }, context))
          .status,
      ).toBe('error');
    }
    expect(await provider.getToolDefinitions(context)).toEqual([]);
    expect(await provider.describeForSystemPrompt(context)).toContain('tools are unavailable');
    for (const operation of [
      sandbox.exec,
      sandbox.readFile,
      sandbox.writeFile,
      sandbox.listDir,
      sandbox.resourceStatus,
    ])
      expect(operation).not.toHaveBeenCalled();
  });
  it.each([
    ['a visitor sandbox at capacity', { visitorId: 'gate' }, 'limited'],
    ['a user machine with degraded storage', { userId: 7 }, 'degraded'],
  ])(
    'registers read-only turns for %s, permits reads only, and releases the lease in finally',
    async (_label: string, identity: Record<string, unknown>, state: string) => {
      const sandbox = fakeSandbox();
      const release = jest.fn();
      sandbox.beginTurn.mockResolvedValue({ handle: { id: 'generation-1' }, release });
      sandbox.resourceStatus.mockResolvedValue({ state, reason: 'capacity' });
      sandbox.files.set('old.txt', Buffer.from('kept'));
      const files = fakeFileAssets();
      const provider = new PrimitiveToolProvider(sandbox as any, files as any);
      const context = contextFor({
        ...identity,
        conversationId: 11,
        turnId: 'gate',
        messageId: 'message_gate',
        __sandboxTurnPrepared: false,
      });
      await provider.prepareTurn(context);
      expect(files.registerSandboxTurn).toHaveBeenCalledTimes(1);
      expect((await provider.execute('read', { path: 'old.txt' }, context)).status).toBe('success');
      expect((await provider.execute('bash', { command: 'true' }, context)).status).toBe('error');
      expect(sandbox.exec).not.toHaveBeenCalled();
      await provider.finishTurn(context);
      await provider.finishTurn(context);
      expect(release).toHaveBeenCalledTimes(1);
    },
  );

  it('gates read-only turns on real intent, not on filled-in empty arguments', async () => {
    const sandbox = fakeSandbox();
    sandbox.resourceStatus.mockResolvedValue({ state: 'limited', reason: 'capacity' });
    sandbox.files.set('old.txt', Buffer.from('kept'));
    const provider = new PrimitiveToolProvider(sandbox as any, fakeFileAssets() as any);
    const context = contextFor({
      visitorId: 'filled',
      conversationId: 12,
      turnId: 'filled',
      messageId: 'message_filled',
      __sandboxTurnPrepared: false,
    });
    await provider.prepareTurn(context);
    const filled = { command: '', recover_outputs: false, save_skill: '', delete_skill: '' };
    const read = await provider.execute(
      'read',
      { path: 'old.txt', fileRef: '', offset: null, limit: null },
      context,
    );
    expect(read.status).toBe('success');
    const recovered = await provider.execute(
      'bash',
      { ...filled, recover_outputs: true, timeout: 10 },
      context,
    );
    expect(recovered.status).toBe('success');
    expect((await provider.execute('bash', { ...filled, command: 'true' }, context)).status).toBe(
      'error',
    );
    expect(sandbox.exec).not.toHaveBeenCalled();
    await provider.finishTurn(context);
  });

  it('keeps commands for cleanup when a signed-in user machine is at capacity', async () => {
    const sandbox = fakeSandbox();
    sandbox.resourceStatus.mockResolvedValue({
      state: 'limited',
      reason: '工作区已满',
      usage: { workspaceBytes: 1 },
    });
    const provider = new PrimitiveToolProvider(sandbox as any, fakeFileAssets() as any);
    const context = contextFor({
      userId: 7,
      conversationId: 11,
      turnId: 'full',
      messageId: 'message_full',
      attachments: [{ fileId: 'file_111111111111111111111111' }],
      __sandboxTurnPrepared: false,
    });
    await provider.prepareTurn(context);
    const options = context.input.context.options;
    expect(options.sandboxReadOnlyReason).toBeUndefined();
    expect(options.sandboxDiskFull).toBe('工作区已满');
    expect(options.sandboxInputs).toEqual([]);
    expect(await provider.describeForSystemPrompt(context)).toContain('workspace is full');
    expect((await provider.execute('bash', { command: 'rm big.bin' }, context)).status).toBe(
      'success',
    );
  });
});

describe('read-only pending recovery', () => {
  it.each(['limited', 'degraded'])(
    'delivers a previous turn in %s state through the exposed tool without sandbox mutations',
    async (state: string) => {
      const sandbox = fakeSandbox();
      const files = fakeFileAssets();
      sandbox.resourceStatus.mockResolvedValue({ state, reason: 'synthetic capacity condition' });
      sandbox.files.set('pending/previous/source.txt', Buffer.from('recoverable source'));
      files.listSandboxTurns.mockResolvedValue([
        { fileId: 'control_previous', turnId: 'previous', messageId: 'message_previous' },
      ]);
      const provider = new PrimitiveToolProvider(sandbox as any, files as any);
      const fileRefMappingStore = { registerFile: jest.fn() };
      const context = contextFor(
        {
          // 整轮只读只用于访客的临时环境（登录用户满额时仍可运行命令清理）
          visitorId: 'recover',
          conversationId: 11,
          turnId: 'current',
          messageId: 'message_current',
          __sandboxTurnPrepared: false,
        },
        { fileRefMappingStore },
      );
      await provider.prepareTurn(context);
      const result = await provider.execute('bash', { recover_outputs: true }, context);
      expect(result.status).toBe('success');
      expect(JSON.stringify(result)).toContain('fa_source.txt');
      expect(files.createFromBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'message_previous',
          delivery: { turnId: 'previous', sourceKey: 'source.txt' },
        }),
      );
      expect(files.completeSandboxTurn).toHaveBeenCalledWith('control_previous');
      expect(fileRefMappingStore.registerFile).toHaveBeenCalledWith(
        'fa_source.txt',
        expect.any(Object),
      );
      expect(sandbox.exec).not.toHaveBeenCalled();
      expect(sandbox.writeFile).not.toHaveBeenCalled();
      expect(sandbox.files.has('pending/previous/source.txt')).toBe(true);
      expect(
        (await provider.execute('bash', { recover_outputs: true, command: 'true' }, context))
          .status,
      ).toBe('error');
      await provider.finishTurn(context);
    },
  );
  it('keeps the trusted control after storage failure and retries with the original identity', async () => {
    const sandbox = fakeSandbox();
    const files = fakeFileAssets();
    sandbox.files.set('pending/previous/a.txt', Buffer.from('a'));
    files.listSandboxTurns.mockResolvedValue([
      { fileId: 'control_previous', turnId: 'previous', messageId: 'message_previous' },
    ]);
    files.createFromBuffer.mockRejectedValueOnce(new Error('synthetic storage failure'));
    const provider = new PrimitiveToolProvider(sandbox as any, files as any);
    const context = contextFor({
      userId: 7,
      conversationId: 11,
      turnId: 'current',
      messageId: 'message_current',
      sandboxGeneration: 'generation-1',
    });
    expect((await provider.execute('bash', { recover_outputs: true }, context)).status).toBe(
      'error',
    );
    expect(files.completeSandboxTurn).not.toHaveBeenCalled();
    expect(sandbox.files.has('pending/previous/a.txt')).toBe(true);
    expect((await provider.execute('bash', { recover_outputs: true }, context)).status).toBe(
      'success',
    );
    expect(files.completeSandboxTurn).toHaveBeenCalledWith('control_previous');
    expect(
      files.createFromBuffer.mock.calls.every(
        ([input]: [Parameters<FileAssetService['createFromBuffer']>[0]]) =>
          input.messageId === 'message_previous',
      ),
    ).toBe(true);
  });

  it('does not keep delivery records for an earlier turn recovered by a later command', async () => {
    const sandbox = fakeSandbox();
    const files = fakeFileAssets();
    sandbox.files.set('pending/previous/a.txt', Buffer.from('a'));
    files.listSandboxTurns.mockResolvedValue([
      { fileId: 'control_previous', turnId: 'previous', messageId: 'message_previous' },
    ]);
    const provider = new PrimitiveToolProvider(sandbox as any, files as any);
    const context = contextFor({
      userId: 7,
      conversationId: 11,
      turnId: 'current',
      messageId: 'message_current',
      sandboxGeneration: 'generation-1',
    });
    expect((await provider.execute('bash', { command: 'make report' }, context)).status).toBe(
      'success',
    );
    expect(files.completeSandboxTurn).toHaveBeenCalledWith('control_previous');
    // 补交的旧轮次不写交付记录；只有当前轮的记录，会在轮次结束时清理
    const keys = [...((provider as any).deliveredOutputs as Map<string, string>).keys()];
    expect(keys.some(key => key.includes('\0previous\0'))).toBe(false);
    expect(keys.some(key => key.includes('\0current\0'))).toBe(true);
  });
});

describe('primitive results reach the model verbatim', () => {
  const owner = {
    userId: 7,
    conversationId: 11,
    chatId: 'msg-cid-1',
    messageId: 'msg-cid-1',
    turnId: 'turn_1',
  };
  let sandbox: ReturnType<typeof fakeSandbox>;
  let fileAssets: ReturnType<typeof fakeFileAssets>;
  let provider: PrimitiveToolProvider;

  beforeEach(() => {
    sandbox = fakeSandbox();
    fileAssets = fakeFileAssets();
    provider = new PrimitiveToolProvider(sandbox as any, fileAssets as any);
  });

  const execResult = (stdout: string, extra: Record<string, unknown> = {}) => ({
    exitCode: 0,
    stdout,
    stderr: '',
    timedOut: false,
    aborted: false,
    truncated: false,
    durationMs: 7,
    ...extra,
  });

  // 三条路径：本轮回灌、执行器二次包装后回灌、落库（JSON 往返）后的历史回放
  function modelTextPaths(result: any) {
    const inTurn = getToolModelContent(result);
    const rewrapped = createLayeredToolResult({
      id: result.id,
      type: 'tool',
      toolName: result.toolName,
      displayName: result.displayName,
      name: result.name,
      status: result.status,
      input: {},
      rawOutput: result.output,
      time: 0,
      duration: 0,
      output: result.model?.output || result.display || result.output,
      toolResult: result.toolResult,
      modelText: 'faithful',
    });
    const executorResult = {
      ...rewrapped,
      model: result.model || rewrapped.model,
      toolResult: rewrapped.toolResult,
    };
    const afterExecutor = getToolModelContent(executorResult);
    const stored = JSON.parse(JSON.stringify(toBackendToolCall(executorResult)));
    const history = getHistoricalToolModelContent(stored);
    return { inTurn, afterExecutor, history };
  }

  it('keeps the faithful tool list in sync with the primitives', () => {
    expect([...FAITHFUL_TEXT_TOOL_NAMES].sort()).toEqual([...PRIMITIVE_TOOL_NAMES].sort());
  });

  it.each([
    ['src/app.ts', 'function cmp(a, b, c, d) {\n  if (a < b && c > d) {\n\t\treturn a;\n  }\n}\n'],
    ['index.html', '<!doctype html>\n<html>\n  <body><div class="x">Hello</div></body>\n</html>\n'],
    ['report.pdf.txt', 'Quarterly report\nRevenue: 100\n'],
    ['sandbox/notes.md', '# 笔记\n\n- 第一条\n- 第二条 😀\n'],
    ['logs/app.log', 'start ok\nstack: Error: boom\n    at main (app.js:1:1)\nstdout: after\n'],
    ['config.py', 'file_path = "/workspace/data.csv"\napi_key = load()\n'],
  ])('reads %s verbatim on every path', async (filePath: string, content: string) => {
    sandbox.files.set(filePath, Buffer.from(content));
    const result = await provider.execute('read', { path: filePath }, contextFor({ ...owner }));
    expect(result.status).toBe('success');
    expect(modelTextPaths(result)).toEqual({
      inTurn: content,
      afterExecutor: content,
      history: content,
    });
  });

  it('passes command output through verbatim whatever the command line says', async () => {
    const stdout = 'From github.com:org/repo\n * branch main -> FETCH_HEAD\n<tag a="1"> & more\n';
    sandbox.exec.mockImplementationOnce(async (_owner: string, _command: string, options: any) => {
      options?.onDispatch?.();
      return execResult(stdout, { stderr: 'warning: line\n' });
    });
    const result = await provider.execute(
      'bash',
      { command: 'git fetch origin && ls sandbox && python3 to_excel.py' },
      contextFor({ ...owner }),
    );
    const expected = `[exit 0，7 ms]\n${stdout.trimEnd()}\n[stderr]\nwarning: line`;
    expect(modelTextPaths(result)).toEqual({
      inTurn: expected,
      afterExecutor: expected,
      history: expected,
    });
  });

  it('keeps the head and the tail of long command output and says what was left out', async () => {
    const lines = Array.from({ length: 3000 }, (_, i) => `row ${i + 1}`);
    sandbox.exec.mockImplementationOnce(async (_owner: string, _command: string, options: any) => {
      options?.onDispatch?.();
      return execResult(`${lines.join('\n')}\n`);
    });
    const text = getToolModelContent(
      await provider.execute('bash', { command: 'seq' }, contextFor({ ...owner })),
    ) as string;
    expect(text.length).toBeLessThanOrEqual(12000);
    expect(text.startsWith('[exit 0，7 ms]\nrow 1\nrow 2\n')).toBe(true);
    expect(text.endsWith('row 2999\nrow 3000')).toBe(true);
    expect(text).toMatch(/…\[省略已捕获输出的第 \d+–\d+ 行，共 3000 行\]…/);
  });

  it('asks the sandbox to keep the tail and shows the real ending when output was capped', async () => {
    const collector = new OutputCollector(40, true);
    collector.push(`first line\n${'x'.repeat(100)}\nlast line: error E42\n`);
    let execOptions: any;
    sandbox.exec.mockImplementationOnce(async (_owner: string, _command: string, options: any) => {
      execOptions = options;
      options?.onDispatch?.();
      return execResult(collector.toString(), { exitCode: 1, truncated: true });
    });
    const text = getToolModelContent(
      await provider.execute('bash', { command: 'make' }, contextFor({ ...owner })),
    ) as string;
    expect(execOptions.outputTail).toBe(true);
    expect(text).toBe(
      [
        '[exit 1，输出已截断，7 ms]',
        'first line',
        '…（输出超过 40 字节，中间 93 字节未保留）',
        'xxxxxxxx',
        'last line: error E42',
        '[输出超过捕获上限，只保留了开头和结尾，中间缺失；需要完整输出时把输出重定向到文件，再用 read 分段读取]',
      ].join('\n'),
    );
  });

  it('keeps the capture note and the delivery list when long output is truncated', async () => {
    const collector = new OutputCollector(40_000, true);
    collector.push(`${Array.from({ length: 9000 }, (_, i) => `out ${i + 1}`).join('\n')}\n`);
    sandbox.exec.mockImplementationOnce(async (_owner: string, _command: string, options: any) => {
      options?.onDispatch?.();
      sandbox.files.set(
        `${options.env.AGENT_OUTPUT_DIR}/report.pdf`.replace(/^\/workspace\//u, ''),
        Buffer.from('%PDF-1.4 fake'),
      );
      return execResult(collector.toString(), { truncated: true });
    });
    const result = await provider.execute(
      'bash',
      { command: 'build all' },
      contextFor({ ...owner }),
    );
    const text = getToolModelContent(result) as string;
    expect(text.length).toBeLessThanOrEqual(12000);
    // 驱动写在两段之间的说明落在被省略的中段里；模型看到的结尾是真实输出的结尾
    expect(text).not.toContain('字节未保留');
    expect(text).toContain('out 1\nout 2\n');
    expect(text).toContain('out 8999\nout 9000\n');
    expect(text.match(/输出超过捕获上限，只保留了开头和结尾，中间缺失/g)).toHaveLength(1);
    expect(text).toContain('[已交付给用户的文件]');
    expect(text).toContain('report.pdf');
  });

  it('keeps the full delivery list of the most files one call can deliver within the limit', async () => {
    // 每次最多交付 20 个文件：名字很长时交付清单仍完整、整条不超过上限，命令输出被压缩时写明省略
    const name = (i: number) => `${'chart-with-a-fairly-long-descriptive-name-'.repeat(4)}${i}.png`;
    sandbox.exec.mockImplementationOnce(async (_owner: string, _command: string, options: any) => {
      options?.onDispatch?.();
      const dir = `${options.env.AGENT_OUTPUT_DIR}`.replace(/^\/workspace\//u, '');
      for (let i = 1; i <= 20; i += 1)
        sandbox.files.set(`${dir}/${name(i)}`, Buffer.from(`png ${i}`));
      return execResult(`${Array.from({ length: 4000 }, (_, i) => `log ${i + 1}`).join('\n')}\n`);
    });
    // 与线上一致带上文件引用分配（真实格式的文件 ID）：结果后面会补 20 行文件引用
    fileAssets.createFromBuffer.mockImplementation(async (input: any) => ({
      fileId: `file_${createHash('sha256').update(input.name).digest('hex').slice(0, 24)}`,
      name: input.name,
      mime: input.mime,
      size: input.buffer.length,
      category: 'generated',
      purpose: input.purpose,
      visibility: 'private',
    }));
    const result = await provider.execute(
      'bash',
      { command: 'plot all' },
      contextFor({ ...owner }, { fileRefMappingStore: new FileRefMappingStore() }),
    );
    const text = getToolModelContent(result) as string;
    expect(text.match(/fileRef=output_file_\d+/g)).toHaveLength(20);
    expect(text.length).toBeLessThanOrEqual(12000);
    expect(text).not.toContain('超出单条结果上限');
    // 名字近 180 字时 20 个归档路径也都完整保留
    for (let i = 1; i <= 20; i += 1)
      expect(text).toMatch(new RegExp(`artifacts/turn_1/[0-9a-f]{64}/${name(i)}`));
    expect(text).toContain('省略已捕获输出');
  });

  it('keeps every delivery path with 255-character names and production-length turn ids', async () => {
    const longOwner = { ...owner, turnId: 'turn_mupb0u8a_bb067ab6' };
    const name = (i: number) => `${'n'.repeat(245)}-${String(i).padStart(2, '0')}.png`;
    fileAssets.createFromBuffer.mockImplementation(async (input: any) => ({
      fileId: `file_${createHash('sha256').update(input.name).digest('hex').slice(0, 24)}`,
      name: input.name,
      mime: input.mime,
      size: input.buffer.length,
      category: 'generated',
      purpose: input.purpose,
      visibility: 'private',
    }));
    sandbox.exec.mockImplementationOnce(async (_owner: string, _command: string, options: any) => {
      options?.onDispatch?.();
      const dir = `${options.env.AGENT_OUTPUT_DIR}`.replace(/^\/workspace\//u, '');
      for (let i = 1; i <= 20; i += 1)
        sandbox.files.set(`${dir}/${name(i)}`, Buffer.from(`png ${i}`));
      return execResult(`${Array.from({ length: 4000 }, (_, i) => `log ${i + 1}`).join('\n')}\n`);
    });
    const result = await provider.execute(
      'bash',
      { command: 'plot all' },
      contextFor({ ...longOwner }, { fileRefMappingStore: new FileRefMappingStore() }),
    );
    const text = getToolModelContent(result) as string;
    expect(text.length).toBeLessThanOrEqual(12000);
    expect(text).not.toContain('超出单条结果上限');
    for (let i = 1; i <= 20; i += 1) {
      expect(text).toMatch(
        new RegExp(
          `artifacts/turn_mupb0u8a_bb067ab6/[0-9a-f]{64}/${name(i)}（\\d+ B，fileRef=output_file_\\d+）`,
        ),
      );
    }
    // 引用编号已写在清单里，结果后面不再重复补一遍
    expect(text.match(/fileRef=output_file_\d+/g)).toHaveLength(20);
  });

  it.each([
    ['stdout', 'stderr'],
    ['stderr', 'stdout'],
  ])(
    'passes both streams through as captured when only %s was capped',
    async (truncatedStream: string, plainStream: string) => {
      const collector = new OutputCollector(100, true);
      collector.push('x'.repeat(150));
      // 没截断的那一路恰好以像捕获说明的文字结尾：原样保留
      const plain = 'value\n…（输出超过 5 字节已截断）';
      sandbox.exec.mockImplementationOnce(
        async (_owner: string, _command: string, options: any) => {
          options?.onDispatch?.();
          return execResult('', {
            [truncatedStream]: collector.toString(),
            [plainStream]: plain,
            truncated: true,
            [`${truncatedStream}Truncated`]: true,
            [`${plainStream}Truncated`]: false,
          });
        },
      );
      const text = getToolModelContent(
        await provider.execute('bash', { command: 'mixed' }, contextFor({ ...owner })),
      ) as string;
      expect(text).toContain(plain);
      expect(text).toContain(
        `${'x'.repeat(25)}\n…（输出超过 100 字节，中间 50 字节未保留）\n${'x'.repeat(75)}`,
      );
      expect(text.match(/输出超过捕获上限，只保留了开头和结尾，中间缺失/g)).toHaveLength(1);
    },
  );

  it('keeps every delivery path with 255-character names when there is no shared ref table', async () => {
    const name = (i: number) => `${'m'.repeat(245)}-${String(i).padStart(2, '0')}.png`;
    sandbox.exec.mockImplementationOnce(async (_owner: string, _command: string, options: any) => {
      options?.onDispatch?.();
      const dir = `${options.env.AGENT_OUTPUT_DIR}`.replace(/^\/workspace\//u, '');
      for (let i = 1; i <= 20; i += 1)
        sandbox.files.set(`${dir}/${name(i)}`, Buffer.from(`png ${i}`));
      return execResult(`${Array.from({ length: 4000 }, (_, i) => `log ${i + 1}`).join('\n')}\n`);
    });
    const text = getToolModelContent(
      await provider.execute(
        'bash',
        { command: 'plot all' },
        contextFor({ ...owner, turnId: 'turn_mupb0u8a_bb067ab6' }),
      ),
    ) as string;
    expect(text.length).toBeLessThanOrEqual(12000);
    expect(text).not.toContain('超出单条结果上限');
    for (let i = 1; i <= 20; i += 1) {
      expect(text).toMatch(
        new RegExp(`artifacts/turn_mupb0u8a_bb067ab6/[0-9a-f]{64}/${name(i)}（`),
      );
    }
  });

  it('fits extra file references into the room left and never cuts the delivery list for them', () => {
    const store = new FileRefMappingStore();
    const files = Array.from({ length: 40 }, (_, i) => ({
      fileId: `file_${createHash('sha256').update(String(i)).digest('hex').slice(0, 24)}`,
      name: `${'q'.repeat(240)}-${String(i + 1).padStart(2, '0')}.png`,
      mime: 'image/png',
      size: 6,
      role: 'final',
    }));
    const refs = files.map(
      file =>
        store.registerFile(file.fileId, {
          name: file.name,
          mime: file.mime,
          size: file.size,
          origin: 'tool_output',
          refKind: 'output_file',
        }).fileRef,
    );
    const listed = files
      .slice(0, 20)
      .map(
        (file, i) =>
          `- artifacts/turn_mupb0u8a_bb067ab6/${'0'.repeat(64)}/${file.name}（6 B，fileRef=${refs[i]}）`,
      )
      .join('\n');
    const body = `[exit 0，7 ms]\n…[省略已捕获输出中间约 9999 字]…\n\n[已交付给用户的文件]\n${listed}\n- 另有 20 个文件\n（已从输出目录移到上列路径）`;
    const layered = createLayeredToolResult({
      id: 'call_many',
      type: 'tool',
      toolName: 'bash',
      name: 'bash',
      status: 'success',
      rawOutput: { content: body, files },
      toolResult: { status: 'success', modelContent: body },
      modelText: 'faithful',
      fileRefMappingStore: store,
    });
    const text = getToolModelContent(layered) as string;
    expect(text.length).toBeLessThanOrEqual(12000);
    // 交付清单原样在前；补充的引用只用剩下的位置，放不下的写成「另有 N 个文件引用」
    expect(text.startsWith(body)).toBe(true);
    expect(text).toMatch(/- 另有 \d+ 个文件引用$/);
  });

  it('tells the model to read a delivered file without a workspace path by its fileRef', () => {
    const note = (provider as any).withArtifactNote(
      '[exit 0]',
      [{ name: 'report.txt', size: 3, fileId: `file_${'R'.repeat(24)}` }],
      () => 'output_file_1',
    );
    expect(note).toContain(
      '- report.txt（3 B，fileRef=output_file_1；不在工作区，用 read(fileRef) 读取）',
    );
    expect(note).not.toContain('需要查看时读这些路径');
  });

  it('leaves output that merely ends like the capture note alone when nothing was truncated', async () => {
    const stdout = 'value\n…（输出超过 123 字节已截断）';
    sandbox.exec.mockImplementationOnce(async (_owner: string, _command: string, options: any) => {
      options?.onDispatch?.();
      return execResult(stdout);
    });
    const text = getToolModelContent(
      await provider.execute('bash', { command: 'printf note' }, contextFor({ ...owner })),
    ) as string;
    expect(text).toBe(`[exit 0，7 ms]\n${stdout.trimEnd()}`);
  });

  it('keeps the head and the tail of long output next to a short delivery list', async () => {
    sandbox.exec.mockImplementationOnce(async (_owner: string, _command: string, options: any) => {
      options?.onDispatch?.();
      const dir = `${options.env.AGENT_OUTPUT_DIR}`.replace(/^\/workspace\//u, '');
      for (const file of ['a.png', 'b.png', 'c.png'])
        sandbox.files.set(`${dir}/${file}`, Buffer.from(file));
      return execResult(`${Array.from({ length: 4000 }, (_, i) => `log ${i + 1}`).join('\n')}\n`);
    });
    const text = getToolModelContent(
      await provider.execute('bash', { command: 'plot three' }, contextFor({ ...owner })),
    ) as string;
    expect(text.length).toBeLessThanOrEqual(12000);
    expect(text).toContain('\nlog 1\n');
    expect(text).toContain('log 4000\n\n[已交付给用户的文件]');
    expect(text).toMatch(/…\[省略已捕获输出的第 \d+–\d+ 行，共 4000 行\]…/);
  });

  it('does not deliver outputs while a held command may still be writing them', async () => {
    sandbox.exec.mockImplementationOnce(async (_owner: string, _command: string, options: any) => {
      options?.onDispatch?.();
      // 后台任务刚开始往交付目录写文件，主进程已经结束、输出还开着：驱动收尾后停止捕获
      sandbox.files.set(
        `${options.env.AGENT_OUTPUT_DIR}/half.csv`.replace(/^\/workspace\//u, ''),
        Buffer.from('a,b\n1,'),
      );
      return execResult('started\n', { outputHeld: true });
    });
    const result = await provider.execute(
      'bash',
      { command: 'python3 job.py &' },
      contextFor({ ...owner }),
    );
    const text = getToolModelContent(result) as string;
    expect(text.startsWith('[exit 0，输出未结束、已停止捕获，7 ms]\nstarted')).toBe(true);
    expect(text).toContain('本次没有交付输出目录里的文件');
    expect(text).toContain('nohup <命令> > 文件 2>&1 &');
    expect(text).not.toContain('[已交付给用户的文件]');
    // 文件留在原处，之后的命令或 recover_outputs 再交付
    expect(sandbox.files.has('out/turn_1/half.csv')).toBe(true);
    expect(fileAssets.createFromBuffer).not.toHaveBeenCalled();

    // 后台任务写完以后，下一条普通命令交付完整的文件
    sandbox.files.set('out/turn_1/half.csv', Buffer.from('a,b\n1,2\n'));
    const next = getToolModelContent(
      await provider.execute('bash', { command: 'ls' }, contextFor({ ...owner })),
    ) as string;
    expect(next).toContain('[已交付给用户的文件]');
    expect(next).toContain('half.csv');
    expect(fileAssets.createFromBuffer).toHaveBeenCalledTimes(1);
    expect(fileAssets.createFromBuffer.mock.calls[0][0].buffer.toString()).toBe('a,b\n1,2\n');
  });

  it("delivers a held command's finished outputs through recover_outputs", async () => {
    sandbox.exec.mockImplementationOnce(async (_owner: string, _command: string, options: any) => {
      options?.onDispatch?.();
      sandbox.files.set(
        `${options.env.AGENT_OUTPUT_DIR}/report.md`.replace(/^\/workspace\//u, ''),
        Buffer.from('# draft'),
      );
      return execResult('started\n', { outputHeld: true });
    });
    const context = contextFor({ ...owner });
    await provider.execute('bash', { command: 'python3 job.py &' }, context);
    expect(fileAssets.createFromBuffer).not.toHaveBeenCalled();
    sandbox.files.set('out/turn_1/report.md', Buffer.from('# final\n'));
    const recovered = getToolModelContent(
      await provider.execute('bash', { recover_outputs: true }, context),
    ) as string;
    expect(recovered).toContain('report.md');
    expect(fileAssets.createFromBuffer).toHaveBeenCalledTimes(1);
    expect(fileAssets.createFromBuffer.mock.calls[0][0].buffer.toString()).toBe('# final\n');
  });

  it('reads a long file by whole lines and says where to continue', async () => {
    const lines = Array.from({ length: 2000 }, (_, i) => `line ${String(i + 1).padStart(4, '0')}`);
    sandbox.files.set('big.txt', Buffer.from(`${lines.join('\n')}\n`));
    const first = getToolModelContent(
      await provider.execute('read', { path: 'big.txt' }, contextFor({ ...owner })),
    ) as string;
    const [header, ...body] = first.split('\n');
    const match = header.match(
      /^\[big\.txt 第 1-(\d+) 行，共 2000 行；未读完，继续读取用 offset=(\d+)\]$/,
    );
    expect(match).not.toBeNull();
    const last = Number(match![1]);
    expect(Number(match![2])).toBe(last + 1);
    expect(body).toEqual(lines.slice(0, last));
    expect(first.length).toBeLessThanOrEqual(12000);

    const second = getToolModelContent(
      await provider.execute(
        'read',
        { path: 'big.txt', offset: last + 1 },
        contextFor({ ...owner }),
      ),
    ) as string;
    expect(second.split('\n')[1]).toBe(lines[last]);
  });

  it('shows the start of an over-long first line and how to read the rest', async () => {
    sandbox.files.set('min.js', Buffer.from('a'.repeat(30000)));
    const text = getToolModelContent(
      await provider.execute('read', { path: 'min.js' }, contextFor({ ...owner })),
    ) as string;
    const match = text.match(
      /^\[min\.js 第 1 行共 30000 个字符，只显示了前 (\d+) 个；该行其余部分可用 bash 按字符分段查看，例如 python3 -c '.+' 'min\.js' 1 (\d+) (\d+)\]\n(a+)$/,
    );
    expect(match).not.toBeNull();
    expect(match![2]).toBe(match![1]);
    expect(match![4].length).toBe(Number(match![1]));
  });

  it('counts a long mixed-script line in characters and says where the next lines start', async () => {
    const longLine = 'a中😀'.repeat(4000);
    sandbox.files.set('mixed.txt', Buffer.from(`${longLine}\nsecond line\n`));
    const text = getToolModelContent(
      await provider.execute('read', { path: 'mixed.txt' }, contextFor({ ...owner })),
    ) as string;
    const [header, shown] = text.split('\n');
    const match = header.match(
      /共 12000 个字符，只显示了前 (\d+) 个；.* 'mixed\.txt' 1 (\d+) \d+；后面的行从 offset=2 继续读\]$/,
    );
    expect(match).not.toBeNull();
    // 显示的字数、分段命令的起点都按码点计（与 Python 下标一致），且没有切断代理对
    expect([...shown].length).toBe(Number(match![1]));
    expect(match![2]).toBe(match![1]);
    expect(longLine.startsWith(shown)).toBe(true);
  });

  it('keeps whitespace-only file content', async () => {
    sandbox.files.set('blank.txt', Buffer.from(' \n\t\n'));
    const result = await provider.execute('read', { path: 'blank.txt' }, contextFor({ ...owner }));
    expect(getToolModelContent(result)).toBe(' \n\t\n');
  });

  describe('large files paged with sed', () => {
    const bigFile = () => sandbox.files.set('huge.txt', Buffer.alloc(300 * 1024, 'a'));
    const pageWith = (stdout: string, truncated: boolean) =>
      sandbox.exec.mockImplementationOnce(async () => execResult(stdout, { truncated }));

    it('continues after a full page and stops at the end of the file', async () => {
      bigFile();
      pageWith(`${Array.from({ length: 200 }, (_, i) => `p${i + 1}`).join('\n')}\n`, false);
      const full = getToolModelContent(
        await provider.execute('read', { path: 'huge.txt' }, contextFor({ ...owner })),
      ) as string;
      expect(full.split('\n')[0]).toBe(
        '[huge.txt 第 1-200 行（文件 300.0 KB，大文件按行分页）；继续读取用 offset=201]',
      );

      pageWith('q1\nq2\n', false);
      const tail = getToolModelContent(
        await provider.execute('read', { path: 'huge.txt', offset: 201 }, contextFor({ ...owner })),
      ) as string;
      expect(tail).toBe(
        '[huge.txt 第 201-202 行（文件 300.0 KB，大文件按行分页）；已到文件末尾]\nq1\nq2',
      );
    });

    it('drops a line cut by the capture limit instead of passing it off as complete', async () => {
      bigFile();
      pageWith('ok1\nok2\npartial-without-newline', true);
      const text = getToolModelContent(
        await provider.execute('read', { path: 'huge.txt', offset: 10 }, contextFor({ ...owner })),
      ) as string;
      expect(text).not.toContain('partial-without-newline');
      expect(text).toContain('[huge.txt 第 10-11 行（文件 300.0 KB，大文件按行分页）]\nok1\nok2');
      expect(text).toContain(
        '[第 12 行在本次读取中没有完整捕获（输出达到单次读取的捕获上限）；可以用 offset=12 单独读这一行',
      );

      bigFile();
      pageWith('x'.repeat(1000), true);
      expect(
        getToolModelContent(
          await provider.execute('read', { path: 'huge.txt', offset: 5 }, contextFor({ ...owner })),
        ),
      ).toMatch(
        /^\[huge\.txt 第 5 行超过单次读取的捕获上限，未完整读取（文件 300\.0 KB，大文件按行分页）/,
      );
    });

    it('recognizes the note the real output collector appends when it truncates', async () => {
      bigFile();
      const collector = new OutputCollector(30);
      collector.push('line1\nline2\nline3 is longer than the cap\n');
      pageWith(collector.toString(), true);
      const text = getToolModelContent(
        await provider.execute('read', { path: 'huge.txt' }, contextFor({ ...owner })),
      ) as string;
      expect(text).not.toContain('字节已截断');
      expect(text).not.toContain('line3');
      expect(text.split('\n').slice(1, 3)).toEqual(['line1', 'line2']);
      expect(text).toContain(
        '[第 3 行在本次读取中没有完整捕获（输出达到单次读取的捕获上限（30 B））',
      );
    });
  });

  it('recovers a file under a path the model can read back', async () => {
    const fileId = `file_${'Q1w2E3r4'.repeat(3)}`;
    fileAssets.readFilesForRuntime.mockImplementationOnce(async () => [
      { name: `${fileId}.csv`, buffer: Buffer.from('a,b\n1,2\n'), size: 8 },
    ]);
    const restored = await provider.execute(
      'read',
      { fileRef: fileId },
      contextFor({ ...owner, attachments: [{ fileId }] }),
    );
    const text = getToolModelContent(restored) as string;
    expect(text).not.toContain('[private-file]');
    const match = text.match(/\/workspace\/(in\/files\/[0-9a-f]{16}\/file\.csv)/);
    expect(match).not.toBeNull();
    const again = await provider.execute('read', { path: match![1] }, contextFor({ ...owner }));
    expect(getToolModelContent(again)).toBe('a,b\n1,2\n');
  });

  it('keeps multi-line error text as written', async () => {
    const result = await provider.execute(
      'read',
      { path: 'missing.txt' },
      contextFor({ ...owner }),
    );
    expect(result.status).toBe('error');
    expect(getToolModelContent(result)).toBe('文件不存在：missing.txt');
    const layered = createLayeredToolResult({
      id: 'call_err',
      type: 'tool',
      toolName: 'read',
      name: 'read',
      status: 'error',
      rawOutput: { error: 'line one\n  line two' },
      toolResult: { status: 'error', modelContent: 'line one\n  line two' },
      modelText: 'faithful',
    });
    expect(getToolModelContent(layered)).toBe('line one\n  line two');
  });

  it('keeps the model text out of the frontend projection', async () => {
    sandbox.files.set('notes.txt', Buffer.from('MODEL_TEXT_MARKER\n'));
    const result = await provider.execute('read', { path: 'notes.txt' }, contextFor({ ...owner }));
    const frontend = JSON.stringify(toFrontendToolCall(result));
    expect(frontend).not.toContain('modelContent');
    expect(frontend).not.toContain('"model"');
  });

  it('does not grant verbatim text to tools outside the primitives', () => {
    const layered = createLayeredToolResult({
      id: 'call_mcp',
      type: 'tool',
      toolName: 'mcp__files__read',
      name: 'read',
      status: 'success',
      rawOutput: { content: 'a <b>bold</b> c' },
      toolResult: { status: 'success', modelContent: 'a <b>bold</b> c' },
      modelText: 'faithful',
    });
    expect(getToolModelContent(layered)).not.toContain('<b>');
  });
});

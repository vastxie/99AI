import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { LocalSandboxDriver } from '../../sandbox/local-sandbox.driver';
import { SandboxService, readSandboxPolicyFromEnv } from '../../sandbox/sandbox.service';
import { createFileAssetMemoryFixture } from '../../../test/fixtures/file-asset-memory.fixture';
import { FileRefMappingStore } from '../../fileAsset/file-refs';
import { PrimitiveToolProvider } from './primitive-tool.provider';
import type { FileAssetService } from '../../fileAsset/fileAsset.service';
import type { ToolExecutionContext } from '../tools/tool-provider.interface';

/** 直接调用回收接口的夹具：沙箱归属与对话归属同为该对话目录 */
const OWNER = {
  ownerId: 'user-7:conversation:11',
  sessionId: 'user-7:conversation:11',
  conversationId: '11',
  userId: 7,
};

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const jest: any;

describe('artifact delivery commands in a disposable fixture workspace', () => {
  it.each(['limited', 'degraded'])(
    'keeps the real turn preparation and read/ls path available while a temporary sandbox is %s',
    async (state: string) => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-readonly-'));
      const driver = new LocalSandboxDriver(root);
      const handle = await driver.ensure({
        ownerId: 'visitor-fixture:conversation:11',
        memoryMb: 512,
        cpus: 1,
        pidsLimit: 64,
        networkMode: 'none',
      });
      await driver.writeFile(handle, 'existing.txt', 'existing readable content');
      if (state === 'degraded')
        jest
          .spyOn(driver, 'inspectResources')
          .mockRejectedValue(new Error('synthetic observation failure'));
      const exec = jest.spyOn(driver, 'exec');
      const sandbox = new SandboxService(
        driver,
        undefined,
        undefined,
        {
          ...readSandboxPolicyFromEnv({}),
          ...(state === 'limited' ? { workspaceMaxBytes: 1 } : {}),
        },
        0,
      );
      const readFilesForRuntime = jest.fn();
      const provider = new PrimitiveToolProvider(sandbox, {
        readFilesForRuntime,
        registerSandboxTurn: jest.fn(),
      } as any);
      const options: any = {
        visitorId: 'fixture',
        conversationId: 11,
        turnId: 'turn_readonly',
        messageId: 'message_readonly',
        attachments: [{ fileId: 'file_111111111111111111111111' }],
      };
      const context: ToolExecutionContext = {
        input: { messages: [], config: {}, context: { options } },
      };
      try {
        await provider.prepareTurn(context);
        expect(options.__sandboxTurnPrepared).toBe(true);
        expect(options.sandboxReadOnlyReason).toBeTruthy();
        expect(options.sandboxInputs).toEqual([]);
        expect(readFilesForRuntime).not.toHaveBeenCalled();
        expect((await provider.execute('read', { path: 'existing.txt' }, context)).status).toBe(
          'success',
        );
        expect((await provider.execute('ls', {}, context)).status).toBe('success');
        expect(await provider.describeForSystemPrompt(context)).toContain('workspace is read-only');
        expect(exec).not.toHaveBeenCalled();
        expect(
          (
            await provider.execute(
              'write',
              { path: 'out/turn_readonly/new.txt', content: 'blocked' },
              context,
            )
          ).status,
        ).toBe('error');
        if (state === 'degraded') {
          expect(
            (await provider.execute('bash', { command: 'echo blocked' }, context)).status,
          ).toBe('error');
          expect(exec).not.toHaveBeenCalled();
        } else {
          // 满额允许执行清理；直接验证 SandboxService，避免夹具缺少文件资产回收接口。
          expect((await sandbox.exec('visitor-fixture:conversation:11', 'true')).exitCode).toBe(0);
        }
        expect(
          (await sandbox.readFile('visitor-fixture:conversation:11', 'existing.txt')).toString(),
        ).toBe('existing readable content');
      } finally {
        sandbox.onModuleDestroy();
        await fs.rm(root, { recursive: true, force: true });
      }
    },
  );

  it('keeps commands available on a full persistent disk so the user can free space', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-disk-full-'));
    const driver = new LocalSandboxDriver(root);
    const handle = await driver.ensure({
      ownerId: 'user-7',
      memoryMb: 512,
      cpus: 1,
      pidsLimit: 64,
      networkMode: 'none',
      persistent: true,
    });
    await driver.writeFile(handle, 'big.bin', 'x'.repeat(4096));
    const sandbox = new SandboxService(
      driver,
      undefined,
      undefined,
      { ...readSandboxPolicyFromEnv({}), diskMaxBytes: 1 },
      0,
    );
    const readFilesForRuntime = jest.fn();
    const provider = new PrimitiveToolProvider(sandbox, {
      readFilesForRuntime,
      registerSandboxTurn: jest.fn(),
      listSandboxTurns: async (): ReturnType<FileAssetService['listSandboxTurns']> => [],
      listTurnOutputs: async (): ReturnType<FileAssetService['listTurnOutputs']> => [],
    } as any);
    const options: any = {
      userId: 7,
      conversationId: 11,
      turnId: 'turn_full',
      messageId: 'message_full',
      attachments: [{ fileId: 'file_111111111111111111111111' }],
    };
    const context: ToolExecutionContext = {
      input: { messages: [], config: {}, context: { options } },
    };
    try {
      await provider.prepareTurn(context);
      expect(options.__sandboxTurnPrepared).toBe(true);
      expect(options.sandboxReadOnlyReason).toBeUndefined();
      expect(options.sandboxDiskFull).toContain('磁盘已满');
      expect(readFilesForRuntime).not.toHaveBeenCalled();
      const prompt = await provider.describeForSystemPrompt(context);
      expect(prompt).toContain('persistent personal computer');
      expect(prompt).toContain('chats/11/');
      expect(prompt).toContain('workspace is full');
      const write = await provider.execute('write', { path: 'more.txt', content: 'x' }, context);
      expect(write.status).toBe('error');
      expect(JSON.stringify(write)).toContain('磁盘已满');
      expect((await provider.execute('bash', { command: 'rm big.bin' }, context)).status).toBe(
        'success',
      );
      await expect(fs.access(path.join(handle.id, 'big.bin'))).rejects.toThrow();
    } finally {
      sandbox.onModuleDestroy();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('moves bytes safely, retains failed uploads and prevents symlink escape', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-delivery-'));
    const sandbox = new SandboxService(
      new LocalSandboxDriver(root),
      undefined,
      undefined,
      readSandboxPolicyFromEnv({}),
      0,
    );
    const createFromBuffer = jest
      .fn()
      .mockRejectedValueOnce(new Error('synthetic upload failure'))
      .mockImplementation(async (input: Parameters<FileAssetService['createFromBuffer']>[0]) => ({
        fileId: 'file_111111111111111111111111',
        name: input.name,
        mime: input.mime,
        size: input.buffer.length,
      }));
    const provider = new PrimitiveToolProvider(sandbox, {
      createFromBuffer,
      registerSandboxTurn: jest.fn(),
      listSandboxSkills: async (): ReturnType<FileAssetService['listSandboxSkills']> => [],
      listSandboxTurns: async (): ReturnType<FileAssetService['listSandboxTurns']> => [],
      listTurnOutputs: async (): ReturnType<FileAssetService['listTurnOutputs']> => [],
    } as any);
    const options = {
      userId: 7,
      conversationId: 11,
      turnId: 'turn_fixture',
      messageId: 'message_fixture',
    };
    const context: ToolExecutionContext = {
      input: { messages: [], config: {}, context: { options } },
    };
    try {
      await provider.prepareTurn(context);
      await sandbox.writeFile(
        'user-7:conversation:11',
        "out/turn_fixture/report's.txt",
        'persistent bytes',
      );
      await expect(provider.captureArtifacts(OWNER, options)).rejects.toThrow('交付未完成');
      expect(
        (
          await sandbox.readFile('user-7:conversation:11', "pending/turn_fixture/report's.txt")
        ).toString(),
      ).toBe('persistent bytes');
      const [delivered] = await provider.captureArtifacts(OWNER, options);
      expect(
        (await sandbox.readFile('user-7:conversation:11', delivered.sandboxPath!)).toString(),
      ).toBe('persistent bytes');
      expect(await provider.captureArtifacts(OWNER, options)).toEqual([]);

      const handle = await sandbox.acquire('user-7:conversation:11');
      const outside = path.join(root, 'outside');
      await fs.mkdir(outside);
      await fs.symlink(outside, path.join(handle.id, 'pending/turn_fixture/nested'));
      await sandbox.writeFile(
        'user-7:conversation:11',
        'out/turn_fixture/nested/file.txt',
        'must stay',
      );
      await expect(provider.captureArtifacts(OWNER, options)).rejects.toThrow('交付未完成');
      expect(await fs.readdir(outside)).toEqual([]);
      expect(
        (
          await sandbox.readFile('user-7:conversation:11', 'out/turn_fixture/nested/file.txt')
        ).toString(),
      ).toBe('must stay');
    } finally {
      await sandbox.onModuleDestroy();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe('bash output directory', () => {
  it('delivers files written to $AGENT_OUTPUT_DIR after changing into a subdirectory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-cd-'));
    const sandbox = new SandboxService(
      new LocalSandboxDriver(root),
      undefined,
      undefined,
      readSandboxPolicyFromEnv({}),
      0,
    );
    const createFromBuffer = jest.fn(
      async (input: Parameters<FileAssetService['createFromBuffer']>[0]) => ({
        fileId: 'file_222222222222222222222222',
        name: input.name,
        mime: input.mime,
        size: input.buffer.length,
      }),
    );
    const provider = new PrimitiveToolProvider(sandbox, {
      createFromBuffer,
      registerSandboxTurn: jest.fn(),
      listSandboxSkills: async (): ReturnType<FileAssetService['listSandboxSkills']> => [],
      listSandboxTurns: async (): ReturnType<FileAssetService['listSandboxTurns']> => [],
      listTurnOutputs: async (): ReturnType<FileAssetService['listTurnOutputs']> => [],
    } as any);
    const options = { userId: 7, conversationId: 12, turnId: 'turn_cd', messageId: 'message_cd' };
    const context: ToolExecutionContext = {
      input: { messages: [], config: {}, context: { options } },
    };
    try {
      await provider.prepareTurn(context);
      const result = await provider.execute(
        'bash',
        {
          command:
            'mkdir -p work/deep && cd work/deep && printf "made in a subdirectory" > "$AGENT_OUTPUT_DIR/cd-report.txt"',
        },
        context,
      );
      expect(result.status).toBe('success');
      expect(JSON.stringify(result)).toContain('[exit 0');
      expect(createFromBuffer).toHaveBeenCalledTimes(1);
      expect(createFromBuffer.mock.calls[0][0].name).toBe('cd-report.txt');
      expect(createFromBuffer.mock.calls[0][0].buffer.toString()).toBe('made in a subdirectory');
      const handle = await sandbox.acquire('user-7');
      await expect(fs.access(path.join(handle.id, 'work/deep/out'))).rejects.toThrow();
      // 登录用户整机一台：本对话目录在用户的持久工作区里
      await expect(fs.access(path.join(handle.id, 'chats/12'))).resolves.toBeUndefined();
    } finally {
      await sandbox.onModuleDestroy();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe('recover outputs without free workspace space', () => {
  it.each([
    ['a temporary visitor sandbox', { visitorId: 'fixture' }],
    ['a persistent user disk', { userId: 7 }],
  ])(
    'persists pending bytes and exposes file references through recovery on %s',
    async (_label: string, identity: { userId?: number; visitorId?: string }) => {
      const persistent = Boolean(identity.userId);
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-recover-full-'));
      const session = persistent ? 'user-7:conversation:11' : 'visitor-fixture:conversation:11';
      const machine = persistent ? 'user-7' : session;
      const driver = new LocalSandboxDriver(root);
      const handle = await driver.ensure({
        ...readSandboxPolicyFromEnv({}),
        ownerId: machine,
        persistent,
      });
      await driver.writeFile(handle, 'pending/previous/source.txt', 'synthetic editable source');
      const sandbox = new SandboxService(
        driver,
        undefined,
        undefined,
        { ...readSandboxPolicyFromEnv({}), workspaceMaxBytes: 1, diskMaxBytes: 1 },
        0,
      );
      const f = createFileAssetMemoryFixture();
      await f.files.registerSandboxTurn({
        ...identity,
        ownerId: session,
        // 持久磁盘的登记代次固定，容器换代后仍能续交付
        generation: persistent ? 'persistent' : handle.id,
        turnId: 'previous',
        messageId: 'message_previous',
      });
      // 另一个对话的登记不能被本对话认领
      await f.files.registerSandboxTurn({
        ...identity,
        ownerId: persistent ? 'user-7:conversation:99' : 'visitor-fixture:conversation:99',
        generation: persistent ? 'persistent' : handle.id,
        turnId: 'other',
        messageId: 'message_other',
      });
      await driver.writeFile(handle, 'pending/other/other.txt', 'belongs to another conversation');
      const provider = new PrimitiveToolProvider(sandbox, f.files);
      const context: ToolExecutionContext = {
        fileRefMappingStore: new FileRefMappingStore(),
        input: {
          messages: [],
          config: {},
          context: {
            options: {
              ...identity,
              conversationId: 11,
              turnId: 'current',
              messageId: 'message_current',
            },
          },
        },
      };
      const commands = jest.spyOn(sandbox, 'exec');
      try {
        await provider.prepareTurn(context);
        const result = await provider.execute('bash', { recover_outputs: true }, context);
        expect(result.status).toBe('success');
        const outputs = await f.files.listTurnOutputs({
          ...identity,
          turnId: 'previous',
          messageId: 'message_previous',
        });
        expect(outputs).toHaveLength(1);
        expect(JSON.stringify(result)).toContain(outputs[0].fileId);
        expect(JSON.stringify(context.fileRefMappingStore!.snapshot())).toContain(
          outputs[0].fileId,
        );
        expect(f.objects.size).toBe(1);
        expect(JSON.stringify(result)).not.toContain('other.txt');
        // 恢复本身不执行命令；持久磁盘满额时回合准备仍会尝试建本轮目录
        expect(
          commands.mock.calls.every(([, command]: unknown[]) =>
            String(command).startsWith('/bin/mkdir'),
          ),
        ).toBe(true);
        if (!persistent) expect(commands).not.toHaveBeenCalled();
        expect(await driver.readFile(handle, 'pending/previous/source.txt')).toEqual(
          Buffer.from('synthetic editable source'),
        );
        await provider.finishTurn(context);
      } finally {
        sandbox.onModuleDestroy();
        await fs.rm(root, { recursive: true, force: true });
      }
    },
  );
});

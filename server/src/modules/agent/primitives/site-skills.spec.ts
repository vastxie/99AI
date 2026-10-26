import { createHash } from 'node:crypto';
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { PrimitiveToolProvider } from './primitive-tool.provider';
import { encodeSkillPackage } from './skill-package';
import { SkillLibrary } from './skill-library';
import { LocalSandboxDriver } from '../../sandbox/local-sandbox.driver';
import { readSandboxPolicyFromEnv, SandboxService } from '../../sandbox/sandbox.service';
import type { FileAssetEntity } from '../../fileAsset/fileAsset.entity';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('site skills seeding', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'site-skills-'));
    mkdirSync(path.join(root, 'demo', 'nested'), { recursive: true });
    writeFileSync(path.join(root, 'demo', 'SKILL.md'), '---\ndescription: demo skill\n---\n');
    writeFileSync(path.join(root, 'demo', 'nested', 'helper.py'), 'print(1)\n');
    mkdirSync(path.join(root, 'not-a-skill'));
    process.env.SANDBOX_SITE_SKILLS_DIR = root;
  });

  afterEach(() => {
    delete process.env.SANDBOX_SITE_SKILLS_DIR;
    rmSync(root, { recursive: true, force: true });
  });

  function context() {
    return {
      input: {
        context: {
          options: {
            userId: 5,
            conversationId: 11,
            turnId: 'turn_site',
            messageId: 'message_site',
          },
        },
      },
    } as any;
  }

  it('copies site skills into the workspace once when the skill is missing', async () => {
    const sandbox = {
      isResident: () => true,
      isSessionRetired: () => false,
      beginTurn: jest.fn(async () => ({ handle: { id: 'generation-1' }, release: jest.fn() })),
      resourceStatus: jest.fn(async () => ({ state: 'writable' })),
      exec: jest.fn().mockResolvedValue({ exitCode: 0, aborted: false, timedOut: false }),
      readFile: jest.fn().mockRejectedValue(new Error('ENOENT')),
      writeFile: jest.fn().mockResolvedValue(undefined),
      listDir: jest.fn().mockResolvedValue([]),
    };
    const provider = new PrimitiveToolProvider(
      sandbox as any,
      {
        registerSandboxTurn: jest.fn(),
        listSandboxSkills: jest.fn(async (): Promise<FileAssetEntity[]> => []),
      } as any,
    );

    await provider.prepareTurn(context());
    const written = sandbox.writeFile.mock.calls.map((call: any[]) => call[1]);
    const commands = sandbox.exec.mock.calls.map((call: any[]) => call[1]);
    // mkdir 原子占位后先写临时名，再用硬链接挂到正式名（SKILL.md 最后）
    expect(written).toEqual([
      'skills/demo/nested/helper.py.99agent-part',
      'skills/demo/SKILL.md.99agent-part',
    ]);
    expect(
      commands.some(
        (command: string) =>
          command.includes('agent_link_noreplace') &&
          command.endsWith(
            "'skills/demo/nested/helper.py.99agent-part' 'skills/demo/nested/helper.py' 'skills/demo/SKILL.md.99agent-part' 'skills/demo/SKILL.md'",
          ),
      ),
    ).toBe(true);
    // 占位必须是单次 mkdir(2)（已存在即失败）：不能先检查再 mkdir -p，否则检查与创建之间有竞态窗口
    const claim = commands.find((command: string) => command.includes("'skills/demo'"))!;
    expect(claim.startsWith("if ! /bin/mkdir -- 'skills/demo' ")).toBe(true);
    expect(claim).not.toMatch(/mkdir -p|\[ -e 'skills\/demo' \][^;]*; then exit 3; fi; mkdir/u);
    expect(commands).toContain("/bin/rm -f -- 'skills/demo/.99agent-installing'");
    // 内部辅助命令一律用绝对路径：工作区里可写的 PATH 目录放了同名程序也顶替不了
    for (const command of commands) {
      expect(command).not.toMatch(
        /(?:^|[;&|{(]\s*|\b(?:then|do|else)\s+|!\s+)(?:rm|mkdir|rmdir|mv|cp|ln|cat|sed|find|head|python3)\s/u,
      );
    }

    await provider.prepareTurn(context());
    expect(sandbox.writeFile).toHaveBeenCalledTimes(2);
  });

  it('never overwrites a skill that already exists in the workspace', async () => {
    const sandbox = {
      isResident: () => true,
      isSessionRetired: () => false,
      beginTurn: jest.fn(async () => ({ handle: { id: 'generation-1' }, release: jest.fn() })),
      resourceStatus: jest.fn(async () => ({ state: 'writable' })),
      // 探测命令报告 skills/demo 已存在（哪怕缺 SKILL.md）：不覆盖
      exec: jest.fn(async (_owner: string, command: string) => ({
        exitCode: 0,
        aborted: false,
        timedOut: false,
        stdout: command.startsWith('for name in') ? 'present\tdemo\n' : '',
      })),
      readFile: jest.fn().mockResolvedValue(Buffer.from('-')),
      writeFile: jest.fn(),
      listDir: jest.fn().mockResolvedValue([]),
    };
    const provider = new PrimitiveToolProvider(
      sandbox as any,
      {
        registerSandboxTurn: jest.fn(),
        listSandboxSkills: jest.fn(async (): Promise<FileAssetEntity[]> => []),
      } as any,
    );
    await provider.prepareTurn(context());
    expect(sandbox.writeFile).not.toHaveBeenCalled();
  });

  /**
   * 模拟真实命令语义的假沙箱：mkdir 占位遇到已存在目录返回 3；带安装标记的目录探测为未完成；
   * rm -f 删除标记。
   */
  function statefulSandbox(
    options: {
      failProbes?: number;
      failWrites?: number;
      failMarkerRemovals?: number;
      /** 链接脚本处理完这么多个文件后中断（只注入一次） */
      failLinkAfter?: number;
      beforeClaim?: (name: string) => void;
    } = {},
  ) {
    const installed = new Map<string, string>();
    const incomplete = new Set<string>();
    /** 每个路径的当前内容（临时名与正式名） */
    const contents = new Map<string, string>();
    let failProbes = options.failProbes ?? 0;
    let failWrites = options.failWrites ?? 0;
    let failMarkerRemovals = options.failMarkerRemovals ?? 0;
    let failLinkAfter = options.failLinkAfter;
    const done = (exitCode: number, stdout = '') => ({
      exitCode,
      stdout,
      aborted: false,
      timedOut: false,
    });
    return {
      installed,
      incomplete,
      contents,
      isResident: () => true,
      isSessionRetired: () => false,
      beginTurn: jest.fn(async () => ({
        handle: { id: 'generation-1', persistent: true },
        release: jest.fn(),
      })),
      resourceStatus: jest.fn(async () => ({ state: 'writable', usage: { workspaceBytes: 0 } })),
      exec: jest.fn(async (_owner: string, command: string) => {
        if (command.startsWith('for name in')) {
          if (failProbes > 0) {
            failProbes--;
            return done(1);
          }
          const names = [...command.matchAll(/for name in ((?:'[^']*' ?)+);/gu)][0][1]
            .split(' ')
            .filter(Boolean)
            .map(quoted => quoted.slice(1, -1));
          return done(
            0,
            names
              .map(name =>
                incomplete.has(name)
                  ? `incomplete\t${name}\n`
                  : installed.has(name)
                    ? `present\t${name}\n`
                    : '',
              )
              .join(''),
          );
        }
        const claim = /^if ! \/bin\/mkdir -- 'skills\/([^']+)'/u.exec(command);
        if (claim) {
          options.beforeClaim?.(claim[1]);
          if (installed.has(claim[1])) return done(3);
          installed.set(claim[1], '');
          incomplete.add(claim[1]);
          return done(0);
        }
        if (command.includes('agent_link_noreplace')) {
          const pairs = [
            ...command.matchAll(/'(skills\/[^']+?)\.99agent-part' '(skills\/[^']+)'/gu),
          ];
          for (const [index, [, , final]] of pairs.entries()) {
            if (failLinkAfter !== undefined && index === failLinkAfter) {
              failLinkAfter = undefined;
              return done(1);
            }
            const part = `${final}.99agent-part`;
            // link(2)：正式名已存在即保留原内容
            if (!contents.has(final)) {
              contents.set(final, contents.get(part) ?? '');
              const skill = /^skills\/([^/]+)\/SKILL\.md$/u.exec(final);
              if (skill) installed.set(skill[1], contents.get(final)!);
            }
            contents.delete(part);
          }
          return done(0);
        }
        const removeMarker = /^\/bin\/rm -f -- 'skills\/([^']+)\/\.99agent-installing'$/u.exec(
          command,
        );
        if (removeMarker) {
          if (failMarkerRemovals > 0) {
            failMarkerRemovals--;
            return done(1);
          }
          incomplete.delete(removeMarker[1]);
        }
        return done(0);
      }),
      readFile: jest.fn().mockRejectedValue(new Error('ENOENT')),
      writeFile: jest.fn(async (_owner: string, target: string, content: Buffer) => {
        if (failWrites > 0) {
          failWrites--;
          throw new Error('synthetic write failure');
        }
        contents.set(target, content.toString());
      }),
      listDir: jest.fn().mockResolvedValue([]),
    };
  }

  function savedSkills(names: string[]) {
    const bundle = (name: string) =>
      encodeSkillPackage(name, [
        {
          path: 'SKILL.md',
          content: Buffer.from(`# saved ${name}`).toString('base64'),
          sha256: createHash('sha256').update(`# saved ${name}`).digest('hex'),
        },
      ]);
    return {
      registerSandboxTurn: jest.fn(),
      listSandboxSkills: jest.fn(async () =>
        names.map(name => ({ fileId: `file_${name}`, metadata: { skillName: name } })),
      ),
      readFilesForRuntime: jest.fn(async ({ fileIds }: { fileIds: string[] }) => [
        { buffer: bundle(fileIds[0].slice('file_'.length)) },
      ]),
    };
  }

  const probes = (sandbox: ReturnType<typeof statefulSandbox>) =>
    sandbox.exec.mock.calls.filter(([, command]: [string, string]) =>
      command.startsWith('for name in'),
    ).length;

  it('restores saved skills on a persistent disk only when the skill is absent', async () => {
    const sandbox = statefulSandbox();
    sandbox.installed.set('demo', 'user edited demo');
    const provider = new PrimitiveToolProvider(
      sandbox as any,
      savedSkills(['demo', 'fresh']) as any,
    );
    await provider.prepareTurn(context());
    // demo 已在工作区（用户改过）：保留；fresh 缺失：恢复；站点技能 demo 同名也不复制
    expect(Object.fromEntries(sandbox.installed)).toEqual({
      demo: 'user edited demo',
      fresh: '# saved fresh',
    });
    expect(sandbox.incomplete.size).toBe(0);
  });

  it('does not let a same-named site skill take the place of a saved skill after a failed probe', async () => {
    // 第一轮恢复私有技能时探测失败：本轮不能继续复制站点技能，否则站点版 demo 会占住目录
    const sandbox = statefulSandbox({ failProbes: 1 });
    const provider = new PrimitiveToolProvider(sandbox as any, savedSkills(['demo']) as any);
    await provider.prepareTurn(context());
    expect(sandbox.installed.size).toBe(0);
    await provider.prepareTurn(context());
    expect(sandbox.installed.get('demo')).toBe('# saved demo');
  });

  it('keeps a directory created by another conversation between probe and claim', async () => {
    const sandbox = statefulSandbox({
      beforeClaim: name => {
        if (name === 'demo' && !sandbox.installed.has('demo'))
          sandbox.installed.set('demo', 'created by another conversation');
      },
    });
    const provider = new PrimitiveToolProvider(sandbox as any, savedSkills([]) as any);
    await provider.prepareTurn(context());
    expect(sandbox.installed.get('demo')).toBe('created by another conversation');
    expect(sandbox.writeFile).not.toHaveBeenCalled();
  });

  it('resumes an unfinished install in place and never deletes anything', async () => {
    // 第一轮写入失败，目录带着安装标记留下；第二轮补写后删标记失败；第三轮完成
    const sandbox = statefulSandbox({ failWrites: 1, failMarkerRemovals: 1 });
    const provider = new PrimitiveToolProvider(sandbox as any, savedSkills([]) as any);
    await provider.prepareTurn(context());
    expect(sandbox.incomplete.has('demo')).toBe(true);
    await provider.prepareTurn(context());
    expect(sandbox.incomplete.has('demo')).toBe(true);
    expect(sandbox.installed.get('demo')).toContain('demo skill');
    await provider.prepareTurn(context());
    expect(sandbox.incomplete.has('demo')).toBe(false);
    expect(probes(sandbox)).toBe(3);
    // 装好后记为已准备，不再探测；全程没有任何删除目录的命令
    await provider.prepareTurn(context());
    expect(probes(sandbox)).toBe(3);
    const commands = sandbox.exec.mock.calls.map(([, command]: [string, string]) => command);
    expect(commands.some((command: string) => command.startsWith('rm -rf'))).toBe(false);
  });

  it('does not overwrite a file the user changed after an interrupted install', async () => {
    // helper.py 已挂到正式名后进程中断，SKILL.md 没挂上；用户随后改了 helper.py；下一轮只补上 SKILL.md
    const sandbox = statefulSandbox({ failLinkAfter: 1 });
    const provider = new PrimitiveToolProvider(sandbox as any, savedSkills([]) as any);
    await provider.prepareTurn(context());
    expect(sandbox.incomplete.has('demo')).toBe(true);
    expect(sandbox.contents.has('skills/demo/nested/helper.py')).toBe(true);
    sandbox.contents.set('skills/demo/nested/helper.py', 'user fix');
    await provider.prepareTurn(context());
    expect(sandbox.incomplete.has('demo')).toBe(false);
    expect(sandbox.contents.get('skills/demo/nested/helper.py')).toBe('user fix');
    expect(sandbox.installed.get('demo')).toContain('demo skill');
    expect([...sandbox.contents.keys()].some(key => key.endsWith('.99agent-part'))).toBe(false);
  });

  it('lists a restored saved skill right away even after an empty index was cached', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'skill-index-'));
    const service = new SandboxService(
      new LocalSandboxDriver(workspace),
      undefined,
      undefined,
      readSandboxPolicyFromEnv({}),
      0,
    );
    const owner = {
      ownerId: 'user-5',
      sessionId: 'user-5:conversation:1',
      conversationId: '1',
      userId: 5,
    };
    const previous = process.env.SANDBOX_SITE_SKILLS_DIR;
    delete process.env.SANDBOX_SITE_SKILLS_DIR;
    try {
      const library = new SkillLibrary(service, savedSkills(['demo']) as any);
      await service.acquire(owner.ownerId);
      expect(await library.index(owner.ownerId)).toBeUndefined();
      await library.prepare(owner);
      expect(await library.index(owner.ownerId)).toContain('demo');
    } finally {
      if (previous !== undefined) process.env.SANDBOX_SITE_SKILLS_DIR = previous;
      service.onModuleDestroy();
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('claims, finishes and never replaces directories on a real file system', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'skill-claim-'));
    const driver = new LocalSandboxDriver(workspace);
    const service = new SandboxService(
      driver,
      undefined,
      undefined,
      readSandboxPolicyFromEnv({}),
      0,
    );
    const owner = 'visitor-claim:conversation:1';
    try {
      const library = new SkillLibrary(service, {} as any) as any;
      const files = (name: string) => [
        { path: 'SKILL.md', buffer: Buffer.from(`---\ndescription: ${name} skill\n---\n`) },
        { path: 'lib/run.py', buffer: Buffer.from('print(1)') },
      ];
      const handle = await service.acquire(owner);
      const skills = path.join(handle.id, 'skills');
      expect(await library.installSkill(owner, 'fresh', undefined, files('fresh'))).toBe(true);
      expect(readdirSync(path.join(skills, 'fresh')).sort()).toEqual(['SKILL.md', 'lib']);

      // 已存在的空目录：mkdir 占位失败，不替换也不写入
      mkdirSync(path.join(skills, 'taken'));
      expect(await library.installSkill(owner, 'taken', undefined, files('taken'))).toBe(false);
      expect(readdirSync(path.join(skills, 'taken'))).toEqual([]);

      // 竞态：探测之后、占位命令执行之前另一个对话建好了目录（在真实命令执行前注入）
      const exec = service.exec.bind(service);
      const spy = jest.spyOn(service, 'exec').mockImplementation(async (...args: any[]) => {
        if (String(args[1]).includes("mkdir -- 'skills/raced'"))
          mkdirSync(path.join(skills, 'raced'));
        return exec(...(args as Parameters<typeof exec>));
      });
      expect(await library.installSkill(owner, 'raced', undefined, files('raced'))).toBe(false);
      expect(readdirSync(path.join(skills, 'raced'))).toEqual([]);
      spy.mockRestore();

      // 没装完的技能（带标记，SKILL.md 只写了一半）：探测为 incomplete、不进索引；补写后不删任何已有文件
      mkdirSync(path.join(skills, 'half/lib'), { recursive: true });
      // 没装完：lib/run.py 已挂上且被用户改过；SKILL.md 只留下写了一半的临时文件
      writeFileSync(path.join(skills, 'half/.99agent-installing'), '');
      writeFileSync(path.join(skills, 'half/lib/run.py'), 'print("user fix")');
      writeFileSync(path.join(skills, 'half/SKILL.md.99agent-part'), '---\ndescription: hal');
      writeFileSync(path.join(skills, 'half/user-note.txt'), 'kept');
      // 另一个没装完的技能：SKILL.md 已挂上但删标记失败——标记在就不进索引
      mkdirSync(path.join(skills, 'pending'));
      writeFileSync(path.join(skills, 'pending/.99agent-installing'), '');
      writeFileSync(
        path.join(skills, 'pending/SKILL.md'),
        '---\ndescription: pending skill\n---\n',
      );
      const states = await library.probeSkills(owner, [
        'fresh',
        'taken',
        'half',
        'pending',
        'missing',
      ]);
      expect(Object.fromEntries(states)).toEqual({
        fresh: 'present',
        taken: 'present',
        half: 'incomplete',
        pending: 'incomplete',
      });
      const index = await library.index(owner);
      expect(index).toContain('fresh: fresh skill');
      expect(index).not.toContain('half');
      expect(index).not.toContain('pending');
      expect(await library.installSkill(owner, 'half', 'incomplete', files('half'))).toBe(true);
      expect(readdirSync(path.join(skills, 'half')).sort()).toEqual([
        'SKILL.md',
        'lib',
        'user-note.txt',
      ]);
      expect(readFileSync(path.join(skills, 'half/SKILL.md'), 'utf8')).toContain('half skill');
      expect(readFileSync(path.join(skills, 'half/lib/run.py'), 'utf8')).toBe('print("user fix")');
      // 上一轮链接后没删掉临时名：两个名字共享同一 inode，用户又原地改了正式文件；补齐时不能连带改写
      mkdirSync(path.join(skills, 'linked'));
      writeFileSync(path.join(skills, 'linked/.99agent-installing'), '');
      writeFileSync(path.join(skills, 'linked/SKILL.md'), '---\ndescription: user edited\n---\n');
      linkSync(
        path.join(skills, 'linked/SKILL.md'),
        path.join(skills, 'linked/SKILL.md.99agent-part'),
      );
      expect(await library.installSkill(owner, 'linked', 'incomplete', files('linked'))).toBe(true);
      expect(readFileSync(path.join(skills, 'linked/SKILL.md'), 'utf8')).toContain('user edited');
      expect(readdirSync(path.join(skills, 'linked')).sort()).toEqual(['SKILL.md', 'lib']);

      // 装好后标记与临时文件都不在
      expect(readdirSync(path.join(skills, 'fresh'))).not.toContain('.99agent-installing');
      expect(readdirSync(path.join(skills, 'half/lib'))).toEqual(['run.py']);
    } finally {
      service.onModuleDestroy();
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { GlobalConfigRegistry } from '../globalConfig/global-config.registry';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { VerticalImportRegistry } from './vertical-import.registry';
import { VerticalImportService } from './vertical-import.service';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('VerticalImportService', () => {
  let root: string;
  let manifestPath: string;
  let globalConfig: {
    getConfigs: any;
    setConfig: any;
    prepareSettings: any;
    checkConfigValue: any;
    readStoredValue: any;
    compareAndSetConfig: any;
    dedicatedConfigKeys: any;
  };
  /** 数据库里 mcpServers 这一行的当前值 */
  let storedMcp: string | null;
  /** 通用写入真正写进去的项 */
  let written: Array<{ configKey: string; configVal: unknown }>;
  let registry: VerticalImportRegistry;
  let service: VerticalImportService;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'vertical-'));
    mkdirSync(path.join(root, 'skills', 'latex'), { recursive: true });
    writeFileSync(path.join(root, 'skills', 'latex', 'SKILL.md'), '---\ndescription: tex\n---\n');
    manifestPath = path.join(root, 'vertical.manifest.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        manifestVersion: 1,
        name: 'demo',
        site: {
          siteName: 'Demo',
          systemPrompt: 'be brief',
          configs: { maxToolCallsPerRequest: 12 },
        },
        mcpServers: [{ name: 'bank', url: 'https://bank.example.com/mcp', identitySecret: 's' }],
        sandbox: { image: 'demo/sandbox:1', skills: ['skills/latex'] },
        extensions: {
          packages: [{ planKey: 'p', variantName: 'm', planName: 'P', price: 1, credits: 1 }],
          unknown: {},
        },
      }),
    );
    storedMcp = JSON.stringify({ servers: [{ name: 'old', url: 'https://old.example.com/mcp' }] });
    written = [];
    // 写入前的检查用真实实现（预演与正式导入同一套），数据库写入本身由替身记录
    const configRegistry = new GlobalConfigRegistry();
    configRegistry.register({ name: 'mcp-demo', dedicatedKeys: ['mcpServers'] });
    const realConfig = new GlobalConfigService(
      { find: jest.fn().mockResolvedValue([]) } as any,
      { del: jest.fn() } as any,
      configRegistry,
    );
    globalConfig = {
      // 进程缓存不再读：MCP 段以数据库当前值为底
      getConfigs: jest.fn().mockRejectedValue(new Error('should not read the process cache')),
      setConfig: jest.fn(async (body: any) => {
        written.push(...(await realConfig.prepareSettings(body.settings)));
      }),
      prepareSettings: jest.fn((settings: any) => realConfig.prepareSettings(settings)),
      checkConfigValue: jest.fn((key: string, value: unknown) =>
        realConfig.checkConfigValue(key, value),
      ),
      readStoredValue: jest.fn(async () => storedMcp),
      compareAndSetConfig: jest.fn(async (key: string, expected: string, build: any) => {
        if (GlobalConfigService.revisionOf(storedMcp) !== expected) throw new Error('conflict');
        // 与真实的锁内路径相同：build 之后做同一套值检查
        storedMcp = await realConfig.checkConfigValue(key, await build(storedMcp));
        return { revision: GlobalConfigService.revisionOf(storedMcp) };
      }),
      dedicatedConfigKeys: jest.fn(() => configRegistry.dedicatedKeys()),
    };
    registry = new VerticalImportRegistry();
    service = new VerticalImportService(globalConfig as any, registry);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('dry-run plans everything without writing', async () => {
    const report = await service.importFromFile(manifestPath, {
      dryRun: true,
      siteSkillsDir: path.join(root, 'site-skills'),
    });
    expect(report.errors).toEqual([]);
    expect(globalConfig.setConfig).not.toHaveBeenCalled();
    expect(globalConfig.compareAndSetConfig).not.toHaveBeenCalled();
    expect(existsSync(path.join(root, 'site-skills'))).toBe(false);
    expect(report.applied).toEqual(
      expect.arrayContaining([
        expect.stringContaining('站点配置：siteName, systemPreMessage, maxToolCallsPerRequest'),
        expect.stringContaining('MCP 服务器：bank'),
        expect.stringContaining('技能：latex'),
      ]),
    );
    expect(report.manual).toEqual(
      expect.arrayContaining([
        expect.stringContaining('SANDBOX_IMAGE=demo/sandbox:1'),
        expect.stringContaining('extensions.packages'),
        expect.stringContaining('extensions.unknown'),
      ]),
    );
  });

  it('writes site config, merges mcp servers by name, copies skills and runs registered handlers', async () => {
    const handler = {
      section: 'packages',
      apply: jest
        .fn()
        .mockResolvedValue({ applied: ['套餐 p / m（已新建）'], skipped: [], manual: [] }),
    };
    registry.register(handler as any);
    const siteSkillsDir = path.join(root, 'site-skills');

    const report = await service.importFromFile(manifestPath, { siteSkillsDir });

    expect(report.errors).toEqual([]);
    const settings = globalConfig.setConfig.mock.calls.flatMap((call: any[]) => call[0].settings);
    expect(settings).toEqual(
      expect.arrayContaining([
        { configKey: 'siteName', configVal: 'Demo' },
        { configKey: 'systemPreMessage', configVal: 'be brief' },
        { configKey: 'maxToolCallsPerRequest', configVal: '12' },
      ]),
    );
    // MCP 段走带修订号的原子写入，不经通用 setConfig
    expect(settings.find((item: any) => item.configKey === 'mcpServers')).toBeUndefined();
    expect(globalConfig.compareAndSetConfig).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storedMcp!).servers.map((item: any) => item.name)).toEqual(['old', 'bank']);
    expect(readFileSync(path.join(siteSkillsDir, 'latex', 'SKILL.md'), 'utf8')).toContain('tex');
    expect(handler.apply).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ dryRun: false, manifestDir: root }),
    );
    expect(report.applied).toContain('套餐 p / m（已新建）');
    expect(report.manual).toEqual(
      expect.arrayContaining([expect.stringContaining('extensions.unknown')]),
    );
  });

  it('reports validation and mcp errors instead of writing', async () => {
    writeFileSync(manifestPath, JSON.stringify({ manifestVersion: 1, name: 'x!' }));
    const invalid = await service.importFromFile(manifestPath);
    expect(invalid.errors.length).toBeGreaterThan(0);
    expect(globalConfig.setConfig).not.toHaveBeenCalled();

    writeFileSync(
      manifestPath,
      JSON.stringify({
        manifestVersion: 1,
        name: 'demo',
        mcpServers: [{ name: 'bad', url: 'ftp://x' }],
      }),
    );
    const badMcp = await service.importFromFile(manifestPath);
    expect(badMcp.errors).toEqual([expect.stringContaining('MCP 配置不合法')]);
    expect(globalConfig.setConfig).not.toHaveBeenCalled();
    expect(globalConfig.compareAndSetConfig).not.toHaveBeenCalled();
  });

  it('existing MCP config with unparsable entries: dry-run and real import both report and write nothing', async () => {
    for (const broken of [
      '{not json',
      JSON.stringify({ servers: [{ name: 'bad', url: 'http://169.254.169.254/' }] }),
    ]) {
      storedMcp = broken;
      for (const dryRun of [true, false]) {
        globalConfig.compareAndSetConfig.mockClear();
        const report = await service.importFromFile(manifestPath, {
          dryRun,
          siteSkillsDir: path.join(root, 'site-skills'),
        });
        expect(report.errors).toEqual(
          expect.arrayContaining([expect.stringContaining('现有 MCP 配置里有无法解析的条目')]),
        );
        expect(globalConfig.compareAndSetConfig).not.toHaveBeenCalled();
        expect(storedMcp).toBe(broken);
      }
    }
  });

  it('a concurrent change between reading and writing makes the import fail instead of overwriting', async () => {
    globalConfig.compareAndSetConfig.mockImplementationOnce(async () => {
      throw new Error('配置已被其他人修改，请刷新后重试');
    });
    const report = await service.importFromFile(manifestPath, {
      siteSkillsDir: path.join(root, 'site-skills'),
    });
    expect(report.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('写入 MCP 配置失败')]),
    );
  });

  it('site.configs cannot carry mcpServers: dry-run and real import both report without writing', async () => {
    writeFileSync(
      manifestPath,
      JSON.stringify({
        manifestVersion: 1,
        name: 'demo',
        site: { siteName: 'Demo', configs: { mcpServers: '{"servers":[]}' } },
      }),
    );
    for (const dryRun of [true, false]) {
      globalConfig.setConfig.mockClear();
      const report = await service.importFromFile(manifestPath, { dryRun });
      expect(report.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('站点配置不能包含 mcpServers')]),
      );
      expect(globalConfig.setConfig).not.toHaveBeenCalled();
    }
  });

  it('MCP 条目里有脱敏占位：预演与正式导入报同一个错，都不写', async () => {
    writeFileSync(
      manifestPath,
      JSON.stringify({
        manifestVersion: 1,
        name: 'demo',
        mcpServers: [
          {
            name: 'bank',
            url: 'https://bank.example.com/mcp',
            headers: { Authorization: 'Bearer abc****wxyz' },
          },
        ],
      }),
    );
    const before = storedMcp;
    const reports = [];
    for (const dryRun of [true, false]) {
      const report = await service.importFromFile(manifestPath, { dryRun });
      reports.push(report.errors);
      expect(report.applied).toEqual([]);
      expect(storedMcp).toBe(before);
    }
    expect(reports[0]).toEqual(['写入 MCP 配置失败：配置里不能包含脱敏占位，请重新填写密钥']);
    expect(reports[1]).toEqual(reports[0]);
  });

  it('site.configs 的键与已登记的键只差大小写（如 McpServers）：预演与正式导入报同一个错，都不写', async () => {
    writeFileSync(
      manifestPath,
      JSON.stringify({
        manifestVersion: 1,
        name: 'demo',
        site: { siteName: 'Demo', configs: { McpServers: '{"servers":[]}' } },
      }),
    );
    const reports = [];
    for (const dryRun of [true, false]) {
      const report = await service.importFromFile(manifestPath, { dryRun });
      reports.push(report.errors);
      expect(report.applied).toEqual([]);
    }
    expect(reports[0]).toEqual(['写入站点配置失败：配置项 McpServers 应写作 mcpServers']);
    expect(reports[1]).toEqual(reports[0]);
    expect(written).toEqual([]);
  });
});

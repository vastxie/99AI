import { Injectable, Logger } from '@nestjs/common';
import type { VerticalManifestV1 } from '@99agent/contracts';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { parseMcpServersConfig } from '../mcp/mcp-config';
import { validateVerticalManifest } from './vertical-manifest';
import { VerticalImportRegistry } from './vertical-import.registry';
import { SITE_SKILLS_ENV } from '@/common/constants/site-skills.constant';

const MCP_SERVERS_CONFIG_KEY = 'mcpServers';
const LOG_CONTEXT = 'VerticalImport';

export interface VerticalImportReport {
  name: string;
  dryRun: boolean;
  applied: string[];
  skipped: string[];
  manual: string[];
  errors: string[];
}

export interface VerticalImportOptions {
  dryRun?: boolean;
  /** 覆盖 SANDBOX_SITE_SKILLS_DIR（测试用） */
  siteSkillsDir?: string;
}

const SITE_CONFIG_KEYS: Array<[keyof NonNullable<VerticalManifestV1['site']>, string]> = [
  ['siteName', 'siteName'],
  ['siteDescription', 'siteDescription'],
  ['systemPrompt', 'systemPreMessage'],
];

/** 合并前发现的问题：以静态文案报告给导入结果（不是程序错误） */
class VerticalImportConflict extends Error {}

function normalizeExistingServers(raw: unknown): Array<Record<string, unknown>> {
  let value = raw;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      value = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object');
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.servers)) {
      return record.servers.filter(item => item && typeof item === 'object') as Array<
        Record<string, unknown>
      >;
    }
    if (record.mcpServers && typeof record.mcpServers === 'object') {
      return Object.entries(record.mcpServers as Record<string, unknown>).map(([name, entry]) => ({
        name,
        ...(entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}),
      }));
    }
  }
  return [];
}

/**
 * 垂直包清单导入：站点配置、MCP 服务器、沙箱技能写入内核；扩展包专属段交给注册表；
 * 需要改环境变量或重建镜像的项只列入 manual，不自动执行。
 */
@Injectable()
export class VerticalImportService {
  constructor(
    private readonly globalConfigService: GlobalConfigService,
    private readonly registry: VerticalImportRegistry,
  ) {}

  async importFromFile(
    manifestPath: string,
    options: VerticalImportOptions = {},
  ): Promise<VerticalImportReport> {
    const absolute = path.resolve(manifestPath);
    let raw: unknown;
    try {
      raw = JSON.parse(await fs.readFile(absolute, 'utf8'));
    } catch (error) {
      return {
        name: '',
        dryRun: Boolean(options.dryRun),
        applied: [],
        skipped: [],
        manual: [],
        errors: [`读取清单失败：${(error as Error).message}`],
      };
    }
    return this.importManifest(raw, path.dirname(absolute), options);
  }

  async importManifest(
    raw: unknown,
    manifestDir: string,
    options: VerticalImportOptions = {},
  ): Promise<VerticalImportReport> {
    const dryRun = Boolean(options.dryRun);
    const validation = validateVerticalManifest(raw);
    if (!validation.manifest) {
      return { name: '', dryRun, applied: [], skipped: [], manual: [], errors: validation.errors };
    }
    const manifest = validation.manifest;
    const report: VerticalImportReport = {
      name: manifest.name,
      dryRun,
      applied: [],
      skipped: [],
      manual: [],
      errors: [],
    };

    await this.applySite(manifest, dryRun, report);
    await this.applyMcpServers(manifest, dryRun, report);
    await this.applySkills(manifest, manifestDir, dryRun, options, report);
    if (manifest.sandbox?.image) {
      report.manual.push(`设置环境变量 SANDBOX_IMAGE=${manifest.sandbox.image} 并重启后端`);
    }
    await this.applyExtensions(manifest, manifestDir, dryRun, report);
    return report;
  }

  private async applySite(
    manifest: VerticalManifestV1,
    dryRun: boolean,
    report: VerticalImportReport,
  ) {
    const settings: Array<{ configKey: string; configVal: string }> = [];
    for (const [field, configKey] of SITE_CONFIG_KEYS) {
      const value = manifest.site?.[field];
      if (typeof value === 'string') settings.push({ configKey, configVal: value });
    }
    for (const [key, value] of Object.entries(manifest.site?.configs || {})) {
      settings.push({ configKey: key, configVal: String(value) });
    }
    if (settings.length === 0) return;
    // 专用键（如 mcpServers）不能经站点配置写：预演与正式导入都报告，不写入
    const dedicated = this.globalConfigService.dedicatedConfigKeys();
    const blocked = settings.find(item => dedicated.has(item.configKey));
    if (blocked) {
      report.errors.push(
        `站点配置不能包含 ${blocked.configKey}：请写在清单对应的段里（例如 mcpServers 段）`,
      );
      return;
    }
    try {
      // 预演与正式导入走同一套写入前检查（键名大小写、类型与大小、各扩展包的校验器），结果一致
      if (dryRun)
        await this.globalConfigService.prepareSettings(settings.map(item => ({ ...item })));
      else await this.globalConfigService.setConfig({ settings } as any);
    } catch (error) {
      report.errors.push(`写入站点配置失败：${(error as Error).message}`);
      return;
    }
    report.applied.push(`站点配置：${settings.map(item => item.configKey).join(', ')}`);
  }

  private async applyMcpServers(
    manifest: VerticalManifestV1,
    dryRun: boolean,
    report: VerticalImportReport,
  ) {
    const incoming = manifest.mcpServers || [];
    if (incoming.length === 0) return;
    /** 以数据库当前值为底合并；当前值里有无法解析的条目（非法 JSON、被过滤的条目）时不写，避免把它们静默覆盖掉 */
    const mergeInto = (current: string | null): string => {
      const existing = parseMcpServersConfig(current ?? undefined);
      if (existing.errors.length) {
        throw new VerticalImportConflict(
          `现有 MCP 配置里有无法解析的条目，请先在管理后台修正：${existing.errors[0]}`,
        );
      }
      const merged = normalizeExistingServers(current ?? '');
      for (const server of incoming) {
        const index = merged.findIndex(item => item.name === server.name);
        if (index >= 0) merged[index] = { ...server };
        else merged.push({ ...server });
      }
      const parsed = parseMcpServersConfig({ servers: merged });
      if (parsed.errors.length) {
        throw new VerticalImportConflict(`MCP 配置不合法：${parsed.errors[0]}`);
      }
      return JSON.stringify({ servers: merged });
    };
    let current: string | null;
    try {
      // 读数据库（不读进程缓存）：预演与正式导入用同一份当前值与同一套检查
      current = await this.globalConfigService.readStoredValue(MCP_SERVERS_CONFIG_KEY);
      mergeInto(current);
    } catch (error) {
      report.errors.push(
        error instanceof VerticalImportConflict
          ? error.message
          : `读取现有 MCP 配置失败：${(error as Error).message}`,
      );
      return;
    }
    try {
      if (dryRun) {
        // 预演跑正式写入在锁内做的同一套值检查（类型与大小、校验器、脱敏占位），两种模式结果一致
        await this.globalConfigService.checkConfigValue(MCP_SERVERS_CONFIG_KEY, mergeInto(current));
      } else {
        // 与管理端同一条原子写入：锁内按修订号核对，期间被改过就失败，不覆盖
        await this.globalConfigService.compareAndSetConfig(
          MCP_SERVERS_CONFIG_KEY,
          GlobalConfigService.revisionOf(current),
          mergeInto,
        );
      }
    } catch (error) {
      report.errors.push(`写入 MCP 配置失败：${(error as Error).message}`);
      return;
    }
    report.applied.push(`MCP 服务器：${incoming.map(item => item.name).join(', ')}`);
  }

  private async applySkills(
    manifest: VerticalManifestV1,
    manifestDir: string,
    dryRun: boolean,
    options: VerticalImportOptions,
    report: VerticalImportReport,
  ) {
    const skills = manifest.sandbox?.skills || [];
    if (skills.length === 0) return;
    const targetRoot = String(options.siteSkillsDir ?? process.env[SITE_SKILLS_ENV] ?? '').trim();
    if (!targetRoot) {
      report.manual.push(
        `配置 ${SITE_SKILLS_ENV} 后重新导入，或手动把技能目录复制到该目录：${skills.join(', ')}`,
      );
      return;
    }
    for (const entry of skills) {
      const source = path.resolve(manifestDir, entry);
      const relative = path.relative(manifestDir, source);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        report.errors.push(`技能目录越出清单目录：${entry}`);
        continue;
      }
      const name = path.basename(source);
      try {
        await fs.access(path.join(source, 'SKILL.md'));
      } catch {
        report.errors.push(`技能目录缺少 SKILL.md：${entry}`);
        continue;
      }
      if (!dryRun) {
        try {
          await fs.mkdir(targetRoot, { recursive: true });
          await fs.cp(source, path.join(targetRoot, name), { recursive: true, force: true });
        } catch (error) {
          report.errors.push(`复制技能 ${name} 失败：${(error as Error).message}`);
          continue;
        }
      }
      report.applied.push(`技能：${name} → ${path.join(targetRoot, name)}`);
    }
  }

  private async applyExtensions(
    manifest: VerticalManifestV1,
    manifestDir: string,
    dryRun: boolean,
    report: VerticalImportReport,
  ) {
    for (const [section, payload] of Object.entries(manifest.extensions || {})) {
      const handler = this.registry.get(section);
      if (!handler) {
        report.manual.push(`extensions.${section}：没有装载对应的扩展包，未处理`);
        continue;
      }
      try {
        const result = await handler.apply(payload, { manifest, manifestDir, dryRun });
        report.applied.push(...result.applied);
        report.skipped.push(...result.skipped);
        report.manual.push(...result.manual);
      } catch (error) {
        Logger.warn(
          `[${LOG_CONTEXT}] extensions.${section} 处理失败：${(error as Error).message}`,
          LOG_CONTEXT,
        );
        report.errors.push(`extensions.${section} 处理失败：${(error as Error).message}`);
      }
    }
  }
}

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { isMaskedSecret, maskSecret } from '@/common/utils/secret-mask.util';
import { GlobalConfigRegistry } from '../globalConfig/global-config.registry';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import type { McpServerInputDto } from './dto/mcp-admin.dto';
import { MCP_SERVERS_GLOBAL_CONFIG_KEY, McpClientService } from './mcp-client.service';
import {
  buildMcpToolName,
  isMcpStdioCommandAllowed,
  isMcpToolAllowed,
  McpServerConfig,
  McpStdioPolicy,
  parseMcpServersConfig,
  readMcpStdioPolicy,
} from './mcp-config';

const LOG_CONTEXT = 'McpAdmin';
const MAX_SECRET_ENTRIES = 50;
const MAX_SECRET_LENGTH = 4096;

export interface McpServerView extends Omit<McpServerConfig, 'headers' | 'env' | 'identitySecret'> {
  /** env：来自 MCP_SERVERS_JSON，只读；config：后台保存 */
  source: 'env' | 'config';
  headers?: Record<string, string>;
  env?: Record<string, string>;
  identitySecret?: string;
  /** stdio 服务器是否被 MCP_STDIO_ENABLED / MCP_STDIO_COMMAND_ALLOWLIST 放行 */
  stdioAllowed?: boolean;
  /** 后台配置与 MCP_SERVERS_JSON 同名，覆盖了环境变量里的那一项；删除后恢复环境变量的配置 */
  overridesEnv?: boolean;
}

export interface McpServersView {
  servers: McpServerView[];
  errors: string[];
  stdio: McpStdioPolicy;
  /** 后台配置（数据库里 mcpServers 这一行）的修订号：保存时带回，被别人改过就拒绝 */
  revision: string;
  /** 后台配置里无法解析的条目说明：有时保存前要确认丢弃它们 */
  storedErrors: string[];
}

export interface SaveMcpServersOptions {
  revision?: string;
  /** 已确认丢弃存储里无法解析的条目 */
  discardInvalid?: boolean;
}

export interface McpServerTestResult {
  ok: boolean;
  message?: string;
  tools?: Array<{ name: string; description: string; exposedName: string; allowed: boolean }>;
}

function badRequest(message: string): HttpException {
  return new HttpException(message, HttpStatus.BAD_REQUEST);
}

function conflict(message: string): HttpException {
  return new HttpException(message, HttpStatus.CONFLICT);
}

function maskRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, maskSecret(value)]));
}

/** 脱敏占位表示沿用原值；没有原值时拒绝，不能把占位符当成新密钥写入 */
function restoreSecret(value: string, previous: string | undefined, label: string): string {
  if (!isMaskedSecret(value)) return value;
  if (previous === undefined) throw badRequest(`请重新填写${label}`);
  return previous;
}

function restoreRecord(
  value: Record<string, unknown> | undefined,
  previous: Record<string, string> | undefined,
  label: string,
): Record<string, string> | undefined {
  if (!value) return undefined;
  const entries = Object.entries(value);
  if (entries.length > MAX_SECRET_ENTRIES)
    throw badRequest(`${label}最多 ${MAX_SECRET_ENTRIES} 项`);
  const result: Record<string, string> = {};
  for (const [key, entry] of entries) {
    if (typeof entry !== 'string' || entry.length > MAX_SECRET_LENGTH) {
      throw badRequest(`${label} ${key} 必须是不超过 ${MAX_SECRET_LENGTH} 个字符的字符串`);
    }
    result[key] = restoreSecret(entry, previous?.[key], `${label} ${key}`);
  }
  return result;
}

/**
 * 后台的 MCP 服务器管理：环境变量 MCP_SERVERS_JSON 里的服务器只读展示，
 * 后台保存的写入全局配置 mcpServers（与垂直包导入同一格式 { servers: [...] }）。
 */
@Injectable()
export class McpAdminService {
  constructor(
    private readonly globalConfigService: GlobalConfigService,
    private readonly mcpClient: McpClientService,
    registry: GlobalConfigRegistry,
  ) {
    registry.register({
      name: 'mcp',
      // 整段 JSON 含请求头、环境变量里的令牌：通用配置接口只回显脱敏值，编辑统一走 /mcp/servers
      secretKeys: [MCP_SERVERS_GLOBAL_CONFIG_KEY],
      // 整表保存要和修订号一起原子比较：通用 config/set（含垂直导入的 site.configs）不得写
      dedicatedKeys: [MCP_SERVERS_GLOBAL_CONFIG_KEY],
      validate: item => {
        if (item.configKey !== MCP_SERVERS_GLOBAL_CONFIG_KEY) return;
        const { errors } = parseMcpServersConfig(item.configVal);
        if (errors.length) throw badRequest(errors[0]);
      },
    });
  }

  /** 从数据库读后台配置（不读进程缓存：命令行导入后不重启也能看到并在其上编辑） */
  async listServers(): Promise<McpServersView> {
    const fromEnv = parseMcpServersConfig(process.env.MCP_SERVERS_JSON);
    const storedValue = await this.globalConfigService.readStoredValue(
      MCP_SERVERS_GLOBAL_CONFIG_KEY,
    );
    const stored = parseMcpServersConfig(storedValue ?? undefined);
    const policy = readMcpStdioPolicy();
    const storedNames = new Set(stored.servers.map(server => server.name));
    const envNames = new Set(fromEnv.servers.map(server => server.name));
    const view = (server: McpServerConfig, source: McpServerView['source']): McpServerView => {
      const { headers, env, identitySecret, ...rest } = server;
      return {
        ...rest,
        source,
        ...(headers ? { headers: maskRecord(headers) } : {}),
        ...(env ? { env: maskRecord(env) } : {}),
        ...(identitySecret ? { identitySecret: maskSecret(identitySecret) } : {}),
        ...(server.transport === 'stdio'
          ? { stdioAllowed: isMcpStdioCommandAllowed(policy, server.command || '') }
          : {}),
      };
    };
    return {
      servers: [
        // 同名时后台配置覆盖环境变量（与运行时合并规则一致）
        ...fromEnv.servers.filter(server => !storedNames.has(server.name)).map(s => view(s, 'env')),
        ...stored.servers.map(server => ({
          ...view(server, 'config'),
          ...(envNames.has(server.name) ? { overridesEnv: true } : {}),
        })),
      ],
      errors: [
        ...fromEnv.errors.map(error => `MCP_SERVERS_JSON：${error}`),
        ...stored.errors.map(error => `后台配置：${error}`),
      ],
      stdio: policy,
      revision: GlobalConfigService.revisionOf(storedValue),
      storedErrors: stored.errors,
    };
  }

  /**
   * 整表保存：带上读取时的修订号，锁内与数据库当前值比较（不一致 409），脱敏密钥按数据库当前值恢复。
   * 数据库里有无法解析的条目时，只有确认丢弃（discardInvalid）才保存
   */
  async saveServers(
    inputs: McpServerInputDto[],
    options: SaveMcpServersOptions = {},
  ): Promise<McpServersView> {
    if (!options.revision) throw conflict('页面已更新，请刷新后重试');
    await this.globalConfigService.compareAndSetConfig(
      MCP_SERVERS_GLOBAL_CONFIG_KEY,
      options.revision,
      current => this.buildStoredValue(inputs, current, Boolean(options.discardInvalid)),
    );
    return this.listServers();
  }

  private buildStoredValue(
    inputs: McpServerInputDto[],
    current: string | null,
    discardInvalid: boolean,
  ): string {
    const stored = parseMcpServersConfig(current ?? undefined);
    if (stored.errors.length && !discardInvalid) {
      throw conflict('后台配置里有无法解析的条目，请确认丢弃后再保存');
    }
    const envNames = new Set(
      parseMcpServersConfig(process.env.MCP_SERVERS_JSON).servers.map(server => server.name),
    );
    const previous = new Map(stored.servers.map(server => [server.name, server]));
    const seen = new Set<string>();
    const bodies = inputs.map(input => {
      // 同名时后台配置覆盖环境变量：只拦新增的同名，已有的覆盖（如垂直包导入写入）可继续编辑或删除
      if (envNames.has(input.name) && !previous.has(input.name)) {
        throw badRequest(`${input.name} 已由环境变量 MCP_SERVERS_JSON 配置，请换一个名字`);
      }
      if (seen.has(input.name)) throw badRequest(`MCP 服务器名重复：${input.name}`);
      seen.add(input.name);
      const old = previous.get(input.name);
      return {
        ...input,
        headers: restoreRecord(input.headers, old?.headers, `${input.name} 的请求头`),
        env: restoreRecord(input.env, old?.env, `${input.name} 的环境变量`),
        identitySecret: input.identitySecret
          ? restoreSecret(input.identitySecret, old?.identitySecret, `${input.name} 的身份签名密钥`)
          : undefined,
      };
    });
    const parsed = parseMcpServersConfig({ servers: bodies });
    if (parsed.errors.length) throw badRequest(parsed.errors[0]);
    return JSON.stringify({ servers: parsed.servers });
  }

  /** 按当前生效配置连接一次并刷新工具列表；失败只返回静态文案，不透出远端原始错误 */
  async testServer(name: string): Promise<McpServerTestResult> {
    let servers: McpServerConfig[];
    try {
      ({ servers } = await this.mcpClient.resolveServers());
    } catch {
      return { ok: false, message: 'MCP 配置无效或暂不可用，请先修正配置' };
    }
    const server = servers.find(item => item.name === name);
    if (!server) {
      return {
        ok: false,
        message: '找不到该服务器；stdio 服务器需先在 MCP_STDIO_COMMAND_ALLOWLIST 中放行',
      };
    }
    try {
      const tools = await this.mcpClient.listTools(server, { refresh: true });
      return {
        ok: true,
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description || '',
          exposedName: buildMcpToolName(server.name, tool.name),
          allowed: isMcpToolAllowed(server, tool.name),
        })),
      };
    } catch {
      Logger.warn('MCP 服务器测试连接失败', LOG_CONTEXT);
      return { ok: false, message: '连接 MCP 服务器或读取工具列表失败，请检查地址、鉴权与网络' };
    }
  }
}

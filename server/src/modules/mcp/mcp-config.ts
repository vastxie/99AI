/**
 * MCP 客户端配置
 *
 * 配置来源有两处，按服务器 name 合并，后者覆盖前者：
 *   1. 环境变量 MCP_SERVERS_JSON（静态部署配置）
 *   2. 全局配置项 mcpServers（管理端可改，存于 config 表）
 *
 * 两种 JSON 形态都接受：
 *   { "servers": [ { "name": "docs", "url": "https://.../mcp", "headers": {...} } ] }
 *   { "mcpServers": { "docs": { "type": "streamable-http", "url": "..." } } }   // Claude Desktop / Cursor 风格
 *
 * 每次工具调用会在 params._meta['99agent/caller'] 里透传当前用户身份（passIdentity，默认开启）；
 * 配置 identitySecret 后附带 HMAC-SHA256 签名，垂直包的 MCP 服务用同一密钥校验（见 mcp-caller-identity.ts）。
 *
 * stdio 传输会在本机拉起子进程，只有 MCP_STDIO_ENABLED=true 且命令在
 * MCP_STDIO_COMMAND_ALLOWLIST 中时才允许，避免管理端配置直接变成任意命令执行。
 */

import { isAbsolute } from 'node:path';
import { isCloudMetadataHost } from '@/common/utils/safe-download.util';

export type McpTransportKind = 'http' | 'stdio';

export interface McpToolFilter {
  /** 允许暴露的远端工具名（支持尾部 * 通配）；为空表示全部允许 */
  allow?: string[];
  /** 拒绝暴露的远端工具名（支持尾部 * 通配），优先级高于 allow */
  deny?: string[];
}

export interface McpServerConfig {
  /** 小写字母 / 数字 / _ / -，最长 32 位；也是模型可见工具名的中缀 */
  name: string;
  transport: McpTransportKind;
  /** http 传输：Streamable HTTP 端点 */
  url?: string;
  headers?: Record<string, string>;
  /** stdio 传输：本机命令 */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  enabled: boolean;
  tools?: McpToolFilter;
  /** 单次请求超时（连接 / 列举 / 调用共用） */
  timeoutMs: number;
  /** 工具列表缓存时间 */
  toolsCacheTtlMs: number;
  description?: string;
  /** 是否在每次调用的 _meta['99agent/caller'] 里透传当前用户身份（默认 true） */
  passIdentity: boolean;
  /** 身份签名密钥（HMAC-SHA256）；服务端用同一密钥校验，见 mcp-caller-identity.ts */
  identitySecret?: string;
}

export interface McpServersParseResult {
  servers: McpServerConfig[];
  errors: string[];
}

export interface McpStdioPolicy {
  enabled: boolean;
  allowlist: string[];
}

export const MCP_TOOL_NAME_PREFIX = 'mcp__';
export const MCP_DEFAULT_TIMEOUT_MS = 60_000;
export const MCP_DEFAULT_TOOLS_CACHE_TTL_MS = 60_000;
export const MCP_MAX_TOOL_NAME_LENGTH = 64;

const SERVER_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/u;
const TOOL_NAME_UNSAFE_PATTERN = /[^A-Za-z0-9_-]/gu;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isPlainObject(value)) return undefined;
  const record: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') record[key] = entry;
    else if (typeof entry === 'number' || typeof entry === 'boolean') record[key] = String(entry);
  }
  return record;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function asPositiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
}

function normalizeTransport(
  declared: string,
  url: string,
  command: string,
): McpTransportKind | { error: string } {
  const value = declared.trim().toLowerCase();
  if (value === 'stdio') return 'stdio';
  if (
    value === 'http' ||
    value === 'streamable-http' ||
    value === 'streamablehttp' ||
    value === 'streamable_http'
  ) {
    return 'http';
  }
  if (value) return { error: `transport 不支持：${declared}（只支持 http / stdio）` };
  if (url) return 'http';
  if (command) return 'stdio';
  return { error: '缺少 url（http）或 command（stdio）' };
}

function normalizeServer(body: unknown): { server: McpServerConfig } | { error: string } {
  if (!isPlainObject(body)) return { error: 'MCP 服务器配置必须是对象' };

  const rawName = typeof body.name === 'string' ? body.name.trim().toLowerCase() : '';
  if (!SERVER_NAME_PATTERN.test(rawName)) {
    return {
      error: `MCP 服务器名不合法：${JSON.stringify(body.name ?? '')}（只允许小写字母、数字、_ 和 -，最长 32 位）`,
    };
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  const command = typeof body.command === 'string' ? body.command.trim() : '';
  const declared =
    typeof body.transport === 'string'
      ? body.transport
      : typeof body.type === 'string'
        ? body.type
        : '';
  const transport = normalizeTransport(declared, url, command);
  if (typeof transport !== 'string') {
    return { error: `MCP 服务器 ${rawName}：${transport.error}` };
  }

  if (transport === 'http') {
    if (!url) return { error: `MCP 服务器 ${rawName}：http 传输缺少 url` };
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { error: `MCP 服务器 ${rawName}：url 只支持 http / https` };
      }
      if (isCloudMetadataHost(parsed.hostname)) {
        return { error: `MCP 服务器 ${rawName}：url 不能指向云平台元数据服务` };
      }
    } catch {
      return { error: `MCP 服务器 ${rawName}：url 不合法` };
    }
  } else if (!command) {
    return { error: `MCP 服务器 ${rawName}：stdio 传输缺少 command` };
  }

  const server: McpServerConfig = {
    name: rawName,
    transport,
    enabled: asBoolean(body.enabled, true),
    timeoutMs: asPositiveInt(body.timeoutMs, MCP_DEFAULT_TIMEOUT_MS),
    toolsCacheTtlMs: asPositiveInt(body.toolsCacheTtlMs, MCP_DEFAULT_TOOLS_CACHE_TTL_MS),
    passIdentity: asBoolean(body.passIdentity, true),
  };
  if (typeof body.identitySecret === 'string' && body.identitySecret.trim()) {
    server.identitySecret = body.identitySecret.trim();
  }

  if (transport === 'http') {
    server.url = url;
    const headers = asStringRecord(body.headers);
    if (headers && Object.keys(headers).length > 0) server.headers = headers;
  } else {
    server.command = command;
    const args = asStringArray(body.args);
    if (args) server.args = args;
    const env = asStringRecord(body.env);
    if (env && Object.keys(env).length > 0) server.env = env;
    if (typeof body.cwd === 'string' && body.cwd.trim()) server.cwd = body.cwd.trim();
  }

  if (isPlainObject(body.tools)) {
    const allow = asStringArray(body.tools.allow);
    const deny = asStringArray(body.tools.deny);
    if (allow?.length || deny?.length) {
      server.tools = {
        ...(allow?.length ? { allow } : {}),
        ...(deny?.length ? { deny } : {}),
      };
    }
  }

  if (typeof body.description === 'string' && body.description.trim()) {
    server.description = body.description.trim();
  }

  return { server };
}

/**
 * 解析一份 MCP 配置（字符串或已解析的 JSON）。
 * 解析失败不抛异常：坏条目进入 errors，其余条目照常生效。
 */
export function parseMcpServersConfig(raw: unknown): McpServersParseResult {
  const errors: string[] = [];
  if (raw === undefined || raw === null || raw === '') return { servers: [], errors };

  let value: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return { servers: [], errors };
    try {
      value = JSON.parse(trimmed);
    } catch (error) {
      return { servers: [], errors: [`MCP 配置不是合法 JSON：${(error as Error).message}`] };
    }
  }

  const bodies: unknown[] = [];
  if (Array.isArray(value)) {
    bodies.push(...value);
  } else if (isPlainObject(value)) {
    if (Array.isArray(value.servers)) {
      bodies.push(...value.servers);
    } else if (isPlainObject(value.mcpServers)) {
      for (const [name, body] of Object.entries(value.mcpServers)) {
        bodies.push(isPlainObject(body) ? { ...body, name } : body);
      }
    } else {
      errors.push('MCP 配置缺少 servers 数组或 mcpServers 对象');
    }
  } else {
    errors.push('MCP 配置必须是 JSON 对象或数组');
  }

  const seen = new Set<string>();
  const servers: McpServerConfig[] = [];
  for (const body of bodies) {
    const normalized = normalizeServer(body);
    if ('error' in normalized) {
      errors.push(normalized.error);
      continue;
    }
    if (seen.has(normalized.server.name)) {
      errors.push(`MCP 服务器名重复：${normalized.server.name}`);
      continue;
    }
    seen.add(normalized.server.name);
    servers.push(normalized.server);
  }

  return { servers, errors };
}

/** 按 name 合并，override 覆盖 base */
export function mergeMcpServerConfigs(
  base: McpServerConfig[],
  override: McpServerConfig[],
): McpServerConfig[] {
  const merged = new Map<string, McpServerConfig>();
  for (const server of base) merged.set(server.name, server);
  for (const server of override) merged.set(server.name, server);
  return [...merged.values()];
}

export function matchMcpToolPattern(pattern: string, remoteToolName: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('*')) return remoteToolName.startsWith(pattern.slice(0, -1));
  return pattern === remoteToolName;
}

export function isMcpToolAllowed(server: McpServerConfig, remoteToolName: string): boolean {
  const allow = server.tools?.allow;
  const deny = server.tools?.deny;
  if (deny?.some(pattern => matchMcpToolPattern(pattern, remoteToolName))) return false;
  if (allow && allow.length > 0) {
    return allow.some(pattern => matchMcpToolPattern(pattern, remoteToolName));
  }
  return true;
}

function shortHash(input: string): string {
  let hash = 5381;
  for (const char of input) {
    hash = ((hash * 33) ^ (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0').slice(0, 6);
}

/**
 * 模型可见工具名：mcp__<server>__<tool>，只含 [A-Za-z0-9_-]，最长 64 位。
 * 超长时截断远端名并追加短哈希，保证同一服务器内不同工具不会撞名。
 */
export function buildMcpToolName(serverName: string, remoteToolName: string): string {
  const safeRemote = remoteToolName.replace(TOOL_NAME_UNSAFE_PATTERN, '_');
  const full = `${MCP_TOOL_NAME_PREFIX}${serverName}__${safeRemote}`;
  if (full.length <= MCP_MAX_TOOL_NAME_LENGTH && safeRemote === remoteToolName) return full;

  const hash = shortHash(remoteToolName);
  const head = `${MCP_TOOL_NAME_PREFIX}${serverName}__`;
  const budget = MCP_MAX_TOOL_NAME_LENGTH - head.length - hash.length - 1;
  return `${head}${safeRemote.slice(0, Math.max(budget, 1))}_${hash}`;
}

export function isMcpToolName(toolName: unknown): toolName is string {
  return typeof toolName === 'string' && toolName.startsWith(MCP_TOOL_NAME_PREFIX);
}

export function readMcpStdioPolicy(env: NodeJS.ProcessEnv = process.env): McpStdioPolicy {
  const enabled =
    String(env.MCP_STDIO_ENABLED || '')
      .trim()
      .toLowerCase() === 'true';
  const allowlist = String(env.MCP_STDIO_COMMAND_ALLOWLIST || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  return { enabled, allowlist };
}

/**
 * 命令必须与放行项精确相同，且放行项必须是绝对路径：
 * 只按文件名放行（如 `node`）会让 /tmp/x/node 之类任意路径的同名程序也被放行。
 */
export function isMcpStdioCommandAllowed(policy: McpStdioPolicy, command: string): boolean {
  if (!policy.enabled || policy.allowlist.length === 0) return false;
  const normalized = command.trim();
  if (!normalized || !isAbsolute(normalized)) return false;
  return policy.allowlist.some(allowed => isAbsolute(allowed) && allowed === normalized);
}

/** stdio 子进程环境：禁止经配置注入可劫持解释器 / 加载器的变量 */
const STDIO_ENV_BLOCKLIST =
  /^(NODE_OPTIONS|NODE_EXTRA_CA_CERTS|LD_[A-Z_]+|DYLD_[A-Z_]+|PATH|PYTHONPATH|PYTHONSTARTUP|PERL5OPT|PERL5LIB|RUBYOPT|BASH_ENV|ENV|PROMPT_COMMAND|IFS|SHELLOPTS)$/i;

export function sanitizeMcpStdioEnv(
  env: Record<string, string> | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env || {})) {
    if (STDIO_ENV_BLOCKLIST.test(key)) continue;
    result[key] = value;
  }
  return result;
}

/**
 * McpClientService — MCP 服务器连接池与调用封装
 *
 * - 配置来自 MCP_SERVERS_JSON 与全局配置 mcpServers（见 mcp-config.ts）
 * - 每个服务器懒连接、复用；配置变化或连接级错误后自动丢弃重连
 * - 工具列表按 toolsCacheTtlMs 缓存，避免每轮对话都向远端列举
 */

import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import {
  isMcpStdioCommandAllowed,
  isMcpToolAllowed,
  mergeMcpServerConfigs,
  parseMcpServersConfig,
  readMcpStdioPolicy,
  sanitizeMcpStdioEnv,
  type McpServerConfig,
  type McpServersParseResult,
} from './mcp-config';
import { MCP_CALLER_META_KEY, McpCallerIdentity, buildMcpCallerMeta } from './mcp-caller-identity';

const LOG_CONTEXT = 'McpClient';

export const MCP_CLIENT_FACTORY = 'MCP_CLIENT_FACTORY';
export const MCP_SERVERS_GLOBAL_CONFIG_KEY = 'mcpServers';

export interface McpRemoteTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpToolCallResult {
  /** 所有 text / 内嵌资源文本拼接结果 */
  text: string;
  /** 服务器返回的 structuredContent（若有） */
  structured?: unknown;
  /** 私有处理缓冲；Provider 必须先登记文件资产，不得把 data 直接放进结果。 */
  media: Array<{ type: string; mimeType?: string; bytes?: number; data?: string }>;
  resources: Array<{ uri: string; name?: string; mimeType?: string }>;
  isError: boolean;
}

export interface McpCallOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  /** 当前调用方身份；服务器 passIdentity 开启时写入 _meta */
  identity?: McpCallerIdentity;
  /** 仅宿主 Provider 使用；在真正调用远端 SDK 的同步边界触发。 */
  onDispatch?: () => void;
}

interface McpRequestOptions {
  timeout?: number;
  signal?: AbortSignal;
}

/** SDK Client 的结构化子集，便于测试替换 */
export interface McpConnectedClient {
  listTools(
    params?: undefined,
    options?: McpRequestOptions,
  ): Promise<{ tools: Array<{ name: string; description?: string; inputSchema?: unknown }> }>;
  callTool(
    params: { name: string; arguments?: Record<string, unknown>; _meta?: Record<string, unknown> },
    resultSchema?: undefined,
    options?: McpRequestOptions,
  ): Promise<unknown>;
  close(): Promise<void>;
}

export interface McpClientFactory {
  connect(server: McpServerConfig): Promise<McpConnectedClient>;
}

export class SdkMcpClientFactory implements McpClientFactory {
  async connect(server: McpServerConfig): Promise<McpConnectedClient> {
    const client = new Client({ name: '99agent', version: '0.1.0' });
    const transport =
      server.transport === 'http'
        ? new StreamableHTTPClientTransport(
            new URL(server.url || ''),
            server.headers ? { requestInit: { headers: server.headers } } : undefined,
          )
        : new StdioClientTransport({
            command: server.command || '',
            args: server.args || [],
            env: { ...getDefaultEnvironment(), ...sanitizeMcpStdioEnv(server.env) },
            cwd: server.cwd,
            stderr: 'ignore',
          });
    await client.connect(transport, { timeout: server.timeoutMs });
    return client;
  }
}

interface McpConnection {
  client: McpConnectedClient;
  signature: string;
  tools?: McpRemoteTool[];
  toolsFetchedAt: number;
  toolsPending?: Promise<McpRemoteTool[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function connectionSignature(server: McpServerConfig): string {
  return JSON.stringify({
    transport: server.transport,
    url: server.url,
    headers: server.headers,
    command: server.command,
    args: server.args,
    env: server.env,
    cwd: server.cwd,
  });
}

/** 协议层错误说明连接本身是通的，不必重连；其余（超时、断开、网络）都丢弃连接 */
function shouldKeepConnection(error: unknown): boolean {
  if (!(error instanceof McpError)) return false;
  return (
    error.code === ErrorCode.InvalidParams ||
    error.code === ErrorCode.MethodNotFound ||
    error.code === ErrorCode.InvalidRequest ||
    error.code === ErrorCode.InternalError
  );
}

export function normalizeMcpCallToolResult(raw: unknown): McpToolCallResult {
  const result = isRecord(raw) ? raw : {};
  const texts: string[] = [];
  const media: McpToolCallResult['media'] = [];
  const resources: McpToolCallResult['resources'] = [];
  const content = Array.isArray(result.content) ? result.content : [];

  for (const item of content) {
    if (!isRecord(item)) continue;
    switch (item.type) {
      case 'text':
        if (typeof item.text === 'string') texts.push(item.text);
        break;
      case 'image':
      case 'audio':
        media.push({
          type: item.type,
          ...(typeof item.mimeType === 'string' ? { mimeType: item.mimeType } : {}),
          ...(typeof item.data === 'string'
            ? { bytes: Math.floor((item.data.length * 3) / 4), data: item.data }
            : {}),
        });
        break;
      case 'resource': {
        const resource = isRecord(item.resource) ? item.resource : {};
        if (typeof resource.text === 'string') texts.push(resource.text);
        resources.push({
          uri: typeof resource.uri === 'string' ? resource.uri : '',
          ...(typeof resource.mimeType === 'string' ? { mimeType: resource.mimeType } : {}),
        });
        break;
      }
      case 'resource_link':
        resources.push({
          uri: typeof item.uri === 'string' ? item.uri : '',
          ...(typeof item.name === 'string' ? { name: item.name } : {}),
          ...(typeof item.mimeType === 'string' ? { mimeType: item.mimeType } : {}),
        });
        break;
      default:
        break;
    }
  }

  return {
    text: texts.join('\n'),
    ...(result.structuredContent !== undefined ? { structured: result.structuredContent } : {}),
    media,
    resources,
    isError: result.isError === true,
  };
}

@Injectable()
export class McpClientService implements OnModuleDestroy {
  private readonly connections = new Map<string, McpConnection>();
  private readonly pending = new Map<string, Promise<McpConnection>>();

  constructor(
    @Optional() private readonly globalConfigService?: GlobalConfigService,
    @Optional()
    @Inject(MCP_CLIENT_FACTORY)
    private readonly clientFactory: McpClientFactory = new SdkMcpClientFactory(),
  ) {}

  /** 合并环境变量与全局配置，过滤未放行的 stdio 服务器，并丢弃配置已变化的旧连接 */
  async resolveServers(): Promise<McpServersParseResult> {
    const fromEnv = parseMcpServersConfig(process.env.MCP_SERVERS_JSON);

    let dbRaw: unknown;
    try {
      dbRaw = await this.globalConfigService?.getConfigs([MCP_SERVERS_GLOBAL_CONFIG_KEY]);
    } catch {
      await this.dropStaleConnections([]);
      Logger.warn('MCP 配置读取失败，已拒绝执行', LOG_CONTEXT);
      throw new Error('MCP 配置暂不可用');
    }
    const fromDb = parseMcpServersConfig(dbRaw);
    if (fromEnv.errors.length || fromDb.errors.length) {
      await this.dropStaleConnections([]);
      throw new Error('MCP 配置无效');
    }

    const policy = readMcpStdioPolicy();
    const errors = [...fromEnv.errors, ...fromDb.errors];
    const servers = mergeMcpServerConfigs(fromEnv.servers, fromDb.servers).filter(server => {
      if (server.transport !== 'stdio') return true;
      if (isMcpStdioCommandAllowed(policy, server.command || '')) return true;
      errors.push(
        `MCP 服务器 ${server.name} 使用 stdio，但 MCP_STDIO_ENABLED / MCP_STDIO_COMMAND_ALLOWLIST 未放行命令 ${server.command}`,
      );
      return false;
    });

    await this.dropStaleConnections(servers);
    return { servers, errors };
  }

  async listTools(
    server: McpServerConfig,
    options: { refresh?: boolean } = {},
  ): Promise<McpRemoteTool[]> {
    const connection = await this.getConnection(server);
    if (
      !options.refresh &&
      connection.tools &&
      Date.now() - connection.toolsFetchedAt < server.toolsCacheTtlMs
    ) {
      return connection.tools;
    }
    // 同一服务器的并发列举只发一次请求
    if (connection.toolsPending) return connection.toolsPending;

    connection.toolsPending = (async () => {
      try {
        const result = await connection.client.listTools(undefined, { timeout: server.timeoutMs });
        connection.tools = result.tools.map(tool => ({
          name: tool.name,
          ...(tool.description ? { description: tool.description } : {}),
          ...(tool.inputSchema !== undefined ? { inputSchema: tool.inputSchema } : {}),
        }));
        connection.toolsFetchedAt = Date.now();
        return connection.tools;
      } catch (error) {
        await this.closeConnection(server.name);
        throw error;
      } finally {
        connection.toolsPending = undefined;
      }
    })();
    return connection.toolsPending;
  }

  async callTool(
    server: McpServerConfig,
    remoteToolName: string,
    args: Record<string, unknown>,
    options: McpCallOptions = {},
  ): Promise<McpToolCallResult> {
    server = await this.authorize(server.name, remoteToolName);
    const connection = await this.getConnection(server);
    try {
      // 连接和远端列举都可能等待；最后一次授权之后直接发送调用，禁止复用旧配置快照。
      const tools = await this.listTools(server, { refresh: true });
      if (!tools.some(tool => tool.name === remoteToolName)) throw new Error('MCP 工具已下线');
      server = await this.authorize(server.name, remoteToolName);
      if (connection.signature !== connectionSignature(server))
        throw new Error('MCP 配置已变更，请重试');
      const meta =
        options.identity && server.passIdentity !== false
          ? { [MCP_CALLER_META_KEY]: buildMcpCallerMeta(options.identity, server.identitySecret) }
          : undefined;
      options.onDispatch?.();
      const raw = await connection.client.callTool(
        { name: remoteToolName, arguments: args, ...(meta ? { _meta: meta } : {}) },
        undefined,
        {
          timeout: options.timeoutMs ?? server.timeoutMs,
          ...(options.signal ? { signal: options.signal } : {}),
        },
      );
      return normalizeMcpCallToolResult(raw);
    } catch (error) {
      if (!shouldKeepConnection(error)) await this.closeConnection(server.name);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.connections.keys()].map(name => this.closeConnection(name)));
  }

  private async authorize(name: string, tool: string): Promise<McpServerConfig> {
    const { servers } = await this.resolveServers();
    const server = servers.find(item => item.name === name);
    if (!server?.enabled || !isMcpToolAllowed(server, tool)) {
      throw new Error('当前配置不允许调用该 MCP 工具');
    }
    return server;
  }

  private async getConnection(server: McpServerConfig): Promise<McpConnection> {
    const signature = connectionSignature(server);
    const existing = this.connections.get(server.name);
    if (existing && existing.signature === signature) return existing;
    if (existing) await this.closeConnection(server.name);

    const pending = this.pending.get(server.name);
    if (pending) {
      const connection = await pending;
      if (connection.signature !== signature) throw new Error('MCP 配置已变更，请重试');
      return connection;
    }

    const task = (async () => {
      const client = await this.clientFactory.connect(server);
      try {
        const { servers } = await this.resolveServers();
        const current = servers.find(item => item.name === server.name);
        if (!current?.enabled || connectionSignature(current) !== signature) {
          throw new Error('MCP 配置已变更，请重试');
        }
      } catch (error) {
        await client.close().catch((): undefined => undefined);
        throw error;
      }
      const connection: McpConnection = { client, signature, toolsFetchedAt: 0 };
      this.connections.set(server.name, connection);
      Logger.log('已连接 MCP 服务器', LOG_CONTEXT);
      return connection;
    })().finally(() => {
      this.pending.delete(server.name);
    });
    this.pending.set(server.name, task);
    return task;
  }

  private async closeConnection(name: string): Promise<void> {
    const connection = this.connections.get(name);
    if (!connection) return;
    this.connections.delete(name);
    try {
      await connection.client.close();
    } catch (error) {
      Logger.debug('关闭 MCP 服务器连接失败', LOG_CONTEXT);
    }
  }

  private async dropStaleConnections(servers: McpServerConfig[]): Promise<void> {
    for (const [name, connection] of this.connections) {
      const next = servers.find(server => server.name === name);
      if (!next?.enabled || connectionSignature(next) !== connection.signature) {
        await this.closeConnection(name);
      }
    }
  }
}

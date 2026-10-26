/**
 * McpToolProvider — 把已配置的 MCP 服务器工具注册为 Agent 工具
 *
 * 与 PrimitiveToolProvider 并列注册到 ToolProviderRegistry，是第三方能力接入基座的唯一外接入口。
 * 工具名固定为 mcp__<server>__<tool>；定义与执行都按当前服务器开关和工具策略求交集。
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  ToolOutcomeUnknownError,
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolProvider,
  type ToolResult,
} from '../agent/tools/tool-provider.interface';
import { createLayeredToolResult } from '../chatLog/tool-result-payload';
import { FileAssetService } from '../fileAsset/fileAsset.service';
import {
  decodeToolMediaBase64,
  storeToolMedia,
  TOOL_MEDIA_MAX_COUNT,
  TOOL_MEDIA_TOTAL_BYTES,
} from '../agent/tools/tool-media';
import type { AgentToolAsset, AgentToolModelContent } from '../chatLog/agent-tool-result.types';
import {
  buildMcpToolName,
  isMcpToolAllowed,
  isMcpToolName,
  type McpServerConfig,
  type McpServersParseResult,
} from './mcp-config';
import { readMcpCallerIdentity } from './mcp-caller-identity';
import { McpClientService, type McpRemoteTool, type McpToolCallResult } from './mcp-client.service';

const LOG_CONTEXT = 'McpToolProvider';
const ERROR_LOG_THROTTLE_MS = 60_000;
const DEFAULT_RESULT_MAX_CHARS = 48_000;
const MAX_DESCRIPTION_CHARS = 2_000;

interface McpToolIndexEntry {
  serverName: string;
  remoteName: string;
  displayName: string;
}

function readResultMaxChars(): number {
  const parsed = Number(process.env.MCP_TOOL_RESULT_MAX_CHARS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_RESULT_MAX_CHARS;
}

function normalizeParameters(inputSchema: unknown): ToolDefinition['function']['parameters'] {
  const schema =
    typeof inputSchema === 'object' && inputSchema !== null && !Array.isArray(inputSchema)
      ? (inputSchema as Record<string, unknown>)
      : {};
  const properties =
    typeof schema.properties === 'object' && schema.properties !== null
      ? (schema.properties as Record<string, unknown>)
      : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === 'string')
    : undefined;
  const { type: _type, properties: _properties, required: _required, ...rest } = schema;
  return {
    ...rest,
    type: 'object',
    properties,
    ...(required && required.length > 0 ? { required } : {}),
  };
}

function buildDescription(server: McpServerConfig, tool: McpRemoteTool): string {
  const base = (tool.description || '').trim() || tool.name;
  const text = `[MCP · ${server.name}] ${base}`;
  return text.length > MAX_DESCRIPTION_CHARS
    ? `${text.slice(0, MAX_DESCRIPTION_CHARS - 1)}…`
    : text;
}

function parseArgs(args: unknown): Record<string, unknown> | null {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
  const prototype = Object.getPrototypeOf(args);
  return prototype === Object.prototype || prototype === null
    ? (args as Record<string, unknown>)
    : null;
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n…（MCP 工具输出已截断，原始长度 ${text.length} 字符）`;
}

function summarizeResult(result: McpToolCallResult, maxChars: number) {
  const text =
    result.text.trim() ||
    (result.structured !== undefined ? JSON.stringify(result.structured, null, 2) : '');
  const details: Record<string, unknown> = {};
  if (result.structured !== undefined) details.structured = result.structured;
  if (result.media.length > 0)
    details.media = result.media
      .slice(0, TOOL_MEDIA_MAX_COUNT)
      .map(({ type, mimeType, bytes }) => ({ type, mimeType, bytes }));
  if (result.resources.length > 0) details.resources = result.resources;
  return { content: truncateText(text, maxChars), details };
}

@Injectable()
export class McpToolProvider implements ToolProvider {
  private readonly toolIndex = new Map<string, McpToolIndexEntry>();
  private readonly lastErrorLogAt = new Map<string, number>();

  constructor(
    private readonly mcpClient: McpClientService,
    private readonly fileAssets: FileAssetService,
  ) {}

  async getToolDefinitions(context?: ToolExecutionContext): Promise<ToolDefinition[]> {
    this.toolIndex.clear();

    let resolved: McpServersParseResult;
    try {
      resolved = await this.mcpClient.resolveServers();
    } catch {
      this.logThrottled('config');
      return [];
    }
    const { servers, errors } = resolved;
    if (errors.length) this.logThrottled('config');

    const definitions: ToolDefinition[] = [];
    for (const server of servers) {
      if (!server.enabled) continue;

      let tools: McpRemoteTool[];
      try {
        tools = await this.mcpClient.listTools(server);
      } catch (error) {
        this.logThrottled(`server:${server.name}`);
        continue;
      }

      for (const tool of tools) {
        if (!isMcpToolAllowed(server, tool.name)) continue;
        const toolName = buildMcpToolName(server.name, tool.name);
        this.toolIndex.set(toolName, {
          serverName: server.name,
          remoteName: tool.name,
          displayName: `${server.name} · ${tool.name}`,
        });
        definitions.push({
          type: 'function',
          function: {
            name: toolName,
            description: buildDescription(server, tool),
            parameters: normalizeParameters(tool.inputSchema),
          },
        });
      }
    }

    return definitions;
  }

  canHandle(toolName: string): boolean {
    return isMcpToolName(toolName);
  }

  getRuntime(): string {
    return 'mcp';
  }

  getCategory(): string {
    return 'productivity';
  }

  getDisplayName(toolName: string): string | undefined {
    return this.toolIndex.get(toolName)?.displayName;
  }

  async execute(
    toolName: string,
    args: unknown,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const startedAt = Date.now();
    const toolId = context?.toolCallId || `mcp_${startedAt}`;
    const parsedArgs = parseArgs(args);
    if (!parsedArgs) {
      return this.errorResult(toolId, toolName, toolName, {}, startedAt, 'MCP 工具参数必须是对象');
    }

    let entry = this.toolIndex.get(toolName);
    let remoteCallDispatched = false;
    try {
      if (!entry) {
        await this.getToolDefinitions(context);
        entry = this.toolIndex.get(toolName);
      }
      if (!entry) {
        return this.errorResult(
          toolId,
          toolName,
          toolName,
          parsedArgs,
          startedAt,
          'MCP 工具未注册或已下线',
        );
      }
      // 闭包内 TS 不保留对 let 变量的收窄，用常量承接
      const toolEntry = entry;

      const { servers } = await this.mcpClient.resolveServers();
      const server = servers.find(item => item.name === toolEntry.serverName);
      if (!server || !server.enabled || !isMcpToolAllowed(server, entry.remoteName)) {
        return this.errorResult(
          toolId,
          toolName,
          entry.displayName,
          parsedArgs,
          startedAt,
          '当前配置不允许调用该 MCP 工具',
        );
      }

      const tools = await this.mcpClient.listTools(server, { refresh: true });
      if (!tools.some(tool => tool.name === toolEntry.remoteName)) {
        this.toolIndex.delete(toolName);
        return this.errorResult(
          toolId,
          toolName,
          entry.displayName,
          parsedArgs,
          startedAt,
          'MCP 工具未注册或已下线',
        );
      }
      const result = await this.mcpClient.callTool(server, entry.remoteName, parsedArgs, {
        signal: context?.signal,
        identity: readMcpCallerIdentity(context?.input?.context?.options),
        onDispatch: () => {
          remoteCallDispatched = true;
        },
      });
      const { content, details } = summarizeResult(result, readResultMaxChars());
      const fullDetails = { server: server.name, tool: entry.remoteName, ...details };

      if (result.isError) {
        return this.errorResult(
          toolId,
          toolName,
          entry.displayName,
          parsedArgs,
          startedAt,
          content || 'MCP 工具返回错误',
          fullDetails,
        );
      }

      const modelContent: Exclude<AgentToolModelContent, string> = [
        { type: 'text', text: content || 'MCP 工具已返回媒体' },
      ];
      const assets: AgentToolAsset[] = [];
      let totalBytes = 0;
      for (const [index, media] of result.media.entries()) {
        if (index >= TOOL_MEDIA_MAX_COUNT) {
          modelContent.push({ type: 'text', text: '其余工具媒体超过本次 8 个上限，未读取。' });
          break;
        }
        try {
          const buffer = decodeToolMediaBase64(media.data);
          totalBytes += buffer.length;
          if (totalBytes > TOOL_MEDIA_TOTAL_BYTES) throw new Error('工具媒体超限');
          const mime = media.mimeType || '';
          if (!mime.startsWith(`${media.type}/`)) throw new Error('工具媒体类型无效');
          const ext =
            {
              'image/png': 'png',
              'image/jpeg': 'jpg',
              'image/gif': 'gif',
              'image/webp': 'webp',
              'audio/wav': 'wav',
              'audio/mpeg': 'mp3',
            }[mime] || 'bin';
          const stored = await storeToolMedia(this.fileAssets, {
            buffer,
            mime,
            name: `mcp-${index + 1}.${ext}`,
            sourceKey: `mcp:${server.name}/${entry.remoteName}/${toolId}/${index}`,
            context,
          });
          modelContent.push(stored.part);
          assets.push(stored.asset);
        } catch {
          modelContent.push({
            type: 'text',
            text: `工具媒体 ${index + 1} 无法读取（格式、大小或文件存储不可用）。`,
          });
        }
      }
      const layered = createLayeredToolResult({
        id: toolId,
        type: 'tool',
        toolName,
        displayName: entry.displayName,
        name: entry.displayName,
        status: 'success',
        input: parsedArgs,
        fileRefMappingStore: context.fileRefMappingStore,
        rawOutput: {
          content: content || '（MCP 工具没有返回文本内容）',
          details: fullDetails,
        },
        time: Date.now(),
        duration: Date.now() - startedAt,
        ...(result.media.length ? { toolResult: { status: 'success', modelContent, assets } } : {}),
      });
      if (assets.length)
        layered.internal = {
          ...layered.internal,
          fileRefs: context.fileRefMappingStore!.snapshot(),
        };
      return layered;
    } catch {
      Logger.warn('MCP 工具调用失败', LOG_CONTEXT);
      if (remoteCallDispatched) throw new ToolOutcomeUnknownError();
      return this.errorResult(
        toolId,
        toolName,
        entry?.displayName || toolName,
        parsedArgs,
        startedAt,
        'MCP 工具调用失败，请检查当前配置或稍后重试',
      );
    }
  }

  private errorResult(
    toolId: string,
    toolName: string,
    displayName: string,
    input: Record<string, unknown>,
    startedAt: number,
    message: string,
    details?: Record<string, unknown>,
  ): ToolResult {
    return createLayeredToolResult({
      id: toolId,
      type: 'tool',
      toolName,
      displayName,
      name: displayName,
      status: 'error',
      input,
      rawOutput: { error: message, ...(details ? { details } : {}) },
      time: Date.now(),
      duration: Date.now() - startedAt,
    });
  }

  private logThrottled(key: string): void {
    const now = Date.now();
    const last = this.lastErrorLogAt.get(key) || 0;
    if (now - last < ERROR_LOG_THROTTLE_MS) return;
    this.lastErrorLogAt.set(key, now);
    Logger.warn('MCP 能力暂不可用，本轮跳过', LOG_CONTEXT);
  }
}

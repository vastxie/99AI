import { Injectable, OnModuleInit } from '@nestjs/common';
import { ToolProviderRegistry } from '../agent/tools/provider-registry/tool-provider.registry';
import { McpToolProvider } from './mcp-tool.provider';

/** MCP 模块初始化时把外接工具注册进 Agent 的工具注册表；依赖方向是 mcp → agent，agent 不感知 mcp */
@Injectable()
export class McpToolRegistration implements OnModuleInit {
  constructor(
    private readonly registry: ToolProviderRegistry,
    private readonly provider: McpToolProvider,
  ) {}

  onModuleInit(): void {
    // 工具名固定为 mcp__<server>__<tool>，与原语名不会冲突
    this.registry.register(this.provider, {
      category: 'productivity',
      displayName: 'MCP 外接工具',
      description: '通过 MCP 客户端接入的第三方工具，按服务器配置在 Chat / Work 模式暴露',
    });
  }
}

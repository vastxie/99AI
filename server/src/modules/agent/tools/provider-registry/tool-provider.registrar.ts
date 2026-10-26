/**
 * ToolProviderRegistrar — 在模块初始化时把内核工具注册到 ToolProviderRegistry
 *
 * 能力类 Provider 只有两个：PrimitiveToolProvider（沙箱原语 read / write / edit / bash / ls，这里注册）
 * 与 McpToolProvider（MCP 客户端接入的第三方工具，由 McpModule 自己注册）。
 * 另有会话控制工具 ConversationToolProvider（present_files / ask_user，这里注册）：只决定怎么呈现结果、
 * 何时向用户提问，不提供外部能力。注册顺序即工具列表与提示段顺序：原语、会话控制、MCP。
 */

import { Injectable, Logger, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import { ToolProviderRegistry } from './tool-provider.registry';
import { PrimitiveToolProvider } from '../../primitives/primitive-tool.provider';
import { ConversationToolProvider } from '../../conversation/conversation-tool.provider';

@Injectable()
export class ToolProviderRegistrar implements OnModuleInit, OnApplicationBootstrap {
  constructor(
    private readonly toolProviderRegistry: ToolProviderRegistry,
    private readonly primitiveToolProvider: PrimitiveToolProvider,
    private readonly conversationToolProvider: ConversationToolProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    this.toolProviderRegistry.register(this.primitiveToolProvider, {
      category: 'productivity',
      displayName: '沙箱原语',
      description: '在用户沙箱里读写文件与执行命令',
      runtime: 'sandbox',
    });
    this.toolProviderRegistry.register(this.conversationToolProvider, {
      category: 'productivity',
      displayName: '会话控制',
      description: '选择展示给用户的成果文件、向用户提问',
      runtime: 'conversation',
    });
  }

  /** 各模块都初始化完（MCP 等在自己的模块里注册）之后再统计 */
  onApplicationBootstrap(): void {
    Logger.log(
      `[ToolProviderRegistrar] 已注册 ${this.toolProviderRegistry.listToolProviders().length} 个工具 Provider`,
      'ToolProviderRegistrar',
    );
  }
}

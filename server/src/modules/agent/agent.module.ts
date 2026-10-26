/**
 * AgentModule — Agent 循环内核的 Nest 装配
 *
 * 内核只认两类能力工具 Provider：沙箱原语（PrimitiveToolProvider，本模块注册）与 MCP
 * （McpToolProvider，由 McpModule 初始化时注册进这里导出的 ToolProviderRegistry，agent 不依赖 mcp）。
 * 业务能力不在这里注册，而是放进用户沙箱（技能 / CLI / MCP 服务器）。
 * 会话控制工具（ConversationToolProvider：present_files / ask_user）也在本模块注册，它们只决定
 * 怎么呈现结果、何时向用户提问，不提供外部能力。
 */

import { Module } from '@nestjs/common';
import { ChatLogModule } from '../chatLog/chatLog.module';
import { FileAssetModule } from '../fileAsset/fileAsset.module';
import { GlobalConfigModule } from '../globalConfig/globalConfig.module';
import { ModelGatewayModule } from '../modelGateway/model-gateway.module';
import { ModelsModule } from '../models/models.module';
import { RedisCacheModule } from '../redisCache/redisCache.module';
import { SandboxModule } from '../sandbox/sandbox.module';
import { AgentLoopService } from './core/agent-loop.service';
import { ToolProviderRegistry } from './tools/provider-registry/tool-provider.registry';
import { ToolProviderRegistrar } from './tools/provider-registry/tool-provider.registrar';
import { PrimitiveToolProvider } from './primitives/primitive-tool.provider';
import { ConversationToolProvider } from './conversation/conversation-tool.provider';
import { AgentRuntimeStateModule } from './runtime-state/agent-runtime-state.module';
import { ContextCheckpointModule } from '../contextCheckpoint/context-checkpoint.module';
import { ContextCheckpointCoordinator } from './context/context-checkpoint-coordinator';

@Module({
  imports: [
    GlobalConfigModule,
    ModelGatewayModule,
    ModelsModule,
    ChatLogModule,
    RedisCacheModule,
    FileAssetModule,
    SandboxModule,
    AgentRuntimeStateModule,
    ContextCheckpointModule,
  ],
  providers: [
    AgentLoopService,
    ToolProviderRegistry,
    ToolProviderRegistrar,
    PrimitiveToolProvider,
    ConversationToolProvider,
    ContextCheckpointCoordinator,
  ],
  exports: [AgentLoopService, ToolProviderRegistry, AgentRuntimeStateModule],
})
export class AgentModule {}

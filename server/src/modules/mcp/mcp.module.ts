/**
 * McpModule — MCP 客户端：第三方能力接入基座的唯一外接入口
 *
 * 配置方式见 mcp-config.ts 与文档站「外部接入」（site/deployment/integrations.md）。
 */

import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { FileAssetModule } from '../fileAsset/fileAsset.module';
import { GlobalConfigModule } from '../globalConfig/globalConfig.module';
import { McpAdminController } from './mcp-admin.controller';
import { McpAdminService } from './mcp-admin.service';
import { McpToolProvider } from './mcp-tool.provider';
import { McpToolRegistration } from './mcp-tool.registration';
import { MCP_CLIENT_FACTORY, McpClientService, SdkMcpClientFactory } from './mcp-client.service';

@Module({
  imports: [GlobalConfigModule, FileAssetModule, AgentModule],
  controllers: [McpAdminController],
  providers: [
    { provide: MCP_CLIENT_FACTORY, useClass: SdkMcpClientFactory },
    McpClientService,
    McpAdminService,
    McpToolProvider,
    McpToolRegistration,
  ],
  exports: [McpClientService, McpToolProvider],
})
export class McpModule {}

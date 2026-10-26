import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SaveMcpServersDto } from './dto/mcp-admin.dto';
import { McpAdminService } from './mcp-admin.service';

@ApiTags('mcp')
@Controller('mcp')
@UseGuards(SuperAuthGuard)
@ApiBearerAuth()
export class McpAdminController {
  constructor(private readonly mcpAdminService: McpAdminService) {}

  @Get('servers')
  @ApiOperation({ summary: '查看 MCP 服务器（密钥脱敏）' })
  listServers() {
    return this.mcpAdminService.listServers();
  }

  @Put('servers')
  @ApiOperation({ summary: '保存后台配置的 MCP 服务器' })
  saveServers(@Body() body: SaveMcpServersDto) {
    return this.mcpAdminService.saveServers(body.servers, {
      revision: body.revision,
      discardInvalid: body.discardInvalid,
    });
  }

  @Post('servers/:name/test')
  @ApiOperation({ summary: '测试连接并列出工具' })
  testServer(@Param('name') name: string) {
    return this.mcpAdminService.testServer(name);
  }
}

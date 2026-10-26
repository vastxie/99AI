import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/auth/public.decorator';
import { ChannelGatewayService, ChannelInboundInput } from './channel-gateway.service';
import { ChannelServiceGuard } from './channel-service.guard';

/** 进程外渠道服务的 server-to-server 接口；用 x-channel-service-token 鉴权，不走用户 JWT */
@ApiTags('channel-gateway')
@Controller('channel-gateway')
@UseGuards(ChannelServiceGuard)
export class ChannelGatewayController {
  constructor(private readonly gateway: ChannelGatewayService) {}

  @Post('inbound')
  @Public()
  @ApiOperation({ summary: '以绑定用户身份写入一条外部消息并同步取回回复' })
  inbound(@Body() body: ChannelInboundInput) {
    return this.gateway.inbound(body || ({} as ChannelInboundInput));
  }

  @Post('bindings/resolve')
  @Public()
  @ApiOperation({ summary: '把渠道侧用户 id 解析为站点用户' })
  resolve(@Body() body: { channel: string; channelUserId: string }) {
    return this.gateway.resolveBinding(body?.channel, body?.channelUserId);
  }
}

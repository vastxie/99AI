import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { ChannelGatewayController } from './channel-gateway.controller';
import { ChannelGatewayService } from './channel-gateway.service';

/**
 * 渠道网关（内核）：给进程外渠道服务的入站消息与绑定解析接口。
 * 渠道包迁出仓库后只依赖这里的两个接口 + CHANNEL_SERVICE_TOKEN。
 */
@Module({
  imports: [ChatModule],
  controllers: [ChannelGatewayController],
  providers: [ChannelGatewayService],
  exports: [ChannelGatewayService],
})
export class ChannelGatewayModule {}

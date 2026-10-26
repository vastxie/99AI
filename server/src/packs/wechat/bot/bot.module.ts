import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CHANNEL_BINDING_IMPLEMENTATION } from '@/modules/channelBinding/channel-binding.port';
import { UserEntity } from '@/modules/user/user.entity';
import { BotAdminController } from './bot.controller';
import { ChannelManagerService } from './channel-manager.service';
import { ChannelRegistry } from './channel-registry';
import { UserBotChannelEntity } from './user-bot-channel.entity';

/**
 * 渠道包的通道管理模块：渠道注册表、用户渠道绑定。
 * 以 CHANNEL_BINDING_IMPLEMENTATION 令牌向内核的 ChannelBindingModule 注册绑定查询实现。
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, UserBotChannelEntity])],
  controllers: [BotAdminController],
  providers: [
    ChannelRegistry,
    ChannelManagerService,
    { provide: CHANNEL_BINDING_IMPLEMENTATION, useExisting: ChannelManagerService },
  ],
  exports: [ChannelRegistry, ChannelManagerService, CHANNEL_BINDING_IMPLEMENTATION],
})
export class BotModule {}

import { Injectable, Logger } from '@nestjs/common';
import { BaseBotService } from './base-bot.service';
import { BotChannel } from './bot-channel.config';

@Injectable()
export class ChannelRegistry {
  private services = new Map<BotChannel, BaseBotService>();

  register(channel: BotChannel, service: BaseBotService): void {
    this.services.set(channel, service);
    Logger.log(`通道 ${channel} 已注册`, 'ChannelRegistry');
  }

  get(channel: BotChannel): BaseBotService | undefined {
    return this.services.get(channel);
  }
}

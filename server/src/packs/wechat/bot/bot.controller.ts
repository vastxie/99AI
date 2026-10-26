import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { ChannelManagerService } from './channel-manager.service';
import { ChannelRegistry } from './channel-registry';
import { BotChannel } from './bot-channel.config';

@Controller('bot/admin')
@UseGuards(SuperAuthGuard)
export class BotAdminController {
  constructor(
    private readonly channelManager: ChannelManagerService,
    private readonly channelRegistry: ChannelRegistry,
  ) {}

  @Get('stats')
  async getStats() {
    return this.channelManager.getChannelStats();
  }

  @Get('channels/:channel/users')
  async getUsers(
    @Param('channel') channel: string,
    @Query('page') page = '1',
    @Query('size') size = '20',
  ) {
    const validatedChannel = this.validateChannel(channel);
    const [users, total] = await this.channelManager.findChannelUsers(
      validatedChannel,
      parseInt(page),
      parseInt(size),
    );
    return { rows: users, count: total };
  }

  @Post('channels/:channel/users/:id/disable')
  async disableUser(@Param('channel') channel: string, @Param('id', ParseIntPipe) id: number) {
    const validatedChannel = this.validateChannel(channel);
    await this.channelManager.disableUser(id, validatedChannel);
    const service = this.channelRegistry.get(validatedChannel);
    if (service) {
      await service.stopUser(id);
    }
    return true;
  }

  @Post('channels/:channel/users/:id/enable')
  async enableUser(@Param('channel') channel: string, @Param('id', ParseIntPipe) id: number) {
    const validatedChannel = this.validateChannel(channel);
    await this.channelManager.enableUser(id, validatedChannel);
    const service = this.channelRegistry.get(validatedChannel);
    if (service) {
      await service.startUser(id);
    }
    return true;
  }

  private validateChannel(channel: string): BotChannel {
    const validChannels = Object.values(BotChannel) as string[];
    if (!validChannels.includes(channel)) {
      throw new HttpException(
        `无效的通道类型: ${channel}, 有效值: ${validChannels.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return channel as BotChannel;
  }
}

import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RedisClientType } from 'redis';
import { Repository } from 'typeorm';
import {
  ChannelBindingPort,
  ChannelBindingRecord,
} from '@/modules/channelBinding/channel-binding.port';
import { UserBotChannelEntity } from './user-bot-channel.entity';
import { BotChannel, BOT_CHANNEL_CAPABILITIES } from './bot-channel.config';

export interface BotChannelUserListItem {
  id: number;
  userId: number;
  channel: string;
  status: number;
  channelUserId: string | null;
  boundAt: Date | null;
}

function toBotChannelUserListItem(entity: UserBotChannelEntity): BotChannelUserListItem {
  return {
    id: entity.id,
    userId: entity.userId,
    channel: entity.channel,
    status: entity.status,
    channelUserId: entity.channelUserId || null,
    boundAt: entity.boundAt || null,
  };
}

@Injectable()
export class ChannelManagerService implements ChannelBindingPort {
  constructor(
    @InjectRepository(UserBotChannelEntity)
    private readonly userBotChannelEntity: Repository<UserBotChannelEntity>,
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
  ) {}

  /** ChannelBindingPort：用户画像只读取脱敏所需的字段 */
  async listUserBindings(userId: number): Promise<ChannelBindingRecord[]> {
    return this.userBotChannelEntity.find({
      where: { userId },
      select: {
        id: true,
        channel: true,
        status: true,
        channelUserId: true,
        boundAt: true,
        updatedAt: true,
      },
      order: { id: 'ASC' },
    });
  }

  /** ChannelBindingPort：渠道侧用户 id → 站点用户（只认已生效的绑定） */
  async findUserByChannelUser(
    channel: string,
    channelUserId: string,
  ): Promise<{ userId: number; status: number } | null> {
    const binding = await this.userBotChannelEntity.findOne({
      where: { channel, channelUserId, status: 1 },
      select: { userId: true, status: true },
    });
    return binding ? { userId: binding.userId, status: binding.status } : null;
  }

  async bindChannel(
    userId: number,
    channel: BotChannel,
    config: {
      accessToken?: string;
      baseUrl?: string;
      channelUserId?: string;
      extraConfig?: Record<string, any>;
    },
  ): Promise<UserBotChannelEntity> {
    let entity = await this.userBotChannelEntity.findOne({
      where: { userId, channel },
    });

    if (entity) {
      Object.assign(entity, {
        ...config,
        status: 1,
        boundAt: new Date(),
      });
    } else {
      entity = this.userBotChannelEntity.create({
        userId,
        channel,
        ...config,
        status: 1,
        boundAt: new Date(),
      });
    }

    try {
      return await this.userBotChannelEntity.save(entity);
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY') {
        const existing = await this.userBotChannelEntity.findOne({ where: { userId, channel } });
        if (!existing) {
          // 唯一键冲突后又被并发解绑：不再对 null 做 Object.assign，让调用方拿到明确的冲突错误后重试
          Logger.warn(
            `用户 ${userId} 的 ${channel} 渠道绑定在唯一键冲突后被并发删除`,
            'ChannelManagerService',
          );
          throw new HttpException('渠道绑定状态已变化，请重试', HttpStatus.CONFLICT);
        }
        Object.assign(existing, { ...config, status: 1, boundAt: new Date() });
        return this.userBotChannelEntity.save(existing);
      }
      throw error;
    }
  }

  async unbindChannel(userId: number, channel: BotChannel): Promise<void> {
    await this.userBotChannelEntity.delete({ userId, channel });
    await this.deleteSyncState(channel, userId);
  }

  getChannelStatus(userId: number, channel: BotChannel): Promise<UserBotChannelEntity | null> {
    return this.userBotChannelEntity.findOne({
      where: { userId, channel },
      select: {
        id: true,
        userId: true,
        channel: true,
        status: true,
        accessToken: true,
        baseUrl: true,
        channelUserId: true,
        boundAt: true,
        contextToken: true,
        syncState: true,
        extraConfig: true,
      },
    });
  }

  findBoundChannels(channel: BotChannel): Promise<UserBotChannelEntity[]> {
    return this.userBotChannelEntity.find({
      where: { channel, status: 1 },
      select: {
        id: true,
        userId: true,
        channel: true,
        status: true,
        accessToken: true,
        baseUrl: true,
        channelUserId: true,
        boundAt: true,
        contextToken: true,
        syncState: true,
        extraConfig: true,
      },
    });
  }

  async updateContextToken(userId: number, channel: BotChannel, token: string): Promise<void> {
    await this.userBotChannelEntity.update({ userId, channel }, { contextToken: token });
  }

  async updateStatus(userId: number, channel: BotChannel, status: number): Promise<void> {
    await this.userBotChannelEntity.update({ userId, channel }, { status });
  }

  async updateSyncState(userId: number, channel: BotChannel, state: string): Promise<void> {
    const key = `channel:syncstate:${channel}:${userId}`;
    await this.redisClient.setEx(key, 7 * 24 * 3600, state);
    await this.userBotChannelEntity.update({ userId, channel }, { syncState: state });
  }

  async getSyncState(userId: number, channel: BotChannel): Promise<string | undefined> {
    const key = `channel:syncstate:${channel}:${userId}`;
    const cached = await this.redisClient.get(key);
    if (cached) return cached;

    const entity = await this.userBotChannelEntity.findOne({
      where: { userId, channel },
      select: { syncState: true },
    });
    return entity?.syncState || undefined;
  }

  private async deleteSyncState(channel: BotChannel, userId: number): Promise<void> {
    const key = `channel:syncstate:${channel}:${userId}`;
    await this.redisClient.del(key);
  }

  async getChannelStats(): Promise<
    Record<string, { bound: number; active: number; expired: number; error: number }>
  > {
    const channels = Object.keys(BOT_CHANNEL_CAPABILITIES) as BotChannel[];
    const stats: Record<string, { bound: number; active: number; expired: number; error: number }> =
      {};

    for (const channel of channels) {
      const [active, expired, error] = await Promise.all([
        this.userBotChannelEntity.count({ where: { channel, status: 1 } }),
        this.userBotChannelEntity.count({ where: { channel, status: 2 } }),
        this.userBotChannelEntity.count({ where: { channel, status: 3 } }),
      ]);
      stats[channel] = {
        bound: active + expired + error,
        active,
        expired,
        error,
      };
    }

    return stats;
  }

  findChannelUsers(
    channel: BotChannel,
    page: number,
    size: number,
  ): Promise<[BotChannelUserListItem[], number]> {
    return this.userBotChannelEntity
      .findAndCount({
        select: {
          id: true,
          userId: true,
          channel: true,
          status: true,
          channelUserId: true,
          boundAt: true,
        },
        where: { channel },
        order: { boundAt: 'DESC' },
        skip: (page - 1) * size,
        take: size,
      })
      .then(([rows, count]) => [rows.map(toBotChannelUserListItem), count]);
  }

  async disableUser(userId: number, channel: BotChannel): Promise<void> {
    await this.userBotChannelEntity.update({ userId, channel }, { status: 0 });
  }

  async enableUser(userId: number, channel: BotChannel): Promise<void> {
    await this.userBotChannelEntity.update({ userId, channel }, { status: 1 });
  }

  async checkMessageDup(channel: BotChannel, channelMessageId: string): Promise<boolean> {
    const key = `channel:dedup:${channel}:${channelMessageId}`;
    const result = await this.redisClient.set(key, '1', { NX: true, EX: 300 });
    return result === null;
  }
}

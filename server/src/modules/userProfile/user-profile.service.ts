import { UserStatusEnum } from '@/common/constants/user.constant';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAuthIdentityEntity } from '../auth/identity/user-auth-identity.entity';
import { CHANNEL_BINDING_PORT, ChannelBindingPort } from '../channelBinding/channel-binding.port';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { FileAssetEntity } from '../fileAsset/fileAsset.entity';
import { UserProfileQueryDto, UserProfileRange } from './dto/userProfileQuery.dto';
import {
  UserProfileEvent,
  UserProfileSectionRegistry,
} from '../user/user-profile-section.registry';
import { UserEntity } from '../user/user.entity';

const RANGE_DAYS: Record<Exclude<UserProfileRange, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const USER_STATUS_TEXT: Record<number, string> = {
  [UserStatusEnum.PENDING]: '待激活',
  [UserStatusEnum.ACTIVE]: '正常',
  [UserStatusEnum.LOCKED]: '已封禁',
  [UserStatusEnum.BLACKLISTED]: '黑名单',
  4: '游客',
};

const BOT_CHANNEL_STATUS_TEXT: Record<number, string> = {
  0: '未绑定',
  1: '正常',
  2: '已过期',
  3: '异常',
};

@Injectable()
export class UserProfileService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(ChatLogEntity)
    private readonly chatLogRepository: Repository<ChatLogEntity>,
    @InjectRepository(UserAuthIdentityEntity)
    private readonly userAuthIdentityRepository: Repository<UserAuthIdentityEntity>,
    @Inject(CHANNEL_BINDING_PORT) private readonly channelBinding: ChannelBindingPort,
    @InjectRepository(FileAssetEntity)
    private readonly fileAssetRepository: Repository<FileAssetEntity>,
    private readonly sectionRegistry: UserProfileSectionRegistry,
  ) {}

  async getProfile(userId: number, query: UserProfileQueryDto = {}) {
    const range = query.range || '30d';
    const recentLimit = this.normalizeRecentLimit(query.recentLimit);
    const rangeStart = this.getRangeStart(range);

    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: {
        id: true,
        uid: true,
        username: true,
        nickname: true,
        avatar: true,
        role: true,
        status: true,
        email: true,
        phone: true,
        lastLoginIp: true,
        violationCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) {
      throw new HttpException('用户不存在！', HttpStatus.BAD_REQUEST);
    }

    // 扩展包贡献的画像片段（计费、内容安全等），包未装载时没有对应键
    const contributed = await this.sectionRegistry.buildAll({ userId, rangeStart, recentLimit });
    const [
      usage,
      recentChats,
      identities,
      botChannels,
      conversationSummary,
      artifactSummary,
      recentArtifacts,
    ] = await Promise.all([
      this.buildUsage(userId, range, rangeStart),
      this.getRecentChats(userId, recentLimit),
      this.buildIdentities(userId),
      this.buildBotChannels(userId),
      this.buildConversationSummary(userId, rangeStart, recentLimit),
      this.buildArtifactSummary(userId, rangeStart),
      this.getRecentArtifacts(userId, recentLimit),
    ]);
    const security = this.buildSecurity(user);

    const usageSummary = {
      ...usage.summary,
      conversationCount: conversationSummary.totalCount,
      activeConversationCount: conversationSummary.activeCount,
      requestCount: usage.summary.chatCount,
    };

    return {
      basic: this.buildBasic(user),
      usageSummary,
      usageChart: usage.chart,
      recentEvents: this.buildRecentEvents(
        userId,
        contributed.events,
        recentChats,
        recentArtifacts,
        recentLimit,
      ),
      links: this.buildLinks(userId),
      identities,
      botChannels,
      chatSummary: {
        ...usage.chatSummary,
        conversationCount: conversationSummary.totalCount,
        activeConversationCount: conversationSummary.activeCount,
        recentConversations: conversationSummary.recent,
      },
      conversationSummary,
      artifactSummary: {
        ...artifactSummary,
        reason: '展示当前用户文件的数量与大小。',
      },
      security,
      /** 扩展包贡献的片段，按片段 id 归组；包未装载时没有该键 */
      sections: contributed.sections,
    };
  }

  private buildBasic(user: UserEntity) {
    return {
      id: user.id,
      uid: user.uid || '',
      username: user.username,
      nickname: user.nickname || '',
      avatar: user.avatar || '',
      role: user.role,
      status: user.status,
      statusText: USER_STATUS_TEXT[user.status] || '未知',
      emailMasked: this.maskEmail(user.email),
      phoneMasked: this.maskPhone(user.phone),
      lastLoginIpMasked: this.maskIp(user.lastLoginIp),
      violationCount: Number(user.violationCount || 0),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async buildIdentities(userId: number) {
    const identities = await this.userAuthIdentityRepository.find({
      where: { userId },
      select: {
        id: true,
        provider: true,
        providerUserId: true,
        scene: true,
        linkKey: true,
        email: true,
        emailVerified: true,
        phone: true,
        nickname: true,
        avatar: true,
        status: true,
        boundAt: true,
        lastLoginAt: true,
      },
      order: { id: 'ASC' },
    });

    return identities.map(identity => ({
      id: identity.id,
      provider: identity.provider,
      providerLabel: identity.provider,
      scene: identity.scene || '',
      providerUserIdMasked: this.maskIdentifier(identity.providerUserId),
      linkKeyMasked: this.maskIdentifier(identity.linkKey),
      emailMasked: this.maskEmail(identity.email),
      emailVerified: Boolean(identity.emailVerified),
      phoneMasked: this.maskPhone(identity.phone),
      nickname: identity.nickname || '',
      avatar: identity.avatar || '',
      status: identity.status,
      boundAt: identity.boundAt || null,
      lastLoginAt: identity.lastLoginAt || null,
    }));
  }

  private async buildBotChannels(userId: number) {
    const channels = await this.channelBinding.listUserBindings(userId);

    return channels.map(channel => ({
      id: channel.id,
      channel: channel.channel,
      channelLabel: channel.channel,
      status: channel.status,
      statusText: BOT_CHANNEL_STATUS_TEXT[channel.status] || '未知',
      channelUserIdMasked: this.maskIdentifier(channel.channelUserId),
      boundAt: channel.boundAt || null,
      updatedAt: channel.updatedAt || null,
    }));
  }

  private async buildUsage(userId: number, range: UserProfileRange, rangeStart: Date | null) {
    const chatBase = this.chatLogRepository
      .createQueryBuilder('chat')
      .where('chat.userId = :userId', { userId });
    if (rangeStart) {
      chatBase.andWhere('chat.createdAt >= :rangeStart', { rangeStart });
    }

    const [summaryRaw, modelTop, channelTop, tokenRows] = await Promise.all([
      chatBase
        .clone()
        .select('COUNT(chat.id)', 'chatCount')
        .addSelect('COUNT(DISTINCT DATE_FORMAT(chat.createdAt, "%Y-%m-%d"))', 'activeDays')
        .addSelect('SUM(COALESCE(chat.totalTokens, 0))', 'totalTokens')
        .addSelect('MAX(chat.createdAt)', 'lastChatAt')
        .getRawOne(),
      chatBase
        .clone()
        .select('COALESCE(chat.model, "unknown")', 'model')
        .addSelect('COUNT(chat.id)', 'count')
        .addSelect('SUM(COALESCE(chat.totalTokens, 0))', 'tokens')
        .groupBy('COALESCE(chat.model, "unknown")')
        .orderBy('count', 'DESC')
        .limit(8)
        .getRawMany(),
      chatBase
        .clone()
        .select('COALESCE(chat.channel, "web")', 'channel')
        .addSelect('COUNT(chat.id)', 'count')
        .groupBy('COALESCE(chat.channel, "web")')
        .orderBy('count', 'DESC')
        .limit(8)
        .getRawMany(),
      chatBase
        .clone()
        .select('DATE_FORMAT(chat.createdAt, "%Y-%m-%d")', 'time')
        .addSelect('COALESCE(chat.model, "unknown")', 'model')
        .addSelect('COUNT(chat.id)', 'requests')
        .addSelect('SUM(COALESCE(chat.totalTokens, 0))', 'tokens')
        .groupBy('DATE_FORMAT(chat.createdAt, "%Y-%m-%d")')
        .addGroupBy('COALESCE(chat.model, "unknown")')
        .orderBy('time', 'ASC')
        .getRawMany(),
    ]);

    const summary = {
      range,
      chatCount: this.toNumber(summaryRaw?.chatCount),
      messageCount: this.toNumber(summaryRaw?.chatCount),
      activeDays: this.toNumber(summaryRaw?.activeDays),
      totalTokens: this.toNumber(summaryRaw?.totalTokens),
      modelTop: modelTop.map(item => ({
        model: item.model || 'unknown',
        count: this.toNumber(item.count),
        tokens: this.toNumber(item.tokens),
      })),
      channelTop: channelTop.map(item => ({
        channel: item.channel || 'web',
        count: this.toNumber(item.count),
      })),
      lastChatAt: summaryRaw?.lastChatAt || null,
    };

    return {
      summary,
      chart: this.buildUsageChart(range, tokenRows),
      chatSummary: {
        totalCount: summary.chatCount,
        requestCount: summary.chatCount,
        messageCount: summary.messageCount,
        lastChatAt: summary.lastChatAt,
        modelTop: summary.modelTop,
        channelTop: summary.channelTop,
        link: this.buildLinks(userId).chats,
      },
    };
  }

  private async buildConversationSummary(
    userId: number,
    rangeStart: Date | null,
    recentLimit: number,
  ) {
    const activeTasksQuery = this.chatLogRepository
      .createQueryBuilder('chat')
      .select('COUNT(chat.id)', 'count')
      .where('chat.userId = :userId', { userId })
      .andWhere('chat.isDelete = false')
      .andWhere("chat.direction = 'in'");

    const recentQuery = this.chatLogRepository
      .createQueryBuilder('chat')
      .select('chat.id', 'id')
      .addSelect('chat.cid', 'cid')
      .addSelect('chat.totalTokens', 'totalTokens')
      .addSelect('chat.createdAt', 'lastChatAt')
      .where('chat.userId = :userId', { userId })
      .andWhere('chat.isDelete = false')
      .andWhere("chat.direction = 'in'");

    if (rangeStart) {
      activeTasksQuery.andWhere('chat.createdAt >= :rangeStart', { rangeStart });
      recentQuery.andWhere('chat.createdAt >= :rangeStart', { rangeStart });
    }

    const [totalCount, activeRaw, recentRows] = await Promise.all([
      this.chatLogRepository.count({ where: { userId, isDelete: false, direction: 'in' } }),
      activeTasksQuery.getRawOne(),
      recentQuery.orderBy('chat.createdAt', 'DESC').limit(recentLimit).getRawMany(),
    ]);

    return {
      totalCount,
      activeCount: this.toNumber(activeRaw?.count),
      recent: recentRows.map(item => ({
        cid: item.cid || '',
        requestCount: 1,
        messageCount: 1,
        totalTokens: this.toNumber(item.totalTokens),
        lastChatAt: item.lastChatAt || null,
        link: this.buildLinks(userId).chats,
      })),
      link: this.buildLinks(userId).chats,
    };
  }

  private async buildArtifactSummary(userId: number, rangeStart: Date | null) {
    const baseQuery = this.fileAssetRepository
      .createQueryBuilder('file')
      .where('file.userId = :userId', { userId });

    const rangeQuery = baseQuery.clone();
    if (rangeStart) {
      rangeQuery.andWhere('file.createdAt >= :rangeStart', { rangeStart });
    }

    const [totalRaw, rangeRaw, statusRows, visibilityRows, categoryRows] = await Promise.all([
      baseQuery
        .clone()
        .select('COUNT(file.id)', 'count')
        .addSelect('COALESCE(SUM(file.size), 0)', 'size')
        .getRawOne(),
      rangeQuery
        .select('COUNT(file.id)', 'count')
        .addSelect('COALESCE(SUM(file.size), 0)', 'size')
        .getRawOne(),
      baseQuery
        .clone()
        .select('file.status', 'status')
        .addSelect('COUNT(file.id)', 'count')
        .addSelect('COALESCE(SUM(file.size), 0)', 'size')
        .groupBy('file.status')
        .getRawMany(),
      baseQuery
        .clone()
        .select('file.visibility', 'visibility')
        .addSelect('COUNT(file.id)', 'count')
        .addSelect('COALESCE(SUM(file.size), 0)', 'size')
        .groupBy('file.visibility')
        .getRawMany(),
      baseQuery
        .clone()
        .select('file.category', 'category')
        .addSelect('COUNT(file.id)', 'count')
        .addSelect('COALESCE(SUM(file.size), 0)', 'size')
        .groupBy('file.category')
        .orderBy('count', 'DESC')
        .limit(8)
        .getRawMany(),
    ]);

    return {
      available: true,
      totalCount: this.toNumber(totalRaw?.count),
      totalSize: this.toNumber(totalRaw?.size),
      rangeCount: this.toNumber(rangeRaw?.count),
      rangeSize: this.toNumber(rangeRaw?.size),
      byStatus: statusRows.map(item => ({
        status: item.status || 'unknown',
        count: this.toNumber(item.count),
        size: this.toNumber(item.size),
      })),
      byVisibility: visibilityRows.map(item => ({
        visibility: item.visibility || 'unknown',
        count: this.toNumber(item.count),
        size: this.toNumber(item.size),
      })),
      byCategory: categoryRows.map(item => ({
        category: item.category || 'unknown',
        count: this.toNumber(item.count),
        size: this.toNumber(item.size),
      })),
      recent: [] as unknown[],
      link: this.buildLinks(userId).artifacts,
    };
  }

  private buildSecurity(user: UserEntity) {
    const statusText = USER_STATUS_TEXT[user.status] || '未知';
    const violationCount = Number(user.violationCount || 0);
    return {
      available: true,
      userStatus: user.status,
      statusText,
      violationCount,
      signals: this.buildSecuritySignals(user.status, statusText, violationCount),
    };
  }

  private buildSecuritySignals(userStatus: number, statusText: string, violationCount: number) {
    const signals = [];
    if (userStatus !== UserStatusEnum.ACTIVE) {
      signals.push({ level: 'warning', title: '用户状态异常', summary: `当前状态：${statusText}` });
    }
    if (violationCount > 0) {
      signals.push({
        level: violationCount >= 3 ? 'danger' : 'warning',
        title: '内容过滤命中',
        summary: `累计命中 ${violationCount} 次`,
      });
    }
    return signals;
  }

  private buildUsageChart(range: UserProfileRange, tokenRows: any[]) {
    const bucketMap = new Map<string, Map<string, { tokens: number; requests: number }>>();

    const ensureSeries = (time: string, model: string) => {
      if (!bucketMap.has(time)) bucketMap.set(time, new Map());
      // 上一行已保证该 key 存在
      const seriesMap = bucketMap.get(time)!;
      if (!seriesMap.has(model)) {
        seriesMap.set(model, { tokens: 0, requests: 0 });
      }
      // 上一段已保证该 key 存在
      return seriesMap.get(model)!;
    };

    tokenRows.forEach(item => {
      const series = ensureSeries(item.time, item.model || 'unknown');
      series.tokens += this.toNumber(item.tokens);
      series.requests += this.toNumber(item.requests);
    });

    const buckets = Array.from(bucketMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, seriesMap]) => ({
        time,
        series: Array.from(seriesMap.entries()).map(([key, value]) => ({
          key,
          label: key,
          tokens: value.tokens,
          requests: value.requests,
        })),
      }));

    return {
      range,
      metric: 'tokens',
      groupBy: 'model',
      availableMetrics: ['tokens', 'requests'],
      buckets,
      totals: buckets.reduce(
        (acc, bucket) => {
          bucket.series.forEach(item => {
            acc.tokens += item.tokens;
            acc.requests += item.requests;
          });
          return acc;
        },
        { tokens: 0, requests: 0 },
      ),
    };
  }

  private getRecentChats(userId: number, recentLimit: number) {
    return this.chatLogRepository.find({
      where: { userId },
      select: { id: true, model: true, channel: true, totalTokens: true, createdAt: true },
      order: { id: 'DESC' },
      take: recentLimit,
    });
  }

  private getRecentArtifacts(userId: number, recentLimit: number) {
    return this.fileAssetRepository.find({
      where: { userId },
      select: {
        id: true,
        category: true,
        purpose: true,
        status: true,
        visibility: true,
        size: true,
        createdAt: true,
        userId: true,
      },
      order: { id: 'DESC' },
      take: recentLimit,
    });
  }

  /** 链接用请求的 userId：近期请求的查询只选了展示字段，没有 userId */
  private buildRecentEvents(
    userId: number,
    contributedEvents: UserProfileEvent[],
    chats: ChatLogEntity[],
    artifacts: FileAssetEntity[],
    recentLimit: number,
  ) {
    const links = this.buildLinks(userId);
    const events: UserProfileEvent[] = [
      ...contributedEvents,
      ...chats.map(chat => ({
        type: 'chat',
        title: '模型请求',
        summary: `${chat.model || 'unknown'} · ${this.toNumber(chat.totalTokens)} Tokens`,
        occurredAt: chat.createdAt,
        link: links.chats,
      })),
      ...artifacts.map(artifact => ({
        type: 'artifact',
        title: 'Artifact 更新',
        summary: `${artifact.category || 'file'} · ${artifact.status || 'unknown'} · ${this.formatBytes(
          artifact.size,
        )}`,
        occurredAt: artifact.createdAt,
        link: links.artifacts,
      })),
    ];

    return events
      .filter(item => item.occurredAt)
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, recentLimit);
  }

  private buildLinks(userId: number) {
    return {
      chats: `/user/list?userId=${userId}`,
      artifacts: `/ai/private-files?userId=${userId}`,
    };
  }

  private formatBytes(value?: number | string | null) {
    const size = this.toNumber(value);
    if (size <= 0) return '0 B';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
    return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  private getRangeStart(range: UserProfileRange): Date | null {
    if (range === 'all') return null;
    const days = RANGE_DAYS[range] || RANGE_DAYS['30d'];
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  private normalizeRecentLimit(limit?: number) {
    const parsed = Number(limit || 10);
    if (!Number.isFinite(parsed)) return 10;
    return Math.min(Math.max(Math.floor(parsed), 1), 20);
  }

  private maskEmail(email?: string | null) {
    if (!email) return '';
    const [name, domain] = email.split('@');
    if (!domain) return this.maskMiddle(email, 2, 2);
    return `${this.maskMiddle(name, 1, 1)}@${domain}`;
  }

  private maskPhone(phone?: string | null) {
    if (!phone) return '';
    return this.maskMiddle(phone, 3, 4);
  }

  private maskIp(ip?: string | null) {
    if (!ip) return '';
    if (ip.includes('.')) {
      const parts = ip.split('.');
      return parts.length === 4 ? `${parts.slice(0, 3).join('.')}.***` : this.maskMiddle(ip, 3, 2);
    }
    if (ip.includes(':')) {
      const parts = ip.split(':').filter(Boolean);
      return parts.length > 2 ? `${parts.slice(0, 2).join(':')}:****` : this.maskMiddle(ip, 3, 2);
    }
    return this.maskMiddle(ip, 3, 2);
  }

  private maskIdentifier(value?: string | null) {
    if (!value) return '';
    return this.maskMiddle(value, 3, 3);
  }

  private maskMiddle(value: string, prefixLength: number, suffixLength: number) {
    if (value.length <= prefixLength + suffixLength) return '*'.repeat(value.length);
    return `${value.slice(0, prefixLength)}${'*'.repeat(4)}${value.slice(-suffixLength)}`;
  }

  private toNumber(value: unknown) {
    const num = Number(value || 0);
    return Number.isFinite(num) ? num : 0;
  }
}

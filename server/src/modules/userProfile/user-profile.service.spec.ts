import { HttpStatus } from '@nestjs/common';
import { createMockRepository } from '../../test/mocks/repository.mock';
import { UserProfileService } from './user-profile.service';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('UserProfileService profile boundary', () => {
  let userRepository: any;
  let userAuthIdentityRepository: any;
  let channelBinding: any;
  let fileAssetRepository: any;
  let sectionRegistry: any;
  let service: UserProfileService;

  beforeEach(() => {
    userRepository = createMockRepository(jest.fn);
    userAuthIdentityRepository = createMockRepository(jest.fn);
    channelBinding = { listUserBindings: jest.fn().mockResolvedValue([]) };
    fileAssetRepository = createMockRepository(jest.fn);
    sectionRegistry = { buildAll: jest.fn().mockResolvedValue({ sections: {}, events: [] }) };
    service = new UserProfileService(
      userRepository as any,
      createMockRepository(jest.fn) as any,
      userAuthIdentityRepository as any,
      channelBinding as any,
      fileAssetRepository as any,
      sectionRegistry as any,
    );
  });

  it('loads only safe user fields and returns masked identities and bot channels', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 12,
      uid: 'U00012',
      username: 'profile-user',
      nickname: '画像用户',
      avatar: '/avatar.png',
      role: 'user',
      status: 1,
      email: 'profile@example.com',
      phone: '18812345678',
      lastLoginIp: '10.20.30.40',
      violationCount: 2,
      createdAt: new Date('2026-05-01T00:00:00Z'),
      updatedAt: new Date('2026-05-02T00:00:00Z'),
    });
    // 扩展包贡献的片段：内核原样透传，不解释内容
    sectionRegistry.buildAll.mockResolvedValue({
      sections: { demoSection: { totalViolationRecords: 2, recentItems: [] } },
      events: [
        {
          type: 'violation',
          title: '违规记录',
          summary: '腾讯云检测 · 广告 / 风险',
          occurredAt: new Date('2026-05-08T00:00:00Z'),
          link: '/demo/records?userId=12',
        },
      ],
    });
    userAuthIdentityRepository.find.mockResolvedValue([
      {
        id: 21,
        provider: 'acme_web',
        providerUserId: 'acme-provider-user-123456',
        scene: 'oauth',
        linkKey: 'acme-link-abcdefg',
        email: 'identity@example.com',
        emailVerified: true,
        phone: '13987654321',
        nickname: '外部用户',
        avatar: '/identity.png',
        status: 'active',
        boundAt: new Date('2026-05-03T00:00:00Z'),
        lastLoginAt: new Date('2026-05-04T00:00:00Z'),
      },
    ]);
    channelBinding.listUserBindings.mockResolvedValue([
      {
        id: 31,
        channel: 'demo_bot',
        status: 1,
        channelUserId: 'bot-channel-user-987654',
        channelGroupId: 45,
        boundAt: new Date('2026-05-05T00:00:00Z'),
        updatedAt: new Date('2026-05-06T00:00:00Z'),
      },
    ]);
    fileAssetRepository.find.mockResolvedValue([
      {
        id: 51,
        userId: 12,
        category: 'generated',
        purpose: 'tool_output',
        status: 'active',
        visibility: 'private',
        size: 4096,
        createdAt: new Date('2026-05-09T00:00:00Z'),
      },
    ]);

    jest.spyOn(service as any, 'buildUsage').mockResolvedValue({
      summary: {
        chatCount: 8,
        messageCount: 8,
        activeDays: 2,
        totalTokens: 1234,
        totalCredits: 12,
        modelTop: [{ model: 'gpt-4o-mini', count: 5, tokens: 900 }],
        channelTop: [{ channel: 'web', count: 8 }],
      },
      chart: {},
      chatSummary: {
        totalCount: 8,
        requestCount: 8,
        messageCount: 8,
        modelTop: [{ model: 'gpt-4o-mini', count: 5, tokens: 900 }],
        channelTop: [{ channel: 'web', count: 8 }],
      },
    });
    jest.spyOn(service as any, 'buildConversationSummary').mockResolvedValue({
      totalCount: 3,
      activeCount: 2,
      recent: [
        {
          cid: 'c_demo001',
          requestCount: 4,
          messageCount: 4,
          totalTokens: 800,
          lastChatAt: new Date('2026-05-07T00:00:00Z'),
          link: '/user/list?userId=12',
        },
      ],
      link: '/user/list?userId=12',
    });
    jest.spyOn(service as any, 'buildArtifactSummary').mockResolvedValue({
      available: true,
      totalCount: 2,
      totalSize: 2048,
      rangeCount: 1,
      rangeSize: 1024,
      byStatus: [{ status: 'active', count: 2, size: 2048 }],
      byVisibility: [{ visibility: 'private', count: 2, size: 2048 }],
      byCategory: [{ category: 'generated', count: 1, size: 1024 }],
      recent: [],
      link: '/ai/private-files?userId=12',
    });
    jest.spyOn(service as any, 'getRecentChats').mockResolvedValue([]);

    const result = await service.getProfile(12, { range: '30d', recentLimit: 10 });
    const userSelect = userRepository.findOne.mock.calls[0][0].select;
    const serialized = JSON.stringify(result);

    expect(userSelect).toEqual(
      expect.objectContaining({
        id: true,
        uid: true,
        username: true,
        email: true,
        phone: true,
        lastLoginIp: true,
      }),
    );
    // 敏感字段一个都不能选（TypeORM 1.x 的 select 为对象写法，逐个确认）
    for (const field of [
      'password',
      'storageId',
      'avatarFileId',
      'credentialHash',
      'accessToken',
      'refreshToken',
      'profileSnapshot',
      'extraConfig',
    ]) {
      expect(userSelect).not.toHaveProperty(field);
    }
    expect(userAuthIdentityRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 12 },
        select: expect.objectContaining({
          provider: true,
          providerUserId: true,
          linkKey: true,
          email: true,
          phone: true,
          status: true,
        }),
      }),
    );
    for (const field of ['credentialHash', 'profileSnapshot', 'extra']) {
      expect(userAuthIdentityRepository.find.mock.calls[0][0].select).not.toHaveProperty(field);
    }
    expect(channelBinding.listUserBindings).toHaveBeenCalledWith(12);
    expect(result.identities[0]).toMatchObject({
      provider: 'acme_web',
      providerLabel: 'acme_web',
      providerUserIdMasked: 'acm****456',
      linkKeyMasked: 'acm****efg',
      emailMasked: 'i****y@example.com',
      phoneMasked: '139****4321',
    });
    expect(result.botChannels[0]).toMatchObject({
      channel: 'demo_bot',
      channelLabel: 'demo_bot',
      statusText: '正常',
      channelUserIdMasked: 'bot****654',
    });
    expect(result).not.toHaveProperty('agentAppUsage');
    expect(result).not.toHaveProperty('toolFailures');
    expect(result.usageSummary).toMatchObject({
      conversationCount: 3,
      activeConversationCount: 2,
      requestCount: 8,
      modelTop: [{ model: 'gpt-4o-mini', count: 5, tokens: 900 }],
      channelTop: [{ channel: 'web', count: 8 }],
    });
    expect(result.conversationSummary.recent[0]).toMatchObject({
      cid: 'c_demo001',
      requestCount: 4,
      totalTokens: 800,
      link: '/user/list?userId=12',
    });
    expect(result.artifactSummary).toMatchObject({
      available: true,
      totalCount: 2,
      totalSize: 2048,
      rangeCount: 1,
      rangeSize: 1024,
      link: '/ai/private-files?userId=12',
    });
    expect(sectionRegistry.buildAll).toHaveBeenCalledWith({
      userId: 12,
      rangeStart: expect.any(Date),
      recentLimit: expect.any(Number),
    });
    expect(result.sections).toEqual({
      demoSection: { totalViolationRecords: 2, recentItems: [] },
    });
    expect(fileAssetRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 12 },
        select: expect.objectContaining({
          category: true,
          purpose: true,
          status: true,
          visibility: true,
          size: true,
        }),
      }),
    );
    for (const field of [
      'fileId',
      'name',
      'originalName',
      'downloadUrl',
      'objectKey',
      'storagePath',
      'metadata',
      'summary',
      'origin',
    ]) {
      expect(fileAssetRepository.find.mock.calls[0][0].select).not.toHaveProperty(field);
    }
    expect(result.security).toMatchObject({
      available: true,
      violationCount: 2,
      signals: [{ level: 'warning', title: '内容过滤命中', summary: '累计命中 2 次' }],
    });
    expect(result).not.toHaveProperty('balance');
    expect(result).not.toHaveProperty('orders');
    expect(result.recentEvents.map(item => item.type)).toEqual(
      expect.arrayContaining(['artifact', 'violation']),
    );
    expect(result.basic.emailMasked).toBe('p****e@example.com');
    expect(result.basic.phoneMasked).toBe('188****5678');
    expect(result.basic.lastLoginIpMasked).toBe('10.20.30.***');
    expect(serialized).not.toContain('profile@example.com');
    expect(serialized).not.toContain('18812345678');
    expect(serialized).not.toContain('10.20.30.40');
    expect(serialized).not.toContain('acme-provider-user-123456');
    expect(serialized).not.toContain('acme-link-abcdefg');
    expect(serialized).not.toContain('identity@example.com');
    expect(serialized).not.toContain('13987654321');
    expect(serialized).not.toContain('bot-channel-user-987654');
    expect(serialized).not.toContain('违规原文');
    expect(serialized).not.toContain('敏感词');
    expect(serialized).not.toContain('file_asset_public_id');
    expect(serialized).not.toContain('object-key-secret');
    expect(serialized).not.toContain('credential-secret');
    expect(serialized).not.toContain('access-token-secret');
    expect(serialized).not.toContain('context-token-secret');
  });

  it('links recent requests and artifacts with the requested user id under the real query projections', async () => {
    // 仓库替身按查询的 select 投影返回字段：近期请求的投影里没有 userId
    const projected = (rows: Array<Record<string, unknown>>) =>
      jest.fn(async (options: { select: Record<string, boolean> }) =>
        rows.map(row =>
          Object.fromEntries(
            Object.keys(options.select)
              .filter(key => options.select[key])
              .map(key => [key, row[key]]),
          ),
        ),
      );
    const chatLogRepository = createMockRepository(jest.fn);
    chatLogRepository.find = projected([
      {
        id: 7,
        userId: 12,
        model: 'demo-model',
        channel: 'web',
        totalTokens: 10,
        createdAt: new Date('2026-05-10T00:00:00Z'),
      },
    ]);
    // 产物的链接同样只用请求的 userId，不读查询结果
    fileAssetRepository.find = jest.fn(async () => [
      {
        id: 51,
        category: 'generated',
        status: 'active',
        size: 10,
        createdAt: new Date('2026-05-09T00:00:00Z'),
      },
    ]);
    service = new UserProfileService(
      userRepository as any,
      chatLogRepository as any,
      userAuthIdentityRepository as any,
      channelBinding as any,
      fileAssetRepository as any,
      sectionRegistry as any,
    );
    userRepository.findOne.mockResolvedValue({ id: 12, uid: 'U00012', role: 'user', status: 1 });
    userAuthIdentityRepository.find.mockResolvedValue([]);
    jest.spyOn(service as any, 'buildUsage').mockResolvedValue({
      summary: { chatCount: 1, modelTop: [], channelTop: [] },
      chart: {},
    });
    jest
      .spyOn(service as any, 'buildConversationSummary')
      .mockResolvedValue({ totalCount: 0, activeCount: 0, recent: [] });
    jest.spyOn(service as any, 'buildArtifactSummary').mockResolvedValue({ available: false });

    const result = await service.getProfile(12, { range: '30d', recentLimit: 10 });

    expect(chatLogRepository.find.mock.calls[0][0].select).not.toHaveProperty('userId');
    expect(result.recentEvents.map(item => [item.type, item.link])).toEqual([
      ['chat', '/user/list?userId=12'],
      ['artifact', '/ai/private-files?userId=12'],
    ]);
  });

  it('returns a clear error for missing users', async () => {
    userRepository.findOne.mockResolvedValue(null);

    await expect(service.getProfile(999, { range: '30d' })).rejects.toMatchObject({
      response: '用户不存在！',
      status: HttpStatus.BAD_REQUEST,
    });
  });
});

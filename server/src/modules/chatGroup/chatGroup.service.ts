import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, EntityManager, IsNull, Repository } from 'typeorm';
import { ChatLiveSyncService } from '../chatRealtime/chat-live-sync.service';
import { CHAT_GROUP_GID_PREFIX, createChatGroupGid } from '@/common/utils/createChatGroupGid';
import { ChatGroupEntity, ChatGroupOwnerType } from './chatGroup.entity';
import { SandboxService } from '../sandbox/sandbox.service';
import { sandboxSessionOwner } from '../sandbox/sandbox.port';
import { Logger } from '@nestjs/common';
import { Optional } from '@nestjs/common';
import { AgentContextCheckpointStore } from '../contextCheckpoint/context-checkpoint.store';

const WEB_CHANNEL = 'web';
const CHAT_GROUP_CHANNEL_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
const DEFAULT_CONVERSATION_TITLE = '新对话';
const EXTERNAL_DIRECT_THREAD_KEY = 'direct';

class ExternalConversationCreateConflict extends Error {}

type OwnerInput = {
  id?: number | string | null;
  role?: string | null;
  userId?: number | null;
  visitorId?: string | null;
};

type NormalizedOwner = {
  ownerType: ChatGroupOwnerType;
  ownerKey: string;
  userId: number | null;
  visitorId: string | null;
};

type CreateConversationInput = {
  title?: string | null;
  config?: string | null;
  params?: string | null;
};

type UpdateConversationInput = {
  title?: string | null;
  isSticky?: boolean;
  config?: string | null;
  params?: string | null;
};

/** 会话容器写入值：userId / visitorId / externalThreadKey 为可空列，实体属性未标 | null（联合类型会破坏 TypeORM 列元数据），写 null 时用本类型描述 */
type ChatGroupWriteValues = Omit<
  Partial<ChatGroupEntity>,
  'userId' | 'visitorId' | 'externalThreadKey'
> & {
  userId?: number | null;
  visitorId?: string | null;
  externalThreadKey?: string | null;
};

@Injectable()
export class ChatGroupService {
  constructor(
    @InjectRepository(ChatGroupEntity)
    private readonly chatGroupEntity: Repository<ChatGroupEntity>,
    private readonly chatLiveSync: ChatLiveSyncService,
    @Optional() private readonly contextCheckpointStore?: AgentContextCheckpointStore,
    @Optional() private readonly sandbox?: SandboxService,
  ) {}

  private isDuplicateError(error: any): boolean {
    return error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062;
  }

  private normalizeOwner(owner: OwnerInput): NormalizedOwner {
    if (!owner) {
      throw new BadRequestException('缺少会话归属信息');
    }

    if (owner.role === 'visitor' || owner.visitorId) {
      const visitorId = String(owner.visitorId ?? owner.id ?? '').trim();
      if (!visitorId) {
        throw new BadRequestException('缺少访客会话归属信息');
      }
      return {
        ownerType: 'visitor',
        ownerKey: visitorId,
        userId: null,
        visitorId,
      };
    }

    const userId = Number(owner.userId ?? owner.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException('缺少用户会话归属信息');
    }

    return {
      ownerType: 'user',
      ownerKey: String(userId),
      userId,
      visitorId: null,
    };
  }

  private buildOwnerWhere(owner: OwnerInput, base: Record<string, any> = {}) {
    const normalized = this.normalizeOwner(owner);
    return {
      ...base,
      ownerType: normalized.ownerType,
      ownerKey: normalized.ownerKey,
    };
  }

  private normalizeChannel(channel?: string | null): string {
    const normalized = String(channel || WEB_CHANNEL)
      .trim()
      .toLowerCase();
    if (!CHAT_GROUP_CHANNEL_PATTERN.test(normalized)) {
      throw new BadRequestException('会话渠道无效');
    }
    return normalized;
  }

  private isDefaultTitle(group: ChatGroupEntity): boolean {
    const title = String(group.title || '').trim();
    return !title || title === DEFAULT_CONVERSATION_TITLE;
  }

  private normalizeAutoTitle(value: unknown, limit = 36): string {
    const normalized = String(value || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
      .replace(/\[[^\]]*]\([^)]*\)/g, ' ')
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/[#*_~>|\[\]{}()<>"'“”‘’\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized) return '';
    return normalized.length > limit ? normalized.slice(0, limit).trim() : normalized;
  }

  private buildSemanticFallbackTitle(title: string): string {
    const compact = title.replace(/[\s，。！？!?、：:；;,.]+/g, '').toLowerCase();
    if (
      /^(你好|您好|嗨|哈喽|hello|hi|hey|在吗|测试|test|ping|早上好|下午好|晚上好)[啊呀哈嗨哇喔哦]*$/i.test(
        compact,
      )
    ) {
      return '问候与开场';
    }

    if (
      /^(设|已知|证明|求证|若|如图|计算|求解)/.test(title) &&
      /(实数|函数|数列|方程|不等式|证明|满足|整数|概率|三角形|圆|导数|极值|最值|矩阵)/.test(title)
    ) {
      return '数学题求解';
    }

    return title;
  }

  toPublicConversation(group: ChatGroupEntity) {
    return {
      gid: group.gid,
      channel: group.channel || WEB_CHANNEL,
      title: group.title || DEFAULT_CONVERSATION_TITLE,
      isSticky: group.isSticky,
      config: group.config,
      params: group.params,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }

  private emitConversationUpdated(
    owner: NormalizedOwner,
    conversation: Record<string, any>,
    deleted = false,
  ) {
    if (owner.ownerType !== 'user' || !owner.userId) return;
    this.chatLiveSync.emitToUser(owner.userId, {
      type: 'conversation_updated',
      channel: String(conversation.channel || WEB_CHANNEL),
      conversationGid: String(conversation.gid || ''),
      conversation,
      ...(deleted ? { deleted: true } : {}),
    });
  }

  private async createContainerWithUniqueGid(
    container: Omit<ChatGroupWriteValues, 'gid'>,
    gidPrefix = CHAT_GROUP_GID_PREFIX,
  ): Promise<ChatGroupEntity> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        // 可空列写 null：实体属性未标 | null，在仓库边界收口
        return await this.chatGroupEntity.save({
          ...container,
          gid: createChatGroupGid(gidPrefix),
        } as DeepPartial<ChatGroupEntity>);
      } catch (error) {
        if (this.isDuplicateError(error)) continue;
        throw error;
      }
    }

    throw new BadRequestException('创建会话失败，请稍后重试');
  }

  async createConversation(owner: OwnerInput, input: CreateConversationInput = {}) {
    const normalized = this.normalizeOwner(owner);

    const group = await this.createContainerWithUniqueGid({
      ...normalized,
      channel: WEB_CHANNEL,
      externalThreadKey: null,
      title: input.title || DEFAULT_CONVERSATION_TITLE,
      isSticky: false,
      isDelete: false,
      config: input.config ?? null,
      params: input.params ?? null,
    });

    return this.toPublicConversation(group);
  }

  async queryConversations(owner: OwnerInput) {
    const groups = await this.chatGroupEntity.find({
      where: this.buildOwnerWhere(owner, { isDelete: false }),
      order: { isSticky: 'DESC', updatedAt: 'DESC' },
    });

    return groups.map(group => this.toPublicConversation(group));
  }

  async resolveGroupByGidForUser(gid: string, owner: OwnerInput): Promise<ChatGroupEntity> {
    if (!gid || typeof gid !== 'string') {
      throw new BadRequestException('会话ID无效');
    }

    const group = await this.chatGroupEntity.findOne({
      where: this.buildOwnerWhere(owner, { gid, isDelete: false }),
    });

    if (!group) {
      throw new ForbiddenException('无权访问此会话');
    }

    return group;
  }

  async resolveGroupIdByGidForUser(gid: string, owner: OwnerInput): Promise<number> {
    const group = await this.resolveGroupByGidForUser(gid, owner);
    return group.id;
  }

  async resolveConversationIdByGidForUser(gid: string, owner: OwnerInput): Promise<number> {
    return this.resolveGroupIdByGidForUser(gid, owner);
  }

  async withConversationWriteLock<T>(
    gid: string,
    owner: OwnerInput,
    operation: (group: ChatGroupEntity, manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const normalized = this.normalizeOwner(owner);
    return this.chatGroupEntity.manager.transaction(async manager => {
      const group = await manager.getRepository(ChatGroupEntity).findOne({
        where: {
          ownerType: normalized.ownerType,
          ownerKey: normalized.ownerKey,
          gid,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!group || group.isDelete || group.channel !== WEB_CHANNEL) {
        throw new HttpException(
          {
            code: 'CONVERSATION_NOT_WRITABLE',
            message: '会话不存在、已删除或归属不匹配',
          },
          HttpStatus.CONFLICT,
        );
      }
      return operation(group, manager);
    });
  }

  async withExternalConversationWriteLock<T>(
    owner: OwnerInput,
    channelInput: string,
    operation: (group: ChatGroupEntity, manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const normalized = this.normalizeOwner(owner);
    const channel = this.normalizeChannel(channelInput);
    if (channel === WEB_CHANNEL) {
      throw new BadRequestException('Web 会话必须通过公开创建接口创建');
    }

    const where = {
      ownerType: normalized.ownerType,
      ownerKey: normalized.ownerKey,
      channel,
      externalThreadKey: EXTERNAL_DIRECT_THREAD_KEY,
      isDelete: false,
    };

    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        return await this.chatGroupEntity.manager.transaction(async manager => {
          const groupRepository = manager.getRepository(ChatGroupEntity);
          const existing = await groupRepository.findOne({
            where,
            lock: { mode: 'pessimistic_write' },
          });
          if (existing) return operation(existing, manager);

          let created: ChatGroupEntity;
          try {
            const values: ChatGroupWriteValues = {
              ...normalized,
              gid: createChatGroupGid(),
              channel,
              externalThreadKey: EXTERNAL_DIRECT_THREAD_KEY,
              title: `${channel} 对话`,
              isSticky: false,
              isDelete: false,
              config: null,
              params: null,
            };
            // 可空列写 null：实体属性未标 | null，在仓库边界收口
            created = await groupRepository.save(values as DeepPartial<ChatGroupEntity>);
          } catch (error) {
            if (this.isDuplicateError(error)) {
              throw new ExternalConversationCreateConflict();
            }
            throw error;
          }

          return operation(created, manager);
        });
      } catch (error) {
        if (!(error instanceof ExternalConversationCreateConflict)) throw error;
      }
    }

    throw new BadRequestException('创建外部渠道会话失败，请稍后重试');
  }

  async resolveExternalConversation(owner: OwnerInput, channelInput: string) {
    return this.withExternalConversationWriteLock(owner, channelInput, async group => group);
  }

  async updateConversation(gid: string, owner: OwnerInput, input: UpdateConversationInput) {
    const normalized = this.normalizeOwner(owner);
    const group = await this.resolveGroupByGidForUser(gid, owner);
    const patch: Partial<ChatGroupEntity> = {};
    if (input.title !== undefined) patch.title = input.title || DEFAULT_CONVERSATION_TITLE;
    if (input.isSticky !== undefined) patch.isSticky = input.isSticky;
    if (input.config !== undefined) patch.config = input.config;
    if (input.params !== undefined) patch.params = input.params;

    if (Object.keys(patch).length === 0) return true;

    const result = await this.chatGroupEntity.update(
      this.buildOwnerWhere(owner, { id: group.id, isDelete: false }),
      patch,
    );
    if (!result.affected) return false;

    const updatedGroup = await this.chatGroupEntity.findOne({
      where: this.buildOwnerWhere(owner, { id: group.id, isDelete: false }),
    });
    const conversation = this.toPublicConversation(
      updatedGroup ||
        ({
          ...group,
          ...patch,
          updatedAt: new Date(),
        } as ChatGroupEntity),
    );
    this.emitConversationUpdated(normalized, conversation);
    return true;
  }

  async softDeleteConversation(gid: string, owner: OwnerInput) {
    const normalized = this.normalizeOwner(owner);

    let deletedGroupId: number | undefined;
    const conversation = await this.chatGroupEntity.manager.transaction(async manager => {
      const groupRepository = manager.getRepository(ChatGroupEntity);
      const group = await groupRepository.findOne({
        where: {
          ownerType: normalized.ownerType,
          ownerKey: normalized.ownerKey,
          gid,
          isDelete: false,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!group) {
        throw new ForbiddenException('无权删除此会话');
      }
      deletedGroupId = group.id;
      // 可空列写 null：实体属性未标 | null，用写入视图类型承接
      (group as ChatGroupWriteValues).externalThreadKey = null;
      group.isDelete = true;
      await groupRepository.save(group);
      await this.contextCheckpointStore?.invalidateGroup(group.id, 'conversation_deleted', manager);
      return this.toPublicConversation(group);
    });
    if (deletedGroupId && this.sandbox) {
      const account = normalized.userId
        ? `user-${normalized.userId}`
        : `visitor-${normalized.visitorId}`;
      try {
        await this.sandbox.retireSession(sandboxSessionOwner(account, deletedGroupId));
      } catch {
        Logger.warn('已删除会话的临时环境等待回收重试', 'ChatGroupService');
      }
    }
    this.emitConversationUpdated(normalized, conversation, true);
    return true;
  }

  buildRuleBasedTitleFromMessage(message: unknown): string {
    const title = this.normalizeAutoTitle(message, 28);
    return title ? this.buildSemanticFallbackTitle(title) : DEFAULT_CONVERSATION_TITLE;
  }

  async updateDefaultTitleByGroupId(groupId: number, owner: OwnerInput, title: string) {
    const normalizedGroupId = Math.floor(Number(groupId) || 0);
    const normalizedTitle = this.normalizeAutoTitle(title);
    if (!normalizedGroupId || !normalizedTitle) return false;

    const group = await this.chatGroupEntity.findOne({
      where: this.buildOwnerWhere(owner, { id: normalizedGroupId, isDelete: false }),
    });
    if (!group || !this.isDefaultTitle(group)) return false;

    const result = await this.chatGroupEntity.update(
      this.buildOwnerWhere(owner, {
        id: group.id,
        isDelete: false,
        // 按读到的标题做比较后写入；空标题要用 IsNull() 匹配，写入条件不接受 null
        title: group.title ?? IsNull(),
      }),
      { title: normalizedTitle },
    );
    if (!result.affected) return false;

    const updatedGroup = await this.chatGroupEntity.findOne({
      where: this.buildOwnerWhere(owner, { id: group.id, isDelete: false }),
    });

    return this.toPublicConversation(
      updatedGroup ||
        ({
          ...group,
          title: normalizedTitle,
          updatedAt: new Date(),
        } as ChatGroupEntity),
    );
  }
}

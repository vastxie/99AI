import { createChatLogCid, formatDate, isChatLogCid } from '@/common/utils';
import { ChatLogStatus } from '@/common/constants/status.constant';
import { getErrorStack } from '@/common/utils/error-stack.util';
import { HttpException, HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import {
  LessThan,
  LessThanOrEqual,
  Like,
  MoreThan,
  MoreThanOrEqual,
  EntityManager,
  Repository,
} from 'typeorm';
import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { ChatGroupService } from '../chatGroup/chatGroup.service';
import { ChatLogEntity } from './chatLog.entity';
import { ChatAroundDto } from './dto/chatAround.dto';
import { ChatListDto } from './dto/chatList.dto';
import { ChatSearchDto } from './dto/chatSearch.dto';
import { DelDto } from './dto/del.dto';
import { QueryAllChatLogDto } from './dto/queryAllChatLog.dto';
import { ModelMessage, UnifiedMessage } from './types/message.types';
import type { ContextBackfillPage, RoundInfo } from '@/modules/chat/types/context.types';
import { JwtPayload } from '../../types/express';
import { ModelsService } from '../models/models.service';
import {
  sanitizeChatLogItemForFrontend,
  sanitizeChatLogMessageForFrontend,
} from './chat-log-frontend';
import { OWNER_FRONTEND_MESSAGE_OPTIONS } from './tool-result-payload';
import { parseUnifiedMessage } from './unified-message.util';
import { AgentContextCheckpointStore } from '../contextCheckpoint/context-checkpoint.store';
import {
  EMPTY_HISTORICAL_USER_CONTENT,
  INTERRUPTED_HISTORICAL_ASSISTANT_CONTENT,
  getHistoricalToolModelContent,
  normalizeHistoricalAssistantMessage,
  normalizeHistoricalAssistantRound,
} from './context-history-projection';

@Injectable()
export class ChatLogService {
  private readonly cursorPrefix = 'cur_';
  private readonly cursorVersion = 1;

  constructor(
    @InjectRepository(ChatLogEntity)
    private readonly chatLogEntity: Repository<ChatLogEntity>,
    private readonly modelsService: ModelsService,
    @Optional() private readonly chatGroupService?: ChatGroupService,
    @Optional() private readonly contextCheckpointStore?: AgentContextCheckpointStore,
  ) {}

  /** 归属条件：身份里没有有效 ID 时直接拒绝，查询不带归属条件就会读到别人的记录 */
  private buildOwnerWhere(user: any, base: Record<string, any> = {}) {
    const { id, role } = user || {};
    if (role === 'visitor') {
      if (!String(id ?? '').trim()) {
        throw new HttpException('缺少访客会话归属信息', HttpStatus.BAD_REQUEST);
      }
      return { ...base, visitorId: String(id) };
    }
    const userId = Number(id);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new HttpException('缺少用户会话归属信息', HttpStatus.BAD_REQUEST);
    }
    return { ...base, userId };
  }

  async beginContextProjection(user: any, groupId: number): Promise<number> {
    const normalizedGroupId = Math.floor(Number(groupId) || 0);
    if (!this.contextCheckpointStore || normalizedGroupId <= 0) return 0;
    const owner =
      user?.role === 'visitor'
        ? { ownerType: 'visitor' as const, ownerKey: String(user?.id || '') }
        : { ownerType: 'user' as const, ownerKey: String(user?.id || '') };
    return this.contextCheckpointStore.beginProjection(normalizedGroupId, owner);
  }

  async findFirstVisibleContextLogId(user: any, groupId: number): Promise<number | null> {
    const normalizedGroupId = Math.floor(Number(groupId) || 0);
    if (normalizedGroupId <= 0) return null;
    const log = await this.chatLogEntity.findOne({
      where: {
        ...this.buildOwnerWhere(user, { groupId: normalizedGroupId }),
        isDelete: false,
      },
      select: { id: true },
      order: { id: 'ASC' },
    });
    return log?.id || null;
  }

  async collectContextBackfillPage(
    user: any,
    groupId: number,
    input: { afterLogId: number; beforeLogId: number; limit: number },
  ): Promise<ContextBackfillPage> {
    const normalizedGroupId = Math.floor(Number(groupId) || 0);
    const afterLogId = Math.max(0, Math.floor(Number(input.afterLogId) || 0));
    const beforeLogId = Math.floor(Number(input.beforeLogId) || 0);
    const limit = Math.max(1, Math.min(32, Math.floor(Number(input.limit) || 1)));
    if (normalizedGroupId <= 0 || beforeLogId <= 0 || afterLogId >= beforeLogId) {
      return { messages: [], sourceLogIds: [], nextAfterLogId: afterLogId, complete: true };
    }

    const query = this.chatLogEntity
      .createQueryBuilder('log')
      .where('log.groupId = :groupId', { groupId: normalizedGroupId })
      .andWhere('log.isDelete = 0')
      .andWhere('log.id > :afterLogId', { afterLogId })
      .andWhere('log.id < :beforeLogId', { beforeLogId })
      .orderBy('log.id', 'ASC')
      .limit(limit + 1);
    if (user?.role === 'visitor') {
      query.andWhere('log.visitorId = :ownerKey', { ownerKey: String(user?.id || '') });
    } else {
      query.andWhere('log.userId = :ownerKey', { ownerKey: user?.id });
    }
    const rows = await query.getMany();
    const selected = rows.slice(0, limit);
    const sourceLogIds = selected.map(row => row.id);
    return {
      messages: this.buildCheckpointBackfillMessages(selected),
      sourceLogIds,
      nextAfterLogId: sourceLogIds.at(-1) || afterLogId,
      complete: rows.length <= limit,
    };
  }

  private buildCheckpointBackfillMessages(rows: ChatLogEntity[]): ModelMessage[] {
    const messages: ModelMessage[] = [];
    const append = (message: ModelMessage, chatLogId: number) =>
      messages.push({ ...message, __agent_context: { chatLogId } } as ModelMessage);

    for (const row of rows) {
      const parsed = this.parseMessage(row.message);
      // 角色按服务端写入的方向判断：message 里的 role 可能来自客户端，入站记录只能是用户消息
      const role = row.direction === 'out' ? 'assistant' : 'user';
      if (role === 'user') {
        const content = parsed?.content || row.content || '';
        append({ role: 'user', content: content || EMPTY_HISTORICAL_USER_CONTENT }, row.id);
        continue;
      }
      if (role !== 'assistant') continue;

      const normalizedMessage = row.message
        ? normalizeHistoricalAssistantMessage(parsed)
        : { rounds: [], malformed: false };
      let appendedRound = false;
      for (const rawRound of normalizedMessage.rounds) {
        const normalizedRound = normalizeHistoricalAssistantRound(rawRound);
        const round = normalizedRound.value;
        if (normalizedRound.malformed) {
          append(
            {
              role: 'assistant',
              content: [normalizedRound.text, INTERRUPTED_HISTORICAL_ASSISTANT_CONTENT]
                .filter(Boolean)
                .join('\n'),
            },
            row.id,
          );
          appendedRound = true;
          continue;
        }
        const toolCalls = normalizedRound.toolCalls.filter(
          (toolCall: any) =>
            toolCall?.name !== 'user_upload' &&
            !String(toolCall?.id || '').startsWith('user_upload'),
        );
        const usableCalls = toolCalls.filter(
          (toolCall: any) =>
            typeof toolCall?.id === 'string' &&
            toolCall.id.trim() &&
            typeof (toolCall?.toolName || toolCall?.name) === 'string' &&
            String(toolCall.toolName || toolCall.name).trim() &&
            ['loading', 'success', 'error'].includes(toolCall?.status),
        );
        if (usableCalls.length) {
          append(
            {
              role: 'assistant',
              content: round?.text || '',
              tool_calls: usableCalls.map((toolCall: any) => ({
                id: String(toolCall.id),
                type: 'function',
                function: {
                  name: String(toolCall.toolName || toolCall.name),
                  arguments: '{}',
                },
              })),
            },
            row.id,
          );
          for (const toolCall of usableCalls) {
            append(
              {
                role: 'tool',
                tool_call_id: String(toolCall.id),
                content: getHistoricalToolModelContent(toolCall),
              },
              row.id,
            );
          }
          if (usableCalls.length !== toolCalls.length) {
            append(
              { role: 'assistant', content: INTERRUPTED_HISTORICAL_ASSISTANT_CONTENT },
              row.id,
            );
          }
          appendedRound = true;
        } else if (toolCalls.length) {
          append(
            {
              role: 'assistant',
              content: [round?.text, INTERRUPTED_HISTORICAL_ASSISTANT_CONTENT]
                .filter(Boolean)
                .join('\n'),
            },
            row.id,
          );
          appendedRound = true;
        } else if (normalizedRound.text) {
          append({ role: 'assistant', content: normalizedRound.text }, row.id);
          appendedRound = true;
        } else {
          append({ role: 'assistant', content: INTERRUPTED_HISTORICAL_ASSISTANT_CONTENT }, row.id);
          appendedRound = true;
        }
      }
      if (!appendedRound) {
        const content = parsed?.content || row.content || '';
        append(
          {
            role: 'assistant',
            content:
              normalizedMessage.malformed || !content
                ? [content, INTERRUPTED_HISTORICAL_ASSISTANT_CONTENT].filter(Boolean).join('\n')
                : content,
          },
          row.id,
        );
      }
    }
    return messages;
  }

  private getCursorOwnerScope(user: any): string {
    const { id, role } = user || {};
    return role === 'visitor' ? `visitor:${String(id)}` : `user:${String(id)}`;
  }

  private encodeCursorPayload(payload: Record<string, any>): string {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  }

  private decodeCursorPayload(token: string): any {
    try {
      return JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    } catch {
      throw new HttpException('分页游标无效', HttpStatus.BAD_REQUEST);
    }
  }

  private normalizeCursorGroupId(groupId?: number | null): number | null {
    const normalized = Math.floor(Number(groupId) || 0);
    return normalized > 0 ? normalized : null;
  }

  private encodeBeforeCursor(item: Pick<ChatLogEntity, 'id'>, user: any, groupId?: number | null) {
    const normalizedGroupId = this.normalizeCursorGroupId(groupId);
    const payload = {
      v: this.cursorVersion,
      id: item.id,
      owner: this.getCursorOwnerScope(user),
      direction: 'before',
      ...(normalizedGroupId ? { groupId: normalizedGroupId } : {}),
    };
    return `${this.cursorPrefix}${this.encodeCursorPayload(payload)}`;
  }

  private decodeBeforeCursor(cursor: string, user: any, groupId?: number | null): { id: number } {
    try {
      if (!cursor || !cursor.startsWith(this.cursorPrefix)) {
        throw new Error('missing cursor prefix');
      }

      const rawToken = cursor.slice(this.cursorPrefix.length);
      const payload = this.decodeCursorPayload(rawToken);
      const normalizedGroupId = this.normalizeCursorGroupId(groupId);
      const hasPayloadGroupId = payload.groupId !== undefined && payload.groupId !== null;
      const payloadGroupId = hasPayloadGroupId
        ? this.normalizeCursorGroupId(payload.groupId)
        : null;

      if (
        payload.v !== this.cursorVersion ||
        payload.direction !== 'before' ||
        payload.owner !== this.getCursorOwnerScope(user) ||
        (hasPayloadGroupId && !payloadGroupId) ||
        payloadGroupId !== normalizedGroupId ||
        !Number.isInteger(payload.id) ||
        payload.id <= 0
      ) {
        throw new Error('cursor scope mismatch');
      }

      return { id: payload.id };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('分页游标无效', HttpStatus.BAD_REQUEST);
    }
  }

  private async createUniqueChatLogCid(
    repository: Repository<ChatLogEntity> = this.chatLogEntity,
  ): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const cid = createChatLogCid();
      const exists = await repository.findOne({ where: { cid }, select: { id: true } });
      if (!exists) return cid;
    }

    throw new HttpException('消息ID生成失败，请稍后重试', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  private async resolveConversationGroupIdForRead(user: any, gid?: string): Promise<number> {
    if (!gid) {
      throw new HttpException('缺少会话ID', HttpStatus.BAD_REQUEST);
    }

    if (!this.chatGroupService) {
      throw new HttpException('会话服务未初始化', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return this.chatGroupService.resolveConversationIdByGidForUser(gid, user);
  }

  private findDuplicatedChannelLog(
    logInfo: any,
    repository: Repository<ChatLogEntity> = this.chatLogEntity,
  ): Promise<Pick<ChatLogEntity, 'id'> | null> {
    return Promise.resolve().then(() => {
      if (!logInfo?.channel || !logInfo?.channelMessageId) return null;

      return repository.findOne({
        where: {
          channel: logInfo.channel,
          channelMessageId: logInfo.channelMessageId,
        },
        select: { id: true },
      });
    });
  }

  private normalizeSearchText(value: unknown): string {
    if (value === undefined || value === null) return '';
    return String(value)
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractFrontendMessageContent(message: unknown): string {
    const frontendMessage = sanitizeChatLogMessageForFrontend(message);
    if (!frontendMessage) return '';

    try {
      const parsed =
        typeof frontendMessage === 'string' ? JSON.parse(frontendMessage) : frontendMessage;
      if (typeof parsed?.content === 'string') return this.normalizeSearchText(parsed.content);
      if (Array.isArray(parsed?.rounds)) {
        return this.normalizeSearchText(
          parsed.rounds
            .map((round: any) => (typeof round?.text === 'string' ? round.text : ''))
            .filter(Boolean)
            .join(' '),
        );
      }
    } catch {
      return this.normalizeSearchText(frontendMessage);
    }

    return '';
  }

  private getSearchableLogContent(item: ChatLogEntity): string {
    return (
      this.normalizeSearchText(item.content) || this.extractFrontendMessageContent(item.message)
    );
  }

  private buildSearchSnippet(content: string, keyword: string, limit = 160): string {
    const text = this.normalizeSearchText(content);
    if (!text) return '';

    const normalizedKeyword = keyword.toLocaleLowerCase();
    const normalizedText = text.toLocaleLowerCase();
    const matchIndex = normalizedText.indexOf(normalizedKeyword);
    const start = matchIndex > 0 ? Math.max(0, matchIndex - 48) : 0;
    const end = Math.min(text.length, start + limit);
    const snippet = text.slice(start, end);

    return `${start > 0 ? '...' : ''}${snippet}${end < text.length ? '...' : ''}`;
  }

  /**
   * 解析统一消息结构
   * @param messageJson message 字段的 JSON 字符串
   * @returns 解析后的 UnifiedMessage 对象，失败返回 null
   */
  private parseMessage(messageJson: string | null): UnifiedMessage | null {
    return parseUnifiedMessage(messageJson);
  }

  private normalizeWriteChannel(channelInput: unknown): string {
    return String(channelInput || 'web')
      .trim()
      .toLowerCase();
  }

  private async saveChatLogInLockedConversation(
    logInfo: any,
    group: ChatGroupEntity,
    repository: Repository<ChatLogEntity>,
  ): Promise<ChatLogEntity | null> {
    const channel = this.normalizeWriteChannel(logInfo?.channel);
    const ownerMatches =
      (logInfo?.visitorId &&
        group.ownerType === 'visitor' &&
        group.ownerKey === String(logInfo.visitorId)) ||
      (Number.isInteger(Number(logInfo?.userId)) &&
        Number(logInfo.userId) > 0 &&
        group.ownerType === 'user' &&
        group.ownerKey === String(logInfo.userId));

    if (group.isDelete || !ownerMatches || group.channel !== channel) {
      throw new HttpException(
        {
          code: 'CONVERSATION_NOT_WRITABLE',
          message: '会话不存在、已删除或归属不匹配',
        },
        HttpStatus.CONFLICT,
      );
    }

    const duplicatedChannelLog = await this.findDuplicatedChannelLog(logInfo, repository);
    if (duplicatedChannelLog) {
      Logger.debug(
        `通道消息重复，已跳过写入: channel=${channel}, msgId=${logInfo.channelMessageId}`,
        'ChatLogService',
      );
      return null;
    }

    const shouldGenerateCid = !logInfo?.cid;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const nextLogInfo = {
          ...logInfo,
          groupId: group.id,
          channel,
          cid: shouldGenerateCid ? await this.createUniqueChatLogCid(repository) : logInfo.cid,
        };
        return await repository.save(nextLogInfo);
      } catch (error) {
        if (error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062) {
          const duplicated = await this.findDuplicatedChannelLog(logInfo, repository);
          if (duplicated) {
            Logger.debug(
              `通道消息重复，已跳过写入: channel=${channel}, msgId=${logInfo.channelMessageId}`,
              'ChatLogService',
            );
            return null;
          }

          if (shouldGenerateCid && attempt < 7) {
            continue;
          }
        }
        throw error;
      }
    }

    throw new HttpException('消息保存失败，请稍后重试', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  /* 记录问答日志 */
  async saveChatLog(logInfo: Record<string, unknown>): Promise<any> {
    const groupId = Math.floor(Number(logInfo?.groupId) || 0);
    if (groupId <= 0) {
      throw new HttpException('消息必须归属明确会话', HttpStatus.BAD_REQUEST);
    }

    return this.chatLogEntity.manager.transaction(async manager => {
      const group = await manager.getRepository(ChatGroupEntity).findOne({
        where: { id: groupId, isDelete: false },
        lock: { mode: 'pessimistic_write' },
      });
      if (!group) {
        throw new HttpException(
          {
            code: 'CONVERSATION_NOT_WRITABLE',
            message: '会话不存在、已删除或归属不匹配',
          },
          HttpStatus.CONFLICT,
        );
      }

      return this.saveChatLogInLockedConversation(
        logInfo,
        group,
        manager.getRepository(ChatLogEntity),
      );
    });
  }

  async saveExternalTurnChatLogs<T = undefined>(input: {
    owner: any;
    channel: string;
    userLog: any;
    assistantLog: any;
    afterSave?: (context: {
      group: ChatGroupEntity;
      manager: EntityManager;
      userLog: ChatLogEntity;
      assistantLog: ChatLogEntity;
    }) => Promise<T>;
  }): Promise<{
    userLog: ChatLogEntity;
    assistantLog: ChatLogEntity;
    groupId: number;
    gid: string;
    extension: T | undefined;
  }> {
    if (
      !this.chatGroupService ||
      typeof this.chatGroupService.withExternalConversationWriteLock !== 'function'
    ) {
      throw new HttpException('外部渠道会话写入服务不可用', HttpStatus.SERVICE_UNAVAILABLE);
    }

    return this.chatGroupService.withExternalConversationWriteLock(
      input.owner,
      input.channel,
      async (group, manager) => {
        const repository = manager.getRepository(ChatLogEntity);
        const userLog = await this.saveChatLogInLockedConversation(
          input.userLog,
          group,
          repository,
        );
        if (!userLog) {
          throw new HttpException('通道消息已处理', HttpStatus.CONFLICT);
        }

        const assistantLog = await this.saveChatLogInLockedConversation(
          input.assistantLog,
          group,
          repository,
        );
        if (!assistantLog) {
          throw new HttpException('助手消息写入冲突', HttpStatus.CONFLICT);
        }

        const extension = input.afterSave
          ? await input.afterSave({ group, manager, userLog, assistantLog })
          : undefined;
        return {
          userLog,
          assistantLog,
          groupId: group.id,
          gid: group.gid,
          extension,
        };
      },
    );
  }

  /* 更新问答日志 */
  async updateChatLog(id: number, logInfo: Partial<ChatLogEntity>) {
    const result = await this.chatLogEntity.update({ id }, logInfo);
    return result;
  }
  async findOneChatLog(id: number) {
    return await this.chatLogEntity.findOne({ where: { id } });
  }

  async findFirstInboundChatLogIdForGroup(groupId: number): Promise<number | null> {
    const normalizedGroupId = Math.floor(Number(groupId) || 0);
    if (!normalizedGroupId) return null;

    const log = await this.chatLogEntity.findOne({
      where: {
        groupId: normalizedGroupId,
        direction: 'in',
        isDelete: false,
      },
      select: { id: true },
      order: {
        createdAt: 'ASC',
        id: 'ASC',
      },
    });

    return log?.id || null;
  }
  async resolveChatLogByCidForUser(
    cid: string,
    user: any,
    options: { assistantOnly?: boolean; groupId?: number | null } = {},
  ): Promise<ChatLogEntity> {
    if (!isChatLogCid(cid)) {
      throw new HttpException('消息ID无效', HttpStatus.BAD_REQUEST);
    }

    const normalizedGroupId = this.normalizeCursorGroupId(options.groupId);
    const ownerWhere = this.buildOwnerWhere(
      user,
      normalizedGroupId ? { groupId: normalizedGroupId } : {},
    );
    const where: any = { ...ownerWhere, cid, isDelete: false };

    const chatLog = await this.chatLogEntity.findOne({ where });
    if (!chatLog) {
      throw new HttpException('无权访问此消息', HttpStatus.FORBIDDEN);
    }

    if (options.assistantOnly) {
      // 按服务端写入的方向判断，不信 message 里的 role
      if (chatLog.direction !== 'out') {
        throw new HttpException('仅支持播报助手消息', HttpStatus.BAD_REQUEST);
      }
    }

    return chatLog;
  }

  /* 查询所有对话记录 */
  async queryAllChatLog(params: QueryAllChatLogDto, req: Request) {
    const { page = 1, size = 20, userId, model, prompt } = params;

    // 使用 QueryBuilder 进行 JOIN 查询，避免 N+1 问题
    let queryBuilder = this.chatLogEntity
      .createQueryBuilder('chatlog')
      .leftJoinAndSelect('chatlog.user', 'user')
      .orderBy('chatlog.id', 'DESC')
      .skip((page - 1) * size)
      .take(size);

    if (userId) {
      queryBuilder = queryBuilder.andWhere('chatlog.userId = :userId', { userId });
    }
    if (model) {
      queryBuilder = queryBuilder.andWhere('chatlog.model = :model', { model });
    }
    if (prompt) {
      queryBuilder = queryBuilder.andWhere('chatlog.content LIKE :prompt', {
        prompt: `%${prompt}%`,
      });
    }

    const [chatLogs, count] = await queryBuilder.getManyAndCount();

    // 直接从关联的 user 对象获取用户信息
    const rows = chatLogs.map((item: any) => {
      const user = item.user || {};
      // 如果是游客，使用 visitorId 生成名称
      const identifier = item.userId || item.visitorId || 'unknown';
      return sanitizeChatLogItemForFrontend({
        ...item,
        username: user.username || `游客${identifier}`,
        email: user.email || `${identifier}@aiweb.com`,
        nickname: user.nickname || '',
      });
    });

    return { rows, count };
  }

  private formatChatListItem(item: ChatLogEntity) {
    const { createdAt, model, modelName, status, cid, content, message, ttsUrl, direction } = item;
    // 角色按服务端写入的方向判断，不信 message 里的 role；返回的消息对象同步为同一角色
    const role = direction === 'out' ? 'assistant' : 'user';
    const parsedMessage = this.parseMessage(message);
    const frontendMessage = sanitizeChatLogMessageForFrontend(
      parsedMessage && parsedMessage.role !== role ? { ...parsedMessage, role } : message,
      OWNER_FRONTEND_MESSAGE_OPTIONS,
    );

    return {
      cid,
      dateTime: formatDate(createdAt),
      createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
      content: content,
      status: status,
      error: false,
      model: model,
      modelName: modelName,
      role,
      message: frontendMessage, // 统一消息结构
      ttsUrl: ttsUrl || undefined,
    };
  }

  /* 查询当前对话的列表 - 游标分页 */
  async chatList(req: Request, params: ChatListDto) {
    const { limit, beforeCursor, gid } = params;
    const take = Math.min(limit || 50, 100);
    const groupId = await this.resolveConversationGroupIdForRead(req.user, gid);
    const ownerWhere = this.buildOwnerWhere(req.user, { groupId });
    const cursor = beforeCursor ? this.decodeBeforeCursor(beforeCursor, req.user, groupId) : null;

    const where: any = { ...ownerWhere, isDelete: false };
    cursor && Object.assign(where, { id: LessThan(cursor.id) });

    const list = await this.chatLogEntity.find({
      where,
      order: {
        id: 'DESC',
      },
      take: take + 1,
    });

    const hasMore = list.length > take;
    const pageItems = hasMore ? list.slice(0, take) : list;
    const orderedItems = pageItems.reverse();
    const rows = orderedItems.map(item => this.formatChatListItem(item));
    const beforeCursorForNext =
      orderedItems.length > 0 ? this.encodeBeforeCursor(orderedItems[0], req.user, groupId) : null;

    return {
      rows,
      pageInfo: {
        hasMore,
        beforeCursor: hasMore ? beforeCursorForNext : null,
      },
    };
  }

  async search(req: Request, params: ChatSearchDto) {
    const { keyword } = params;
    const take = Math.min(params.limit || 30, 50);
    const ownerWhere = this.buildOwnerWhere(req.user);
    const likeKeyword = `%${keyword}%`;

    const logMatches = await this.chatLogEntity.find({
      where: {
        ...ownerWhere,
        isDelete: false,
        content: Like(likeKeyword),
      },
      order: { id: 'DESC' },
      take: take * 3,
      relations: { group: true },
    });

    const visibleMatches = logMatches.filter(item => item.group && !item.group.isDelete);

    const messageRows = visibleMatches.map(item => {
      const content = this.getSearchableLogContent(item);

      return {
        matchType: 'message' as const,
        targetCid: item.cid,
        gid: item.group.gid,
        title: this.buildSearchSnippet(content, keyword, 48) || '历史消息',
        snippet: this.buildSearchSnippet(content, keyword),
        role: item.direction === 'out' ? 'assistant' : 'user',
        dateTime: formatDate(item.createdAt),
        timestamp: new Date(item.createdAt).getTime(),
      };
    });

    const rows = messageRows
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, take)
      .map(({ timestamp, ...row }) => row);

    return {
      rows,
      count: rows.length,
    };
  }

  async chatAround(req: Request, params: ChatAroundDto) {
    const { targetCid, gid } = params;
    const take = Math.min(params.limit || 50, 80);
    const olderTake = Math.floor((take - 1) / 2);
    const newerTake = take - 1 - olderTake;
    const groupId = await this.resolveConversationGroupIdForRead(req.user, gid);
    const ownerWhere = this.buildOwnerWhere(req.user, { groupId });

    const target = await this.resolveChatLogByCidForUser(targetCid, req.user, { groupId });
    const targetId = target.id;

    const [olderRows, newerRows] = await Promise.all([
      this.chatLogEntity.find({
        where: {
          ...ownerWhere,
          isDelete: false,
          id: LessThan(targetId),
        },
        order: { id: 'DESC' },
        take: olderTake,
      }),
      this.chatLogEntity.find({
        where: {
          ...ownerWhere,
          isDelete: false,
          id: MoreThan(targetId),
        },
        order: { id: 'ASC' },
        take: newerTake,
      }),
    ]);

    const rows = [...olderRows.reverse(), target, ...newerRows].map(item =>
      this.formatChatListItem(item),
    );
    const firstRow = [...olderRows, target, ...newerRows][0];
    const beforeCursorForNext = firstRow
      ? this.encodeBeforeCursor(firstRow, req.user, groupId)
      : null;

    return {
      rows,
      targetCid,
      pageInfo: {
        hasMore: olderRows.length >= olderTake,
        beforeCursor: olderRows.length >= olderTake ? beforeCursorForNext : null,
      },
    };
  }

  /**
   * 收集指定轮数的纯对话和工具对话
   * @param pureRounds 纯对话轮数
   * @param toolRounds 工具对话轮数
   * @returns 按时间正序排列的轮次
   */
  private async collectConversationRounds(
    ownerWhere: Record<string, any>,
    pureRounds: number,
    toolRounds: number,
    throughLogId?: number,
  ): Promise<RoundInfo[]> {
    const hasThroughLogId = throughLogId !== undefined;
    if (
      hasThroughLogId &&
      (typeof throughLogId !== 'number' || !Number.isSafeInteger(throughLogId) || throughLogId <= 0)
    ) {
      throw new Error('上下文历史查询上界无效');
    }
    const normalizedPureRounds = Math.max(0, Math.floor(Number(pureRounds) || 0));
    const normalizedToolRounds = Math.max(0, Math.floor(Number(toolRounds) || 0));
    if (normalizedPureRounds <= 0) return [];

    // 获取足够多的历史记录
    const fetchLimit = normalizedPureRounds + normalizedToolRounds + 20;
    const normalizedThroughLogId = hasThroughLogId ? (throughLogId as number) : 0;
    const list = await this.chatLogEntity.find({
      where: {
        isDelete: false,
        ...ownerWhere,
        ...(normalizedThroughLogId > 0 ? { id: LessThanOrEqual(normalizedThroughLogId) } : {}),
      },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: Math.max(fetchLimit * 2, 40),
    });

    // 解析每条记录，检测是否包含工具调用
    const roundsWithNulls = list.map(item => {
      const parsedMessage = this.parseMessage(item.message);
      // 角色按服务端写入的方向判断：message 里的 role 可能来自客户端，入站记录只能是用户消息、不带工具调用
      const role = item.direction === 'out' ? 'assistant' : 'user';
      let hasToolCalls = false;
      let toolCalls: any[] = [];
      let toolResults: any[] = [];

      // 检查是否包含工具调用（排除 user_upload，它只是用户上传文件的虚拟工具）
      if (role === 'assistant' && parsedMessage?.rounds && Array.isArray(parsedMessage.rounds)) {
        for (const round of parsedMessage.rounds) {
          if (Array.isArray(round?.toolCalls) && round.toolCalls.length > 0) {
            // 过滤掉 user_upload，仅保留真正的工具调用
            const realToolCalls = round.toolCalls.filter(
              (tc: any) =>
                tc &&
                typeof tc === 'object' &&
                !Array.isArray(tc) &&
                tc.name !== 'user_upload' &&
                !(tc.id && tc.id.startsWith('user_upload')),
            );
            if (realToolCalls.length > 0) {
              hasToolCalls = true;
              toolCalls = realToolCalls;
              toolResults = realToolCalls.map((tc: any) => ({
                tool_call_id: tc.id,
                content: tc.output || tc.result || '',
              }));
            }
            break;
          }
        }
      }

      return {
        id: item.id,
        role,
        content: parsedMessage?.content || item.content || '',
        message: item.message || '',
        createdAt: item.createdAt!,
        hasToolCalls,
        toolCalls: hasToolCalls ? toolCalls : undefined,
        toolResults: hasToolCalls ? toolResults : undefined,
      } as RoundInfo;
    });

    const allRounds = roundsWithNulls.filter((r): r is RoundInfo => r !== null);

    // MySQL datetime may only have second precision. Keep the same deterministic
    // tie-break as the source query so the current user request cannot move
    // behind an older row created in the same second.
    allRounds.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || Number(a.id) - Number(b.id),
    );

    const selectedRounds = allRounds.slice(-Math.min(normalizedPureRounds, allRounds.length));
    // 查询候选阶段不再先丢工具 observation；后续 Context Policy 会按完整
    // assistant + tool results 原子组做预算和语义压缩。
    let toolCount = 0;
    for (const round of selectedRounds) {
      if (!round.hasToolCalls) continue;
      (round as any).includeToolCalls = true;
      toolCount += 1;
    }

    Logger.debug(
      `collectRounds: 历史候选 ${selectedRounds.length}/${normalizedPureRounds}, 完整工具上下文 ${toolCount}`,
      'ChatLogService',
    );

    return selectedRounds;
  }

  collectRoundsForGroup(
    user: any,
    groupId: number,
    pureRounds: number,
    toolRounds: number,
    throughLogId?: number,
  ): Promise<RoundInfo[]> {
    return Promise.resolve().then((): RoundInfo[] | Promise<RoundInfo[]> => {
      const normalizedGroupId = Math.floor(Number(groupId) || 0);
      if (normalizedGroupId <= 0) return [];
      return this.collectConversationRounds(
        this.buildOwnerWhere(user, { groupId: normalizedGroupId }),
        pureRounds,
        toolRounds,
        throughLogId,
      );
    });
  }
  /* 删除单条对话记录 */
  async deleteChatLog(req: Request, body: DelDto) {
    const { cid, gid } = body;
    const groupId = await this.resolveConversationGroupIdForRead(req.user, gid);
    const ownerWhere = this.buildOwnerWhere(req.user, { groupId });
    const chatLog = await this.resolveChatLogByCidForUser(cid, req.user, { groupId });
    const { id } = chatLog;
    const where = { id, ...ownerWhere };
    const r = this.contextCheckpointStore
      ? await this.chatLogEntity.manager.transaction(async manager => {
          const result = await manager.getRepository(ChatLogEntity).update(where, {
            isDelete: true,
          });
          if (result.affected) {
            await this.contextCheckpointStore!.invalidateGroup(
              groupId,
              'source_message_deleted',
              manager,
            );
          }
          return result;
        })
      : await this.chatLogEntity.update(where, { isDelete: true });
    if ((r.affected ?? 0) > 0) {
      return '删除对话记录成功！';
    } else {
      throw new HttpException('你删除的对话记录不存在、请检查！', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * 重新生成 / 编辑重发：在写入新一轮的同一个会话写锁事务里，软删会话中这条提问及其后的记录。
   * 新一轮没被接受（预检拒绝、写入失败）时事务回滚，原来的问答原样保留。
   *
   * 以下情况拒绝（409，事务回滚，什么都不删也不写）：
   * - 起点不是这个会话里还在的提问（已被别处替换或删除、或传了回答的 cid）：REPLACE_TARGET_GONE；
   * - 起点及之后还有未结束的回合（跟丢的回复可能仍在生成）：TURN_RUNNING；
   * - 带了用户确认的后续轮数、与实际不符（前端只数了已加载的消息）：REPLACE_RANGE_CHANGED，
   *   data.laterTurns 给出实际轮数，前端据此重新确认。
   * 返回软删的条数。
   */
  async replaceFromCidInTransaction(
    manager: EntityManager,
    input: { user: any; groupId: number; cid: string; expectedLaterTurns?: number },
  ): Promise<number> {
    await this.assertReplaceableInTransaction(manager, input);
    return (await this.softDeleteFromCid(manager, input.user, input.groupId, input.cid)) ?? 0;
  }

  /**
   * 替换前的检查（见 replaceFromCidInTransaction），不删除任何记录。
   * 调度器在会话写锁内、可变预检之前先跑一次：被拒的替换不消耗限流与访客额度（它们记在 Redis，不随事务回滚）。
   */
  async assertReplaceableInTransaction(
    manager: EntityManager,
    input: { user: any; groupId: number; cid: string; expectedLaterTurns?: number },
  ): Promise<void> {
    const ownerWhere = this.buildOwnerWhere(input.user, { groupId: input.groupId });
    const repository = manager.getRepository(ChatLogEntity);
    const start = await repository.findOne({
      where: { cid: input.cid, ...ownerWhere, isDelete: false, direction: 'in' },
      select: { id: true },
    });
    if (!start) {
      throw new HttpException(
        { code: 'REPLACE_TARGET_GONE', message: '要重新发送的提问已经不在了，请刷新后再试' },
        HttpStatus.CONFLICT,
      );
    }
    const running = await repository.count({
      where: {
        id: MoreThanOrEqual(start.id),
        ...ownerWhere,
        isDelete: false,
        // 只看生成中：服务端不再写 PENDING，旧数据里残留的 PENDING 不应让之前的提问永远不能重新发送
        status: ChatLogStatus.GENERATING,
      },
    });
    if (running > 0) {
      throw new HttpException(
        { code: 'TURN_RUNNING', message: '这之后还有回复在生成，请先停止再重新发送' },
        HttpStatus.CONFLICT,
      );
    }
    if (input.expectedLaterTurns !== undefined) {
      const laterTurns = await repository.count({
        where: { id: MoreThan(start.id), ...ownerWhere, isDelete: false, direction: 'in' },
      });
      if (laterTurns !== input.expectedLaterTurns) {
        throw new HttpException(
          {
            code: 'REPLACE_RANGE_CHANGED',
            message: '这条提问之后的对话和页面上显示的不一致，请重新确认',
            data: { laterTurns },
          },
          HttpStatus.CONFLICT,
        );
      }
    }
  }

  /** 软删会话里 cid 这条及其后的全部记录（按归属与会话限定）；记录不存在时返回 null */
  private async softDeleteFromCid(
    manager: EntityManager,
    user: any,
    groupId: number,
    cid: string,
  ): Promise<number | null> {
    const ownerWhere = this.buildOwnerWhere(user, { groupId });
    const repository = manager.getRepository(ChatLogEntity);
    const chatLog = await repository.findOne({
      where: { cid, ...ownerWhere, isDelete: false },
      select: { id: true },
    });
    if (!chatLog) return null;

    const update = await repository.update(
      { id: MoreThanOrEqual(chatLog.id), ...ownerWhere },
      { isDelete: true },
    );
    if (update.affected && this.contextCheckpointStore) {
      await this.contextCheckpointStore.invalidateGroup(groupId, 'source_range_deleted', manager);
    }
    return update.affected ?? 0;
  }

  async checkModelLimits(userId: JwtPayload, model: string) {
    const ONE_HOUR_IN_MS = 3600 * 1000;
    const oneHourAgo = new Date(Date.now() - ONE_HOUR_IN_MS);
    const isVisitor = userId?.role === 'visitor';
    const ownerWhere = this.buildOwnerWhere(userId);
    const ownerLabel = isVisitor ? '访客' : `用户ID: ${userId.id}`;

    try {
      // 计算一小时内模型的使用次数
      const usageCount = await this.chatLogEntity.count({
        where: {
          ...ownerWhere,
          model,
          createdAt: MoreThan(oneHourAgo),
        },
      });

      const adjustedUsageCount = Math.ceil(usageCount / 2);

      // 获取模型的使用限制
      const modelInfo = await this.modelsService.getCurrentModelKeyInfo(model);
      if (!modelInfo) {
        // 模型已停用或不存在：拿不到限额，按“不限制”放行（与原先 TypeError 被吞掉后的可观察结果一致），只留一条 warn 说明原因
        Logger.warn(
          `${ownerLabel} 请求的模型 ${model} 不存在或已停用，跳过频率限流检查`,
          'ChatLogService',
        );
        return undefined;
      }
      const modelLimits = Number(modelInfo.modelLimits);

      // 仅在接近限额时记录
      if (adjustedUsageCount + 1 >= modelLimits * 0.8) {
        Logger.warn(
          `${ownerLabel} 模型 ${model} 接近限额 ${adjustedUsageCount + 1}/${modelLimits}`,
          'ChatLogService',
        );
      }

      // 检查是否超过使用限制
      if (adjustedUsageCount > modelLimits) {
        Logger.log(
          `${ownerLabel} 模型 ${model} 超过限额 ${adjustedUsageCount + 1}/${modelLimits}`,
          'ChatLogService',
        );
        return true;
      }
      return false;
    } catch (error) {
      Logger.error(
        `查询数据库出错 - ${ownerLabel}, 模型: ${model}, 错误信息: ${error.message}`,
        getErrorStack(error),
        'ChatLogService',
      );
    }
  }
}

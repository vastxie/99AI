import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { FileRefMappingStore } from '../fileAsset/file-refs/file-ref-mapping';
import type { ContextBackfillPage, ContextBuildResult, RoundInfo } from './types/context.types';
import { ChatUploadContextService, type UploadMediaType } from './chat-upload-context.service';
import {
  EMPTY_HISTORICAL_USER_CONTENT,
  INTERRUPTED_HISTORICAL_ASSISTANT_CONTENT,
  getHistoricalToolModelContent,
  normalizeHistoricalAssistantMessage,
  normalizeHistoricalAssistantRound,
} from '../chatLog/context-history-projection';

export const DEFAULT_HISTORY_CANDIDATE_ROUNDS = 120;
export const DEFAULT_TOOL_HISTORY_CANDIDATE_ROUNDS = 40;

/** 历史回放依赖的会话日志读侧能力（ChatLogService 的结构化子集，可选方法按存在性调用） */
interface ContextChatLogSource {
  collectRoundsForGroup(
    user: unknown,
    groupId: number,
    pureRounds: number,
    toolRounds: number,
    throughLogId?: number,
  ): Promise<RoundInfo[]>;
  beginContextProjection?(user: unknown, groupId: number): Promise<number>;
  findFirstVisibleContextLogId?(user: unknown, groupId: number): Promise<number | null>;
  collectContextBackfillPage?(
    user: unknown,
    groupId: number,
    input: { afterLogId: number; beforeLogId: number; limit: number },
  ): Promise<ContextBackfillPage>;
}

/** 历史轮次里工具调用 / 工具结果在模型消息中的形态 */
interface HistoricalToolCallPart {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface HistoricalToolResultPart {
  tool_call_id: string;
  role: 'tool';
  content: unknown;
}

interface HistoricalUserMessage {
  id: number;
  role: 'user';
  /** 纯文本，或多模态内容块数组 */
  content: string | unknown[];
  createdAt: Date;
}

interface HistoricalAssistantMessage {
  id: number;
  role: 'assistant';
  content: string;
  createdAt: Date;
  toolCalls?: HistoricalToolCallPart[];
  toolResults?: HistoricalToolResultPart[];
  thinking: string | null;
}

/** 组装期消息：模型消息字段加内部元数据（createdAt / __agent_context），返回前剔除 createdAt */
type ContextMessage = Record<string, unknown> & { role: string };

function compareContextRecords(
  left: { id: number; createdAt: Date | string | number },
  right: { id: number; createdAt: Date | string | number },
): number {
  const timestampOrder = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  if (timestampOrder !== 0) return timestampOrder;
  return Number(left.id) - Number(right.id);
}

/**
 * 请求上下文构建域服务：历史消息回放（含 token 预算与文件引用富化）。
 */
@Injectable()
export class ChatContextBuilderService {
  constructor(private readonly uploadContext: ChatUploadContextService) {}

  async buildMessageFromParentMessageId(
    options: any,
    chatLogService: ContextChatLogSource,
  ): Promise<ContextBuildResult> {
    const {
      systemMessage = '',
      pureRounds = DEFAULT_HISTORY_CANDIDATE_ROUNDS,
      toolRounds = DEFAULT_TOOL_HISTORY_CANDIDATE_ROUNDS,
      user,
      multimodalTypes = [],
      groupId,
      currentUserLogId,
    } = options;
    const normalizedGroupId = Number(groupId);
    if (!Number.isInteger(normalizedGroupId) || normalizedGroupId <= 0) {
      throw new BadRequestException('上下文必须归属明确会话');
    }
    const hasExplicitCurrentUserLogId = currentUserLogId !== undefined;
    if (
      hasExplicitCurrentUserLogId &&
      (typeof currentUserLogId !== 'number' ||
        !Number.isSafeInteger(currentUserLogId) ||
        currentUserLogId <= 0)
    ) {
      throw new BadRequestException('当前用户请求边界无效');
    }
    const explicitCurrentUserLogId = hasExplicitCurrentUserLogId ? currentUserLogId : 0;

    const messages: ContextMessage[] = [];
    let sourceRevision = 0;
    if (user && typeof chatLogService.beginContextProjection === 'function') {
      sourceRevision = await chatLogService.beginContextProjection(user, normalizedGroupId);
    }

    // 1. 收集轮次
    let rounds: RoundInfo[] = [];
    let sourceStartLogId = 0;
    if (user) {
      try {
        const [collectedRounds, firstVisibleLogId] = await Promise.all([
          chatLogService.collectRoundsForGroup(
            user,
            normalizedGroupId,
            pureRounds,
            toolRounds,
            explicitCurrentUserLogId || undefined,
          ),
          typeof chatLogService.findFirstVisibleContextLogId === 'function'
            ? chatLogService.findFirstVisibleContextLogId(user, normalizedGroupId)
            : Promise.resolve(null),
        ]);
        if (
          explicitCurrentUserLogId > 0 &&
          collectedRounds.some(
            round => Math.floor(Number(round?.id) || 0) > explicitCurrentUserLogId,
          )
        ) {
          throw new Error('上下文历史越过当前用户请求边界');
        }
        rounds = collectedRounds;
        sourceStartLogId = Math.max(0, Math.floor(Number(firstVisibleLogId) || 0));
      } catch (error) {
        Logger.error('获取聊天历史记录失败', error?.stack, 'ChatContextBuilderService');
        throw error;
      }
    }

    // 2. 记录边界。实际上下文预算统一交给 Agent Context Pipeline 处理。
    const sortedRounds = [...rounds].sort(compareContextRecords);
    const boundaryTimestamp = sortedRounds[0]?.createdAt?.getTime() || 0;

    // 3. 汇集历史消息与工具轮次
    const sortedHistory = sortedRounds.map(r => ({
      id: r.id,
      role: r.role,
      content: r.content,
      message: r.message,
      createdAt: r.createdAt,
      hasToolCalls: r.hasToolCalls,
      includeToolCalls: (r as any).includeToolCalls,
    }));
    const normalizedCurrentUserLogId = (() => {
      if (explicitCurrentUserLogId > 0) return explicitCurrentUserLogId;
      return [...sortedRounds].reverse().find(round => round.role === 'user')?.id || 0;
    })();

    const userMessages: HistoricalUserMessage[] = [];
    const assistantMessages: HistoricalAssistantMessage[] = [];
    const requestScopedUploadFileRefs = new FileRefMappingStore();

    for (const record of sortedHistory) {
      try {
        let content = record.content || '';

        if (record.role === 'assistant') {
          // 解析 rounds 中的工具调用信息。空正文不代表没有工具事实，必须先看 rounds。
          let rounds: any[] = [];
          let assistantMessageMalformed = false;

          if (record.message) {
            try {
              const messageObj = JSON.parse(record.message);
              const normalizedMessage = normalizeHistoricalAssistantMessage(messageObj);
              rounds = normalizedMessage.rounds;
              assistantMessageMalformed = normalizedMessage.malformed;
            } catch (e) {
              assistantMessageMalformed = true;
              Logger.warn('历史助手消息格式无效，已保留明确中断语义', 'ChatContextBuilderService');
            }
          }

          // 为每个 round 单独构建消息
          const includeToolCalls = record.includeToolCalls !== false;
          let appendedAssistantRecord = false;
          for (const rawRound of rounds) {
            const normalizedRound = normalizeHistoricalAssistantRound(rawRound);
            const round = normalizedRound.value;
            const roundText = normalizedRound.text;
            if (normalizedRound.malformed) {
              assistantMessages.push({
                id: record.id,
                role: 'assistant',
                content: [roundText, INTERRUPTED_HISTORICAL_ASSISTANT_CONTENT]
                  .filter(Boolean)
                  .join('\n'),
                createdAt: record.createdAt,
                toolCalls: undefined,
                toolResults: undefined,
                thinking: null,
              });
              appendedAssistantRecord = true;
              continue;
            }
            // 只有 collectRounds 标记保留工具时才构建工具消息
            const hasToolCalls = includeToolCalls && normalizedRound.toolCalls.length > 0;

            if (hasToolCalls) {
              // 这个 round 包含工具调用，构建 assistant + tool 消息
              const toolCallsFromRound: any[] = [];
              const toolResultsFromRound: any[] = [];
              let incompleteToolSequence = false;

              for (const toolCall of normalizedRound.toolCalls) {
                if (!toolCall || typeof toolCall !== 'object' || Array.isArray(toolCall)) {
                  incompleteToolSequence = true;
                  continue;
                }
                // 构建工具调用消息
                const toolName = this.uploadContext.resolveApiToolName(toolCall);
                if (
                  ['loading', 'success', 'error'].includes(toolCall?.status) &&
                  typeof toolCall?.id === 'string' &&
                  toolCall.id.trim() &&
                  typeof toolName === 'string' &&
                  toolName.trim()
                ) {
                  toolCallsFromRound.push({
                    id: toolCall.id,
                    type: 'function',
                    function: {
                      name: toolName,
                      arguments:
                        typeof toolCall.arguments === 'string'
                          ? toolCall.arguments
                          : JSON.stringify(toolCall.arguments || {}),
                    },
                  });
                } else {
                  incompleteToolSequence = true;
                }
              }

              // 只为已加入 toolCallsFromRound 的调用构建对应的 tool 结果消息，确保一一对应
              const validCallIds = new Set(toolCallsFromRound.map(tc => tc.id));
              for (const toolCall of normalizedRound.toolCalls) {
                if (!toolCall || typeof toolCall !== 'object' || Array.isArray(toolCall)) continue;
                if (!validCallIds.has(toolCall.id)) continue;

                const toolResultContent = getHistoricalToolModelContent(toolCall);

                toolResultsFromRound.push({
                  tool_call_id: toolCall.id,
                  role: 'tool',
                  content: toolResultContent,
                });
              }

              // 容错：如果 toolCalls 和 toolResults 数量不匹配，降级为纯文本消息
              if (
                toolCallsFromRound.length === 0 ||
                toolCallsFromRound.length !== toolResultsFromRound.length
              ) {
                Logger.warn(
                  `[ChatService] Round 工具序列不完整 | calls: ${toolCallsFromRound.length} | results: ${toolResultsFromRound.length}，降级为文本消息`,
                  'ChatService',
                );
                assistantMessages.push({
                  id: record.id,
                  role: 'assistant',
                  content: [roundText, INTERRUPTED_HISTORICAL_ASSISTANT_CONTENT]
                    .filter(Boolean)
                    .join('\n'),
                  createdAt: record.createdAt,
                  toolCalls: undefined,
                  toolResults: undefined,
                  thinking: round.thinking || null,
                });
                appendedAssistantRecord = true;
              } else {
                Logger.debug(
                  `[ChatService] Round 有 toolCalls: ${toolCallsFromRound.length} | toolResults: ${toolResultsFromRound.length}`,
                  'ChatService',
                );

                // 添加到 assistantMessages，标记为有工具调用
                assistantMessages.push({
                  id: record.id,
                  role: 'assistant',
                  content: roundText,
                  createdAt: record.createdAt,
                  toolCalls: toolCallsFromRound,
                  toolResults: toolResultsFromRound,
                  thinking: round.thinking || null,
                });
                appendedAssistantRecord = true;
                if (incompleteToolSequence) {
                  assistantMessages.push({
                    id: record.id,
                    role: 'assistant',
                    content: INTERRUPTED_HISTORICAL_ASSISTANT_CONTENT,
                    createdAt: record.createdAt,
                    toolCalls: undefined,
                    toolResults: undefined,
                    thinking: null,
                  });
                }
              }
            } else if (roundText) {
              // 这个 round 只有文本，没有工具调用
              assistantMessages.push({
                id: record.id,
                role: 'assistant',
                content: roundText,
                createdAt: record.createdAt,
                toolCalls: undefined,
                toolResults: undefined,
                thinking: round.thinking || null,
              });
              appendedAssistantRecord = true;
            } else {
              assistantMessages.push({
                id: record.id,
                role: 'assistant',
                content: INTERRUPTED_HISTORICAL_ASSISTANT_CONTENT,
                createdAt: record.createdAt,
                toolCalls: undefined,
                toolResults: undefined,
                thinking: null,
              });
              appendedAssistantRecord = true;
            }
          }
          if (!appendedAssistantRecord) {
            const usableContent =
              typeof content === 'string' && content.trim() && !assistantMessageMalformed
                ? content
                : [content, INTERRUPTED_HISTORICAL_ASSISTANT_CONTENT].filter(Boolean).join('\n');
            assistantMessages.push({
              id: record.id,
              role: 'assistant',
              content: usableContent || INTERRUPTED_HISTORICAL_ASSISTANT_CONTENT,
              createdAt: record.createdAt,
              toolCalls: undefined,
              toolResults: undefined,
              thinking: null,
            });
          }
        } else if (record.role === 'user') {
          // 解析用户消息的 rounds（处理 user_upload 等工具调用）
          let userContent = content;
          const multimodalParts: any[] = []; // 支持多模态时构建的内容
          const uploadResources: Array<{
            label: string;
            name?: string;
            url?: string;
            privateFile?: boolean;
            fileRef?: string;
          }> = [];

          if (record.message) {
            try {
              const messageObj = JSON.parse(record.message);
              this.uploadContext.enrichUserUploadFileRefMappings(messageObj);
              if (
                messageObj.rounds &&
                Array.isArray(messageObj.rounds) &&
                messageObj.rounds.length > 0
              ) {
                const firstRound = messageObj.rounds[0];

                // 检查是否有 user_upload toolCall
                if (firstRound.toolCalls && firstRound.toolCalls.length > 0) {
                  const userUploadCall = firstRound.toolCalls.find(
                    (tc: any) => tc.name === 'user_upload' || tc.id?.startsWith('user_upload'),
                  );
                  const userUploadFileRefMapping = userUploadCall?.internal?.fileRefs
                    ? new FileRefMappingStore(userUploadCall.internal.fileRefs).snapshot()
                    : undefined;
                  const userUploadFileRefStore = userUploadFileRefMapping
                    ? new FileRefMappingStore(userUploadFileRefMapping)
                    : undefined;

                  const output = userUploadCall?.output;
                  if (output) {
                    const supportedMultimodalTypes = new Set(
                      Array.isArray(multimodalTypes) ? multimodalTypes : [],
                    );
                    const multimodalSupport = {
                      image: supportedMultimodalTypes.has('image_url'),
                      video: supportedMultimodalTypes.has('video_url'),
                      audio: supportedMultimodalTypes.has('audio_url'),
                      document: supportedMultimodalTypes.has('document'),
                    };

                    const seenUploadItems = new Set<string>();
                    const appendUploadItems = async (value: any, forcedType?: UploadMediaType) => {
                      const items = this.uploadContext.normalizeUploadItems(value);
                      for (const item of items) {
                        const key = this.uploadContext.getUploadItemKey(item);
                        if (key && seenUploadItems.has(key)) continue;
                        if (key) seenUploadItems.add(key);

                        const url = this.uploadContext.getUploadUrl(item);
                        const fileId = this.uploadContext.getUploadFileId(item);
                        if (!url && !fileId) continue;

                        const itemType = forcedType || this.uploadContext.getUploadMediaType(item);
                        const fileRefEntry =
                          fileId && userUploadFileRefStore
                            ? userUploadFileRefStore.findByFileId(fileId)
                            : undefined;
                        const requestFileRefEntry =
                          this.uploadContext.registerRequestScopedUploadFileRef(
                            requestScopedUploadFileRefs,
                            item,
                            itemType,
                            fileRefEntry,
                            userUploadCall,
                          );
                        const labelPrefix =
                          itemType === 'image'
                            ? '图片'
                            : itemType === 'video'
                              ? '视频'
                              : itemType === 'audio'
                                ? '音频'
                                : itemType === 'document'
                                  ? '文档'
                                  : '文件';
                        const modelInput = this.uploadContext.buildUploadItemForModel(
                          item,
                          itemType,
                          url,
                          requestFileRefEntry?.fileRef,
                          multimodalSupport,
                        );

                        uploadResources.push({
                          label: `${labelPrefix} ${uploadResources.length + 1}`,
                          name: this.uploadContext.getUploadName(item),
                          url: modelInput.isFileAssetSource ? undefined : url,
                          privateFile: modelInput.isFileAssetSource,
                          fileRef: requestFileRefEntry?.fileRef,
                        });

                        if (modelInput.part) multimodalParts.push(modelInput.part);
                      }
                    };

                    await appendUploadItems(output.files);
                    await appendUploadItems(output.fileAssets);
                    await appendUploadItems(output.attachments);

                    // 构建最终内容
                    const resourceText = this.uploadContext.buildUploadResourceText(
                      uploadResources,
                      content || '',
                    );
                    if (multimodalParts.length > 0) {
                      multimodalParts.unshift({
                        type: 'text',
                        text: this.uploadContext.appendUploadResourceText(
                          content || '',
                          resourceText,
                        ),
                      });
                      userContent = multimodalParts as any;

                      Logger.debug(
                        `[ChatService] 用户消息转换为多模态 | 图片: ${
                          multimodalParts.filter(
                            p => p.type === 'image_url' || p.type === 'image_file',
                          ).length
                        } | 视频: ${
                          multimodalParts.filter(
                            p => p.type === 'video_url' || p.type === 'video_file',
                          ).length
                        } | 音频: ${
                          multimodalParts.filter(
                            p => p.type === 'input_audio' || p.type === 'audio_file',
                          ).length
                        } | 文档: ${
                          multimodalParts.filter(p => p.type === 'document_file').length
                        }`,
                        'ChatService',
                      );
                    } else if (resourceText) {
                      userContent = this.uploadContext.appendUploadResourceText(
                        content || '',
                        resourceText,
                      );
                      Logger.debug(
                        `[ChatService] 用户消息拼接URL | 数量: ${uploadResources.length}`,
                        'ChatService',
                      );
                    }
                  }
                }
              }
            } catch (e) {
              Logger.debug(`解析用户消息 rounds 失败: ${e?.message || e}`, 'ChatService');
            }
          }

          userMessages.push({
            id: record.id,
            role: 'user',
            content:
              typeof userContent === 'string'
                ? userContent || EMPTY_HISTORICAL_USER_CONTENT
                : userContent,
            createdAt: record.createdAt,
          });
        }
      } catch (error) {
        Logger.debug(`历史消息处理失败: ${error?.message || error}`, 'ChatService');
      }
    }

    if (systemMessage) {
      messages.push({ role: 'system', content: systemMessage });
    }

    userMessages.sort(compareContextRecords);
    assistantMessages.sort(compareContextRecords);

    // 合并所有消息并按时间排序
    // 注意：assistantMessages 可能包含多条来自同一个记录的消息
    const allMessages = [
      ...userMessages.map(m => ({ ...m, _source: 'user' as const })),
      ...assistantMessages.map(m => ({ ...m, _source: 'assistant' as const })),
    ].sort(compareContextRecords);

    Logger.debug(
      `[ChatService] 构建 | user: ${userMessages.length}, assistant: ${assistantMessages.length}`,
      'ChatService',
    );

    // 依次添加消息
    for (const msg of allMessages) {
      if (msg._source === 'user') {
        messages.push({
          role: 'user',
          content: msg.content,
          createdAt: msg.createdAt,
          __agent_context: {
            chatLogId: msg.id,
            required: msg.id === normalizedCurrentUserLogId,
          },
        });
      } else {
        // assistant 消息
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          // 1. 先添加 assistant 消息（包含 tool_calls）
          const assistantMsg: any = {
            role: 'assistant',
            content: msg.content || '',
            tool_calls: msg.toolCalls,
            createdAt: msg.createdAt,
            __agent_context: { chatLogId: msg.id },
          };
          if (msg.thinking) {
            assistantMsg.reasoning_content = msg.thinking;
          }
          messages.push(assistantMsg);

          // 2. 添加工具结果消息
          if (msg.toolResults && msg.toolResults.length > 0) {
            for (const toolResult of msg.toolResults) {
              const toolMsg = {
                role: 'tool',
                tool_call_id: toolResult.tool_call_id,
                content: toolResult.content,
                __agent_context: { chatLogId: msg.id },
              };
              messages.push(toolMsg);
            }
          }
        } else {
          // 没有工具调用，正常添加 assistant 消息
          const assistantMsg: any = {
            role: 'assistant',
            content: msg.content,
            createdAt: msg.createdAt,
            __agent_context: { chatLogId: msg.id },
          };
          if (msg.thinking) {
            assistantMsg.reasoning_content = msg.thinking;
          }
          messages.push(assistantMsg);
        }
      }
    }

    Logger.debug(`[ChatService] 构建完成 | messages: ${messages.length}条`, 'ChatService');

    const modelMessages = messages.map(message => {
      const { createdAt, ...rest } = message;
      return rest;
    });
    if (normalizedCurrentUserLogId > 0) {
      const requiredUserMessages = modelMessages.filter(
        message => message.role === 'user' && (message as any).__agent_context?.required === true,
      );
      const currentUserIndex = modelMessages.findIndex(
        message =>
          message.role === 'user' &&
          Number((message as any).__agent_context?.chatLogId || 0) === normalizedCurrentUserLogId &&
          (message as any).__agent_context?.required === true,
      );
      const hasLaterHistoricalUser = modelMessages
        .slice(currentUserIndex + 1)
        .some(message => message.role === 'user');
      if (requiredUserMessages.length !== 1 || currentUserIndex < 0 || hasLaterHistoricalUser) {
        throw new Error('当前用户请求未出现在上下文历史中');
      }
    }
    const fileRefMapping = this.uploadContext.mergeFileRefMappings(
      requestScopedUploadFileRefs.snapshot(),
      this.uploadContext.buildFileRefMappingFromMessages(
        sortedHistory.map(record => record.message),
        {
          includeUserUploads: false,
        },
      ),
    );
    const candidateSourceStartLogId = rounds.reduce((oldest, round) => {
      const id = Math.max(0, Math.floor(Number(round.id) || 0));
      if (!id) return oldest;
      return oldest ? Math.min(oldest, id) : id;
    }, 0);

    return {
      messages: modelMessages,
      contextBoundary: {
        timestamp: boundaryTimestamp,
        groupId: normalizedGroupId,
        currentUserLogId: normalizedCurrentUserLogId,
        sourceRevision,
        sourceStartLogId: sourceStartLogId || candidateSourceStartLogId,
        candidateLogIds: [...new Set(sortedRounds.map(round => round.id))],
        pureRoundsCount: sortedRounds.filter(r => !r.hasToolCalls).length,
        toolRoundsCount: sortedRounds.filter(r => r.hasToolCalls).length,
      },
      fileRefMapping,
      ...(user && typeof chatLogService.collectContextBackfillPage === 'function'
        ? {
            contextBackfill: {
              // 上方三元条件已确认该可选方法存在，TS 在闭包内不保留该收窄
              loadPage: input =>
                chatLogService.collectContextBackfillPage!(user, normalizedGroupId, input),
            },
          }
        : {}),
    };
  }

  /**
   * 访客 IP 维度限流（Redis 计数器，1 小时窗口）
   * 返回 true 表示允许，false 表示超限
   */
}

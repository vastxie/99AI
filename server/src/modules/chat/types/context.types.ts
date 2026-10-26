/**
 * 对话上下文管理相关类型定义（请求组装层）。
 *
 * 层次边界：本文件与 ChatContextBuilderService 负责「把历史消息与上传资源
 * 组装成一次请求的输入」；agent/context/* 负责「Agent 执行期的上下文块
 * 排序与 token 预算」。两层各司其职，不要互相搬运类型。
 */

import type { FileRefMapping } from '../../fileAsset/file-refs';
import type { ModelMessage } from '../../chatLog/types/message.types';

/** 轮次信息 */
export interface RoundInfo {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  message: string;
  createdAt: Date;
  hasToolCalls: boolean;
  toolCalls?: Array<any>;
  toolResults?: Array<any>;
}

/** 上下文边界 */
export interface ContextBoundary {
  /** 常驻上下文最早消息的时间戳 */
  timestamp: number;
  /** 当前上下文所属会话的正整数内部 ID */
  groupId: number;
  /** 当前请求对应的 user chatlog ID；用于持久检查点的不可越界围栏。 */
  currentUserLogId: number;
  /** 历史读取前取得的持久 CAS revision；删除会使旧 revision 失效。 */
  sourceRevision: number;
  /** 当前 owner 在会话中最早仍可见的 chatlog ID。 */
  sourceStartLogId: number;
  /** 本次候选历史中按时间升序出现的 chatlog ID。 */
  candidateLogIds: number[];
  /** 纯对话轮次数 */
  pureRoundsCount: number;
  /** 工具对话轮次数 */
  toolRoundsCount: number;
}

export interface ContextBackfillPage {
  messages: ModelMessage[];
  sourceLogIds: number[];
  nextAfterLogId: number;
  complete: boolean;
}

export interface ContextBackfillSource {
  loadPage(input: {
    afterLogId: number;
    beforeLogId: number;
    limit: number;
  }): Promise<ContextBackfillPage>;
}

/** 上下文构建结果 */
export interface ContextBuildResult {
  messages: any[];
  contextBoundary: ContextBoundary;
  /** 后端内部 fileRef -> fileId 映射，仅供本次 Agent 执行解析使用 */
  fileRefMapping?: FileRefMapping;
  /** 只供 checkpoint coordinator 使用的 owner-bound 有界历史分页器。 */
  contextBackfill?: ContextBackfillSource;
}

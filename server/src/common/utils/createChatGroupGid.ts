import { randomAlphanumeric } from './random-id';

const CHAT_GROUP_GID_LENGTH = 24;

export const CHAT_GROUP_GID_PREFIX = 'g_';

/** 对话组 / workspace 公开 ID 格式，DTO 校验与运行时判定共用 */
export const CHAT_GROUP_GID_PATTERN = /^g_[0-9A-Za-z]{24}$/;

export function createChatGroupGid(prefix = CHAT_GROUP_GID_PREFIX): string {
  return `${prefix}${randomAlphanumeric(CHAT_GROUP_GID_LENGTH)}`;
}

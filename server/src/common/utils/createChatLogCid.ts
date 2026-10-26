import { ALPHANUMERIC_ALPHABET, randomAlphanumeric } from './random-id';

const CHAT_LOG_CID_ALPHABET = `${ALPHANUMERIC_ALPHABET}-_`;
const CHAT_LOG_CID_LENGTH = 24;
const CHAT_LOG_CID_PREFIX = 'c_';
export const CHAT_LOG_CID_PATTERN = /^c_[0-9A-Za-z_-]{16,64}$/;

export function createChatLogCid(length = CHAT_LOG_CID_LENGTH): string {
  return `${CHAT_LOG_CID_PREFIX}${randomAlphanumeric(length, CHAT_LOG_CID_ALPHABET)}`;
}

export function isChatLogCid(value: unknown): value is string {
  return typeof value === 'string' && CHAT_LOG_CID_PATTERN.test(value);
}

import { randomHex } from '@/common/utils/random-id';

/** 账户流水随机 uid：9 位小写十六进制 */
export function createRandomUid(): string {
  return randomHex(9);
}

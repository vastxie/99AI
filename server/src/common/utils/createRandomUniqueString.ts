import { randomHex } from './random-id';

/** 小写十六进制随机串（token / 重置凭据），默认 32 位 */
export function createRandomUniqueString(length: number = 32): string {
  return randomHex(length);
}

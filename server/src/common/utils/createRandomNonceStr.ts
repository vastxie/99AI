import { randomAlphanumeric } from './random-id';

/** 指定长度的 0-9A-Za-z 随机串，用作一次性 nonce / state */
export function createRandomNonceStr(len: number): string {
  return randomAlphanumeric(len);
}

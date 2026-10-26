import { randomBytes, randomInt } from 'crypto';

/** 0-9 A-Z a-z：公开 ID（gid / uid / file_ / stor_ / nonce）共用的字符集 */
export const ALPHANUMERIC_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** 密码学安全随机串：从 alphabet 中等概率抽取 length 个字符（crypto.randomInt） */
export function randomAlphanumeric(length: number, alphabet = ALPHANUMERIC_ALPHABET): string {
  let id = '';
  for (let i = 0; i < length; i += 1) {
    id += alphabet[randomInt(alphabet.length)];
  }
  return id;
}

/** 密码学安全的小写十六进制随机串（crypto.randomBytes），奇数长度取前 length 位 */
export function randomHex(length: number): string {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

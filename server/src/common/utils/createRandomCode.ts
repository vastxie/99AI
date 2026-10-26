import { randomInt } from 'crypto';

/**
 * 生成 6 位数字验证码。
 * 使用密码学安全随机源（crypto.randomInt），替代可预测的 Math.random。
 */
export function createRandomCode(): number {
  return randomInt(100000, 1000000); // [100000, 999999]
}

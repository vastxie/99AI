import { Logger } from '@nestjs/common';
import { RedisClientType } from 'redis';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const REDIS_KEY = 'WEIXIN_BOT_CRYPTO_KEY';

let cachedKey: Buffer | null = null;

/**
 * 从 Redis 获取或自动生成加密密钥（与 JWT_SECRET 同一模式）
 */
export async function getOrInitCryptoKey(redisClient: RedisClientType): Promise<Buffer> {
  if (cachedKey) return cachedKey;

  let encoded = await redisClient.get(REDIS_KEY);
  if (encoded === null) {
    const candidate = randomBytes(32).toString('base64');
    const created = await redisClient.set(REDIS_KEY, candidate, { NX: true });
    encoded = created === 'OK' ? candidate : await redisClient.get(REDIS_KEY);
  }

  const key = typeof encoded === 'string' ? Buffer.from(encoded, 'base64') : null;
  if (!key || key.length !== 32 || key.toString('base64') !== encoded) {
    Logger.warn('微信凭据密钥格式无效，已拒绝使用', 'WeixinCrypto');
    throw new Error('微信凭据密钥配置无效，请管理员检查。');
  }
  cachedKey = key;
  return key;
}

/**
 * 清除缓存的密钥（测试用）
 */
export function clearKeyCache(): void {
  cachedKey = null;
}

export class WeixinCrypto {
  /**
   * 加密文本
   * 格式: base64(iv + authTag + ciphertext)
   */
  static async encrypt(plaintext: string, redisClient: RedisClientType): Promise<string> {
    try {
      const key = await getOrInitCryptoKey(redisClient);
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return Buffer.concat([iv, authTag, encrypted]).toString('base64');
    } catch {
      Logger.error('微信凭据加密失败', 'WeixinCrypto');
      throw new Error('微信凭据加密失败，请管理员检查。');
    }
  }

  /**
   * 解密文本
   */
  static async decrypt(encryptedBase64: string, redisClient: RedisClientType): Promise<string> {
    try {
      const key = await getOrInitCryptoKey(redisClient);
      const data = Buffer.from(encryptedBase64, 'base64');
      const iv = data.subarray(0, IV_LENGTH);
      const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
      const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
      const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
      decipher.setAuthTag(authTag);
      return decipher.update(ciphertext, undefined, 'utf-8') + decipher.final('utf-8');
    } catch {
      Logger.error('微信凭据解密失败', 'WeixinCrypto');
      throw new Error('微信凭据解密失败，请管理员检查。');
    }
  }
}

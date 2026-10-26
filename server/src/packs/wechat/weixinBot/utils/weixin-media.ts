import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import axios from 'axios';
import { Logger } from '@nestjs/common';
import { safeDownloadToBuffer } from '@/common/utils/safe-download.util';

const CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c';
const UPLOAD_MAX_RETRIES = 3;
const DOWNLOAD_MAX_BYTES = 100 * 1024 * 1024;

/* ---- AES-128-ECB 加解密 ---- */

/** AES-128-ECB 加密（PKCS7 padding） */
export function encryptAesEcb(plaintext: Buffer, key: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, null);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

/** AES-128-ECB 解密（PKCS7 padding） */
export function decryptAesEcb(ciphertext: Buffer, key: Buffer): Buffer {
  const decipher = createDecipheriv('aes-128-ecb', key, null);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** 计算 AES-128-ECB 密文大小（PKCS7 填充到 16 字节边界） */
export function aesEcbPaddedSize(plaintextSize: number): number {
  return Math.ceil((plaintextSize + 1) / 16) * 16;
}

/* ---- AES Key 解析（兼容两种编码） ---- */

/**
 * 解析 CDNMedia.aes_key 为 16 字节 AES 密钥
 *
 * 两种编码：
 *   - base64(raw 16 bytes)          → 图片
 *   - base64(hex string of 16 bytes) → 文件/语音/视频
 */
export function parseAesKey(aesKeyBase64: string): Buffer {
  const decoded = Buffer.from(aesKeyBase64, 'base64');
  if (decoded.length === 16) {
    return decoded;
  }
  if (decoded.length === 32 && /^[0-9a-fA-F]{32}$/.test(decoded.toString('ascii'))) {
    return Buffer.from(decoded.toString('ascii'), 'hex');
  }
  throw new Error(`aes_key 必须解码为 16 字节或 32 字符 hex 字符串，实际 ${decoded.length} 字节`);
}

/* ---- CDN 下载 ---- */

/** 构建 CDN 下载 URL */
export function buildCdnDownloadUrl(encryptedQueryParam: string): string {
  return `${CDN_BASE_URL}/download?encrypted_query_param=${encodeURIComponent(
    encryptedQueryParam,
  )}`;
}

/**
 * 从微信 CDN 下载并解密媒体文件
 */
export async function downloadAndDecryptMedia(
  encryptedQueryParam: string,
  aesKeyBase64: string,
  fullUrl?: string,
): Promise<Buffer> {
  const key = parseAesKey(aesKeyBase64);
  const url = fullUrl?.trim() || buildCdnDownloadUrl(encryptedQueryParam);

  const res = await safeDownloadToBuffer(url, {
    blockPrivateNetwork: true,
    maxBytes: DOWNLOAD_MAX_BYTES,
    timeoutMs: 30000,
  });

  const encrypted = res.buffer;
  const decrypted = decryptAesEcb(encrypted, key);
  return decrypted;
}

/* ---- CDN 上传 ---- */

export interface UploadedMediaInfo {
  /** CDN 下载加密参数，填入 image_item.media.encrypt_query_param */
  downloadEncryptedQueryParam: string;
  /** AES-128-ECB key，hex 编码；构建 CDNMedia.aes_key 时需转 base64 */
  aeskeyHex: string;
  /** 明文文件大小 */
  fileSize: number;
  /** 密文文件大小 */
  fileSizeCiphertext: number;
}

/** 媒体类型常量（与腾讯参考实现一致） */
export const MediaType = {
  IMAGE: 1,
  VIDEO: 2,
  FILE: 3,
  VOICE: 4,
} as const;

/**
 * 上传媒体文件到微信 CDN
 *
 * 流程：生成密钥 → getUploadUrl → AES加密 → POST到CDN → 获取下载参数
 */
export async function uploadMediaToCdn(params: {
  fileBuffer: Buffer;
  filekey?: string;
  toUserId: string;
  mediaType?: number;
  apiClient: { getUploadUrl(body: string): Promise<any> };
}): Promise<UploadedMediaInfo> {
  const { fileBuffer, toUserId, apiClient } = params;
  const mediaType = params.mediaType || MediaType.IMAGE;

  const plaintext = fileBuffer;
  const rawsize = plaintext.length;
  const { createHash } = await import('crypto');
  const rawfilemd5 = createHash('md5').update(plaintext).digest('hex');
  const filesize = aesEcbPaddedSize(rawsize);
  const filekey = params.filekey || randomBytes(16).toString('hex');
  const aeskey = randomBytes(16);

  // 调用 getUploadUrl
  const uploadUrlResp = await apiClient.getUploadUrl(
    JSON.stringify({
      filekey,
      media_type: mediaType,
      to_user_id: toUserId,
      rawsize,
      rawfilemd5,
      filesize,
      no_need_thumb: true,
      aeskey: aeskey.toString('hex'),
      base_info: { channel_version: '2.2.0' },
    }),
  );

  const uploadFullUrl = uploadUrlResp.upload_full_url?.trim();
  const uploadParam = uploadUrlResp.upload_param;

  if (!uploadFullUrl && !uploadParam) {
    throw new Error('getUploadUrl 未返回上传 URL');
  }

  // 加密文件
  const ciphertext = encryptAesEcb(plaintext, aeskey);

  // 上传到 CDN
  const cdnUrl =
    uploadFullUrl ||
    `${CDN_BASE_URL}/upload?encrypted_query_param=${encodeURIComponent(
      uploadParam,
    )}&filekey=${encodeURIComponent(filekey)}`;

  let downloadParam: string | undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= UPLOAD_MAX_RETRIES; attempt++) {
    try {
      const res = await axios.post(cdnUrl, ciphertext, {
        headers: { 'Content-Type': 'application/octet-stream' },
        timeout: 60000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      if (res.status >= 400 && res.status < 500) {
        const errMsg = res.headers['x-error-message'] || `status ${res.status}`;
        throw new Error(`CDN 上传客户端错误 ${res.status}: ${errMsg}`);
      }
      if (res.status !== 200) {
        const errMsg = res.headers['x-error-message'] || `status ${res.status}`;
        throw new Error(`CDN 上传服务端错误: ${errMsg}`);
      }

      downloadParam = res.headers['x-encrypted-param'];
      if (!downloadParam) {
        throw new Error('CDN 响应缺少 x-encrypted-param header');
      }
      break;
    } catch (err: any) {
      lastError = err;
      if (err?.message?.includes('客户端错误')) throw err;
      if (attempt < UPLOAD_MAX_RETRIES) {
        Logger.warn(`CDN 上传第 ${attempt} 次失败，重试...`);
      }
    }
  }

  if (!downloadParam) {
    throw lastError instanceof Error
      ? lastError
      : new Error(`CDN 上传 ${UPLOAD_MAX_RETRIES} 次均失败`);
  }

  return {
    downloadEncryptedQueryParam: downloadParam,
    aeskeyHex: aeskey.toString('hex'),
    fileSize: rawsize,
    fileSizeCiphertext: filesize,
  };
}

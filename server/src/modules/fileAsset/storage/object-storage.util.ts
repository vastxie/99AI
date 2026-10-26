import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Readable } from 'stream';

/** 对象存储包共用的小工具：内容哈希、SDK 响应体转流、必填配置校验 */
export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function toReadable(body: any): Readable {
  if (body instanceof Readable) return body;
  if (body?.transformToWebStream) return Readable.fromWeb(body.transformToWebStream());
  if (body instanceof Uint8Array || Buffer.isBuffer(body)) return Readable.from(Buffer.from(body));
  return Readable.from(body || []);
}

/** 站点配置缺少必填项时直接拒绝，避免半配置状态下的静默失败 */
export function assertRequiredStorageConfig(configs: Record<string, any>, keys: string[]): void {
  const missing = keys.filter(key => !String(configs?.[key] || '').trim());
  if (missing.length > 0) {
    throw new BadRequestException('私有文件存储配置不完整。');
  }
}

/** 地域只校验字符集（小写字母、数字、短横线），不套固定列表；桶名规则各家不同，由各存储包自己校验 */
const REGION_PATTERN = /^[a-z0-9-]+$/;

export function assertStorageRegion(region: string): string {
  const value = String(region ?? '').trim();
  if (!REGION_PATTERN.test(value)) {
    throw new BadRequestException('存储地域不合法：只能包含小写字母、数字和短横线。');
  }
  return value;
}

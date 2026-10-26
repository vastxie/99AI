import { createRandomCode } from '@/common/utils';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID, timingSafeEqual } from 'crypto';
import { RedisCacheService } from '../../redisCache/redisCache.service';
import type { CaptchaScene } from '../providers/login-provider.types';
import {
  DISCARD_CODE_SCRIPT,
  ISSUE_CODE_SCRIPT,
  VERIFY_CODE_SCRIPT,
} from './verification-code.scripts';

/** 验证码 10 分钟有效；60 秒内不重复发送；连续错 5 次作废。 */
export const CODE_TTL_SECONDS = 10 * 60;
export const RESEND_INTERVAL_SECONDS = 60;
export const MAX_FAILED_ATTEMPTS = 5;

export interface IssuedVerificationCode {
  code: string;
  requestId: string;
}

function safeCodeCompare(a: unknown, b: string): boolean {
  if (typeof a !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

@Injectable()
export class VerificationCodeService {
  constructor(
    private readonly redisCacheService: RedisCacheService,
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  /** 一次原子认领同时保存码、重发间隔和错误计数，发送方必须保留本次 requestId。 */
  async issue(scene: CaptchaScene, contact: string): Promise<IssuedVerificationCode> {
    const receipt = { code: String(createRandomCode()), requestId: randomUUID() };
    const remaining = await this.redisCacheService.runAtomicScript(
      ISSUE_CODE_SCRIPT,
      await this.keys(scene, contact),
      [
        JSON.stringify(receipt),
        receipt.requestId,
        String(CODE_TTL_SECONDS),
        String(RESEND_INTERVAL_SECONDS),
      ],
    );
    if (remaining !== 0) {
      throw new HttpException(`${remaining}秒内不得重复发送验证码！`, HttpStatus.BAD_REQUEST);
    }
    return receipt;
  }

  /** 失败发送只能撤销本次认领，晚到的失败不能删除用户后来申请的码。 */
  async discard(scene: CaptchaScene, contact: string, requestId: string): Promise<void> {
    await this.redisCacheService.runAtomicScript(
      DISCARD_CODE_SCRIPT,
      await this.keys(scene, contact),
      [requestId],
    );
  }

  async verify(scene: CaptchaScene, contact: string, code: string): Promise<void> {
    const value = String(code || '').trim();
    if (!value) throw new HttpException('请输入验证码', HttpStatus.BAD_REQUEST);
    const keys = await this.keys(scene, contact);
    const saved = await this.redisCacheService.get({ key: keys[0] });
    if (!saved) throw this.expired();
    let receipt: IssuedVerificationCode;
    try {
      receipt = JSON.parse(saved);
    } catch {
      throw this.expired();
    }
    const failed = await this.redisCacheService.runAtomicScript(VERIFY_CODE_SCRIPT, keys, [
      saved,
      safeCodeCompare(receipt?.code, value) ? '1' : '0',
      String(CODE_TTL_SECONDS),
      String(MAX_FAILED_ATTEMPTS),
    ]);
    if (failed === -1) throw this.expired();
    if (failed >= MAX_FAILED_ATTEMPTS) {
      throw new HttpException('验证码错误次数过多，请重新获取', HttpStatus.BAD_REQUEST);
    }
    if (failed > 0) {
      throw new HttpException(
        `验证码错误，还可尝试${MAX_FAILED_ATTEMPTS - failed}次`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private expired(): HttpException {
    return new HttpException('验证码不存在或已过期，请重新获取', HttpStatus.BAD_REQUEST);
  }

  private async keys(scene: CaptchaScene, contact: string): Promise<string[]> {
    const namespace = await this.globalConfigService.getNamespace();
    const key = `${namespace}:authCode:${scene}:${contact}`;
    return [key, `${key}:sent`, `${key}:fail`];
  }
}

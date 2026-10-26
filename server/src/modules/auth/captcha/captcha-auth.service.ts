import { createRandomUniqueString } from '@/common/utils';
import { rethrowAsSafeException } from '@/common/utils/error-stack.util';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { RedisCacheService } from '../../redisCache/redisCache.service';
import type { UserEntity } from '../../user/user.entity';
import { UserService } from '../../user/user.service';
import {
  AuthIdentityService,
  CONTACT_CONFLICT_MESSAGE,
  CONTACT_DISABLED_MESSAGE,
} from '../identity/auth-identity.service';
import { LoginProviderRegistry } from '../providers/login-provider.registry';
import type { CaptchaLoginAdapter, CaptchaScene } from '../providers/login-provider.types';
import { AuthTokenService } from '../token/auth-token.service';
import { VerificationCodeService } from './verification-code.service';

const RESET_TOKEN_PREFIX = 'resetPasswordToken';
const RESET_TOKEN_TTL_SECONDS = 10 * 60;
/** 同一 IP 每小时最多申请的验证码次数（登录 / 找回密码） */
const CAPTCHA_SEND_PER_IP_PER_HOUR = 20;
/** 绑定发码按认证账号跨联系方式计数，防止更换邮箱 / 手机号绕过重发冷却。 */
const CAPTCHA_BIND_SEND_PER_USER_PER_HOUR = 20;

const SCENE_ACTION_TEXT: Record<CaptchaScene, string> = {
  login: '登录',
  bind: '绑定',
  reset: '密码重置',
};

/**
 * 数据库步骤失败时换成的静态异常（原始错误只记安全摘要，见 guarded）。
 * 验证码已经用掉时提示重新获取；受控 5xx 让全局异常过滤器保留这条文案
 */
const retryWithNewCode = () =>
  Object.assign(
    new HttpException('操作失败，请稍后重新获取验证码再试', HttpStatus.INTERNAL_SERVER_ERROR),
    { controlled: true },
  );
const operationFailed = () =>
  Object.assign(new HttpException('操作失败，请稍后重试', HttpStatus.INTERNAL_SERVER_ERROR), {
    controlled: true,
  });
const bindFailed = () => new HttpException('绑定失败，请稍后重试', HttpStatus.BAD_REQUEST);

/**
 * 验证码类登录的通用流程（内核）：发码 / 登录并自动注册 / 绑定到当前账号 / 找回密码。
 * 联系方式属于哪个渠道、怎么把码发出去，由注册表里的验证码适配器（邮箱包、手机包……）决定。
 */
@Injectable()
export class CaptchaAuthService {
  constructor(
    private readonly loginProviders: LoginProviderRegistry,
    private readonly codes: VerificationCodeService,
    private readonly userService: UserService,
    private readonly authIdentityService: AuthIdentityService,
    private readonly authTokenService: AuthTokenService,
    private readonly redisCacheService: RedisCacheService,
  ) {}

  /**
   * 登录（首次自动注册）/ 找回密码场景发码；绑定场景由 sendBindCode 处理。
   * 同一 IP 每小时最多发 CAPTCHA_SEND_PER_IP_PER_HOUR 次；找回密码时不暴露联系方式是否已注册。
   */
  async sendCode(contact: string, scene: 'login' | 'reset', clientIp?: string): Promise<string> {
    const { adapter, value } = this.resolveContact(contact);
    return this.guarded(async () => {
      await this.assertSendQuota(clientIp);
      if (scene === 'reset') {
        const ownership = await this.authIdentityService.findContactOwner(adapter, value);
        if (ownership.kind !== 'owner') {
          // 未注册、已停用、归属冲突都与已注册时同样文案但不真正发码，避免用找回密码接口枚举账号
          Logger.warn('找回密码发码已跳过：联系方式没有可用的账号', 'CaptchaAuthService');
          return this.sentMessage(scene);
        }
      }
      return this.issueAndSend(adapter, value, scene);
    }, operationFailed);
  }

  private async assertSendQuota(clientIp?: string): Promise<void> {
    const ip = String(clientIp || '').trim();
    if (!ip) return;
    const count = await this.redisCacheService.incrByWithInitialExpire(
      `auth:captcha:send:ip:${ip}`,
      1,
      60 * 60,
    );
    if (count > CAPTCHA_SEND_PER_IP_PER_HOUR) {
      throw new HttpException('验证码发送过于频繁，请稍后再试。', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private sentMessage(scene: CaptchaScene): string {
    return `验证码发送成功、请填写验证码完成${SCENE_ACTION_TEXT[scene]}！`;
  }

  /** 给当前账号绑定新联系方式前发码：联系方式要能绑到本人（没被别的账号使用、本人没有该渠道的其他身份） */
  async sendBindCode(userId: number, contact: string): Promise<string> {
    const { adapter, value } = this.resolveContact(contact);
    return this.guarded(async () => {
      await this.authIdentityService.assertContactBindable(userId, adapter, value);
      const count = await this.redisCacheService.incrByWithInitialExpire(
        `auth:captcha:send:bind:user:${userId}`,
        1,
        60 * 60,
      );
      if (count > CAPTCHA_BIND_SEND_PER_USER_PER_HOUR) {
        throw new HttpException('验证码发送过于频繁，请稍后再试。', HttpStatus.TOO_MANY_REQUESTS);
      }
      return this.issueAndSend(adapter, value, 'bind');
    }, operationFailed);
  }

  /** 验证码登录：联系方式首次登录时自动创建无密码账号 */
  async login(contact: string, code: string, req: Request): Promise<string> {
    const { adapter, value } = this.resolveContact(contact);
    const token = await this.guarded(async () => {
      await this.codes.verify('login', value, code);
      const user = await this.loginUserByContact(adapter, value);
      return await this.authTokenService.issueLoginToken(user, req);
    }, retryWithNewCode);
    Logger.log('验证码登录成功', 'CaptchaAuthService');
    return token;
  }

  /** 把联系方式绑定到当前账号 */
  async bind(userId: number, contact: string, code: string): Promise<string> {
    const { adapter, value } = this.resolveContact(contact);
    await this.guarded(async () => {
      await this.codes.verify('bind', value, code);
      await this.authIdentityService.bindContactIdentity(userId, adapter, value);
    }, bindFailed);
    return '绑定成功';
  }

  /** 找回密码第一步：验证码换一次性重置凭证 */
  async verifyResetCode(contact: string, code: string) {
    const { adapter, value } = this.resolveContact(contact);
    const resetToken = createRandomUniqueString(48);
    await this.guarded(async () => {
      await this.codes.verify('reset', value, code);
      await this.resetUser(adapter, value);
      await this.redisCacheService.set(
        { key: this.resetTokenKey(resetToken), val: value },
        RESET_TOKEN_TTL_SECONDS,
      );
    }, retryWithNewCode);
    return { success: true, message: '验证成功', resetToken };
  }

  /** 找回密码第二步：凭证一次性消费后改密 */
  async resetPassword(contact: string, resetToken: string, password: string) {
    const { adapter, value } = this.resolveContact(contact);
    await this.guarded(async () => {
      const tokenContact = await this.redisCacheService.getDel({
        key: this.resetTokenKey(resetToken),
      });
      if (!tokenContact || tokenContact !== value) {
        Logger.warn('重置密码凭证验证失败', 'CaptchaAuthService');
        throw new HttpException('重置密码凭证错误或已失效！', HttpStatus.BAD_REQUEST);
      }
      const user = await this.resetUser(adapter, value);
      await this.userService.updateUserPassword(user.id, password);
    }, retryWithNewCode);
    Logger.log('密码重置成功', 'CaptchaAuthService');
    return { success: true, message: '密码重置成功' };
  }

  /**
   * 验证码登录的账号：联系方式有主人就登录（并补录老账号的身份）；没有就自动注册。
   * 注册时被别的请求抢先（并发注册或绑定了同一联系方式）就重新查找主人，最多两次
   */
  private async loginUserByContact(
    adapter: CaptchaLoginAdapter,
    value: string,
  ): Promise<UserEntity> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const ownership = await this.authIdentityService.findContactOwner(adapter, value);
      if (ownership.kind === 'owner') {
        // 账号状态不可登录（锁定、封禁等）时不补录、不签发令牌
        this.authIdentityService.assertUserCanLogin(ownership.user);
        await this.authIdentityService.ensureContactIdentitiesForUser(ownership.user);
        return ownership.user;
      }
      this.assertContactUsable(ownership.kind);
      const created = await this.authIdentityService.registerContactUser(
        adapter.toIdentity(value, 'captcha'),
      );
      if (created) return created;
    }
    throw new HttpException('登录失败，请重新获取验证码再试', HttpStatus.CONFLICT);
  }

  /** 找回密码的账号：联系方式必须有主人 */
  private async resetUser(adapter: CaptchaLoginAdapter, value: string): Promise<UserEntity> {
    const ownership = await this.authIdentityService.findContactOwner(adapter, value);
    if (ownership.kind === 'owner') return ownership.user;
    this.assertContactUsable(ownership.kind);
    throw new HttpException('该联系方式未注册！', HttpStatus.BAD_REQUEST);
  }

  /** 身份已停用、归属冲突时拒绝（冲突交人工处理，不自动判断哪个账号可信） */
  private assertContactUsable(kind: 'none' | 'disabled' | 'conflict') {
    if (kind === 'disabled') {
      throw new HttpException(CONTACT_DISABLED_MESSAGE, HttpStatus.BAD_REQUEST);
    }
    if (kind === 'conflict') {
      Logger.warn('联系方式归属存在冲突，已拒绝', 'CaptchaAuthService');
      throw new HttpException(CONTACT_CONFLICT_MESSAGE, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * 每个公开方法的数据库与 Redis 步骤：业务异常原样抛出；其他错误只记安全摘要（不含消息与调用栈，
   * 原始消息可能带联系方式），换成静态异常抛出，原始错误不再交给拦截器与全局异常过滤器记录
   */
  private async guarded<T>(work: () => Promise<T>, replacement: () => HttpException): Promise<T> {
    try {
      return await work();
    } catch (error) {
      rethrowAsSafeException(error, '验证码流程的数据读写失败', 'CaptchaAuthService', replacement);
    }
  }

  private resolveContact(contact: string): { adapter: CaptchaLoginAdapter; value: string } {
    const adapter = this.loginProviders.captchaForContact(contact);
    if (!adapter) {
      throw new HttpException('请提供有效的联系方式，或使用其他登录方式。', HttpStatus.BAD_REQUEST);
    }
    return { adapter, value: adapter.normalizeContact(contact) };
  }

  private async issueAndSend(adapter: CaptchaLoginAdapter, value: string, scene: CaptchaScene) {
    const receipt = await this.codes.issue(scene, value);
    try {
      await adapter.sendCode(value, receipt.code, scene);
    } catch (error) {
      await this.codes.discard(scene, value, receipt.requestId);
      if (error instanceof HttpException) throw error;
      Logger.error('验证码发送失败', undefined, 'CaptchaAuthService');
      throw new HttpException('验证码发送失败，请稍后重试', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    Logger.log('验证码已发送', 'CaptchaAuthService');
    return this.sentMessage(scene);
  }

  private resetTokenKey(token: string) {
    return `${RESET_TOKEN_PREFIX}:${token}`;
  }
}

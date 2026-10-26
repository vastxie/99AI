import { requireRegisteredUser, requireRequestUser } from '@/common/auth/request-user';
import { AuthConfig } from '@/common/config/auth.config';
import { UserStatusEnum } from '@/common/constants/user.constant';
import { getClientIp, maskContact } from '@/common/utils';
import { createHash } from 'crypto';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { BILLING_PORT, BillingPort } from '../billing/billing.port';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { UserService } from '../user/user.service';
import { UserEntity } from './../user/user.entity';
import { UserLoginDto } from './dto/authLogin.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdatePasswordDto } from './dto/updatePassword.dto';
import { VisitorSessionDto } from './dto/visitorSession.dto';
import { AuthIdentityService } from './identity/auth-identity.service';
import { LoginProviderRegistry } from './providers/login-provider.registry';
import type { AuthProviderListEntry } from './providers/login-provider.types';
import { AuthTokenService } from './token/auth-token.service';

export const PASSWORD_PROVIDER = 'local_password';
/** 同一 IP 每小时最多自助注册的账号数 */
const REGISTER_IP_LIMIT_PER_HOUR = 20;

/**
 * 账号内核：账号密码注册 / 登录、游客会话、登录方式列表、身份列表与解绑、改密。
 * 邮箱 / 手机验证码、第三方授权、扫码等具体登录途径由各渠道包经 LoginProviderRegistry 提供，
 * 对应流程见 CaptchaAuthService / OAuthAuthService / QrAuthService。
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly authTokenService: AuthTokenService,
    private readonly authIdentityService: AuthIdentityService,
    private readonly loginProviders: LoginProviderRegistry,
    @Inject(BILLING_PORT) private readonly billing: BillingPort,
    private readonly redisCacheService: RedisCacheService,
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  /**
   * 账号密码登录：用户名 / 邮箱 / 手机号 + 密码。
   * 同一账号连续失败 maxLoginAttempts 次、或同一 IP 在窗口内失败 maxLoginAttemptsPerIp 次后锁定 lockoutDuration 秒。
   */
  async login(body: UserLoginDto, req: Request): Promise<string> {
    const ip = getClientIp(req);
    const accountKey = this.loginFailureKey('account', body.username);
    const ipKey = ip ? this.loginFailureKey('ip', ip) : null;
    await this.assertLoginNotLocked(accountKey, ipKey);

    let user: UserEntity | null = null;
    try {
      user = await this.userService.verifyUserCredentials(body);
    } catch (error) {
      await this.recordLoginFailure(accountKey, ipKey);
      Logger.warn(`登录失败: 凭证无效 - 账号: ${maskContact(body.username)}`, 'AuthService');
      throw error;
    }
    if (!user) {
      await this.recordLoginFailure(accountKey, ipKey);
      Logger.warn(`登录失败: 凭证无效 - 账号: ${maskContact(body.username)}`, 'AuthService');
      throw new HttpException('登录失败，用户凭证无效。', HttpStatus.UNAUTHORIZED);
    }
    await this.redisCacheService.del({ key: accountKey });
    await this.authIdentityService.ensureContactIdentitiesForUser(user);
    return this.authTokenService.issueLoginToken(user, req);
  }

  /** 账号密码自助注册（后台 passwordRegisterStatus 可关闭）；成功后直接登录 */
  async register(body: RegisterDto, req: Request): Promise<string> {
    if (!(await this.isPasswordRegisterEnabled())) {
      throw new HttpException('当前站点未开放自助注册。', HttpStatus.FORBIDDEN);
    }
    await this.assertRegisterQuota(getClientIp(req));
    if (await this.userService.isUsernameTaken(body.username)) {
      throw new HttpException('该用户名已被使用，请换一个。', HttpStatus.BAD_REQUEST);
    }
    const user = await this.userService.createPasswordUser({
      username: body.username,
      password: body.password,
      nickname: body.nickname?.trim() || body.username,
      status: UserStatusEnum.ACTIVE,
    });
    await this.billing.onUserRegistered(user.id);
    Logger.log(`账号密码注册成功 | 用户ID: ${user.id}`, 'AuthService');
    return this.authTokenService.issueLoginToken(user, req);
  }

  /** 签发游客会话：同一 IP 每小时最多 sessionsPerIpPerHour 个，防止无限制制造游客身份与沙箱 */
  async createVisitorSession(body: VisitorSessionDto, req: Request): Promise<string> {
    const ip = getClientIp(req);
    await this.assertVisitorQuota(ip);
    return this.authTokenService.createVisitorToken({
      deviceId: body?.deviceId,
      ip,
      userAgent: req.headers['user-agent'] || '',
    });
  }

  async getInfo(req: Request) {
    const { id, uid, role } = requireRequestUser(req);
    try {
      const result = await this.userService.getUserInfo(id);
      const identities =
        role === 'visitor' ? [] : await this.authIdentityService.listUserIdentities(Number(id));
      if (result?.userInfo) {
        result.userInfo.uid = uid;
        if (role === 'visitor') {
          result.userInfo.id = uid;
        }
        result.userInfo.identities = identities;
      }
      return result;
    } catch (error) {
      Logger.error(`获取用户信息失败: ${error.message}`, 'AuthService-getInfo');
      throw error;
    }
  }

  /** 登录方式列表：内核只自带账号密码，其余来自注册表里各渠道包的适配器 */
  async listProviders(): Promise<AuthProviderListEntry[]> {
    const password: AuthProviderListEntry = {
      provider: PASSWORD_PROVIDER,
      displayName: '账号密码',
      type: 'password',
      enabled: true,
      registerEnabled: await this.isPasswordRegisterEnabled(),
    };
    const external = (
      await Promise.all(
        this.loginProviders.list().map(async adapter => {
          const entries = await adapter.listEntries();
          // 验证码类方式带上联系方式类型，客户端按类型（而不是按 provider id）选择文案
          return adapter.kind === 'captcha'
            ? entries.map(entry => ({ ...entry, contactField: adapter.contactField }))
            : entries;
        }),
      )
    ).flat();
    return [password, ...external].filter(item => item.enabled);
  }

  listIdentities(req: Request) {
    const { id } = requireRegisteredUser(req);
    return this.authIdentityService.listUserIdentities(id);
  }

  unbindIdentity(req: Request, identityId: number) {
    const { id } = requireRegisteredUser(req);
    return this.authIdentityService.unbindIdentity(id, Number(identityId));
  }

  async updatePassword(req: Request, body: UpdatePasswordDto) {
    const { id } = requireRegisteredUser(req);
    const bool = await this.userService.verifyUserPassword(id, body.oldPassword);
    if (!bool) {
      throw new HttpException('旧密码错误、请检查提交', HttpStatus.BAD_REQUEST);
    }
    await this.userService.updateUserPassword(id, body.password);
    return '密码修改成功';
  }

  /** 对已解析的 HTTP/WS 身份做当前账号状态校验；visitor 由 UserService 保持原语义。 */
  async validateAuthenticatedUser(user: any): Promise<boolean> {
    return await this.userService.checkUserStatus(user);
  }

  /** 未配置时默认开放，后台可随时关闭 */
  private async isPasswordRegisterEnabled(): Promise<boolean> {
    const value = await this.globalConfigService.getConfigs(['passwordRegisterStatus']);
    if (value === undefined || value === null || value === '') return true;
    return Number(value) === 1;
  }

  private loginFailureKey(kind: 'account' | 'ip', value: string): string {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    // 账号标识可能是邮箱 / 手机号，Redis 键里只存摘要
    const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 32);
    return `auth:login:fail:${kind}:${digest}`;
  }

  private async assertLoginNotLocked(accountKey: string, ipKey: string | null): Promise<void> {
    const [accountFailures, ipFailures] = await Promise.all([
      this.redisCacheService.get({ key: accountKey }),
      ipKey ? this.redisCacheService.get({ key: ipKey }) : Promise.resolve(null),
    ]);
    if (
      Number(accountFailures || 0) >= AuthConfig.login.maxLoginAttempts ||
      Number(ipFailures || 0) >= AuthConfig.login.maxLoginAttemptsPerIp
    ) {
      throw new HttpException(
        '登录失败次数过多，账号已临时锁定，请稍后再试。',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordLoginFailure(accountKey: string, ipKey: string | null): Promise<void> {
    const ttl = AuthConfig.login.lockoutDuration;
    await this.redisCacheService.incrByWithInitialExpire(accountKey, 1, ttl);
    if (ipKey) await this.redisCacheService.incrByWithInitialExpire(ipKey, 1, ttl);
  }

  private async assertVisitorQuota(ip: string): Promise<void> {
    if (!ip) return;
    const count = await this.redisCacheService.incrByWithInitialExpire(
      `auth:visitor:ip:${ip}`,
      1,
      60 * 60,
    );
    if (count > AuthConfig.visitor.sessionsPerIpPerHour) {
      throw new HttpException('游客会话创建过于频繁，请稍后再试。', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async assertRegisterQuota(ip: string) {
    if (!ip) return;
    const count = await this.redisCacheService.incrByWithInitialExpire(
      `auth:register:ip:${ip}`,
      1,
      60 * 60,
    );
    if (count > REGISTER_IP_LIMIT_PER_HOUR) {
      throw new HttpException('注册过于频繁，请稍后再试。', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}

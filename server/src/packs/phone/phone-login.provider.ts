import {
  AuthIdentityScene,
  NormalizedAuthIdentity,
} from '@/modules/auth/identity/auth-identity.types';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { LoginProviderRegistry } from '@/modules/auth/providers/login-provider.registry';
import type {
  AuthProviderListEntry,
  CaptchaLoginAdapter,
  CaptchaScene,
} from '@/modules/auth/providers/login-provider.types';
import { Injectable } from '@nestjs/common';
import { TencentSmsSender } from './tencent-sms.sender';

/** 身份标识沿用早期数据里的 local_phone */
export const PHONE_PROVIDER = 'local_phone';
const PHONE_PATTERN = /^1[3-9]\d{9}$/;

/** 手机号验证码登录方式：认大陆手机号、经腾讯云短信把内核生成的验证码发出去；流程本身在内核 */
@Injectable()
export class PhoneLoginProvider implements CaptchaLoginAdapter {
  readonly provider = PHONE_PROVIDER;
  readonly kind = 'captcha' as const;
  readonly contactField = 'phone' as const;

  constructor(
    private readonly globalConfigService: GlobalConfigService,
    private readonly sender: TencentSmsSender,
    registry: LoginProviderRegistry,
  ) {
    registry.register(this);
  }

  async listEntries(): Promise<AuthProviderListEntry[]> {
    const status = await this.globalConfigService.getConfigs(['phoneLoginStatus']);
    const enabled = Number(status) === 1 && (await this.sender.isAvailable());
    return enabled
      ? [{ provider: PHONE_PROVIDER, displayName: '手机号验证码', type: 'captcha', enabled: true }]
      : [];
  }

  matches(contact: string): boolean {
    return PHONE_PATTERN.test(String(contact || '').trim());
  }

  normalizeContact(contact: string): string {
    return String(contact || '').trim();
  }

  async sendCode(contact: string, code: string, _scene: CaptchaScene): Promise<void> {
    await this.sender.sendCode(contact, code);
  }

  toIdentity(contact: string, scene: AuthIdentityScene): NormalizedAuthIdentity {
    return {
      provider: PHONE_PROVIDER,
      providerUserId: contact,
      phone: contact,
      scene,
      contactField: 'phone',
    };
  }
}

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
import { EmailSender } from './email.sender';

/** 身份标识沿用早期数据里的 local_email */
export const EMAIL_PROVIDER = 'local_email';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 邮箱验证码登录方式：认邮箱格式、把内核生成的验证码发出去；流程本身在内核 */
@Injectable()
export class EmailLoginProvider implements CaptchaLoginAdapter {
  readonly provider = EMAIL_PROVIDER;
  readonly kind = 'captcha' as const;
  readonly contactField = 'email' as const;

  constructor(
    private readonly globalConfigService: GlobalConfigService,
    private readonly sender: EmailSender,
    registry: LoginProviderRegistry,
  ) {
    registry.register(this);
  }

  async listEntries(): Promise<AuthProviderListEntry[]> {
    const status = await this.globalConfigService.getConfigs(['emailLoginStatus']);
    const enabled = Number(status) === 1 && (await this.sender.isAvailable());
    return enabled
      ? [{ provider: EMAIL_PROVIDER, displayName: '邮箱验证码', type: 'captcha', enabled: true }]
      : [];
  }

  matches(contact: string): boolean {
    return EMAIL_PATTERN.test(String(contact || '').trim());
  }

  normalizeContact(contact: string): string {
    return String(contact || '')
      .trim()
      .toLowerCase();
  }

  async sendCode(contact: string, code: string, _scene: CaptchaScene): Promise<void> {
    await this.sender.sendMail({ to: contact, context: { code } });
  }

  toIdentity(contact: string, scene: AuthIdentityScene): NormalizedAuthIdentity {
    return {
      provider: EMAIL_PROVIDER,
      providerUserId: contact,
      email: contact,
      emailVerified: true,
      scene,
      contactField: 'email',
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import type {
  CaptchaLoginAdapter,
  LoginProviderAdapter,
  LoginProviderKind,
  OAuthLoginAdapter,
  QrLoginAdapter,
} from './login-provider.types';

/**
 * 登录方式注册表（内核）。各渠道包的适配器在构造时调用 register；
 * 同一 provider 可以按 kind 注册多个适配器（如公众号既有扫码又有微信内授权）。
 * 内核只认这张表：列出登录方式、发验证码、生成授权地址、创建 / 轮询扫码场景。
 */
@Injectable()
export class LoginProviderRegistry {
  private readonly adapters = new Map<string, LoginProviderAdapter>();

  register(adapter: LoginProviderAdapter) {
    const key = this.key(adapter.kind, adapter.provider);
    if (this.adapters.has(key)) {
      Logger.warn('重复注册登录方式，后者覆盖前者', 'LoginProviderRegistry');
    }
    this.adapters.set(key, adapter);
  }

  list(): LoginProviderAdapter[] {
    return [...this.adapters.values()];
  }

  getOAuth(provider: string): OAuthLoginAdapter | undefined {
    return this.adapters.get(this.key('oauth', provider)) as OAuthLoginAdapter | undefined;
  }

  getQr(provider: string): QrLoginAdapter | undefined {
    return this.adapters.get(this.key('qr', provider)) as QrLoginAdapter | undefined;
  }

  getCaptcha(provider: string): CaptchaLoginAdapter | undefined {
    return this.adapters.get(this.key('captcha', provider)) as CaptchaLoginAdapter | undefined;
  }

  listCaptcha(): CaptchaLoginAdapter[] {
    return this.list().filter((item): item is CaptchaLoginAdapter => item.kind === 'captcha');
  }

  /**
   * 某个 provider 当前能不能用来登录：它名下任一已注册的适配器（OAuth、扫码、验证码）列出了入口即可。
   * 各渠道包的 listEntries 负责把开关与可离线判断的必需配置都算进去；读配置出错按不可用处理
   */
  async isProviderUsable(provider: string): Promise<boolean> {
    for (const kind of ['oauth', 'qr', 'captcha'] as const) {
      const adapter = this.adapters.get(this.key(kind, provider));
      if (!adapter) continue;
      try {
        const entries = await adapter.listEntries();
        if (entries.some(entry => entry.enabled !== false)) return true;
      } catch {
        // 配置读取失败：不当成可用
      }
    }
    return false;
  }

  /** 按联系方式找到认领它的验证码渠道（邮箱 / 手机号……） */
  captchaForContact(contact: string): CaptchaLoginAdapter | undefined {
    const value = String(contact || '').trim();
    if (!value) return undefined;
    return this.listCaptcha().find(adapter => adapter.matches(value));
  }

  private key(kind: LoginProviderKind, provider: string) {
    return `${kind}:${provider}`;
  }
}

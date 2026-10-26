import { createRandomNonceStr } from '@/common/utils';
import { RedisCacheService } from '@/modules/redisCache/redisCache.service';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import type {
  CreateOAuthUrlInput,
  NormalizedCreateOAuthUrlInput,
  OAuthSource,
  OAuthStatePayload,
} from './login-provider.types';
import { OAUTH_SOURCE_PATTERN } from './login-provider.types';

/** 发起标签页密钥的摘要：SHA-256 小写十六进制 */
const BROWSER_PROOF_PATTERN = /^[0-9a-f]{64}$/;
/** 标签页密钥原文：base64url（web 用 32 字节随机数生成，43 位） */
const BROWSER_SECRET_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
const STATE_EXPIRED = '登录状态已失效，请重新授权。';

/** http(s) 地址的 origin；不是合法地址（含字面值 null）时为 null */
function originOf(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * OAuth state 的生成、存储与一次性消费（内核，与具体登录方式无关）。
 * 每个 state 绑定发起它的浏览器标签页：发起时 web 带上标签页密钥的摘要，回调时必须带回密钥原文，
 * 别人发来的回调地址（攻击者用自己的第三方账号授权得到的 code + state）在受害者的标签页里没有密钥，会被拒绝。
 */
@Injectable()
export class OAuthStateService {
  private readonly oauthStatePrefix = 'auth:oauth:state';

  constructor(private readonly redisCacheService: RedisCacheService) {}

  newState() {
    return createRandomNonceStr(32);
  }

  /**
   * 发起请求所在站点：优先 Origin 头，它用不了（缺失、字面值 null、不合法）时用 web 发来的 X-Website-Domain。
   * 两个头都没有时为 null（不比较，如脚本直接调用）；有头却都用不了时拒绝，不放过同源检查
   */
  requestOriginOf(req: Pick<Request, 'headers'> | undefined): string | null {
    const headers = req?.headers || {};
    const values = [headers.origin, headers['x-website-domain']].map(value =>
      String((Array.isArray(value) ? value[0] : value) ?? '').trim(),
    );
    for (const value of values) {
      const origin = originOf(value);
      if (origin) return origin;
    }
    if (values.every(value => !value)) return null;
    throw new HttpException('无法确认发起登录的站点，请刷新页面后重试', HttpStatus.BAD_REQUEST);
  }

  /** 归一发起参数：浏览器证明必须是 64 位小写十六进制（旧页面没有它，提示刷新） */
  normalizeCreateOAuthUrlInput(
    input: CreateOAuthUrlInput,
    requestOrigin: string | null,
  ): NormalizedCreateOAuthUrlInput {
    const browserProof = typeof input?.browserProof === 'string' ? input.browserProof : '';
    if (!BROWSER_PROOF_PATTERN.test(browserProof)) {
      throw new HttpException('登录页已更新，请刷新后重试', HttpStatus.BAD_REQUEST);
    }
    return {
      scene: input?.scene || 'oauth',
      source: input?.source,
      redirectPath: input?.redirectPath || '/',
      browserProof,
      requestOrigin,
    };
  }

  createPayload(
    provider: string,
    input: NormalizedCreateOAuthUrlInput,
    callbackUrl: string,
    options: { defaultSource: OAuthSource; userId?: number },
  ): OAuthStatePayload {
    const payload: OAuthStatePayload = {
      provider,
      scene: input.scene,
      source: this.normalizeSource(input.source, options.defaultSource),
      callbackUrl,
      redirectPath: this.normalizeRedirectPath(input.redirectPath),
      createdAt: Date.now(),
      browserProof: input.browserProof,
      requestOrigin: input.requestOrigin,
    };
    if (input.scene === 'bind' && options.userId) {
      payload.userId = options.userId;
    }
    return payload;
  }

  /**
   * 保存前两道检查：必须带浏览器证明（渠道包漏传时拒绝，不存一个谁都能用的 state）；
   * 知道发起站点时，回调地址必须与它同源——回到别的域名、协议或端口读不到发起页的标签页密钥，登录一定失败
   */
  async store(state: string, payload: OAuthStatePayload) {
    if (!BROWSER_PROOF_PATTERN.test(String(payload?.browserProof || ''))) {
      Logger.error('OAuth state 缺少浏览器证明，已拒绝保存', undefined, 'OAuthStateService');
      throw new HttpException(
        '第三方登录发起失败，请联系管理员。',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    if (payload.requestOrigin && originOf(payload.callbackUrl) !== payload.requestOrigin) {
      throw new HttpException(
        '第三方登录的回调地址必须与当前站点同源，请检查回调地址配置',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.redisCacheService.set(
      { key: this.getOAuthStateKey(state), val: JSON.stringify(payload) },
      5 * 60,
    );
  }

  /** 一次性消费 state 并核对标签页密钥：先删再核对，密钥缺失或不符时这个 state 也已作废 */
  async consume(
    provider: string,
    state: string,
    browserSecret: unknown,
  ): Promise<OAuthStatePayload> {
    if (!state) {
      throw new HttpException(STATE_EXPIRED, HttpStatus.BAD_REQUEST);
    }
    const payloadText = await this.redisCacheService.getDel({ key: this.getOAuthStateKey(state) });
    if (!payloadText) {
      throw new HttpException(STATE_EXPIRED, HttpStatus.BAD_REQUEST);
    }
    let payload: OAuthStatePayload;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      throw new HttpException(STATE_EXPIRED, HttpStatus.BAD_REQUEST);
    }
    if (payload.provider !== provider) {
      throw new HttpException('登录状态不匹配，请重新授权。', HttpStatus.BAD_REQUEST);
    }
    // 没有证明的旧 state（升级前发起的）同样拒绝，重新点一次登录即可
    if (!this.matchesBrowserProof(payload.browserProof, browserSecret)) {
      throw new HttpException(STATE_EXPIRED, HttpStatus.BAD_REQUEST);
    }
    return payload;
  }

  normalizeSource(source: string | undefined, fallback: OAuthSource): OAuthSource {
    const value = String(source || '').trim();
    return OAUTH_SOURCE_PATTERN.test(value) ? value : fallback;
  }

  normalizeRedirectPath(redirectPath?: string) {
    const value = String(redirectPath || '/').trim();
    if (!value) return '/';
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
      throw new HttpException('回跳地址不合法。', HttpStatus.BAD_REQUEST);
    }
    return value;
  }

  /** 密钥原文的 SHA-256 与 state 里的证明常量时间比较；任一方格式不对都不通过 */
  private matchesBrowserProof(proof: unknown, secret: unknown): boolean {
    if (typeof proof !== 'string' || !BROWSER_PROOF_PATTERN.test(proof)) return false;
    if (typeof secret !== 'string' || !BROWSER_SECRET_PATTERN.test(secret)) return false;
    const actual = createHash('sha256').update(secret, 'utf8').digest();
    return timingSafeEqual(actual, Buffer.from(proof, 'hex'));
  }

  private getOAuthStateKey(state: string) {
    return `${this.oauthStatePrefix}:${state}`;
  }
}

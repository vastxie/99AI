import { formatUrl } from '@/common/utils';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios from 'axios';

export type WechatUrlType = 'open' | 'api' | 'mp';

/** 微信域名：数据库配置 > 环境变量 > 官方默认（可指向反向代理） */
const WECHAT_URLS: Record<WechatUrlType, { configKey: string; envKey: string; fallback: string }> =
  {
    open: {
      configKey: 'wechatOpenUrl',
      envKey: 'weChatOpenUrl',
      fallback: 'https://open.weixin.qq.com',
    },
    api: {
      configKey: 'wechatApiUrl',
      envKey: 'weChatApiUrl',
      fallback: 'https://api.weixin.qq.com',
    },
    mp: { configKey: 'wechatMpUrl', envKey: 'weChatMpUrl', fallback: 'https://mp.weixin.qq.com' },
  };

/** 微信 access_token 默认 7200 秒有效；提前 5 分钟刷新，失败后 1 分钟内不重试 */
const DEFAULT_EXPIRES_IN_SECONDS = 7200;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const FAILURE_RETRY_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 120000;

interface FetchedToken {
  token: string;
  expiresIn: number;
}

/**
 * 公众号 access_token 缓存：按需懒刷新（过期前 5 分钟 / 配置变更 / 强制），并发只发一次请求。
 * 只用稳定版接口（POST，AppSecret 在请求体里）；不回退到把 AppSecret 拼进 URL 的普通版接口，
 * 以免密钥进入代理与访问日志。失败时给空 token，1 分钟后重试；ISDEV 下不访问微信。
 */
@Injectable()
export class WechatOfficialTokenService implements OnModuleInit {
  private accessToken = '';
  private nextRefreshAt = 0;
  private inflight: Promise<string> | null = null;

  constructor(private readonly globalConfigService: GlobalConfigService) {}

  onModuleInit() {
    // 启动预热不阻塞进程：未配置时只提示一次，配置了则后台取一次
    void this.refresh(true);
  }

  async getWechatUrl(type: WechatUrlType): Promise<string> {
    const { configKey, envKey, fallback } = WECHAT_URLS[type];
    const value = await this.globalConfigService.getConfigWithFallback(configKey, envKey, fallback);
    return value === fallback ? fallback : formatUrl(value);
  }

  /** 取 access_token：缓存未到刷新时间直接返回，否则按需刷新 */
  async getAccessToken(force = false): Promise<string> {
    if (!force && Date.now() < this.nextRefreshAt) {
      return this.accessToken;
    }
    return this.refresh();
  }

  /** 配置（appId / secret）变更时丢弃缓存 */
  invalidate(): void {
    this.accessToken = '';
    this.nextRefreshAt = 0;
  }

  /** 刷新 access_token；并发调用共享同一次请求，从不抛错（失败返回空串并稍后重试） */
  refresh(isInit = false): Promise<string> {
    if (!this.inflight) {
      this.inflight = this.doRefresh(isInit).finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async doRefresh(isInit: boolean): Promise<string> {
    const { wechatOfficialAppId: appId, wechatOfficialAppSecret: secret } =
      await this.globalConfigService.getConfigs(['wechatOfficialAppId', 'wechatOfficialAppSecret']);
    if (!appId || !secret) {
      if (isInit) {
        Logger.warn(
          '未配置微信公众号 appId/secret，微信扫码登录功能暂不可用',
          'WechatOfficialTokenService',
        );
      }
      this.accessToken = '';
      this.nextRefreshAt = Date.now() + FAILURE_RETRY_MS;
      return '';
    }
    if (process.env.ISDEV === 'true') {
      this.accessToken = '';
      this.nextRefreshAt = Number.MAX_SAFE_INTEGER;
      return '';
    }

    const fetched = await this.fetchStableAccessToken(appId, secret);

    this.accessToken = fetched.token;
    this.nextRefreshAt = fetched.token
      ? Date.now() + Math.max(fetched.expiresIn, 60) * 1000 - REFRESH_MARGIN_MS
      : Date.now() + FAILURE_RETRY_MS;
    return this.accessToken;
  }

  /* 稳定版 access_token：接口返回错误码或网络异常时都给空 token */
  private async fetchStableAccessToken(appId: string, secret: string): Promise<FetchedToken> {
    try {
      const url = `${await this.getWechatUrl('api')}/cgi-bin/stable_token`;
      const response = await axios.post(
        url,
        {
          grant_type: 'client_credential',
          appid: appId,
          secret,
          force_refresh: false, // 普通模式，多次调用返回同一个 token
        },
        { timeout: REQUEST_TIMEOUT_MS },
      );
      return this.readTokenResponse(response.data);
    } catch {
      // 异常原文可能带请求配置，只记静态文案
      Logger.error('获取公众号 access_token 请求失败', 'WechatOfficialTokenService');
      return { token: '', expiresIn: 0 };
    }
  }

  private readTokenResponse(data: any): FetchedToken {
    const { errmsg, access_token: accessToken, errcode, expires_in: expiresIn } = data ?? {};
    if (errmsg || errcode || !accessToken) {
      Logger.error(
        '公众号 access_token 获取失败，请检查 AppID、AppSecret 与 IP 白名单',
        'WechatOfficialTokenService',
      );
      return { token: '', expiresIn: 0 };
    }
    return {
      token: accessToken,
      expiresIn: Number(expiresIn) > 0 ? Number(expiresIn) : DEFAULT_EXPIRES_IN_SECONDS,
    };
  }
}

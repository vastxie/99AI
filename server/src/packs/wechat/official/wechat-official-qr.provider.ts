import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { LoginProviderRegistry } from '@/modules/auth/providers/login-provider.registry';
import type {
  AuthProviderListEntry,
  QrLoginAdapter,
  QrScene,
  QrSceneCreated,
  QrScenePollResult,
} from '@/modules/auth/providers/login-provider.types';
import { Injectable } from '@nestjs/common';
import { OfficialService } from './official.service';
import { WECHAT_OFFICIAL_PROVIDER } from './wechat-official-oauth.provider';

/** 微信公众号扫码登录 / 绑定：二维码与扫码事件由 OfficialService 处理，会话由内核签发 */
@Injectable()
export class WechatOfficialQrProvider implements QrLoginAdapter {
  readonly provider = WECHAT_OFFICIAL_PROVIDER;
  readonly kind = 'qr' as const;

  constructor(
    private readonly globalConfigService: GlobalConfigService,
    private readonly officialService: OfficialService,
    registry: LoginProviderRegistry,
  ) {
    registry.register(this);
  }

  /** 开关 + AppId + AppSecret + 服务器 Token（扫码事件验签用）都齐才列出 */
  async listEntries(): Promise<AuthProviderListEntry[]> {
    const configs = await this.globalConfigService.getConfigs([
      'wechatRegisterStatus',
      'wechatOfficialAppId',
      'wechatOfficialAppSecret',
      'wechatOfficialToken',
    ]);
    const filled = (key: string) => String(configs[key] ?? '').trim() !== '';
    const usable =
      Number(configs.wechatRegisterStatus) === 1 &&
      filled('wechatOfficialAppId') &&
      filled('wechatOfficialAppSecret') &&
      filled('wechatOfficialToken');
    return usable
      ? [
          {
            provider: WECHAT_OFFICIAL_PROVIDER,
            displayName: '微信公众号扫码',
            type: 'qr',
            scene: 'qr',
            enabled: true,
          },
        ]
      : [];
  }

  createScene(scene: QrScene, userId?: number): Promise<QrSceneCreated> {
    return this.officialService.createScene(scene, userId);
  }

  pollScene(sceneId: string, scene: QrScene, userId?: number): Promise<QrScenePollResult> {
    return this.officialService.pollScene(sceneId, scene, userId);
  }
}

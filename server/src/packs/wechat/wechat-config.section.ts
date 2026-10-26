import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  GlobalConfigItem,
  GlobalConfigRegistry,
} from '@/modules/globalConfig/global-config.registry';
import { ModelsService } from '@/modules/models/models.service';
import { WechatOfficialTokenService } from './official/wechat-official-token.service';

const OPEN_WEB_BINARY_KEYS = new Set([
  'wechatOpenWebLoginEnabled',
  'wechatOpenWebFastLoginEnabled',
  'wechatOpenWebFallbackEnabled',
]);

/**
 * 微信包向内核配置注册表登记：
 * - 前台可见：微信 Bot 开关、微信内静默登录开关；
 * - 校验：微信 Bot 使用的模型必须存在；开放平台网站登录的开关只允许 0/1，回调地址必须是 HTTPS；
 * - 变更：公众号 appId / secret 变化后丢弃并重取 access_token。
 */
@Injectable()
export class WechatConfigSection {
  constructor(
    registry: GlobalConfigRegistry,
    private readonly modelsService: ModelsService,
    private readonly wechatToken: WechatOfficialTokenService,
  ) {
    registry.register({
      name: 'wechat',
      frontKeys: ['weixinBotStatus', 'wechatSilentLoginStatus'],
      secretKeys: ['wechatOfficialAppSecret', 'wechatOfficialToken', 'wechatOpenWebAppSecret'],
      validate: item => this.validate(item),
      onChanged: keys => this.onChanged(keys),
    });
  }

  private async validate(item: GlobalConfigItem): Promise<void> {
    if (OPEN_WEB_BINARY_KEYS.has(item.configKey) && !['0', '1'].includes(String(item.configVal))) {
      throw new HttpException('开关配置只允许保存 0 或 1', HttpStatus.BAD_REQUEST);
    }
    if (item.configKey === 'wechatOpenWebCallbackUrl') {
      item.configVal = String(item.configVal || '').trim();
      this.validateCallbackUrl(item.configVal);
      return;
    }
    if (item.configKey !== 'weixinBotModelId') return;
    const rawModelId = String(item.configVal || '').trim();
    if (!rawModelId) {
      item.configVal = '';
      return;
    }
    const modelId = Number(rawModelId);
    const model = Number.isInteger(modelId)
      ? await this.modelsService.findByIdIncludingDisabled(modelId)
      : null;
    if (!model) {
      throw new HttpException('微信Bot使用模型不存在', HttpStatus.BAD_REQUEST);
    }
    item.configVal = String(modelId);
  }

  private validateCallbackUrl(value: string): void {
    if (!value) return;
    if (/\s/.test(value)) {
      throw new HttpException('微信开放平台网站登录回调地址不能包含空格', HttpStatus.BAD_REQUEST);
    }
    try {
      const url = new URL(value);
      const isLocalHttp =
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
      if (url.protocol !== 'https:' && !isLocalHttp) {
        throw new Error('invalid protocol');
      }
    } catch {
      throw new HttpException(
        '微信开放平台网站登录回调地址需使用 HTTPS，本地调试可使用 localhost HTTP',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async onChanged(keys: readonly string[]): Promise<void> {
    if (!keys.includes('wechatOfficialAppId') && !keys.includes('wechatOfficialAppSecret')) return;
    this.wechatToken.invalidate();
    await this.wechatToken.refresh();
  }
}

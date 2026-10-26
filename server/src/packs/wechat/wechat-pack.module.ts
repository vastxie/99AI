import { Module } from '@nestjs/common';
import { BotModule } from './bot/bot.module';
import { OfficialModule } from './official/official.module';
import { WechatConfigSection } from './wechat-config.section';
import { WeixinBotModule } from './weixinBot/weixinBot.module';

/**
 * 微信包：公众号（扫码登录、微信内授权登录、消息推送、菜单）、微信开放平台网站登录、微信 Bot 通道、用户渠道绑定。
 *
 * 登录方式适配器在构造时向内核 LoginProviderRegistry 注册；渠道绑定经 CHANNEL_BINDING_IMPLEMENTATION 令牌
 * 挂到内核的 CHANNEL_BINDING_PORT；由 WECHAT_PACK_ENABLED 决定是否装载。
 */
@Module({
  imports: [BotModule, OfficialModule, WeixinBotModule],
  providers: [WechatConfigSection],
})
export class WechatPackModule {}

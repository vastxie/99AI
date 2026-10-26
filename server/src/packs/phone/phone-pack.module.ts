import { Module } from '@nestjs/common';
import { PhoneLoginProvider } from './phone-login.provider';
import { TencentSmsSender } from './tencent-sms.sender';
import { PhoneConfigSection } from './phone-config.section';

/**
 * 手机号包：手机号验证码登录（首次自动注册）/ 绑定 / 找回密码，腾讯云短信发送。
 * 适配器在构造时向内核 LoginProviderRegistry 注册；由 PHONE_PACK_ENABLED 决定是否装载。
 */
@Module({
  providers: [TencentSmsSender, PhoneLoginProvider, PhoneConfigSection],
})
export class PhonePackModule {}

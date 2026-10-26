import { Module } from '@nestjs/common';
import { EmailLoginProvider } from './email-login.provider';
import { EmailSender } from './email.sender';
import { EmailConfigSection } from './email-config.section';

/**
 * 邮箱包：邮箱验证码登录（首次自动注册）/ 绑定 / 找回密码，SMTP 或腾讯云邮件发信。
 * 适配器在构造时向内核 LoginProviderRegistry 注册；由 EMAIL_PACK_ENABLED 决定是否装载。
 */
@Module({
  providers: [EmailSender, EmailLoginProvider, EmailConfigSection],
})
export class EmailPackModule {}

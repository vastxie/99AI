import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';

@Injectable()
export class MailerService {
  constructor(private globalConfigService: GlobalConfigService) { }

  async sendMail(options: { to: string; context: any }): Promise<void> {
    try {
      const configs = await this.globalConfigService.getConfigs([
        'MAILER_HOST',
        'MAILER_PORT',
        'MAILER_USER',
        'MAILER_PASS',
        'MAILER_SECURE',
        'siteName',
        'siteUrl',
      ]);

      // 直接使用字符串拼接构建HTML邮件内容
      const html = `
<div style="font-family: Helvetica, Arial, sans-serif; max-width: 500px; margin: auto; padding: 40px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);">
  <h2 style="text-align: center; color: #111; font-weight: 400;">验证您的邮箱</h2>
  <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;">
  <div style="text-align: center; margin-bottom: 30px;">
    <span style="display: inline-block; font-size: 42px; font-weight: 700; padding: 10px 20px; background-color: #f5f5f5; border-radius: 10px;">${options.context.code}</span>
  </div>
  <p style="font-size: 16px; color: #111; text-align: center; line-height: 1.5;">此验证码将在 10 分钟后失效，非本人操作请忽略。</p>
  <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;">
  <p style="font-size: 14px; color: #999; text-align: center;">点击访问：<a href="${configs.siteUrl}" style="color: #007AFF; text-decoration: none;">${configs.siteName}</a></p>
</div>`;

      const transporter = nodemailer.createTransport({
        host: configs.MAILER_HOST,
        port: configs.MAILER_PORT,
        secure: (configs.MAILER_SECURE === '1') ? true : false,
        auth: {
          user: configs.MAILER_USER,
          pass: configs.MAILER_PASS,
        },
      });

      await transporter.sendMail({
        from: configs.MAILER_USER,
        to: options.to,
        subject: `验证码${options.context.code}`,
        html: html,
      });
    } catch (error) {
      console.error('error: ', error);
      throw new HttpException('邮件发送失败！', HttpStatus.BAD_REQUEST);
    }
  }

}

import { getErrorStack } from '@/common/utils/error-stack.util';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';

/** 邮箱验证码发送实现：SMTP 或腾讯云邮件，按后台「邮箱登录」配置选择通道（邮箱包） */
@Injectable()
export class EmailSender {
  constructor(private readonly globalConfigService: GlobalConfigService) {}

  private buildMailContent(options: { context: any }, configs: Record<string, any>) {
    const code = String(options.context?.code || '');
    const siteName = configs.siteName || '99Agent';
    const siteUrl = configs.siteUrl || '#';
    const subject = `验证码${code}`;
    const text = `您的验证码是 ${code}，此验证码将在 10 分钟后失效，非本人操作请忽略。`;

    const html = `
<div style="font-family: Helvetica, Arial, sans-serif; max-width: 500px; margin: auto; padding: 40px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);">
  <h2 style="text-align: center; color: #111; font-weight: 400;">验证您的邮箱</h2>
  <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;">
  <div style="text-align: center; margin-bottom: 30px;">
    <span style="display: inline-block; font-size: 42px; font-weight: 700; padding: 10px 20px; background-color: #f5f5f5; border-radius: 10px;">${code}</span>
  </div>
  <p style="font-size: 16px; color: #111; text-align: center; line-height: 1.5;">此验证码将在 10 分钟后失效，非本人操作请忽略。</p>
  <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;">
  <p style="font-size: 14px; color: #999; text-align: center;">点击访问：<a href="${siteUrl}" style="color: #007AFF; text-decoration: none;">${siteName}</a></p>
</div>`;

    return { code, html, siteName, siteUrl, subject, text };
  }

  private createTencentSesClient(secretId: string, secretKey: string, region: string) {
    const tencentcloud = require('tencentcloud-sdk-nodejs-ses');
    const SesClient = tencentcloud.ses.v20201002.Client;
    return new SesClient({
      credential: {
        secretId,
        secretKey,
      },
      region,
      profile: { httpProfile: { reqTimeout: 10 } },
    });
  }

  private formatTencentFromAddress(address: string, name?: string) {
    const email = String(address || '').trim();
    const displayName = String(name || '').trim();
    if (!displayName) return email;
    return `${displayName} <${email}>`;
  }

  private async sendByTencentSes(
    options: { to: string; context: any },
    configs: Record<string, any>,
  ) {
    const secretId = String(configs.tencentSecretId || '').trim();
    const secretKey = String(configs.tencentSecretKey || '').trim();
    const region = String(configs.tencentRegion || 'ap-guangzhou').trim() || 'ap-guangzhou';
    const fromAddress = String(configs.tencentEmailFromAddress || '').trim();
    const fromName = String(configs.tencentEmailFromName || '').trim();
    const replyTo = String(configs.tencentEmailReplyTo || '').trim();
    const templateId = String(configs.tencentEmailTemplateId || '').trim();

    if (!secretId || !secretKey || !fromAddress) {
      throw new HttpException(
        '腾讯云邮件配置未完整，请检查 SecretId、SecretKey 和发件地址',
        HttpStatus.BAD_REQUEST,
      );
    }

    const { code, html, siteName, siteUrl, subject, text } = this.buildMailContent(
      options,
      configs,
    );
    const client = this.createTencentSesClient(secretId, secretKey, region);
    const request: Record<string, any> = {
      FromEmailAddress: this.formatTencentFromAddress(fromAddress, fromName),
      Destination: [options.to],
      Subject: subject,
      TriggerType: 1,
    };

    if (replyTo) {
      request.ReplyToAddresses = replyTo;
    }

    if (templateId) {
      const parsedTemplateId = Number(templateId);
      if (!Number.isInteger(parsedTemplateId) || parsedTemplateId <= 0) {
        throw new HttpException('腾讯云邮件模板 ID 格式不正确', HttpStatus.BAD_REQUEST);
      }
      request.Template = {
        TemplateID: parsedTemplateId,
        TemplateData: JSON.stringify({
          code,
          siteName,
          siteUrl,
          expireMinutes: '10',
        }),
      };
    } else {
      request.Simple = {
        Html: Buffer.from(html, 'utf8').toString('base64'),
        Text: Buffer.from(text, 'utf8').toString('base64'),
      };
    }

    await client.SendEmail(request);
  }

  private async sendBySmtp(options: { to: string; context: any }, configs: Record<string, any>) {
    const { html, subject } = this.buildMailContent(options, configs);

    if (
      !configs.MAILER_HOST ||
      !configs.MAILER_PORT ||
      !configs.MAILER_USER ||
      !configs.MAILER_PASS
    ) {
      throw new HttpException('SMTP 邮件配置未完整', HttpStatus.BAD_REQUEST);
    }

    const transporter = nodemailer.createTransport({
      host: configs.MAILER_HOST,
      port: Number(configs.MAILER_PORT),
      secure: configs.MAILER_SECURE === '1' ? true : false,
      auth: {
        user: configs.MAILER_USER,
        pass: configs.MAILER_PASS,
      },
    });

    await transporter.sendMail({
      from: configs.MAILER_USER,
      to: options.to,
      subject,
      html: html,
    });
  }

  /** 任一通道配置完整即视为可用；未配置时登录方式列表不展示邮箱验证码 */
  async isAvailable(): Promise<boolean> {
    const configs = await this.globalConfigService.getConfigs([
      'emailProvider',
      'MAILER_HOST',
      'MAILER_PORT',
      'MAILER_USER',
      'MAILER_PASS',
      'tencentSecretId',
      'tencentSecretKey',
      'tencentEmailFromAddress',
    ]);
    if (configs.emailProvider === 'tencent-ses') {
      return Boolean(
        configs.tencentSecretId && configs.tencentSecretKey && configs.tencentEmailFromAddress,
      );
    }
    return Boolean(
      configs.MAILER_HOST && configs.MAILER_PORT && configs.MAILER_USER && configs.MAILER_PASS,
    );
  }

  async sendMail(options: { to: string; context: { code: string | number } }): Promise<void> {
    try {
      const configs = await this.globalConfigService.getConfigs([
        'emailProvider',
        'MAILER_HOST',
        'MAILER_PORT',
        'MAILER_USER',
        'MAILER_PASS',
        'MAILER_SECURE',
        'tencentSecretId',
        'tencentSecretKey',
        'tencentRegion',
        'tencentEmailFromAddress',
        'tencentEmailFromName',
        'tencentEmailReplyTo',
        'tencentEmailTemplateId',
        'siteName',
        'siteUrl',
      ]);

      if (configs.emailProvider === 'tencent-ses') {
        await this.sendByTencentSes(options, configs);
        return;
      }

      await this.sendBySmtp(options, configs);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      Logger.error(`邮件发送失败: ${error.message}`, getErrorStack(error), 'EmailSender');
      throw new HttpException('邮件发送失败！', HttpStatus.BAD_REQUEST);
    }
  }
}

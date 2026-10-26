import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';

/** 腾讯云短信：手机号验证码发送实现（手机号包） */
@Injectable()
export class TencentSmsSender {
  private tencentSmsClient: any = null;
  private tencentSmsClientKey = '';

  constructor(private readonly globalConfigService: GlobalConfigService) {}

  /** 短信应用、签名、模板与密钥齐全才算可用；决定「手机号验证码」是否出现在登录方式列表 */
  async isAvailable(): Promise<boolean> {
    const configs = await this.globalConfigService.getConfigs([
      'tencentSecretId',
      'tencentSecretKey',
      'tencentSmsSdkAppId',
      'tencentSmsSignName',
      'tencentSmsTemplateId',
    ]);
    return Boolean(
      configs.tencentSecretId &&
      configs.tencentSecretKey &&
      configs.tencentSmsSdkAppId &&
      configs.tencentSmsSignName &&
      configs.tencentSmsTemplateId,
    );
  }

  async sendCode(phone: string, code: string): Promise<boolean> {
    const { secretId, secretKey, region, SmsSdkAppId, SignName, TemplateId } =
      await this.getPhoneVerifyConfig();
    if (!phone || !code) {
      throw new HttpException('缺失必要参数！', HttpStatus.BAD_REQUEST);
    }
    if (!secretId || !secretKey || !SmsSdkAppId || !SignName || !TemplateId) {
      throw new HttpException(
        '腾讯云短信配置未完整，请检查 SecretId、SecretKey、短信应用、签名和模板',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const client = this.ensureTencentSmsClient({ secretId, secretKey, region });
      const response = await client.SendSms({
        PhoneNumberSet: [this.normalizeTencentPhoneNumber(phone)],
        SmsSdkAppId,
        SignName,
        TemplateId,
        TemplateParamSet: [String(code)],
      });
      const sendStatus = Array.isArray(response?.SendStatusSet) ? response.SendStatusSet[0] : null;
      if (sendStatus?.Code === 'Ok') {
        return true;
      }
      throw new HttpException(sendStatus?.Message || '验证码发送失败！', HttpStatus.BAD_REQUEST);
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      const codeType = error?.code || error?.name || 'unknown';
      Logger.warn(`腾讯云短信发送失败，错误类型: ${codeType}`, 'TencentSmsSender');
      throw new HttpException(error?.message || '验证码发送失败！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 手机验证码配置：未开启手机号登录时拒绝发送 */
  private async getPhoneVerifyConfig() {
    const {
      phoneLoginStatus,
      tencentSecretId,
      tencentSecretKey,
      tencentRegion,
      tencentSmsSdkAppId,
      tencentSmsSignName,
      tencentSmsTemplateId,
    } = await this.globalConfigService.getConfigs([
      'phoneLoginStatus',
      'tencentSecretId',
      'tencentSecretKey',
      'tencentRegion',
      'tencentSmsSdkAppId',
      'tencentSmsSignName',
      'tencentSmsTemplateId',
    ]);
    if (Number(phoneLoginStatus) !== 1) {
      throw new HttpException('手机验证码功能暂未开放!', HttpStatus.BAD_REQUEST);
    }
    return {
      secretId: tencentSecretId,
      secretKey: tencentSecretKey,
      region: tencentRegion || 'ap-guangzhou',
      SmsSdkAppId: tencentSmsSdkAppId,
      SignName: tencentSmsSignName,
      TemplateId: tencentSmsTemplateId,
    };
  }

  private ensureTencentSmsClient(config: any) {
    const secretId = String(config.secretId || '').trim();
    const secretKey = String(config.secretKey || '').trim();
    const region = String(config.region || 'ap-guangzhou').trim() || 'ap-guangzhou';
    const clientKey = [secretId, secretKey, region].join(':');

    if (this.tencentSmsClient && this.tencentSmsClientKey === clientKey) {
      return this.tencentSmsClient;
    }

    const tencentcloud = require('tencentcloud-sdk-nodejs-sms');
    const SmsClient = tencentcloud.sms.v20210111.Client;
    this.tencentSmsClient = new SmsClient({
      credential: {
        secretId,
        secretKey,
      },
      region,
      profile: { httpProfile: { reqTimeout: 10 } },
    });
    this.tencentSmsClientKey = clientKey;
    return this.tencentSmsClient;
  }

  private normalizeTencentPhoneNumber(phone: string) {
    const value = String(phone || '').trim();
    if (value.startsWith('+')) return value;
    const digits = value.replace(/\D/g, '');
    if (/^1\d{10}$/.test(digits)) return `+86${digits}`;
    if (/^86\d{11}$/.test(digits)) return `+${digits}`;
    if (/^0086\d{11}$/.test(digits)) return `+${digits.slice(2)}`;
    return value;
  }
}

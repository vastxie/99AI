import { HttpException } from '@nestjs/common';
import { TencentSmsSender } from './tencent-sms.sender';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

function createService() {
  const globalConfigService = {
    getConfigs: jest.fn(async () => ({
      phoneLoginStatus: '1',
      tencentSecretId: 'secret-id',
      tencentSecretKey: 'secret-key',
      tencentRegion: 'ap-guangzhou',
      tencentSmsSdkAppId: '1400006666',
      tencentSmsSignName: '测试签名',
      tencentSmsTemplateId: '123456',
    })),
  };
  const service = new TencentSmsSender(globalConfigService as any);

  return {
    service,
    globalConfigService,
  };
}

describe('TencentSmsSender', () => {
  it('constructs the real product SDK through the production factory without sending', () => {
    const { service } = createService();
    const Client = require('tencentcloud-sdk-nodejs-sms').sms.v20210111.Client;
    const config = { secretId: 'synthetic-id', secretKey: 'synthetic-key', region: 'ap-guangzhou' };
    const client = service['ensureTencentSmsClient'](config);

    expect(client).toBeInstanceOf(Client);
    expect(typeof client.SendSms).toBe('function');
    expect(service['ensureTencentSmsClient'](config)).toBe(client);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends phone verification code through Tencent SMS', async () => {
    const { service } = createService();
    const client = {
      SendSms: jest.fn(async () => ({
        SendStatusSet: [{ Code: 'Ok', Message: 'send success' }],
      })),
    };
    (service as any).ensureTencentSmsClient = jest.fn(() => client);

    await expect(service.sendCode('13800138000', String('123456'))).resolves.toBe(true);

    expect(client.SendSms).toHaveBeenCalledTimes(1);
    expect(client.SendSms).toHaveBeenCalledWith({
      PhoneNumberSet: ['+8613800138000'],
      SmsSdkAppId: '1400006666',
      SignName: '测试签名',
      TemplateId: '123456',
      TemplateParamSet: ['123456'],
    });
  });

  it('throws when Tencent SMS returns a failure status', async () => {
    const { service } = createService();
    const client = {
      SendSms: jest.fn(async () => ({
        SendStatusSet: [
          {
            Code: 'FailedOperation.TemplateNotApproved',
            Message: '模板未审核',
          },
        ],
      })),
    };
    (service as any).ensureTencentSmsClient = jest.fn(() => client);

    await expect(service.sendCode('13800138000', String('123456'))).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('rejects incomplete Tencent SMS configuration before requesting SDK', async () => {
    const { service, globalConfigService } = createService();
    const ensureTencentSmsClient = jest.fn();
    (service as any).ensureTencentSmsClient = ensureTencentSmsClient;
    globalConfigService.getConfigs.mockResolvedValue({
      phoneLoginStatus: '1',
      tencentSecretId: 'secret-id',
      tencentSecretKey: '',
      tencentRegion: 'ap-guangzhou',
      tencentSmsSdkAppId: '1400006666',
      tencentSmsSignName: '测试签名',
      tencentSmsTemplateId: '123456',
    });

    await expect(service.sendCode('13800138000', String('123456'))).rejects.toBeInstanceOf(
      HttpException,
    );

    expect(ensureTencentSmsClient).not.toHaveBeenCalled();
  });
});

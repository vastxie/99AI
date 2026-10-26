import { HttpException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { EmailSender } from './email.sender';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

function createService(configOverrides: Record<string, any> = {}) {
  const configs: Record<string, string> = {
    emailProvider: 'smtp',
    MAILER_HOST: 'smtp.example.com',
    MAILER_PORT: '465',
    MAILER_USER: 'notice@example.com',
    MAILER_PASS: 'smtp-pass',
    MAILER_SECURE: '1',
    tencentSecretId: 'secret-id',
    tencentSecretKey: 'secret-key',
    tencentRegion: 'ap-guangzhou',
    tencentEmailFromAddress: 'notice@example.com',
    tencentEmailFromName: '测试通知',
    tencentEmailReplyTo: '',
    tencentEmailTemplateId: '',
    siteName: '99AI',
    siteUrl: 'https://example.com',
    ...configOverrides,
  };
  const globalConfigService = {
    getConfigs: jest.fn(async (keys: string[]) =>
      keys.reduce(
        (acc, key) => {
          acc[key] = configs[key];
          return acc;
        },
        {} as Record<string, string>,
      ),
    ),
  };
  const service = new EmailSender(globalConfigService as any);
  return { configs, globalConfigService, service };
}

describe('EmailSender', () => {
  it('constructs the real product SDK through the production factory without sending', () => {
    const { service } = createService();
    const Client = require('tencentcloud-sdk-nodejs-ses').ses.v20201002.Client;
    const client = service['createTencentSesClient'](
      'synthetic-id',
      'synthetic-key',
      'ap-guangzhou',
    );

    expect(client).toBeInstanceOf(Client);
    expect(typeof client.SendEmail).toBe('function');
  });

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('uses SMTP by default', async () => {
    const { service } = createService();
    const sendMail = jest.fn(async (): Promise<void> => undefined);
    jest.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as any);

    await service.sendMail({ to: 'user@example.com', context: { code: '123456' } });

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: {
        user: 'notice@example.com',
        pass: 'smtp-pass',
      },
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'notice@example.com',
        to: 'user@example.com',
        subject: '验证码123456',
      }),
    );
  });

  it('sends through Tencent SES with simple content when template is not configured', async () => {
    const { service } = createService({ emailProvider: 'tencent-ses' });
    const client = { SendEmail: jest.fn(async () => ({ MessageId: 'message-id' })) };
    (service as any).createTencentSesClient = jest.fn(() => client);

    await service.sendMail({ to: 'user@example.com', context: { code: '654321' } });

    expect(client.SendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        FromEmailAddress: '测试通知 <notice@example.com>',
        Destination: ['user@example.com'],
        Subject: '验证码654321',
        TriggerType: 1,
        Simple: expect.objectContaining({
          Html: expect.any(String),
          Text: expect.any(String),
        }),
      }),
    );
  });

  it('sends through Tencent SES template when template id is configured', async () => {
    const { service } = createService({
      emailProvider: 'tencent-ses',
      tencentEmailTemplateId: '10086',
      tencentEmailReplyTo: 'reply@example.com',
    });
    const client = { SendEmail: jest.fn(async () => ({ MessageId: 'message-id' })) };
    (service as any).createTencentSesClient = jest.fn(() => client);

    await service.sendMail({ to: 'user@example.com', context: { code: '135790' } });

    expect(client.SendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        ReplyToAddresses: 'reply@example.com',
        Template: {
          TemplateID: 10086,
          TemplateData: JSON.stringify({
            code: '135790',
            siteName: '99AI',
            siteUrl: 'https://example.com',
            expireMinutes: '10',
          }),
        },
      }),
    );
  });

  it('rejects incomplete Tencent SES configuration before requesting SDK', async () => {
    const { service } = createService({
      emailProvider: 'tencent-ses',
      tencentEmailFromAddress: '',
    });
    const createTencentSesClient = jest.fn();
    (service as any).createTencentSesClient = createTencentSesClient;

    await expect(
      service.sendMail({ to: 'user@example.com', context: { code: '123456' } }),
    ).rejects.toBeInstanceOf(HttpException);

    expect(createTencentSesClient).not.toHaveBeenCalled();
  });
});

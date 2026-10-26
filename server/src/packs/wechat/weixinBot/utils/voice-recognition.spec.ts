import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { VoiceRecognitionService } from './voice-recognition';

declare const afterEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

function createService(enabled = true) {
  const config = {
    getConfigs: jest.fn(async (keys: string[]) =>
      keys.length === 1
        ? enabled
          ? '1'
          : '0'
        : {
            tencentSecretId: 'synthetic-id',
            tencentSecretKey: 'synthetic-key',
            tencentRegion: 'ap-guangzhou',
          },
    ),
  };
  const service = new VoiceRecognitionService(config as unknown as GlobalConfigService);
  return { service, config };
}

afterEach(() => jest.restoreAllMocks());

describe('VoiceRecognitionService product SDK', () => {
  it('constructs the real ASR client without requesting and reuses it', async () => {
    const { service } = createService();
    const Client = require('tencentcloud-sdk-nodejs-asr').asr.v20190614.Client;
    await service['ensureTencentClient']();
    const client = service['tencentClient'];

    expect(client).toBeInstanceOf(Client);
    expect(typeof client.SentenceRecognition).toBe('function');
    await service['ensureTencentClient']();
    expect(service['tencentClient']).toBe(client);
  });

  it('preserves SILK payload and trimmed result through a mocked SDK method', async () => {
    const Client = require('tencentcloud-sdk-nodejs-asr').asr.v20190614.Client;
    const recognize = jest
      .spyOn(Client.prototype, 'SentenceRecognition')
      .mockResolvedValue({ Result: ' synthetic transcript ' });
    const { service } = createService();
    const audio = Buffer.from([0, 1, 128, 255]);

    await expect(service.recognizeVoice(audio)).resolves.toBe('synthetic transcript');
    expect(recognize).toHaveBeenCalledWith({
      EngSerViceType: '16k_zh',
      VoiceFormat: 'silk',
      Data: audio.toString('base64'),
      DataLen: audio.length,
      SourceType: 1,
    });
  });

  it('does not initialize or request ASR while voice recognition is disabled', async () => {
    const { service, config } = createService(false);

    await expect(service.recognizeVoice(Buffer.from('synthetic'))).resolves.toBeNull();
    expect(config.getConfigs).toHaveBeenCalledTimes(1);
    expect(service['tencentClient']).toBeNull();
  });
});

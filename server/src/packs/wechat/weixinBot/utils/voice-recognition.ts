import { getErrorStack } from '@/common/utils/error-stack.util';
import { Injectable, Logger } from '@nestjs/common';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';

@Injectable()
export class VoiceRecognitionService {
  private tencentClient: any = null;
  private tencentClientKey: string = '';

  constructor(private readonly globalConfigService: GlobalConfigService) {}

  async isEnabled(): Promise<boolean> {
    const val = await this.globalConfigService.getConfigs(['weixinBotVoiceStatus']);
    return val === '1';
  }

  private async ensureTencentClient(): Promise<void> {
    const configs = (await this.globalConfigService.getConfigs([
      'tencentSecretId',
      'tencentSecretKey',
      'tencentRegion',
    ])) as Record<string, string>;
    const secretId = configs?.tencentSecretId || '';
    const secretKey = configs?.tencentSecretKey || '';
    const configKey = `${secretId}:${secretKey}`;

    if (this.tencentClient && this.tencentClientKey === configKey) return;

    if (!secretId || !secretKey) {
      Logger.warn(
        '未配置腾讯云语音识别密钥，请在管理端 Bot 通道页面或环境变量中配置',
        'VoiceRecognition',
      );
      this.tencentClient = null;
      return;
    }

    try {
      const tencentcloud = require('tencentcloud-sdk-nodejs-asr');
      const AsrClient = tencentcloud.asr.v20190614.Client;
      const region = configs?.tencentRegion || 'ap-guangzhou';

      this.tencentClient = new AsrClient({
        credential: { secretId, secretKey },
        region,
        profile: { httpProfile: { reqTimeout: 30 } },
      });
      this.tencentClientKey = configKey;

      Logger.log('腾讯云 ASR 客户端初始化成功', 'VoiceRecognition');
    } catch (error: any) {
      Logger.error(
        `腾讯云 ASR 初始化失败: ${error.message}`,
        getErrorStack(error),
        'VoiceRecognition',
      );
      this.tencentClient = null;
    }
  }

  async recognizeVoice(silkBuffer: Buffer): Promise<string | null> {
    const enabled = await this.isEnabled();
    if (!enabled) {
      Logger.warn('语音识别未开启 (weixinBotVoiceStatus != 1)', 'VoiceRecognition');
      return null;
    }

    Logger.log(`语音识别开始, 音频大小: ${silkBuffer.length}`, 'VoiceRecognition');

    await this.ensureTencentClient();
    if (!this.tencentClient) {
      Logger.warn('腾讯云 ASR 客户端未初始化，请检查密钥配置', 'VoiceRecognition');
      return null;
    }

    try {
      // 腾讯云 ASR 原生支持 SILK 格式，直接发送无需转换
      const base64Audio = silkBuffer.toString('base64');

      const response = await this.tencentClient.SentenceRecognition({
        EngSerViceType: '16k_zh',
        VoiceFormat: 'silk',
        Data: base64Audio,
        DataLen: silkBuffer.length,
        SourceType: 1,
      });
      const text = response.Result?.trim() || null;

      if (text) {
        Logger.debug(
          `语音识别成功, 文本长度: ${text.length}, 音频大小: ${silkBuffer.length}`,
          'VoiceRecognition',
        );
      } else {
        Logger.warn(`语音识别返回空结果, 音频大小: ${silkBuffer.length}`, 'VoiceRecognition');
      }

      return text;
    } catch (error: any) {
      Logger.error(`语音识别失败: ${error.message}`, getErrorStack(error), 'VoiceRecognition');
      return null;
    }
  }
}

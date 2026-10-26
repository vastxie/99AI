import { Injectable } from '@nestjs/common';
import { GlobalConfigRegistry } from '@/modules/globalConfig/global-config.registry';
import { BadWordsService } from './badWords/badWords.service';

/** 内容安全包向内核配置注册表登记：系统词库开关 / 选中词库变化后重载词库缓存 */
@Injectable()
export class ContentSafetyConfigSection {
  constructor(
    registry: GlobalConfigRegistry,
    private readonly badWordsService: BadWordsService,
  ) {
    registry.register({
      name: 'content-safety',
      secretKeys: ['tencentSecretId', 'tencentSecretKey'],
      onChanged: async keys => {
        if (!keys.includes('systemSensitiveStatus') && !keys.includes('selectedVocabularies')) {
          return;
        }
        await this.badWordsService.reloadSystemWords();
      },
    });
  }
}

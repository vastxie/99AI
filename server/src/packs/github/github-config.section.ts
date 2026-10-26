import { Injectable } from '@nestjs/common';
import { GlobalConfigRegistry } from '@/modules/globalConfig/global-config.registry';

/** GitHub 包向内核配置注册表登记：密钥类配置键在管理端只回显脱敏值，保存时脱敏值视为未修改 */
@Injectable()
export class GithubConfigSection {
  constructor(registry: GlobalConfigRegistry) {
    registry.register({
      name: 'github',
      secretKeys: ['githubClientSecret'],
    });
  }
}

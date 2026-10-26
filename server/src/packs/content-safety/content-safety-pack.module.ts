import { Module } from '@nestjs/common';
import { BadWordsModule } from './badWords/badWords.module';
import { ContentSafetyConfigSection } from './content-safety-config.section';
import { ContentSafetyProfileSection } from './content-safety-profile.section';

/**
 * 内容安全包：敏感词库、白名单、违规记录、腾讯云文本审核。
 *
 * 内核只依赖 modules/contentFilter 的 CONTENT_FILTER_PORT；本包通过
 * CONTENT_FILTER_IMPLEMENTATION 令牌把 BadWordsService 挂到端口上，
 * 由 CONTENT_SAFETY_PACK_ENABLED 决定是否装载。
 */
@Module({
  imports: [BadWordsModule],
  providers: [ContentSafetyConfigSection, ContentSafetyProfileSection],
})
export class ContentSafetyPackModule {}

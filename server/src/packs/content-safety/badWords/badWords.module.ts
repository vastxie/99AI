import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CONTENT_FILTER_IMPLEMENTATION } from '@/modules/contentFilter/content-filter.port';
import { UserEntity } from '@/modules/user/user.entity';
import { BadWordsController } from './badWords.controller';
import { BadWordsService } from './badWords.service';
import { ViolationLogEntity } from './violationLog.entity';
import { WhitelistEntity } from './whitelist.entity';

/**
 * 内容安全包的实现模块：敏感词库、白名单、违规记录、腾讯云文本审核。
 * 以 CONTENT_FILTER_IMPLEMENTATION 令牌向内核的 ContentFilterModule 注册实现。
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ViolationLogEntity, UserEntity, WhitelistEntity])],
  providers: [
    BadWordsService,
    { provide: CONTENT_FILTER_IMPLEMENTATION, useExisting: BadWordsService },
  ],
  controllers: [BadWordsController],
  exports: [BadWordsService, CONTENT_FILTER_IMPLEMENTATION],
})
export class BadWordsModule {}

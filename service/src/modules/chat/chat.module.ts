import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenAIChatService } from '../aiTool/chat/chat.service';
import { NetSearchService } from '../aiTool/search/netSearch.service';
import { AppEntity } from '../app/app.entity';
import { AppService } from '../app/app.service';
import { AppCatsEntity } from '../app/appCats.entity';
import { UserAppsEntity } from '../app/userApps.entity';
import { AutoReplyEntity } from '../autoReply/autoReply.entity';
import { AutoReplyService } from '../autoReply/autoReply.service';
import { BadWordsEntity } from '../badWords/badWords.entity';
import { BadWordsService } from '../badWords/badWords.service';
import { ViolationLogEntity } from '../badWords/violationLog.entity';
import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { ChatGroupService } from '../chatGroup/chatGroup.service';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { ChatLogService } from '../chatLog/chatLog.service';
import { CramiPackageEntity } from '../crami/cramiPackage.entity';
import { ConfigEntity } from '../globalConfig/config.entity';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { MailerService } from '../mailer/mailer.service';
import { ModelsEntity } from '../models/models.entity';
import { ModelsService } from '../models/models.service';
import { PluginEntity } from '../plugin/plugin.entity';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { UploadService } from '../upload/upload.service';
import { UserEntity } from '../user/user.entity';
import { UserService } from '../user/user.service';
import { AccountLogEntity } from '../userBalance/accountLog.entity';
import { BalanceEntity } from '../userBalance/balance.entity';
import { FingerprintLogEntity } from '../userBalance/fingerprint.entity';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';
import { UserBalanceService } from '../userBalance/userBalance.service';
import { VerificationEntity } from '../verification/verification.entity';
import { VerificationService } from '../verification/verification.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BalanceEntity,
      UserEntity,
      PluginEntity,
      VerificationEntity,
      ChatLogEntity,
      AccountLogEntity,
      ConfigEntity,
      UserEntity,
      CramiPackageEntity,
      ChatGroupEntity,
      AppEntity,
      UserBalanceEntity,
      FingerprintLogEntity,
      AppCatsEntity,
      UserAppsEntity,
      AutoReplyEntity,
      BadWordsEntity,
      ViolationLogEntity,
      ModelsEntity,
    ]),
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    UserBalanceService,
    UserService,
    VerificationService,
    ChatLogService,
    RedisCacheService,
    MailerService,
    GlobalConfigService,
    UploadService,
    AutoReplyService,
    BadWordsService,
    ChatGroupService,
    ModelsService,
    OpenAIChatService,
    NetSearchService,
    AppService,
  ],
  exports: [ChatService],
})
export class ChatModule {}

import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiPptService } from '../ai/aiPPT';
import { CogVideoService } from '../ai/cogVideo.service';
import { FluxDrawService } from '../ai/fluxDraw.service';
import { LumaVideoService } from '../ai/lumaVideo.service';
import { MidjourneyService } from '../ai/midjourneyDraw.service';
import { OpenAIChatService } from '../ai/openaiChat.service';
import { OpenAIDrawService } from '../ai/openaiDraw.service';
import { StableDiffusionService } from '../ai/stableDiffusion.service';
import { SunoService } from '../ai/suno.service';
import { AppEntity } from '../app/app.entity';
import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { ChatLogService } from '../chatLog/chatLog.service';
import { CramiPackageEntity } from '../crami/cramiPackage.entity';
import { ConfigEntity } from '../globalConfig/config.entity';
import { MailerService } from '../mailer/mailer.service';
import { PluginEntity } from '../plugin/plugin.entity';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { UserEntity } from '../user/user.entity';
import { UserService } from '../user/user.service';
import { AccountLogEntity } from '../userBalance/accountLog.entity';
import { BalanceEntity } from '../userBalance/balance.entity';
import { FingerprintLogEntity } from '../userBalance/fingerprint.entity';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';
import { UserBalanceService } from '../userBalance/userBalance.service';
import { VerificationService } from '../verification/verification.service';
import { VerifycationEntity } from '../verification/verifycation.entity';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { netSearchService } from '../ai/netSearch.service';
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BalanceEntity,
      UserEntity,
      PluginEntity,
      VerifycationEntity,
      ChatLogEntity,
      AccountLogEntity,
      ConfigEntity,
      UserEntity,
      CramiPackageEntity,
      ChatGroupEntity,
      AppEntity,
      UserBalanceEntity,
      FingerprintLogEntity,
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
    SunoService,
    OpenAIChatService,
    StableDiffusionService,
    MidjourneyService,
    OpenAIDrawService,
    LumaVideoService,
    CogVideoService,
    FluxDrawService,
    AiPptService,
    netSearchService,
  ],
  exports: [ChatService],
})
export class ChatModule {}

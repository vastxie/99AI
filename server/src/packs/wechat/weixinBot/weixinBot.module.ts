import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '@/modules/user/user.entity';
import { UserBotChannelEntity } from '../bot/user-bot-channel.entity';
import { BotModule } from '../bot/bot.module';
import { FileAssetModule } from '@/modules/fileAsset/fileAsset.module';
import { WeixinBotController } from './weixinBot.controller';
import { WeixinBotService } from './weixinBot.service';
import { VoiceRecognitionService } from './utils/voice-recognition';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, UserBotChannelEntity]),
    BotModule,
    FileAssetModule,
  ],
  controllers: [WeixinBotController],
  providers: [WeixinBotService, VoiceRecognitionService],
  exports: [WeixinBotService],
})
export class WeixinBotModule {}

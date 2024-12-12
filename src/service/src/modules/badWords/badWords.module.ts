import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../user/user.entity';
import { BadWordsController } from './badWords.controller';
import { BadWordsEntity } from './badWords.entity';
import { BadWordsService } from './badWords.service';
import { ViolationLogEntity } from './violationLog.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([BadWordsEntity, ViolationLogEntity, UserEntity]),
  ],
  providers: [BadWordsService],
  controllers: [BadWordsController],
  exports: [BadWordsService],
})
export class BadWordsModule {}

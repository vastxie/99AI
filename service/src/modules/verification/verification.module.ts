import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { VerificationEntity } from './verification.entity';
import { VerificationService } from './verification.service';

@Module({
  imports: [TypeOrmModule.forFeature([VerificationEntity])],
  providers: [RedisCacheService, VerificationService],
})
export class VerificationModule {}

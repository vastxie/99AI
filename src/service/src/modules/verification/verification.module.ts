import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { VerificationService } from './verification.service';
import { VerifycationEntity } from './verifycation.entity';
import { Redis } from 'ioredis';
import { RedisCacheService } from '../redisCache/redisCache.service';

@Module({
  imports: [TypeOrmModule.forFeature([VerifycationEntity])],
  providers: [RedisCacheService, VerificationService],
})
export class VerificationModule {}

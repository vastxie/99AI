import { JwtStrategy } from '@/common/auth/jwt.strategy';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { CramiPackageEntity } from '../crami/cramiPackage.entity';
import { ConfigEntity } from '../globalConfig/config.entity';
import { MailerService } from '../mailer/mailer.service';
import { RedisCacheModule } from '../redisCache/redisCache.module';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { UserEntity } from '../user/user.entity';
import { UserModule } from '../user/user.module';
import { AccountLogEntity } from '../userBalance/accountLog.entity';
import { BalanceEntity } from '../userBalance/balance.entity';
import { FingerprintLogEntity } from '../userBalance/fingerprint.entity';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';
import { UserBalanceService } from '../userBalance/userBalance.service';
import { VerificationService } from './../verification/verification.service';
import { VerifycationEntity } from './../verification/verifycation.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Global()
@Module({
  imports: [
    UserModule,
    RedisCacheModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [RedisCacheService],
      useFactory: async (redisService: RedisCacheService) => ({
        secret: await redisService.getJwtSecret(),
        signOptions: { expiresIn: '7d' },
      }),
    }),
    TypeOrmModule.forFeature([
      VerifycationEntity,
      BalanceEntity,
      AccountLogEntity,
      ConfigEntity,
      CramiPackageEntity,
      UserBalanceEntity,
      UserEntity,
      FingerprintLogEntity,
      ChatLogEntity,
      ChatGroupEntity,
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    MailerService,
    VerificationService,
    UserBalanceService,
    RedisCacheService,
  ],
  exports: [AuthService],
})
export class AuthModule {}

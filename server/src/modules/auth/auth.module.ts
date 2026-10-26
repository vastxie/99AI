import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { AuthConfig } from '@/common/config/auth.config';
import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileAssetModule } from '../fileAsset/fileAsset.module';
import { RedisCacheModule } from '../redisCache/redisCache.module';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { UserEntity } from '../user/user.entity';
import { UserModule } from '../user/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CaptchaAuthService } from './captcha/captcha-auth.service';
import { VerificationCodeService } from './captcha/verification-code.service';
import { AuthIdentityService } from './identity/auth-identity.service';
import { UserAuthIdentityEntity } from './identity/user-auth-identity.entity';
import { LoginProviderRegistry } from './providers/login-provider.registry';
import { OAuthAuthService } from './providers/oauth-auth.service';
import { OAuthStateService } from './providers/oauth-state.service';
import { QrAuthService } from './providers/qr-auth.service';
import { AuthTokenService } from './token/auth-token.service';

/**
 * 账号 / 会话 / 身份绑定内核。内核自带账号密码注册与登录；
 * 邮箱 / 手机验证码、第三方授权、扫码等登录途径由各渠道包向 LoginProviderRegistry 注册，
 * 内核只提供通用流程（CaptchaAuthService / OAuthAuthService / QrAuthService）。
 * 计费相关（注册赠送）只依赖全局 BILLING_PORT。
 */
@Global()
@Module({
  imports: [
    UserModule,
    FileAssetModule,
    RedisCacheModule,
    JwtModule.registerAsync({
      inject: [RedisCacheService],
      useFactory: async (redisService: RedisCacheService) => ({
        secret: await redisService.getJwtSecret(),
        signOptions: {
          expiresIn: AuthConfig.jwt.expiresIn,
          algorithm: AuthConfig.jwt.algorithm,
        },
      }),
    }),
    TypeOrmModule.forFeature([UserEntity, UserAuthIdentityEntity]),
  ],
  controllers: [AuthController],
  providers: [
    LoginProviderRegistry,
    OAuthStateService,
    VerificationCodeService,
    AuthTokenService,
    AuthIdentityService,
    AuthService,
    CaptchaAuthService,
    OAuthAuthService,
    QrAuthService,
    JwtAuthGuard,
    RedisCacheService,
  ],
  exports: [
    AuthService,
    AuthTokenService,
    AuthIdentityService,
    OAuthStateService,
    LoginProviderRegistry,
    VerificationCodeService,
  ],
})
export class AuthModule {}

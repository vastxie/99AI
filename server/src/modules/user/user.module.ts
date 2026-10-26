import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigEntity } from '../globalConfig/config.entity';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { UserController } from './user.controller';
import { UserProfileSectionRegistry } from './user-profile-section.registry';
import { UserEntity } from './user.entity';
import { UserService } from './user.service';

/**
 * 用户内核模块。余额投影只依赖全局 BILLING_PORT；账户额度类接口由扩展包自行提供。
 * 后台用户详情画像在 userProfile 模块汇总，这里只提供扩展包登记片段用的注册表。
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, ConfigEntity])],
  controllers: [UserController],
  providers: [UserService, UserProfileSectionRegistry, RedisCacheService],
  exports: [UserService, UserProfileSectionRegistry],
})
export class UserModule {}

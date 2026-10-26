import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatLogEntity } from '@/modules/chatLog/chatLog.entity';
import { PackageEntity } from '../package/package.entity';
import { ConfigEntity } from '@/modules/globalConfig/config.entity';
import { GlobalConfigModule } from '@/modules/globalConfig/globalConfig.module';
import { RedisCacheService } from '@/modules/redisCache/redisCache.service';
import { UserEntity } from '@/modules/user/user.entity';
import { AccountLogEntity } from './accountLog.entity';
import { BILLING_IMPLEMENTATION } from '@/modules/billing/billing.port';
import { OrderEntity } from '../order/order.entity';
import { SANDBOX_METER, SANDBOX_POLICY_RESOLVER } from '@/modules/sandbox/sandbox.service';
import { CommerceSandboxMeter } from '../sandbox/commerce-sandbox.meter';
import { CommerceSandboxPolicyResolver } from '../sandbox/commerce-sandbox-policy.resolver';
import { CommerceBillingAdapter } from './commerce-billing.adapter';
import { CommerceUserProfileService } from './commerce-user-profile.service';
import { UserRechargeController } from './user-recharge.controller';
import { UserRechargeService } from './user-recharge.service';
import { UserBalanceController } from './userBalance.controller';
import { UserBalanceEntity } from './userBalance.entity';
import { UserBalanceService } from './userBalance.service';

/**
 * 积分 / 会员余额（商业包）。内核只通过 BILLING_PORT 使用 CommerceBillingAdapter 暴露的方法；
 * 积分 / 套餐调整接口（user/recharge、user/grantPackage）也由本模块提供；
 * 按套餐分配沙箱资源与记录沙箱用量经 SANDBOX_POLICY_RESOLVER / SANDBOX_METER 接入内核沙箱。
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountLogEntity,
      UserBalanceEntity,
      PackageEntity,
      ConfigEntity,
      ChatLogEntity,
      UserEntity,
      OrderEntity,
    ]),
    GlobalConfigModule,
  ],
  controllers: [UserBalanceController, UserRechargeController],
  providers: [
    UserBalanceService,
    UserRechargeService,
    CommerceUserProfileService,
    CommerceBillingAdapter,
    { provide: BILLING_IMPLEMENTATION, useExisting: CommerceBillingAdapter },
    CommerceSandboxPolicyResolver,
    CommerceSandboxMeter,
    { provide: SANDBOX_POLICY_RESOLVER, useExisting: CommerceSandboxPolicyResolver },
    { provide: SANDBOX_METER, useExisting: CommerceSandboxMeter },
    RedisCacheService,
  ],
  exports: [
    UserBalanceService,
    UserRechargeService,
    BILLING_IMPLEMENTATION,
    SANDBOX_POLICY_RESOLVER,
    SANDBOX_METER,
    TypeOrmModule,
  ],
})
export class UserBalanceModule {}

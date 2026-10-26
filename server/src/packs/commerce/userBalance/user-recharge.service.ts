import { RechargeType } from '../shared/balance.constant';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { GrantPackageDto } from './dto/grantPackage.dto';
import { UserRechargeDto } from './dto/userRecharge.dto';
import { UserEntity } from '@/modules/user/user.entity';
import { UserService } from '@/modules/user/user.service';
import { UserBalanceService } from './userBalance.service';

/**
 * 管理员积分调整 / 套餐赠送：属于商业包能力，从 UserService（内核）迁出。
 */
@Injectable()
export class UserRechargeService {
  constructor(
    private readonly userBalanceService: UserBalanceService,
    private readonly userService: UserService,
    private readonly dataSource: DataSource,
  ) {}

  /* 管理员调整用户积分（正数增加，负数扣减普通积分） */
  async userRecharge(body: UserRechargeDto) {
    const { userId, credits } = body;
    const res = await this.dataSource.transaction(async manager => {
      const userRepository = manager.getRepository(UserEntity);
      const user = await userRepository.findOne({ where: { id: userId }, select: { id: true } });
      if (!user) {
        throw new HttpException('当前用户不存在！', HttpStatus.BAD_REQUEST);
      }

      if (credits > 0) {
        await this.userBalanceService.addBalanceToUser(userId, { credits }, -1, manager);
      } else {
        await this.userBalanceService.reduceBalanceFromUser(userId, -credits, manager);
      }
      return await this.userBalanceService.saveRecordRechargeLog(
        {
          userId,
          rechargeType: RechargeType.ADMIN_GIFT,
          credits,
          extent: '',
        },
        manager,
      );
    });
    await this.userService.clearUserCache(userId);
    return res;
  }

  /* 赠送套餐 */
  async grantPackage(body: GrantPackageDto) {
    const { userId, packageId } = body;
    const res = await this.userBalanceService.grantPackageToUser(userId, packageId);
    await this.userService.clearUserCache(userId);
    return res;
  }
}

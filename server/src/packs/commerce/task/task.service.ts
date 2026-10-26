import { getErrorStack } from '@/common/utils/error-stack.util';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, QueryDeepPartialEntity, Repository } from 'typeorm';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';

/** 会员到期清空值：expirationTime 为可空列，实体属性未标 | null（联合类型会破坏 TypeORM 列元数据），写 null 时用本类型描述 */
type MembershipExpiredPatch = Omit<Partial<UserBalanceEntity>, 'expirationTime'> & {
  expirationTime?: Date | null;
};

@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(UserBalanceEntity)
    private readonly userBalanceEntity: Repository<UserBalanceEntity>,
  ) {}

  /* 每5分钟执行一次检测会员过期任务 */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkUserMemerExpire() {
    try {
      const expireUsers = await this.userBalanceEntity.find({
        where: { expirationTime: LessThanOrEqual(new Date()) },
      });
      if (!expireUsers || !expireUsers.length) return;

      for (const user of expireUsers) {
        try {
          // 条件更新：仅当仍处于过期状态才清空，避免 find→update 竞态窗口内
          // 刚续费（expirationTime 已延后）的用户被误清零
          const expiredPatch: MembershipExpiredPatch = {
            expirationTime: null,
            packageId: 0,
            memberCredits: 0,
          };
          // 可空列写 null：实体属性未标 | null，在仓库边界收口
          const result = await this.userBalanceEntity.update(
            { id: user.id, expirationTime: LessThanOrEqual(new Date()) },
            expiredPatch as QueryDeepPartialEntity<UserBalanceEntity>,
          );
          if (result.affected && result.affected > 0) {
            Logger.debug(`用户 ${user.id} 会员已到期，已清空余额并移除会员身份`, 'TaskService');
          }
        } catch (err: any) {
          Logger.error(
            `清理过期会员 ${user.id} 失败: ${err.message}`,
            getErrorStack(err),
            'TaskService',
          );
        }
      }
    } catch (err: any) {
      Logger.error(`检测过期会员失败: ${err.message}`, getErrorStack(err), 'TaskService');
    }
  }
}
